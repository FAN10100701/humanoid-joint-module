#!/usr/bin/env node
/* 一次性补链脚本(去重版):题库互链 V2.1.19 整改 */
"use strict";
const fs = require("fs");
const L = (t, u) => "{t:'" + t + "',u:'" + u + "'}";
const A = "_assets/ib-data-a.js", B = "_assets/ib-data-b.js", C = "_assets/ib-data-c.js";
const JOBS = [
  [A, "xk-13", [["全身控制与步态规划 WBC/MPC", "../04_升级进阶/02_全身控制与步态规划_WBC与MPC.html"]]],
  [B, "ros-01", [["ROS2与机器人软件栈", "../06_软件与算法/03_ROS2与机器人软件栈.html"]]],
  [B, "ros-03", [["仿真与强化学习 MuJoCo/Isaac", "../06_软件与算法/04_仿真与强化学习_MuJoCo_Isaac.html"]]],
  [B, "ros-05", [["ROS2导航 Navigation2实战", "../06_软件与算法/11_ROS2导航_Navigation2实战.html"]]],
  [B, "ros-06", [["ROS2入门实战·第一个节点", "../06_软件与算法/09_ROS2入门实战_第一个节点.html"]]],
  [B, "ros-08", [["视觉SLAM与状态估计", "../06_软件与算法/06_视觉SLAM与状态估计.html"]]],
  [B, "ros-09", [["开源整机与仓库深度解析", "../07_前沿知识库/07_开源整机与仓库深度解析.html"]]],
  [B, "emb-01", [["STM32外设基础·时钟中断DMA/ADC", "../02_硬件基础/17_STM32外设基础_时钟中断DMA_ADC.html"]]],
  [B, "emb-02", [["STM32外设基础·时钟中断DMA/ADC", "../02_硬件基础/17_STM32外设基础_时钟中断DMA_ADC.html"]]],
  [A, "yk-11", [["FOC调参整定实战手册", "../02_硬件基础/11_FOC调参整定实战手册.html"]]],
  [A, "yk-14", [["固件与电机控制 SimpleFOC/ODrive", "../06_软件与算法/02_固件与电机控制_SimpleFOC_ODrive_MotorOS.html"]]],
  [B, "hw-05", [["电池与能源系统专题", "../07_前沿知识库/05_电池与能源系统专题.html"]]],
  [B, "hw-08", [["PCB Layout 检查清单", "../02_硬件基础/16_PCB_Layout检查清单.html"]]],
  [B, "hw-09", [["Hdrive融合方案完整指南", "../03_项目实操/06_本次项目核心_Hdrive融合方案完整指南.html"]]],
  [B, "frt-01", [["FreeRTOS任务调度与实时性", "../06_软件与算法/20_FreeRTOS任务调度与实时性.html"]]],
  [B, "frt-03", [["FreeRTOS任务调度与实时性", "../06_软件与算法/20_FreeRTOS任务调度与实时性.html"]]],
  [B, "c-01", [["代码规范 C/Python/Verilog", "../06_软件与算法/21_代码规范_C_Python_Verilog.html"]]],
  [B, "cpp-01", [["代码规范 C/Python/Verilog", "../06_软件与算法/21_代码规范_C_Python_Verilog.html"]]],
  [B, "llm-06", [["灵巧手专题", "../07_前沿知识库/04_灵巧手专题.html"]]],
  [B, "llm-07", [["仿真与强化学习 MuJoCo/Isaac", "../06_软件与算法/04_仿真与强化学习_MuJoCo_Isaac.html"], ["全球人形机器人机型全景", "../07_前沿知识库/01_全球人形机器人机型全景.html"]]],
  [C, "zs-04", [["Hdrive融合方案完整指南", "../03_项目实操/06_本次项目核心_Hdrive融合方案完整指南.html"], ["个人作品台", "../08_学习工具/14_个人作品台.html"]]],
  [C, "ky-05", [["AI 答疑助手", "../08_学习工具/13_AI答疑助手.html"]]]
];
const files = {};
let okN = 0, skipN = 0;
for (const [file, id, adds] of JOBS) {
  if (!files[file]) files[file] = fs.readFileSync(file, "utf8");
  const s = files[file];
  const idAt = s.indexOf("id:'" + id + "'");
  if (idAt < 0) { console.log("MISS id", id); skipN++; continue; }
  const nextAt = s.indexOf("{ id:'", idAt + 5);
  const chunkEnd = nextAt < 0 ? s.length : nextAt;
  let chunk = s.slice(idAt, chunkEnd);
  if (adds.every(([, u]) => chunk.includes(u))) { console.log("DUP skip", id); skipN++; continue; }
  const newLinks = adds.map(([t, u]) => L(t, u)).join(",");
  const li = chunk.indexOf("links:[");
  if (li >= 0) {
    const close = chunk.indexOf("]", li);
    chunk = chunk.slice(0, close) + "," + newLinks + chunk.slice(close);
  } else {
    const brace = chunk.lastIndexOf("}");
    chunk = chunk.slice(0, brace) + ",\n  links:[" + newLinks + "]" + chunk.slice(brace);
  }
  files[file] = s.slice(0, idAt) + chunk + s.slice(chunkEnd);
  okN++;
}
for (const [f, s] of Object.entries(files)) fs.writeFileSync(f, s);
console.log("links added:", okN, "skipped:", skipN);
