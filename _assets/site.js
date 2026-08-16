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
    { t:"HdriveV2", u:"03_项目实操/10_Hdrive新版方案_交叉认证与芯片选型报告.html" },
    { t:"软件算法", u:"06_软件与算法/01_软件学习路线图.html" },
    { t:"前沿知识", u:"07_前沿知识库/01_全球人形机器人机型全景.html" },
    { t:"学习工具", u:"08_学习工具/01_术语词典.html" }
  ];

  function page(){ return window.PAGE || {}; }

  /* ---------- 主题(亮/暗风格切换) ---------- */
  var THEME_KEY = "site-theme";
  function applyTheme(){
    var t = "dark";
    try{ t = localStorage.getItem(THEME_KEY) || "dark"; }catch(e){}
    document.body.setAttribute("data-theme", t);
    var btns = document.querySelectorAll(".nav-theme");
    for(var i = 0; i < btns.length; i++){
      btns[i].textContent = (t === "light") ? "🌙" : "☀️";
      btns[i].setAttribute("title", (t === "light") ? "切到深色风格" : "切到浅色风格(苹果透亮)");
    }
    var seg = document.querySelectorAll(".theme-seg button");
    for(var j = 0; j < seg.length; j++){
      seg[j].classList.toggle("on", seg[j].getAttribute("data-t") === t);
    }
  }
  S.setTheme = function(name){
    var next = (name === "light") ? "light" : "dark";
    document.body.setAttribute("data-theme", next);
    try{ localStorage.setItem(THEME_KEY, next); }catch(e){}
    applyTheme();
  };
  S.toggleTheme = function(){
    var cur = document.body.getAttribute("data-theme") === "light";
    S.setTheme(cur ? "dark" : "light");
  };
  window.toggleTheme = function(){ if(window.Site) Site.toggleTheme(); };

  /* ---------- 学习进度 ---------- */
  function getProgress(){
    try{ return JSON.parse(localStorage.getItem(STORE) || "{}"); }catch(e){ return {}; }
  }
  function saveProgress(p){
    try{ localStorage.setItem(STORE, JSON.stringify(p)); }catch(e){}
  }
  S.isDone = function(id){ return !!getProgress()[id]; };
  /* 学习活动记录(首页日历热力图数据源):每次新打卡记一次当日活动 */
  var AKEY = "humanoid-site-activity-v1";
  function logActivity(){
    try{
      var d = new Date();
      var key = d.getFullYear() + "-" + (d.getMonth() + 1 < 10 ? "0" : "") + (d.getMonth() + 1) + "-" + (d.getDate() < 10 ? "0" : "") + d.getDate();
      var a = JSON.parse(localStorage.getItem(AKEY) || "{}");
      a[key] = (a[key] || 0) + 1;
      localStorage.setItem(AKEY, JSON.stringify(a));
    }catch(e){}
  }
  S.getActivity = function(){
    try{ return JSON.parse(localStorage.getItem(AKEY) || "{}"); }catch(e){ return {}; }
  };
  S.toggleDone = function(){
    var id = page().pageId; if(!id) return;
    var p = getProgress();
    var was = !!p[id];
    p[id] = was ? 0 : Date.now();
    saveProgress(p);
    if(!was) logActivity();
    var btn = document.querySelector(".nav-done");
    if(btn) btn.classList.toggle("on", !!p[id]);
    S.refreshHomeProgress && S.refreshHomeProgress();
  };
  /* 进度导出(下载 JSON,可换设备后导入) */
  S.exportProgress = function(){
    var p = getProgress();
    var blob = new Blob([JSON.stringify(p, null, 2)], { type:"application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "人形机器人学习进度-" + new Date().toISOString().slice(0,10) + ".json";
    document.body.appendChild(a); a.click(); a.remove();
  };
  /* 进度导入(合并进当前进度) */
  S.importProgress = function(){
    var input = document.createElement("input");
    input.type = "file"; input.accept = ".json,application/json";
    input.onchange = function(){
      var f = input.files[0]; if(!f) return;
      var r = new FileReader();
      r.onload = function(){
        try{
          var data = JSON.parse(r.result);
          var p = getProgress(), n = 0;
          for(var k in data){ if(data[k] && !p[k]){ p[k] = data[k]; n++; } }
          saveProgress(p);
          if(window.renderProgress) window.renderProgress();
          alert("已导入 " + n + " 条进度记录");
        }catch(e){ alert("导入失败:文件格式不正确,请选择导出的 .json 文件"); }
      };
      r.readAsText(f);
    };
    input.click();
  };
  S.getSectionProgress = function(prefix){
    /* prefix 形如 "06" 或 "07-0"; 返回 {done,total} */
    var p = getProgress(), done = 0, total = 0;
    (window.SITE_SECTION_PAGES || []).forEach(function(it){
      if(it.id.indexOf(prefix) === 0){ total++; if(p[it.id]) done++; }
    });
    return { done:done, total:total };
  };

  /* ---------- 文档式目录侧边栏(DeepSeek 官方文档风) ---------- */
  function buildToc(){
    var P = page();
    if(!P.pageId) return;
    /* 仅对使用 site.css 的新页面生效(旧页面布局各异,不注入) */
    if(!document.querySelector('link[href*="site.css"]')) return;
    var hs = document.querySelectorAll('.container h2');
    if(hs.length < 2) return;
    var items = [];
    for(var i = 0; i < hs.length; i++){
      var h = hs[i];
      if(!h.id){ h.id = 'sec-' + (i + 1); }
      var t = h.textContent.replace(/^\d+\s*/, '').trim();
      items.push({ id: h.id, t: t });
    }
    var aside = document.createElement('aside');
    aside.className = 'toc-sidebar';
    aside.id = 'tocSidebar';
    var html = '<div class="toc-title">📑 本页目录</div><ul>';
    items.forEach(function(it){
      html += '<li><a href="#' + it.id + '" data-toc="' + it.id + '">' + it.t + '</a></li>';
    });
    html += '</ul>';
    aside.innerHTML = html;
    document.body.appendChild(aside);
    document.body.classList.add('has-toc');
    var btn = document.createElement('button');
    btn.className = 'toc-toggle';
    btn.textContent = '📑';
    btn.title = '目录';
    btn.onclick = function(){ aside.classList.toggle('open'); };
    document.body.appendChild(btn);
    /* 滚动高亮当前章节 */
    var links = aside.querySelectorAll('a');
    var secs = [];
    items.forEach(function(it){ secs.push(document.getElementById(it.id)); });
    window.addEventListener('scroll', function(){
      var y = window.scrollY + 120, cur = null;
      for(var j = 0; j < secs.length; j++){
        if(secs[j] && secs[j].offsetTop <= y){ cur = secs[j].id; }
      }
      for(var k = 0; k < links.length; k++){
        if(links[k].getAttribute('data-toc') === cur){ links[k].classList.add('active'); }
        else { links[k].classList.remove('active'); }
      }
    });
  }

  /* ---------- 回到顶部按钮 ---------- */
  function initBackTop(){
    var btn = document.createElement('button');
    btn.className = 'backtop';
    btn.innerHTML = '↑';
    btn.title = '回到顶部';
    btn.style.display = 'none';
    btn.onclick = function(){ window.scrollTo({ top:0, behavior:'smooth' }); };
    document.body.appendChild(btn);
    window.addEventListener('scroll', function(){
      btn.style.display = window.scrollY > 600 ? 'flex' : 'none';
    });
  }

  /* ---------- 全站 PWA:注册 Service Worker + manifest ---------- */
  function initSW(){
    if(!("serviceWorker" in navigator)) return;
    var root = page().root || "";
    navigator.serviceWorker.register((root ? root + "/" : "") + "sw.js").catch(function(){});
    var link = document.createElement("link");
    link.rel = "manifest";
    link.href = (root ? root + "/" : "") + "manifest.json";
    document.head.appendChild(link);
  }

  /* ---------- 顶部导航 + 面包屑 + 上一篇/下一篇 + 页脚 ---------- */
  function injectChrome(){
    var P = page();
    var root = P.root || "";
    /* 首页自带头部/页脚,不注入第二套导航与页脚(评审 #1/#2) */
    if(!P.pageId) return;
    var nav = document.createElement("nav");
    nav.className = "topnav";
    var html = '<div class="nav-inner">'
      + '<a class="nav-brand" href="' + root + '/index.html"><span class="brand-dot"></span>人形机器人学习站</a>'
      + '<div class="nav-links">';
    S.NAV.forEach(function(it){
      html += '<a href="' + root + "/" + it.u + '">' + it.t + "</a>";
    });
    html += '</div>'
      + '<button class="nav-theme" onclick="Site.toggleTheme()" title="切换亮/暗风格">☀️</button>'
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
    ft.innerHTML = "人形机器人学习站 · " + S.VERSION + " · 免费开源教学网站 · 软件 + 硬件 + 前沿知识 · "
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
    s.onload = function(){ cb(); if(S.onSearchIndexReady) S.onSearchIndexReady(); };
    s.onerror = function(){ cb(); };
    document.head.appendChild(s);
  }
  function esc(s){ return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
  function highlight(html, terms){
    if(!terms || !terms.length) return html;
    var re = new RegExp("(" + terms.map(function(t){ return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("|") + ")", "gi");
    return html.replace(re, "<mark>$1</mark>");
  }
  function renderSearch(overlay, q){
    var box = overlay.querySelector(".search-results");
    q = (q || "").trim().toLowerCase();
    if(!q){
      box.innerHTML = '<div class="search-empty">输入关键词开始搜索 —— 支持 标题 / 板块 / 描述 / 术语,多个词用空格分隔<br>例如:FOC、谐波、ROS2、Isaac、VLA、灵巧手、编码器、CAN</div>';
      return;
    }
    var idx = buildIndex();
    var terms = q.split(/\s+/).filter(function(t){ return t; });
    var scored = [];
    for(var i = 0; i < idx.length; i++){
      var it = idx[i];
      var score = 0, ok = true;
      for(var j = 0; j < terms.length; j++){
        var t = terms[j];
        var inTitle = it.t.toLowerCase().indexOf(t) >= 0;
        var inSec   = it.s.toLowerCase().indexOf(t) >= 0;
        var inDesc  = it.d.toLowerCase().indexOf(t) >= 0;
        var inKw    = it.k.indexOf(t) >= 0;
        if(!(inTitle || inSec || inDesc || inKw)){ ok = false; break; }
        if(inTitle) score += 4;
        if(inSec)   score += 2;
        if(inDesc)  score += 1;
        if(inKw)    score += 1;
        if(inTitle && it.t.toLowerCase().indexOf(t) === 0) score += 1; /* 前缀命中加权 */
      }
      if(ok) scored.push({ s: score, h: it });
    }
    if(!scored.length){
      box.innerHTML = '<div class="search-empty">没有找到与「' + esc(q) + '」相关的内容,换个词试试</div>';
      return;
    }
    scored.sort(function(a, b){ return b.s - a.s; });
    var root = page().root || "";
    var base = root ? root + "/" : "";
    var html = '<div class="search-count">共 ' + scored.length + " 条结果(按相关度排序)</div>";
    for(var k = 0; k < scored.length; k++){
      var h = scored[k].h;
      var tt = highlight(esc(h.t), terms);
      var meta = highlight(esc(h.s) + " · " + esc(h.d), terms);
      html += '<a class="search-hit" href="' + base + h.u + '">'
        + '<div class="hit-t">' + tt + "</div>"
        + '<div class="hit-meta">' + meta + "</div></a>";
    }
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

  /* ---------- 版本号(全站页脚使用,与 CHANGELOG 同步) ---------- */
  S.VERSION = "V1.5.1(2026-08-16)";

  /* ---------- 每页学习目标注入(数据来自 _assets/page-meta.js) ---------- */
  function ensurePageMeta(cb){
    if(window.SITE_PAGE_META){ cb(); return; }
    var root = page().root || "";
    var s = document.createElement("script");
    s.src = (root ? root + "/" : "") + "_assets/page-meta.js";
    s.onload = function(){ cb(); };
    s.onerror = function(){ cb(); };
    document.head.appendChild(s);
  }
  function injectLearningGoals(){
    var P = page();
    if(!P.pageId) return;
    /* 已自带"学习目标"块的页面(模板新页)不重复注入 */
    var exists = document.querySelector(".key-point .kp-title");
    if(exists && /学习目标/.test(exists.textContent || "")) return;
    ensurePageMeta(function(){
      var meta = (window.SITE_PAGE_META || {})[P.pageId];
      if(!meta) return;
      var head = document.querySelector(".page-head");
      if(!head || !head.parentNode) return;
      var div = document.createElement("div");
      div.className = "key-point page-goals";
      var html = '<div class="kp-title">🎯 本页学习目标</div>';
      (meta.goals || []).forEach(function(g){ html += "1. " + g + "<br>"; });
      if(meta.time)  html += "<b>建议用时:</b>" + meta.time + "　";
      if(meta.prereq) html += "<b>前置知识:</b>" + meta.prereq;
      div.innerHTML = html;
      head.parentNode.insertBefore(div, head.nextSibling);
    });
  }
  /* ---------- 更新日期 + 事实核实状态印章(评审 #14) ---------- */
  function injectPageStamp(){
    var P = page();
    if(!P.pageId) return;
    var head = document.querySelector(".page-head");
    if(!head || !head.parentNode) return;
    ensurePageMeta(function(){
      var meta = (window.SITE_PAGE_META || {})[P.pageId];
      var updated = (meta && meta.updated) ? meta.updated : "2026-08-15";
      var verified = (meta && meta.verified) ? meta.verified : "内容已核对";
      var stamp = document.createElement("div");
      stamp.className = "page-stamp";
      stamp.innerHTML = "📅 内容更新于 " + updated + " · 事实状态:" + verified;
      head.parentNode.insertBefore(stamp, head.nextSibling);
    });
  }

  /* ---------- 新手引导(仅首页,首次访问 3 步) ---------- */
  function initOnboarding(){
    if(page().pageId) return;   /* 只在首页展示 */
    var ON_KEY = "site-onboard-v1";
    var seen = false;
    try{ seen = localStorage.getItem(ON_KEY) === "1"; }catch(e){}
    if(seen) return;
    var nPages = (window.SITE_SEARCH_INDEX ? window.SITE_SEARCH_INDEX.length - 1 : 35);
    var steps = [
      { t:"👋 欢迎来到人形机器人学习站", d:"这里是从关节模组到具身智能的免费学习网站:3D 解剖、FOC 原理、硬件实战、软件算法、前沿知识,共 " + nPages + " 个页面。" },
      { t:"🔍 用搜索快速定位", d:"按 Ctrl+K(手机点顶部「搜索」按钮)打开全站搜索,输入 FOC、谐波、ROS2、VLA 等关键词,直达对应页面。" },
      { t:"✅ 学习打卡", d:"学完一页,点右上角「✓ 完成」按钮打卡;首页会统计你的学习进度,还可导出/导入,换设备不丢进度。" }
    ];
    var cur = 0;
    var ov = document.createElement("div");
    ov.className = "onboard-overlay";
    ov.innerHTML = '<div class="onboard-card">'
      + '<div class="onboard-body"></div>'
      + '<div class="onboard-nav"><span class="onboard-dots"></span>'
      + '<span class="onboard-btns"><button class="onboard-skip">跳过</button>'
      + '<button class="onboard-next">下一步 →</button></span></div></div>';
    document.body.appendChild(ov);
    function render(){
      var st = steps[cur];
      ov.querySelector(".onboard-body").innerHTML = '<div class="onboard-title">' + st.t + "</div><div class=\"onboard-desc\">" + st.d + "</div>";
      var dots = ov.querySelector(".onboard-dots");
      var dh = "";
      for(var i = 0; i < steps.length; i++){
        dh += '<span class="onboard-dot' + (i === cur ? " on" : "") + '"></span>';
      }
      dots.innerHTML = dh;
      ov.querySelector(".onboard-next").textContent = (cur === steps.length - 1) ? "开始学习 🚀" : "下一步 →";
    }
    function finish(){
      ov.classList.add("hide");
      setTimeout(function(){ if(ov.parentNode) ov.parentNode.removeChild(ov); }, 300);
      try{ localStorage.setItem(ON_KEY, "1"); }catch(e){}
    }
    ov.querySelector(".onboard-next").onclick = function(){
      if(cur < steps.length - 1){ cur++; render(); }
      else{ finish(); }
    };
    ov.querySelector(".onboard-skip").onclick = finish;
    render();
  }

  /* ---------- 打印按钮(导航右侧) ---------- */
  function initPrintBtn(){
    var nav = document.querySelector(".topnav .nav-inner");
    if(!nav) return;
    var b = document.createElement("button");
    b.className = "nav-print";
    b.textContent = "🖨️";
    b.title = "打印 / 导出 PDF";
    b.onclick = function(){ window.print(); };
    nav.appendChild(b);
  }

  document.addEventListener("keydown", function(e){
    if((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")){
      e.preventDefault(); S.openSearch();
    }
    if(e.key === "Escape") S.closeSearch();
  });

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", function(){ applyTheme(); injectChrome(); buildToc(); initBackTop(); S.initQuiz(); injectLearningGoals(); injectPageStamp(); initPrintBtn(); initOnboarding(); initSW(); });
  }else{
    applyTheme(); injectChrome(); buildToc(); initBackTop(); S.initQuiz(); injectLearningGoals(); injectPageStamp(); initPrintBtn(); initOnboarding(); initSW();
  }
})();
