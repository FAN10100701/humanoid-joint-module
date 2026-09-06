// 公式/乱码专项扫描(发版前)
// 1) 裸 LaTeX:KaTeX 命令出现在 HTML 文本中但不在 .formula 容器内 → 用户看到原始代码
// 2) mojibake:UTF-8 被 GBK 误读的特征序列
// 3) 畸形实体:&#NNN 缺分号 / &amp;# 双重转义
// 4) 可疑占位:undefined/NaN/[object 静态内容
"use strict";
const fs = require("fs");
const path = require("path");
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "_site-backup" || e.name === "lib" || e.name === "_本地工具") continue;
      walk(p, out);
    } else if (e.name.endsWith(".html")) out.push(p);
  }
  return out;
}
const files = walk(".");
let findings = 0;
// KaTeX 命令特征(排除 .formula 内合法使用):抽掉 <script>/<style> 后再找文本节点中的命令
const LATEX = /\\(?:frac|dfrac|tfrac|sum|int|prod|sqrt|hat|dot|bar|vec|alpha|beta|omega|theta|omega|Delta|lambda|mu|sigma|pi|approx|leq|geq|times|cdot|right|left|begin|end|mathbb|mathcal|text)\b/;
for (const f of files) {
  const rel = path.relative(".", f).split(path.sep).join("/");
  let s = fs.readFileSync(f, "utf8");
  // 去掉 script/style 块再查文本
  const noScript = s.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  // 1) 裸 LaTeX:文本节点含 KaTeX 命令,且不在 class="formula" 的片段里
  //    逐段检查:按 <div class="formula..."> 切,段外的文本含命令即报
  const segs = noScript.split(/<div class="formula[^"]*"/i);
  // 段0 一定在 formula 外;后续段取 </div> 之后部分
  const outside = segs[0] + segs.slice(1).map(x => x.replace(/^[\s\S]*?<\/div>/i, "")).join("");
  const texts = outside.replace(/<[^>]+>/g, " ");
  if (LATEX.test(texts)) {
    const m = texts.match(new RegExp("[^>\\s]{0,30}" + LATEX.source + "[^<]{0,40}"));
    findings++;
    console.log("[裸LATEX?] " + rel + " :: " + (m ? m[0].trim().slice(0, 80) : ""));
  }
  // 2) mojibake
  if (/[锘锟烫]|鏂囦欢|娴嬭瘯|鐘舵€/.test(s)) {
    const m = s.match(/.{0,15}[锘锟烫鏂娴鐘].{0,25}/);
    findings++;
    console.log("[MOJIBAKE?] " + rel + " :: " + (m ? m[0] : ""));
  }
  // 3) 畸形实体:&#数字 后面不是分号(排除合法);&amp;# 双转义
  const badEnt = s.match(/&#\d+(?![;\d])[^\d]/g);
  if (badEnt) {
    findings++;
    console.log("[实体缺分号?] " + rel + " :: " + JSON.stringify(badEnt.slice(0, 4)));
  }
  const dblEnt = s.match(/&amp;#[0-9]+;|&amp;[a-z]+;/g);
  if (dblEnt) {
    // 双重转义在 HTML 源里会显示为字面 &xxx; —— 需人工确认是否在代码示例里(合法)
    findings++;
    console.log("[双转义实体] " + rel + " :: " + dblEnt.slice(0, 4).join(" ") + " (共" + dblEnt.length + ")");
  }
  // 4) 静态占位残留(仅查 body 可见文本,排除脚本)
  const bodyTxt = noScript.replace(/<[^>]+>/g, " ");
  for (const pat of [/\bundefined\b/, /NaN(?![a-zA-Z])/, /\[object Object\]/]) {
    const m = bodyTxt.match(pat);
    if (m) { findings++; console.log("[占位残留?] " + rel + " :: " + JSON.stringify(m[0])); break; }
  }
}
console.log("== 扫描 " + files.length + " 个文件,疑点 " + findings + " 处");
