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
 "transport", "plugins", "timeline", "exporters", "views"].forEach(function (n) {
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
check("plugins: 内置七种渲染器注册齐全", Plugins.list().length === 7,
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

  /* 配置 v3 → v4：老配置自动补 demo 段 */
  const migrated = core.migrateConfig({ version: 3, transport: { baudRate: 9600 } });
  check("配置: v3 迁移到 v4 后补齐 demo.faults 且保留原值",
    migrated.version === 4 && migrated.demo && migrated.demo.faults
      && migrated.demo.faults.drop === 0 && migrated.transport.baudRate === 9600,
    JSON.stringify(migrated.demo));
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
  check("RX/TX: 监视器方向标记已改为 下位机/上位机",
    fs.readFileSync(path.join(JS, "plugins.js"), "utf8").indexOf('"下位机"') > 0
      && fs.readFileSync(path.join(JS, "plugins.js"), "utf8").indexOf('"上位机"') > 0, "");
  check("RX/TX: 顶栏计数已改为 ←下位机/→下位机",
    html.indexOf("←下位机") > 0 && html.indexOf("→下位机") > 0, "");
})();

console.log("");
console.log(fails === 0 ? "SERIAL OK" : ("SERIAL FAIL: " + fails));
process.exit(fails === 0 ? 0 : 1);
