#!/usr/bin/env node
/* 图注补齐脚本:按 aria 片段(或序号)定位 svg,在 </svg> 后插入 my-fig-cap(内联样式兜底) */
"use strict";
const fs = require("fs");
const CAP = (t) => '<div class="my-fig-cap" style="font-size:12.5px;color:#64748b;text-align:center;margin-top:8px;line-height:1.6">' + t + "</div>";
const JOBS = [
  ["00_3D解剖/减速器剖面图详解.html", ["\u0000#0", "\u0000#1", "\u0000#2"], [
    "图 1:谐波减速器剖面——波发生器输入,柔轮受控变形,刚轮固定,减速比大且零背隙",
    "图 2:行星减速器剖面——太阳轮输入,行星轮分流承载,内齿圈固定,结构紧凑",
    "图 3:摆线针轮减速器剖面——偏心轴输入,摆线轮与针齿啮合,多齿同时受力刚度高"]],
  ["01_理论入门/03_驱动电路模块认知_交互式图解.html", ["\u0000#0"], [
    "图:驱动电路核心模块交互认知图——点击各模块查看功能、常见选型与设计要点"]],
  ["02_硬件基础/13_功率级拓扑与SVPWM交互实验室.html", ["\u0000#0"], [
    "图:SVPWM 电压矢量与扇区划分交互实验室——调节 Vα/Vβ 观察矢量合成、扇区切换与三相占空比"]],
  ["04_升级进阶/03_整机电气架构与安全设计.html", ["\u0000#0"], [
    "图:整机电气架构与急停链安全分区交互图——点击各分区查看供电、通信与安全设计要求"]],
  ["08_学习工具/05_传动与控制实验台.html", ["电机-减速器-负载传动链示意"], [
    "图:电机-减速器-负载传动链交互实验台——调整减速比与负载观察转速、扭矩换算"]],
  ["09_大模型与具身智能/02_DeepSeek架构精讲.html", ["MHA vs MLA 缓存对比", "R1管线"], [
    "图 1:MHA 与 MLA 的 KV Cache 占用对比——MLA 只缓存低秩投影,显存显著瘦身",
    "图 2:DeepSeek-R1 推理管线——思考/非思考双模式按需切换"]],
  ["09_大模型与具身智能/03_强化学习与后训练.html", ["PPO vs GRPO", "GRPO 组采样优势示例"], [
    "图 1:PPO 与 GRPO 结构对比——GRPO 去掉价值网络,组内平均做基线",
    "图 2:GRPO 组采样优势计算示例——同一题目采多答,按组内相对优劣定优势"]],
  ["09_大模型与具身智能/04_基座选型与开源生态.html", ["许可光谱", "基座选型决策树"], [
    "图 1:开源许可光谱——从闭源 API 到宽松开源(MIT/Apache)的约束梯度",
    "图 2:基座选型决策树——按部署资源、许可约束与任务需求分流"]],
  ["09_大模型与具身智能/05_代码实战_部署微调与Agent.html", ["显存对比条形图"], [
    "图:不同量化精度与模型规模下的显存占用对比(FP16/INT8/INT4)"]],
  ["10_NPU与数字IC设计/01_板块总览与学习路线.html", ["NPU数字设计四阶段学习路线图"], [
    "图:NPU 数字设计四阶段学习路线——数字基础 → AI 通识 → RTL 项目 → 验证"]],
  ["10_NPU与数字IC设计/08_模型量化与端侧部署.html", ["量化四本账对比图", "量化映射示意图", "PTQ 与 QAT 两条量化流水线对比图", "推理引擎四层栈图"], [
    "图 1:量化四本账——FP32/FP16/INT8 的存储、带宽与能耗对比",
    "图 2:仿射量化映射示意——浮点区间 [r_min, r_max] 线性映射到 UINT8 整数轴",
    "图 3:PTQ 与 QAT 两条量化流水线对比——校准统计 vs 训练中模拟量化",
    "图 4:端侧推理引擎四层栈——模型格式/图优化编译/算子库/运行时"]]
];
let ok = 0, skip = 0;
const files = {};
for (const [file, needles, caps] of JOBS) {
  if (!files[file]) files[file] = fs.readFileSync(file, "utf8");
  let s = files[file];
  needles.forEach((needle, k) => {
    let pos;
    if (needle.startsWith("\u0000#")) {
      const idx = parseInt(needle.slice(2), 10);
      const all = [...s.matchAll(/<svg\b[^>]*>/gi)];
      if (!all[idx]) { console.log("MISS svg", file, idx); skip++; return; }
      pos = all[idx].index;
    } else {
      const m = [...s.matchAll(/<svg\b[^>]*>/gi)].find(x => x[0].includes(needle));
      if (!m) { console.log("MISS aria", file, needle); skip++; return; }
      pos = m.index;
    }
    const close = s.indexOf("</svg>", pos);
    if (close < 0) { console.log("MISS close", file, needle); skip++; return; }
    const insertAt = close + 6;
    s = s.slice(0, insertAt) + CAP(caps[k]) + s.slice(insertAt);
    ok++;
  });
  files[file] = s;
}
for (const [f, s] of Object.entries(files)) fs.writeFileSync(f, s);
console.log("captions inserted:", ok, "skipped:", skip);
