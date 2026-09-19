/* ============================================================
   人形机器人学习站 · 全站错题本(间隔复习)
   V2.1.33:全站各页 .quiz 自测答错自动收集(site.js initQuiz 懒加载本文件),
   在 06_学习工具/03_自测题库.html 的「全站错题本」面板集中复习。
   调度阶梯与 srs.js 一致:答对 30分钟→1→2→4→8→16天,答错退回 30 分钟重爬。
   存储:humanoid-mistakes-v1(Site.store 单源带版本,数据只存本机不上传)。
   样式:复用 site.css 全局 .srs-* 类,零新增 CSS。
   ============================================================ */
(function(){
  "use strict";
  var KEY = "humanoid-mistakes-v1";
  var INTERVALS_MS = [30*60*1000, 1*86400000, 2*86400000, 4*86400000, 8*86400000, 16*86400000];
  var MAXLVL = INTERVALS_MS.length - 1;
  var _defed = false;

  function esc(s){
    s = String(s == null ? "" : s);
    if(window.Site && Site.esc) return Site.esc(s);
    return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }
  function ensureDef(){
    if(_defed || !window.Site || !Site.store) return;
    Site.store.def(KEY, 1);
    _defed = true;
  }
  function db(){
    ensureDef();
    if(window.Site && Site.store){ var d = Site.store.get(KEY); return d && d.list ? d : { list:{} }; }
    try{ var r = JSON.parse(localStorage.getItem(KEY) || "{}"); return r && r.list ? r : { list:{} }; }catch(e){ return { list:{} }; }
  }
  function save(d){
    ensureDef();
    if(window.Site && Site.store){ Site.store.set(KEY, d); return; }
    try{ localStorage.setItem(KEY, JSON.stringify(d)); }catch(e){}
  }
  function fmtDue(ms){
    var h = Math.round((ms - Date.now()) / 3600000);
    if(h < 1) return "30 分钟内";
    if(h < 24) return h + " 小时后";
    return Math.round(h / 24) + " 天后";
  }
  /* 来源页相对路径(用于复习卡回链;file:// 直开同样取最后两段) */
  function srcPath(){
    try{
      var seg = location.pathname.replace(/\\/g, "/").split("/").filter(Boolean);
      return seg.slice(-2).join("/");
    }catch(e){ return ""; }
  }

  var MK = {
    /* 记录/更新一条错题(info: page,pageT,q,opts[],ans,picked) */
    record: function(info){
      if(!info || !info.q) return;
      var d = db();
      var id = (info.page || "page") + "::" + String(info.q).slice(0, 40);
      var r = d.list[id] || { id:id, page:info.page||"", pageT:info.pageT||"", u:srcPath(), q:info.q, opts:info.opts||[], ans:info.ans||"", right:0, wrong:0, lvl:0, due:Date.now() };
      r.picked = info.picked || "";
      r.ts = Date.now();
      r.lvl = 0;                      /* 重错重爬:退回最短间隔 */
      r.wrong = (r.wrong || 0) + 1;
      r.due = Date.now();             /* 入册即到期:刚答错的题立刻可复习 */
      d.list[id] = r;
      save(d);
    },
    all: function(){
      var d = db(), out = [];
      for(var k in d.list) out.push(d.list[k]);
      out.sort(function(a, b){ return (a.due||0) - (b.due||0); });
      return out;
    },
    due: function(){
      var now = Date.now(), out = MK.all();
      return out.filter(function(r){ return (r.due||0) <= now; });
    },
    schedule: function(id, correct){
      var d = db(), r = d.list[id];
      if(!r) return;
      if(correct){
        r.lvl = Math.min((r.lvl||0) + 1, MAXLVL);
        r.right = (r.right||0) + 1;
        r.due = Date.now() + INTERVALS_MS[r.lvl];
      }else{
        r.lvl = 0;
        r.wrong = (r.wrong||0) + 1;
        r.due = Date.now() + INTERVALS_MS[0];
      }
      save(d);
    },
    remove: function(id){
      var d = db();
      delete d.list[id];
      save(d);
    },
    removeMastered: function(){
      var d = db(), n = 0;
      for(var k in d.list){ if((d.list[k].lvl||0) >= 3){ delete d.list[k]; n++; } }
      save(d);
      return n;
    },
    stats: function(){
      var a = MK.all(), due = 0, mastered = 0;
      var now = Date.now();
      for(var i = 0; i < a.length; i++){
        if((a[i].due||0) <= now) due++;
        if((a[i].lvl||0) >= 3) mastered++;
      }
      return { total: a.length, due: due, mastered: mastered };
    },
    /* Anki 导出:TSV(front=题干 back=正确选项全文 tags=来源页),字段内制表符/换行转空格 */
    exportTSV: function(){
      var a = MK.all(), lines = [];
      for(var i = 0; i < a.length; i++){
        var r = a[i], back = "";
        for(var j = 0; j < r.opts.length; j++){ if(r.opts[j].charAt(0) === r.ans) back = r.opts[j]; }
        if(!back) back = "正确答案:" + r.ans;
        back += "(" + (r.pageT || r.page || "本站") + ")";
        var f = [r.q, back, "错题本"];
        for(var k = 0; k < f.length; k++){ f[k] = String(f[k]).replace(/\t/g, " ").replace(/\r?\n/g, " "); }
        lines.push(f.join("\t"));
      }
      return lines.join("\n");
    }
  };
  window.Mistakes = MK;

  /* ---------- 复习面板(放在 06_学习工具/03_自测题库.html #mistakesPanel) ---------- */
  var panel = null, queue = [], cur = null;

  function el(sel){ return panel ? panel.querySelector(sel) : null; }

  function renderPanel(){
    if(!panel) return;
    var s = MK.stats();
    var html = '<div class="srs-head">'
      + '<div class="srs-title">📕 全站错题本 · 答错的题自动进这里</div>'
      + '<div class="srs-stats">'
      + '<span class="srs-stat"><b>' + s.due + '</b>待复习</span>'
      + '<span class="srs-stat"><b>' + s.total + '</b>在册</span>'
      + '<span class="srs-stat"><b>' + s.mastered + '</b>已巩固</span>'
      + '</div></div>';
    html += '<div class="srs-actions">'
      + '<button class="srs-btn" data-act="due">▶️ 复习到期(' + s.due + ')</button>'
      + '<button class="srs-btn" data-act="rand">🎲 随机练 5 题</button>'
      + (s.total ? '<button class="srs-btn" data-act="tsv">⬇ 导出 Anki TSV</button>' : "")
      + (s.mastered ? '<button class="srs-btn ghost" data-act="rm">🗑 移除已巩固(' + s.mastered + ')</button>' : "")
      + '</div>';
    html += '<div class="srs-tip">💡 任何页面自测答错都会自动收进本册;答对按 30分钟→1→2→4→8→16 天逐级拉长,答错退回 30 分钟。「已巩固」= 连对到第 4 档,可移除出册。数据只存本机。</div>';
    html += '<div class="srs-card" style="display:none"></div>';
    panel.innerHTML = html;
    var btns = panel.querySelectorAll("[data-act]");
    for(var i = 0; i < btns.length; i++){
      btns[i].onclick = (function(b){ return function(){ act(b.getAttribute("data-act")); }; })(btns[i]);
    }
  }

  function act(a){
    if(a === "due"){ queue = MK.due(); }
    if(a === "rand"){
      var all = MK.all();
      queue = [];
      while(queue.length < 5 && all.length){
        queue.push(all.splice(Math.floor(Math.random() * all.length), 1)[0]);
      }
      if(!queue.length){ toast("错题本还是空的——去各页自测答错几道再来 🙂"); }
    }
    if(a === "tsv"){
      var tsv = MK.exportTSV();
      try{
        var bom = "\uFEFF", blob = new Blob([bom + tsv], { type: "text/tab-separated-values;charset=utf-8" });
        var a2 = document.createElement("a");
        a2.href = URL.createObjectURL(blob);
        a2.download = "humanoid-mistakes-anki.tsv";
        document.body.appendChild(a2); a2.click(); a2.remove();
        toast("已导出 " + MK.all().length + " 条;Anki 导入时选「制表符」分隔,列序为 正面/背面/标签");
      }catch(e){ toast("导出失败:" + (e && e.message || e)); }
      return;
    }
    if(a === "rm"){
      var n = MK.removeMastered();
      toast(n ? "已移除 " + n + " 条已巩固错题" : "没有可移除的已巩固错题");
      renderPanel();
      return;
    }
    showCard();
  }

  function toast(msg){
    if(window.Site && Site.toast){ Site.toast(msg); }
    else { try{ console.log("[错题本]", msg); }catch(e){} }
  }

  function linkFor(r){
    var p = r.u || "";
    if(!p) return "";
    return "../" + p;
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
    var html = '<div class="srs-q"><span class="srs-tag">错题</span>'
      + "第 " + ((cur.lvl||0) + 1) + " 档 · 答错 " + (cur.wrong||0) + " 次</div>"
      + '<div class="srs-question">' + esc(cur.q) + "</div>"
      + '<div class="srs-options">';
    for(var i = 0; i < cur.opts.length; i++){
      html += '<button class="srs-opt" data-v="' + esc(cur.opts[i].charAt(0)) + '">' + esc(cur.opts[i]) + "</button>";
    }
    html += "</div>"
      + '<div class="srs-fb"></div>'
      + '<div class="srs-explain" style="display:none">💡 正确答案:' + esc(cur.ans)
      + (cur.u ? ' · <a href="' + esc(linkFor(cur)) + '">回原页复习 ↗</a>' : "")
      + "</div>"
      + '<div class="srs-after" style="display:none">'
      + '<button class="srs-btn ok" data-after="ok">✓ 这次记住了,拉长间隔</button>'
      + '<button class="srs-btn no" data-after="no">✗ 又错了,30 分钟后重试</button>'
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
        MK.schedule(cur.id, btn.getAttribute("data-after") === "ok");
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
    var ok = picked === cur.ans;
    if(ok){
      btn.classList.add("correct");
      fb.className = "srs-fb ok"; fb.textContent = "✓ 回答正确!下次复习:" + fmtDue(Date.now() + INTERVALS_MS[Math.min((cur.lvl||0) + 1, MAXLVL)]);
    }else{
      btn.classList.add("wrong");
      fb.className = "srs-fb no"; fb.textContent = "✗ 回答错误,正确答案是 " + cur.ans;
      for(var j = 0; j < opts.length; j++){
        if(opts[j].getAttribute("data-v") === cur.ans) opts[j].classList.add("correct");
      }
    }
    ex.style.display = "block";
    after.style.display = "flex";
  }

  window.Mistakes = MK;
  window.MistakesUI = { init: function(){
    panel = document.getElementById("mistakesPanel");
    if(!panel) return;
    renderPanel();
  } };
  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", function(){ window.MistakesUI.init(); });
  }else{
    window.MistakesUI.init();
  }
})();
