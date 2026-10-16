/* 校验串口应用.js — 串口调试助手子应用的自检(06_学习工具/_串口调试助手)
   为什么要单独有这一份:该目录以 _ 开头,被站点自检的可索引页过滤豁免,
   其中的 HTML 不进 C1 内联脚本语法检查、也不进 E2E 逐页 smoke。
   于是纯函数与帧管线的回归必须由本脚本承担(直接 require 子应用的真源文件,不抄副本)。
   覆盖:
     ① util   十六进制互转 / 转义
     ② codec  UTF-8 多字节切分保护 / 按行分帧 / 帧头帧尾长度定界 / 四种校验和(另可选无)
     ③ expr   表达式求值白名单(未绑定标识符与函数调用必须被拒)
     ④ fft    已知频率正弦的峰值频率与幅值
     ⑤ parser 文本解析 / 后缀通道 / 结构表字段解码 / 越界不抛异常
     ⑥ transport 连接状态机 / open 参数映射
     ⑦ plugins   描述符校验归一化(未知渲染器降级、量程与公式修正) / 面板包版本闸门
     ⑧ exporters CSV 引号转义 / BOM / 配置版本闸门
     ⑨ datastore 环形缓冲绕回与统计 / 原始记录容量
     ⑩ timeline  录制序列化往返 / kind 与版本闸门
     ⑪ demo      规则驱动的演示帧（自定义帧头/长度/校验/字段表自洽 + 回退口径）
     ⑫ 端到端   用演示源真源构造的帧,必须恰好被收帧函数收齐并被结构表解出原值
     ⑬ 预设     四套内置开源协议(文本/二进制)各自能被自身规则解出预期值
     ⑭ 兼容     fmtRelative 等时间格式的进位与非法输入兜底
     ⑮ 调试包   debugBundle 字段齐全 / 摘要段落 / 收发与失败计数（AI 读数据的交付面）
     ⑯ 契约     按 debug-bundle.schema.json 反向校验实现产出（防 schema 与代码漂移）
                 + 记录上限「单一来源」断言（数据仓容量为唯一权威，时间线跟随，防 A-81 复现）
   运行: node _本地工具\校验串口应用.js     期望输出 SERIAL OK(退出码 0)
*/
"use strict";

const path = require("path");
const fs = require("fs");
const JS = path.join(__dirname, "..", "06_学习工具", "_串口调试助手", "js");

/* 按依赖顺序加载真源文件:模块把接口挂在 globalThis.SerialLab 上,
   同时导出 module.exports(这里用不上返回值,只为触发副作用与语法解析) */
["util", "core", "codec", "expr", "fft", "parser", "datastore",
 "transport", "plugins", "timeline", "exporters", "views", "aichan"].forEach(function (n) {
  require(path.join(JS, n + ".js"));
});

const SL = globalThis.SerialLab;
const U = SL.util, core = SL.core, C = SL.codec, E = SL.expr, F = SL.fft,
      Parser = SL.parser, Store = SL.datastore, Tpt = SL.transport,
      Plugins = SL.plugins, Timeline = SL.timeline, X = SL.exporters;

let fails = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log("PASS  " + name);
  } else {
    fails++;
    console.log("FAIL  " + name + (detail !== undefined ? "  (" + detail + ")" : ""));
  }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

/* ============================================================
   ① util
   ============================================================ */
check("util: hexToBytes 容忍空格/0x 前缀", (() => {
  const b = U.hexToBytes("0xAA 55,01\n");
  return b && b.length === 3 && b[0] === 0xAA && b[1] === 0x55 && b[2] === 0x01;
})());
check("util: hexToBytes 奇数位返回 null(不猜)", U.hexToBytes("AA5") === null);
check("util: hexToBytes 非法字符返回 null", U.hexToBytes("AAZZ") === null);
check("util: hexToBytes 空串返回空数组", (() => { const b = U.hexToBytes(""); return b && b.length === 0; })());
check("util: bytesToHex 往返一致", U.bytesToHex(U.hexToBytes("00 FF 7A")) === "00 FF 7A");
check("util: esc 转义尖括号与引号", U.esc('<a href="x">') === "&lt;a href=&quot;x&quot;&gt;");

/* ============================================================
   ② codec
   ============================================================ */
/* UTF-8 三字节字符「中」= E4 B8 AD，被切成 [E4] + [B8 AD] 时不得出现替换字符 */
const zh = new Uint8Array([0xE4, 0xB8, 0xAD]);
const d1 = C.decodeText(zh.subarray(0, 1), "utf-8");
const d2 = C.decodeText(C.concat(d1.rest, zh.subarray(1)), "utf-8");
check("codec: UTF-8 多字节被切断时不产出 U+FFFD",
  d1.text === "" && d1.rest.length === 1 && d2.text === "中" && d2.rest.length === 0,
  JSON.stringify({ t1: d1.text, r1: d1.rest.length, t2: d2.text, r2: d2.rest.length }));

/* 按行分帧：末尾 \r 必须悬置到下一块（可能是 \r\n 的前半）
   注意 rest 里除了悬置的 \r 之外，还会带上它后面那行尚未结束的内容（这里是 "b\r"） */
const lines = C.splitLines(C.encodeText("a\r\nb\r", "utf-8"), new Uint8Array(0), "utf-8");
const lines2 = C.splitLines(C.concat(lines.rest, C.encodeText("\nc\n", "utf-8")), new Uint8Array(0), "utf-8");
check("codec: splitLines 跨块处理 \\r\\n 且悬置块尾 \\r",
  lines.lines.length === 1 && lines.lines[0] === "a" &&
  C.decodeText(lines.rest, "utf-8").text === "b\r" &&
  lines2.lines.join("|") === "b|c" && lines2.rest.length === 0,
  JSON.stringify({ l1: lines.lines, r1: C.decodeText(lines.rest, "utf-8").text, l2: lines2.lines, r2: lines2.rest.length }));

/* 演示 HEX 帧（与 transport 真源同源构造）：AA 55 | seq | len | 6B 载荷 | sum8 = 11 字节 */
const demoRule = Tpt.demoHexRule();
const demoFrame = Tpt.buildDemoHexFrame(0, 0);
check("codec: 演示帧长度 11 字节且帧头 AA 55", demoFrame.length === 11 && demoFrame[0] === 0xAA && demoFrame[1] === 0x55,
  "len=" + demoFrame.length);

const ex1 = C.extractFrames(demoFrame, new Uint8Array(0), demoRule);
check("codec: 长度字段定界恰好收齐一帧（含校验和字节数）",
  ex1.frames.length === 1 && ex1.frames[0].length === 11 && ex1.rest.length === 0,
  JSON.stringify({ frames: ex1.frames.length, len: ex1.frames[0] ? ex1.frames[0].length : -1, rest: ex1.rest.length }));

const exHalf = C.extractFrames(demoFrame.subarray(0, 5), new Uint8Array(0), demoRule);
const exRest = C.extractFrames(C.concat(exHalf.rest, demoFrame.subarray(5)), new Uint8Array(0), demoRule);
check("codec: 帧被切成两块也能收齐",
  exHalf.frames.length === 0 && exHalf.rest.length === 5 &&
  exRest.frames.length === 1 && exRest.frames[0].length === 11,
  JSON.stringify({ mid: exHalf.frames.length, midRest: exHalf.rest.length, end: exRest.frames.length }));

const exJunk = C.extractFrames(C.concat(new Uint8Array([0x00, 0x11]), demoFrame), new Uint8Array(0), demoRule);
check("codec: 帧头前有杂字节能重新对齐",
  exJunk.frames.length === 1 && exJunk.frames[0][0] === 0xAA && exJunk.rest.length === 0,
  "frames=" + exJunk.frames.length);

const exHead = C.extractFrames(new Uint8Array([0xAA]), new Uint8Array(0), demoRule);
const exHead2 = C.extractFrames(C.concat(exHead.rest, demoFrame.subarray(1)), new Uint8Array(0), demoRule);
check("codec: 被切断的帧头会保留到下一块",
  exHead.frames.length === 0 && exHead.rest.length === 1 && exHead2.frames.length === 1,
  JSON.stringify({ r1: exHead.rest.length, f2: exHead2.frames.length }));

/* 无长度字段时按帧尾定界 */
const tailRule = { head: "AA", tail: "55", len: { offset: 0, size: 0, mode: "none" } };
const exTail = C.extractFrames(new Uint8Array([0xAA, 0x01, 0x02, 0x55, 0xAA, 0x03, 0x55]), new Uint8Array(0), tailRule);
check("codec: 帧尾定界收出两帧",
  exTail.frames.length === 2 && exTail.frames[0].length === 4 && exTail.frames[1].length === 3,
  "frames=" + exTail.frames.length);

/* 校验和已知向量 */
const ascii = C.encodeText("123456789", "ascii");
check("codec: CRC16-Modbus 对 '123456789' = 0x4B37", C.crc16Modbus(ascii, 0, -1) === 0x4B37,
  "0x" + C.crc16Modbus(ascii, 0, -1).toString(16).toUpperCase());
check("codec: sum8 / xor8 / sum16 已知向量",
  C.sum8(new Uint8Array([0x01, 0x02, 0x03]), 0, -1) === 6 &&
  C.xor8(new Uint8Array([0x0F, 0x33]), 0, -1) === 0x3C &&
  C.sum16(new Uint8Array([0xFF, 0xFF, 0x02]), 0, -1) === 0x0200,
  [C.sum8(new Uint8Array([1, 2, 3]), 0, -1), C.xor8(new Uint8Array([0x0F, 0x33]), 0, -1)].join("/"));
check("codec: checksumSize 映射", C.checksumSize("sum8") === 1 && C.checksumSize("crc16modbus") === 2);

/* V2.2.21：校验和族扩充 —— 每一种都必须对上**标准测试向量**（"123456789"）。
   这是唯一可信的验证方式：CRC 的实现极易「看起来像对的」却差一个初值/反射方向，
   而那种错在现场表现为「偶尔校验失败」，比全错还难查。 */
check("codec: CRC-8/MAXIM 对 '123456789' = 0xA1", C.crc8(ascii, 0, -1) === 0xA1,
  "0x" + C.crc8(ascii, 0, -1).toString(16).toUpperCase());
check("codec: CRC-16/CCITT-FALSE 对 '123456789' = 0x29B1", C.crc16Ccitt(ascii, 0, -1) === 0x29B1,
  "0x" + C.crc16Ccitt(ascii, 0, -1).toString(16).toUpperCase());
check("codec: CRC-32/IEEE 对 '123456789' = 0xCBF43926", C.crc32(ascii, 0, -1) === 0xCBF43926,
  "0x" + C.crc32(ascii, 0, -1).toString(16).toUpperCase());
check("codec: LRC(Modbus-ASCII) 对 01 03 00 00 00 0A = 0xF2",
  C.lrc(new Uint8Array([0x01, 0x03, 0x00, 0x00, 0x00, 0x0A]), 0, -1) === 0xF2,
  "0x" + C.lrc(new Uint8Array([0x01, 0x03, 0x00, 0x00, 0x00, 0x0A]), 0, -1).toString(16).toUpperCase());
check("codec: 新增校验和的字节宽度（crc8/lrc=1、crc32=4、crc16*=2）",
  C.checksumSize("crc8") === 1 && C.checksumSize("lrc") === 1
    && C.checksumSize("crc32") === 4 && C.checksumSize("crc16ccitt") === 2, "");
check("codec: checksum() 派发覆盖全部已声明类型，且未知类型返回 null（不静默当 0）",
  C.checksumTypes.every(function (t) {
    if (t.type === "none") { return true; }
    return typeof C.checksum(t.type, ascii, 0, -1) === "number";
  }) && C.checksum("nope", ascii, 0, -1) === null
    && C.checksumTypes.length === 9, "共 " + C.checksumTypes.length + " 种");

/* ============================================================
   ⑯-b 协议栈分析（V2.2.21，AUDIT A-98）
   为什么必须功能性：Modbus 的「请求」与「响应」在同一个功能码下长度不同
   （03 请求 8 字节 / 响应 5+2N 字节），只按一种解释去切必然切错；
   而 CRC 字节序（RTU 是低前高后）反了以后，短帧上也可能「看起来能用」。
   所以这里真造帧、真解码、真改坏一字节，逐项对结果。
   ============================================================ */
(function () {
  const P = require(path.join(JS, "protocol.js"));

  /* 用已对上标准向量的 crc16Modbus 造帧（低字节在前） */
  function mb(addr, fc, data) {
    const b = [addr, fc].concat(data);
    const crc = C.crc16Modbus(Uint8Array.from(b), 0, -1);
    return Uint8Array.from(b.concat([crc & 0xFF, (crc >> 8) & 0xFF]));
  }
  const vals = [100, 200, 300, 1, 2, 3, 4, 5, 6, 7];
  const req = mb(0x01, 0x03, [0x00, 0x00, 0x00, 0x0A]);                       /* 读 10 个保持寄存器 */
  const res = mb(0x01, 0x03, [20].concat(vals.map(function (v) { return [(v >> 8) & 0xFF, v & 0xFF]; })
    .reduce(function (a, b) { return a.concat(b); }, [])));
  const exc = mb(0x01, 0x83, [0x02]);                                          /* 异常：非法数据地址 */
  const wr = mb(0x02, 0x06, [0x00, 0x10, 0x01, 0xF4]);                         /* 写单个寄存器 = 500 */

  const r1 = P.modbus(req);
  check("protocol: Modbus 读寄存器请求解对（地址/功能码/起始/数量）",
    r1.frames.length === 1 && r1.frames[0].crcOk && r1.frames[0].kind === "请求"
      && r1.frames[0].addr === 1 && r1.frames[0].start === 0 && r1.frames[0].count === 10,
    r1.frames.length ? r1.frames[0].detail : "无帧");

  const r2 = P.modbus(res);
  check("protocol: Modbus 响应解出全部寄存器值（不是一半——循环里 r 与 2r 混写会少解一半）",
    r2.frames.length === 1 && r2.frames[0].kind === "响应"
      && JSON.stringify(r2.frames[0].regs) === JSON.stringify(vals),
    r2.frames.length ? JSON.stringify(r2.frames[0].regs) : "无帧");

  check("protocol: 异常响应被单独识别（设备拒绝 ≠ 通信故障，措辞要分开）",
    P.modbus(exc).frames[0].isException === true
      && P.modbus(exc).frames[0].detail.indexOf("非法数据地址") > 0, "");
  check("protocol: 写单个寄存器解出寄存器号与值",
    P.modbus(wr).frames[0].reg === 16 && P.modbus(wr).frames[0].value === 500, P.modbus(wr).frames[0].detail);

  /* 连发三条：切帧 + 配对 */
  const stream = Uint8Array.from([].slice.call(req).concat([].slice.call(res)).concat([].slice.call(exc)));
  const ms = P.modbus(stream);
  check("protocol: 连发的请求+响应+异常被切成 3 帧且零重同步（请求/响应长度不同，必须两种都试）",
    ms.frames.length === 3 && ms.ok === 3 && ms.fail === 0 && ms.bad === 0,
    ms.frames.length + " 帧 ok=" + ms.ok + " fail=" + ms.fail + " bad=" + ms.bad);
  const pairs = P.modbusPairs(ms.frames);
  check("protocol: 请求↔响应配对能认出第一对正常、并指出异常那条没有对应请求",
    pairs.length >= 2 && pairs[0].req && pairs[0].res && pairs[0].note.indexOf("配对正常") >= 0
      && pairs.some(function (p) { return !p.req; }), JSON.stringify(pairs.map(function (p) { return p.note; })));

  /* CRC 改坏一字节 */
  const bad = Uint8Array.from([].slice.call(res));
  bad[5] ^= 0xFF;
  const r3 = P.modbus(bad);
  check("protocol: 改坏载荷一字节后 CRC 判为不通过，并给出「算出 vs 帧里」两个值（补零到 4 位）",
    r3.frames[0].crcOk === false && /^0x[0-9A-F]{4}$/.test(r3.frames[0].crcWant)
      && /^0x[0-9A-F]{4}$/.test(r3.frames[0].crcGot)
      && r3.frames[0].crcWant !== r3.frames[0].crcGot,
    r3.frames[0].detail);

  /* 协议识别：三种典型输入各归其位，且都给理由 */
  const gModbus = P.guess(res), gText = P.guess(C.encodeText("tick=1,pos=2\r\n", "utf-8")), gZero = P.guess(new Uint8Array(16));
  check("protocol: 识别 Modbus RTU 并说明「切出 N 帧且 CRC 全部通过」",
    gModbus.ranked[0].id === "modbus-rtu" && gModbus.ranked[0].why.indexOf("CRC") > 0, gModbus.ranked[0].why);
  check("protocol: 识别文本键值协议（可打印占比 + 分隔符两个证据）",
    gText.ranked[0].id === "text-kv" && gText.ranked[0].why.indexOf("可打印") >= 0, gText.ranked[0].why);
  check("protocol: 全 0 / 全 FF 判为「没有真实数据」而不是某种协议（指向接线/波特率）",
    gZero.ranked[0].id === "idle" && gZero.ranked[0].why.indexOf("接线") > 0, gZero.ranked[0].why);
  check("protocol: summarize 给一行可直接引用的结论（面板/调试包/AI 三处共用同一句）",
    P.summarize(res).indexOf("最可能是") === 0, P.summarize(res));

  /* 帧级 diff */
  const d = P.diff(res, bad);
  check("protocol: 帧 diff 给出共同前缀与逐字节差异（现场排障就是「拿好的和坏的比」）",
    d.sameLength === true && d.commonPrefix === 5 && d.diffs.length === 1
      && d.diffs[0].at === 5 && d.diffs[0].a === 0 && d.diffs[0].b === 255,
    "前缀 " + d.commonPrefix + " 差异 " + JSON.stringify(d.diffs));
  check("protocol: 长度不同的两帧也能比（多出的字节报成 null，不是静默截断）",
    (function () {
      const dd = P.diff(res, req);
      return dd.sameLength === false && dd.diffs.some(function (x) { return x.b === null; });
    })(), "");

  /* 模块约定：不碰 DOM + 保留 UMD 尾（子应用硬规则 5/7 —— 桥要 require 同一份真源） */
  const pSrc = fs.readFileSync(path.join(JS, "protocol.js"), "utf8");
  check("protocol: 纯模块（不碰 DOM）且保留 UMD 尾，供本地桥 require 同一份真源",
    pSrc.indexOf("document.") < 0 && pSrc.indexOf("module.exports = P;") > 0, "");
})();

