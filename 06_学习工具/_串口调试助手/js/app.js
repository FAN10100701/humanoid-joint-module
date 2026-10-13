/* ============================================================
   网页端串口调试助手 · SerialLab
   模块：app（唯一编排者）
   职责：装配数据管线并启动应用；对外只暴露 SL.app.send / sendPreset / syncSend。
   依赖：全部模块（本模块是唯一的“顶层”，其余模块一律不依赖它）
   单向数据流（别绕开它，绕开就会出现“图上没数据”这类难查问题）：
     接收：transport serial:data → 本模块分帧 → parser 解析
           → datastore.pushFrame（自动建通道） + pushRaw → emit "frame"
           → views/plugins 节流重绘，timeline 录制
     发送：ui/发送引擎 → SL.app.send → transport.write（写队列串行化）
   分帧策略：
     - 文本模式：codec.splitLines 按 \n / \r\n / \r 切行
     - HEX 模式：codec.extractFrames 按帧头 / 帧尾 / 长度字段定界
     - 两种模式的残留字节都用「静默超时」兜底（LINGER_MS 内没有新数据就当成一帧），
       这样没有换行的裸流、被切断的残帧也能在监视器里看到，而不是无声无息地堆着
   ============================================================ */
;(function (global) {
  "use strict";

  var SL = global.SerialLab = global.SerialLab || {};
  var U = SL.util;
  var core = SL.core;
  var C = SL.codec;
  var Parser = SL.parser;
  var Store = SL.datastore;
  var Tpt = SL.transport;
  var Views = SL.views;
  var Timeline = SL.timeline;

  var App = {};

  /* 静默多少毫秒后把残留字节当作一帧（裸流/残帧兜底） */
  var LINGER_MS = 60;
  var LINGER_TICK = 40;

  var rxPending = null;      /* Uint8Array，尚未成帧的残留字节 */
  var rxLastAt = 0;
  var lingerTimer = null;

  /* 发送引擎状态 */
  var timedTimers = {};      /* id -> setInterval */
  var presetWaits = {};      /* id -> {until, timer} */
  var lastPresetResult = null;

  /* ------------------------------------------------------------
     1) 时间戳显示
     ------------------------------------------------------------ */
  var t0 = U.now();

  function tLabel(t) {
    var ms = t - t0;
    var s = ms / 1000;
    return s.toFixed(3) + "s";
  }

  function fmtNum(v, digits) {
    if (typeof v !== "number" || !isFinite(v)) { return "—"; }
    var d = (typeof digits === "number") ? digits : 3;
    return v.toFixed(d);
  }

  /* ------------------------------------------------------------
     2) 当前生效的解析规则（从配置快照出来，避免半路被改）
     ------------------------------------------------------------ */
  function currentMode() {
    return core.config.rule.active === "hex" ? "hex" : "text";
  }

  /* 传给 codec.extractFrames 的定界规则
     注意：checksum 必须一起传——帧长公式要靠它加上校验和占用的字节数，
     否则「帧头 + 长度字段 + 载荷 + 校验和」的帧永远收不齐（演示帧 AA55 就是这种）。 */
  function frameRule() {
    var h = core.config.rule.hex;
    return {
      head: h.head || "",
      tail: h.tail || "",
      len: h.len || { offset: 0, size: 0, mode: "none" },
      checksum: h.checksum || { type: "none" },
      maxLen: 4096
    };
  }

  /* 传给 parser.parseHexFrame 的字段表规则 */
  function fieldRule() {
    var h = core.config.rule.hex;
    return { fields: h.fields || [], checksum: h.checksum || { type: "none" } };
  }

  function resetFraming() {
    rxPending = null;
    rxLastAt = 0;
  }

  /* ------------------------------------------------------------
     3) 记录与入库
     ------------------------------------------------------------ */
  /* 原始记录（监视器显示 / 导出）：
     { t, tLabel, dir, text, hex, values, ok, reason, partial } */
  function pushRecord(rec) {
    Store.pushRaw(rec);
    core.emit("raw", rec);
  }

  /* 接收侧一行/一帧：进原始记录 + 进数据仓（值里出现的键会自动建通道） */
  function ingestRxText(line, t, dir, rawBytes) {
    var enc = core.config.transport.encoding || "utf-8";
    var bytes = rawBytes || C.encodeText(line, enc);
    var parsed = Parser.parseText(line, core.config.rule.text);
    var values = parsed.values || {};

    pushRecord({
      t: t, tLabel: tLabel(t), dir: dir, text: line,
      hex: U.bytesToHex(bytes), values: values, ok: true
    });

    Store.pushFrame({
      t: t, dir: dir, raw: bytes, text: line, values: values,
      rule: "text", source: "local"
    });
  }

  function ingestHexFrame(u8, t, partial) {
    var enc = core.config.transport.encoding || "utf-8";
    var parsed = Parser.parseHexFrame(u8, fieldRule());
    var dec = C.decodeText(u8, enc);
    var values = parsed.values || {};
    var hasValues = false;
    for (var k in values) {
      if (Object.prototype.hasOwnProperty.call(values, k)) { hasValues = true; break; }
    }

    pushRecord({
      t: t, tLabel: tLabel(t), dir: "rx",
      text: dec.text, hex: U.bytesToHex(u8), values: values,
      ok: parsed.ok, reason: parsed.reason, partial: !!partial,
      checksum: parsed.checksum
    });

    if (hasValues) {
      Store.pushFrame({
        t: t, dir: "rx", raw: u8, text: dec.text, values: values,
        rule: "hex", source: "local"
      });
    }
  }

  /* 发送侧：只进原始记录（绝不把「我发出去的值」灌进通道，否则曲线会被自己污染） */
  function ingestTx(u8, label) {
    var t = U.now();
    var enc = core.config.transport.encoding || "utf-8";
    var dec = C.decodeText(u8, enc).text;
    var text = label ? (label + " " + dec) : dec;

    var parsed = currentMode() === "text"
      ? Parser.parseText(dec, core.config.rule.text)
      : { values: {} };

    pushRecord({
      t: t, tLabel: tLabel(t), dir: "tx", text: text,
      hex: U.bytesToHex(u8), values: parsed.values || {}, ok: true
    });

    /* values 传空对象：datastore 只在 dir === "tx" 时仍会 emit "frame"，
       这样录制与时间线能记录到发送动作，却不会建出通道 */
    Store.pushFrame({ t: t, dir: "tx", raw: u8, text: text, values: {}, source: "local" });
  }

  /* ------------------------------------------------------------
     4) 接收分帧
     ------------------------------------------------------------ */
  function drainText(force) {
    var enc = core.config.transport.encoding || "utf-8";
    var res = C.splitLines(rxPending || new Uint8Array(0), new Uint8Array(0), enc);
    rxPending = res.rest && res.rest.length ? res.rest : null;

    var t = U.now();
    for (var i = 0; i < res.lines.length; i++) {
      ingestRxText(res.lines[i], t, "rx", null);
    }
    if (force && rxPending && rxPending.length) {
      /* 没有换行的裸流：残段也当一行送出去，否则监视器会永远空着 */
      var dec = C.decodeText(rxPending, enc);
      ingestRxText(dec.text, t, "rx", rxPending);
      rxPending = null;
    }
  }

  function drainHex(force) {
    var res = C.extractFrames(rxPending || new Uint8Array(0), new Uint8Array(0), frameRule());
    rxPending = res.rest && res.rest.length ? res.rest : null;

    var t = U.now();
    for (var i = 0; i < res.frames.length; i++) {
      ingestHexFrame(res.frames[i], t, false);
    }
    if (force && rxPending && rxPending.length) {
      /* 残帧：仍然显示出来并标记，总比默默丢掉强 —— 排障时残帧长度本身就是线索 */
      var partial = rxPending;
      rxPending = null;
      ingestHexFrame(partial, t, true);
    }
  }

  function onSerialData(u8) {
    if (!u8 || !u8.length) { return; }
    rxPending = C.concat(rxPending, u8);
    rxLastAt = U.now();
    if (currentMode() === "hex") { drainHex(false); } else { drainText(false); }
  }

  function lingerTick() {
    if (!rxPending || !rxPending.length) { return; }
    if (U.now() - rxLastAt < LINGER_MS) { return; }
    if (currentMode() === "hex") { drainHex(true); } else { drainText(true); }
  }

  /* ------------------------------------------------------------
     5) 发送引擎
     ------------------------------------------------------------ */
  /* 统一发送入口：ui 与预设/定时/触发都走这里 */
  App.send = function (str, opts) {
    opts = opts || {};
    if (!Tpt.isOpen()) {
      SL.ui.toast("warn", "未连接设备，无法发送");
      return false;
    }
    if (Tpt.isResetting() && !core.state.demo) {
      SL.ui.toast("warn", "设备正在复位，请稍候再发送");
      return false;
    }

    var t = core.config.transport;
    var wantHex = (opts.hex !== undefined) ? !!opts.hex : !!t.hexSend;
    var u8;

    if (wantHex) {
      var bytes = U.hexToBytes(str);
      if (!bytes) {
        SL.ui.toast("bad", "HEX 内容非法：需要偶数位十六进制，例如 AA 55 01");
        return false;
      }
      if (!bytes.length) { return false; }
      u8 = bytes;
    } else {
      var body = String(str === null || str === undefined ? "" : str);
      var append = (opts.appendLineEnding !== undefined) ? !!opts.appendLineEnding : !!t.appendLineEnding;
      var ending = (opts.lineEnding !== undefined) ? opts.lineEnding : t.lineEnding;
      if (append && ending) { body += ending; }
      u8 = C.encodeText(body, t.encoding || "utf-8");
      if (!u8.length) { return false; }
    }

    ingestTx(u8, opts.label || "");

    if (core.state.demo) {
      /* 演示模式：没有真实设备，把发出去的字节回显一遍，
         这样「发送 → 解析 → 绘图」整条链路在没有硬件时也能被验证 */
      global.setTimeout(function () {
        if (!core.state.demo) { return; }
        onSerialData(u8.slice(0));
      }, 30);
      return true;
    }

    Tpt.write(u8)["catch"](function () { /* transport 内部已记录并提示 */ });
    return true;
  };

  /* 预设发送：可带期望回包 + 超时提示，常用于「发指令→等应答」的调试节奏 */
  App.sendPreset = function (id) {
    var list = core.config.send.presets || [];
    var p = null;
    for (var i = 0; i < list.length; i++) { if (list[i].id === id) { p = list[i]; } }
    if (!p) { return false; }
    if (p.enabled === false) { SL.ui.toast("warn", "该预设项已停用"); return false; }

    var name = p.name || p.text || "预设";
    var ok = App.send(p.text, { hex: !!p.hex, appendLineEnding: !p.hex, label: "[" + name + "]" });
    if (!ok) { return false; }

    var expect = String(p.expect || "").replace(/^\s+|\s+$/g, "");
    if (!expect) { return true; }

    var waitMs = (typeof p.waitMs === "number" && p.waitMs > 0) ? p.waitMs : 1000;
    clearPresetWait(id);
    var timer = global.setTimeout(function () {
      presetWaits[id] = null;
      lastPresetResult = { id: id, name: name, ok: false, expect: expect };
      SL.ui.toast("warn", "「" + name + "」等待回包超时（" + waitMs + "ms 内未出现「" + expect + "」）", 6000);
      core.log("warn", "预设「" + name + "」等待回包超时：" + expect);
      core.emit("send:preset-result", lastPresetResult);
    }, waitMs);

    presetWaits[id] = { expect: expect, name: name, timer: timer, at: U.now() };
    SL.ui.toast("info", "已发送「" + name + "」，等待回包「" + expect + "」（≤" + waitMs + "ms）");
    return true;
  };

  function clearPresetWait(id) {
    var w = presetWaits[id];
    if (w && w.timer) { clearTimeout(w.timer); }
    delete presetWaits[id];
  }

  function checkPresetExpect(text) {
    if (!text) { return; }
    for (var id in presetWaits) {
      if (!Object.prototype.hasOwnProperty.call(presetWaits, id)) { continue; }
      var w = presetWaits[id];
      if (!w) { continue; }
      if (String(text).indexOf(w.expect) >= 0) {
        clearTimeout(w.timer);
        var ms = Math.round(U.now() - w.at);
        delete presetWaits[id];
        lastPresetResult = { id: id, name: w.name, ok: true, expect: w.expect, ms: ms };
        SL.ui.toast("ok", "「" + w.name + "」收到期望回包（" + ms + "ms）");
        core.emit("send:preset-result", lastPresetResult);
      }
    }
  }

  /* 定时轮询：与配置对账式同步（增删改都能自动收敛，不用手工重建计时器） */
  App.syncSend = function () {
    var list = core.config.send.timed || [];
    var want = {};

    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      if (!it || it.enabled === false) { continue; }
      var text = String(it.text === undefined ? "" : it.text);
      if (!text) { continue; }
      var iv = (typeof it.intervalMs === "number" && it.intervalMs >= 20) ? it.intervalMs : 1000;
      want[it.id] = { item: it, interval: iv, key: iv + "|" + (it.hex ? 1 : 0) + "|" + text };
    }

    /* 撤掉不再需要的 / 参数变了的 */
    for (var id in timedTimers) {
      if (!Object.prototype.hasOwnProperty.call(timedTimers, id)) { continue; }
      var cur = timedTimers[id];
      if (!want[id] || want[id].key !== cur.key) {
        clearInterval(cur.timer);
        delete timedTimers[id];
      }
    }

    /* 新建缺失的 */
    for (var id2 in want) {
      if (!Object.prototype.hasOwnProperty.call(want, id2)) { continue; }
      if (timedTimers[id2]) { continue; }
      (function (wid, w) {
        timedTimers[wid] = {
          key: w.key,
          timer: setInterval(function () {
            /* 每拍都重新读配置：这样用户改了内容/间隔，下一次发送就是新值 */
            if (!Tpt.isOpen()) { return; }
            if (core.state.paused) { return; }   /* 冻结显示时暂停轮询，避免堆积 */
            App.send(w.item.text, { hex: !!w.item.hex, appendLineEnding: !w.item.hex, label: "[轮询]" });
          }, w.interval)
        };
      })(id2, want[id2]);
    }

    var count = 0;
    for (var k in timedTimers) {
      if (Object.prototype.hasOwnProperty.call(timedTimers, k)) { count++; }
    }
    return count;
  };

  App.stopAllTimed = function () {
    for (var id in timedTimers) {
      if (Object.prototype.hasOwnProperty.call(timedTimers, id)) { clearInterval(timedTimers[id].timer); }
    }
    timedTimers = {};
  };

  /* 触发应答：接收内容里出现「匹配」就自动回「应答」
     防跑飞：单条规则 250ms 冷却 + 全局每秒最多 30 次自动发送。
     没有这层护栏时，「应答内容里又包含匹配词」会让收发互相点火，瞬间把串口打满。 */
  var TRIG_COOLDOWN = 250;
  var trigLast = {};
  var autoSendCount = 0;
  var autoSendWindow = 0;

  function allowAutoSend() {
    var t = U.now();
    if (t - autoSendWindow > 1000) { autoSendWindow = t; autoSendCount = 0; }
    autoSendCount++;
    if (autoSendCount > 30) {
      if (autoSendCount === 31) {
        core.log("warn", "自动发送过于频繁（>30 次/秒），已临时限流——请检查触发规则是否互相点火");
        SL.ui.toast("warn", "自动发送已限流：请检查触发规则的匹配词与应答内容是否互相触发", 8000);
      }
      return false;
    }
    return true;
  }

  function checkTriggers(text) {
    if (!text) { return; }
    var list = core.config.send.triggers || [];
    for (var i = 0; i < list.length; i++) {
      var g = list[i];
      if (!g || g.enabled === false) { continue; }
      var m = String(g.match === undefined ? "" : g.match);
      if (!m) { continue; }
      if (String(text).indexOf(m) < 0) { continue; }
      var reply = String(g.reply === undefined ? "" : g.reply);
      if (!reply) { continue; }

      var now = U.now();
      var last = trigLast[g.id] || 0;
      if (now - last < TRIG_COOLDOWN) { continue; }
      if (!allowAutoSend()) { return; }
      trigLast[g.id] = now;

      App.send(reply, { hex: !!g.hex, appendLineEnding: !g.hex, label: "[触发]" });
    }
  }

  /* ------------------------------------------------------------
     6) 事件装配
     ------------------------------------------------------------ */
  function wirePipeline() {
    core.on("serial:data", onSerialData);

    /* 每一条接收记录都要过一遍预设回包检测与触发应答 */
    core.on("raw", function (rec) {
      if (!rec || rec.dir !== "rx") { return; }
      var probe = rec.text || "";
      if (!probe && rec.hex) { probe = rec.hex; }
      checkPresetExpect(probe);
      checkTriggers(probe);
    });

    /* 规则/口径变了就丢弃残留字节，避免用新旧两套规则拼半帧 */
    core.on("config:changed", function (p) {
      var scope = p && p.scope;
      if (scope === "rule" || scope === "all") { resetFraming(); }
      if (scope === "send" || scope === "all") { App.syncSend(); }
    });

    /* 断开连接时清空残留与计时器，重连后从干净状态开始 */
    core.on("serial:closed", function () {
      resetFraming();
      App.stopAllTimed();
    });

    /* 连接建立后按当前配置拉起定时轮询 */
    core.on("serial:opened", function () { App.syncSend(); });

    if (lingerTimer) { clearInterval(lingerTimer); }
    lingerTimer = setInterval(lingerTick, LINGER_TICK);
  }

  /* ------------------------------------------------------------
     7) 启动
     ------------------------------------------------------------ */
  App.boot = function () {
    /* a) 装载配置（migrate 保证旧草稿也能起来） */
    core.config = core.loadConfig();
    if (!core.config.ui) { core.config.ui = { theme: "auto", layout: [], leftWidth: 340 }; }
    if (!core.config.transport) { core.config.transport = {}; }
    if (!core.config.rule) { core.config.rule = {}; }
    if (!core.config.send) { core.config.send = { timed: [], triggers: [], presets: [] }; }

    /* 恢复通道元数据（标签/单位/颜色/精度），让图表配色与上次一致 */
    if (core.config.channels && core.config.channels.length) {
      Store.restore(core.config.channels);
    }

    /* b) 传输层（内部会做能力探测与状态机初始化） */
    Tpt.init();

    /* c) 工作区视图（按配置恢复面板；没有配置时给默认面板） */
    var grid = document.getElementById("slGrid");
    if (grid) {
      Views.init(grid, { drawInterval: 40 });
      Views.start();
    }

    /* d) 数据管线与发送引擎 */
    wirePipeline();
    App.syncSend();

    /* e) 界面最后启动（它会读配置把控件一次性同步到位） */
    SL.ui.boot();

    /* f) 配置变化就落盘，保证刷新不丢 */
    core.on("panels:changed", function () { core.saveConfig(); });
    global.addEventListener("beforeunload", function () {
      App.stopAllTimed();
      core.saveConfig();
    });

    core.log("info", "SerialLab 已启动（" + (Tpt.isSupported() ? "检测到 Web Serial" : "未检测到 Web Serial，可用演示模式") + "）");
  };

  /* 对外只暴露必要接口；ui/其它模块通过 SL.app 请求发送 */
  App.stats = function () {
    return {
      rx: Tpt.stats.rx,
      tx: Tpt.stats.tx,
      frames: Store.totalFrames(),
      raw: Store.rawCount(),
      channels: Store.listChannels().length,
      panels: Views.count ? Views.count() : 0,
      mode: currentMode(),
      conn: core.state.conn,
      demo: core.state.demo
    };
  };

  App.lastPresetResult = function () { return lastPresetResult; };

  SL.app = App;

  /* ------------------------------------------------------------
     8) 自动启动（DOM 就绪后）
     ------------------------------------------------------------ */
  function ready() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", App.boot);
    } else {
      App.boot();
    }
  }
  ready();

  /* UMD 尾：校验脚本可加载（本模块依赖 DOM，只做加载性检查） */
  if (typeof module !== "undefined" && module.exports) { module.exports = SL.app; }
})(typeof window !== "undefined" ? window : globalThis);
