/* ============================================================
   人形机器人学习站 · 全站共享脚本
   功能: 顶部导航注入 / 面包屑 / 上一篇下一篇 / 页脚 /
         自测题判分 / 全站搜索(Ctrl+K) / 学习进度打卡
   用法: 每个页面在 <body> 末尾引入
         <script src="../_assets/site.js"></script>
         并在 head 中定义 window.PAGE 配置(见 _assets/页面模板.html)
   ============================================================ */
(function(){
  "use strict";
  var S = window.Site = window.Site || {};
  var STORE = "humanoid-site-progress-v1";

  /* 全站导航(相对站点根目录) */
  S.NAV = [
    { t:"首页",     u:"index.html" },
    { t:"3D解剖",   u:"00_3D解剖/人形机器人解剖式知识可视化.html" },
    { t:"理论入门", u:"01_理论入门/01_整体知识框架_思维导图.html" },
    { t:"硬件基础", u:"02_硬件基础/04_硬件设计通用要点_避坑指南.html" },
    { t:"项目实操", u:"03_项目实操/06_本次项目核心_Hdrive融合方案完整指南.html" },
    { t:"升级进阶", u:"04_升级进阶/09_通信与控制算法升级路线.html" },
    { t:"软件算法", u:"06_软件与算法/01_软件学习路线图.html" },
    { t:"前沿知识", u:"07_前沿知识库/01_全球人形机器人机型全景.html" },
    { t:"学习工具", u:"08_学习工具/01_术语词典.html" }
  ];

  function page(){ return window.PAGE || {}; }

  /* ---------- 学习进度 ---------- */
  function getProgress(){
    try{ return JSON.parse(localStorage.getItem(STORE) || "{}"); }catch(e){ return {}; }
  }
  function saveProgress(p){
    try{ localStorage.setItem(STORE, JSON.stringify(p)); }catch(e){}
  }
  S.isDone = function(id){ return !!getProgress()[id]; };
  S.toggleDone = function(){
    var id = page().pageId; if(!id) return;
    var p = getProgress();
    p[id] = p[id] ? 0 : Date.now();
    saveProgress(p);
    var btn = document.querySelector(".nav-done");
    if(btn) btn.classList.toggle("on", !!p[id]);
    S.refreshHomeProgress && S.refreshHomeProgress();
  };
  S.getSectionProgress = function(prefix){
    /* prefix 形如 "06" 或 "07-0"; 返回 {done,total} */
    var p = getProgress(), done = 0, total = 0;
    (window.SITE_SECTION_PAGES || []).forEach(function(it){
      if(it.id.indexOf(prefix) === 0){ total++; if(p[it.id]) done++; }
    });
    return { done:done, total:total };
  };

  /* ---------- 顶部导航 + 面包屑 + 上一篇/下一篇 + 页脚 ---------- */
  function injectChrome(){
    var P = page();
    var root = P.root || "";
    var nav = document.createElement("nav");
    nav.className = "topnav";
    var html = '<div class="nav-inner">'
      + '<a class="nav-brand" href="' + root + '/index.html"><span class="brand-dot"></span>人形机器人学习站</a>'
      + '<div class="nav-links">';
    S.NAV.forEach(function(it){
      html += '<a href="' + root + "/" + it.u + '">' + it.t + "</a>";
    });
    html += '</div>'
      + '<button class="nav-search" onclick="Site.openSearch()"><span class="txt">搜索</span> 🔍<kbd>Ctrl K</kbd></button>'
      + '<button class="nav-done" onclick="Site.toggleDone()" title="标记本节已完成">✓ 完成</button>'
      + '</div>';
    nav.innerHTML = html;
    document.body.insertBefore(nav, document.body.firstChild);

    if(P.pageId){
      var crumb = document.createElement("div");
      crumb.className = "breadcrumb";
      var ch = '<a href="' + root + '/index.html">首页</a>';
      (P.breadcrumb || []).forEach(function(b){
        ch += '<span class="sep">/</span>';
        ch += b.u ? '<a href="' + b.u + '">' + b.t + "</a>" : "<span>" + b.t + "</span>";
      });
      crumb.innerHTML = ch;
      document.body.insertBefore(crumb, document.body.firstChild);
    }

    if(P.prev || P.next){
      var pn = document.createElement("div");
      pn.className = "prevnext";
      var ph = "";
      if(P.prev) ph += '<a class="pn-item" href="' + P.prev.u + '"><span>← 上一篇</span><b>' + P.prev.t + "</b></a>";
      if(P.next) ph += '<a class="pn-item next" href="' + P.next.u + '"><span>下一篇 →</span><b>' + P.next.t + "</b></a>";
      pn.innerHTML = ph;
      document.body.appendChild(pn);
    }

    var ft = document.createElement("footer");
    ft.className = "site-footer";
    ft.innerHTML = "人形机器人学习站 · V1.4.0(2026-08-15) · 免费开源教学网站 · 软件 + 硬件 + 前沿知识 · "
      + '<a href="' + root + '/index.html">返回首页</a> · 按 Ctrl+K 全站搜索 · '
      + '<a href="' + root + '/index.html#version">版本历史</a>';
    document.body.appendChild(ft);

    if(P.pageId){
      var btn = document.querySelector(".nav-done");
      if(btn) btn.classList.toggle("on", !!getProgress()[P.pageId]);
    }
  }

  /* ---------- 自测题判分 ---------- */
  S.initQuiz = function(){
    var qs = document.querySelectorAll(".quiz");
    for(var i = 0; i < qs.length; i++){
      (function(q){
        var opts = q.querySelector(".quiz-options");
        var fb = q.querySelector(".quiz-feedback");
        var ex = q.querySelector(".quiz-explain");
        var answer = (opts && opts.getAttribute("data-answer")) || "";
        var btns = opts ? opts.querySelectorAll("button") : [];
        for(var j = 0; j < btns.length; j++){
          (function(btn){
            btn.addEventListener("click", function(){
              var picked = btn.getAttribute("data-v");
              for(var k = 0; k < btns.length; k++){
                btns[k].classList.remove("correct", "wrong");
              }
              if(picked === answer){
                btn.classList.add("correct");
                if(fb){ fb.className = "quiz-feedback ok"; fb.textContent = "✓ 回答正确!"; }
              }else{
                btn.classList.add("wrong");
                if(fb){ fb.className = "quiz-feedback no"; fb.textContent = "✗ 回答错误,正确答案是 " + answer; }
              }
              if(ex) ex.classList.add("show");
            });
          })(btns[j]);
        }
      })(qs[i]);
    }
  };

  /* ---------- 全站搜索 ---------- */
  function buildIndex(){
    var idx = (window.SITE_SEARCH_INDEX || []).map(function(it){
      return {
        t: it.t || "",
        u: it.u || "",
        s: it.s || "",
        d: it.d || "",
        k: (it.k || "").toLowerCase()
      };
    });
    return idx;
  }
  /* 自动加载搜索索引(页面无需手动引入 _assets/search-index.js) */
  function ensureSearchIndex(cb){
    if(window.SITE_SEARCH_INDEX){ cb(); return; }
    var root = page().root || "";
    var s = document.createElement("script");
    s.src = (root ? root + "/" : "") + "_assets/search-index.js";
    s.onload = function(){ cb(); };
    s.onerror = function(){ cb(); };
    document.head.appendChild(s);
  }
  function renderSearch(overlay, q){
    var box = overlay.querySelector(".search-results");
    q = (q || "").trim().toLowerCase();
    if(!q){
      box.innerHTML = '<div class="search-empty">输入关键词开始搜索 —— 支持 标题 / 板块 / 描述 / 术语<br>例如:FOC、谐波、ROS2、Isaac、VLA、灵巧手、编码器、CAN</div>';
      return;
    }
    var idx = buildIndex();
    var hits = idx.filter(function(it){
      return it.t.toLowerCase().indexOf(q) >= 0
        || it.s.toLowerCase().indexOf(q) >= 0
        || it.d.toLowerCase().indexOf(q) >= 0
        || it.k.indexOf(q) >= 0;
    });
    if(!hits.length){
      box.innerHTML = '<div class="search-empty">没有找到与「' + q + '」相关的内容</div>';
      return;
    }
    var root = page().root || "";
    var base = root ? root + "/" : "";
    var html = '<div class="search-count">共 ' + hits.length + " 条结果</div>";
    hits.forEach(function(h){
      html += '<a class="search-hit" href="' + base + h.u + '">'
        + '<div class="hit-t">' + h.t + "</div>"
        + '<div class="hit-meta">' + h.s + " · " + h.d + "</div></a>";
    });
    box.innerHTML = html;
  }
  S.openSearch = function(initQuery){
    ensureSearchIndex(function(){
      var overlay = document.getElementById("site-search-overlay");
      if(!overlay){
        overlay = document.createElement("div");
        overlay.id = "site-search-overlay";
        overlay.className = "search-overlay";
        overlay.innerHTML = '<div class="search-box">'
          + '<div class="search-head">🔍 全站搜索 · ' + (buildIndex().length || 0) + ' 个页面'
          + '<span class="search-close" onclick="Site.closeSearch()">✕</span></div>'
          + '<input class="search-input" placeholder="输入关键词,回车打开第一条…">'
          + '<div class="search-results"></div></div>';
        document.body.appendChild(overlay);
      }
      overlay.classList.add("show");
      var input = overlay.querySelector(".search-input");
      input.value = initQuery || "";
      input.focus();
      renderSearch(overlay, input.value);
      input.oninput = function(){ renderSearch(overlay, this.value); };
      input.onkeydown = function(e){
        if(e.key === "Enter"){
          var first = overlay.querySelector(".search-hit");
          if(first){ window.location.href = first.getAttribute("href"); }
        }
      };
    });
  };
  S.closeSearch = function(){
    var o = document.getElementById("site-search-overlay");
    if(o) o.classList.remove("show");
  };

  document.addEventListener("keydown", function(e){
    if((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")){
      e.preventDefault(); S.openSearch();
    }
    if(e.key === "Escape") S.closeSearch();
  });

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", function(){ injectChrome(); S.initQuiz(); });
  }else{
    injectChrome(); S.initQuiz();
  }
})();