/* ============================================================
   ⑯-c Markdown 导出（V2.2.21）
   为什么必须功能性：Markdown 表格有两个「一行毁全表」的坑 ——
   单元格里的 | 会切断表格、反引号会提前结束行内代码。
   而这类错误在纯文本编辑器里看不出来，只有渲染时才炸。
   所以这里真造一个「标签里带竖线」的通道，检查它有没有被转义。
   ============================================================ */
(function () {
  check("exporters: buildMarkdown 产出三段结构（元信息 / 通道统计 / 最近记录）",
    typeof X.buildMarkdown === "function" && (function () {
      const md = X.buildMarkdown(3);
      return md.indexOf("# SerialLab 数据导出") === 0
        && md.indexOf("## 通道统计") > 0 && md.indexOf("## 最近 ") > 0;
    })(), "");

  Store.upsertChannel({ key: "k-pipe-check", label: "a|b", unit: "V", color: "#3b82f6" });
  const md2 = X.buildMarkdown(2);
  check("exporters: Markdown 单元格转义（内容里的 | 转成 \\|，反引号去掉）",
    md2.indexOf("a\\|b") > 0 && md2.indexOf("a|b") < 0, "");
  check("exporters: Markdown 表格列数一致（表头与每一行数据的分隔符个数相同，否则渲染出来是错表）",
    (function () {
      const lines = md2.split("\n");
      /* ⚠ 转义后的 \| 依然是「|」这个字符，朴素 split("|") 会把它当分隔符 ——
         先把转义序列换成一个不可能出现的字符再数，否则这条断言自己就会误报。 */
      const cols = function (L) { return L.replace(/\\\|/g, "\u0001").split("|").length; };
      let head = null, rows = 0, okCols = true;
      for (let i = 0; i < lines.length; i++) {
        const L = lines[i];
        if (L.indexOf("| 通道 |") === 0) { head = cols(L); continue; }
        if (head !== null && L.indexOf("| ") === 0) {
          if (L.indexOf("---") >= 0) { continue; }
          rows++;
          if (cols(L) !== head) { okCols = false; }
        }
      }
      return head !== null && rows > 0 && okCols;
    })(), "");
  check("exporters: 导出入口 + UI 按钮 + 命令面板条目都在（按钮不存在时命令面板会自动不列出）",
    typeof X.exportMarkdown === "function"
      && fs.readFileSync(path.join(JS, "..", "index.html"), "utf8").indexOf('id="slBtnExpMd"') > 0, "");
  Store.removeChannel("k-pipe-check");   /* 别把测试通道留给后面的断言 */
})();

/* ============================================================
   ③ expr
   ============================================================ */
const cMul = E.compile("(cur*24)", ["cur"]);
check("expr: 通道名作变量的算式可编译且求值正确",
  cMul.ok && cMul.fn({ cur: 1.5 }) === 36, cMul.ok ? cMul.fn({ cur: 1.5 }) : cMul.err);
const cBad = E.compile("alert(1)", ["cur"]);
check("expr: 函数调用注入被拒绝", cBad.ok === false, "err=" + cBad.err);
const cUnbound = E.compile("foo+1", ["cur"]);
check("expr: 未绑定标识符被拒绝", cUnbound.ok === false, "err=" + cUnbound.err);
const evFns = E.evalOnce("sqrt(16)+abs(-4)");
check("expr: evalOnce 支持白名单函数", evFns.ok === true && evFns.value === 8,
  JSON.stringify(evFns));
check("expr: 除零不抛异常(明确报非有限值)", (() => {
  try { const r = E.evalOnce("1/0"); return r.ok === false && isNaN(r.value); }
  catch (e) { return false; }
})());
check("expr: 三角函数与常量可用", (() => {
  const r = E.evalOnce("sin(pi/2)");
  return r.ok && near(r.value, 1, 1e-9);
})(), JSON.stringify(E.evalOnce("sin(pi/2)")));

/* ============================================================
   ④ fft
   ============================================================ */
const N = 1024, FS = 1024, FREQ = 64, AMP = 2;
const samples = new Array(N);
for (let i = 0; i < N; i++) { samples[i] = AMP * Math.sin(2 * Math.PI * FREQ * i / FS); }
const spec = F.spectrum(samples, FS);
check("fft: 峰值频率落在容差内", spec && near(spec.peak.freq, FREQ, 1),
  spec ? "peak=" + spec.peak.freq : "null");
check("fft: 峰值幅值与输入幅值一致(±10%)", spec && near(spec.peak.mag, AMP, AMP * 0.1),
  spec ? "mag=" + spec.peak.mag.toFixed(4) : "null");
check("fft: 样本过少时返回 null 而不抛异常", F.spectrum([1, 2, 3], FS) === null);
check("fft: 任意非 2 的幂点数也能处理", (() => {
  const s = []; for (let i = 0; i < 1000; i++) { s.push(Math.sin(i * 0.1)); }
  const r = F.spectrum(s, 1000);
  return r && r.n >= 1000 && isFinite(r.peak.freq);
})());

/* ============================================================
   ⑤ parser
   ============================================================ */
const pt = Parser.parseText("temp=25.3, cur:1.02", { seps: ["=", ":"] });
check("parser: 同时识别等号与冒号",
  near(pt.values.temp, 25.3, 1e-9) && near(pt.values.cur, 1.02, 1e-9) && pt.pairs.length === 2,
  JSON.stringify(pt.values));
check("parser: 键后不是数值时跳过该键继续匹配",
  Parser.parseText("[INFO] ready, temp: 7", { seps: ["=", ":"] }).values.temp === 7);
check("parser: 科学计数法可解析",
  Parser.parseText("e=1.5e2", { seps: ["=", ":"] }).values.e === 150);
check("parser: 负数与小数可解析",
  Parser.parseText("x=-0.75", { seps: ["=", ":"] }).values.x === -0.75);
const sp = Parser.splitSuffix("temp12");
check("parser: 后缀数字拆分为独立通道",
  sp.base === "temp" && sp.index === 12 && sp.hasSuffix === true, JSON.stringify(sp));
check("parser: 无后缀键不误判", Parser.splitSuffix("temp").hasSuffix === false);

check("parser: readField int16 小端二补码还原",
  Parser.readField(new Uint8Array([0xFF, 0xFF]), { offset: 0, size: 2, type: "int16" }) === -1 &&
  Parser.readField(new Uint8Array([0xFF, 0xFF]), { offset: 0, size: 2, type: "uint16" }) === 65535);

/* 端到端：收帧函数产出的帧必须被结构表解回构造时的原值 */
const parsed = Parser.parseHexFrame(demoFrame, { fields: demoRule.fields, checksum: demoRule.checksum });
check("parser: 演示帧字段解码与构造值一致",
  parsed.ok && near(parsed.values.pos, 0, 1e-6) && near(parsed.values.cur, 1.807, 1e-6) && near(parsed.values.temp, 42, 1e-6),
  JSON.stringify(parsed.values));

/* 校验和错误：ok=false，但已解出的字段值仍保留（排障比直接丢弃有用） */
const badFrame = demoFrame.slice(0);
badFrame[badFrame.length - 1] = (badFrame[badFrame.length - 1] ^ 0xFF) & 0xFF;
const parsedBad = Parser.parseHexFrame(badFrame, { fields: demoRule.fields, checksum: demoRule.checksum });
check("parser: 校验和不匹配时 ok=false 且保留字段值与期望/实际值",
  parsedBad.ok === false && parsedBad.reason === "校验和不匹配" &&
  near(parsedBad.values.cur, 1.807, 1e-6) &&
  parsedBad.checksum && parsedBad.checksum.ok === false,
  JSON.stringify({ ok: parsedBad.ok, reason: parsedBad.reason }));

check("parser: 字段越界返回 ok=false 而不抛异常", (() => {
  try {
    const r = Parser.parseHexFrame(demoFrame, { fields: [{ key: "x", type: "int16", offset: 100, size: 2 }], checksum: { type: "none" } });
    return r.ok === false && r.reason.indexOf("越界") >= 0;
  } catch (e) { return false; }
})());
check("parser: 空帧不抛异常", (() => {
  try { return Parser.parseHexFrame(new Uint8Array(0), { fields: [], checksum: { type: "none" } }).ok === false; }
  catch (e) { return false; }
})());

/* ============================================================
   ⑥ transport
   ============================================================ */
const sm = Tpt.stateMachine;
check("transport: 状态机初始态按能力探测",
  sm.initial(true) === "idle" && sm.initial(false) === "unsupported");
check("transport: 状态机正常迁移序列",
  sm.next("idle", "REQUEST") === "requesting" &&
  sm.next("requesting", "GRANTED") === "opening" &&
  sm.next("opening", "OPENED") === "open" &&
  sm.next("open", "CLOSE") === "closing" &&
  sm.next("closing", "CLOSED") === "idle");
check("transport: 取消授权回到 idle", sm.next("requesting", "CANCEL") === "idle");
check("transport: 非法状态/事件不抛异常",
  sm.next("no-such-state", "X") === "idle" && sm.next("idle", "NO_SUCH_EVENT") === "idle");
const oo = Tpt.buildOpenOptions({ baudRate: 9600, dataBits: 7, stopBits: 2, parity: "even", flow: "hardware" });
check("transport: open 参数映射正确",
  oo.baudRate === 9600 && oo.dataBits === 7 && oo.stopBits === 2 && oo.parity === "even" && oo.flowControl === "hardware",
  JSON.stringify(oo));
check("transport: 缺省参数有兜底",
  Tpt.buildOpenOptions({}).baudRate === 115200 && Tpt.buildOpenOptions({}).flowControl === "none");
check("transport: isOpen 在未连接时为 false", Tpt.isOpen() === false);
check("transport: DEMO_FIELDS 五路合成信号", Tpt.DEMO_FIELDS.length === 5);

/* ============================================================
   ⑦ plugins（描述符校验与降级）
   ============================================================ */
check("plugins: 内置八种渲染器注册齐全", Plugins.list().length === 8,
  Plugins.list().map(r => r.id).join(","));
check("plugins: 未知渲染器降级为数据表格并记录问题", (() => {
  const r = Plugins.validate({ type: "no-such-renderer" });
  return r.panel && r.panel.type === "table" && r.errors.length >= 1;
})());
check("plugins: 窗口点数越界被夹到上限", (() => {
  const r = Plugins.validate({ type: "timeplot", window: 999999 });
  return r.panel.window === 100000 && r.errors.length >= 1;
})(), JSON.stringify(Plugins.validate({ type: "timeplot", window: 999999 }).panel.window));
check("plugins: 非法公式被丢弃且不影响面板可用", (() => {
  const r = Plugins.validate({ type: "timeplot", channels: ["cur"], expr: "alert(1)" });
  return r.panel.expr === "" && r.errors.length >= 1 && r.panel.type === "timeplot";
})());
check("plugins: yMin>=yMax 改回自动量程", (() => {
  const r = Plugins.validate({ type: "timeplot", axis: { yMin: 10, yMax: 1 } });
  return r.panel.axis.yMin === null && r.panel.axis.yMax === null && r.errors.length >= 1;
})());
check("plugins: 非法颜色被忽略", (() => {
  const r = Plugins.validate({ type: "timeplot", channels: ["cur"], colors: { cur: "red" } });
  return r.panel.colors.cur === undefined;
})());
check("plugins: 标题超长被截断", Plugins.validate({ type: "bar", title: "x".repeat(60) }).panel.title.length === 40);
check("plugins: 通道留空回落到 auto", (() => {
  const r = Plugins.validate({ type: "timeplot", channels: [] });
  return r.panel.channels.length === 1 && r.panel.channels[0] === "auto";
})());
check("plugins: 未知 opts 键被白名单挡住", (() => {
  const r = Plugins.validate({ type: "textmon", opts: { totallyUnknown: 1 } });
  return r.panel.opts.totallyUnknown === undefined;
})());
const pack = Plugins.exportPack([{ type: "timeplot", channels: ["auto"] }], [{ key: "cur", color: "#3b82f6" }]);
check("plugins: 面板包导出带 kind/version", pack.kind === "seriallab-panel-pack" && pack.version === 1);
check("plugins: 面板包 kind 不符被拒绝", Plugins.importPack({ kind: "something-else", panels: [] }).ok === false);
check("plugins: 面板包高版本被拒绝", Plugins.importPack({ kind: "seriallab-panel-pack", version: 99, panels: [] }).ok === false);
check("plugins: 面板包非法 JSON 被拒绝", Plugins.importPack("{oops").ok === false);
check("plugins: 合法面板包可导入", (() => {
  const r = Plugins.importPack(pack);
  return r.ok && r.panels.length === 1 && r.channels.length === 1;
})());

/* ============================================================
   ⑧ exporters
   ============================================================ */
check("exporters: CSV 引号/逗号按 RFC4180 转义",
  X.toCsv([["a,b", 'he said "hi"']]) === '"a,b","he said ""hi"""',
  X.toCsv([["a,b", 'he said "hi"']]));
check("exporters: CSV 带 UTF-8 BOM", X.withBom("x").charCodeAt(0) === 0xFEFF);
check("exporters: 配置版本高于支持值被拒绝",
  X.configFromText('{"version":99}').ok === false &&
  X.configFromText("not json").ok === false);
check("exporters: 合法配置可解析", X.configFromText('{"version":1}').ok === true);
check("exporters: 配置文本可往返", (() => {
  const t = X.configToText(true);
  const r = X.configFromText(t);
  return r.ok && r.config && r.config.transport && typeof r.config.transport.baudRate === "number";
})());

/* ============================================================
   ⑨ datastore（环形缓冲）
   ============================================================ */
Store.clear(false);
const CAP = Store.CAPACITY;
const TOTAL = CAP + 50;
for (let i = 0; i < TOTAL; i++) { Store.pushFrame({ t: i, values: { t1: i } }); }
check("datastore: 超出容量后只保留最近 CAP 个点", Store.count("t1") === CAP,
  Store.count("t1") + " vs " + CAP);
