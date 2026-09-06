// 图注顺序与正文交叉引用调查(第二轮)
"use strict";
const fs = require("fs");
const files = [
  "06_软件与算法/16_现代控制理论_状态空间到MPC.html",
  "10_NPU与数字IC设计/05_APB总线协议与接口设计.html",
  "10_NPU与数字IC设计/06_深度学习基础与LeNet实战.html",
];
for (const f of files) {
  const s = fs.readFileSync(f, "utf8");
  console.log("=== " + f.split("/")[1]);
  let i = -1, n = 0;
  while ((i = s.indexOf("my-fig-cap", i + 1)) > 0) {
    const nxt = s.slice(i, i + 140);
    const m = nxt.match(/my-fig-cap"[^>]*>([^<]{4,70})/);
    if (m) { n++; console.log("  " + n + ". " + m[1]); }
  }
  const refs = [...s.matchAll(/如?图\s*([①②③④⑤⑥⑦])/g)].map(m => m[1]);
  console.log("  正文引用图:", refs.join(",") || "(无)");
}
