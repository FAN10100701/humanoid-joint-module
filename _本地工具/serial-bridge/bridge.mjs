#!/usr/bin/env node
/**
 * SerialLab 本地串口桥（serial-bridge）
 * ------------------------------------------------------------------
 * 目的：让 AI Agent 能**自己**读写串口、自己解析，不必靠人来回搬运数据。
 *
 * 为什么不做在浏览器里：Web Serial 的 requestPort() 必须在真实用户手势的调用栈里，
 * 且端口选择是浏览器原生弹窗 —— AI 既点不了也授权不了。这是平台安全红线，
 * 不是实现问题。所以「AI 自主读写串口」只能落在浏览器之外，就这个脚本。
 *
 * 关键设计：**复用子应用的解析内核**。子应用 14 个模块每个都有 UMD 尾，
 * 这里直接 require 它们的**真源**（不是抄一份副本），因此：
 *   - 解析结果与你在浏览器里看到的逐字节一致；
 *   - 产出的调试包结构与网页端「导出 AI 调试包」完全相同（同一个 exporters.debugBundle）；
 *   - 内核升级后桥自动跟上，不存在「两边算法不一样」的信任问题。
 *
 * 命令：
 *   node bridge.mjs list                      枚举串口
 *   node bridge.mjs read --ms 3000            采 3 秒并按规则解析，输出 JSON
 *   node bridge.mjs read --preset justfloat --ms 2000 --out capture.json
 *   node bridge.mjs write --hex "AA 55 01"    发送
 *   node bridge.mjs parse --hex "..." --preset ano10 --settings cfg.json
 *   node bridge.mjs assert --in capture.json --expect "rpm>1750" --expect "cur.max<3.2"
 *   node bridge.mjs selftest                  无硬件自检（证明内核复用结果正确）
 *   node bridge.mjs mcp                       以 MCP stdio 服务方式运行（给 Agent 直接调）
 *
 * 退出码：0 成功 / 1 用法或运行错误 / 2 assert 判定不通过（便于脚本分支）
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const KERNEL_DIR = path.join(REPO, '06_学习工具', '_串口调试助手', 'js');
/* 按依赖顺序加载（顺序即依赖顺序，与 index.html 的脚本顺序一致） */
const MAIN_FILE = ['util', 'core', 'codec', 'expr', 'parser', 'fft', 'datastore', 'timeline', 'exporters'];

const require = createRequire(import.meta.url);

/* ------------------------------------------------------------------
   内核加载：按依赖顺序 require 子应用真源，挂到 globalThis.SerialLab
   ------------------------------------------------------------------ */
function loadKernel() {
  if (!fs.existsSync(KERNEL_DIR)) {
    throw new Error('找不到子应用内核目录：' + KERNEL_DIR);
  }
  for (const m of MAIN_FILE) {
    const f = path.join(KERNEL_DIR, m + '.js');
    if (!fs.existsSync(f)) throw new Error('内核模块缺失：' + f);
    require(f);
  }
  const SL = globalThis.SerialLab;
  if (!SL || !SL.parser || !SL.codec || !SL.datastore) {
    throw new Error('内核加载失败（SerialLab 命名空间不完整）');
  }
  return SL;
}

const SL = loadKernel();
const U = SL.util;
const core = SL.core;

/* ------------------------------------------------------------------
   小工具
   ------------------------------------------------------------------ */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isTTY = !!process.stdout.isTTY;
const log = (...a) => { if (isTTY) console.error('[bridge]', ...a); };

function parseArgs(argv) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      let k, v;
      if (eq > 2) {
        /* --key=value 形式（README 就是这么写的，必须支持） */
        k = a.slice(2, eq);
        v = a.slice(eq + 1);
      } else {
        k = a.slice(2);
        const next = argv[i + 1];
        if (next === undefined || next.startsWith('--')) v = true;
        else { v = next; i++; }
      }
      /* 字符串 'true'/'false' 一律转真布尔：否则 `flags.bundle !== false` 永远为真，
         `--bundle=false` 会被静默忽略（历史缺陷，见 README 第三/四节） */
      if (v === 'true') v = true;
      else if (v === 'false') v = false;
      flags[k] = v;
    } else {
      rest.push(a);
    }
  }
  return { flags, rest };
}

function num(flags, key, dflt, lo, hi) {
  const v = parseInt(flags[key], 10);
  let n = Number.isFinite(v) ? v : dflt;
  if (typeof lo === 'number' && n < lo) n = lo;
  if (typeof hi === 'number' && n > hi) n = hi;
  return n;
}