const st = Store.stat("t1", CAP);
check("datastore: 绕回后统计口径正确(min/max/last/avg)",
  st.min === 50 && st.max === TOTAL - 1 && st.last === TOTAL - 1 &&
  near(st.avg, (50 + TOTAL - 1) / 2, 1e-9),
  JSON.stringify({ min: st.min, max: st.max, last: st.last, avg: st.avg }));
const seq = [];
Store.forEachRecent("t1", 3, (t, v) => { seq.push(v); });
check("datastore: forEachRecent 取出的是尾部有序点",
  seq.length === 3 && seq[0] === TOTAL - 3 && seq[2] === TOTAL - 1, seq.join(","));
const copied = Store.copyRecent("t1", 2);
check("datastore: copyRecent 返回等长 t/v 数组",
  copied.t.length === 2 && copied.v.length === 2 && copied.v[1] === TOTAL - 1);
check("datastore: 新键自动建通道", Store.getChannel("t1") !== null && Store.listChannels().length === 1);
check("datastore: 非有限值不入库", (() => {
  const before = Store.count("t1");
  Store.pushFrame({ t: 1, values: { t1: NaN, t2: undefined } });
  return Store.count("t1") === before && Store.getChannel("t2") === null;
})());
Store.pushRaw({ t: 1, hex: "01", text: "a" });
check("datastore: 原始记录可追加与读取", Store.rawCount() === 1 && Store.recentRaw(10).length === 1);
Store.clear(true);
check("datastore: clear(keepChannels=true) 保留通道但清空数据",
  Store.getChannel("t1") !== null && Store.count("t1") === 0 && Store.rawCount() === 0);

/* ============================================================
   ⑩ timeline（录制序列化往返）
   ============================================================ */
Timeline.startRecord("自检录制");
check("timeline: 录制中状态正确", Timeline.isRecording() === true && Timeline.frameCount() === 0);
Store.pushFrame({ t: 1, dir: "rx", values: { a: 1 }, raw: demoFrame, text: "a=1" });
const rec = Timeline.stopRecord();
check("timeline: 录制订阅了 frame 事件并记录到帧", rec && rec.frames.length === 1,
  rec ? rec.frames.length + " 帧" : "null");
const recJson = Timeline.toJSON(rec);
check("timeline: 录制 JSON 带 kind/version",
  JSON.parse(recJson).kind === "seriallab-record" && JSON.parse(recJson).version === 1);
Timeline.clear();
check("timeline: clear 后列表为空", Timeline.list().length === 0);
const recBack = Timeline.fromJSON(recJson);
check("timeline: 录制导入往返成功", recBack.ok === true && recBack.added === 1);
check("timeline: 非录制文件被拒绝", Timeline.fromJSON('{"kind":"other"}').ok === false);
check("timeline: 高版本录制文件被拒绝", Timeline.fromJSON('{"kind":"seriallab-record","version":9,"records":[]}').ok === false);
check("timeline: 非法 JSON 被拒绝且不抛异常", Timeline.fromJSON("{").ok === false);
const smr = Timeline.summary(rec);
check("timeline: summary 返回帧数与时长", smr.frames === 1 && typeof smr.durationMs === "number");

/* ============================================================
   ⑪ 规则驱动的演示帧（让没接硬件的用户也能验证自定义协议）
   ============================================================ */
check("demo: 示例规则帧与内置 AA55 帧逐字节一致（多个时刻）", (() => {
  const ts = [0, 0.3, 1.234, 7.5];
  for (const t of ts) {
    for (const seq of [0, 7, 255]) {
      const a = Tpt.buildDemoHexFrameByRule(demoRule, seq, t);
      const b = Tpt.buildDemoHexFrame(seq, t);
      if (!a || a.length !== b.length) { return false; }
      for (let i = 0; i < b.length; i++) { if (a[i] !== b[i]) { return false; } }
    }
  }
  return true;
})());
check("demo: 空规则判定不可用（回退内置帧）",
  Tpt.demoRuleUsable({ head: "", tail: "", len: { offset: 0, size: 0, mode: "none" }, fields: [] }) === false);
check("demo: 有字段但既无长度字段也无帧尾 → 不可用",
  Tpt.demoRuleUsable({
    head: "AA55", tail: "", len: { offset: 0, size: 0, mode: "none" },
    fields: [{ key: "a", type: "int16", offset: 2, size: 2, scale: 1 }]
  }) === false);
check("demo: 示例规则判定可用", Tpt.demoRuleUsable(demoRule) === true);

/* 自定义协议：7E 帧头 + 1 字节载荷长度 + uint8 + int16(×0.1) + xor8 */
const custRule = {
  head: "7E", tail: "",
  len: { offset: 1, size: 1, mode: "payload" },
  fields: [
    { key: "a", type: "uint8", offset: 2, size: 1, scale: 1, big: false },
    { key: "b", type: "int16", offset: 3, size: 2, scale: 0.1, big: false }
  ],
  checksum: { type: "xor8", from: 0, to: -1 }
};
const custFrame = Tpt.buildDemoHexFrameByRule(custRule, 9, 0.25);
check("demo: 自定义规则帧可被自身分帧器恰好收齐",
  (() => {
    if (!custFrame || custFrame.length !== 6) { return false; }
    const r = C.extractFrames(custFrame, new Uint8Array(0), custRule);
    return r.frames.length === 1 && r.frames[0].length === 6 && r.rest.length === 0;
  })(), custFrame ? custFrame.length : "null");
check("demo: 自定义帧的帧头/长度字段/校验和位置正确",
  custFrame && custFrame[0] === 0x7E && custFrame[1] === 3 &&
  custFrame[5] === C.xor8(custFrame, 0, 4), custFrame ? U.bytesToHex(custFrame) : "null");
check("demo: 自定义帧能被结构表解出字段值（含缩放）",
  (() => {
    const r = Parser.parseHexFrame(custFrame, { fields: custRule.fields, checksum: custRule.checksum });
    return r.ok && isFinite(r.values.a) && isFinite(r.values.b) && r.values.a >= 0 && r.values.a <= 255;
  })());
check("demo: 长度字段=整帧长度模式也能自洽", (() => {
  const r2 = { head: "AA", tail: "0D0A", len: { offset: 1, size: 1, mode: "total" },
    fields: [{ key: "x", type: "uint16", offset: 2, size: 2, scale: 0.01, big: false }],
    checksum: { type: "crc16modbus", from: 0, to: -1 } };
  if (Tpt.demoRuleUsable(r2) !== true) { return false; }
  const f = Tpt.buildDemoHexFrameByRule(r2, 4, 0.6);
  const ex = C.extractFrames(f, new Uint8Array(0), r2);
  const pr = Parser.parseHexFrame(f, { fields: r2.fields, checksum: r2.checksum });
  return ex.frames.length === 1 && ex.frames[0].length === f.length && pr.ok && f[1] === f.length;
})());
/* 兜底口径：规则看着"配了"但没有字段表 → 判定不可用，调用方回退内置帧，
   绝不能静默产出一条没有任何通道的帧让用户干瞪眼 */
check("demo: 无字段表的规则判定不可用",
  Tpt.demoRuleUsable({ head: "AA55", tail: "", len: { offset: 2, size: 1, mode: "payload" }, fields: [] }) === false);

/* ============================================================
   ⑫ 端到端：演示源 → 收帧 → 结构表（真源链路，无副本）
   ============================================================ */
let e2eFrames = [];
let rest = new Uint8Array(0);
for (let i = 0; i < 6; i++) {
  const f = Tpt.buildDemoHexFrame(i + 1, i * 0.1);
  /* 故意按 3 字节一块喂进去，模拟真实串口的碎块到达 */
  for (let off = 0; off < f.length; off += 3) {
    const r = C.extractFrames(C.concat(rest, f.subarray(off, off + 3)), new Uint8Array(0), demoRule);
    rest = r.rest;
    e2eFrames = e2eFrames.concat(r.frames);
  }
}
check("端到端: 碎块喂入 6 帧演示数据，恰好收齐 6 帧",
  e2eFrames.length === 6 && rest.length === 0 && e2eFrames.every(f => f.length === 11),
  JSON.stringify({ frames: e2eFrames.length, rest: rest.length }));
check("端到端: 每帧都能被结构表解出且校验通过", (() => {
  for (let i = 0; i < e2eFrames.length; i++) {
    const r = Parser.parseHexFrame(e2eFrames[i], { fields: demoRule.fields, checksum: demoRule.checksum });
    if (!r.ok) { return false; }
    if (typeof r.values.cur !== "number" || !isFinite(r.values.cur)) { return false; }
  }
  return true;
})());
/* order 字段序一致性：先喂一半帧头的残块，确认后续仍能对齐 */
check("端到端: 残帧头不破坏后续对齐", (() => {
  const f = Tpt.buildDemoHexFrame(9, 0.5);
  const a = C.extractFrames(f.subarray(0, 1), new Uint8Array(0), demoRule);
  const b = C.extractFrames(C.concat(a.rest, f.subarray(1)), new Uint8Array(0), demoRule);
  return b.frames.length === 1 && b.frames[0].length === 11;
})());

/* ============================================================
   ⑬ 显示口径：时间格式化（绝对时刻 / 相对时长）
   ------------------------------------------------------------
   绝对时刻的断言不写死字符串——本机时区未必是 +8，写死会让 CI 在不同时区误报。
   正确姿势是「与 Date 自身的分解算法一致」。
   相对时长则必须锁死精度：早期版本跑过 1 分钟后毫秒被吃掉，时间戳突然变整秒。
   ============================================================ */
const T_MS = 1697212340123;
const _dt = new Date(T_MS);
const expectClock = U.pad2(_dt.getHours()) + ":" + U.pad2(_dt.getMinutes()) + ":"
  + U.pad2(_dt.getSeconds()) + "." + U.pad3(_dt.getMilliseconds());
check("util: fmtClock 输出 HH:MM:SS.mmm", U.fmtClock(T_MS) === expectClock, U.fmtClock(T_MS));
check("util: fmtClock(withMs=false) 只到秒",
  U.fmtClock(T_MS, false) === expectClock.slice(0, 8), U.fmtClock(T_MS, false));
check("util: fmtClock 非法输入回退占位符", U.fmtClock(NaN) === "--:--:--", U.fmtClock(NaN));
check("util: fmtRelative 不足 1 分钟保留 3 位小数", U.fmtRelative(1234.5) === "1.235s", U.fmtRelative(1234.5));
check("util: fmtRelative 超过 1 分钟仍保留毫秒（不塌成整秒）",
  U.fmtRelative(62345.6) === "1m02.346s", U.fmtRelative(62345.6));
check("util: fmtRelative 59.9996s 进位成 1m00.000s 而非 60.000s",
  U.fmtRelative(59999.6) === "1m00.000s", U.fmtRelative(59999.6));
check("util: fmtRelative 零与非法值不产出 NaN",
  U.fmtRelative(0) === "0.000s" && U.fmtRelative(NaN) === "0.000s" && U.fmtRelative(undefined) === "0.000s");

/* ============================================================
   ⑭ 开源协议预设（FireWater / Teleplot / JustFloat / 匿名 V1.0）
   ------------------------------------------------------------
   预设是「点一下就用社区事实标准」的入口，一旦某个字段写错，
   用户看到的是「套了预设反而解不出来」，比没有预设更糟。故逐条端到端验。
   ============================================================ */
const presetIds = core.presets().map(p => p.id).sort().join(",");
check("core: 内置 4 套开源协议预设", presetIds === "ano10,firewater,justfloat,teleplot", presetIds);
check("core: 每条预设的 kind 与 rule.active 一致",
  core.presets().every(p => p.kind === p.rule.active));
check("core: 未知预设 id 返回 null（不抛异常）",
  core.getPreset("nope") === null && core.presetRule("nope") === null);
check("core: presetRule 用默认值补齐为完整规则",
  (() => {
    const r = core.presetRule("firewater");
    return !!r && r.active === "text" && !!r.text && !!r.hex && Array.isArray(r.hex.fields);
  })());
check("预设 FireWater: 同一行多组 name:value 全部解出",
  (() => {
    const v = Parser.parseText("temp:25.3, cur:1.02, rpm:1800", core.presetRule("firewater")).values;
    return v.temp === 25.3 && v.cur === 1.02 && v.rpm === 1800;
  })());
check("预设 Teleplot: 忽略 > 前缀，取出 rpm",
  Parser.parseText(">rpm:1800", core.presetRule("teleplot")).values.rpm === 1800);
check("预设 JustFloat: 按帧尾 0000807F 定界并解出 4 路 float32",
  (() => {
    const r = core.presetRule("justfloat");
    /* 4 路 float32 小端：0.0 / 1.0 / 2.0 / 3.0，再接帧尾 +Inf */
    const u8 = U.hexToBytes("00 00 00 00 00 00 80 3F 00 00 00 40 00 00 40 40 00 00 80 7F");
    const ex = C.extractFrames(u8, new Uint8Array(0), r.hex);
    if (ex.frames.length !== 1 || ex.frames[0].length !== 20) { return false; }
    const pr = Parser.parseHexFrame(ex.frames[0], { fields: r.hex.fields, checksum: r.hex.checksum });
    return pr.ok && pr.values.ch1 === 0 && pr.values.ch2 === 1
      && pr.values.ch3 === 2 && pr.values.ch4 === 3;
  })());
check("预设 匿名 V1.0: 示例帧 SUM8 自洽，且能被自身规则恰好收帧并解出",
  (() => {
    const r = core.presetRule("ano10");
    const u8 = U.hexToBytes(core.getPreset("ano10").sample);
    const ex = C.extractFrames(u8, new Uint8Array(0), r.hex);
    if (ex.frames.length !== 1 || ex.frames[0].length !== u8.length || ex.rest.length !== 0) { return false; }
    const pr = Parser.parseHexFrame(ex.frames[0], { fields: r.hex.fields, checksum: r.hex.checksum });
    /* func=1；x=0x0064×0.01=1.00；y=0x0032×0.01=0.50；z=0 */
    return pr.ok && pr.values.func === 1 && near(pr.values.x, 1, 1e-9)
      && near(pr.values.y, 0.5, 1e-9) && pr.values.z === 0;
  })());
check("预设 匿名 V1.0: 校验和错 1 位即被拒（SUM8 真的在起作用）", (() => {
  const r = core.presetRule("ano10");
  const u8 = U.hexToBytes(core.getPreset("ano10").sample);
  u8[u8.length - 1] ^= 0xFF;
  const ex = C.extractFrames(u8, new Uint8Array(0), r.hex);
  if (ex.frames.length !== 1) { return false; }
  const pr = Parser.parseHexFrame(ex.frames[0], { fields: r.hex.fields, checksum: r.hex.checksum });
  return pr.ok === false && pr.reason === "校验和不匹配";
})());

/* ============================================================
   ⑮ 面向 AI 的调试包（debugBundle）
   ------------------------------------------------------------
   这是「让 AI 直接读数据、不用人来回截图粘贴」的交付面。
   结构一旦缺字段，AI 就拿不到判断依据，所以字段集与摘要都要锁住。
   ============================================================ */
Store.pushRaw({ t: 1000, tWall: Date.now(), tLabel: "0.000s", tLabelAbs: "23:06:40.000",
  dir: "rx", hex: "AA AA 01 06 00 64 00 32 00 00 F1", ok: true, values: { func: 1, x: 1, y: 0.5 } });
Store.pushRaw({ t: 1001, tWall: Date.now(), tLabel: "0.001s", tLabelAbs: "23:06:40.001",
  dir: "rx", hex: "AA AA 01 06 00 64 00 32 00 00 00", ok: false, reason: "校验和不匹配" });
Store.pushRaw({ t: 1002, tWall: Date.now(), tLabel: "0.002s", tLabelAbs: "23:06:40.002",
  dir: "tx", hex: "AA 55", text: "PING", ok: true });
Store.pushFrame({ t: 1000, values: { func: 1, x: 1 }, dir: "rx", bytes: 11 });

