/* ============================================================
   网页端串口调试助手 · SerialLab
   模块：fft（零依赖快速傅里叶变换）
   职责：给频域图提供功率谱。手写 radix-2 迭代式 FFT（位反转 + 蝶形），
         不引第三方数学库——站点是零依赖离线静态站，引库会破坏离线与自检策略。
   依赖：无（叶子模块）
   量纲约定：
     - 输入 samples 是设备的原始数值（如 ADC counts / 摄氏度）
     - 输出 magsLin 是「单边幅值谱」，已按样本数归一、按窗相干增益补偿，
       因此单频正弦的谱峰高度≈该正弦幅值，单位与输入一致
     - magsDb = 20*log10(magsLin)，单位 dB（相对 1 个单位）
   ============================================================ */
;(function (global) {
  "use strict";

  var SL = global.SerialLab = global.SerialLab || {};
  var F = {};

  var PI2 = Math.PI * 2;

  /* 不小于 n 的最小 2 的幂 */
  F.nextPow2 = function (n) {
    var p = 1;
    while (p < n) { p <<= 1; }
    return p;
  };

  /* V2.2.25：多窗可选。默认仍是 Hanning —— 它是通用选择（主瓣窄、旁瓣 -31dB），
     而「不做加窗有泄漏」这句对现状其实**不成立**：本文件一直默认加 Hann，
     并且下面还补偿了相干增益（cohGain），所以幅值本来就是准的。
     补可选窗的真实理由：Hamming 旁瓣更低（-43dB）适合找邻近的小峰；
     Blackman 旁瓣最低（-58dB）适合强信号旁边找弱分量；矩形窗则用于
     「就要看泄漏本身」或调试加窗是否生效。 */
  F.hamming = function (n) {
    var w = new Float64Array(n);
    if (n < 2) { for (var k = 0; k < n; k++) { w[k] = 1; } return w; }
    var denom = n - 1;
    for (var i = 0; i < n; i++) { w[i] = 0.54 - 0.46 * Math.cos(PI2 * i / denom); }
    return w;
  };

  F.blackman = function (n) {
    var w = new Float64Array(n);
    if (n < 2) { for (var k = 0; k < n; k++) { w[k] = 1; } return w; }
    var denom = n - 1;
    for (var i = 0; i < n; i++) {
      var x = PI2 * i / denom;
      w[i] = 0.42 - 0.5 * Math.cos(x) + 0.08 * Math.cos(2 * x);
    }
    return w;
  };

  /* 按名字取窗；返回 null 表示不加窗（矩形窗）。
     name 可以是 true（= 默认 Hann，兼容旧调用）/ 字符串 / false（= 矩形，由调用方处理） */
  F.windowFn = function (name, n) {
    if (name === "hamming") { return F.hamming(n); }
    if (name === "blackman") { return F.blackman(n); }
    if (name === "rect" || name === false || name === null) {
      var one = new Float64Array(n);
      for (var k = 0; k < n; k++) { one[k] = 1; }
      return one;   /* 全 1 = 不加窗：与原先的 if (win) 结构兼容，相干增益自然为 1 */
    }
    return F.hann(n);
  };

  /* 可选窗清单（UI 与文档共用同一份，避免两处各写一遍） */
  F.windowNames = [
    { id: "hann", label: "Hanning（默认·通用）" },
    { id: "hamming", label: "Hamming（旁瓣 -43dB，找邻近小峰）" },
    { id: "blackman", label: "Blackman（旁瓣 -58dB，强信号旁找弱分量）" },
    { id: "rect", label: "矩形（不加窗，用来看泄漏本身）" }
  ];  /* 汉宁窗（减少频谱泄漏）。n < 2 时返回全 1 */
  F.hann = function (n) {
    var w = new Float64Array(n);
    if (n < 2) {
      for (var k = 0; k < n; k++) { w[k] = 1; }
      return w;
    }
    var denom = n - 1;
    for (var i = 0; i < n; i++) {
      w[i] = 0.5 * (1 - Math.cos(PI2 * i / denom));
    }
    return w;
  };

  /* 是否有可用的引擎（浏览器 / Node 都有 TypedArray，这里只做防御性检查） */
  F.available = function () {
    return typeof Float64Array !== "undefined";
  };

  /* 就地迭代式 radix-2 FFT。re/im 长度必须是 2 的幂 */
  F.forward = function (re, im) {
    var n = re.length;
    if (n <= 1) { return; }
    if ((n & (n - 1)) !== 0) { throw new Error("FFT 长度必须是 2 的幂，当前 " + n); }

    var i, j, k, len, half, ang, wr, wi, curR, curI, ur, ui, vr, vi, tr, ti, nwr, nwi, idx1, idx2;

    /* 1) 位反转置换 */
    j = 0;
    for (i = 1; i < n; i++) {
      var bit = n >> 1;
      while (j & bit) { j ^= bit; bit >>= 1; }
      j ^= bit;
      if (i < j) {
        tr = re[i]; re[i] = re[j]; re[j] = tr;
        ti = im[i]; im[i] = im[j]; im[j] = ti;
      }
    }

    /* 2) 蝶形运算 */
    for (len = 2; len <= n; len <<= 1) {
      half = len >> 1;
      ang = -PI2 / len;
      wr = Math.cos(ang);
      wi = Math.sin(ang);
      for (i = 0; i < n; i += len) {
        curR = 1;
        curI = 0;
        for (k = 0; k < half; k++) {
          idx1 = i + k;
          idx2 = idx1 + half;
          ur = re[idx1];
          ui = im[idx1];
          /* 旋转因子乘第二个操作数 */
          vr = re[idx2] * curR - im[idx2] * curI;
          vi = re[idx2] * curI + im[idx2] * curR;
          re[idx1] = ur + vr;
          im[idx1] = ui + vi;
          re[idx2] = ur - vr;
          im[idx2] = ui - vi;
          /* 步进旋转因子 */
          nwr = curR * wr - curI * wi;
          nwi = curR * wi + curI * wr;
          curR = nwr;
          curI = nwi;
        }
      }
    }
  };

  /* 计算单边幅值谱
     samples   : 数字数组（取末尾 opts.maxN 个样本）
     sampleRate: 采样率（Hz）；不知道时可传 1，此时 freqs 的单位是「每样本」
     opts      : { maxN:8192, window:true, removeDC:true }
     返回      : { freqs, magsLin, magsDb, df, n, n0, peak:{freq,mag} } 或 null（样本不足） */
  F.spectrum = function (samples, sampleRate, opts) {
    opts = opts || {};
    if (!samples || samples.length < 8) { return null; }

    var maxN = opts.maxN || 8192;
    var n0 = samples.length;
    var startIdx = 0;
    if (n0 > maxN) { startIdx = n0 - maxN; n0 = maxN; }

    var sr = (typeof sampleRate === "number" && isFinite(sampleRate) && sampleRate > 0) ? sampleRate : 1;

    /* 1) 复制样本，可选去直流 */
    var buf = new Float64Array(n0);
    var sum = 0;
    var t;
    for (t = 0; t < n0; t++) {
      var v = samples[startIdx + t];
      buf[t] = (typeof v === "number" && isFinite(v)) ? v : 0;
      sum += buf[t];
    }
    var mean = sum / n0;
    if (opts.removeDC !== false) {
      for (t = 0; t < n0; t++) { buf[t] -= mean; }
    }

    /* 2) 加窗（同时求相干增益 sum(w)/n0，用于补偿幅值） */
    var win = null;
    var cohGain = 1;
    if (opts.window !== false) {
      win = F.windowFn(opts.window, n0);
      var wsum = 0;
      for (t = 0; t < n0; t++) { wsum += win[t]; }
      cohGain = wsum / n0;
      if (cohGain <= 1e-9) { cohGain = 1; }
      for (t = 0; t < n0; t++) { buf[t] *= win[t]; }
    }

    /* 3) 补零到 2 的幂 */
    var n = F.nextPow2(n0);
    var re = new Float64Array(n);
    var im = new Float64Array(n);
    for (t = 0; t < n0; t++) { re[t] = buf[t]; }

    /* 4) 变换 */
    F.forward(re, im);

    /* 5) 单边谱（0..n/2） */
    var half = n >> 1;
    var freqs = new Float64Array(half + 1);
    var magsLin = new Float64Array(half + 1);
    var magsDb = new Float64Array(half + 1);
    var df = sr / n;
    var peakIdx = 0;
    var peakMag = -1;

    for (var k2 = 0; k2 <= half; k2++) {
      var mag = Math.sqrt(re[k2] * re[k2] + im[k2] * im[k2]);
      mag = mag / n0 / cohGain;            /* 归一到「幅值」量纲 */
      if (k2 > 0 && k2 < half) { mag *= 2; } /* 单边谱：非直流与非奈奎斯特分量翻倍 */
      freqs[k2] = k2 * df;
      magsLin[k2] = mag;
      magsDb[k2] = 20 * Math.log(mag + 1e-12) / Math.LN10;
      if (k2 > 0 && mag > peakMag) { peakMag = mag; peakIdx = k2; }
    }

    return {
      freqs: freqs,
      magsLin: magsLin,
      magsDb: magsDb,
      df: df,
      n: n,
      n0: n0,
      sampleRate: sr,
      peak: { freq: freqs[peakIdx], mag: peakMag }
    };
  };

  SL.fft = F;

  /* UMD 尾：供校验脚本 require 真实源文件 */
  if (typeof module !== "undefined" && module.exports) { module.exports = SL.fft; }
})(typeof window !== "undefined" ? window : globalThis);
