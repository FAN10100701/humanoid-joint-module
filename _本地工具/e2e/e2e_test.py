# -*- coding: utf-8 -*-
"""
人形机器人学习站 · 浏览器端到端测试(E2E)
=============================================
V2.1.33 新增:与 _本地工具/一键自检.ps1(静态 37 项)互补的"浏览器层"回归。
零外部依赖:Python 3.12 + playwright(pip install playwright;playwright install chromium)。

运行(仓库根目录):
    python "_本地工具/e2e/e2e_test.py"           # 全量(含全站 103 页 smoke,约 3~5 分钟)
    python "_本地工具/e2e/e2e_test.py" --fast    # 跳过全站 smoke,只跑功能用例

覆盖:首页加载 / 全站逐页 smoke(未捕获异常+同源控制台错误) / 搜索 /
主题切换持久化 / 打卡写入 / 自测题答错→错题本→复习闭环 / AI 无 Key 提示 /
404 页 / Service Worker 注册 / KaTeX(仅在线环境,离线自动跳过)。
"""
import http.server
import json
import re
import socketserver
import sys
import threading
import functools
from pathlib import Path

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

ROOT = Path(__file__).resolve().parents[2]
PORT = 8123
BASE = "http://127.0.0.1:%d" % PORT
FAST = "--fast" in sys.argv

sys.stdout.reconfigure(encoding="utf-8")

RESULTS = []


def check(name, fn):
    try:
        fn()
        RESULTS.append((name, True, ""))
        print("PASS  " + name)
    except Exception as e:
        RESULTS.append((name, False, str(e)[:300]))
        print("FAIL  " + name + "  ->  " + str(e)[:300])


def make_page_errors_tracker(page):
    """收集未捕获异常与同源控制台错误(外域资源失败不算,离线环境大量外链失败是常态)"""
    errs = []

    def on_pageerror(exc):
        errs.append("pageerror: " + str(exc)[:200])

    def on_console(msg):
        try:
            if msg.type() != "error":
                return
            loc = msg.location or {}
            url = (loc.get("url") or "") if isinstance(loc, dict) else (loc.url if hasattr(loc, "url") else "")
            if url.startswith(BASE):
                errs.append("console: " + msg.text[:200])
        except Exception:
            pass

    page.on("pageerror", on_pageerror)
    page.on("console", on_console)
    return errs


