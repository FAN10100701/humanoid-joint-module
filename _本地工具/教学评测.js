/* ============================================================
   人形机器人学习站 · 教学写法评测(教学效果维度)
   职责:与《板块评分.js》(学不学得会,四维计分)互补,
        本脚本回答"讲得好不好读":详略平衡、深入浅出(比喻/实例)、
        段落与句子密度、留存闭环(小结/思考题/自测)。
   用法:node _本地工具/教学评测.js [--csv 路径]
   输出:控制台摘要 + 底表 CSV(默认 docs/审计/_教学评测底表.csv)
   口径:
     - 知识页 = 00~08 板块的正文页(递归,去壳页;V2.1.21 起九板块连续编号)
     - 工具页 = 06_学习工具;实验室页 = 00 主可视化页;壳页/归档不参评
     - 详略档位按知识页四分位自校准,不写死字数阈值
   零依赖:只用 fs/path。
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
/* 路径Containment:CLI 传入/拼接的路径必须仍落在项目根内,防 ../ 逃逸(对齐 登记页面.js) */
const insideRoot = p => {
  const r = path.resolve(p);
  if (r !== path.resolve(ROOT) && !r.startsWith(path.resolve(ROOT) + path.sep)) throw new Error("路径越出项目根: " + p);
  return r;
};
const SECTIONS = [
  "00_3D解剖", "01_理论入门", "02_硬件基础", "03_项目实操", "04_软件与算法",
  "05_前沿知识库", "06_学习工具", "07_大模型与具身智能", "08_NPU与数字IC设计"
];
const LAB_PAGES = new Set(["00_3D解剖/人形机器人解剖式知识可视化.html"].map(p => p.split("/").pop()));

/* ---------- 文案标记词(评测口径单源) ---------- */
const RE_META = /(就像|好比|如同|相当于|宛如|类比|打个比方|可以理解为|不妨把|试想|想象)/g;
const RE_EXAMPLE = /(例如|比如|举例|举个例子|实例|案例|算例|示例|代入数值|实战|动手试|试一试)/g;
const RE_CALC = /(算例|代入数值|计算示例|数值例子)/g;

