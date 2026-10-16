# -*- coding: utf-8 -*-
"""
人形机器人学习站 · 浏览器端到端测试(锚点落点专项)
=================================================
V2.2.16 新增:与 e2e_test.py 互补的一条**时序类**回归——锚点跳转只能"整整一段",
不许停下再起步、不许倒退、不许瞬移,且落点必须落在各页 scroll-margin-top 处。

为什么单列一个文件:
    故障是可测量的时序问题(逐帧 scrollY 轨迹),而 e2e_test.py 由另一路会话同期在改
    (并行会话协议:一个文件同一时刻只有一个会话在改)。等两边都落定后可合并进主套件;
    在此之前它同样是 CI 步骤(见 .github/workflows/self-check.yml 的 e2e_anchor 步骤)。

回归的故障(用户报「网站上点版本信息连续跳了三次」):
    旧实现 initHashReanchor 在"版面高度一变"就 scrollIntoView 重落一次,而首页 .sec 挂了
    content-visibility:auto——滚动途中板块逐个渲染,文档总高与目标的绝对位置持续变化
    (首页实测 #version 顶边 8213→6698,漂移 1515px),于是一次跳转被切成 3 段原生平滑滚动,
    每段都从头 ease-in 起步,肉眼即"跳三次"。而完全不校正的原生落点实测偏 1430px,
    所以校正是必需的——修法是改成自绘的"实时追靶"动画(逐帧重量目标、只进不退、单帧封顶),
    并接管页内锚点点击(pushState 同步 URL)。

运行(仓库根目录):
    python "_本地工具/e2e/e2e_anchor.py"
"""
import functools
import http.server
import json
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
sys.stdout.reconfigure(encoding="utf-8")

# 逐帧记录 scrollY;落在事件循环里,长帧也算一帧(这正是要抓的场景)。
# 必须先 cancel 上一轮的 rAF:probe 会调用多次,叠加两个记录器会让每个真实位移帧前
# 多一帧重复采样,被 stall 判定误读成"停下再起步"(实测误报 35 次)
TRACE_JS = """
() => {
  if (window.__anRaf) cancelAnimationFrame(window.__anRaf);
  const box = {rows: []};
  window.__an = box;
  const t0 = performance.now();
  const rec = () => {
    box.rows.push([Math.round(performance.now() - t0), Math.round(window.scrollY)]);
    window.__anRaf = requestAnimationFrame(rec);
  };
  window.__anRaf = requestAnimationFrame(rec);
}
"""

READ_JS = """
(tid) => {
  const el = document.getElementById(tid);
  const cs = el ? getComputedStyle(el) : null;
  return {
    rows: (window.__an && window.__an.rows) || [],
    top: el ? el.getBoundingClientRect().top : null,
    margin: cs ? (parseFloat(cs.scrollMarginTop) || 0) : 0,
    hash: location.hash,
    docH: document.documentElement.scrollHeight
  };
}
"""

RESULTS = []


def bind_server():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

    handler = functools.partial(Quiet, directory=str(ROOT))
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    return httpd, "http://127.0.0.1:%d" % httpd.server_address[1]


def check(name, fn):
    try:
        detail = fn()
    except Exception as e:
        RESULTS.append((name, False, str(e)[:300]))
        print("FAIL  " + name + "  -> " + str(e)[:300])
    else:
        RESULTS.append((name, True, ""))
        print("PASS  " + name + ("   " + detail if detail else ""))


def probe(page, selector, target_id, settle_ms=4000, prescroll=True):
    """点 selector,逐帧记录到 target_id 落定。返回轨迹与落点数据。

    prescroll=True 时先 scroll_into_view_if_needed:Playwright 的 click 自己会先把元素滚进视口,
    那一下是"自动化工具的滚动",混进轨迹会被误判成倒退/跳变(实测 -5916px),所以让它先滚完再记轨迹。
    要考察"向上跳"的场景就传 False(改用页面内 click(),不碰滚动位置)。
    """
    if prescroll:
        page.locator(selector).first.scroll_into_view_if_needed()
        page.wait_for_timeout(250)
    page.evaluate(TRACE_JS)
    page.wait_for_timeout(200)
    page.evaluate("() => { window.__an.rows.length = 0; }")
    if prescroll:
        page.click(selector)
    else:
        page.evaluate("(sel) => document.querySelector(sel).click()", selector)
    page.wait_for_timeout(settle_ms)
    return page.evaluate(READ_JS, target_id)