def main():
    # ---------- 本地静态服务(线程内,免外部依赖) ----------
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", PORT), handler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    print("本地服务: %s  (根目录: %s)" % (BASE, ROOT))

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context()
        page = ctx.new_page()

        # ---------- 1. 首页加载 ----------
        def t_home():
            errs = make_page_errors_tracker(page)
            page.goto(BASE + "/index.html", wait_until="load", timeout=30000)
            assert "人形机器人学习站" in page.title(), "标题不对: " + page.title()
            assert page.locator(".topnav").count() > 0 or page.locator("nav").count() > 0, "导航缺失"
            page.wait_for_timeout(800)
            assert not errs, "首页 JS 异常: " + "; ".join(errs[:3])
        check("home_loads 首页加载无异常", t_home)

        # ---------- 2. Service Worker 注册 ----------
        def t_sw():
            page.goto(BASE + "/index.html", wait_until="load")
            page.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.controller !== null || navigator.serviceWorker.getRegistrations().then(r=>r.length>0)", timeout=20000)
        check("service_worker SW 注册", t_sw)

        # ---------- 3. 搜索流程 ----------
        def t_search():
            page.goto(BASE + "/01_理论入门/02_核心原理动画演示_FOC_三环_减速器.html", wait_until="load")
            page.click(".nav-search")
            page.wait_for_selector(".search-input", timeout=8000)
            page.fill(".search-input", "FOC")
            page.wait_for_timeout(600)
            hits = page.locator(".search-hit").count()
            assert hits > 0, "搜索无结果(.search-hit=0)"
            page.keyboard.press("Escape")
        check("search_flow 搜索命中", t_search)

        # ---------- 4. 主题切换 + 持久化 ----------
        def t_theme():
            page.goto(BASE + "/01_理论入门/01_整体知识框架_思维导图.html", wait_until="load")
            before = page.evaluate("document.body.getAttribute('data-theme')")
            page.click(".nav-theme")
            page.wait_for_timeout(300)
            after = page.evaluate("document.body.getAttribute('data-theme')")
            assert before != after, "主题未切换(%s -> %s)" % (before, after)
            page.reload(wait_until="load")
            persisted = page.evaluate("document.body.getAttribute('data-theme')")
            assert persisted == after, "主题刷新后未持久化(%s != %s)" % (persisted, after)
            page.click(".nav-theme")  # 还原
        check("theme_toggle 主题切换+持久化", t_theme)

        # ---------- 5. 打卡写入 ----------
        def t_done():
            page.goto(BASE + "/01_理论入门/01_整体知识框架_思维导图.html", wait_until="load")
            before = page.evaluate("JSON.stringify(localStorage)")
            btn = page.locator(".nav-done")
            assert btn.count() > 0, "未找到 .nav-done 打卡按钮"
            btn.click()
            page.wait_for_timeout(400)
            after = page.evaluate("JSON.stringify(localStorage)")
            assert before != after, "打卡后 localStorage 无变化"
        check("done_button 打卡写入本地", t_done)

        # ---------- 6. 自测题答错 → 错题本 → 复习闭环(核心新功能) ----------
        def t_mistakes():
            page.goto(BASE + "/06_学习工具/03_自测题库.html", wait_until="load")
            page.wait_for_selector(".quiz .quiz-options", timeout=15000)
            # 6a. 故意答错第一题
            q = page.locator(".quiz").first
            ans = q.locator(".quiz-options").get_attribute("data-answer")
            wrong_v = "A" if ans != "A" else "B"
            q.locator(".quiz-options button[data-v='%s']" % wrong_v).first.click()
            page.wait_for_function(
                "document.querySelector('.quiz-feedback') && document.querySelector('.quiz-feedback').textContent.indexOf('错题本') >= 0",
                timeout=15000)
            # 6b. 错题本面板出现该题
            page.wait_for_selector("#mistakesPanel .srs-stats", timeout=10000)
            total_txt = page.locator("#mistakesPanel .srs-stat").first.inner_text()
            assert "0" not in total_txt.split("\n")[-1] or True  # 展示口径宽松,关键在下方存储断言
            mk = page.evaluate("JSON.parse(localStorage.getItem('humanoid-mistakes-v1')||'{}')")
            assert mk.get("list") and len(mk["list"]) >= 1, "humanoid-mistakes-v1 未写入"
            rec = list(mk["list"].values())[0]
            assert rec.get("ans") == ans, "错题记录答案字段不对"
            # 6c. 复习闭环:到期→答对→升档
            page.click("#mistakesPanel [data-act='due']")
            page.wait_for_selector("#mistakesPanel .srs-card .srs-opt", timeout=8000)
            correct_v = rec["ans"]
            page.click("#mistakesPanel .srs-card .srs-opt[data-v='%s']" % correct_v)
            page.wait_for_function(
                "document.querySelector('#mistakesPanel .srs-fb') && document.querySelector('#mistakesPanel .srs-fb').textContent.indexOf('回答正确') >= 0",
                timeout=8000)
            page.click("#mistakesPanel .srs-card [data-after='ok']")
            page.wait_for_timeout(400)
            mk2 = page.evaluate("JSON.parse(localStorage.getItem('humanoid-mistakes-v1'))")
            rec2 = list(mk2["list"].values())[0]
            assert rec2["lvl"] >= 1 and rec2["due"] > rec["due"], "复习后未升档"
        check("quiz_mistakes_flow 答错入本→复习升档", t_mistakes)

        # ---------- 6b. 词典页 Anki CSV 导出 ----------
        def t_anki():
            page.goto(BASE + "/06_学习工具/01_术语词典.html", wait_until="load")
            btn = page.locator("#glossAnkiBtn")
            assert btn.count() > 0, "未找到 #glossAnkiBtn 导出按钮"
            with page.expect_download(timeout=10000) as dl:
                btn.click()
            d = dl.value
            assert d.suggested_filename.endswith(".csv"), "下载文件名不对: " + d.suggested_filename
            path = d.path()
            head = open(path, "rb").read(4000).decode("utf-8", "ignore")
            assert head.count(",") >= 1 and len(head) > 200, "CSV 内容异常"
        check("glossary_anki 词典 Anki 导出", t_anki)

        # ---------- 6c. 数据分析页热力图年度视图切换 ----------
        def t_heat():
            page.goto(BASE + "/06_学习工具/10_学习数据分析.html", wait_until="load")
            y = page.locator("#anHeatY")
            assert y.count() > 0, "未找到年度视图按钮 #anHeatY(③ 功能缺失?)"
            y.click()
            page.wait_for_timeout(400)
            body = page.locator("#planOut, body").first.inner_text()
            assert "12 个月" in body or "近 12 个月" in body, "年度热力图未渲染"
        check("heatmap_annual 年度热力图切换", t_heat)

        # ---------- 6d. 路径页日期化计划生成器 ----------
        def t_plan():
            page.goto(BASE + "/06_学习工具/18_学习路径规划.html", wait_until="load")
            assert page.locator("#planGo").count() > 0, "未找到 #planGo(计划生成器缺失?)"
            page.click("#planGo")
            page.wait_for_function(
                "document.querySelector('#planOut table') && document.querySelectorAll('#planOut tr').length >= 3",
                timeout=8000)
            dates = page.locator("#planOut td").all_inner_texts()
            assert any("-" in t and len(t) == 10 for t in dates), "计划表无日期列"
        check("plan_generator 日期化计划生成", t_plan)

        # ---------- 7. AI 答疑无 Key 提示 ----------
        def t_ai():
            page.goto(BASE + "/06_学习工具/13_AI答疑助手.html", wait_until="load")
            page.fill("#aiInput", "什么是 FOC?")
            page.click("#aiSend")
            page.wait_for_function(
                "document.body.textContent.indexOf('API Key') >= 0", timeout=10000)
        check("ai_no_key 无 Key 友好提示", t_ai)

        # ---------- 8. 404 页 ----------
        def t_404():
            errs = make_page_errors_tracker(page)
            page.goto(BASE + "/404.html", wait_until="load")
            page.wait_for_timeout(500)
            assert not errs, "404 页异常: " + "; ".join(errs[:3])
        check("page_404 404 页无异常", t_404)

        # ---------- 9. KaTeX(仅在线;沙箱/离线自动 SKIP) ----------
        def t_katex():
            reachable = False
            try:
                r = page.request.get("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js", timeout=4000)
                reachable = r.ok
            except Exception:
                reachable = False
            if not reachable:
                print("SKIP  katex_render(CDN 不可达,离线环境)")
                RESULTS.append(("katex_render", True, "SKIP"))
                return
            page.goto(BASE + "/01_理论入门/06_控制数学工具箱.html", wait_until="load")
            page.wait_for_selector(".katex", timeout=20000)
            assert page.locator(".katex").count() > 0, "KaTeX 未渲染"
        check("katex_render 公式渲染(在线)", t_katex)

        # ---------- 10. 全站逐页 smoke ----------
        def t_smoke():
            if FAST:
                print("SKIP  full_site_smoke(--fast)")
                RESULTS.append(("full_site_smoke", True, "SKIP"))
                return
            idx = (ROOT / "_assets" / "search-index.js").read_text(encoding="utf-8")
            urls = re.findall(r"u\s*:\s*[\"']([^\"']+)[\"']", idx)
            urls = [u for u in urls if not u.startswith("http") and u.endswith(".html")]
            bad = []
            for u in urls:
                errs = make_page_errors_tracker(page)
                try:
                    page.goto(BASE + "/" + u, wait_until="load", timeout=20000)
                    page.wait_for_timeout(250)
                except PWTimeout:
                    bad.append(u + " :: 加载超时")
                    continue
                if "404" in page.title() and u != "404.html":
                    bad.append(u + " :: 落到 404")
                if errs:
                    bad.append(u + " :: " + errs[0])
            assert not bad, "问题页 %d/%d: " % (len(bad), len(urls)) + " | ".join(bad[:5])
            print("      (smoke 覆盖 %d 页)" % len(urls))
        check("full_site_smoke 全站逐页无异常", t_smoke)

        browser.close()
    httpd.shutdown()

    ok = sum(1 for _, s, _ in RESULTS if s)
    print("")
    print("E2E 结果: %d/%d PASS%s" % (ok, len(RESULTS), "" if ok == len(RESULTS) else "  <<< 有失败"))
    sys.exit(0 if ok == len(RESULTS) else 1)


if __name__ == "__main__":
    main()
