/* ============================================================
   网页端串口调试助手 · SerialLab
   模块：views（工作区视图调度）
   职责：
     1) 面板的增删、停靠位切换（主位 C1 / 工作区 C2）、折叠、拖拽排序、拖拽改高
     2) 主区上下分割比例（监视器 : 波形）的读写与持久化
     3) 统一的渲染节流循环；并向渲染器提供 data provider
   依赖：core、util、plugins、datastore

   布局模型（与 index.html 的 DOM 一一对应）：
     .sl-stage
       ├─ .sl-stage-bar      工作区工具条
       ├─ .sl-stage-main     C1：主位面板（默认是串口监视器）——主视觉
       ├─ .sl-split          可拖拽的分割线（改 --sl-mon-grow / --sl-grid-grow）
       └─ .sl-stage-grid     C2：其余面板的栅格（每个面板固定高度、独立滚动）

   为什么要这样改（对旧版的修正）：
     旧版把所有面板塞进同一个 CSS Grid，Grid 默认 align-items:stretch，
     于是「同一行内所有面板等高」——监视器一旦变高，同行的波形就被拉成一条竖线。
     现在监视器独占 C1，波形在 C2 里各自固定高度、各自滚动，两者互不影响。

   渲染节流说明：串口数据可能上百 Hz 到达，但屏幕只需要 20~25 fps。
     这里用 requestAnimationFrame 驱动，并按 drawInterval 抽帧，
     避免每个字节都触发一次重绘把主线程压死。
   ============================================================ */