function resolvePath(p) {
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

function toU8(buf) {
  if (buf instanceof Uint8Array) return buf;
  return new Uint8Array(buf);
}

function hexSpaced(u8) {
  const parts = [];
  for (let i = 0; i < u8.length; i++) parts.push(u8[i].toString(16).toUpperCase().padStart(2, '0'));
  return parts.join(' ');
}

/* ------------------------------------------------------------------
   输出档位与 token 预算（省 token 的核心）
   full   : 现状 —— 含 brief / samples / recent / 完整 debugBundle，人读或落盘用
   digest : 只留「AI 判断问题所必需」的部分 —— 通道统计 + 帧结构 + 失败样本 + 提示
   预算：--max-bytes（默认 12000）约束 stdout；超了自动降级为 digest 并标 trimmed。
        而 --out 落盘永远是 full —— 「数据不丢」与「上下文不爆」同时成立。

   为什么必须默认带预算：AI 自己不会主动克制。200 帧时 full 输出是 74KB（≈2 万 token），
   跑 20 轮迭代就是 40 万 token —— 这正是「不能一下子读很多数据」要防的事。
   ------------------------------------------------------------------ */
const DIGEST_DROP = { debugBundle: 1, recent: 1, capturedHex: 1, availablePresets: 1 };

function toDigest(snap) {
  const out = {};
  for (const k of Object.keys(snap)) {
    if (DIGEST_DROP[k]) continue;
    out[k] = snap[k];
  }
  /* failures 只留前 5 条：再多通常也是同一种错在重复 */
  if (Array.isArray(out.failures) && out.failures.length > 5) {
    out.failures = out.failures.slice(0, 5);
    out.failuresTruncated = true;
  }
  /* debugBundle 压成「AI 定位问题」必需的四段；brief（人读散文）与 samples（原始点）全丢 */
  const b = snap.debugBundle;
  if (b) {
    out.bundle = {
      kind: b.kind,
      version: b.version,
      stats: b.stats,
      frameLayout: b.frameLayout,
      settings: b.settings,
      hints: b.hints,
    };
  }
  return out;
}

function emit(obj, flags, human) {
  if (flags.human && human) { process.stdout.write(human + '\n'); return; }

  const profile = String(flags.profile || 'full').toLowerCase();
  let text = JSON.stringify((profile === 'digest') ? toDigest(obj) : obj, null, 2);

  const maxBytes = num(flags, 'max-bytes', 12000, 0, 100000000);
  if (maxBytes > 0 && profile !== 'digest' && Buffer.byteLength(text, 'utf8') > maxBytes) {
    const dg = toDigest(obj);
    dg.trimmed = true;
    dg.trimmedNote = 'stdout 超过 --max-bytes ' + maxBytes + '，已自动降级为 digest；'
      + '完整数据请用 --out 落盘，或显式给 --profile=full --max-bytes=0（会显著增加 token）';
    const dtext = JSON.stringify(dg, null, 2);
    /* 只在 digest 确实更小时才替换：assert 这类「指标明细本身就大」的输出压不下去，
       此时保留原样，避免报了一个 trimmed 却什么都没裁掉 */
    if (dtext.length < text.length) { text = dtext; }
  }
  process.stdout.write(text + '\n');
}

/* ------------------------------------------------------------------
   解析规则解析：--preset / --settings / --rule / --rule-inline
   ------------------------------------------------------------------ */
function resolveRule(flags) {
  if (flags.preset) {
    const id = String(flags.preset);
    const r = core.presetRule(id);
    if (!r) {
      throw new Error('未知预设 "' + id + '"，可用：' + core.presets().map((p) => p.id).join(' / '));
    }
    return r;
  }
  if (flags.settings) {
    const cfg = JSON.parse(fs.readFileSync(resolvePath(String(flags.settings)), 'utf8'));
    const merged = core.migrateConfig(cfg);
    if (!merged || !merged.rule) throw new Error('配置文件里没有 rule 段');
    return merged.rule;
  }
  let raw = null;
  if (flags['rule-inline']) {
    raw = JSON.parse(String(flags['rule-inline']));
  } else if (flags.rule) {
    raw = JSON.parse(fs.readFileSync(resolvePath(String(flags.rule)), 'utf8'));
  }
  if (!raw) return core.defaultConfig().rule;
  if (raw.rule) raw = raw.rule;                       // 允许直接给整份配置
  return core.mergeDeep(core.defaultConfig().rule, raw);
}

/* ------------------------------------------------------------------
   采集汇：喂字节 → 分帧/分行 → 解析 → 灌进内核数据仓
   这样产出的调试包与网页端完全同源
   ------------------------------------------------------------------ */
function makeSink(rule, opts = {}) {
  const enc = (opts.encoding) || core.config.transport.encoding || 'utf-8';
  const mode = (rule.active === 'hex') ? 'hex' : 'text';
  core.config.rule = rule;
  /* 桥是 Node 侧的一次性采集：它保留的原始记录上限与浏览器配置无关，固定给足（默认 20 万）。
     ⚠ 必须【同时】写入 core.config.ui.recordCap —— 调试包里的 recordCapRequested 取自那里，
     而 debug-bundle.schema.json 明确约定「requested 与 effective 不一致即配置未生效」。
     只设 datastore 不设 config 的话，桥路径下这两个字段永远对不上（20000 vs 200000），
     AI 每次都会读到「配置未生效」这个假警报、去追一个根本不存在的问题
     （与 A-81 同一类口径缺陷：字段没错，但两个字段放在一起会导出错误结论）。 */
  const rawCap = opts.cap || 200000;
  core.config.ui.recordCap = rawCap;
  SL.datastore.setRawCap(rawCap);
  /* 通道集也要清掉：keepChannels=true 会把上一次的通道留在表里，
     于是「换个规则再解」会看到一批值为 null 的旧通道（selftest 当场抓到过这个坑）。 */
  SL.datastore.clear(false, false);

  const st = {
    mode,
    rest: null,
    bytes: 0,
    lines: 0,
    frames: 0,
    failed: 0,
    t0: U.now(),
    wall0: Date.now(),
  };

  function label(tMs, wallMs) {
    return {
      t: tMs,
      tWall: wallMs,
      tLabel: U.fmtRelative(tMs),
      tLabelAbs: U.fmtClock(wallMs, true),
    };
  }

  function takeText(line) {
    st.lines++;
    const base = label(U.now() - st.t0, Date.now());
    const parsed = SL.parser.parseText(line, rule.text || rule);
    let values = null;
    if (parsed.pairs && parsed.pairs.length) {
      values = {};
      for (const p of parsed.pairs) values[p.key] = p.value;
      SL.datastore.pushFrame({ values, t: base.t, bytes: 0, dir: 'rx', rule: 'text' });
    }
    SL.datastore.pushRaw({
      ...base,
      dir: 'rx',
      display: line,
      text: line,
      hex: '',
      values,
      ok: true,
      reason: '',
    });
  }

  function takeFrame(u8) {
    st.frames++;
    const base = label(U.now() - st.t0, Date.now());
    const res = SL.parser.parseHexFrame(u8, rule.hex || {});
    const ok = !!res.ok;
    if (!ok) st.failed++;
    if (ok && res.values && Object.keys(res.values).length) {
      SL.datastore.pushFrame({ values: res.values, t: base.t, bytes: u8.length, dir: 'rx', rule: 'hex' });
    }
    let reason = res.reason || '';
    if (res.checksum && res.checksum.ok === false) {
      reason = '校验和不匹配（expect=' + res.checksum.expect.toString(16).toUpperCase()
        + ' got=' + res.checksum.got.toString(16).toUpperCase() + '）';
    }
    SL.datastore.pushRaw({
      ...base,
      dir: 'rx',
      display: hexSpaced(u8),
      text: '',
      hex: hexSpaced(u8),
      values: res.values,
      ok,
      reason,
    });
  }

  function feed(buf) {
    /* 允许直接喂字符串（写测试、喂日志片段时很省事），统一编码成字节再走分帧 */
    const u8 = (typeof buf === 'string') ? SL.codec.encodeText(buf, enc) : toU8(buf);
    st.bytes += u8.length;
    if (!u8.length) return;
    if (mode === 'hex') {
      const r = SL.codec.extractFrames(u8, st.rest, rule.hex || {});
      st.rest = r.rest;
      for (const f of r.frames) takeFrame(f);
    } else {
      const r = SL.codec.splitLines(u8, st.rest, enc);
      st.rest = r.rest;
      for (const line of r.lines) takeText(line);
    }
  }

  /* 收尾：把停在缓冲里、没等到分隔符的最后一截也算进去（否则短输出会整条丢掉） */
  function flush() {
    if (!st.rest || !st.rest.length) return;
    const left = st.rest;
    st.rest = null;
    if (mode === 'hex') takeFrame(left);
    else takeText(SL.codec.decodeText(left, enc).text);
  }

  return { st, feed, flush };
}

/* 把数据仓里的内容整理成「给 AI 看的」结构（与网页端调试包同源） */
function snapshot(sink, extra = {}) {
  const channels = {};
  for (const key of SL.datastore.channelKeys()) {
    const meta = SL.datastore.getChannel(key) || {};
    const s = SL.datastore.stat(key, 0) || {};
    channels[key] = {
      value: s.last === undefined ? null : s.last,
      min: s.min === undefined ? null : s.min,
      max: s.max === undefined ? null : s.max,
      avg: s.avg === undefined ? null : s.avg,
      span: s.span === undefined ? null : s.span,
      unit: meta.unit || '',
      count: SL.datastore.count(key),
    };
  }
  const raw = SL.datastore.recentRaw();
  const failures = raw.filter((r) => r.ok === false).slice(-40).map((r) => ({
    tAbs: r.tLabelAbs, hex: r.hex, reason: r.reason,
  }));
  return {
    ok: failures.length === 0,
    mode: sink.st.mode,
    bytes: sink.st.bytes,
    lines: sink.st.lines,
    frames: sink.st.frames,
    failed: sink.st.failed,
    rawRecords: SL.datastore.rawCount(),
    channels,
    failures,
    recent: raw.slice(-20).map((r) => ({
      tAbs: r.tLabelAbs, dir: r.dir === 'tx' ? 'TX' : 'RX',
      hex: r.hex || undefined, text: r.text || undefined,
      values: r.values || undefined, ok: r.ok === false ? false : undefined, reason: r.reason || undefined,
    })),
    ...extra,
  };
}

/* 用内核的 exporters 产出与网页端**同一个**调试包 */
function debugBundle(presetRule, samples) {
  core.config.rule = presetRule;
  if (!core.config.ai) core.config.ai = {};
  return SL.exporters.debugBundle({ samples: samples || 400 });
}

/* ------------------------------------------------------------------
   serialport 按需加载
   ------------------------------------------------------------------ */
let _sp = null;
async function loadSerial() {
  if (_sp) return _sp;
  try {
    _sp = await import('serialport');
    return _sp;
  } catch (e) {
    const err = new Error(
      '未安装 serialport 依赖。请在 _本地工具/serial-bridge 下执行一次：\n' +
      '  npm install\n' +
      '（list / parse / assert / selftest 不需要它，只有需要真实串口的 read / write / mcp 才需要）'
    );
    err.code = 'NO_SERIALPORT';
    throw err;
  }
}

async function pickPort(SerialPort, wanted) {
  const ports = await SerialPort.list();
  if (wanted) {
    const hit = ports.find((p) => String(p.path).toLowerCase() === String(wanted).toLowerCase());
    if (!hit) throw new Error('找不到串口 ' + wanted + '，当前可用：' + (ports.map((p) => p.path).join(', ') || '（无）'));
    return hit.path;
  }
  if (!ports.length) throw new Error('系统里没有列出任何串口');
  if (ports.length > 1) log('检测到多个串口，使用第一个：' + ports.map((p) => p.path).join(', '));
  return ports[0].path;
}

/* ------------------------------------------------------------------
   命令：list
   ------------------------------------------------------------------ */
async function cmdList(flags) {
  let ports = [];
  let note = '';
  try {
    const { SerialPort } = await loadSerial();
    ports = await SerialPort.list();
  } catch (e) {
    note = e.message;
  }
  const out = {
    ok: true,
    count: ports.length,
    ports: ports.map((p) => ({
      path: p.path,
      manufacturer: p.manufacturer || '',
      serialNumber: p.serialNumber || '',
      vendorId: p.vendorId || '',
      productId: p.productId || '',
    })),
    note,
  };
  emit(out, flags, out.ports.length
    ? out.ports.map((p) => p.path + (p.manufacturer ? '  ' + p.manufacturer : '')).join('\n')
    : '没有列出任何串口' + (note ? '\n' + note : ''));
}

/* ------------------------------------------------------------------
   命令：read —— 采一段，解析，出结构化结果 + 同源调试包
   ------------------------------------------------------------------ */
async function cmdRead(flags) {
  const { SerialPort } = await loadSerial();
  const rule = resolveRule(flags);
  const ms = num(flags, 'ms', 2000, 100, 600000);
  const portPath = await pickPort(SerialPort, flags.port ? String(flags.port) : null);
  const openOpts = {
    path: portPath,
    baudRate: num(flags, 'baud', 115200, 50, 12000000),
    dataBits: num(flags, 'databits', 8, 5, 8),
    stopBits: num(flags, 'stopbits', 1, 1, 2),
    parity: String(flags.parity || 'none'),
    autoOpen: false,
  };

  log('打开 ' + portPath + ' ' + openOpts.baudRate + ' ' + openOpts.dataBits
    + (openOpts.parity === 'none' ? 'N' : openOpts.parity.charAt(0).toUpperCase()) + openOpts.stopBits);
  const port = new SerialPort(openOpts);
  await new Promise((res, rej) => port.open((e) => (e ? rej(e) : res())));

  const sink = makeSink(rule, { encoding: String(flags.encoding || '') || undefined });
  const chunks = [];
  port.on('data', (b) => {
    const buf = Buffer.from(b);
    chunks.push(buf);
    sink.feed(buf);
  });
  log('采集 ' + ms + ' ms …');
  await sleep(ms);
  await new Promise((res) => port.close(() => res()));
  sink.flush();

  const rawHex = Buffer.concat(chunks);
  const extra = {
    port: portPath,
    serial: { baudRate: openOpts.baudRate, dataBits: openOpts.dataBits, stopBits: openOpts.stopBits, parity: openOpts.parity },
    durationMs: ms,
    ruleMode: rule.active,
    capturedHex: rawHex.length > 4096 ? hexSpaced(rawHex.subarray(0, 4096)) + ' …(截断)' : hexSpaced(rawHex),
  };
  const snap = snapshot(sink, extra);
  if (flags.bundle !== false) snap.debugBundle = debugBundle(rule, num(flags, 'samples', 200, 20, 5000));

  if (flags.out) {
    const p = resolvePath(String(flags.out));
    fs.writeFileSync(p, JSON.stringify(snap, null, 2), 'utf8');
    log('已写入 ' + p);
  }
  emit(snap, flags, humanReadable(snap));
}

/* ------------------------------------------------------------------
   命令：write
   ------------------------------------------------------------------ */
async function cmdWrite(flags) {
  const { SerialPort } = await loadSerial();
  const portPath = await pickPort(SerialPort, flags.port ? String(flags.port) : null);
  const port = new SerialPort({
    path: portPath,
    baudRate: num(flags, 'baud', 115200, 50, 12000000),
    dataBits: num(flags, 'databits', 8, 5, 8),
    stopBits: num(flags, 'stopbits', 1, 1, 2),
    parity: String(flags.parity || 'none'),
    autoOpen: false,
  });
  await new Promise((res, rej) => port.open((e) => (e ? rej(e) : res())));

  let payload;
  if (flags.hex) payload = Buffer.from(U.hexToBytes(String(flags.hex)));
  else if (flags.text) payload = Buffer.from(String(flags.text) + (flags.newline === false ? '' : '\n'), 'utf8');
  else { await new Promise((r) => port.close(r)); throw new Error('要给 --hex 或 --text'); }

  await new Promise((res, rej) => port.write(payload, (e) => (e ? rej(e) : res())));
  await new Promise((res) => port.drain(() => res()));
  await new Promise((res) => port.close(() => res()));

  const out = { ok: true, port: portPath, bytes: payload.length, hex: hexSpaced(payload) };
  emit(out, flags, '已发送 ' + payload.length + ' 字节：' + out.hex);
}

/* ------------------------------------------------------------------
   命令：parse —— 离线把已有字节按规则解一遍（不碰硬件，改规则迭代用）
   ------------------------------------------------------------------ */
async function cmdParse(flags) {
  const rule = resolveRule(flags);
  let bytes = null;
  if (flags.hex) {
    bytes = Buffer.from(U.hexToBytes(String(flags.hex)));
  } else if (flags.bin) {
    bytes = fs.readFileSync(resolvePath(String(flags.bin)));
  } else if (flags['hex-file']) {
    const txt = fs.readFileSync(resolvePath(String(flags['hex-file'])), 'utf8');
    bytes = Buffer.from(U.hexToBytes(txt));
  } else if (flags['text-file']) {
    bytes = Buffer.from(fs.readFileSync(resolvePath(String(flags['text-file'])), 'utf8'), 'utf8');
  } else {
    throw new Error('要给 --hex / --bin / --hex-file / --text-file 之一');
  }
  const sink = makeSink(rule);
  /* 按 512 字节一块喂，模拟真实分块到达（能顺带验证跨块分帧） */
  for (let i = 0; i < bytes.length; i += 512) sink.feed(bytes.subarray(i, i + 512));
  sink.flush();
  const snap = snapshot(sink, { sourceBytes: bytes.length, ruleMode: rule.active });
  /* 与 read 对齐：也带上同源调试包。离线重放时 AI 无需硬件就能拿到与网页端一致的一份 */
  if (flags.bundle !== false) snap.debugBundle = debugBundle(rule, num(flags, 'samples', 200, 20, 5000));
  if (flags.out) {
    const p = resolvePath(String(flags.out));
    fs.writeFileSync(p, JSON.stringify(snap, null, 2), 'utf8');
    log('已写入 ' + p);
  }
  emit(snap, flags, humanReadable(snap));
}

/* ------------------------------------------------------------------
   命令：assert —— 按阈值判定，给「自动迭代」做闭环判据
   支持：key > 1750 / key.min >= 0 / key.max < 3.2 / key.span <= 0.5 / key == 0
   取值口径：裸 key = 最后一次值；.min/.max/.avg/.span = 窗口统计
   ------------------------------------------------------------------ */
function readSnapshotForAssert(flags) {
  if (flags.in) {
    return JSON.parse(fs.readFileSync(resolvePath(String(flags.in)), 'utf8'));
  }
  throw new Error('要给 --in <capture.json>（先跑 read --out capture.json），或直接用 read 命令');
}

function evalCheck(expr, snap) {
  const m = String(expr).match(/^\s*([A-Za-z_][\w.\-]*)\s*(>=|<=|==|!=|>|<)\s*(-?[\d.]+)\s*$/);
  if (!m) return { expr, pass: false, actual: null, error: '表达式无法解析（形如 rpm>1750 / cur.max<3.2）' };
  const [, rawKey, op, rhsS] = m;
  const rhs = parseFloat(rhsS);
  const dot = rawKey.lastIndexOf('.');
  let key = rawKey, field = 'value';
  if (dot > 0) {
    const maybe = rawKey.slice(dot + 1);
    if (['min', 'max', 'avg', 'span', 'value'].includes(maybe)) {
      key = rawKey.slice(0, dot);
      field = maybe;
    }
  }
  const ch = snap.channels && snap.channels[key];
  if (!ch) return { expr, pass: false, actual: null, error: '没有通道 "' + key + '"（现有：' + Object.keys(snap.channels || {}).join(', ') + '）' };
  const actual = ch[field];
  if (typeof actual !== 'number' || !Number.isFinite(actual)) {
    return { expr, pass: false, actual: null, error: '通道 "' + key + '" 的 ' + field + ' 还不是有效数值' };
  }
  let pass = false;
  if (op === '>') pass = actual > rhs;
  else if (op === '<') pass = actual < rhs;
  else if (op === '>=') pass = actual >= rhs;
  else if (op === '<=') pass = actual <= rhs;
  else if (op === '==') pass = actual === rhs;
  else if (op === '!=') pass = actual !== rhs;
  return { expr, pass, actual, expect: op + ' ' + rhs, key, field };
}

function cmdAssert(flags) {
  const snap = readSnapshotForAssert(flags);
  const exprs = [];
  if (flags.expect) exprs.push(...String(flags.expect).split(';').map((s) => s.trim()).filter(Boolean));
  if (flags.expects) exprs.push(...String(flags.expects).split(';').map((s) => s.trim()).filter(Boolean));

  const checks = exprs.map((e) => evalCheck(e, snap));
  const failed = checks.filter((c) => !c.pass);
  const result = {
    ok: failed.length === 0,
    checkedAt: new Date().toISOString(),
    source: flags.in ? String(flags.in) : '(inline)',
    channels: snap.channels,
    checks,
    failedCount: failed.length,
    verdict: failed.length === 0
      ? (exprs.length ? 'PASS：全部判据满足' : 'INFO：没有给判据，只回传指标')
      : 'FAIL：' + failed.map((f) => f.expr + '（实际 ' + (typeof f.actual === 'number' ? f.actual : '—') + (f.error ? '，' + f.error : '') + '）').join('；'),
  };
  if (flags.out) {
    const p = resolvePath(String(flags.out));
    fs.writeFileSync(p, JSON.stringify(result, null, 2), 'utf8');
    log('已写入 ' + p);
  }
  emit(result, flags, result.verdict);
  return result.ok ? 0 : 2;
}

/* ------------------------------------------------------------------
   命令：trial —— 迭代台账（append-only JSONL）
   为什么要有它：自动迭代真正的痛点是「第 N 轮不知道前 N-1 轮做过什么」。若每轮都把原始
   数据重新读进上下文，token 会随轮数线性爆炸。台账把每一轮压成【一行结论】：
       轮次 · 时刻 · 判据 · 结论 · 判据点名的指标 · 与上一轮的差 · 备注
   于是「寻找规律 / 总结优化方向」只需要读最后几行；原始数据留在 --out 的 JSON 里。
   ------------------------------------------------------------------ */
function ledgerPath(flags) {
  /* 默认落在桥自己的 _data/ 下，而不是 cwd：AI 通过 MCP 调用时 cwd 由宿主决定
     （DSH / WorkBuddy / 别的客户端各不相同），相对默认值会落到不确定的位置，甚至
     掉进仓库里被提交。_data/ 已在 .gitignore 中忽略，数据不丢也不入库。 */
  if (flags.ledger) return resolvePath(String(flags.ledger));
  return path.join(HERE, '_data', 'seriallab-trials.jsonl');
}

function readLedger(p) {
  if (!fs.existsSync(p)) return [];
  const rows = [];
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try { rows.push(JSON.parse(s)); } catch (e) { /* 坏行跳过：一行垃圾不该废掉整本账 */ }
  }
  return rows;
}

