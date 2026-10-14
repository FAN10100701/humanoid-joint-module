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

  /* 原始收发记录（文本监视器显示 / 导出用）——改用环形缓冲，写入 O(1)。
     两个历史问题在这里一并解决（AUDIT A-81）：
       1) 旧实现是 `Array.push + shift()`，溢出时整体搬移（O(n)）。上限一旦调大，
          高速流下每次收帧都在搬数组，会拖慢主线程 —— 所以不能只改大数字就算了。
       2) 上限写死 5000，与配置里的 ui.recordCap（20000）不一致：UI 与 AI 调试包都
          声称「上限 2 万帧」，而 recentRaw() 实际只给得出 5000 条，长测会静默丢数据。
     现在上限由配置驱动（app.js 调 setRawCap），并暴露真实生效值供 UI/调试包显示。 */
  var RAW_CAP_DEFAULT = 5000;

  function RawRing(cap) {
    this.cap = cap;
    this.buf = new Array(cap);
    this.len = 0;
    this.head = 0;
  }

  RawRing.prototype.push = function (rec) {
    var idx;
    if (this.len === this.cap) {
      idx = this.head;
      this.head = (this.head + 1) % this.cap;
    } else {
      idx = (this.head + this.len) % this.cap;
      this.len++;
    }
    this.buf[idx] = rec;
  };

  /* 取最近 n 条（n 为空或超出则给全部），按时间先后顺序 */
  RawRing.prototype.toArray = function (n) {
    var cnt = (n && n < this.len) ? n : this.len;
    var out = new Array(cnt);
    if (!cnt) { return out; }
    var start = (this.head + this.len - cnt) % this.cap;
    for (var i = 0; i < cnt; i++) { out[i] = this.buf[(start + i) % this.cap]; }
    return out;
  };

  RawRing.prototype.clear = function () {
    this.buf = new Array(this.cap);
    this.len = 0;
    this.head = 0;
  };

  /* 改容量：保留最近 min(旧, 新) 条 */
  RawRing.prototype.resize = function (cap) {
    if (cap === this.cap) { return; }
    var keep = this.toArray(cap);
    this.cap = cap;
    this.buf = new Array(cap);
    this.head = 0;
    this.len = keep.length;
    for (var i = 0; i < keep.length; i++) { this.buf[i] = keep[i]; }
  };

  var rawRing = new RawRing(RAW_CAP_DEFAULT);

  /* 兼容旧字段：默认上限（文档与校验脚本可读） */
  D.RAW_CAP = RAW_CAP_DEFAULT;

  /* 设置原始记录上限（帧）。返回真正生效的值。
     下限 200 防止填 0 把监视器清空；上限 50 万防内存失控。 */
  D.setRawCap = function (n) {
    n = parseInt(n, 10);
    if (!isFinite(n) || n <= 0) { n = RAW_CAP_DEFAULT; }
    n = U.clamp(n, 200, 500000);
    rawRing.resize(n);
    return rawRing.cap;
  };

  /* 当前真实生效的原始记录上限 —— UI 与 AI 调试包必须显示这个值，
     不能显示配置里的「期望值」，否则又会出现「文档与事实不符」。 */
  D.rawCap = function () { return rawRing.cap; };

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
    rawRing.push(rec);
  };

  D.recentRaw = function (n) { return rawRing.toArray(n); };

  D.rawCount = function () { return rawRing.len; };

  /* ---------------- 清理 ----------------
     keepChannels=true 保留通道元数据（颜色/标签不被打回默认）；
     keepRaw=true 保留原始记录（规则热更新重放时用：曲线要重建，但监视器里
     已经打出来的日志不该消失） */
  D.clear = function (keepChannels, keepRaw) {
    for (var k in rings) {
      if (Object.prototype.hasOwnProperty.call(rings, k)) { rings[k].clear(); }
    }
    if (!keepRaw) { rawRing.clear(); }
    totalFrames = 0;
    totalBytes = 0;
    if (!keepChannels) {
      channels = {};
      order = [];
      rings = {};
      colorCursor = 0;
    }
    SL.core.emit("data:clear", { keepChannels: !!keepChannels, keepRaw: !!keepRaw });
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
