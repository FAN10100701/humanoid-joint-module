/* 校验SVG对比度.js — 零依赖双主题 SVG 图内文字对比度审计(V2.1.34b,用户反馈"图内字看不清"专项)
 *
 * 口径:
 *  - 逐 <svg> 块内所有 <text>/<tspan>(含 style="fill:" 与 fill=""),对"有效底色"算 WCAG 对比度。
 *  - 有效底色判定优先级:
 *      1) 图自带满幅画布:面积 ≥70%宽×≥60%高 的最大 rect,不透明 hex → 该图主题无关,只对画布色算一次;
 *      2) 文字锚点落在某个不透明 hex rect 内 → 该 rect 色(主题无关,算一次);
 *      3) 文字锚点落在 rgba 半透明 rect 内 → 合成色: rgba 叠在 浅色卡底/深色卡底 各算一次(主题相关);
 *      4) 无 rect → 浅色卡底 #f6f8fb / 深色卡底 #0d1117 各算一次(主题相关)。
 *  - 阈值:字号 <14px(或未标注)需 ≥4.5;≥14px 且 bold 需 ≥3.0;≥19px 需 ≥3.0。
 *  - marker 的 viewBox(0 0 10 10 之类 ≤20)不计;fill="none" 不算文字。
 *  - 主题相关底色时"两主题取最差",任一不过即 FAIL;输出 L/D 各自对比度便于修色。
 *  - 已知边界(输出供人工复核):transform 平移的 rect 含盖判定不建模;text 省略 fill 时继承链不建模
 *    (继承色由 校验对比度.js 覆盖);<g fill=..> 分组继承不建模。
 * 模块形态:require() 得 { analyzeFile };CLI 直跑输出报告,退出码有 FAIL 为 1(供一键自检 C18)。
 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const EXCLUDE = ["_本地工具", "docs", "out", "gui-test-screenshots", "_shots_v3", ".git", "node_modules", ".zcode", ".agents", ".mimosa", "_blender-scripts"];
const LIGHT_BG = [0xf6, 0xf8, 0xfb], DARK_BG = [0x0d, 0x11, 0x17];

/* fig-t-* 双主题语义色单源([浅色值, 深色值])。
 * 浅色值按"最差半透明叠加底"(lum≈0.83~0.94)取 ≥4.5;深色值按 #0d1117 及轻度叠加底取 ≥4.5。
 * deep 变体用于强饱和色条(浅色主题下色条呈中亮度的场合):浅色用极深同调墨,深色用极浅同调墨。
 * 修复SVG对比度.js 据此生成页内 <style>;本扫描器据此解析 class 的真实生效色(验证闭环)。 */
const FIG_T = {
  muted:   ["#59677e", "#94a3b8"],
  info:    ["#1d4ed8", "#58a6ff"],
  ok:      ["#166534", "#4ade80"],
  warn:    ["#9a3412", "#fb923c"],
  bad:     ["#b91c1c", "#f87171"],
  purple:  ["#6b21a8", "#c084fc"],
  cyan:    ["#155e75", "#22d3ee"],
  pink:    ["#9d174d", "#f472b6"],
  yellow:  ["#854d0e", "#facc15"],
  baddeep: ["#6b1010", "#fecaca"],
  okdeep:  ["#0e3a1f", "#bbf7d0"],
  warndeep:["#451a03", "#ffffff"],
  infodeep:["#1e40af", "#dbeafe"],
};