/* 只保留判据点名的指标：台账不会随通道数膨胀（这是 token 可控的关键） */
function pickMetrics(checks) {
  const m = {};
  for (const c of checks) {
    if (!c || !c.key) continue;
    m[c.key + '.' + (c.field || 'value')] = (typeof c.actual === 'number') ? c.actual : null;
  }
  return m;
}

function deltaOf(cur, prev) {
  if (!prev || !prev.metrics) return null;
  const d = {};
  for (const k of Object.keys(cur)) {
    const a = cur[k], b = prev.metrics[k];
    if (typeof a === 'number' && typeof b === 'number') {
      const v = Math.round((a - b) * 1e6) / 1e6;
      if (v !== 0) d[k] = v;
    }
  }
  return Object.keys(d).length ? d : null;
}

function cmdTrial(flags, rest) {
  const sub = (rest && rest[0]) || 'list';
  const p = ledgerPath(flags);

  if (sub === 'append') {
    const maxRounds = num(flags, 'max-rounds', 20, 1, 100000);
    const rows = readLedger(p);
    /* 会话预算闸 —— 这是「不能无限循环」的机制保证，不依赖 AI 自觉。
       轮数达到上限后拒绝追加，并给一个与 PASS(0)/FAIL(2) 都不同的退出码 3，
       让循环控制方一眼区分「没达标、该继续调」与「预算用完了、该停下来汇报」。
       没有这道闸，「循环改进」在 AI 手里就是没有终止条件的 while。 */
    if (rows.length >= maxRounds) {
      const stop = {
        ok: false,
        budgetExhausted: true,
        roundsUsed: rows.length,
        maxRounds,
        ledger: p,
        verdict: 'STOP：已达轮数上限 ' + maxRounds + '，不再追加新轮次 —— '
          + '请停止迭代，汇报阶段性结论、最优轮次与下一步建议（要提高上限请显式给 --max-rounds）。',
      };
      emit(stop, flags, stop.verdict);
      return 3;
    }
    const snap = readSnapshotForAssert(flags);
    const exprs = String(flags.expect || flags.expects || '')
      .split(';').map((s) => s.trim()).filter(Boolean);
    const checks = exprs.map((e) => evalCheck(e, snap));
    const failed = checks.filter((c) => !c.pass);
    const metrics = pickMetrics(checks);
    const rec = {
      n: rows.length + 1,
      at: new Date().toISOString(),
      verdict: failed.length === 0 ? 'PASS' : 'FAIL',
      failedCount: failed.length,
      expect: exprs.join('; '),
      metrics,
    };
    const d = deltaOf(metrics, rows[rows.length - 1]);
    if (d) rec.delta = d;
    if (flags.note) rec.note = String(flags.note);
    if (flags.tag) rec.tag = String(flags.tag);
    rec.source = flags.in ? String(flags.in) : '(inline)';
    /* 追加一行，永不重写整本账 —— 并发/中断都不会毁掉历史 */
    fs.mkdirSync(path.dirname(p), { recursive: true });   /* 默认台账目录可能还没建 */
    fs.appendFileSync(p, JSON.stringify(rec) + '\n', 'utf8');
    emit(rec, flags, '第 ' + rec.n + ' 轮 ' + rec.verdict
      + '（失败 ' + rec.failedCount + ' 项）'
      + (d ? '  相比上轮：' + JSON.stringify(d) : '')
      + '  →  ' + p);
    return rec.verdict === 'PASS' ? 0 : 2;
  }

  if (sub === 'list') {
    const rows = readLedger(p);
    const last = num(flags, 'last', 10, 1, 1000);
    const maxRounds = num(flags, 'max-rounds', 20, 1, 100000);
    const shown = rows.slice(-last);
    /* 趋势：每个指标从窗口首行到末行的变化方向 —— 「寻找规律」的最小可用形态。
       注意只给方向与净变化，不给逐轮明细，这正是为了省 token。 */
    const trend = [];
    if (shown.length >= 2) {
      const a = shown[0].metrics || {}, b = shown[shown.length - 1].metrics || {};
      for (const k of Object.keys(b)) {
        if (typeof a[k] !== 'number' || typeof b[k] !== 'number') continue;
        const dv = Math.round((b[k] - a[k]) * 1e6) / 1e6;
        trend.push({ metric: k, from: a[k], to: b[k], delta: dv,
          dir: dv > 0 ? 'up' : (dv < 0 ? 'down' : 'flat') });
      }
    }
    emit({
      ok: true,
      ledger: p,
      total: rows.length,
      showing: shown.length,
      /* 会话预算闸的状态：循环控制方只看这两个字段就知道还能跑几轮 */
      maxRounds,
      remaining: Math.max(0, maxRounds - rows.length),
      budgetExhausted: rows.length >= maxRounds,
      passRate: shown.length
        ? Math.round(shown.filter((r) => r.verdict === 'PASS').length / shown.length * 1000) / 1000
        : null,
      trend,
      rows: shown,
    }, flags, '台账共 ' + rows.length + ' 轮（上限 ' + maxRounds + '，剩余 '
      + Math.max(0, maxRounds - rows.length) + '），显示最后 ' + shown.length + ' 轮');
    return 0;
  }

  process.stderr.write('trial 子命令只支持：append | list\n');
  return 1;
}

