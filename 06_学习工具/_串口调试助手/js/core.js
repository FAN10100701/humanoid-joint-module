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
  var CFG_VERSION = 3;
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
        /* 监视器时间戳口径：abs = 绝对时刻 23:51:21.900（默认，贴近 VOFA/SerialWeb）
                            rel = 本次会话已运行的相对秒 12.345s */
        timeMode: "abs",
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
        leftWidth: 340,
        sideHidden: false,       /* 左栏是否整栏收起 */
        monRatio: 0.62,          /* 主区上下分割：监视器占主区高度的比例（0.2~0.85） */
        monCollapsed: false,     /* 监视器是否收起（只留标题条） */
        drawInterval: 40,        /* 重绘节流 ms（16~200，越小越流畅越费 CPU） */
        fontSize: 12,            /* 监视器等宽字号 px（11~18） */
        highlightNumbers: false, /* 数字标红：把监视器里的数字用醒目色标出 */
        markFailed: true,        /* 解析失败 / 校验失败的行整行标红 */
        autoRecord: true,        /* 连上设备或进入演示后自动开始录制（供导出/AI 读取） */
        recordCap: 20000         /* 记录上限（帧）：同时管「时间线录制帧数」与「原始收发记录条数」。
                                    两者必须同源——旧版只驱动前者，后者写死 5000，于是 UI 与 AI
                                    调试包都声称「上限 2 万帧」而实际只给得出 5 千条（AUDIT A-81） */
      },

      /* ---- 面向 AI 的自动化通道（设计说明见 docs/维护/串口调试助手_评估与优化路线图.md 第三节） ----
         四条通道互相独立、可单开：① 一键复制提示词（无配置，永远可用）
         ② 持续写本地文件（fileLog）③ HTTP 上报本地收件箱（httpPush）
         ④ 本地串口桥 + MCP（_本地工具/serial-bridge，不走浏览器，与本配置无关） */
      ai: {
        fileLog: false,          /* 持续把调试包写进本地文件（File System Access API，仅 Chromium；需手势授权一次） */
        httpPush: false,         /* 定时把调试包 POST 到本地收件箱（配 _本地工具/serial-inbox.py） */
        httpPort: 7788,          /* 收件箱端口，须与 serial-inbox.py --port 一致 */
        httpIntervalMs: 5000,    /* 上报间隔 ms（下限 1000，防止打满本地服务） */
        bundleSamples: 400       /* 每次调试包携带的原始样本条数（20~5000） */
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

    /* v1 -> v2：新增「显示与性能」段落（时间口径 / 分割比例 / 字号 / 标红 / 自动存档）
       只补齐缺失字段，不覆盖用户已经改过的值 */
    if (v < 2) {
      var d2 = core.defaultConfig();
      cfg.version = 2;
      cfg.transport = mergeDeep(d2.transport, cfg.transport || {});
      cfg.ui = mergeDeep(d2.ui, cfg.ui || {});
      v = 2;
    }

    /* v2 -> v3：新增「面向 AI 的自动化通道」段落（文件落盘 / HTTP 上报 / 采样条数） */
    if (v < 3) {
      var d3 = core.defaultConfig();
      cfg.version = 3;
      cfg.ui = mergeDeep(d3.ui, cfg.ui || {});
      cfg.ai = mergeDeep(d3.ai, cfg.ai || {});
      v = 3;
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

  /* ------------------------------------------------------------
     3b) 开源协议预设（社区事实标准的一键套用）
     这些协议被 VOFA+ / Teleplot / 匿名上位机 / Serial Studio 等工具广泛使用，
     内置成预设后，用户不必从零拼帧结构，只要点一下再按需微调。
     每条只描述「解析规则」的差异部分，applyPresetRule 会用默认配置补齐其余字段。
     ------------------------------------------------------------ */
  var PRESETS = [
    {
      id: "firewater",
      name: "FireWater",
      brand: "VOFA+",
      kind: "text",
      note: "文本 name:value，按换行分帧；同一行可写多组，用逗号或空格隔开",
      sample: "temp:25.3, cur:1.02, rpm:1800",
      rule: {
        active: "text",
        text: { seps: ["=", ":"], suffixChannels: true, trim: true }
      }
    },
    {
      id: "teleplot",
      name: "Teleplot",
      brand: "Teleplot / VS Code",
      kind: "text",
      note: "文本 >name:value（前缀 > 用于标识绘图变量；解析器自动忽略键名前的前缀字符）",
      sample: ">rpm:1800",
      rule: {
        active: "text",
        text: { seps: [":", "="], suffixChannels: true, trim: true }
      }
    },
    {
      id: "justfloat",
      name: "JustFloat",
      brand: "VOFA+",
      kind: "hex",
      note: "二进制：float32 小端 × N，帧尾固定 00 00 80 7F（即 +Inf）。无帧头，按帧尾定界",
      sample: "00 00 00 00 | 00 00 80 3F | 00 00 00 40 | 00 00 40 40 | 00 00 80 7F",
      rule: {
        active: "hex",
        hex: {
          head: "",
          tail: "0000807F",
          len: { offset: 0, size: 0, mode: "none" },
          checksum: { type: "none", from: 0, to: -1 },
          fields: [
            { key: "ch1", type: "float32", offset: 0, size: 4, scale: 1, big: false },
            { key: "ch2", type: "float32", offset: 4, size: 4, scale: 1, big: false },
            { key: "ch3", type: "float32", offset: 8, size: 4, scale: 1, big: false },
            { key: "ch4", type: "float32", offset: 12, size: 4, scale: 1, big: false }
          ]
        }
      }
    },
    {
      id: "ano10",
      name: "匿名 V1.0",
      brand: "匿名上位机 / 野火例程",
      kind: "hex",
      note: "帧头 AA AA + 功能字(1B) + 长度(1B，数据段字节数) + 数据 + SUM8（从帧头累加取低 8 位）；数据为 int16 大端",
      sample: "AA AA 01 06 00 64 00 32 00 00 F1",
      rule: {
        active: "hex",
        hex: {
          head: "AAAA",
          tail: "",
          len: { offset: 3, size: 1, mode: "payload" },
          checksum: { type: "sum8", from: 0, to: -1 },
          fields: [
            { key: "func", type: "uint8", offset: 2, size: 1, scale: 1, big: false },
            { key: "x", type: "int16", offset: 4, size: 2, scale: 0.01, big: true },
            { key: "y", type: "int16", offset: 6, size: 2, scale: 0.01, big: true },
            { key: "z", type: "int16", offset: 8, size: 2, scale: 0.01, big: true }
          ]
        }
      }
    }
  ];

  core.presets = function () { return PRESETS.slice(0); };

  core.getPreset = function (id) {
    for (var i = 0; i < PRESETS.length; i++) {
      if (PRESETS[i].id === id) { return PRESETS[i]; }
    }
    return null;
  };

  /* 返回一条可直接写进 config.rule 的完整规则（用默认值补齐未描述的部分） */
  core.presetRule = function (id) {
    var p = core.getPreset(id);
    if (!p) { return null; }
    return mergeDeep(core.defaultConfig().rule, p.rule);
  };

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
