#!/usr/bin/env node
/* ============================================================
   SVG 绘图静态审计 · svg-diagram-check skill 配套脚本(零依赖)
   浅色字/溢出/深底白名单判定口径与 _本地工具/板块评分.js 一致,
   两处如需改口径必须同步。
   用法:
     node svg_audit.js <页面.html | 目录> [--json]
     node svg_audit.js --all [--json]
   分级: [E] 必须修: 悬空浅色字 / 文字溢出 / marker 悬空或重复 / 结构损坏
         [W] 目检裁决: 疑似重叠 / 字号过小 / 缺图注 / 缺aria / 元素越界 / 根字体
   退出码: 存在 E 级 → 1,否则 0。
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..", "..", "..");   // scripts → svg-diagram-check → skills → .agents → 项目根
const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");
const target = argv.find((a) => !a.startsWith("--"));
if (!target && !argv.includes("--all")) { console.log("用法: node svg_audit.js <页面.html|目录|--all> [--json]"); process.exit(2); }

/* ---------- 工具 ---------- */
const lum = (hex) => {
  let h = hex.toLowerCase();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return (0.299 * parseInt(h.slice(0, 2), 16) + 0.587 * parseInt(h.slice(2, 4), 16) + 0.114 * parseInt(h.slice(4, 6), 16)) / 255;
};
const CJK = /[\u2E80-\u9FFF\uF900-\uFAFF\uFF01-\uFF60\u3000-\u303F]/;
const textW = (s, fsz) => { let w = 0; for (const ch of s) w += CJK.test(ch) ? fsz : fsz * 0.55; return w; };
const getAttr = (s, name) => { const m = s.match(new RegExp("\\b" + name + '="([^"]*)"', "i")); return m ? m[1] : undefined; };
const numStrict = (v) => (/^-?[\d.]+$/.test(v || "") ? parseFloat(v) : null);   // 拒绝 "100%" 之类
const clip = (s, n) => (s.length > n ? s.slice(0, n) + "…" : s);

/* ---------- 收集页面 ---------- */
const SKIP_DIR = /(^|[\\/])(_[^\\/]*|node_modules|\.git|edge_prof|13_HdriveV2[^\\/]*|\.agents|\.zcode)([\\/]|$)/;
const files = [];
const isHTML = (p) => p.toLowerCase().endsWith(".html");
if (argv.includes("--all")) {
  (function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      const rel = path.relative(ROOT, full).replace(/\\/g, "/");
      if (ent.isDirectory()) { if (!SKIP_DIR.test(rel + "/")) walk(full); continue; }
      if (!isHTML(ent.name)) continue;
      const folder = rel.split("/")[0];
      if (rel === "index.html" || rel === "404.html") continue;
      if (rel === folder + "/index.html") continue;   // 板块根重定向壳
      files.push(full);
    }
  })(ROOT);
} else {
  const abs = path.isAbsolute(target) ? target : path.join(ROOT, target);
  if (!fs.existsSync(abs)) { console.log("路径不存在: " + target); process.exit(2); }
  const st = fs.statSync(abs);
  if (st.isFile() && isHTML(abs)) files.push(abs);
  else if (st.isDirectory()) {
    (function walk(dir) {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        const rel = path.relative(ROOT, full).replace(/\\/g, "/");
        if (ent.isDirectory()) { if (!SKIP_DIR.test(rel + "/")) walk(full); continue; }
        if (isHTML(ent.name)) files.push(full);
      }
    })(abs);
  } else { console.log("请给 .html 文件或目录"); process.exit(2); }
}

