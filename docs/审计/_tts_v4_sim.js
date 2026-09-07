/* _tts_v4_sim.js — 16_保研英语面试 TTS v4 调度行为仿真(零依赖,node 直接跑)
 * 从页面源码抽取真实 TTS IIFE,配可编排 mock 语音引擎 + 真实定时器,验证:
 *   S1 本地音色:单词点击即播、不 cancel 风暴
 *   S2 网络音色开页探测慢(>2s)→ 本次访问自动落本地
 *   S3 探测通过但单句朗读时网络音色死 → 6s 看门狗切本地 → 整段仍完整播完(v3 的"点了没反应"主场景)
 *   S4 网络音色合成报错(synthesis-failed)→ 切本地原词重试
 *   S5 手动保存的网络音色同样被探测降级;重新手动选择即重置
 *   S6 空闲态单句朗读零等待直发(保留 v3 优化)
 *   S7 连点单词队列顺序连播回归
 * 用法: node docs/审计/_tts_v4_sim.js   (全部 PASS 输出 ALL SCENARIOS PASSED)
 */
"use strict";
var fs = require("fs"), path = require("path");

var pagePath = path.join(__dirname, "..", "..", "06_学习工具", "16_保研英语面试.html");
var page = fs.readFileSync(pagePath, "utf8");
var a = page.indexOf("var TTS = (function(){");
var b = page.indexOf("/* ---------- 渲染:公共行/卡");
if(a < 0 || b < 0 || b <= a){ console.log("FAIL: TTS 源码抽取失败"); process.exit(1); }
var ttsSrc = page.slice(a, b);

/* ---------- mock 件 ---------- */
function mkVoices(){
  return {
    net: { voiceURI: "net-aria", name: "Microsoft Aria Online (Natural) - English (United States)", lang: "en-US", localService: false },
    loc: { voiceURI: "loc-zira", name: "Microsoft Zira - English (United States)", lang: "en-US", localService: true }
  };
}
function mkEngine(voiceList){
  var eng = {
    paused: false,
    voiceList: voiceList,
    speakCalls: [], cancelCalls: 0,
    /* policy(u) → {start,end,err} 毫秒;返回 {} 则该 utterance 永远无事件(死) */
    policy: function(){ return { start: 80, end: 400 }; },
    speak: function(u){
      eng.speakCalls.push(u);
      var plan = eng.policy(u, eng.speakCalls.length) || {};
      var done = false, timers = [];
      u._timers = timers;
      var fireErr = function(code){ return function(){ if(done) return; done = true; timers.forEach(clearTimeout); u.onerror && u.onerror({ error: code }); }; };
      if(plan.errAt != null) timers.push(setTimeout(fireErr(plan.err), plan.errAt));
      if(plan.start != null) timers.push(setTimeout(function(){
        if(done) return;
        u.onstart && u.onstart();
        if(plan.end != null) timers.push(setTimeout(function(){ if(done) return; done = true; u.onend && u.onend(); }, plan.end));
      }, plan.start));
      u._cancel = function(){
        timers.forEach(clearTimeout);
        if(!done){ done = true; setTimeout(function(){ u.onerror && u.onerror({ error: "interrupted" }); }, 0); }
      };
    },
    cancel: function(){
      eng.cancelCalls++;
      eng.speakCalls.forEach(function(u){ if(u._cancel){ var c = u._cancel; u._cancel = null; c(); } });
    },
    resume: function(){},
    getVoices: function(){ return eng.voiceList; }
  };
  return eng;
}
function mkLs(init){
  var m = init || {};
  return { getItem: function(k){ return (k in m) ? m[k] : null; }, setItem: function(k, v){ m[k] = v; }, removeItem: function(k){ delete m[k]; } };
}
function build(opts){
  opts = opts || {};
  var V = mkVoices(), toasts = [];
  var list = opts.net === false ? [V.loc] : [V.net, V.loc];
  var eng = mkEngine(list);
  var ls = mkLs(opts.saved ? { "humanoid-en-voice-v1": "net-aria" } : null);
  var win = { speechSynthesis: eng };
  var doc = { addEventListener: function(){} };
  var U = function(text){ this.text = text; this.volume = 1; this.rate = 1; this.lang = ""; this.voice = null; };
  win.SpeechSynthesisUtterance = U;   /* 页面 ok 判定是 "SpeechSynthesisUtterance" in window */
  var factory = new Function("window", "document", "localStorage", "toast", "speechSynthesis", "SpeechSynthesisUtterance",
    ttsSrc + "\nreturn TTS;");
  var TTS = factory(win, doc, ls, function(msg){ toasts.push(msg); }, eng, U);
  return { TTS: TTS, eng: eng, toasts: toasts, V: V };
}
function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
var fails = [];
process.on("uncaughtException", function(e){ console.log("  FAIL 未捕获异常: " + (e && e.message || e)); fails.push("uncaught:" + (e && e.message || e)); });
function check(name, cond, detail){
  console.log((cond ? "  PASS " : "  FAIL ") + name + (cond ? "" : "  ← " + detail));
  if(!cond) fails.push(name);
}

