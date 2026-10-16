/* ============================================================
   网页端串口调试助手 · SerialLab
   模块：ui（界面层）
   职责：DOM 绑定 / 控件同步 / 对话框 / 提示条 / 主题 / 快捷键 / 发送引擎
   依赖：core、util、transport、parser、codec、plugins、views、datastore、timeline、exporters
   约定：
     - 本模块是唯一直接操作 index.html 静态节点的模块；业务模块一律不碰 DOM
     - 所有用户可见文本一律走 textContent，禁止 innerHTML（站点 XSS 基线）
     - 配置写入统一走 core.config + saveConfig，随后 emit("config:changed")
     - app.js 负责数据管线，ui 只通过 SL.app.send()/sendPreset() 请求发送
     - 发送引擎（定时轮询 / 触发应答 / 预设回包检测）放在本模块：
       它订阅 core 的 "frame" / "serial:opened" 事件，与数据管线解耦
   ============================================================ */
;(function (global) {
  "use strict";

  var SL = global.SerialLab = global.SerialLab || {};
  var U = SL.util;
  var core = SL.core;
  var T = SL.transport;

  var UI = {};

  /* 应用内显示版本——必须与站点版本链一致（site.js S.VERSION / CHANGELOG），
     V2.2.4 及之前一直停在 1.0.0 没跟过发版，用户会误读成「没更新」 */
  UI.VERSION = "2.2.25";

  /* ------------------------------------------------------------
     0) 小工具
     ------------------------------------------------------------ */
  function $(id) { return document.getElementById(id); }

  /* 建元素：cls 为空时不写 className，避免产出空 class（站点样式规约） */
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text !== undefined && text !== null) { e.textContent = String(text); }
    return e;
  }

  function pad(n, len) {
    var s = String(n);
    while (s.length < len) { s = "0" + s; }
    return s;
  }

  function hex4(n) {
    if (typeof n !== "number" || !isFinite(n)) { return "----"; }
    return pad(n.toString(16).toUpperCase(), 4);
  }

  function fmtMs(ms) {
    var s = Math.round((ms || 0) / 100) / 10;
    if (s < 60) { return s + "s"; }
    return Math.floor(s / 60) + "m" + Math.round(s % 60) + "s";
  }

  function setPath(obj, path, val) {
    var parts = String(path).split(".");
    var o = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (!o[parts[i]] || typeof o[parts[i]] !== "object") { o[parts[i]] = {}; }
      o = o[parts[i]];
    }
    o[parts[parts.length - 1]] = val;
  }

  function getPath(obj, path) {
    var parts = String(path).split(".");
    var o = obj;
    for (var i = 0; i < parts.length; i++) {
      if (o === null || o === undefined) { return undefined; }
      o = o[parts[i]];
    }
    return o;
  }

  /* 配置变更落盘 + 广播（所有控件共用） */
  var saveTimer = null;
  function touch(scope) {
    core.saveConfig();
    core.emit("config:changed", { scope: scope || "all" });
  }

  function touchLazy(scope) {
    if (saveTimer) { clearTimeout(saveTimer); }
    saveTimer = setTimeout(function () { saveTimer = null; touch(scope); }, 350);
  }

  /* 泛绑定：把 DOM 控件与配置路径接起来
     spec = { el, path, type:"chk"|"num"|"text"|"select", scope, apply(v), read(node), write(node,v) }
     read/write 用于控件取值与配置取值**类型不一致**的场景：
       - 复选框 ↔ 字符串（如 flow："none"|"hardware"）
       - 下拉的 value 是字面量 "\\n"，而配置里存的是真换行 "\n" */
  function bind(spec) {
    var node = typeof spec.el === "string" ? $(spec.el) : spec.el;
    if (!node) { return null; }
    function read() {
      if (spec.read) { return spec.read(node); }
      if (spec.type === "chk") { return !!node.checked; }
      if (spec.type === "num") { var v = parseFloat(node.value); return isFinite(v) ? v : 0; }
      if (spec.type === "select") { return node.value; }
      return node.value;
    }
    function write() {
      var v = getPath(core.config, spec.path);
      if (spec.write) { spec.write(node, v); return; }
      if (spec.type === "chk") { node.checked = !!v; }
      else if (v === undefined || v === null) { node.value = ""; }
      else { node.value = String(v); }
    }
    node.addEventListener("change", function () {
      setPath(core.config, spec.path, read());
      touch(spec.scope);
      if (spec.apply) { spec.apply(read()); }
    });
    write();
    return { node: node, sync: write };
  }

  var bindings = [];
  function addBind(spec) { var b = bind(spec); if (b) { bindings.push(b); } return b; }

  function syncForms() {
    for (var i = 0; i < bindings.length; i++) { bindings[i].sync(); }
  }

  /* ------------------------------------------------------------
     1) 提示条
     ------------------------------------------------------------ */
  var TOAST_CLS = { info: "", ok: "is-ok", warn: "is-warn", bad: "is-bad", error: "is-bad" };

  UI.toast = function (level, msg, ms) {
    var host = $("slToasts");
    if (!host) { return; }
    var d = el("div", "sl-toast " + (TOAST_CLS[level] === undefined ? "" : TOAST_CLS[level]));
    d.textContent = String(msg);
    host.appendChild(d);
    var life = ms || ((level === "bad" || level === "error") ? 6000 : 3600);
    global.setTimeout(function () {
      if (d.parentNode) { d.parentNode.removeChild(d); }
    }, life);
  };

  /* ------------------------------------------------------------
     2) 通用对话框
     ------------------------------------------------------------ */
  var modalOnClose = null;

  UI.modal = function (opts) {
    var m = $("slModal");
    if (!m) { return; }
    opts = opts || {};
    $("slModalTitle").textContent = opts.title || "";
    var body = $("slModalBody");
    body.textContent = "";
    if (opts.body) { body.appendChild(opts.body); }

    var foot = $("slModalFoot");
    foot.textContent = "";
    var buttons = opts.buttons || [{ label: "关闭" }];
    for (var i = 0; i < buttons.length; i++) {
      (function (b) {
        var btn = el("button", "sl-btn" + (b.primary ? " is-primary" : "") + (b.danger ? " is-danger" : ""), b.label);
        btn.type = "button";
        btn.addEventListener("click", function () {
          if (b.onClick && b.onClick() === false) { return; }
          UI.closeModal();
        });
        foot.appendChild(btn);
      })(buttons[i]);
    }

    modalOnClose = opts.onClose || null;
    m.hidden = false;
    if (opts.focus) {
      global.setTimeout(function () {
        var f = body.querySelector(opts.focus);
        if (f && f.focus) { f.focus(); }
      }, 0);
    }
  };

  UI.closeModal = function () {
    var m = $("slModal");
    if (!m || m.hidden) { return; }
    m.hidden = true;
    $("slModalBody").textContent = "";
    $("slModalFoot").textContent = "";
    var f = modalOnClose;
    modalOnClose = null;
    if (f) { f(); }
  };

  UI.isModalOpen = function () {
    var m = $("slModal");
    return !!(m && !m.hidden);
  };

  /* 单行/多行输入框对话框，返回 Promise<string|null> */
  UI.prompt = function (title, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var wrap = el("div");
      if (opts.label) { wrap.appendChild(el("div", "sl-field", opts.label)); }
      if (opts.hint) { wrap.appendChild(el("p", "sl-hint", opts.hint)); }

      var input;
      if (opts.multiline) {
        input = el("textarea", "sl-mono-input");
        input.rows = opts.rows || 8;
        input.style.width = "100%";
      } else {
        input = el("input", "sl-mono-input");
        input.type = "text";
        input.style.width = "100%";
      }
      input.value = (opts.value === undefined || opts.value === null) ? "" : String(opts.value);
      if (opts.placeholder) { input.placeholder = opts.placeholder; }
      wrap.appendChild(input);

      var errEl = el("p", "sl-hint");
      wrap.appendChild(errEl);

      if (opts.hint2) { wrap.appendChild(el("p", "sl-hint", opts.hint2)); }

      UI.modal({
        title: title,
        body: wrap,
        focus: opts.multiline ? "textarea" : "input",
        onClose: function () { resolve(null); },
        buttons: [
          {
            label: opts.okText || "确定", primary: true,
            onClick: function () {
              var v = input.value;
              if (opts.validate) {
                var e = opts.validate(v);
                if (e) { errEl.textContent = e; return false; }
              }
              resolve(v);
              return true;
            }
          },
          { label: "取消", onClick: function () { resolve(null); return true; } }
        ]
      });
    });
  };

  /* opts.danger === false 时确认键不画成危险红——「拆成独立面板」这类建设性操作
     用红键会让人以为有破坏性；不传 opts 时行为与以前完全一致（向后兼容）。 */
  UI.confirm = function (title, msg, okText, opts) {
    var danger = !(opts && opts.danger === false);
    return new Promise(function (resolve) {
      var wrap = el("div");
      wrap.appendChild(el("p", "sl-note", msg));
      UI.modal({
        title: title,
        body: wrap,
        onClose: function () { resolve(false); },
        buttons: [
          { label: okText || "确定", danger: danger, onClick: function () { resolve(true); return true; } },
          { label: "取消", onClick: function () { resolve(false); return true; } }
        ]
      });
    });
  };

  /* 静态内容展示（标题 + 段落数组），零 innerHTML */
  UI.showArticle = function (title, blocks) {
    var wrap = el("div", "sl-article");
    var body = el("div", "sl-article-body");
    var heads = [];
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      var sec = el("section", "sl-article-sec");
      sec.setAttribute("data-text", ((b.h || "") + " " + (b.p || "") + " " + (b.list || []).join(" ")).toLowerCase());
      if (b.h) { sec.appendChild(el("h3", "sl-group-title", b.h)); heads.push({ h: b.h, sec: sec }); }
      if (b.p) { sec.appendChild(el("p", "sl-hint", b.p)); }
      if (b.code) {
        var pre = el("pre", "sl-prompt");
        pre.textContent = b.code;
        sec.appendChild(pre);
      }
      if (b.list) {
        var ul = el("ul");
        for (var j = 0; j < b.list.length; j++) { ul.appendChild(el("li", null, b.list[j])); }
        sec.appendChild(ul);
      }
      body.appendChild(sec);
    }
    wrap.appendChild(body);

    /* V2.2.6：章节够多时给顶部搜索框 + 目录 chips（点击跳转、输入即过滤） */
    if (heads.length >= 4) {
      var tools = el("div", "sl-article-tools");
      var input = el("input", "sl-article-search");
      input.type = "search";
      input.placeholder = "搜索本帮助（如：乱码 / HEX / MCP / 命名）";
      var toc = el("div", "sl-article-toc");
      var filter = function (q) {
        q = String(q || "").replace(/^\s+|\s+$/g, "").toLowerCase();
        var secs = body.children;
        for (var s = 0; s < secs.length; s++) {
          var t = secs[s].getAttribute("data-text") || "";
          secs[s].style.display = (!q || t.indexOf(q) >= 0) ? "" : "none";
        }
      };
      for (var k = 0; k < heads.length; k++) {
        (function (sec, label) {
          var chip = el("button", "sl-toc-chip", label);
          chip.type = "button";
          chip.addEventListener("click", function () {
            input.value = "";
            filter("");
            try { sec.scrollIntoView({ behavior: "smooth", block: "start" }); }
            catch (e0) { sec.scrollIntoView(); }
          });
          toc.appendChild(chip);
        })(heads[k].sec, heads[k].h);
      }
      input.addEventListener("input", function () { filter(input.value); });
      tools.appendChild(input);
      tools.appendChild(toc);
      wrap.insertBefore(tools, body);
    }
    UI.modal({ title: title, body: wrap, buttons: [{ label: "关闭" }] });
  };

  /* ------------------------------------------------------------
     3) 主题
     ------------------------------------------------------------ */
  var THEME_KEY = "site-theme";

  function resolveTheme(mode) {
    if (mode === "dark" || mode === "light") { return mode; }
    if (global.matchMedia && global.matchMedia("(prefers-color-scheme: dark)").matches) { return "dark"; }
    return "light";
  }

  UI.applyTheme = function (mode) {
    mode = (mode === "light" || mode === "dark") ? mode : "auto";
    core.config.ui.theme = mode;
    var resolved = resolveTheme(mode);
    var root = document.documentElement;
    root.setAttribute("data-theme", resolved);
    root.setAttribute("data-theme-early", resolved);
    try { localStorage.setItem(THEME_KEY, resolved); } catch (e) { /* 隐私模式：仅本次生效 */ }
    if (SL.plugins) { SL.plugins.invalidateTheme(); }
    if (SL.views) { SL.views.redraw(); }
    core.saveConfig();
    return resolved;
  };

  UI.cycleTheme = function () {
    var order = ["auto", "light", "dark"];
    var cur = core.config.ui.theme || "auto";
    var next = order[(order.indexOf(cur) + 1 + order.length) % order.length];
    var resolved = UI.applyTheme(next);
    var label = (next === "auto") ? "跟随系统" : (next === "light" ? "浅色" : "深色");
    UI.toast("info", "主题：" + label + "（当前生效 " + (resolved === "dark" ? "深色" : "浅色") + "）");
  };

  /* ------------------------------------------------------------
     4) 连接条 / 设备面板
     ------------------------------------------------------------ */
  var CONN_TEXT = {
    unsupported: "不支持",
    idle: "未连接",
    requesting: "选择设备…",
    opening: "打开中…",
    open: "已连接",
    closing: "关闭中…",
    error: "连接异常"
  };

  var lastSent = "";
  var signalTimer = null;
  var resetTimer = null;

  function renderConn() {
    var conn = core.state.conn;
    var demo = core.state.demo;
    var dot = $("slDot");
    if (dot) {
      var cls = "sl-dot";
      if (conn === "open") { cls += " is-open"; }
      else if (conn === "requesting" || conn === "opening" || conn === "closing") { cls += " is-busy"; }
      else if (conn === "error") { cls += " is-bad"; }
      dot.className = cls;
    }
    var st = $("slState");
    if (st) {
      st.textContent = demo ? "演示模式" : (CONN_TEXT[conn] || conn);
    }

    var info = core.state.portInfo;
    var alias = (core.config.transport && core.config.transport.alias) || "";
    $("slVidPid").textContent = info
      ? (alias || ("VID " + hex4(info.usbVendorId) + " · PID " + hex4(info.usbProductId)))
      : (demo ? "虚拟设备" : "-");
    $("slVidPid").title = info
      ? ("VID " + hex4(info.usbVendorId) + " · PID " + hex4(info.usbProductId)
        + (alias ? " · 别名「" + alias + "」" : "") + "（右下角 ⋯ 可设设备别名）")
      : "";

    /* V2.2.3：实时参数徽章跟随连接态（乱码态由 garbleShown 决定） */
    renderParamBadge();
    /* V2.2.4：测试案例徽章跟随连接态 */
    renderTestBadge();

    var busy = (conn === "requesting" || conn === "opening" || conn === "closing");
    $("slBtnConnect").disabled = busy || conn === "open" || conn === "unsupported";
    $("slBtnDisconnect").disabled = !(conn === "open");
    $("slBtnDemo").textContent = demo ? "退出演示模式" : "进入演示模式";
    $("slBtnDemo").disabled = (conn === "open" && !demo) || busy;
    $("slBtnReconnect").disabled = !(core.state.portInfo && conn === "idle");

    $("slTxCount").textContent = T.stats.tx;
    $("slRxCount").textContent = T.stats.rx;

    /* 运行圆标依赖「是否已连上 / 是否在演示」，连接态一变就得跟着重画，
       否则进演示模式后圆标还停在「暂停」灰态，看着像坏了。 */
    renderRun();

    var hint = $("slSendHint");
    if (hint) {
      /* V2.2.5：发送条提示语一律短句（长文案会撑出横向滚动条） */
      if (!T.isSupported() && !demo) {
        hint.textContent = "浏览器不支持 Web Serial，可用「测试」页签体验";
      } else if (conn !== "open") {
        hint.textContent = "未连接——去「测试」页签可无硬件体验";
      } else if (T.isResetting()) {
        hint.textContent = "设备复位中，稍候再发送";
      } else {
        hint.textContent = demo
          ? "演示中。发送内容会回显到监视器"
          : "已连接。回车发送；HEX 可空格分隔";
      }
    }
    $("slSendInput").disabled = (conn !== "open");
  }

  function renderSignals(sig) {
    var box = $("slModem");
    if (!box) { return; }
    if (!sig) { box.textContent = "CTS - · DSR - · DCD - · RI -"; return; }
    function m(v) { return v ? "1" : "0"; }
    box.textContent = "CTS " + m(sig.clearToSend) + " · DSR " + m(sig.dataSetReady)
      + " · DCD " + m(sig.dataCarrierDetect) + " · RI " + m(sig.ringIndicator);
  }

  function startSignalPoll() {
    stopSignalPoll();
    if (!core.state.port) { renderSignals(null); return; }
    signalTimer = setInterval(function () {
      if (!core.state.port) { return; }
      T.readSignals().then(renderSignals);
    }, 1000);
  }

  function stopSignalPoll() {
    if (signalTimer) { clearInterval(signalTimer); signalTimer = null; }
  }

  function markResetWindow() {
    if (resetTimer) { clearInterval(resetTimer); resetTimer = null; }
    if (!T.isResetting()) { renderConn(); return; }
    renderConn();
    resetTimer = setInterval(function () {
      if (!T.isResetting()) {
        clearInterval(resetTimer);
        resetTimer = null;
        UI.toast("info", "设备复位等待结束，可以发送了");
      }
      renderConn();
    }, 300);
  }

  function wireConnectionBar() {
    $("slBtnConnect").addEventListener("click", function () {
      T.connect(core.config.transport)["catch"](function () {
        /* connect 内部已提示并记录日志，这里只需刷新界面 */
        renderConn();
      });
    });

    $("slBtnDisconnect").addEventListener("click", function () {
      T.disconnect();
    });

    $("slBtnReconnect").addEventListener("click", function () {
      var cfg = core.config.transport;
      T.disconnect().then(function () { return T.connect(cfg); })["catch"](function () {
        renderConn();
      });
    });

    /* 演示入口已挪入「测试」页签（V2.2.4），接线见 wireTestPane() */

    /* 设备参数（波特率/数据位/停止位/校验/流控）的接线见 wireDeviceAndShow() */

    $("slBtnDtr").addEventListener("click", function () { flipSignal("dtr"); });
    $("slBtnRts").addEventListener("click", function () { flipSignal("rts"); });
    $("slBtnBreak").addEventListener("click", function () {
      T.setSignals({ brk: true }).then(function () {
        return T.setSignals({ brk: false });
      }).then(function () {
        UI.toast("info", "已发送 BREAK 信号");
      })["catch"](function () {
        UI.toast("warn", "当前设备不支持 BREAK 信号");
      });
    });

    $("slBlurDisconnect").addEventListener("change", function () {
      if (!this.checked) { return; }
      if (!confirmLoose("开启后，本页失去焦点会自动断开串口。确定开启吗？")) {
        this.checked = false;
        core.config.transport.blurDisconnect = false;
        core.saveConfig();
      }
    });

    global.addEventListener("blur", function () {
      if (core.config.transport.blurDisconnect && core.state.conn === "open") {
        T.disconnect().then(function () { UI.toast("info", "页面失焦，已自动断开"); });
      }
    });
  }

  /* ------------------------------------------------------------
     4b) 设备参数 + 编码显示 + 发送行为 的接线
     原则：控件先落进 core.config（可持久化），再按需触发副作用。
     bind() 内部顺序是 setPath → touch → apply，因此 reopen 时读到的
     必然是**新**参数，不会出现「按旧参数重开」。
     ------------------------------------------------------------ */
  /* 下拉的 value 是字面反斜杠串（HTML 属性不解析 \n），与配置里的真控制字符互转 */
  var EOL_TO_CFG = { "\\n": "\n", "\\r": "\r", "\\r\\n": "\r\n", "": "" };
  var EOL_TO_DOM = { "\n": "\\n", "\r": "\\r", "\r\n": "\\r\\n", "": "" };

  function reopenIfOpen() {
    if (!core.state.port) { return; }
    T.reopen().then(function (ok) {
      if (ok) { UI.toast("ok", "参数已生效（端口已重新打开）"); }
    });
  }

  /* 显示层开关（时间戳 / HEX 显示）落成监视器面板的 opts */
  function applyMonitorDisplay() {
    var apps = SL.views.list();
    for (var i = 0; i < apps.length; i++) {
      if (apps[i].type !== "textmon") { continue; }
      var opts = U.clone(apps[i].opts || {});
      opts.showTimestamp = core.config.transport.showTimestamp !== false;
      opts.showHex = !!core.config.transport.hexRecv;
      SL.views.updatePanel(apps[i].id, { opts: opts });
    }
  }

  function wireDeviceAndShow() {
    /* --- 串口参数：改了立刻写配置，已连接时顺带重开端口 --- */
    addBind({ el: "slBaud", path: "transport.baudRate", type: "num", scope: "transport", apply: reopenIfOpen });
    addBind({ el: "slDataBits", path: "transport.dataBits", type: "num", scope: "transport", apply: reopenIfOpen });
    addBind({ el: "slStopBits", path: "transport.stopBits", type: "num", scope: "transport", apply: reopenIfOpen });
    addBind({ el: "slParity", path: "transport.parity", type: "select", scope: "transport", apply: reopenIfOpen });
    /* 硬流控复选框 ↔ 配置里的字符串 "none"|"hardware" */
    addBind({
      el: "slFlow", path: "transport.flow", type: "chk", scope: "transport", apply: reopenIfOpen,
      read: function (n) { return n.checked ? "hardware" : "none"; },
      write: function (n, v) { n.checked = (v === "hardware"); }
    });

    /* --- 连接行为 --- */
    addBind({ el: "slAutoReconnect", path: "transport.autoReconnect", type: "chk", scope: "transport" });
    addBind({ el: "slResetWait", path: "transport.resetWaitMs", type: "num", scope: "transport" });

    /* --- 编码与发送换行 --- */
    addBind({ el: "slEncoding", path: "transport.encoding", type: "select", scope: "transport" });
    addBind({
      el: "slLineEnding", path: "transport.lineEnding", type: "select", scope: "transport",
      read: function (n) { return EOL_TO_CFG[n.value] !== undefined ? EOL_TO_CFG[n.value] : "\n"; },
      write: function (n, v) { n.value = (EOL_TO_DOM[v] !== undefined) ? EOL_TO_DOM[v] : "\\n"; }
    });
    addBind({ el: "slAppendEnding", path: "transport.appendLineEnding", type: "chk", scope: "transport" });

    /* --- HEX 发送：顶栏与底部发送条两个开关同源，改动互相同步 --- */
    var bTop = null, bBottom = null;
    bTop = addBind({
      el: "slHexSend", path: "transport.hexSend", type: "chk", scope: "transport",
      apply: function () { if (bBottom) { bBottom.sync(); } }
    });
    bBottom = addBind({
      el: "slSendHex", path: "transport.hexSend", type: "chk", scope: "transport",
      apply: function () { if (bTop) { bTop.sync(); } }
    });

    /* --- 显示层：时间戳 / HEX 显示，改动即时应用到监视器面板 --- */
    addBind({
      el: "slShowTs", path: "transport.showTimestamp", type: "chk", scope: "transport",
      apply: applyMonitorDisplay
    });
    addBind({
      el: "slHexRecv", path: "transport.hexRecv", type: "chk", scope: "transport",
      apply: applyMonitorDisplay
    });
  }

  /* ------------------------------------------------------------
     4.5) V2.2.3：参数徽章 / 参数预设 / 编码识别 / 波特率扫描 / 乱码排查 / 演示增强
     ------------------------------------------------------------ */
  var garbleShown = false;

  /* 把某个 select/number/checkbox 的值改掉并触发 change（让 addBind 落配置）。
     V2.2.4 修:checkbox 的状态在 .checked 不在 .value——旧版对复选框
     setAndFire("xxx","on") 实际没勾上,配置也就没写(V2.2.3 的
     slBtnHexView 一路就已中招,本轮被测试案例卡片踩实后补上)。 */
  function setAndFire(id, val) {
    var n = $(id);
    if (!n) { return; }
    if (n.type === "checkbox") {
      n.checked = (val === true || val === "on" || val === 1);
    } else {
      n.value = val;
    }
    n.dispatchEvent(new Event("change"));
  }

  /* 实时参数徽章：一眼看清「此刻端口按什么参数在跑」 */
  function renderParamBadge() {
    var b = $("slParamBadge");
    if (!b) { return; }
    var conn = core.state.conn;
    var demo = core.state.demo;
    var t = core.config.transport;
    if (garbleShown) { b.setAttribute("data-state", "garbled"); }
    else if (conn === "open") { b.setAttribute("data-state", "open"); }
    else if (conn === "requesting" || conn === "opening" || conn === "closing") { b.setAttribute("data-state", "busy"); }
    else { b.setAttribute("data-state", "idle"); }
    if (demo) { b.textContent = "演示模式 · 虚拟数据"; return; }
    if (conn !== "open") {
      b.textContent = "未连接 · 待命 " + (t.baudRate || 115200);
      return;
    }
    var par = { none: "N", even: "E", odd: "O" }[t.parity || "none"] || "N";
    var flow = (t.flow === "hardware") ? " · 流控" : "";
    b.textContent = (t.baudRate || 115200) + " · " + (t.dataBits || 8) + par + (t.stopBits || 1)
      + flow + " · " + String(t.encoding || "utf-8").toUpperCase();
  }

  /* 常用预设：把 "115200-8N1" 拆开写进四个控件（change 逐个触发，
     reopenIfOpen 自带去抖，只重开一次端口） */
  function applySerialPreset(v) {
    var m = /^(\d+)-(\d)([NEO])(\d)$/.exec(String(v || ""));
    if (!m) { return; }
    var parity = { N: "none", E: "even", O: "odd" }[m[3]];
    setAndFire("slBaud", m[1]);
    setAndFire("slDataBits", m[2]);
    setAndFire("slParity", parity);
    setAndFire("slStopBits", m[4]);
    UI.toast("ok", "已套用预设 " + m[1] + " · " + m[2] + m[3] + m[4] + (core.state.conn === "open" ? "（端口已重开）" : ""));
  }

  /* 取最近收到的原始字节（从记录的 HEX 字段拼回，最多 limit 字节） */
  function recentBytes(limit) {
    var recs = SL.datastore.recentRaw(300);
    var hexes = [];
    var total = 0;
    for (var i = recs.length - 1; i >= 0 && total < limit; i--) {
      var r = recs[i];
      if (r.dir !== "rx" || !r.hex) { continue; }
      hexes.unshift(r.hex);
      total += r.hex.replace(/[^0-9A-Fa-f]/g, "").length / 2;
    }
    return SL.codec.hexToBytes(hexes.join(" "));
  }

  /* 编码智能识别：对最近字节跑三分诊，按结论一键切换 */
  function detectEncodingNow() {
    var u8 = recentBytes(4096);
    if (!u8 || u8.length < 4) {
      UI.toast("warn", "收到的数据太少——先连上设备收一段，再点识别");
      return;
    }
    var r = SL.codec.analyzeEncoding(u8);
    var cur = core.config.transport.encoding || "utf-8";
    if (r.guess === "gbk") {
      setAndFire("slEncoding", "gbk");
      UI.toast("ok", "识别为 GBK，已切换。" + r.detail);
    } else if (r.guess === "binary") {
      if (!core.config.transport.hexRecv) { setAndFire("slHexRecv", "on"); }
      UI.toast("info", "更像二进制协议，已切到 HEX 显示。" + r.detail);
    } else if (r.guess === "latin1") {
      UI.toast("warn", "两种编码都解不通（多半是波特率错位的采样噪声）——建议「扫描波特率」。" + r.detail);
    } else if (r.guess === "ascii") {
      if (cur !== "utf-8") { setAndFire("slEncoding", "utf-8"); UI.toast("ok", "识别为纯 ASCII，已切回 UTF-8（显示等价）"); }
      else { UI.toast("ok", "识别为纯 ASCII，当前编码即可正常显示"); }
    } else {
      if (cur !== "utf-8") { setAndFire("slEncoding", "utf-8"); UI.toast("ok", "识别为 UTF-8，已切换。" + r.detail); }
      else { UI.toast("ok", "确认是合法 UTF-8 文本，无需切换"); }
    }
    hideGarble();
  }

  /* 波特率扫描：确认 → 扫描（进度走 serial:scan 事件）→ 自动切到最高分档 */
  /* V2.2.15（AUDIT A-84）：每档采样时长，用户可调（#slScanMs）。
     这个值直接决定扫描能否采到「上电后才开始打印」的设备——350ms 的旧默认值对
     H743 这类启动就要 100ms+ 的板子太短，经常全档 miss，看起来像「扫描没用」。
     非法/越界一律回落 700ms，并夹在 [200, 3000]。 */
  function scanSampleMs() {
    var n = $("slScanMs");
    var v = n ? parseInt(n.value, 10) : NaN;
    if (!isFinite(v) || v < 200) { v = 700; }
    if (v > 3000) { v = 3000; }
    return v;
  }

  /* 扫描的口径说明（两处入口共用，避免文案分叉） */
  function scanScopeText() {
    var ms = scanSampleMs();
    return "将对 12 个常用波特率逐档重开端口、各采样约 " + ms + "ms（另加预热与收尾），全程约 "
      + Math.round(12 * (ms + 250) / 1000) + " 秒。\n\n打分口径：「像不像文本」与"
      + "「按当前 HEX 规则试解出的帧成功率」取较高者。所以二进制协议要先把「解析」页签切到 "
      + "HEX 并配好帧结构——否则只按文本判分，HEX 帧永远扫不出来。\n\n"
      + "⚠ Arduino / ESP 等开发板每次打开串口都会自动复位，扫描期间设备会反复重启；"
      + "本版会在打开后压住 DTR/RTS 并给每档留一个预热窗口，能减轻但不能保证消除。";
  }

  function scanBaudUI() {
    if (T.isScanning()) { return; }
    if (core.state.conn === "open" || core.state.demo) {
      UI.toast("warn", "请先断开连接 / 退出演示模式再扫描");
      return;
    }
    UI.confirm("扫描波特率", scanScopeText() + "\n\n扫描完成后会自动切到最高分档。", "开始扫描")
      .then(function (ok) {
        if (!ok) { return; }
        T.scanBaudrate({ sampleMs: scanSampleMs() }).then(function (res) {
          renderScanButtons(null);
          if (res.best && res.best.baud) {
            setAndFire("slBaud", String(res.best.baud));
            var how = (res.best.by === "frame")
              ? "（按帧结构判分" + (res.best.frame ? "，" + res.best.frame.ok + "/" + res.best.frame.frames + " 帧解出" : "") + "）"
              : "（文本可疑度 " + res.best.score.toFixed(2) + "）";
            UI.toast("ok", "扫描完成：最优 " + res.best.baud + how + "，已切换");
          } else {
            UI.toast("warn", "各档位都没采到可用数据——确认设备正在发送；若是二进制协议，先把「解析」页签切到 HEX 并配好帧结构再扫");
          }
        }, function (err) {
          renderScanButtons(null);
          UI.toast("bad", "扫描失败：" + ((err && err.message) || err));
        });
        renderScanButtons(0);
      });
  }

  /* 扫描期间的按钮状态（两处按钮同源；AUTO 按钮跟随同一进度） */
  function renderScanButtons(idx) {
    var ids = ["slBtnScanBaud", "slBtnScanBaud2"];
    for (var i = 0; i < ids.length; i++) {
      var n = $(ids[i]);
      if (!n) { continue; }
      if (idx === null) { n.disabled = false; n.textContent = "扫描波特率"; }
      else { n.disabled = true; n.textContent = "扫描中…"; }
    }
    var auto = $("slBtnAuto");
    if (auto) {
      if (idx === null) { auto.disabled = false; auto.textContent = "⚡ AUTO 自适应"; }
      else { auto.disabled = true; auto.textContent = "自适应中…"; }
    }
  }

  /* V2.2.4：AUTO 一键自适应 = 扫波特率 + 识别编码 + 一键套用。
     结论映射：ascii→utf-8（显示等价）、gbk→gbk、latin1/binary→latin1 兜底；
     没采到数据时给出明确指引（设备要在发数据 / 没硬件去测试页签）。 */
  function autoAdaptUI() {
    if (T.isScanning()) { return; }
    if (core.state.conn === "open" || core.state.demo) {
      UI.toast("warn", "请先断开连接 / 退出演示模式再自适应");
      return;
    }
    UI.confirm(
      "AUTO 自适应",
      scanScopeText() + "\n\n然后按最优档采到的字节自动识别编码（UTF-8 / GBK / Latin-1）并一键套用。"
        + "二进制协议（按帧结构判分）不做编码切换，只切波特率。\n"
        + "没有硬件？到「测试」页签开一个案例即可体验。",
      "开始自适应"
    ).then(function (ok) {
      if (!ok) { return; }
      renderScanButtons(0);
      T.autoAdapt({ sampleMs: scanSampleMs() }).then(function (r) {
        renderScanButtons(null);
        if (!r.ok) {
          UI.toast("warn", "AUTO 没采到足够数据：确认设备上电且正在发数据；若是二进制协议，先在「解析」页签切到 HEX 并配好帧结构；没硬件可到「测试」页签开案例体验");
          return;
        }
        setAndFire("slBaud", String(r.baud));
        /* 按帧结构判出来的最优档说明设备在说二进制协议——此时「识别编码」是伪问题
           （对二进制字节谈 UTF-8/GBK 没有意义），只切波特率，别去动编码。 */
        if (r.by === "frame") {
          UI.toast("ok", "AUTO 完成：" + r.baud + " 波特率（按帧结构判分"
            + (r.frame ? "，" + r.frame.ok + "/" + r.frame.frames + " 帧解出" : "")
            + "）· 二进制协议不做编码切换 · 已套用");
          hideGarble();
          return;
        }
        var encMap = { "ascii": "utf-8", "utf-8": "utf-8", "gbk": "gbk", "latin1": "latin1", "binary": "latin1" };
        var encName = { "ascii": "ASCII", "utf-8": "UTF-8", "gbk": "GBK", "latin1": "Latin-1", "binary": "Latin-1" };
        var target = encMap[r.encoding] || "utf-8";
        setAndFire("slEncoding", target);
        UI.toast("ok", "AUTO 完成：" + r.baud + " 波特率 · " + (encName[r.encoding] || r.encoding)
          + (target === "utf-8" && r.encoding === "ascii" ? "（纯 ASCII，按 UTF-8 显示）" : "")
          + " · 已套用。" + r.detail);
        hideGarble();
      }, function (err) {
        renderScanButtons(null);
        UI.toast("bad", "AUTO 失败：" + ((err && err.message) || err));
      });
    });
  }

  /* 乱码排查条 */
  function showGarble(rate) {
    garbleShown = true;
    var bar = $("slGarbleBar");
    if (bar) {
      bar.hidden = false;
      var tipText = "通常是编码不对、波特率不匹配，或者它本来是二进制协议（点「HEX 显示」看字节，或到「测试」页签开文本案例对照）。按顺序试：";
      if (core.state.demo) {
        tipText = "演示中出乱码 = 你开了故障注入，或解析规则是 HEX 二进制帧（文本视图只显示解码噪声）。按顺序试：";
      }
      $("slGarbleText").textContent = "最近 " + Math.round(rate * 100) + "% 的字符解码失败（显示为菱形问号）。" + tipText;
    }
    UI.toast("warn", "检测到疑似乱码（解码失败率 " + Math.round(rate * 100) + "%），「设备」页签已给出排查建议");
    renderParamBadge();
    renderTestBadge();
  }

  function hideGarble() {
    garbleShown = false;
    var bar = $("slGarbleBar");
    if (bar) { bar.hidden = true; }
    renderParamBadge();
    renderTestBadge();
  }

  /* 每秒乱码体检：统计最近 RX 记录文本里的 U+FFFD 替换字符率，
     超过 5%（且样本够多）时提示一次，直到用户处理或重新连接 */
  function garbleScan() {
    if (core.state.conn !== "open" || garbleShown) { return; }
    var recs = SL.datastore.recentRaw(80);
    var chars = 0, bad = 0, rxCount = 0;
    for (var i = 0; i < recs.length; i++) {
      var r = recs[i];
      if (r.dir !== "rx" || !r.text) { continue; }
      rxCount++;
      for (var k = 0; k < r.text.length; k++) {
        chars++;
        if (r.text.charCodeAt(k) === 0xFFFD) { bad++; }
      }
    }
    if (rxCount >= 10 && chars >= 120) {
      var rate = bad / chars;
      /* 阈值 1%：正常 UTF-8/GBK 文本里替换字符应为 0（任何 FFFD 都可疑），
         三重门（≥10 行、≥120 字符、>1%）已足够防误报；波特率错位的真乱码
         远高于此（30%+），注入演示约 1.7%~3%（解码器会吞掉部分跨行非法序列） */
      if (rate > 0.01) { showGarble(rate); }
    }
  }

  /* 全局悬浮简介（data-tip → .sl-tipbox）：长悬浮 400ms 出现，
     fixed 定位不被左栏滚动容器裁剪，屏幕边缘自动翻转 */
  function initTooltips() {
    if ($("slTipbox") || !document.createElement) { return; }
    var box = document.createElement("div");
    box.className = "sl-tipbox";
    box.id = "slTipbox";
    document.body.appendChild(box);
    var cur = null, timer = null, lastRect = null;
    function place(node) {
      var tip = node.getAttribute("data-tip");
      if (!tip) { return; }
      box.textContent = tip;
      box.classList.add("is-on");
      var r = node.getBoundingClientRect();
      lastRect = { left: r.left, top: r.top };
      var bw = box.offsetWidth, bh = box.offsetHeight;
      var x = r.left + r.width / 2 - bw / 2;
      x = Math.max(8, Math.min(x, (global.innerWidth || 1200) - bw - 8));
      var y = r.bottom + 8;
      if (y + bh > (global.innerHeight || 800) - 8) { y = r.top - bh - 8; }
      box.style.left = x + "px";
      box.style.top = Math.max(8, y) + "px";
    }
    function clear() {
      if (timer) { clearTimeout(timer); timer = null; }
      box.classList.remove("is-on");
      cur = null;
    }
    document.addEventListener("mouseover", function (e) {
      var t = e.target;
      var n = (t && t.closest) ? t.closest("[data-tip]") : null;
      if (n === cur) { return; }
      if (timer) { clearTimeout(timer); timer = null; }
      if (!n) { box.classList.remove("is-on"); cur = null; return; }
      cur = n;
      /* V2.2.9：自绘气泡与浏览器原生 title 会同时弹（用户截图实证出现两个气泡）——
         命中 [data-tip] 时顺手摘掉原生 title，全局根除，以后写双属性也不会再犯 */
      if (n.getAttribute("title")) { n.removeAttribute("title"); }
      /* 位置基准要在进入时就记下（而不是 400ms 后 place 时）——监视器每帧
         自动滚动会立刻涌入 scroll 事件，没有基准就会把刚起的 timer 清掉 */
      var r0 = n.getBoundingClientRect();
      lastRect = { left: r0.left, top: r0.top };
      timer = setTimeout(function () { place(n); }, 400);
    });
    document.addEventListener("mousedown", clear);
    /* 滚动只在「目标真的移动了」时才清：演示模式里监视器每帧自动滚动，
       会源源不断触发 scroll(capture)——但顶栏元素根本没动，不该把悬浮
       简介杀掉；左栏内部滚动时控件真的位移了，才需要收起重定位 */
    document.addEventListener("scroll", function () {
      if (!cur) { return; }
      var r = cur.getBoundingClientRect();
      if (!lastRect
        || Math.abs(r.left - lastRect.left) > 4
        || Math.abs(r.top - lastRect.top) > 4) { clear(); }
    }, true);
  }

  function wireV223() {
    /* --- 演示增强开关（拟真信号 + 故障注入概率） --- */
    addBind({ el: "slDemoRealistic", path: "demo.realistic", type: "chk", scope: "demo" });
    addBind({ el: "slFaultDrop", path: "demo.faults.drop", type: "num", scope: "demo" });
    addBind({ el: "slFaultCorrupt", path: "demo.faults.corrupt", type: "num", scope: "demo" });
    addBind({ el: "slFaultStick", path: "demo.faults.stick", type: "num", scope: "demo" });
    addBind({ el: "slFaultGarbage", path: "demo.faults.garbage", type: "num", scope: "demo" });

    /* --- 常用预设：套用 / 手改参数回「自定义」 --- */
    var presetSel = $("slSerialPreset");
    if (presetSel) {
      presetSel.addEventListener("change", function () { applySerialPreset(presetSel.value); });
      var four = ["slBaud", "slDataBits", "slStopBits", "slParity"];
      for (var i = 0; i < four.length; i++) {
        (function (id) {
          var n = $(id);
          if (n) { n.addEventListener("change", function () { presetSel.value = ""; }); }
        })(four[i]);
      }
    }

    /* --- 扫描 / 识别（参数工具行 + 排查条里各一组，同源） --- */
    var scanIds = ["slBtnScanBaud", "slBtnScanBaud2"];
    for (var s = 0; s < scanIds.length; s++) {
      (function (id) {
        var n = $(id);
        if (n) { n.addEventListener("click", scanBaudUI); }
      })(scanIds[s]);
    }
    var detIds = ["slBtnDetectEnc", "slBtnDetectEnc2"];
    for (var d = 0; d < detIds.length; d++) {
      (function (id) {
        var n = $(id);
        if (n) { n.addEventListener("click", detectEncodingNow); }
      })(detIds[d]);
    }
    var autoBtn = $("slBtnAuto");
    if (autoBtn) { autoBtn.addEventListener("click", autoAdaptUI); }
    var hexBtn = $("slBtnHexView");
    if (hexBtn) {
      hexBtn.addEventListener("click", function () {
        if (!core.config.transport.hexRecv) { setAndFire("slHexRecv", "on"); }
        hideGarble();
      });
    }

    /* --- 编码切换的连带：GBK 发送提示 / 徽章刷新 / 收起排查条 --- */
    var encSel = $("slEncoding");
    if (encSel) {
      encSel.addEventListener("change", function () {
        var hint = $("slGbkSendHint");
        if (hint) { hint.hidden = (encSel.value !== "gbk"); }
        hideGarble();
        renderParamBadge();
      });
    }

    /* --- 扫描进度事件 → 按钮文本与徽章 --- */
    core.on("serial:scan", function (p) {
      if (p && p.phase === "open") {
        renderScanButtons(p.index || 0);
        var b = $("slParamBadge");
        if (b) { b.setAttribute("data-state", "busy"); b.textContent = "扫描中 " + p.baud + "…"; }
      }
    });

    /* --- 连接状态变化：徽章跟随 + 乱码监测重置 --- */
    core.on("serial:opened", function () { hideGarble(); });
    core.on("serial:closed", function () { hideGarble(); });
  }

  /* ------------------------------------------------------------
     V2.2.4：监视器面板快捷工具条（时间戳 / HEX / 编码）
     原理：快捷条控件不直接写配置，而是 setAndFire 反向驱动左栏
     同源控件（slShowTs / slHexRecv / slEncoding），让 addBind 继续
     当唯一写手——左栏与快捷条状态天然互相同步，行为口径一致。
     ------------------------------------------------------------ */
  /* 编码选项【单源】：直接读左栏 #slEncoding 的 option，不再维护第二份文案。
     这里曾经硬编码 ["gbk","GBK"]，而左栏写「GBK / GB2312」——同一个设置两处
     文案不同，用户看到的就是「重复而且不同步」（AUDIT A-83）。fallback 只在
     左栏控件缺失（页面结构被改坏）时兜底，正常路径永不使用。 */
  var QK_ENC_OPTS_FALLBACK = [
    ["utf-8", "UTF-8"], ["gbk", "GBK / GB2312"], ["ascii", "ASCII"],
    ["latin1", "Latin-1"], ["utf-16le", "UTF-16LE"]
  ];
  function encOptions() {
    var src = $("slEncoding");
    if (src && src.options && src.options.length) {
      var out = [];
      for (var i = 0; i < src.options.length; i++) {
        out.push([src.options[i].value, src.options[i].textContent]);
      }
      return out;
    }
    return QK_ENC_OPTS_FALLBACK;
  }

  function fillQuick(host) {
    /* 时域波形的快捷条：横轴窗口 + Y 轴手动范围（纵轴自由调节） */
    var plotId = host.getAttribute("data-quick-plot");
    if (plotId) {
      var cur = null, axis = {};
      var apps = SL.views.list();
      for (var p = 0; p < apps.length; p++) {
        if (apps[p].id === plotId) { cur = apps[p].window || 500; axis = apps[p].axis || {}; break; }
      }
      if (cur === null) { return; }
      var opts = [100, 250, 500, 1000, 2000];
      var optHtml = "";
      for (var i = 0; i < opts.length; i++) {
        optHtml += '<option value="' + opts[i] + '"' + (opts[i] === cur ? " selected" : "") + ">" + opts[i] + " 点</option>";
      }
      host.innerHTML = '<select class="sl-qk-enc" data-qk="win" title="横轴窗口：显示最近多少个采样点——太小抖动、太密看不清">' +
        optHtml + "</select>" +
        '<input class="sl-qk-num" data-qk="ymin" type="number" step="any" placeholder="Y↓" title="纵轴下限（留空 = 自动量程）" value="' +
          (typeof axis.yMin === "number" ? axis.yMin : "") + '">' +
        '<input class="sl-qk-num" data-qk="ymax" type="number" step="any" placeholder="Y↑" title="纵轴上限（留空 = 自动量程）" value="' +
          (typeof axis.yMax === "number" ? axis.yMax : "") + '">';
      return;
    }

    /* 频域谱的快捷条：窗函数（V2.2.25）。
       为什么要有这个入口：窗函数是频谱准不准的关键（不做加窗会有泄漏，小峰被旁瓣淹掉），
       但只能通过面板描述符设置的话用户根本够不着 —— 「功能在、用户够不着」不算做完。 */
    var fftId = host.getAttribute("data-quick-fft");
    if (fftId) {
      var curW = "hann";
      var pf = SL.views.getPanel(fftId);
      if (pf && pf.opts && pf.opts.fftWindow) { curW = pf.opts.fftWindow; }
      var wlist = SL.fft.windowNames || [];
      var wopt = "";
      for (var wi = 0; wi < wlist.length; wi++) {
        wopt += '<option value="' + wlist[wi].id + '"' + (wlist[wi].id === curW ? " selected" : "") + ">" + wlist[wi].label + "</option>";
      }
      host.innerHTML = '<select class="sl-qk-enc" data-qk="fftw" title="加窗方式：不做加窗会有频谱泄漏（峰被抹宽、小峰被旁瓣淹掉）；Hanning 是通用默认">' + wopt + "</select>";
      return;
    }

    /* 文本监视器的快捷条：时间戳 / 精度 / HEX / 编码 */
    var t = core.config.transport || {};
    var ts = t.showTimestamp !== false;
    var hex = !!t.hexRecv;
    var enc = t.encoding || "utf-8";
    var prec = t.timePrec || "ms";
    var encOptHtml = "";
    var encOpts = encOptions();          /* 单源：与左栏「编码」同一份选项与文案 */
    for (var e = 0; e < encOpts.length; e++) {
      encOptHtml += '<option value="' + encOpts[e][0] + '"' +
        (encOpts[e][0] === enc ? " selected" : "") + ">" + encOpts[e][1] + "</option>";
    }
    host.innerHTML =
      '<label class="sl-qk" title="显示 / 隐藏行首时间戳（同左栏「显示」页签）">' +
        '<input type="checkbox" data-qk="ts"' + (ts ? " checked" : "") + '>时间戳</label>' +
      /* V2.2.21：精度原先只藏在 ⋯ 设置中心里，用户找不到「时间精度在哪调」。
         就地放一个下拉，与设置中心同源（transport.timePrec），改完对新收的行生效。 */
      '<select class="sl-qk-enc" data-qk="prec" title="时间戳精度（同 ⋯ 设置中心；墙钟上限是毫秒，微秒只对相对口径生效；改后对新收的行生效）">' +
        '<option value="s"' + (prec === "s" ? " selected" : "") + '>秒</option>' +
        '<option value="ms"' + (prec === "ms" ? " selected" : "") + '>毫秒</option>' +
        '<option value="us"' + (prec === "us" ? " selected" : "") + '>微秒</option>' +
      '</select>' +
      '<label class="sl-qk" title="以 HEX 十六进制显示收到的字节（同左栏「HEX 显示」）">' +
        '<input type="checkbox" data-qk="hex"' + (hex ? " checked" : "") + '>HEX</label>' +
      '<select class="sl-qk-enc" data-qk="enc" title="收码字符编码（同左栏「编码」，含 GBK）">' +
        encOptHtml + '</select>';
  }

  function refreshAllQuick() {
    var hosts = document.querySelectorAll("[data-quick]");
    for (var i = 0; i < hosts.length; i++) { fillQuick(hosts[i]); }
  }

  /* ------------------------------------------------------------
     V2.2.21：把监视器里的文本「复制出去」（而不是导出 PNG）
     为什么要有：原先想把监视器内容给别人 / 给 AI，只有两条路——导出 PNG（机器读不了），
     或者拖鼠标选中再 Ctrl+C（几千行既慢又容易漏，选中的还混着时间戳与方向标记，粘出去要手工删）。
     行结构来自 plugins.js 的 textmon：
       .sl-mon-t(时间戳) / .sl-mon-dir(方向) / .sl-mon-body(正文)
     所以「只复制正文」= 只取 .sl-mon-body —— 这正是用户要的「除去时间和下位机提示」。
     选项存 core.config.ui，先配置一次、之后一键复制。
     ------------------------------------------------------------ */
  function collectMonitorText(id) {
    var el = document.querySelector('[data-panel-id="' + id + '"]');
    if (!el) { return null; }
    var box = el.querySelector(".sl-mon");
    if (!box) { return null; }
    var uicfg = core.config.ui || {};
    var withTs = !!uicfg.copyTs;
    var withDir = !!uicfg.copyDir;
    var dedupe = uicfg.copyDedupe !== false;
    var visibleOnly = !!uicfg.copyVisible;
    var rows = box.querySelectorAll(".sl-mon-line");
    var from = 0;
    if (visibleOnly && rows.length) {
      /* 「可见」= 最后那一屏。监视器总是自动滚到最新，所以屏幕上就是最后 N 行。
         不按 offsetTop/scrollTop 判断：滚动容器在不同布局、不同主题下未必是 .sl-mon，
         算错了会静默漏行——宁可口径简单也不要漏数据。 */
      var rowH = rows[rows.length - 1].offsetHeight || 0;
      if (rowH > 0) {
        var fit = Math.floor(box.clientHeight / rowH);
        if (fit > 0) { from = Math.max(0, rows.length - fit); }
      }
    }
    var lines = [];
    for (var i = from; i < rows.length; i++) {
      var r = rows[i];
      var parts = [];
      if (withTs) {
        var tn = r.querySelector(".sl-mon-t");
        if (tn && tn.textContent) { parts.push(tn.textContent.replace(/\s+$/, "")); }
      }
      if (withDir) {
        var dn = r.querySelector(".sl-mon-dir");
        if (dn && dn.textContent.trim()) { parts.push(dn.textContent.trim()); }
      }
      var bn = r.querySelector(".sl-mon-body");
      parts.push(((bn ? bn.textContent : r.textContent) || "").replace(/\s+$/, ""));
      var line = parts.join(" ").replace(/\s+$/, "");
      if (dedupe && lines.length && lines[lines.length - 1] === line) { continue; }
      lines.push(line);
    }
    return lines;
  }

  function copyMonitorText(id) {
    var lines = collectMonitorText(id);
    if (lines === null) {
      core.emit("toast", { level: "warn", msg: "这块面板不是文本监视器，没有可复制的文本" });
      return;
    }
    if (!lines.length) {
      core.emit("toast", { level: "warn", msg: "监视器里还没有可复制的内容" });
      return;
    }
    var uicfg = core.config.ui || {};
    copyText(lines.join("\n"));
    var how = [];
    how.push(uicfg.copyTs ? "带时间戳" : "去时间戳");
    how.push(uicfg.copyDir ? "带方向标记" : "去方向标记");
    if (uicfg.copyDedupe !== false) { how.push("相邻去重"); }
    if (uicfg.copyVisible) { how.push("仅可见部分"); }
    core.emit("toast", { level: "ok", msg: "已复制 " + lines.length + " 行（" + how.join("、") + "）；复制口径可在 ⋯ 设置里改" });
  }

  /* 收起态摘要：面板收起后只剩标题条，用户点开「什么都没有」。
     这里把最新一行留在标题旁（监视器），图表则显示运行 / 暂停状态。 */
  function refreshPanelBriefs() {
    var heads = document.querySelectorAll(".sl-panel-head");
    for (var i = 0; i < heads.length; i++) {
      var head = heads[i];
      var brief = head.querySelector(".sl-panel-brief");
      if (!brief) { continue; }
      var el = head.parentNode;
      if (!el || el.className.indexOf("is-collapsed") < 0) {
        if (brief.textContent) { brief.textContent = ""; }
        continue;
      }
      var txt = "";
      var box = el.querySelector(".sl-mon");
      if (box) {
        var rows = box.querySelectorAll(".sl-mon-line");
        if (rows.length) {
          var b = rows[rows.length - 1].querySelector(".sl-mon-body");
          txt = (b ? b.textContent : rows[rows.length - 1].textContent) || "";
        }
      } else {
        txt = core.state.paused ? "已暂停（数据仍在收）" : "";
      }
      txt = txt.replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "").slice(0, 80);
      if (txt !== brief.textContent) { brief.textContent = txt; }
    }
  }

  function initPanelQuick() {
    document.addEventListener("change", function (e) {
      var t = e.target;
      if (!t || !t.getAttribute) { return; }
      /* ① 快捷条内控件改动 → 反向驱动左栏同源控件；setAndFire 派发的
         change 会被下面 ② 分支接住并回头刷新快捷条，闭环不递归 */
      var node = t;
      while (node && node !== document.body) {
        if (node.getAttribute && node.getAttribute("data-quick") !== null) { break; }
        node = node.parentNode;
      }
      if (node && node !== document.body) {
        var k = t.getAttribute("data-qk");
        if (k === "ts") { setAndFire("slShowTs", t.checked ? "on" : "off"); }
        else if (k === "hex") { setAndFire("slHexRecv", t.checked ? "on" : "off"); }
        else if (k === "enc") { setAndFire("slEncoding", t.value); }
        else if (k === "fftw") {
          /* 就地改渲染器持有的那个面板对象（getPanel 返回同一引用），当即生效；
             不走 updatePanel —— 那条路会经过 Plugins.validate，自定义 opts 字段会被丢掉
             （clearAt 那次实测踩过，这里沿用同一个结论）。 */
          var qid = node.getAttribute("data-quick-fft");
          var qp = qid ? SL.views.getPanel(qid) : null;
          if (qp) {
            qp.opts = qp.opts || {};
            qp.opts.fftWindow = t.value;
            SL.views.redraw();
          }
        }
        else if (k === "prec") {
          /* V2.2.21：时间戳精度与 ⋯ 设置中心同源（transport.timePrec）。
             ⚠ 设置中心那个 #slSetPrec 是弹窗里动态生成的，setAndFire 找不到它，
             所以这里直写配置 + saveConfig + 广播，写法与设置中心保持一致。 */
          if (!core.config.transport) { core.config.transport = {}; }
          core.config.transport.timePrec = t.value;
          core.saveConfig();
          core.emit("config:changed", { scope: "display" });
        }
        else if (k === "win") {
          /* 时域波形快捷条：横轴窗口（面板级配置，不走 transport） */
          var pid = node.getAttribute("data-quick-plot");
          var n = parseInt(t.value, 10);
          if (pid && n > 0) { SL.views.updatePanel(pid, { window: n }); }
        }
        else if (k === "ymin" || k === "ymax") {
          /* 时域波形快捷条：Y 轴手动范围（留空 = 自动量程） */
          var pid2 = node.getAttribute("data-quick-plot");
          if (pid2) {
            var pn = SL.views.getPanel(pid2);
            if (pn) {
              var ax = U.clone(pn.axis || {});
              var v = parseFloat(t.value);
              if (isFinite(v)) { ax[k] = v; } else { delete ax[k]; }
              SL.views.updatePanel(pid2, { axis: ax });
            }
          }
        }
        return;
      }
      /* ② 左栏三个同源控件变化 → 快捷条回显最新配置 */
      if (t.id === "slShowTs" || t.id === "slHexRecv" || t.id === "slEncoding") {
        refreshAllQuick();
      }
    }, true);
    /* 面板动态增删 / 主位互换 / 更新重建后补齐快捷条内容 */
    core.on("panels:changed", function () { refreshAllQuick(); refreshPanelBriefs(); refreshLegends(); });
    /* 面板头「复制」按钮（views.js 发事件，剪贴板归 ui.js —— 子应用硬规则 18） */
    core.on("panel:copyText", function (e) {
      if (e && e.id) { copyMonitorText(e.id); }
    });
    /* V2.2.24：面板头「触发」按钮（views.js 发事件，弹窗与写入都在 ui.js） */
    core.on("panel:trigger", function (e) {
      if (e && e.id) { openTriggerDialog(e.id); }
    });
    core.on("data:clear", function () { refreshPanelBriefs(); refreshLegends(); });
    refreshAllQuick();
  }

  /* ------------------------------------------------------------
     V2.2.15（AUDIT A-87）：量级差过大的通道 → 提示拆成独立面板
     渲染层只发事件（它不碰 DOM），提示与拆分都在这里做。
     为什么需要：两条量级差几千倍的线共用一个 Y 轴时，跨度小的会被压成贴底直线，
     用户会以为「根本没画出来」（实际反馈：「不是四个数据吗，怎么只有两根线」）。
     ------------------------------------------------------------ */
  var scaleHintDone = {};   /* panelId -> 已提示过（同一页面会话内不重复打扰） */

  /* 把渲染层给的 groups 归一成 { keys, labels, span }；顺手挡掉空组 */
  function scaleGroupsOf(info) {
    var out = [];
    if (!info || !info.groups) { return out; }
    for (var g = 0; g < info.groups.length; g++) {
      var items = (info.groups[g] && info.groups[g].items) || [];
      var keys = [], labels = [], hi = -Infinity;
      for (var i = 0; i < items.length; i++) {
        if (!items[i] || !items[i].key) { continue; }
        keys.push(items[i].key);
        labels.push(items[i].label || items[i].key);
        if (items[i].span > hi) { hi = items[i].span; }
      }
      if (keys.length) { out.push({ keys: keys, labels: labels, span: hi }); }
    }
    return out;
  }

  function doSplitByScale(info, groups) {
    var p = (SL.views && SL.views.getPanel) ? SL.views.getPanel(info.panelId) : null;
    if (!p) { return; }
    /* 原面板留下跨度最大的那一组（原 Y 轴量程对它最有意义），其余每组新建一个面板。
       新面板一律进工作区，不抢主位——用户的主视觉不该被这个提示改掉。 */
    SL.views.updatePanel(p.id, { channels: groups[0].keys });
    for (var g = 1; g < groups.length; g++) {
      SL.views.addPanel({
        type: p.type || "timeplot",
        title: (p.title || "时域波形") + " · " + groups[g].labels.join(" "),
        channels: groups[g].keys,
        window: p.window || 500,
        h: p.h || 300
      }, true);
    }
    var parts = [];
    for (var i = 0; i < groups.length; i++) { parts.push(groups[i].labels.join("+")); }
    UI.toast("ok", "已按量级拆成 " + groups.length + " 个面板：" + parts.join(" / ")
      + "（各面板独立量程，跨度小的那条也能看清了）");
  }

  function onScaleHint(info) {
    if (!info || !info.panelId) { return; }
    if (core.config.ui && core.config.ui.scaleSplitHint === false) { return; }
    if (scaleHintDone[info.panelId]) { return; }
    var groups = scaleGroupsOf(info);
    if (groups.length < 2) { return; }
    scaleHintDone[info.panelId] = true;

    var lines = [];
    for (var i = 0; i < groups.length; i++) { lines.push("· " + groups[i].labels.join(" + ")); }
    UI.confirm(
      "这些通道量级差太大",
      "「" + (info.title || "时域波形") + "」里各通道的跨度相差约 " + info.ratio + " 倍：\n\n"
        + lines.join("\n") + "\n\n"
        + "跨度这么大的几条线共用一个 Y 轴时，跨度小的会被压成贴底直线，看起来像没画。\n"
        + "要自动拆成 " + groups.length + " 个面板、各用各的量程吗？（原面板保留跨度最大的那组）\n\n"
        + "不想再看到这个提示，可到「显示」页签取消「量级差过大时提示拆分面板」。",
      "拆成 " + groups.length + " 个面板",
      { danger: false }
    ).then(function (ok) {
      if (!ok) { return; }
      doSplitByScale(info, groups);
    });
  }

  /* 渲染层（plugins.js）只负责检测并发事件，是否拆分由这里决定——保持「业务模块不碰 DOM」 */
  core.on("panel:scaleHint", onScaleHint);

  /* ------------------------------------------------------------
     V2.2.4：演示开始时保证有波形面板
     没有硬件的用户常带着「只有监视器」的 saved 配置进来，点演示却只能
     看到滚动的文本看不到曲线。这里在演示启动时检查：若一个图表面板都
     没有，就自动补一个时域波形（描述符与首次默认面板一致）。
     ------------------------------------------------------------ */
  function ensureDemoWave() {
    var apps = SL.views.list();
    for (var i = 0; i < apps.length; i++) {
      if (apps[i].type !== "textmon") { return; }   /* 已有任意图表面板，不打扰 */
    }
    SL.views.addPanel({
      type: "timeplot", title: "时域波形",
      channels: ["auto"], window: 500, h: 300
    }, true);
    UI.toast("ok", "演示已自动添加「时域波形」面板，可直接看曲线");
  }

  /* ------------------------------------------------------------
     V2.2.4：「测试」页签——演示与故障注入收纳为案例卡片
     常用案例（⭐）显眼，故障案例与手动参数收纳靠后；点卡片 = 套参数 +
     开演示，再点一次同一卡片 = 停止。案例参数仍走 setAndFire（addBind
     是唯一写手），左栏控件、徽章、配置持久化天然保持一致。
     ------------------------------------------------------------ */
  var TEST_CASES = {
    sine:    { label: "⭐ 基础正弦波形", realistic: false,
               faults: { drop: 0, corrupt: 0, stick: 0, garbage: 0 } },
    motor:   { label: "⭐ 拟真电机信号", realistic: true,
               faults: { drop: 0, corrupt: 0, stick: 0, garbage: 0 } },
    corrupt: { label: "🧯 校验错", realistic: false,
               faults: { drop: 0, corrupt: 30, stick: 0, garbage: 0 } },
    garble:  { label: "🧯 乱码噪声", realistic: false,
               faults: { drop: 0, corrupt: 0, stick: 0, garbage: 35 } },
    lossy:   { label: "🧯 丢帧粘包", realistic: false,
               faults: { drop: 18, corrupt: 0, stick: 22, garbage: 0 } }
  };
  var runningCase = "";

  function renderTestBadge() {
    var b = $("slTestBadge");
    if (!b) { return; }
    if (runningCase) {
      /* 演示中出现乱码 → 徽章转红引导去设备页签（排查条在那里） */
      if (garbleShown) {
        b.setAttribute("data-state", "garbled");
        b.textContent = "⚠ 乱码 · 去「设备」页签排查";
      } else {
        b.setAttribute("data-state", "open");
        b.textContent = "▶ " + runningCase;
      }
    } else if (core.state.demo) {
      b.setAttribute("data-state", "busy");
      b.textContent = "▶ 演示（自定义参数）";
    } else {
      b.setAttribute("data-state", "idle");
      b.textContent = "未在测试";
    }
  }

  function stopTestCase(silent) {
    runningCase = "";
    if (core.state.demo) {
      T.stopDemo();
      T.disconnect();
      if (!silent) { UI.toast("info", "测试已停止"); }
    }
    renderTestBadge();
  }

  /* 测试案例固定走文本行 + UTF-8：案例数据本来就是文本行定义，
     而且演示模式会跟随「解析」页签的规则——如果用户遗留了 HEX 二进制
     规则（比如点过二进制协议预设），文本监视器看到的就全是解码噪声，
     用户会误以为「乱码没修好」。案例是合成数据，全链路可控，直接锁定。 */
  function startTestCase() {
    var t = core.config.transport;
    if ((t.encoding || "utf-8") !== "utf-8") { setAndFire("slEncoding", "utf-8"); }
    T.startDemo({ mode: "text", periodMs: 20 });
    renderTestBadge();
  }

  function runTestCase(key) {
    var c = TEST_CASES[key];
    if (!c) { return; }
    /* 自愈开关：再点同一案例 = 停止 */
    if (runningCase === c.label && core.state.demo) { stopTestCase(); return; }
    T.stopDemo();
    setAndFire("slDemoRealistic", c.realistic ? "on" : "off");
    setAndFire("slFaultDrop", String(c.faults.drop));
    setAndFire("slFaultCorrupt", String(c.faults.corrupt));
    setAndFire("slFaultStick", String(c.faults.stick));
    setAndFire("slFaultGarbage", String(c.faults.garbage));
    runningCase = c.label;
    startTestCase();
    var ruleHint = (core.config.rule.active === "hex")
      ? "；当前解析规则为 HEX 二进制帧，监视器里这些文本行解不出字段——要测你的帧结构请用「进入演示模式」"
      : "";
    UI.toast("ok", "测试案例「" + c.label + "」已开跑（合成文本行 50Hz）" + ruleHint);
  }

  function wireTestPane() {
    var btn = $("slBtnDemo");
    if (btn) {
      btn.addEventListener("click", function () {
        if (core.state.demo) { stopTestCase(); return; }
        runningCase = "";
        var t = core.config.transport;
        if ((t.encoding || "utf-8") !== "utf-8") { setAndFire("slEncoding", "utf-8"); }
        var hexRule = core.config.rule.active === "hex";
        T.startDemo({
          mode: hexRule ? "hex" : "text",
          periodMs: 20
        });
        renderTestBadge();
        if (hexRule) {
          UI.toast("info", "已按你的 HEX 帧规则合成二进制数据——文本视图显示的是解码噪声，请切 HEX 显示或看波形");
        } else {
          UI.toast("ok", "已进入演示模式（合成数据 50Hz）");
        }
      });
    }
    var cards = document.querySelectorAll(".sl-case[data-case]");
    for (var i = 0; i < cards.length; i++) {
      (function (n) {
        n.addEventListener("click", function () { runTestCase(n.getAttribute("data-case")); });
      })(cards[i]);
    }
    /* 连接态变化 → 案例徽章跟随（演示被外部停止时归位） */
    core.on("serial:closed", function () { if (runningCase) { stopTestCase(true); } });
    core.on("serial:opened", function () { renderTestBadge(); });
  }

  /* ------------------------------------------------------------
     V2.2.6：设置中心（右下角 ⋯）——低频显示与设备项集中一处
     字号/口径/数字标红与「显示」页签同源（setAndFire 走 addBind）；
     时间戳精度/方向标记模式/设备别名是新增 transport 项，直写配置。
     ------------------------------------------------------------ */
  /* ------------------------------------------------------------
     V2.2.21：协议分析弹窗（Modbus RTU / 协议识别 / 帧级 diff）
     为什么要有：现场手里常常是一串看不懂的字节，而最常问的三个问题是
     「这是不是 Modbus 帧」「我发的和它回的是不是一对」「这两帧差在哪一个字节」——
     原先只能人肉数字节。结论全部来自 protocol.js 的纯函数（与本地桥共用同一份实现）。
     ------------------------------------------------------------ */
  function pad2hex(v) {
    var s = (v & 0xFF).toString(16).toUpperCase();
    return s.length < 2 ? ("0" + s) : s;
  }

  function protoLine(host, text, level) {
    var d = document.createElement("div");
    d.className = "sl-proto-line" + (level ? (" is-" + level) : "");
    d.textContent = text;                     /* 一律 textContent：内容可能来自串口 */
    host.appendChild(d);
  }

  function protoRecentHex() {
    var recs = SL.datastore.recentRaw(10);
    var parts = [];
    for (var i = 0; i < recs.length; i++) {
      if (recs[i].hex) { parts.push(recs[i].hex); }
      else if (recs[i].text) { parts.push(U.bytesToHex(SL.codec.encodeText(recs[i].text, "utf-8"))); }
    }
    return parts.join(" ");
  }

  function runProtocol() {
    var out = $("slProtoOut");
    if (!out) { return; }
    out.textContent = "";
    var h1 = String($("slProtoHex").value || "").replace(/[^0-9a-fA-F]/g, "");
    var h2 = String($("slProtoHex2").value || "").replace(/[^0-9a-fA-F]/g, "");
    if (h1.length % 2 === 1) { h1 = h1.slice(0, -1); }
    if (h2.length % 2 === 1) { h2 = h2.slice(0, -1); }
    if (!h1) { protoLine(out, "没有可分析的字节：填 HEX，或点「用最近收到的数据」。", "warn"); return; }
    var u8 = U.hexToBytes(h1);
    if (!u8 || !u8.length) { protoLine(out, "HEX 解析失败：请确认是成对的十六进制字符。", "warn"); return; }

    /* ① 协议识别（给出理由，用户才能判断该不该信） */
    var g = SL.protocol.guess(u8);
    protoLine(out, "识别：" + SL.protocol.summarize(u8), "head");
    for (var i = 1; i < g.ranked.length && i < 4; i++) {
      protoLine(out, "  其他可能：" + g.ranked[i].label + "（" + g.ranked[i].score + "%）—— " + g.ranked[i].why);
    }

    /* ② Modbus RTU 逐帧 + 请求响应配对 */
    var m = SL.protocol.modbus(u8);
    if (m.frames.length) {
      protoLine(out, "Modbus 切帧：" + m.frames.length + " 帧（CRC 通过 " + m.ok + "，不通过 " + m.fail + "）"
        + (m.bad ? ("；重同步丢弃 " + m.bad + " 字节") : ""), "head");
      for (var k = 0; k < m.frames.length; k++) {
        var f = m.frames[k];
        protoLine(out, "  #" + f.index + " [" + f.kind + "] " + f.fcName + " —— " + f.detail, f.crcOk ? "ok" : "bad");
        protoLine(out, "      " + f.hex);
      }
      var pairs = SL.protocol.modbusPairs(m.frames);
      if (pairs.length) {
        protoLine(out, "请求 ↔ 响应配对：", "head");
        for (var p = 0; p < pairs.length; p++) {
          protoLine(out, "  " + (pairs[p].req ? ("请求#" + pairs[p].req.index) : "—")
            + " ↔ " + (pairs[p].res ? ("响应#" + pairs[p].res.index) : "—")
            + "  " + pairs[p].note, pairs[p].res ? "ok" : "warn");
        }
      }
    } else {
      protoLine(out, "未按 Modbus RTU 切出帧。若确信是 Modbus：先确认整帧收全，再看 CRC 是否低字节在前（RTU 是低前高后）。");
    }

    /* ③ 帧级 diff（现场排障最有效的一招：拿一帧好的和一帧坏的比） */
    if (h2) {
      var u8b = U.hexToBytes(h2);
      if (u8b && u8b.length) {
        var d = SL.protocol.diff(u8, u8b);
        protoLine(out, "帧对比：" + (d.sameLength ? "长度相同" : ("长度不同 " + d.lenA + " vs " + d.lenB))
          + "，共同前缀 " + d.commonPrefix + " 字节，差异 " + d.diffs.length + " 处", "head");
        for (var q = 0; q < d.diffs.length && q < 24; q++) {
          protoLine(out, "  第 " + d.diffs[q].at + " 字节："
            + (d.diffs[q].a === null ? "(无)" : ("0x" + pad2hex(d.diffs[q].a)))
            + " → " + (d.diffs[q].b === null ? "(无)" : ("0x" + pad2hex(d.diffs[q].b))), "warn");
        }
        if (d.diffs.length > 24) { protoLine(out, "  …… 其余 " + (d.diffs.length - 24) + " 处省略"); }
      }
    }
  }

  function openProtocol() {
    var box = document.createElement("div");
    box.className = "sl-proto";
    box.innerHTML =
      '<div class="sl-set-row"><label>待分析字节</label>' +
        '<textarea id="slProtoHex" rows="4" spellcheck="false" ' +
        'placeholder="粘贴 HEX（如 01 03 00 00 00 0A C5 CD）；留空则点「用最近收到的数据」"></textarea></div>' +
      '<div class="sl-set-row"><label>对比帧（可选）</label>' +
        '<textarea id="slProtoHex2" rows="2" spellcheck="false" ' +
        'placeholder="填第二帧做字节级对比：谁改了哪个字节，一眼看出"></textarea></div>' +
      '<div class="sl-proto-out" id="slProtoOut"></div>';
    UI.modal({
      title: "协议分析 · Modbus RTU / 协议识别 / 帧对比",
      body: box,
      buttons: [
        { label: "分析", primary: true, onClick: function () { runProtocol(); return false; } },
        { label: "用最近收到的数据", onClick: function () {
            $("slProtoHex").value = protoRecentHex();
            runProtocol();
            return false;
          } },
        { label: "关闭" }
      ],
      focus: "#slProtoHex"
    });
    $("slProtoHex").value = protoRecentHex();      /* 打开就填好，省得用户去别处复制 */
    runProtocol();
  }

  /* ------------------------------------------------------------
     V2.2.22：波形上就地勾选通道（**每面板独立**）
     用户两句话合起来就是需求：
       「时域波形的勾选我无法在时域波形那个界面取消勾选，不够便利」
       「通道里的勾选算汇总冗余，拆开了容易怎么融合呢，有没有手动的按钮」
     所以图例浮在面板左上角，点一下切换**这块屏**的显示；一旦本屏与全局不一致，
     就出现两个**手动**按钮（应用给其他图表 / 恢复统一）—— 不做自动同步，
     因为用户明确说过自动拆合不准确。全局勾选仍在「通道」列表里，两者互不覆盖。
     ------------------------------------------------------------ */
  function fillLegend(host) {
    var id = host.getAttribute("data-legend");
    var panel = id ? SL.views.getPanel(id) : null;
    if (!panel) { return; }
    var chans = SL.datastore.listChannels();
    var override = SL.views.panelChanOverride(id);
    var list = [];
    for (var i = 0; i < chans.length; i++) {
      if (SL.datastore.count(chans[i].key) > 0) { list.push(chans[i]); }
    }
    host.textContent = "";
    if (!list.length) { host.hidden = true; return; }
    host.hidden = false;

    var diverged = false;
    for (var j = 0; j < list.length; j++) {
      (function (c) {
        var overridden = !!(override && Object.prototype.hasOwnProperty.call(override, c.key));
        var on = overridden ? !!override[c.key] : (c.visible !== false);
        if (overridden) { diverged = true; }
        var chip = document.createElement("button");
        chip.type = "button";
        chip.className = "sl-legend-chip" + (on ? "" : " is-off");
        chip.title = c.key + (on ? "：本屏显示中 —— 点一下在本屏隐藏" : "：本屏已隐藏 —— 点一下在本屏显示");
        var dot = document.createElement("i");
        dot.className = "sl-legend-dot";
        dot.style.background = c.color || "#888";
        chip.appendChild(dot);
        var nm = document.createElement("span");
        nm.textContent = c.label || c.key;
        chip.appendChild(nm);
        chip.addEventListener("click", function () {
          SL.views.setPanelChan(id, c.key, !on);
          refreshLegends();
        });
        host.appendChild(chip);
      })(list[j]);
    }

    if (diverged) {
      var acts = document.createElement("span");
      acts.className = "sl-legend-acts";
      var mk = function (act, label, title, fn) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "sl-legend-act";
        b.textContent = label;
        b.title = title;
        b.addEventListener("click", fn);
        acts.appendChild(b);
      };
      mk("apply", "应用给其他图表",
        "把本屏的勾选结果推给工作区里其他图表面板（监视器显示的是行、不参与）",
        function () {
          var n = SL.views.applyPanelChanToAll(id);
          refreshLegends();
          core.emit("toast", { level: "ok", msg: "已把本屏的通道勾选应用到其他 " + n + " 个图表面板" });
        });
      mk("reset", "恢复统一",
        "清掉本屏的独立勾选，重新跟随「通道」列表里的全局勾选",
        function () {
          SL.views.clearPanelChan(id);
          refreshLegends();
          core.emit("toast", { level: "info", msg: "本屏已恢复跟随全局勾选" });
        });
      host.appendChild(acts);
    }
  }

  function refreshLegends() {
    var hosts = document.querySelectorAll("[data-legend]");
    for (var i = 0; i < hosts.length; i++) { fillLegend(hosts[i]); }
  }

  /* ------------------------------------------------------------
     V2.2.24：波形「触发对齐」设置弹窗（示波器语义）
     为什么值得一个专门弹窗：不做触发时波形永远在滚动，周期信号在屏幕上停不下来，
     相位/超调/振铃/上升时间全都看不出来 —— 这不是「方不方便」，是「能不能看清」。
     字段只要三个：看哪一路、往哪个方向跨过多少、触发点放在屏幕什么位置。
     阈值默认取该通道的均值，开箱即用（不让用户先去别处找一个数）。
     ------------------------------------------------------------ */
  function openTriggerDialog(id) {
    var panel = SL.views.getPanel(id);
    if (!panel) { return; }
    var chans = SL.datastore.listChannels();
    var cur = SL.views.panelTrigger(id) || {};
    var key = cur.key || (chans.length ? chans[0].key : "");
    var box = document.createElement("div");
    box.className = "sl-proto";
    var optHtml = "";
    for (var i = 0; i < chans.length; i++) {
      var c = chans[i];
      optHtml += '<option value="' + c.key + '"' + (key === c.key ? " selected" : "") + ">"
        + (c.label || c.key) + "</option>";
    }
    box.innerHTML =
      '<div class="sl-set-row"><label>触发</label>' +
        '<label class="sl-set-chk"><input type="checkbox" id="slTrigOn">开启（波形按触发点对齐，不再滚动）</label></div>' +
      '<div class="sl-set-row"><label>触发通道</label><select id="slTrigKey">' +
        (optHtml || '<option value="">（还没有通道）</option>') + "</select></div>" +
      '<div class="sl-set-row"><label>跨过方向</label><select id="slTrigEdge">' +
        '<option value="rise">上升跨过（由小变大穿过阈值）</option>' +
        '<option value="fall">下降跨过（由大变小穿过阈值）</option></select></div>' +
      '<div class="sl-set-row"><label>阈值</label><input type="number" step="any" id="slTrigLevel">' +
        '<i>留空则取该通道当前均值；电机调试常用「位置上升跨过中点」</i></div>' +
      '<div class="sl-set-row"><label>触发点位置</label><input type="number" min="0" max="90" step="5" id="slTrigPre">' +
        '<i>百分比：触发那一刻放在屏幕从左往右的位置（20 = 左边 20% 显示触发前的波形）</i></div>';
    UI.modal({
      title: "波形触发对齐（示波器语义）",
      body: box,
      buttons: [
        { label: "应用", primary: true, onClick: function () { applyTriggerDialog(id); return false; } },
        { label: "关闭触发", onClick: function () {
            SL.views.setPanelTrigger(id, null);
            core.emit("toast", { level: "info", msg: "已关闭触发，波形回到实时滚动" });
            return false;
          } },
        { label: "关闭" }
      ],
      focus: "#slTrigLevel"
    });
    $("slTrigOn").checked = !!cur.on;
    $("slTrigEdge").value = cur.edge === "fall" ? "fall" : "rise";
    $("slTrigPre").value = String(typeof cur.pre === "number" ? Math.round(cur.pre * 100) : 20);
    if (typeof cur.level === "number" && isFinite(cur.level)) {
      $("slTrigLevel").value = String(cur.level);
    } else if (key) {
      var st = SL.datastore.stat(key);
      if (st && typeof st.avg === "number" && isFinite(st.avg)) { $("slTrigLevel").value = String(Math.round(st.avg * 1000) / 1000); }
    }
  }

  function applyTriggerDialog(id) {
    var key = String($("slTrigKey").value || "");
    if (!key) { core.emit("toast", { level: "warn", msg: "还没有通道可供触发" }); return; }
    var lv = parseFloat($("slTrigLevel").value);
    if (!isFinite(lv)) {
      var st = SL.datastore.stat(key);
      lv = (st && isFinite(st.avg)) ? st.avg : 0;
    }
    var pre = parseFloat($("slTrigPre").value);
    if (!isFinite(pre)) { pre = 20; }
    pre = Math.max(0, Math.min(90, pre)) / 100;
    /* ⚠ edge 必须在 closeModal **之前**读出来：弹窗一关，body 里的控件就被清空了，
       之后再去 $("slTrigEdge").value 会拿到 null.value 并抛错（第一版就是这么炸的）。 */
    var edge = $("slTrigEdge").value === "fall" ? "fall" : "rise";
    SL.views.setPanelTrigger(id, {
      on: $("slTrigOn").checked === true,
      key: key,
      edge: edge,
      level: lv,
      pre: pre
    });
    UI.closeModal();
    core.emit("toast", { level: "ok", msg: "触发已应用：" + key + (edge === "fall" ? " 下降跨过 " : " 上升跨过 ") + lv });
  }
  function openSettings() {
    var t = core.config.transport;
    var uicfg = core.config.ui || {};
    var box = document.createElement("div");
    box.className = "sl-settings";
    box.innerHTML =
      '<div class="sl-set-row"><label>监视器字号</label>' +
        '<select id="slSetFontSize">' +
          '<option>11</option><option>12</option><option>13</option><option>14</option>' +
          '<option>15</option><option>16</option><option>17</option><option>18</option></select></div>' +
      '<div class="sl-set-row"><label>时间口径</label>' +
        '<select id="slSetTimeMode"><option value="abs">绝对时刻（23:06:40.125）</option>' +
        '<option value="rel">相对秒（1.235s）</option></select></div>' +
      '<div class="sl-set-row"><label>时间戳精度</label>' +
        '<select id="slSetPrec"><option value="s">秒（23:06:40 / 1.2s）</option>' +
        '<option value="ms">毫秒（23:06:40.125 / 1.235s）</option>' +
        '<option value="us">微秒（相对口径 1.235482s）</option></select>' +
        '<i>墙钟精度上限是毫秒，微秒只对相对口径生效；改后对新收的行生效</i></div>' +
      '<div class="sl-set-row"><label>方向标记</label>' +
        '<select id="slSetDirMode"><option value="brief">短标记（推荐：收「←」发「→ 上位机」）</option>' +
        '<option value="tx">仅发送行</option><option value="all">每行全称</option><option value="off">不显示</option></select>' +
        '<i>收到的行印「←」，发送行为琥珀色「→ 上位机」</i></div>' +
      /* V2.2.21：监视器头上「复制」按钮的口径。放在这里而不是每次弹窗问——
         常见情况是「复制一段给人看」，每次都问一遍太烦；先配一次，之后一键复制。
         选中「只正文」= 去时间戳去方向，也就是「只复制有用信息」。 */
      '<div class="sl-set-row"><label>复制监视器文本</label>' +
        '<select id="slSetCopyMode">' +
          '<option value="plain">只正文（去时间戳、去方向标记）</option>' +
          '<option value="ts">正文 + 时间戳</option>' +
          '<option value="dir">正文 + 方向标记</option>' +
          '<option value="both">正文 + 时间戳 + 方向标记</option></select>' +
        '<i>点监视器头上的「复制」按此口径进剪贴板；下面是两个范围开关</i></div>' +
      '<div class="sl-set-row"><label>复制范围</label>' +
        '<label class="sl-set-chk"><input type="checkbox" id="slSetCopyVisible">只复制可见部分（最后一屏）</label>' +
        '<label class="sl-set-chk"><input type="checkbox" id="slSetCopyDedupe">相邻重复行去重</label>' +
        '<i>设备卡住时会把同一行刷满屏，去重后更容易看出真正变化</i></div>' +
      '<div class="sl-set-row"><label>数字高亮</label>' +
        '<select id="slSetNumStyle"><option value="channel">通道色（跟波形对应）</option>' +
        '<option value="red">全部标红加粗</option><option value="off">不标</option></select>' +
        '<i>pos= 的数字就是 pos 曲线的颜色；键名/汉字/符号保持墨色，时间戳紫色</i></div>' +
      '<div class="sl-set-row"><label>设备别名</label>' +
        '<input type="text" id="slSetAlias" maxlength="24" placeholder="如：关节电机-左腿">' +
        '<i>连接后顶栏显示别名（悬停仍可见 VID/PID）</i></div>' +
      '<p class="sl-hint">这些项与「显示」页签同源，改一处两边同步。</p>';
    UI.modal({
      title: "⚙ 设置",
      body: box,
      buttons: [{ label: "完成", primary: true }],
      focus: "#slSetPrec"
    });
    $("slSetFontSize").value = String(uicfg.fontSize || 12);
    $("slSetTimeMode").value = t.timeMode === "rel" ? "rel" : "abs";
    $("slSetPrec").value = t.timePrec || "ms";
    $("slSetDirMode").value = t.dirMode || "tx";
    /* 复制口径：copyTs / copyDir 两个布尔合成一个下拉（默认都关 = 只正文） */
    $("slSetCopyMode").value = (uicfg.copyTs && uicfg.copyDir) ? "both"
      : uicfg.copyTs ? "ts" : uicfg.copyDir ? "dir" : "plain";
    $("slSetCopyVisible").checked = !!uicfg.copyVisible;
    $("slSetCopyDedupe").checked = uicfg.copyDedupe !== false;
    $("slSetAlias").value = t.alias || "";
    $("slSetNumStyle").value = (uicfg.numStyle === "red" || uicfg.numStyle === "off") ? uicfg.numStyle : "channel";
    $("slSetFontSize").addEventListener("change", function () { setAndFire("slFontSize", this.value); });
    $("slSetTimeMode").addEventListener("change", function () { setAndFire("slTimeMode", this.value); });
    $("slSetNumStyle").addEventListener("change", function () {
      setAndFire("slNumStyle", this.value);
    });
    $("slSetPrec").addEventListener("change", function () {
      core.config.transport.timePrec = this.value;
      core.saveConfig();
    });
    $("slSetDirMode").addEventListener("change", function () {
      core.config.transport.dirMode = this.value;
      core.saveConfig();
    });
    $("slSetCopyMode").addEventListener("change", function () {
      var u = core.config.ui || (core.config.ui = {});
      u.copyTs = (this.value === "ts" || this.value === "both");
      u.copyDir = (this.value === "dir" || this.value === "both");
      core.saveConfig();
    });
    $("slSetCopyVisible").addEventListener("change", function () {
      var u = core.config.ui || (core.config.ui = {});
      u.copyVisible = !!this.checked;
      core.saveConfig();
    });
    $("slSetCopyDedupe").addEventListener("change", function () {
      var u = core.config.ui || (core.config.ui = {});
      u.copyDedupe = !!this.checked;
      core.saveConfig();
    });
    $("slSetAlias").addEventListener("change", function () {
      core.config.transport.alias = String(this.value).replace(/^\s+|\s+$/g, "").slice(0, 24);
      core.saveConfig();
      renderConn();
    });
  }

  function wireV226() {
    var btn = $("slBtnSettings");
    if (btn) { btn.addEventListener("click", openSettings); }
    wireSideGrip();
  }

  /* V2.2.8：左栏宽度拖拽（240~440px，写进配置；拖到 <240 松手也不突变）
     收起仍走顶栏「收起左栏」按钮（slSide is-hidden），grip 在收起态自动隐藏 */
  function wireSideGrip() {
    var grip = $("slSideGrip");
    var side = $("slSide");
    if (!grip || !side) { return; }
    if (core.config.ui.sideW) {
      document.documentElement.style.setProperty("--sl-side-w", core.config.ui.sideW + "px");
    }
    var startX = null, startW = 0;
    grip.addEventListener("mousedown", function (e) {
      startX = e.clientX;
      startW = side.getBoundingClientRect().width;
      document.body.classList.add("sl-resizing");
      e.preventDefault();
    });
    global.addEventListener("mousemove", function (e) {
      if (startX === null) { return; }
      var w = Math.min(440, Math.max(240, Math.round(startW + (e.clientX - startX))));
      document.documentElement.style.setProperty("--sl-side-w", w + "px");
    });
    global.addEventListener("mouseup", function () {
      if (startX === null) { return; }
      var cur = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sl-side-w")) || startW;
      core.config.ui.sideW = Math.round(Math.min(440, Math.max(240, cur)));
      core.saveConfig();
      startX = null;
      document.body.classList.remove("sl-resizing");
    });
  }

  function confirmLoose(msg) {
    /* 原生 confirm 仅用于极少数“确认开关”场景，避免打断式对话框把流程搞复杂 */
    return global.confirm ? global.confirm(msg) : true;
  }

  var signalState = { dtr: false, rts: false };
  function flipSignal(which) {
    if (!core.state.port) {
      UI.toast("warn", "先连接设备才能控制信号线");
      return;
    }
    signalState[which] = !signalState[which];
    var patch = {};
    patch[which] = signalState[which];
    T.setSignals(patch).then(function (ok) {
      if (!ok) { UI.toast("warn", "设备不支持该信号线（或已开启硬流控）"); }
      else { UI.toast("info", which.toUpperCase() + " → " + (signalState[which] ? "1" : "0")); }
    });
  }

  /* ------------------------------------------------------------
     5) 解析面板（文本规则 / HEX 结构表）
     ------------------------------------------------------------ */
  var FIELD_TYPES = [
    { v: "int8", n: 1 }, { v: "uint8", n: 1 },
    { v: "int16", n: 2 }, { v: "uint16", n: 2 },
    { v: "int32", n: 4 }, { v: "uint32", n: 4 },
    { v: "float32", n: 4 }
  ];

  function typeSize(type) {
    for (var i = 0; i < FIELD_TYPES.length; i++) {
      if (FIELD_TYPES[i].v === type) { return FIELD_TYPES[i].n; }
    }
    return 1;
  }

  function renderRuleMode() {
    var hex = core.config.rule.active === "hex";
    $("slTextRule").style.display = hex ? "none" : "block";
    $("slHexRule").style.display = hex ? "block" : "none";
    var radios = document.querySelectorAll('input[name="slRuleMode"]');
    for (var i = 0; i < radios.length; i++) {
      radios[i].checked = (radios[i].value === (hex ? "hex" : "text"));
    }
  }

  function renderFields() {
    var host = $("slFields");
    if (!host) { return; }
    host.textContent = "";
    var fields = core.config.rule.hex.fields || [];
    if (!fields.length) {
      host.appendChild(el("p", "sl-hint", "还没有字段。点下方「新增字段」，或在演示模式下点「套用示例」。" ));
      return;
    }
    var wrap = el("div", "sl-table-wrap");
    var table = el("table", "sl-table");

    var head = el("tr");
    var titles = ["键名", "类型", "偏移", "长度", "缩放", "大端", ""];
    for (var h = 0; h < titles.length; h++) { head.appendChild(el("th", null, titles[h])); }
    table.appendChild(head);

    for (var i = 0; i < fields.length; i++) {
      (function (idx) {
        var f = fields[idx];
        var tr = el("tr");

        var tdKey = el("td");
        var keyIn = el("input", "sl-mono-input");
        keyIn.type = "text"; keyIn.value = f.key || ""; keyIn.size = 8;
        keyIn.addEventListener("change", function () {
          f.key = keyIn.value.replace(/^\s+|\s+$/g, "");
          touch("rule");
        });
        tdKey.appendChild(keyIn);
        tr.appendChild(tdKey);

        var tdType = el("td");
        var sel = el("select");
        for (var t = 0; t < FIELD_TYPES.length; t++) {
          var o = el("option", null, FIELD_TYPES[t].v);
          o.value = FIELD_TYPES[t].v;
          sel.appendChild(o);
        }
        sel.value = f.type || "uint8";
        sel.addEventListener("change", function () {
          f.type = sel.value;
          f.size = typeSize(sel.value);
          renderFields();
          touch("rule");
        });
        tdType.appendChild(sel);
        tr.appendChild(tdType);

        tr.appendChild(numCell(f, "offset", 0, 0, 1));
        tr.appendChild(numCell(f, "size", typeSize(f.type || "uint8"), 1, 4));
        tr.appendChild(numCell(f, "scale", (f.scale === undefined ? 1 : f.scale), -1, 0.001, 6));

        var tdBig = el("td");
        var big = el("input");
        big.type = "checkbox"; big.checked = !!f.big;
        big.addEventListener("change", function () { f.big = big.checked; touch("rule"); });
        tdBig.appendChild(big);
        tr.appendChild(tdBig);

        var tdDel = el("td");
        var del = el("button", "sl-btn is-sm is-danger", "删");
        del.type = "button";
        del.addEventListener("click", function () {
          fields.splice(idx, 1);
          renderFields();
          touch("rule");
        });
        tdDel.appendChild(del);
        tr.appendChild(tdDel);

        table.appendChild(tr);
      })(i);
    }
    wrap.appendChild(table);
    host.appendChild(wrap);
  }

  function numCell(obj, key, def, min, step, max) {
    var td = el("td");
    var inp = el("input");
    inp.type = "number";
    inp.value = (obj[key] === undefined || obj[key] === null) ? String(def) : String(obj[key]);
    if (min !== undefined && min !== -1) { inp.min = String(min); }
    if (max !== undefined) { inp.max = String(max); }
    if (step) { inp.step = String(step); }
    inp.style.width = "72px";
    inp.addEventListener("change", function () {
      var v = parseFloat(inp.value);
      obj[key] = isFinite(v) ? v : def;
      inp.value = String(obj[key]);
      touch("rule");
    });
    td.appendChild(inp);
    return td;
  }

  function wireParsePane() {
    var radios = document.querySelectorAll('input[name="slRuleMode"]');
    for (var i = 0; i < radios.length; i++) {
      radios[i].addEventListener("change", function () {
        if (!this.checked) { return; }
        core.config.rule.active = this.value;
        renderRuleMode();
        touch("rule");
      });
    }

    $("slSepEq").addEventListener("change", onSepChange);
    $("slSepColon").addEventListener("change", onSepChange);

    $("slSuffixCh").addEventListener("change", function () {
      core.config.rule.text.suffixChannels = this.checked;
      touch("rule");
    });

    $("slHexHead").addEventListener("change", function () { onHexRuleChange(this, "head"); });
    $("slHexTail").addEventListener("change", function () { onHexRuleChange(this, "tail"); });
    $("slHexHead").addEventListener("input", function () {
      if (this.value.replace(/\s/g, "") === "" || U.hexToBytes(this.value)) {
        this.style.borderColor = "";
      } else { this.style.borderColor = "rgba(239,68,68,.7)"; }
    });

    $("slBtnAddField").addEventListener("click", function () {
      var fields = core.config.rule.hex.fields || (core.config.rule.hex.fields = []);
      fields.push({ key: "ch" + (fields.length + 1), type: "int16", offset: 0, size: 2, scale: 1, big: false });
      renderFields();
      touch("rule");
    });

    $("slBtnSample").addEventListener("click", applySample);
  }

  function onSepChange() {
    var seps = [];
    if ($("slSepEq").checked) { seps.push("="); }
    if ($("slSepColon").checked) { seps.push(":"); }
    if (!seps.length) {
      /* 分隔符不能为空，否则文本解析退化成“永远解析不出内容” */
      $("slSepEq").checked = true;
      seps = ["="];
      UI.toast("warn", "至少要保留一个分隔符，已自动勾选等号");
    }
    core.config.rule.text.seps = seps;
    touch("rule");
  }

  function onHexRuleChange(node, key) {
    var v = String(node.value || "").replace(/\s/g, "");
    if (v && !U.hexToBytes(v)) {
      UI.toast("bad", "「" + (key === "head" ? "帧头" : "帧尾") + "」必须是偶数位十六进制，如 AA55");
      node.value = core.config.rule.hex[key] || "";
      return;
    }
    core.config.rule.hex[key] = v;
    node.value = v;
    touch("rule");
  }

  /* 规则被整体替换（套用预设 / 套用示例 / 导入配置）后，把界面刷到与配置一致。
     注意：帧头 / 帧尾两个输入框不在泛绑定表里（它们有独立的十六进制校验逻辑），
     所以要单独写一遍——否则会出现「配置变了但输入框还是旧值」的错位。 */
  function refreshRuleInputs() {
    syncForms();
    var h = core.config.rule.hex || {};
    if ($("slHexHead")) { $("slHexHead").value = h.head || ""; }
    if ($("slHexTail")) { $("slHexTail").value = h.tail || ""; }
    renderRuleMode();
    renderFields();
  }

  function applySample() {
    var r = core.config.rule;
    if (r.active === "hex") {
      var demo = T.demoHexRule();
      r.hex.head = demo.head;
      r.hex.tail = demo.tail;
      r.hex.len = U.clone(demo.len);
      r.hex.fields = U.clone(demo.fields);
      r.hex.checksum = U.clone(demo.checksum);
      refreshRuleInputs();
      UI.toast("ok", "已套用演示 HEX 帧结构（AA55 帧头 + 3 个 int16 字段 + 累加和校验）");
    } else {
      r.text.seps = ["=", ":"];
      r.text.suffixChannels = true;
      refreshRuleInputs();
      UI.toast("ok", "已套用演示文本规则（同时识别 = 与 :，后缀数字视为独立通道）");
    }
    touch("rule");
  }

  function wireHexRuleInputs() {
    var nums = [
      ["slLenOffset", "rule.hex.len.offset", 0],
      ["slLenSize", "rule.hex.len.size", 0],
      ["slCkFrom", "rule.hex.checksum.from", 0],
      ["slCkTo", "rule.hex.checksum.to", -1]
    ];
    for (var i = 0; i < nums.length; i++) {
      addBind({ el: nums[i][0], path: nums[i][1], type: "num", scope: "rule" });
    }
    addBind({ el: "slLenMode", path: "rule.hex.len.mode", type: "select", scope: "rule" });
    addBind({ el: "slCkType", path: "rule.hex.checksum.type", type: "select", scope: "rule" });
  }

  /* ------------------------------------------------------------
     6) 通道面板
     ------------------------------------------------------------ */
  /* ------------------------------------------------------------
     V2.2.16：把左栏里的「静态说明文字」统一收成组标题旁的「?」
     左栏曾直接印出 30 段、4119 字符的说明——等于把一页半文档钉在工具栏里，
     老用户每次都要先跳过文字才找得到控件。
     只收「静态」的那些，判据有两条，缺一不可：
       ① 没有 id —— 带 id 的是脚本会改写的状态行（生效上限 / AI 通道状态 /
          收件箱提示…），必须留在原地；
       ② 它的父节点就是 .sl-group —— 静态说明都是组的直接子节点；
          脚本动态追加的空态提示（「还没有通道」等）挂在组内的 host div 上，
          父节点不是 .sl-group，因此不会被误收。
     文字不删不丢：同时挂到「?」的 data-tip（悬停看）与点击弹出的只读弹窗（看全）。
     不满足判据的一律保持原样 —— 宁可不收，也不丢信息。
     ------------------------------------------------------------ */
  function foldStaticHints() {
    var all = document.querySelectorAll(".sl-panes .sl-hint");
    for (var i = 0; i < all.length; i++) {
      var p = all[i];
      if (p.id || p.getAttribute("data-folded") === "1") { continue; }
      var host = p.parentNode;
      if (!host || !host.className || String(host.className).indexOf("sl-group") < 0) { continue; }
      var h3 = host.querySelector ? host.querySelector("h3") : null;
      if (!h3) { continue; }
      var body = (p.textContent || "").replace(/^\s+|\s+$/g, "");
      if (body.length < 12) { continue; }              /* 太短的不值得收 */
      var groupName = (h3.textContent || "说明").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");

      (function (para, box, title, text) {
        var btn = el("button", "sl-help", "?");
        btn.type = "button";
        btn.setAttribute("data-tip", text);
        btn.setAttribute("aria-label", "本组说明");
        btn.addEventListener("click", function () {
          var wrap = el("div");
          wrap.appendChild(el("p", "sl-note", text));
          UI.modal({ title: title, body: wrap, buttons: [{ label: "知道了" }] });
        });
        box.appendChild(btn);
        para.hidden = true;
        para.setAttribute("data-folded", "1");
      })(p, h3, groupName, body);
    }
  }

  /* `<input type=color>` 只接受 `#rrggbb`，拿到别的值会静默重置成黑色——
     所以写进去之前必须兜一层，否则用户会看到「颜色莫名其妙变黑」。 */
  function colorHexOf(c) {
    var s = String(c === undefined || c === null ? "" : c);
    return /^#[0-9a-fA-F]{6}$/.test(s) ? s : "#3b82f6";
  }

  /* 通道卡片第二行的小字段：`标签 [输入框]` */
  function labelledField(text, input) {
    var w = el("span", "sl-chan-fld");
    w.appendChild(el("span", "sl-chan-fl", text));
    w.appendChild(input);
    return w;
  }

  function renderChannels() {
    var host = $("slChannels");
    if (!host) { return; }
    host.textContent = "";
    var list = SL.datastore.listChannels();
    if (!list.length) {
      host.appendChild(el("p", "sl-hint", "还没有通道。收到第一帧被解析出数值后会自动建立通道。"));
      return;
    }
    /* V2.2.16：通道列表改「每通道一张竖排卡片」。
       左栏只有 ~260px 宽，而旧版是 7 列表格 + 表头 + `white-space:nowrap`
       → 必然出现横向滚动条，「显示」勾选框与「删」按钮被挤到视野外。
       用户反馈过「不能加个打勾关闭功能吗」——其实这两个功能早就在，只是看不见。
       卡片式永不横向滚动，且顺手把「取色」也放进来（旧版说明文字声称这里能改颜色，
       但表格里只有个只读色块，颜色实际只能去面板编辑器改——文档承诺了没有的功能）。
       仍然保留 <table>/<tr>（每通道一个 tr、内含单个 td）：
       E2E 的 `#slChannels tr` 数量与 `#slChannels` 文本断言依赖它，
       换容器只会制造无谓的测试改动。 */
    var table = el("table", "sl-table sl-chan-table");

    for (var i = 0; i < list.length; i++) {
      (function (ch) {
        var tr = el("tr");
        var td = el("td");
        var card = el("div", "sl-chan-card");

        /* ---- 第一行：色块 · 键名 · 取色 · 显示开关 · 删除 ---- */
        var r1 = el("div", "sl-chan-r1");
        var sw = el("span", "sl-swatch");
        sw.style.background = ch.color;
        r1.appendChild(sw);
        var nm = el("span", "sl-chan-key", ch.key);
        nm.title = ch.key;                       /* 长键名截断后仍可悬停看全 */
        r1.appendChild(nm);

        var ci = el("input", "sl-chan-color");
        ci.type = "color";
        ci.title = "这个通道的默认曲线颜色";
        ci.value = colorHexOf(ch.color);
        ci.addEventListener("change", function () {
          SL.datastore.upsertChannel({ key: ch.key, color: ci.value });
          persistChannels();
          renderChannels();
          if (SL.views) { SL.views.redraw(); }
        });
        r1.appendChild(ci);

        var visLab = el("label", "sl-chk sl-chan-vis");
        var vis = el("input");
        vis.type = "checkbox"; vis.checked = ch.visible !== false;
        vis.title = "取消勾选＝这个通道不进图表（数据照收，勾回来即可）";
        vis.addEventListener("change", function () {
          SL.datastore.upsertChannel({ key: ch.key, visible: vis.checked });
          persistChannels();
        });
        visLab.appendChild(vis);
        visLab.appendChild(document.createTextNode("显示"));
        r1.appendChild(visLab);

        var del = el("button", "sl-btn is-sm is-danger", "删");
        del.type = "button";
        del.title = "删除这个通道（连同它的缓存数据）";
        del.addEventListener("click", function () {
          SL.datastore.removeChannel(ch.key);
          persistChannels();
          renderChannels();
        });
        r1.appendChild(del);
        card.appendChild(r1);

        /* ---- 第二行：标签 / 单位 / 精度 ---- */
        var r2 = el("div", "sl-chan-r2");

        var labelIn = el("input", "sl-chan-label");
        labelIn.type = "text"; labelIn.value = ch.label || ch.key;
        labelIn.title = "图上显示的名字";
        labelIn.addEventListener("change", function () {
          SL.datastore.upsertChannel({ key: ch.key, label: labelIn.value });
          persistChannels();
        });
        r2.appendChild(labelledField("标签", labelIn));

        var unitIn = el("input", "sl-chan-unit");
        unitIn.type = "text"; unitIn.value = ch.unit || "";
        unitIn.title = "单位（只用于显示）";
        unitIn.addEventListener("change", function () {
          SL.datastore.upsertChannel({ key: ch.key, unit: unitIn.value });
          persistChannels();
        });
        r2.appendChild(labelledField("单位", unitIn));

        var preIn = el("input", "sl-chan-prec");
        preIn.type = "number"; preIn.min = "0"; preIn.max = "8";
        preIn.value = String(ch.precision === undefined ? 3 : ch.precision);
        preIn.title = "小数位数 0~8";
        preIn.addEventListener("change", function () {
          var v = parseInt(preIn.value, 10);
          SL.datastore.upsertChannel({ key: ch.key, precision: isNaN(v) ? 3 : v });
          persistChannels();
        });
        r2.appendChild(labelledField("精度", preIn));
        card.appendChild(r2);

        td.appendChild(card);
        tr.appendChild(td);
        table.appendChild(tr);
      })(list[i]);
    }
    host.appendChild(table);
  }

  function persistChannels() {
    core.config.channels = SL.datastore.snapshot();
    touchLazy("channels");
  }

  function wireChannelsPane() {
    $("slBtnAddChannel").addEventListener("click", function () {
      UI.prompt("新增通道", {
        label: "通道键名",
        hint: "键名必须与设备实际发出的字段名一致，例如 temp、cur、pos1。",
        placeholder: "temp",
        validate: function (v) {
          var k = String(v || "").replace(/^\s+|\s+$/g, "");
          if (!k) { return "键名不能为空"; }
          if (!/^[A-Za-z_][A-Za-z0-9_.\-]*$/.test(k)) { return "键名只能包含字母、数字、下划线、点与连字符，且不能以数字开头"; }
          if (SL.datastore.getChannel(k)) { return "该通道已存在"; }
          return "";
        }
      }).then(function (v) {
        if (v === null) { return; }
        var k = String(v).replace(/^\s+|\s+$/g, "");
        SL.datastore.upsertChannel({ key: k, label: k });
        persistChannels();
        renderChannels();
        UI.toast("ok", "已新增通道 " + k);
      });
    });

    $("slBtnClearChannels").addEventListener("click", function () {
      UI.confirm("清空数据", "将清空所有通道的已缓数据与原始记录（保留通道设置）。此操作不可撤销。", "清空数据")
        .then(function (ok) {
          if (!ok) { return; }
          SL.datastore.clear(true);
          renderChannels();
          UI.toast("ok", "已清空缓存数据");
        });
    });
  }

  /* ------------------------------------------------------------
     7) 发送面板（定时 / 触发 / 预设）
     ------------------------------------------------------------ */
  var SEND_LISTS = {
    timed: {
      host: "slTimed", minLen: 1,
      hint: "启用后按间隔自动发送，适合轮询寄存器。",
      def: function () { return { id: U.nextId("t"), enabled: false, text: "", hex: false, intervalMs: 1000 }; },
      cols: [
        { k: "enabled", t: "chk" },
        { k: "text", t: "text", ph: "要发送的内容", wide: true },
        { k: "hex", t: "chk", label: "HEX" },
        { k: "intervalMs", t: "num", label: "间隔ms", min: 20, step: 10, w: 84 }
      ]
    },
    triggers: {
      host: "slTriggers", minLen: 1,
      hint: "接收内容包含「匹配」时自动发送「应答」。",
      def: function () { return { id: U.nextId("g"), enabled: false, match: "", reply: "", hex: false }; },
      cols: [
        { k: "enabled", t: "chk" },
        { k: "match", t: "text", ph: "接收匹配", wide: true },
        { k: "reply", t: "text", ph: "自动应答", wide: true },
        { k: "hex", t: "chk", label: "HEX" }
      ]
    },
    presets: {
      host: "slPresets", minLen: 1,
      hint: "可绑定单字符快捷键（焦点不在输入框时生效）。",
      def: function () { return { id: U.nextId("p"), enabled: true, name: "预设", text: "", hex: false, expect: "", waitMs: 1000, shortcut: "" }; },
      cols: [
        { k: "enabled", t: "chk" },
        { k: "shortcut", t: "text", ph: "键", w: 42, maxLen: 1 },
        { k: "name", t: "text", ph: "名称", w: 76 },
        { k: "text", t: "text", ph: "发送内容", wide: true },
        { k: "hex", t: "chk", label: "HEX" },
        { k: "expect", t: "text", ph: "期望回包", w: 90 },
        { k: "waitMs", t: "num", label: "超时ms", min: 0, step: 100, w: 84 }
      ]
    }
  };

  function renderSendList(kind) {
    var spec = SEND_LISTS[kind];
    var host = $(spec.host);
    if (!host) { return; }
    host.textContent = "";
    var list = core.config.send[kind] || (core.config.send[kind] = []);

    if (!list.length) {
      host.appendChild(el("p", "sl-hint", "（空）" + spec.hint));
      return;
    }

    for (var i = 0; i < list.length; i++) {
      (function (item, idx) {
        var row = el("div", "sl-row");
        for (var c = 0; c < spec.cols.length; c++) {
          row.appendChild(sendCell(item, spec.cols[c], kind));
        }
        var del = el("button", "sl-btn is-sm is-danger", "删");
        del.type = "button";
        del.addEventListener("click", function () {
          list.splice(idx, 1);
          renderSendList(kind);
          touch("send");
        });
        row.appendChild(del);
        host.appendChild(row);
      })(list[i], i);
    }
  }

  function sendCell(item, col, kind) {
    if (col.t === "chk") {
      var lab = el("label", "sl-chk");
      var cb = el("input");
      cb.type = "checkbox";
      cb.checked = item[col.k] !== false && !!item[col.k];
      cb.addEventListener("change", function () {
        item[col.k] = cb.checked;
        touch("send");
      });
      lab.appendChild(cb);
      if (col.label) { lab.appendChild(el("span", null, col.label)); }
      return lab;
    }
    if (col.t === "num") {
      var wrapN = el("span", "sl-field");
      if (col.label) { wrapN.appendChild(el("span", null, col.label)); }
      var num = el("input");
      num.type = "number";
      num.value = String(item[col.k] === undefined ? 0 : item[col.k]);
      if (col.min !== undefined) { num.min = String(col.min); }
      if (col.step) { num.step = String(col.step); }
      num.style.width = (col.w || 84) + "px";
      num.addEventListener("change", function () {
        var v = parseFloat(num.value);
        item[col.k] = isFinite(v) ? v : 0;
        touch("send");
      });
      wrapN.appendChild(num);
      return wrapN;
    }
    var inp = el("input", (col.k === "text" || col.k === "reply" || col.k === "expect") ? "sl-mono-input" : "");
    inp.type = "text";
    if (col.w) { inp.style.width = col.w + "px"; }
    else if (col.wide) { inp.style.flex = "1 1 130px"; inp.style.minWidth = "90px"; }
    if (col.ph) { inp.placeholder = col.ph; }
    if (col.maxLen) { inp.maxLength = col.maxLen; }
    inp.value = item[col.k] === undefined ? "" : String(item[col.k]);
    inp.addEventListener("change", function () {
      var v = inp.value;
      if (col.maxLen && v.length > col.maxLen) { v = v.slice(0, col.maxLen); inp.value = v; }
      item[col.k] = v;
      touch("send");
    });
    return inp;
  }

  function wireSendPane() {
    $("slBtnAddTimed").addEventListener("click", function () { addSendItem("timed"); });
    $("slBtnAddTrigger").addEventListener("click", function () { addSendItem("triggers"); });
    $("slBtnAddPreset").addEventListener("click", function () { addSendItem("presets"); });
  }

  function addSendItem(kind) {
    var spec = SEND_LISTS[kind];
    var list = core.config.send[kind] || (core.config.send[kind] = []);
    list.push(spec.def());
    renderSendList(kind);
    touch("send");
    /* 新加的项聚焦到内容输入框，减少一次点击 */
    var host = $(spec.host);
    if (host && host.lastChild) {
      var inputs = host.lastChild.querySelectorAll("input[type=text]");
      if (inputs.length) {
        var idx = (kind === "presets") ? Math.min(2, inputs.length - 1) : 0;
        inputs[idx].focus();
      }
    }
  }

  /* ------------------------------------------------------------
     8) 插件（图表框）面板
     ------------------------------------------------------------ */
  function renderPluginTypes() {
    var sel = $("slPluginType");
    var quick = $("slQuickAdd");
    if (!sel && !quick) { return; }
    var list = SL.plugins.list();
    var i;
    if (sel) {
      var keep = sel.value;
      sel.textContent = "";
      for (i = 0; i < list.length; i++) {
        var o = el("option", null, list[i].label);
        o.value = list[i].id;
        sel.appendChild(o);
      }
      if (keep) { sel.value = keep; }
    }
    /* 舞台工具条里的「新图表」下拉与「图表」页签【同源、同文案】：两处都只显示
       中文名。这里曾经在「图表」页签额外拼上 (id)（形如「时域波形（timeplot）」），
       同一个列表在两处格式不同，属于「细节部分命名没有统一」（AUDIT A-83）。 */
    if (quick) {
      var keepQ = quick.value;
      quick.textContent = "";
      for (i = 0; i < list.length; i++) {
        var oq = el("option", null, list[i].label);
        oq.value = list[i].id;
        quick.appendChild(oq);
      }
      if (keepQ) { quick.value = keepQ; }
    }
  }

  function renderPanelList() {
    var host = $("slPanelList");
    if (!host) { return; }
    host.textContent = "";
    var list = SL.views.list();
    if (!list.length) {
      host.appendChild(el("p", "sl-hint", "工作区还没有图表框。选中渲染器后点「添加到工作区」。"));
      return;
    }
    for (var i = 0; i < list.length; i++) {
      (function (p) {
        var row = el("div", "sl-row");
        var sw = el("span", "sl-swatch");
        sw.style.background = (p.colors && p.colors[(p.channels || [])[0]]) || "#3b82f6";
        row.appendChild(sw);
        row.appendChild(el("span", null, p.title));
        row.appendChild(el("span", "sl-panel-type", p.type + " · " + (p.channels || []).join(",")));

        var edit = el("button", "sl-btn is-sm", "编辑");
        edit.type = "button";
        edit.addEventListener("click", function () { openPanelEditor(p.id); });
        row.appendChild(edit);

        var del = el("button", "sl-btn is-sm is-danger", "删");
        del.type = "button";
        del.addEventListener("click", function () {
          SL.views.removePanel(p.id);
          renderPanelList();
        });
        row.appendChild(del);

        host.appendChild(row);
      })(list[i]);
    }
  }

  /* 面板编辑器：DIY 的核心入口（标题 / 通道 / 公式 / 窗口 / 量程 / 颜色） */
  function openPanelEditor(id) {
    var panel = SL.views.getPanel(id);
    if (!panel) { return; }
    var r = SL.plugins.get(panel.type);
    var work = U.clone(panel);

    var wrap = el("div");
    wrap.appendChild(el("p", "sl-hint", "渲染器：" + (r ? r.label : panel.type) + "（" + panel.type + "）"));

    var grid = el("div", "sl-kv");
    function field(label, node, hint) {
      grid.appendChild(el("dt", null, label));
      var dd = el("dd");
      dd.appendChild(node);
      if (hint) { dd.appendChild(el("p", "sl-hint", hint)); }
      grid.appendChild(dd);
      return node;
    }

    var titleIn = el("input", "sl-mono-input");
    titleIn.type = "text"; titleIn.value = work.title; titleIn.style.width = "100%";
    field("标题", titleIn);

    var chanIn = el("input", "sl-mono-input");
    chanIn.type = "text";
    chanIn.value = (work.channels || []).join(",");
    chanIn.style.width = "100%";
    field("通道", chanIn, "逗号分隔的通道键名；填 auto 表示自动取前几个通道。仪表盘只取第一个。");

    var exprIn = el("input", "sl-mono-input");
    exprIn.type = "text"; exprIn.value = work.expr || ""; exprIn.style.width = "100%";
    field("映射公式", exprIn, "可选。用通道名作变量，例如 (cur*24) 把电流换算成功率。禁 eval，只支持四则运算与白名单函数。");

    var winIn = el("input");
    winIn.type = "number"; winIn.min = "10"; winIn.max = "100000";
    winIn.value = String(work.window || 500);
    field("窗口点数", winIn, "图表显示最近多少个采样点（10 ~ 100000）。");

    var yMinIn = el("input");
    yMinIn.type = "number"; yMinIn.value = (work.axis && work.axis.yMin !== null && work.axis.yMin !== undefined) ? String(work.axis.yMin) : "";
    yMinIn.placeholder = "自动";
    var yMaxIn = el("input");
    yMaxIn.type = "number"; yMaxIn.value = (work.axis && work.axis.yMax !== null && work.axis.yMax !== undefined) ? String(work.axis.yMax) : "";
    yMaxIn.placeholder = "自动";
    var yWrap = el("div", "sl-row");
    yWrap.appendChild(yMinIn);
    yWrap.appendChild(el("span", null, "~"));
    yWrap.appendChild(yMaxIn);
    field("纵轴范围", yWrap, "都留空 = 自动量程。");

    var colWrap = el("div", "sl-row");
    var keys = (work.channels || []).filter(function (k) { return k !== "auto"; });
    if (keys.length) {
      var colorIns = {};
      for (var k = 0; k < keys.length; k++) {
        (function (key) {
          var cw = el("span", "sl-field");
          cw.appendChild(el("span", null, key));
          var ci = el("input");
          ci.type = "text"; ci.size = 8;
          ci.value = (work.colors && work.colors[key]) || "";
          ci.placeholder = "#3b82f6";
          colorIns[key] = ci;
          cw.appendChild(ci);
          colWrap.appendChild(cw);
        })(keys[k]);
      }
      work._colorIns = colorIns;
    } else {
      colWrap.appendChild(el("span", "sl-hint", "通道选了 auto 时按默认色板着色。"));
    }
    field("通道颜色", colWrap);

    wrap.appendChild(grid);

    UI.modal({
      title: "编辑图表框",
      body: wrap,
      focus: "input",
      buttons: [
        {
          label: "保存", primary: true,
          onClick: function () {
            var patch = {
              title: titleIn.value.replace(/^\s+|\s+$/g, ""),
              channels: splitChannels(chanIn.value),
              expr: exprIn.value,
              window: parseInt(winIn.value, 10),
              axis: {},
              colors: {}
            };
            var yMin = parseFloat(yMinIn.value);
            var yMax = parseFloat(yMaxIn.value);
            patch.axis.yMin = isFinite(yMin) ? yMin : null;
            patch.axis.yMax = isFinite(yMax) ? yMax : null;
            if (patch.axis.yMin === null && patch.axis.yMax === null) { patch.axis.yAuto = true; }
            for (var key in (work._colorIns || {})) {
              if (!Object.prototype.hasOwnProperty.call(work._colorIns, key)) { continue; }
              var cv = work._colorIns[key].value.replace(/^\s+|\s+$/g, "");
              if (cv) { patch.colors[key] = cv; }
            }
            var res = SL.plugins.validate({
              type: panel.type, id: panel.id, title: patch.title,
              channels: patch.channels, expr: patch.expr, window: patch.window,
              axis: patch.axis, colors: patch.colors, opts: panel.opts
            });
            if (!res.panel) {
              UI.toast("bad", "面板配置无效：" + res.errors.join("；"));
              return false;
            }
            SL.views.updatePanel(panel.id, res.panel);
            if (res.errors.length) { UI.toast("warn", "已自动修正：" + res.errors[0]); }
            renderPanelList();
            UI.toast("ok", "图表框已更新");
            return true;
          }
        },
        { label: "取消" }
      ]
    });
  }

  function splitChannels(str) {
    var parts = String(str || "").split(/[,，\s]+/);
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var s = parts[i].replace(/^\s+|\s+$/g, "");
      if (s) { out.push(s); }
    }
    return out.length ? out : ["auto"];
  }

  function wirePluginsPane() {
    $("slBtnAddPanel").addEventListener("click", function () {
      var sel = $("slPluginType");
      var type = sel.value || "timeplot";
      var r = SL.plugins.get(type);
      var panel = SL.views.addPanel({
        type: type,
        title: r ? r.label : type,
        channels: ["auto"]
      });
      if (panel) {
        renderPanelList();
        UI.toast("ok", "已添加「" + panel.title + "」；在面板里点「编辑」可绑定通道与公式");
      }
    });

    $("slBtnExportPack").addEventListener("click", function () {
      var list = SL.views.list();
      if (!list.length) { UI.toast("warn", "工作区还没有图表框可导出"); return; }
      var pack = SL.plugins.exportPack(list, SL.datastore.snapshot());
      var text = JSON.stringify(pack, null, 1);
      var ok = SL.exporters.downloadText(text, "seriallab_面板包_" + SL.exporters.stamp() + ".json", "application/json");
      UI.toast(ok ? "ok" : "bad", ok ? "已导出面板包（含 " + list.length + " 个图表框与通道配色）" : "导出失败");
    });

    $("slBtnImportPack").addEventListener("click", function () {
      askText("导入面板包", "把面板包 JSON 粘贴到这里：", "").then(function (text) {
        if (text === null) { return; }
        var res = SL.plugins.importPack(text);
        if (!res.ok && !res.panels.length) {
          UI.toast("bad", "导入失败：" + res.errors.join("；"));
          return;
        }
        for (var c = 0; c < res.channels.length; c++) { SL.datastore.upsertChannel(res.channels[c]); }
        for (var i = 0; i < res.panels.length; i++) { SL.views.addPanel(res.panels[i], true); }
        persistChannels();
        renderChannels();
        renderPanelList();
        SL.views.redraw();
        UI.toast("ok", "已导入 " + res.panels.length + " 个图表框");
        if (res.errors.length) { UI.toast("warn", "有 " + res.errors.length + " 处配置被自动修正"); }
      });
    });
  }

  /* ------------------------------------------------------------
     9) 录制面板
     ------------------------------------------------------------ */
  function renderRecords() {
    var host = $("slRecords");
    if (!host) { return; }
    host.textContent = "";
    var list = SL.timeline.list();
    if (!list.length) {
      host.appendChild(el("p", "sl-hint", "还没有录制。点「开始录制」把流过的帧存进内存。"));
      return;
    }
    for (var i = 0; i < list.length; i++) {
      (function (rec) {
        var s = SL.timeline.summary(rec);
        var row = el("div", "sl-row");
        row.appendChild(el("span", null, rec.name));
        row.appendChild(el("span", "sl-panel-type", s.frames + " 帧 · " + fmtMs(s.durationMs)));

        var play = el("button", "sl-btn is-sm", "回放");
        play.type = "button";
        play.addEventListener("click", function () { SL.timeline.play(rec); });
        row.appendChild(play);

        var exp = el("button", "sl-btn is-sm", "导出");
        exp.type = "button";
        exp.addEventListener("click", function () {
          var ok = SL.exporters.downloadText(SL.timeline.toJSON(rec),
            "seriallab_录制_" + SL.exporters.stamp() + ".json", "application/json");
          UI.toast(ok ? "ok" : "bad", ok ? "已导出该条录制" : "导出失败");
        });
        row.appendChild(exp);

        var del = el("button", "sl-btn is-sm is-danger", "删");
        del.type = "button";
        del.addEventListener("click", function () {
          SL.timeline.remove(rec.id);
          renderRecords();
        });
        row.appendChild(del);

        host.appendChild(row);
      })(list[i]);
    }
  }

  function renderRecordState() {
    var on = SL.timeline.isRecording();
    $("slBtnRecord").textContent = on ? "停止录制" : "开始录制";
    $("slBtnRecord").className = "sl-btn is-sm" + (on ? " is-danger" : " is-primary");
    /* 冻结显示 = 暂停刷新，与顶栏绿圆标是同一个总开关（core + views 双保险） */
    var frozen = SL.timeline.isFrozen();
    $("slBtnFreeze").textContent = frozen ? "继续刷新" : "暂停刷新";
    renderRun();   /* 任何一处改了暂停态，绿圆标同步 */
    $("slRecHint").textContent = on
      ? ("正在录制…已记录 " + SL.timeline.frameCount() + " 帧（回放/导出在停止后进行）")
      : "录制中的原始帧会进内存缓冲，停止后可在下方回放或导出。";
  }

  function wireTimelinePane() {
    $("slBtnRecord").addEventListener("click", function () {
      if (SL.timeline.isRecording()) {
        var rec = SL.timeline.stopRecord();
        renderRecords();
        renderRecordState();
        if (rec) { UI.toast("ok", "录制结束：" + rec.frames.length + " 帧"); }
      } else {
        SL.timeline.startRecord();
        renderRecordState();
        UI.toast("info", "开始录制");
      }
    });

    $("slBtnFreeze").addEventListener("click", function () {
      SL.timeline.toggleFreeze();
      renderRecordState();
    });

    $("slBtnExportRec").addEventListener("click", function () {
      if (!SL.timeline.list().length) { UI.toast("warn", "还没有录制可导出"); return; }
      var ok = SL.exporters.downloadText(SL.timeline.toJSON(),
        "seriallab_录制集_" + SL.exporters.stamp() + ".json", "application/json");
      UI.toast(ok ? "ok" : "bad", ok ? "已导出全部录制" : "导出失败");
    });

    $("slBtnImportRec").addEventListener("click", function () {
      askText("导入录制", "把录制 JSON 粘贴到这里：", "").then(function (text) {
        if (text === null) { return; }
        var res = SL.timeline.fromJSON(text);
        if (!res.ok) {
          UI.toast("bad", "导入失败：" + res.errors.join("；"));
          return;
        }
        renderRecords();
        UI.toast("ok", "已导入 " + res.added + " 条录制");
      });
    });
  }

  function askText(title, hint, value) {
    return UI.prompt(title, {
      multiline: true, rows: 12, hint: hint, value: value,
      hint2: "也可以直接点「导入文件」从本地选 JSON 文件。"
    });
  }

  /* ------------------------------------------------------------
     10) 数据面板
     ------------------------------------------------------------ */
  function copyText(text) {
    return new Promise(function (resolve) {
      if (global.navigator && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { resolve(true); }, function () { resolve(fallbackCopy(text)); });
        return;
      }
      resolve(fallbackCopy(text));
    });
  }

  function fallbackCopy(text) {
    try {
      var ta = el("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return !!ok;
    } catch (e) { return false; }
  }

  function wireDataPane() {
    $("slBtnExpCsv").addEventListener("click", function () { SL.exporters.exportParsedCsv(); });
    $("slBtnExpRaw").addEventListener("click", function () { SL.exporters.exportRawCsv(); });
    $("slBtnExpJson").addEventListener("click", function () { SL.exporters.exportJson(); });
    $("slBtnExpBin").addEventListener("click", function () { SL.exporters.exportBin(); });
    $("slBtnExpTxt").addEventListener("click", function () { SL.exporters.exportTxt(); });
    /* V2.2.21：Markdown 导出（贴进文档/issue/对话不用再手工转表） */
    $("slBtnExpMd").addEventListener("click", function () {
      SL.exporters.exportMarkdown();
      core.emit("toast", { level: "ok", msg: "已导出 Markdown（通道统计 + 最近记录），可直接贴进文档或发给 AI" });
    });

    /* --- V2.2.6 数据文件夹：绑定 / 规范命名落盘 / 清理 / CSV 直达 --- */
    var AI = SL.aichan;
    $("slLogTag").value = (core.config.ai && core.config.ai.tag) || "";
    $("slLogKeep").value = (core.config.ai && core.config.ai.logKeep) || 10;
    $("slLogTag").addEventListener("change", function () {
      core.config.ai.tag = String(this.value).replace(/^\s+|\s+$/g, "").slice(0, 24);
      core.saveConfig();
    });
    $("slLogKeep").addEventListener("change", function () {
      var n = parseInt(this.value, 10);
      core.config.ai.logKeep = (n > 0 && n <= 999) ? n : 10;
      this.value = core.config.ai.logKeep;
      core.saveConfig();
    });
    function syncDirButtons() {
      var bound = AI.folderBound();
      var logging = AI.dirLogging();
      $("slBtnDirLog").disabled = !bound;
      $("slBtnDirLog").textContent = logging ? "停写日志" : "开写日志";
      $("slBtnBindFolder").textContent = bound ? ("📁 " + AI.folderName()) : "📁 绑定数据文件夹";
    }
    $("slBtnBindFolder").addEventListener("click", function () {
      AI.bindFolder().then(function (r) {
        if (r.ok) {
          UI.toast("ok", "已绑定数据文件夹「" + r.dir + "」" + (r.cleaned ? "，自动清理了 " + r.cleaned + " 个过期文件" : ""));
        } else {
          UI.toast("warn", r.reason || "绑定失败");
        }
        syncDirButtons();
      });
    });
    $("slBtnDirLog").addEventListener("click", function () {
      if (AI.dirLogging()) {
        AI.stopDirLog().then(function () {
          UI.toast("info", "目录日志已停写");
          syncDirButtons();
        });
        return;
      }
      AI.startDirLog().then(function (r) {
        if (r.ok) {
          UI.toast("ok", "正在写入 " + r.name + "（落盘不受屏幕暂停影响）");
        } else {
          UI.toast("warn", r.reason || "开写失败");
        }
        syncDirButtons();
      });
    });
    $("slBtnCleanLogs").addEventListener("click", function () {
      AI.cleanLogs(false).then(function (r) {
        UI.toast(r.ok ? "ok" : "warn", r.ok
          ? ("清理完成：删除 " + r.removed + " 个，保留最近 " + ((core.config.ai && core.config.ai.logKeep) || 10) + " 个")
          : (r.reason || "清理失败"));
      });
    });
    $("slBtnWipeLogs").addEventListener("click", function () {
      UI.confirm("一键清空调试信息", "将删除数据文件夹里全部 seriallab_v* 文件（日志与数据表），不可恢复。确定清空吗？", "全部删除")
        .then(function (ok) {
          if (!ok) { return; }
          AI.cleanLogs(true).then(function (r) {
            UI.toast(r.ok ? "ok" : "warn", r.ok ? "已删除 " + r.removed + " 个文件" : (r.reason || "清空失败"));
          });
        });
    });
    $("slBtnExpCsvDir").addEventListener("click", function () {
      var r = SL.exporters.buildParsedCsv();
      if (!r || r.rows.length <= 1) {
        UI.toast("warn", "还没有可导出的解析数据");
        return;
      }
      AI.writeCsvToFolder(r.csv).then(function (res) {
        UI.toast(res.ok ? "ok" : "warn", res.ok ? "已写入数据文件夹：" + res.name : (res.reason || "写入失败"));
      });
    });

    $("slBtnCfgCopy").addEventListener("click", function () {
      copyText(SL.exporters.configToText()).then(function (ok) {
        UI.toast(ok ? "ok" : "bad", ok ? "配置 JSON 已复制到剪贴板" : "复制失败，请用「导出文件」");
      });
    });

    $("slBtnCfgImport").addEventListener("click", function () {
      askText("粘贴导入配置", "把配置 JSON 粘贴到这里：", "").then(function (text) {
        if (text === null) { return; }
        applyConfigText(text);
      });
    });

    $("slBtnCfgExport").addEventListener("click", function () { SL.exporters.exportConfigFile(); });

    $("slBtnCfgFile").addEventListener("click", function () {
      pickFile(".json,application/json").then(function (text) {
        if (text === null) { return; }
        applyConfigText(text);
      });
    });

    $("slBtnCfgClear").addEventListener("click", function () {
      UI.confirm("清空配置", "将把串口参数、解析规则、发送工作流、通道与图表框全部恢复默认，并清空本地存储。请先导出一份配置备份。", "清空并恢复默认")
        .then(function (ok) {
          if (!ok) { return; }
          core.clearConfig();
          bootFromConfig();
          UI.toast("ok", "已恢复默认配置");
        });
    });

    $("slBtnOffline").addEventListener("click", function () { SL.exporters.exportOffline(); });

    $("slBtnPrompt").addEventListener("click", showAiPrompt);
  }

  function applyConfigText(text) {
    var res = SL.exporters.configFromText(text);
    if (!res.ok) {
      UI.toast("bad", "导入失败：" + res.errors.join("；"));
      return;
    }
    res.config.ui = res.config.ui || {};
    core.config = res.config;
    core.saveConfig();
    bootFromConfig();
    UI.toast("ok", "配置已导入并生效");
  }

  function pickFile(accept) {
    return new Promise(function (resolve) {
      var input = el("input");
      input.type = "file";
      input.accept = accept || "";
      input.style.display = "none";
      input.addEventListener("change", function () {
        var f = input.files && input.files[0];
        if (!f) { resolve(null); return; }
        /* util.readTextFile 是回调式（与站点既有习语一致），这里包一层 Promise */
        U.readTextFile(f, function (err, text) {
          if (err) {
            UI.toast("bad", "读取文件失败：" + err);
            resolve(null);
            return;
          }
          resolve(text);
        });
      });
      document.body.appendChild(input);
      input.click();
      global.setTimeout(function () {
        if (input.parentNode) { input.parentNode.removeChild(input); }
      }, 60000);
    });
  }

  function renderLogs() {
    var host = $("slLogList");
    if (!host) { return; }
    var logs = core.getLogs();
    host.textContent = "";
    if (!logs.length) {
      host.appendChild(el("p", "sl-hint", "暂无日志。"));
      return;
    }
    var table = el("table", "sl-table");
    var start = Math.max(0, logs.length - 60);
    for (var i = logs.length - 1; i >= start; i--) {
      var tr = el("tr");
      var d = new Date(logs[i].t);
      /* V2.2.6：等级着色——error 红 / warn 琥珀，info 默认灰，一眼分轻重 */
      var lvCls = logs[i].level === "error" ? " is-bad" : logs[i].level === "warn" ? " is-warn" : "";
      tr.appendChild(el("td", null, pad(d.getHours(), 2) + ":" + pad(d.getMinutes(), 2) + ":" + pad(d.getSeconds(), 2)));
      tr.appendChild(el("td", "sl-log-level" + lvCls, logs[i].level));
      tr.appendChild(el("td", null, logs[i].msg));
      table.appendChild(tr);
    }
    host.appendChild(table);
  }

  /* ------------------------------------------------------------
     11) 底部发送条 + 预设快捷键
     ------------------------------------------------------------ */
  function wireSendBar() {
    $("slBtnSend").addEventListener("click", sendFromInput);
    $("slSendInput").addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        sendFromInput();
        return;
      }
      /* ↑↓ 翻发送过的内容（V2.2.17）。光标位置的守卫只在「还没进历史」时生效：
         一旦值是从历史取回来的（histIdx >= 0），光标必然在末尾，
         这时若还要求「必须在开头」，第二次按 ↑ 就翻不动了（实测踩到过）。 */
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        if (!sendHistory.length) { return; }
        var atStart = (this.selectionStart === 0 && this.selectionEnd === 0);
        var atEnd = (this.selectionStart === this.value.length && this.selectionEnd === this.value.length);
        if (histIdx < 0) {
          if (e.key === "ArrowUp" && !atStart) { return; }
          if (e.key === "ArrowDown" && !atEnd) { return; }
        }
        e.preventDefault();
        if (e.key === "ArrowUp") {
          if (histIdx + 1 < sendHistory.length) { histIdx++; }
        } else {
          histIdx--;
        }
        this.value = (histIdx >= 0) ? sendHistory[histIdx] : "";
        try { this.setSelectionRange(this.value.length, this.value.length); } catch (e2) {}
      }
    });
    $("slBtnSendAgain").addEventListener("click", function () {
      if (!lastSent) { UI.toast("warn", "还没有发送过内容"); return; }
      SL.app.send(lastSent, {
        hex: core.config.transport.hexSend,
        appendLineEnding: core.config.transport.appendLineEnding
      });
    });
  }

  function sendFromInput() {
    var input = $("slSendInput");
    var text = input.value;
    if (!text) { UI.toast("warn", "请输入要发送的内容"); return; }
    var sent = SL.app.send(text, {
      hex: core.config.transport.hexSend,
      appendLineEnding: core.config.transport.appendLineEnding
    });
    if (sent) {
      lastSent = text;
      pushSendHistory(text);      /* V2.2.17：记进发送历史，供 ↑↓ 翻回 */
      input.value = "";
    }
  }

  /* 预设快捷键：焦点不在输入控件时生效 */
  function onGlobalKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) { return; }
    var t = e.target;
    var tag = t && t.tagName ? t.tagName.toUpperCase() : "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) { return; }
    if (UI.isModalOpen()) { return; }
    var key = e.key;
    if (!key || key.length !== 1) { return; }
    var presets = core.config.send.presets || [];
    for (var i = 0; i < presets.length; i++) {
      var p = presets[i];
      if (p && p.enabled !== false && p.shortcut && p.shortcut === key) {
        e.preventDefault();
        SL.app.sendPreset(p.id);
        return;
      }
    }
    /* V2.2.17：空格 = 暂停 / 继续。放在预设之后——用户给某个预设绑了空格就听用户的。
       焦点在按钮/链接上时不抢：那种情况下空格是「激活它」的默认行为。 */
    if (key === " " && tag !== "BUTTON" && tag !== "A") {
      e.preventDefault();
      runCommand({ t: "暂停 / 继续", sel: "#slBtnFreeze" });
    }
  }

  /* ------------------------------------------------------------
     V2.2.17（AUDIT A-91）：命令面板 + 全局快捷键 + 发送历史
     为什么值得做:左侧栏 260px 宽、界面 170+ 个 id、6 个页签——想找「导出 AI 调试包」
     这种低频但关键的动作,得先想起它落在哪个页签的第几组。命令面板把这层「位置记忆」
     换成「打字搜索」;快捷键把重复最多的三个动作(暂停/清空/导出)变成一次按键。
     **命令一律触发既有按钮**(click 既有元素),不复制任何业务逻辑——否则同一个动作
     会有两份实现,迟早漂移(硬规则 12 的同一条道理)。表里元素不存在的命令直接不列出。
     ------------------------------------------------------------ */
  var sendHistory = [];      /* 发送过的内容,最近在前 */
  var histIdx = -1;          /* ↑↓ 浏览位置:-1 = 正在看/编辑新草稿 */

  function pushSendHistory(text) {
    if (!text) { return; }
    for (var i = 0; i < sendHistory.length; i++) {
      if (sendHistory[i] === text) { sendHistory.splice(i, 1); break; }
    }
    sendHistory.unshift(text);
    if (sendHistory.length > 50) { sendHistory.length = 50; }   /* 有上限,不无限攒 */
    histIdx = -1;
  }

  var PALETTE_CMDS = [
    { t: "协议分析（Modbus / 识别 / 帧对比）", k: "xieyi fenxi protocol modbus crc duibi", sel: "#slBtnProto" },
    { t: "导出 Markdown 表格（贴文档 / 发 AI）", k: "daochu markdown biaoge md", sel: "#slBtnExpMd" },
    { t: "连接设备", k: "lianjie connect open port", sel: "#slBtnConnect" },
    { t: "断开连接", k: "duankai disconnect close", sel: "#slBtnDisconnect" },
    { t: "AUTO 自适应（扫描波特率 + 识别编码）", k: "auto zishiying zidong", sel: "#slBtnAuto" },
    { t: "扫描波特率", k: "saomiao botelv baud scan", sel: "#slBtnScanBaud" },
    { t: "识别编码", k: "shibie bianma encoding", sel: "#slBtnDetectEnc" },
    { t: "暂停 / 继续刷新（空格）", k: "zanting pause freeze kongge", sel: "#slBtnFreeze" },
    { t: "开启 / 关闭演示数据（Ctrl+Shift+D）", k: "yanshi demo ceshi", sel: "#slBtnDemo" },
    { t: "清空数据（通道缓存 + 原始记录）", k: "qingkong shuju clear data", sel: "#slBtnClearChannels" },
    { t: "清空面板（工作区图表框，可撤销）", k: "qingkong mianban clear panels", sel: "#slBtnClearPanels" },
    { t: "复制 AI 提示词", k: "fuzhi ai tishi ci prompt copy", sel: "#slBtnAiPrompt" },
    { t: "导出 AI 调试包（Ctrl+E）", k: "daochu ai tiaoshi bao debug bundle", sel: "#slBtnDebugBundle" },
    { t: "按当前规则重放缓存", k: "chongfang replay huanchun", sel: "#slBtnReplay" },
    { t: "全部图表导出 PNG", k: "daochu png tu tubiao", sel: "#slBtnPngAll" },
    { t: "导出解析 CSV", k: "daochu csv jiexi", sel: "#slBtnExpCsv" },
    { t: "开始 / 停止录制", k: "luzhi record kaishi", sel: "#slBtnRecord" },
    { t: "绑定数据文件夹（存给 AI / Excel）", k: "wenjianjia folder bind shuju", sel: "#slBtnBindFolder" },
    { t: "全屏主区", k: "quanping fullscreen zhuyu", sel: "#slBtnMainFull" },
    { t: "收起 / 展开主区", k: "shouqi collapse zhuyu", sel: "#slBtnMainCollapse" },
    { t: "重置分割比例", k: "chongzhi fenge split bill", sel: "#slBtnSplitReset" },
    { t: "显示 / 收起发送条", k: "fasongtiao sendbar", sel: "#slBtnSendBar" },
    { t: "收起 / 展开左栏", k: "zuolan sidebar shoulan", sel: "#slBtnSide" },
    { t: "切换浅色 / 深色主题", k: "zhuti theme qianse shense", sel: "#slBtnTheme" },
    { t: "设置（字号 / 时间戳 / 方向标记）", k: "shezhi settings zihao", sel: "#slBtnSettings" },
    { t: "打开使用帮助", k: "bangzhu help shiyong", sel: "#slBtnHelp" },
    { t: "恢复默认设置", k: "huifu moren restore defaults", sel: "#slBtnRestoreDefaults" }
  ];

  /* 面板条目 = 静态表(元素存在才列) + 页签栏实时生成(避免两处清单) */
  function paletteItems() {
    var out = [];
    var i;
    for (i = 0; i < PALETTE_CMDS.length; i++) {
      if (document.querySelector(PALETTE_CMDS[i].sel)) { out.push(PALETTE_CMDS[i]); }
    }
    var tabs = document.querySelectorAll("#slTabs .sl-tab");
    for (i = 0; i < tabs.length; i++) {
      (function (tab) {
        out.push({
          t: "页签：" + (tab.textContent || "").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, ""),
          k: "yequan tab " + (tab.getAttribute("data-pane") || ""),
          el: tab
        });
      })(tabs[i]);
    }
    return out;
  }

  function runCommand(c) {
    var target = c.el || (c.sel ? document.querySelector(c.sel) : null);
    if (!target) { UI.toast("warn", "「" + c.t + "」这个入口当前不可用"); return false; }
    if (target.disabled) { UI.toast("warn", "「" + c.t + "」当前不可用（按钮是禁用状态）"); return false; }
    target.click();
    return true;
  }

  /* 子序列匹配：q 的字符按顺序出现在 s 里就算命中——"dc" 能匹配 "daochu"。
     只做子串匹配的话「拼音首字母」这个承诺就是假的（placeholder 里写着 dc = 导出，
     而 "dc" 不是 "daochu" 的子串）。越靠前、越紧凑分越高。 */
  function subseqScore(s, q) {
    var i = 0, j = 0, first = -1, last = -1, gaps = 0;
    while (i < s.length && j < q.length) {
      if (s.charAt(i) === q.charAt(j)) {
        if (first < 0) { first = i; }
        if (last >= 0) { gaps += (i - last - 1); }
        last = i;
        j++;
      }
      i++;
    }
    if (j < q.length) { return 0; }              /* 没走完 = 不匹配 */
    return 100 - Math.min(80, first * 4 + gaps * 2);
  }

  /* 打分：标题前缀 > 标题包含 > 关键词（含拼音）包含 > 子序列(首字母) > 不匹配 */
  function palScore(item, q) {
    if (!q) { return 1; }
    var t = String(item.t).toLowerCase();
    var k = String(item.k || "").toLowerCase();
    if (t.indexOf(q) === 0) { return 400; }
    if (t.indexOf(q) > 0) { return 300; }
    if (k.indexOf(q) >= 0) { return 200; }
    return subseqScore(t + " " + k, q);
  }

  UI.palette = function () {
    var items = paletteItems();
    var wrap = el("div", "sl-pal");
    var inp = el("input", "sl-pal-input");
    inp.type = "text";
    inp.placeholder = "输入动作名，或拼音首字母（如 dc = 导出）…";
    inp.setAttribute("aria-label", "搜索命令");
    var list = el("div", "sl-pal-list");
    wrap.appendChild(inp);
    wrap.appendChild(list);
    var shown = [], sel = 0;

    function render() {
      var q = inp.value.replace(/^\s+|\s+$/g, "").toLowerCase();
      /* 按分数排序（最相关的在最上面），同分保持表内原序——否则「搜到了但要翻很久」。 */
      var hits = [];
      for (var i = 0; i < items.length; i++) {
        var sc = palScore(items[i], q);
        if (sc > 0) { hits.push({ it: items[i], sc: sc, ord: i }); }
      }
      hits.sort(function (a, b) { return (b.sc - a.sc) || (a.ord - b.ord); });
      shown = [];
      for (var h = 0; h < hits.length; h++) { shown.push(hits[h].it); }
      if (sel >= shown.length) { sel = shown.length ? shown.length - 1 : 0; }
      if (sel < 0) { sel = 0; }
      list.textContent = "";
      if (!shown.length) {
        list.appendChild(el("p", "sl-hint", "没有匹配的动作。试试「导出」「连接」「页签」这类词。"));
        return;
      }
      for (var j = 0; j < shown.length; j++) {
        (function (item, idx) {
          var row = el("div", "sl-pal-row" + (idx === sel ? " is-on" : ""));
          row.appendChild(el("span", "sl-pal-t", item.t));
          row.addEventListener("click", function () {
            UI.closeModal();
            runCommand(item);
          });
          row.addEventListener("mousemove", function () {
            if (sel === idx) { return; }
            sel = idx;
            render();
          });
          list.appendChild(row);
        })(shown[j], j);
      }
    }

    inp.addEventListener("input", function () { sel = 0; render(); });
    inp.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(sel + 1, shown.length - 1); render(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(sel - 1, 0); render(); }
      else if (e.key === "Enter") {
        e.preventDefault();
        var pick = shown[sel];
        if (pick) { UI.closeModal(); runCommand(pick); }
      }
    });

    render();
    UI.modal({ title: "命令面板", body: wrap, buttons: [{ label: "关闭" }] });
    /* 打开就把焦点给输入框（面板的意义就是「打开即打字」） */
    global.setTimeout(function () { try { inp.focus(); } catch (e2) {} }, 30);
  };

  /* 带修饰键的那批快捷键。与既有 onGlobalKey（主打「无修饰键的预设单键」）职责分开，
     互不干扰：这里只认 Ctrl/Cmd 组合。 */
  function onAppShortcut(e) {
    if (!e.ctrlKey && !e.metaKey) { return; }
    var key = (e.key || "").toLowerCase();
    var t = e.target;
    var tag = t && t.tagName ? t.tagName.toUpperCase() : "";
    var typing = (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable));
    /* Ctrl+K 命令面板：正在输入时也要能唤起（这是它该有的样子） */
    if (key === "k" && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      if (UI.isModalOpen()) { UI.closeModal(); }
      UI.palette();
      return;
    }
    if (typing || e.altKey) { return; }   /* 其余快捷键不在输入框里抢键 */
    if (key === "l" && !e.shiftKey) {
      e.preventDefault();
      runCommand({ t: "清空数据", sel: "#slBtnClearChannels" });
    } else if (key === "e" && !e.shiftKey) {
      e.preventDefault();
      runCommand({ t: "导出 AI 调试包", sel: "#slBtnDebugBundle" });
    } else if (key === "d" && e.shiftKey) {
      e.preventDefault();
      runCommand({ t: "演示数据", sel: "#slBtnDemo" });
    }
  }

  /* ------------------------------------------------------------
     12) 帮助与 AI 开发提示词
     ------------------------------------------------------------ */
  function showHelp() {
    UI.showArticle("串口调试助手 · 使用帮助", [
      { h: "① 连接设备", p: "点「连接设备」在弹出的对话框里选择串口。Web Serial 要求 Chromium 内核浏览器（Chrome / Edge 89+）并运行在 HTTPS 或 localhost 下；Safari 与手机浏览器不提供该能力。没有硬件时点「进入演示模式」，全部解析、绘图、插件与导出功能都能体验。" },
      { h: "①-1 乱码三分诊（监视器出现菱形问号时）", p: "乱码几乎只有三种原因，应用会监测解码失败率并在「设备」页签弹出排查条，按顺序试：一「识别编码」——对最近收到的原始字节做 UTF-8/GBK/二进制三分判定，一键切到最可能的编码（中文设备常见 GBK）；二「扫描波特率」——对 12 个常用波特率逐档重开端口采样打分并自动切换，每档采样时长可在按钮旁调（默认 700ms；太短会漏掉「上电后才开始打印」的设备）。打分取「像不像文本」与「按当前 HEX 规则试解出的帧成功率」两者较高者，所以二进制协议要先把模式切到 HEX 并配好帧结构，否则永远扫不出来。⚠ Arduino/ESP 每开一次口会复位一次，扫描会让设备反复重启（本版会尝试压住 DTR/RTS 并留预热窗口，能减轻但不能保证消除）；三还不行——多半是二进制协议被当文本看，切 HEX 显示或去「解析」页签配帧结构。注意：Web Serial 在操作系统层就按波特率完成了电平采样，波特率错配无法从字节流逆推，所以只能扫描比对，编码错配则可以在字节层直接识别。" },
      { h: "①-2 演示与故障注入（「设备」页签底部）", p: "「拟真电机信号」把演示数据从理想正弦换成目标阶跃 + 超调振铃 + 稳态纹波 + 测量噪声——量程、滤波、极值统计的潜在问题在理想正弦面前全部隐身，拟真形态才能把它们逼出来。四个故障注入概率（丢帧/错帧/粘包/乱码）让你无硬件时演练整条排错链路：失败行标红、失败原因分布、AI 调试包的失败样本、乱码监测提示，全部会被真实触发。" },
      { h: "② 解析数据", p: "文本模式直接识别 key=value 与 key:value（等号、冒号都支持，后缀数字如 temp1/temp2 会保留为独立通道）。HEX 模式按结构表解帧：设帧头/帧尾或长度字段定界，再逐个字段声明类型、偏移、字节序与缩放系数；校验支持累加和、异或、累加和(16) 与 CRC16-Modbus。点「套用示例」可以一键填入演示帧结构。" },
      { h: "②-1 文本格式速查", p: "每行写出键值对即可：等号与冒号都认，一行里多个数值对用逗号连写，后缀数字如 temp1/temp2 各自成为独立通道，数值支持整数、小数与科学计数法。键名支持中文（国产设备打印「温度=25.3」直接可解析，通道名与图例都显示中文）。", code: "temp=25.3, cur:1.02\npos:90 vel=12.5\n温度=36.8, 电流:1.02" },
      { h: "②-2 默认（演示）HEX 帧的字节级布局", p: "演示模式与「套用示例」用的就是下面这一帧，共 11 字节：", code: "偏移  0   1    2     3     4-5            6-7             8-9            10\n字节  AA  55   seq   len=6 pos(i16×.01)  cur(i16×.001)  temp(i16×.01)  sum8", list: [
        "长度字段：偏移 3、1 字节、含义「载荷长度」；偏移是相对整帧起始（含帧头）算的，不是相对载荷。",
        "sum8 = 帧首到第 9 字节的累加和低 8 位；校验和固定放在帧尾。",
        "演示波形：pos = 90·sin(2π·0.5t)、cur = 3.2·sin(2π·0.5t+0.6)、temp = 42 + 3·sin(2π·0.02t)。",
        "配好自定义规则后再进演示模式，合成数据会按你的帧结构生成 —— 没有硬件也能验证解析、通道与画图。"
      ] },
      { h: "②-3 自定义 HEX 帧怎么配（在「解析」页签）", list: [
        "帧头 / 帧尾：填十六进制串（如 AA55），留空表示不按该方式定界。",
        "长度字段：偏移（相对整帧起始，含帧头）、字节数（0=不用，1~4）、含义（载荷长度 / 整帧长度）。",
        "校验：类型（无 / 累加和8 / 异或8 / 累加和16 / CRC16-Modbus）、起始、结束（-1 = 到载荷末尾）。",
        "字段表：逐个填 键名 / 类型（int8~uint32、float32）/ 偏移 / 长度 / 缩放 / 大端。",
        "六个最容易踩的坑：长度字段只按小端解析；校验固定在帧尾；长度字段与帧尾并存时以长度字段为准；字段偏移是相对整帧起始；未知类型按无符号整数处理；不支持位域与变长字段。"
      ] },
      { h: "②-4 显示层开关（设备页签「编码与显示」）", p: "「HEX 显示」勾上后串口监视器按十六进制字节流显示；「显示时间戳」决定每行是否带时间；「HEX 发送」勾上后底部发送的内容按十六进制解析（顶栏与发送条两个开关同步）。要把数据解析成通道，请用「解析」页签的模式单选 —— 一个管显示、一个管解析，互不冲突。" },
      { h: "②-5 时间戳口径与显示细节（「显示」页签）", p: "时间戳有两种口径：绝对时刻（23:51:21.900）与相对秒（12.345s，自本次会话开始累计）。默认绝对时刻，与 VOFA+ / SerialWeb 的显示习惯一致。同一页签里还能调监视器字号、是否数字标红、是否把解析失败的行整行标红，以及屏幕刷新频率（数据一直在收，只是屏幕按这个频率重画，串口很吵时调低更省 CPU）。" },
      { h: "③ DIY 显示", p: "「图表」标签页里选渲染器 → 添加到工作区 → 点该图框的「编辑」绑定通道、写映射公式、调量程与配色。公式只支持四则运算与白名单函数（abs/sqrt/sin/cos/log/…），用通道名作变量，例如 (cur*24)。每个图框右下角有缩放手柄可拖拽改高度，「⇔」可加宽跨两列，「⇱」可与串口监视器互换主位。图表配置与配色可通过「面板包」导出分享。" },
      { h: "③-1 主区布局与运行控制", p: "主区是「上监视器 + 下波形」的上下分割：中间的横条可以上下拖动调整比例（键盘也可用：↑↓ 微调、Home 复位），比例会记进配置。监视器标题栏的「⛶」让主区独占全屏，「▭」把主区压成只剩标题条。顶栏左侧的绿色圆标是运行 / 暂停：点一下冻结画面，但数据仍在后台缓冲，恢复后接着看，不会丢。" },
      { h: "③-2 开源协议预设（「解析」页签顶部）", p: "内置四套社区事实标准的协议，点一下即套用：FireWater（VOFA+ 文本 name:value）、Teleplot（>name:value）、JustFloat（VOFA+ 二进制 float32×N + 帧尾 00 00 80 7F）、匿名 V1.0（AA AA + 功能字 + 长度 + 数据 + SUM8，数据 int16 大端）。套用后会立刻用缓存里的原始字节重放一次，当场就能看出解对没解对。" },
      { h: "③-3 面向 AI 的调试回路", p: "「显示」页签里有两个按钮专为「让 AI 直接调硬件」设计：一是「导出 AI 调试包」—— 一个自包含 JSON，含生效配置、帧结构说明、各通道统计、最近若干条原始记录（含解出值）与解析失败样本，整包丢给 AI 就不必来回截图粘贴；二是「按当前规则重放缓存」—— 改完帧结构不必让硬件重跑，用缓存里的原始字节立刻重解一遍。另外「自动存档」会在连上设备或进入演示后自动开始录制（滚动保留最近数据），随时可导出。" },
      { h: "③-4 让 AI 直接读串口：本地桥 + MCP", p: "仓库里的 _本地工具/serial-bridge 是一个本地串口桥（Node + serialport），直接复用本应用 9 个真源模块的解析内核（结果与网页端逐字节一致），并已封装为 MCP server——在 AI 工具的 MCP 配置里加 {\"command\": \"node\", \"args\": [\"<仓库根>/_本地工具/serial-bridge/bridge.mjs\", \"mcp\"]} 后，AI 就能调用 serial_list / serial_read / serial_write / serial_parse / serial_assert 五个工具：读串口、发指令（会先征求确认）、离线解析、跑判据断言（退出码 0/2）自主迭代。不依赖 MCP 的两条路：勾选「持续写入本地文件」（NDJSON 逐行落盘）或「HTTP 上报」+ python _本地工具/serial-inbox.py 收件箱。数据只在你的本机流转，没有任何上传代码。详见介绍页第 7 节「AI 自动化调试接入」。" },
      { h: "④ 发送", p: "底部输入框回车即发；HEX 模式内容写 AA 55 01（可空格分隔）。「发送」标签页里还能配定时轮询、触发应答（收到含「匹配」的内容自动回「应答」）与预设发送（可绑单字符快捷键，焦点不在输入框时生效，支持期望回包与超时提示）。" },
      { h: "⑤ 录制与导出", p: "「录制」标签页把流过的帧存进内存，停止后可回放、导出为 JSON；「暂停刷新」只停画面、不断开数据（与顶栏绿圆标是同一个开关）。数据页可导出解析结果 CSV（带 BOM，Excel 中文不乱码）、原始记录 CSV、JSON、BIN 与 TXT。" },
      { h: "⑤-1 数据文件夹与文件命名规范（给 AI / 脚本定位用）", p: "「数据」页签可绑定一个本地文件夹，所有产物按统一规范命名，AI 或脚本按 seriallab_v* 通配即可快速定位目标调试信息：", list: [
        "持续调试流：seriallab_v<版本>_log-<功能标识>_<日期时间>.ndjson —— 每行一个 JSON（首行 meta 说明结构），AI 逐行读即可按时间轴复盘「每个时间段发生了什么」；",
        "数据表：seriallab_v<版本>_data-<功能标识>_<日期时间>.csv —— 带 BOM，Excel 直接打开，按列做统计、滤波对比分析；",
        "功能标识在页签里自定义（如 foc-test / pid-tune），便于区分不同实验；",
        "超出「保留最近 N 个」的旧文件自动删除；「清理历史」手动清、「一键清空」全删（有确认）；",
        "屏幕暂停不影响落盘——暂停只是冻结画面，文件照常实时写入，AI 看到的时间轴是连续的。"
      ] },
      { h: "⑤-2 实时统计（有效值 / 峰峰值）", p: "「图表」页签新增「实时统计」渲染器：选通道后自动实时计算 有效值 RMS（去均值口径，标准正弦 = 峰值/√2）、峰峰值 Vpp、均值（直流分量）、最大、最小、样本数，只统计当前窗口（面板窗口可调），适合验证滤波前后的有效值变化。" },
      { h: "⑤-3 时域波形的示波器操作", p: "数据按时间轴向左滚动、最新点始终贴右缘；鼠标拖动可回看历史（右上角有黄色「回看历史」提示），滚轮缩放窗口点数，双击或点面板头「Auto」回到实时并恢复自动量程；图例上每条通道前有勾选框，点一下即隐藏 / 恢复该通道（隐藏的整条灰显，可随时点回来）；默认各图表框按通道名联动——时域关了 pos，频域那张也跟着关，不想联动就到「显示」页签取消「图表图例的勾选跨面板同步」；面板头的「⏸」只暂停这张卡片（数据照收），顶栏绿圆标是全局暂停；快捷条上「窗口」下拉与 Y 轴 min/max 输入可自由调节横纵范围。" },
      { h: "⑤-4 频域谱（FFT）在哪里", p: "频谱分析视图已内置：「图表」页签选「频域谱」或顶栏「新图表」下拉添加——对通道做 radix-2 FFT + 汉宁窗，显示单边幅值谱，与「时域波形」并排放正好是「时域看波形、频域看分量」的组合。采样率默认按相邻点时间间隔反推，也可在面板编辑器里指定。" },
      { h: "已知限制（务必先看）", list: [
        "file:// 直接打开的单文件离线版无法使用真实串口 —— file:// 不是安全上下文，浏览器禁止 Web Serial。真机调试请用本地 HTTP 服务或在线版本。",
        "改波特率、数据位、停止位、校验或流控需要关闭端口重开，应用会自动完成（约四分之一秒）。",
        "Arduino / ESP 打开串口时 DTR 拉低会自动复位，连接后的「复位等待」时间内不建议发送。",
        "录制数据只放内存，刷新页面即丢失。长时间实验请用录制并导出 JSON。"
      ] },
      { h: "面向 AI 的开发说明", p: "本子应用自带 llms.txt、AGENTS.md 与 skills/html-webserial-app/SKILL.md，可用于开发同类应用，或以本应用为基座二次开发。点顶栏「AI 开发提示词」可查看并复制一份浓缩版。" },
      { h: "致谢与参考开源项目", p: "本应用在格式与交互上借鉴并兼容了以下社区项目的事实标准，在此致谢——它们各自都是更完整的上位机/调试工具，按需选用：", list: [
        "VOFA+ —— 文本 FireWater 协议（name:value）与二进制 JustFloat 协议（float32 小端 + 帧尾 00 00 80 7F）均来自 VOFA+ 的社区约定，本站的对应预设与它直接互通；",
        "Teleplot / VS Code Teleplot 插件 —— >name:value 遥测行格式来自 Teleplot 的约定；",
        "匿名上位机 V1.0（匿名科创 / 野火例程生态）—— AA AA 帧头 + 功能字 + 长度 + int16 大端 + SUM8 的帧结构来自该协议公开定义；",
        "SerialWeb 等网页串口助手 —— 时间戳双口径、HEX/文本双视图等显示习惯对齐此类工具；",
        "Web Serial API —— Chromium 团队的标准能力，本应用是它的一个零依赖实现。"
      ] }
    ]);
  }

  /* 浓缩版开发提示词：离线可用，不依赖网络读取 */
  var AI_PROMPT = [
    "# 任务：开发一个网页端串口调试助手（或在本应用基础上二次开发）",
    "",
    "## 硬约束（不可违反）",
    "1. 只用 Web Serial API（navigator.serial）连接串口；必须运行在 HTTPS 或 localhost（file:// 下 requestPort 会被拒绝）。",
    "2. 零构建、零后端、零第三方运行时依赖；纯静态文件，可离线使用。",
    "3. 保守 ES5 语法（可用 Promise / TextDecoder 等浏览器 API，禁止 let/const/箭头函数/模板字符串）。",
    "4. 用户可见文本一律 textContent，禁止 innerHTML 拼接用户数据。",
    "5. 禁止 eval / new Function；用户填写的公式必须走自研词法分析 + 调度场 + RPN 求值。",
    "6. 遵循站点现有目录与命名：子应用放 06_学习工具/_<名称>/，前端脚本全部外置为 .js（不要内联业务 JS）。",
    "",
    "## 模块划分（单一全局命名空间 window.SerialLab，模块间不互相持有引用）",
    "- util      通用工具（叶子模块，零依赖）",
    "- core      事件总线 on/off/emit + 运行状态 core.state + 配置默认值/迁移/持久化",
    "- codec     编解码与分帧：UTF-8 多字节切分保护、按行分帧、按帧头/帧尾/长度字段收帧、校验和",
    "- parser    协议解析：文本 key=value / key:value、HEX 结构表（偏移/类型/字节序/缩放）、校验和比对",
    "- expr      安全表达式求值（禁 eval）",
    "- fft       零依赖 radix-2 FFT + 汉宁窗 + 单边幅值谱",
    "- datastore 环形缓冲（零分配遍历）+ 通道元数据 + 原始帧记录 + 统计",
    "- transport Web Serial 传输层：状态机、读循环、写队列、参数变更重开、手动信号、内置演示数据源",
    "- plugins   声明式插件系统 + 内置渲染器（timeplot/fftplot/bar/gauge/table/textmon/plotxy）",
    "- views     工作区面板增删排序折叠 + requestAnimationFrame 节流渲染循环",
    "- timeline  录制 / 冻结 / 回放 / 录制 JSON 导入导出",
    "- exporters CSV(带 BOM)/JSON/BIN/TXT 导出、配置导入导出、单文件离线版装配",
    "- ui        DOM 绑定、控件与配置双向同步、对话框、提示条、主题、快捷键、发送引擎",
    "- app       唯一编排者：装配数据管线并 boot",
    "",
    "## 单向数据流（严格遵守）",
    "transport.serial:data → codec 分帧 → parser 解析 → datastore.pushFrame → emit(frame)",
    "→ views/plugins 按 requestAnimationFrame 节流重绘 → ui 更新状态灯与计数",
    "发送方向：ui/发送引擎 → core.emit 请求 → app → transport.write（写队列串行化）",
    "",
    "## Web Serial 关键坑位（逐条落实）",
    "1. requestPort() 必须在真实用户手势的调用栈里触发。",
    "2. 波特率等参数不能热改，必须 close → open，并用去抖避免拖动时反复重开。",
    "3. 释放顺序固定：reader.cancel() → reader.releaseLock() → writer.releaseLock() → port.close()。",
    "4. 断开与重连交叠会竞态：用递增 epoch（代次）标记读写循环，旧循环必须自认过期并静默退出。",
    "5. 开硬流控时不要手动设 RTS，否则二者互相打架。",
    "6. Arduino/ESP 打开串口因 DTR 拉低会复位，需给复位等待窗口并在其间禁止发送。",
    "7. pagehide / beforeunload 里释放端口，否则下次打开会提示被占用。",
    "",
    "## 解析与绘图要点",
    "- 文本解析同时支持 = 与 :，后缀数字（temp1/temp2）保留为独立通道；",
    "  整数与小数用统一正则，键后不是数值时跳过该键继续匹配。",
    "- HEX 解析任何越界都返回 {ok:false} 而不是抛异常 —— 渲染层必须零崩溃。",
    "- UTF-8 解码要按起始字节判定应有长度，尾部不完整序列留给下一块，绝不产出替换字符。",
    "- 绘图用 <canvas> + devicePixelRatio 缩放（ctx.setTransform(dpr,0,0,dpr,0,0)）；",
    "  绘制节流到 20~25fps，滚动出视口的面板跳过重绘，单个面板异常必须被隔离。",
    "",
    "## 声明式插件（用户 DIY 的唯一入口）",
    "面板描述符 JSON（不含任何可执行代码）：",
    "  { type, id, title, channels:[\"auto\"|\"键名\"], expr, axis:{yAuto,yMin,yMax}, window, colors:{键名:\"#hex\"}, opts:{...} }",
    "流程：内置 renderer 注册表 → validate(desc) 归一化并修正（未知 type 降级为 table，绝不抛异常）→ instantiate 建画布。",
    "渲染器接口：make(hostEl, panel) → { update(dataProvider), resize(), destroy() }；",
    "dataProvider 形如 { channels(), count(key), forEach(key,n,cb), copy(key,n), stat(key), recentRaw(n), now() }。",
    "面板包（导出/导入配置）格式：{ kind:\"seriallab-panel-pack\", version:1, panels:[...], channels:[...] }，高版本必须拒绝而不是猜测解析。",
    "",
    "## 交付清单",
    "- 全部业务 JS 外置；index.html 只留静态标记与一个首帧主题引导脚本；",
    "- 双主题：暗色为 :root 令牌，浅色用 html:not([data-theme-early=\"dark\"]) 单选择器覆盖；",
    "- 导出 CSV 带 UTF-8 BOM，Excel 打开中文不乱码；",
    "- 配置持久化用带前缀的键（humanoid-serial-config-v1），便于站点自检白名单；",
    "- 提供 llms.txt / AGENTS.md / SKILL.md，便于 AI 与本应用协同开发。",
    "",
    "（本提示词是本应用的浓缩版；完整说明见同目录 llms.txt、AGENTS.md 与 skills/html-webserial-app/SKILL.md）"
  ].join("\n");

  function showAiPrompt() {
    var wrap = el("div");
    wrap.appendChild(el("p", "sl-hint", "下面是一份可直接喂给 AI 的开发提示词（浓缩版）。复制后粘贴到任意 AI 编码助手里，即可开发同类串口调试应用，或在本应用基础上继续扩展。完整文档见同目录 llms.txt、AGENTS.md 与 skills/html-webserial-app/SKILL.md。"));
    var ta = el("textarea", "sl-prompt");
    ta.readOnly = true;
    ta.value = AI_PROMPT;
    wrap.appendChild(ta);

    UI.modal({
      title: "AI 开发提示词",
      body: wrap,
      buttons: [
        {
          label: "复制全文", primary: true,
          onClick: function () {
            copyText(AI_PROMPT).then(function (ok) {
              UI.toast(ok ? "ok" : "bad", ok ? "提示词已复制（" + AI_PROMPT.length + " 字符）" : "复制失败，请手动全选复制");
            });
            return false;   /* 不关闭对话框，方便用户再次操作 */
          }
        },
        {
          label: "下载为 txt",
          onClick: function () {
            var ok = SL.exporters.downloadText(AI_PROMPT, "串口调试助手_AI开发提示词.txt");
            UI.toast(ok ? "ok" : "bad", ok ? "已下载提示词 txt" : "下载失败");
            return false;
          }
        },
        { label: "关闭" }
      ]
    });
  }

  /* ------------------------------------------------------------
     13) 顶栏 / 舞台栏
     ------------------------------------------------------------ */
  function wireTop() {
    $("slBtnHelp").addEventListener("click", showHelp);
    $("slBtnTheme").addEventListener("click", UI.cycleTheme);
    $("slBtnDefaults").addEventListener("click", restoreDefaults);

    /* 运行 / 暂停：绿色圆标一键切换（替代旧版埋在「录制」页签里的「冻结显示」） */
    $("slRun").addEventListener("click", function () {
      SL.views.setPaused(!core.state.paused);
      renderRun();
      UI.toast(core.state.paused ? "warn" : "ok",
        core.state.paused ? "已暂停屏幕刷新（数据仍在后台缓冲，不会丢）" : "已恢复实时刷新");
    });

    $("slBtnSide").addEventListener("click", function () {
      var side = $("slSide");
      var hid = side.className.indexOf("is-hidden") >= 0;
      side.className = hid ? "sl-side" : "sl-side is-hidden";
      core.config.ui.sideHidden = !hid;
      core.saveConfig();
      this.textContent = hid ? "收起左栏" : "展开左栏";
      if (SL.views) { global.setTimeout(function () { SL.views.redraw(); }, 30); }
    });

    $("slTabs").addEventListener("click", function (e) {
      var t = e.target;
      if (!t || t.tagName !== "BUTTON") { return; }
      var pane = t.getAttribute("data-pane");
      if (!pane) { return; }
      /* V2.2.16：页签从 9 个并到 6 个——`data-also` 声明「这个页签同时显示哪些面板」。
         合并只影响左侧栏的分组，不动各面板自身（接线全靠元素 id，与所在面板无关）；
         拆成「data-pane + data-also」而不是把两个 section 合成一个，是为了
         ①HTML 零搬动（少犯错）②E2E 里按 `data-pane` 点页签的写法保留原值。
         「解析」带「通道」、「显示」带「图表」、「录制」带「数据」。 */
      var want = " " + pane + " " + (t.getAttribute("data-also") || "") + " ";
      var tabs = $("slTabs").getElementsByTagName("button");
      for (var i = 0; i < tabs.length; i++) {
        var on = (tabs[i] === t);
        tabs[i].className = "sl-tab" + (on ? " is-on" : "");
      }
      var panes = document.querySelectorAll(".sl-panes > .sl-pane");
      for (var j = 0; j < panes.length; j++) {
        var key = panes[j].getAttribute("data-pane");
        var isOn = key && want.indexOf(" " + key + " ") >= 0;
        panes[j].className = isOn ? "sl-pane is-on" : "sl-pane";
      }
    });
  }

  /* 主区工具条：C1 主位形态控制 + C2 快速加图表 */
  /* ------------------------------------------------------------
     V2.2.17（AUDIT A-91）：低频组默认折叠
     「手动信号 / 故障注入案例 / 手动调参（一般不用碰）」日常调试用不到，却和常用控件
     平铺在一起，每次都要滚过它们才找得到要用的东西。
     折叠**只加一个类**（CSS 隐藏除 h3 以外的子节点），不动 DOM 结构——这样
     foldStaticHints 依赖的「说明的父节点就是 .sl-group」那条判据依然成立。
     开关用真正的 <button>（可聚焦、带 aria-expanded），不用可点的 h3：
     键盘用户也要能用，而且 h3 里还要塞「?」按钮，再让它可点会互相抢事件。
     ------------------------------------------------------------ */
  function wireFoldGroups() {
    var gs = document.querySelectorAll('.sl-panes .sl-group[data-fold="1"]');
    for (var i = 0; i < gs.length; i++) {
      (function (g) {
        var h3 = g.querySelector ? g.querySelector("h3") : null;
        if (!h3 || h3.getAttribute("data-fold-wired") === "1") { return; }
        h3.setAttribute("data-fold-wired", "1");
        var btn = el("button", "sl-fold");
        btn.type = "button";
        btn.title = "展开 / 收起这一组";
        /* 稳定 id（来自 data-fold-key）：测试要能点到具体的折叠开关，
           而不是靠「第几个 .sl-fold」这种位置选择器（加一个折叠组就会错位）。 */
        var fkey = g.getAttribute("data-fold-key");
        if (fkey) { btn.id = "slFold" + fkey.charAt(0).toUpperCase() + fkey.slice(1); }
        btn.appendChild(el("span", "sl-fold-mark"));
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          var nowFolded = g.className.indexOf("is-folded") >= 0;
          g.className = nowFolded
            ? g.className.replace(/\s*is-folded/g, "")
            : g.className + " is-folded";
          btn.setAttribute("aria-expanded", nowFolded ? "true" : "false");
        });
        h3.appendChild(btn);
        if (g.className.indexOf("is-folded") < 0) { g.className += " is-folded"; }
        btn.setAttribute("aria-expanded", "false");
      })(gs[i]);
    }
  }

  /* ------------------------------------------------------------
     V2.2.16：零状态引导
     首屏最有价值的那块地方（主区）原本是一片空白，而唯一能让人「马上看到东西」的
     演示入口藏在第 9 个页签里；面板里那行「暂无数据（连接设备，或到「测试」页签开演示）」
     是画在 canvas 上的，点不了。这里给三步主线 + 两个能直接点的按钮。
     判据用「有没有收到过字节」而不是「有没有通道」—— 通道表是持久化的，
     用过一次的人即使没连设备也至少有一堆通道，那样引导就永远不会出现。
     ------------------------------------------------------------ */
  function refreshZeroState() {
    var z = $("slZero");
    if (!z) { return; }
    var uicfg = core.config.ui || {};
    /* V2.2.22：用户反馈「每次进去都得看演示，好麻烦」——这张引导卡只该出现一次。
       它有两条退出路径：① 用户点「不再提示」；② 用户已经成功用过一次（连上设备或开过演示）。
       第 ② 条是必须的：判据本身是「还没收到过字节」，而每次重新打开数据都是空的 ——
       不记一笔的话它会永远反复出现，那正是用户抱怨的行为。
       这个「记一笔」的副作用刻意放在这里：这是**唯一**判断「引导已送达」的地方，
       分散到各个监听里就会变成多处各自决定（硬规则 12 的同一条道理）。 */
    if (uicfg.zeroDismissed) { z.hidden = true; return; }
    var hasData = !!(T.stats && T.stats.rx > 0);
    /* V2.2.22：把「隐藏」与「永久关闭」彻底分开——
       · 隐藏（视图）：收到过字节 / 开了演示 / 连上设备 → 卡片让位、不占主区（与 V2.2.16 原逻辑一致）；
       · 永久关闭（持久）：**只由用户显式点「不再提示」触发**。
       曾经还想「用过一次就自动关闭」，但试了两版都与「新用户必须看得到引导」这条正当验收冲突
       （演示模式也会把 conn 置成 open，是虚拟连接）——**一个自动判据去猜用户的意图，猜错就是静默改变行为**。
       显式按钮没有这个风险：用户点一次，之后永远不再出现，这正是他要的「不要反复出现」。 */
    z.hidden = !!(hasData || core.state.demo || core.state.conn === "open");
  }

  /* 把「首屏引导已经送达」记进配置（幂等；只写一次）。 */
  function markZeroStateServed() {
    var uicfg = core.config.ui || (core.config.ui = {});
    if (uicfg.zeroDismissed) { return; }
    uicfg.zeroDismissed = true;
    core.saveConfig();
  }

  function wireZeroState() {
    var demo = $("slZeroDemo");
    if (demo) {
      demo.addEventListener("click", function () {
        /* 直接触发「测试」页签里那个演示按钮：它带自己的开关语义（再点一次即停），
           这里不复制一份逻辑，避免两处口径漂移（硬规则 12 的同一条道理）。
           元素即使当前不可见，.click() 依然会派发 —— 页签隐藏不影响。 */
        var b = $("slBtnDemo");
        if (b) { b.click(); }
        else { UI.toast("warn", "演示入口不可用（版本异常）"); }
      });
    }
    var help = $("slZeroHelp");
    if (help) {
      help.addEventListener("click", function () {
        var h = $("slBtnHelp");
        if (h) { h.click(); }
      });
    }
    var never = $("slZeroNever");
    if (never) {
      never.addEventListener("click", function () {
        markZeroStateServed();
        refreshZeroState();
        core.emit("toast", { level: "info", msg: "首屏引导已关闭，不再自动出现（顶栏「帮助」随时可看）" });
      });
    }
    refreshZeroState();
  }

  function wireStage() {
    /* C1 主位：全屏（独占主区）/ 收起（只留标题条）/ 比例复位 */
    $("slBtnMainFull").addEventListener("click", function () {
      var on = SL.views.toggleMainFull();
      this.textContent = on ? "还原主区" : "全屏主区";
      UI.toast("info", on ? "主区已全屏（波形区暂时隐藏）" : "已还原分割视图");
    });

    $("slBtnMainCollapse").addEventListener("click", function () {
      var on = SL.views.isMainCollapsed();
      SL.views.setMainCollapsed(!on);
      this.textContent = !on ? "展开" : "收起";
    });

    /* V2.2.8：发送条收起/展开（发送条已移入主区，收起后仍可用「发送」页签） */
    function syncSendBar() {
      var hid = !!core.config.ui.sendBarHidden;
      var bar = $("slSendBar");
      if (bar) { bar.hidden = hid; }   /* 按钮文字固定「发送条」，状态由 hidden 表达 */
    }
    $("slBtnSendBar").addEventListener("click", function () {
      core.config.ui.sendBarHidden = !core.config.ui.sendBarHidden;
      core.saveConfig();
      syncSendBar();
    });
    syncSendBar();

    $("slBtnSplitReset").addEventListener("click", function () {
      SL.views.setMonRatio(0.62);
      core.saveConfig();
      UI.toast("ok", "分割比例已复位（主区 62%）");
    });

    /* C2 快捷添加：渲染器下拉 + 添加按钮（与「图表」页签同源） */
    $("slBtnAddPanel2").addEventListener("click", function () {
      var sel = $("slQuickAdd");
      var type = sel ? sel.value : "timeplot";
      var p = SL.views.addPanel({ type: type, channels: ["auto"] });
      if (p) {
        renderPanelList();
        UI.toast("ok", "已添加「" + p.title + "」到工作区（可在面板标题栏点 ⇱ 移到主位）");
      }
    });

    $("slBtnClearPanels").addEventListener("click", function () {
      if (!SL.views.count()) { UI.toast("warn", "工作区已经是空的"); return; }
      UI.confirm("清空面板", "将移除工作区里全部图表框（不影响已收到的数据与配置里的通道）。清空后可点「↩ 撤销」一键恢复。", "清空面板")
        .then(function (ok) {
          if (!ok) { return; }
          SL.views.clearPanels();
          renderPanelList();
          /* V2.2.12：撤销按钮在清空后现身（再清空/恢复后继续可用） */
          $("slBtnUndoClear").hidden = false;
          UI.toast("info", "面板已清空——点工具条「↩ 撤销」可一键恢复");
        });
    });

    /* 撤销清空：按快照原样重建全部图表框 */
    $("slBtnUndoClear").addEventListener("click", function () {
      var n = SL.views.undoClearPanels();
      if (n > 0) {
        renderPanelList();
        UI.toast("ok", "已恢复 " + n + " 个面板");
        this.hidden = true;
      } else {
        this.hidden = true;
      }
    });

    $("slBtnClearData").addEventListener("click", function () {
      UI.confirm("清空缓存", "将清空各通道已缓数据与原始收发记录（保留通道设置与图表框）。此操作不可撤销，需要留档请先到「数据」页签导出或落盘。", "清空缓存")
        .then(function (ok) {
          if (!ok) { return; }
          SL.datastore.clear(true);
          renderChannels();
          UI.toast("ok", "已清空缓存数据");
        });
    });
  }

  /* ------------------------------------------------------------
     13b) 「显示」页签：时间口径 / 刷新节流 / 字号 / 高亮 / AI 回路
     ------------------------------------------------------------ */
  /* 全局优先的显示偏好：写在 documentElement 的 CSS 变量上，
     监视器与所有面板下一帧就会跟着变，不需要重建面板。 */
  function applyUiPrefs() {
    var ui = core.config.ui || {};
    var root = document.documentElement;
    var fs = parseInt(ui.fontSize, 10);
    if (isNaN(fs)) { fs = 12; }
    fs = U.clamp(fs, 11, 18);
    ui.fontSize = fs;
    root.style.setProperty("--sl-mon-size", fs + "px");

    var di = parseInt(ui.drawInterval, 10);
    if (isNaN(di)) { di = 40; }
    di = U.clamp(di, 16, 200);
    ui.drawInterval = di;
    if (SL.views) { SL.views.setDrawInterval(di); }

    /* 记录上限：录制帧数与原始记录条数**同源**（AUDIT A-81）。
       必须走 app.applyRecordCaps()，绝不在界面层单独设 timeline ——
       旧版就是这么漏掉原始缓冲的，结果「界面写 2 万、AI 只拿到 5 千」。 */
    if (SL.app && SL.app.applyRecordCaps) { SL.app.applyRecordCaps(); }

    /* 左栏收起状态 */
    var side = $("slSide");
    if (side) {
      side.className = ui.sideHidden ? "sl-side is-hidden" : "sl-side";
      if ($("slBtnSide")) { $("slBtnSide").textContent = ui.sideHidden ? "展开左栏" : "收起左栏"; }
    }

    renderRun();
    renderRecordCapHint();
    renderAiState();
    if (SL.views && SL.views.redraw) { SL.views.redraw(); }
  }

  /* 运行 / 暂停圆标的状态渲染 */
  function renderRun() {
    var btn = $("slRun");
    if (!btn) { return; }
    var paused = !!(SL.views && SL.views.isPaused && SL.views.isPaused());
    var live = (core.state.conn === "open" || core.state.demo);
    var state = paused ? "paused" : (live ? "running" : "idle");
    btn.setAttribute("data-state", state);
    btn.setAttribute("aria-pressed", paused ? "true" : "false");
    btn.title = state === "running"
      ? "正在实时刷新 · 点击暂停（数据仍在后台缓冲）"
      : (state === "paused" ? "已暂停 · 点击继续实时刷新" : "未连接 / 未进入演示 · 点击可先暂停刷新");
    if ($("slRunLabel")) {
      $("slRunLabel").textContent = state === "running" ? "运行中" : (state === "paused" ? "已暂停" : "暂停");
    }
  }

  /* 一键恢复默认设置（顶栏入口 + 显示页签入口共用同一实现） */
  function restoreDefaults() {
    UI.confirm(
      "恢复默认设置",
      "将把串口参数、解析规则、发送工作流、通道、图表框与全部显示设置恢复默认，并清空本地存储。如需留存当前配置，请先用「数据」页签的「导出文件」备份。",
      "恢复默认"
    ).then(function (ok) {
      if (!ok) { return; }
      core.clearConfig();
      bootFromConfig();
      applyUiPrefs();
      renderPresets();
      if (SL.aichan && SL.aichan.reset) { SL.aichan.reset(); }
      UI.toast("ok", "已恢复默认设置");
    });
  }

  /* 开源协议预设按钮组 */
  function renderPresets() {
    var host = $("slPresetRow");
    if (!host) { return; }
    host.textContent = "";
    var list = core.presets ? core.presets() : [];
    var active = core.config.rule.active;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      var btn = el("button", "sl-preset" + ((p.kind === active) ? "" : ""));
      btn.type = "button";
      btn.setAttribute("data-preset", p.id);
      btn.title = p.note + "（示例：" + p.sample + "）";
      var n1 = el("span", "", p.name);
      var n2 = el("span", "sl-preset-brand", p.brand);
      btn.appendChild(n1);
      btn.appendChild(n2);
      host.appendChild(btn);
    }
    if ($("slPresetNote")) {
      $("slPresetNote").textContent = "点一下即套用社区事实标准的帧结构（会立即用缓存数据重放一次，当场看效果）；套用后仍可手动微调。完整的数据格式说明见介绍页「数据格式说明」一节。";
    }
  }

  function applyPreset(id) {
    var p = core.getPreset ? core.getPreset(id) : null;
    var rule = core.presetRule ? core.presetRule(id) : null;
    if (!p || !rule) { return; }
    core.config.rule = rule;
    core.saveConfig();
    refreshRuleInputs();
    renderPresets();
    core.emit("config:changed", { scope: "rule" });

    /* 规则换了，用缓存里的原始字节立刻重放一遍——不必让硬件重跑 */
    var res = (SL.app && SL.app.replayBuffered) ? SL.app.replayBuffered(5000) : null;
    if (res && res.ok) {
      UI.toast("ok", "已套用「" + p.name + "」，并按新规则重放 " + res.frames + " 帧", 6000);
    } else {
      UI.toast("ok", "已套用「" + p.name + "」。" + (res && res.reason ? res.reason : ""), 6000);
    }
    renderChannels();
  }

  /* 面向 AI 的「调试包」：一个自包含 JSON，整包丢给 AI 即可免去来回截图粘贴 */
  function exportDebugBundle() {
    if (!SL.exporters || !SL.exporters.debugBundle) {
      UI.toast("bad", "导出模块未就绪");
      return;
    }
    var bundle = SL.exporters.debugBundle({ samples: 400 });
    var text = JSON.stringify(bundle, null, 2);
    var name = "seriallab-debug-" + fmtMs(Date.now()) + ".json";
    var ok = U.download(new Blob([text], { type: "application/json" }), name);
    /* 同时把摘要塞进剪贴板，方便直接粘给 AI */
    copyText(bundle.brief || text.slice(0, 4000));
    if (ok) {
      UI.toast("ok", "已导出调试包（" + name + "）；简要摘要已复制到剪贴板，可直接粘给 AI", 8000);
    } else {
      UI.toast("warn", "下载被拦截，已把简要摘要复制到剪贴板");
    }
  }

  /* AI 通道状态：把「配置想做什么」与「实际在做什么」分开说清楚，
     免得又出现「界面说开了、其实没在跑」（与 A-77 同一类病）。 */
  function renderAiState() {
    var host = $("slAiChannelState");
    if (!host) { return; }
    if (!SL.aichan) { host.textContent = "通道状态：AI 通道模块未就绪"; return; }
    var st = SL.aichan.status();
    var f = st.file, h = st.http;
    var parts = [];
    parts.push("文件落盘 " + (f.active
      ? ("进行中（已写 " + f.count + " 笔 → " + f.name + "）")
      : (f.needsPick ? "待选择文件" : "未启用")));
    parts.push("HTTP 上报 " + (h.configured
      ? ("每 " + h.intervalMs + " ms → " + SL.aichan.inboxUrl() + "（已成功 " + h.count + " 次）")
      : "未启用"));
    if (f.error) { parts.push("文件错误：" + f.error); }
    if (h.error) { parts.push("上报错误：" + h.error); }
    host.textContent = "通道状态：" + parts.join(" · ");
  }

  /* 记录上限的「真实生效值」：读 datastore 实况，不读配置里的期望值——
     这正是 A-81 的教训（界面说 2 万，实际 5 千）。 */
  function renderRecordCapHint() {
    var host = $("slRecordCapHint");
    if (!host) { return; }
    var real = (SL.datastore && SL.datastore.rawCap) ? SL.datastore.rawCap() : 0;
    var now = (SL.datastore && SL.datastore.rawCount) ? SL.datastore.rawCount() : 0;
    var tmax = (SL.timeline && SL.timeline.maxFrames) ? SL.timeline.maxFrames() : 0;
    host.textContent = "实际生效：原始记录保留最近 " + real + " 条（当前已存 " + now +
      " 条），录制上限 " + tmax + " 帧。两者同源，由上面的「存档上限」一并控制。";
  }

  function wireDisplayPane() {
    /* 时间戳口径：绝对时刻 / 相对秒 —— 渲染层每帧现读配置，改完直接重绘即可 */
    addBind({
      el: "slTimeMode", path: "transport.timeMode", type: "select", scope: "transport",
      apply: function () { if (SL.views) { SL.views.redraw(); } }
    });

    addBind({
      el: "slDrawInterval", path: "ui.drawInterval", type: "num", scope: "ui",
      apply: function () { applyUiPrefs(); }
    });

    addBind({
      el: "slFontSize", path: "ui.fontSize", type: "num", scope: "ui",
      apply: function () { applyUiPrefs(); }
    });
    addBind({
      el: "slNumStyle", path: "ui.numStyle", type: "select", scope: "ui",
      apply: function () { if (SL.views) { SL.views.redraw(); } }
    });
    addBind({
      el: "slMarkFailed", path: "ui.markFailed", type: "chk", scope: "ui",
      apply: function () { if (SL.views) { SL.views.redraw(); } }
    });
    addBind({
      el: "slSyncChanHidden", path: "ui.syncChanHidden", type: "chk", scope: "ui",
      /* 切换同步口径会改变「哪些通道算隐藏」，必须立刻重绘所有图表框，
         否则要等下一个数据节拍（drawInterval）才看得到差别 */
      apply: function () { if (SL.views) { SL.views.redraw(); } }
    });
    addBind({
      el: "slScaleSplitHint", path: "ui.scaleSplitHint", type: "chk", scope: "ui",
      /* 只是「要不要提示」的开关，不需要重绘；关掉后已弹过的提示不受影响 */
      apply: function () {}
    });
    addBind({
      el: "slAutoRecord", path: "ui.autoRecord", type: "chk", scope: "ui",
      apply: function () {
        if (core.config.ui.autoRecord && SL.app && SL.app.ensureAutoRecord) {
          SL.app.ensureAutoRecord();
        }
      }
    });
    addBind({
      el: "slRecordCap", path: "ui.recordCap", type: "num", scope: "ui",
      apply: function () {
        /* 改上限要同时作用到「录制帧数」与「原始记录条数」——applyRecordCaps 是唯一入口 */
        if (SL.app && SL.app.applyRecordCaps) { SL.app.applyRecordCaps(); }
        renderRecordCapHint();
      }
    });

    $("slBtnFontReset").addEventListener("click", function () {
      core.config.ui.fontSize = 12;
      syncForms();
      applyUiPrefs();
      touch("ui");
      UI.toast("ok", "监视器字号已复位为 12px");
    });

    $("slBtnDebugBundle").addEventListener("click", exportDebugBundle);

    /* ---- 面向 AI 的四条通道 ----
       ① 复制提示词 ② 持续写本地文件 ③ HTTP 上报本地收件箱
       ④ 本地串口桥（不在界面里，见 _本地工具/serial-bridge）
       界面只做「开/关 + 状态显示」，具体行为都在 aichan.js（它不碰 DOM）。 */

    /* ① 复制提示词：aichan 只负责「造文本」，剪贴板走本层既有的 copyText()（含 DOM 兜底） */
    $("slBtnAiPrompt").addEventListener("click", function () {
      if (!SL.aichan || !SL.aichan.buildPrompt) { UI.toast("bad", "AI 通道模块未就绪"); return; }
      var text = SL.aichan.buildPrompt();
      if (!text) { UI.toast("bad", "调试包模块未就绪，无法生成提示词"); return; }
      copyText(text).then(function (ok) {
        if (ok) {
          UI.toast("ok", "已复制 AI 提示词（" + text.length + " 字符），直接粘给 AI 即可", 8000);
        } else {
          UI.toast("warn", "剪贴板不可用。请改用「导出 AI 调试包」，把文件拖进对话", 9000);
        }
      });
    });

    /* ② 持续写本地文件（Chromium 专用；文件句柄必须来自用户手势） */
    addBind({
      el: "slFileLog", path: "ai.fileLog", type: "chk", scope: "ai",
      apply: function () { if (SL.aichan) { SL.aichan.refresh(); } renderAiState(); }
    });

    $("slBtnFileLog").addEventListener("click", function () {
      if (!SL.aichan) { return; }
      if (SL.aichan.fileLogging()) {
        SL.aichan.stopFileLog().then(function () {
          core.config.ai.fileLog = false;
          syncForms();
          core.saveConfig();
          renderAiState();
          UI.toast("ok", "已停止写入本地文件");
        });
        return;
      }
      if (!SL.aichan.fileSupported()) {
        UI.toast("warn", "当前浏览器不支持 File System Access API，请改用下方 HTTP 上报通道", 9000);
        return;
      }
      SL.aichan.startFileLog().then(function (r) {
        if (r && r.ok) {
          core.config.ai.fileLog = true;
          syncForms();
          core.saveConfig();
          UI.toast("ok", "已开始写入 " + (r.name || "所选文件") + "，AI 可直接读这个文件", 9000);
        } else if (r && r.reason) {
          UI.toast("warn", "未开始落盘：" + r.reason, 9000);
        }
        renderAiState();
      });
    });

    /* ③ HTTP 上报本地收件箱（跨浏览器可用；失败只提示，不影响调试） */
    addBind({
      el: "slHttpPush", path: "ai.httpPush", type: "chk", scope: "ai",
      apply: function () {
        if (SL.aichan) { SL.aichan.refresh(); }
        renderAiState();
        if (core.config.ai && core.config.ai.httpPush) {
          UI.toast("info", "已开启 HTTP 上报。若一直失败，先确认本地收件箱在跑：python _本地工具/serial-inbox.py", 9000);
        }
      }
    });
    addBind({
      el: "slHttpPort", path: "ai.httpPort", type: "num", scope: "ai",
      apply: function () { if (SL.aichan) { SL.aichan.refresh(); } renderAiState(); }
    });

    core.on("ai:state", renderAiState);
    renderAiState();

    /* ④ 图表 PNG：波形也是「AI 能读的形式」，一张带标题与时刻的图省掉大半描述 */
    $("slBtnPngAll").addEventListener("click", function () {
      if (!SL.views || !SL.views.exportAllPng) { return; }
      SL.views.exportAllPng().then(function (r) {
        if (r && r.ok) {
          UI.toast("ok", "已导出 " + r.done + " 张图表图片" +
            (r.fail ? ("（另有 " + r.fail + " 个面板跳过：文本监视器/数据表格不是画布）") : ""), 7000);
        } else {
          UI.toast("warn", "没有可导出的画布图表（文本监视器与数据表格不能导出为图片）", 7000);
        }
      });
    });

    $("slBtnReplay").addEventListener("click", function () {
      var res = SL.app && SL.app.replayBuffered ? SL.app.replayBuffered(5000) : null;
      if (!res || !res.ok) {
        UI.toast("warn", (res && res.reason) || "没有可重放的缓存数据");
        return;
      }
      renderChannels();
      UI.toast("ok", "已按当前规则重放 " + res.frames + " 帧（扫描 " + res.scanned + " 条原始记录）", 6000);
    });

    $("slBtnRestoreDefaults").addEventListener("click", restoreDefaults);

    /* 预设按钮采用事件委托：按钮是动态生成的 */
    $("slPresetRow").addEventListener("click", function (e) {
      var t = e.target;
      while (t && t !== this && !(t.getAttribute && t.getAttribute("data-preset"))) { t = t.parentNode; }
      if (!t || t === this) { return; }
      applyPreset(t.getAttribute("data-preset"));
    });
  }

  /* ------------------------------------------------------------
     14) 能力检测与降级
     ------------------------------------------------------------ */
  function renderCapability() {
    var banner = $("slBanner");
    var why = $("slBannerWhy");
    if (T.isSupported()) {
      banner.className = "sl-banner";
      return;
    }
    banner.className = "sl-banner is-on";
    var reason = "";
    if (global.isSecureContext === false) {
      reason = "（检测到当前页面不是安全上下文：请用 https:// 或 http://localhost 打开）";
    } else if (!global.navigator || !("serial" in global.navigator)) {
      reason = "（未检测到 navigator.serial：当前浏览器内核不支持）";
    }
    if (why) { why.textContent = reason; }
    $("slBtnConnect").disabled = true;
  }

  /* ------------------------------------------------------------
     15) 输出区副标题（便于排障时一眼看出当前口径）
     ------------------------------------------------------------ */
  function renderVersion() {
    var box = $("slVersion");
    if (box) { box.textContent = "v" + UI.VERSION; }
  }

  /* ------------------------------------------------------------
     16) 配置 → 界面（含重启式同步）
     ------------------------------------------------------------ */
  function bootFromConfig() {
    /* 主题：先落定，避免图表用错配色 */
    UI.applyTheme(core.config.ui.theme || "auto");
    syncForms();
    renderRuleMode();
    renderFields();
    renderSendList("timed");
    renderSendList("triggers");
    renderSendList("presets");
    renderRecords();
    renderRecordState();
    renderChannels();
    renderPanelList();
    renderConn();
    renderLogs();
    /* 显示偏好（字号 / 节流 / 存档上限 / 左栏收起 / 运行圆标）与解析预设按钮 */
    applyUiPrefs();
    renderPresets();
  }

  /* ------------------------------------------------------------
     17) 总线订阅
     ------------------------------------------------------------ */
  function wireBus() {
    core.on("toast", function (p) {
      if (!p) { return; }
      UI.toast(p.level || "info", p.msg || "");
    });

    core.on("state", function () {
      renderConn();
      /* 暂停态存在 core.state.paused 里,任何入口(绿圆标 / 页签内开关)改了它都会走到这里;
         一并刷新「录制」页签的按钮文案,保证两处口径永远一致 */
      renderRecordState();
      refreshZeroState();
    });

    core.on("serial:state", function () {
      renderConn();
      if (core.state.conn === "open") {
        startSignalPoll();
        markResetWindow();
      } else if (core.state.conn === "idle" || core.state.conn === "error") {
        stopSignalPoll();
        renderSignals(null);
      }
    });

    core.on("serial:opened", function () { renderConn(); startSignalPoll(); markResetWindow(); });
    core.on("serial:closed", function () { stopSignalPoll(); renderSignals(null); renderConn(); });
    core.on("serial:error", function (p) {
      var msg = (p && p.error && p.error.message) || "串口错误";
      UI.toast("bad", msg);
    });
    core.on("serial:autoreconnect", function () {
      UI.toast("info", "正在尝试自动重连…");
      T.connect(core.config.transport)["catch"](function () { /* connect 内部已提示 */ });
    });

    /* 计数刷新（1 秒一次；不用每帧刷新 DOM）+ 乱码体检 + 收起态摘要 */
    setInterval(function () {
      /* 收起态摘要与连接状态无关：演示模式下也可能收起面板，所以放在提前 return 之前 */
      refreshPanelBriefs();
      refreshLegends();
      if (core.state.conn !== "open") { return; }
      $("slTxCount").textContent = T.stats.tx;
      $("slRxCount").textContent = T.stats.rx;
      garbleScan();
    }, 1000);

    core.on("channels", function () { renderChannels(); refreshLegends(); });
    core.on("data:clear", function () { renderChannels(); });

    core.on("panels:changed", function () { renderPanelList(); });

    core.on("timeline:record", function () { renderRecordState(); });
    core.on("timeline:progress", function () { renderRecordState(); });
    core.on("timeline:list", function () { renderRecords(); });
    core.on("timeline:freeze", function () { renderRecordState(); });
    core.on("timeline:play", function (p) {
      if (p && p.state === "start") { UI.toast("info", "回放中…（速度 " + p.speed + "×）"); }
    });

    /* 演示启动 → 若没有任何图表面板则自动补一个时域波形 */
    core.on("serial:opened", function (p) {
      if (p && p.demo) { ensureDemoWave(); }
    });

    core.on("log", function () {
      /* 日志列表不是热点，节流到 400ms 足够 */
      if (renderLogs._t) { return; }
      renderLogs._t = true;
      global.setTimeout(function () { renderLogs._t = false; renderLogs(); }, 400);
    });

    core.on("config:savefail", function (p) {
      if (p && p.quota) {
        UI.toast("bad", "本地存储已满，配置未能保存。请用「导出文件」备份后清理浏览器存储。", 9000);
      } else {
        UI.toast("warn", "配置保存失败（可能是隐私模式禁用了本地存储）");
      }
    });

    core.on("config:dirty", function () { touchLazy("panels"); });
  }

  /* ------------------------------------------------------------
     18) boot
     ------------------------------------------------------------ */
  var booted = false;

  UI.boot = function () {
    if (booted) { return; }
    booted = true;

    renderVersion();
    renderCapability();

    wireTop();
    wireStage();
    wireZeroState();
    /* V2.2.23：首屏也要按「当前页签」应用同屏规则。
       初始状态是 HTML 里的 class="sl-pane is-on" 定的，而 data-also 只在「点页签」时才生效 ——
       于是首屏「设备」只显示连接，看不到并进来的协议与通道，用户会以为没合并（实测就是这样）。
       这里直接派发一次当前页签的 click，复用同一段逻辑，绝不在两处各写一份同屏规则。 */
    var tabOn = document.querySelector("#slTabs .sl-tab.is-on");
    if (tabOn && tabOn.click) { tabOn.click(); }
    wireConnectionBar();
    wireDeviceAndShow();
    wireV223();
    initPanelQuick();
    /* V2.2.17：低频组折叠要在 foldStaticHints **之前**做——这样组标题上的
       顺序是「折叠三角 → ?」，而不是反过来（三角是组的总开关，该排在前面）。
       两者互不干扰：折叠只加类，说明折叠只挪节点。 */
    wireFoldGroups();
    /* V2.2.16：必须在动态列表渲染之前调用——那时组里只有静态说明，
       「父节点是 .sl-group」这条判据才能干净地把动态空态提示排除掉。
       tooltip 走的是 closest("[data-tip]") 事件委托，所以与 initTooltips 的先后无关。 */
    foldStaticHints();
    wireTestPane();
    wireV226();
    initTooltips();
    wireHexRuleInputs();
    wireParsePane();
    wireChannelsPane();
    wireSendPane();
    wirePluginsPane();
    wireTimelinePane();
    wireDataPane();
    wireSendBar();
    wireDisplayPane();
    wireBus();

    $("slModalClose").addEventListener("click", UI.closeModal);
    $("slModal").addEventListener("click", function (e) {
      if (e.target === this) { UI.closeModal(); }
    });
    /* V2.2.17：命令面板的两个入口（顶栏按钮 + Ctrl+K）指向同一个 UI.palette，
       不各写一份逻辑。 */
    var palBtn = $("slBtnPalette");
    if (palBtn) {
      palBtn.addEventListener("click", function () { UI.palette(); });
    }
    /* V2.2.21：协议分析入口（顶栏按钮 + 命令面板里的同一条命令都点到这个按钮上） */
    var protoBtn = $("slBtnProto");
    if (protoBtn) {
      protoBtn.addEventListener("click", function () { openProtocol(); });
    }
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && UI.isModalOpen()) { UI.closeModal(); return; }
      onAppShortcut(e);   /* 带 Ctrl/Cmd 的那批 */
      onGlobalKey(e);     /* 无修饰键的预设单键 + 空格暂停 */
    });

    /* 系统主题变化：仅在「跟随系统」时需要重画 */
    if (global.matchMedia) {
      var mq = global.matchMedia("(prefers-color-scheme: dark)");
      var onChange = function () {
        if ((core.config.ui.theme || "auto") === "auto") { UI.applyTheme("auto"); }
      };
      if (mq.addEventListener) { mq.addEventListener("change", onChange); }
      else if (mq.addListener) { mq.addListener(onChange); }
    }

    renderPluginTypes();
    bootFromConfig();
    renderConn();
  };

  SL.ui = UI;
})(typeof window !== "undefined" ? window : globalThis);
