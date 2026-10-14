/* ============================================================
   网页端串口调试助手 · SerialLab
   模块：plugins（声明式插件系统 + 内置渲染器）
   职责：
     1) 渲染器注册表与描述符校验（把用户配置归一成安全的 panel 描述符）
     2) 内置 7 个渲染器：时域折线 / 频域谱 / 柱状 / 仪表盘 / 数据表格 / 文本监视器 / 二维轨迹
     3) 面板包（DIY 配置）的导入导出与版本兼容
   依赖：core、util、expr、fft
   安全边界：插件是「声明式配置」，用户不能注入 JS。
     自由度来自：选渲染器 + 绑通道 + 写映射公式（走 expr 的安全求值，禁 eval）
     + 调坐标轴 / 量程 / 颜色 / 窗口。
   注意：本模块不直接依赖 datastore —— 数据由 views 以 data provider 形式注入，
     既保持单向依赖，也让渲染器可以脱离真实串口单独测试。
   ============================================================ */
;(function (global) {
  "use strict";

  var SL = global.SerialLab = global.SerialLab || {};
  var U = SL.util;
  var core = SL.core;

  var P = {};

  var WINDOW_MIN = 10;
  var WINDOW_MAX = 100000;
  var COLOR_RE = /^#[0-9a-fA-F]{3,6}$/;

  var registry = {};
  var registryOrder = [];

  /* ------------------------------------------------------------
     0) 绘图基元与主题取色
     ------------------------------------------------------------ */
  var themeCache = null;

  P.invalidateTheme = function () { themeCache = null; };

  function theme() {
    if (themeCache) { return themeCache; }
    var fb = {
      grid: "rgba(148,163,184,.16)", axis: "rgba(148,163,184,.45)",
      ink: "#e6edf3", ink2: "#9aa4b2", ink3: "#8b949e", bg: "#0a0f16"
    };
    if (typeof document === "undefined" || !global.getComputedStyle) {
      themeCache = fb; return fb;
    }
    try {
      var cs = global.getComputedStyle(document.documentElement);
      function g(name, d) {
        var v = cs.getPropertyValue(name);
        v = v ? v.replace(/^\s+|\s+$/g, "") : "";
        return v || d;
      }
      themeCache = {
        grid: g("--sl-grid", fb.grid),
        axis: g("--sl-axis", fb.axis),
        ink: g("--sl-ink", fb.ink),
        ink2: g("--sl-ink-2", fb.ink2),
        ink3: g("--sl-ink-3", fb.ink3),
        bg: g("--sl-canvas-bg", fb.bg)
      };
    } catch (e) { themeCache = fb; }
    return themeCache;
  }
  P.theme = theme;

  /* 建立 canvas 并做 DPR 适配；返回可复用的视图对象 */
  function makeView(hostEl) {
    var canvas = document.createElement("canvas");
    canvas.className = "sl-canvas";
    hostEl.appendChild(canvas);
    var ctx = canvas.getContext("2d");
    var view = {
      canvas: canvas,
      ctx: ctx,
      w: 0, h: 0, dpr: 1,
      fit: function () {
        var dpr = global.devicePixelRatio || 1;
        var r = hostEl.getBoundingClientRect();
        var w = Math.max(1, Math.floor(r.width));
        var h = Math.max(1, Math.floor(r.height));
        if (w === view.w && h === view.h && dpr === view.dpr) { return false; }
        view.w = w; view.h = h; view.dpr = dpr;
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
        canvas.style.width = w + "px";
        canvas.style.height = h + "px";
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return true;
      },
      clear: function () {
        ctx.clearRect(0, 0, view.w, view.h);
      },
      destroy: function () {
        if (canvas.parentNode) { canvas.parentNode.removeChild(canvas); }
      }
    };
    view.fit();
    return view;
  }

  /* 好看的刻度步长 */
  function niceStep(range, target) {
    if (!(range > 0)) { return 1; }
    var raw = range / (target || 5);
    var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var norm = raw / mag;
    var step = norm <= 1 ? 1 : (norm <= 2 ? 2 : (norm <= 5 ? 5 : 10));
    return step * mag;
  }
  P.niceStep = niceStep;

  /* 画网格与坐标轴，返回用于映射的函数 */
  function drawFrame(view, yMin, yMax, pad, fmtY) {
    var ctx = view.ctx, t = theme();
    var w = view.w, h = view.h;
    var plotW = Math.max(1, w - pad.l - pad.r);
    var plotH = Math.max(1, h - pad.t - pad.b);

    ctx.save();
    ctx.strokeStyle = t.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();

    /* 横向网格 + y 轴刻度 */
    var span = yMax - yMin;
    if (!(span > 0)) { span = 1; }
    var step = niceStep(span, 4);
    var first = Math.ceil(yMin / step) * step;
    ctx.font = "10px Consolas, monospace";
    ctx.fillStyle = t.ink3;
    ctx.textBaseline = "middle";
    for (var yv = first; yv <= yMax + 1e-9; yv += step) {
      var y = pad.t + plotH - ((yv - yMin) / span) * plotH;
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + plotW, y);
      ctx.fillText(fmtY ? fmtY(yv) : String(Math.round(yv * 1000) / 1000), 4, y);
    }

    /* 纵向网格（按点数均分，不画时间标注以免拥挤） */
    var vlines = 6;
    for (var i = 1; i < vlines; i++) {
      var x = pad.l + (plotW * i) / vlines;
      ctx.moveTo(x, pad.t);
      ctx.lineTo(x, pad.t + plotH);
    }
    ctx.stroke();

    /* 边框 */
    ctx.strokeStyle = t.axis;
    ctx.strokeRect(pad.l, pad.t, plotW, plotH);
    ctx.restore();

    return {
      plotW: plotW,
      plotH: plotH,
      xOf: function (i, cnt) {
        if (cnt <= 1) { return pad.l; }
        return pad.l + (i / (cnt - 1)) * plotW;
      },
      yOf: function (v) {
        return pad.t + plotH - ((v - yMin) / span) * plotH;
      }
    };
  }

  /* ------------------------------------------------------------
     1) 面板 → 序列（含映射公式）
     data provider 由 views 提供：
       { channels(), count(key), forEach(key,n,cb), copy(key,n), stat(key),
         recentRaw(n), now() }
     ------------------------------------------------------------ */
  function findChannel(list, key) {
    for (var i = 0; i < list.length; i++) { if (list[i].key === key) { return list[i]; } }
    return null;
  }

  function resolveChannels(panel, data, renderer) {
    var all = data.channels();
    var want = panel.channels || [];
    var out = [];
    var i;
    if (want.length === 1 && want[0] === "auto") {
      var cap = renderer.autoCount || 4;
      for (i = 0; i < all.length && out.length < cap; i++) {
        if (all[i].visible !== false) { out.push(all[i]); }
      }
      return out;
    }
    for (i = 0; i < want.length; i++) {
      var c = findChannel(all, want[i]);
      if (c) { out.push(c); }
    }
    /* 全部指定通道都还没数据时，退回自动模式，避免面板长时间空白 */
    if (!out.length) {
      var cap2 = renderer.autoCount || 4;
      for (i = 0; i < all.length && out.length < cap2; i++) {
        if (all[i].visible !== false) { out.push(all[i]); }
      }
    }
    return out;
  }
  P.resolveChannels = resolveChannels;

  /* 组装绘图序列；若描述符带 expr，则按「同索引对齐各通道」逐点重算。
     offset：向历史回看的点数——0 = 实时跟随（最近 window 点），
     >0 = 取 [最新-offset-window, 最新-offset) 这段（示波器式回看）。 */
  function buildSeries(panel, data, chans, offset) {
    offset = Math.max(0, offset | 0);
    var series = [];
    var i;
    var raw = [];
    var cnt = panel.window || 500;

    /* 先把各通道最近 window+offset 个点取出来（一次复制，后面按索引对齐） */
    for (i = 0; i < chans.length; i++) {
      raw.push(data.copy(chans[i].key, cnt + offset));
    }

    var hasExpr = false;
    var exprFn = null;
    if (panel.expr && String(panel.expr).replace(/^\s+|\s+$/g, "")) {
      var varNames = [];
      for (i = 0; i < chans.length; i++) { varNames.push(chans[i].key); }
      var compiled = SL.expr.compile(panel.expr, varNames);
      if (compiled.ok) { exprFn = compiled.fn; hasExpr = true; }
      else { panel._exprError = compiled.err; }
    }

    for (i = 0; i < chans.length; i++) {
      var c = chans[i];
      var src = raw[i];
      if (offset > 0 && src.v.length > cnt) {
        /* 去掉最新 offset 个点，窗口平移到历史段 */
        src = { v: src.v.slice(0, cnt), t: src.t.slice(0, cnt) };
      }
      var vals = new Array(src.v.length);
      if (hasExpr && src.v.length) {
        /* 从末尾对齐：让各通道最近的点互相配对，等长同步采样时结果完全正确 */
        var vars = {};
        for (var j = 0; j < src.v.length; j++) {
          for (var q = 0; q < chans.length; q++) {
            var o2 = raw[q];
            var ii = o2.v.length - src.v.length + j;
            vars[chans[q].key] = (ii >= 0 && ii < o2.v.length) ? o2.v[ii] : 0;
          }
          var r = exprFn(vars);
          vals[j] = isFinite(r) ? r : NaN;
        }
      } else {
        for (var m = 0; m < src.v.length; m++) { vals[m] = src.v[m]; }
      }
      series.push({
        key: c.key,
        label: c.label || c.key,
        unit: c.unit || "",
        color: (panel.colors && panel.colors[c.key]) || c.color,
        t: src.t,
        v: vals
      });
    }
    return series;
  }

  /* 自动量程 */
  function autoRange(series, padRatio) {
    var mn = Infinity, mx = -Infinity;
    for (var i = 0; i < series.length; i++) {
      var v = series[i].v;
      for (var j = 0; j < v.length; j++) {
        var x = v[j];
        if (!isFinite(x)) { continue; }
        if (x < mn) { mn = x; }
        if (x > mx) { mx = x; }
      }
    }
    if (!isFinite(mn) || !isFinite(mx)) { return { min: -1, max: 1 }; }
    if (mn === mx) { var d = Math.abs(mn) * 0.1 || 1; return { min: mn - d, max: mx + d }; }
    var pad = (mx - mn) * (padRatio === undefined ? 0.08 : padRatio);
    return { min: mn - pad, max: mx + pad };
  }

  function yRange(panel, series) {
    var axis = panel.axis || {};
    var auto = autoRange(series);
    var mn = (typeof axis.yMin === "number" && isFinite(axis.yMin)) ? axis.yMin : auto.min;
    var mx = (typeof axis.yMax === "number" && isFinite(axis.yMax)) ? axis.yMax : auto.max;
    if (!(mx > mn)) { mx = mn + 1; }
    return { min: mn, max: mx };
  }

  /* ------------------------------------------------------------
     2) 注册表
     ------------------------------------------------------------ */
  P.register = function (renderer) {
    if (!renderer || !renderer.id) { return false; }
    if (!registry[renderer.id]) { registryOrder.push(renderer.id); }
    registry[renderer.id] = renderer;
    return true;
  };

  P.list = function () {
    var out = [];
    for (var i = 0; i < registryOrder.length; i++) {
      var r = registry[registryOrder[i]];
      if (!r) { continue; }
      out.push({ id: r.id, label: r.label, category: r.category || "", autoCount: r.autoCount || 4 });
    }
    return out;
  };

  P.get = function (id) { return registry[id] || null; };

  /* ------------------------------------------------------------
     3) 描述符校验（归一 + 修正 + 记录问题，绝不抛异常）
     ------------------------------------------------------------ */
  P.validate = function (desc) {
    var errors = [];
    var raw = (desc && typeof desc === "object") ? desc : {};
    var fallbackId = registry["table"] ? "table" : registryOrder[0];

    var r = registry[raw.type];
    if (!r) {
      errors.push("未知渲染器「" + (raw.type === undefined ? "(空)" : raw.type) + "」，已降级为数据表格");
      r = registry[fallbackId];
    }
    if (!r) { return { ok: false, panel: null, errors: ["没有可用的渲染器"] }; }

    var out = {};
    out.type = r.id;
    out.id = (typeof raw.id === "string" && raw.id) ? raw.id : U.nextId("p");
    out.title = (raw.title === undefined || raw.title === null || raw.title === "") ? r.label : String(raw.title);
    if (out.title.length > 40) { out.title = out.title.slice(0, 40); errors.push("标题过长，已截断到 40 字"); }

    /* 通道 */
    var chans = raw.channels;
    if (chans === undefined || chans === null) { chans = ["auto"]; }
    if (Object.prototype.toString.call(chans) !== "[object Array]") { chans = [String(chans)]; }
    if (!chans.length) { chans = ["auto"]; }
    out.channels = [];
    for (var i = 0; i < chans.length; i++) {
      if (typeof chans[i] !== "string" || !chans[i]) {
        errors.push("第 " + (i + 1) + " 个通道名无效，已忽略");
        continue;
      }
      out.channels.push(chans[i]);
    }
    if (!out.channels.length) { out.channels = ["auto"]; }

    /* 映射公式（可选） */
    out.expr = (raw.expr === undefined || raw.expr === null) ? "" : String(raw.expr);
    if (out.expr) {
      var vn = [];
      for (var v = 0; v < out.channels.length; v++) {
        if (out.channels[v] !== "auto") { vn.push(out.channels[v]); }
      }
      var c = SL.expr.compile(out.expr, vn.length ? vn : null);
      if (!c.ok) { errors.push("公式无效（" + c.err + "），已忽略公式"); out.expr = ""; }
    }

    /* 坐标轴 */
    var ax = raw.axis || {};
    out.axis = {
      xAuto: ax.xAuto !== false,
      yAuto: ax.yAuto !== false,
      yMin: (typeof ax.yMin === "number" && isFinite(ax.yMin)) ? ax.yMin : null,
      yMax: (typeof ax.yMax === "number" && isFinite(ax.yMax)) ? ax.yMax : null,
      yLog: ax.yLog === true
    };
    if (out.axis.yMin !== null && out.axis.yMax !== null && !(out.axis.yMax > out.axis.yMin)) {
      errors.push("纵轴上限不大于下限，已改回自动量程");
      out.axis.yMin = null;
      out.axis.yMax = null;
      out.axis.yAuto = true;
    }

    /* 窗口点数 */
    var win = parseInt(raw.window, 10);
    if (isNaN(win)) { win = (r.defaults && r.defaults.window) || 500; }
    if (win < WINDOW_MIN) { win = WINDOW_MIN; errors.push("窗口过小，已提升到 " + WINDOW_MIN); }
    if (win > WINDOW_MAX) { win = WINDOW_MAX; errors.push("窗口过大，已限制到 " + WINDOW_MAX); }
    out.window = win;

    /* 颜色 */
    out.colors = {};
    if (raw.colors && typeof raw.colors === "object") {
      for (var ck in raw.colors) {
        if (!Object.prototype.hasOwnProperty.call(raw.colors, ck)) { continue; }
        var cv = String(raw.colors[ck] || "");
        if (COLOR_RE.test(cv)) { out.colors[ck] = cv; }
        else if (cv) { errors.push("通道「" + ck + "」的颜色「" + cv + "」非法，已忽略"); }
      }
    }

    /* 其它选项合并渲染器 defaults */
    out.opts = {};
    var defs = (r.defaults && r.defaults.opts) ? r.defaults.opts : {};
    for (var dk in defs) { if (Object.prototype.hasOwnProperty.call(defs, dk)) { out.opts[dk] = defs[dk]; } }
    if (raw.opts && typeof raw.opts === "object") {
      for (var ok2 in raw.opts) {
        if (Object.prototype.hasOwnProperty.call(raw.opts, ok2) && Object.prototype.hasOwnProperty.call(defs, ok2)) {
          out.opts[ok2] = raw.opts[ok2];
        }
      }
    }

    /* 布局字段：停靠位 / 高度 / 是否跨列加宽。
       这三个不是渲染器参数，所以不进 opts 白名单（否则会被渲染器 defaults 覆盖）；
       它们由 views 直接读写，并随配置落盘。
         slot: "main" 占主区 C1（串口监视器的默认位）· "grid" 进工作区 C2 */
    out.slot = (raw.slot === "main") ? "main" : "grid";
    var hh = parseInt(raw.h, 10);
    if (isNaN(hh)) { hh = (r.defaults && r.defaults.h) || 260; }
    out.h = Math.max(140, Math.min(2000, hh));
    out.span = (raw.span === 2) ? 2 : 1;

    return { ok: errors.length === 0, panel: out, errors: errors };
  };

  /* ------------------------------------------------------------
     4) 实例化
     ------------------------------------------------------------ */
  P.instantiate = function (panelDesc, hostEl) {
    var r = registry[panelDesc.type] || registry[registryOrder[0]];
    if (!r || !r.make) { return null; }
    var inst;
    try {
      inst = r.make(hostEl, panelDesc);
    } catch (e) {
      core.log("error", "渲染器「" + r.id + "」初始化失败：" + ((e && e.message) || e));
      /* 降级：不影响其它面板 */
      if (hostEl) {
        hostEl.innerHTML = "";
        var msg = document.createElement("div");
        msg.className = "sl-panel-msg";
        msg.textContent = "该图框渲染失败（" + r.label + "）";
        hostEl.appendChild(msg);
      }
      return null;
    }
    if (!inst) { return null; }
    if (typeof inst.update !== "function") { inst.update = function () {}; }
    if (typeof inst.resize !== "function") { inst.resize = function () {}; }
    if (typeof inst.destroy !== "function") { inst.destroy = function () {}; }
    return inst;
  };

  /* ------------------------------------------------------------
     5) 面板包导入导出
     ------------------------------------------------------------ */
  var PACK_KIND = "seriallab-panel-pack";
  var PACK_VERSION = 1;

  P.PACK_KIND = PACK_KIND;

  P.exportPack = function (panels, channels) {
    return {
      kind: PACK_KIND,
      version: PACK_VERSION,
      exportedAt: new Date().toISOString(),
      panels: U.clone(panels || []),
      channels: U.clone(channels || [])
    };
  };

  P.importPack = function (input) {
    var pack = input;
    if (typeof input === "string") {
      try { pack = JSON.parse(input); }
      catch (e) { return { ok: false, panels: [], channels: [], errors: ["不是合法的 JSON"] }; }
    }
    if (!pack || typeof pack !== "object") {
      return { ok: false, panels: [], channels: [], errors: ["面板包内容为空"] };
    }
    if (pack.kind !== PACK_KIND) {
      return { ok: false, panels: [], channels: [], errors: ["面板包类型不匹配（期望 " + PACK_KIND + "）"] };
    }
    var v = parseInt(pack.version, 10);
    if (isNaN(v)) { v = 0; }
    if (v > PACK_VERSION) {
      return { ok: false, panels: [], channels: [], errors: ["面板包版本（v" + v + "）高于本应用支持的 v" + PACK_VERSION] };
    }

    var errors = [];
    var panels = [];
    var list = Object.prototype.toString.call(pack.panels) === "[object Array]" ? pack.panels : [];
    for (var i = 0; i < list.length; i++) {
      var res = P.validate(list[i]);
      if (res.panel) { panels.push(res.panel); }
      for (var e = 0; e < res.errors.length; e++) { errors.push("面板 " + (i + 1) + "：" + res.errors[e]); }
    }

    var channels = [];
    var clist = Object.prototype.toString.call(pack.channels) === "[object Array]" ? pack.channels : [];
    for (var c = 0; c < clist.length; c++) {
      var ch = clist[c];
      if (ch && typeof ch === "object" && ch.key) {
        channels.push({
          key: String(ch.key),
          label: ch.label === undefined ? String(ch.key) : String(ch.label),
          unit: ch.unit === undefined ? "" : String(ch.unit),
          color: COLOR_RE.test(String(ch.color || "")) ? String(ch.color) : "",
          visible: ch.visible !== false,
          precision: typeof ch.precision === "number" ? ch.precision : 3
        });
      }
    }
    return { ok: errors.length === 0, panels: panels, channels: channels, errors: errors };
  };

  /* ============================================================
     内置渲染器
     ============================================================ */

  var PAD = { l: 42, r: 10, t: 20, b: 16 };

  /* V2.2.6：各时域面板的「图例隐藏通道」表（key=panel.id）。
     放模块级而不是面板描述符里：updatePanel 会重建面板元素，
     但 panel.id 不变——调节窗口等重建操作后勾选状态得以保留。 */
  var hiddenChans = {};

  /* V2.2.6：时域面板的 reset 钩子表（Auto 按钮用）——渲染器 make 时登记 */
  var timeplotReset = {};
  P.resetTimeplot = function (id) {
    if (timeplotReset[id]) { timeplotReset[id](); }
  };

  /* 时间标注：epoch 毫秒显示时分秒，相对毫秒显示秒 */
  function tLabel(ms) {
    if (ms > 1e12) {
      var d = new Date(ms);
      return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2) +
        ":" + ("0" + d.getSeconds()).slice(-2);
    }
    return (ms / 1000).toFixed(1) + "s";
  }

  /* ---------- 1) 时域折线 ---------- */
  P.register({
    id: "timeplot",
    label: "时域折线",
    category: "时域",
    autoCount: 4,
    defaults: { window: 500, h: 300, opts: { lineWidth: 1.4, showDot: true } },
    make: function (hostEl, panel) {
      var view = makeView(hostEl);
      var legendHits = [];    /* 图例命中区（draw 时刷新），点击切换显隐 */

      /* V2.2.6 示波器式视角：0 = 实时跟随；>0 = 向历史回看的点数 */
      var viewOffset = 0;
      var dragging = false, dragX0 = 0, dragOff0 = 0, dragMoved = false;
      var lastLive = true;   /* V2.2.8：视角状态变化时回调，驱动 Auto 按钮状态灯 */
      var backTipRect = null; /* V2.2.11：回看提示条命中区——点它直接回实时 */
      var WHEEL_MIN = 50, WHEEL_MAX = 5000, LOOKBACK_MAX = 50000;

      timeplotReset[panel.id] = function () { viewOffset = 0; };

      function notifyView() {
        var live = viewOffset === 0;
        if (live !== lastLive) {
          lastLive = live;
          if (SL.views && SL.views.setTimeplotViewLive) { SL.views.setTimeplotViewLive(panel.id, live); }
        }
      }

      /* 拖动 = 平移视角看历史；滚轮 = 缩放窗口（点数）；双击 = 回实时 */
      view.canvas.addEventListener("mousedown", function (e) {
        dragging = true; dragX0 = e.clientX; dragOff0 = viewOffset; dragMoved = false;
        e.preventDefault();
      });
      function onMove(e) {
        if (!dragging) { return; }
        var plotW = Math.max(1, view.w - PAD.l - PAD.r);
        var dx = e.clientX - dragX0;
        if (Math.abs(dx) > 3) { dragMoved = true; }
        var off = dragOff0 + dx * (panel.window || 500) / plotW;
        viewOffset = Math.min(LOOKBACK_MAX, Math.max(0, Math.round(off)));
        /* V2.2.12：面板被单独暂停时手动拖动也要有画面反馈（暂停只停自动刷新） */
        if (SL.views && SL.views.renderPanelOnce) { SL.views.renderPanelOnce(panel.id); }
      }
      function onUp() { dragging = false; }
      global.addEventListener("mousemove", onMove);
      global.addEventListener("mouseup", onUp);
      view.canvas.addEventListener("wheel", function (e) {
        e.preventDefault();
        var factor = (e.deltaY > 0) ? 1.15 : (1 / 1.15);
        var nw = Math.round((panel.window || 500) * factor);
        nw = Math.min(WHEEL_MAX, Math.max(WHEEL_MIN, nw));
        if (nw !== panel.window) {
          panel.window = nw;
          if (SL.views && SL.views.save) { SL.views.save(); }
          if (SL.views && SL.views.renderPanelOnce) { SL.views.renderPanelOnce(panel.id); }
        }
      }, { passive: false });
      view.canvas.addEventListener("dblclick", function () { viewOffset = 0; });

      /* 点击图例 = 勾选 / 取消对应通道（隐藏通道不画线、不参与量程）；
         点「回看历史」提示条 = 回实时；拖动过视角后松手的这次 click 不算（防误触） */
      view.canvas.addEventListener("click", function (e) {
        if (dragMoved) { dragMoved = false; return; }
        var r = view.canvas.getBoundingClientRect();
        var x = e.clientX - r.left;
        var y = e.clientY - r.top;
        if (backTipRect && x >= backTipRect.x0 && x <= backTipRect.x1 &&
            y >= backTipRect.y0 && y <= backTipRect.y1) {
          viewOffset = 0;
          return;
        }
        for (var i = 0; i < legendHits.length; i++) {
          if (x >= legendHits[i].x0 && x <= legendHits[i].x1 && Math.abs(y - legendHits[i].y) <= 10) {
            var h = hiddenChans[panel.id] || (hiddenChans[panel.id] = {});
            h[legendHits[i].key] = !h[legendHits[i].key];
            return;
          }
        }
      });

      function draw(data) {
        view.fit();
        view.clear();
        notifyView();
        var t = theme();
        var ctx = view.ctx;
        var chans = resolveChannels(panel, data, registry.timeplot);
        var allSeries = buildSeries(panel, data, chans, viewOffset);
        var hid = hiddenChans[panel.id] || {};

        /* 隐藏通道不参与画线与量程，但仍出现在图例里（灰显，可点回来） */
        var series = [];
        var i;
        for (i = 0; i < allSeries.length; i++) {
          if (!hid[allSeries[i].key]) { series.push(allSeries[i]); }
        }

        if (!series.length) {
          ctx.fillStyle = t.ink3;
          ctx.font = "11px Consolas, monospace";
          ctx.textBaseline = "middle";
          ctx.fillText(allSeries.length
            ? "所有通道都已隐藏——点击图例勾回"
            : "暂无数据（连接设备，或到「测试」页签开演示）", 12, view.h / 2);
          drawLegend(ctx, view, allSeries, hid, null);
          return;
        }

        var yr = yRange(panel, series);
        var pad = { l: PAD.l, r: PAD.r, t: PAD.t, b: PAD.b };
        var map = drawFrame(view, yr.min, yr.max, pad);
        var lw = (panel.opts && panel.opts.lineWidth) || 1.4;

        for (i = 0; i < series.length; i++) {
          var s = series[i];
          ctx.save();
          ctx.strokeStyle = s.color;
          ctx.lineWidth = lw;
          ctx.lineJoin = "round";
          ctx.beginPath();
          var started = false;
          for (var j = 0; j < s.v.length; j++) {
            var val = s.v[j];
            if (!isFinite(val)) { started = false; continue; }
            var x = map.xOf(j, s.v.length);
            var y = map.yOf(val);
            if (!started) { ctx.moveTo(x, y); started = true; }
            else { ctx.lineTo(x, y); }
          }
          ctx.stroke();

          /* 最新点标记 */
          if (panel.opts && panel.opts.showDot && s.v.length) {
            var lastIdx = s.v.length - 1;
            var lv = s.v[lastIdx];
            if (isFinite(lv)) {
              ctx.fillStyle = s.color;
              ctx.beginPath();
              ctx.arc(map.xOf(lastIdx, s.v.length), map.yOf(lv), 2.6, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          ctx.restore();
        }

        drawLegend(ctx, view, allSeries, hid, pad, legendHits);
        drawTimeAxis(ctx, view, series);

        /* 左上角标出当前量程 */
        ctx.save();
        ctx.fillStyle = t.ink3;
        ctx.font = "10px Consolas, monospace";
        ctx.textBaseline = "top";
        ctx.fillText(U.fmt(yr.min, 3) + " ~ " + U.fmt(yr.max, 3), 4, view.h - pad.b + 3);
        ctx.restore();

        /* 回看历史时右上角提示条（可点击直接回实时） */
        if (viewOffset > 0) {
          ctx.save();
          var tipText = "⏸ 回看历史 " + viewOffset + " 点 · 点此回实时";
          ctx.font = "bold 10px Consolas, monospace";
          var tw = ctx.measureText(tipText).width;
          var bx = view.w - PAD.r - tw - 10, by = 3, bh = 16;
          ctx.fillStyle = "rgba(245, 158, 11, .18)";
          ctx.strokeStyle = "#f59e0b";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.rect(bx, by, tw + 10, bh);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = t.warn || "#f59e0b";
          ctx.textBaseline = "middle";
          ctx.textAlign = "left";
          ctx.fillText(tipText, bx + 5, by + bh / 2);
          ctx.restore();
          backTipRect = { x0: bx, y0: by, x1: bx + tw + 10, y1: by + bh };
        } else {
          backTipRect = null;
        }
      }

      /* 底部时间刻度：起点 / 终点时刻（epoch 显示时分秒，相对数据显示秒） */
      function drawTimeAxis(ctx, view, series) {
        var s0 = null;
        for (var i = 0; i < series.length; i++) {
          if (series[i].t && series[i].t.length > 1) { s0 = series[i]; break; }
        }
        if (!s0) { return; }
        var t0 = s0.t[0], t1 = s0.t[s0.t.length - 1];
        var t = theme();
        ctx.save();
        ctx.fillStyle = t.ink3;
        ctx.font = "10px Consolas, monospace";
        ctx.textBaseline = "top";
        ctx.textAlign = "left";
        ctx.fillText(tLabel(t0), PAD.l, view.h - PAD.b + 3);
        ctx.textAlign = "right";
        ctx.fillText(tLabel(t1) + " · 窗口 " + (panel.window || 500) + " 点 · 拖动看历史 / 滚轮缩放", view.w - PAD.r, view.h - PAD.b + 3);
        ctx.restore();
      }

      /* 图例（左上角）：可点击。隐藏的通道灰显；记录命中区给 click 用 */
      return {
        update: draw,
        resize: function () { view.fit(); },
        destroy: function () {
          global.removeEventListener("mousemove", onMove);
          global.removeEventListener("mouseup", onUp);
          delete timeplotReset[panel.id];
          view.destroy();
        }
      };
    }
  });

  /* V2.2.14：时域/频域共用图例——色块 + 名字的「可点开关」样式（带浅底色提示可点击），
     点击 = 显隐对应通道（legendHits 由调用方提供，命中判定在各自 canvas click 里） */
  function drawLegend(ctx, view, allSeries, hid, pad, legendHits) {
  var t = theme();
  legendHits = [];
  ctx.save();
  ctx.font = "10px Consolas, monospace";
  ctx.textBaseline = "middle";
  var cx = PAD.l + 4, cy = 9;
  for (var m = 0; m < allSeries.length; m++) {
    var it = allSeries[m];
    if (cx + 70 > view.w - PAD.r) { break; }
    var off = !!hid[it.key];
    ctx.globalAlpha = off ? 0.3 : 1;
    ctx.fillStyle = it.color;
    ctx.fillRect(cx, cy - 4, 8, 8);
    if (off) {
      /* 隐藏通道的色块上画一道斜杠，明示「已关」 */
      ctx.strokeStyle = t.ink2;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx - 1, cy + 5);
      ctx.lineTo(cx + 9, cy - 5);
      ctx.stroke();
    }
    ctx.fillStyle = off ? t.ink3 : t.ink2;
    ctx.fillText(it.label, cx + 12, cy);
    var wEnd = cx + 12 + ctx.measureText(it.label).width + 8;
    legendHits.push({ key: it.key, x0: cx - 2, x1: wEnd, y: cy });
    cx = wEnd + 4;
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  }

  /* ---------- 实时统计（V2.2.6，时域统计视图）----------
     每通道一行：有效值 RMS（去均值，正弦信号即 峰值/√2）/ 峰峰值 / 均值 / 最大 / 最小 / 样本数。
     只统计当前窗口（面板窗口可调），随数据实时刷新。 */
  P.register({
    id: "statsboard",
    label: "实时统计",
    category: "统计",
    autoCount: 4,
    defaults: { window: 500, h: 240, opts: { metrics: ["rms", "vpp", "mean", "max", "min", "n"] } },
    make: function (hostEl, panel) {
      var table = document.createElement("div");
      table.className = "sl-stats";
      hostEl.appendChild(table);
      var METRICS = [
        ["rms", "有效值RMS", "交流有效值（去均值）——标准正弦波 = 峰值/√2"],
        ["vpp", "峰峰值Vpp", "最大值 − 最小值"],
        ["mean", "均值", "算术平均（直流分量）"],
        ["max", "最大", "窗口内最大值"],
        ["min", "最小", "窗口内最小值"],
        ["n", "样本", "窗口内样本点数"]
      ];

      function draw(data) {
        var chans = resolveChannels(panel, data, registry.statsboard);
        var want = (panel.opts && panel.opts.metrics) || ["rms", "vpp", "mean", "max", "min", "n"];
        var head = '<div class="sl-stats-row is-head"><span>通道</span>';
        var m, i;
        for (m = 0; m < want.length; m++) {
          var meta = null;
          for (i = 0; i < METRICS.length; i++) { if (METRICS[i][0] === want[m]) { meta = METRICS[i]; break; } }
          head += '<span title="' + (meta ? U.esc(meta[2]) : "") + '">' + (meta ? meta[1] : U.esc(want[m])) + "</span>";
        }
        head += "</div>";

        var body = "";
        for (i = 0; i < chans.length; i++) {
          var src = data.copy(chans[i].key, panel.window || 500);
          var v = src.v;
          var n = v.length;
          var sum = 0, mn = Infinity, mx = -Infinity;
          var j;
          for (j = 0; j < n; j++) {
            sum += v[j];
            if (v[j] < mn) { mn = v[j]; }
            if (v[j] > mx) { mx = v[j]; }
          }
          var mean = n ? sum / n : 0;
          var sq = 0;
          for (j = 0; j < n; j++) { var d0 = v[j] - mean; sq += d0 * d0; }
          var rms = n ? Math.sqrt(sq / n) : 0;
          var unit = chans[i].unit ? " <i class=\"sl-stats-unit\">" + U.esc(chans[i].unit) + "</i>" : "";
          var row = '<div class="sl-stats-row"><span><i class="sl-stats-dot" style="background:' +
            chans[i].color + '"></i>' + U.esc(chans[i].label || chans[i].key) + unit + "</span>";
          for (m = 0; m < want.length; m++) {
            var name = want[m], val;
            if (name === "rms") { val = n ? U.fmt(rms, 4) : "-"; }
            else if (name === "vpp") { val = n ? U.fmt(mx - mn, 4) : "-"; }
            else if (name === "mean") { val = n ? U.fmt(mean, 4) : "-"; }
            else if (name === "max") { val = n ? U.fmt(mx, 4) : "-"; }
            else if (name === "min") { val = n ? U.fmt(mn, 4) : "-"; }
            else if (name === "n") { val = String(n); }
            else { val = "-"; }
            row += "<span>" + val + "</span>";
          }
          body += row + "</div>";
        }
        table.innerHTML = chans.length
          ? head + body
          : '<div class="sl-panel-msg">暂无通道——等数据进来后自动出现</div>';
      }

      return {
        update: draw,
        resize: function () {},
        destroy: function () { hostEl.innerHTML = ""; }
      };
    }
  });

  /* ---------- 2) 频域谱 ---------- */
  P.register({
    id: "fftplot",
    label: "频域谱",
    category: "频域",
    autoCount: 3,
    defaults: { window: 1024, h: 300, opts: { maxN: 4096, logScale: true } },
    make: function (hostEl, panel) {
      var view = makeView(hostEl);
      var legendHits = [];    /* V2.2.14：图例命中区——频域谱也有点击显隐了 */

      /* 点击图例 = 显隐对应通道（与时域折线同一套 hiddenChans 状态，互通） */
      view.canvas.addEventListener("click", function (e) {
        var r = view.canvas.getBoundingClientRect();
        var x = e.clientX - r.left;
        var y = e.clientY - r.top;
        for (var i = 0; i < legendHits.length; i++) {
          if (x >= legendHits[i].x0 && x <= legendHits[i].x1 && Math.abs(y - legendHits[i].y) <= 10) {
            var h = hiddenChans[panel.id] || (hiddenChans[panel.id] = {});
            h[legendHits[i].key] = !h[legendHits[i].key];
            return;
          }
        }
      });

      function draw(data) {
        view.fit();
        view.clear();
        var t = theme();
        var ctx = view.ctx;
        var chans = resolveChannels(panel, data, registry.fftplot);
        var allSeries = buildSeries(panel, data, chans);
        var hid = hiddenChans[panel.id] || {};
        /* 隐藏通道不参与谱线与量程，但留在图例里可点回 */
        var series = [];
        for (var si = 0; si < allSeries.length; si++) {
          if (!hid[allSeries[si].key]) { series.push(allSeries[si]); }
        }

        var spectrums = [];
        var i, j;
        for (i = 0; i < series.length; i++) {
          var s = series[i];
          if (s.v.length < 16) { continue; }
          /* 采样率：优先用描述符指定，否则按相邻点平均时间间隔反推 */
          var sr = (panel.opts && panel.opts.sampleRate) || 0;
          if (!(sr > 0) && s.t.length >= 2) {
            var dt = (s.t[s.t.length - 1] - s.t[0]) / (s.t.length - 1);
            if (dt > 0) { sr = 1000 / dt; }        /* t 的单位是 ms */
          }
          if (!(sr > 0)) { sr = 1; }
          var sp = SL.fft.spectrum(s.v, sr, { maxN: (panel.opts && panel.opts.maxN) || 4096 });
          if (sp) { spectrums.push({ key: s.key, label: s.label, color: s.color, sp: sp }); }
        }

        if (!spectrums.length) {
          ctx.fillStyle = t.ink3;
          ctx.font = "11px Consolas, monospace";
          ctx.textBaseline = "middle";
          ctx.fillText(allSeries.length
            ? "所有通道都已隐藏——点击图例勾回"
            : "样本不足（至少需要 16 个点才能做频谱）", 12, view.h / 2);
          drawLegend(ctx, view, allSeries, hid, null, legendHits);
          return;
        }

        /* 只画到奈奎斯特频率的一半，避免高频区噪声占满画面 */
        var fMax = 0;
        for (i = 0; i < spectrums.length; i++) {
          var fN = spectrums[i].sp.freqs[spectrums[i].sp.freqs.length - 1] / 2;
          if (fN > fMax) { fMax = fN; }
        }
        if (!(fMax > 0)) { fMax = 1; }

        var useDb = !panel.opts || panel.opts.logScale !== false;
        var mn = Infinity, mx = -Infinity;
        for (i = 0; i < spectrums.length; i++) {
          var arr = useDb ? spectrums[i].sp.magsDb : spectrums[i].sp.magsLin;
          for (j = 0; j < arr.length; j++) {
            if (spectrums[i].sp.freqs[j] > fMax) { break; }
            if (arr[j] < mn) { mn = arr[j]; }
            if (arr[j] > mx) { mx = arr[j]; }
          }
        }
        if (!isFinite(mn)) { mn = -80; mx = 0; }
        if (mx - mn < 1) { mx = mn + 1; }

        var pad = { l: 46, r: 10, t: 20, b: 16 };
        var map = drawFrame(view, mn, mx, pad, function (v) { return U.fmt(v, 1); });

        for (i = 0; i < spectrums.length; i++) {
          var sc = spectrums[i];
          var a = useDb ? sc.sp.magsDb : sc.sp.magsLin;
          ctx.save();
          ctx.strokeStyle = sc.color;
          ctx.lineWidth = 1.6;   /* V2.2.14：谱线加粗一点，多通道叠加时更好分辨 */
          ctx.beginPath();
          var started = false;
          for (j = 0; j < a.length; j++) {
            var f = sc.sp.freqs[j];
            if (f > fMax) { break; }
            var x = pad.l + (fMax > 0 ? (f / fMax) * map.plotW : 0);
            var y = map.yOf(a[j]);
            if (!started) { ctx.moveTo(x, y); started = true; }
            else { ctx.lineTo(x, y); }
          }
          ctx.stroke();

          /* 峰值频率标注（V2.2.14：跳过直流/近零频分量；每通道错开一行，
             修掉「0·1.49Hz」这种两条标注重叠成天书的排布） */
          if (sc.sp.peak && sc.sp.peak.mag > 0) {
            var pf = sc.sp.peak.freq;
            if (pf <= fMax && pf > fMax * 0.02) {
              var px = pad.l + (pf / fMax) * map.plotW;
              var pMag = useDb ? (20 * Math.log(sc.sp.peak.mag + 1e-12) / Math.LN10) : sc.sp.peak.mag;
              ctx.fillStyle = sc.color;
              ctx.beginPath();
              ctx.arc(px, map.yOf(pMag), 2.6, 0, Math.PI * 2);
              ctx.fill();
              ctx.fillStyle = sc.color;
              ctx.font = "bold 10px Consolas, monospace";
              ctx.textBaseline = "bottom";
              ctx.fillText(U.fmt(pf, 2) + "Hz", Math.min(px + 4, view.w - 56), pad.t + 12 + i * 13);
            }
          }
          ctx.restore();
        }

        /* 图例（与时域同款：chip 可点击显隐通道） */
        drawLegend(ctx, view, allSeries, hid, pad, legendHits);

        ctx.save();
        ctx.fillStyle = t.ink3;
        ctx.font = "10px Consolas, monospace";
        ctx.textBaseline = "top";
        ctx.fillText((useDb ? "幅值 dB" : "幅值") + " · 横轴 0~" + U.fmt(fMax, 1) + "Hz", 4, view.h - pad.b + 3);
        ctx.restore();
      }

      return {
        update: draw,
        resize: function () { view.fit(); },
        destroy: function () { view.destroy(); }
      };
    }
  });

  /* ---------- 3) 柱状图（各通道最新值） ---------- */
  P.register({
    id: "bar",
    label: "柱状图",
    category: "统计",
    autoCount: 8,
    defaults: { window: 600, h: 240, opts: { showValue: true } },
    make: function (hostEl, panel) {
      var view = makeView(hostEl);

      function draw(data) {
        view.fit();
        view.clear();
        var t = theme();
        var ctx = view.ctx;
        var chans = resolveChannels(panel, data, registry.bar);
        var stats = [];
        for (var i = 0; i < chans.length; i++) {
          var st = data.stat(chans[i].key, panel.window);
          if (st.count > 0) {
            stats.push({ ch: chans[i], st: st });
          }
        }
        if (!stats.length) {
          ctx.fillStyle = t.ink3;
          ctx.font = "11px Consolas, monospace";
          ctx.textBaseline = "middle";
          ctx.fillText("暂无数据", 12, view.h / 2);
          return;
        }

        var pad = { l: 46, r: 10, t: 20, b: 30 };
        var mn = Infinity, mx = -Infinity;
        for (var m = 0; m < stats.length; m++) {
          if (stats[m].st.last < mn) { mn = stats[m].st.last; }
          if (stats[m].st.last > mx) { mx = stats[m].st.last; }
        }
        if (!isFinite(mn)) { mn = 0; mx = 1; }
        if (mn > 0) { mn = 0; }
        if (mx < 0) { mx = 0; }
        if (mx === mn) { mx = mn + 1; }
        mn -= (mx - mn) * 0.05;
        mx += (mx - mn) * 0.05;

        var map = drawFrame(view, mn, mx, pad);
        var n = stats.length;
        var slot = map.plotW / n;
        var bw = Math.max(6, Math.min(46, slot * 0.6));

        for (var k = 0; k < n; k++) {
          var item = stats[k];
          var val = item.st.last;
          var cx = pad.l + slot * (k + 0.5);
          var y0 = map.yOf(0);
          var y1 = map.yOf(val);
          ctx.save();
          ctx.fillStyle = item.ch.color || "#3b82f6";
          ctx.globalAlpha = 0.85;
          ctx.fillRect(cx - bw / 2, Math.min(y0, y1), bw, Math.max(1, Math.abs(y1 - y0)));
          ctx.globalAlpha = 1;
          ctx.fillStyle = t.ink2;
          ctx.font = "10px Consolas, monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillText(item.ch.label || item.ch.key, cx, view.h - pad.b + 4);
          if (panel.opts && panel.opts.showValue !== false) {
            ctx.fillStyle = t.ink;
            ctx.textBaseline = "bottom";
            ctx.fillText(U.fmt(val, item.ch.precision === undefined ? 3 : item.ch.precision),
              cx, Math.min(y0, y1) - 2);
          }
          ctx.restore();
        }
      }

      return {
        update: draw,
        resize: function () { view.fit(); },
        destroy: function () { view.destroy(); }
      };
    }
  });

  /* ---------- 4) 仪表盘（单通道） ---------- */
  P.register({
    id: "gauge",
    label: "仪表盘",
    category: "统计",
    autoCount: 1,
    defaults: { window: 200, h: 240, opts: {} },
    make: function (hostEl, panel) {
      var view = makeView(hostEl);
      var state = { display: 0, inited: false };

      function draw(data) {
        view.fit();
        view.clear();
        var t = theme();
        var ctx = view.ctx;
        var chans = resolveChannels(panel, data, registry.gauge);
        if (!chans.length) {
          ctx.fillStyle = t.ink3;
          ctx.font = "11px Consolas, monospace";
          ctx.textBaseline = "middle";
          ctx.fillText("暂无可显示的通道", 12, view.h / 2);
          return;
        }
        var ch = chans[0];
        var st = data.stat(ch.key, panel.window);
        if (st.count === 0) {
          ctx.fillStyle = t.ink3;
          ctx.font = "11px Consolas, monospace";
          ctx.textBaseline = "middle";
          ctx.fillText("等待通道「" + (ch.label || ch.key) + "」的数据", 12, view.h / 2);
          return;
        }

        /* 量程：用户指定 > 通道 min/max > 当前值附近 */
        var axis = panel.axis || {};
        var lo = (typeof axis.yMin === "number") ? axis.yMin : null;
        var hi = (typeof axis.yMax === "number") ? axis.yMax : null;
        if (lo === null || hi === null) {
          var span = (st.max - st.min);
          if (!(span > 0)) { span = Math.abs(st.last) * 1.5 || 1; }
          var mid = (st.max + st.min) / 2;
          lo = (lo === null) ? mid - span * 0.75 : lo;
          hi = (hi === null) ? mid + span * 0.75 : hi;
        }
        if (!(hi > lo)) { hi = lo + 1; }

        var cx = view.w / 2;
        var cy = view.h * 0.72;
        var radius = Math.min(view.w * 0.42, view.h * 0.62);
        var a0 = Math.PI * 0.98;
        var a1 = Math.PI * 2.02;

        /* 分区弧（红 / 黄 / 绿 / 黄 / 红） */
        var zones = [
          { from: 0, to: 0.1, color: "#ef4444" },
          { from: 0.1, to: 0.25, color: "#f59e0b" },
          { from: 0.25, to: 0.75, color: "#22c55e" },
          { from: 0.75, to: 0.9, color: "#f59e0b" },
          { from: 0.9, to: 1, color: "#ef4444" }
        ];
        ctx.save();
        ctx.lineWidth = Math.max(8, radius * 0.16);
        ctx.lineCap = "butt";
        for (var i = 0; i < zones.length; i++) {
          var z = zones[i];
          ctx.strokeStyle = z.color;
          ctx.globalAlpha = 0.42;
          ctx.beginPath();
          ctx.arc(cx, cy, radius, a0 + (a1 - a0) * z.from, a0 + (a1 - a0) * z.to);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;

        /* 指针 */
        var ratio = U.clamp((st.last - lo) / (hi - lo), 0, 1);
        if (!state.inited) { state.display = ratio; state.inited = true; }
        else { state.display += (ratio - state.display) * 0.25; }   /* 缓和跟随，读数不跳 */
        var ang = a0 + (a1 - a0) * state.display;
        ctx.strokeStyle = t.ink;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(ang) * radius * 0.92, cy + Math.sin(ang) * radius * 0.92);
        ctx.stroke();
        ctx.fillStyle = t.ink;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(3, radius * 0.05), 0, Math.PI * 2);
        ctx.fill();

        /* 读数 */
        ctx.textAlign = "center";
        ctx.fillStyle = t.ink;
        ctx.font = "bold 19px Consolas, monospace";
        ctx.textBaseline = "middle";
        var prec = (ch.precision === undefined) ? 2 : ch.precision;
        ctx.fillText(U.fmt(st.last, prec) + (ch.unit ? " " + ch.unit : ""), cx, cy - radius * 0.34);
        ctx.font = "10px Consolas, monospace";
        ctx.fillStyle = t.ink3;
        ctx.fillText(String(ch.label || ch.key) + "  ·  min " + U.fmt(st.min, prec)
          + " / max " + U.fmt(st.max, prec), cx, cy - radius * 0.08);
        ctx.restore();
      }

      return {
        update: draw,
        resize: function () { view.fit(); },
        destroy: function () { view.destroy(); }
      };
    }
  });

  /* ---------- 5) 数据表格（DOM 渲染） ---------- */
  P.register({
    id: "table",
    label: "数据表格",
    category: "统计",
    autoCount: 8,
    defaults: { window: 500, h: 260, opts: {} },
    make: function (hostEl, panel) {
      var wrap = document.createElement("div");
      wrap.className = "sl-table-wrap";
      wrap.style.height = "100%";
      wrap.style.overflow = "auto";
      wrap.style.padding = "6px";
      hostEl.appendChild(wrap);

      function draw(data) {
        var chans = resolveChannels(panel, data, registry.table);
        var rows = [];
        for (var i = 0; i < chans.length; i++) {
          var ch = chans[i];
          var st = data.stat(ch.key, panel.window);
          if (st.count === 0) { continue; }
          rows.push({ ch: ch, st: st });
        }

        /* 用 DOM 构建，全部走 textContent，不拼 HTML 字符串 */
        var table = document.createElement("table");
        table.className = "sl-table";
        var thead = document.createElement("thead");
        var htr = document.createElement("tr");
        var heads = ["通道", "最新", "最小", "最大", "平均", "点数"];
        for (var h = 0; h < heads.length; h++) {
          var th = document.createElement("th");
          th.textContent = heads[h];
          htr.appendChild(th);
        }
        thead.appendChild(htr);
        table.appendChild(thead);

        var tbody = document.createElement("tbody");
        if (!rows.length) {
          var er = document.createElement("tr");
          var etd = document.createElement("td");
          etd.colSpan = heads.length;
          etd.textContent = "暂无数据";
          er.appendChild(etd);
          tbody.appendChild(er);
        }
        for (var r = 0; r < rows.length; r++) {
          var item = rows[r];
          var prec = (item.ch.precision === undefined) ? 3 : item.ch.precision;
          var tr = document.createElement("tr");
          var td0 = document.createElement("td");
          var sw = document.createElement("span");
          sw.className = "sl-swatch";
          sw.style.background = item.ch.color || "#3b82f6";
          td0.appendChild(sw);
          td0.appendChild(document.createTextNode(" " + (item.ch.label || item.ch.key)
            + (item.ch.unit ? " (" + item.ch.unit + ")" : "")));
          tr.appendChild(td0);
          var vals = [item.st.last, item.st.min, item.st.max, item.st.avg];
          for (var v = 0; v < vals.length; v++) {
            var td = document.createElement("td");
            td.textContent = U.fmt(vals[v], prec);
            tr.appendChild(td);
          }
          var tdc = document.createElement("td");
          tdc.textContent = String(item.st.count);
          tr.appendChild(tdc);
          tbody.appendChild(tr);
        }
        table.appendChild(tbody);

        wrap.innerHTML = "";
        wrap.appendChild(table);
      }

      return {
        update: draw,
        resize: function () {},
        destroy: function () { hostEl.innerHTML = ""; }
      };
    }
  });

  /* ---------- 6) 文本监视器 ----------
     实现要点：
       a) 用一次 innerHTML 而不是几百次 createElement —— 300 行 × 5 个 span
          的元素创建量在 25fps 下会明显吃掉主线程；
       b) 所有动态文本先过 U.esc()，数字标红作用在「已转义的 HTML」上，
          并用「实体引用优先」的分支保护 &#39; 这类含数字的转义序列；
       c) 时间戳有两种口径（绝对时刻 / 相对秒），由 core.config.transport.timeMode
          决定，标签在 app.js 落库时就已经算好，这里只挑一个用。 */
  P.register({
    id: "textmon",
    label: "文本监视器",
    category: "监视",
    autoCount: 0,
    defaults: { window: 500, h: 260, opts: { maxLines: 300, showTimestamp: true, showHex: false, showDir: true } },
    make: function (hostEl, panel) {
      var box = document.createElement("div");
      box.className = "sl-mon";
      hostEl.appendChild(box);
      var autoscroll = true;

      box.addEventListener("scroll", function () {
        autoscroll = (box.scrollHeight - box.scrollTop - box.clientHeight) < 24;
      });

      /* 数字标红：只包数字，放行 HTML 实体引用（&#39; / &amp; 里含数字，不能误伤） */
      function markNumbers(html) {
        return html.replace(/&#?\w+;|(-?\d+(?:\.\d+)?)/g, function (m, num) {
          if (num === undefined) { return m; }
          return '<span class="sl-mon-num">' + m + '</span>';
        });
      }

      /* V2.2.13：键值对里的数字用「对应波形通道」的颜色标亮——
         pos= 的数字就是 pos 曲线的颜色，数值与波形一眼锁定同一信号；
         键名、等号、汉字、符号保持默认墨色（黑色留给文字），时间戳仍是紫色。
         没匹配到通道的键值对保持原样不标。 */
      function markByChannels(html, colorByKey) {
        return html.replace(
          /([A-Za-z_\u4e00-\u9fa5][A-Za-z0-9_\u4e00-\u9fa5\-.]*\s*[=:]\s*)(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
          function (m, keyPart, num) {
            var k = keyPart.replace(/\s*[=:]\s*$/, "");
            var color = colorByKey[k];
            if (!color) { return m; }
            return keyPart + '<span class="sl-mon-num" style="color:' + color + '">' + num + '</span>';
          });
      }

      function draw(data) {
        var recs = data.recentRaw ? data.recentRaw(panel.window || 500) : [];
        var opts = panel.opts || {};
        var maxLines = opts.maxLines || 300;
        if (recs.length > maxLines) { recs = recs.slice(recs.length - maxLines); }

        var showTs = opts.showTimestamp !== false;
        var showHex = !!opts.showHex;
        var showDir = opts.showDir !== false;
        var ui = core.config.ui || {};
        var timeMode = (core.config.transport && core.config.transport.timeMode === "rel") ? "rel" : "abs";
        /* V2.2.6：时间戳精度（s / ms / us）与方向标记模式（all / tx / off） */
        var prec = (core.config.transport && core.config.transport.timePrec) || "ms";
        var dirMode = (core.config.transport && core.config.transport.dirMode) || "brief";
        var base = (SL.app && SL.app.timeBase) ? SL.app.timeBase() : 0;
        var markNum = false;
        var markCh = false;
        /* V2.2.13：数字高亮三档——channel（默认，跟波形通道同色）/ red（全红加粗）/ off */
        var numStyle = (ui.numStyle === "red" || ui.numStyle === "off") ? ui.numStyle : "channel";
        if (!showHex) {
          if (numStyle === "red") { markNum = true; }
          if (numStyle === "channel") { markCh = true; }
        }
        var colorByKey = null;
        if (markCh) {
          colorByKey = {};
          var chs = data.channels ? data.channels() : [];
          for (var ci = 0; ci < chs.length; ci++) {
            if (chs[ci].key) { colorByKey[chs[ci].key] = chs[ci].color; }
            if (chs[ci].label) { colorByKey[chs[ci].label] = chs[ci].color; }
          }
        }
        var markFail = ui.markFailed !== false;

        box.className = "sl-mon" +
          (showTs ? "" : " is-nots") +
          (showDir ? "" : " is-nodir") +
          (showHex ? " is-hex" : "");

        var out = [];
        for (var i = 0; i < recs.length; i++) {
          var rec = recs[i];
          var tx = rec.dir === "tx";
          var failed = markFail && !tx && rec.ok === false;
          var cls = "sl-mon-line" + (tx ? " is-tx" : "") + (failed ? " is-fail" : "");
          var row = '<div class="' + cls + '">';

          if (showTs) {
            var lab;
            if (timeMode === "rel") {
              var dt = rec.t - base;
              lab = prec === "s" ? (Math.round(dt / 100) / 10).toFixed(1) + "s"
                  : prec === "us" ? (dt / 1000).toFixed(6) + "s"
                  : (rec.tLabel || "");
            } else {
              /* 墙钟精度上限是毫秒：us 档绝对口径与 ms 相同 */
              lab = prec === "s" ? U.fmtClock(rec.tWall, false) : (rec.tLabelAbs || "");
            }
            row += '<span class="sl-mon-t">' + U.esc(lab || "") + '</span>';
          }
          if (showDir) {
            /* V2.2.11 默认 brief：RX 行只印「←」短标记（紧跟时间戳、不吵），
               TX 行仍印「→ 上位机」——发送的行少而醒目，接收的方向一眼可辨；
               用户在 ⋯ 设置里可切 仅发送/每行全称/不显示 */
            var dirText = "";
            if (dirMode === "all") { dirText = tx ? "→ 上位机" : "← 下位机"; }
            else if (dirMode === "tx") { dirText = tx ? "→ 上位机" : ""; }
            else if (dirMode === "brief") { dirText = tx ? "→ 上位机" : "←"; }
            row += '<span class="sl-mon-dir">' + dirText + '</span>';
          }
          var text = showHex ? (rec.hex || rec.text || "") : (rec.text || rec.hex || "");
          var html = U.esc(text);
          if (markCh) { html = markByChannels(html, colorByKey); }
          else if (markNum) { html = markNumbers(html); }
          /* 失败原因写进内容列内部（而不是再加一个 grid 子项），
             否则会多出一列把三列对齐打乱 */
          if (failed && rec.reason) {
            html += '<span class="sl-mon-why"> ⚠ ' + U.esc(rec.reason) + '</span>';
          }
          row += '<span class="sl-mon-body">' + html + '</span>';
          row += '</div>';
          out.push(row);
        }

        box.innerHTML = out.join("");
        if (autoscroll) { box.scrollTop = box.scrollHeight; }
      }

      return {
        update: draw,
        resize: function () {},
        destroy: function () { hostEl.innerHTML = ""; }
      };
    }
  });

  /* ---------- 7) 二维轨迹 ---------- */
  P.register({
    id: "plotxy",
    label: "二维轨迹",
    category: "时域",
    autoCount: 2,
    defaults: { window: 800, h: 320, opts: { equalAxis: true } },
    make: function (hostEl, panel) {
      var view = makeView(hostEl);

      function draw(data) {
        view.fit();
        view.clear();
        var t = theme();
        var ctx = view.ctx;
        var chans = resolveChannels(panel, data, registry.plotxy);
        if (chans.length < 2) {
          ctx.fillStyle = t.ink3;
          ctx.font = "11px Consolas, monospace";
          ctx.textBaseline = "middle";
          ctx.fillText("需要两条通道（前一条作 X，后一条作 Y）", 12, view.h / 2);
          return;
        }
        var cx = chans[0], cy = chans[1];
        var sx = data.copy(cx.key, panel.window);
        var sy = data.copy(cy.key, panel.window);
        var n = Math.min(sx.v.length, sy.v.length);
        if (n < 2) {
          ctx.fillStyle = t.ink3;
          ctx.font = "11px Consolas, monospace";
          ctx.textBaseline = "middle";
          ctx.fillText("样本不足", 12, view.h / 2);
          return;
        }
        /* 从末尾对齐 */
        var ox = sx.v.length - n, oy = sy.v.length - n;

        var pad = { l: 44, r: 12, t: 18, b: 26 };
        var map = drawFrame(view, -1, 1, pad);   /* 先画网格骨架，量程下面重算 */

        var mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity;
        var i, vx, vy;
        for (i = 0; i < n; i++) {
          vx = sx.v[ox + i]; vy = sy.v[oy + i];
          if (!isFinite(vx) || !isFinite(vy)) { continue; }
          if (vx < mnX) { mnX = vx; }
          if (vx > mxX) { mxX = vx; }
          if (vy < mnY) { mnY = vy; }
          if (vy > mxY) { mxY = vy; }
        }
        if (!isFinite(mnX)) { mnX = -1; mxX = 1; mnY = -1; mxY = 1; }
        if (mxX - mnX < 1e-9) { mnX -= 0.5; mxX += 0.5; }
        if (mxY - mnY < 1e-9) { mnY -= 0.5; mxY += 0.5; }
        var px = (mxX - mnX) * 0.06, py = (mxY - mnY) * 0.06;
        mnX -= px; mxX += px; mnY -= py; mxY += py;

        view.clear();
        drawFrame(view, mnY, mxY, pad);
        var plotW = Math.max(1, view.w - pad.l - pad.r);
        var plotH = Math.max(1, view.h - pad.t - pad.b);
        var X = function (v) { return pad.l + ((v - mnX) / (mxX - mnX)) * plotW; };
        var Y = function (v) { return pad.t + plotH - ((v - mnY) / (mxY - mnY)) * plotH; };

        ctx.save();
        ctx.strokeStyle = (panel.colors && panel.colors[cx.key]) || cx.color || "#3b82f6";
        ctx.lineWidth = 1.2;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        var started = false;
        for (i = 0; i < n; i++) {
          vx = sx.v[ox + i]; vy = sy.v[oy + i];
          if (!isFinite(vx) || !isFinite(vy)) { started = false; continue; }
          if (!started) { ctx.moveTo(X(vx), Y(vy)); started = true; }
          else { ctx.lineTo(X(vx), Y(vy)); }
        }
        ctx.stroke();
        /* 最新点 */
        var lx = sx.v[sx.v.length - 1], ly = sy.v[sy.v.length - 1];
        if (isFinite(lx) && isFinite(ly)) {
          ctx.globalAlpha = 1;
          ctx.fillStyle = (panel.colors && panel.colors[cx.key]) || cx.color || "#3b82f6";
          ctx.beginPath();
          ctx.arc(X(lx), Y(ly), 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

        ctx.save();
        ctx.fillStyle = t.ink3;
        ctx.font = "10px Consolas, monospace";
        ctx.textBaseline = "top";
        ctx.fillText("X: " + (cx.label || cx.key) + "   Y: " + (cy.label || cy.key), 4, view.h - pad.b + 4);
        ctx.restore();
      }

      return {
        update: draw,
        resize: function () { view.fit(); },
        destroy: function () { view.destroy(); }
      };
    }
  });

  SL.plugins = P;

  /* UMD 尾：校验脚本可加载 validate / importPack 等做断言 */
  if (typeof module !== "undefined" && module.exports) { module.exports = SL.plugins; }
})(typeof window !== "undefined" ? window : globalThis);