/* ---------- S0 音色下拉精选(页面层函数,配仿 Edge 真实音色清单) ---------- */
(function(){
  var a2 = page.indexOf("function shortVoiceName");
  var b2 = page.indexOf("function updateVoiceStatus");
  if(a2 < 0 || b2 < 0 || b2 <= a2){ check("S0 源码抽取", false, "anchor missing"); return; }
  function V(uri, name, lang, local){ return { voiceURI: uri, name: name, lang: lang, localService: local }; }
  var voices = [
    V("aria",  "Microsoft Aria Online (Natural) - English (United States)",  "en-US", false),
    V("sonia", "Microsoft Sonia Online (Natural) - English (United Kingdom)", "en-GB", false),
    V("jenny", "Microsoft Jenny Online (Natural) - English (United States)", "en-US", false),
    V("guy",   "Microsoft Guy Online (Natural) - English (United States)",   "en-US", false),
    V("brian", "Microsoft Brian Online (Natural) - English (United Kingdom)", "en-GB", false),
    V("emma",  "Microsoft Emma Online (Natural) - English (United Kingdom)",  "en-GB", false),
    V("libby", "Microsoft Libby Online (Natural) - English (United Kingdom)", "en-GB", false),   /* 第 7 个 Natural:应被封顶挤掉 */
    V("goog",  "Google US English", "en-US", false),
    V("george","Microsoft George - English (United Kingdom)", "en-GB", false),                /* 非 Natural/Google 网络音色:应被排除 */
    V("zira",  "Microsoft Zira - English (United States)",  "en-US", true),
    V("david", "Microsoft David - English (United States)", "en-US", true)
  ];
  var saved = { uri: "", voice: voices[0] };
  var fakeTTS = { getEnVoices: function(){ return voices; }, getUserVoice: function(){ return saved.uri; }, getVoice: function(){ return saved.voice; } };
  var sel = { innerHTML: "" };
  var fn = new Function("$", "TTS", page.slice(a2, b2) + "; return { fill: fillVoiceSelect, short: shortVoiceName };");
  var api = fn(function(){ return sel; }, fakeTTS);
  check("S0 shortVoiceName 去厂商/地区后缀", api.short(voices[0]) === "Aria Online (Natural)", api.short(voices[0]));
  saved.uri = ""; saved.voice = voices[0];
  api.fill();
  var h = sel.innerHTML;
  check("S0 首项为标准音色并显示实际音色", h.indexOf(">标准音色(推荐):Aria Online (Natural)<") >= 0, h.slice(0, 120));
  check("S0 Natural 封顶 6 个", (h.match(/\(Natural\) ★联网/g) || []).length === 6, String((h.match(/\(Natural\) ★联网/g) || []).length));
  check("S0 保留 Google", h.indexOf("Google US English ★联网") >= 0, "");
  check("S0 本地兜底 1 个(David)", h.indexOf("David 本地秒出声") >= 0, "");
  check("S0 排除非推荐网络音色 George", h.indexOf("George") < 0, "");
  check("S0 全部选项数 = 9", (h.match(/<option/g) || []).length === 9, String((h.match(/<option/g) || []).length));
  saved.uri = "george"; saved.voice = voices[8];
  api.fill();
  check("S0 已保存的手选音色(子集外)保留且选中", sel.innerHTML.indexOf('value="george" selected') >= 0, "");
})();

