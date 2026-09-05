# -*- coding: utf-8 -*-
"""修复后全站校验：底表对比 + JS 语法 + HTML 配平 + 路径真实性"""
import re, subprocess, sys
from pathlib import Path
from html.parser import HTMLParser

ROOT = Path(r"D:\HuaweiMoveData\Users\亓剑清\Desktop\人形机器人关节模组")
NODE = r"C:\Users\亓剑清\.workbuddy\binaries\node\versions\22.22.2\node.exe"

def load_base(p):
    rows = []
    for line in Path(p).read_text(encoding="utf-8-sig").splitlines()[1:]:
        c = line.split("\t")
        if len(c) >= 14:
            rows.append({"path": c[0], "table": int(c[6]), "quiz": int(c[7]),
                         "ex": int(c[8]), "exch": int(c[9]), "misuse": int(c[10]),
                         "code": int(c[11]), "debug": int(c[12]), "fig": int(c[13])})
    return rows

old = load_base("docs/审计/_底表_before.csv")
new = load_base("docs/审计/_底表.csv")
print(f"[1] 底表对比  before={len(old)}页 after={len(new)}页")
tot = lambda rs, k: sum(r[k] for r in rs)
for k in ["quiz", "ex", "misuse", "code", "table", "fig"]:
    print(f"    {k:7s}: {tot(old,k):5d} -> {tot(new,k):5d}  ({'+' if tot(new,k)>=tot(old,k) else ''}{tot(new,k)-tot(old,k)})")

# [2] JS 语法
print("[2] JS 语法 node --check")
js = ["site.js", "page-meta.js", "search-index.js", "site-sections.js", "quiz-bank.js",
      "quest-data.js", "ib-data-a.js", "ib-data-b.js", "ib-data-c.js", "srs.js"]
bad = 0
for f in js:
    r = subprocess.run([NODE, "--check", str(ROOT / "_assets" / f)], capture_output=True, text=True)
    if r.returncode:
        print(f"    FAIL {f}: {r.stderr[:200]}")
        bad += 1
print(f"    {len(js)-bad}/{len(js)} 通过")

# [3] HTML 标签配平（本轮修改过的文件）
VOID = {"br", "img", "meta", "link", "input", "hr", "source", "path", "circle", "rect", "line", "text", "use", "stop", "polyline", "polygon", "ellipse"}
class Chk(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.err = [], 0
    def handle_starttag(self, tag, attrs):
        if tag not in VOID: self.stack.append(tag)
    def handle_startendtag(self, tag, attrs): pass
    def handle_endtag(self, tag):
        if tag in VOID: return
        if self.stack and self.stack[-1] == tag: self.stack.pop()
        elif tag in self.stack:
            while self.stack and self.stack[-1] != tag:
                self.stack.pop(); self.err += 1
            if self.stack: self.stack.pop()
        else: self.err += 1

changed = ["03_项目实操/06_本次项目核心_Hdrive融合方案完整指南.html",
 "03_项目实操/07_立创EDA逐模块绘制步骤.html", "03_项目实操/08_完整学习手册_备查用.html",
 "00_3D解剖/人形机器人解剖式知识可视化.html", "06_软件与算法/19_FOC算法完全图解_流程与运行图.html",
 "09_大模型与具身智能/01_大模型基础与MoE架构图解.html", "09_大模型与具身智能/02_DeepSeek架构精讲.html",
 "09_大模型与具身智能/03_强化学习与后训练.html", "09_大模型与具身智能/04_基座选型与开源生态.html",
 "09_大模型与具身智能/05_代码实战_部署微调与Agent.html",
 "06_软件与算法/16_现代控制理论_状态空间到MPC.html", "06_软件与算法/17_状态观测器全解_龙伯格_EKF_SMO.html",
 "06_软件与算法/18_ADRC自抗扰控制与嵌入式实现.html", "04_升级进阶/02_全身控制与步态规划_WBC与MPC.html",
 "04_升级进阶/03_整机电气架构与安全设计.html", "02_硬件基础/04_硬件设计通用要点_避坑指南.html",
 "02_硬件基础/08_热管理与散热设计专题.html", "02_硬件基础/11_FOC调参整定实战手册.html",
 "02_硬件基础/14_硬件公式计算器矩阵.html", "02_硬件基础/15_传感器与关节标定专题.html",
 "02_硬件基础/16_PCB_Layout检查清单.html", "01_理论入门/03_驱动电路模块认知_交互式图解.html",
 "01_理论入门/06_控制数学工具箱.html", "06_软件与算法/03_ROS2与机器人软件栈.html",
 "06_软件与算法/04_仿真与强化学习_MuJoCo_Isaac.html", "06_软件与算法/07_sim2real部署步骤拆解.html",
 "07_前沿知识库/06_灵巧操作与抓取规划.html", "07_前沿知识库/07_开源整机与仓库深度解析.html",
 "07_前沿知识库/08_具身智能数据集与评测专题.html", "10_NPU与数字IC设计/01_板块总览与学习路线.html",
 "10_NPU与数字IC设计/03_Verilog语法与状态机设计.html", "10_NPU与数字IC设计/04_FIFO设计与跨时钟域CDC.html",
 "10_NPU与数字IC设计/05_APB总线协议与接口设计.html", "10_NPU与数字IC设计/09_芯片设计流程与AHB_AXI总线.html",
 "10_NPU与数字IC设计/12_SystemVerilog与UVM架构.html", "10_NPU与数字IC设计/13_NPU验证项目_环境搭建与覆盖率.html",
 "08_学习工具/17_AI_Agent介绍.html", "08_学习工具/06_学习地图.html", "index.html",
 "06_软件与算法/20_FreeRTOS任务调度与实时性.html", "06_软件与算法/21_代码规范_C_Python_Verilog.html",
 "02_硬件基础/17_STM32外设基础_时钟中断DMA_ADC.html"]
print(f"[3] HTML 标签配平（{len(changed)} 个修改文件）")
fail = 0
for rel in changed:
    p = ROOT / rel
    if not p.exists():
        print(f"    MISS 文件不存在: {rel}"); fail += 1; continue
    c = Chk()
    try:
        c.feed(p.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"    ERR 解析失败 {rel}: {e}"); fail += 1; continue
    if c.stack or c.err:
        print(f"    FAIL {rel}: 未闭合={c.stack[:6]} 错配={c.err}")
        fail += 1
print(f"    {len(changed)-fail}/{len(changed)} 配平通过")

# [4] 路径真实性：报告引用 vs 权威清单
listed = {l.split("\t")[2].lstrip("./") for l in (ROOT / "docs/审计/_清单底稿.txt").read_text(encoding="utf-8").splitlines() if l.strip()}
listed |= set(changed)
rep = (ROOT / "docs/审计/知识点评估报告_2026-09-05.md").read_text(encoding="utf-8")
refs = {m.strip("（）() ") for m in re.findall(r"[\w\-/（）()·]+\.html", rep)}
bad_ref = [r for r in refs if r not in listed and not (ROOT / r).exists()]
print(f"[4] 报告引用路径真实性: {len(refs)-len(bad_ref)}/{len(refs)} OK, 异常={bad_ref[:5]}")

# [5] 新页登记一致性
ss = (ROOT / "_assets/site-sections.js").read_text(encoding="utf-8")
for pid in ["02-14", "06-21", "06-22"]:
    print(f"[5] 登记 {pid}: {'OK' if pid in ss else 'MISS'}")
print("校验完成")
