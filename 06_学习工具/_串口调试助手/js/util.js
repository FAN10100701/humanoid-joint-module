/* ============================================================
   网页端串口调试助手 · SerialLab
   模块：util（通用工具）
   职责：HTML 转义 / 字节与十六进制互转 / 数值格式化 / 下载 / 环境探测
   依赖：无（叶子模块）
   命名约定：所有对外接口挂在 window.SerialLab.util 下
   代码风格：保守 ES5（var + function，不用箭头函数 / class / 模板字符串）
   ============================================================ */
;(function (global) {
  "use strict";

  /* 命名空间：首个加载的模块负责创建，后续模块复用同一对象 */
  var SL = global.SerialLab = global.SerialLab || {};

  var U = {};

  /* ---------- HTML 转义 ----------
     铁律：任何来自串口 / 用户输入 / 导入 JSON 的内容，在拼进 HTML 字符串前
     必须先过 esc()。能用 textContent 的场景优先用 textContent。 */
  U.esc = function (s) {
    if (s === null || s === undefined) { return ""; }
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };

  /* ---------- 字节数组 → 十六进制字符串 ----------
     u8: Uint8Array 或普通数字数组；sep: 分隔符（默认空格）
     例：bytesToHex([0xAA,0x55]) -> "AA 55" */
  U.bytesToHex = function (u8, sep) {
    if (!u8 || !u8.length) { return ""; }
    if (sep === undefined) { sep = " "; }
    var out = [];
    for (var i = 0; i < u8.length; i++) {
      var h = (u8[i] & 0xFF).toString(16).toUpperCase();
      out.push(h.length === 1 ? "0" + h : h);
    }
    return out.join(sep);
  };

  /* ---------- 十六进制字符串 → 字节数组 ----------
     容忍空格 / 逗号 / 换行 / "0x" 前缀；奇数位或含非法字符时返回 null（不猜、不抛） */
  U.hexToBytes = function (str) {
    if (str === null || str === undefined) { return null; }
    var s = String(str).replace(/0[xX]/g, "").replace(/[\s,;:_-]/g, "");
    if (s === "") { return new Uint8Array(0); }
    if (!/^[0-9a-fA-F]+$/.test(s)) { return null; }      /* 含非法字符 */
    if (s.length % 2 !== 0) { return null; }             /* 奇数位无法成字节 */
    var n = s.length / 2;
    var out = new Uint8Array(n);
    for (var i = 0; i < n; i++) { out[i] = parseInt(s.substr(i * 2, 2), 16); }
    return out;
  };

  /* ---------- 绝对时刻格式化（监视器时间戳的「绝对口径」）----------
     输入 Date.now() 毫秒值（注意：U.now() 是 performance.now()，单调但不是墙钟，
     两者不可混用——记录里同时存 t(单调) 与 tWall(墙钟)，绝对时刻一律走 tWall）。
     withMs 省略时保留毫秒，与 VOFA+ / SerialWeb 的显示习惯一致。
     例：fmtClock(1750000000000) -> "23:06:40.000" */
  U.fmtClock = function (ms, withMs) {
    var d = new Date(ms);
    if (isNaN(d.getTime())) { return "--:--:--"; }
    return U.pad2(d.getHours()) + ":" + U.pad2(d.getMinutes()) + ":" + U.pad2(d.getSeconds()) +
      (withMs === false ? "" : "." + U.pad3(d.getMilliseconds()));
  };

  /* ---------- 两位 / 三位补零 ---------- */
  U.pad2 = function (n) {
    var s = String(n | 0);
    return s.length >= 2 ? s : "0" + s;
  };

  U.pad3 = function (n) {
    var s = String(n | 0);
    while (s.length < 3) { s = "0" + s; }
    return s;
  };

  /* ---------- 相对时长格式化（监视器时间戳的「相对口径」）----------
     fmtRelative(1234.5) -> "1.235s"；超过 1 分钟改成分秒，避免数字太长挤掉内容列：
     fmtRelative(62345.6) -> "1m02.346s"
     注意：分秒口径同样保留 3 位小数——早期版本在这里把小数丢了，
     跑过 1 分钟后时间戳精度会突然从毫秒跌到整秒，看不出帧间抖动。
     先四舍五入到整毫秒再判分支，这样 59.9996s 会规规矩矩进位成 "1m00.000s"，
     而不是出现 "60.000s" 这种既违和又破坏列宽的数字。 */
  U.fmtRelative = function (ms) {
    var v = (typeof ms === "number" && isFinite(ms)) ? ms : 0;
    var sign = v < 0 ? "-" : "";
    var aMs = Math.round(Math.abs(v));
    if (aMs < 60000) { return sign + (aMs / 1000).toFixed(3) + "s"; }
    var m = Math.floor(aMs / 60000);
    var rest = aMs - m * 60000;
    return sign + m + "m" + U.pad2(Math.floor(rest / 1000)) + "." + U.pad3(rest % 1000) + "s";
  };

  /* ---------- 数值限幅 ---------- */
  U.clamp = function (v, lo, hi) {
    if (v < lo) { return lo; }
    if (v > hi) { return hi; }
    return v;
  };

  /* ---------- 数字格式化（固定小数位，NaN/Infinity 回退为 "—"） ---------- */
  U.fmt = function (v, digits) {
    if (typeof v !== "number" || !isFinite(v)) { return "—"; }
    if (digits === undefined || digits === null) { digits = 3; }
    var s = v.toFixed(digits);
    /* 去掉多余的尾随 0（保留至少 digits 为 0 时的整数形态） */
    if (digits > 0 && s.indexOf(".") >= 0) {
      s = s.replace(/0+$/, "").replace(/\.$/, "");
    }
    return s;
  };

  /* ---------- 时间戳（毫秒）----------
     优先用 performance.now()（单调，不受系统时钟调整影响）；
     数据帧的 t 一律以它为基准做相对时间轴。 */
  U.now = function () {
    if (typeof performance !== "undefined" && performance.now) { return performance.now(); }
    return Date.now();
  };

  /* ---------- 生成唯一 id（前缀 + 时间基 + 随机段） ---------- */
  var idSeq = 0;
  U.nextId = function (prefix) {
    idSeq++;
    var r = Math.floor(Math.random() * 0x10000).toString(16);
    return (prefix || "id") + "-" + idSeq.toString(36) + r;
  };

  /* ---------- 安全上下文探测 ----------
     Web Serial 只在安全上下文（HTTPS 或 localhost）下可用；
     file:// 打开时 navigator.serial 不存在或 requestPort 会抛错。 */
  U.isSecure = function () {
    if (typeof window === "undefined") { return false; }
    if (typeof window.isSecureContext === "boolean") { return window.isSecureContext; }
    var p = window.location && window.location.protocol;
    return p === "https:" || p === "http:"; /* 老内核回退：localhost 走 http */
  };

  /* ---------- 是否支持 Web Serial（只看 API 存在性，不看用途） ---------- */
  U.hasSerialApi = function () {
    return !!(typeof navigator !== "undefined" && navigator.serial && navigator.serial.requestPort);
  };

  /* ---------- 触发浏览器下载（Blob + a.download）----------
     复用站点既有习语：createObjectURL → click → 延迟 revoke，避免过早回收导致下载中断 */
  U.download = function (blob, filename) {
    if (typeof document === "undefined") { return false; }
    if (!window.Blob || !window.URL || !URL.createObjectURL) { return false; }
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename || "download";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      if (a.parentNode) { a.parentNode.removeChild(a); }
      URL.revokeObjectURL(url);
    }, 2000);
    return true;
  };

  /* ---------- 读文件为文本（用于配置 / 录制导入） ---------- */
  U.readTextFile = function (file, cb) {
    if (typeof FileReader === "undefined") { cb("当前环境不支持 FileReader", null); return; }
    var fr = new FileReader();
    fr.onload = function () { cb(null, String(fr.result)); };
    fr.onerror = function () { cb("文件读取失败", null); };
    fr.readAsText(file);
  };

  /* ---------- 判定是否为 Uint8Array（跨 iframe 也稳） ---------- */
  U.isBytes = function (v) {
    return !!v && (v instanceof Uint8Array || Object.prototype.toString.call(v) === "[object Uint8Array]");
  };

  /* ---------- 简易浅拷贝（配置快照用；只处理普通对象与数组） ---------- */
  U.clone = function (v) {
    if (v === null || typeof v !== "object") { return v; }
    if (U.isBytes(v)) { return new Uint8Array(v); }
    if (Object.prototype.toString.call(v) === "[object Array]") {
      var arr = [];
      for (var i = 0; i < v.length; i++) { arr.push(U.clone(v[i])); }
      return arr;
    }
    var o = {};
    for (var k in v) { if (Object.prototype.hasOwnProperty.call(v, k)) { o[k] = U.clone(v[k]); } }
    return o;
  };

  SL.util = U;

  /* UMD 尾：供 _本地工具/校验串口应用.js 直接 require 真实源文件（杜绝副本漂移）。
     node --check 只做语法解析；作为 ES module 解析时 typeof module 守卫安全。 */
  if (typeof module !== "undefined" && module.exports) { module.exports = SL.util; }
})(typeof window !== "undefined" ? window : globalThis);
