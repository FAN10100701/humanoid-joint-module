/* ============================================================
   人形机器人学习站 · 今日复习(间隔重复 SRS)
   基于 _assets/quiz-bank.js 的题库(当前 40 题),按"学-练-测-复习"闭环,
   用间隔重复算法安排复习:答对间隔逐级拉长,答错当天重试。
   用法: 页面放置 <div id="srsPanel"></div> 并引入本脚本。
   ============================================================ */
(function(){
  "use strict";
  var KEY = "humanoid-srs-v1";
  var BANK = window.QUIZ_BANK || [];
  /* 各等级的复习间隔: 0=30分钟 1=1天 2=2天 3=4天 4=8天 5=16天 */
  var INTERVALS_MS = [30*60*1000, 1*86400000, 2*86400000, 4*86400000, 8*86400000, 16*86400000];
  var MAXLVL = INTERVALS_MS.length - 1;

  function load(){ try{ return JSON.parse(localStorage.getItem(KEY) || "{}"); }catch(e){ return {}; } }
  var state = load();
  function save(){ try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(e){} }

  function rec(qid){ return state[qid] || (state[qid] = { lvl:0, due:0, right:0, wrong:0 }); }

  /* 待复习队列: 学过的且到期(due<=now)的题 */
  function dueList(){
    var now = Date.now(), out = [];
    for(var i = 0; i < BANK.length; i++){
      var r = state[BANK[i].id];
      if(r && r.due && r.due <= now) out.push(BANK[i]);
    }
    return out;
  }
  /* 从未学过的新题 */
  function newList(){
    var out = [];
    for(var i = 0; i < BANK.length; i++){
      if(!state[BANK[i].id] || (!state[BANK[i].id].right && !state[BANK[i].id].wrong)) out.push(BANK[i]);
    }
    return out;
  }
  function stats(){
    var right = 0, wrong = 0, mastered = 0;
    for(var k in state){
      var r = state[k];
      right += r.right || 0; wrong += r.wrong || 0;
      if(r.lvl >= 3) mastered++;
    }
    return { due: dueList().length, fresh: newList().length, right: right, wrong: wrong, mastered: mastered, total: BANK.length };
  }
  function schedule(qid, correct){
    var r = rec(qid);
    if(correct){
      r.lvl = Math.min(r.lvl + 1, MAXLVL);
      r.right = (r.right || 0) + 1;
      r.due = Date.now() + INTERVALS_MS[r.lvl];
    }else{
      r.lvl = 0;
      r.wrong = (r.wrong || 0) + 1;
      r.due = Date.now() + INTERVALS_MS[0];
    }
    save();
  }

  var panel = null;
  var queue = [];      /* 当前复习队列(题对象) */
  var mode = "";       /* "due" | "practice" | "wrong" */
  var cur = null;

  function el(id){ return panel ? panel.querySelector(id) : null; }

  function fmtDue(ms){
    var h = Math.round((ms - Date.now()) / 3600000);
    if(h < 1) return "30 分钟内";
    if(h < 24) return h + " 小时后";
    return Math.round(h / 24) + " 天后";
  }

  function renderPanel(){
    if(!panel) return;
    var s = stats();
    var html = '<div class="srs-head">'
      + '<div class="srs-title">📅 今日复习 · 间隔重复 SRS</div>'
      + '<div class="srs-stats">'
      + '<span class="srs-stat"><b>' + s.due + '</b>待复习</span>'
      + '<span class="srs-stat"><b>' + s.fresh + '</b>未学</span>'
      + '<span class="srs-stat"><b>' + s.mastered + '</b>已掌握</span>'
      + '<span class="srs-stat"><b>' + (s.right + s.wrong) + '</b>累计作答</span>'
      + '</div></div>';
    if(s.due === 0){
      html += '<div class="srs-done">🎉 今日复习任务已清空!</div>';
      html += '<div class="srs-actions">'
        + '<button class="srs-btn" data-act="fresh">🆕 学习新题(' + s.fresh + ')</button>'
        + '<button class="srs-btn" data-act="practice">🎲 随机练习 5 题</button>'
        + (s.wrong ? '<button class="srs-btn" data-act="wrong">📕 错题本(' + s.wrong + ' 题)</button>' : "")
        + '<button class="srs-btn ghost" data-act="reset">重置进度</button>'
        + '</div>';
    }else{
      html += '<div class="srs-actions">'
        + '<button class="srs-btn" data-act="due">▶️ 开始复习(' + s.due + ')</button>'
        + '<button class="srs-btn" data-act="practice">🎲 随机练习</button>'
        + (s.wrong ? '<button class="srs-btn" data-act="wrong">📕 错题本</button>' : "")
        + '</div>';
    }
    html += '<div class="srs-tip">💡 答对:下次复习间隔自动拉长(1→2→4→8→16 天);答错:当天 30 分钟后重试。对抗遗忘曲线,记得更牢。</div>';
    html += '<div class="srs-card" style="display:none"></div>';
    panel.innerHTML = html;
    var btns = panel.querySelectorAll("[data-act]");
    for(var i = 0; i < btns.length; i++){
      btns[i].onclick = (function(b){ return function(){ act(b.getAttribute("data-act")); }; })(btns[i]);
    }
  }

  function act(a){
    if(a === "reset"){
      if(!confirm("确定清空全部复习进度?")) return;
      state = {}; save(); renderPanel(); return;
    }
    if(a === "due"){ queue = dueList(); mode = "due"; }
    if(a === "fresh"){ queue = newList(); mode = "practice"; }
    if(a === "practice"){
      var all = BANK.slice();
      queue = [];
      while(queue.length < 5 && all.length){
        queue.push(all.splice(Math.floor(Math.random() * all.length), 1)[0]);
      }
      mode = "practice";
    }
    if(a === "wrong"){
      queue = [];
      for(var i = 0; i < BANK.length; i++){
        if((state[BANK[i].id] || {}).wrong) queue.push(BANK[i]);
      }
      mode = "wrong";
    }
    showCard();
  }

  function showCard(){
    var card = el(".srs-card");
    if(!card) return;
    if(!queue.length){
      card.style.display = "none";
      renderPanel();
      return;
    }
    cur = queue.shift();
    var r = state[cur.id] || {};
    var html = '<div class="srs-q"><span class="srs-tag">' + cur.g + "</span>"
      + "Q" + cur.id + " · 第 " + (r.lvl || 0) + " 级</div>"
      + '<div class="srs-question">' + cur.q + "</div>"
      + '<div class="srs-options">';
    for(var i = 0; i < cur.o.length; i++){
      html += '<button class="srs-opt" data-v="' + cur.o[i].charAt(0) + '">' + cur.o[i] + "</button>";
    }
    html += "</div>"
      + '<div class="srs-fb"></div>'
      + '<div class="srs-explain" style="display:none">💡 ' + cur.e + "</div>"
      + '<div class="srs-after" style="display:none">'
      + '<button class="srs-btn ok" data-after="ok">✓ 记住了,安排下次复习</button>'
      + '<button class="srs-btn no" data-after="no">✗ 没记住,30 分钟后重试</button>'
      + "</div>";
    card.innerHTML = html;
    card.style.display = "block";
    var opts = card.querySelectorAll(".srs-opt");
    for(var j = 0; j < opts.length; j++){
      opts[j].onclick = (function(btn){ return function(){ answer(btn); }; })(opts[j]);
    }
    var afters = card.querySelectorAll("[data-after]");
    for(var k = 0; k < afters.length; k++){
      afters[k].onclick = (function(btn){ return function(){
        schedule(cur.id, btn.getAttribute("data-after") === "ok");
        showCard();
      }; })(afters[k]);
    }
  }

  function answer(btn){
    var card = el(".srs-card");
    var opts = card.querySelectorAll(".srs-opt");
    var fb = card.querySelector(".srs-fb");
    var ex = card.querySelector(".srs-explain");
    var after = card.querySelector(".srs-after");
    var picked = btn.getAttribute("data-v");
    for(var i = 0; i < opts.length; i++) opts[i].disabled = true;
    if(picked === cur.a){
      btn.classList.add("correct");
      fb.className = "srs-fb ok"; fb.textContent = "✓ 回答正确!";
    }else{
      btn.classList.add("wrong");
      fb.className = "srs-fb no"; fb.textContent = "✗ 回答错误,正确答案是 " + cur.a;
      for(var j = 0; j < opts.length; j++){
        if(opts[j].getAttribute("data-v") === cur.a) opts[j].classList.add("correct");
      }
    }
    ex.style.display = "block";
    after.style.display = "flex";
  }

  window.SRS = {
    init: function(){
      panel = document.getElementById("srsPanel");
      if(!panel || !BANK.length) return;
      renderPanel();
    },
    render: renderPanel,
    stats: stats
  };
  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", function(){ window.SRS.init(); });
  }else{
    window.SRS.init();
  }
})();