/* ---------- 场景 ---------- */
(async function(){
  /* S1 本地音色:点击即播(探测句让位)+ 除探测外零 cancel 风暴 */
  (function(){
    var s = build({ net: false });
    s.TTS.initVoices(function(){});
    s.TTS.speakWord("robot");
    setTimeout(function(){
      var u = s.eng.speakCalls[s.eng.speakCalls.length - 1];
      check("S1 单词立即进引擎", !!u && u.text.replace(/\s/g, "") === "robot", JSON.stringify(s.eng.speakCalls.map(function(x){ return x.text; })));
      check("S1 用本地音色", !!u && u.voice && u.voice.localService === true, u && u.voice && u.voice.name);
      check("S1 仅探测句被 cancel", s.eng.cancelCalls === 1, "cancelCalls=" + s.eng.cancelCalls);
    }, 600);
  })();

  await sleep(700);   /* 让 S1 的定时器跑完 */

  /* S2 开页探测:网络音色起步 2.6s(>2s)→ 自动落本地 */
  (function(){
    var s = build({});
    s.eng.policy = function(u){
      if(u.volume === 0) return { start: 2600, end: 2700 };          /* 探测句:慢 */
      return { start: 200, end: 500 };
    };
    s.TTS.initVoices(function(){});
    setTimeout(function(){
      check("S2 探测后当前音色为本地", s.TTS.getVoice() && s.TTS.getVoice().localService === true, s.TTS.getVoice() && s.TTS.getVoice().name);
      check("S2 有降级提示", s.toasts.some(function(t){ return t.indexOf("改用本地") >= 0; }), JSON.stringify(s.toasts));
      s.TTS.speakWord("robot");
      var u = s.eng.speakCalls[s.eng.speakCalls.length - 1];
      check("S2 单词用本地音色发声", !!u && u.voice && u.voice.localService === true, u && u.voice && u.voice.name);
    }, 3200);
  })();
  await sleep(4200);

  /* S3 探测通过,但单句朗读时网络音色死 → 6s 看门狗切本地 → 整段播完(v3 主病灶) */
  (function(){
    var s = build({});
    s.eng.policy = function(u){
      if(u.volume === 0) return { start: 200, end: 300 };            /* 探测句:正常,骗过探测 */
      if(u.voice && !u.voice.localService) return {};                /* 真语音:网络音色死 */
      return { start: 100, end: 350 };                               /* 本地:快 */
    };
    s.TTS.initVoices(function(){});
    var doneCnt = 0;
    setTimeout(function(){
      s.TTS.speakSequence(
        [{ text: "Hello, my name is Fan." }, { text: "I study robotics." }],
        { onDone: function(){ doneCnt++; } }
      );
    }, 800);
    setTimeout(function(){
      var usedLocal = s.eng.speakCalls.some(function(u){ return u.volume !== 0 && u.voice && u.voice.localService; });
      check("S3 网络音色死后切本地继续播", usedLocal, "speakCalls=" + s.eng.speakCalls.length);
      check("S3 整段照常完成(onDone 恰好 1 次)", doneCnt === 1, "doneCnt=" + doneCnt);
      check("S3 未触发放弃提示", !s.toasts.some(function(t){ return t.indexOf("无响应") >= 0; }), JSON.stringify(s.toasts));
      check("S3 触发降级提示", s.toasts.some(function(t){ return t.indexOf("改用本地") >= 0; }), JSON.stringify(s.toasts));
      check("S3 空转重试有限(≤4 次派发)", s.eng.speakCalls.filter(function(u){ return u.volume !== 0; }).length <= 4,
        "real speaks=" + s.eng.speakCalls.filter(function(u){ return u.volume !== 0; }).length);
    }, 8800);
  })();
  await sleep(9500);

  /* S4 网络音色合成报错 → 切本地原词重试 */
  (function(){
    var s = build({});
    s.eng.policy = function(u){
      if(u.volume === 0) return { start: 150, end: 250 };
      if(u.voice && !u.voice.localService) return { errAt: 120, err: "synthesis-failed" };
      return { start: 100, end: 300 };
    };
    s.TTS.initVoices(function(){});
    setTimeout(function(){ s.TTS.speakWord("harmonic"); }, 700);
    setTimeout(function(){
      var last = s.eng.speakCalls[s.eng.speakCalls.length - 1];
      check("S4 报错后改用本地重试", !!last && last.voice && last.voice.localService === true, last && last.voice && last.voice.name);
      check("S4 重试的是同一个词", !!last && last.text.replace(/\s/g, "") === "harmonic", last && last.text);
    }, 2200);
  })();
  await sleep(3200);

  /* S5 手动保存的网络音色也被降级;重新选择即重置 */
  (function(){
    var s = build({ saved: true });
    s.eng.policy = function(u){
      if(u.volume === 0) return { start: 2600, end: 2700 };
      return { start: 200, end: 500 };
    };
    s.TTS.initVoices(function(){});
    setTimeout(function(){
      check("S5 已保存的网络音色被降级为本地", s.TTS.getVoice() && s.TTS.getVoice().localService === true, s.TTS.getVoice() && s.TTS.getVoice().name);
      s.TTS.setUserVoice("net-aria");       /* 用户手动换回:重置降级,给新选择机会 */
      check("S5 手动重选后恢复网络音色", s.TTS.getVoice() && s.TTS.getVoice().localService === false, s.TTS.getVoice() && s.TTS.getVoice().name);
    }, 3200);
  })();
  await sleep(4200);

  /* S6 空闲态单句朗读零等待直发 */
  (function(){
    var s = build({ net: false });
    s.TTS.initVoices(function(){});
    setTimeout(function(){
      var t0 = Date.now();
      s.TTS.speakSequence([{ text: "Good morning, professors." }]);
      var dt = Date.now() - t0;
      check("S6 空闲点击同步直发(≤30ms)", dt <= 30, dt + "ms");
      var u = s.eng.speakCalls[s.eng.speakCalls.length - 1];
      check("S6 首句进引擎", !!u && u.text === "Good morning, professors.", u && u.text);
    }, 800);
  })();
  await sleep(1600);

  /* S7 连点单词队列顺序连播(回归) */
  (function(){
    var s = build({ net: false });
    s.TTS.initVoices(function(){});
    s.TTS.speakWord("robot"); s.TTS.speakWord("actuator"); s.TTS.speakWord("harmonic");
    setTimeout(function(){
      var texts = s.eng.speakCalls.map(function(u){ return u.text.replace(/\s/g, ""); });
      var idx = ["robot", "actuator", "harmonic"].map(function(w){ return texts.indexOf(w); });
      check("S7 三词全部按序派发", idx[0] >= 0 && idx[1] > idx[0] && idx[2] > idx[1], JSON.stringify(texts));
      check("S7 仅探测句被 cancel", s.eng.cancelCalls === 1, "cancelCalls=" + s.eng.cancelCalls);
    }, 2600);
  })();
  await sleep(3400);

  /* S8 句间衔接回归:本地音色严格顺序播(下一句 onstart 晚于上一句 onend),覆盖句间看门狗武装路径 */
  (function(){
    var s = build({ net: false });
    s.eng.policy = function(u, idx){
      return { start: 300 * idx + 100, end: 400 };   /* 第二句 onstart(700ms)晚于第一句 onend(500ms) */
    };
    s.TTS.initVoices(function(){});
    var doneCnt = 0;
    setTimeout(function(){
      s.TTS.speakSequence([{ text: "Sentence one." }, { text: "Sentence two." }],
        { onDone: function(){ doneCnt++; } });
    }, 600);
    setTimeout(function(){
      var texts = s.eng.speakCalls.map(function(u){ return u.text; });
      check("S8 两句都派发", texts.indexOf("Sentence one.") >= 0 && texts.indexOf("Sentence two.") >= 0, JSON.stringify(texts));
      check("S8 整段完成(onDone 1 次)", doneCnt === 1, "doneCnt=" + doneCnt);
    }, 3200);
  })();
  await sleep(3600);

  console.log(fails.length ? ("\n" + fails.length + " 项 FAIL: " + fails.join(" | ")) : "\nALL SCENARIOS PASSED");
  process.exit(fails.length ? 1 : 0);
})().catch(function(e){ console.log("SIM ERROR: " + (e && e.stack || e)); process.exit(1); });
