#!/usr/bin/env node
/* ============================================================
   人形机器人学习站 · 板块四维评分(依据 docs/审计/板块评分规则.md V1.0)
   用法: node _本地工具/板块评分.js
   输出: docs/审计/板块评分报告_<日期>.md
         docs/审计/_底表评分.csv
   四维: 学习内容30 / 学习效果25 / 知识点掌握25 / 图片准确率20
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const TZFIX = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
const TODAY = TZFIX.toISOString().slice(0, 10);
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const exists = (p) => fs.existsSync(path.join(ROOT, p));

/* ---------- 板块归组(按目录,见规则文档第一节) ---------- */
const FIXLOG = [];   // --detail 时打印每处浅色字/溢出明细
const FOLDER2KEY = {
  "00_3D解剖": "00", "01_理论入门": "01", "02_硬件基础": "02", "03_项目实操": "03",
  "04_升级进阶": "06", "06_软件与算法": "06", "07_前沿知识库": "07", "08_学习工具": "08",
  "09_大模型与具身智能": "09", "10_NPU与数字IC设计": "10"
};

/* ---------- 单源数据 ---------- */
const secSrc = read("_assets/site-sections.js");
const SECTIONS = [...secSrc.matchAll(/\{ key:"(\d\d)", name:"([^"]+)", ids:\[([^\]]*)\] \}/g)]
  .map((m) => ({ key: m[1], name: m[2], ids: [...m[3].matchAll(/"(\d\d-\d\d)"/g)].map((x) => x[1]) }));
const secById = {};
SECTIONS.forEach((s) => s.ids.forEach((id) => { secById[id] = s.key; }));

const idxSrc = read("_assets/search-index.js");
const SEARCH = new Map([...idxSrc.matchAll(/u:"([^"]+)"/g)].map((m) => {
  const seg = idxSrc.slice(m.index, m.index + 600);
  const k = (seg.match(/k:"([^"]*)"/) || [, ""])[1];
  return [m[1], k.trim().split(/\s+/).filter(Boolean)];
}));

const metaSrc = read("_assets/page-meta.js");
const META_KEYS = new Set([...metaSrc.matchAll(/"(\d\d-\d\d)":\s*\{/g)].map((m) => m[1]));

const pathSrc = read("_assets/path-data.js");
const PATH_IDS = new Set([...pathSrc.matchAll(/id:\s*"(\d\d-\d\d)"/g)].map((m) => m[1]));

const ibSrc = read("_assets/ib-data-a.js") + read("_assets/ib-data-b.js") + read("_assets/ib-data-c.js");
const qbSrc = read("_assets/quiz-bank.js");
const qstSrc = read("_assets/quest-data.js");

/* ib 题目切块:每题从 { id:'xx-nn' 到下一个 { id: 之间 */
const IB_ITEMS = [];
{
  const re = /\{ id:'([a-z]+-\d+)',\s*s:'([a-z]+)'/g;
  const marks = [];
  let m;
  while ((m = re.exec(ibSrc)) !== null) marks.push({ id: m[1], s: m[2], start: m.index });
  for (let i = 0; i < marks.length; i++) {
    const chunk = ibSrc.slice(marks[i].start, i + 1 < marks.length ? marks[i + 1].start : undefined);
    const follow = chunk.match(/follow:\[([^\]]*)\]/);
    IB_ITEMS.push({
      id: marks[i].id, s: marks[i].s,
      followN: follow ? [...follow[1].matchAll(/'[^']*'/g)].length : 0,
      links: [...chunk.matchAll(/u:'([^']+)'/g)].map((x) => x[1])
    });
  }
}
/* 学科级 rel 链接 */
const IB_REL = [];
{
  const re = /\{ id:'([a-z]+)', name:[\s\S]*?rel:\s*\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(ibSrc)) !== null) {
    [...m[2].matchAll(/u:'([^']+)'/g)].forEach((x) => IB_REL.push({ subj: m[1], u: x[1] }));
  }
}
/* 闯关:自建题 link 与 ref/qb 引用 */
const QUEST_LINK_U = [...qstSrc.matchAll(/link:\s*\{[^}]*u:\s*'([^']+)'/g)].map((m) => m[1]);
const QUEST_REFS = [...qstSrc.matchAll(/'ref:([a-z]+-\d+)'/g)].map((m) => m[1]);
const QB_LINK_U = [...qbSrc.matchAll(/link:\s*\{[^}]*u:\s*'([^']+)'/g)].map((m) => m[1]);

/* u 字段(相对 08_学习工具/ 解析)→ 站内相对路径 */
function toSiteRel(u) {
  const clean = u.split("?")[0].split("#")[0];
  return clean.replace(/^\.\.\//, "").replace(/^\.\//, "");
}

/* ---------- 页面扫描 ---------- */
const SKIP_DIR = /(^|[\\/])(_[^\\/]*|node_modules|\.git|edge_prof|05_HdriveV2[^\\/]*)([\\/]|$)/;
const pages = [];
(function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    const rel = path.relative(ROOT, full).replace(/\\/g, "/");
    if (ent.isDirectory()) { if (!SKIP_DIR.test(rel + "/")) walk(full); continue; }
    if (!ent.name.endsWith(".html")) continue;
    if (rel === "index.html" || rel === "404.html") continue;
    const folder = rel.split("/")[0];
    if (rel === folder + "/index.html") continue; // 板块根目录重定向 index(与自检 $pages 口径一致)
    const key = FOLDER2KEY[folder];
    if (!key) continue;
    const html = fs.readFileSync(full, "utf8");
    pages.push(analyze(html, rel, key));
  }
})(ROOT);

