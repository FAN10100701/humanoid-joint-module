// 检查隐私.js — 部署前隐私扫描（node 版，跨环境可靠，PS5.1 编码坑回避）
// 扫描将入库/部署的文本资产：API Key 形态 / Windows 用户路径 / 内网 IP / 未登记邮箱 / 手机号
// 用法: node _本地工具/检查隐私.js   退出码 0=干净(仅白名单) 1=存在高危项必须处理
// 白名单须与 AUDIT.md 同步维护：A-17 站长邮箱、10_NPU 教学示例、AI 面板 sk- 提示语占位
"use strict";
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EXTS = new Set(['.html', '.htm', '.js', '.css', '.json', '.xml', '.md', '.txt', '.svg', '.webmanifest', '.ps1', '.bat', '.py', '.yml']);
const SKIP = /(edge_prof|node_modules|\.git(\\|\/|$)|_视频素材|\.trae|\.zcode|\.edge_profile|\.browsers|\.venv|\.workbuddy|\.idea|\.vscode|_local-tool备份|\.mimosa|\.v2c|\.video_agent|\.agents)/;

// 白名单（已知且已接受项——新增例外先查 AUDIT.md 再加这里）
const WL_EMAIL = ['2061624805@qq.com', 'jump@gw.company.com', 'zhangsan@', 'example@', 'user@', 'name@', 'your@', 'xxx@', 'email@example', 'you@example.com'];
const WL_IP = ['10.20.30.40'];                 // 10_NPU/02 教学示例跳板机
const WL_KEY_HINT = /sk-[\u4e00-\u9fff…x×*－\-—、,，。;；\s]|sk-开头|sk-形态|sk-…/; // UI 提示语中的占位（非真实 Key）

function walk(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) { if (!SKIP.test(p)) walk(p, out); }
    else if (EXTS.has(path.extname(name).toLowerCase())) out.push(p);
  }
  return out;
}

const files = walk(ROOT, []);
const high = [], warn = [];
for (const f of files) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  const c = fs.readFileSync(f, 'utf8');

  // 1) API Key 形态（OpenAI sk- 16+ 位 / 火山方舟 ep- 8+ 位数字）；跳过 UI 提示语占位行
  for (const m of c.matchAll(/sk-[A-Za-z0-9_\-]{16,}|ep-[0-9]{8,}/g)) {
    const line = c.slice(Math.max(0, m.index - 60), m.index + 60);
    if (WL_KEY_HINT.test(line)) continue;   // 该命中处于"请填入 sk-…"类提示语中
    high.push(rel + ' -> API-KEY-SHAPE: ' + m[0].slice(0, 12) + '...');
  }
  // 2) Windows 用户绝对路径（含用户名泄漏）
  for (const m of c.matchAll(/[C-Z]:\\+Users\\+[^\s"'<>()，。；]{2,40}/g)) warn.push(rel + ' -> WIN-PATH: ' + m[0]);
  // 3) 内网 IP
  for (const m of c.matchAll(/\b(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/g)) {
    if (!WL_IP.includes(m[0])) warn.push(rel + ' -> PRIVATE-IP: ' + m[0]);
  }
  // 4) 邮箱（白名单外的）
  for (const m of c.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) {
    const v = m[0].toLowerCase();
    if (!WL_EMAIL.some(w => v === w.toLowerCase() || v.startsWith(w.toLowerCase()))) warn.push(rel + ' -> EMAIL: ' + m[0]);
  }
  // 5) 手机号（带边界，防长数字误报）
  for (const m of c.matchAll(/(?<![0-9])1[3-9][0-9]{9}(?![0-9])/g)) warn.push(rel + ' -> MOBILE: ' + m[0]);
}

const uniq = a => [...new Set(a)];
const H = uniq(high), W = uniq(warn);
console.log('Scanned files: ' + files.length);
if (H.length) { console.log('HIGH RISK (MUST FIX):'); H.forEach(x => console.log('  [H] ' + x)); }
if (W.length) {
  console.log('WARN (review manually):');
  W.slice(0, 30).forEach(x => console.log('  [W] ' + x));
  if (W.length > 30) console.log('  ... and ' + (W.length - 30) + ' more');
}
if (!H.length && !W.length) console.log('PRIVACY CLEAN');
else if (!H.length) console.log('NO HIGH RISK, ' + W.length + ' warnings (review before deploy)');
else console.log('PRIVACY FAIL: ' + H.length + ' high-risk items');
process.exit(H.length ? 1 : 0);