const bundle = X.debugBundle({ samples: 50 });
check("调试包: 顶层字段齐全（kind/version/设置/样本/提示）",
  bundle.kind === "seriallab-debug-bundle" && bundle.version === 1
  && !!bundle.app && !!bundle.connection && !!bundle.rule && !!bundle.frameLayout
  && !!bundle.availablePresets && !!bundle.channels && !!bundle.settings
  && !!bundle.stats && Array.isArray(bundle.samples) && Array.isArray(bundle.failures)
  && Array.isArray(bundle.hints) && typeof bundle.brief === "string",
  Object.keys(bundle).join(","));
check("调试包: 收发计数与失败计数准确",
  bundle.stats.tx === 1 && bundle.stats.rx === 2 && bundle.stats.failedFrames === 1
  && bundle.stats.failureReasons.length === 1
  && bundle.stats.failureReasons[0].reason === "校验和不匹配",
  JSON.stringify(bundle.stats));
check("调试包: 样本保留原始 HEX 与解出值，失败样本带原因",
  bundle.samples.length === 3
  && bundle.samples[0].hex === "AA AA 01 06 00 64 00 32 00 00 F1"
  && bundle.samples[0].values.x === 1
  && bundle.failures.length === 1 && bundle.failures[0].reason === "校验和不匹配");
check("调试包: 通道统计含颜色与量程（便于 AI 判断哪条线是哪路）",
  bundle.channels.length >= 1
  && bundle.channels.every(c => typeof c.key === "string" && typeof c.color === "string"
    && typeof c.count === "number"),
  JSON.stringify(bundle.channels.map(c => c.key)));
check("调试包: 帧结构说明与预设清单一并给出",
  bundle.frameLayout.join(" ").indexOf("分隔符") >= 0
  && bundle.availablePresets.length === 4);
check("调试包: 摘要 brief 段落齐全",
  ["[连接]", "[显示设置]", "[帧结构]", "[统计]", "[通道", "[给 AI 的提示]", "[使用方法]"]
    .every(seg => bundle.brief.indexOf(seg) >= 0), bundle.brief.slice(0, 60));
check("调试包: 摘要不含 undefined / NaN / [object",
  bundle.brief.indexOf("undefined") < 0 && bundle.brief.indexOf("NaN") < 0
  && bundle.brief.indexOf("[object") < 0);
check("调试包: options.samples 被限幅且不抛异常",
  (() => {
    const a = X.debugBundle({ samples: 1 });
    const b = X.debugBundle({ samples: 999999 });
    return a.samples.length === 3 && b.samples.length === 3;
  })());
check("调试包: 导出函数已挂载", typeof X.exportDebugBundleFile === "function");

/* ============================================================
   ⑯ 调试包契约自校验（debug-bundle.schema.json）+ 记录上限同源
   ------------------------------------------------------------
   为什么要有这一节：
   ① schema 是「AI 消费侧」的验收口径。字段少给一个，AI 就缺一份判断依据，
      而它不会报错、只会给出看似合理的错误结论 —— 所以契约必须可机器校验。
   ② 让**唯一的契约文件**反过来校验实现产出，避免 schema 与代码各改各的（漂移）。
   ③ A-81 的教训：同一条记录上限曾存在两个来源。这里把「必须同源」变成断言。
   ============================================================ */
const SCHEMA_PATH = path.join(__dirname, "..", "06_学习工具", "_串口调试助手", "debug-bundle.schema.json");