;(function (global) {
  "use strict";

  var SL = global.SerialLab = global.SerialLab || {};
  var U = SL.util;
  var core = SL.core;
  var Plugins = SL.plugins;

  var V = {};

  var mainHost = null;          /* C1 主位面板的宿主 */
  var gridHost = null;          /* C2 工作区栅格 */
  var stageEl = null;           /* .sl-stage（承载分割比例变量与全屏/收起状态类） */
  var splitEl = null;           /* 分割线 */

  var panels = [];              /* 描述符数组，顺序即显示顺序 */
  var instances = {};           /* id -> 渲染器实例 */
  var els = {};                 /* id -> 面板 DOM */
  var rafId = null;
  var running = false;
  var lastDraw = 0;
  var drawInterval = 40;        /* ms，约 25 fps */
  var dragId = null;
  /* V2.2.23 拖拽手感：跟手基准点 / rAF 合并 / 一帧内复用的兄弟矩形缓存 */
  var dragOrigin = null;
  var rafDrag = 0;
  var pendingMove = null;
  var rectCache = null;
  var rzId = null, rzStartY = 0, rzStartH = 0;

  /* 高度约束：太小画不出东西，太大没有意义 */
  var DEF_H = 260, MIN_H = 140, MAX_H = 2000;
  /* 分割比例约束：主位至少能显示几行日志，波形区至少能显示一个面板 */
  var RATIO_MIN = 0.20, RATIO_MAX = 0.85;
  var RATIO_DEF = 0.62;

  V.DEF_H = DEF_H;
  V.MIN_H = MIN_H;
  V.MAX_H = MAX_H;

  /* data provider：渲染器只认这个接口，不直接依赖 datastore，便于替换与测试 */
  var data = {
    channels: function () { return SL.datastore.listChannels(); },
    count: function (key) { return SL.datastore.count(key); },
    forEach: function (key, n, cb) { return SL.datastore.forEachRecent(key, n, cb); },
    copy: function (key, n) { return SL.datastore.copyRecent(key, n); },
    stat: function (key, n) { return SL.datastore.stat(key, n); },
    recentRaw: function (n) { return SL.datastore.recentRaw(n); },
    now: function () { return U.now(); }
  };
  V.data = data;

  /* ------------------------------------------------------------
     1) 槽位工具
     ------------------------------------------------------------ */
  function isMain(p) { return !!p && p.slot === "main"; }

  function hostOf(p) { return isMain(p) ? mainHost : gridHost; }

  /* 主位同一时刻只能有一个面板：新面板进主位时，旧主位退回工作区 */
  function enforceSingleMain(keepId) {
    for (var i = 0; i < panels.length; i++) {
      var p = panels[i];
      if (p.slot === "main" && p.id !== keepId) {
        p.slot = "grid";
        var el = els[p.id];
        if (el && gridHost) { gridHost.appendChild(el); }
        stylePanel(el, p);
      }
    }
  }

  /* 把描述符里的 slot / h / span 落到 DOM 上 */
  function stylePanel(el, p) {
    if (!el) { return; }
    var main = isMain(p);
    if (el.classList) {
      el.classList.toggle("sl-panel--main", main);
      el.classList.toggle("sl-panel--grid", !main);
    }
    if (main) {
      el.style.height = "";                 /* 主位高度由 C1 的 flex 决定 */
      el.style.gridColumn = "";
    } else {
      el.style.height = (p.h || DEF_H) + "px";
      el.style.gridColumn = (p.span === 2) ? "span 2" : "";
    }
  }

  /* 按 panels 数组顺序把每个面板重新挂回自己的槽位（appendChild 会移动已有节点） */
  function reflowHosts() {
    for (var i = 0; i < panels.length; i++) {
      var el = els[panels[i].id];
      if (el) { hostOf(panels[i]).appendChild(el); }
    }
  }

  function applyRatio() {
    if (!stageEl) { return; }
    var r = V.monRatio();
    stageEl.style.setProperty("--sl-mon-grow", String(Math.round(r * 1000)));
    stageEl.style.setProperty("--sl-grid-grow", String(Math.round((1 - r) * 1000)));
  }

  /* 主位是否收起 → 同步给 stage（C1 压成只剩标题条） */
  function syncMainCollapsedClass() {
    if (!stageEl) { return; }
    var mp = V.mainPanel();
    var col = false;
    if (mp && els[mp.id]) { col = els[mp.id].className.indexOf("is-collapsed") >= 0; }
    stageEl.classList.toggle("is-main-collapsed", col);
    if (core.config.ui) { core.config.ui.monCollapsed = col; }
  }

  /* ------------------------------------------------------------
     2) DOM 构建
     ------------------------------------------------------------ */
  function iconBtn(text, title, cls, onclick) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "sl-iconbtn" + (cls ? (" " + cls) : "");
    b.textContent = text;
    b.title = title;
    b.setAttribute("aria-label", title);
    /* 回传按钮自身：暂停等需要切换文字/提示的按钮直接改自己的 DOM */
    b.onclick = function (e) { e.stopPropagation(); onclick(b); };
    return b;
  }

  /* V2.2.21：面板级「清屏起点」。为什么不用 panel.opts 走 updatePanel 存：
     updatePanel 会把描述符交给 Plugins.validate 重新校验，校验只认它认识的 opts 字段，
     自定义的 clearAt 会被丢掉 —— 实测点了清屏 opts 一点没变、行数照常增长（静默失效）。
     改成：① 存在这张表里；② 原地改渲染器持有的那个面板对象（getPanel 返回的就是同一个引用），
     所以清屏当场生效、不用重建面板；③ 面板若因别的原因被重建，buildPanelEl 会把起点重新注入，
     不会出现「清过的屏自己又满了」。 */
  var viewClear = {};

  function buildPanelEl(panel) {
    /* 重建面板时把「清屏起点」重新注入，避免清过的屏自己又满了（见 viewClear 的说明） */
    if (viewClear[panel.id]) {
      panel.opts = panel.opts || {};
      panel.opts.clearAt = viewClear[panel.id];
    }
    /* 同理：重建时把「每面板通道勾选」重新注入（见 viewChanOverride 的说明） */
    if (viewChanOverride[panel.id]) {
      panel.opts = panel.opts || {};
      panel.opts.chanOn = viewChanOverride[panel.id];
    }
    if (viewTrigger[panel.id]) {
      panel.opts = panel.opts || {};
      panel.opts.trigger = viewTrigger[panel.id];
    }
    var el = document.createElement("div");
    el.className = "sl-panel";
    el.setAttribute("data-panel-id", panel.id);

    var head = document.createElement("div");
    head.className = "sl-panel-head";
    head.title = "按住拖动可调整位置";

    var title = document.createElement("span");
    title.className = "sl-panel-title";
    title.textContent = panel.title;
    head.appendChild(title);

    /* V2.2.22：标题与类型同名时**不重复显示**。
       用户看到的是「时域波形 时域波形」「频域谱 频域谱」并排，而且两者字号/字体/颜色都不同
       （标题 12.5px 粗体墨色无衬线 vs 类型 11px 细体灰等宽）——看起来就是两种格式。
       同名时它没有信息量，直接不画；不同名时保留，并把排版统一（见 app.css 的 .sl-panel-type）。 */
    var r = Plugins.get(panel.type);
    var typeLabel = r ? r.label : panel.type;
    if (typeLabel !== panel.title) {
      var type = document.createElement("span");
      type.className = "sl-panel-type";
      type.textContent = typeLabel;
      head.appendChild(type);
    }

    /* V2.2.21：收起态摘要。原先收起后只剩一个标题条，用户点开「什么都没有」——
       现在把最后一行数据留在标题旁，收起也能瞄一眼最新值（内容由 ui.js 填：业务模块不碰 DOM）。 */
    var brief = document.createElement("span");
    brief.className = "sl-panel-brief";
    head.appendChild(brief);

    /* 文本监视器：预留快捷工具条容器（时间戳 / HEX / 编码），控件由 ui.js 统一填充。
       时域波形：预留窗口调节容器（横轴采样点数）。都在标题之后、图标按钮之前。 */
    /* V2.2.25：频域谱也加进快捷条机制——窗函数要在面板上就能选（否则功能在、用户够不着） */
    if (panel.type === "textmon" || panel.type === "timeplot" || panel.type === "fftplot") {
      var quick = document.createElement("span");
      quick.className = "sl-panel-quick";
      quick.setAttribute("data-quick", "");
      if (panel.type === "timeplot") { quick.setAttribute("data-quick-plot", panel.id); }
      if (panel.type === "fftplot") { quick.setAttribute("data-quick-fft", panel.id); }
      head.appendChild(quick);
    }

    /* 文本监视器专属：清屏 + 复制纯文本。
       为什么必须有：VOFA+ 的垃圾桶就长在监视器头上，没有就会被问「为什么没有」；
       而现有的「清缓存」在主区工具条上、清的是**数据**（不可撤销），语义完全不同，替代不了。
       清屏用「视图起点」实现（panel.opts.clearAt = 当前墙钟），所以只影响这块屏，
       其他图表与已收数据都不动 —— 这才是垃圾桶该有的行为。 */
    if (panel.type === "textmon") {
      head.appendChild(iconBtn("清屏", "只清这块屏已显示的内容（其他图表与已收数据不受影响）；要连数据一起清，用主区工具条的「清缓存」", "sl-text-btn sl-clear-view", function () {
        V.clearPanelView(panel.id);
      }));
      head.appendChild(iconBtn("复制", "把监视器里的文本复制到剪贴板（可勾选：去时间戳 / 去方向标记 / 只复制可见部分 / 相邻去重）——不用截图，也不用拖着鼠标选", "sl-text-btn sl-copy-view", function () {
        /* 跨模块走事件总线，不直接引用 ui.js（子应用硬规则 6） */
        core.emit("panel:copyText", { id: panel.id });
      }));
    }

    if (isMain(panel)) {
      head.appendChild(iconBtn("⛶", "全屏显示（再点一次还原）", "is-main-only", function () {
        V.toggleMainFull();
      }));
      head.appendChild(iconBtn("▭", "收起主区（波形区占满）", "", function () {
        V.setMainCollapsed(true);
      }));
    } else {
      head.appendChild(iconBtn("⇱", "移到主位（与串口监视器互换位置）", "", function () {
        V.moveToSlot(panel.id, "main");
      }));
      head.appendChild(iconBtn("⇔", "加宽 / 还原（跨两列）", "", function () {
        V.toggleSpan(panel.id);
      }));
    }

    head.appendChild(iconBtn("⤓", "导出该图表为 PNG 图片", "", function () {
      V.exportPanelPng(panel.id).then(function (r) {
        if (r && r.ok) {
          core.emit("toast", { level: "ok", msg: "已导出图表图片：" + r.name });
        } else {
          core.emit("toast", { level: "warn", msg: (r && r.reason) || "导出图片失败" });
        }
      });
    }));

    if (panel.type === "timeplot") {
      /* 时域波形专属：Auto = 回到实时跟随 + 恢复自动量程（渲染器内部状态 + axis 清除）。
         V2.2.8：按钮带状态灯——回看历史或手动量程时高亮，一眼知道 Auto「有没有事做」。 */
      head.appendChild(iconBtn("Auto", "回到实时跟随，并恢复自动量程与默认窗口", "sl-auto-btn", function () {
        V.resetTimeplotView(panel.id);
        core.emit("toast", { level: "info", msg: "已回到实时跟随 + 自动量程" });
      }));

      /* V2.2.24：触发设置。为什么它值得占一个按钮：不做触发时波形永远在滚动，
         周期信号在屏幕上停不下来 —— 相位/超调/振铃/上升时间全都看不出来。
         按钮只发事件，弹窗与写入都在 ui.js（业务模块不碰 DOM）。 */
      head.appendChild(iconBtn("触发", "触发对齐（示波器语义）：按指定方向跨过阈值的那一刻固定在屏幕上，波形就稳住了——调电机看相位/超调/振铃必须用它", "sl-text-btn sl-trigger-btn", function () {
        core.emit("panel:trigger", { id: panel.id });
      }));

      /* V2.2.28：把游标读数一键复制出来（A-101 的「结论可复制」）。
         与「触发」按钮同一套：按钮只发事件，剪贴板与提示都在 ui.js。 */
      head.appendChild(iconBtn("复制测量", "复制游标读数（Δt / Δy / 斜率）：先在波形上按住 Shift 点两下放游标", "sl-text-btn sl-meas-copy", function () {
        core.emit("panel:copyMeasure", { id: panel.id });
      }));
      
    }

    /* 面板级暂停：只冻结这张卡片的重绘（数据照收），与顶栏全局暂停互不影响 */
    head.appendChild(iconBtn("⏸", "暂停 / 恢复此面板刷新（数据仍在后台缓冲）", "is-pause", function (btn) {
      var paused = V.togglePanelPause(panel.id);
      /* ⚠ 这里曾经写的是 this.textContent —— iconBtn 的回调是 onclick(b) 形式，
         this 既不是按钮（严格模式下是 undefined，非严格下是 window），
         于是赋值**静默失败**：点下去其实暂停了，但「⏸」永远不变成「▶」，
         用户看到的就是「点了没反应」。回调的第一个参数才是按钮本身。 */
      btn.textContent = paused ? "▶" : "⏸";
      btn.title = paused ? "恢复此面板刷新" : "暂停 / 恢复此面板刷新（数据仍在后台缓冲）";
    }));

    /* V2.2.21：收起/展开按钮改用文字。
       原先是一个「▾」——三角在所有人的直觉里都等于「下拉菜单」，点下去却是收起面板，
       于是用户报「箭头为什么点不开」。文字按钮没有歧义，也顺带给出当前状态。 */
    head.appendChild(iconBtn("收起", "收起 / 展开该面板（收起后标题旁仍显示最后一行数据）", "sl-text-btn sl-collapse-btn", function (btn) {
      V.toggleCollapse(panel.id);
      /* 同样用回调参数而不是 this：iconBtn 的回调签名是 onclick(b)（见上面暂停按钮的说明） */
      btn.textContent = V.isCollapsed(panel.id) ? "展开" : "收起";
    }));

    head.appendChild(iconBtn("✕", "移除该面板", "is-del", function () {
      V.removePanel(panel.id);
    }));

    head.addEventListener("pointerdown", function (e) {
      /* 点在按钮 / 表单控件上不触发拖拽 */
      var tn = e.target && e.target.tagName;
      if (tn === "BUTTON" || tn === "SELECT" || tn === "INPUT" || tn === "LABEL") { return; }
      startDrag(panel.id, e);
    });

    el.appendChild(head);

    /* V2.2.22：通道图例（可点，就地显隐）。挂在 head 与 body **之间**：
       ① body 必须保持 el.lastElementChild —— 这是 Plugins.instantiate(panel, el.lastElementChild)
          的既有约定（右下角缩放手柄因此也挂在 body 内部，见下面的注释）；
       ② 图例本身用绝对定位浮在画布左上角（见 app.css 的 .sl-legend），不占布局高度，
          所以放在 head 前后不影响视觉。
       内容与点击事件全部由 ui.js 负责填 —— business 模块不碰 DOM（硬规则 5），views 只建壳。 */
    if (panel.type !== "textmon") {
      var legend = document.createElement("div");
      legend.className = "sl-legend";
      legend.setAttribute("data-legend", panel.id);
      el.appendChild(legend);
    }

    var body = document.createElement("div");
    body.className = "sl-panel-body";
    el.appendChild(body);

    /* 工作区面板右下角给一个缩放手柄：纵向拖改高度，双击复位默认高度。
       手柄挂在 body 内部（而不是 el 末尾），这样 el.lastElementChild 始终是 body，
       Plugins.instantiate(panel, el.lastElementChild) 的既有约定不被破坏。 */
    if (!isMain(panel)) {
      var grip = document.createElement("div");
      grip.className = "sl-panel-grip";
      grip.title = "拖动改高度 · 双击复位默认高度";
      grip.addEventListener("pointerdown", function (e) {
        e.stopPropagation();
        if (e.preventDefault) { e.preventDefault(); }
        startResize(panel.id, e);
      });
      grip.addEventListener("dblclick", function (e) {
        e.stopPropagation();
        V.setPanelHeight(panel.id, DEF_H);
      });
      body.appendChild(grip);
    }

    stylePanel(el, panel);
    if (panel.type === "timeplot") { syncAutoBtn(panel.id); }   /* 重建后按当前状态补状态灯 */
    return el;
  }

  /* ------------------------------------------------------------
     3) 拖拽排序（手写 pointer 事件，不依赖任何库）
     拖动过程中实时把元素插入到「同一槽位里离指针最近的其它面板」的前/后，松手提交。
     ------------------------------------------------------------ */
  function startDrag(id, e) {
    if (!els[id]) { return; }
    dragId = id;
    var el = els[id];
    el.classList.add("is-dragging");
    el.style.transform = "";
    dragOrigin = { x: e.clientX, y: e.clientY };
    rectCache = null;
    pendingMove = null;
    if (e.preventDefault) { e.preventDefault(); }

    var move = function (ev) {
      /* V2.2.23：只记住最新一次事件，真正的计算交给下一帧 —— 指针事件在 120Hz 下
         每秒能来上百次，而每次计算都要读一圈兄弟面板的矩形（强制同步布局）。
         合并到一帧一次，是「丝滑」最直接的一步。 */
      pendingMove = ev;
      if (!rafDrag) { rafDrag = global.requestAnimationFrame(flushDrag); }
    };
    var up = function () {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      if (rafDrag) { global.cancelAnimationFrame(rafDrag); rafDrag = 0; }
      pendingMove = null;
      rectCache = null;
      if (dragId && els[dragId]) {
        els[dragId].classList.remove("is-dragging");
        els[dragId].style.transform = "";   /* 松手后与真实布局位置对齐 */
      }
      dragId = null;
      commitOrder();
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  }

  function flushDrag() {
    rafDrag = 0;
    var ev = pendingMove;
    pendingMove = null;
    if (!ev || !dragId) { return; }
    followPointer(ev);
    onDragMove(ev);
  }

  /* 跟手平移：只改 transform，不碰任何会引起重排的属性。
     这是「拖起来跟手」的关键 —— 改 left/top/margin 会引发整页重排，改 transform 只走合成层。 */
  function followPointer(e) {
    var el = els[dragId];
    if (!el || !dragOrigin) { return; }
    var dx = Math.round(e.clientX - dragOrigin.x);
    var dy = Math.round(e.clientY - dragOrigin.y);
    el.style.transform = "translate(" + dx + "px," + dy + "px)";
  }

  /* 一帧内复用兄弟面板的矩形：同一帧里不再重复读布局。
     只有真正发生重排（insertBefore）时才置空，下一帧重新取。 */
  function kidRects(host, el) {
    if (rectCache) { return rectCache; }
    var out = [];
    for (var i = 0; i < host.children.length; i++) {
      var n = host.children[i];
      if (n !== el && n.className && n.className.indexOf("sl-panel") >= 0) {
        out.push({ node: n, rect: n.getBoundingClientRect() });
      }
    }
    rectCache = out;
    return out;
  }

  function onDragMove(e) {
    if (!dragId) { return; }
    var el = els[dragId];
    var p = V.getPanel(dragId);
    if (!el || !p) { return; }
    var host = hostOf(p);
    if (!host) { return; }

    var kids = kidRects(host, el);
    if (!kids.length) { return; }

    var best = null, bestRect = null, bestDist = Infinity;
    for (var j = 0; j < kids.length; j++) {
      var r = kids[j].rect;
      var cx = r.left + r.width / 2;
      var cy = r.top + r.height / 2;
      var d = Math.abs(e.clientX - cx) + Math.abs(e.clientY - cy);
      if (d < bestDist) { bestDist = d; best = kids[j].node; bestRect = r; }
    }
    if (!best) { return; }

    var br = bestRect;
    var relY = e.clientY - (br.top + br.height / 2);
    var relX = e.clientX - (br.left + br.width / 2);
    /* 主位是单块区域，只看上下半区；
       栅格里先看纵向（换行意图明确），纵向几乎持平（同一行内左右移动）时改用横向判断，
       否则跨列面板会让同一行内的左右拖拽完全没反应。 */
    var insertBefore = isMain(p)
      ? (relY < 0)
      : (Math.abs(relY) > br.height * 0.3 ? (relY < 0) : (relX < 0));

    var moved = false;
    if (insertBefore) {
      if (best.previousSibling !== el) { host.insertBefore(el, best); moved = true; }
    } else {
      if (best.nextSibling !== el) { host.insertBefore(el, best.nextSibling); moved = true; }
    }
    if (moved) {
      /* 重排后元素换了位置，而 transform 是相对**当前位置**的 —— 必须重置基准与位移，
         否则会看到「跳一下又飘回去」。重置后表现为「吸附进目标槽位」，这正是拖拽该有的反馈。 */
      rectCache = null;
      el.style.transform = "";
      dragOrigin = { x: e.clientX, y: e.clientY };
    }
  }

  /* 把 DOM 顺序同步到 panels 数组与配置（按槽位分别提交） */
  function commitOrder() {
    if (!gridHost) { return; }
    var newOrder = [];
    var hosts = [mainHost, gridHost];
    for (var h = 0; h < hosts.length; h++) {
      if (!hosts[h]) { continue; }
      for (var i = 0; i < hosts[h].children.length; i++) {
        var n = hosts[h].children[i];
        var pid = n.getAttribute && n.getAttribute("data-panel-id");
        if (pid) { newOrder.push(pid); }
      }
    }
    var sorted = [];
    for (var k = 0; k < newOrder.length; k++) {
      for (var m = 0; m < panels.length; m++) {
        if (panels[m].id === newOrder[k]) { sorted.push(panels[m]); break; }
      }
    }
    if (sorted.length === panels.length) { panels = sorted; }
    V.save();
    core.emit("panels:changed", { reason: "order" });
  }

  /* ------------------------------------------------------------
     4) 拖拽改高
     ------------------------------------------------------------ */
  function startResize(id, e) {
    var p = V.getPanel(id);
    if (!p || isMain(p)) { return; }
    rzId = id;
    rzStartY = e.clientY;
    rzStartH = p.h || DEF_H;
    if (els[id]) { els[id].classList.add("is-resizing"); }

    var move = function (ev) { onResizeMove(ev); };
    var up = function () {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      if (rzId && els[rzId]) { els[rzId].classList.remove("is-resizing"); }
      rzId = null;
      V.save();
      core.emit("panels:changed", { reason: "resize" });
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  }

  function onResizeMove(e) {
    var p = V.getPanel(rzId);
    if (!p) { return; }
    p.h = Math.round(U.clamp(rzStartH + (e.clientY - rzStartY), MIN_H, MAX_H));
    if (els[p.id]) { els[p.id].style.height = p.h + "px"; }
    if (instances[p.id] && instances[p.id].resize) {
      try { instances[p.id].resize(); } catch (err) { /* 单个面板适配失败不影响拖动 */ }
    }
  }

  V.setPanelHeight = function (id, h) {
    var p = V.getPanel(id);
    if (!p) { return null; }
    p.h = Math.round(U.clamp(h, MIN_H, MAX_H));
    stylePanel(els[id], p);
    if (instances[id] && instances[id].resize) {
      try { instances[id].resize(); } catch (e) { /* 忽略 */ }
    }
    V.save();
    V.redraw();
    return p.h;
  };

  V.toggleSpan = function (id) {
    var p = V.getPanel(id);
    if (!p || isMain(p)) { return null; }
    p.span = (p.span === 2) ? 1 : 2;
    stylePanel(els[id], p);
    if (instances[id] && instances[id].resize) {
      try { instances[id].resize(); } catch (e) { /* 忽略 */ }
    }
    V.save();
    V.redraw();
    return p.span;
  };

  /* ------------------------------------------------------------
     5) 面板增删与停靠位
     ------------------------------------------------------------ */
  V.addPanel = function (desc, silent) {
    if (!gridHost) { return null; }
    /* 监视器面板的显示开关跟随全局配置（时间戳 / HEX 显示）：
       只在该面板未显式指定时播种，导入的面板包里的显式设置优先。
       这里是所有面板的唯一入口，覆盖「+串口监视器」「插件页新增」
       「启动恢复配置面板」「首次默认面板」四条路径。 */
    if (desc && desc.type === "textmon") {
      desc = U.clone(desc);
      desc.opts = desc.opts || {};
      if (desc.opts.showTimestamp === undefined) {
        desc.opts.showTimestamp = core.config.transport.showTimestamp !== false;
      }
      if (desc.opts.showHex === undefined) {
        desc.opts.showHex = !!core.config.transport.hexRecv;
      }
    }
    var res = Plugins.validate(desc);
    if (!res.panel) {
      core.log("error", "面板描述符不可用：" + res.errors.join("；"));
      return null;
    }
    var panel = res.panel;
    /* id 去重，避免导入重复面板时互相覆盖 */
    var guard = 0;
    while (els[panel.id] && guard++ < 1000) { panel.id = U.nextId("p"); }

    if (res.errors.length) {
      core.log("warn", "面板「" + panel.title + "」已自动修正：" + res.errors.join("；"));
      if (!silent) { core.emit("toast", { level: "warn", msg: "面板配置已自动修正：" + res.errors[0] }); }
    }

    if (isMain(panel)) { enforceSingleMain(panel.id); }

    var el = buildPanelEl(panel);
    hostOf(panel).appendChild(el);
    els[panel.id] = el;
    panels.push(panel);

    var inst = Plugins.instantiate(panel, el.lastElementChild);
    instances[panel.id] = inst;

    syncMainCollapsedClass();
    V.save();
    core.emit("panels:changed", { reason: "add", panel: panel });
    if (!silent) { V.redraw(); }
    return panel;
  };

  V.removePanel = function (id) {
    var el = els[id];
    var inst = instances[id];
    if (inst && inst.destroy) {
      try { inst.destroy(); } catch (e) { /* 单个面板销毁失败不影响其它 */ }
    }
    if (el && el.parentNode) { el.parentNode.removeChild(el); }
    delete els[id];
    delete instances[id];
    for (var i = panels.length - 1; i >= 0; i--) {
      if (panels[i].id === id) { panels.splice(i, 1); }
    }
    syncMainCollapsedClass();
    V.save();
    core.emit("panels:changed", { reason: "remove", id: id });
  };

  /* 切换停靠位：把面板在 C1（主位）与 C2（工作区）之间搬运。
     做法是「重建面板 + 重建渲染器」而不是搬 DOM 节点：
       a) 主位与工作区的头部按钮组不同，复用头部会带错按钮；
       b) canvas 渲染器持有创建时的宿主引用，直接把 canvas 搬到新宿主
          会让它一直按旧宿主（已脱离文档）量尺寸，画布会塌成 0×0。
     代价只是重建一次渲染器——数据都在 datastore 里，下一帧就重画出来。 */
  V.moveToSlot = function (id, slot) {
    var p = V.getPanel(id);
    if (!p) { return null; }
    slot = (slot === "main") ? "main" : "grid";
    if (p.slot === slot) { return p; }

    p.slot = slot;
    if (slot === "main") { enforceSingleMain(id); }

    var old = els[id];
    if (instances[id] && instances[id].destroy) {
      try { instances[id].destroy(); } catch (e) { /* 忽略 */ }
    }
    if (old && old.parentNode) { old.parentNode.removeChild(old); }

    var el = buildPanelEl(p);
    hostOf(p).appendChild(el);
    els[id] = el;
    instances[id] = Plugins.instantiate(p, el.lastElementChild);

    syncMainCollapsedClass();
    V.save();
    core.emit("panels:changed", { reason: "slot", panel: p });
    V.redraw();
    return p;
  };

  V.toggleCollapse = function (id) {
    var el = els[id];
    if (!el) { return; }
    var collapsed = el.className.indexOf("is-collapsed") >= 0;
    el.className = collapsed
      ? el.className.replace(/\s*is-collapsed/, "")
      : el.className + " is-collapsed";
    syncMainCollapsedClass();
    if (collapsed && instances[id] && instances[id].resize) {
      /* 展开后画布尺寸变了，补一次适配 */
      setTimeout(function () {
        if (instances[id] && instances[id].resize) { instances[id].resize(); }
        V.redraw();
      }, 0);
    }
  };

  V.isCollapsed = function (id) {
    var el = els[id];
    return !!(el && el.className.indexOf("is-collapsed") >= 0);
  };

  /* V2.2.21：只清这块屏 —— 给面板记一个「视图起点」（墙钟毫秒），渲染器只显示比它新的行。
     为什么不用「清数据」来实现：那会连其他图表和原始记录一起清掉、而且不可撤销，
     而垃圾桶的语义只是「这块屏看烦了，清一下」。
     为什么用时间戳而不是记录序号：原始记录本来就带 tWall（时间戳列用的就是它），
     不必为了清屏再给数据仓加一个全局序号——少一个真源就少一处漂移。 */
  V.clearPanelView = function (id) {
    var p = V.getPanel(id);
    if (!p) { return false; }
    var at = Date.now();
    viewClear[id] = at;
    p.opts = p.opts || {};
    p.opts.clearAt = at;      /* 渲染器持有同一个对象引用，原地改即可立刻生效 */
    V.redraw();               /* 不等下一帧：清屏要「点下去就空」 */
    core.emit("toast", { level: "info", msg: "已清屏：只清了这块面板的显示，数据与其他图表都还在" });
    return true;
  };

  /* ------------------------------------------------------------------
     V2.2.22：每面板的通道勾选（覆盖表）
     用户的原话是「通道里的勾选算汇总冗余，拆开了容易怎么融合呢」——所以：
       · 通道列表里的勾选仍然是**全局**默认值；
       · 每块图表面板可以**独立覆盖**某几个通道（这里存 panelId → {key: bool}）；
       · **手动**入口两个：「应用给其他图表」「恢复统一」——不自动替用户决定
         （用户明确说过自动拆/合不准确）。
     为什么存这张表而不写进面板描述符：描述符走 updatePanel/validate 会丢掉自定义
     opts 字段（clearAt 那次实测踩过），所以与 viewClear 同一套路 ——
     存这里 + buildPanelEl 重建时重新注入。
     ------------------------------------------------------------------ */
  var viewChanOverride = {};

  V.panelChanOverride = function (id) { return viewChanOverride[id] || null; };

  /* 就地改渲染器持有的那个面板对象（getPanel 返回同一引用），当即生效、不必重建面板 */
  V.setPanelChan = function (id, key, on) {
    var p = V.getPanel(id);
    if (!p || !key) { return false; }
    var map = viewChanOverride[id] || (viewChanOverride[id] = {});
    map[key] = !!on;
    p.opts = p.opts || {};
    p.opts.chanOn = map;
    V.redraw();
    return true;
  };

  /* 恢复统一：清掉这块屏的全部覆盖，重新跟随全局勾选 */
  V.clearPanelChan = function (id) {
    var p = V.getPanel(id);
    if (!p) { return false; }
    delete viewChanOverride[id];
    if (p.opts) { delete p.opts.chanOn; }
    V.redraw();
    return true;
  };

  /* 手动「应用给其他图表」：把这块屏的覆盖并给所有图表面板（监视器不参与，它显示的是行不是通道） */
  /* ------------------------------------------------------------------
     V2.2.24：每面板的触发设置（示波器语义）
     与 viewChanOverride 同一套路（存表 + buildPanelEl 重建时重新注入）——
     面板描述符走 updatePanel/validate 会丢掉自定义 opts 字段，这个坑已经踩过一次。
     触发开启时渲染器会多取一屏数据并做对齐，见 plugins.js 的 applyTrigger。
     ------------------------------------------------------------------ */
  var viewTrigger = {};

  V.panelTrigger = function (id) { return viewTrigger[id] || null; };

  V.setPanelTrigger = function (id, tr) {
    var p = V.getPanel(id);
    if (!p) { return false; }
    if (!tr || !tr.on) {
      delete viewTrigger[id];
      if (p.opts) { delete p.opts.trigger; }
    } else {
      viewTrigger[id] = tr;
      p.opts = p.opts || {};
      p.opts.trigger = tr;
    }
    V.redraw();
    return true;
  };  V.applyPanelChanToAll = function (id) {
    var src = viewChanOverride[id];
    if (!src) { return 0; }
    var n = 0;
    for (var i = 0; i < panels.length; i++) {
      var t = panels[i];
      if (t.id === id || t.type === "textmon") { continue; }
      var map = viewChanOverride[t.id] || (viewChanOverride[t.id] = {});
      for (var k in src) {
        if (Object.prototype.hasOwnProperty.call(src, k)) { map[k] = src[k]; }
      }
      t.opts = t.opts || {};
      t.opts.chanOn = map;
      n++;
    }
    V.redraw();
    return n;
  };

  /* V2.2.12：清空面板支持撤销——清空前快照全部面板描述符，恢复时逐个重建 */
  var clearSnapshot = null;

  V.clearPanels = function () {
    if (panels.length) { clearSnapshot = JSON.parse(JSON.stringify(panels)); }
    var ids = [];
    for (var i = 0; i < panels.length; i++) { ids.push(panels[i].id); }
    for (var j = 0; j < ids.length; j++) { V.removePanel(ids[j]); }
  };

  V.canUndoClear = function () { return !!clearSnapshot; };

  /* 撤销清空：按快照原样重建（id/窗口/量程/配色都保留），返回恢复的面板数 */
  V.undoClearPanels = function () {
    if (!clearSnapshot) { return 0; }
    var snap = clearSnapshot;
    clearSnapshot = null;
    var n = 0;
    for (var i = 0; i < snap.length; i++) {
      try { V.addPanel(U.clone(snap[i]), true); n++; }
      catch (e) { /* 单个恢复失败不拖累其它 */ }
    }
    V.redraw();
    core.emit("panels:changed", { reason: "undo-clear" });
    return n;
  };

  V.list = function () {
    var out = [];
    for (var i = 0; i < panels.length; i++) { out.push(U.clone(panels[i])); }
    return out;
  };

  V.getPanel = function (id) {
    for (var i = 0; i < panels.length; i++) { if (panels[i].id === id) { return panels[i]; } }
    return null;
  };

  /* ------------------------------------------------------------
     画布导出 PNG（让「人写文档」和「AI 看图」都有素材）
     做法刻意通用：不要求每个渲染器各自实现导出，而是把该面板里的所有 <canvas>
     合成到一张带标题 / 类型 / 时间戳 / 主题底色的新画布上。
     好处是 7 个画布渲染器一次性全覆盖，将来新增渲染器也不必改这里。
     DOM 型渲染器（文本监视器 / 数据表格）没有画布 —— 明确告知，而不是给一张空图。
     ------------------------------------------------------------ */
  function panelElById(id) {
    return document.querySelector('.sl-panel[data-panel-id="' + id + '"]');
  }

  function liveCanvases(el) {
    var list = el ? el.querySelectorAll("canvas") : [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].width > 0 && list[i].height > 0) { out.push(list[i]); }
    }
    return out;
  }

  /* 底色与字色都从实际计算样式取，避免在渲染层硬编码主题色 */
  function pngColors(el) {
    var bg = "#ffffff", ink = "#111111";
    try {
      var cs = global.getComputedStyle(el);
      if (cs && cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)") { bg = cs.backgroundColor; }
      var hs = global.getComputedStyle(el.querySelector(".sl-panel-head"));
      if (hs && hs.color) { ink = hs.color; }
    } catch (e) { /* 样式取不到就用兜底色 */ }
    return { bg: bg, ink: ink };
  }

  /* 时间戳用墙钟（绝对时刻），与监视器口径一致 */
  function pngStamp(d) {
    d = d || new Date();
    return d.getFullYear() + "-" + U.pad2(d.getMonth() + 1) + "-" + U.pad2(d.getDate())
      + " " + U.pad2(d.getHours()) + ":" + U.pad2(d.getMinutes()) + ":" + U.pad2(d.getSeconds());
  }

  /* 合成一张面板图。返回 canvas；没有画布时返回 null */
  function composePanel(el, panel) {
    var cans = liveCanvases(el);
    if (!cans.length) { return null; }
    var pad = 12, headH = 34, gap = 8;
    var w = 0, h = pad + headH;
    for (var i = 0; i < cans.length; i++) {
      if (cans[i].width > w) { w = cans[i].width; }
      h += cans[i].height + gap;
    }
    w += pad * 2;
    h += pad;

    var col = pngColors(el);
    var out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    var g = out.getContext("2d");
    if (!g) { return null; }
    g.fillStyle = col.bg;
    g.fillRect(0, 0, w, h);

    /* 标题行：面板标题 + 渲染器 + 生成时刻 —— AI 读图时靠这一行知道「看的是什么」 */
    g.fillStyle = col.ink;
    g.textBaseline = "middle";
    g.font = "500 15px system-ui, -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif";
    g.fillText(String(panel.title || "图表"), pad, pad + 12);
    var r = Plugins.get(panel.type);
    var sub = (r ? r.label : panel.type) + " · " + pngStamp();
    g.font = "400 12px system-ui, -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif";
    g.fillText(sub, w - pad - g.measureText(sub).width, pad + 13);
    g.globalAlpha = 0.35;
    g.fillRect(pad, pad + headH - 6, w - pad * 2, 1);
    g.globalAlpha = 1;

    var y = pad + headH;
    for (var j = 0; j < cans.length; j++) {
      g.drawImage(cans[j], pad, y, cans[j].width, cans[j].height);
      y += cans[j].height + gap;
    }
    return out;
  }

  function canvasToBlob(canvas) {
    return new Promise(function (resolve) {
      if (canvas.toBlob) {
        canvas.toBlob(function (b) { resolve(b); }, "image/png");
        return;
      }
      try {
        var url = canvas.toDataURL("image/png");
        var bin = global.atob(url.split(",")[1]);
        var u8 = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) { u8[i] = bin.charCodeAt(i); }
        resolve(new Blob([u8], { type: "image/png" }));
      } catch (e) { resolve(null); }
    });
  }

  function safeName(s) {
    return String(s == null ? "" : s).replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 40);
  }

  /* 导出单个面板为 PNG（文件名带面板名与时刻，便于多轮迭代时对照） */
  V.exportPanelPng = function (id) {
    var panel = V.getPanel(id);
    var el = panelElById(id);
    if (!panel || !el) { return Promise.resolve({ ok: false, reason: "找不到该图表" }); }
    var canvas = composePanel(el, panel);
    if (!canvas) {
      return Promise.resolve({ ok: false, reason: "该图表不是画布渲染器（文本监视器 / 数据表格无法导出为图片）" });
    }
    return canvasToBlob(canvas).then(function (b) {
      if (!b) { return { ok: false, reason: "浏览器拒绝生成图片" }; }
      var name = "seriallab-" + safeName(panel.title) + "-" + pngStamp().replace(/[: ]/g, "") + ".png";
      var ok = U.download(b, name);
      return { ok: !!ok, name: name };
    });
  };

  /* 导出全部画布面板：串行下载（浏览器对并发下载有节流，串行更可靠） */
  V.exportAllPng = function () {
    var ids = [];
    for (var i = 0; i < panels.length; i++) { ids.push(panels[i].id); }
    var done = 0, fail = 0;
    return ids.reduce(function (p, id) {
      return p.then(function () {
        return V.exportPanelPng(id).then(function (r) {
          if (r && r.ok) { done++; } else { fail++; }
        });
      });
    }, Promise.resolve(null)).then(function () {
      return { ok: done > 0, done: done, fail: fail, total: ids.length };
    });
  };

  V.count = function () { return panels.length; };

  V.mainPanel = function () {
    for (var i = 0; i < panels.length; i++) { if (panels[i].slot === "main") { return panels[i]; } }
    return null;
  };

  /* 更新面板描述符（插件编辑器用）——重建该面板以应用新配置 */
  V.updatePanel = function (id, patch) {
    var old = V.getPanel(id);
    if (!old) { return null; }
    var merged = U.clone(old);
    for (var k in patch) { if (Object.prototype.hasOwnProperty.call(patch, k)) { merged[k] = patch[k]; } }
    merged.id = id;

    var index = -1;
    for (var i = 0; i < panels.length; i++) { if (panels[i].id === id) { index = i; } }
    var el = els[id];
    if (el && el.parentNode) { el.parentNode.removeChild(el); }
    if (instances[id] && instances[id].destroy) {
      try { instances[id].destroy(); } catch (e) { /* 忽略 */ }
    }
    delete els[id];
    delete instances[id];
    if (index >= 0) { panels.splice(index, 1); }
    if (index < 0) { index = panels.length; }

    var res = Plugins.validate(merged);
    if (!res.panel) { return null; }
    var panel = res.panel;
    panel.id = id;

    if (isMain(panel)) { enforceSingleMain(panel.id); }
    panels.splice(index, 0, panel);

    var newEl = buildPanelEl(panel);
    els[panel.id] = newEl;
    instances[panel.id] = Plugins.instantiate(panel, newEl.lastElementChild);
    reflowHosts();

    syncMainCollapsedClass();
    V.save();
    core.emit("panels:changed", { reason: "update", panel: panel });
    V.redraw();
    return panel;
  };

  /* ------------------------------------------------------------
     6) 主区形态：分割比例 / 全屏 / 收起
     ------------------------------------------------------------ */
  V.setMonRatio = function (r) {
    if (!(typeof r === "number") || !isFinite(r)) { return V.monRatio(); }
    core.config.ui.monRatio = U.clamp(r, RATIO_MIN, RATIO_MAX);
    applyRatio();
    setTimeout(function () {
      for (var id in instances) {
        if (Object.prototype.hasOwnProperty.call(instances, id) && instances[id] && instances[id].resize) {
          try { instances[id].resize(); } catch (e) { /* 忽略 */ }
        }
      }
      V.redraw();
    }, 0);
    core.emit("config:dirty", { scope: "ui" });
    return core.config.ui.monRatio;
  };

  V.monRatio = function () {
    var r = core.config.ui && core.config.ui.monRatio;
    return U.clamp((typeof r === "number" && isFinite(r)) ? r : RATIO_DEF, RATIO_MIN, RATIO_MAX);
  };

  V.toggleMainFull = function () {
    if (!stageEl) { return false; }
    var on = !stageEl.classList.contains("is-main-full");
    stageEl.classList.toggle("is-main-full", on);
    setTimeout(function () { V.redraw(); }, 0);
    return on;
  };

  V.isMainFull = function () { return !!(stageEl && stageEl.classList.contains("is-main-full")); };

  V.setMainCollapsed = function (on) {
    var mp = V.mainPanel();
    if (!mp) { return false; }
    var col = V.isCollapsed(mp.id);
    if (!!on !== col) { V.toggleCollapse(mp.id); }
    return !!on;
  };

  V.isMainCollapsed = function () {
    var mp = V.mainPanel();
    return !!mp && V.isCollapsed(mp.id);
  };

  /* ------------------------------------------------------------
     7) 渲染循环
     ------------------------------------------------------------ */
  function frame() {
    if (!running) { return; }
    rafId = global.requestAnimationFrame(frame);
    if (core.state.paused) { return; }        /* 暂停：不刷屏，但缓冲照收 */
    var now = U.now();
    if (now - lastDraw < drawInterval) { return; }
    lastDraw = now;
    V.redraw();
  }

  /* 立即重绘全部（可见）面板；单个面板异常被隔离 */
  var pausedPanels = {};   /* V2.2.6：面板级暂停——只冻结该面板重绘，数据照收 */

  V.redraw = function () {
    if (!gridHost) { return; }
    for (var i = 0; i < panels.length; i++) {
      var p = panels[i];
      var el = els[p.id];
      var inst = instances[p.id];
      if (!el || !inst) { continue; }
      if (el.className.indexOf("is-collapsed") >= 0) { continue; }
      if (pausedPanels[p.id]) { continue; }
      /* 滚动出视口的面板暂不重绘，省 CPU（主位永远可见，不做剔除） */
      var body = el.lastElementChild;
      if (!isMain(p) && body) {
        var rc = body.getBoundingClientRect();
        if (rc.bottom < -80 || rc.top > (global.innerHeight || 800) + 80) { continue; }
      }
      try {
        inst.update(data);
      } catch (e) {
        core.log("error", "面板「" + p.title + "」渲染异常：" + ((e && e.message) || e));
        /* 换成一个空实现，避免每帧刷日志、也避免整个工作区被一个坏面板拖停 */
        var host = el.lastElementChild;
        host.textContent = "";
        var msg = document.createElement("div");
        msg.className = "sl-panel-msg";
        msg.textContent = "该图框渲染出错，已停止刷新（可移除后重新添加）";
        host.appendChild(msg);
        instances[p.id] = { update: function () {}, resize: function () {}, destroy: function () {} };
      }
    }
  };

  /* 面板级暂停：切换并返回新状态（true=已暂停） */
  V.togglePanelPause = function (id) {
    pausedPanels[id] = !pausedPanels[id];
    if (!pausedPanels[id]) { V.redraw(); }   /* 恢复时立刻画一帧，不必等下个节拍 */
    return !!pausedPanels[id];
  };
  V.isPanelPaused = function (id) { return !!pausedPanels[id]; };

  /* 单帧重绘：绕过面板级暂停（手动拖动/缩放时画面必须响应——
     「暂停」只停自动刷新，不该把手动视角操作也冻成没反应） */
  V.renderPanelOnce = function (id) {
    var el = els[id];
    var inst = instances[id];
    if (!el || !inst) { return; }
    try { inst.update(data); } catch (e) { /* 渲染异常由 redraw 的隔离逻辑处理 */ }
  };

  /* 时域波形 Auto：清手动 Y 轴 + 通知渲染器回实时跟随（渲染器内部状态自己清） */
  var timeplotLiveState = {};   /* id -> true(实时跟随) / false(回看历史) */

  /* 同步 Auto 按钮状态灯：回看历史或手动量程 → 高亮（is-off 类，橙色） */
  function syncAutoBtn(id) {
    var elp = els[id];
    if (!elp) { return; }
    var btn = elp.querySelector(".sl-auto-btn");
    if (!btn) { return; }
    var p = V.getPanel(id);
    var manual = !!(p && p.axis && (p.axis.yMin !== undefined || p.axis.yMax !== undefined));
    var live = timeplotLiveState[id] !== false;
    var off = !live || manual;
    btn.className = "sl-iconbtn sl-auto-btn" + (off ? " is-off" : "");
    btn.title = off
      ? "当前处于回看历史或手动量程——点此回到实时并恢复自动"
      : "回到实时跟随，并恢复自动量程与默认窗口（当前已是实时+自动）";
  }

  V.resetTimeplotView = function (id) {
    var p = V.getPanel(id);
    if (p && p.axis) { p.axis = {}; }
    timeplotLiveState[id] = true;
    if (SL.plugins.resetTimeplot) { SL.plugins.resetTimeplot(id); }
    V.save();
    syncAutoBtn(id);
    V.redraw();
  };

  /* 渲染器在回看/实时切换时回调（拖动、双击、滚轮都会改变视角） */
  V.setTimeplotViewLive = function (id, live) {
    timeplotLiveState[id] = !!live;
    syncAutoBtn(id);
  };
  /* 面板重建后按钮是新的，按当前状态补一次灯 */
  V.refreshTimeplotBtn = function (id) { syncAutoBtn(id); };

  V.start = function () {
    if (running) { return; }
    running = true;
    rafId = global.requestAnimationFrame(frame);
  };

  V.stop = function () {
    running = false;
    if (rafId) { global.cancelAnimationFrame(rafId); rafId = null; }
  };

  V.isRunning = function () { return running; };

  V.setDrawInterval = function (ms) {
    drawInterval = Math.max(16, Math.min(1000, ms || 40));
  };

  V.drawInterval = function () { return drawInterval; };

  /* 运行 / 暂停（顶栏绿圆标）：暂停只停显示，数据继续进缓冲，恢复后接着看 */
  V.setPaused = function (on) {
    core.set("paused", !!on);
    if (core.state.paused) { V.stop(); }
    else { V.start(); V.redraw(); }
    return !!core.state.paused;
  };

  V.isPaused = function () { return !!core.state.paused; };

  /* ------------------------------------------------------------
     8) 配置持久化
     ------------------------------------------------------------ */
  V.save = function () {
    core.config.panels = V.list();
    core.config.ui.layout = (function () {
      var ids = [];
      for (var i = 0; i < panels.length; i++) { ids.push(panels[i].id); }
      return ids;
    })();
    core.emit("config:dirty", {});
  };

  /* 按配置里的顺序重排（启动时用） */
  function applyLayoutOrder() {
    var layout = (core.config.ui && core.config.ui.layout) || [];
    if (!layout.length) { return; }
    var sorted = [];
    for (var k = 0; k < layout.length; k++) {
      for (var m = 0; m < panels.length; m++) {
        if (panels[m].id === layout[k]) { sorted.push(panels[m]); break; }
      }
    }
    if (sorted.length === panels.length) { panels = sorted; }
    reflowHosts();
  }

  /* ------------------------------------------------------------
     9) 分割线拖拽（含键盘可达）
     ------------------------------------------------------------ */
  function wireSplit() {
    if (!splitEl || !stageEl) { return; }

    var startY = 0, startRatio = 0, baseH = 1, dragging = false;

    function move(ev) {
      if (!dragging) { return; }
      V.setMonRatio(startRatio + (ev.clientY - startY) / baseH);
    }
    function up() {
      if (!dragging) { return; }
      dragging = false;
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      if (splitEl.classList) { splitEl.classList.remove("is-active"); }
      core.saveConfig();
    }
    splitEl.addEventListener("pointerdown", function (e) {
      if (e.preventDefault) { e.preventDefault(); }
      dragging = true;
      startY = e.clientY;
      startRatio = V.monRatio();
      /* 以 .sl-stage 的高度为基准：这样手指的位移与视觉位移一致，拖动不会飘 */
      baseH = Math.max(1, stageEl.getBoundingClientRect().height);
      if (splitEl.classList) { splitEl.classList.add("is-active"); }
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up);
    });

    /* 键盘可达：上下键微调，Home 复位 */
    splitEl.addEventListener("keydown", function (e) {
      var r = V.monRatio();
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        V.setMonRatio(r + (e.key === "ArrowUp" ? -0.02 : 0.02));
      } else if (e.key === "Home") {
        e.preventDefault();
        V.setMonRatio(RATIO_DEF);
      }
    });
  }

  /* ------------------------------------------------------------
     10) 初始化
     ------------------------------------------------------------ */
  V.init = function (grid, opts) {
    opts = opts || {};
    gridHost = grid;
    mainHost = opts.mainHost || null;
    stageEl = opts.stage || null;
    splitEl = opts.split || null;
    if (opts.drawInterval) { V.setDrawInterval(opts.drawInterval); }

    applyRatio();
    wireSplit();

    var saved = (core.config.panels && core.config.panels.length) ? core.config.panels : null;
    if (saved) {
      /* 静默恢复，避免启动时弹一堆修正提示 */
      for (var i = 0; i < saved.length; i++) { V.addPanel(saved[i], true); }
      applyLayoutOrder();
    } else {
      /* 首次使用：监视器占主位（主视觉），时域波形进工作区 */
      V.addPanel({ type: "textmon", title: "串口监视器", channels: [], window: 400, slot: "main" }, true);
      V.addPanel({ type: "timeplot", title: "时域波形", channels: ["auto"], window: 500, h: 300 }, true);
    }

    /* 老配置没有「主位」概念：把第一个文本监视器提为监视器主位 */
    if (!V.mainPanel()) {
      var promoted = false;
      for (var k = 0; k < panels.length; k++) {
        if (panels[k].type === "textmon") { V.moveToSlot(panels[k].id, "main"); promoted = true; break; }
      }
      /* 连监视器都没有就补一个——主区不该是空的 */
      if (!promoted) {
        V.addPanel({ type: "textmon", title: "串口监视器", channels: [], window: 400, slot: "main" }, true);
      }
    }

    /* 恢复上次的收起状态 */
    if (core.config.ui && core.config.ui.monCollapsed) { V.setMainCollapsed(true); }
  };

  SL.views = V;

  /* UMD 尾：校验脚本可加载（本模块依赖 DOM，纯逻辑断言有限） */
  if (typeof module !== "undefined" && module.exports) { module.exports = SL.views; }
})(typeof window !== "undefined" ? window : globalThis);
