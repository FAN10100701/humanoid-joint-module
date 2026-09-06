/* 2026-09-06 板块文件夹层面并入(04→06、05→03)引用同步脚本
 * 配合 git mv:04_升级进阶/09,02,03 → 06_软件与算法/22,23,24;05_HdriveV2工程 → 03_项目实操/13_HdriveV2工程
 * pageId 重编:04-01→06-23、04-02→06-24、04-03→06-25(打卡进度键随之切换,旧键作废)
 * 每处替换断言出现次数,防漏防多;结尾全站扫描残留引用。
 * 用法:node docs/审计/_merge04x05_refs.js
 */
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const U9 = ["04_升级进阶/09_通信与控制算法升级路线.html", "06_软件与算法/22_通信与控制算法升级路线.html"];
const U2 = ["04_升级进阶/02_全身控制与步态规划_WBC与MPC.html", "06_软件与算法/23_全身控制与步态规划_WBC与MPC.html"];
const U3 = ["04_升级进阶/03_整机电气架构与安全设计.html", "06_软件与算法/24_整机电气架构与安全设计.html"];
const P9 = ["../04_升级进阶/09_通信与控制算法升级路线.html", "../06_软件与算法/22_通信与控制算法升级路线.html"];
const P2 = ["../04_升级进阶/02_全身控制与步态规划_WBC与MPC.html", "../06_软件与算法/23_全身控制与步态规划_WBC与MPC.html"];
const S5A = ["../05_HdriveV2工程/00_设计规范与决策/Hdrive新版方案_交叉认证与芯片选型报告.html", "../03_项目实操/10_Hdrive新版方案_交叉认证与芯片选型报告.html"];
const S5B = ["../05_HdriveV2工程/00_设计规范与决策/电源管理功率链路分析/电源管理功率链路分析.html", "../03_项目实操/11_电源管理功率链路分析/index.html"];

