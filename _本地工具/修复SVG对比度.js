/* 修复SVG对比度.js — 依据 校验SVG对比度.js 的分析结果做 codemod(V2.1.34b)
 *
 * 两阶段策略:
 *  阶段1(主题相关底色):失败文本按 fill 色相挂双主题语义类 fig-t-*(原 fill 保留兜底,CSS fill
 *        覆盖演示属性);页内注入调色板 <style>(部分 SVG 页不加载 site.css,且不可贸然补 link——
 *        会触发 site.js injectChrome 改布局)。
 *  阶段2(主题无关底色:自带画布/不透明色块):按块底亮度自动换墨——块底亮度 ≥0.2 用深墨 #0f172a,
 *        <0.2 用白墨 #ffffff;代码内先验证 ≥ 阈值再落盘,验不过的留给人工。
 *  幂等:已带 fig-t-* 的跳过;墨色已是目标值不会再次失败;调色板块按标记注释判重。
 * 用法: node 修复SVG对比度.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { analyzeFile, walk, ROOT, FIG_T, cr, lum } = require("./svg_text_contrast.js");

/* fill(小写)→ 语义类(仅用于主题相关底色的失败文本) */
const FILL2CLS = {};
const MAP = {
  "fig-t-muted": ["#64748b", "#8b98a9", "#94a3b8", "#9aa6b8", "#a8b3c5", "#6b7280", "#5b6472", "#7c8aa0", "#8a94a4", "#99a3b3", "#6b7a8f", "#7d8ca3", "#8a95a3", "#8a9bb0", "#cdd9e5", "#6e7b8b", "#a5b4c8", "#b8c4d0"],
  "fig-t-info": ["#2563eb", "#3b82f6", "#58a6ff", "#60a5fa", "#93c5fd", "#1d4ed8", "#3d7eff", "#4d7fd6", "#9ecbff", "#7dd3fc"],
  "fig-t-ok": ["#16a34a", "#22c55e", "#15803d", "#10b981", "#34d399", "#4ade80", "#059669", "#2bd47a", "#05df72", "#86efac", "#2ea043"],
  "fig-t-warn": ["#f59e0b", "#f97316", "#d97706", "#fb923c", "#ea580c", "#c2410c", "#fbbf24"],
  "fig-t-bad": ["#ef4444", "#dc2626", "#f87171", "#ff5d5d", "#b91c1c", "#e11d48", "#fca5a5", "#7f1d1d"],
  "fig-t-purple": ["#a855f7", "#8b5cf6", "#7c3aed", "#9333ea", "#c084fc", "#d8b4fe", "#a78bfa"],
  "fig-t-cyan": ["#06b6d4", "#22d3ee", "#0891b2", "#38bdf8", "#0ea5e9", "#67e8f9"],
  "fig-t-pink": ["#ec4899", "#f472b6", "#db2777", "#f9a8d4"],
  "fig-t-yellow": ["#eab308", "#facc15", "#fbbf24", "#ca8a04", "#fde047"],
  "fig-t-info": ["#7cb8ff"],
  "fig-t-muted": ["#8b949e"],
};
for (const [cls, arr] of Object.entries(MAP)) for (const h of arr) FILL2CLS[h] = cls;

/* 页内调色板(由 FIG_T 单源生成) */
const PALETTE = '<style>/* fig-t palette(V2.1.34b):SVG 图内文字双主题语义色 — CSS fill 覆盖演示属性,原 fill 留作兜底 */\n'
  + Object.entries(FIG_T).map(([k, [l, d]]) => {
    let s = ".fig-t-" + k + "{fill:" + l + "}";
    s += 'html[data-theme-early="dark"] .fig-t-' + k + ',html[data-theme="dark"] .fig-t-' + k + ',body[data-theme="dark"] .fig-t-' + k + "{fill:" + d + "}";
    return s;
  }).join("\n") + "\n</style>";

let totalClassed = 0, totalInk = 0, totalManual = 0, pagesEdited = 0;
const manualReport = [];