def motion_report(rows):
    """把逐帧轨迹压成可断言的几个量(只统计"真的在动"的那一段之后)。

    方向由主运动方向决定:首页锚点多为向下,但页内锚点(quicknav→#sec5)是向上,
    "倒退"= 逆着主方向的位移,不是"负值"。
    """
    ys = [r[1] for r in rows]
    if len(ys) < 20:
        raise AssertionError("轨迹采样过少(%d 帧),rAF 没跑起来" % len(ys))
    steps = [ys[i] - ys[i - 1] for i in range(1, len(ys))]
    moving = [i for i, s in enumerate(steps) if s != 0]
    if not moving:
        raise AssertionError("整段轨迹没有位移")
    lo, hi = moving[0], moving[-1]
    seg = steps[lo:hi + 1]
    direction = 1 if sum(1 for s in seg if s > 0) >= sum(1 for s in seg if s < 0) else -1
    against = [s for s in seg if s * direction < -2]
    return {
        "travel": ys[hi] - ys[lo],
        "backward": len(against),
        "worst_backward": (min(against, key=abs) if against else 0),
        # 「停下再起步」:一帧几乎不动、紧接着一帧朝主方向猛冲
        # (旧实现每 300ms 重启一次原生缓动,故有 3 段,每段都从头加速)
        "restarts": sum(1 for i in range(1, len(seg)) if abs(seg[i - 1]) <= 2 and seg[i] * direction >= 60),
        "max_step": max(abs(s) for s in seg),
        "span_ms": rows[hi][0] - rows[lo][0],
    }


def assert_landing(data, target_id, tol=3.0):
    assert data["top"] is not None, "目标 #%s 不存在" % target_id
    off = data["top"] - data["margin"]
    assert abs(off) <= tol, (
        "#%s 落点不准:顶边离视口 %.1fpx,应≈%.0fpx(各页 scroll-margin-top,顶栏不遮挡)"
        % (target_id, data["top"], data["margin"]))
    return off


def assert_single_motion(rep, what):
    """三条时序底线一次报全(分开断言会在第一个失败处截断,看不到轨迹全貌)"""
    bad = []
    # 只抓"肉眼可见"的倒退:惰性板块渲染时浏览器自身的滚动锚定会做几像素微调(非本站动画所致)
    if rep["backward"]:
        bad.append("滚动倒退 %d 帧(最深 %.0fpx)——倒退即用户看到的跳变"
                   % (rep["backward"], rep["worst_backward"]))
    if rep["restarts"]:
        bad.append("滚动中途停下再起步 %d 次(旧实现每次重落都重启原生缓动,一段跳转被切成 3 段)"
                   % rep["restarts"])
    if rep["max_step"] > 150:
        bad.append("单帧位移 %.0fpx(>150 即瞬移:长帧不得靠跳过去)" % rep["max_step"])
    assert not bad, "%s:%s(逐帧轨迹:位移 %.0fpx / 单帧最大 %.0fpx / 用时 %.0fms)" % (
        what, ";".join(bad), rep["travel"], rep["max_step"], rep["span_ms"])


