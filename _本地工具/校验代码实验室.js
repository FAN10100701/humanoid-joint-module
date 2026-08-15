/* 校验代码实验室.js — 数值自检(与 08_学习工具/04_代码实验室.html 同源复现)
   验证:① PID 位置控制参数行为;② 倒立摆纯平衡(好参数立住/坏参数倒下/扰动恢复);
         ③ 高级位置控制模式永不倒。
   运行: node _本地工具\校验代码实验室.js   期望输出 MATH OK */
"use strict";

/* ---------- 实验一复现:PID 位置控制 ---------- */
function pidSim(Kp, Ki, Kd, seconds){
  var J = 0.5, b = 0.3, TAU_MAX = 10, DT = 0.001;
  var ref = 1.5, th = 0, w = 0, integ = 0, t = 0;
  var maxOvershoot = 0, settleT = -1, hold = 0;
  while(t < seconds){
    var e = ref - th;
    var out = Kp * e + Ki * integ - Kd * w;
    out = Math.max(-TAU_MAX, Math.min(TAU_MAX, out));
    if(Math.abs(out) < TAU_MAX || out * e < 0){ integ += e * DT; }
    w += (out - b * w) / J * DT;
    th += w * DT;
    t += DT;
    if(th - ref > maxOvershoot) maxOvershoot = th - ref;
    if(Math.abs(th - ref) < 0.02 * Math.abs(ref)){ hold += DT; if(hold > 1 && settleT < 0) settleT = t; }
    else hold = 0;
  }
  return { settleT: settleT, osPct: maxOvershoot / Math.abs(ref) * 100, err: Math.abs(th - ref) };
}

/* ---------- 实验三复现:cart-pole(与页面同源:含摩擦 b=1、双模式) ---------- */
function cartSim(mode, Kp, Kd, seconds, disturbAt){
  var M = 1.0, m = 0.1, L = 0.5, G = 9.81, FMAX = 20, DT = 0.0005;
  var x = 0, th = 0.05, dx = 0, dth = 0, t = 0, xref = 0, thRef = 0;
  var maxTh = 0;
  while(t < seconds){
    if(disturbAt && Math.abs(t - disturbAt) < DT / 2){ dth += 2.2; }
    var F;
    if(mode === "balance"){
      thRef = 0;
      F = Kp * th + Kd * dth;
    }else{
      var target = Math.max(-0.3, Math.min(0.3, 0.2 * (xref - x) - 1.5 * dx));
      var diff = target - thRef;
      var maxStep = 0.3 * DT;
      thRef += Math.max(-maxStep, Math.min(maxStep, diff));
      F = Kp * (th - thRef) + Kd * dth;
    }
    F = Math.max(-FMAX, Math.min(FMAX, F));
    var cosT = Math.cos(th), sinT = Math.sin(th);
    var denom = L * (4 / 3 - m * cosT * cosT / (M + m));
    var d2th = (G * sinT + cosT * (-F - m * L * dth * dth * sinT) / (M + m)) / denom;
    var d2x = (F - 1 * dx + m * L * (dth * dth * sinT - d2th * cosT)) / (M + m);
    dth += d2th * DT; dth = Math.max(-20, Math.min(20, dth));
    th += dth * DT;
    if(Math.abs(th) > 1.9){ th = th > 0 ? 1.9 : -1.9; dth = 0; }
    dx += d2x * DT; x += dx * DT; t += DT;
    if(Math.abs(th) > maxTh) maxTh = Math.abs(th);
  }
  return { th: th, x: x, maxTh: maxTh };
}

var fails = 0;
function check(name, cond, detail){
  if(cond){ console.log("PASS " + name + (detail ? " (" + detail + ")" : "")); }
  else { console.log("FAIL " + name + (detail ? " (" + detail + ")" : "")); fails++; }
}

/* 1) PID 临界阻尼预设:快速收敛、超调小 */
var p1 = pidSim(60, 0, 11, 10);
check("PID 临界阻尼: 10s 内调节完成", p1.settleT > 0 && p1.settleT < 4, "settle=" + (p1.settleT === -1 ? "—" : p1.settleT.toFixed(2)) + "s os=" + p1.osPct.toFixed(1) + "%");
check("PID 临界阻尼: 超调 < 5%", p1.osPct < 5, "os=" + p1.osPct.toFixed(2) + "%");
check("PID 临界阻尼: 稳态误差 < 0.01", p1.err < 0.01, "err=" + p1.err.toFixed(4));

/* 2) PID 欠阻尼预设:振荡明显(超调 > 10%) */
var p2 = pidSim(60, 0, 1.5, 10);
check("PID 欠阻尼: 超调 > 10%(振荡特征)", p2.osPct > 10, "os=" + p2.osPct.toFixed(1) + "%");

/* 3) PID 纯 P 无 Kd:持续振荡(超调 > 15%) */
var p3 = pidSim(60, 0, 0, 10);
check("PID 纯 P: 无阻尼振荡(超调 > 15%)", p3.osPct > 15, "os=" + p3.osPct.toFixed(1) + "%");

/* 4) 倒立摆好参数(纯平衡):收敛竖直,最大摆角≈初始值 */
var c1 = cartSim("balance", 40, 6, 10);
check("倒立摆好参数: 末态 |θ| < 0.02 rad", Math.abs(c1.th) < 0.02, "th=" + c1.th.toFixed(4) + "rad x=" + c1.x.toFixed(2) + "m");
check("倒立摆好参数: 全程 |θ|max ≤ 0.06", c1.maxTh <= 0.06, "maxTh=" + c1.maxTh.toFixed(3));

/* 5) 倒立摆坏参数:倒杆 */
var c2 = cartSim("balance", 8, 1, 10);
check("倒立摆坏参数: 摆杆倒下(max|θ| > 1.0)", c2.maxTh > 1.0, "maxTh=" + c2.maxTh.toFixed(2));

/* 6) 扰动恢复:平衡后速度冲击应回稳 */
var c3 = cartSim("balance", 40, 6, 10, 2);
check("倒立摆抗扰: 回稳且全程 |θ|max < 0.5", Math.abs(c3.th) < 0.05 && c3.maxTh < 0.5, "th=" + c3.th.toFixed(3) + " maxTh=" + c3.maxTh.toFixed(3));

/* 7) 高级位置控制:永不倒(含扰动) */
var c4 = cartSim("adv", 120, 40, 20);
var c5 = cartSim("adv", 120, 40, 20, 5);
check("高级模式: 20s 全程不倒(max|θ| < 0.5)", c4.maxTh < 0.5, "maxTh=" + c4.maxTh.toFixed(3));
check("高级模式+扰动: 不倒", c5.maxTh < 0.5, "maxTh=" + c5.maxTh.toFixed(3));

console.log(fails === 0 ? "MATH OK" : ("MATH FAIL: " + fails));
process.exit(fails === 0 ? 0 : 1);