function analyze(html, rel, key) {
  const idM = html.match(/pageId:\s*"(\d\d-\d\d)"/);
  const pageId = idM ? idM[1] : "";
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ");
  const text = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, "");
  const cnt = (re) => (body.match(re) || []).length;
  const explain = [...body.matchAll(/class="quiz-explain"[^>]*>([\s\S]*?)<\/div>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, "").length);
  const explainAvg = explain.length ? Math.round(explain.reduce((a, b) => a + b, 0) / explain.length) : 0;

  /* 图片准确率:SVG 逐块(g fill 继承 + 最近深色矩形底上下文,过滤合法深底浅字) */
  let lightFill = 0, overflow = 0;
  const svgs = [...html.matchAll(/<svg\b[^>]*>/gi)];
  const lum = (hex) => {
    let h = hex.toLowerCase();
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    return (0.299 * parseInt(h.slice(0, 2), 16) + 0.587 * parseInt(h.slice(2, 4), 16) + 0.114 * parseInt(h.slice(4, 6), 16)) / 255;
  };
  /* 页级深底图卡:.my-fig/.my-svg 的 CSS 背景为深色(含 rgba 按白底合成)→ 包内 SVG 浅字合法 */
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
  for (const sm of svgs) {
    const vb = sm[0].match(/viewBox="0\s+0\s+([\d.]+)\s+([\d.]+)"/);
    const vbW = vb ? parseFloat(vb[1]) : 0;
    const end = html.indexOf("</svg>", sm.index);
    const svg = end > 0 ? html.slice(sm.index, end) : "";
    const tokenRe = /<g\b([^>]*)>|<\/g>|<rect\b([^>]*)>|<(text|tspan)\b([^>]*)>([\s\S]*?)<\/\3>/gi;
    let gFill = [null], lastRect = null, figDarkBg = false, m2;
    const inDarkCard = figCssDark && /class="[^"]*my-(fig|svg)[^"]*"/.test(html.slice(Math.max(0, sm.index - 250), sm.index));
    const svgOnDark = figDarkBg || inDarkCard;
    /* 图级背景:面积最大的矩形若铺满图幅(≥70%宽×≥60%高)且为深色,整图视为深底卡(浅字合法) */
    if (vbW > 0) {
      const vbH = parseFloat(vb[2]);
      let best = null;
      for (const ra of svg.matchAll(/<rect\b[^>]*>/gi)) {
        const rw = parseFloat((ra[0].match(/\bwidth="([\d.-]+)"/) || [])[1]);
        const rh = parseFloat((ra[0].match(/\bheight="([\d.-]+)"/) || [])[1]);
        const rf = (ra[0].match(/fill="([^"]+)"/) || [])[1] || "";
        const hm2 = rf.match(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/);
        if (!hm2 || !isFinite(rw) || !isFinite(rh)) continue;
        const area = rw * rh;
        if (!best || area > best.area) best = { area, rw, rh, hex: hm2[1] };
      }
      if (best && best.rw >= vbW * 0.7 && best.rh >= vbH * 0.6) figDarkBg = lum(best.hex) < 0.45;
    }
    while ((m2 = tokenRe.exec(svg)) !== null) {
      if (m2[1] !== undefined) {
        const f = (m2[1].match(/fill="([^"]+)"/) || [])[1];
        const gfs = (m2[1].match(/font-size="([\d.]+)"/) || [])[1];
        gFill.push({ fill: f !== undefined ? f : (gFill[gFill.length - 1] || {}).fill, fs: gfs !== undefined ? parseFloat(gfs) : (gFill[gFill.length - 1] || {}).fs });
      } else if (m2[0] === "</g>") {
        if (gFill.length > 1) gFill.pop();
      } else if (m2[2] !== undefined) {
        const a = m2[2];
        const rf = (a.match(/fill="([^"]+)"/) || [])[1] || "";
        const rx = parseFloat((a.match(/\bx="([\d.-]+)"/) || [])[1]);
        const ry = parseFloat((a.match(/\by="([\d.-]+)"/) || [])[1]);
        const rw = parseFloat((a.match(/\bwidth="([\d.-]+)"/) || [])[1]);
        const rh = parseFloat((a.match(/\bheight="([\d.-]+)"/) || [])[1]);
        let dark = false;
        const hm = rf.match(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/);
        if (hm) dark = lum(hm[1]) < 0.35;
        lastRect = (isFinite(rx) && isFinite(rw)) ? { x: rx, y: ry, w: rw, h: rh, dark, at: m2.index } : null;
      } else {
        const attrs = m2[4] || "";
        const gTop = gFill[gFill.length - 1] || {};
        const own = (attrs.match(/fill="([^"]+)"/) || [])[1];
        const fill = own || gTop.fill;
        const content = (m2[5] || "").replace(/<[^>]+>/g, "");
        if (!content.trim()) continue;
        const hexM = (fill || "").match(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/);
        const onDark = lastRect && lastRect.dark &&
          (!(isFinite(parseFloat(attrs.match(/\bx="([\d.-]+)"/) || [])[1])) ||
            (parseFloat(attrs.match(/\bx="([\d.-]+)"/)[1]) >= lastRect.x - 2 &&
             parseFloat(attrs.match(/\bx="([\d.-]+)"/)[1]) <= lastRect.x + lastRect.w + 2 &&
             parseFloat((attrs.match(/\by="([\d.-]+)"/) || [])[1] || lastRect.y) >= lastRect.y - 16 &&
             parseFloat((attrs.match(/\by="([\d.-]+)"/) || [])[1] || lastRect.y) <= lastRect.y + lastRect.h + 6));
        if (hexM && hexM[1].toLowerCase() !== "ffffff" && !/class=/.test(attrs) && lum(hexM[1]) > 0.62 && !onDark && !svgOnDark) {
          const hh = hexM[1].toLowerCase().length === 3 ? hexM[1].split("").map((c) => c + c).join("") : hexM[1];
          const rgb = [0, 2, 4].map((i) => parseInt(hh.slice(i, i + 2), 16));
          if (Math.max(...rgb) - Math.min(...rgb) < 40) { lightFill++; FIXLOG.push({ rel, kind: "浅色字", hex: hexM[1], text: content.slice(0, 24) }); }
        }
        if (vbW > 0 && (m2[3] || "").toLowerCase() === "text" && !/transform="[^"]*rotate/.test(attrs)) {
          const x = parseFloat((attrs.match(/\bx="([\d.-]+)"/) || [])[1]);
          const fsz = parseFloat((attrs.match(/font-size="([\d.]+)"/) || [])[1]);
          if (!isFinite(fsz)) continue;   // 继承字号无法静态确定,估算误报率高,仅检查自带 font-size 的文字
          if (isFinite(x) && isFinite(fsz) && fsz >= 9) {
            let w = 0;
            for (const ch of content) w += /[\u2E80-\u9FFF\uF900-\uFAFF\uFF01-\uFF60\u3000-\u303F]/.test(ch) ? fsz : fsz * 0.55;
            const anchor = (attrs.match(/text-anchor="(\w+)"/) || [])[1];
            const over = anchor === "middle" ? (x + w / 2 > vbW - 2 || x - w / 2 < 2)
              : anchor === "end" ? (x > vbW - 2) : (x + w > vbW - 2);
            if (over && !svgOnDark) { overflow++; FIXLOG.push({ rel, kind: "溢出", hex: "", text: content.slice(0, 24) }); }
            else if (over) { overflow++; FIXLOG.push({ rel, kind: "溢出(深底卡)", hex: "", text: content.slice(0, 24) }); }
          }
        }
      }
    }
  }
  /* img 完整性 */
  let imgOK = 0, imgAll = 0;
  for (const im of html.matchAll(/<img\b[^>]*>/gi)) {
    imgAll++;
    const tag = im[0];
    const src = (tag.match(/src="([^"]+)"/) || [])[1] || "";
    const hasAlt = /\balt=/.test(tag);
    const local = src && !/^(https?:|data:|\/\/)/.test(src);
    const srcOK = !local || exists(path.join(path.dirname(path.join(ROOT, rel)), src.split("?")[0]));
    if (srcOK && hasAlt) imgOK++;
  }
  const hasFormula = /class="formula"/.test(html);
  const usesSiteJs = /_assets\/site\.js/.test(html);
  const isTool = key === "08";
  const is3D = key === "00";
  const interactive = new Set([
    /<button[\s>]/i.test(html), /<input[\s>]/i.test(html), /<canvas[\s>]/i.test(html),
    /<select[\s>]/i.test(html), /onclick=/i.test(html), /addEventListener\(/.test(html)
  ].filter(Boolean)).size;

  return {
    rel, key, pageId, folder: rel.split("/")[0],
    textLen: text.length,
    h2: cnt(/<h2[\s>]/gi), h3: cnt(/<h3[\s>]/gi),
    keyPoint: cnt(/class="[^"]*key-point/),
    table: cnt(/<table[\s>]/gi), pre: cnt(/<pre[\s>]/gi),
    box: cnt(/class="box[ "]|class="box box-(tip|warn|info)"/gi),
    flow: cnt(/class="[^"]*step-flow/) + cnt(/<details[\s>]/gi),
    formula: cnt(/class="formula"/g),
    miscon: /误区|易错|避坑|调试|排错/.test(text) ? 1 : 0,
    extLinks: (body.match(/https?:\/\//g) || []).length,
    quiz: cnt(/data-answer=/gi), explainN: explain.length, explainAvg,
    svg: svgs.length,
    caps: (body.match(/class="[^"]*cap[^"]*"/gi) || []).length + cnt(/<figcaption/gi),
    lightFill, overflow,
    imgAll, imgOK,
    formulaOK: !hasFormula || usesSiteJs,
    interactive,
    /* 注册与联动 */
    inSections: !!pageId && !!secById[pageId],
    inMeta: !!pageId && META_KEYS.has(pageId),
    inSearch: SEARCH.has(rel),
    kwN: SEARCH.has(rel) ? SEARCH.get(rel).length : 0,
    inPath: !!pageId && PATH_IDS.has(pageId)
  };
}