/* ---------- 单页分析 ---------- */
function analyze(html, rel) {
  const E = [], W = [];
  const openN = (html.match(/<svg\b/gi) || []).length;
  const closeN = (html.match(/<\/svg>/gi) || []).length;
  if (openN !== closeN) E.push({ svg: "-", kind: "结构损坏", msg: `<svg> 未配平(${openN} 开 / ${closeN} 闭)` });

  const blocks = [...html.matchAll(/<svg\b[\s\S]*?<\/svg>/gi)];
  if (!blocks.length) return { rel, svgCount: 0, E, W };

  /* 页级深底图卡: .my-fig/.my-svg 的 CSS 背景合成后偏深 → 包内浅字合法 */
  let figCssDark = false;
  for (const st of html.match(/<style[\s\S]*?<\/style>/gi) || []) {
    for (const rule of st.matchAll(/\.my-(?:fig|svg)\s*\{([^}]*)\}/g)) {
      const bg = (rule[1].match(/background(?:-color)?\s*:\s*([^;}]+)/) || [])[1] || "";
      const hexm = bg.match(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/);
      const rgbam = bg.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\)/);
      let eff = null;
      if (hexm) eff = lum(hexm[1]);
      else if (rgbam) {
        const a = rgbam[4] === undefined ? 1 : parseFloat(rgbam[4]);
        const mix = (c) => a * c + (1 - a) * 255;
        eff = (0.299 * mix(+rgbam[1]) + 0.587 * mix(+rgbam[2]) + 0.114 * mix(+rgbam[3])) / 255;
      }
      if (eff !== null && eff < 0.45) figCssDark = true;
    }
  }

  /* 页级 marker: 定义与引用(跨 svg 共享,同页作用域) */
  const markerDefs = [...html.matchAll(/<marker\b[^>]*?\bid="([^"]+)"/gi)].map((m) => m[1]);
  markerDefs.forEach((id, i) => {
    if (markerDefs.indexOf(id) !== i) E.push({ svg: "-", kind: "marker重复", msg: `id="${id}" 定义了 ${markerDefs.filter((x) => x === id).length} 次(先前的图箭头会丢失)` });
  });

  blocks.forEach((bm, bi) => {
    const idx = bi + 1;
    const openTag = bm[0].slice(0, bm[0].indexOf(">") + 1);
    const svgEnd = bm.index + bm[0].length;

    /* 结构 */
    const vbM = bm[0].match(/viewBox="0\s+0\s+([\d.]+)\s+([\d.]+)"/);
    if (!/\bviewBox=/i.test(openTag)) E.push({ svg: idx, kind: "结构损坏", msg: "缺 viewBox(渲染尺寸不可控)" });
    if (!/\brole="img"/.test(openTag) || !/\baria-label=/.test(openTag))
      W.push({ svg: idx, kind: "缺aria", msg: "根上缺 role=\"img\" 或 aria-label" });

    /* 深底判定(口径同板块评分) */
    const inDarkCard = figCssDark && /class="[^"]*my-(fig|svg)[^"]*"/.test(html.slice(Math.max(0, bm.index - 250), bm.index));
    let figDarkBg = false;
    let vbW = 0, vbH = 0;
    if (vbM) {
      vbW = parseFloat(vbM[1]); vbH = parseFloat(vbM[2]);
      let best = null;
      for (const ra of bm[0].matchAll(/<rect\b[^>]*>/gi)) {
        const rw = numStrict(getAttr(ra[0], "width")), rh = numStrict(getAttr(ra[0], "height"));
        const rf = getAttr(ra[0], "fill") || "";
        const hm = rf.match(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/);
        if (!hm || rw === null || rh === null) continue;
        const area = rw * rh;
        if (!best || area > best.area) best = { area, rw, rh, hex: hm[1] };
      }
      if (best && best.rw >= vbW * 0.7 && best.rh >= vbH * 0.6) figDarkBg = lum(best.hex) < 0.45;
    }
    const svgOnDark = inDarkCard || figDarkBg;

    /* marker 引用 */
    for (const rm of bm[0].matchAll(/marker-(?:end|start|mid)\s*=\s*["']url\(#([^'")]+)\)["']/gi)) {
      if (!markerDefs.includes(rm[1])) E.push({ svg: idx, kind: "marker悬空", msg: `引用 #${rm[1]} 未定义(线末端无箭头)` });
    }

    /* 文本走查: 浅色字 / 溢出 / 小字号 / 重叠样本收集 */
    const tokenRe = /<g\b([^>]*)>|<\/g>|<rect\b([^>]*)>|<(text|tspan)\b([^>]*)>([\s\S]*?)<\/\3>/gi;
    let gFill = [{}], lastRect = null, m2;
    const darkRects = [];   // 全部深色 rect(几何包含判定,兼容先画盒后画字)
    const texts = [];
    while ((m2 = tokenRe.exec(bm[0])) !== null) {
      if (m2[1] !== undefined) {
        const f = getAttr(m2[1], "fill");
        const gfs = numStrict(getAttr(m2[1], "font-size"));
        const top = gFill[gFill.length - 1] || {};
        gFill.push({ fill: f !== undefined ? f : top.fill, fs: gfs !== null ? gfs : top.fs });
      } else if (m2[0] === "</g>") {
        if (gFill.length > 1) gFill.pop();
      } else if (m2[2] !== undefined) {
        const a = m2[2];
        const rf = getAttr(a, "fill") || "";
        const rx = numStrict(getAttr(a, "x")), ry = numStrict(getAttr(a, "y"));
        const rw = numStrict(getAttr(a, "width")), rh = numStrict(getAttr(a, "height"));
        const hm = rf.match(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/);
        lastRect = (rx !== null && rw !== null) ? { x: rx, y: ry, w: rw, h: rh, dark: hm ? lum(hm[1]) < 0.35 : false } : null;
        if (lastRect && lastRect.dark && ry !== null && rh !== null) darkRects.push(lastRect);
        /* 元素越界 */
        if (vbW > 0 && rw !== null && rh !== null &&
          (rx < -2 || (ry !== null && ry < -2) || rx + rw > vbW + 2 || ry + rh > vbH + 2))
          W.push({ svg: idx, kind: "元素越界", msg: `rect(${rx},${ry},${rw}×${rh}) 超出 viewBox ${vbW}×${vbH}` });
      } else {
        const tag = (m2[3] || "").toLowerCase();
        const attrs = m2[4] || "";
        const inner = m2[5] || "";
        const content = inner.replace(/<[^>]+>/g, "");
        const gTop = gFill[gFill.length - 1] || {};
        const ownFill = getAttr(attrs, "fill");
        const fill = ownFill || gTop.fill;
        const rotated = /transform="[^"]*rotate/.test(attrs);

        if (content.trim()) {
          /* 悬空浅色字(口径同板块评分) */
          const hexM = (fill || "").match(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/);
          /* onDark: 有坐标按"任一深色 rect 几何包含"判;无坐标 tspan 退回最近 rect 近似 */
          const txM2 = attrs.match(/\bx="([\d.-]+)"/);
          const tyM2 = attrs.match(/\by="([\d.-]+)"/);
          const tx = txM2 ? parseFloat(txM2[1]) : NaN;
          const ty = tyM2 ? parseFloat(tyM2[1]) : NaN;
          const onDark = (isFinite(tx) && isFinite(ty))
            ? darkRects.some((r) => tx >= r.x - 2 && tx <= r.x + r.w + 2 && ty >= r.y - 16 && ty <= r.y + r.h + 6)
            : !!(lastRect && lastRect.dark);
          if (hexM && hexM[1].toLowerCase() !== "ffffff" && !/class=/.test(attrs) && lum(hexM[1]) > 0.62 && !onDark && !svgOnDark) {
            const hh = hexM[1].length === 3 ? hexM[1].split("").map((c) => c + c).join("") : hexM[1];
            const rgb = [0, 2, 4].map((i) => parseInt(hh.slice(i, i + 2), 16));
            if (Math.max(...rgb) - Math.min(...rgb) < 40)
              E.push({ svg: idx, kind: "浅色字", msg: `#${hh} 在浅底不可读`, text: clip(content.trim(), 20) });
          }
        }

        if (tag === "text") {
          const ownFs = numStrict(getAttr(attrs, "font-size"));
          const fs = ownFs !== null ? ownFs : (typeof gTop.fs === "number" ? gTop.fs : null);
          const x = numStrict(getAttr(attrs, "x"));
          const y = numStrict(getAttr(attrs, "y"));
          const anchor = (getAttr(attrs, "text-anchor") || "start").toLowerCase();
          const lines = 1 + (inner.match(/<tspan/gi) || []).length;
          if (ownFs !== null && ownFs < 8.5)
            W.push({ svg: idx, kind: "字号过小", msg: `font-size=${ownFs} 低于下限 8.5`, text: clip(content.trim(), 20) });
          /* 溢出(口径同板块评分: 仅自带 font-size 且 ≥9 的非旋转 text) */
          if (vbW > 0 && ownFs !== null && ownFs >= 9 && !rotated && x !== null && content.trim()) {
            const w = textW(content, ownFs);
            const over = anchor === "middle" ? (x + w / 2 > vbW - 2 || x - w / 2 < 2)
              : anchor === "end" ? (x > vbW - 2) : (x + w > vbW - 2);
            if (over) E.push({ svg: idx, kind: "溢出" + (svgOnDark ? "(深底卡)" : ""), msg: `估算宽 ${Math.round(w)} 超出画布`, text: clip(content.trim(), 20) });
          }
          if (fs !== null && x !== null && y !== null && !rotated && content.trim())
            texts.push({ x, y, fs, anchor, lines, content: content.trim() });
        }
      }
    }

    /* 重叠嫌疑(两个独立 text 估算包围盒相交 > 35%) */
    let pairs = 0;
    for (let i = 0; i < texts.length && pairs < 8; i++) {
      for (let j = i + 1; j < texts.length && pairs < 8; j++) {
        const A = boxOf(texts[i]), B = boxOf(texts[j]);
        const ox = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0);
        const oy = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0);
        if (ox > 2 && oy > 2) {
          const area = ox * oy, minA = Math.min((A.x1 - A.x0) * (A.y1 - A.y0), (B.x1 - B.x0) * (B.y1 - B.y0));
          if (area > minA * 0.35) {
            pairs++;
            W.push({ svg: idx, kind: "疑似重叠", msg: `交叠 ${Math.round(area / minA * 100)}%`, text: `${clip(texts[i].content, 12)} × ${clip(texts[j].content, 12)}` });
          }
        }
      }
    }
    if (pairs >= 8) W.push({ svg: idx, kind: "疑似重叠", msg: "更多略(单图上限 8 条)" });

    /* 图注 */
    const after = html.slice(svgEnd, svgEnd + 300);
    if (!/my-fig-cap|class="[^"]*cap[^"]*"|<figcaption/i.test(after))
      W.push({ svg: idx, kind: "缺图注", msg: "svg 后未找到 my-fig-cap / figcaption" });
  });

  return { rel, svgCount: blocks.length, E, W };
}

