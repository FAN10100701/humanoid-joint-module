// Runtime data validation: extract the DATA object from the anatomy page
// and verify all teardown scenes resolve consistently (ids, scenes, nav).
// 用法: node 校验拆解数据.js <html路径>
var fs = require('fs');
var htmlPath = process.argv[2];
var html = fs.readFileSync(htmlPath, 'utf8');

// 提取 var DATA={ ... };  （从 "var DATA={" 到其后第一个 "\n};" 顶层闭合）
var start = html.indexOf('var DATA={');
if (start < 0) { console.log('FATAL: var DATA={ not found'); process.exit(1); }
var depth = 0, end = -1;
for (var i = start + 9; i < html.length; i++) {
  var ch = html[i];
  if (ch === '{') depth++;
  else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
}
if (end < 0) { console.log('FATAL: DATA closing brace not found'); process.exit(1); }
var dataSrc = html.slice(start + 9, end + 1);

// html 属性里的引号已转义为单引号，可直接求值
var DATA;
try { DATA = eval('(' + dataSrc + ')'); }
catch (e) { console.log('FATAL: DATA eval failed: ' + e.message); process.exit(1); }

console.log('DATA keys: ' + Object.keys(DATA).length);
var tdScenes = { td_joint: 'joint', td_powerflow: 'powerflow', td_harmonic: 'harmonic', td_planetary: 'planetary', td_cycloidal: 'cycloidal' };
var fail = 0;
Object.keys(tdScenes).forEach(function (k) {
  var d = DATA[k];
  if (!d) { console.log('MISS: DATA[' + k + ']'); fail++; return; }
  if (d.scene !== tdScenes[k]) { console.log('BAD scene: ' + k + ' -> ' + d.scene); fail++; }
  if (d.td !== 1) { console.log('BAD td flag: ' + k); fail++; }
  if (!d.sections || !d.sections.length) { console.log('BAD sections: ' + k); fail++; }
  console.log('OK: ' + k + ' (scene=' + d.scene + ', sections=' + d.sections.length + ')');
});
if (fail) { console.log('FAILED: ' + fail); process.exit(2); }
console.log('ALL TD DATA OK');
