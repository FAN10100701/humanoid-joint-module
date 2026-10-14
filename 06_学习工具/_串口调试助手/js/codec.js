/* ============================================================
   网页端串口调试助手 · SerialLab
   模块：codec（编解码与分帧）
   职责：
     1) 字节流按分隔符（\r\n / \n / \r）切成完整行，未终结的尾巴原样留回下一次
     2) UTF-8 多字节字符被切在两个数据块之间时，不产出替换字符（U+FFFD 乱码）
     3) 按帧头 / 帧尾 / 长度字段从字节流里收帧（十六进制模式）
     4) 校验和（累加和 8/16、异或、CRC16-Modbus）
     5) 文本与字节的编码/解码（utf-8 / ascii / latin1 / utf-16le）
   依赖：util
   全部为纯函数（无隐藏状态），状态由调用方以 rest 形式自行持有——
   这一点让本模块可以被 _本地工具/校验串口应用.js 直接 require 并断言。
   ============================================================ */
;(function (global) {
  "use strict";

  var SL = global.SerialLab = global.SerialLab || {};
  var U = SL.util;

  var C = {};

  /* ------------------------------------------------------------
     1) 基础字节工具
     ------------------------------------------------------------ */

  /* 拼接两个字节数组（可传入 null 表示空） */
  C.concat = function (a, b) {
    var alen = (a && a.length) ? a.length : 0;
    var blen = (b && b.length) ? b.length : 0;
    if (alen === 0) { return b ? (b.slice ? b.slice(0) : b) : new Uint8Array(0); }
    if (blen === 0) { return a.slice(0); }
    var out = new Uint8Array(alen + blen);
    out.set(a, 0);
    out.set(b, alen);
    return out;
  };

  /* 在字节数组里查找子序列，返回起始下标；未找到返回 -1 */
  C.indexOfSeq = function (hay, needle, from) {
    if (!needle || !needle.length) { return -1; }
    var start = from || 0;
    var n = needle.length;
    var limit = hay.length - n;
    for (var i = start; i <= limit; i++) {
      var hit = true;
      for (var j = 0; j < n; j++) {
        if (hay[i + j] !== needle[j]) { hit = false; break; }
      }
      if (hit) { return i; }
    }
    return -1;
  };

  /* 小端读取无符号整数（长度字段用），最多 4 字节 */
  C.readUintLE = function (u8, offset, size) {
    var v = 0;
    for (var i = 0; i < size; i++) {
      v += (u8[offset + i] || 0) * Math.pow(256, i);
    }
    return v;
  };

  /* ------------------------------------------------------------
     2) UTF-8 多字节保护
     返回起始字节 u8[i] 处应有的完整字节数（1~4）；
     非法的起始字节（续字节 / 0xFF）按 1 处理，避免死循环。
     ------------------------------------------------------------ */
  C.classifyUtf8 = function (u8, i) {
    var b = u8[i];
    if (b < 0x80) { return 1; }              /* 0xxxxxxx ASCII */
    if ((b & 0xE0) === 0xC0) { return 2; }   /* 110xxxxx */
    if ((b & 0xF0) === 0xE0) { return 3; }   /* 1110xxxx 中文常用 */
    if ((b & 0xF8) === 0xF0) { return 4; }   /* 11110xxx emoji 等 */
    return 1;
  };

  /* 计算从头开始可安全解码的字节数（把尾部不完整的多字节序列排除在外） */
  C.decodableLen = function (u8, encoding) {
    var len = u8.length;
    if (len === 0) { return 0; }
    var enc = (encoding || "utf-8").toLowerCase();

    if (enc === "utf-16le" || enc === "utf-16") {
      return len - (len % 2);                 /* 16 位单位：奇数尾字节不可解 */
    }
    if (enc !== "utf-8" && enc !== "utf8") {
      return len;                             /* 单字节编码全部可解 */
    }

    /* UTF-8：从尾部回溯最多 3 个字节，找出最后一个字符的起始位置 */
    var start = Math.max(0, len - 4);
    for (var i = len - 1; i >= start; i--) {
      var b = u8[i];
      if ((b & 0xC0) !== 0x80) {              /* 找到非续字节 = 字符起始 */
        var need = C.classifyUtf8(u8, i);
        var have = len - i;
        if (have >= need) { return len; }     /* 该字符已完整 */
        return i;                             /* 该字符被截断，剩余部分留给下次 */
      }
    }
    return len;                               /* 4 字节内全是续字节，异常数据，放行 */
  };

  /* 解码字节为文本：返回 { text, rest }，rest 是被截断而留待下次的尾部字节 */
  C.decodeText = function (u8, encoding) {
    if (!u8 || !u8.length) { return { text: "", rest: new Uint8Array(0) }; }
    var usable = C.decodableLen(u8, encoding);
    var head = u8.subarray(0, usable);
    var rest = u8.subarray(usable);
    var enc = (encoding || "utf-8").toLowerCase();
    var text = "";

    if (enc === "utf-8" || enc === "utf8") {
      if (typeof TextDecoder !== "undefined") {
        try { text = new TextDecoder("utf-8").decode(head); }
        catch (e) { text = C._latin1Decode(head); }
      } else {
        text = C._latin1Decode(head);
      }
    } else if (enc === "utf-16le" || enc === "utf-16") {
      if (typeof TextDecoder !== "undefined") {
        try { text = new TextDecoder("utf-16le").decode(head); }
        catch (e) { text = C._latin1Decode(head); }
      } else {
        text = C._latin1Decode(head);
      }
    } else if (enc === "gbk" || enc === "gb2312" || enc === "gb18030") {
      /* GBK 系（国产传感器/PLC 中文日志最常见）。TextDecoder 的 "gbk" 与
         "gb18030" label 指向同一实现，gb18030 是超集，统一用它，个别字节
         序列在 gbk 下非法但 gb18030 能容错解出。 */
      if (typeof TextDecoder !== "undefined") {
        try { text = new TextDecoder("gb18030").decode(head); }
        catch (e) { text = C._latin1Decode(head); }
      } else {
        text = C._latin1Decode(head);
      }
    } else if (enc === "ascii") {
      var as = [];
      for (var a = 0; a < head.length; a++) { as.push(String.fromCharCode(head[a] & 0x7F)); }
      text = as.join("");
    } else {
      /* latin1：字节即码位 */
      text = C._latin1Decode(head);
    }
    return { text: text, rest: rest };
  };

  C._latin1Decode = function (u8) {
    var out = [];
    var CH = 4096;
    for (var i = 0; i < u8.length; i += CH) {
      var slice = u8.subarray(i, Math.min(i + CH, u8.length));
      out.push(String.fromCharCode.apply(null, slice));
    }
    return out.join("");
  };

  /* 文本编码为字节 */
  C.encodeText = function (str, encoding) {
    str = str === null || str === undefined ? "" : String(str);
    var enc = (encoding || "utf-8").toLowerCase();
    if (enc === "utf-8" || enc === "utf8") {
      if (typeof TextEncoder !== "undefined") { return new TextEncoder().encode(str); }
      /* 无 TextEncoder 时的兜底（沙箱环境） */
      var tmp = [];
      for (var i = 0; i < str.length; i++) {
        var cp = str.charCodeAt(i);
        if (cp < 0x80) { tmp.push(cp); }
        else if (cp < 0x800) { tmp.push(0xC0 | (cp >> 6), 0x80 | (cp & 0x3F)); }
        else { tmp.push(0xE0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F)); }
      }
      return new Uint8Array(tmp);
    }
    if (enc === "utf-16le" || enc === "utf-16") {
      var w = new Uint8Array(str.length * 2);
      for (var k = 0; k < str.length; k++) {
        var c = str.charCodeAt(k);
        w[k * 2] = c & 0xFF;
        w[k * 2 + 1] = (c >> 8) & 0xFF;
      }
      return w;
    }
    if (enc === "ascii") {
      var s2 = new Uint8Array(str.length);
      for (var m = 0; m < str.length; m++) { s2[m] = str.charCodeAt(m) & 0x7F; }
      return s2;
    }
    if (enc === "gbk" || enc === "gb2312" || enc === "gb18030") {
      /* 发送方向的 GBK 编码需要整表映射（几万条），浏览器没有 TextEncoder 对应物，
         不值得为它塞一张大表。ASCII 直通；非 ASCII 落 UTF-8 字节（接收方按 UTF-8
         也能对上），UI 侧在选 GBK 时给出「发送仅 ASCII 直通」的提示。 */
      var hasNonAscii = false;
      for (var g = 0; g < str.length; g++) { if (str.charCodeAt(g) > 0x7F) { hasNonAscii = true; break; } }
      if (!hasNonAscii) {
        var g2 = new Uint8Array(str.length);
        for (var g3 = 0; g3 < str.length; g3++) { g2[g3] = str.charCodeAt(g3) & 0x7F; }
        return g2;
      }
      return C.encodeText(str, "utf-8");
    }
    var l = new Uint8Array(str.length);
    for (var n = 0; n < str.length; n++) { l[n] = str.charCodeAt(n) & 0xFF; }
    return l;
  };

  C.bytesToHex = U.bytesToHex;
  C.hexToBytes = U.hexToBytes;

  /* ------------------------------------------------------------
     2.5) 接收方向的「编码智能识别」与「文本可疑度」评分
     背景：Web Serial 在 OS 层已按波特率完成电平采样，应用拿到的是字节流——
     编码选错可以在字节层识别修正；而波特率不匹配的字节错位发生在采样层，
     字节层无法逆推，只能「换波特率重开端口再采样」扫描比对（见 transport.scanBaudrate）。
     ------------------------------------------------------------ */

  /* 可打印占比：0x09 \t / 0x0A \n / 0x0D \r / 0x20~0x7E 视为可打印 */
  C.printableRatio = function (u8) {
    if (!u8 || !u8.length) { return 1; }
    var n = 0;
    for (var i = 0; i < u8.length; i++) {
      var b = u8[i];
      if (b === 9 || b === 10 || b === 13 || (b >= 0x20 && b <= 0x7E)) { n++; }
    }
    return n / u8.length;
  };

  /* 严格试解：TextDecoder fatal 模式下非法序列会抛异常，比非 fatal 数 U+FFFD 更可靠 */
  function tryStrictDecode(u8, label) {
    if (typeof TextDecoder === "undefined") { return null; }
    try { return new TextDecoder(label, { fatal: true }).decode(u8); }
    catch (e) { return null; }
  }

  /* 编码智能识别：对一段原始字节给出「最可能是哪种编码」的判断。
     返回 { guess, printable, detail }：
       guess = "utf-8"  严格校验通过且含多字节序列（中文等）——强信号
             = "ascii"  全部 7 位 ASCII（utf-8/gbk 解出来都一样，用 utf-8 即可）
             = "gbk"    UTF-8 严格校验失败、但 GB18030 严格校验通过——设备多半是 GBK
             = "binary" 可打印占比过低——多半是二进制协议被当文本看，建议 HEX 视图
             = "latin1" 有高位字节但两种编码都过不了——可能是被采样错位污染的字节流
                        （这正是波特率不匹配的典型表现）或自定义 8-bit 编码
       detail  给人看的判断依据说明（直接展示给用户） */
  C.analyzeEncoding = function (u8) {
    var out = { guess: "utf-8", printable: 1, detail: "" };
    if (!u8 || u8.length < 4) {
      out.detail = "样本太少，多收一些数据再识别";
      return out;
    }
    var sample = u8.length > 4096 ? u8.subarray(0, 4096) : u8;
    var pr = C.printableRatio(sample);
    out.printable = pr;

    var hasHigh = false;
    for (var i = 0; i < sample.length; i++) { if (sample[i] > 0x7F) { hasHigh = true; break; } }

    var utf8Text = null;
    var usable = C.decodableLen(sample, "utf-8");
    if (usable === sample.length) { utf8Text = tryStrictDecode(sample, "utf-8"); }

    if (utf8Text !== null) {
      if (!hasHigh) {
        out.guess = "ascii";
        out.detail = "全部是 7 位 ASCII 文本，当前编码即可正常显示";
      } else {
        out.guess = "utf-8";
        out.detail = "是合法的 UTF-8 多字节文本（含中文等非 ASCII 字符）";
      }
      return out;
    }

    /* UTF-8 严格校验失败 → 再试 GB18030（GBK 超集） */
    if (hasHigh) {
      var usableGbk = sample.length;               /* gb18030 双字节为主，尾部截断概率低，全量试 */
      var gbkText = tryStrictDecode(sample.subarray(0, usableGbk), "gb18030");
      if (gbkText !== null) {
        out.guess = "gbk";
        out.detail = "不是合法 UTF-8，但可完整按 GBK 解码——设备大概率用的是 GBK 编码";
        return out;
      }
    }

    if (pr < 0.30) {
      out.guess = "binary";
      out.detail = "可打印字符仅占 " + Math.round(pr * 100) + "%——更像二进制协议流，建议切 HEX 视图或配置帧结构解析";
    } else {
      out.guess = "latin1";
      out.detail = "高位字节按 UTF-8/GBK 都解不通——常见于波特率不匹配造成的采样错位，建议扫描波特率";
    }
    return out;
  };

  /* 文本可疑度评分（波特率扫描用）：0~1，越高越像「按该波特率采样出的正常文本」。
     组成：可打印占比(0.55) + UTF-8 严格可解(0.30) + 行结束符存在(0.15)。
     波特率不匹配的字节流通常可打印率骤降且 UTF-8 非法，得分显著低于正确档。 */
  C.plainScore = function (u8) {
    if (!u8 || !u8.length) { return 0; }
    var pr = C.printableRatio(u8);
    var s = pr * 0.55;
    var hasHigh = false;
    for (var i = 0; i < u8.length; i++) { if (u8[i] > 0x7F) { hasHigh = true; break; } }
    if (hasHigh) {
      var usable = C.decodableLen(u8, "utf-8");
      if (usable === u8.length && tryStrictDecode(u8, "utf-8") !== null) { s += 0.30; }
    } else {
      s += 0.30;                                   /* 纯 ASCII 一定合法 */
    }
    var hasEol = false;
    for (var k = 0; k < u8.length; k++) { if (u8[k] === 10 || u8[k] === 13) { hasEol = true; break; } }
    if (hasEol) { s += 0.15; }
    return Math.min(1, s);
  };


  /* ------------------------------------------------------------
     3) 行分帧
     splitLines(chunk, rest, encoding) -> { lines: [string], rest: Uint8Array }
     调用方只需把上一次返回的 rest 传回来即可，无需其它状态
     ------------------------------------------------------------ */
  C.splitLines = function (chunk, rest, encoding) {
    var all = C.concat(rest, chunk);
    var lines = [];
    var len = all.length;

    /* 先找出最后一个可确定的行边界（含行分隔符）；
       若缓冲以 \r 结尾，它可能是 \r\n 的前半，先不切，留给下一块 */
    var cut = -1;
    for (var i = 0; i < len; i++) {
      var b = all[i];
      if (b === 10) { cut = i; }                            /* \n */
      else if (b === 13) {                                  /* \r */
        if (i < len - 1) { cut = i; }
        /* i === len-1 时悬置，等下一块确认是否 \r\n */
      }
    }
    if (cut < 0) {
      return { lines: lines, rest: all };
    }

    var start = 0;
    for (var j = 0; j <= cut; j++) {
      var c = all[j];
      if (c === 10 || c === 13) {
        if (j > start) {
          var seg = all.subarray(start, j);
          var dec = C.decodeText(seg, encoding);
          lines.push(dec.text);
        } else {
          lines.push("");                                   /* 空行也保留，便于观察时序 */
        }
        if (c === 13 && all[j + 1] === 10) { j++; }         /* 吃掉 \r\n 的 \n */
        start = j + 1;
      }
    }
    return { lines: lines, rest: all.subarray(start) };
  };

  /* ------------------------------------------------------------
     4) 按规则收帧（十六进制模式）
     extractFrames(chunk, rest, rule) -> { frames: [Uint8Array], rest: Uint8Array }
     rule = { head:"AA55", tail:"", len:{offset,size,mode}, checksum:{type}, maxLen:4096 }
       len.mode: none | payload（长度字段存的是载荷长度）| total（存的是整帧长度）
       len.offset: 长度字段相对「整帧起始」的偏移（含帧头）
       checksum.type: 帧内校验和类型（none/sum8/xor8/sum16/crc16modbus）——
         非 none 时长度公式会自动加上它占用的字节数，否则带校验和的帧永远收不齐
         （也可直接传 ckSize 指定字节数）
     ------------------------------------------------------------ */
  C.extractFrames = function (chunk, rest, rule) {
    rule = rule || {};
    var all = C.concat(rest, chunk);
    var frames = [];
    var maxLen = rule.maxLen || 4096;
    var head = rule.head ? U.hexToBytes(rule.head) : null;
    var tail = rule.tail ? U.hexToBytes(rule.tail) : null;
    var hasHead = !!(head && head.length);
    var hasTail = !!(tail && tail.length);
    var lenCfg = rule.len || {};
    var hasLen = (lenCfg.mode && lenCfg.mode !== "none" && lenCfg.size > 0);
    /* 校验和占用的字节数：优先按 rule.checksum.type 推导（与解析层共用同一份规则），
       也接受调用方直接给 rule.ckSize。0 = 帧内没有校验和。 */
    var ckLen = 0;
    var ckType = rule.checksum && rule.checksum.type;
    if (ckType && ckType !== "none") { ckLen = C.checksumSize(ckType); }
    else if (rule.ckSize > 0) { ckLen = rule.ckSize; }

    var pos = 0;
    var guard = 0;

    while (pos < all.length && guard++ < 20000) {
      /* a) 定位帧头（若有） */
      if (hasHead) {
        var hi = C.indexOfSeq(all, head, pos);
        if (hi < 0) {
          /* 一个帧头都没有：保留末尾 (head.length-1) 个字节（可能是被切断的帧头） */
          var keep = Math.min(all.length, head.length - 1);
          pos = all.length - keep;
          break;
        }
        pos = hi;
      }

      /* b) 计算本帧长度 */
      var frameLen = 0;
      if (hasLen) {
        var needEnd = pos + lenCfg.offset + lenCfg.size;
        if (needEnd > all.length) { break; }                 /* 长度字段还没到齐 */
        var v = C.readUintLE(all, pos + lenCfg.offset, lenCfg.size);
        if (lenCfg.mode === "total") {
          frameLen = v;
        } else {
          /* 载荷长度：长度字段之前的字节（offset）+ 长度字段自身（size）+ 载荷（v）
             + 帧尾 + 校验和。
             注意 offset 是「相对整帧起始（含帧头）」的偏移，所以这里是 offset 而不是
             head.length + offset —— 早期版本多加了 head.length，导致带帧头 + 长度字段 +
             校验和的帧永远收不齐（演示帧 AA55 就是这种情况）。 */
          frameLen = lenCfg.offset + lenCfg.size + v + (hasTail ? tail.length : 0) + ckLen;
        }
        if (!(frameLen > 0) || frameLen > maxLen) { pos++; continue; }   /* 长度非法：跳一字节重找 */
      } else if (hasTail) {
        var searchFrom = pos + (hasHead ? head.length : 0);
        var ti = C.indexOfSeq(all, tail, searchFrom);
        if (ti < 0) { break; }                                /* 帧尾未到 */
        frameLen = ti + tail.length - pos;
      } else {
        break;                                                /* 既无长度也无帧尾，无法定界 */
      }

      if (pos + frameLen > all.length) { break; }             /* 不足一帧，等下一块 */
      frames.push(all.slice(pos, pos + frameLen));
      pos += frameLen;
    }

    return { frames: frames, rest: all.slice(pos) };
  };

  /* ------------------------------------------------------------
     5) 校验和
     from/to 为帧内字节下标；to = -1 表示到帧末尾
     ------------------------------------------------------------ */
  function sliceRange(u8, from, to) {
    var a = from < 0 ? 0 : from;
    var b = (to === -1 || to === undefined || to === null) ? u8.length - 1 : to;
    if (a > b || a >= u8.length) { return { a: 0, b: -1 }; }
    if (b > u8.length - 1) { b = u8.length - 1; }
    return { a: a, b: b };
  }

  C.sum8 = function (u8, from, to) {
    var r = sliceRange(u8, from, to), s = 0;
    for (var i = r.a; i <= r.b; i++) { s = (s + u8[i]) & 0xFF; }
    return s;
  };

  C.xor8 = function (u8, from, to) {
    var r = sliceRange(u8, from, to), s = 0;
    for (var i = r.a; i <= r.b; i++) { s = (s ^ u8[i]) & 0xFF; }
    return s;
  };

  C.sum16 = function (u8, from, to) {
    var r = sliceRange(u8, from, to), s = 0;
    for (var i = r.a; i <= r.b; i++) { s = (s + u8[i]) & 0xFFFF; }
    return s;
  };

  /* CRC16-Modbus：多项式 0xA001（反射），初值 0xFFFF */
  C.crc16Modbus = function (u8, from, to) {
    var r = sliceRange(u8, from, to);
    var crc = 0xFFFF;
    for (var i = r.a; i <= r.b; i++) {
      crc ^= u8[i] & 0xFF;
      for (var bit = 0; bit < 8; bit++) {
        if (crc & 1) { crc = (crc >> 1) ^ 0xA001; }
        else { crc = crc >> 1; }
      }
    }
    return crc & 0xFFFF;
  };

  /* 按类型名统一调用，返回 null 表示类型未知 */
  C.checksum = function (type, u8, from, to) {
    switch (type) {
      case "sum8": return C.sum8(u8, from, to);
      case "xor8": return C.xor8(u8, from, to);
      case "sum16": return C.sum16(u8, from, to);
      case "crc16modbus": return C.crc16Modbus(u8, from, to);
      default: return null;
    }
  };

  /* 校验和占用的字节数 */
  C.checksumSize = function (type) {
    return type === "sum8" || type === "xor8" ? 1 : 2;
  };

  SL.codec = C;

  /* UMD 尾：供校验脚本 require 真实源文件 */
  if (typeof module !== "undefined" && module.exports) { module.exports = SL.codec; }
})(typeof window !== "undefined" ? window : globalThis);
