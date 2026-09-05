# -*- coding: utf-8 -*-
"""第2批代理工作核实脚本"""
import re
from pathlib import Path

ROOT = Path(r"D:\HuaweiMoveData\Users\亓剑清\Desktop\人形机器人关节模组")

checks = [
    ("E 02-04 算例", "02_硬件基础/04_硬件设计通用要点_避坑指南.html", ["数值算例"]),
    ("E 02-08 排错", "02_硬件基础/08_热管理与散热设计专题.html", ["实测验证排错", "温升超预算"]),
    ("E 02-11 worked", "02_硬件基础/11_FOC调参整定实战手册.html", ["完整算例"]),
    ("E 02-14 手算", "02_硬件基础/14_硬件公式计算器矩阵.html", ["手算示例"]),
    ("E 02-15 数值例", "02_硬件基础/15_传感器与关节标定专题.html", ["worked example", "数值"]),
    ("E 02-16 SVG", "02_硬件基础/16_PCB_Layout检查清单.html", ["<svg"]),
    ("E 01-03 误区", "01_理论入门/03_驱动电路模块认知_交互式图解.html", ["常见误区"]),
    ("E 01-06 KaTeX", "01_理论入门/06_控制数学工具箱.html", ["formula"]),
    ("F 06-03 QoS", "06_软件与算法/03_ROS2与机器人软件栈.html", ["QoS"]),
    ("F 06-04 PPO", "06_软件与算法/04_仿真与强化学习_MuJoCo_Isaac.html", ["CLIP", "clip"]),
    ("F 06-07 代码", "06_软件与算法/07_sim2real部署步骤拆解.html", ["randomization", "onnx"]),
    ("F 07-06 算例", "07_前沿知识库/06_灵巧操作与抓取规划.html", ["手算例", "Ferrari"]),
    ("F 07-07 命令", "07_前沿知识库/07_开源整机与仓库深度解析.html", ["git clone"]),
    ("F 07-08 误区", "07_前沿知识库/08_具身智能数据集与评测专题.html", ["常见误区"]),
    ("G 10-01 笔试", "10_NPU与数字IC设计/01_板块总览与学习路线.html", ["笔试"]),
    ("G 10-03 自校验TB", "10_NPU与数字IC设计/03_Verilog语法与状态机设计.html", ["error_count", "自校验"]),
    ("G 10-04 FIFO TB", "10_NPU与数字IC设计/04_FIFO设计与跨时钟域CDC.html", ["testbench", "Testbench"]),
    ("G 10-05 算例", "10_NPU与数字IC设计/05_APB总线协议与接口设计.html", ["MB/s", "带宽"]),
    ("G 10-09 AXI master", "10_NPU与数字IC设计/09_芯片设计流程与AHB_AXI总线.html", ["INCR", "SET_AR"]),
    ("G 10-12 vseq", "10_NPU与数字IC设计/12_SystemVerilog与UVM架构.html", ["virtual sequence", "virtual_sequencer"]),
    ("G 10-13 SVA", "10_NPU与数字IC设计/13_NPU验证项目_环境搭建与覆盖率.html", ["property", "assert"]),
    ("H 08-17 Agent架构", "08_学习工具/17_AI_Agent介绍.html", ["最小架构"]),
]

for name, rel, kws in checks:
    p = ROOT / rel
    try:
        s = p.read_text(encoding="utf-8")
        hits = sum(s.count(k) for k in kws)
        print(f"{'OK ' if hits else 'MISS'} {name}: {hits}")
    except Exception as e:
        print(f"ERR {name}: {e}")

# H quest-data 解析均长
s = (ROOT / "_assets/quest-data.js").read_text(encoding="utf-8")
lens = [len(t) for t in re.findall(r'\be:\s*"((?:[^"\\]|\\.)*)"', s)]
print(f"quest-data: 题数={len(lens)} 解析均长={sum(lens)//max(len(lens),1) if lens else 0}")

# H quiz-bank 弱干扰项替换痕迹
qb = (ROOT / "_assets/quiz-bank.js").read_text(encoding="utf-8")
print(f"quiz-bank: q数={qb.count(chr(113)+chr(58))}")

# H 学习地图 PAGES 条数
m = (ROOT / "08_学习工具/06_学习地图.html").read_text(encoding="utf-8")
print(f"学习地图: 共68页注释出现={m.count('共 68 页')}, u:条目≈{m.count('u:')}")