/* ---------- 工具 ---------- */
function walk(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    if (name === "_作品" || name.startsWith(".")) continue;
    const fp = path.join(dir, name);
    const st = fs.statSync(fp);
    if (st.isDirectory()) walk(fp, out);
    else if (name.endsWith(".html")) out.push(fp);
  }
  return out;
}
function stripBlocks(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ");
}
function toText(html) {
  return stripBlocks(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function count(html, re) { const m = html.match(re); return m ? m.length : 0; }
function uniqWords(re, text) {
  const set = new Set(); let m;
  re.lastIndex = 0;
  while ((m = re.exec(text))) set.add(m[1]);
  return [...set];
}
function percentile(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.floor((s.length - 1) * p));
  return s[i];
}

/* ---------- 单页指标 ---------- */
function analyze(fp) {
  const rel = path.relative(ROOT, fp).split(path.sep).join("/");
  const html = fs.readFileSync(fp, "utf8");
  const dir = path.dirname(rel);
  const base = path.basename(rel);

  let type = "knowledge";
  if (dir.startsWith("06_学习工具")) type = "tool";
  if (LAB_PAGES.has(base)) type = "lab";

  const text = toText(html);
  const chars = text.length;

  /* 动态渲染检测:内联 script 体量远大于可见文本时,正文多在 JS 字符串里,
     静态字数会被低估(交互实验室/题库工具页的常见形态),详略判定需降权 */
  let jsBytes = 0, sm;
  const sRe = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  while ((sm = sRe.exec(html))) jsBytes += sm[1].length;
  const dynamic = jsBytes > 8000 && jsBytes > chars * 1.2;

  /* 段落:仅统计有实义文本的 <p> */
  const paras = [];
  html.replace(/<!--[\s\S]*?-->/g, "").replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi; let m;
  while ((m = pRe.exec(stripBlocks(html)))) {
    const t = toText(m[1]);
    if (t.length >= 30) paras.push(t.length);
  }
  /* 句子密度 */
  const sentences = text.split(/[。!?;！？；]/).filter(s => s.trim().length > 1);
  const avgSentence = sentences.length ? Math.round(chars / sentences.length) : chars;

  /* 自测解析均长 */
  const explains = [];
  const eRe = /<div class="quiz-explain">([\s\S]*?)<\/div>/gi;
  while ((m = eRe.exec(html))) {
    const t = toText(m[1]);
    if (t) explains.push(t.length);
  }

  const metaphors = uniqWords(RE_META, text);
  const examples = uniqWords(RE_EXAMPLE, text);
  const metaN = count(text, RE_META);
  const exN = count(text, RE_EXAMPLE);

  return {
    file: rel, type,
    title: (html.match(/<title>([^<]*)<\/title>/) || [])[1] || base,
    chars, jsBytes, dynamic: dynamic ? 1 : 0,
    readMin: +(chars / 400).toFixed(1),
    h2: count(html, /<h2[^>]*>/g),
    h3: count(html, /<h3[^>]*>/g),
    p: paras.length,
    avgPara: paras.length ? Math.round(paras.reduce((a, b) => a + b, 0) / paras.length) : 0,
    maxPara: paras.length ? Math.max(...paras) : 0,
    avgSentence,
    pre: count(html, /<pre[^>]*>/g),
    table: count(html, /<table[^>]*>/g),
    svg: count(html, /<svg[\s\S]*?<\/svg>/gi),
    img: count(html, /<img[^>]*>/g),
    box: count(html, /class="box box-(tip|warn|danger|ok)"/g),
    details: count(html, /<details[^>]*>/g),
    quiz: count(html, /data-answer=/g),
    quizExplainAvg: explains.length ? Math.round(explains.reduce((a, b) => a + b, 0) / explains.length) : 0,
    formula: count(html, /class="formula"/g) + count(html, /\\\(/g) + count(html, /katex/g),
    keyPoint: /class="key-point"/.test(html) ? 1 : 0,
    summary: /本节小结|📌 本节小结|小结[:：]/.test(text) ? 1 : 0,
    think: /思考题/.test(text) ? 1 : 0,
    metaWords: metaphors.join("/"),
    metaN, metaDensity: +(metaN / chars * 1000).toFixed(2),
    exWords: examples.join("/"),
    exN, exDensity: +(exN / chars * 1000).toFixed(2),
    calcN: count(text, RE_CALC)
  };
}

/* ---------- 主流程 ---------- */
let files = [];
for (const s of SECTIONS) {
  const d = insideRoot(path.join(ROOT, s));
  if (fs.existsSync(d)) walk(d, files);
}
files = files.filter(fp => {
  const base = path.basename(fp);
  return base !== "index.html" && base !== "404.html";
});

const pages = files.map(analyze);
const knowledge = pages.filter(p => p.type === "knowledge");
const charsArr = knowledge.map(p => p.chars);
const q25 = percentile(charsArr, 0.25), q50 = percentile(charsArr, 0.5), q75 = percentile(charsArr, 0.75);

for (const p of pages) {
  if (p.type === "knowledge") {
    if (p.dynamic) p.detail = "动态渲染页";
    else if (p.chars < q25 * 0.8) p.detail = "偏薄";
    else if (p.chars > q75 * 1.6 || (p.chars > 9000 && p.h2 <= 4)) p.detail = "偏多";
    else p.detail = "适中";
    if (p.avgPara > 260 && p.detail !== "动态渲染页") p.detail += "+段落过长";
  } else {
    p.detail = p.type === "tool" ? (p.chars < 1200 ? "工具页过薄" : "-") : "实验室页";
  }
}

/* ---------- 汇总输出 ---------- */
const line = "-".repeat(96);
console.log(line);
console.log("教学写法评测 · 共 " + pages.length + " 页(知识页 " + knowledge.length + ")");
console.log("知识页字数四分位:Q25=" + q25 + "  Q50=" + q50 + "  Q75=" + q75);
console.log(line);

const bySec = {};
for (const p of pages) {
  const sec = p.file.split("/")[0];
  (bySec[sec] = bySec[sec] || []).push(p);
}
for (const sec of Object.keys(bySec).sort()) {
  const ps = bySec[sec];
  const kn = ps.filter(p => p.type === "knowledge");
  const cs = kn.length ? kn.map(p => p.chars) : ps.map(p => p.chars);
  const withMeta = kn.filter(p => p.metaN > 0).length;
  const withEx = kn.filter(p => p.exN > 0).length;
  const withCalc = kn.filter(p => p.calcN > 0).length;
  console.log(
    sec + "  页数" + ps.length + (kn.length ? "(知识" + kn.length + ")" : "(工具/实验)")
    + " · 字数中位" + percentile(cs, 0.5)
    + " · 比喻页覆盖 " + withMeta + "/" + kn.length
    + " · 实例页覆盖 " + withEx + "/" + kn.length
    + " · 数值算例页 " + withCalc + "/" + kn.length
    + " · 自测题中位 " + percentile(ps.map(p => p.quiz), 0.5)
  );
}

console.log(line);
console.log("【详略失衡清单】");
for (const p of pages.filter(p => /偏多|偏薄|过薄/.test(p.detail))) {
  console.log("  [" + p.detail + "] " + p.file + "  " + p.chars + "字 h2=" + p.h2 + " 段均" + p.avgPara + "句均" + p.avgSentence + " 图" + (p.svg + p.img) + " 表" + p.table);
}

console.log(line);
console.log("【零比喻知识页】(深入浅出待加强,共 " + knowledge.filter(p => p.metaN === 0).length + " 页)");
console.log("  " + knowledge.filter(p => p.metaN === 0).map(p => p.file.split("/").pop().replace(/\.html$/, "")).join(" · "));

console.log(line);
console.log("【零实例知识页】(缺具体例子/算例,共 " + knowledge.filter(p => p.exN === 0).length + " 页)");
console.log("  " + knowledge.filter(p => p.exN === 0).map(p => p.file.split("/").pop().replace(/\.html$/, "")).join(" · ") || "  (无)");

console.log(line);
console.log("【无自测题页】");
for (const p of pages.filter(p => p.quiz === 0)) console.log("  " + p.file + " (" + p.type + ")");
console.log(line);

/* ---------- CSV 底表 ---------- */
let csvPath = null;
const ai = process.argv.indexOf("--csv");
if (ai > 0 && process.argv[ai + 1]) csvPath = insideRoot(process.argv[ai + 1]);
else csvPath = path.join(ROOT, "docs", "审计", "_教学评测底表.csv");

const cols = ["file", "type", "detail", "chars", "jsBytes", "dynamic", "readMin", "h2", "h3", "p", "avgPara", "maxPara", "avgSentence", "pre", "table", "svg", "img", "box", "details", "quiz", "quizExplainAvg", "formula", "keyPoint", "summary", "think", "metaN", "metaDensity", "exN", "exDensity", "calcN", "metaWords", "exWords"];
const rows = pages.map(p => cols.map(c => String(p[c]).replace(/"/g, '""')).join(","));
fs.writeFileSync(csvPath, "\ufeff" + cols.join(",") + "\n" + rows.join("\n") + "\n", "utf8");
console.log("底表已写入: " + path.relative(ROOT, csvPath));
