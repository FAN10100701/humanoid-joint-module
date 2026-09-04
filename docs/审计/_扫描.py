# -*- coding: utf-8 -*-
"""站点知识点全量评估 · 量化底表扫描脚本
输入: docs/审计/_清单底稿.txt (cls\tpath\tsize 三列)
输出: docs/审计/_底表.csv (A/C 类页 8 类标记计数) + docs/审计/_题库统计.txt
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "docs" / "审计"

def scan_page(path: Path):
    """对一个 html 页面做 8 类标记计数，返回 (title, pageId, 8项计数元组)"""
    try:
        s = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        s = path.read_text(encoding="utf-8", errors="replace")
    m = re.search(r"<title>([^<]*)</title>", s)
    title = m.group(1) if m else ""
    m = re.search(r'id:\s*"([^"]*)"', s)
    pid = m.group(1) if m else ""
    formula = len(re.findall(r"katex|\\\(", s))
    table = len(re.findall(r"<table", s))
    quiz = len(re.findall(r"data-answer=", s))
    exn = exch = 0
    for t in re.findall(r'quiz-explain[^>]*>(.*?)</div>', s, re.S):
        txt = re.sub(r"<[^>]*>", "", t)
        txt = re.sub(r"\s", "", txt)
        exn += 1
        exch += len(txt)
    misuse = len(re.findall(r"常见误区|易错|避坑|误区", s))
    code = len(re.findall(r"<pre", s))
    debug = len(re.findall(r"调试|排错|排查|决策树|示波器|断点|gdb|万用表", s))
    fig = len(re.findall(r"<svg|<canvas|<img", s))
    return title, pid, (formula, table, quiz, exn, exch, misuse, code, debug, fig)

def main():
    lines = (OUT_DIR / "_清单底稿.txt").read_text(encoding="utf-8").splitlines()
    rows = []
    for line in lines:
        if not line.strip():
            continue
        cls, nbytes, p = line.split("\t")
        if cls == "B":
            continue  # B 类壳页不扫
        path = ROOT / p.lstrip("./")
        title, pid, stats = scan_page(path)
        rows.append([p.lstrip("./"), nbytes, cls, title, pid] + [str(x) for x in stats])

    header = ["path", "bytes", "cls", "title", "pageId", "公式", "表格", "quiz", "解析数", "解析字数", "误区", "代码", "调试", "图表"]
    (OUT_DIR / "_底表.csv").write_text("\n".join(["\t".join(header)] + ["\t".join(r) for r in rows]), encoding="utf-8-sig")
    print(f"底表完成: {len(rows)} 页")

    # ---------- JS 题库统计 ----------
    out = []
    js_files = ["_assets/quiz-bank.js", "_assets/quest-data.js",
                "_assets/ib-data-a.js", "_assets/ib-data-b.js", "_assets/ib-data-c.js"]
    for rel in js_files:
        path = ROOT / rel
        if not path.exists():
            out.append(f"{rel}\tREAD_FAIL")
            continue
        s = path.read_text(encoding="utf-8")
        qn = len(re.findall(r"\bq:", s))
        ex_lens = [len(re.sub(r"\s", "", t)) for t in re.findall(r'\be:\s*"((?:[^"\\]|\\.)*)"', s)]
        lv = {}
        for m in re.finditer(r"\blv:\s*(\d)", s):
            lv[m.group(1)] = lv.get(m.group(1), 0) + 1
        groups = len(re.findall(r'\bg:\s*"', s))
        avg = sum(ex_lens) // len(ex_lens) if ex_lens else 0
        lv_str = ",".join(f"{k}星={lv[k]}" for k in sorted(lv))
        out.append(f"{rel}\t题数q:{qn}\t解析数:{len(ex_lens)}\t解析均长:{avg}\t分组:{groups}\tlv分布:{lv_str}")
    (OUT_DIR / "_题库统计.txt").write_text("\n".join(out), encoding="utf-8-sig")
    print("题库统计完成")

if __name__ == "__main__":
    sys.exit(main())