function hex2rgb(h) {
  h = h.replace("#", "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function lum(c) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}
function cr(a, b) {
  const l1 = lum(a), l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
function blend(fgArr, bgArr) {
  if (fgArr.length === 3) return fgArr;
  const a = fgArr[3];
  if (a >= 1) return fgArr.slice(0, 3);
  return [0, 1, 2].map((i) => Math.round(fgArr[i] * a + bgArr[i] * (1 - a)));
}
function parseColor(str) {
  if (!str) return null;
  str = str.trim();
  let m = str.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (m) { const rgb = hex2rgb(m[0]); return rgb ? rgb.concat([1]) : null; }
  m = str.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/i);
  if (m) return [ +m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4] ];
  return null; /* currentcolor/渐变/命名色:不建模 */
}
function attr(tag, name) {
  const m = tag.match(new RegExp('\\b' + name + '\\s*=\\s*"([^"]*)"'));
  return m ? m[1] : null;
}
function styleProp(tag, name) {
  const st = attr(tag, "style") || "";
  const m = st.match(new RegExp('(?:^|;)\\s*' + name + '\\s*:\\s*([^;]+)', "i"));
  return m ? m[1].trim() : null;
}
function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (EXCLUDE.indexOf(e.name) >= 0) continue;
      walk(path.join(dir, e.name), out);
    } else if (/\.html?$/i.test(e.name)) out.push(path.join(dir, e.name));
  }
  return out;
}

/* 分析单页:返回 { svgCount, textCount, fails[] }。
 * fails[].openStart/openEnd 是 <text|tspan 开标签在 html 中的绝对位置(供修复器插 class)。 */
function analyzeFile(html) {
  const fails = [];
  let svgCount = 0, textCount = 0;
  const blocks = [...html.matchAll(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi)];
  let svgIdx = 0;
  for (const bm of blocks) {
    const block = bm[0], base = bm.index;
    const vb = block.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    if (vb && parseFloat(vb[1]) <= 20 && parseFloat(vb[2]) <= 20) continue; /* marker */
    svgCount++; svgIdx++;
    const W = vb ? parseFloat(vb[1]) : 0, H = vb ? parseFloat(vb[2]) : 0;

    const rects = [];
    for (const rm of block.matchAll(/<rect\b[^>]*>/gi)) {
      const g = rm[0];
      const f = parseColor(attr(g, "fill") || styleProp(g, "fill"));
      const x = parseFloat(attr(g, "x") || "0"), y = parseFloat(attr(g, "y") || "0");
      const w = parseFloat(attr(g, "width") || "0"), h = parseFloat(attr(g, "height") || "0");
      if (!f || f[3] === 0) continue;
      /* opacity/fill-opacity 属性(常见于色块淡充):并入 alpha,V2.1.34b 修正 */
      const op = Math.min(parseFloat(attr(g, "opacity") || "1"), parseFloat(attr(g, "fill-opacity") || "1"));
      if (!(op > 0)) continue;
      if (op < 1) { f[3] = f[3] * op; if (f[3] < 1) { /* 保持 rgba 形态参与合成 */ } }
      rects.push({ x, y, w, h, f: f[3] < 1 ? f : f.slice(0, 3).concat([1]), i: rm.index });
    }
    let canvas = null;
    if (W > 0 && H > 0) {
      let best = null;
      for (const r of rects) {
        if (r.w >= W * 0.7 && r.h >= H * 0.6) {
          const area = r.w * r.h;
          if (!best || area > best.area) best = { area, f: r.f };
        }
      }
      if (best && best.f[3] >= 1) {
        const l = lum(best.f.slice(0, 3));
        if (l < 0.45 || l > 0.92) canvas = best.f.slice(0, 3);
      }
    }

    for (const tm of block.matchAll(/<(text|tspan)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
      const openTag = "<" + tm[1] + tm[2] + ">";
      const content = tm[3].replace(/<[^>]+>/g, "").trim();
      if (!content) continue;
      let fillStr = attr(openTag, "fill") || styleProp(openTag, "fill");
      if (!fillStr || fillStr === "none") continue;
      const fill = parseColor(fillStr);
      if (!fill) continue;
      textCount++;

      /* fig-t-* 类:CSS fill 覆盖演示属性 → 真实生效色按主题取调色板值(验证闭环) */
      const cmc = (attr(openTag, "class") || "").match(/fig-t-([a-z]+)/);
      const clsName = cmc && FIG_T[cmc[1]] ? cmc[1] : null;
      let fillL = fill, fillD = fill;
      if (clsName) {
        fillL = hex2rgb(FIG_T[clsName][0]).concat([1]);
        fillD = hex2rgb(FIG_T[clsName][1]).concat([1]);
      }

      const fsz = parseFloat(attr(openTag, "font-size") || styleProp(openTag, "font-size") || "0");
      const bold = /bold|[6-9]00/i.test(attr(openTag, "font-weight") || styleProp(openTag, "font-weight") || "");
      const large = (fsz >= 19) || (fsz >= 14 && bold);
      const need = large ? 3.0 : 4.5;

      const x = parseFloat(attr(openTag, "x") || "0"), y = parseFloat(attr(openTag, "y") || "0");
      const anchor = attr(openTag, "text-anchor") || "";
      const px = anchor === "end" ? x - 1 : x;
      const py = Math.max(0, y - (fsz || 12) * 0.35);
      let hit = null;
      if (!canvas) {
        for (const r of rects) {
          if (r.i > tm.index) continue; /* 只看同块内先画的 rect */
          if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) { if (!hit || r.i > hit.i) hit = r; }
        }
      }
      let results;
      if (canvas) {
        const eff = clsName ? (lum(canvas) >= 0.2 ? fillL : fillD) : fill;
        results = [{ theme: "-", bg: canvas, cr: cr(eff.slice(0, 3), canvas) }];
      } else if (hit && hit.f[3] >= 1) {
        const eff = clsName ? (lum(hit.f.slice(0, 3)) >= 0.2 ? fillL : fillD) : fill;
        results = [{ theme: "-", bg: hit.f.slice(0, 3), cr: cr(eff.slice(0, 3), hit.f.slice(0, 3)) }];
      } else if (hit) {
        results = ["L", "D"].map((t) => {
          const bg = blend(hit.f, t === "L" ? LIGHT_BG : DARK_BG);
          return { theme: t, bg, cr: cr((t === "L" ? fillL : fillD).slice(0, 3), bg) };
        });
      } else {
        results = ["L", "D"].map((t) => {
          const bg = t === "L" ? LIGHT_BG : DARK_BG;
          return { theme: t, bg, cr: cr((t === "L" ? fillL : fillD).slice(0, 3), bg) };
        });
      }
      const worst = results.reduce((a, b) => (b.cr < a.cr ? b : a));
      if (worst.cr < need - 1e-9) {
        fails.push({
          svg: svgIdx, tag: tm[1], fill: fillStr, fsz: fsz || "?", bold, need,
          themeDep: results.length === 2,
          worst: worst.cr.toFixed(2),
          worstBg: "#" + worst.bg.map((v) => v.toString(16).padStart(2, "0")).join(""),
          per: results.map((r) => r.theme + ":" + r.cr.toFixed(2)).join(" "),
          text: content.replace(/\s+/g, " ").slice(0, 24),
          openStart: base + tm.index,
          openEnd: base + tm.index + openTag.length,
          openTag,
        });
      }
    }
  }
  return { svgCount, textCount, fails };
}