/* ------------------------------------------------------------------
   人读摘要
   ------------------------------------------------------------------ */
function humanReadable(snap) {
  const L = [];
  L.push('模式 ' + snap.mode + ' · 字节 ' + snap.bytes + ' · 行 ' + snap.lines + ' · 帧 ' + snap.frames
    + ' · 解析失败 ' + snap.failed);
  const keys = Object.keys(snap.channels || {});
  if (!keys.length) {
    if (snap.frames > 0 && snap.failed > 0) {
      L.push('收到了 ' + snap.frames + ' 帧，但全部解析/校验失败 —— 先看下面的失败样本，');
      L.push('通常能直接定位是帧头/长度口径/校验起点/偏移哪一项对不上。');
    } else if (snap.mode === 'text') {
      L.push('没有解析出任何通道。文本模式要求输出形如 key=value（如 temp=25.3），');
      L.push('且分帧靠换行 —— 若设备不换行，收尾时才被当成一行，建议固件补 \\n。');
    } else {
      L.push('没有解析出任何通道。HEX 模式请确认帧头、长度字段口径（数据段/整帧）与校验起点，');
      L.push('可用本命令离线反复试规则，不必上硬件。');
    }
  } else {
    L.push('通道 ' + keys.length + ' 个：');
    for (const k of keys) {
      const c = snap.channels[k];
      L.push('  ' + k.padEnd(14) + ' 最新 ' + fmt(c.value) + '  最小 ' + fmt(c.min)
        + '  最大 ' + fmt(c.max) + '  均值 ' + fmt(c.avg) + '  峰峰 ' + fmt(c.span)
        + (c.unit ? '  ' + c.unit : ''));
    }
  }
  if (snap.failures && snap.failures.length) {
    L.push('失败样本（最多 40 条里的前几条）：');
    for (const f of snap.failures.slice(0, 5)) L.push('  ' + f.tAbs + '  ' + f.hex + '  → ' + f.reason);
  }
  return L.join('\n');
}
function fmt(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  return Math.abs(v) >= 1000 ? v.toFixed(1) : v.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

/* ------------------------------------------------------------------
   命令：selftest —— 无硬件，证明「内核复用」的结果正确
   用的例子与网页端校验脚本同源（4 套开源协议预设）
   ------------------------------------------------------------------ */
function cmdSelftest() {
  const cases = [
    {
      name: 'FireWater（文本 name:value）', rule: core.presetRule('firewater'),
      feed: 'temp:25.3, cur:1.02, rpm:1800\n',
      expect: { temp: 25.3, cur: 1.02, rpm: 1800 },
    },
    {
      name: 'Teleplot（>name:value）', rule: core.presetRule('teleplot'),
      feed: '>rpm:1800\n',
      expect: { rpm: 1800 },
    },
    {
      name: 'JustFloat（float32 LE ×4 + 帧尾 00 00 80 7F）', rule: core.presetRule('justfloat'),
      feed: U.hexToBytes('00 00 00 00 00 00 80 3F 00 00 00 40 00 00 40 40 00 00 80 7F'),
      expect: { ch1: 0, ch2: 1, ch3: 2, ch4: 3 },
    },
    {
      name: '匿名 V1.0（AA AA + SUM8）', rule: core.presetRule('ano10'),
      feed: U.hexToBytes('AA AA 01 06 00 64 00 32 00 00 F1'),
      expect: { func: 1, x: 1, y: 0.5, z: 0 },
    },
  ];
  const results = [];
  let bad = 0;
  for (const c of cases) {
    const sink = makeSink(c.rule);
    sink.feed(c.feed);
    sink.flush();
    const snap = snapshot(sink);
    const got = {};
    for (const k of Object.keys(snap.channels)) got[k] = snap.channels[k].value;
    const diffs = [];
    for (const k of Object.keys(c.expect)) {
      const want = c.expect[k];
      const g = got[k];
      if (typeof g !== 'number' || Math.abs(g - want) > 1e-6) diffs.push(k + ' 期望 ' + want + ' 实得 ' + g);
    }
    const pass = diffs.length === 0 && snap.failed === 0;
    if (!pass) bad++;
    results.push({ case: c.name, pass, channels: got, failedFrames: snap.failed, diffs });
  }
  const out = {
    ok: bad === 0,
    kernel: KERNEL_DIR,
    cases: results,
    note: bad === 0
      ? '全部通过：桥复用的解析内核与网页端行为一致（同一份源码，非副本）'
      : bad + ' 项不通过，请检查内核改动是否破坏了预设',
  };
  emit(out, { human: false });
  return out.ok ? 0 : 1;
}

/* ------------------------------------------------------------------
   MCP 服务（stdio，换行分隔 JSON-RPC）
   工具：serial_list / serial_read / serial_write / serial_parse / serial_assert
   ------------------------------------------------------------------ */
async function cmdMcp() {
  const readline = await import('node:readline');
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

  const TOOLS = [
    {
      name: 'serial_list',
      description: '列出本机可用串口（路径、厂商、VID/PID）',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'serial_read',
      description: '打开串口采集一段时间并按规则解析，返回结构化通道数据 + 与网页端同源的调试包。串口调试助手网页端无法被自动化（需用户手势选端口），所以让 AI 读串口要走这个工具。',
      inputSchema: {
        type: 'object',
        properties: {
          ms: { type: 'number', description: '采集时长毫秒，默认 2000' },
          port: { type: 'string', description: '串口路径如 COM3；省略则取第一个' },
          baudRate: { type: 'number', description: '波特率，默认 115200' },
          preset: { type: 'string', enum: ['firewater', 'teleplot', 'justfloat', 'ano10'], description: '用内置开源协议预设解析' },
          ruleInline: { type: 'string', description: '直接给解析规则 JSON 字符串（优先级高于 preset）' },
          samples: { type: 'number', description: '调试包携带的样本条数，默认 200' },
          bundle: { type: 'boolean', description: '是否附带完整 debugBundle（默认 true）。传 false 可大幅缩小输出、省 token' },
          profile: { type: 'string', enum: ['full', 'digest'], description: '输出档位：digest 只回「通道统计+帧结构+失败样本+提示」，省 token（默认 full）' },
          maxBytes: { type: 'number', description: 'stdout 字节预算，默认 12000；超出会自动降级为 digest 并在结果里标 trimmed' },
        },
      },
    },
    {
      name: 'serial_write',
      description: '向串口发送十六进制或文本数据',
      inputSchema: {
        type: 'object',
        properties: {
          hex: { type: 'string', description: '如 "AA 55 01"（与 text 二选一）' },
          text: { type: 'string', description: '文本内容（与 hex 二选一）' },
          newline: { type: 'boolean', description: '文本模式是否追加换行，默认 true' },
          port: { type: 'string' },
          baudRate: { type: 'number' },
        },
      },
    },
    {
      name: 'serial_parse',
      description: '离线把一段十六进制字节按指定规则解析（不碰硬件），返回通道统计 + 与网页端同源的调试包。改规则试错时用：先把抓到的 hex 丢进来，确认能解出来再上硬件。',
      inputSchema: {
        type: 'object',
        properties: {
          hex: { type: 'string', description: '要解析的十六进制字节串' },
          preset: { type: 'string' },
          ruleInline: { type: 'string' },
          samples: { type: 'number', description: '调试包携带的样本条数，默认 200' },
          bundle: { type: 'boolean', description: '是否附带完整 debugBundle（默认 true）。传 false 可大幅缩小输出、省 token' },
          profile: { type: 'string', enum: ['full', 'digest'], description: '输出档位：digest 只回「通道统计+帧结构+失败样本+提示」，省 token（默认 full）' },
          maxBytes: { type: 'number', description: 'stdout 字节预算，默认 12000；超出会自动降级为 digest 并在结果里标 trimmed' },
        },
        required: ['hex'],
      },
    },
    {
      name: 'serial_assert',
      description: '对已有采集结果按阈值做判定，输出 pass/fail 与全部指标。自动迭代闭环的判据入口，例如 expect="rpm>1750; cur.max<3.2"。',
      inputSchema: {
        type: 'object',
        properties: {
          input: { type: 'string', description: 'read 命令产出的 JSON 文件路径' },
          expect: { type: 'string', description: '分号分隔的判据，如 "rpm>1750;cur.max<3.2"' },
        },
        required: ['input'],
      },
    },
    {
      name: 'serial_trial',
      description: '迭代台账：把一轮「采样 + 判定」压成一行结论追加到本地 JSONL，或读回最近几轮与指标趋势。这是自动迭代闭环的记忆载体 —— 让第 N 轮不必重读前 N-1 轮的原始数据（省 token 的关键）。',
      inputSchema: {
        type: 'object',
        properties: {
          sub: { type: 'string', enum: ['append', 'list'], description: 'append = 记一轮；list = 读台账（默认）' },
          input: { type: 'string', description: 'append 用：read 命令产出的 JSON 文件路径' },
          expect: { type: 'string', description: 'append 用：分号分隔的判据，如 "rpm>1750;cur.max<3.2"' },
          note: { type: 'string', description: 'append 用：这一轮改了什么（如 "kp 由 8 调到 10"）' },
          tag: { type: 'string', description: 'append 用：可选分组标记' },
          ledger: { type: 'string', description: '台账文件路径，默认落在桥自己的 _data/seriallab-trials.jsonl（与 cwd 无关）' },
          last: { type: 'number', description: 'list 用：读最后几轮，默认 10' },
          maxRounds: { type: 'number', description: '轮数预算，默认 20。达到后 append 会拒绝并以退出码 3 返回 budgetExhausted —— 这是「不能无限循环」的机制保证' },
        },
        required: ['sub'],
      },
    },
  ];

  async function callTool(name, args) {
    const a = args || {};
    const flags = {};
    if (a.ms !== undefined) flags.ms = String(a.ms);
    if (a.port) flags.port = String(a.port);
    if (a.baudRate !== undefined) flags.baud = String(a.baudRate);
    if (a.preset) flags.preset = String(a.preset);
    if (a.ruleInline) flags['rule-inline'] = String(a.ruleInline);
    if (a.samples !== undefined) flags.samples = String(a.samples);
    if (a.bundle === false) flags.bundle = false;
    if (a.profile) flags.profile = String(a.profile);
    if (a.maxBytes !== undefined) flags['max-bytes'] = String(a.maxBytes);
    if (a.hex) flags.hex = String(a.hex);
    if (a.text) flags.text = String(a.text);
    if (a.newline === false) flags.newline = false;
    if (a.input) flags.in = String(a.input);
    if (a.expect) flags.expect = String(a.expect);
    if (a.note) flags.note = String(a.note);
    if (a.tag) flags.tag = String(a.tag);
    if (a.ledger) flags.ledger = String(a.ledger);
    if (a.last !== undefined) flags.last = String(a.last);
    if (a.maxRounds !== undefined) flags['max-rounds'] = String(a.maxRounds);

    const captured = [];
    const orig = process.stdout.write.bind(process.stdout);
    /* 命令实现用 stdout 输出结果 —— MCP 模式下必须劫持，否则会污染 JSON-RPC 流 */
    process.stdout.write = (chunk, ...rest) => { captured.push(String(chunk)); return true; };
    let code = 0;
    try {
      if (name === 'serial_list') await cmdList(flags);
      else if (name === 'serial_read') await cmdRead(flags);
      else if (name === 'serial_write') await cmdWrite(flags);
      else if (name === 'serial_parse') await cmdParse(flags);
      else if (name === 'serial_assert') code = cmdAssert(flags);
      else if (name === 'serial_trial') code = cmdTrial(flags, [String(a.sub || 'list')]);
      else throw new Error('未知工具：' + name);
    } finally {
      process.stdout.write = orig;
    }
    const text = captured.join('');
    return { content: [{ type: 'text', text: text || '(无输出)' }], isError: false, _exitCode: code };
  }

  const send = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');

  async function handleLine(line) {
    const s = line.trim();
    if (!s) return;
    let msg;
    try { msg = JSON.parse(s); } catch (e) { return; }
    const { id, method, params } = msg;
    try {
      if (method === 'initialize') {
        send({
          jsonrpc: '2.0', id,
          result: {
            protocolVersion: (params && params.protocolVersion) || '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'seriallab-bridge', version: '1.0.0' },
          },
        });
        return;
      }
      if (method === 'notifications/initialized' || method === 'initialized') return;
      if (method === 'tools/list') {
        send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
        return;
      }
      if (method === 'tools/call') {
        const nm = params && params.name;
        const out = await callTool(nm, params && params.arguments);
        send({ jsonrpc: '2.0', id, result: { content: out.content, isError: out.isError } });
        return;
      }
      if (method === 'ping') { send({ jsonrpc: '2.0', id, result: {} }); return; }
      send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'method not found: ' + method } });
    } catch (e) {
      send({ jsonrpc: '2.0', id, error: { code: -32000, message: String((e && e.message) || e) } });
    }
  }

  /* 请求串行化（真实缺陷修复）：line 回调是异步的，而 callTool 会临时劫持
     process.stdout 来收集命令输出。若不排队，并发到达的第二个请求会在第一个
     仍劫持 stdout 时把应答写进捕获缓冲 —— 结果是「应答串台 + AI 收到拼接后的
     非法 JSON + tools/list 静默丢应答」。MCP 客户端不等应答就发下一个请求
     （例如 tools/call 紧接 tools/list）必然踩中。改为 promise 链逐个处理。 */
  let chain = Promise.resolve();
  rl.on('line', (line) => {
    chain = chain.then(() => handleLine(line)).catch(() => {});
  });
}