/* ---------- 题库→页面/板块 指向统计 ---------- */
const rel2page = new Map(pages.map((p) => [p.rel, p]));
function targetsOf(us) {
  const set = new Set();
  for (const u of us) {
    const t = toSiteRel(u);
    if (rel2page.has(t)) set.add(t);
  }
  return set;
}
const ibTargets = targetsOf([...IB_ITEMS.flatMap((i) => i.links), ...IB_REL.map((r) => r.u)]);
const quizTargets = targetsOf(QB_LINK_U);
const questTargets = targetsOf(QUEST_LINK_U);
/* 指向板块的 ib 题目数与 follow */
const ibItemsPerSec = {};
for (const it of IB_ITEMS) {
  const sec = new Set(it.links.map((u) => (rel2page.get(toSiteRel(u)) || {}).key).filter(Boolean));
  sec.forEach((k) => {
    ibItemsPerSec[k] = ibItemsPerSec[k] || { n: 0, followSum: 0 };
    ibItemsPerSec[k].n++; ibItemsPerSec[k].followSum += it.followN;
  });
}

/* ---------- 计分 ---------- */
const tiers = (v, th, sc) => { for (let i = 0; i < th.length; i++) if (v >= th[i]) return sc[i]; return sc[sc.length - 1]; };

function pageContent(p) { // 学习内容 30(页级)
  if (p.interactive !== undefined && p.key === "08") {
    const interact = p.interactive >= 3 ? 8 : p.interactive === 2 ? 5 : p.interactive === 1 ? 2 : 0;
    return tiers(p.textLen, [5000, 3000, 2000, 1200, 600], [6, 5, 4, 3, 2, 1])
      + tiers(p.h2, p.key === "00" ? [3, 2, 1] : [6, 4, 2], [3, 2, 1])
      + tiers(p.h3, p.key === "00" ? [3, 2, 1] : [6, 3, 1], [3, 2, 1])
      + (p.keyPoint ? 2 : 0) + interact;
  }
  const lenTh = p.key === "00" ? [2500, 1500, 1000, 600, 300] : [5000, 3000, 2000, 1200, 600];
  return tiers(p.textLen, lenTh, [6, 5, 4, 3, 2, 1])
    + tiers(p.h2, p.key === "00" ? [3, 2, 1] : [6, 4, 2], [3, 2, 1])
    + tiers(p.h3, p.key === "00" ? [3, 2, 1] : [6, 3, 1], [3, 2, 1])
    + (p.keyPoint ? 2 : 0)
    + (p.table ? 2 : 0) + (p.pre ? 2 : 0) + (p.box ? 2 : 0) + (p.flow ? 2 : 0)
    + (p.formula >= 3 ? 2 : p.formula >= 1 ? 1 : 0) + (p.miscon ? 2 : 0)
    + (p.extLinks >= 3 ? 4 : p.extLinks >= 1 ? 2 : 0);
}
function pageEffect(p) { // 学习效果 25(页级部分,满分 13)
  return tiers(p.quiz, [4, 2, 1], [8, 5, 3])
    + (p.quiz > 0 && p.explainAvg >= 120 ? 2 : 0)
    + tiers(p.kwN, [4, 1], [3, 1.5, 0]);
}
function pageImg(p) { // 图片准确率 20(页级部分,满分 5;图注覆盖改板块级折算)
  return (p.imgAll ? (p.imgOK / p.imgAll) * 2.5 : 2.5) + (p.formulaOK ? 2.5 : 0);
}

