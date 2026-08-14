// Unit test for the sequential teardown animation math (applyTdExplodeSeq).
// Verifies: parts fly out one-by-one in order, hold fully exploded,
// then return in reverse order (assembly is teardown reversed).
var TD_SEQ_HOLD = 1.6;
var n = 12, HOLD = n + TD_SEQ_HOLD, TOTAL = HOLD + n;

// returns array of per-part explode factors at progress s
function partsAt(s) {
  if (s >= TOTAL) s = 0;
  var out = [];
  for (var i = 0; i < n; i++) {
    var t;
    if (s <= n) t = Math.max(0, Math.min(1, s - i));
    else if (s <= HOLD) t = 1;
    else t = Math.max(0, Math.min(1, (n - i) - (s - HOLD)));
    out.push(t);
  }
  return out;
}

function assert(cond, msg) { if (!cond) { console.log('FAIL: ' + msg); process.exit(1); } }

// 1. start: all assembled
var a0 = partsAt(0);
assert(a0.every(function (t) { return t === 0; }), 's=0 should be fully assembled');

// 2. teardown midpoint s=2.5: parts 0,1 fully out; part 2 at 0.5; rest assembled
var a25 = partsAt(2.5);
assert(a25[0] === 1 && a25[1] === 1 && Math.abs(a25[2] - 0.5) < 1e-9 && a25[3] === 0, 's=2.5 sequence: ' + a25.join(','));

// 3. hold: all fully exploded
var ah = partsAt(n + 0.8);
assert(ah.every(function (t) { return t === 1; }), 'hold phase should be fully exploded');

// 4. assembly s=HOLD+0.5: last part (i=n-1) returning at 0.5, others still out
var aa = partsAt(HOLD + 0.5);
assert(aa[0] === 1 && aa[10] === 1 && Math.abs(aa[11] - 0.5) < 1e-9, 'assembly phase reverse order: ' + aa.join(','));

// 5. end: all back（TOTAL 前最后零件仍有微小残量，属正常动画行为，用容差判断）
var ae = partsAt(TOTAL - 0.001);
assert(ae.every(function (t) { return t < 0.01; }), 'end should be fully assembled');
var aeExact = partsAt(TOTAL);   /* 整周期结束重置为0 */
assert(aeExact.every(function (t) { return t === 0; }), 'cycle end resets to assembled');

// 6. invariant over the whole cycle: earlier-teardown part is always at least as exploded
//    as the next one (t_i >= t_{i+1}) — holds for both teardown and assembly phases
for (var s = 0; s < TOTAL; s += 0.1) {
  var p = partsAt(s);
  for (var i = 0; i < n - 1; i++) {
    if (p[i + 1] > p[i]) { console.log('FAIL monotonic at s=' + s + ', i=' + i + ': ' + p.join(',')); process.exit(1); }
  }
}
console.log('SEQ ANIMATION MATH OK (n=' + n + ', full cycle=' + TOTAL.toFixed(1) + ' part-units)');
