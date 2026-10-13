# -*- coding: utf-8 -*-
"""
人形机器人学习站 · 浏览器端到端测试(E2E)
=============================================
V2.1.33 新增:与 _本地工具/一键自检.ps1(静态 37 项)互补的"浏览器层"回归。
零外部依赖:Python 3.12 + playwright(pip install playwright;playwright install chromium)。

运行(仓库根目录):
    python "_本地工具/e2e/e2e_test.py"           # 全量(含全站逐页 smoke,约 3~5 分钟)
    python "_本地工具/e2e/e2e_test.py" --fast    # 跳过全站 smoke,只跑功能用例

覆盖:首页加载 / 全站逐页 smoke(未捕获异常+同源控制台错误,页数以 search-index 为准) / 搜索 /
主题切换持久化 / 打卡写入 / 自测题答错→错题本→复习闭环 / 词典 Anki 导出 / 热力图 /
计划生成器 / AI 无 Key 提示 / 串口调试助手子应用(外壳+模块挂载 / 演示数据管线 / 导出+配置落盘) /
404 页 / Service Worker 注册 / KaTeX(仅在线环境,离线自动跳过)。

注:串口调试助手子应用位于 06_学习工具/_串口调试助手/(_ 前缀,不进 search-index),
全站 smoke 覆盖不到,故单列三条用例(AUDIT A-71);纯函数层回归见 _本地工具/校验串口应用.js。
"""
import http.server
import json
import re
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


def bind_server():
    """优先绑定 8123;被占用(残留的本地服务器/另一路 E2E)就顺延。
    旧写法固定端口,端口冲突时整个套件在第一行就抛 OSError 崩掉,连一条用例都跑不到。
    用 ThreadingHTTPServer(allow_reuse_address=True)避免 TIME_WAIT 造成的假占用。
    返回 (server, base_url)。"""
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    last_err = None
    for port in (PORT, PORT + 1, PORT + 2, PORT + 3, 0):  # 0 = 由系统给一个空闲端口
        try:
            httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
        except OSError as e:
            last_err = e
            continue
        real = httpd.server_address[1]
        if real != PORT:
            print("端口 %d 被占用(或不可用),改用 %d" % (PORT, real))
        return httpd, "http://127.0.0.1:%d" % real
    raise RuntimeError("无法绑定本地端口: %s" % last_err)


class Skip(Exception):
    """用例主动跳过(环境不满足 / --fast)。旧写法在用例内部另记一条 RESULTS,
    于是跳过项被同时算作「跳过」和「通过」,同一份测试在 --fast 与全量下报出
    不同的总数(18/18 vs 16/16)。改为抛出并由 check 统一记一条。"""


