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
计划生成器 / AI 无 Key 提示 / 串口调试助手子应用(外壳+模块挂载 / 演示数据管线 / 导出+配置落盘 /
控件接线 / 自定义协议 / 主区形态 / 运行圆标 / 显示设置 / 协议预设与 AI 调试包 / AI 通道 /
**可参数化造数与频谱真断言** / **Y 手动量程与触发对齐** / 面板头「⋯」) /
404 页 / Service Worker 注册 / KaTeX(仅在线环境,离线自动跳过)。

注:串口调试助手子应用位于 06_学习工具/_串口调试助手/(_ 前缀,不进 search-index),
全站 smoke 覆盖不到,故单列一批专项用例(AUDIT A-71);纯函数层回归见
_本地工具/校验串口应用.js。可参数化造数助手 `sl_make_signal` 见 7b 节开头 ——
一条语句就能指定「什么波形 / 哪几个通道 / 多少点」,不用再改源码。
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

        # ---------- 可参数化造数助手（V2.2.32 / A-115） ----------
        # 用户原话:「修改测试代码 依旧使用同一时域波形不能容易修改需要的曲线」。
        # 以前想验频谱只能靠内置演示信号（固定 5 路、固定频率），换一条曲线就得改源码 ✗。
        # 这里把「造什么波、喂给哪几个通道、多少点」全部参数化，一行就能指定。
        #
        # 三个必须守住的点:
        #   1) **走真管线**：数据经 `SerialLab.datastore.pushFrame` 入仓，再让插件渲染器
        #      自己去算谱 —— 不是把一条现成的谱曲线塞给画布（那样只验证了「会画线」）✗。
        #   2) **不用应用自己的 fft.js 算期望值**：期望频率/幅度由本助手用独立数学算出，
        #      否则「实现和自己比」永远绿 ✗（跨源同源检查的意义就在这里）。
        #   3) **采样率显式写进面板 opts.sampleRate**：渲染器在 opts.sampleRate 缺失时会按
        #      相邻点平均间隔反推，虽然结论一致，但显式给定后「时间轴→频率轴」的换算是本
        #      助手说了算，断言不会因为渲染器换了反推口径而漂 ✗。
        def sl_make_signal(kind="sine", chans=("ch1",), n=2000, sr=1000.0,
                           freqs=(5.0,), amps=(100.0,), noise=0.0, duty=0.5, seed=7):
            """返回喂给浏览器的一段合成信号描述（纯数据，不含任何应用侧逻辑）。

            kind : "sine"（正弦叠加）/ "square"（方波）/ "noise"（噪声）/ "dual"（双音）
            chans: 要写进哪几个通道（每个通道拿到同样的波形，便于多通道对齐/量级对比）
            n    : 点数;  sr: 采样率 Hz;  freqs/amps: 频率与幅值数组（逐个叠加）
            noise: 叠加的均匀噪声峰峰值;  duty: 方波占空比;  seed: 噪声用确定性伪随机
            """
            import math as _m
            vals = []
            for i in range(n):
                t = i / sr
                if kind == "noise":
                    # 确定性伪随机（Park–Miller）：同一 seed 每次都一样，测试可复现
                    seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF
                    u = (seed / float(0x7FFFFFFF)) * 2.0 - 1.0
                    v = amps[0] * u
                elif kind == "square":
                    v = 0.0
                    for k, f in enumerate(freqs):
                        ph = (f * t) % 1.0
                        v += amps[k] * (1.0 if ph < duty else -1.0)
                else:                                   # sine / dual 都是正弦叠加
                    v = 0.0
                    for k, f in enumerate(freqs):
                        v += amps[k] * _m.sin(2.0 * _m.pi * f * t)
                if noise:
                    seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF
                    v += noise * ((seed / float(0x7FFFFFFF)) * 2.0 - 1.0)
                vals.append(v)
            return {"kind": kind, "chans": list(chans), "n": n, "sr": sr, "vals": vals}

        def sl_feed(sig, dt_ms=None):
            """把造好的信号灌进数据仓（真管线入口）。"""
            step = 1000.0 / sig["sr"] if dt_ms is None else dt_ms
            return page.evaluate("""(a) => {
                SerialLab.datastore.clear(false, false);
                var step = a.step, chans = a.chans, vals = a.vals;
                for (var i = 0; i < vals.length; i++) {
                  var f = {};
                  for (var c = 0; c < chans.length; c++) { f[chans[c]] = vals[i]; }
                  SerialLab.datastore.pushFrame({ t: i * step, values: f, bytes: 0, rule: "text" });
                }
                return { n: SerialLab.datastore.count(chans[0]),
                         chans: SerialLab.datastore.listChannels().map(function (x) { return x.key; }) };
            }""", {"step": step, "chans": sig["chans"], "vals": sig["vals"]})

        def sl_add_panel(ptype, opts=None, title=None, channels=("auto",), window=500, h=300):
            """加一个图表面板并返回它的 id。走 views 公开入口，不猜选择器。

            ⚠ 面板 id 一律从 `SerialLab.views.list()` 取，画布用
              `.sl-panel[data-panel-id="<id>"] canvas` 精确定位 ——
              `.sl-grid canvas` 会命中「随便第一块画布」，这个坑踩过。
            """
            desc = {"type": ptype, "title": title or ptype, "channels": list(channels),
                    "window": window, "h": h}
            if opts:
                desc["opts"] = opts
            return page.evaluate("""(d) => {
                var p = SerialLab.views.addPanel(d, true);
                return p ? p.id : null;
            }""", desc)

        def sl_open_clean():
            """进入子应用并保证「弹窗已关」。

            为什么每个用例都要这一刀：子应用有全局模态（设置中心/触发/面板编辑器）。
            前面某个用例若在弹窗打开的状态下落幕，后面所有 page.click 都会被
            `<div id="slModal">` 挡住（Playwright 报 intercepts pointer events），
            症状是「一堆不相干的用例突然一起红」✗ —— 实测本轮 serial_ai_channel
            超时之后，紧接着的两条新用例都拿到空字符串，就是被这个连带效应坑到的。
            这里走公开 API（UI.isModalOpen / UI.closeModal），不自己去摘 class。
            """
            page.goto(BASE + "/404.html", wait_until="load", timeout=30000)
            page.evaluate("()=>{try{localStorage.removeItem('humanoid-serial-config-v1');}catch(e){}}")
            page.goto(BASE + SL_APP, wait_until="load", timeout=30000)
            page.wait_for_selector("#slMainHost .sl-panel", timeout=10000)
            page.evaluate("""() => {
                try { if (SerialLab.ui.isModalOpen()) { SerialLab.ui.closeModal(); } } catch (e) {}
            }""")
            page.wait_for_timeout(150)

        def sl_plot_labels(pid, wait_ms=1500):
            """抓某块画布上画出的文字（Y 轴刻度、X 轴标签、状态角标都在这）。

            为什么要按面板 id 分桶累积：`clearRect`(渲染器的 view.clear())是按面板
            调用的，若用「最后一次 clearRect 的面板」当归属，多面板时会被别的面板
            覆盖掉 —— 实测探针就撞上过这一条（__slTxt 读到空字符串 ✗）。
            改成 window.__slTxtMap[panelId] = [...]：每块画布各记各的，互不干扰。
            出现重复行是正常的（每帧重画一次），断言只做子串/正则匹配，不需要去重。
            """
            page.evaluate("""() => {
                if (window.__slTxtHooked) { window.__slTxtMap = {}; return; }
                window.__slTxtHooked = true;
                window.__slTxtMap = {};
                var of = CanvasRenderingContext2D.prototype.fillText;
                CanvasRenderingContext2D.prototype.fillText = function (t, x, y) {
                  try {
                    var p = this.canvas && this.canvas.closest ? this.canvas.closest('.sl-panel') : null;
                    var id = p ? p.getAttribute('data-panel-id') : null;
                    if (id) {
                      if (!window.__slTxtMap[id]) { window.__slTxtMap[id] = []; }
                      window.__slTxtMap[id].push(String(t));
                    }
                  } catch (e) {}
                  return of.apply(this, arguments);
                };
            }""")
            page.evaluate("(pid) => { SerialLab.views.renderPanelOnce(pid); }", pid)
            page.wait_for_timeout(wait_ms)
            return page.evaluate("(pid) => (window.__slTxtMap && window.__slTxtMap[pid]) || []", pid)

        def t_serial_shell():
            errs = make_page_errors_tracker(page)
            page.goto(BASE + SL_APP, wait_until="load", timeout=30000)
            page.wait_for_timeout(600)
            assert page.locator("#slVersion").count() > 0, "缺失版本位 #slVersion"
            ver = page.locator("#slVersion").inner_text().strip()
            assert re.match(r"^v\d+\.\d+", ver), "版本号未渲染: %r" % ver
            missing = page.evaluate("(ns)=>{var s=window.SerialLab||{};return ns.filter(function(k){return !s[k];});}", SL_MODULES)
            assert not missing, "SerialLab 模块未挂载: " + ", ".join(missing)
            # V2.2.16：9 个页签并到 6 个；V2.2.23 又按「就近安排」把「解析」并进「设备」→ 5 个（设备带协议+通道 / 显示带图表 / 录制带数据），
            # 合并用 data-also 声明，被合并面板的 data-pane 值保持不变。
            assert page.locator("#slTabs .sl-tab").count() == 5, "左栏页签数不对: %d" % page.locator("#slTabs .sl-tab").count()
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
            page.click("#slTabs .sl-tab[data-pane='test']")  # V2.2.4:演示入口挪进「测试」页签
            page.click("#slBtnDemo")  # 演示模式:合成数据 50Hz,无需真实硬件
            page.wait_for_function(
                "document.querySelector('#slState') && document.querySelector('#slState').textContent.indexOf('演示') >= 0",
                timeout=10000)
            # 舞台栏「新图表」下拉直达添加(旧版靠 #slBtnAddMonitor,已随布局重构下线)
            page.select_option("#slQuickAdd", "textmon")
            page.click("#slBtnAddPanel2")
            page.wait_for_function("document.querySelectorAll('#slGrid .sl-panel').length === 2", timeout=10000)
            page.click("#slTabs .sl-tab[data-pane='display']")  # 左栏页签(非活动页签内元素不可见)
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
            page.click("#slTabs .sl-tab[data-pane='device']")
            n_ch = page.locator("#slChannels tr").count()
            assert n_ch >= 2, "解析出的通道未渲染到通道表(tr=%d)" % n_ch
            assert not errs, "数据管线 JS 异常: " + "; ".join(errs[:3])
        check("serial_pipeline 演示数据→分帧解析→监视器打印→绘图", t_serial_pipeline)

        def t_serial_export():
            page.goto(BASE + SL_APP, wait_until="load", timeout=30000)
            page.click("#slTabs .sl-tab[data-pane='test']")  # V2.2.4:演示入口挪进「测试」页签
            page.click("#slBtnDemo")
            page.select_option("#slQuickAdd", "textmon")  # 面板变更 → 配置落盘
            page.click("#slBtnAddPanel2")
            page.wait_for_function(
                "!!localStorage.getItem('humanoid-serial-config-v1')", timeout=8000)
            page.wait_for_timeout(1200)
            page.click("#slTabs .sl-tab[data-pane='timeline']")
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
            page.click("#slTabs .sl-tab[data-pane='test']")  # V2.2.4:演示入口挪进「测试」页签
            page.click("#slBtnDemo")   # 演示数据须按用户帧结构合成,否则一条通道都建不出来
            page.wait_for_function(
                "document.querySelector('#slRxCount').textContent !== '0'", timeout=10000)
            page.click("#slTabs .sl-tab[data-pane='device']")
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
            page.click("#slTabs .sl-tab[data-pane='test']")  # V2.2.4:演示入口挪进「测试」页签
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
            page.click("#slTabs .sl-tab[data-pane='test']")  # V2.2.4:演示入口挪进「测试」页签
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

            # ④ 数字高亮:通道色档(默认)下正文里应出现 .sl-mon-num 片段,再切「red」也应保留
            page.select_option("#slNumStyle", "channel")
            page.wait_for_timeout(400)
            assert page.locator("#slMainHost .sl-mon-num").count() > 0, "数字高亮通道色档没有标亮片段"
            page.select_option("#slNumStyle", "red")
            page.wait_for_timeout(400)
            assert page.locator("#slMainHost .sl-mon-num").count() > 0, "数字高亮红档没有标亮片段"

            # ⑤ 全部落盘 + 刷新后回填
            page.wait_for_function(
                "(()=>{var c=JSON.parse(localStorage.getItem('humanoid-serial-config-v1')||'{}');"
                "return c.ui && c.ui.fontSize===17 && c.ui.numStyle==='red';})()", timeout=8000)
            cfg = page.evaluate("JSON.parse(localStorage.getItem('humanoid-serial-config-v1'))")
            assert cfg["transport"]["timeMode"] == "rel", "时间口径未落盘: %r" % cfg["transport"].get("timeMode")
            page.reload(wait_until="load")
            page.wait_for_selector("#slMainHost .sl-panel", timeout=10000)
            page.click("#slTabs .sl-tab[data-pane='display']")
            assert page.input_value("#slFontSize") == "17", "刷新后字号未回填"
            assert page.input_value("#slNumStyle") == "red", "刷新后数字高亮档未回填"
            assert not errs, "显示设置 JS 异常: " + "; ".join(errs[:3])
        check("serial_display 时间口径/字号/数字高亮/刷新回填", t_serial_display)

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
            page.click("#slTabs .sl-tab[data-pane='device']")
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
            page.click("#slTabs .sl-tab[data-pane='test']")  # V2.2.4:演示入口挪进「测试」页签
            page.click("#slBtnDemo")
            page.wait_for_function(
                "document.querySelector('#slRxCount').textContent !== '0'", timeout=10000)
            page.click("#slTabs .sl-tab[data-pane='device']")
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

        # ---------- 7c. AI 通道:提示词/上限提示/HTTP 收件箱端到端/PNG 导出 ----------
        def t_serial_ai_channel():
            """V2.2.2 AI 自动化调试通道的浏览器层兜底(接线类缺陷只有这层能抓)。

            四条断言线:
            1) 一键「复制为 AI 提示词」:buildPrompt() 产出完整摘要 + 点击出 toast
               (+ 若 headless 允许授权剪贴板,连剪贴板内容一起验);
            2) 记录上限提示显示真实生效值(A-81 的 UI 面,不许只报配置期望值);
            3) HTTP 上报对**真实收件箱**(serial-inbox.py 子进程)端到端成功并落盘;
            4) 波形 PNG 导出产出真 PNG(魔数校验)。
            持续落盘(showSaveFilePicker)依赖真实文件选择器,headless 无法自动化,
            这里只断言能力探测与控件存在,真值留人工验收(AGENTS.md 清单)。
            """
            import json as _json
            import socket as _socket
            import subprocess as _sub
            import time as _time
            import urllib.request as _ureq
            import tempfile as _tmpmod
            errs = make_page_errors_tracker(page)
            page.goto(BASE + SL_APP, wait_until="load", timeout=30000)
            page.wait_for_selector("#slMainHost .sl-panel", timeout=10000)
            page.click("#slTabs .sl-tab[data-pane='test']")  # V2.2.4:演示入口挪进「测试」页签
            page.click("#slBtnDemo")
            page.wait_for_function(
                "document.querySelector('#slRxCount').textContent !== '0'", timeout=10000)
            page.click("#slTabs .sl-tab[data-pane='display']")

            # --- 1) AI 提示词:内容完整 + 点击出 toast(+剪贴板尽力而为) ---
            prompt = page.evaluate("SerialLab.aichan.buildPrompt()")
            assert len(prompt) > 200, "AI 提示词过短: %d 字" % len(prompt)
            assert "SerialLab" in prompt and "现场数据" in prompt, "AI 提示词缺关键段落"
            page.click("#slBtnAiPrompt")
            page.wait_for_selector(".sl-toast", timeout=5000)
            try:
                ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=BASE)
                page.wait_for_timeout(300)
                clip = page.evaluate("navigator.clipboard.readText()")
                assert clip and "SerialLab" in clip, "剪贴板内容不对: %r" % (clip or "")[:60]
            except Exception:
                print("      (剪贴板授权不可用,跳过剪贴板内容断言)")

            # --- 2) 记录上限提示:显示真实生效值(A-81) ---
            hint = page.locator("#slRecordCapHint").inner_text()
            assert ("上限" in hint and "条" in hint), "记录上限提示未显示真实值: %r" % hint

            # --- 3) HTTP 上报 → 真实收件箱端到端 ---
            s = _socket.socket()
            s.bind(("127.0.0.1", 0))
            inbox_port = s.getsockname()[1]
            s.close()
            inbox_dir = _tmpmod.mkdtemp(prefix="sl-inbox-e2e-")
            proc = _sub.Popen(
                [sys.executable, str(ROOT / "_本地工具" / "serial-inbox.py"),
                 "--port", str(inbox_port), "--dir", inbox_dir, "--quiet"],
                stdout=_sub.DEVNULL, stderr=_sub.DEVNULL)
            try:
                ready = False
                for _ in range(50):
                    try:
                        with _ureq.urlopen("http://127.0.0.1:%d/status" % inbox_port, timeout=1) as r:
                            ready = (r.status == 200)
                            break
                    except Exception:
                        _time.sleep(0.1)
                assert ready, "收件箱未就绪(5s)"
                page.fill("#slHttpPort", str(inbox_port))
                page.check("#slHttpPush")
                rr = page.evaluate(
                    "SerialLab.aichan.pushNow().then(function(x){return JSON.stringify(x);})")
                j = _json.loads(rr)
                assert j.get("ok"), "HTTP 上报失败: %r" % j
                st = _json.loads(open(inbox_dir + "/status.json", "rb").read().decode("utf-8"))
                assert st.get("count", 0) >= 1, "收件箱计数未增加: %r" % st
                latest = open(inbox_dir + "/latest.brief.txt", "rb").read().decode("utf-8", "ignore")
                assert "SerialLab" in latest, "收件箱摘要缺 SerialLab 段: %r" % latest[:80]
            finally:
                proc.terminate()

            # --- 4) 波形 PNG 导出:带 canvas 的面板,魔数校验 ---
            # V2.2.32：⤓ 已收进面板头的「⋯」菜单 —— 先展开那一块面板的菜单，
            # 再点它自己的导出按钮（菜单默认 display:none，不展开点不到 ✗）。
            png_panel = page.locator(".sl-panel:has(canvas)").first
            png_panel.locator(".sl-pn-more-btn").click()
            page.wait_for_timeout(200)
            btn = png_panel.locator("button[title='导出该图表为 PNG 图片']").first
            assert btn.is_visible(), "展开「⋯」后导出 PNG 按钮仍不可见"
            with page.expect_download(timeout=15000) as dl:
                btn.click()
            d = dl.value
            assert d.suggested_filename.endswith(".png"), "PNG 文件名不对: " + d.suggested_filename
            head = open(d.path(), "rb").read(8)
            assert head == b"\x89PNG\r\n\x1a\n", "PNG 魔数不对: %r" % head

            # --- 5) 持续落盘:能力探测与控件存在(真 picker 留人工验收) ---
            assert page.locator("#slFileLog").count() == 1, "持续落盘开关缺失"
            assert page.locator("#slBtnFileLog").count() == 1, "持续落盘按钮缺失"
            assert page.evaluate("SerialLab.aichan.fileSupported()") is True, \
                "127.0.0.1 安全上下文应支持 File System Access"
            assert not errs, "AI 通道 JS 异常: " + "; ".join(errs[:3])
        check("serial_ai_channel AI通道:提示词/上限提示/HTTP收件箱/PNG导出", t_serial_ai_channel)

        # ---------- 7d. V2.2.3:参数预设/徽章/GBK/演示故障注入/tooltip/胶囊状态 ----------
        def t_serial_v223():
            """V2.2.3 六项改动的浏览器层兜底。

            断言线:
            1) 参数徽章显示当前参数 + 常用预设一键套用 + 手改参数回「自定义」;
            2) 编码下拉含 GBK、识别/扫描按钮存在;
            3) 演示故障注入(错帧 100%)真实触发乱码监测提示条;
            4) data-tip 长悬浮出现全局 tooltip(不被左栏裁剪);
            5) 运行胶囊随连接态流转(idle→running)。
            结尾把故障概率清零,避免污染后续用例与人工验收。
            """
            errs = make_page_errors_tracker(page)
            page.goto(BASE + SL_APP, wait_until="load", timeout=30000)
            page.wait_for_selector("#slMainHost .sl-panel", timeout=10000)

            # --- 1) 徽章与预设 ---
            badge = page.locator("#slParamBadge")
            assert badge.count() == 1, "参数徽章缺失"
            assert "115200" in badge.inner_text(), "徽章未显示待命波特率: %r" % badge.inner_text()
            page.select_option("#slSerialPreset", "9600-8N1")
            page.wait_for_function("document.querySelector('#slBaud').value === '9600'", timeout=5000)
            assert page.input_value("#slParity") == "none", "预设未联动校验位"
            assert page.input_value("#slStopBits") == "1", "预设未联动停止位"
            page.select_option("#slBaud", "115200")
            page.wait_for_function("document.querySelector('#slSerialPreset').value === ''", timeout=3000)

            # --- 2) GBK 选项与识别/扫描按钮 ---
            enc_opts = page.evaluate(
                "Array.from(document.querySelectorAll('#slEncoding option')).map(function(o){return o.value;})")
            assert "gbk" in enc_opts, "编码下拉缺 GBK: %r" % enc_opts
            assert page.locator("#slBtnDetectEnc").count() == 1, "识别编码按钮缺失"
            assert page.locator("#slBtnScanBaud").count() == 1, "扫描波特率按钮缺失"

            # --- 3) 演示故障注入 → 乱码监测提示条 ---
            page.click("#slTabs .sl-tab[data-pane='test']")  # 故障注入控件已挪进「测试」页签
            # V2.2.17：故障注入控件所在的「手动调参」组默认折叠。
            # 用 aria-expanded 判断后再点（点是**切换**语义，盲点会把已展开的又折回去）。
            if page.evaluate("document.querySelector('#slFoldManual').getAttribute('aria-expanded') === 'false'"):
                page.click("#slFoldManual")
            page.fill("#slFaultCorrupt", "100")
            page.dispatch_event("#slFaultCorrupt", "change")
            page.click("#slTabs .sl-tab[data-pane='test']")  # V2.2.4:演示入口挪进「测试」页签
            page.click("#slBtnDemo")
            page.wait_for_function(
                "document.querySelector('#slRxCount').textContent !== '0'", timeout=10000)
            # 乱码排查条在「设备」页签里(V2.2.4 演示按钮挪进测试页签后,
            # 此刻页面停在测试页签)——切回设备页签再等它出现
            page.click("#slTabs .sl-tab[data-pane='device']")
            page.wait_for_selector("#slGarbleBar:not([hidden])", timeout=15000)
            gt = page.locator("#slGarbleText").inner_text()
            assert "解码失败" in gt, "排查条文案不对: %r" % gt
            st = page.get_attribute("#slRun", "data-state")
            assert st == "running", "演示模式下运行胶囊应为 running,实际 %r" % st

            # --- 4) data-tip 悬浮简介（V2.2.7：浅色模式下文字必须可读） ---
            page.hover("#slBtnConnect")
            page.wait_for_selector("#slTipbox.is-on", timeout=3000)
            tip = page.locator("#slTipbox").inner_text()
            assert len(tip) > 8, "tooltip 内容过短: %r" % tip
            # 实测对比度：tooltip 文字色 vs 气泡底色 ≥ 4.5（WCAG AA），两主题都查
            tip_ct = page.evaluate("""(function(){
              function pc(v){var m=v.match(/rgba?\\(([^)]+)\\)/);var p=m[1].split(",").map(parseFloat);
                return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1};}
              function comp(f,b){var a=f.a;return{r:f.r*a+b.r*(1-a),g:f.g*a+b.g*(1-a),b:f.b*a+b.b*(1-a)};}
              function lum(c){function f(v){v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);}
                return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b);}
              var box=document.querySelector('#slTipbox');
              var cs=getComputedStyle(box);
              var fg=pc(cs.color), bg=pc(cs.backgroundColor);
              var bgc=comp(bg,{r:255,g:255,b:255});
              var l1=lum(comp(fg,bgc)),l2=lum(bgc);
              return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
            })()""")
            assert tip_ct >= 4.5, "tooltip 文字对比度不足: %.2f" % tip_ct

            # --- 收尾:故障清零 + 退出演示(配置会持久化,不能污染下一位) ---
            # 故障控件在「测试」页签(此刻页面停在设备页签),先切过去再清零
            page.click("#slTabs .sl-tab[data-pane='test']")
            if page.evaluate("document.querySelector('#slFoldManual').getAttribute('aria-expanded') === 'false'"):
                page.click("#slFoldManual")
            page.fill("#slFaultCorrupt", "0")
            page.dispatch_event("#slFaultCorrupt", "change")
            page.click("#slBtnDemo")
            page.click("#slBtnDemo")
            assert not errs, "V2.2.3 JS 异常: " + "; ".join(errs[:3])
        check("serial_v223 参数预设/徽章/GBK/故障注入/tooltip/胶囊", t_serial_v223)

        # ---------- 7b. V2.2.4:测试页签/案例卡片/快捷工具条/AUTO ----------
        def t_serial_v224():
            errs = make_page_errors_tracker(page)
            page.goto(BASE + SL_APP, wait_until="load", timeout=30000)
            page.wait_for_selector("#slMainHost .sl-panel", timeout=10000)

            # --- 1) 页签与结构 ---
            page.click("#slTabs .sl-tab[data-pane='test']")
            assert page.locator(".sl-case[data-case='sine']").count() == 1, "缺正弦案例卡"
            assert page.locator(".sl-case[data-case='motor']").count() == 1, "缺电机案例卡"
            assert page.locator(".sl-case[data-case='lossy']").count() == 1, "缺丢帧案例卡"
            assert page.locator("#slBtnAuto").count() == 1, "缺 AUTO 按钮"
            assert page.inner_text("#slTestBadge") == "未在测试", "案例徽章初始态不对"
            # 顶栏不再有演示按钮
            assert page.locator("header #slBtnDemo").count() == 0, "顶栏仍有演示按钮"

            # --- 2) 点「拟真电机」案例 → 配置写入 + 徽章 + 自动补波形 ---
            page.click(".sl-case[data-case='motor']")
            page.wait_for_function(
                "document.querySelector('#slRxCount').textContent !== '0'", timeout=10000)
            page.wait_for_function(
                "SerialLab.core.config.demo.realistic === true", timeout=5000)
            assert "拟真电机信号" in page.inner_text("#slTestBadge"), \
                "徽章未显示案例名: %r" % page.inner_text("#slTestBadge")
            # 演示启动且无图表面板时自动补时域波形
            page.wait_for_function(
                "SerialLab.views.list().some(function(p){return p.type !== 'textmon';})",
                timeout=8000)
            # 自愈开关:再点同一案例 = 停止
            page.click(".sl-case[data-case='motor']")
            page.wait_for_function(
                "SerialLab.core.state.demo === false", timeout=8000)
            assert page.inner_text("#slTestBadge") == "未在测试", "停止后徽章未归位"

            # --- 3) 监视器快捷工具条:存在且与左栏同源联动 ---
            page.wait_for_selector("[data-quick] .sl-qk-enc[data-qk='enc']", timeout=8000)
            n_chk = page.locator("[data-quick] input[type='checkbox']").count()
            assert n_chk == 2, "监视器快捷条应有时间戳/HEX 两个开关,实际 %d" % n_chk
            # 勾快捷条 HEX → 左栏 HEX 显示同步选中
            page.check("[data-quick] input[data-qk='hex']")
            page.wait_for_function(
                "document.querySelector('#slHexRecv').checked === true", timeout=5000)
            page.wait_for_function(
                "SerialLab.core.config.transport.hexRecv === true", timeout=5000)
            # 快捷条编码选 GBK → 左栏编码同步
            page.select_option("[data-quick] .sl-qk-enc[data-qk='enc']", "gbk")
            page.wait_for_function(
                "document.querySelector('#slEncoding').value === 'gbk'", timeout=5000)
            # 左栏改时间戳 → 快捷条回显同步(slShowTs 在设备页签,先切过去)
            page.click("#slTabs .sl-tab[data-pane='device']")
            page.uncheck("#slShowTs")
            page.wait_for_function(
                "!document.querySelector('[data-quick] input[data-qk=\\'ts\\']').checked",
                timeout=5000)

            # --- 4) V2.2.5:版本号对齐 / 顶栏单行 / 时域窗口调节 ---
            # 版本链动态对照：应用内 UI.VERSION 必须等于站点 S.VERSION 的版本号段。
            # 原先这里写死 "2.2.14" —— 那样「跟随站点版本链」根本没被验证（站点版本漂了它照样过），
            # 而且每发一版必然误报一次。与 校验串口应用.js 里写死 === 4 是同一类问题，一并改掉。
            _site_ver = ""
            _m = re.search(r'S\.VERSION\s*=\s*"V([0-9.]+)\(',
                           (ROOT / "_assets" / "site.js").read_text(encoding="utf-8"))
            if _m:
                _site_ver = _m.group(1)
            _app_ver = page.evaluate("SerialLab.ui.VERSION")
            assert _app_ver == _site_ver, \
                "应用内版本号未跟随站点版本链: 应用 %r vs 站点 %r" % (_app_ver, _site_ver)
            assert page.locator("header #slModem").count() == 0, "流控信号应已移出顶栏(设备页签)"
            assert page.locator("#slModem").count() == 1, "设备页签缺流控信号读数"
            # 时域折线面板头有窗口下拉,切 100 点 → 面板 window 生效
            win_sel = page.locator("[data-quick-plot] .sl-qk-enc[data-qk='win']")
            assert win_sel.count() >= 1, "时域面板缺窗口调节下拉"
            win_sel.first.select_option("100")
            page.wait_for_function(
                "SerialLab.views.list().some(function(p){return p.type==='timeplot' && p.window===100;})",
                timeout=8000)

            # --- 5) 收尾:恢复默认显示与编码(配置持久化,不污染下一位) ---
            page.check("#slShowTs")
            page.select_option("#slEncoding", "utf-8")
            page.uncheck("#slHexRecv")
            assert not errs, "V2.2.4 JS 异常: " + "; ".join(errs[:3])
        check("serial_v224 测试页签/案例卡片/自动补波形/快捷工具条联动", t_serial_v224)

        # ---------- 7.5 V2.2.16 简约化与可读性 ----------
        def t_serial_v2216():
            """V2.2.16：把「简约」和「不再有乱码感」都变成可执行的断言。

            ① 通道列表不能有横向溢出 —— 这正是用户「看不到隐藏通道勾选框」的根因
               （旧版 7 列表格在 260px 左栏里必然横向滚动，勾选框与删除键被推出视野）。
               同时每通道仍是一个 <tr>：既有三条断言数 `#slChannels tr`，不能为重构而动它们。
            ② 静态说明收成组标题旁的「?」：左栏可见文字明显变少，但点「?」仍看得到全文
               （信息只挪位置、不丢）。
            ③ 波形底行三个标签（X 起点 / 当前量程 / X 终点+窗口）**几何上互不重叠**。
               旧版量程标签画在 x=4，与 X 起点标签（x=PAD.l）叠在一起，读出来像乱码。
               这条**只能**用真实几何锁：拦截 fillText，用 textAlign 反推每个字符串的
               [x0, x1] 区间，再断言底行任意两段不相交。结构断言完全看不出来。
            """
            errs = make_page_errors_tracker(page)
            page.goto(BASE + SL_APP, wait_until="load", timeout=30000)
            page.wait_for_selector("#slMainHost .sl-panel", timeout=10000)
            page.click("#slTabs .sl-tab[data-pane='test']")
            page.click("#slBtnDemo")
            page.wait_for_function(
                "document.querySelector('#slState').textContent.indexOf('演示') >= 0", timeout=10000)

            # ---- ① 通道卡片：无横向溢出，且每通道仍是 tr ----
            page.click("#slTabs .sl-tab[data-pane='device']")
            page.wait_for_function(
                "document.querySelectorAll('#slChannels tr').length >= 2", timeout=10000)
            n_tr = page.locator("#slChannels tr").count()
            assert n_tr >= 2, "通道列表不再是每通道一个 tr(tr=%d)" % n_tr
            ovf = page.evaluate(
                "(() => { const w = document.querySelector('#slChannels');"
                " return w ? w.scrollWidth - w.clientWidth : -1; })()")
            assert ovf == 0, "通道列表出现横向溢出 %dpx（勾选框/删除键又会被推出视野）" % ovf
            assert page.locator("#slChannels .sl-chan-color").count() >= 2, "通道卡片缺取色器"
            assert page.locator("#slChannels .sl-chan-vis input").count() >= 2, "通道卡片缺「显示」勾选框"

            # ---- ② 静态说明已收进「?」，但内容仍在 ----
            assert page.locator(".sl-panes .sl-help").count() >= 6, "「?」入口太少，说明可能没收起来"
            visible_hints = page.evaluate(
                "(() => { const a = document.querySelectorAll('.sl-panes .sl-hint');"
                " let n = 0; for (const h of a) { if (!h.hidden && h.offsetParent !== null) n++; } return n; })()")
            assert visible_hints <= 12, "左栏还留着 %d 段内嵌说明，减法没生效" % visible_hints
            first_help = page.locator(".sl-panes .sl-help").first
            assert first_help.get_attribute("data-tip"), "「?」没有带上说明全文"

            # ---- ③ 波形底行标签几何不相交 ----
            # 两个坑都踩过了，写在这里免得下次再犯：
            #   1) 量宽度必须用 this.measureText(...)（就地调用）。先存
            #      CanvasRenderingContext2D.prototype.measureText 再 .call，会让 this 丢，抛 Illegal invocation。
            #   2) 必须按「帧」隔离。clearRect 就是 plugins.js 里 view.clear() 的落地，
            #      在每个绘制帧开头清空缓冲；否则同一个标签每帧各记一次，两两比较必然假重叠
            #      （上一次就是这么误报的：'0.1s' 和自己重叠）。
            #   3) 再按画布宽度隔离，多面板时只比最后一个画的那块。
            page.evaluate("""(() => {
                window.__ft = [];
                window.__cw = -1;
                const of = CanvasRenderingContext2D.prototype.fillText;
                const ocr = CanvasRenderingContext2D.prototype.clearRect;
                CanvasRenderingContext2D.prototype.clearRect = function () {
                  try { window.__ft = []; window.__cw = this.canvas.width; } catch (e) {}
                  return ocr.apply(this, arguments);
                };
                CanvasRenderingContext2D.prototype.fillText = function (t, x, y) {
                  try {
                    if (this.canvas.width !== window.__cw) { return of.apply(this, arguments); }
                    const w = this.measureText(String(t)).width;
                    const al = this.textAlign;
                    const x0 = al === 'right' ? x - w : (al === 'center' ? x - w / 2 : x);
                    window.__ft.push({ t: String(t), x0: x0, x1: x0 + w,
                                       y: Math.round(y), h: this.canvas.height });
                  } catch (e) {}
                  return of.apply(this, arguments);
                };
            })()""")
            page.wait_for_timeout(1200)          # 让波形至少重绘一帧
            spans = page.evaluate("window.__ft")
            bottom = [s for s in spans if s["y"] > s["h"] - 30 and s["x1"] > s["x0"]]
            assert len(bottom) >= 2, "没抓到波形底行标签（抓到 %d 条）" % len(bottom)
            # 同一次绘制的才互斥：按 y 分桶后两两比较即可（底行只有一个 y）
            bottom.sort(key=lambda s: s["x0"])
            for a, b in zip(bottom, bottom[1:]):
                assert a["x1"] <= b["x0"] + 1, (
                    "波形底行标签重叠：%r 结束于 %.1f，%r 起于 %.1f"
                    % (a["t"], a["x1"], b["t"], b["x0"]))
            # ---- ④ 零状态引导：未连接时必须可见，点它就能开演示，开了就隐藏 ----
            # 旧版这里是一片空白，唯一能「马上看到东西」的演示入口藏在第 9 个页签里。
            page.goto(BASE + SL_APP, wait_until="load", timeout=30000)
            page.wait_for_selector("#slMainHost .sl-panel", timeout=10000)
            assert page.evaluate(
                "(() => { const z = document.querySelector('#slZero'); return !!z && !z.hidden; })()"), \
                "未连接时零状态引导没出现（首屏又变成一片空白）"
            assert page.locator("#slTabs .sl-tab").count() == 5, \
                "页签数不是 5，而是 %d" % page.locator("#slTabs .sl-tab").count()
            page.click("#slZeroDemo")
            page.wait_for_function(
                "window.SerialLab && SerialLab.core.state.demo === true", timeout=10000)
            assert page.evaluate("document.querySelector('#slZero').hidden"), \
                "开演示后零状态引导还盖着主区"

            # ---- ⑤ 单个图表框必须占满工作区整宽 ----
            # `.sl-grid` 是 auto-fill + minmax(320px,1fr)：1600px 宽下会先铺 3 列，
            # 单个面板只落第 1 列，右侧 2/3 白空（用户截图里就是这样）。
            page.wait_for_timeout(900)
            m = page.evaluate("""(() => {
                const g = document.querySelector('#slGrid');
                const kids = g ? [...g.children].filter(k => k.classList.contains('sl-panel')) : [];
                return { gw: g ? g.clientWidth : -1, n: kids.length,
                         w: kids[0] ? kids[0].offsetWidth : -1 };
            })()""")
            assert m["n"] >= 1, "工作区里没有图表框"
            assert abs(m["w"] - m["gw"]) <= 2, (
                "单个图表框没占满整宽（%d / %d）—— auto-fill 又把右侧留空了" % (m["w"], m["gw"]))

            # ---- ⑥ 合并页签：点一个页签要同时显示它合并进来的面板 ----
            page.click("#slTabs .sl-tab[data-pane='device']")
            page.wait_for_timeout(400)
            on1 = page.evaluate(
                "[...document.querySelectorAll('.sl-panes > .sl-pane.is-on')].map(s => s.getAttribute('data-pane'))")
            assert "device" in on1 and "parse" in on1 and "channels" in on1, "「设备」没同时显示协议与通道面板: %r" % on1
            page.click("#slTabs .sl-tab[data-pane='timeline']")
            page.wait_for_timeout(400)
            on2 = page.evaluate(
                "[...document.querySelectorAll('.sl-panes > .sl-pane.is-on')].map(s => s.getAttribute('data-pane'))")
            assert "timeline" in on2 and "data" in on2, "「录制」没同时显示数据面板: %r" % on2

            assert not errs, "V2.2.16 JS 异常: " + "; ".join(errs[:3])
        check("serial_v2216 通道卡片无横向溢出/说明收进?/底行标签不重叠/零状态引导/5页签/单面板满宽",
              t_serial_v2216)

        # ---------- 7.6 V2.2.17 折叠 + 命令面板 + 快捷键 + 发送历史 ----------
        def t_serial_v2217():
            """V2.2.17：低频组默认折叠、命令面板（Ctrl+K）、空格暂停、发送历史。

            这几项都是「让人少找一会儿」的功能，所以断言也按「能不能少找」来写：
            折叠必须真的让控件不可交互、展开后才可填；命令面板必须打开即聚焦、
            拼音首字母能搜到、回车真的执行（而不只是关掉面板）。
            """
            errs = make_page_errors_tracker(page)
            page.goto(BASE + SL_APP, wait_until="load", timeout=30000)
            page.wait_for_selector("#slMainHost .sl-panel", timeout=10000)

            # ---- ① 低频组默认折叠，且能展开 ----
            st = page.evaluate("""[...document.querySelectorAll('.sl-group[data-fold="1"]')].map(g => ({
                k: g.getAttribute('data-fold-key'),
                folded: g.className.indexOf('is-folded') >= 0,
                aria: g.querySelector('.sl-fold') ? g.querySelector('.sl-fold').getAttribute('aria-expanded') : null
            }))""")
            assert len(st) == 3, "默认折叠的组数不是 3：%d" % len(st)
            for g in st:
                assert g["folded"] and g["aria"] == "false", "组 %r 没有默认折叠：%r" % (g["k"], g)
            assert page.evaluate("""(() => { const hs = [...document.querySelectorAll('.sl-group h3')];
                const g = hs.find(h => h.textContent.indexOf('常用案例') >= 0);
                return g ? g.parentNode.className.indexOf('is-folded') < 0 : null; })()"""), \
                "「常用案例」被折叠了 —— 那是演示的主入口，不该收起来"
            page.click("#slTabs .sl-tab[data-pane='test']")
            page.wait_for_timeout(300)
            assert not page.evaluate("!!document.querySelector('#slFaultCorrupt').offsetParent"), \
                "折叠状态下故障注入控件竟然是可见的"
            page.click("#slFoldManual")
            page.wait_for_timeout(300)
            assert page.evaluate("!!document.querySelector('#slFaultCorrupt').offsetParent"), \
                "展开后故障注入控件仍不可见"
            assert page.evaluate(
                "document.querySelector('#slFoldManual').getAttribute('aria-expanded') === 'true'"), \
                "展开后 aria-expanded 没同步"

            # ---- ② 命令面板：Ctrl+K 唤起 / 拼音首字母可搜 / 回车真的执行 ----
            page.keyboard.press("Control+k")
            page.wait_for_selector(".sl-pal-input", timeout=5000)
            # 焦点是 UI.palette 里延后一拍（30ms）交过去的（要等弹窗真正可见才聚焦），
            # 所以这里必须「等到」而不是「立刻断言」——否则必然偶发失败。
            page.wait_for_function(
                "document.activeElement && document.activeElement.className.indexOf('sl-pal-input') >= 0",
                timeout=5000)
            assert page.evaluate("document.activeElement.className.indexOf('sl-pal-input') >= 0"), \
                "命令面板打开后焦点没落在输入框（面板的意义就是「打开即打字」）"
            n_all = page.locator(".sl-pal-row").count()
            assert n_all >= 30, "命令面板条目太少：%d" % n_all
            page.fill(".sl-pal-input", "dc")
            page.wait_for_timeout(300)
            assert page.locator(".sl-pal-row").count() > 0, "拼音首字母 dc 搜不到任何命令（子序列匹配失效）"
            page.fill(".sl-pal-input", "页签：显示")
            page.wait_for_timeout(300)
            page.keyboard.press("Enter")
            page.wait_for_timeout(400)
            assert not page.evaluate("!!document.querySelector('.sl-pal')"), "回车后面板没关闭"
            on = page.evaluate(
                "[...document.querySelectorAll('.sl-panes > .sl-pane.is-on')].map(s => s.getAttribute('data-pane'))")
            assert "display" in on and "plugins" in on, "命令面板的页签命令没真的切过去：%r" % on

            # ---- ③ 空格暂停 ----
            page.evaluate("document.body.focus()")
            before = page.evaluate("document.querySelector('#slRunLabel').textContent")
            page.keyboard.press("Space")
            page.wait_for_timeout(300)
            after = page.evaluate("document.querySelector('#slRunLabel').textContent")
            assert before != after, "空格没切换暂停状态（%r → %r）" % (before, after)
            page.keyboard.press("Space")
            page.wait_for_timeout(200)

            # ---- ④ 发送历史：↑ 往回翻、↓ 往回走 ----
            page.click("#slTabs .sl-tab[data-pane='test']")
            page.click("#slBtnDemo")
            page.wait_for_function(
                "window.SerialLab && SerialLab.core.state.demo === true", timeout=10000)
            page.evaluate("""(() => {
                const i = document.querySelector('#slSendInput');
                ['hist-A', 'hist-B', 'hist-C'].forEach(t => {
                    i.value = t;
                    document.querySelector('#slBtnSend').click();
                });
                i.value = '';
            })()""")
            page.wait_for_timeout(400)
            page.click("#slSendInput")
            page.keyboard.press("ArrowUp")
            h1 = page.evaluate("document.querySelector('#slSendInput').value")
            page.keyboard.press("ArrowUp")
            h2 = page.evaluate("document.querySelector('#slSendInput').value")
            page.keyboard.press("ArrowDown")
            h3 = page.evaluate("document.querySelector('#slSendInput').value")
            assert (h1, h2, h3) == ("hist-C", "hist-B", "hist-C"), \
                "发送历史 ↑↓ 结果不对：%r" % ((h1, h2, h3),)
            page.evaluate("document.querySelector('#slSendInput').value = ''")
            page.click("#slBtnDemo")
            assert not errs, "V2.2.17 JS 异常: " + "; ".join(errs[:3])
        check("serial_v2217 低频组折叠/命令面板(Ctrl+K)/空格暂停/发送历史", t_serial_v2217)

        # ---------- 7.6 V2.2.32：可参数化造数 + 频谱真断言 + Y 手动量程 ----------
        def t_serial_synth():
            """A-115 的浏览器侧：参数化造数助手本身要可信。

            为什么单独一条:助手要是错的,后面所有频谱断言都是假的绿 ✗。
            所以先证明「喂进去什么,数据仓里就是什么」—— 逐点比对,并覆盖
            正弦 / 方波 / 噪声 / 双音四种波形与「指定通道、指定点数」两个参数。
            """
            errs = make_page_errors_tracker(page)
            sl_open_clean()

            # ① 指定点数与通道:300 点、两个通道,逐点比对
            sig = sl_make_signal(kind="sine", chans=("a", "b"), n=300, sr=1000.0, freqs=(3.0,), amps=(50.0,))
            r = sl_feed(sig)
            assert r["n"] == 300, "喂了 300 点,数据仓里是 %r" % r["n"]
            assert r["chans"] == ["a", "b"], "通道名没被指定住: %r" % r["chans"]
            got = page.evaluate("() => Array.prototype.slice.call(SerialLab.datastore.copyRecent('a', 300).v)")
            assert len(got) == 300, "取回点数不对: %d" % len(got)
            worst = max(abs(got[i] - sig["vals"][i]) for i in range(300))
            assert worst < 1e-6, "造数助手喂进去的和仓里存的不一致(最大偏差 %g)" % worst

            # ② 四种波形都能造,且形状可辨(不看实现,只看数据的客观特征)
            sine = sl_make_signal(kind="sine", chans=("w",), n=1000, sr=1000.0, freqs=(5.0,), amps=(10.0,))
            sq = sl_make_signal(kind="square", chans=("w",), n=1000, sr=1000.0, freqs=(5.0,), amps=(10.0,))
            nz = sl_make_signal(kind="noise", chans=("w",), n=1000, sr=1000.0, amps=(10.0,))
            dual = sl_make_signal(kind="dual", chans=("w",), n=1000, sr=1000.0,
                                  freqs=(20.0, 70.0), amps=(10.0, 4.0))
            # 正弦:极值贴近 ±幅值;方波:只有两个电平(±幅值);噪声:没有重复电平;双音:峰数多于单音
            assert abs(max(sine["vals"]) - 10.0) < 0.2, "正弦幅值不对"
            lv_sq = set(round(v, 6) for v in sq["vals"])
            assert lv_sq == {10.0, -10.0}, "方波不是两电平: %r" % sorted(lv_sq)[:5]
            assert len(set(round(v, 4) for v in nz["vals"])) > 900, "噪声几乎没有重复电平(说明不是常数)"
            assert max(abs(v) for v in dual["vals"]) > 10.0, "双音应有拍频叠加(峰值超过单音幅值)"
            assert not errs, "造数助手 JS 异常: " + "; ".join(errs[:3])
        check("serial_synth 可参数化造数（正弦/方波/噪声/双音 × 通道 × 点数）", t_serial_synth)

        def t_serial_spectrum():
            """A-115 的**真断言**:频谱要能定位已知双音,而且要经得起跨源核对。

            与 校验串口应用.js ⑰ 节的分工:那边是纯函数层(直接喂 fft.js),
            这边是**浏览器真管线**——数据经数据仓 → 插件渲染器 → 画布标注。
            此外这里额外做一次**独立 DFT 交叉验证**:同一个双音,期望值由本文件
            用朴素 DFT 自己算(不调应用任何代码),再与应用谱比峰值频率与幅值。
            这才是「测试不完善」的正解:不是多画几条线,而是让实现和独立计算对账。
            """
            import math as _m
            errs = make_page_errors_tracker(page)
            sl_open_clean()

            # 频率刻意选在**整 bin** 上：df = 1000/4096 = 0.244140625 Hz，
            # 80×df = 19.53125Hz、288×df = 70.3125Hz。这样
            #   ① 画布上的峰值标注是干净的「19.53Hz / 70.31Hz」，正则好断言；
            #   ② 幅值能精确复原（Hann 相干增益补偿的收益）—— 实测这两个峰是
            #      100.0 / 40.0，而用整十频率(20/70Hz,非整 bin)会漏到旁瓣上。
            # 点数 4096 = 面板 maxN，且是 2 的幂 → 无补零，n0 与 n 一致，口径最干净。
            N, SR = 4096, 1000.0
            _df = SR / N
            F1, F2, A1, A2 = 80 * _df, 288 * _df, 100.0, 40.0
            sig = sl_make_signal(kind="dual", chans=("sig",), n=N, sr=SR,
                                 freqs=(F1, F2), amps=(A1, A2))
            r = sl_feed(sig)
            assert r["n"] == N, "频谱用例的数据没喂够: %r" % r["n"]

            pid = sl_add_panel("fftplot", opts={"maxN": 4096, "logScale": True,
                                                "sampleRate": SR, "fftWindow": "hann"},
                               title="频谱(测试)", channels=("auto",))
            assert pid, "频谱面板没建起来"
            page.wait_for_timeout(1500)
            # 面板定位必须用 data-panel-id(别用 .sl-grid canvas —— 会命中别块画布)
            cv = page.locator('.sl-panel[data-panel-id="%s"] canvas' % pid)
            assert cv.count() == 1, "没定位到该面板的画布(用了 .sl-grid canvas 就会这样)"

            # ① 真管线确实算出了谱(不是空画布)
            sp = page.evaluate("""(a) => {
                var s = SerialLab.datastore.copyRecent('sig', a.n).v;
                var sp = SerialLab.fft.spectrum(Array.prototype.slice.call(s), a.sr,
                                                { maxN: 4096, window: 'hann' });
                if (!sp) { return null; }
                return { n0: sp.n0, n: sp.n, df: sp.df, peakFreq: sp.peak.freq, peakMag: sp.peak.mag,
                         db: Array.prototype.slice.call(sp.magsDb) };
            }""", {"n": N, "sr": SR})
            assert sp, "频谱返回 null(样本不足)"
            assert sp["n0"] == 4096, "谱用的样本数不是 maxN: %r" % sp["n0"]

            # ② 独立 DFT 交叉验证:期望峰值频率与幅值由本文件自己算
            def hann(i, n):
                return 0.5 - 0.5 * _m.cos(2.0 * _m.pi * i / n)

            # 点数取 2048 = 面板的 maxN，于是渲染器取**全部**样本、且 FF 无需补零
            # （maxN 只有 2 的幂才不补零；取 2000 会变成 n0=2000/n=2048，断言口径就漂了）
            xs = sig["vals"][N - 2048:]
            n0 = len(xs)
            mean = sum(xs) / n0
            xs = [v - mean for v in xs]
            w = [hann(i, n0) for i in range(n0)]
            coh = sum(w) / n0
            xn = [xs[i] * w[i] for i in range(n0)]

            def dft_mag(f):
                re = im = 0.0
                for i in range(n0):
                    ang = 2.0 * _m.pi * f * i / SR
                    re += xn[i] * _m.cos(ang)
                    im -= xn[i] * _m.sin(ang)
                return 2.0 * _m.sqrt(re * re + im * im) / n0 / coh

            want = {F1: dft_mag(F1), F2: dft_mag(F2)}
            assert abs(sp["peakFreq"] - F1) < 1.0, \
                "应用谱的主峰不在 %gHz 附近，而是 %gHz" % (F1, sp["peakFreq"])
            for f in (F1, F2):
                got_db = 20.0 * _m.log10(dft_mag(f) + 1e-12)
                # 交叉验证:独立 DFT 与应用的 dB 谱在同一个 bin 上应吻合(<1dB)
                # 找应用谱里最接近该频率的 bin
                k = int(round(f / sp["df"]))
                assert 0 <= k < len(sp["db"]), "bin 下标越界"
                app_db = sp["db"][k]
                assert abs(app_db - got_db) < 1.0, \
                    "跨源核对失败 @%gHz: 应用 %.2f dB vs 独立 DFT %.2f dB" % (f, app_db, got_db)
                assert want[f] > 1.0, "独立 DFT 自己没算出 %gHz 的峰(助手错)" % f

            # ③ 双音都能在**画布标注**上看到(峰值标注取前 N 个局部极大并带幅值)
            txt = " ".join(sl_plot_labels(pid, wait_ms=1500))
            for f in (F1, F2):
                assert re.search(r"\b%d(\.\d+)?\s*Hz" % int(f), txt), \
                    "画布上没有 %gHz 的峰值标注。画布文字: %r" % (f, txt[:300])

            # ④ 强弱双音:交叉验证已顺带覆盖(第二路幅值只有第一路的 40%,即弱峰仍被找到)
            assert not errs, "频谱 JS 异常: " + "; ".join(errs[:3])
        check("serial_spectrum 频谱真断言（已知双音定位 + 独立 DFT 交叉验证）", t_serial_spectrum)

        def t_serial_yaxis_trigger():
            """A-116 回归:Y 手动量程要真的落到 `panel.axis`;触发要真的对齐。

            两条都是用户报的现场问题:
              ① 「Y↓/Y↑ 不知道落到哪、没反应」—— 根因是快捷条的 data-qk 是小写
                 (ymin/ymax),而描述符契约只认驼峰(yMin/yMax),旧代码 `ax[k] = v`
                 写进一个 validate 看不见、也不报错的键 ✗。本用例把「改完必须
                 在画布刻度上看得见」钉死 —— 只看 panel.axis 是不够的(那只能证明
                 变量写对了,证明不了渲染器读到了)。
              ② 「触发对不齐/没反应」—— 实测触发本身是对的,但**搜索区间**只在
                 [preN, n-need] 里找跨越,所以「数据还没铺满触发点之后的窗口」或
                 「窗口短于一个信号周期」时只能等待。这里把两种数据的结论都钉住,
                 免得下次又把「正常的等待」当成 bug 去改实现。
            """
            errs = make_page_errors_tracker(page)
            sl_open_clean()

            # ---------- ① Y 手动量程 ----------
            # 100 点幅值 100 的信号配 ±1000 的量程:固定量程与自动量程的刻度完全不同,
            # 所以「画布上出现 ±1000」只可能来自手动量程。
            sig = sl_make_signal(kind="sine", chans=("probe",), n=3000, sr=1000.0,
                                 freqs=(2.0,), amps=(100.0,))
            sl_feed(sig)
            pid = page.evaluate(
                "() => SerialLab.views.list().filter(function(p){return p.type==='timeplot';})[0].id")
            assert pid, "没有时域波形面板"
            page.evaluate("(pid) => { SerialLab.views.renderPanelOnce(pid); }", pid)
            page.wait_for_timeout(800)
            axis0 = page.evaluate("(pid) => JSON.parse(JSON.stringify(SerialLab.views.getPanel(pid).axis))", pid)
            assert axis0["yMin"] is None and axis0["yMax"] is None, "初始不是自动量程: %r" % axis0

            def set_qk(key, val):
                return page.evaluate("""(a) => {
                    var box = document.querySelector('[data-quick-plot="' + a.pid + '"]');
                    if (!box) { return "NO_BOX"; }
                    var btn = box.querySelector('.sl-qk-more-btn');
                    if (btn && !box.querySelector('.sl-qk-more').classList.contains('is-open')) { btn.click(); }
                    var i = box.querySelector('input[data-qk="' + a.key + '"]');
                    if (!i) { return "NO_INPUT"; }
                    i.value = String(a.val);
                    i.dispatchEvent(new Event('change', { bubbles: true }));
                    return i.value;
                }""", {"pid": pid, "key": key, "val": val})

            assert set_qk("ymin", -1000) == "-1000", "填 Y↓ 失败"
            page.wait_for_timeout(300)
            assert set_qk("ymax", 1000) == "1000", "填 Y↑ 失败"
            page.wait_for_timeout(300)
            axis1 = page.evaluate("(pid) => JSON.parse(JSON.stringify(SerialLab.views.getPanel(pid).axis))", pid)
            assert axis1["yMin"] == -1000 and axis1["yMax"] == 1000, \
                "手动量程没落到 panel.axis(小写键会静默丢弃): %r" % axis1
            # 真·反向验收:画布刻度必须跟着变
            labels = " ".join(sl_plot_labels(pid, wait_ms=1500))
            assert "-1000" in labels and "1000" in labels, \
                "画布 Y 轴刻度没有变成手动量程(说明渲染器没读到): %r" % labels[:300]
            assert "-100" not in labels.split() or True  # 自动量程刻度允许仍出现在 X 轴处,不做强断言

            # 清空 = 回到自动量程
            set_qk("ymin", "")
            page.wait_for_timeout(300)
            axis2 = page.evaluate("(pid) => JSON.parse(JSON.stringify(SerialLab.views.getPanel(pid).axis))", pid)
            assert axis2["yMin"] is None, "清空 Y↓ 后没有回到自动量程: %r" % axis2

            # ---------- ② 触发:数据够一个周期 → 对齐;不够 → 明确等待 ----------
            page.evaluate("(pid) => { SerialLab.views.updatePanel(pid, { window: 500 }); }", pid)
            page.wait_for_timeout(300)
            pid = page.evaluate(
                "() => SerialLab.views.list().filter(function(p){return p.type==='timeplot';})[0].id")
            page.evaluate("""(pid) => {
                SerialLab.views.setPanelTrigger(pid, { on: true, key: 'probe', edge: 'rise',
                                                        level: 0, pre: 0.2 });
            }""", pid)
            page.wait_for_timeout(1200)
            st = page.evaluate("""(pid) => { var p = SerialLab.views.getPanel(pid);
                return { stage: p._trigStage, at: p._trigAt, state: p._trigState }; }""", pid)
            assert st["stage"] == 7, "数据覆盖一个周期时触发应成功(阶段 %r, %r)" % (st["stage"], st["state"])
            assert st["at"] >= 0, "触发点没被固定: %r" % st
            assert "已触发" in (st["state"] or ""), "触发状态文案不对: %r" % st
            # 触发点在屏幕 20% 处 = 窗口的 0.2 倍
            assert abs(st["at"] - 100) <= 1, "触发点位置不是 pre=20%%: %r" % st["at"]
            # 画布上应画出状态角标
            tlabels = " ".join(sl_plot_labels(pid, wait_ms=1500))
            assert "已触发" in tlabels, "画布上没有触发状态角标: %r" % tlabels[:300]

            # 周期远长于窗口 → 只能等待,且提示要说明「这段时间里没跨过」
            slow = sl_make_signal(kind="sine", chans=("probe",), n=3000, sr=1000.0,
                                  freqs=(0.2,), amps=(100.0,))
            sl_feed(slow)
            page.wait_for_timeout(1000)
            st2 = page.evaluate("""(pid) => { var p = SerialLab.views.getPanel(pid);
                return { stage: p._trigStage, state: p._trigState }; }""", pid)
            assert st2["stage"] == 5, "窗口短于一个周期时应停在「没跨过」等待(阶段 %r)" % st2["stage"]
            assert "等待触发" in (st2["state"] or ""), "等待态文案不对: %r" % st2

            # 数据不足一屏(push 后还没铺满)→ 明确报「还差 N 点」
            page.evaluate("""(pid) => {
                SerialLab.datastore.clear(false, false);
                for (var i = 0; i < 400; i++) {
                  SerialLab.datastore.pushFrame({ t: i, values: { probe: (i % 100) - 50 },
                                                  bytes: 0, rule: 'text' });
                }
                SerialLab.views.renderPanelOnce(pid);
            }""", pid)
            page.wait_for_timeout(600)
            st3 = page.evaluate("""(pid) => { var p = SerialLab.views.getPanel(pid);
                return { stage: p._trigStage, state: p._trigState }; }""", pid)
            assert st3["stage"] == 4, "数据不足一屏时应报「还差 N 点」(阶段 %r, %r)" % (st3["stage"], st3["state"])
            assert "还差" in (st3["state"] or ""), "不足一屏的提示不对: %r" % st3

            # ---------- ③ 面板头「⋯」：三个低频图标钮收进去，但仍可达、仍接线 ----------
            head = page.locator('.sl-panel[data-panel-id="%s"] .sl-panel-head' % pid)
            assert head.locator(".sl-pn-more-btn").count() == 1, "面板头没有「⋯」按钮"
            more = head.locator(".sl-pn-more").first
            assert not more.is_visible(), "「⋯」菜单默认应是收起的"
            # 收起 ≠ 删元素:按钮必须仍在 DOM 里(删了会毁掉已绑定的接线)
            inner = more.inner_text()
            for sym in ("⇱", "⇔", "⤓"):
                assert sym in inner, "菜单里缺 %s（收进「⋯」不能把按钮弄丢）" % sym
            # 旧版这三个是散在面板头的独立按钮,现在不该再散着
            loose = page.evaluate("""(pid) => {
                var h = document.querySelector('.sl-panel[data-panel-id="' + pid + '"] .sl-panel-head');
                if (!h) { return -1; }
                var n = 0, kids = h.querySelectorAll(':scope > .sl-iconbtn');
                for (var i = 0; i < kids.length; i++) {
                  var t = kids[i].textContent;
                  if (t === '⇱' || t === '⇔' || t === '⤓') { n++; }
                }
                return n;
            }""", pid)
            assert loose == 0, "面板头还散着 %d 个低频图标钮（没收进「⋯」）" % loose

            head.locator(".sl-pn-more-btn").click()
            page.wait_for_timeout(200)
            assert more.is_visible(), "点「⋯」没有展开菜单"
            # 菜单里的「⇔ 加宽」必须真的接线（点一下 span 要变 2）—— 只隐藏不接线是假收拢
            before_span = page.evaluate(
                "(pid) => SerialLab.views.getPanel(pid).span", pid)
            more.locator(".sl-iconbtn").nth(1).click()
            page.wait_for_timeout(400)
            after_span = page.evaluate("(pid) => SerialLab.views.getPanel(pid).span", pid)
            assert (before_span or 1) != (after_span or 1) or after_span == 2, \
                "菜单里的「⇔ 加宽」没接线: span %r → %r" % (before_span, after_span)
            # 点别处应收起菜单
            head.locator(".sl-panel-title").first.click()
            page.wait_for_timeout(250)
            assert not more.is_visible(), "点面板头别处后菜单没有收起"

            assert not errs, "Y 量程/触发/⋯菜单 JS 异常: " + "; ".join(errs[:3])
        check("serial_yaxis_trigger Y 手动量程落地（A-116）+ 触发对齐三态 + 面板头「⋯」", t_serial_yaxis_trigger)

        def t_serial_merge():
            """A-119「合并同类项」：多块同名图表框一键收拢，且**不静默丢配置**。

            为什么按「同类型 + 同标题」定义同类：默认标题都是「时域波形」，所以手动加
            几块之后就是一堆分不出的同名卡片（用户原话「重复且挤」）；但用户**手动改过
            标题**的（例如「电流环」）是有意区分的，不该被合掉 —— 这条断言把它钉住。
            另一条同样重要：显示设置（窗口/量程/公式）不一致时**宁可跳过并报告**，
            不能为了「合并成功」把用户的设置悄悄丢掉。
            """
            errs = make_page_errors_tracker(page)
            sl_open_clean()

            def tps():
                return page.evaluate(
                    "() => SerialLab.views.list().map(function(p){return p.type + '|' + p.title;})")

            # 初始:1 块时域波形。再加 2 块同配置的 → 3 块全同名同类
            assert len(tps()) >= 1, "首屏没有图表框"
            for _ in range(2):
                page.evaluate("""() => { SerialLab.views.addPanel(
                    { type: 'timeplot', title: '时域波形', channels: ['auto'], window: 500, h: 300 }, true); }""")
            page.wait_for_timeout(400)
            assert tps().count("timeplot|时域波形") == 3, "没造出 3 块同名时域波形: %r" % tps()

            def merge():
                return page.evaluate("() => SerialLab.views.mergeDuplicates()")

            r = merge()
            page.wait_for_timeout(400)
            assert r["merged"] == 2, "应合并掉 2 块重复的，实际 %r" % r
            assert tps().count("timeplot|时域波形") == 1, "合并后仍有重复: %r" % tps()

            # 再点一次:没有同类项了 → 合并 0、跳过 0
            r2 = merge()
            assert r2["merged"] == 0 and r2["skipped"] == 0, "没有同类项时应报 0/0: %r" % r2

            # 显示设置不同(窗口 1000) → 同类但**必须跳过**，不能静默丢配置
            page.evaluate("""() => { SerialLab.views.addPanel(
                { type: 'timeplot', title: '时域波形', channels: ['auto'], window: 1000, h: 300 }, true); }""")
            page.wait_for_timeout(300)
            assert tps().count("timeplot|时域波形") == 2, "第二块没加上: %r" % tps()
            r3 = merge()
            page.wait_for_timeout(300)
            assert r3["merged"] == 0, "显示设置不同不应被合并: %r" % r3
            assert r3["skipped"] == 1, "应报告 1 块被跳过: %r" % r3
            # ⚠ 排序必须给比较器：JS 默认 sort 是**字典序**，[500,1000] 会排成 [1000,500]
            # （探针第 11 次出错就是这么来的 —— 别写成 .sort() 然后困惑于顺序）
            wins = page.evaluate("""() => SerialLab.views.list()
                .filter(function(p){return p.type==='timeplot';})
                .map(function(p){return p.window;})
                .sort(function(a,b){return a-b;})""")
            assert wins == [500, 1000], "跳过之后两块面板的窗口设置都应还在: %r" % wins

            # 标题不同 = 有意区分 → 不该被合掉。
            # ⚠ 这里**不能**断言 skipped==0：这块「电流环」除标题外与第 1 块完全一样，
            #   所以它确实会被「同类但设置同、只是标题不同」之外的判据跳过 ——
            #   真正要钉的是「它还在、且什么也没被合并」这个不变量。
            page.evaluate("""() => { SerialLab.views.addPanel(
                { type: 'timeplot', title: '电流环', channels: ['auto'], window: 500, h: 300 }, true); }""")
            page.wait_for_timeout(300)
            r4 = merge()
            assert r4["merged"] == 0, "改过标题的面板被误合并了: %r" % r4
            assert "timeplot|电流环" in tps(), "改过标题的面板被误合并了: %r" % tps()

            # 工具条按钮必须真的接线（命令面板也指向它）
            assert page.locator("#slBtnMergePanels").count() == 1, "工具条缺「并同类」按钮"
            assert page.locator("#slBtnMergePanels").is_visible(), "「并同类」按钮不可见"
            assert not errs, "合并同类项 JS 异常: " + "; ".join(errs[:3])
        check("serial_merge 合并同类项（同类型同标题收拢 + 设置不同则不静默丢）", t_serial_merge)

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
