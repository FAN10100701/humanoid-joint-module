#!/usr/bin/env node
/* 2026-09-06 内容增量轮:给现有题库题目补 links(题数不变,只加站内互链)。
   目标:07/03/08 三板块的题库指向覆盖(ibCover)与练习联动提升。
   每处:定位 id:'xxx' → 其后 follow:[...] 结尾处插入 links(或向已有 links 追加)。
   断言:每题恰好命中一次;改完 eval 复核链接数与文件可解析性。 */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");

/* [file, id, [ {t,u} ... ] ]  追加到该题 links(没有则新建) */
const PLAN = [
  ["ib-data-a.js", "dsp-08", [{ t: "术语词典", u: "../08_学习工具/01_术语词典.html" }]],
  ["ib-data-b.js", "hw-07", [{ t: "立创EDA逐模块绘制步骤", u: "../03_项目实操/07_立创EDA逐模块绘制步骤.html" }]],
  ["ib-data-b.js", "hw-10", [{ t: "交叉认证与芯片选型报告", u: "../03_项目实操/10_Hdrive新版方案_交叉认证与芯片选型报告.html" }]],
  ["ib-data-b.js", "ros-09", [{ t: "动手项目清单", u: "../08_学习工具/09_动手项目清单.html" }]],
  ["ib-data-b.js", "llm-06", [{ t: "前沿技术专题库", u: "../07_前沿知识库/02_前沿技术专题库.html" }]],
  ["ib-data-c.js", "zs-01", [{ t: "大厂面试专题", u: "../08_学习工具/07_大厂面试专题.html" }]],
  ["ib-data-c.js", "zs-05", [{ t: "大厂面试专题", u: "../08_学习工具/07_大厂面试专题.html" }]],
  ["ib-data-c.js", "zs-07", [{ t: "学习路径规划", u: "../08_学习工具/18_学习路径规划.html" }]],
  ["ib-data-c.js", "yy-01", [{ t: "保研英语面试", u: "../08_学习工具/16_保研英语面试.html" }]],
  ["ib-data-c.js", "ky-07", [{ t: "学习地图", u: "../08_学习工具/06_学习地图.html" }]]
];

let fail = 0;
for (const [file, id, add] of PLAN) {
  const fp = path.join(ROOT, "_assets", file);
  let src = fs.readFileSync(fp, "utf8");
  const at = src.indexOf("id:'" + id + "'");
  if (at < 0) { console.log("FAIL 未找到", file, id); fail++; continue; }
  /* 题目对象边界:从 id 起到下一个 "\n\n{ id:'" 或文件尾 */
  const next = src.indexOf("\n\n{ id:'", at);
  const segEnd = next < 0 ? src.length : next;
  const seg = src.slice(at, segEnd);
  const lm = seg.match(/links:\[([^\]]*)\]/);
  let newSeg;
  if (lm) {
    const inner = lm[1].trim();
    const extra = add.map((l) => "{t:'" + l.t + "',u:'" + l.u + "'}").join(",");
    const replaced = "links:[" + (inner ? inner + "," + extra : extra) + "]";
    newSeg = seg.replace(/links:\[[^\]]*\]/, replaced);
  } else {
    const fm = seg.match(/follow:\[[^\]]*\]/);
    if (!fm) { console.log("FAIL 无 follow 可锚定", file, id); fail++; continue; }
    const extra = add.map((l) => "{t:'" + l.t + "',u:'" + l.u + "'}").join(",");
    newSeg = seg.replace(fm[0], fm[0] + ",\n  links:[" + extra + "]");
  }
  if (src.slice(at, segEnd).includes(newSeg) && lm) { console.log("SKIP 已存在", file, id); continue; }
  src = src.slice(0, at) + newSeg + src.slice(segEnd);
  fs.writeFileSync(fp, src);
  console.log("OK", file, id, "→", add.map((l) => l.u).join(","));
}
console.log(fail ? ("失败 " + fail + " 处") : "全部完成");
process.exitCode = fail ? 1 : 0;