/* text 包围盒估算: 汉字×字号 + 西文×0.55,多行向下生长 */
function boxOf(t) {
  const w = textW(t.content, t.fs), lineH = t.fs * 1.25;
  let x0;
  if (t.anchor === "middle") x0 = t.x - w / 2;
  else if (t.anchor === "end") x0 = t.x - w;
  else x0 = t.x;
  return { x0, x1: x0 + w, y0: t.y - t.fs * 0.95, y1: t.y + t.fs * 0.3 + (t.lines - 1) * lineH };
}

/* ---------- 汇总输出 ---------- */
const results = files.map((f) => analyze(fs.readFileSync(f, "utf8"), path.relative(ROOT, f).replace(/\\/g, "/")));
const withSvg = results.filter((r) => r.svgCount > 0);
const totE = withSvg.reduce((a, r) => a + r.E.length, 0);
const totW = withSvg.reduce((a, r) => a + r.W.length, 0);

if (JSON_OUT) {
  console.log(JSON.stringify({ total: { pages: withSvg.length, e: totE, w: totW }, pages: withSvg }, null, 2));
} else {
  for (const r of withSvg) {
    if (!r.E.length && !r.W.length) { console.log(`✓ ${r.rel} · SVG×${r.svgCount} · 0E 0W`); continue; }
    console.log(`页面 ${r.rel} · SVG×${r.svgCount} · E=${r.E.length} W=${r.W.length}`);
    for (const it of r.E) console.log(`  [E] svg#${it.svg} ${it.kind} — ${it.msg}${it.text ? " 「" + it.text + "」" : ""}`);
    for (const it of r.W) console.log(`  [W] svg#${it.svg} ${it.kind} — ${it.msg}${it.text ? " 「" + it.text + "」" : ""}`);
  }
  console.log(`==== 汇总: SVG 页 ${withSvg.length}/${files.length} · E=${totE} W=${totW}`);
}
process.exit(totE > 0 ? 1 : 0);