let schema = null;
try { schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8")); } catch (e) { /* 下面断言会报错 */ }
check("契约: debug-bundle.schema.json 存在且是合法 JSON", !!schema, SCHEMA_PATH);
check("契约: schema 自带 $schema/title/$id，可被外部工具直接消费",
  !!schema && !!schema.$schema && !!schema.title && !!schema.$id);
check("契约: schema 顶层 required 覆盖全部 15 个交付字段",
  !!schema && schema.required.length === 15,
  schema ? schema.required.join(",") : "");

/* 极简 JSON Schema 校验器（draft-07 子集，零依赖）
   覆盖本契约实际用到的关键字：type(含联合) / const / enum / required / items / properties */
function schemaErrors(sch, val, at) {
  at = at || "$";
  const errs = [];
  if (!sch || typeof sch !== "object") { return errs; }

  if (sch.const !== undefined && val !== sch.const) {
    errs.push(at + " 应为常量 " + JSON.stringify(sch.const) + "，实为 " + JSON.stringify(val));
    return errs;
  }
  if (sch.enum && sch.enum.indexOf(val) < 0) {
    errs.push(at + " 不在枚举 [" + sch.enum.join(",") + "] 内（实为 " + JSON.stringify(val) + "）");
  }

  if (sch.type) {
    const want = Array.isArray(sch.type) ? sch.type : [sch.type];
    const okType = want.some(function (t) {
      if (t === "array") { return Array.isArray(val); }
      if (t === "integer") { return typeof val === "number" && isFinite(val) && val % 1 === 0; }
      if (t === "number") { return typeof val === "number" && isFinite(val); }
      if (t === "null") { return val === null; }
      if (t === "object") { return val !== null && typeof val === "object" && !Array.isArray(val); }
      return typeof val === t;
    });
    if (!okType) {
      errs.push(at + " 类型应为 " + want.join("|") + "，实为 "
        + (val === null ? "null" : Array.isArray(val) ? "array" : typeof val));
      return errs;   /* 类型不符就不再往下钻，避免雪崩式误报 */
    }
  }

  if (sch.required && val !== null && typeof val === "object" && !Array.isArray(val)) {
    for (let i = 0; i < sch.required.length; i++) {
      const k = sch.required[i];
      if (val[k] === undefined) { errs.push(at + " 缺必需字段 " + k); }
    }
  }
  if (sch.properties && val !== null && typeof val === "object" && !Array.isArray(val)) {
    for (const k in sch.properties) {
      if (!Object.prototype.hasOwnProperty.call(sch.properties, k)) { continue; }
      if (val[k] === undefined) { continue; }   /* 非必需字段缺失不算错 */
      errs.push(...schemaErrors(sch.properties[k], val[k], at + "." + k));
    }
  }
  if (sch.items && Array.isArray(val)) {
    for (let i = 0; i < val.length; i++) {
      errs.push(...schemaErrors(sch.items, val[i], at + "[" + i + "]"));
    }
  }
  return errs;
}

const contractErrs = schema ? schemaErrors(schema, bundle, "$") : ["schema 不可用"];
check("契约: 实际产出的调试包完全符合 schema（15 字段 × 嵌套类型 × 必需项）",
  contractErrs.length === 0,
  contractErrs.slice(0, 4).join(" ; "));
check("契约: schema 的 kind/version 常量与实现一致（改契约必须同步改实现）",
  !!schema && schema.properties.kind.const === bundle.kind
  && schema.properties.version.const === bundle.version,
  bundle.kind + "@" + bundle.version);

/* —— 记录上限同源（A-81 防回归）——
   三处必须指向同一个数：配置生效值、数据仓真实容量、时间线窗口上限。
   只要有人再引入第二个来源，这条就会红。 */
check("上限同源: 调试包报的生效上限 === datastore 真实容量",
  bundle.settings.display.recordCapEffective === Store.rawCap(),
  bundle.settings.display.recordCapEffective + " vs " + Store.rawCap());
check("上限同源: 时间线窗口上限 === datastore 真实容量",
  bundle.settings.display.timelineMaxFrames === Store.rawCap(),
  bundle.settings.display.timelineMaxFrames + " vs " + Store.rawCap());
check("上限同源: 持有条数 === datastore 实际条数",
  bundle.settings.display.rawRecordsHeld === Store.rawCount(),
  bundle.settings.display.rawRecordsHeld + " vs " + Store.rawCount());
check("上限同源: 生效上限在合法区间 [200, 500000]",
  Store.rawCap() >= 200 && Store.rawCap() <= 500000, String(Store.rawCap()));
check("上限同源: setRawCap 越界时被夹紧而非静默接受",
  Store.setRawCap(10) === 200 && Store.setRawCap(999999) === 500000,
  "low=" + Store.setRawCap(1) + " high=" + Store.setRawCap(9e9));
Store.setRawCap(20000);   /* 复位，别影响后续断言 */
check("上限同源: 改上限后调试包立刻反映新值（不缓存旧口径）",
  X.debugBundle({ samples: 20 }).settings.display.recordCapEffective === 20000,
  String(X.debugBundle({ samples: 20 }).settings.display.recordCapEffective));

/* —— 时间线必须跟随数据仓，且不得自行截断 ——
   旧实现 timeline 自带 MAX_FRAMES=200000：用户把「存档上限」调到 20 万以上时，
   数据仓留着、时间线静默截断到 20 万 —— 两个来源的对不上。以下四条锁住新口径。 */
check("上限同源: 未显式设置时，时间线上限跟随数据仓",
  (() => { Timeline.setMaxFrames(0); Store.setRawCap(120000); return Timeline.maxFrames() === 120000; })(),
  Timeline.maxFrames() + " vs " + Store.rawCap());
check("上限同源: 显式设置更小的值时以设置值为准（用户想少留就少留）",
  Timeline.setMaxFrames(30000) === undefined && Timeline.maxFrames() === 30000,
  String(Timeline.maxFrames()));
check("上限同源: 显式设置超过数据仓容量时不越界（旧实现此处静默截断到 20 万）",
  (() => { Store.setRawCap(400000); Timeline.setMaxFrames(999999); return Timeline.maxFrames() === 400000; })(),
  Timeline.maxFrames() + " vs " + Store.rawCap());
check("上限同源: 设置与容量各自独立，且「先设时间线后设容量」也不被夹到旧值",
  (() => { Store.setRawCap(5000); Timeline.setMaxFrames(400000); Store.setRawCap(400000);
           return Timeline.maxFrames() === 400000; })(),
  String(Timeline.maxFrames()));
Store.setRawCap(20000); Timeline.setMaxFrames(20000);   /* 复位 */
check("上限同源: 复位后时间线与数据仓再次一致",
  Timeline.maxFrames() === Store.rawCap(),
  Timeline.maxFrames() + " vs " + Store.rawCap());

/* ========== ⑰ V2.2.3：编码识别 / GBK / 文本评分 / 配置 v4 ========== */
const GBK = (X.codec || SL.codec);

(function () {
  /* GBK 解码：「你好」的 GBK 字节 = C4 E3 BA C3 */
  const gbkBytes = new Uint8Array([0xC4, 0xE3, 0xBA, 0xC3]);
  const dec = GBK.decodeText(gbkBytes, "gbk");
  check("GBK: 收方向能正确解码中文", dec.text === "你好", JSON.stringify(dec.text));

  /* GBK 发送：ASCII 直通；非 ASCII 落 UTF-8（不炸） */
  const g1 = GBK.encodeText("AT+RST", "gbk");
  check("GBK: 发送 ASCII 直通", g1.length === 6 && g1[0] === 0x41, g1.length + "B");
  const g2 = GBK.encodeText("你好", "gbk");
  check("GBK: 发送非 ASCII 落 UTF-8 字节（不产生空码）",
    g2.length === 6 && g2[0] === 0xE4, g2.length + "B");

  /* 编码智能识别三分诊 */
  const asciiU8 = new TextEncoder().encode("temp=25.3, cur=1.02\nrpm=1800\n");
  const r1 = GBK.analyzeEncoding(asciiU8);
  check("识别: 纯 ASCII → ascii", r1.guess === "ascii", r1.guess + " / " + r1.detail);

  const utf8U8 = new TextEncoder().encode("温度=25.3℃，电流=1.02A\n");
  const r2 = GBK.analyzeEncoding(utf8U8);
  check("识别: 合法 UTF-8 中文 → utf-8", r2.guess === "utf-8", r2.guess);

  const r3 = GBK.analyzeEncoding(gbkBytes);
  check("识别: GBK 字节 → gbk（UTF-8 严格校验失败而 GB18030 通过）", r3.guess === "gbk", r3.guess);

  const noise = new Uint8Array(64);
  let seed = 42;
  for (let i = 0; i < noise.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF;
    noise[i] = 0x80 + ((seed >> 8) & 0x7F);        /* 全高位非法序列 */
  }
  const r4 = GBK.analyzeEncoding(noise);
  check("识别: 高位噪声 → binary/latin1（不误报 gbk/utf-8）",
    r4.guess === "binary" || r4.guess === "latin1", r4.guess);

  /* 文本可疑度评分：正常文本高分、随机高位低分（波特率扫描的判据） */
  const s1 = GBK.plainScore(asciiU8);
  const s2 = GBK.plainScore(noise);
  check("评分: 正常文本 ≥ 0.85", s1 >= 0.85, s1.toFixed(3));
  check("评分: 采样错位噪声 < 0.6", s2 < 0.6, s2.toFixed(3));

  /* 配置 v3 → 当前版本：老配置自动补全所有新增段落。
     版本号动态对照 core.CFG_VERSION —— 不再写死数字，否则每加一次迁移就要改一次断言
     （这里原来写死 === 4，V2.2.15 加 v4→v5 时必然误报）。 */
  const migrated = core.migrateConfig({ version: 3, transport: { baudRate: 9600 } });
  check("配置: v3 迁移到当前 CFG_VERSION 后补齐 demo.faults 且保留原值",
    migrated.version === core.CFG_VERSION && migrated.demo && migrated.demo.faults
      && migrated.demo.faults.drop === 0 && migrated.transport.baudRate === 9600,
    "v" + migrated.version + " " + JSON.stringify(migrated.demo));

  /* v4 → v5：新增「图例勾选跨面板同步」开关（AUDIT A-83）。
     两个方向都要锁：① 老配置没这个字段 → 补默认 true（升级后默认就是「同步」）；
     ② 用户显式关过（false）→ 迁移必须保留，不能被默认值覆盖回 true。
     ⚠ 版本号一律动态对照 core.CFG_VERSION —— 这里原来写死 === 5，加 v5→v6 迁移时就误报了
     （与前面 v3 迁移、E2E 里那条写死 "2.2.14" 是同一个反模式，一并改掉）。 */
  const m4 = core.migrateConfig({ version: 4, ui: { markFailed: false } });
  check("配置: v4 迁移到当前 CFG_VERSION 补齐 ui.syncChanHidden（默认 true）",
    m4.version === core.CFG_VERSION && m4.ui.syncChanHidden === true, "v" + m4.version);
  check("配置: v4 迁移保留用户已有的 ui 值（markFailed=false 不被默认值覆盖）",
    m4.ui.markFailed === false, JSON.stringify(m4.ui.markFailed));
  const m4b = core.migrateConfig({ version: 4, ui: { syncChanHidden: false } });
  check("配置: v4 迁移不覆盖用户显式关掉的 syncChanHidden=false",
    m4b.ui.syncChanHidden === false, JSON.stringify(m4b.ui.syncChanHidden));

  /* v5 → v6：新增「量级差过大时提示拆分面板」开关（AUDIT A-87），同样双向锁 */
  const m5 = core.migrateConfig({ version: 5, ui: { markFailed: true } });
  check("配置: v5 迁移到当前 CFG_VERSION 补齐 ui.scaleSplitHint（默认 true）",
    m5.version === core.CFG_VERSION && m5.ui.scaleSplitHint === true, "v" + m5.version);
  const m5b = core.migrateConfig({ version: 5, ui: { scaleSplitHint: false } });
  check("配置: v5 迁移不覆盖用户显式关掉的 scaleSplitHint=false",
    m5b.ui.scaleSplitHint === false, JSON.stringify(m5b.ui.scaleSplitHint));
})();

/* ========== ⑱ V2.2.4：AUTO 自适应 / 测试页签 / 演示自动补波形 ========== */
(function () {
  /* AUTO 一键自适应：transport 层 API 存在（探测与结论，不碰配置） */
  check("AUTO: transport.autoAdapt 是函数", typeof Tpt.autoAdapt === "function",
    typeof Tpt.autoAdapt);
  check("AUTO: transport.isScanning 是函数", typeof Tpt.isScanning === "function",
    typeof Tpt.isScanning);

  /* 演示自动补波形：ensureDemoWave 用的描述符必须通过插件校验 */
  const wave = Plugins.validate({
    type: "timeplot", title: "时域波形",
    channels: ["auto"], window: 500, h: 300
  });
  check("演示补波形: 时域波形描述符合法",
    !!wave.panel && (!wave.errors || wave.errors.length === 0),
    wave.errors && wave.errors.join("；"));

  /* 测试页签结构：演示入口挪进测试 pane、案例卡片齐全、AUTO 按钮在设备 pane */
  const html = fs.readFileSync(
    path.join(JS, "..", "index.html"), "utf8");
  const testPaneIdx = html.indexOf('data-pane="test"');
  const demoBtnIdx = html.indexOf('id="slBtnDemo"');
  check("测试页签: 左栏存在 data-pane=test 的页签与面板", testPaneIdx > 0, testPaneIdx);
  check("测试页签: 演示按钮已挪进测试页签（不再出现在顶栏）",
    demoBtnIdx > testPaneIdx, "demo@" + demoBtnIdx + " test@" + testPaneIdx);
  check("测试页签: 顶栏不再有演示按钮（连接与断开之间）",
    html.indexOf('id="slBtnDisconnect"') < demoBtnIdx || demoBtnIdx < 0, "");
  const cases = ["sine", "motor", "corrupt", "garble", "lossy"];
  const missing = cases.filter(function (k) {
    return html.indexOf('data-case="' + k + '"') < 0;
  });
  check("测试页签: 五个案例卡片齐全(sine/motor/corrupt/garble/lossy)",
    missing.length === 0, "缺 " + missing.join(","));
  check("AUTO: 设备页签有 slBtnAuto 按钮", html.indexOf('id="slBtnAuto"') > 0, "");
  check("测试页签: 有案例状态徽章 slTestBadge", html.indexOf('id="slTestBadge"') > 0, "");
  check("快捷工具条: 监视器面板头预留 data-quick 容器（views.js）",
    fs.readFileSync(path.join(JS, "views.js"), "utf8").indexOf('data-quick') > 0, "");
  check("RX/TX: 监视器方向标记已改为 箭头+下位机/上位机",
    fs.readFileSync(path.join(JS, "plugins.js"), "utf8").indexOf('"← 下位机"') > 0
      && fs.readFileSync(path.join(JS, "plugins.js"), "utf8").indexOf('"→ 上位机"') > 0, "");
  check("V2.2.5: 流控信号已移出顶栏(设备页签内)",
    fs.readFileSync(path.join(JS, "..", "index.html"), "utf8").indexOf('id="slModem"') >
      fs.readFileSync(path.join(JS, "..", "index.html"), "utf8").indexOf('data-pane="test"'), "");
  check("RX/TX: 顶栏计数改用直白的 ↓接收/↑发送（旧版两个都叫「下位机」，只靠箭头才分得开）",
    html.indexOf("↓接收") > 0 && html.indexOf("↑发送") > 0
      && html.indexOf('下位机 <b id="slRxCount"') < 0, "");
})();

/* ========== ⑲ V2.2.6：示波器时域 / 统计面板 / 数据文件夹 / 帮助中心 ========== */
(function () {
  const APP = "06_学习工具/_串口调试助手";
  const rd = function (rel) { return fs.readFileSync(path.join(__dirname, "..", APP, rel), "utf8"); };

  /* 实时统计渲染器已注册（含 RMS / VPP 指标） */
  const reg = Plugins.list().some(function (x) { return x.id === "statsboard"; });
  check("V2.2.6: 实时统计渲染器 statsboard 已注册", reg, "");
  check("V2.2.6: 时域 Auto 重置钩子 P.resetTimeplot 存在",
    typeof Plugins.resetTimeplot === "function", typeof Plugins.resetTimeplot);

  /* 数据文件夹 API 全套 */
  const AI = SL.aichan || (globalThis.SerialLab && globalThis.SerialLab.aichan);
  check("V2.2.6: aichan 数据文件夹 API（bindFolder/startDirLog/listLogs/cleanLogs/writeCsvToFolder）",
    !!AI && typeof AI.bindFolder === "function" && typeof AI.startDirLog === "function"
      && typeof AI.listLogs === "function" && typeof AI.cleanLogs === "function"
      && typeof AI.writeCsvToFolder === "function", !!AI);

  /* 规范命名前缀 seriallab_v<版本>_<kind>-<tag>_<stamp> */
  check("V2.2.6: 落盘命名规范 seriallab_v 前缀", rd("js/aichan.js").indexOf('seriallab_v') > 0, "");

  /* 面板级暂停 + 示波器视角 + 设置中心 + 帮助增强 */
  check("V2.2.6: 面板级暂停 togglePanelPause 存在",
    typeof SL.views.togglePanelPause === "function", "");
  check("V2.2.6: 方向标记三态（仅发送默认）",
    rd("js/plugins.js").indexOf('dirMode') > 0 && rd("js/plugins.js").indexOf('"tx"') > 0, "");
  check("V2.2.6: 时间戳精度可设（timePrec s/ms/us）",
    rd("js/plugins.js").indexOf("timePrec") > 0 && rd("js/ui.js").indexOf("slSetPrec") > 0, "");
  check("V2.2.6: 设置中心入口（右下角 ⋯）",
    rd("index.html").indexOf('id="slBtnSettings"') > 0, "");
  check("V2.2.6: 帮助含数据文件夹命名规范与致谢章节",
    rd("js/ui.js").indexOf("数据文件夹与文件命名规范") > 0
      && rd("js/ui.js").indexOf("致谢与参考开源项目") > 0, "");
  /* 版本链动态对照：UI.VERSION 必须等于 site.js 的 S.VERSION 括号前段（不再写死数字） */
  const siteVer = (fs.readFileSync(path.join(__dirname, "..", "_assets", "site.js"), "utf8")
    .match(/S\.VERSION = "V([0-9.]+)\(/) || [])[1] || "";
  const appVer = (rd("js/ui.js").match(/UI\.VERSION = "([0-9.]+)";/) || [])[1] || "";
  check("版本链: 应用内 UI.VERSION 与站点 S.VERSION 一致",
    appVer !== "" && appVer === siteVer, "site=" + siteVer + " app=" + appVer);
})();

/* ========== ⑳ V2.2.7：浅色/暗色主题 WCAG 对比度审计 ==========
   为什么要有这一组：V2.2.7 用户截图实证「浅色模式下说明文字/悬浮简介几乎看不清」
   ——tooltip 文字色硬编码暗色浅灰白 + 浅色气泡白底；ink-3 浅色值只有 4.43:1。
   这组把「每个文字色 × 每类背景」的 WCAG 对比度全部算一遍，门限 4.5（AA 正文），
   以后任何人调色不达标直接 FAIL，不再靠截图抓。 */
(function () {
  const cssText = fs.readFileSync(path.join(JS, "..", "app.css"), "utf8");

  function pc(v) {
    v = v.trim();
    if (v[0] === "#") {
      const h = v.slice(1);
      return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
    }
    const m = v.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const p = m[1].split(",").map(x => parseFloat(x));
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    return null;
  }
  function comp(f, b) {
    const a = f.a;
    return { r: f.r * a + b.r * (1 - a), g: f.g * a + b.g * (1 - a), b: f.b * a + b.b * (1 - a) };
  }
  function lum(c) {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  function contrast(f, b) {
    const l1 = lum(comp(f, b)), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }
  function themeColors(tag) {
    const i = cssText.indexOf(tag);
    const blk = cssText.slice(i, cssText.indexOf("}", cssText.indexOf("--sl-c8", i)));
    const T = {};
    const re = /--sl-([a-z0-9-]+):\s*([^;]+);/g;
    let m;
    while ((m = re.exec(blk))) { T[m[1]] = m[2].trim(); }
    return T;
  }
  const INKS = ["ink", "ink-2", "ink-3", "ok-ink", "warn-ink", "bad-ink",
    "ts-ink", "dir-tx-ink", "dir-rx-ink", "num-ink"];
  for (const [name, tag] of [["暗色", ":root {"],
        ["浅色", 'html:not([data-theme-early="dark"]) {']]) {
    const T = themeColors(tag);
    const bg = pc(T["bg"]);
    const bgs = {
      "页面": bg,
      "面板": comp(pc(T["surface"]), bg),
      "次级": comp(pc(T["surface-2"]), bg),
      "气泡": comp(pc(T["tip"]), bg),
      "画布": pc(T["canvas-bg"])
    };
    let worst = 99, worstAt = "";
    for (const k of INKS) {
      const c = pc(T[k]);
      if (!c) { continue; }
      for (const bn of Object.keys(bgs)) {
        const v = contrast(c, bgs[bn]);
        if (v < worst) { worst = v; worstAt = k + "@" + bn; }
      }
    }
    check("对比度: " + name + "主题全部文字色×背景 ≥ 4.5 (AA)",
      worst >= 4.5, "最差 " + worst.toFixed(2) + " @ " + worstAt);
  }
  /* tooltip 文字色必须随主题（V2.2.7 根因修复的防回归锁） */
  const tipboxRule = cssText.match(/\.sl-tipbox\s*\{[^}]*\}/) || "";
  check("对比度: .sl-tipbox 文字色走主题令牌（tip-ink/ink）不再硬编码",
    /\.sl-tipbox\s*\{[^}]*color:\s*var\(--sl-(tip-ink|ink)/.test(cssText), "");
})();

/* ========== ㉑ V2.2.13：数字高亮跟通道色 ========== */
(function () {
  const APP = "06_学习工具/_串口调试助手";
  const rd = function (rel) { return fs.readFileSync(path.join(__dirname, "..", APP, rel), "utf8"); };
  check("V2.2.13: 数字高亮三档（channel 默认/red/off）",
    rd("js/plugins.js").indexOf('numStyle === "red"') > 0
      && rd("js/plugins.js").indexOf('"channel"') > 0, "");
  check("V2.2.13: 键值对数字按波形通道色渲染 markByChannels",
    rd("js/plugins.js").indexOf("markByChannels") > 0, "");
  check("V2.2.13: 显示页签与设置中心都有数字高亮选择器",
    rd("index.html").indexOf('id="slNumStyle"') > 0
      && rd("js/ui.js").indexOf('id="slSetNumStyle"') > 0, "");
  check("V2.2.13: 时间戳精度含秒档（低精度需求）",
    rd("js/ui.js").indexOf('value="s"') > 0 || rd("js/ui.js").indexOf("秒（") > 0, "");
})();

/* ========== V2.2.15：命名统一 + 编码单源 + 图例勾选框（AUDIT A-83） ========== */
(function () {
  const APP = "06_学习工具/_串口调试助手";
  const rd = function (rel) { return fs.readFileSync(path.join(__dirname, "..", APP, rel), "utf8"); };
  const plugs = rd("js/plugins.js");
  const ui = rd("js/ui.js");
  const html = rd("index.html");
  const cores = rd("js/core.js");

  /* 命名统一：同一个渲染器在「图表」页签列表、默认面板标题、帮助文档里必须同名。
     历史问题：label 叫「时域折线」而建出的面板标题叫「时域波形」，同一个东西两个
     名字——用户看列表一个名、看卡片另一个名（AUDIT A-83）。 */
  check("V2.2.15: timeplot 的 label 统一为「时域波形」（与默认面板标题同名）",
    /id:\s*"timeplot",[\s\S]{0,40}?label:\s*"时域波形"/.test(plugs), "");
  check("V2.2.15: 应用目录内不再出现旧名「时域折线」（js/文档/入口页全部统一）",
    plugs.indexOf("时域折线") < 0 && ui.indexOf("时域折线") < 0
      && rd("js/views.js").indexOf("时域折线") < 0
      && rd("llms.txt").indexOf("时域折线") < 0
      && rd("AGENTS.md").indexOf("时域折线") < 0
      && rd("skills/html-webserial-app/SKILL.md").indexOf("时域折线") < 0, "");
  check("V2.2.15: 默认/演示补建的时域面板标题与 label 同源（列表名 = 卡片名）",
    rd("js/views.js").indexOf('title: "时域波形"') > 0
      && ui.indexOf('title: "时域波形"') > 0, "");

  /* 下拉文案统一：两处同源列表必须同格式——曾经「图表」页签拼 (id) 而工具条不拼，
     同一个列表在两处长得不一样，属于「细节部分命名没有统一」。 */
  check("V2.2.15: 「图表」页签下拉不再拼 (id) 后缀（与主区工具条同格式）",
    ui.indexOf('list[i].label + "（"') < 0, "");

  /* 编码选项单源：快捷条文案必须从 #slEncoding 的 option 派生，不许再硬编码第二份。
     历史问题：左栏写「GBK / GB2312」而快捷条写「GBK」——同一个设置两处文案不同，
     用户看到的就是「文本监视器的编码和设备里的编码重复而且不同步」。 */
  check("V2.2.15: 监视器快捷条编码选项从 #slEncoding 派生（单源，杜绝文案二次漂移）",
    ui.indexOf("function encOptions()") > 0
      && ui.indexOf('$("slEncoding")') > 0
      && ui.indexOf("encOpts = encOptions()") > 0, "");
  check("V2.2.15: 已删除硬编码的第二份编码选项表（QK_ENC_OPTS 只剩 fallback）",
    ui.indexOf("var QK_ENC_OPTS =") < 0
      && ui.indexOf("QK_ENC_OPTS_FALLBACK") > 0, "");
  check("V2.2.15: 左栏编码下拉含 GBK 且文案为「GBK / GB2312」（派生源的唯一真源）",
    html.indexOf('value="gbk">GBK / GB2312<') > 0, "");

  /* 图例勾选框：把「可点」变成「一眼看出能勾」。勾用线段绘制，不依赖字体字形，
     因为 Consolas/等宽字体的 ✓ 覆盖不可靠，用字形会在某些平台画成豆腐块。 */
  check("V2.2.15: 图例每条通道前有勾选框（strokeRect 画方框）",
    plugs.indexOf("ctx.strokeRect(bx + 0.5, by + 0.5, bs - 1, bs - 1)") > 0, "");
  check("V2.2.15: 勾号用线段绘制而非字体字形（跨平台字形覆盖不可靠）",
    plugs.indexOf("ctx.moveTo(bx + 2, by + 5)") > 0
      && plugs.indexOf("ctx.lineTo(bx + 8, by + 2.2)") > 0, "");
  check("V2.2.15: 图例命中区随勾选框加宽（点方框/色块/文字都能切换）",
    plugs.indexOf("var wEnd = cx + 26 + labelW + 8;") > 0
      && plugs.indexOf("legendHits.push({ key: it.key, x0: cx - 2, x1: wEnd, y: cy });") > 0, "");

  /* 跨面板同步显隐（AUDIT A-83）：曾经 hiddenChans 按 panel.id 分键，而时域面板与频域
     面板的 id 必然不同 → 两边状态永远不通；偏偏 V2.2.14 的更新日志声称「一处管理、
     时域关了频域也跟着关」。这是一条「文档说了、代码没做」的缺陷。 */
  check("V2.2.15: 图例勾选取表统一走 hiddenMap()（不再直接下标 panel.id）",
    plugs.indexOf("function hiddenMap(panel)") > 0
      && plugs.indexOf("hiddenChans[panel.id]") < 0, "");
  check("V2.2.15: hiddenMap 的键在「同步」时用全局键、关闭时回落 panel.id",
    plugs.indexOf('var k = sync ? "__all__" : String(panel.id);') > 0, "");
  check("V2.2.15: 同步开关由 ui.syncChanHidden 控制且默认开启",
    cores.indexOf("syncChanHidden: true") > 0, "");
  check("V2.2.15: CFG_VERSION 是声明式常量，且 v5 / v6 迁移段都在（不写死版本号，避免每加一次迁移就误报）",
    /var CFG_VERSION = \d+;/.test(cores)
      && cores.indexOf("if (v < 5)") > 0
      && cores.indexOf("if (v < 6)") > 0, "");
  check("V2.2.15: 「显示」页签有同步显隐开关且已接线到 ui.syncChanHidden",
    html.indexOf('id="slSyncChanHidden"') > 0
      && ui.indexOf('el: "slSyncChanHidden", path: "ui.syncChanHidden"') > 0, "");

  /* ---- A-87：量级差过大 → 提示拆分面板 ---- */
  check("A-87: 渲染层只检测并抛事件、不碰 DOM（提示与拆分都归 ui 层）",
    plugs.indexOf("P.scaleGroups = function (series)") > 0
      && plugs.indexOf('core.emit("panel:scaleHint"') > 0
      && ui.indexOf('core.on("panel:scaleHint", onScaleHint)') > 0, "");
  check("A-87: 时域渲染确实调用了检测（否则整条功能不会被触发）",
    plugs.indexOf("maybeScaleHint(panel, series);") > 0, "");
  check("A-87: 演示模式不提示（演示通道是应用自己挑的，且弹窗会挡住教学路径的操作）",
    /function maybeScaleHint\(panel, series\) \{[\s\S]{0,600}?if \(core\.state\.demo\) \{ return; \}/.test(plugs), "");
  check("A-87: 拆分走 views 的公开入口，且新面板默认进工作区不抢主位",
    ui.indexOf("SL.views.updatePanel(p.id, { channels: groups[0].keys })") > 0
      && /SL\.views\.addPanel\(\{[\s\S]{0,400}?\}, true\);/.test(ui), "");
  check("A-87: 提示开关 ui.scaleSplitHint 默认开启、可在「显示」页签关掉",
    cores.indexOf("scaleSplitHint: true") > 0
      && html.indexOf('id="slScaleSplitHint"') > 0
      && ui.indexOf('el: "slScaleSplitHint", path: "ui.scaleSplitHint"') > 0, "");
  check("A-87: 拆分属建设性操作，确认键不能是危险红（UI.confirm 支持 opts.danger=false）",
    ui.indexOf("UI.confirm = function (title, msg, okText, opts)") > 0
      && ui.indexOf("opts.danger === false") > 0
      && ui.indexOf("{ danger: false }") > 0, "");

  /* A-87 功能回归：直接喂合成 series 给纯函数 P.scaleGroups，验证分组数学本身。
     为什么必须功能性：结构断言看不出「阈值算错 / 分组算错 / 除零」——A-84/A-85 的教训。 */
  const mkSeries = function (key, lo, hi) {
    const v = [];
    for (let i = 0; i < 10; i++) { v.push(lo + (hi - lo) * i / 9); }
    return { key: key, label: key, v: v };
  };
  const sg1 = Plugins.scaleGroups([mkSeries("pos", 0, 4000), mkSeries("cur", 0.08, 1.83)]);
  check("A-87: 量级差 ~2000 倍的通道被检出，并要求分成 2 组",
    !!sg1 && sg1.groups.length === 2 && sg1.groups[0].items.length === 1 && sg1.ratio > 1000,
    JSON.stringify(sg1 && { ratio: Math.round(sg1.ratio), groups: sg1.groups.length }));
  check("A-87: 量级相近的通道不提示（不打扰用户）",
    Plugins.scaleGroups([mkSeries("a", 0, 100), mkSeries("b", 0, 90)]) === null, "");
  check("A-87: 阈值边界——跨度相差 40 倍不提示、60 倍才提示",
    Plugins.scaleGroups([mkSeries("a", 0, 4000), mkSeries("b", 0, 100)]) === null
      && !!Plugins.scaleGroups([mkSeries("a", 0, 6000), mkSeries("b", 0, 100)]), "");
  const sg3 = Plugins.scaleGroups([mkSeries("big", 0, 1000), mkSeries("mid", 0, 500), mkSeries("tiny", 0, 1)]);
  check("A-87: 同组内跨度 10 倍以内合并（big+mid），超出的单开一组",
    !!sg3 && sg3.groups.length === 2 && sg3.groups[0].items.length === 2,
    JSON.stringify(sg3 && sg3.groups.map(function (g) { return g.items.length; })));
  check("A-87: 恒定值（跨度 0）与样本不足 8 点的通道不参与判断，避免误报",
    Plugins.scaleGroups([
      { key: "flat", label: "flat", v: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5] },
      { key: "few", label: "few", v: [0, 4000, 100] }
    ]) === null, "");
  check("A-87: 单通道不会触发（没有「和谁比」的问题）",
    Plugins.scaleGroups([mkSeries("only", 0, 4000)]) === null, "");
})();

/* ========== V2.2.16：简约化与可读性（AUDIT A-88）==========
   这里的结构断言只负责「实现没被改回去」；行为本身由 E2E 的
   serial_v2216 用真实几何锁（横向溢出 = 0、底行标签两两不相交）。 */
(function () {
  const ui16 = fs.readFileSync(path.join(JS, "ui.js"), "utf8");
  const plug16 = fs.readFileSync(path.join(JS, "plugins.js"), "utf8");
  const views16 = fs.readFileSync(path.join(JS, "views.js"), "utf8");
  const css16 = fs.readFileSync(path.join(JS, "..", "app.css"), "utf8");
  const html16 = fs.readFileSync(path.join(JS, "..", "index.html"), "utf8");

  check("A-88: 通道列表改卡片式，且用 white-space:normal 覆盖 nowrap（横向滚动条的根因）",
    ui16.indexOf('el("table", "sl-table sl-chan-table")') > 0
      && css16.indexOf("table.sl-chan-table") > 0
      && /table\.sl-chan-table td \{[\s\S]{0,160}?white-space: normal;/.test(css16), "");
  check("A-88: 通道卡片仍保留每通道一个 <tr>（三条既有断言在数 #slChannels tr，不为重构动它们）",
    /var tr = el\("tr"\);[\s\S]{0,4000}?table\.appendChild\(tr\);/.test(ui16), "");
  check("A-88: 通道卡片含取色器与「显示」勾选框，且取色前有 #rrggbb 兜底",
    ui16.indexOf("sl-chan-color") > 0 && ui16.indexOf("sl-chan-vis") > 0
      && ui16.indexOf("function colorHexOf") > 0
      && ui16.indexOf("/^#[0-9a-fA-F]{6}$/") > 0, "");
  check("A-88: 静态说明收成「?」，判据同时要求「无 id」与「父节点就是 .sl-group」",
    ui16.indexOf("function foldStaticHints") > 0
      && ui16.indexOf('if (p.id || p.getAttribute("data-folded") === "1") { continue; }') > 0
      && /String\(host\.className\)\.indexOf\("sl-group"\) < 0\) \{ continue; \}/.test(ui16), "");
  check("A-88: foldStaticHints 在 UI.boot 中、且在动态列表渲染之前被调用",
    /initPanelQuick\(\);[\s\S]{0,420}?foldStaticHints\(\);/.test(ui16), "");
  check("A-88: 「?」的说明同时挂在 data-tip 与点击弹窗上（信息只挪位置、不丢）",
    ui16.indexOf('btn.setAttribute("data-tip", text)') > 0
      && ui16.indexOf("UI.modal({ title: title, body: wrap,") > 0, "");
  check("A-88: 波形底行三标签按几何避让（量程用起点标签的实际右边界，不是 PAD.l）",
    plug16.indexOf("return { startRight: startRight, reservedLeft: reservedLeft };") > 0
      && plug16.indexOf("if (ax.startRight + 8 < rx - rrw) {") > 0, "");
  check("A-88: 顶栏不再把收发两个计数都叫「下位机」",
    html16.indexOf("↓接收") > 0 && html16.indexOf("↑发送") > 0, "");

  /* ---- A-90：页签合并 / 零状态引导 / 单面板满宽 / 危险操作分区 ---- */
  check("A-90/A-105: 页签 9→6→5（V2.2.23「解析」并入「设备」），合并一律用 data-also 声明（HTML 零搬动、面板 data-pane 值不变）",
    (html16.match(/class="sl-tab[^"]*"[^>]*data-pane=/g) || []).length === 5
      && html16.indexOf('data-pane="device" data-also="parse channels"') > 0
      && html16.indexOf('data-pane="display" data-also="plugins"') > 0
      && html16.indexOf('data-pane="timeline" data-also="data"') > 0, "");
  check("A-90: 页签切换按「集合包含」判定同屏面板（不是字符串相等）",
    ui16.indexOf('var want = " " + pane + " " + (t.getAttribute("data-also") || "") + " ";') > 0
      && ui16.indexOf('want.indexOf(" " + key + " ") >= 0') > 0, "");
  check("A-90: 同屏第 2 段及以后的面板有分隔线（否则两段内容连在一起）",
    /\.sl-panes > \.sl-pane\.is-on ~ \.sl-pane\.is-on \{[\s\S]{0,160}?border-top: 1px solid/.test(css16), "");
  check("A-90: 零状态引导的三步与两个可点按钮都在（旧版只在 canvas 上写了一行点不了的提示）",
    html16.indexOf('id="slZero"') > 0 && html16.indexOf('id="slZeroDemo"') > 0
      && html16.indexOf('id="slZeroHelp"') > 0
      && html16.indexOf("连接设备") > 0 && html16.indexOf("没硬件也能看") > 0
      && html16.indexOf("数据一到就自动成形") > 0, "");
  check("A-90: 零状态判据用「收到过字节」而不是「有没有通道」（通道表持久化，否则永不出现）",
    /function refreshZeroState\(\)[\s\S]{0,1600}?T\.stats\.rx > 0/.test(ui16)
      && /refreshZeroState\(\)[\s\S]{0,1600}?core\.state\.demo/.test(ui16), "");
  check("A-90: 零状态按钮复用既有入口（不复制一份演示逻辑）且已挂进 boot",
    ui16.indexOf('var b = $("slBtnDemo");') > 0
      && ui16.indexOf("wireZeroState();") > 0
      && /core\.on\("state"[\s\S]{0,240}?refreshZeroState\(\);/.test(ui16), "");
  check("A-90: 单个图表框占满工作区整宽（auto-fill 会把右侧留空）",
    /\.sl-grid > :only-child \{ grid-column: 1 \/ -1; \}/.test(css16), "");
  check("A-90: 「清缓存」（丢数据、不可撤销）与「清面板」（可撤销）分开并标危险色",
    /slBtnClearData"[^>]*\n?[^>]*is-danger/.test(html16)
      || /class="sl-btn is-sm is-danger" id="slBtnClearData"/.test(html16), "");
  check("A-90: 默认分割比例仍是 0.62（AUDIT A-75 有意的「监视器为绝对主视觉」，E2E 也钉着它）",
    /monRatio: 0\.62/.test(fs.readFileSync(path.join(JS, "core.js"), "utf8"))
      && /RATIO_DEF = 0\.62/.test(fs.readFileSync(path.join(JS, "views.js"), "utf8")), "");

  /* ---- A-91：低频组折叠 + 命令面板 + 全局快捷键 + 发送历史 ---- */
  check("A-91: 三个低频组标了 data-fold 且带稳定 key，「常用案例」不许折（那是演示主入口）",
    (html16.match(/data-fold="1"/g) || []).length === 3
      && html16.indexOf('data-fold="1" data-fold-key="signal"') > 0
      && html16.indexOf('data-fold="1" data-fold-key="fault"') > 0
      && html16.indexOf('data-fold="1" data-fold-key="manual"') > 0
      && html16.indexOf('data-fold-key="case"') < 0, "");
  check("A-91: 折叠靠「加类 + CSS 隐藏非 h3 子节点」，不动 DOM 结构（否则 foldStaticHints 的判据会失效）",
    /\.sl-group\.is-folded > \*:not\(h3\) \{ display: none; \}/.test(css16), "");
  check("A-91: 折叠开关是真按钮 + aria-expanded（键盘可达），三角用 CSS 边框画而非 ▾ 字形",
    ui16.indexOf('btn.setAttribute("aria-expanded"') > 0
      && ui16.indexOf('"sl-fold-mark"') > 0
      && /\.sl-fold-mark \{[\s\S]{0,220}?border-left: 5px solid currentColor;/.test(css16)
      && /\.sl-group:not\(\.is-folded\) \.sl-fold-mark \{ transform: rotate\(90deg\); \}/.test(css16), "");
  check("A-91: 折叠在 foldStaticHints 之前挂（组标题里三角要排在「?」前面）",
    /wireFoldGroups\(\);[\s\S]{0,400}?foldStaticHints\(\);/.test(ui16), "");
  check("A-91: 命令面板两个入口（顶栏按钮 + Ctrl+K）都指向同一个 UI.palette",
    html16.indexOf('id="slBtnPalette"') > 0
      && ui16.indexOf('palBtn.addEventListener("click", function () { UI.palette(); })') > 0
      && ui16.indexOf('if (key === "k" && !e.shiftKey && !e.altKey)') > 0, "");
  check("A-91: 命令面板支持子序列匹配（placeholder 承诺了「拼音首字母如 dc = 导出」，只做子串匹配就是假承诺）",
    ui16.indexOf("function subseqScore") > 0
      && ui16.indexOf("return subseqScore(t + \" \" + k, q);") > 0
      && ui16.indexOf("输入动作名，或拼音首字母") > 0, "");
  check("A-91: 命令面板按分数排序（最相关的在最上面，同分保持原序）",
    ui16.indexOf("hits.sort(function (a, b) { return (b.sc - a.sc) || (a.ord - b.ord); });") > 0, "");
  check("A-91: 命令只触发既有按钮、不复制业务逻辑；元素不存在就不列出",
    ui16.indexOf("target.click();") > 0
      && ui16.indexOf("if (document.querySelector(PALETTE_CMDS[i].sel)) { out.push(PALETTE_CMDS[i]); }") > 0
      && ui16.indexOf("if (target.disabled)") > 0, "");
  /* 这条是纯文件级的功能锁：命令表里的选择器只要拼错、或哪个 id 被改名，立刻报出来。
     比「打开浏览器点一遍」便宜得多，而且能覆盖「当前页签不可见因此点不到」的漏网项。 */
  (function () {
    const sels = (ui16.match(/sel:\s*"(#[A-Za-z0-9]+)"/g) || [])
      .map(function (s) { return s.replace(/[\s\S]*"(#[A-Za-z0-9]+)"/, "$1"); });
    const missing = sels.filter(function (s) { return html16.indexOf('id="' + s.slice(1) + '"') < 0; });
    check("A-91: 命令面板里每个选择器都能在 index.html 找到对应 id（防拼错 / 防改 id 后静默失效）",
      sels.length >= 20 && missing.length === 0,
      "共 " + sels.length + " 条，缺失: " + missing.join(","));
  })();
  check("A-91: 发送历史有上限、去重、并且「光标守卫」只在未进历史时生效",
    /if \(sendHistory\.length > 50\) \{ sendHistory\.length = 50; \}/.test(ui16)
      && ui16.indexOf("if (sendHistory[i] === text) { sendHistory.splice(i, 1); break; }") > 0
      && ui16.indexOf("if (histIdx < 0) {") > 0, "");
  check("A-91: 空格 = 暂停，且焦点在按钮/链接上时不抢（那是「用空格激活它」的默认行为）",
    ui16.indexOf('if (key === " " && tag !== "BUTTON" && tag !== "A")') > 0, "");
  check("A-91: 带修饰键的快捷键与既有「无修饰键预设单键」分成两个处理器，注册顺序明确",
    /onAppShortcut\(e\);[\s\S]{0,80}?onGlobalKey\(e\);/.test(ui16), "");

  /* ---- A-92：数字对齐 + 间距刻度 ---- */
  check("A-92: 数字输入框右对齐 + 等宽数字（数值字段左对齐时小数点/个位参差）",
    /input\[type="number"\] \{\n\s*text-align: right;\n\s*font-variant-numeric: tabular-nums;\n\}/.test(css16), "");
  check("A-92: 顶栏计数有稳定宽度并右对齐（否则数字涨到 6 位时右边那排按钮被一路挤）",
    /\.sl-count b \{[\s\S]{0,320}?display: inline-block;[\s\S]{0,120}?min-width: 6ch;[\s\S]{0,120}?text-align: right;/.test(css16), "");
  check("A-92: 数值统计表本来就右对齐，且首列左对齐（别在重构里丢掉）",
    /\.sl-stats-row > span \{[\s\S]{0,160}?text-align: right;/.test(css16)
      && /\.sl-stats-row > span:first-child \{ text-align: left;/.test(css16), "");
  check("A-92: 间距刻度令牌存在，且新建的组件都用令牌、不写死 px",
    css16.indexOf("--sl-gap: 8px;") > 0 && css16.indexOf("--sl-gap-sm: 6px;") > 0
      && /\.sl-chan-r1 \{[\s\S]{0,120}?gap: var\(--sl-gap-sm\);/.test(css16)
      && /\.sl-chan-r2 \{[\s\S]{0,120}?gap: var\(--sl-gap\);/.test(css16)
      && css16.indexOf(".sl-pal { display: flex; flex-direction: column; gap: var(--sl-gap);") > 0
      && /\.sl-pal-row \{[\s\S]{0,120}?gap: var\(--sl-gap\);/.test(css16)
      && /\.sl-zero-act \{[\s\S]{0,140}?gap: var\(--sl-gap\);/.test(css16), "");
  check("A-92: 新组件块内不得再出现写死的 gap: 8px / 6px（令牌唯一入口）",
    !/\.sl-chan-r1 \{[\s\S]{0,120}?gap: 6px;/.test(css16)
      && !/\.sl-chan-r2 \{[\s\S]{0,120}?gap: 8px;/.test(css16)
      && !/\.sl-pal-row \{[\s\S]{0,120}?gap: 8px;/.test(css16), "");

  /* ---- A-96：监视器「清屏 / 复制文本」+ 时间精度就地可调 + 收起态摘要 ---- */
  check("A-96: 监视器面板头有「清屏」与「复制」两个按钮（VOFA+ 的垃圾桶就在这个位置）",
    /panel\.type === "textmon"\) \{[\s\S]{0,900}?iconBtn\("清屏"[\s\S]{0,500}?iconBtn\("复制"/.test(views16), "");
  check("A-96: 清屏是「视图起点」语义而非清数据——只影响这块屏，其他图表与已收数据不动",
    /V\.clearPanelView = function \(id\) \{[\s\S]{0,900}?viewClear\[id\] = at;/.test(views16)
      && /if \(opts\.clearAt\) \{[\s\S]{0,400}?recs\[ri\]\.tWall > opts\.clearAt/.test(plug16), "");
  check("A-96: 清屏用墙钟过滤且缺 tWall 的记录一律保留（宁可多显示，不能把数据清没了）",
    /if \(!recs\[ri\]\.tWall \|\| recs\[ri\]\.tWall > opts\.clearAt\)/.test(plug16), "");
  check("A-96: 复制取 .sl-mon-body 正文，时间戳 / 方向标记可选（默认只要正文 = 去时间戳去方向）",
    /var withTs = !!uicfg\.copyTs;[\s\S]{0,260}?var withDir = !!uicfg\.copyDir;/.test(ui16)
      && ui16.indexOf('querySelector(".sl-mon-body")') > 0
      && /if \(dedupe && lines\.length && lines\[lines\.length - 1\] === line\) \{ continue; \}/.test(ui16), "");
  check("A-96: 复制走事件总线 + ui.copyText（业务模块不碰 DOM、剪贴板归 ui —— 子应用硬规则 5/18）",
    views16.indexOf('core.emit("panel:copyText", { id: panel.id });') > 0
      && ui16.indexOf('core.on("panel:copyText", function (e) {') > 0
      && ui16.indexOf('copyText(lines.join("\\n"));') > 0, "");
  check("A-96: 时间戳精度可在监视器快捷条就地调（原先只藏在 ⋯ 设置中心，用户找不到）",
    ui16.indexOf('data-qk="prec"') > 0
      && ui16.indexOf('else if (k === "prec") {') > 0
      && ui16.indexOf("core.config.transport.timePrec = t.value;") > 0
      && ui16.indexOf('var prec = t.timePrec || "ms";') > 0, "");
  check("A-96: 收起/展开改文字按钮（▾ 会被读成下拉菜单，实测用户点开以为「没反应」）",
    !/iconBtn\("▾", "收起 \/ 展开"/.test(views16)
      && /iconBtn\("收起", "收起 \/ 展开该面板/.test(views16), "");
  check("A-96: 收起态有摘要行（原先只剩标题条，用户点开「什么都没有」）",
    views16.indexOf('brief.className = "sl-panel-brief";') > 0
      && ui16.indexOf("function refreshPanelBriefs()") > 0
      && /\.sl-panel-brief \{[\s\S]{0,320}?text-overflow: ellipsis;/.test(css16), "");
  check("A-96: 文字型面板按钮共用 width:auto（22px 方钮装不下「清屏」二字）",
    /\.sl-iconbtn\.sl-auto-btn,\n\.sl-iconbtn\.sl-text-btn \{[\s\S]{0,160}?width: auto;/.test(css16)
      && /"sl-text-btn sl-clear-view"/.test(views16), "");
  /* 清屏起点为什么不走 updatePanel：它会把描述符交给 Plugins.validate 重新校验，
     自定义 opts 字段会被丢掉 —— 实测「点了清屏 opts 一点没变、行数照常增长」的静默失效。 */
  check("A-96: 清屏起点绕开 updatePanel/validate，改为原地改 + viewClear 重建重注入",
    /V\.clearPanelView = function \(id\) \{[\s\S]{0,800}?viewClear\[id\] = at;[\s\S]{0,260}?p\.opts\.clearAt = at;[\s\S]{0,200}?V\.redraw\(\);/.test(views16)
      && /if \(viewClear\[panel\.id\]\) \{[\s\S]{0,220}?panel\.opts\.clearAt = viewClear\[panel\.id\];/.test(views16), "");
  /* ⚠ 这条是「点了没反应」的通用防线：iconBtn 的回调签名是 onclick(b)，
     写 this.textContent 在严格模式下是 undefined 赋值（抛错）、非严格下赋给了 window（静默失败）——
     两者都表现为「按钮上的图标/文字永远不变」。面板暂停的 ⏸ 就这么错了很久。 */
  check("A-96: views.js 不得再用 this.textContent / this.title 改按钮（iconBtn 回调要把按钮当参数接）",
    views16.indexOf("this.textContent =") < 0 && views16.indexOf("this.title =") < 0
      && views16.indexOf('btn.textContent = paused ? "▶" : "⏸";') > 0
      && views16.indexOf('btn.textContent = V.isCollapsed(panel.id) ? "展开" : "收起";') > 0, "");
})();

/* ========== 自动迭代闭环（AUDIT A-92）==========
   一条命令跑完「改 -> 编 -> 烧 -> 测 -> 判 -> 记台账」。
   脚本必须纯 ASCII（PS 5.1 把无 BOM UTF-8 当 GBK 读，红线 3）且不写死本机路径
   （红线 19：_本地工具/ 下的文件都会入库）。 */
(function () {
  const { execFileSync } = require("child_process");
  const ITER = path.join(__dirname, "迭代一轮.ps1");
  const JUDGE = path.join(__dirname, "serial-judge.json");
  const BRIDGE = path.join(__dirname, "serial-bridge", "bridge.mjs");

  check("C: 迭代一轮.ps1 存在", fs.existsSync(ITER), "");
  if (!fs.existsSync(ITER)) { return; }
  const buf = fs.readFileSync(ITER);
  let nonAscii = 0;
  for (let i = 0; i < buf.length; i++) { if (buf[i] > 127) { nonAscii++; } }
  check("C: 迭代一轮.ps1 是纯 ASCII（红线 3：非 ASCII 会被 PS 5.1 按 GBK 解码，注释里也可能炸出成对引号）",
    nonAscii === 0, nonAscii + " 个非 ASCII 字节");
  const iterSrc = buf.toString("utf8");
  check("C: 迭代一轮.ps1 不写死本机绝对路径（红线 19）",
    !/[A-Za-z]:\\/.test(iterSrc), "");
  check("C: 五段流程齐全（编译 / 烧录 / 采样 / 判据 / 台账）",
    iterSrc.indexOf('"BUILD: "') > 0 && iterSrc.indexOf('"FLASH: "') > 0
      && iterSrc.indexOf('"SAMPLE: "') > 0 && iterSrc.indexOf('"JUDGE: "') > 0
      && iterSrc.indexOf("trial list") > 0, "");
  check("C: 采样窗口不得短于判据声明的窗口（实跑踩过：配置 3000ms 压过判据 6000ms，健康固件被误判 FAIL）",
    iterSrc.indexOf("if ($judgeMs -gt $Ms) { $Ms = $judgeMs;") > 0, "");
  check("C: 编译/烧录失败自动回退上一版固件（判据 FAIL 不回退——那正是迭代要的信息）",
    iterSrc.indexOf("function Invoke-Rollback") > 0
      && iterSrc.indexOf('Invoke-Rollback ("build exit " + $rc)') > 0
      && iterSrc.indexOf('Invoke-Rollback ("flash exit " + $rc)') > 0, "");
  check("C: 退出码语义完整（0 全过 / 2 编译失败 / 3 烧录失败 / 4 判据失败 / 5 轮数用尽）",
    iterSrc.indexOf("exit 5") > 0 && iterSrc.indexOf("exit 4") > 0
      && iterSrc.indexOf("Fail 3") > 0 && iterSrc.indexOf("Fail 2") > 0, "");

  const jr = JSON.parse(fs.readFileSync(JUDGE, "utf8"));
  check("C: 判据集自带采样窗口与多组判据（每组 name + expect），窗口与判据同源",
    typeof jr.ms === "number" && jr.ms > 0
      && Array.isArray(jr.groups) && jr.groups.length >= 3
      && jr.groups.every(function (g) { return g.name && g.expect; }), "");

  /* 功能性：`.count` 必须真能当判据用。snapshot 里一直有 count 字段，
     但 assert 的口径白名单漏了它 —— 于是「数据到底有没有在流」这条最根本的判据
     根本写不出来（第一次实跑就是这么 FAIL 的）。这里真起子进程验一次。 */
  const dataDir = path.join(__dirname, "serial-bridge", "_data");
  if (!fs.existsSync(dataDir)) { fs.mkdirSync(dataDir, { recursive: true }); }
  const fake = path.join(dataDir, "assert-fixture.json");
  fs.writeFileSync(fake, JSON.stringify({
    channels: { tick: { value: 5, min: 1, max: 9, avg: 5, span: 8, count: 7 } }
  }));
  const runA = function (expr) {
    try {
      execFileSync(process.execPath, [BRIDGE, "assert", "--in", fake, "--expect", expr],
        { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
      return 0;
    } catch (e) { return e.status; }
  };
  const okCount = runA("tick.count>=7");
  const badCount = runA("tick.count>=8");
  check("C: 桥的 assert 支持 .count（窗口内有效样本数）—— 边界两侧都要对",
    okCount === 0 && badCount === 2, ">=7 exit=" + okCount + " / >=8 exit=" + badCount);
  try { fs.unlinkSync(fake); } catch (e2) { /* 清理失败不影响断言 */ }

  /* ---- read --send：激励-响应原语（发一条命令、看它的回包）----
     为什么必须做进 read：串口独占，read 占着端口时另起的 write 会**静默失败**，
     采集里字节数恒定不变，现象和「设备没收到」一模一样（实测白查了半天）。 */
  const bridgeSrc = fs.readFileSync(BRIDGE, "utf8");
  check("C: read 支持 --send / --send-delay，并在快照里留下「这包是在回应什么」",
    bridgeSrc.indexOf("const sendText = (flags.send === undefined || flags.send === null) ? null : String(flags.send);") > 0
      && bridgeSrc.indexOf("flags['send-delay']") > 0
      && bridgeSrc.indexOf("sent: sendText === null ? undefined : { text: sendText, hex: sentHex, delayMs: sendDelay }") > 0, "");
  check("C: MCP 的 serial_read 暴露 send / sendDelay 且 callTool 有映射（对外契约同步，硬规则 16）",
    bridgeSrc.indexOf("send: { type: 'string', description: '打开端口后先发这一行") > 0
      && bridgeSrc.indexOf("sendDelay: { type: 'number'") > 0
      && bridgeSrc.indexOf("if (a.send !== undefined && a.send !== null) flags.send = String(a.send);") > 0, "");
  /* 不需要硬件的功能性检查：拿一个不存在的端口跑，能走到「端口解析」这一步
     就说明 --send/--send-delay 被正常吃下去了（否则会先报未知参数）。 */
  const bogus = (function () {
    try {
      execFileSync(process.execPath,
        [BRIDGE, "read", "--send", "x", "--send-delay", "10", "--port", "COM_DOES_NOT_EXIST", "--ms", "100"],
        { encoding: "utf8", maxBuffer: 1024 * 1024, timeout: 20000 });
      return "";
    } catch (e) { return String(e.stdout || "") + String(e.stderr || ""); }
  })();
  check("C: read --send 的参数能被解析（用不存在的端口跑，报错指向端口而非未知参数）",
    /COM_DOES_NOT_EXIST|没有找到|not found|Error/i.test(bogus) && !/未知参数|unknown option/i.test(bogus),
    bogus.replace(/\s+/g, " ").slice(0, 120));

  /* ---- bridge analyze：协议分析必须真能从桥这一侧调到（AI 够得着才算数）----
     为什么要有：protocol.js 早就写好、桥也早就 require 子应用真源，但 MAIN_FILE 里
     一直没加它 —— 结果是「网页里能用、AI 侧够不着」，而文档里又差点写上「用桥做协议分析」。
     这条断言锁的就是「桥真的加载了并真的能跑」。 */
  const ana = (function () {
    try {
      return execFileSync(process.execPath,
        [BRIDGE, "analyze", "--hex", "01 03 00 00 00 0A C5 CD", "--profile", "digest", "--max-bytes", "0"],
        { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 30000 });
    } catch (e) { return "ERR:" + String(e.stdout || "") + String(e.stderr || ""); }
  })();
  check("C: 桥暴露 analyze（MAIN_FILE 已加载 protocol.js；AI 侧够得着才算数）",
    ana.indexOf("Modbus RTU") > 0 && ana.indexOf("读保持寄存器") > 0 && ana.indexOf("总结") < 0,
    ana.replace(/\s+/g, " ").slice(0, 110));
  check("C: analyze 解出请求的起始与数量（不只看协议名）",
    ana.indexOf('"start": 0') > 0 && ana.indexOf('"count": 10') > 0, "");
  const anaDiff = (function () {
    try {
      return execFileSync(process.execPath,
        [BRIDGE, "analyze", "--hex", "01 03 00 00 00 0A C5 CD", "--diff", "01 03 00 00 00 0A C5 CE", "--human"],
        { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 30000 });
    } catch (e) { return "ERR:" + String(e.stdout || "") + String(e.stderr || ""); }
  })();
  check("C: analyze --diff --human 给出一行结论（差异处数 + 共同前缀）",
    /差异 1 处/.test(anaDiff) && /共同前缀 7 字节/.test(anaDiff), anaDiff.replace(/\s+/g, " ").slice(0, 110));
  check("C: 桥的 MAIN_FILE 明确包含 protocol（防止有人「优化」掉它）",
    fs.readFileSync(BRIDGE, "utf8").indexOf("'protocol'") > 0, "");
  /* MCP 工具面：光有 CLI 不算「AI 够得着」——宿主是通过 MCP 调的 */
  check("C: MCP 暴露 serial_analyze（schema + callTool 分支 + diff 参数映射 + 必填 hex）",
    (function () {
      const src = fs.readFileSync(BRIDGE, "utf8");
      return src.indexOf("name: 'serial_analyze'") > 0
        && src.indexOf("else if (name === 'serial_analyze') code = cmdAnalyze(flags);") > 0
        && src.indexOf("if (a.diff !== undefined && a.diff !== null) flags.diff = String(a.diff);") > 0
        && src.indexOf("required: ['hex']") > 0;
    })(), "");
  check("C: 文档里不出现「serial_analyze 尚未实现」这类残留（说做了就要真做了）",
    (function () {
      const sk = path.join(__dirname, "..", ".agents", "skills", "ai-hardware-debug", "SKILL.md");
      const t = fs.readFileSync(sk, "utf8");
      return t.indexOf("serial_analyze") > 0 && t.indexOf("尚未实现") < 0 && t.indexOf("还没加") < 0;
    })(), "");
})();

/* ========== V2.2.15：桥的省流开关功能性回归（AUDIT A-85①④）==========
   为什么必须功能性：README 白纸黑字承诺的 `--bundle=false` / `--samples=N` 曾经被
   parseArgs 静默忽略（只认 `--key value`、不认 `--key=value`，且不做布尔转换），
   实测一次 parse 输出 73985 字节（≈2 万 token）—— 而结构断言看不出「参数被解析成了
   另一个键名」这种事。这里真起子进程跑一遍，直接断言输出里有没有 debugBundle。 */
(function () {
  const { execFileSync } = require("child_process");
  const BRIDGE = path.join(__dirname, "serial-bridge", "bridge.mjs");
  if (!fs.existsSync(BRIDGE)) {
    check("桥: bridge.mjs 存在", false, BRIDGE);
    return;
  }
  const big = "AAAA0106006400320000F1".repeat(200);
  const run = function (extra) {
    return execFileSync(process.execPath,
      [BRIDGE, "parse", "--hex", big, "--preset", "ano10"].concat(extra),
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  };

  const full = run(["--profile=full", "--max-bytes=0"]);
  const noBundle = run(["--bundle=false"]);
  const dflt = run([]);

  check("桥: --profile=full --max-bytes=0 保留完整输出（brief / samples 都在）",
    full.indexOf('"brief"') > 0 && full.indexOf('"samples"') > 0, String(full.length) + " 字节");
  check("桥: --bundle=false 真的生效（A-85① 反向验收：曾经被静默忽略）",
    noBundle.indexOf('"debugBundle"') < 0, String(noBundle.length) + " 字节");
  const dj = JSON.parse(dflt);
  check("桥: 默认预算自动降级为 digest 并标 trimmed（A-85④）",
    dj.trimmed === true && dflt.indexOf('"brief"') < 0, String(dflt.length) + " 字节");
  /* 记录上限三口径必须同源（A-86）：桥曾把 datastore 上限硬编码成 200000 而没同步
     core.config.ui.recordCap，于是调试包永远报 requested=20000 / effective=200000，
     而 schema 明确写着「与 requested 不一致即配置未生效」——AI 每次都读到假警报。 */
  const sd = (dj.bundle && dj.bundle.settings && dj.bundle.settings.display) || {};
  check("桥: 记录上限三口径一致（requested = effective = timelineMaxFrames，防「配置未生效」假警报）",
    typeof sd.recordCapEffective === "number" &&
    sd.recordCapRequested === sd.recordCapEffective &&
    sd.recordCapEffective === sd.timelineMaxFrames,
    JSON.stringify({ req: sd.recordCapRequested, eff: sd.recordCapEffective, tl: sd.timelineMaxFrames }));
  check("桥: digest 相比 full 至少省 80%（实测约 95%，这是「省 token」的量化门限）",
    dflt.length < full.length * 0.2,
    "省 " + Math.round((1 - dflt.length / full.length) * 100) + "%");

  /* 轮数预算闸（「不能无限循环」的机制保证，不依赖 AI 自觉）：
     达到 --max-rounds 后 append 必须以退出码 3 拒绝，且不再写入新行。
     没有这道闸，AI 手里的「循环改进」就是没有终止条件的 while。 */
  const os = require("os");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sl-trial-"));
  const capf = path.join(tmpDir, "cap.json");
  const ledf = path.join(tmpDir, "trials.jsonl");
  const runA = function (args) {
    try {
      return { code: 0, out: execFileSync(process.execPath, [BRIDGE].concat(args),
        { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }) };
    } catch (e) {
      return { code: e.status, out: String(e.stdout || "") };
    }
  };
  runA(["parse", "--hex", big, "--preset", "ano10", "--out", capf]);
  const trialArg = ["trial", "append", "--in", capf, "--expect", "func==1", "--max-rounds", "2", "--ledger", ledf];
  const a1 = runA(trialArg);
  const a2 = runA(trialArg);
  const a3 = runA(trialArg);
  check("桥: trial 轮数预算闸——前两轮正常写入",
    (a1.code === 0 || a1.code === 2) && (a2.code === 0 || a2.code === 2),
    "exit " + a1.code + "," + a2.code);
  let a3j = null;
  try { a3j = JSON.parse(a3.out); } catch (e) { /* 非 JSON 输出 */ }
  check("桥: trial 达到 --max-rounds 后以退出码 3 拒绝并标 budgetExhausted",
    a3.code === 3 && !!a3j && a3j.budgetExhausted === true && a3j.roundsUsed === 2,
    "exit " + a3.code + " " + JSON.stringify(a3j && { be: a3j.budgetExhausted, used: a3j.roundsUsed }));
  check("桥: 被拒绝的那一轮没有写进台账（仍是 2 行）",
    fs.readFileSync(ledf, "utf8").split("\n").filter(function (s) { return s.trim(); }).length === 2, "");
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* 清理失败无妨 */ }
})();

/* ========== V2.2.15：波特率扫描的功能性回归（假串口真跑一次，AUDIT A-84）==========
   为什么必须功能性、不能只做结构断言：
   扫描自 V2.2.4 上线以来【从未成功过一次】，而本脚本一直只做
   `typeof Tpt.autoAdapt === "function"` 这类检查 —— 全程绿灯。两个缺陷都是
   「语法合法、结构断言看不出」的运行时问题：
     ① port.open() 按规范解析成 undefined，旧代码却用 `if (!opened)` 判成败
        （成功与失败都是假值）→ 每一档立刻走「打不开」分支，一个字节都不采；
        同一个文件里的正常连接路径就没依赖它的返回值，两处写法自相矛盾。
     ② chunks / reader 声明在 `new Promise` 执行器函数内部，却在链式 .then 里被读取
        → ReferenceError: chunks is not defined，而且被 step() 的失败回调吞成
        「本档无数据」，从日志上完全看不出是崩溃。
   两者叠加 → autoAdapt 恒返回 { ok:false, reason:"nosignal" } → UI 永远提示
   「确认设备上电且正在发数据」。用户只能放弃自动扫描、自己手配波特率。
   本用例用假 Web Serial 端口（持续喂 "temp=25\n"）真跑一遍扫描，直接锁住这两点。 */
async function scanRegression() {
  const payload = new Uint8Array([0x74, 0x65, 0x6D, 0x70, 0x3D, 0x32, 0x35, 0x0A]);
  const fakePort = {
    open: function () { return Promise.resolve(); },   /* 真实行为：解析成 undefined */
    close: function () { return Promise.resolve(); },
    setSignals: function () { return Promise.resolve(); },
    get readable() {
      return {
        getReader: function () {
          return {
            read: function () {
              /* 让出 macrotask：promise 紧循环会把取样的 setTimeout 饿死 */
              return new Promise(function (r) {
                setTimeout(function () { r({ value: payload, done: false }); }, 2);
              });
            },
            cancel: function () { return Promise.resolve(); },
            releaseLock: function () {}
          };
        }
      };
    }
  };
  Object.defineProperty(globalThis, "navigator", {
    value: {
      serial: {
        requestPort: function () { return Promise.resolve(fakePort); },
        getPorts: function () { return Promise.resolve([fakePort]); }
      }
    },
    configurable: true, writable: true
  });

  const res = await Tpt.scanBaudrate({ candidates: [9600], sampleMs: 60, settleMs: 0 });
  const r0 = (res.results || [])[0] || {};
  check("扫描: 假串口能真采到字节（A-84① 反向验收：open() 解析成 undefined 也必须算打开成功）",
    r0.bytes > 0 && !r0.error, JSON.stringify({ bytes: r0.bytes, error: r0.error }));
  check("扫描: 采到数据后 best.baud 被赋值（旧代码恒为 0 → autoAdapt 永远报 nosignal）",
    !!(res.best && res.best.baud === 9600 && res.best.score > 0),
    JSON.stringify(res.best && { baud: res.best.baud, score: res.best.score }));
  check("扫描: 档位结论不再出现 ReferenceError（A-84② chunks 作用域缺陷）",
    (res.results || []).every(function (r) { return !/is not defined/.test(String(r.error || "")); }),
    JSON.stringify((res.results || []).map(function (r) { return r.error || "ok"; })));

  /* 帧结构打分：文本模式下必须让位，否则文本协议会被帧分干扰 */
  core.config.rule.active = "text";
  check("扫描: 文本模式下 frameScoreOf 让位（返回 null，不干扰文本判定）",
    Tpt.frameScoreOf(payload) === null, String(Tpt.frameScoreOf(payload)));
  /* HEX 模式但缺 app 规则派生（Node 里没加载 app.js）时必须优雅降级，不抛异常 */
  core.config.rule.active = "hex";
  const savedApp = SL.app;
  SL.app = undefined;
  check("扫描: HEX 模式下缺 app.frameRule 时 frameScoreOf 优雅降级为 null（不抛异常）",
    Tpt.frameScoreOf(payload) === null, String(Tpt.frameScoreOf(payload)));
  SL.app = savedApp;
  core.config.rule.active = "text";
}

scanRegression().then(function () {
  console.log("");
  console.log(fails === 0 ? "SERIAL OK" : ("SERIAL FAIL: " + fails));
  process.exit(fails === 0 ? 0 : 1);
}, function (e) {
  console.log("FAIL  扫描回归自身抛异常: " + ((e && e.stack) || e));
  process.exit(1);
});

/* ============================================================
   ⑯-d 就近操作：首屏引导只出现一次 / 面板头标签一致 / 每面板独立勾选（V2.2.22）
   用户原话：「教学例程弹框每次进去都得看，好麻烦」「时域波形的勾选我无法在时域波形
   那个界面取消勾选，不够便利」「通道里的勾选算汇总冗余，拆开了容易怎么融合呢，
   有没有手动的按钮，自动拆不准确」。
   ⚠ 这些变量必须在本 IIFE 内自己读：上面那个 IIFE 里的同名 const 是函数作用域的，
     引用它们会让整个脚本 ReferenceError 崩掉（不是报某条断言失败，我第一次就踩了）。
   ============================================================ */
(function () {
  const appHtml = fs.readFileSync(path.join(JS, "..", "index.html"), "utf8");
  const sUi = fs.readFileSync(path.join(JS, "ui.js"), "utf8");
  const sViews = fs.readFileSync(path.join(JS, "views.js"), "utf8");
  const sPlug = fs.readFileSync(path.join(JS, "plugins.js"), "utf8");
  const sCss = fs.readFileSync(path.join(JS, "..", "app.css"), "utf8");

  check("A-103: 首屏引导有「不再提示」，点了就落盘（之后永远不再出现）",
    appHtml.indexOf('id="slZeroNever"') > 0
      && sUi.indexOf("function markZeroStateServed()") > 0
      && /uicfg\.zeroDismissed = true;[\s\S]{0,80}?core\.saveConfig\(\);/.test(sUi)
      && /if \(uicfg\.zeroDismissed\) \{ z\.hidden = true; return; \}/.test(sUi)
      && /never\.addEventListener\("click"[\s\S]{0,160}?markZeroStateServed\(\);/.test(sUi), "");
  /* 「隐藏」与「永久关闭」必须是两件事：隐藏保持 V2.2.16 原逻辑（收过字节/演示/连上设备），
     永久关闭只由显式按钮触发。曾经想做「用过就自动关闭」，两版都与「新用户必须看到引导」冲突。 */
  check("A-103: 视图隐藏逻辑保持原样（收过字节 / 演示 / 连上设备），不掺入持久判据",
    /z\.hidden = !!\(hasData \|\| core\.state\.demo \|\| core\.state\.conn === "open"\);/.test(sUi)
      && !/markZeroStateServed\(\);\s*\n\s*\}\s*\n\s*z\.hidden/.test(sUi), "");

  check("A-104: 面板头「标题 vs 类型标签」同名时不重复画、字体族与标题统一",
    /var r = Plugins\.get\(panel\.type\);[\s\S]{0,80}?var typeLabel = r \? r\.label : panel\.type;[\s\S]{0,80}?if \(typeLabel !== panel\.title\) \{/.test(sViews)
      && /\.sl-panel-type \{[\s\S]{0,420}?font-family: inherit;/.test(sCss), "");

  check("A-104: 每面板勾选走「覆盖表」而不是「快照」—— 新出现的通道默认仍然会出现",
    /var on = \(panel\.opts && panel\.opts\.chanOn\) \|\| null;/.test(sPlug)
      && /if \(on && Object\.prototype\.hasOwnProperty\.call\(on, c\.key\)\) \{ return !!on\[c\.key\]; \}/.test(sPlug)
      && /return c\.visible !== false;/.test(sPlug), "");

  check("A-104: 波形面板内就地可点图例 + 两个**手动**入口（应用给其他图表 / 恢复统一）",
    sViews.indexOf('legend.className = "sl-legend";') > 0
      && sViews.indexOf('legend.setAttribute("data-legend", panel.id);') > 0
      && sUi.indexOf("function fillLegend(host)") > 0
      && sUi.indexOf("SL.views.setPanelChan(id, c.key, !on);") > 0
      && sUi.indexOf("SL.views.applyPanelChanToAll(id)") > 0
      && sUi.indexOf("SL.views.clearPanelChan(id)") > 0, "");

  /* 图例必须挂在 head 与 body 之间：body 一旦不是 el.lastElementChild，
     Plugins.instantiate(panel, el.lastElementChild) 就会把渲染器挂到别的节点上 —— 整块面板空白。 */
  check("A-104: 图例挂在 head 与 body 之间（body 必须保持 lastElementChild，否则渲染器挂载点会错）",
    /el\.appendChild\(legend\);[\s\S]{0,140}?var body = document\.createElement\("div"\);/.test(sViews), "");

  check("A-104: 覆盖表在面板重建时重新注入（不写进描述符 —— 那会被 Plugins.validate 丢掉）",
    /if \(viewChanOverride\[panel\.id\]\) \{[\s\S]{0,200}?panel\.opts\.chanOn = viewChanOverride\[panel\.id\];/.test(sViews)
      && sViews.indexOf("var viewChanOverride = {};") > 0, "");
})();
/* ============================================================
   ⑯-e 页签归并（A-105）与拖拽手感（A-106）（V2.2.23）
   用户原话：「解析的协议能不能放设备里」「通道提前」「就近安排相关功能懂吗」
   「面板的拓展拖动排列不够丝滑」。
   ============================================================ */
(function () {
  const appHtml = fs.readFileSync(path.join(JS, "..", "index.html"), "utf8");
  const sUi = fs.readFileSync(path.join(JS, "ui.js"), "utf8");
  const sViews = fs.readFileSync(path.join(JS, "views.js"), "utf8");
  const sCss = fs.readFileSync(path.join(JS, "..", "app.css"), "utf8");

  check("A-105: 设备页签按「连接 → 协议 → 通道」同屏，且**首屏**也要应用同屏规则",
    appHtml.indexOf('data-pane="device" data-also="parse channels"') > 0
      && /var tabOn = document\.querySelector\("#slTabs \.sl-tab\.is-on"\);[\s\S]{0,90}?tabOn\.click\(\)/.test(sUi), "");
  check("A-105: 首屏同屏不另写一份规则（派发一次当前页签的 click，复用同一段逻辑）",
    /wireZeroState\(\);[\s\S]{0,600}?var tabOn = document\.querySelector/.test(sUi)
      && sUi.indexOf('var want = " " + pane + " " + (t.getAttribute("data-also") || "") + " ";') > 0, "");

  check("A-106: 拖拽用 rAF 合并 pointermove，且一帧内复用兄弟面板矩形（否则每秒上百次强制同步布局）",
    /pendingMove = ev;[\s\S]{0,140}?rafDrag = global\.requestAnimationFrame\(flushDrag\);/.test(sViews)
      && sViews.indexOf("function flushDrag()") > 0
      && /if \(rectCache\) \{ return rectCache; \}/.test(sViews), "");
  check("A-106: 被拖面板用 transform 跟手（不碰 left/top，避免整页重排），松手清零",
    /el\.style\.transform = "translate\(" \+ dx \+ "px," \+ dy \+ "px\)";/.test(sViews)
      && /els\[dragId\]\.style\.transform = "";/.test(sViews)
      && /\.sl-panel\.is-dragging \{[\s\S]{0,220}?will-change: transform;/.test(sCss), "");
  check("A-106: 重排后重置基准与位移（transform 相对当前位置，不重置会「跳一下又飘回去」）",
    /if \(moved\) \{[\s\S]{0,300}?el\.style\.transform = "";[\s\S]{0,140}?dragOrigin = \{ x: e\.clientX, y: e\.clientY \};/.test(sViews), "");
  check("A-106: 触摸拖拽不滚页面（touch-action: none 挂在面板头）",
    /\.sl-panel-head \{ touch-action: none; \}/.test(sCss), "");
})();