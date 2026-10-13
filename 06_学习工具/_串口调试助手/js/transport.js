/* ============================================================
   网页端串口调试助手 · SerialLab
   模块：transport（传输层）
   职责：Web Serial 连接管理（连接 / 断开 / 参数变更 / 手动信号 / 调制解调器信号）、
         字节收发管线、内置演示数据源。
   依赖：core、util、codec
   关键设计（都是踩过坑才总结出来的，别随手改）：
     - requestPort() 必须在真实用户手势里调用，否则浏览器直接拒绝
     - 改波特率必须关端口重开（不能热改），所以有 250ms 去抖
     - 读循环退出时释放顺序固定：reader.cancel → reader.releaseLock → writer.releaseLock → port.close
     - epoch（递增代次）+ keepReading/disconnecting 标志共同防竞态：
       断开与重连交叠时，旧读循环必须自己认出「我已经过期了」并静默退出
     - 开硬流控时不再手动设 RTS，否则两者打架
     - Arduino / ESP 打开串口会因 DTR 拉低自动复位：连上后一段时间内禁止发送
   本模块只负责「把收到的字节广播出去」；分帧与解析由 app.js 装配的管线完成，
   因此演示数据源和真实串口走的是同一条下游路径，测试覆盖才有意义。
   ============================================================ */
