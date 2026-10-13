/* ============================================================
   网页端串口调试助手 · SerialLab
   模块：core（内核）
   职责：命名空间 / 事件总线 / 运行状态 / 全局配置的默认值与持久化与版本迁移
   依赖：util
   设计：模块之间不互相持有引用，跨模块通信一律走 core 的事件总线
   ============================================================ */
;(function (global) {
  "use strict";

  var SL = global.SerialLab = global.SerialLab || {};
  var U = SL.util;

  SL.version = "1.0.0";

  /* ------------------------------------------------------------
     1) 事件总线
     on(type, fn) 返回取消订阅函数；emit 内单个监听器抛错不影响其它监听器
     ------------------------------------------------------------ */
  var listeners = {};

  var core = {};

  core.on = function (type, fn) {
    if (!type || typeof fn !== "function") { return function () {}; }
    if (!listeners[type]) { listeners[type] = []; }
    listeners[type].push(fn);
    return function () { core.off(type, fn); };
  };

  core.off = function (type, fn) {
    var arr = listeners[type];
    if (!arr) { return; }
    for (var i = arr.length - 1; i >= 0; i--) {
      if (arr[i] === fn) { arr.splice(i, 1); }
    }
  };

  core.emit = function (type, payload) {
    var arr = listeners[type];
    if (!arr || !arr.length) { return; }
    /* 快照后再遍历：允许监听器在回调里增删订阅 */
    var snap = arr.slice(0);
    for (var i = 0; i < snap.length; i++) {
      try {
        snap[i](payload);
      } catch (e) {
        /* 单个监听器异常不阻断其余监听器，也不冒泡打断数据管线 */
        if (global.console && console.error) {
          console.error("[SerialLab] 事件监听器异常 @ " + type, e);
        }
      }
    }
  };

  /* ------------------------------------------------------------
     2) 运行状态（易失，不持久化）
     conn: unsupported | idle | requesting | opening | open | closing | error
     ------------------------------------------------------------ */
  core.state = {
    conn: "idle",      /* 连接状态，与 transport 的状态机取值域一致 */
    demo: false,       /* 是否处于演示数据源模式 */
    port: null,        /* SerialPort 实例（仅运行时持有） */
    portInfo: null,    /* { usbVendorId, usbProductId } */
    paused: false,     /* 显示冻结（时间线冻结 / 暂停刷新） */
    recording: false,  /* 是否正在录制 */
    lastError: ""      /* 最近一次错误信息，供状态条展示 */
  };

  core.get = function (key) { return core.state[key]; };

  core.set = function (key, val) {
    if (core.state[key] === val) { return; }
    core.state[key] = val;
    core.emit("state", { key: key, value: val });
  };

  /* ------------------------------------------------------------
     3) 全局配置：默认值 / 版本迁移 / 持久化
     持久化键 humanoid-serial-config-v1 —— 前缀 humanoid- 是站点自检 C4 的白名单要求
     ------------------------------------------------------------ */
  var CFG_VERSION = 1;
  var CFG_KEY = "humanoid-serial-config-v1";

  core.CFG_VERSION = CFG_VERSION;

  core.defaultConfig = function () {
    return {
      version: CFG_VERSION,
      updatedAt: 0,

      /* ---- 串口参数 ---- */
      transport: {
        baudRate: 115200,
        dataBits: 8,
        stopBits: 1,
        parity: "none",          /* none | even | odd */
        flow: "none",            /* none | hardware */
        bufferSize: 4096,
        encoding: "utf-8",       /* utf-8 | ascii | latin1 | utf-16le */
        lineEnding: "\n",        /* 发送时追加的换行：\n | \r | \r\n | "" */
        appendLineEnding: true,
        hexRecv: false,
        hexSend: false,
        showTimestamp: true,
        autoReconnect: false,
        resetWaitMs: 1500,       /* Arduino/ESP 打开串口会因 DTR 复位，连上后先别发 */
        lingerDot: true          /* 无换行的裸流也按“静默超时”切帧 */
      },

      /* ---- 通道（解析出来的可绘图量） ---- */
      channels: [],

      /* ---- 解析规则 ---- */
      rule: {
        active: "text",          /* text | hex */
        text: {
          type: "text",
          seps: ["=", ":"],      /* 同时支持等号与冒号（对齐 SerialWeb 2.0 文本解析） */
          number: "[-+]?\\d*\\.?\\d+(?:[eE][-+]?\\d+)?",
          suffixChannels: true,  /* temp1/temp2 保留后缀为独立通道 */
          trim: true
        },
        hex: {
          type: "hex",
          head: "",              /* 帧头十六进制串，如 "AA55"；留空=不按帧头收帧 */
          len: { offset: 0, size: 0, mode: "none" },   /* none|payload|total */
          fields: [],            /* [{key,type,offset,size,scale,big}] */
          checksum: { type: "none", from: 0, to: -1 }, /* none|sum8|xor8|sum16|crc16modbus */
          tail: ""               /* 帧尾十六进制串；留空=按长度字段收帧（宽匹配） */
        }
      },

      /* ---- 图表框（用户 DIY 的插件实例） ---- */
      panels: [],

      /* ---- 发送工作流 ---- */
      send: {
        timed: [],     /* [{id,text,hex,intervalMs,enabled}] 定时轮询 */
        triggers: [],  /* [{id,match,reply,hex,enabled}] 触发应答 */
        presets: []    /* [{id,name,text,hex,expect,waitMs,shortcut,enabled}] 预设发送 */
      },

      /* ---- 界面 ---- */
      ui: {
        theme: "auto",           /* auto | light | dark */
        layout: [],              /* 图表框顺序（panel id 数组） */
        leftWidth: 340
      }
    };
  };

  /* 版本迁移：按版本号逐级升级，保留用户既有设置 */
  core.migrateConfig = function (cfg) {
    if (!cfg || typeof cfg !== "object") { return core.defaultConfig(); }
    var v = parseInt(cfg.version, 10);
    if (isNaN(v)) { v = 0; }

    /* v0 -> v1：早期无 version 字段或无规则结构的草稿，补齐默认段落 */
    if (v < 1) {
      var d = core.defaultConfig();
      cfg.version = 1;
      cfg.transport = mergeDeep(d.transport, cfg.transport || {});
      cfg.rule = mergeDeep(d.rule, cfg.rule || {});
      cfg.send = mergeDeep(d.send, cfg.send || {});
      cfg.ui = mergeDeep(d.ui, cfg.ui || {});
      if (!cfg.channels) { cfg.channels = []; }
      if (!cfg.panels) { cfg.panels = []; }
      v = 1;
    }

    /* 未来版本（用户在本机改高过）按原样返回，由调用方决定是否拒绝 */
    return cfg;
  };

  /* 深合并：用默认值补齐缺失字段，但不覆盖用户已有值；数组整体替换 */
  function mergeDeep(base, over) {
    var out = U.clone(base);
    if (!over || typeof over !== "object") { return out; }
    for (var k in over) {
      if (!Object.prototype.hasOwnProperty.call(over, k)) { continue; }
      var bv = out[k], ov = over[k];
      if (ov === null || ov === undefined) { continue; }
      if (typeof ov === "object" && !U.isBytes(ov) &&
          Object.prototype.toString.call(ov) !== "[object Array]" &&
          bv && typeof bv === "object" && !U.isBytes(bv) &&
          Object.prototype.toString.call(bv) !== "[object Array]") {
        out[k] = mergeDeep(bv, ov);
      } else {
        out[k] = ov;
      }
    }
    return out;
  }
  core.mergeDeep = mergeDeep;

  /* 当前生效配置（内存态，由 app 启动时装载） */
  core.config = core.defaultConfig();

  core.loadConfig = function () {
    var raw = null;
    try {
      raw = global.localStorage ? localStorage.getItem(CFG_KEY) : null;
    } catch (e) { raw = null; }   /* 隐私模式 / 存储被禁：静默降级为默认配置 */
    if (!raw) { return core.defaultConfig(); }
    var parsed = null;
    try { parsed = JSON.parse(raw); } catch (e2) { parsed = null; }
    if (!parsed || typeof parsed !== "object") { return core.defaultConfig(); }
    return core.migrateConfig(parsed);
  };

  core.saveConfig = function (cfg) {
    cfg = cfg || core.config;
    cfg.version = CFG_VERSION;
    cfg.updatedAt = Date.now();
    try {
      localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
      return true;
    } catch (e) {
      /* 配额超限：不静默吞掉，广播出去让 ui 层提示用户导出备份 */
      var quota = e && (e.name === "QuotaExceededError" || e.code === 22);
      core.emit("config:savefail", { quota: !!quota, error: e });
      return false;
    }
  };

  core.clearConfig = function () {
    try { localStorage.removeItem(CFG_KEY); } catch (e) { /* 忽略 */ }
    core.config = core.defaultConfig();
    core.emit("config:reset", core.config);
  };

  /* ------------------------------------------------------------
     4) 轻量日志缓冲（供“帮助 / 状态”面板与排障使用，最多保留 200 条）
     ------------------------------------------------------------ */
  var logs = [];
  core.log = function (level, msg) {
    var rec = { t: Date.now(), level: level || "info", msg: String(msg) };
    logs.push(rec);
    if (logs.length > 200) { logs.shift(); }
    core.emit("log", rec);
    if (global.console) {
      var fn = level === "error" ? console.error : (level === "warn" ? console.warn : console.log);
      if (fn) { fn("[SerialLab] " + rec.msg); }
    }
    return rec;
  };
  core.getLogs = function () { return logs.slice(0); };

  SL.core = core;

  /* UMD 尾：供校验脚本 require 真实源文件（core 不做纯函数断言，仅保证可加载） */
  if (typeof module !== "undefined" && module.exports) { module.exports = SL.core; }
})(typeof window !== "undefined" ? window : globalThis);