const jobs = [
  { f: "_assets/site-sections.js", pairs: [
    ["ids:[\"04-01\",\"04-02\",\"04-03\",\"06-01\"", "ids:[\"06-01\"", 1],
    ["\"06-21\",\"06-22\"] }", "\"06-21\",\"06-22\",\"06-23\",\"06-24\",\"06-25\"] }", 1]
  ]},
  { f: "_assets/search-index.js", pairs: [
    ["\"" + U9[0] + "\"", "\"" + U9[1] + "\"", 1],
    ["\"" + U2[0] + "\"", "\"" + U2[1] + "\"", 1],
    ["\"" + U3[0] + "\"", "\"" + U3[1] + "\"", 1],
    ["s:\"升级进阶\"", "s:\"软件与算法\"", 3]
  ]},
  { f: "_assets/page-meta.js", pairs: [
    ["\"04-01\": {", "\"06-23\": {", 1],
    ["\"04-02\": {", "\"06-24\": {", 1],
    ["\"04-03\": {", "\"06-25\": {", 1],
    ["prereq:\"03-01 / 04-02\"", "prereq:\"03-01 / 06-24\"", 1],
    ["prereq:\"04-01\"", "prereq:\"06-23\"", 1],
    ["prereq:\"04-01\"", "prereq:\"06-23\"", 0] /* 哨兵:上面应已无残留,此处应为 0 */
  ]},
  { f: "_assets/path-data.js", pairs: [
    ["{ id: \"04-01\", u: \"" + U9[0] + "\" }", "{ id: \"06-23\", u: \"" + U9[1] + "\" }", 1],
    ["{ id: \"04-02\", u: \"" + U2[0] + "\" }", "{ id: \"06-24\", u: \"" + U2[1] + "\" }", 1]
  ]},
  { f: "_assets/ib-data-a.js", pairs: [
    ["'" + P9[0] + "'", "'" + P9[1] + "'", 4],
    ["'" + P2[0] + "'", "'" + P2[1] + "'", 1]
  ]},
  { f: "_assets/ib-data-b.js", pairs: [
    ["'" + P9[0] + "'", "'" + P9[1] + "'", 2]
  ]},
  { f: "sitemap.xml", pairs: [
    ["https://cyco.top/" + U9[0], "https://cyco.top/" + U9[1], 1],
    ["https://cyco.top/" + U2[0], "https://cyco.top/" + U2[1], 1],
    ["https://cyco.top/" + U3[0], "https://cyco.top/" + U3[1], 1]
  ]},
  { f: "docs/收录/百度手动提交URL清单.txt", pairs: [
    ["https://cyco.top/" + U9[0], "https://cyco.top/" + U9[1], 1],
    ["https://cyco.top/" + U2[0], "https://cyco.top/" + U2[1], 1],
    ["https://cyco.top/" + U3[0], "https://cyco.top/" + U3[1], 1]
  ]},
  { f: "index.html", pairs: [
    ["href=\"" + U9[0] + "\"", "href=\"" + U9[1] + "\"", 1],
    ["href=\"" + U2[0] + "\"", "href=\"" + U2[1] + "\"", 1],
    ["href=\"" + U3[0] + "\"", "href=\"" + U3[1] + "\"", 1],
    ["<!-- 04 升级进阶(并入) -->", "<!-- 原 04 升级进阶(并入 06,原 04-01~03 → 06-23~25) -->", 1]
  ]},
  { f: "08_学习工具/01_术语词典.html", pairs: [
    ["href=\"" + P9[0].slice(3) + "\"", "href=\"" + P9[1].slice(3) + "\"", 3]
  ]},
  { f: "08_学习工具/04_代码实验室.html", pairs: [
    ["href=\"" + P9[0].slice(3) + "\"", "href=\"" + P9[1].slice(3) + "\"", 1],
    [">04-01 升级路线<", ">06-23 升级路线<", 1]
  ]},
  { f: "08_学习工具/09_动手项目清单.html", pairs: [
    ["href=\"" + P9[0].slice(3) + "\"", "href=\"" + P9[1].slice(3) + "\"", 1],
    ["href=\"" + P2[0].slice(3) + "\"", "href=\"" + P2[1].slice(3) + "\"", 1],
    [">04-01 通信升级路线<", ">06-23 通信升级路线<", 1],
    [">04-02 WBC/步态<", ">06-24 WBC/步态<", 1]
  ]},
  { f: "06_软件与算法/03_ROS2与机器人软件栈.html", pairs: [
    ["href=\"" + P9[0].slice(3) + "\"", "href=\"" + P9[1].slice(3) + "\"", 2],
    [">04 部分 · 通信与控制算法升级路线<", ">06-23 通信与控制算法升级路线<", 2]
  ]},
  { f: "06_软件与算法/16_现代控制理论_状态空间到MPC.html", pairs: [
    ["href=\"" + P9[0].slice(3) + "\"", "href=\"" + P9[1].slice(3) + "\"", 2],
    [">04-09 通信与控制算法升级路线<", ">06-23 通信与控制算法升级路线<", 1],
    [">04-09 详解<", ">06-23 详解<", 1]
  ]},
  { f: "06_软件与算法/18_ADRC自抗扰控制与嵌入式实现.html", pairs: [
    ["href=\"" + P9[0].slice(3) + "\"", "href=\"" + P9[1].slice(3) + "\"", 2],
    [">04-09 升级路线页<", ">06-23 升级路线页<", 1],
    [">04-09 通信与控制算法升级路线页<", ">06-23 通信与控制算法升级路线页<", 1]
  ]},
  { f: "02_硬件基础/06_硬件原理图与PCB学习页_X1与Hdrive.html", pairs: [
    ["href=\"" + S5A[0] + "\"", "href=\"" + S5A[1] + "\"", 1],
    ["href=\"" + S5B[0] + "\"", "href=\"" + S5B[1] + "\"", 1]
  ]},
  { f: "03_项目实操/12_整机调试实战_步态调参与故障排查.html", pairs: [
    ["与 04_升级进阶/02(WBC 与 MPC 理论页)互补", "与 06_软件与算法/23(原 04-02,WBC 与 MPC 理论页)互补", 1]
  ]},
  { f: "404.html", pairs: [
    ["[\"04_第四部分_升级进阶/\", \"04_升级进阶/\"]",
     "[\"04_第四部分_升级进阶/09_通信与控制算法升级路线.html\", \"06_软件与算法/22_通信与控制算法升级路线.html\"],\n      [\"04_第四部分_升级进阶/02_全身控制与步态规划_WBC与MPC.html\", \"06_软件与算法/23_全身控制与步态规划_WBC与MPC.html\"],\n      [\"04_第四部分_升级进阶/03_整机电气架构与安全设计.html\", \"06_软件与算法/24_整机电气架构与安全设计.html\"],\n      [\"04_升级进阶/09_通信与控制算法升级路线.html\", \"06_软件与算法/22_通信与控制算法升级路线.html\"],\n      [\"04_升级进阶/02_全身控制与步态规划_WBC与MPC.html\", \"06_软件与算法/23_全身控制与步态规划_WBC与MPC.html\"],\n      [\"04_升级进阶/03_整机电气架构与安全设计.html\", \"06_软件与算法/24_整机电气架构与安全设计.html\"],\n      [\"04_第四部分_升级进阶/\", \"06_软件与算法/\"],\n      [\"04_升级进阶/\", \"06_软件与算法/\"]", 1],
    ["[\"05_第五部分_HdriveV2新版工程/\", \"05_HdriveV2工程/\"]",
     "[\"05_HdriveV2工程/00_设计规范与决策/电源管理功率链路分析/电源管理功率链路分析.html\", \"03_项目实操/11_电源管理功率链路分析/index.html\"],\n      [\"05_HdriveV2工程/00_设计规范与决策/Hdrive新版方案_交叉认证与芯片选型报告.html\", \"03_项目实操/10_Hdrive新版方案_交叉认证与芯片选型报告.html\"],\n      [\"05_第五部分_HdriveV2新版工程/\", \"03_项目实操/\"],\n      [\"05_HdriveV2工程/\", \"03_项目实操/\"]", 1]
  ]}
];