/* ------------------------------------------------------------------
   用法
   ------------------------------------------------------------------ */
function usage() {
  process.stdout.write([
    'SerialLab 本地串口桥 —— 让 AI 能自己读写串口（复用子应用解析内核，结果与网页端一致）',
    '',
    '  node bridge.mjs list',
    '  node bridge.mjs read   [--ms 3000] [--port COM3] [--baud 115200] [--preset justfloat] [--out capture.json] [--human]',
    '  node bridge.mjs write  --hex "AA 55 01"   |   --text "hello"',
    '  node bridge.mjs parse  --hex "AA 55 01"   [--preset ano10 | --rule rule.json | --settings cfg.json]',
    '  node bridge.mjs assert --in capture.json  --expect "rpm>1750; cur.max<3.2" [--out trial.json]',
    '  node bridge.mjs trial  list   [--last 10] [--max-rounds 20] [--ledger trials.jsonl]   (读台账 + 预算状态)',
    '  node bridge.mjs trial  append --in capture.json --expect "rpm>1750" [--note "kp=8"] [--max-rounds 20] [--ledger trials.jsonl]',
    '  node bridge.mjs selftest',
    '  node bridge.mjs mcp                       (MCP stdio 服务，供 Agent 直接调用)',
    '',
    '规则来源（任选）：--preset firewater|teleplot|justfloat|ano10 / --settings <浏览器导出的配置.json> / --rule <rule.json> / --rule-inline <json>',
    '省 token：--profile=digest 只回「通道统计 + 帧结构 + 失败样本 + 提示」（丢 brief/samples/recent/完整调试包）；',
    '          --max-bytes <N> 限制 stdout 字节数，超了自动降级为 digest 并在结果里标 trimmed（默认 12000，0 = 不限）。',
    '          --out 落盘永远是完整数据，不受 --max-bytes 影响 —— 数据不丢，只是不进上下文。',
    '退出码：0 成功 · 1 用法或运行错误 · 2 assert / trial 判定不通过 · 3 trial 轮数预算耗尽（该停下来汇报了）',
  ].join('\n') + '\n');
}

/* ------------------------------------------------------------------
   入口
   ------------------------------------------------------------------ */
async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const { flags, rest } = parseArgs(argv.slice(1));
  if (!cmd || cmd === 'help' || flags.help) { usage(); return 0; }

  switch (cmd) {
    case 'list': return cmdList(flags).then(() => 0);
    case 'read': return cmdRead(flags).then(() => 0);
    case 'write': return cmdWrite(flags).then(() => 0);
    case 'parse': return cmdParse(flags).then(() => 0);
    case 'assert': return cmdAssert(flags);
    case 'trial': return cmdTrial(flags, rest);
    case 'selftest': return cmdSelftest();
    case 'mcp': return cmdMcp().then(() => 0);
    default:
      process.stderr.write('未知命令：' + cmd + '\n');
      usage();
      return 1;
  }
}

main()
  .then((code) => {
    /* mcp 是长驻服务，不能退出 */
    if (process.argv[2] === 'mcp') return;
    process.exit(typeof code === 'number' ? code : 0);
  })
  .catch((e) => {
    process.stderr.write('\n[bridge 出错] ' + ((e && e.message) || e) + '\n');
    process.exit(1);
  });