module.exports = { analyzeFile, walk, ROOT, LIGHT_BG, DARK_BG, FIG_T, cr, lum, parseColor, hex2rgb };

/* ---------------- CLI ---------------- */
if (require.main === module) {
  let failFiles = 0, failTotal = 0, svgTotal = 0, textTotal = 0;
  const files = walk(ROOT, []).sort();
  for (const file of files) {
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    const html = fs.readFileSync(file, "utf8");
    const { svgCount, textCount, fails } = analyzeFile(html);
    svgTotal += svgCount; textTotal += textCount;
    if (fails.length) {
      failFiles++; failTotal += fails.length;
      console.log("\n[FAIL] " + rel + "  (" + fails.length + " 处)");
      for (const f of fails.slice(0, 40)) {
        console.log("  svg#" + f.svg + " fill=" + f.fill + " fs=" + f.fsz + (f.bold ? " bold" : "") + "  需" + f.need + " 实际 " + f.per + "  最差 " + f.worst + " on " + f.worstBg + "  「" + f.text + "」");
      }
      if (fails.length > 40) console.log("  …其余 " + (fails.length - 40) + " 处略");
    }
  }
  console.log("\n==== 汇总: SVG " + svgTotal + " 块 / text " + textTotal + " 条 / FAIL " + failTotal + " 处(" + failFiles + " 页) ====");
  process.exit(failTotal ? 1 : 0);
}