for (const file of walk(ROOT, []).sort()) {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  const html = fs.readFileSync(file, "utf8");
  const { fails } = analyzeFile(html);

  /* 调色板刷新与是否有失败无关:凡页内已有 fig-t 调色板(或本轮将挂类),一律重写为当前
     FIG_T 版本,保证页内 <style> 与单源同步(否则浏览器仍显示旧值)。V2.1.34b 修正 */
  const needsPalette = /fig-t palette/.test(html);

  if (!fails.length && !needsPalette) continue;

  const edits = [];
  const used = new Set();
  let ink = 0, manual = 0;

  for (const f of fails) {
    if (f.themeDep) {
      /* 阶段1:挂语义类 */
      const cls = FILL2CLS[f.fill.toLowerCase()];
      if (!cls) { manual++; continue; }
      if (/fig-t-/.test(f.openTag)) continue; /* 幂等 */
      const cm = f.openTag.match(/\bclass\s*=\s*"([^"]*)"/);
      let replacement;
      if (cm) replacement = f.openTag.replace(/\bclass\s*=\s*"([^"]*)"/, (m0, m1) => 'class="' + m1 + " " + cls + '"');
      else replacement = f.openTag.replace(/>$/, " " + 'class="' + cls + '">');
      edits.push({ start: f.openStart, end: f.openEnd, replacement });
      used.add(cls);
    } else {
      /* 阶段2:主题无关底色 → 按块底亮度换墨 */
      const bgRGB = [parseInt(f.worstBg.slice(1, 3), 16), parseInt(f.worstBg.slice(3, 5), 16), parseInt(f.worstBg.slice(5, 7), 16)];
      const inkHex = lum(bgRGB) >= 0.2 ? "#0f172a" : "#ffffff";
      const inkRGB = inkHex === "#0f172a" ? [0x0f, 0x17, 0x2a] : [0xff, 0xff, 0xff];
      if (cr(inkRGB, bgRGB) < f.need - 1e-9) { manual++; continue; } /* 验不过,人工 */
      if (f.fill.toLowerCase() === inkHex) continue; /* 已是目标墨色 */
      const newTag = f.openTag.replace(/(fill\s*=\s*")#[^"]*(")/i, "$1" + inkHex + "$2");
      if (newTag === f.openTag) { manual++; continue; } /* style 形式等,人工 */
      edits.push({ start: f.openStart, end: f.openEnd, replacement: newTag });
      ink++;
    }
  }

  if (!edits.length && !needsPalette) {
    if (manual > 0) { manualReport.push({ rel, manual, fails }); totalManual += manual; }
    continue;
  }

  edits.sort((a, b) => b.start - a.start);
  let out = html;
  for (const e of edits) out = out.slice(0, e.start) + e.replacement + out.slice(e.end);

  if (needsPalette) {
    /* 调色板版本更新:先移除旧块再注入(幂等,且支持浅色值加深后的版本替换) */
    out = out.replace(/<style>\/\* fig-t palette[\s\S]*?<\/style>\n?/g, "");
    const anchor = out.indexOf("</head>");
    if (anchor >= 0) out = out.slice(0, anchor) + PALETTE + "\n" + out.slice(anchor);
    else console.log("  [WARN] " + rel + " 无 </head>,调色板未注入");
  }

  if (out !== html) { fs.writeFileSync(file, out); pagesEdited++; }
  totalClassed += used.size ? edits.length - ink : 0; totalInk += ink;
  totalManual += manual;
  if (manual > 0) manualReport.push({ rel, manual, fails });
  console.log("[FIXED] " + rel + "  挂类 " + Math.max(0, edits.length - ink) + " + 换墨 " + ink + " 处" + (manual ? "  人工待裁 " + manual : "") + (used.size ? "" : "  (仅刷新调色板)"));
}

if (manualReport.length) {
  console.log("\n==== 人工待裁明细 ====");
  for (const p of manualReport) {
    console.log("\n" + p.rel + "  (" + p.manual + " 处)");
    for (const f of p.fails) {
      const autoable = !f.themeDep;
      if (!autoable && FILL2CLS[f.fill.toLowerCase()]) continue; /* 阶段1已覆盖的不再列 */
      console.log("  svg#" + f.svg + " fill=" + f.fill + " fs=" + f.fsz + "  " + f.per + "  最差 " + f.worst + " on " + f.worstBg + "  「" + f.text + "」");
    }
  }
}
console.log("\n==== 汇总: 改 " + pagesEdited + " 页 / 挂类 " + totalClassed + " + 换墨 " + totalInk + " 处 / 人工待裁 " + totalManual + " 处 ====");