let fail = 0, done = 0;
for (const job of jobs) {
  const fp = path.join(ROOT, job.f);
  let s = fs.readFileSync(fp, "utf8");
  for (const [oldS, newS, want] of job.pairs) {
    const n = s.split(oldS).length - 1;
    if (n !== want) { console.log("FAIL " + job.f + " 期望" + want + "处,实际" + n + "处: " + oldS.slice(0, 60)); fail++; continue; }
    if (want > 0) { s = s.split(oldS).join(newS); done += want; }
  }
  fs.writeFileSync(fp, s, "utf8");
  console.log("OK   " + job.f);
}
console.log("---- 替换完成:" + done + " 处,失败 " + fail + " 组 ----");

/* 全站残留扫描(应只剩:历史审计文档、AUDIT/CHANGELOG 历史条目、本脚本) */
const SKIP = /(^|[\\/])(\.git|node_modules|_本地工具|docs[\\/]审计[\\/]_merge04x05_refs\.js|13_HdriveV2工程)([\\/]|$)/;
const hits = [];
(function walk(d) {
  for (const name of fs.readdirSync(d)) {
    if (SKIP.test(name) || name === ".git" || name === "_本地工具") continue;
    const fp = path.join(d, name);
    let st; try { st = fs.statSync(fp); } catch (e) { continue; }
    if (st.isDirectory()) walk(fp);
    else if (/\.(html|js|xml|txt|json|md)$/.test(name)) {
      let t; try { t = fs.readFileSync(fp, "utf8"); } catch (e) { continue; }
      const p = path.relative(ROOT, fp);
      if (/docs[\\/]审计[\\/]/.test(p) || /docs[\\/]维护[\\/]/.test(p)) continue;
      for (const pat of ["04_升级进阶", "05_HdriveV2", "04-01", "04-02", "04-03", "#sec4", "#sec5"]) {
        const c = t.split(pat).length - 1;
        if (c > 0) hits.push(p + " ×" + c + " [" + pat + "]");
      }
    }
  }
})(ROOT);
console.log("---- 残留引用(历史文档/台账正常)----");
console.log(hits.length ? hits.join("\n") : "(无)");
