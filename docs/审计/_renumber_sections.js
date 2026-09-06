/* 2026-09-06 板块编号连续化重排:06→04、07→05、08→06、09→07、10→08
 * 配合 git mv:06_软件与算法→04_软件与算法、07_前沿知识库→05_前沿知识库、08_学习工具→06_学习工具、
 *           09_大模型与具身智能→07_大模型与具身智能、10_NPU与数字IC设计→08_NPU与数字IC设计
 * 范围:站点文件(html/js/xml/txt);排除 历史文档(docs/)、本地工具、CHANGELOG/README/AUDIT 等历史文本。
 * index.html 只处理版本板块标记之前的区域(历史条目不改写)。
 * id 形态匹配带前后守卫:排除日期(2026-08-17)与连字号尾部,防误伤。
 * 用法:node docs/审计/_renumber_sections.js          → dry-run,打印全部 id 类匹配上下文
 *      node docs/审计/_renumber_sections.js --apply  → 实际写入
 */
const fs = require("fs"), path = require("path");
const APPLY = process.argv.includes("--apply");
const ROOT = path.resolve(__dirname, "..", "..");

const FOLDERS = [
  ["06_软件与算法", "04_软件与算法"],
  ["07_前沿知识库", "05_前沿知识库"],
  ["08_学习工具", "06_学习工具"],
  ["09_大模型与具身智能", "07_大模型与具身智能"],
  ["10_NPU与数字IC设计", "08_NPU与数字IC设计"]
];
const KEYMAP = { "06": "04", "07": "05", "08": "06", "09": "07", "10": "08" };
/* 单遍映射,杜绝级联误换。后置拒绝集 [0-9\-_A-Za-z%]:
   排除物理量区间误伤(10-60W/10-15V/10-40kHz/±10-20% 等实测样本) */
const ID_RE = /(?<![\d\-])(10|0[6-9])-(\d{2})(?![\d\-_A-Za-z%])/g;
const SEC_RE = /sec(10|9|8|7|6)(?![0-9])/g;
const KEY_RE = /key: ?"(10|0[6-9])"/g;
const NUM_SPAN_RE = /<span class="num">(6|7|8|9|10)<\/span>/g;
const CN_ORD_RE = /第(六|七|八|九|十)部分/g;
const CN_ORD = { "六": "四", "七": "五", "八": "六", "九": "七", "十": "八" };
const LABELS = [
  ["06 软件算法", "04 软件算法"], ["07 前沿知识", "05 前沿知识"],
  ["08 学习工具", "06 学习工具"], ["09 大模型", "07 大模型"],
  ["10 NPU数字IC", "08 NPU数字IC"]
];
const SKIP_DIR = /(^|[\\/])(\.git|node_modules|docs|_本地工具|\.agents|\.zcode|\.mimosa|\.v2c|\.video_agent|\.workbuddy|edge_prof|_shared|lib|assets\\vendor)([\\/]|$)/;
const SKIP_FILE = /^(CHANGELOG\.md|README\.md|AUDIT\.md|AGENTS\.md|CONTRIBUTING\.md|_renumber_sections\.js|_merge04x05_refs\.js|.*\.min\.js)$/;

const files = [];
(function walk(d) {
  for (const name of fs.readdirSync(d)) {
    const fp = path.join(d, name);
    let st; try { st = fs.statSync(fp); } catch (e) { continue; }
    if (st.isDirectory()) { if (!SKIP_DIR.test(name + "/")) walk(fp); continue; }
    if (SKIP_FILE.test(name)) continue;
    /* 00_3D解剖 域自带 sw.js(独立缓存域)不动;根 sw.js 参与改写 */
    if (name === "sw.js" && /00_3D/.test(fp)) continue;
    if (/\.(html|js|xml|txt)$/.test(name)) files.push(fp);
  }
})(ROOT);

const VER_MARK = "<!-- ================= 版本与更新历史";
let idSample = [];
let total = 0;
for (const fp of files) {
  const rel = path.relative(ROOT, fp).split(path.sep).join("/");
  let s = fs.readFileSync(fp, "utf8");
  const before = s;
  if (rel === "index.html") {
    const cut = s.indexOf(VER_MARK);
    if (cut < 0) { console.log("WARN index.html 未找到版本区标记,整文件跳过"); continue; }
    let head = s.slice(0, cut), tail = s.slice(cut);
    head = xform(head, rel, "index[head]");
    s = head + tail;
  } else {
    s = xform(s, rel, "");
  }
  if (s !== before) {
    total++;
    if (APPLY) fs.writeFileSync(fp, s, "utf8");
    console.log((APPLY ? "WROTE " : "WOULD ") + rel);
  }
}
console.log("---- " + (APPLY ? "应用完成,改写 " : "dry-run,将改写 ") + total + " 个文件 ----");

function xform(s, rel, tag) {
  s = (() => {  /* 文件夹路径 */
    for (const [o, n] of FOLDERS) s = s.split(o).join(n);
    return s;
  })();
  s = s.replace(ID_RE, (m, a, b, off) => {
    if (idSample.length < 400) idSample.push(rel + " " + tag + " @" + off + " …" + s.slice(Math.max(0, off - 18), off + 8).replace(/\n/g, " ") + "…");
    return KEYMAP[a] + "-" + b;
  });
  s = s.replace(SEC_RE, (m, a) => "sec" + KEYMAP[a]);
  s = s.replace(KEY_RE, (m, a) => m.replace(a, KEYMAP[a]));
  s = s.replace(NUM_SPAN_RE, (m, a) => '<span class="num">' + KEYMAP[a] + "</span>");
  s = s.replace(CN_ORD_RE, (m, a) => "第" + CN_ORD[a] + "部分");
  for (const [o, n] of LABELS) s = s.split(o).join(n);
  return s;
}
if (!APPLY) {
  console.log("---- id 类匹配样本(前 120 条,供人工审查误伤) ----");
  console.log(idSample.slice(0, 120).join("\n"));
}
