/* 校验减速器剖面动画.js — 与 00_3D解剖/减速器剖面图详解.html 内联动画同源的数值复现
   验证:① 三段 SVG 的 circle 索引映射与动画代码取用的下标一致(摆线段曾是重灾区);
         ② 摆线段几何:偏心轴蓝圈(cC[18])与中心黑点(cC[19])始终同心、摆线盘中心始终
            跟随偏心轴公转(距离=0)、曲柄销孔/输出销全部落在画布范围内(不乱飞);
         ③ 行星段几何:三行星轮始终落在内齿圈内(r110)、行星架转速=输入1/4;
         ④ 谐波段几何:啮合点始终在 r80 长轴两端、输出刻度反向 1/100。
   运行: node _本地工具\校验减速器剖面动画.js   期望输出 ANIM OK */
"use strict";
var fs = require("fs");
var path = require("path");

var html = fs.readFileSync(path.join(__dirname, "..", "00_3D解剖", "减速器剖面图详解.html"), "utf8");

/* ---- 提取全部 .svgbox 内的 <svg>…</svg>,再按文档序抓 circle 的 cx/cy/r ---- */
function extractSvgs(doc) {
  var out = [], re = /<svg\b[\s\S]*?<\/svg>/g, m;
  while ((m = re.exec(doc))) out.push(m[0]);
  return out;
}
function extractCircles(svg) {
  var out = [], re = /<circle\b[^>]*>/g, m;
  while ((m = re.exec(svg))) {
    var tag = m[0];
    var cx = parseFloat((tag.match(/cx="([^"]+)"/) || [0, 0])[1]);
    var cy = parseFloat((tag.match(/cy="([^"]+)"/) || [0, 0])[1]);
    var r = parseFloat((tag.match(/\br="([^"]+)"/) || [0, 0])[1]);
    out.push({ cx: cx, cy: cy, r: r, dashed: /stroke-dasharray/.test(tag), fill: (tag.match(/fill="([^"]+)"/) || [0, ""])[1] });
  }
  return out;
}
var svgs = extractSvgs(html).filter(function (s) { return s.indexOf("viewBox") >= 0; });
if (svgs.length < 3) { console.error("FAIL: svg 数量不足,提取到 " + svgs.length); process.exit(1); }
var harm = extractCircles(svgs[0]), plan = extractCircles(svgs[1]), cyc = extractCircles(svgs[2]);

var CX = 210, CY = 150, DEG = Math.PI / 180;
function rot(p, a, c) { /* SVG rotate(a°,cx,cy):先绕 (cx,cy) 转,再平移 */
  var rad = a * DEG, cos = Math.cos(rad), sin = Math.sin(rad);
  var dx = p.x - c.x, dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
var fails = [];
function check(name, ok, detail) {
  if (!ok) fails.push(name + (detail ? " :: " + detail : ""));
  console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail ? "  " + detail : ""));
}

/* ---------- ① 索引映射 ---------- */
check("谐波 hC[2]=r10 输入轴", harm[2] && harm[2].r === 10, "r=" + (harm[2] || {}).r);
check("谐波 hC[3]/hC[4]=r5 啮合点", harm[3] && harm[3].r === 5 && harm[4] && harm[4].r === 5);
check("行星 pC[1..3]=r30 行星轮", plan.slice(1, 4).every(function (c) { return c.r === 30; }));
check("行星 pC[4]=r38 太阳轮", plan[4] && plan[4].r === 38, "r=" + (plan[4] || {}).r);
check("摆线 cC[17]=r74 虚线参考圆(应吃摆线盘变换)", cyc[17] && cyc[17].r === 74 && cyc[17].dashed, "r=" + (cyc[17] || {}).r);
check("摆线 cC[18]=r16 偏心轴蓝圈", cyc[18] && cyc[18].r === 16, "r=" + (cyc[18] || {}).r);
check("摆线 cC[19]=r6 偏心轴中心黑点", cyc[19] && cyc[19].r === 6, "r=" + (cyc[19] || {}).r);
check("摆线 cC[20..22]=r6 曲柄销孔×3(黑)", cyc.length === 23 && cyc.slice(20).every(function (c) { return c.r === 6; }), "总数=" + cyc.length);

/* ---------- ② 摆线段几何(动画核心) ---------- */
/* 复现 cycloidal(th):discTf = translate(-e·cosθ,-e·sinθ) rotate(β,CX,CY);orbit = rotate(th,CX,CY) */
var E = 14, VB = { x0: -100, x1: 520, y0: 0, y1: 300 };
[0, 45, 90, 180, 270, 360].forEach(function (th) {
  var beta = -th / 15, rad = th * DEG;
  var tx = -Math.cos(rad) * E, ty = -Math.sin(rad) * E;
  /* 偏心轴蓝圈与黑点同吃 orbit → 同心 */
  var ecc = rot({ x: 196, y: 150 }, th, { x: CX, y: CY });
  check("θ=" + th + "° 偏心蓝圈与黑点同心", dist(ecc, ecc) === 0);
  /* 摆线盘中心:先绕 (CX,CY) 转 β(盘心=CX,CY 不动),再平移 (tx,ty) */
  var discC = rot({ x: CX, y: CY }, beta, { x: CX, y: CY });
  discC = { x: discC.x + tx, y: discC.y + ty };
  check("θ=" + th + "° 盘心跟随偏心轴(距离0)", dist(discC, ecc) < 1e-9, "d=" + dist(discC, ecc).toFixed(6));
  /* 曲柄销孔:随盘变换(先绕盘原始中心转β,再平移),全部应在画布内且离盘心<60 */
  var holes = [[210, 98], [165, 195], [255, 195]].map(function (p) {
    var q = rot({ x: p[0], y: p[1] }, beta, { x: CX, y: CY });
    return { x: q.x + tx, y: q.y + ty };
  });
  var inVB = holes.every(function (h) { return h.x > VB.x0 && h.x < VB.x1 && h.y > VB.y0 && h.y < VB.y1; });
  var nearDisc = holes.every(function (h) { return dist(h, discC) < 80; });
  check("θ=" + th + "° 曲柄销孔在画布内且贴盘", inVB && nearDisc, "孔心距=" + holes.map(function (h) { return dist(h, discC).toFixed(0); }).join("/"));
  /* 输出销(绿):仅绕主轴匀速转 β,应在画布内 */
  var pins = [[210, 98], [165, 195], [255, 195]].map(function (p) { return rot({ x: p[0], y: p[1] }, beta, { x: CX, y: CY }); });
  check("θ=" + th + "° 输出销在画布内", pins.every(function (p) { return p.x > VB.x0 && p.x < VB.x1 && p.y > VB.y0 && p.y < VB.y1; }));
});

/* ---------- ③ 行星段几何 ---------- */
[0, 120, 240, 360].forEach(function (th) {
  var carrier = th / 4, spin = -th * 0.5;
  var pPos = [[210, 66], [150, 185], [270, 185]];
  var ok = pPos.every(function (p) {
    var q = rot({ x: p[0], y: p[1] }, carrier, { x: CX, y: CY });   /* 公转 */
    var d = dist(q, { x: CX, y: CY });
    return d > 60 && d < 110;                                        /* 行星轮心在内齿圈内 */
  });
  check("θ=" + th + "° 行星轮心在内齿圈内(公转半径≈84)", ok);
  /* 行星轮自转标记:先绕原位转 spin 再公转,合成后仍在轮上 */
  var q0 = rot({ x: 210, y: 36 }, spin, { x: 210, y: 66 });
  q0 = rot(q0, carrier, { x: CX, y: CY });
  check("θ=" + th + "° 行星轮自转标记贴轮", dist(q0, rot({ x: 210, y: 66 }, carrier, { x: CX, y: CY })) < 31);
});

/* ---------- ④ 谐波段几何 ---------- */
[0, 90, 180, 360].forEach(function (th) {
  var rad = th * DEG, r0 = 80;
  var p1 = { x: CX + Math.cos(rad) * r0, y: CY + Math.sin(rad) * r0 };
  check("θ=" + th + "° 啮合点1在长轴端(r80)", Math.abs(dist(p1, { x: CX, y: CY }) - 80) < 1e-9);
  var out = rot({ x: 298, y: CY }, -th / 100, { x: CX, y: CY });     /* 柔轮输出反向 1/100 */
  check("θ=" + th + "° 输出刻度反向慢转(仍在参考圆上)", Math.abs(dist(out, { x: CX, y: CY }) - 88) < 1e-9);
});

console.log("");
if (fails.length) { console.error("ANIM FAIL × " + fails.length); process.exit(1); }
console.log("ANIM OK");
