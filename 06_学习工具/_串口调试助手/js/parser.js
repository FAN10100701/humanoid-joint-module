/* ============================================================
   网页端串口调试助手 · SerialLab
   模块：parser（协议解析）
   职责：
     1) 文本解析：从一行文本里抽取所有 key=value / key:value 数值对
        （等号与冒号都支持，对齐 SerialWeb 2.0 的文本解析口径）
     2) 十六进制结构表解析：按字段表（偏移/类型/长度/缩放/字节序）解出各通道数值，
        并校验帧内校验和
     3) 后缀数字通道绑定：temp1 / temp2 保留后缀作为独立通道
   依赖：util、codec（校验和与字节工具）
   全部纯函数，可被校验脚本直接 require 断言。
   ============================================================ */
;(function (global) {
  "use strict";

  var SL = global.SerialLab = global.SerialLab || {};
  var U = SL.util;
  var C = SL.codec;

  var P = {};

  var DEFAULT_NUMBER = "[-+]?\\d*\\.?\\d+(?:[eE][-+]?\\d+)?";
  var DEFAULT_SEPS = ["=", ":"];
  var KEY_RE_SRC = "([A-Za-z_][A-Za-z0-9_\\-\\.]*)\\s*";

  /* ------------------------------------------------------------
     1) 规则规范化
     ------------------------------------------------------------ */
  P.compileText = function (rule) {
    rule = rule || {};
    var seps = (rule.seps && rule.seps.length) ? rule.seps.slice(0) : DEFAULT_SEPS.slice(0);
    /* 转成正则字符类内容，转义字符类里的元字符 */
    var cls = "";
    for (var i = 0; i < seps.length; i++) {
      var s = String(seps[i]);
      var esc = "";
      for (var j = 0; j < s.length; j++) {
        var ch = s.charAt(j);
        esc += ("\\]\\[\\^\\-\\\\".indexOf(ch) >= 0) ? ("\\" + ch) : ch;
      }
      cls += esc;
    }
    return {
      seps: seps,
      sepClass: cls || "=:",
      number: rule.number || DEFAULT_NUMBER,
      suffixChannels: rule.suffixChannels !== false,
      trim: rule.trim !== false
    };
  };

  P.DEFAULT_NUMBER = DEFAULT_NUMBER;

  /* ------------------------------------------------------------
     2) 文本行解析
     parseText("temp=25.3, cur:1.02") -> { values:{temp:25.3,cur:1.02}, pairs:[...] }
     一个数值对也不含时返回空结果（调用方仍可把它当纯文本显示）
     ------------------------------------------------------------ */
  P.parseText = function (line, rule) {
    var r = P.compileText(rule);
    var values = {};
    var pairs = [];
    if (line === null || line === undefined) { return { values: values, pairs: pairs }; }

    var text = String(line);
    var keyRe;
    try {
      keyRe = new RegExp(KEY_RE_SRC + "[" + r.sepClass + "]\\s*", "g");
    } catch (e) {
      keyRe = new RegExp(KEY_RE_SRC + "[=:]\\s*", "g");
    }
    var numRe;
    try {
      numRe = new RegExp("^" + r.number);
    } catch (e2) {
      numRe = new RegExp("^" + DEFAULT_NUMBER);
    }

    var m;
    var guard = 0;
    while ((m = keyRe.exec(text)) !== null && guard++ < 5000) {
      var key = m[1];
      var rest = text.slice(keyRe.lastIndex);
      var nm = rest.match(numRe);
      if (!nm) {
        /* 键后面不是数值（例如 "[INFO] temp: ready"）——跳过，继续找下一个键 */
        continue;
      }
      var raw = nm[0];
      var val = parseFloat(raw);
      if (isFinite(val)) {
        values[key] = val;
        pairs.push({ key: key, value: val, raw: raw });
      }
      /* 手动推进匹配位置，避免把刚读掉的数值再当成键的一部分 */
      keyRe.lastIndex += raw.length;
    }
    return { values: values, pairs: pairs };
  };

  /* ------------------------------------------------------------
     3) 后缀数字拆分
     "temp12" -> { base:"temp", index:12, hasSuffix:true }
     便于把 temp1/temp2 显示成「温度 1 / 温度 2」
     ------------------------------------------------------------ */
  P.splitSuffix = function (key) {
    var s = String(key || "");
    var m = s.match(/^(.*?)(\d+)$/);
    if (!m || !m[1]) { return { base: s, index: 0, hasSuffix: false }; }
    return { base: m[1], index: parseInt(m[2], 10), hasSuffix: true };
  };

  /* 通道绑定：默认保留后缀为独立通道名（行为可测、无歧义）
     opts.aggregate = true 时把 temp1/temp2 归到基名 temp 的第 1/2 路 */
  P.bindChannels = function (pairs, opts) {
    opts = opts || {};
    var out = [];
    for (var i = 0; i < pairs.length; i++) {
      var key = pairs[i].key;
      var sp = P.splitSuffix(key);
      if (opts.aggregate && sp.hasSuffix) {
        out.push({ key: key, channel: sp.base, lane: sp.index, label: sp.base + " #" + sp.index });
      } else {
        out.push({ key: key, channel: key, lane: 1, label: key });
      }
    }
    return out;
  };

  /* ------------------------------------------------------------
     4) 十六进制结构表解析
     rule = {
       head:"AA55", tail:"",
       len:{offset,size,mode},
       fields:[{key,type,offset,size,scale,big}],
       checksum:{type,from,to}
     }
     返回 { ok, values, checksum:{ok,expect,got}, reason }
     任何越界都返回 ok:false 而不是抛异常——渲染层必须零崩溃。
     ------------------------------------------------------------ */
  P.readField = function (u8, f) {
    var off = f.offset | 0;
    var size = f.size | 0;
    var type = f.type || ("uint" + (size * 8));
    var big = !!f.big;

    if (off < 0 || size <= 0 || off + size > u8.length) { return null; }

    var i, v;
    switch (type) {
      case "int8":
        v = u8[off];
        return v > 127 ? v - 256 : v;
      case "uint8":
        return u8[off];
      case "float32":
        if (size !== 4) { return null; }
        if (typeof DataView !== "undefined") {
          try {
            var dv = new DataView(u8.buffer, u8.byteOffset + off, 4);
            return dv.getFloat32(0, !big);
          } catch (e) { return null; }
        }
        return null;
      case "int16":
      case "uint16":
      case "int32":
      case "uint32":
        v = 0;
        if (big) {
          for (i = 0; i < size; i++) { v = v * 256 + u8[off + i]; }
        } else {
          for (i = size - 1; i >= 0; i--) { v = v * 256 + u8[off + i]; }
        }
        /* 有符号类型做二补码还原 */
        if (type === "int16" || type === "int32") {
          var bits = size * 8;
          var limit = Math.pow(2, bits - 1);
          if (v >= limit) { v -= Math.pow(2, bits); }
        }
        return v;
      default:
        /* 未知类型按无符号整数处理，至少不让整帧作废 */
        v = 0;
        for (i = 0; i < size; i++) { v = v * 256 + u8[off + i]; }
        return v;
    }
  };

  P.parseHexFrame = function (u8, rule) {
    rule = rule || {};
    var out = { ok: false, values: {}, checksum: null, reason: "" };
    if (!u8 || !u8.length) { out.reason = "空帧"; return out; }

    var fields = rule.fields || [];
    var ck = rule.checksum || { type: "none" };
    var csLen = (ck.type && ck.type !== "none") ? C.checksumSize(ck.type) : 0;
    var dataEnd = u8.length - csLen;          /* 校验和之前的字节数 */

    if (dataEnd <= 0) { out.reason = "帧太短"; return out; }

    /* 1) 逐字段解码 */
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (!f || !f.key) { continue; }
      var raw = P.readField(u8, f);
      if (raw === null) {
        out.reason = "字段「" + f.key + "」越界（帧长 " + u8.length + "）";
        return out;
      }
      var scale = (typeof f.scale === "number" && isFinite(f.scale)) ? f.scale : 1;
      out.values[f.key] = raw * scale;
    }

    /* 2) 校验和 */
    if (csLen > 0) {
      var from = (typeof ck.from === "number") ? ck.from : 0;
      var to = (typeof ck.to === "number") ? ck.to : -1;
      if (to === -1) { to = dataEnd - 1; }
      var expect = C.checksum(ck.type, u8, from, to);
      var got = C.readUintLE(u8, dataEnd, csLen);
      out.checksum = { ok: expect === got, expect: expect, got: got };
      out.ok = out.checksum.ok;
      if (!out.ok) { out.reason = "校验和不匹配"; }
    } else {
      out.ok = true;
    }
    return out;
  };

  /* ------------------------------------------------------------
     5) 统一入口：按当前激活模式解析一帧/一行
     返回 { ok, values, pairs, checksum, reason }
     ------------------------------------------------------------ */
  P.parse = function (payload, rule) {
    rule = rule || {};
    var mode = rule.mode || "text";
    if (mode === "hex") {
      return P.parseHexFrame(payload, rule);
    }
    var line = (typeof payload === "string") ? payload : C.decodeText(payload, rule.encoding || "utf-8").text;
    var r = P.parseText(line, rule.text || rule);
    return { ok: true, values: r.values, pairs: r.pairs, checksum: null, reason: "" };
  };

  SL.parser = P;

  /* UMD 尾：供校验脚本 require 真实源文件 */
  if (typeof module !== "undefined" && module.exports) { module.exports = SL.parser; }
})(typeof window !== "undefined" ? window : globalThis);
