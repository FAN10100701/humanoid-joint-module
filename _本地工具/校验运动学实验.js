/* 校验运动学实验.js — 与 01_理论入门/05_运动学基础 5.4 交互实验同源的数学复现
   验证:① FK↔IK 往返一致(肘上/肘下两组解都命中目标);
         ② 超出可达域(|c2|>1)正确判无解;
         ③ 奇异判据 |sinθ2| 与 det(J)=L1·L2·sinθ2 一致;
         ④ L1=L2 且目标在原点时 c2=-1 边界可解(折回位形)。
   运行: node _本地工具\校验运动学实验.js   期望输出 MATH OK */
"use strict";

function makeIK(L1, L2) {
  return {
    fk: function (t1, t2) {
      return { x: L1 * Math.cos(t1) + L2 * Math.cos(t1 + t2),
               y: L1 * Math.sin(t1) + L2 * Math.sin(t1 + t2) };
    },
    ik: function (x, y, sign) {
      var c2 = (x * x + y * y - L1 * L1 - L2 * L2) / (2 * L1 * L2);
      if (c2 < -1.0001 || c2 > 1.0001) return null;
      var cc = Math.max(-1, Math.min(1, c2));
      var t2 = sign * Math.acos(cc);
      var t1 = Math.atan2(y, x) - Math.atan2(L2 * Math.sin(t2), L1 + L2 * Math.cos(t2));
      return { t1: t1, t2: t2 };
    },
    det: function (t2) { return L1 * L2 * Math.sin(t2); }
  };
}

var fails = 0;
function check(name, cond, detail) {
  console.log((cond ? "PASS " : "FAIL ") + name + (detail ? " (" + detail + ")" : ""));
  if (!cond) fails++;
}

[[0.5, 0.3], [0.7, 0.7], [0.2, 0.7]].forEach(function (L) {
  var m = makeIK(L[0], L[1]);
  var maxErr = 0, bothSolvable = true;
  for (var i = 0; i < 3000; i++) {
    var t1 = (Math.random() * 2 - 1) * Math.PI;
    var t2 = (Math.random() * 2 - 1) * Math.PI * 0.9;   // 避开 θ2=±π 的退化折叠
    var e = m.fk(t1, t2);
    var s1 = m.ik(e.x, e.y, 1), s2 = m.ik(e.x, e.y, -1);
    if (!s1 || !s2) { bothSolvable = false; break; }
    var b1 = m.fk(s1.t1, s1.t2), b2 = m.fk(s2.t1, s2.t2);
    maxErr = Math.max(maxErr, Math.hypot(b1.x - e.x, b1.y - e.y), Math.hypot(b2.x - e.x, b2.y - e.y));
  }
  check("L=" + L[0] + "/" + L[1] + " FK↔IK 往返一致(3000组)", bothSolvable && maxErr < 1e-9,
        "maxErr=" + maxErr.toExponential(1));
});

var m = makeIK(0.5, 0.3);
check("超臂展(|r|>L1+L2)判无解", m.ik(1.5, 0.8, 1) === null);
check("贴边界外一点点判无解", m.ik(0.801, 0.0, 1) === null, "r=0.801 > 0.8");
check("贴边界内可解", m.ik(0.799, 0.0, 1) !== null, "r=0.799 < 0.8");

var eq = makeIK(0.5, 0.5);
var s0 = eq.ik(0, 0, 1);
check("L1=L2 目标在原点(折回)c2=-1 可解", s0 !== null && Math.abs(Math.abs(s0.t2) - Math.PI) < 1e-9,
      s0 ? "t2=" + s0.t2.toFixed(4) : "null");

var sing = m.ik(0.7999, 0, 1);   // r 贴近臂展 0.8 → θ2≈1.9°
check("伸直位形附近 |sinθ2|<0.12 触发奇异警告", sing !== null && Math.abs(Math.sin(sing.t2)) < 0.12,
      "sinθ2=" + Math.sin(sing.t2).toFixed(4) + " det=" + m.det(sing.t2).toFixed(5));
check("det(J)=L1·L2·sinθ2 与警告阈值一致", Math.abs(m.det(sing.t2)) < 0.12 * 0.5 * 0.3);

console.log(fails === 0 ? "MATH OK" : "MATH FAIL: " + fails);
process.exit(fails === 0 ? 0 : 1);