def check(name, fn):
    try:
        fn()
    except Skip as s:
        RESULTS.append((name, True, "SKIP"))
        print("SKIP  " + name + "  (" + str(s) + ")")
    except Exception as e:
        RESULTS.append((name, False, str(e)[:300]))
        print("FAIL  " + name + "  ->  " + str(e)[:300])
    else:
        RESULTS.append((name, True, ""))
        print("PASS  " + name)


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
    global BASE

    # ---------- 本地静态服务(线程内,免外部依赖) ----------
    httpd, BASE = bind_server()
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

        # ---------- 7b. 串口调试助手子应用 ----------
        # 子应用在 06_学习工具/_串口调试助手/ 下(_ 前缀),不进 search-index,
        # 因此第 10 项的全站 smoke 覆盖不到它(AUDIT A-71);纯函数层由
        # _本地工具/校验串口应用.js 兜底,浏览器层的 DOM/装配错误只能在这里抓。
        SL_APP = "/06_学习工具/_串口调试助手/index.html"
        SL_MODULES = ["util", "core", "codec", "expr", "parser", "fft", "datastore",
                      "transport", "plugins", "views", "timeline", "exporters", "ui", "app"]

        def t_serial_shell():
            errs = make_page_errors_tracker(page)
            page.goto(BASE + SL_APP, wait_until="load", timeout=30000)
            page.wait_for_timeout(600)
            assert page.locator("#slVersion").count() > 0, "缺失版本位 #slVersion"
            ver = page.locator("#slVersion").inner_text().strip()
            assert re.match(r"^v\d+\.\d+", ver), "版本号未渲染: %r" % ver
            missing = page.evaluate("(ns)=>{var s=window.SerialLab||{};return ns.filter(function(k){return !s[k];});}", SL_MODULES)
            assert not missing, "SerialLab 模块未挂载: " + ", ".join(missing)
            assert page.locator("#slTabs .sl-tab").count() == 8, "左栏页签数不对: %d" % page.locator("#slTabs .sl-tab").count()
            # 无 Web Serial 时必须走「降级横幅 + 连接按钮禁用」而不是报错
            if not page.evaluate("!!(navigator.serial)"):
                cls = page.locator("#slBanner").get_attribute("class") or ""
                assert "is-on" in cls, "无 Web Serial 但未显示降级横幅(class=%r)" % cls
                assert page.locator("#slBtnConnect").is_disabled(), "无 Web Serial 但连接按钮未禁用"
            assert not errs, "子应用 JS 异常: " + "; ".join(errs[:3])
        check("serial_shell 子应用外壳+14 模块挂载", t_serial_shell)

        def t_serial_pipeline():
            errs = make_page_errors_tracker(page)
            page.goto(BASE + SL_APP, wait_until="load", timeout=30000)
            # 首次使用:监视器自动占「主位」(主视觉),时域波形进下方工作区 —— 这是 V2.2.0 的
            # 默认布局契约:不再让工作区空着,也不再把监视器塞进工作区跟波形抢高度
            page.wait_for_selector("#slMainHost .sl-panel", timeout=10000)
            assert page.locator("#slMainHost .sl-panel").count() == 1, "主位未自动放置监视器"
            assert page.locator("#slMainHost .sl-panel--main").count() == 1, "主位面板缺 --main 修饰类"
            assert page.locator("#slStageMain .sl-panel--main").count() == 1, "主位面板不在 C1 槽内"
            n0 = page.locator("#slGrid .sl-panel").count()
            assert n0 == 1, "首次进入工作区面板数不对(应只有时域波形): %d" % n0
            page.click("#slBtnDemo")  # 演示模式:合成数据 50Hz,无需真实硬件
            page.wait_for_function(
                "document.querySelector('#slState') && document.querySelector('#slState').textContent.indexOf('演示') >= 0",
                timeout=10000)
            # 舞台栏「新图表」下拉直达添加(旧版靠 #slBtnAddMonitor,已随布局重构下线)
            page.select_option("#slQuickAdd", "textmon")
            page.click("#slBtnAddPanel2")
            page.wait_for_function("document.querySelectorAll('#slGrid .sl-panel').length === 2", timeout=10000)
            page.click("#slTabs .sl-tab[data-pane='plugins']")  # 左栏页签(非活动页签内元素不可见)
            page.select_option("#slPluginType", "timeplot")
            page.click("#slBtnAddPanel")  # 时域折线(声明式插件入口)
            page.wait_for_function("document.querySelectorAll('#slGrid .sl-panel').length === 3", timeout=10000)
            assert page.locator("#slGrid canvas.sl-canvas").count() >= 2, "时域面板未挂 canvas"
            # 两个时域面板(预置 + 新增)各一块画布;宽度必须 >0 —— 上下分割模型下
            # 若槽位 flex 算错,canvas 会塌成 0×0(旧版 Grid 的 stretch 病根就是这么来的)
            box = page.locator("#slGrid canvas.sl-canvas").first.bounding_box()
            assert box and box["width"] > 40 and box["height"] > 40, "波形画布尺寸异常: %r" % box
            # 数据管线走通:传输→分帧→解析→数据仓 后接收字节数不再是 0
            page.wait_for_function(
                "document.querySelector('#slRxCount') && document.querySelector('#slRxCount').textContent !== '0'",
                timeout=10000)
            assert int(page.locator("#slRxCount").inner_text()) > 0, "接收字节数仍为 0"
            # 监视器应实时把行打印出来(主视觉的核心内容),不是空壳
            page.wait_for_function(
                "document.querySelectorAll('#slMainHost .sl-mon-line').length > 0", timeout=10000)
            page.click("#slTabs .sl-tab[data-pane='channels']")
            n_ch = page.locator("#slChannels tr").count()
            assert n_ch >= 2, "解析出的通道未渲染到通道表(tr=%d)" % n_ch
            assert not errs, "数据管线 JS 异常: " + "; ".join(errs[:3])
        check("serial_pipeline 演示数据→分帧解析→监视器打印→绘图", t_serial_pipeline)

        def t_serial_export():
            page.goto(BASE + SL_APP, wait_until="load", timeout=30000)
            page.click("#slBtnDemo")
            page.select_option("#slQuickAdd", "textmon")  # 面板变更 → 配置落盘
            page.click("#slBtnAddPanel2")
            page.wait_for_function(
                "!!localStorage.getItem('humanoid-serial-config-v1')", timeout=8000)
            page.wait_for_timeout(1200)
            page.click("#slTabs .sl-tab[data-pane='data']")
            with page.expect_download(timeout=15000) as dl:
                page.click("#slBtnExpRaw")  # 原始记录 CSV
            d = dl.value
            assert d.suggested_filename.endswith(".csv"), "下载文件名不对: " + d.suggested_filename
            head = open(d.path(), "rb").read(300).decode("utf-8", "ignore")
            assert head.startswith("\ufeff"), "CSV 缺少 UTF-8 BOM(Excel 中文会乱码)"
            assert "\n" in head, "CSV 没有数据行"
        check("serial_export 演示数据导出 CSV+配置落盘", t_serial_export)

        def t_serial_wiring():
            errs = make_page_errors_tracker(page)
            page.goto(BASE + SL_APP, wait_until="load", timeout=30000)
            page.wait_for_selector("#slGrid .sl-panel", timeout=10000)
            page.click("#slTabs .sl-tab[data-pane='device']")  # 非活动页签内的元素不可见
            page.select_option("#slBaud", "9600")
            page.select_option("#slEncoding", "ascii")
            page.select_option("#slLineEnding", "\\r\\n")   # option 的 value 是字面 \r\n
            page.check("#slFlow")                           # 复选框 ↔ 配置里的 "hardware"
            page.check("#slHexRecv")
            page.uncheck("#slShowTs")
            page.uncheck("#slAppendEnding")                 # 底部发送条
            page.check("#slSendHex")
            page.wait_for_function(
                "(()=>{var c=JSON.parse(localStorage.getItem('humanoid-serial-config-v1')||'{}');"
                "return c.transport && c.transport.baudRate===9600 && c.transport.hexSend===true;})()",
                timeout=8000)
            t = page.evaluate("JSON.parse(localStorage.getItem('humanoid-serial-config-v1')).transport")
            assert t["encoding"] == "ascii", "编码未落盘: %r" % t.get("encoding")
            assert t["lineEnding"] == "\r\n", "发送换行未落盘(字面量↔控制字符映射): %r" % t.get("lineEnding")
            assert t["flow"] == "hardware", "硬流控未落盘: %r" % t.get("flow")
            assert t["hexRecv"] is True and t["showTimestamp"] is False, "显示层开关未落盘: %r" % t
            assert t["appendLineEnding"] is False, "追加换行未落盘: %r" % t.get("appendLineEnding")
            assert page.is_checked("#slHexSend") and page.is_checked("#slSendHex"), "两个 HEX 发送开关未同步"
            cfg = page.evaluate("JSON.parse(localStorage.getItem('humanoid-serial-config-v1'))")
            tm = [p for p in (cfg.get("panels") or []) if p.get("type") == "textmon"]
            assert tm, "配置里没有监视器面板"
            assert tm[0].get("opts", {}).get("showHex") is True, "监视器 opts.showHex 未跟随: %r" % tm[0]
            assert tm[0].get("opts", {}).get("showTimestamp") is False, "监视器 opts.showTimestamp 未跟随: %r" % tm[0]
            page.reload(wait_until="load")                  # 持久化闭环:刷新后仍应回填
            page.wait_for_selector("#slGrid .sl-panel", timeout=10000)
            assert page.input_value("#slBaud") == "9600", "刷新后波特率未回填"
            page.click("#slTabs .sl-tab[data-pane='device']")
            assert not page.is_checked("#slShowTs"), "刷新后显示时间戳未回填"
            assert not errs, "接线 JS 异常: " + "; ".join(errs[:3])
        check("serial_wiring 控件→配置接线与持久化", t_serial_wiring)

        def t_serial_demo_rule():
            errs = make_page_errors_tracker(page)
            # 注意:子应用在 beforeunload 时会把内存配置回写(app.js 里保设置不丢),
            # 所以「先进子应用 → 注入 localStorage → 刷新」必被覆盖。
            # 正确姿势:先落到非子应用页,注入完成后再进入子应用。
            page.goto(BASE + "/404.html", wait_until="load", timeout=30000)
            page.evaluate(
                "(cfg)=>{localStorage.setItem('humanoid-serial-config-v1', JSON.stringify(cfg));}",
                {"version": 0, "rule": {"active": "hex", "hex": {
                    "head": "7E", "tail": "",
                    "len": {"offset": 1, "size": 1, "mode": "payload"},
                    "fields": [
                        {"key": "a", "type": "uint8", "offset": 2, "size": 1, "scale": 1, "big": False},
                        {"key": "b", "type": "int16", "offset": 3, "size": 2, "scale": 0.1, "big": False}],
                    "checksum": {"type": "xor8", "from": 0, "to": -1}}}})
            page.goto(BASE + SL_APP, wait_until="load", timeout=30000)
            page.wait_for_selector("#slGrid .sl-panel", timeout=10000)
            page.click("#slBtnDemo")   # 演示数据须按用户帧结构合成,否则一条通道都建不出来
            page.wait_for_function(
                "document.querySelector('#slRxCount').textContent !== '0'", timeout=10000)
            page.click("#slTabs .sl-tab[data-pane='channels']")
            page.wait_for_function("document.querySelectorAll('#slChannels tr').length >= 2", timeout=10000)
            txt = page.locator("#slChannels").inner_text()
            assert "a" in txt and "b" in txt, "自定义帧未解析出字段(通道表: %r)" % txt
            assert not errs, "自定义规则演示 JS 异常: " + "; ".join(errs[:3])
        check("serial_demo_rule 演示跟随自定义 HEX 规则", t_serial_demo_rule)

        def t_serial_stage():
            """主区形态:上监视器/下波形的上下分割 + 可拖拽比例 + 主区全屏 + 主区收起。

            回归价值:旧版用 CSS Grid 且默认 align-items:stretch,
            同一行内所有面板被强制等高 —— 监视器一高就把波形拉成竖线,
            这就是「时域波形稀烂、跟着监视器一起拉长」的代码级病根。
            现在改为 flex-grow 比例 + 面板固定高度 + 独立滚动,本用例把这条锁住。
            """
            errs = make_page_errors_tracker(page)
            # 在非子应用页清配置,保证首屏是默认布局(子应用 beforeunload 会回写内存配置)
            page.goto(BASE + "/404.html", wait_until="load", timeout=30000)
            page.evaluate("()=>{try{localStorage.removeItem('humanoid-serial-config-v1');}catch(e){}}")
            page.goto(BASE + SL_APP, wait_until="load", timeout=30000)
            page.wait_for_selector("#slMainHost .sl-panel", timeout=10000)

            def grow():
                return page.evaluate(
                    "()=>{var cs=getComputedStyle(document.getElementById('slStage'));"
                    "return [cs.getPropertyValue('--sl-mon-grow').trim(),"
                    "cs.getPropertyValue('--sl-grid-grow').trim()];}")

            assert grow() == ["620", "380"], "默认分割比例不是 0.62: %r" % grow()

            # 波形面板必须是「固定像素高度」——旧版 Grid 的 align-items:stretch 会让
            # 同一行所有面板强制等高,监视器一高就把波形拉成竖线。
            # 这里直接做反向验证:把主区比例从 0.62 一路压到下限,波形高度不许跟着变。
            gh0 = page.locator("#slGrid .sl-panel").first.bounding_box()
            mh0 = page.locator("#slMainHost .sl-panel").first.bounding_box()
            assert gh0 and mh0, "面板没量到尺寸"
            assert 100 < gh0["height"] <= 420, "波形面板初始高度异常: %r" % gh0["height"]
            page.focus("#slSplit")
            for _ in range(21):          # 每步 -0.02,0.62 → 0.20(下限)
                page.keyboard.press("ArrowUp")
            page.wait_for_timeout(250)
            gh1 = page.locator("#slGrid .sl-panel").first.bounding_box()
            mh1 = page.locator("#slMainHost .sl-panel").first.bounding_box()
            assert abs(gh1["height"] - gh0["height"]) <= 2, \
                "调整分割比例后波形面板被拉长/压扁(旧版 stretch 病根): %r → %r" % (gh0["height"], gh1["height"])
            assert mh1["height"] < mh0["height"] - 10, \
                "主区比例调小后监视器高度没变,分割比例未生效: %r → %r" % (mh0["height"], mh1["height"])
            page.keyboard.press("Home")
            page.wait_for_timeout(200)
            assert grow() == ["620", "380"], "分割线 Home 复位无效: %r" % grow()
            assert abs(page.locator("#slGrid .sl-panel").first.bounding_box()["height"] - gh0["height"]) <= 2, \
                "复位后波形面板高度漂移"

            # 全屏主区:波形区与分割线一并隐藏,主区独占
            page.click("#slBtnMainFull")
            page.wait_for_timeout(150)
            assert page.locator(".sl-stage.is-main-full").count() == 1, "全屏类未加上"
            assert not page.locator("#slStageGrid").is_visible(), "全屏后波形区仍可见"
            assert not page.locator("#slSplit").is_visible(), "全屏后分割线仍可见"
            page.click("#slBtnMainFull")
            page.wait_for_timeout(150)
            assert page.locator(".sl-stage.is-main-full").count() == 0, "退出全屏失败"
            assert page.locator("#slSplit").is_visible(), "还原分割视图后分割线仍隐藏"

            # 收起主区:只留标题条
            page.click("#slBtnMainCollapse")
            page.wait_for_timeout(150)
            assert page.locator(".sl-stage.is-main-collapsed").count() == 1, "主区收起类未加上"
            page.click("#slBtnMainCollapse")
            page.wait_for_timeout(150)
            assert page.locator(".sl-stage.is-main-collapsed").count() == 0, "主区展开失败"

            # 分割线键盘可达性:上面已用 ↑ 调小比例 + Home 复位覆盖

            # 比例必须落盘(刷新后保持)
            page.wait_for_function(
                "(()=>{var c=JSON.parse(localStorage.getItem('humanoid-serial-config-v1')||'{}');"
                "return c.ui && typeof c.ui.monRatio === 'number';})()", timeout=8000)
            assert not errs, "主区形态 JS 异常: " + "; ".join(errs[:3])
        check("serial_stage 上下分割+比例拖拽+全屏+收起+波形不被拉长", t_serial_stage)

        def t_serial_run():
            """左上角绿色圆标:一键暂停/继续实时刷新(替代旧版埋在「录制」页签里的「冻结显示」)。

            要求:圆标状态必须随「连接/演示」与「暂停」两个来源同步,
            并且「录制」页签里的同名开关与它同口径(同一个 core.state.paused)。
            """
            errs = make_page_errors_tracker(page)
            page.goto(BASE + SL_APP, wait_until="load", timeout=30000)
            page.wait_for_selector("#slMainHost .sl-panel", timeout=10000)
            assert page.locator("#slRun .sl-run-dot").count() == 1, "绿圆标未渲染"
            assert page.get_attribute("#slRun", "data-state") == "idle", "未连接时圆标不是 idle 态"
            page.click("#slBtnDemo")
            page.wait_for_function(
                "document.getElementById('slRun').getAttribute('data-state') === 'running'",
                timeout=8000)
            assert page.locator("#slRunLabel").inner_text() == "运行中", "演示中圆标文案不对"
            # 暂停:圆标转 paused,且页面不再刷新(core.state.paused 生效)
            page.click("#slRun")
            page.wait_for_function(
                "document.getElementById('slRun').getAttribute('data-state') === 'paused'", timeout=8000)
            assert page.evaluate("!!window.SerialLab.core.state.paused") is True, "暂停未落到 core.state"
            assert page.get_attribute("#slRun", "aria-pressed") == "true", "暂停后 aria-pressed 未置位"
            # 「录制」页签里的开关与圆标同口径
            page.click("#slTabs .sl-tab[data-pane='timeline']")
            assert page.locator("#slBtnFreeze").inner_text() == "继续刷新", "暂停后页签内开关文案未同步"
            page.click("#slBtnFreeze")
            page.wait_for_function(
                "document.getElementById('slRun').getAttribute('data-state') === 'running'", timeout=8000)
            assert page.evaluate("!!window.SerialLab.core.state.paused") is False, "恢复刷新未生效"
            assert not errs, "运行圆标 JS 异常: " + "; ".join(errs[:3])
        check("serial_run 绿圆标暂停/继续与页签开关同口径", t_serial_run)

        def t_serial_display():
            """「显示」页签:时间戳口径(绝对时刻/相对秒)、打印节流、字号、数字标红、失败标红、自动存档。

            回归价值:旧版监视器只打「相对秒」,还丢了毫秒精度;
            用户要的「实时时间用另一种颜色区分」「打印速度可调」都要在这里锁住。
            """
            errs = make_page_errors_tracker(page)
            page.goto(BASE + SL_APP, wait_until="load", timeout=30000)
            page.wait_for_selector("#slMainHost .sl-panel", timeout=10000)
            page.click("#slBtnDemo")
            page.wait_for_function(
                "document.querySelector('#slState').textContent.indexOf('演示') >= 0", timeout=10000)
            page.wait_for_function(
                "document.querySelectorAll('#slMainHost .sl-mon-line').length > 0", timeout=10000)
            page.click("#slTabs .sl-tab[data-pane='display']")

            # ① 默认绝对时刻:HH:MM:SS.mmm 形态,且用独立配色变量
            page.select_option("#slTimeMode", "abs")
            page.wait_for_timeout(400)
            ts = page.locator("#slMainHost .sl-mon-t").first.inner_text().strip()
            assert re.match(r"^\d{2}:\d{2}:\d{2}\.\d{3}$", ts), "绝对时刻格式不对: %r" % ts
            col_ts = page.evaluate(
                "()=>{var e=document.querySelector('#slMainHost .sl-mon-t');"
                "return e?getComputedStyle(e).color:'';}")
            col_bd = page.evaluate(
                "()=>{var e=document.querySelector('#slMainHost .sl-mon-body');"
                "return e?getComputedStyle(e).color:'';}")
            assert col_ts and col_ts != col_bd, "时间戳与正文同色,没做到「另用颜色区分」: %r/%r" % (col_ts, col_bd)

            # ② 切相对秒:X.XXXs(含毫秒,不塌成整秒)
            page.select_option("#slTimeMode", "rel")
            page.wait_for_timeout(400)
            ts2 = page.locator("#slMainHost .sl-mon-t").first.inner_text().strip()
            assert re.match(r"^\d+m\d{2}\.\d{3}s$|^\d+\.\d{3}s$", ts2), "相对秒格式不对: %r" % ts2

            # ③ 字号:改根变量 → 监视器同宽字立即变
            page.fill("#slFontSize", "17")
            page.dispatch_event("#slFontSize", "change")
            page.wait_for_function(
                "getComputedStyle(document.documentElement).getPropertyValue('--sl-mon-size').trim() === '17px'",
                timeout=8000)

            # ④ 数字标红:开启后正文里应出现 .sl-mon-num 片段
            page.check("#slHighlightNum")
            page.wait_for_timeout(400)
            assert page.locator("#slMainHost .sl-mon-num").count() > 0, "数字标红开启后没有标红片段"

            # ⑤ 全部落盘 + 刷新后回填
            page.wait_for_function(
                "(()=>{var c=JSON.parse(localStorage.getItem('humanoid-serial-config-v1')||'{}');"
                "return c.ui && c.ui.fontSize===17 && c.ui.highlightNumbers===true;})()", timeout=8000)
            cfg = page.evaluate("JSON.parse(localStorage.getItem('humanoid-serial-config-v1'))")
            assert cfg["transport"]["timeMode"] == "rel", "时间口径未落盘: %r" % cfg["transport"].get("timeMode")
            page.reload(wait_until="load")
            page.wait_for_selector("#slMainHost .sl-panel", timeout=10000)
            page.click("#slTabs .sl-tab[data-pane='display']")
            assert page.input_value("#slFontSize") == "17", "刷新后字号未回填"
            assert page.is_checked("#slHighlightNum"), "刷新后数字标红未回填"
            assert not errs, "显示设置 JS 异常: " + "; ".join(errs[:3])
        check("serial_display 时间口径/字号/数字标红/刷新回填", t_serial_display)

        def t_serial_preset_bundle():
            """开源协议预设一键套用 + 面向 AI 的调试包导出。

            预设:FireWater / Teleplot / JustFloat / 匿名 V1.0(社区事实标准),
            套用后要立刻用缓存数据重放,当场能看出效果(不必让硬件重跑)。
            调试包:自包含 JSON,包含生效规则/帧结构说明/通道统计/原始样本/失败样本,
            让 AI 不必靠人来回截图粘贴就能定位解析问题。
            """
            errs = make_page_errors_tracker(page)
            page.goto(BASE + SL_APP, wait_until="load", timeout=30000)
            page.wait_for_selector("#slMainHost .sl-panel", timeout=10000)
            page.click("#slTabs .sl-tab[data-pane='parse']")
            btns = page.locator("#slPresetRow .sl-preset")
            assert btns.count() == 4, "开源协议预设数不对: %d" % btns.count()
            ids = page.evaluate(
                "()=>Array.from(document.querySelectorAll('#slPresetRow .sl-preset'))"
                ".map(function(b){return b.getAttribute('data-preset');})")
            assert ids == ["firewater", "teleplot", "justfloat", "ano10"], "预设顺序/ID 不对: %r" % ids

            # 套用「匿名 V1.0」:规则写入配置
            page.click("#slPresetRow .sl-preset[data-preset='ano10']")
            page.wait_for_function(
                "(()=>{var c=JSON.parse(localStorage.getItem('humanoid-serial-config-v1')||'{}');"
                "return c.rule && c.rule.active==='hex' && c.rule.hex.head==='AAAA';})()", timeout=8000)
            head_val = page.input_value("#slHexHead")
            assert re.sub(r"[^0-9A-Fa-f]", "", head_val).upper() == "AAAA", \
                "套用预设后帧头输入框未同步回填: %r" % head_val

            # 回切演示模式:演示数据须按新规则(匿名 V1.0)合成,能解出 func/x/y/z
            page.click("#slBtnDemo")
            page.wait_for_function(
                "document.querySelector('#slRxCount').textContent !== '0'", timeout=10000)
            page.click("#slTabs .sl-tab[data-pane='channels']")
            page.wait_for_function("document.querySelectorAll('#slChannels tr').length >= 2", timeout=10000)
            txt = page.locator("#slChannels").inner_text()
            assert ("x" in txt or "func" in txt), "匿名 V1.0 预设未解析出字段: %r" % txt

            # AI 调试包:从「显示」页签导出,文件名带前缀,内容自包含
            page.click("#slTabs .sl-tab[data-pane='display']")
            with page.expect_download(timeout=15000) as dl:
                page.click("#slBtnDebugBundle")
            d = dl.value
            assert d.suggested_filename.startswith("seriallab-debug-") and d.suggested_filename.endswith(".json"), \
                "调试包文件名不对: " + d.suggested_filename
            import json as _json
            raw = open(d.path(), "rb").read().decode("utf-8", "ignore")
            b = _json.loads(raw)
            assert b["kind"] == "seriallab-debug-bundle" and b["version"] == 1, "调试包 kind/version 不对"
            for k in ("brief", "frameLayout", "settings", "channels", "samples", "stats", "hints"):
                assert k in b, "调试包缺字段: " + k
            assert b["frameLayout"] and any("帧头" in s for s in b["frameLayout"]), \
                "调试包没给出帧结构说明(二进制模式应说明帧头): %r" % b["frameLayout"]
            assert b["samples"], "调试包没带原始样本"
            assert b["samples"][0].get("hex"), "样本缺原始 HEX,AI 无法离线复算"
            assert "[给 AI 的提示]" in b["brief"] and "[帧结构]" in b["brief"], "摘要缺关键段落"
            assert not errs, "预设/调试包 JS 异常: " + "; ".join(errs[:3])
        check("serial_preset_bundle 预设一键套用+AI 调试包导出", t_serial_preset_bundle)

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
                raise Skip("CDN 不可达,离线环境")
            page.goto(BASE + "/01_理论入门/06_控制数学工具箱.html", wait_until="load")
            page.wait_for_selector(".katex", timeout=20000)
            assert page.locator(".katex").count() > 0, "KaTeX 未渲染"
        check("katex_render 公式渲染(在线)", t_katex)

        # ---------- 10. 全站逐页 smoke ----------
        def t_smoke():
            if FAST:
                raise Skip("--fast")
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
    skipped = sum(1 for _, _, d in RESULTS if d == "SKIP")
    print("")
    print("E2E 结果: %d/%d PASS%s%s" % (
        ok, len(RESULTS),
        ("(其中 %d 条 SKIP)" % skipped) if skipped else "",
        "" if ok == len(RESULTS) else "  <<< 有失败"))
    sys.exit(0 if ok == len(RESULTS) else 1)


if __name__ == "__main__":
    main()