const REPORT = [];
const RISK = [];
let csv = "\ufeff页面,板块,pageId,字数,h2,h3,自测题,解析均长,公式,SVG,图注,浅色字,溢出,注册,路径,交互\n";

for (const s of SECTIONS) {
  const ps = pages.filter((p) => p.key === s.key);
  if (!ps.length) { REPORT.push({ key: s.key, name: s.name, empty: true }); continue; }
  const n = ps.length;
  const avg = (f) => ps.reduce((a, p) => a + f(p), 0) / n;

  /* 学习内容 30 */
  const content = avg(pageContent);
  /* 学习效果 25 = 页级13均 + 注册5 + 路径4 + 联动3 */
  const regRatio = ps.filter((p) => p.inSections && p.inMeta && p.inSearch).length / n;
  const pathRatio = ps.filter((p) => p.inPath).length / n;
  const quizLinkRatio = ps.filter((p) => quizTargets.has(p.rel) || questTargets.has(p.rel)).length / n;
  const effect = avg(pageEffect) + regRatio * 5 + pathRatio * 4 + quizLinkRatio * 3;
  /* 知识点掌握 25 */
  const ibCover = ps.filter((p) => ibTargets.has(p.rel)).length / n;
  const ibInfo = ibItemsPerSec[s.key] || { n: 0, followSum: 0 };
  const ibN = ibInfo.n;
  const ibNscore = ibN >= n ? 8 : ibN >= n * 0.6 ? 6 : ibN >= 3 ? 4 : ibN >= 1 ? 2 : 0;
  const questCover = ps.filter((p) => questTargets.has(p.rel)).length > 0 ? 4 : (avg((p) => p.quiz) >= 2 ? 2 : 0);
  const followAvg = ibN ? ibInfo.followSum / ibN : 0;
  const mastery = ibCover * 10 + ibNscore + questCover + (followAvg >= 2 ? 3 : followAvg >= 1 ? 2 : ibN > 0 ? 1 : 0);
  /* 图片准确率 20 = 页级5均 + 图注覆盖5(按含图页占比折算) + 悬空5 + 溢出5 */
  const light = ps.reduce((a, p) => a + p.lightFill, 0);
  const over = ps.reduce((a, p) => a + p.overflow, 0);
  const svgPages = ps.filter((p) => p.svg > 0).length;
  const svgPageRatio = svgPages / n;
  const totalSvg = ps.reduce((a, p) => a + p.svg, 0);
  const totalCaps = ps.reduce((a, p) => a + Math.min(p.caps, p.svg), 0);
  const capRatio = totalSvg ? totalCaps / totalSvg : 1;
  const capScore = capRatio * 5 * (svgPageRatio > 0.5 ? 1 : svgPageRatio * 2);
  const img = avg(pageImg) + capScore + (light === 0 ? 5 : light <= 3 ? 3 : 1) + (over === 0 ? 5 : over <= 3 ? 3 : 1);
  const total = content + effect + mastery + img;
  const grade = total >= 85 ? "A" : total >= 70 ? "B" : total >= 55 ? "C" : "D";

  /* 建议生成 */
  const sug = [];
  const L = (id) => id.replace(/^.*\//, "").replace(/\.html$/, "");
  const uniq = (a) => [...new Set(a)];
  const noQuiz = uniq(ps.filter((p) => p.quiz < 2).map((p) => p.pageId || L(p.rel)));
  if (noQuiz.length) sug.push(`自测题不足:${noQuiz.slice(0, 8).join("、")}(<2 题,建议每页 2~4 题带逐项解析)`);
  const unreg = uniq(ps.filter((p) => !(p.inSections && p.inMeta && p.inSearch)).map((p) => (p.pageId || L(p.rel)) + (p.key === "00" && !p.pageId ? "(3D 实验页无 site.js,pageId 特例)" : "")));
  if (unreg.length) sug.push(`注册不完整:${unreg.slice(0, 6).join("、")}(用 _本地工具/登记页面.js 补齐)`);
  if (pathRatio < 0.3) sug.push(`学习路径引用率仅 ${Math.round(pathRatio * 100)}%,考虑把代表页纳入 path-data 对应路径`);
  const noIb = uniq(ps.filter((p) => !ibTargets.has(p.rel)).map((p) => p.pageId || L(p.rel)));
  if (ibN === 0) sug.push(`零题库覆盖:ib-data 无任何题目 links/rel 指向本板块,需新增学科或挂靠现有学科出题`);
  else if (ibCover < 0.5) sug.push(`题库指向覆盖 ${Math.round(ibCover * 100)}%:${noIb.slice(0, 6).join("、")} 等页无题目关联`);
  if (followAvg < 1 && ibN > 0) sug.push(`相关题目追问(follow)平均 ${followAvg.toFixed(1)} 条,建议每题补 2 条追问`);
  const thin = uniq(ps.filter((p) => p.textLen < (p.key === "00" ? 600 : 1200)).map((p) => p.pageId || L(p.rel)));
  if (thin.length) sug.push(`正文过薄:${thin.slice(0, 8).join("、")}`);
  const lf = uniq(ps.filter((p) => p.lightFill > 0).map((p) => p.pageId || L(p.rel)));
  if (lf.length) sug.push(`SVG 硬编码浅色字 ${light} 处(${lf.slice(0, 4).join("、")} 等),改 .my-* 主题类或 #64748b`);
  const ov = uniq(ps.filter((p) => p.overflow > 0).map((p) => p.pageId || L(p.rel)));
  if (ov.length) sug.push(`SVG 疑似文字溢出 ${over} 处(${ov.slice(0, 4).join("、")} 等),需逐图目检`);
  const noCap = uniq(ps.filter((p) => p.svg > 0 && p.caps < p.svg).map((p) => p.pageId || L(p.rel)));
  if (noCap.length && svgPages / n > 0) sug.push(`部分 SVG 缺图注:${noCap.slice(0, 5).join("、")}`);
  if (svgPages / n < 0.5) sug.push(`仅 ${svgPages}/${n} 页含 SVG 图示,图示密度偏低`);
  const imgBad = uniq(ps.filter((p) => p.imgAll && p.imgOK < p.imgAll).map((p) => p.pageId || L(p.rel)));
  if (imgBad.length) sug.push(`img 引用或 alt 不完整:${imgBad.join("、")}`);
  const katBad = uniq(ps.filter((p) => !p.formulaOK).map((p) => p.pageId || L(p.rel)));
  if (katBad.length) sug.push(`含公式但未走 site.js 统一 KaTeX 加载器:${katBad.join("、")}`);

  ps.forEach((p) => {
    csv += [p.rel, s.key, p.pageId || "-", p.textLen, p.h2, p.h3, p.quiz, p.explainAvg, p.formula,
      p.svg, p.caps, p.lightFill, p.overflow,
      (p.inSections && p.inMeta && p.inSearch) ? "Y" : "N", p.inPath ? "Y" : "N", p.interactive].join(",") + "\n";
    if (p.lightFill > 0 || p.overflow > 0 || !p.formulaOK || (p.svg > 0 && p.caps < p.svg)) RISK.push(p);
  });

  REPORT.push({
    key: s.key, name: s.name, pages: n, total, grade,
    content, effect, mastery, img,
    detail: {
      reg: regRatio, path: pathRatio, quizLink: quizLinkRatio,
      ibCover, ibN, questCover, followAvg, light, over, svgPages
    },
    suggestions: sug.slice(0, 8)
  });
}

/* ---------- 输出 ---------- */
REPORT.sort((a, b) => (b.total || 0) - (a.total || 0));
let md = `# 板块评分报告(${TODAY})\n\n`;
md += `> 由 \`_本地工具/板块评分.js\` 自动生成,计分依据《板块评分规则.md》V1.0。四维:学习内容30 / 学习效果25 / 知识点掌握25 / 图片准确率20。档位:A≥85 B70-84 C55-69 D<55。\n\n`;
md += `| 排名 | 板块 | 页数 | 学习内容/30 | 学习效果/25 | 知识点掌握/25 | 图片准确率/20 | 总分 | 档位 |\n|---|---|---|---|---|---|---|---|---|\n`;
REPORT.forEach((r, i) => {
  md += `| ${i + 1} | ${r.key} ${r.name} | ${r.pages} | ${r.content.toFixed(1)} | ${r.effect.toFixed(1)} | ${r.mastery.toFixed(1)} | ${r.img.toFixed(1)} | **${r.total.toFixed(1)}** | ${r.grade} |\n`;
});
md += `\n## 分板块明细与修改建议\n\n`;
for (const r of REPORT) {
  md += `### ${r.key} ${r.name} — ${r.total.toFixed(1)} 分(${r.grade})\n\n`;
  md += `- 学习内容 ${r.content.toFixed(1)}/30 · 学习效果 ${r.effect.toFixed(1)}/25(注册 ${Math.round(r.detail.reg * 100)}% / 路径 ${Math.round(r.detail.path * 100)}% / 练习联动 ${Math.round(r.detail.quizLink * 100)}%)`;
  md += ` · 知识点掌握 ${r.mastery.toFixed(1)}/25(题库指向 ${Math.round(r.detail.ibCover * 100)}%,题目 ${r.detail.ibN} 题,闯关 ${r.detail.questCover}/4,追问均 ${r.detail.followAvg.toFixed(1)})`;
  md += ` · 图片准确率 ${r.img.toFixed(1)}/20(浅色字 ${r.detail.light} / 溢出 ${r.detail.over} / 含图页 ${r.detail.svgPages}/${r.pages})\n\n`;
  if (r.suggestions.length) { r.suggestions.forEach((s, i) => { md += `${i + 1}. ${s}\n`; }); md += `\n`; }
}
md += `\n## 目检风险页清单(${RISK.length} 页,按图片准确率筛查)\n\n`;
md += RISK.map((p) => `- ${p.rel}(pageId ${p.pageId || "-"},浅色字 ${p.lightFill},溢出 ${p.overflow},图注 ${p.caps}/${p.svg}${p.formulaOK ? "" : ",公式未走统一加载器"})`).join("\n");
md += `\n`;
const reportPath = `docs/审计/板块评分报告_${TODAY}.md`;
fs.writeFileSync(path.join(ROOT, reportPath), md);
fs.writeFileSync(path.join(ROOT, "docs/审计/_底表评分.csv"), csv);
console.log(`板块评分完成 → ${reportPath}`);
REPORT.forEach((r) => console.log(
  `${r.key} ${r.name}: 内容${r.content.toFixed(1)} 效果${r.effect.toFixed(1)} 掌握${r.mastery.toFixed(1)} 图片${r.img.toFixed(1)} = ${r.total.toFixed(1)}(${r.grade})`));
console.log(`风险页 ${RISK.length} 页(见报告末尾清单)`);
if (process.argv.includes("--detail")) {
  console.log("\n--- 明细 ---");
  FIXLOG.forEach((f) => console.log(`${f.rel} [${f.kind}${f.hex ? " " + f.hex : ""}] ${f.text}`));
}
