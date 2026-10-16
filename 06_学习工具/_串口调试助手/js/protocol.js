/* ============================================================
   网页端串口调试助手 · SerialLab
   模块：protocol（协议栈分析：Modbus RTU / 协议识别 / 帧级 diff）

   为什么是一个「不碰 DOM 的纯模块」：
     同一份实现要同时给三个地方用 —— 网页里的「协议分析」弹窗、
     AI 调试包里的结论、以及本地桥（bridge.mjs 直接 require 本文件）。
     若在 UI 里另写一份解析，立刻就有两个口径（子应用硬规则 17）。

   依赖：codec（校验和）、util（HEX 编解码）。不依赖 core / DOM。
   ============================================================ */
;(function (global) {
  "use strict";

  var SL = global.SerialLab = global.SerialLab || {};
  var C = SL.codec;
  var U = SL.util;

  var P = {};

  /* ---------------------------------------------------------------- 工具 */
  function u16be(u8, i) { return ((u8[i] & 0xFF) << 8) | (u8[i + 1] & 0xFF); }

  function pad4(v) {
    var s = (v & 0xFFFFFFFF).toString(16).toUpperCase();
    while (s.length < 4) { s = "0" + s; }
    return s;
  }

  /* Modbus RTU 帧尾 CRC：低字节在前（这也是新手最容易反的一处） */
  function frameCrcOk(u8, from, to) {
    if (to - from + 1 < 4) { return false; }
    var want = (u8[to - 1] & 0xFF) | ((u8[to] & 0xFF) << 8);
    return C.crc16Modbus(u8, from, to - 2) === want;
  }

  /* 功能码 → 名称（0x80 位表示异常响应） */
  var FC_NAMES = {
    1: "读线圈 (01)", 2: "读离散输入 (02)", 3: "读保持寄存器 (03)", 4: "读输入寄存器 (04)",
    5: "写单个线圈 (05)", 6: "写单个寄存器 (06)",
    15: "写多个线圈 (0F)", 16: "写多个寄存器 (10)",
    23: "读/写多个寄存器 (17)", 24: "读 FIFO 队列 (18)"
  };
  P.fcNames = FC_NAMES;

  var EXC = {
    1: "非法功能码", 2: "非法数据地址", 3: "非法数据值", 4: "从站设备故障",
    5: "确认（已接受，正在处理）", 6: "从站设备忙", 8: "存储奇偶校验错",
    10: "网关路径不可用", 11: "网关目标设备无响应"
  };
  P.exceptions = EXC;

  /* 帧长推导：同一个功能码，请求与响应长度不同（03 请求 8 字节 / 响应 5+2N 字节），
     所以只看字节流是分不出来的 —— 必须两种都试、用 CRC 决定采信哪个。 */
  function lenFromFc(u8, i, asResponse) {
    if (i + 2 > u8.length) { return 0; }
    var fc = u8[i + 1] & 0xFF;
    if (fc & 0x80) { return 5; }                          /* 异常响应固定 5 字节 */
    if (fc === 1 || fc === 2 || fc === 3 || fc === 4) {
      return asResponse ? (i + 3 <= u8.length ? 5 + (u8[i + 2] & 0xFF) : 0) : 8;
    }
    if (fc === 5 || fc === 6) { return 8; }
    if (fc === 15 || fc === 16) {
      return asResponse ? 8 : (i + 7 <= u8.length ? 9 + (u8[i + 6] & 0xFF) : 0);
    }
    if (fc === 23 || fc === 24) {
      return asResponse ? (i + 3 <= u8.length ? 5 + (u8[i + 2] & 0xFF) : 0) : 13;
    }
    return 0;
  }

  /* 解一帧的字段（人类可读） */
  function decodeFrame(u8, at, len, kind) {
    var f = { at: at, len: len, kind: kind, crcOk: true, addr: u8[at] & 0xFF, fc: u8[at + 1] & 0xFF };
    f.hex = U.bytesToHex(u8.subarray(at, at + len));
    f.fcName = FC_NAMES[f.fc & 0x7F] || ("功能码 " + (f.fc & 0x7F) + "（未收录）");

    if (f.fc & 0x80) {
      var code = u8[at + 2] & 0xFF;
      f.isException = true;
      /* 异常响应是「设备在正常情况下拒绝你」，不是通信故障 —— 值得单独说清楚 */
      f.detail = "异常响应：" + (EXC[code] || ("异常码 " + code));
      return f;
    }

    var base = f.fc;
    if (base === 1 || base === 2) {
      if (kind === "请求") {
        f.start = u16be(u8, at + 2); f.count = u16be(u8, at + 4);
        f.detail = "读" + (base === 1 ? "线圈" : "离散输入") + " 起始 " + f.start + " 共 " + f.count + " 个";
      } else {
        f.byteCount = u8[at + 2] & 0xFF;
        var bits = [];
        for (var b = 0; b < f.byteCount && at + 3 + b < at + len - 2; b++) {
          for (var k = 0; k < 8; k++) { bits.push(((u8[at + 3 + b] >> k) & 1) ? 1 : 0); }
        }
        f.bits = bits;
        f.detail = "返回 " + f.byteCount + " 字节位数据，" + bits.length + " 个状态位";
      }
      return f;
    }
    if (base === 3 || base === 4) {
      if (kind === "请求") {
        f.start = u16be(u8, at + 2); f.count = u16be(u8, at + 4);
        f.detail = "读" + (base === 3 ? "保持" : "输入") + "寄存器 起始 " + f.start + " 共 " + f.count + " 个（" + f.count + " 个 uint16）";
      } else {
        f.byteCount = u8[at + 2] & 0xFF;
        f.regs = [];
        /* r 是「第几个寄存器」，偏移才是 2r —— 别把两者混在一起写边界（会把寄存器数算少一半）。
           载荷最后一个字节在 at+len-3（后面两字节是 CRC），所以读 2 字节的位置上限是 at+len-3。 */
        var regCount = f.byteCount >> 1;
        for (var r = 0; r < regCount; r++) {
          var off = at + 3 + 2 * r;
          if (off + 1 > at + len - 3) { break; }
          f.regs.push(u16be(u8, off));
        }
        f.detail = "返回 " + f.byteCount + " 字节 = " + f.regs.length + " 个寄存器：[" + f.regs.join(", ") + "]";
      }
      return f;
    }
    if (base === 5) {
      f.coil = u16be(u8, at + 2); f.value = u16be(u8, at + 4);
      f.detail = "写单个线圈 " + f.coil + " = " + (f.value === 0xFF00 ? "ON" : f.value === 0x0000 ? "OFF" : ("0x" + f.value.toString(16)));
      return f;
    }
    if (base === 6) {
      f.reg = u16be(u8, at + 2); f.value = u16be(u8, at + 4);
      f.detail = "写单个寄存器 " + f.reg + " = " + f.value;
      return f;
    }
    if (base === 15 || base === 16) {
      if (kind === "请求") {
        f.start = u16be(u8, at + 2); f.count = u16be(u8, at + 4); f.byteCount = u8[at + 6] & 0xFF;
        f.detail = "写" + (base === 15 ? "多个线圈" : "多个寄存器") + " 起始 " + f.start + " 共 " + f.count + " 个（" + f.byteCount + " 字节数据）";
      } else {
        f.start = u16be(u8, at + 2); f.count = u16be(u8, at + 4);
        f.detail = "已写入 起始 " + f.start + " 共 " + f.count + " 个";
      }
      return f;
    }
    f.detail = "（该功能码未做详细解码，载荷 " + Math.max(0, len - 4) + " 字节）";
    return f;
  }

  /* ---------------------------------------------------------------- Modbus RTU */
  /* 从一段原始字节里切出 Modbus RTU 帧并逐帧解码。
     返回值里 frames 里每项都带 crcOk；bad 是重同步时丢掉的字节数。 */
  P.modbus = function (u8) {
    var out = { frames: [], bad: 0, bytes: u8.length, ok: 0, fail: 0 };
    var i = 0;
    while (i + 4 <= u8.length) {
      var hit = null, hitLen = 0, hitKind = "";
      var kinds = ["响应", "请求"];
      for (var t = 0; t < 2; t++) {
        var L = lenFromFc(u8, i, kinds[t] === "响应");
        if (L >= 4 && i + L <= u8.length && frameCrcOk(u8, i, i + L - 1)) {
          hit = true; hitLen = L; hitKind = kinds[t]; break;
        }
      }
      if (hit) {
        var fr = decodeFrame(u8, i, hitLen, hitKind);
        fr.index = out.frames.length + 1;
        out.frames.push(fr);
        out.ok++;
        i += hitLen;
        continue;
      }
      /* CRC 不对但长度合法：当成坏帧报出来（比一路重同步有用 —— 现场多数是「差一个字节」） */
      var L2 = lenFromFc(u8, i, true);
      if (L2 < 4) { L2 = lenFromFc(u8, i, false); }
      if (L2 >= 4 && i + L2 <= u8.length) {
        var bad = decodeFrame(u8, i, L2, "?");
        bad.crcOk = false;
        bad.index = out.frames.length + 1;
        var want = C.crc16Modbus(u8, i, i + L2 - 3);
        /* 补零到 4 位：CRC 是 16 位，显示成 0x800 会让人以为是 12 位 */
        bad.crcWant = "0x" + pad4(want);
        bad.crcGot = "0x" + pad4((u8[i + L2 - 2] & 0xFF) | ((u8[i + L2 - 1] & 0xFF) << 8));
        bad.detail = "CRC 不匹配（算出 " + bad.crcWant + "，帧里是 " + bad.crcGot + "）";
        out.frames.push(bad);
        out.fail++;
        i += L2;
        continue;
      }
      out.bad++;
      i++;
    }
    if (i < u8.length) { out.bad += (u8.length - i); }
    return out;
  };

  /* Modbus 请求 ↔ 响应配对：现场最常问的一句是「我发的和它回的是不是一对」。
     按「同地址 + 同功能码 + 次序」配对，并指出响应是否异常。 */
  P.modbusPairs = function (frames) {
    var pairs = [], pending = null;
    for (var i = 0; i < frames.length; i++) {
      var f = frames[i];
      if (f.kind === "请求") {
        if (pending) { pairs.push({ req: pending, res: null, note: "这条请求没有收到响应" }); }
        pending = f;
      } else if (f.kind === "响应") {
        if (!pending) { pairs.push({ req: null, res: f, note: "先收到响应（或这是从站主动上报）" }); }
        else if (pending.addr !== f.addr) { pairs.push({ req: pending, res: f, note: "地址不一致：请求 " + pending.addr + " / 响应 " + f.addr }); pending = null; }
        else if ((pending.fc & 0x7F) !== (f.fc & 0x7F)) { pairs.push({ req: pending, res: f, note: "功能码不一致：请求 " + pending.fc + " / 响应 " + f.fc }); pending = null; }
        else { pairs.push({ req: pending, res: f, note: f.isException ? ("从站拒绝：" + f.detail) : "配对正常" }); pending = null; }
      }
    }
    if (pending) { pairs.push({ req: pending, res: null, note: "这条请求没有收到响应" }); }
    return pairs;
  };

  /* ---------------------------------------------------------------- 协议识别 */
  /* 从一段字节里猜协议。返回按得分排序的候选，每项都带「为什么」——
     不给理由的识别结果对排障没用（用户没法判断该不该信）。 */
  P.guess = function (u8) {
    var out = [], n = u8.length;
    if (!n) { return { ranked: [], note: "没有字节可分析" }; }

    /* ① Modbus RTU：能切出至少一帧且 CRC 通过 */
    var m = P.modbus(u8);
    if (m.ok > 0) {
      var rate = m.ok / (m.ok + m.fail);
      out.push({ id: "modbus-rtu", label: "Modbus RTU", score: Math.round(60 + 35 * rate),
        why: "切出 " + m.ok + " 帧且 CRC 全部通过" + (m.fail ? ("（另有 " + m.fail + " 帧 CRC 不对）") : "") });
    } else if (m.frames.length) {
      out.push({ id: "modbus-rtu", label: "Modbus RTU（可疑）", score: 35,
        why: "长度看起来像 Modbus 帧，但 CRC 全不匹配 —— 可能字节被截断/偏移，或从站用了别的校验" });
    }

    /* ② 文本 key=value：可打印比例高，且出现 = 或 : 分隔 */
    var printable = 0, sep = 0, atHead = 0;
    for (var i = 0; i < n; i++) {
      var c = u8[i];
      if (c === 9 || c === 10 || c === 13 || (c >= 32 && c <= 126) || c >= 0x80) { printable++; }
      if (c === 0x3D || c === 0x3A) { sep++; }
    }
    if (u8[0] === 0x41 && u8[1] === 0x54) { atHead = 1; }
    var pr = printable / n;
    if (pr > 0.9 && sep > 0) {
      out.push({ id: "text-kv", label: "文本键值（key=value）", score: Math.round(70 + 25 * pr),
        why: "可打印字节占 " + Math.round(pr * 100) + "%，出现 " + sep + " 个 =/: 分隔符 —— 与 FireWater/Teleplot 一类文本协议吻合" });
    } else if (pr > 0.9) {
      out.push({ id: "text", label: "纯文本（无分隔符）", score: 60,
        why: "可打印字节占 " + Math.round(pr * 100) + "%，但没有 =/: —— 可能是不带键名的日志" });
    }
    if (atHead) {
      out.push({ id: "at", label: "AT 指令", score: 80, why: "以 'AT' 开头" });
    }

    /* ③ AA 55 帧头（本应用的示例自定义帧，也是嵌入式里最常见的同步字之一） */
    if (n >= 2 && u8[0] === 0xAA && u8[1] === 0x55) {
      out.push({ id: "aa55", label: "AA55 定长帧", score: 75, why: "以 AA 55 同步字开头" });
    }

    /* ④ JustFloat / 匿名 V1.0：长度是 4 的倍数且含合理范围的 float32 */
    if (n >= 4 && n % 4 === 0) {
      var plausible = 0, total = Math.floor(n / 4);
      for (var j = 0; j + 4 <= n; j += 4) {
        var v;
        try { v = new DataView(u8.buffer, u8.byteOffset + j, 4).getFloat32(0, true); } catch (e) { v = NaN; }
        if (isFinite(v) && Math.abs(v) < 1e6) { plausible++; }
      }
      if (total && plausible / total > 0.8) {
        out.push({ id: "justfloat", label: "JustFloat / 匿名 V1.0（小端 float32）", score: 55 + Math.round(20 * plausible / total),
          why: n + " 字节是 4 的倍数，且 " + plausible + "/" + total + " 组解出的单精度数在合理范围内" });
      }
    }

    /* ⑤ 全是 0x00 或 0xFF：多半是接线/波特率问题，不是协议问题 */
    var zeros = 0, ffs = 0;
    for (var z = 0; z < n; z++) { if (u8[z] === 0) { zeros++; } if (u8[z] === 0xFF) { ffs++; } }
    if (zeros === n || ffs === n) {
      out.push({ id: "idle", label: "全 0 或全 FF（没有真实数据）", score: 90,
        why: "整段都是同一种字节 —— 更像接线（TX/RX 接反或悬空）、波特率不匹配，而不是协议问题" });
    }

    out.sort(function (a, b) { return b.score - a.score; });
    return { ranked: out, bytes: n };
  };

  /* ---------------------------------------------------------------- 帧级 diff */
  /* 两帧字节级对比：现场排障最有效的一招是「拿一帧好的和一帧坏的比」。
     除了差异位置，还给出「长度是否相同」与「共同前缀」——
     很多 bug 的表现就是「前面都一样，从第 N 字节开始错」。 */
  P.diff = function (a, b) {
    var n = Math.max(a.length, b.length), diffs = [];
    var commonPrefix = 0;
    while (commonPrefix < Math.min(a.length, b.length) && a[commonPrefix] === b[commonPrefix]) { commonPrefix++; }
    for (var i = 0; i < n; i++) {
      var x = i < a.length ? (a[i] & 0xFF) : null;
      var y = i < b.length ? (b[i] & 0xFF) : null;
      if (x !== y) { diffs.push({ at: i, a: x, b: y }); }
    }
    return {
      lenA: a.length, lenB: b.length, sameLength: a.length === b.length,
      commonPrefix: commonPrefix, diffs: diffs, same: n - diffs.length, total: n
    };
  };

  /* 一行结论（给面板 / 调试包 / AI 直接引用，避免各处各写一遍措辞） */
  P.summarize = function (u8) {
    var g = P.guess(u8);
    if (!g.ranked.length) { return "未识别出已知协议（" + u8.length + " 字节）"; }
    var top = g.ranked[0];
    return "最可能是 " + top.label + "（置信 " + top.score + "%）：" + top.why;
  };

  SL.protocol = P;
  if (typeof module !== "undefined" && module.exports) { module.exports = P; }
})(typeof window !== "undefined" ? window : globalThis);
