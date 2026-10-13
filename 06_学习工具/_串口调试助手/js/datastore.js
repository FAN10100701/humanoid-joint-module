/* ============================================================
   网页端串口调试助手 · SerialLab
   模块：datastore（数据仓）
   职责：维护通道元数据与每通道的时序数据（环形缓冲）、当前值统计、
         以及供导出使用的原始帧记录。
   依赖：util
   设计：环形缓冲零分配遍历（绘图每帧都读，不能产生 GC 压力）；
         统计按当前缓冲内容即时计算，保证与画出来的数据一致。
   ============================================================ */
;(function (global) {
  "use strict";

  var SL = global.SerialLab = global.SerialLab || {};
  var U = SL.util;

  var D = {};

  /* 每通道保留点数上限（内存与回溯窗口的折中） */
  var CAP = 30000;
  D.CAPACITY = CAP;

  /* 双主题都可读的兜底色板（浏览器里优先读 CSS 变量） */
  var FALLBACK_PALETTE = [
    "#3b82f6", "#22c55e", "#f59e0b", "#ef4444",
    "#a855f7", "#06b6d4", "#ec4899", "#84cc16"
  ];

  var channels = {};     /* key -> meta */
  var order = [];        /* 通道出现顺序 */
  var rings = {};        /* key -> Ring */
  var colorCursor = 0;
  var totalFrames = 0;
  var totalBytes = 0;

  /* 原始收发记录（文本监视器显示 / 导出用），只保留最近 RAW_CAP 条。
     5000 条约几百 KB，足够一次实验数据的导出；更长时间的记录请用「时间线录制」。 */
  var RAW_CAP = 5000;
  var rawLog = [];
  D.RAW_CAP = RAW_CAP;

  /* ---------------- 环形缓冲 ---------------- */
  function Ring(cap) {
    this.cap = cap;
    this.t = new Float64Array(cap);
    this.v = new Float64Array(cap);
    this.len = 0;
    this.head = 0;
  }

  Ring.prototype.push = function (t, v) {
    var idx;
    if (this.len === this.cap) {
      idx = this.head;
      this.head = (this.head + 1) % this.cap;
    } else {
      idx = (this.head + this.len) % this.cap;
      this.len++;
    }
    this.t[idx] = t;
    this.v[idx] = v;
  };

  Ring.prototype.count = function () { return this.len; };

  /* 零分配遍历最近 n 个点：cb(t, v, i, cnt) */
  Ring.prototype.forEachRecent = function (n, cb) {
    var cnt = Math.min(n, this.len);
    if (cnt <= 0) { return; }
    var start = (this.head + this.len - cnt + this.cap) % this.cap;
    for (var i = 0; i < cnt; i++) {
      var idx = (start + i) % this.cap;
      cb(this.t[idx], this.v[idx], i, cnt);
    }
  };

  /* 复制最近 n 个点为普通数组（导出 / 频域分析用） */
  Ring.prototype.copyRecent = function (n) {
    var cnt = Math.min(n, this.len);
    var out = { t: new Array(cnt), v: new Array(cnt) };
    var start = (this.head + this.len - cnt + this.cap) % this.cap;
    for (var i = 0; i < cnt; i++) {
      var idx = (start + i) % this.cap;
      out.t[i] = this.t[idx];
      out.v[i] = this.v[idx];
    }
    return out;
  };

  Ring.prototype.clear = function () {
    this.len = 0;
    this.head = 0;
  };

  /* ---------------- 色板 ---------------- */
  D.palette = function () {
    if (typeof document === "undefined" || !global.getComputedStyle) { return FALLBACK_PALETTE.slice(0); }
    try {
      var cs = global.getComputedStyle(document.documentElement);
      var out = [];
      for (var i = 1; i <= 8; i++) {
        var v = cs.getPropertyValue("--sl-c" + i);
        v = v ? v.replace(/^\s+|\s+$/g, "") : "";
        out.push(v || FALLBACK_PALETTE[i - 1]);
      }
      return out;
    } catch (e) {
      return FALLBACK_PALETTE.slice(0);
    }
  };

  D.nextColor = function () {
    var pal = D.palette();
    var c = pal[colorCursor % pal.length];
    colorCursor++;
    return c;
  };

  /* ---------------- 通道 ---------------- */
  D.upsertChannel = function (meta) {
    if (!meta || !meta.key) { return null; }
    var key = String(meta.key);
    var ch = channels[key];
    if (!ch) {
      ch = {
        key: key,
        label: meta.label || key,
        unit: meta.unit || "",
        color: meta.color || D.nextColor(),
        visible: meta.visible !== false,
        precision: (typeof meta.precision === "number") ? meta.precision : 3,
        source: meta.source || "text"
      };
      channels[key] = ch;
      order.push(key);
      rings[key] = new Ring(CAP);
      SL.core.emit("channels", { added: key, channel: ch });
    } else {
      /* 已存在：只更新显式给出的字段，避免把用户改过的标签覆盖掉 */
      if (meta.label !== undefined && meta.label !== "") { ch.label = meta.label; }
      if (meta.unit !== undefined) { ch.unit = meta.unit; }
      if (meta.visible !== undefined) { ch.visible = meta.visible !== false; }
      if (meta.precision !== undefined) { ch.precision = meta.precision; }
      if (meta.color !== undefined && meta.color) { ch.color = meta.color; }
    }
    return ch;
  };

  D.getChannel = function (key) { return channels[key] || null; };

  D.listChannels = function () {
    var out = [];
    for (var i = 0; i < order.length; i++) {
      if (channels[order[i]]) { out.push(channels[order[i]]); }
    }
    return out;
  };

  D.channelKeys = function () { return order.slice(0); };

  D.removeChannel = function (key) {
    if (!channels[key]) { return; }
    delete channels[key];
    delete rings[key];
    for (var i = order.length - 1; i >= 0; i--) {
      if (order[i] === key) { order.splice(i, 1); }
    }
    SL.core.emit("channels", { removed: key });
  };

  /* ---------------- 写入 ---------------- */
  /* pushFrame({ t, values:{key:num}, dir, raw, text })
     值里出现的每个键都会自动建通道——用户不必先去「添加通道」 */
  D.pushFrame = function (frame) {
    if (!frame || !frame.values) { return; }
    var t = (typeof frame.t === "number") ? frame.t : U.now();
    var any = false;
    for (var k in frame.values) {
      if (!Object.prototype.hasOwnProperty.call(frame.values, k)) { continue; }
      var v = frame.values[k];
      if (typeof v !== "number" || !isFinite(v)) { continue; }
      var ch = channels[k];
      if (!ch) {
        ch = D.upsertChannel({ key: k, label: k, source: frame.rule === "hex" ? "hex" : "text" });
      }
      rings[k].push(t, v);
      any = true;
    }
    totalFrames++;
    totalBytes += frame.bytes || 0;
    if (any || frame.dir === "tx") { SL.core.emit("frame", frame); }
  };

  /* ---------------- 读取 ---------------- */
  D.forEachRecent = function (key, n, cb) {
    var r = rings[key];
    if (!r) { return 0; }
    var cnt = 0;
    r.forEachRecent(n, function (t, v, i, c) { cnt = c; cb(t, v, i, c); });
    return cnt;
  };

  D.copyRecent = function (key, n) {
    var r = rings[key];
    if (!r) { return { t: [], v: [] }; }
    return r.copyRecent(n || r.len);
  };

  D.count = function (key) {
    var r = rings[key];
    return r ? r.len : 0;
  };

  /* 统计（按当前缓冲内容计算，保证与图上看到的一致） */
  D.stat = function (key, n) {
    var r = rings[key];
    var out = { key: key, count: 0, last: NaN, min: NaN, max: NaN, avg: NaN, span: NaN };
    if (!r || r.len === 0) { return out; }
    var cnt = Math.min(n || r.len, r.len);
    var start = (r.head + r.len - cnt + r.cap) % r.cap;
    var mn = Infinity, mx = -Infinity, sum = 0, v;
    for (var i = 0; i < cnt; i++) {
      v = r.v[(start + i) % r.cap];
      if (v < mn) { mn = v; }
      if (v > mx) { mx = v; }
      sum += v;
    }
    out.count = cnt;
    out.last = r.v[(r.head + r.len - 1) % r.cap];
    out.min = mn;
    out.max = mx;
    out.avg = sum / cnt;
    out.span = mx - mn;
    return out;
  };

  D.stats = function (n) {
    var out = [];
    for (var i = 0; i < order.length; i++) { out.push(D.stat(order[i], n)); }
    return out;
  };

  D.totalFrames = function () { return totalFrames; };
  D.totalBytes = function () { return totalBytes; };

  /* ---------------- 原始记录（文本监视器 / 录制导出） ----------------
     rec = { t, tLabel, dir:"rx"|"tx", display, text, hex, values, ok } */
  D.pushRaw = function (rec) {
    if (!rec) { return; }
    rawLog.push(rec);
    if (rawLog.length > RAW_CAP) { rawLog.shift(); }
  };

  D.recentRaw = function (n) {
    if (!n || n >= rawLog.length) { return rawLog.slice(0); }
    return rawLog.slice(rawLog.length - n);
  };

  D.rawCount = function () { return rawLog.length; };

  /* ---------------- 清理 ---------------- */
  D.clear = function (keepChannels) {
    for (var k in rings) {
      if (Object.prototype.hasOwnProperty.call(rings, k)) { rings[k].clear(); }
    }
    rawLog = [];
    totalFrames = 0;
    totalBytes = 0;
    if (!keepChannels) {
      channels = {};
      order = [];
      rings = {};
      colorCursor = 0;
    }
    SL.core.emit("data:clear", { keepChannels: !!keepChannels });
  };

  /* 从配置恢复通道元数据（启动时用） */
  D.restore = function (list) {
    if (!list || !list.length) { return; }
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (!m || !m.key) { continue; }
      D.upsertChannel(m);
    }
  };

  /* 导出通道元数据（存配置用） */
  D.snapshot = function () {
    var out = [];
    for (var i = 0; i < order.length; i++) {
      var c = channels[order[i]];
      if (!c) { continue; }
      out.push({
        key: c.key, label: c.label, unit: c.unit, color: c.color,
        visible: c.visible, precision: c.precision, source: c.source
      });
    }
    return out;
  };

  SL.datastore = D;

  /* UMD 尾：校验脚本可加载（纯函数部分在 Ring / stat / splitSuffix 等） */
  if (typeof module !== "undefined" && module.exports) { module.exports = SL.datastore; }
})(typeof window !== "undefined" ? window : globalThis);
