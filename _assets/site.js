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
    { t:"软件算法", u:"06_软件与算法/01_软件学习路线图.html" },
    { t:"前沿知识", u:"07_前沿知识库/01_全球人形机器人机型全景.html" },
    { t:"学习工具", u:"08_学习工具/01_术语词典.html" },
    { t:"大模型", u:"09_大模型与具身智能/01_大模型基础与MoE架构图解.html" }
  ];

  function page(){ return window.PAGE || {}; }

  /* ---------- 主题(亮/暗风格切换) ---------- */
  var THEME_KEY = "site-theme";
  function applyTheme(){
    var t = "light";   /* 默认日间(浅色)模式 */
    try{ t = localStorage.getItem(THEME_KEY) || "light"; }catch(e){}
    document.body.setAttribute("data-theme", t);
    /* html 级同步(FOUC 消除):head 内联脚本与 CSS 的 html[data-theme-early] 映射共用,
       切换主题时立即更新,保证跨页跳转/刷新首帧就是目标主题 */
    try{ document.documentElement.setAttribute("data-theme-early", t); }catch(e){}
    /* 浏览器地址栏/状态栏颜色跟随主题 */
    var mc = document.querySelector('meta[name="theme-color"]');
    if(mc){ mc.setAttribute("content", t === "light" ? "#f6f8fb" : "#0d1117"); }
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
    try{ document.documentElement.setAttribute("data-theme-early", next); }catch(e){}
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
  /* 退出自动保存: 本页进度有变化且开关开启时,pagehide 自动导出一次 */
  var AUTO_KEY = "site-autosave-v1";
  var snapAtLoad = null;
  S.autoSaveEnabled = function(){
    try{ return localStorage.getItem(AUTO_KEY) !== "0"; }catch(e){ return true; }
  };
  S.setAutoSave = function(on){
    try{ localStorage.setItem(AUTO_KEY, on ? "1" : "0"); }catch(e){}
  };
  function initAutoSave(){
    snapAtLoad = JSON.stringify(getProgress());
    window.addEventListener("pagehide", function(){
      if(!S.autoSaveEnabled()) return;
      if(JSON.stringify(getProgress()) === snapAtLoad) return;  /* 本页无变化,不重复下载 */
      S.exportProgress();
    });
  }
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
    /* 2026-08-17:由 ≥2 放宽为 ≥1——3D 拆解页/实验台/项目清单等页面只有一个 h2 时
       也应显示左侧目录(否则「控件完全空白」),内容页有目录总比没有强 */
    if(hs.length < 1) return;
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
    /* 滚动高亮当前章节(用文档绝对位置,避免 offsetParent 偏移导致高亮错位) */
    var links = aside.querySelectorAll('a');
    var secs = [];
    items.forEach(function(it){ secs.push(document.getElementById(it.id)); });
    function highlightToc(){
      var y = window.scrollY + 150, cur = null;
      for(var j = 0; j < secs.length; j++){
        if(secs[j]){
          var top = secs[j].getBoundingClientRect().top + window.scrollY;
          if(top <= y) cur = secs[j].id;
        }
      }
      /* 滚动到底部时,高亮最后一个章节 */
      var docEnd = (document.documentElement.scrollHeight || document.body.scrollHeight) - window.innerHeight;
      if(y >= docEnd && secs.length && secs[secs.length - 1]){ cur = secs[secs.length - 1].id; }
      for(var k = 0; k < links.length; k++){
        if(links[k].getAttribute('data-toc') === cur){ links[k].classList.add('active'); }
        else { links[k].classList.remove('active'); }
      }
    }
    window.addEventListener('scroll', highlightToc, { passive:true });
    window.addEventListener('load', highlightToc);
    setTimeout(highlightToc, 100);
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

  /* ---------- 术语悬浮提示(选中术语即出解释,数据来自 _assets/glossary-tip.js) ---------- */
  function ensureGlossary(cb){
    if(window.GLOSSARY_TIPS){ cb(); return; }
    var root = page().root || "";
    var s = document.createElement("script");
    s.src = (root ? root + "/" : "") + "_assets/glossary-tip.js";
    s.onload = function(){ cb(); };
    s.onerror = function(){ cb(); };
    document.head.appendChild(s);
  }
  function initTermTip(){
    var tip = null;
    function hide(){ if(tip){ tip.remove(); tip = null; } }
    document.addEventListener("mouseup", function(){
      setTimeout(function(){
        var sel = window.getSelection ? window.getSelection().toString().trim() : "";
        if(!sel || sel.length > 30){ hide(); return; }
        ensureGlossary(function(){
          var G = window.GLOSSARY_TIPS || {};
          var key = null;
          var low = sel.toLowerCase();
          for(var k in G){
            if(k.toLowerCase() === low){ key = k; break; }
            if(sel.indexOf(k) >= 0 && (!key || k.length > key.length)){ key = k; }
          }
          if(!key){ hide(); return; }
          hide();
          tip = document.createElement("div");
          tip.className = "term-tip";
          tip.innerHTML = "<b>" + key + "</b><br>" + G[key];
          document.body.appendChild(tip);
          var x = (window.event && window.event.clientX) || 0;
          var y = (window.event && window.event.clientY) || 0;
          tip.style.left = Math.min(x + 14, window.innerWidth - 280) + "px";
          tip.style.top = (y + 16) + "px";
        });
      }, 10);
    });
    document.addEventListener("click", function(e){ if(tip && e.target !== tip) hide(); });
    window.addEventListener("scroll", hide);
    document.addEventListener("keydown", hide);
  }

  /* ---------- 讨论与反馈(V2.1.4 精简):云端评论已停用,仅渲染「联系站长」卡片 ---------- */
  function initComments(){
    if(!window.PAGE || !window.PAGE.pageId) return;   /* 首页不渲染 */
    try{
      var sc = document.createElement("script");
      sc.src = (window.PAGE.root || "") + "/_assets/giscus-config.js";
      document.head.appendChild(sc);
    }catch(e){}
    function mount(){
      var email = (window.COMMENTS_CONFIG && window.COMMENTS_CONFIG.email) || "";
      var mailto = email ? '<a href="mailto:' + email + '" style="color:#60a5fa;font-weight:700;text-decoration:underline">' + email + '</a>' : '站长邮箱';
      var box = document.createElement("div");
      box.className = "giscus-wrap";
      box.innerHTML = '<h2><span class="h2-num">✉</span> 讨论与反馈</h2>'
        + '<div class="box box-tip" style="margin-top:10px"><b>📮 联系站长:</b>欢迎邮件联系站长: ' + mailto + '。邮件请注明页面链接与问题描述,一般 1~2 天内回复。</div>';
      (document.querySelector(".container") || document.body).appendChild(box);
    }
    if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
    else mount();
  }

  /* ---------- KaTeX 公式渲染(元素 class="formula" 内为 LaTeX) ---------- */
  function initKaTeX(){
    var els = document.querySelectorAll(".formula");
    if(!els.length) return;
    var l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://registry.npmmirror.com/katex/0.16.11/files/dist/katex.min.css";
    document.head.appendChild(l);
    var s = document.createElement("script");
    s.src = "https://registry.npmmirror.com/katex/0.16.11/files/dist/katex.min.js";
    s.onload = function(){
      if(!window.katex) return;
      for(var i = 0; i < els.length; i++){
        var el = els[i];
        try{ katex.render(el.textContent, el, { throwOnError:false, displayMode:true }); }
        catch(e){ /* 保持原文 */ }
      }
    };
    document.head.appendChild(s);
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
    /* 顶栏收纳(V2.1.0):仅保留高频直达,其余收进「板块 ▾」玻璃下拉 */
    var quickT = ["首页", "3D解剖", "理论入门", "软件算法", "学习工具"];
    S.NAV.forEach(function(it){
      if(quickT.indexOf(it.t) >= 0) html += '<a href="' + root + "/" + it.u + '">' + it.t + "</a>";
    });
    html += '<div class="nav-dd" id="navDD">'
      + '<button class="nav-dd-btn" type="button">板块 ▾</button>'
      + '<div class="nav-dd-panel">';
    S.NAV.forEach(function(it){
      html += '<a href="' + root + "/" + it.u + '">' + it.t + "</a>";
    });
    html += '<a href="' + root + '/index.html#sec9">大模型</a>'
      + '<a href="' + root + '/08_学习工具/12_闯关学习.html">闯关学习</a>'
      + '<a href="' + root + '/08_学习工具/14_个人作品台.html">个人作品台</a>'
      + '</div></div></div>'
      + '<a class="nav-ver" href="' + root + '/index.html#version" title="版本与更新历史">🏷 v' + (S.VERSION.split('(')[0] || '').replace('V','') + '</a>'
      + '<button class="nav-theme" onclick="Site.toggleTheme()" title="切换亮/暗风格">☀️</button>'
      + '<button class="nav-search" onclick="Site.openSearch()"><span class="txt">搜索</span> 🔍<kbd>Ctrl K</kbd></button>'
      + '<button class="nav-done" onclick="Site.toggleDone()" title="标记本节已完成">✓ 完成</button>'
      + '</div>';
    var st = document.createElement('style');
    st.textContent = '.nav-ver{margin-left:10px;font-size:11px;color:#9aa4b2;text-decoration:none;border:1px solid rgba(154,164,178,.35);border-radius:999px;padding:3px 9px;white-space:nowrap;transition:.15s}.nav-ver:hover{color:#60a5fa;border-color:#3b82f6}body[data-theme=light] .nav-ver{color:#64748b;border-color:rgba(100,116,139,.4)}body[data-theme=light] .nav-ver:hover{color:#2563eb;border-color:#2563eb}.nav-dd{position:relative}.nav-dd-btn{background:rgba(59,130,246,.14);border:1px solid rgba(59,130,246,.35);color:#9ecbff;font-size:13px;padding:6px 13px;border-radius:8px;cursor:pointer;font-family:inherit;white-space:nowrap}.nav-dd-btn:hover{background:rgba(59,130,246,.28);color:#fff}.nav-dd-panel{display:none;position:fixed;top:0;left:0;min-width:200px;max-height:70vh;overflow:auto;background:rgba(12,17,26,.94);border:1px solid rgba(140,190,255,.32);border-radius:16px;padding:10px;flex-direction:column;gap:3px;box-shadow:0 24px 60px rgba(0,0,0,.55);z-index:300;backdrop-filter:blur(20px) saturate(150%);transform-origin:top left;animation:ddPop .42s cubic-bezier(.34,1.56,.64,1) both}.nav-dd.open .nav-dd-panel{display:flex}.nav-dd.open .nav-dd-panel{left:8px !important;right:8px !important;top:56px !important;min-width:0}@keyframes ddPop{0%{opacity:0;transform:translateY(-10px) scale(.9)}55%{opacity:1;transform:translateY(3px) scale(1.03)}100%{opacity:1;transform:translateY(0) scale(1)}}.nav-dd-btn:active{animation:ddJelly .5s ease}@keyframes ddJelly{0%{transform:scale(1,1)}28%{transform:scale(.9,1.1)}55%{transform:scale(1.08,.92)}75%{transform:scale(.97,1.03)}100%{transform:scale(1,1)}}.nav-dd.open .nav-dd-panel{display:flex}.nav-dd-panel a{color:#aab8c8;font-size:13px;padding:8px 13px;border-radius:9px;text-decoration:none}.nav-dd-panel a:hover{background:rgba(88,166,255,.15);color:#fff}body[data-theme=light] .nav-dd-panel{background:rgba(255,255,255,.97);border-color:rgba(60,90,140,.2);box-shadow:0 20px 50px rgba(40,70,130,.2)}body[data-theme=light] .nav-dd-panel a{color:#475569}body[data-theme=light] .nav-dd-panel a:hover{background:rgba(37,99,235,.08);color:#0f172a}body[data-theme=light] .nav-dd-btn{background:rgba(37,99,235,.08);border-color:rgba(37,99,235,.25);color:#2563eb}';
    document.head.appendChild(st);
    nav.innerHTML = html;
    document.body.insertBefore(nav, document.body.firstChild);
    /* 下拉开合 + 点击外部关闭 */
    var dd = nav.querySelector(".nav-dd");
    if(dd){
      dd.querySelector(".nav-dd-btn").addEventListener("click", function(e){
        e.stopPropagation();
        var opening = !dd.classList.contains("open");
        dd.classList.toggle("open");
        if(opening){
          var r = dd.getBoundingClientRect();
          var pn = dd.querySelector(".nav-dd-panel");
          pn.style.top = (r.bottom + 10) + "px";
          pn.style.left = Math.max(10, Math.min(r.left, innerWidth - 220)) + "px";
        }
      });
      document.addEventListener("click", function(e){ if(!dd.contains(e.target)) dd.classList.remove("open"); });
    }

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
      + '<a href="' + root + '/index.html#version">版本历史</a>'
      + ' · 👀 <span id="busuanzi_value_site_pv">--</span> 次访问';
    document.body.appendChild(ft);
    /* 不蒜子访问统计：零后端、懒加载；脚本不可达时仅显示 "--"，不影响页面 */
    try{
      var bs = document.createElement("script");
      bs.async = true;
      bs.src = "https://busuanzi.ibruce.info/busuanzi/2.3/busuanzi.pure.mini.js";
      document.body.appendChild(bs);
    }catch(e){}

    if(P.pageId){
      var btn = document.querySelector(".nav-done");
      if(btn) btn.classList.toggle("on", !!getProgress()[P.pageId]);
    }
  }

  /* ---------- 结构化数据 JSON-LD(SEO):BreadcrumbList + FAQPage 富摘要 ---------- */
  function injectJsonLd(){
    var P = page();
    var arr = [];
    if(P.breadcrumb && P.breadcrumb.length){
      var base = location.origin + location.pathname.replace(/[^/]*$/, "") + "index.html";
      var items = [{ "@type":"ListItem", "position":1, "name":"首页", "item":base }];
      P.breadcrumb.forEach(function(b, i){
        items.push({ "@type":"ListItem", "position":i+2, "name":b.t, "item": b.u ? new URL(b.u, location.href).href : location.href });
      });
      arr.push({ "@context":"https://schema.org", "@type":"BreadcrumbList", "itemListElement":items });
    }
    /* FAQPage：扫描页面内 details.faq 折叠问答块(面试专题/FAQ/版本历史等页面自动生效) */
    var faqs = document.querySelectorAll("details.faq");
    if(faqs.length){
      var main = [];
      for(var i=0;i<faqs.length;i++){
        var s = faqs[i].querySelector("summary");
        var a = faqs[i].querySelector(".faq-a");
        if(s && a) main.push({ "@type":"Question", "name":s.textContent.trim().slice(0,300), "acceptedAnswer":{ "@type":"Answer", "text":a.textContent.trim().slice(0,3000) } });
      }
      if(main.length) arr.push({ "@context":"https://schema.org", "@type":"FAQPage", "mainEntity":main });
    }
    for(var j=0;j<arr.length;j++){
      var sc = document.createElement("script");
      sc.type = "application/ld+json";
      sc.textContent = JSON.stringify(arr[j]);
      document.head.appendChild(sc);
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
  /* 拼音/别名扩展:输入 xiebo 也能搜到"谐波",输入 foc 直达 FOC */
  var PINYIN = {
    "xiebo":"谐波","xingxing":"行星","b aixian":"摆线","jiansuqi":"减速器","dianji":"电机","mada":"马达",
    "qudong":"驱动","kongzhi":"控制","tongxin":"通信","ruanjian":"软件","yingjian":"硬件",
    "lingqiaoshou":"灵巧手","lingqiao":"灵巧","chuanganqi":"传感器","dianchi":"电池","rengongzhineng":"人工智能",
    "zhineng":"智能","shijie":"世界","moxing":"模型","bufa":"步态","pingheng":"平衡","daolibai":"倒立摆",
    "guanjie":"关节","zhengji":"整机","xiaobo":"谐波","beixi":"背隙","dianliu":"电流","sudu":"速度",
    "weizhi":"位置","youxi":"游戏","can":"CAN","foc":"FOC","pid":"PID","ros2":"ROS2","ros":"ROS2",
    "slam":"SLAM","vla":"VLA","wbc":"全身控制","mpc":"模型预测控制","imu":"IMU","ik":"逆运动学","fk":"正运动学",
    "urdf":"URDF","s2r":"sim2real","stl":"3D模型","dof":"自由度",
    "mianshi":"面试","fushi":"复试","baoyan":"保研","chuangguan":"闯关","freertos":"FreeRTOS","adrc":"ADRC",
    "dianceng":"电调","biandui":"编队","zikong":"自控","xiankong":"现控","yunsuanfangda":"运放"
  };
  function expandQuery(q){
    var parts = q.split(/\s+/), changed = false, out = [];
    for(var i = 0; i < parts.length; i++){
      var p = parts[i];
      var map = PINYIN[p];
      if(map){ out.push(map); changed = true; } else { out.push(p); }
    }
    return { q: out.join(" "), changed: changed };
  }
  function renderSearch(overlay, q){
    var box = overlay.querySelector(".search-results");
    q = (q || "").trim().toLowerCase();
    if(!q){
      box.innerHTML = '<div class="search-empty">输入关键词开始搜索 —— 支持 标题 / 板块 / 描述 / 术语,多个词用空格分隔<br>例如:FOC、谐波、ROS2、Isaac、VLA、灵巧手、编码器、CAN</div>';
      return;
    }
    var ex = expandQuery(q);
    var idx = buildIndex();
    var terms = ex.q.split(/\s+/).filter(function(t){ return t; });
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
      var r0 = page().root || "";
      box.innerHTML = '<div class="search-empty">没有找到与「' + esc(q) + '」相关的内容,换个词试试<br>' +
        '<a class="search-ai-link" href="' + (r0 ? r0 + "/" : "") + '08_学习工具/13_AI答疑助手.html?q=' + encodeURIComponent(q) + '">🤖 让 AI 答疑试试 →</a></div>';
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
  function aiPageURL(q){
    var root = page().root || "";
    return (root ? root + "/" : "") + "08_学习工具/13_AI答疑助手.html" + (q ? "?q=" + encodeURIComponent(q) : "");
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
          + '<div class="search-results"></div>'
          + '<div class="search-ai" title="跳转到 AI 答疑助手,自动带上当前关键词">🤖 没找到?带关键词去问 <b>AI 答疑助手</b> →</div></div>';
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
      var aiRow = overlay.querySelector(".search-ai");
      if(aiRow) aiRow.onclick = function(){
        var qv = input.value.trim();
        S.closeSearch();
        window.location.href = aiPageURL(qv);
      };
    });
  };
  S.closeSearch = function(){
    var o = document.getElementById("site-search-overlay");
    if(o) o.classList.remove("show");
  };

  /* ---------- 版本号(全站页脚使用,与 CHANGELOG 同步) ---------- */
  S.VERSION = "V2.1.4(2026-08-29)";

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
    b.title = "打印 / 导出 PDF"; b.setAttribute("aria-label","打印或导出PDF");
    b.onclick = function(){ window.print(); };
    nav.appendChild(b);
  }

  /* ---------- AI 内嵌聊天挂件(V2.1.3):面板直接问答,复用 ai-assistant.js 引擎 ---------- */
  function initAiFab(){
    if(page().pageId === "08-13") return;   /* AI 完整页自身不显示 */
    var root = page().root || "";
    [ "_assets/ai-assistant.js", "_assets/ai-fab-chat.js" ].forEach(function(f){
      var sc = document.createElement("script");
      sc.src = (root ? root + "/" : "") + f;
      sc.async = true;
      document.head.appendChild(sc);
    });
  }

  document.addEventListener("keydown", function(e){
    if((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")){
      e.preventDefault(); S.openSearch();
    }
    if(e.key === "Escape") S.closeSearch();
  });

  /* ---------- 玻璃设计系统:样式引入 + 卡片水波纹(V2.1.0) ---------- */
  function initGlass(){
    var root = page().root || "";
    if(!document.querySelector('link[href*="glass.css"]')){
      var l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = (root ? root + "/" : "") + "_assets/glass.css";
      document.head.appendChild(l);
    }
    /* 自检挂件(缺文件静默,不影响站点) */
    if(!document.querySelector('script[src*="site-selftest.js"]')){
      var st = document.createElement("script");
      st.src = (root ? root + "/" : "") + "_assets/site-selftest.js";
      st.async = true;
      st.onerror = function(){};
      document.body.appendChild(st);
    }
    document.addEventListener("pointerdown", function(e){
      var t = e.target;
      while(t && t !== document.body && !(t.classList && (t.classList.contains("card") || t.classList.contains("glass-ripple") || t.classList.contains("nav-dd-btn") || t.classList.contains("nav-search") || t.classList.contains("nav-theme")))) t = t.parentNode;
      if(!t || t === document.body || !t.classList) return;
      var r = t.getBoundingClientRect();
      var w = document.createElement("span");
      w.className = "glass-ripple-wave";
      var size = Math.max(r.width, r.height) * 2.6;
      w.style.width = w.style.height = size + "px";
      w.style.left = (e.clientX - r.left - size/2) + "px";
      w.style.top = (e.clientY - r.top - size/2) + "px";
      var w2 = w.cloneNode(true);                       /* 第二圈:延迟跟随,水面荡开感 */
      w2.style.animationDelay = ".13s";
      w2.style.opacity = ".55";
      t.appendChild(w); t.appendChild(w2);
      setTimeout(function(){ if(w.parentNode) w.remove(); if(w2.parentNode) w2.remove(); }, 1150);
    });
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", function(){ applyTheme(); injectChrome(); buildToc(); initBackTop(); S.initQuiz(); injectLearningGoals(); injectPageStamp(); initPrintBtn(); initGlass(); initAiFab(); initOnboarding(); initSW(); initAutoSave(); initTermTip(); initComments(); initKaTeX(); injectJsonLd(); });
  }else{
    applyTheme(); injectChrome(); buildToc(); initBackTop(); S.initQuiz(); injectLearningGoals(); injectPageStamp(); initPrintBtn(); initGlass(); initAiFab(); initOnboarding(); initSW(); initAutoSave(); initTermTip(); initComments(); initKaTeX(); injectJsonLd();
  }
})();