;(function (global) {
  "use strict";

  var SL = global.SerialLab = global.SerialLab || {};
  var U = SL.util;
  var core = SL.core;

  var T = {};

  var READ_CHUNK_TIMEOUT = 0;   /* 预留：读超时（0=不限） */
  var RECONNECT_DELAY = 1200;   /* 自动重连间隔 */
  var REOPEN_DEBOUNCE = 250;    /* 参数变更后重开的去抖 */

  /* ---------------- 运行时状态 ---------------- */
  var epoch = 0;                /* 连接代次，每次连接/断开自增 */
  var keepReading = false;
  var disconnecting = false;
  var currentReader = null;
  var readDone = null;
  var writeChain = Promise.resolve();
  var demoTimer = null;
  var demoMode = "text";
  var resetUntil = 0;           /* 复位等待截止时间（此时间前不建议发送） */
  var reopenTimer = null;
  var autoReconnectTimer = null;

  T.stats = { rx: 0, tx: 0 };

  function noop() {}
  function delay(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }

  /* ------------------------------------------------------------
     1) 连接状态机（纯函数，可被校验脚本与 E2E 直接断言）
     ------------------------------------------------------------ */
  T.stateMachine = (function () {
    var TABLE = {
      unsupported: { INIT: "unsupported" },
      idle: { REQUEST: "requesting", DEMO: "open" },
      requesting: { GRANTED: "opening", DENIED: "idle", CANCEL: "idle" },
      opening: { OPENED: "open", FAIL: "error", ABORT: "closing" },
      open: { CLOSE: "closing", LOST: "error", FAIL: "error" },
      closing: { CLOSED: "idle", FAIL: "idle" },
      error: { RESET: "idle" }
    };
    return {
      states: ["unsupported", "idle", "requesting", "opening", "open", "closing", "error"],
      /* 初始状态：只看环境是否支持 Web Serial */
      initial: function (supported) { return supported ? "idle" : "unsupported"; },
      /* 迁移：非法事件返回原状态（不抛异常，状态机永远可用） */
      next: function (state, ev) {
        var row = TABLE[state];
        if (!row) { return "idle"; }
        return row[ev] || state;
      }
    };
  })();

  T.isSupported = function () {
    return U.hasSerialApi();
  };

  T.state = function () { return core.state.conn; };

  T.isOpen = function () {
    return core.state.conn === "open" && (!!core.state.port || core.state.demo);
  };

  function setState(s) {
    var prev = core.state.conn;
    if (prev === s) { return; }
    core.set("conn", s);
    core.emit("serial:state", { from: prev, to: s });
    SL.core.log("info", "连接状态：" + prev + " → " + s);
  }

  /* ------------------------------------------------------------
     2) 参数映射
     ------------------------------------------------------------ */
  function buildOpenOptions(t) {
    return {
      baudRate: t.baudRate || 115200,
      dataBits: t.dataBits || 8,
      stopBits: t.stopBits || 1,
      parity: t.parity || "none",
      flowControl: t.flow === "hardware" ? "hardware" : "none",
      bufferSize: t.bufferSize || 4096
    };
  }

  T.buildOpenOptions = buildOpenOptions;

  /* 复位等待是否仍在进行 */
  T.isResetting = function () { return U.now() < resetUntil; };

  /* ------------------------------------------------------------
     3) 读循环
     ------------------------------------------------------------ */
  function readLoop(port, myEpoch) {
    keepReading = true;
    var reader = port.readable.getReader();
    currentReader = reader;

    var done = new Promise(function (resolve) {
      (function step() {
        reader.read().then(function (r) {
          if (!r || r.done) { resolve(); return; }
          if (r.value && r.value.length) {
            /* 过期代次的读循环即使还有数据在飞也不再往下游送 */
            if (myEpoch === epoch) {
              T.stats.rx += r.value.length;
              core.emit("serial:data", r.value);
            }
          }
          if (keepReading && myEpoch === epoch) { step(); }
          else { resolve(); }
        }, function () {
          /* 端口热拔 / close 期间 read 会 reject，按正常收尾处理 */
          resolve();
        });
      })();
    });

    readDone = done.then(function () {
      /* 释放顺序第 1、2 步：cancel 打断挂起的 read，再释放读锁 */
      return Promise.resolve().then(function () { return reader.cancel(); })["catch"](noop);
    }).then(function () {
      try { reader.releaseLock(); } catch (e) { /* 已释放则忽略 */ }
      if (currentReader === reader) { currentReader = null; }
    });

    return readDone;
  }

  /* ------------------------------------------------------------
     4) 连接 / 断开
     ------------------------------------------------------------ */
  T.connect = function (settings) {
    if (!T.isSupported()) {
      return Promise.reject(new Error("当前浏览器不支持 Web Serial（需要 Chromium 内核 + HTTPS 或 localhost）"));
    }
    if (core.state.conn === "open" || core.state.conn === "opening" || core.state.conn === "requesting") {
      return Promise.reject(new Error("端口已打开或正在打开"));
    }

    var cfg = settings || core.config.transport;
    var myEpoch = ++epoch;
    var port = null;

    setState("requesting");

    return navigator.serial.requestPort().then(function (p) {
      if (myEpoch !== epoch) {
        /* 用户在弹出的授权框停留期间又点了断开：丢弃这个端口 */
        try { p.close && p.close(); } catch (e) { /* 未打开，忽略 */ }
        return null;
      }
      port = p;
      setState("opening");
      return port.open(buildOpenOptions(cfg)).then(function () { return port; });
    }).then(function (opened) {
      if (!opened) { return; }
      if (myEpoch !== epoch) {
        return opened.close()["catch"](noop);
      }

      core.set("port", opened);
      core.set("demo", false);
      try { core.set("portInfo", opened.getInfo ? opened.getInfo() : null); }
      catch (e2) { core.set("portInfo", null); }

      readLoop(opened, myEpoch);

      /* DTR 复位窗口 */
      var waitMs = (cfg && typeof cfg.resetWaitMs === "number") ? cfg.resetWaitMs : 1500;
      resetUntil = U.now() + waitMs;

      setState("open");
      core.emit("serial:opened", { port: opened });
      return opened;
    })["catch"](function (err) {
      var msg = (err && err.message) || String(err);
      core.set("lastError", msg);
      /* 用户在授权框点取消是正常操作，不算错误 */
      var isCancel = err && (err.name === "NotFoundError" || /No port selected/i.test(msg));
      if (isCancel) {
        core.log("info", "已取消设备选择");
        setState("idle");
      } else {
        core.log("error", "连接失败：" + msg);
        core.emit("serial:error", { phase: "connect", error: err });
        setState("error");
        setState("idle");
      }
      throw err;
    });
  };

  T.disconnect = function () {
    var port = core.state.port;
    var wasDemo = core.state.demo;

    /* 通知状态机开始收尾 */
    if (core.state.conn === "open" || core.state.conn === "error") { setState("closing"); }

    disconnecting = true;
    keepReading = false;
    epoch++;                        /* 关键：让旧读循环自认过期 */
    core.set("port", null);
    core.set("demo", false);
    resetUntil = 0;

    if (wasDemo) { T.stopDemo(); }
    if (autoReconnectTimer) { clearTimeout(autoReconnectTimer); autoReconnectTimer = null; }

    /* 主动 cancel 打断挂起的 read，读循环随即走完释放流程 */
    if (currentReader) {
      try { currentReader.cancel(); } catch (e) { /* 忽略 */ }
    }

    var wait = readDone || Promise.resolve();
    return wait["catch"](noop).then(function () {
      if (!port) { return null; }
      /* 释放顺序第 3、4 步：writable 由 write() 自行释放；此处关端口 */
      return port.close();
    })["catch"](function (e) {
      core.log("warn", "关闭端口异常：" + ((e && e.message) || e));
      return null;
    }).then(function () {
      disconnecting = false;
      core.set("portInfo", null);
      setState("idle");
      core.emit("serial:closed", {});
    });
  };

  T.toggle = function (settings) {
    if (core.state.conn === "open") { return T.disconnect(); }
    return T.connect(settings);
  };

  /* 参数变更：关端口 → 去抖 → 重开（波特率类参数只能这样生效） */
  T.reopen = function (delayMs) {
    if (!core.state.port) { return Promise.resolve(); }
    var d = (typeof delayMs === "number") ? delayMs : REOPEN_DEBOUNCE;
    if (reopenTimer) { clearTimeout(reopenTimer); }
    return new Promise(function (resolve) {
      reopenTimer = setTimeout(function () {
        reopenTimer = null;
        var cfg = core.config.transport;
        T.disconnect().then(function () {
          return delay(60).then(function () { return T.connect(cfg); });
        }).then(function () { resolve(true); }, function () { resolve(false); });
      }, d);
    });
  };

  /* ------------------------------------------------------------
     5) 发送
     ------------------------------------------------------------ */
  T.write = function (u8) {
    if (!u8 || !u8.length) { return Promise.resolve(); }
    if (!core.state.port) { return Promise.reject(new Error("未连接设备")); }

    writeChain = writeChain.then(function () {
      var port = core.state.port;
      if (!port || !port.writable) { throw new Error("端口不可写"); }
      var w = port.writable.getWriter();
      return w.write(u8).then(function () {
        try { w.releaseLock(); } catch (e) { /* 忽略 */ }
        T.stats.tx += u8.length;
        core.emit("serial:tx", u8);
      }, function (err) {
        try { w.releaseLock(); } catch (e) { /* 忽略 */ }
        throw err;
      });
    })["catch"](function (err) {
      core.log("error", "发送失败：" + ((err && err.message) || err));
      core.emit("serial:error", { phase: "write", error: err });
      /* 单笔失败不阻塞后续发送 */
    });

    return writeChain;
  };

  /* 文本发送（自动按配置编码、按需追加行结束符） */
  T.sendText = function (str, opts) {
    opts = opts || {};
    var t = core.config.transport;
    var enc = opts.encoding || t.encoding || "utf-8";
    var body = String(str === null || str === undefined ? "" : str);

    var useHex = (opts.hex !== undefined) ? opts.hex : t.hexSend;
    var payload;
    if (useHex) {
      var bytes = U.hexToBytes(body);
      if (!bytes) { return Promise.reject(new Error("HEX 内容非法（需偶数位十六进制，如 AA 55 01）")); }
      payload = bytes;
    } else {
      var append = (opts.appendLineEnding !== undefined) ? opts.appendLineEnding : t.appendLineEnding;
      var ending = (opts.lineEnding !== undefined) ? opts.lineEnding : t.lineEnding;
      var text = body;
      if (append && ending) { text += ending; }
      payload = SL.codec.encodeText(text, enc);
    }
    return T.write(payload);
  };

  /* ------------------------------------------------------------
     6) 手动信号与调制解调器信号
     ------------------------------------------------------------ */
  T.setSignals = function (sig) {
    var port = core.state.port;
    if (!port || !port.setSignals) { return Promise.resolve(false); }
    var t = core.config.transport;
    var opts = {};
    if (typeof sig.dtr === "boolean") { opts.dataTerminalReady = sig.dtr; }
    /* 开硬流控时 RTS 由硬件掌管，不再手动设置，否则会互相打架 */
    if (typeof sig.rts === "boolean" && t.flow !== "hardware") { opts.requestToSend = sig.rts; }
    if (typeof sig.brk === "boolean") { opts.break = sig.brk; }
    if (!Object.keys(opts).length) { return Promise.resolve(false); }
    return port.setSignals(opts).then(function () { return true; }, function (e) {
      core.log("warn", "设置信号失败：" + ((e && e.message) || e));
      return false;
    });
  };

  T.readSignals = function () {
    var port = core.state.port;
    if (!port || !port.getSignals) { return Promise.resolve(null); }
    return port.getSignals().then(function (s) { return s; }, function () { return null; });
  };

  /* ------------------------------------------------------------
     7) 演示数据源
     生成的数据与真实设备走同一条下游管线（emit serial:data），
     因此无硬件时解析、绘图、插件、导出全链路依然可测。
     ------------------------------------------------------------ */
  var DEMO_FIELDS = [
    { key: "pos", unit: "°", gen: function (t) { return 90 * Math.sin(2 * Math.PI * 0.5 * t); } },
    { key: "vel", unit: "°/s", gen: function (t) { return 90 * 2 * Math.PI * 0.5 * Math.cos(2 * Math.PI * 0.5 * t); } },
    { key: "cur", unit: "A", gen: function (t) { return 3.2 * Math.sin(2 * Math.PI * 0.5 * t + 0.6) + 0.35 * Math.sin(2 * Math.PI * 7 * t); } },
    { key: "temp", unit: "℃", gen: function (t) { return 42 + 3 * Math.sin(2 * Math.PI * 0.02 * t); } },
    { key: "volt", unit: "V", gen: function (t) { return 24 + 0.15 * Math.sin(2 * Math.PI * 11 * t); } }
  ];

  /* 演示用 HEX 帧：AA 55 | seq | len | pos(i16×0.01) cur(i16×0.001) temp(i16×0.01) | sum8 */
  function buildDemoHexFrame(seq, t) {
    var pos = Math.round(90 * Math.sin(2 * Math.PI * 0.5 * t) / 0.01);
    var cur = Math.round(3.2 * Math.sin(2 * Math.PI * 0.5 * t + 0.6) / 0.001);
    var temp = Math.round((42 + 3 * Math.sin(2 * Math.PI * 0.02 * t)) / 0.01);
    var payload = new Uint8Array(6);
    payload[0] = pos & 0xFF; payload[1] = (pos >> 8) & 0xFF;
    payload[2] = cur & 0xFF; payload[3] = (cur >> 8) & 0xFF;
    payload[4] = temp & 0xFF; payload[5] = (temp >> 8) & 0xFF;
    var frame = new Uint8Array(11);
    frame[0] = 0xAA; frame[1] = 0x55;
    frame[2] = seq & 0xFF;
    frame[3] = payload.length;
    frame.set(payload, 4);
    frame[10] = SL.codec.sum8(frame, 0, 9);
    return frame;
  }

  T.DEMO_FIELDS = DEMO_FIELDS;
  /* 暴露给 _本地工具/校验串口应用.js：用同一份真源构造演示帧，
     断言 codec.extractFrames + parser.parseHexFrame 能吃下自己产出的帧 */
  T.buildDemoHexFrame = buildDemoHexFrame;

  /* 演示模式下用于「套用示例」的规则表 */
  T.demoHexRule = function () {
    return {
      head: "AA55",
      tail: "",
      len: { offset: 3, size: 1, mode: "payload" },
      fields: [
        { key: "pos", type: "int16", offset: 4, size: 2, scale: 0.01, big: false },
        { key: "cur", type: "int16", offset: 6, size: 2, scale: 0.001, big: false },
        { key: "temp", type: "int16", offset: 8, size: 2, scale: 0.01, big: false }
      ],
      checksum: { type: "sum8", from: 0, to: -1 }
    };
  };

  /* ------------------------------------------------------------
     7b) 规则驱动的演示帧
     目的：没接硬件时，用户配好自己的 HEX 协议也能进演示模式验证
     「分帧 → 结构表解析 → 建通道 → 画波形/频谱」整条链路。
     帧内排布严格按 codec.extractFrames 的长度口径：
         帧头 | [长度字段] | 字段 | [帧尾] | 校验和
     规则不完整、无法定界、或生成后自己都收不齐 → 回退内置 AA55 帧。
     ------------------------------------------------------------ */
  var DEMO_TYPE_RANGE = {
    int8: [-128, 127], uint8: [0, 255],
    int16: [-32768, 32767], uint16: [0, 65535],
    int32: [-2147483648, 2147483647], uint32: [0, 4294967295]
  };

  /* 小端写入无符号整数（1~4 字节） */
  function writeUintLE(u8, off, size, value) {
    var v = value;
    for (var i = 0; i < size; i++) { u8[off + i] = v & 0xFF; v = Math.floor(v / 256); }
  }

  /* 内置 AA55 帧所用的三路取值。与 DEMO_FIELDS 的差异只有一处：
     cur 不含 7Hz 谐波（HEX 帧里用简化波形更直观）。
     单列一份是为了让「套用示例」下的规则驱动合成器与内置帧**逐字节等价**，
     校验脚本里有断言锁死这个等式，改一边就会红。 */
  var DEMO_HEX_GEN = {
    pos: function (t) { return 90 * Math.sin(2 * Math.PI * 0.5 * t); },
    cur: function (t) { return 3.2 * Math.sin(2 * Math.PI * 0.5 * t + 0.6); },
    temp: function (t) { return 42 + 3 * Math.sin(2 * Math.PI * 0.02 * t); }
  };

  /* 字段取值：HEX 演示帧的三种认识的键用 DEMO_HEX_GEN，其余认识的键沿用
     文本演示波形，都不认识就按序号轮转正弦/阶梯/斜坡，
     保证时域有形状、频域有单峰（正好用来验证画图能力） */
  function demoValueOf(key, idx, t) {
    if (DEMO_HEX_GEN[key]) { return DEMO_HEX_GEN[key](t); }
    for (var i = 0; i < DEMO_FIELDS.length; i++) {
      if (DEMO_FIELDS[i].key === key) { return DEMO_FIELDS[i].gen(t); }
    }
    var kind = idx % 3;
    var f = 0.25 + (idx % 5) * 0.9;          /* 0.25~3.85 Hz，避免同频叠峰 */
    if (kind === 0) { return 50 * Math.sin(2 * Math.PI * f * t + idx); }
    if (kind === 1) { return ((Math.floor(f * t) % 2) === 0) ? -40 : 40; }
    return ((f * t) % 1) * 80 - 40;
  }

  /* 按 parser.readField 的类型口径写入一个字段值（含缩放反算与截断） */
  function writeFieldValue(u8, f, value) {
    var off = f.offset | 0;
    var size = f.size | 0;
    var type = f.type || ("uint" + (size * 8));
    var big = !!f.big;
    var scale = (typeof f.scale === "number" && isFinite(f.scale) && f.scale !== 0) ? f.scale : 1;
    var v = value / scale;
    var i;

    if (type === "float32" && size === 4) {
      if (typeof DataView === "undefined") { return; }
      try {
        new DataView(u8.buffer, u8.byteOffset + off, 4).setFloat32(0, v, !big);
      } catch (e) { /* 越界由 demoRuleUsable 的收帧自检兜住 */ }
      return;
    }

    var raw = Math.round(v);
    var range = DEMO_TYPE_RANGE[type];
    if (range) { raw = U.clamp(raw, range[0], range[1]); }
    /* 未知类型按无符号整数处理（与 parser 默认分支一致），负数先转二补码 */
    if (raw < 0 && size > 0 && size <= 4) { raw += Math.pow(2, size * 8); }
    if (big) { for (i = size - 1; i >= 0; i--) { u8[off + i] = raw & 0xFF; raw = Math.floor(raw / 256); } }
    else { writeUintLE(u8, off, size, raw); }
  }

  T.buildDemoHexFrameByRule = function (rule, seq, t) {
    var head = rule.head ? U.hexToBytes(rule.head) : null;
    var tail = rule.tail ? U.hexToBytes(rule.tail) : null;
    var headLen = head ? head.length : 0;
    var tailLen = tail ? tail.length : 0;
    var len = rule.len || { offset: 0, size: 0, mode: "none" };
    var hasLen = !!(len.mode && len.mode !== "none" && (len.size | 0) > 0);
    var ck = rule.checksum || { type: "none" };
    var ckLen = (ck.type && ck.type !== "none") ? SL.codec.checksumSize(ck.type) : 0;
    var fields = rule.fields || [];
    var i, f, end = headLen;

    /* 有长度字段时，载荷紧接长度字段之后 */
    var payloadStart = hasLen ? ((len.offset | 0) + (len.size | 0)) : headLen;
    for (i = 0; i < fields.length; i++) {
      f = fields[i];
      if (f && (f.offset | 0) + (f.size | 0) > end) { end = (f.offset | 0) + (f.size | 0); }
    }
    if (end < payloadStart) { end = payloadStart; }

    var frameLen = end + tailLen + ckLen;
    if (frameLen <= 0 || frameLen > 4096) { return null; }

    var frame = new Uint8Array(frameLen);
    var used = new Uint8Array(frameLen);      /* 已占用的字节位置（用于给序号找空档） */
    if (head) { frame.set(head, 0); for (i = 0; i < headLen; i++) { used[i] = 1; } }

    for (i = 0; i < fields.length; i++) {
      f = fields[i];
      if (!f || (f.size | 0) <= 0) { continue; }
      writeFieldValue(frame, f, demoValueOf(f.key, i, t));
      for (var k = 0; k < (f.size | 0); k++) { used[(f.offset | 0) + k] = 1; }
    }
    if (hasLen) {
      var payloadLen = Math.max(0, end - payloadStart);
      writeUintLE(frame, len.offset | 0, len.size | 0, (len.mode === "total") ? frameLen : payloadLen);
      for (i = 0; i < (len.size | 0); i++) { used[(len.offset | 0) + i] = 1; }
    }
    if (tailLen) {
      frame.set(tail, frameLen - ckLen - tailLen);
      for (i = 0; i < tailLen; i++) { used[frameLen - ckLen - tailLen + i] = 1; }
    }
    /* 帧头之后第一个没人占的字节写序号（0~255 循环）：既便于肉眼观察丢帧，
       也让内置 AA55 帧（AA 55 | seq | len | …）能被逐字节复现。
       必须放在算校验和之前——校验范围可能覆盖这个字节。 */
    for (i = headLen; i < frameLen; i++) {
      if (!used[i]) { frame[i] = seq & 0xFF; break; }
    }
    if (ckLen) {
      var from = (typeof ck.from === "number") ? ck.from : 0;
      var to = (typeof ck.to === "number" && ck.to !== -1) ? ck.to : (frameLen - ckLen - 1);
      writeUintLE(frame, frameLen - ckLen, ckLen, SL.codec.checksum(ck.type, frame, from, to));
    }
    return frame;
  };

  /* 当前 HEX 规则能不能用来合成演示帧：不能则由调用方回退内置 AA55 帧 */
  T.demoRuleUsable = function (rule) {
    if (!rule || !rule.fields || !rule.fields.length) { return false; }
    var hasLen = !!(rule.len && rule.len.mode && rule.len.mode !== "none" && (rule.len.size | 0) > 0);
    if (!hasLen && !rule.tail) { return false; }   /* 既无长度字段也无帧尾，无法定界 */
    try {
      var frame = T.buildDemoHexFrameByRule(rule, 0, 0);
      if (!frame || !frame.length) { return false; }
      /* 自检：产出的帧必须能被同一个分帧器恰好收成一整帧 */
      var res = SL.codec.extractFrames(frame, new Uint8Array(0), {
        head: rule.head || "", tail: rule.tail || "",
        len: rule.len, checksum: rule.checksum, maxLen: 4096
      });
      return res.frames.length === 1 && res.frames[0].length === frame.length;
    } catch (e) {
      return false;
    }
  };

  T.startDemo = function (opts) {
    opts = opts || {};
    T.stopDemo();

    demoMode = opts.mode === "hex" ? "hex" : "text";
    var periodMs = opts.periodMs || 20;      /* 默认 50 Hz */
    var seq = 0;
    var t0 = U.now();

    core.set("demo", true);
    core.set("port", null);
    setState("open");
    core.emit("serial:opened", { demo: true, mode: demoMode });

    demoTimer = setInterval(function () {
      if (!core.state.demo) { return; }
      var t = (U.now() - t0) / 1000;

      if (demoMode === "hex") {
        seq = (seq + 1) & 0xFF;
        /* 每拍现读规则（非快照）：进了演示再改帧结构也能立刻跟随 */
        var rule = core.config.rule.hex;
        var frame = T.demoRuleUsable(rule) ? T.buildDemoHexFrameByRule(rule, seq, t) : null;
        if (!frame) { frame = buildDemoHexFrame(seq, t); }
        T.stats.rx += frame.length;
        core.emit("serial:data", frame);
      } else {
        var parts = [];
        for (var i = 0; i < DEMO_FIELDS.length; i++) {
          var f = DEMO_FIELDS[i];
          parts.push(f.key + "=" + f.gen(t).toFixed(3));
        }
        var line = parts.join(",") + (opts.lineEnding === undefined ? "\n" : opts.lineEnding);
        var bytes = SL.codec.encodeText(line, "utf-8");
        T.stats.rx += bytes.length;
        core.emit("serial:data", bytes);
      }
    }, periodMs);

    core.log("info", "已进入演示模式（" + (demoMode === "hex" ? "HEX 帧" : "文本行") + "，" + periodMs + "ms/批）"
      + (demoMode === "hex" && !T.demoRuleUsable(core.config.rule.hex)
        ? "；当前 HEX 规则不完整，暂用内置 AA55 帧（可在「解析」页点「套用示例」对照）" : ""));
    return true;
  };

  T.stopDemo = function () {
    if (demoTimer) { clearInterval(demoTimer); demoTimer = null; }
    if (core.state.demo) { core.set("demo", false); }
  };

  T.demoMode = function () { return demoMode; };

  /* ------------------------------------------------------------
     8) 自动重连
     ------------------------------------------------------------ */
  function scheduleAutoReconnect() {
    var cfg = core.config.transport;
    if (!cfg || !cfg.autoReconnect) { return; }
    if (autoReconnectTimer) { return; }
    core.log("info", "将在 " + RECONNECT_DELAY + "ms 后尝试自动重连");
    autoReconnectTimer = setTimeout(function () {
      autoReconnectTimer = null;
      core.emit("serial:autoreconnect", {});
    }, RECONNECT_DELAY);
  }

  T._scheduleAutoReconnect = scheduleAutoReconnect;

  /* ------------------------------------------------------------
     9) 初始化：全局事件与页面退出释放
     ------------------------------------------------------------ */
  T.init = function () {
    var supported = T.isSupported();
    setState(T.stateMachine.initial(supported));

    if (supported && navigator.serial.addEventListener) {
      /* 设备被热拔 / 他人抢占 */
      navigator.serial.addEventListener("disconnect", function (e) {
        if (core.state.demo) { return; }
        if (e && e.target === core.state.port) {
          core.log("warn", "设备已断开");
          core.emit("serial:error", { phase: "lost", error: new Error("设备已断开") });
          setState("error");
          T.disconnect().then(function () { scheduleAutoReconnect(); });
        }
      });
      navigator.serial.addEventListener("connect", function () {
        core.log("info", "检测到设备接入");
      });
    }

    /* 页面退出前释放端口，避免下次打开被占用 */
    var release = function () {
      T.stopDemo();
      var port = core.state.port;
      keepReading = false;
      epoch++;
      if (currentReader) { try { currentReader.cancel(); } catch (e) { /* 忽略 */ } }
      if (port) { try { port.close(); } catch (e2) { /* 忽略 */ } }
    };
    global.addEventListener("beforeunload", release);
    global.addEventListener("pagehide", release);
  };

  SL.transport = T;

  /* UMD 尾：校验脚本可加载 stateMachine / buildOpenOptions 做断言 */
  if (typeof module !== "undefined" && module.exports) { module.exports = SL.transport; }
})(typeof window !== "undefined" ? window : globalThis);
