/* 2026-09-06 恢复被 _renumber_sections.js SEC_RE bug 破坏的 sec 锚点
 * bug:KEYMAP 用带前导零键("06"),而 sec 捕获组无前导零("6")→ sec6~9 → "secundefined",sec10 → "sec08"
 * 恢复:git HEAD 取原始 sec(6|7|8|9|10) 出现序列,按新映射(6→4,7→5,8→6,9→7,10→8)
 *       在工作区文件中按出现顺序重建(工作区中对应形态:secundefined / sec08)。
 * index.html 只处理真实版本区标记之前的区域(与其被改写范围一致)。
 * 用法:node docs/审计/_repair_sec_anchors.js
 */
const fs = require("fs"), path = require("path");
const { execSync } = require("child_process");
const ROOT = path.resolve(__dirname, "..", "..");
const MAP = { "6": "4", "7": "5", "8": "6", "9": "7", "10": "8" };
const VER_MARK = "<!-- ================= 版本与更新历史";

function headPath(rel) {
  const map = [
    ["04_软件与算法/22_通信与控制算法升级路线.html", "04_升级进阶/09_通信与控制算法升级路线.html"],
    ["04_软件与算法/23_全身控制与步态规划_WBC与MPC.html", "04_升级进阶/02_全身控制与步态规划_WBC与MPC.html"],
    ["04_软件与算法/24_整机电气架构与安全设计.html", "04_升级进阶/03_整机电气架构与安全设计.html"],
    ["04_软件与算法/", "06_软件与算法/"],
    ["05_前沿知识库/", "07_前沿知识库/"],
    ["06_学习工具/", "08_学习工具/"],
    ["07_大模型与具身智能/", "09_大模型与具身智能/"],
    ["08_NPU与数字IC设计/", "10_NPU与数字IC设计/"],
    ["03_项目实操/13_HdriveV2工程/", "05_HdriveV2工程/"]
  ];
  for (const [a, b] of map) if (rel.startsWith(a)) return b + rel.slice(a.length);
  return rel;
}

const files = [];
(function walk(d) {
  for (const name of fs.readdirSync(d)) {
    const fp = path.join(d, name);
    let st; try { st = fs.statSync(fp); } catch (e) { continue; }
    if (st.isDirectory()) {
      if (/^(\.git|node_modules|docs|_本地工具|\.agents|\.zcode|\.mimosa|\.v2c|\.video_agent|\.workbuddy|edge_prof|_shared|lib)$/.test(name)) continue;
      walk(fp); continue;
    }
    if (/\.(html|js|xml|txt)$/.test(name) && !/^(sw\.js)$/.test(name)) files.push(fp);
  }
})(ROOT);

let fixed = 0, clean = 0, fail = 0;
for (const fp of files) {
  const rel = path.relative(ROOT, fp).split(path.sep).join("/");
  let work = fs.readFileSync(fp, "utf8");
  const reWork = /sec(?:undefined|08)(?![0-9a-zA-Z])/g;
  if (!reWork.test(work)) { clean++; continue; }
  const hp = headPath(rel);
  let orig;
  try { orig = execSync("git show HEAD:" + JSON.stringify(hp), { cwd: ROOT, maxBuffer: 64e6 }).toString("utf8"); }
  catch (e) { console.log("FAIL 无 HEAD 版本: " + rel); fail++; continue; }
  if (rel === "index.html") {
    const cut = orig.indexOf(VER_MARK);
    if (cut > 0) orig = orig.slice(0, cut);
    const wcut = work.indexOf(VER_MARK);
    if (wcut < 0) { console.log("FAIL 工作区缺版本标记: " + rel); fail++; continue; }
    const wTail = work.slice(wcut);
    work = work.slice(0, wcut);
    /* 重建头部,尾部原样接回 */
    const toks = [...orig.matchAll(/sec(10|9|8|7|6)(?![0-9])/g)].map(m => m[1]);
    let i = 0;
    const out = work.replace(/sec(?:undefined|08)(?![0-9a-zA-Z])/g, () => {
      if (i >= toks.length) throw new Error("token 不足 " + rel);
      return "sec" + MAP[toks[i++]];
    });
    if (i !== toks.length) { console.log("FAIL token 数不符 head=" + i + " orig=" + toks.length + " " + rel); fail++; continue; }
    fs.writeFileSync(fp, out + wTail, "utf8"); fixed++; console.log("FIX  " + rel + " (" + i + " 处)");
    continue;
  }
  const toks = [...orig.matchAll(/sec(10|9|8|7|6)(?![0-9])/g)].map(m => m[1]);
  let i = 0;
  let out;
  try {
    out = work.replace(reWork, () => {
      if (i >= toks.length) throw new Error("0");
      return "sec" + MAP[toks[i++]];
    });
  } catch (e) { console.log("FAIL token 不足: " + rel); fail++; continue; }
  if (i !== toks.length) { console.log("FAIL token 数不符 got=" + i + " want=" + toks.length + " " + rel); fail++; continue; }
  fs.writeFileSync(fp, out, "utf8"); fixed++; console.log("FIX  " + rel + " (" + i + " 处)");
}
console.log("---- 恢复完成:修复 " + fixed + " 文件,无锚点 " + clean + " 文件,失败 " + fail + " ----");
