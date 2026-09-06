// 图注重编号:按文档顺序 ①②③…,正文交叉引用同步(占位符法)
"use strict";
const fs = require("fs");
const CIRC = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨"];
const jobs = [
  { f: "06_软件与算法/16_现代控制理论_状态空间到MPC.html" },
  { f: "10_NPU与数字IC设计/05_APB总线协议与接口设计.html" },
  { f: "10_NPU与数字IC设计/06_深度学习基础与LeNet实战.html" },
];
for (const job of jobs) {
  let s = fs.readFileSync(job.f, "utf8");
  // 收集文档顺序的旧编号(my-fig-cap/figcaption 内行首图号)
  const oldNums = [];
  const capIdx = [];
  let i = -1;
  while ((i = s.indexOf("my-fig-cap", i + 1)) > 0) {
    const seg = s.slice(i, i + 160);
    const m = seg.match(/my-fig-cap"[^>]*>图\s*([①②③④⑤⑥⑦⑧⑨])/);
    if (m) { oldNums.push(m[1]); capIdx.push(i); }
  }
  if (!oldNums.length) { console.log(job.f, "无需处理"); continue; }
  // 映射:旧编号 → 新编号(按文档顺序)
  const map = {};
  oldNums.forEach((old, k) => { map[old] = CIRC[k]; });
  console.log("=== " + job.f.split("/")[1] + " 映射:", JSON.stringify(map));
  // 占位符置换:图注与正文中「图X」全部按映射替换(先转占位符防打架)
  const uniqOld = [...new Set(oldNums)];
  uniqOld.forEach((old, k) => {
    s = s.split("图" + old).join("图\u24FC" + k);   // ⓼ 形占位(私用区防撞)
  });
  uniqOld.forEach((old, k) => {
    s = s.split("图\u24FC" + k).join("图" + map[old]);
  });
  fs.writeFileSync(job.f, s);
  // 复查:重列文档顺序编号
  let j = -1, seq = [];
  while ((j = s.indexOf("my-fig-cap", j + 1)) > 0) {
    const m = s.slice(j, j + 160).match(/my-fig-cap"[^>]*>图\s*([①②③④⑤⑥⑦⑧⑨])/);
    if (m) seq.push(m[1]);
  }
  console.log("    重编后文档顺序:", seq.join(""));
}