def main():
    httpd, base = bind_server()
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    print("本地服务: %s  (根目录: %s)" % (base, ROOT))

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        def new_page(**kw):
            kw.setdefault("viewport", {"width": 1280, "height": 720})
            ctx = browser.new_context(**kw)
            pg = ctx.new_page()
            errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)[:160]))
            pg.add_init_script("try{localStorage.setItem('site-onboard-v1','1')}catch(e){}")
            return ctx, pg, errs

        # ---------- 1. 首页顶栏版本胶囊 → #version(用户报的那一次点击) ----------
        def t_nav_badge():
            """点一次 = 一整段连续滚动 + 落点恰好压在 scroll-margin-top。"""
            ctx, pg, errs = new_page()
            try:
                pg.goto(base + "/index.html", wait_until="load", timeout=30000)
                pg.wait_for_timeout(1500)
                data = probe(pg, "#navVerHome", "version")
                rep = motion_report(data["rows"])
                assert rep["travel"] > 3000, "没滚到版本板块(位移 %.0fpx)" % rep["travel"]
                assert_single_motion(rep, "点版本胶囊")
                assert_landing(data, "version")
                assert data["hash"] == "#version", "URL 未同步为 #version: %r" % data["hash"]
                assert not errs, "JS 异常: " + "; ".join(errs[:2])
                return "位移 %.0fpx / 单帧最大 %.0fpx / 用时 %.0fms" % (
                    rep["travel"], rep["max_step"], rep["span_ms"])
            finally:
                ctx.close()
        check("anchor_nav_badge 首页点版本胶囊:一整段落定且落点准", t_nav_badge)

        # ---------- 2. hero 版本角标(第二入口) ----------
        def t_hero_badge():
            ctx, pg, errs = new_page(viewport={"width": 1440, "height": 900})
            try:
                pg.goto(base + "/index.html", wait_until="load", timeout=30000)
                pg.wait_for_timeout(1500)
                data = probe(pg, "#verBadge", "version")
                rep = motion_report(data["rows"])
                assert_single_motion(rep, "点 hero 版本角标")
                assert_landing(data, "version")
                assert not errs, "JS 异常: " + "; ".join(errs[:2])
                return "位移 %.0fpx / 单帧最大 %.0fpx" % (rep["travel"], rep["max_step"])
            finally:
                ctx.close()
        check("anchor_hero_badge hero 版本角标落点准", t_hero_badge)

        # ---------- 3. 带 #version 冷加载(内容页点版本胶囊走的就是这条路) ----------
        def t_cold_load():
            """冷加载时原生锚点按估值落位,本站要平滑落正;落定后还要经得住惰性板块随后渲染。"""
            ctx, pg, errs = new_page()
            try:
                pg.goto(base + "/index.html#version", wait_until="load", timeout=30000)
                pg.wait_for_timeout(4000)
                data = pg.evaluate(READ_JS, "version")
                assert_landing(data, "version")
                assert not errs, "JS 异常: " + "; ".join(errs[:2])
                return "顶边 %.1fpx(期望 %.0fpx)" % (data["top"], data["margin"])
            finally:
                ctx.close()
        check("anchor_cold_load 带 #version 冷加载落点准", t_cold_load)

        # ---------- 4. 页内锚点向上跳(quicknav → #sec5) ----------
        def t_inner_up():
            ctx, pg, errs = new_page()
            try:
                pg.goto(base + "/index.html", wait_until="load", timeout=30000)
                pg.wait_for_timeout(1500)
                probe(pg, "#navVerHome", "version", settle_ms=3500, prescroll=False)  # 先到底部,再往上跳
                assert pg.evaluate("window.scrollY") > 5000, "没先落到页面底部,向上跳无从考察"
                data = probe(pg, ".quicknav a[href='#sec5']", "sec5", prescroll=False)
                rep = motion_report(data["rows"])
                assert rep["travel"] < -1000, "不是向上跳(位移 %.0fpx)" % rep["travel"]
                assert_single_motion(rep, "页内锚点向上跳")
                assert_landing(data, "sec5")
                assert data["hash"] == "#sec5", "URL 未同步为 #sec5: %r" % data["hash"]
                assert not errs, "JS 异常: " + "; ".join(errs[:2])
                return "位移 %.0fpx / 单帧最大 %.0fpx" % (rep["travel"], rep["max_step"])
            finally:
                ctx.close()
        check("anchor_inner_up 页内锚点向上跳落点准", t_inner_up)

        # ---------- 5. 用户一动就交还控制权 ----------
        def t_takeover():
            """滚动途中用户自己滚走,不许被动画拽回锚点。"""
            ctx, pg, errs = new_page()
            try:
                pg.goto(base + "/index.html", wait_until="load", timeout=30000)
                pg.wait_for_timeout(1500)
                pg.evaluate(TRACE_JS)
                pg.click("#navVerHome")
                pg.wait_for_timeout(250)          # 动画进行中
                pg.mouse.wheel(0, -1500)          # 用户往回滚
                pg.wait_for_timeout(2500)
                data = pg.evaluate(READ_JS, "version")
                off = data["top"] - data["margin"]
                assert abs(off) > 500, (
                    "用户滚走后仍被拽回锚点(#version 顶边 %.0fpx,离应落位仅 %.0fpx)"
                    % (data["top"], off))
                assert not errs, "JS 异常: " + "; ".join(errs[:2])
                return "#version 顶边 %.0fpx(用户接管后未被拽回)" % data["top"]
            finally:
                ctx.close()
        check("anchor_takeover 用户滚动优先,动画立即交还", t_takeover)

        # ---------- 6. prefers-reduced-motion:不做动画,但落点照样准 ----------
        def t_reduced():
            ctx, pg, errs = new_page(reduced_motion="reduce")
            try:
                pg.goto(base + "/index.html", wait_until="load", timeout=30000)
                pg.wait_for_timeout(1500)
                pg.click("#navVerHome")
                pg.wait_for_timeout(3000)
                data = pg.evaluate(READ_JS, "version")
                assert_landing(data, "version")
                assert not errs, "JS 异常: " + "; ".join(errs[:2])
                return "顶边 %.1fpx(期望 %.0fpx)" % (data["top"], data["margin"])
            finally:
                ctx.close()
        check("anchor_reduced_motion 少动效落点准", t_reduced)

        # ---------- 7. 内容页顶栏「版本胶囊」→ 首页版本板块 ----------
        def t_from_content_page():
            ctx, pg, errs = new_page()
            try:
                pg.goto(base + "/01_理论入门/01_整体知识框架_思维导图.html",
                        wait_until="load", timeout=30000)
                pg.wait_for_timeout(800)
                pg.click(".nav-ver")
                pg.wait_for_timeout(5000)
                assert "/index.html" in pg.url, "未跳到首页: " + pg.url
                data = pg.evaluate(READ_JS, "version")
                assert_landing(data, "version", tol=6.0)   # 跨页跳转多给几像素
                assert not errs, "JS 异常: " + "; ".join(errs[:2])
                return "顶边 %.1fpx(期望 %.0fpx)" % (data["top"], data["margin"])
            finally:
                ctx.close()
        check("anchor_from_content_page 内容页点版本胶囊跨页落点准", t_from_content_page)

        browser.close()
    httpd.shutdown()

    ok = sum(1 for _, s, _ in RESULTS if s)
    print("")
    fail = [n for n, s, _ in RESULTS if not s]
    print("锚点落点 E2E: %d/%d PASS%s" % (ok, len(RESULTS), "" if not fail else "  <<< 失败: " + " | ".join(fail)))
    sys.exit(0 if ok == len(RESULTS) else 1)


if __name__ == "__main__":
    main()
