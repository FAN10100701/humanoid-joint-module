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
  /* V2.1.15:板块条目改为首页对应板块锚点(此前「学习工具」等直达某子页,
     用户预期是回到首页对应板块;锚点在二级目录页拼接为 ../index.html#secN) */
  S.NAV = [
    { t:"首页",     u:"index.html" },
    { t:"3D解剖",   u:"index.html#sec0" },
    { t:"理论入门", u:"index.html#sec1" },
    { t:"硬件基础", u:"index.html#sec2" },
    { t:"项目实操", u:"index.html#sec3" },
    { t:"软件算法", u:"index.html#sec6" },
    { t:"前沿知识", u:"index.html#sec7" },
    { t:"学习工具", u:"index.html#sec8" },
    { t:"大模型",   u:"index.html#sec9" },
    { t:"NPU·IC",   u:"index.html#sec10" }
  ];

  /* 全站统计单源(V2.1.7):pages = site-sections.js 全部 pageId + 首页;
     ibSubjects/ibItems 必须与 ib-data-a/b/c 实际计数一致(一键自检.ps1 C3 校验)。
     改题库或增删页面时同步这里;新文案引用这里,别再写死数字 */
  S.STATS = { pages: 95, ibSubjects: 17, ibItems: 162, quizItems: 60 };

  function page(){ return window.PAGE || {}; }

  /* V2.1.12b:工具栏统一单色线性 SVG 图标(currentColor 随主题/状态变色),
     替换 emoji(🔍🖨️☀️🌙🧪 各自带彩色,与中性玻璃风格不统一) */
  var ICONS = {
    search: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20.3 20.3-4.2-4.2"/></svg>',
    print: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 8V3.5h10V8"/><rect x="3.5" y="8" width="17" height="8.5" rx="2"/><path d="M7 13.5h10v7H7z"/></svg>',
    sun: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.2 5.2l1.5 1.5M17.3 17.3l1.5 1.5M18.8 5.2l-1.5 1.5M6.7 17.3l-1.5 1.5"/></svg>',
    moon: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.2 13.6A8.2 8.2 0 1 1 10.4 3.8a6.6 6.6 0 0 0 9.8 9.8z"/></svg>'
  };

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
      /* V2.1.12b:单色 SVG 随主题切换(浅色显月亮=点击切深色,深色显太阳) */
      btns[i].innerHTML = (t === "light") ? ICONS.moon : ICONS.sun;
      btns[i].setAttribute("title", (t === "light") ? "切到深色风格" : "切到浅色风格(苹果透亮)");
    }
    var seg = document.querySelectorAll(".theme-seg button");
    for(var j = 0; j < seg.length; j++){
      seg[j].classList.toggle("on", seg[j].getAttribute("data-t") === t);
    }
  }
  /* V2.1.12:主题切换涟漪——自绘纯色圆层从按钮坐标扩散,盖满瞬间切主题再淡出。
     替代此前的 View Transitions 实现:VT 每次切换做两次全屏截图(低配机卡顿),
     且扩散边缘与旧画面有割裂感;自绘方案全浏览器一致、零截图开销。
     降级:prefers-reduced-motion / 无坐标时瞬时切换 */
  /* V2.1.12c:主题切换回归瞬时——涟漪扩散(自绘全屏圆层)在低端机/集成显卡上
     触发整页重绘+大层合成,切换明显卡顿,按用户反馈整个移除。
     保留 e 参数兼容既有 onclick="Site.setTheme('dark', event)" 接线 */
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
  /* V2.1.7:开放给闯关等页面复用,消除 humanoid-site-activity-v1 字面量副本 */
  S.logActivity = logActivity;
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
    var url = URL.createObjectURL(blob);
    a.href = url;
    a.download = "人形机器人学习进度-" + new Date().toISOString().slice(0,10) + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);   /* V2.1.14:用后释放(pagehide 自动导出频繁触发时不再累积) */
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

  /* ---------- 文档式目录侧边栏(DeepSeek 官方文档风) ----------
     V2.1.15 升级为两级可折叠目录树:h2=章节(可折叠分组),h3=知识点(子项),
     解决多内容页目录「一平到底堆到死」:
     · 页面没有任何 h3 时自动退化为旧版平铺列表(零回归)
     · 折叠状态按 pageId 记忆于 localStorage「site-toc-expand-v1」(C4 前缀白名单)
     · 滚动高亮自动展开高亮所在分组;标题行提供「展开/收起」一键全开全收 */
  function buildToc(){
    var P = page();
    if(!P.pageId) return;
    /* 仅对使用 site.css 的新页面生效(旧页面布局各异,不注入) */
    if(!document.querySelector('link[href*="site.css"]')) return;
    var hs = document.querySelectorAll('.container h2, .container h3');
    /* 2026-08-17:由 ≥2 放宽为 ≥1——3D 拆解页/实验台/项目清单等页面只有一个 h2 时
       也应显示左侧目录(否则「控件完全空白」),内容页有目录总比没有强 */
    if(hs.length < 1) return;
    /* 收集两级结构:h2 → {id,t,subs:[]},h3 归入其前方最近的 h2;
       控件容器内的 h3(FAQ 答案/自测题/表格/术语卡等)不算章节知识点 */
    function inWidget(el){
      return !!(el.closest && el.closest('details,.box,.quiz,.table-wrap,.term-card,.srs-card,.progress-panel,.giscus-wrap,.prevnext,.search-overlay'));
    }
    var items = [], heads = [], cur = null, n2 = 0, n3 = 0;
    for(var i = 0; i < hs.length; i++){
      var h = hs[i], isH3 = (h.tagName === 'H3');
      if(inWidget(h)) continue;
      var t = h.textContent.replace(/^\d+(\.\d+)*\s*/, '').trim();
      if(!t) continue;
      if(isH3){
        if(!h.id){ h.id = 'sec-' + n2 + '-' + (++n3); }
        heads.push({ el:h, id:h.id });
        if(cur){ cur.subs.push({ id:h.id, t:t }); }
        else { items.push({ id:h.id, t:t, subs:[] }); } /* 无前导 h2 的散置 h3:自己成组 */
        continue;
      }
      n2++; n3 = 0;
      if(!h.id){ h.id = 'sec-' + n2; }
      heads.push({ el:h, id:h.id });
      cur = { id:h.id, t:t, subs:[] };
      items.push(cur);
    }
    if(!items.length) return;
    var nested = false;
    for(var a = 0; a < items.length; a++){ if(items[a].subs.length){ nested = true; break; } }
    var aside = document.createElement('aside');
    aside.className = 'toc-sidebar';
    aside.id = 'tocSidebar';
    var html = '';
    if(!nested){
      /* 旧版平铺(无 h3 页面,零回归) */
      html = '<div class="toc-title">📑 本页目录</div><ul>';
      items.forEach(function(it){
        html += '<li><a href="#' + it.id + '" data-toc="' + it.id + '">' + it.t + '</a></li>';
      });
      html += '</ul>';
    }else{
      html = '<div class="toc-title">📑 本页目录<span class="toc-tools"><button type="button" class="toc-tool" data-act="all">展开</button><button type="button" class="toc-tool" data-act="none">收起</button></span></div><div class="toc-tree">';
      items.forEach(function(it){
        html += '<div class="toc-group" data-grp="' + it.id + '"><div class="toc-head">' +
          (it.subs.length ? '<button type="button" class="toc-caret" aria-label="展开或收起本节"></button>' : '<span class="toc-nocaret"></span>') +
          '<a href="#' + it.id + '" data-toc="' + it.id + '">' + it.t + '</a></div>';
        if(it.subs.length){
          html += '<ul class="toc-sub">';
          it.subs.forEach(function(s){
            html += '<li><a href="#' + s.id + '" data-toc="' + s.id + '">' + s.t + '</a></li>';
          });
          html += '</ul>';
        }
        html += '</div>';
      });
      html += '</div>';
    }
    aside.innerHTML = html;
    document.body.appendChild(aside);
    document.body.classList.add('has-toc');
    var btn = document.createElement('button');
    btn.className = 'toc-toggle';
    btn.textContent = '📑';
    btn.title = '目录';
    btn.onclick = function(){ aside.classList.toggle('open'); };
    document.body.appendChild(btn);
    /* 折叠状态:按 pageId 记忆;首次访问默认首组展开、其余收起 */
    var groups = nested ? aside.querySelectorAll('.toc-group') : [];
    var SKEY = 'site-toc-expand-v1';
    function loadState(){
      try{
        var all = JSON.parse(localStorage.getItem(SKEY) || '{}');
        return all[P.pageId] || null;
      }catch(e){ return null; }
    }
    function saveState(st){
      try{
        var all = {};
        try{ all = JSON.parse(localStorage.getItem(SKEY) || '{}') || {}; }catch(e2){ all = {}; }
        all[P.pageId] = st;
        localStorage.setItem(SKEY, JSON.stringify(all));
      }catch(e3){}
    }
    function applyState(st){
      for(var g = 0; g < groups.length; g++){
        var gid = groups[g].getAttribute('data-grp');
        if(st && typeof st[gid] !== 'undefined'){ groups[g].classList.toggle('collapsed', !st[gid]); }
        else { groups[g].classList.toggle('collapsed', g > 0); }
      }
    }
    if(nested){
      applyState(loadState());
      aside.addEventListener('click', function(ev){
        var t = ev.target;
        if(!t || !t.classList){ return; }
        if(t.classList.contains('toc-tool')){
          /* 一键全开/全收(写入记忆) */
          var expand = (t.getAttribute('data-act') === 'all'), st = {};
          for(var g = 0; g < groups.length; g++){
            groups[g].classList.toggle('collapsed', !expand);
            st[groups[g].getAttribute('data-grp')] = expand ? 1 : 0;
          }
          saveState(st);
          return;
        }
        var caret = (t.tagName === 'BUTTON' && t.classList.contains('toc-caret')) ? t : null;
        var grp = t.closest ? t.closest('.toc-group') : null;
        if(!grp){ return; }
        var collapsedNow = grp.classList.contains('collapsed');
        if(caret || collapsedNow){
          /* 点箭头:纯切换(收起⇄展开;V2.1.15b 修复——原写法 toggle(collapsedNow)
             在已收起时传 true、已展开时传 false,箭头永远不改变状态);
             点已收起的组标题:先展开再跳转 */
          grp.classList.toggle('collapsed', caret ? !collapsedNow : false);
          var st2 = loadState() || {};
          for(var g2 = 0; g2 < groups.length; g2++){ st2[groups[g2].getAttribute('data-grp')] = groups[g2].classList.contains('collapsed') ? 0 : 1; }
          saveState(st2);
        }
      });
    }
    /* 滚动高亮当前章节(h2+h3 统一按文档绝对位置,避免 offsetParent 偏移导致高亮错位) */
    var links = aside.querySelectorAll('a');
    var ownerOf = {};
    for(var g3 = 0; g3 < groups.length; g3++){ ownerOf[groups[g3].getAttribute('data-grp')] = groups[g3]; }
    if(nested){
      for(var a2 = 0; a2 < items.length; a2++){
        for(var b2 = 0; b2 < items[a2].subs.length; b2++){ ownerOf[items[a2].subs[b2].id] = groups[a2]; }
      }
    }
    function highlightToc(){
      var y = window.scrollY + 150, curId = null;
      for(var j = 0; j < heads.length; j++){
        var top = heads[j].el.getBoundingClientRect().top + window.scrollY;
        if(top <= y) curId = heads[j].id;
      }
      /* 滚动到底部时,高亮最后一个章节 */
      var docEnd = (document.documentElement.scrollHeight || document.body.scrollHeight) - window.innerHeight;
      if(y >= docEnd && heads.length){ curId = heads[heads.length - 1].id; }
      for(var k = 0; k < links.length; k++){
        if(links[k].getAttribute('data-toc') === curId){ links[k].classList.add('active'); }
        else { links[k].classList.remove('active'); }
      }
      /* 高亮进入折叠分组时自动展开(不写入记忆,其余分组保持手动收起) */
      if(curId && ownerOf[curId] && ownerOf[curId].classList.contains('collapsed')){
        ownerOf[curId].classList.remove('collapsed');
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
      /* V2.1.14:rAF 合并 + passive——此前每个滚动事件都同步写 style */
      if(initBackTop._t) return;
      initBackTop._t = true;
      requestAnimationFrame(function(){
        initBackTop._t = false;
        btn.style.display = window.scrollY > 600 ? 'flex' : 'none';
      });
    }, { passive: true });
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

  /* ---------- 全站图标链接:内容页 head 未写 favicon,按站点根统一注入 ----------
     顺序 ico→svg:支持 SVG 的现代浏览器取 svg(矢量清晰),老浏览器落回 ico;
     页面已静态声明图标(如首页)则跳过 */
  function initFavicon(){
    if(document.querySelector('link[rel~="icon"]')) return;
    var base = (page().root ? page().root + "/" : "");
    var ico = document.createElement("link");
    ico.rel = "icon"; ico.sizes = "48x48"; ico.href = base + "favicon.ico";
    document.head.appendChild(ico);
    var svg = document.createElement("link");
    svg.rel = "icon"; svg.type = "image/svg+xml"; svg.href = base + "favicon.svg";
    document.head.appendChild(svg);
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
    document.addEventListener("mouseup", function(e){
      /* V2.1.7:改用事件对象坐标——此前读 window.event,Firefox 无此全局,
         提示位置会退化到屏幕左上角 */
      var cx = e.clientX || 0, cy = e.clientY || 0;
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
          var x = cx;
          var y = cy;
          tip.style.left = Math.min(x + 14, window.innerWidth - 280) + "px";
          tip.style.top = (y + 16) + "px";
        });
      }, 10);
    });
    document.addEventListener("click", function(e){ if(tip && e.target !== tip) hide(); });
    window.addEventListener("scroll", hide);
    document.addEventListener("keydown", hide);
  }

  /* ---------- 讨论与反馈(V2.1.5 修版):站长邮箱内联单源,不再动态加载配置脚本 ----------
     旧版异步加载 giscus-config.js 再渲染卡片,脚本晚于 DOMContentLoaded 时
     window.COMMENTS_CONFIG 尚不存在,邮箱退化为纯文本"站长邮箱"且时有时无(竞态);
     现邮箱常量直接内联,零网络依赖、所有页面渲染结果一致 */
  var CONTACT_EMAIL = "2061624805@qq.com";
  function initComments(){
    if(!window.PAGE || !window.PAGE.pageId) return;   /* 首页不渲染 */
    function mount(){
      var mailto = '<a class="giscus-mail" href="mailto:' + CONTACT_EMAIL + '">' + CONTACT_EMAIL + '</a>';
      var box = document.createElement("div");
      box.className = "giscus-wrap";
      box.innerHTML = '<h2><span class="h2-num">✉</span> 讨论与反馈</h2>'
        + '<div class="box box-tip" style="margin-top:10px"><b>📮 联系站长:</b>欢迎邮件联系站长: ' + mailto + '。邮件请注明页面链接与问题描述,一般 1~2 天内回复。</div>';
      (document.querySelector(".container") || document.body).appendChild(box);
    }
    if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
    else mount();
  }

  /* ---------- KaTeX 公式渲染(元素 class="formula" 内为 LaTeX) ----------
     V2.1.7:KaTeX 全站唯一加载器,收敛单源。此前 site.js / ai-assistant.js /
     11_保研复试面试题库.html 三处各自实现且已漂移(AI 面板只剩 npmmirror 单源,
     且三处 katex.min.css 全部无回退,npmmirror 不可达时公式结构错乱)。
     KatexLoader.ensure(cb):JS 与 CSS 均按 npmmirror → jsdelivr → unpkg → cdnjs
     四级回退,首次调用才懒加载;四源全挂时 cb 仍会执行,调用方以 window.katex
     是否存在为准,不存在则保持 LaTeX 原文,不报错 */
  var KatexLoader = window.KatexLoader = (function(){
    var KV = "0.16.11";
    var JS_CDNS = [
      "https://registry.npmmirror.com/katex/" + KV + "/files/dist/katex.min.js",
      "https://cdn.jsdelivr.net/npm/katex@" + KV + "/dist/katex.min.js",
      "https://unpkg.com/katex@" + KV + "/dist/katex.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/katex/" + KV + "/katex.min.js"
    ];
    var CSS_CDNS = [
      "https://registry.npmmirror.com/katex/" + KV + "/files/dist/katex.min.css",
      "https://cdn.jsdelivr.net/npm/katex@" + KV + "/dist/katex.min.css",
      "https://unpkg.com/katex@" + KV + "/dist/katex.min.css",
      "https://cdnjs.cloudflare.com/ajax/libs/katex/" + KV + "/katex.min.css"
    ];
    var state = 0;                       /* 0 未加载 1 加载中 2 已完成(成功或全败) */
    var queue = [];                      /* ensure 的待派发回调 */
    function flush(){
      for(var i = 0; i < queue.length; i++){ try{ queue[i](); }catch(e){} }
      queue = [];
    }
    function loadCss(){
      (function css(i){
        if(i >= CSS_CDNS.length) return;
        var l = document.createElement("link");
        l.rel = "stylesheet";
        l.href = CSS_CDNS[i];
        l.onerror = function(){ css(i + 1); };
        document.head.appendChild(l);
      })(0);
    }
    function loadJs(){
      (function js(i){
        if(i >= JS_CDNS.length){ state = 2; flush(); return; }   /* 全败:由调用方保持原文 */
        var s = document.createElement("script");
        s.src = JS_CDNS[i];
        s.onload = function(){ if(window.katex){ state = 2; flush(); } else js(i + 1); };
        s.onerror = function(){ js(i + 1); };
        document.head.appendChild(s);
      })(0);
    }
    return {
      ensure: function(cb){
        if(state === 2){ cb(); return; }
        queue.push(cb);
        if(state === 0){
          state = 1;
          if(window.katex){ state = 2; flush(); return; }
          loadCss();
          loadJs();
        }
      }
    };
  })();

  function initKaTeX(){
    var els = document.querySelectorAll(".formula");
    if(!els.length) return;
    function renderAll(){
      for(var i = 0; i < els.length; i++){
        var el = els[i];
        try{ katex.render(el.getAttribute("data-src") || el.textContent, el, { throwOnError:false, displayMode:true }); }
        catch(e){ /* 保持原文 */ }
      }
    }
    if(window.katex){ renderAll(); return; }
    KatexLoader.ensure(renderAll);
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
    /* V2.1.14:去掉 index.html#sec9「大模型」——S.NAV 已含大模型条目,此前下拉里重复出现两次 */
    html += '<a href="' + root + '/08_学习工具/12_闯关学习.html">闯关学习</a>'
      + '<a href="' + root + '/08_学习工具/14_个人作品台.html">个人作品台</a>'
      + '</div></div></div>'
      /* V2.1.11:本页阅读进度环(窄屏隐藏) */
      + '<span class="nav-prog" title="本页阅读进度"><svg viewBox="0 0 36 36" width="22" height="22" aria-hidden="true">'
      + '<circle class="np-t" cx="18" cy="18" r="15.5"/>'
      + '<circle class="np-p" cx="18" cy="18" r="15.5" stroke-dasharray="97.4" stroke-dashoffset="97.4" transform="rotate(-90 18 18)"/>'
      + '</svg><i id="navProgTxt">0%</i></span>'
      + '<a class="nav-ver" href="' + root + '/index.html#version" title="版本与更新历史"><i class="ver-dot"></i>v' + (S.VERSION.split('(')[0] || '').replace('V','') + '</a>'
      /* V2.1.12c 工具区排序:同类相邻——版本胶囊 | 文字按钮(完成) | 图标三连(主题/搜索/打印) */
      + '<button class="nav-done" onclick="Site.toggleDone()" title="标记本节已完成">✓ 完成</button>'
      + '<button class="nav-theme" onclick="Site.toggleTheme(event)" title="切换亮/暗风格">☀️</button>'
      + '<button class="nav-search" onclick="Site.openSearch()" title="搜索 (Ctrl+K)" aria-label="搜索">' + ICONS.search + '</button>'
      /* 移动端板块入口(V2.1.7):<900px 时 .nav-links 整体隐藏,内容页此前无任何
         板块导航;汉堡按钮桌面端 display:none(site.css),零桌面影响 */
      + '<button class="nav-ham" type="button" aria-label="打开板块导航" aria-expanded="false">☰</button>'
      + '</div>';
    var st = document.createElement('style');
    /* V2.1.8:.nav-ver 样式迁至 site.css(首页静态顶栏共用),此处仅保留下拉与版本外样式 */
    st.textContent = '.nav-dd{position:relative}.nav-dd-btn{background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.14);color:#c9d1d9;font-size:13px;padding:6px 13px;border-radius:8px;cursor:pointer;font-family:inherit;white-space:nowrap;transition:.15s}.nav-dd-btn:hover{background:rgba(255,255,255,.13);border-color:rgba(255,255,255,.3);color:#fff}.nav-dd-panel{display:none;position:fixed;top:0;left:0;min-width:200px;max-height:70vh;overflow:auto;background:rgba(12,17,26,.94);border:1px solid rgba(140,190,255,.32);border-radius:16px;padding:10px;flex-direction:column;gap:3px;box-shadow:0 24px 60px rgba(0,0,0,.55);z-index:300;backdrop-filter:blur(20px) saturate(150%);transform-origin:top left;animation:ddPop .42s cubic-bezier(.34,1.56,.64,1) both}.nav-dd.open .nav-dd-panel{display:flex}.nav-dd.open .nav-dd-panel{left:8px !important;right:8px !important;top:56px !important;min-width:0}@keyframes ddPop{0%{opacity:0;transform:translateY(-10px) scale(.9)}55%{opacity:1;transform:translateY(3px) scale(1.03)}100%{opacity:1;transform:translateY(0) scale(1)}}.nav-dd-btn:active{animation:ddJelly .5s ease}@keyframes ddJelly{0%{transform:scale(1,1)}28%{transform:scale(.9,1.1)}55%{transform:scale(1.08,.92)}75%{transform:scale(.97,1.03)}100%{transform:scale(1,1)}}.nav-dd.open .nav-dd-panel{display:flex}.nav-dd-panel a{color:#aab8c8;font-size:13px;padding:8px 13px;border-radius:9px;text-decoration:none}.nav-dd-panel a:hover{background:rgba(88,166,255,.15);color:#fff}html:not([data-theme-early="dark"]) .nav-dd-panel{background:rgba(255,255,255,.97);border-color:rgba(60,90,140,.2);box-shadow:0 20px 50px rgba(40,70,130,.2)}html:not([data-theme-early="dark"]) .nav-dd-panel a{color:#475569}html:not([data-theme-early="dark"]) .nav-dd-panel a:hover{background:rgba(37,99,235,.08);color:#0f172a}html:not([data-theme-early="dark"]) .nav-dd-btn{background:rgba(37,99,235,.08);border-color:rgba(37,99,235,.25);color:#2563eb}';
    document.head.appendChild(st);
    nav.innerHTML = html;
    document.body.insertBefore(nav, document.body.firstChild);
    /* 移动端板块抽屉(V2.1.7):复用 site.css 的 .drawer 样式(与首页抽屉同款,
       含浅色主题变体),内容与「板块 ▾」下拉一致 */
    var ham = nav.querySelector(".nav-ham");
    if(ham){
      var drawer = document.createElement("div");
      drawer.className = "drawer";
      var dhtml = '<button class="drawer-close" type="button" aria-label="关闭导航">✕</button>';
      S.NAV.forEach(function(it){
        dhtml += '<a href="' + root + "/" + it.u + '">' + it.t + "</a>";
      });
      dhtml += '<a href="' + root + '/08_学习工具/12_闯关学习.html">闯关学习</a>'
        + '<a href="' + root + '/08_学习工具/14_个人作品台.html">个人作品台</a>';
      drawer.innerHTML = dhtml;
      document.body.appendChild(drawer);
      var closeDrawer = function(){
        drawer.classList.remove("open");
        ham.setAttribute("aria-expanded", "false");
      };
      ham.addEventListener("click", function(e){
        e.stopPropagation();
        var open = drawer.classList.toggle("open");
        ham.setAttribute("aria-expanded", open ? "true" : "false");
      });
      drawer.querySelector(".drawer-close").addEventListener("click", closeDrawer);
      drawer.addEventListener("click", function(e){
        if(e.target && e.target.tagName === "A") closeDrawer();
      });
      document.addEventListener("keydown", function(e){ if(e.key === "Escape") closeDrawer(); });
      /* 视口回到桌面宽度时自动收起(手机横屏/旋转平板的残留抽屉) */
      window.addEventListener("resize", function(){ if(window.innerWidth > 900) closeDrawer(); });
    }
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
    /* 不蒜子访问统计：零后端、懒加载；脚本不可达时移除节点、页脚保持 "--"，不影响页面 */
    try{
      var bs = document.createElement("script");
      bs.async = true;
      bs.src = "https://busuanzi.ibruce.info/busuanzi/2.3/busuanzi.pure.mini.js";
      bs.onerror = function(){ if(bs.parentNode) bs.parentNode.removeChild(bs); };
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
    "xiebo":"谐波","xingxing":"行星","baixian":"摆线","jiansuqi":"减速器","dianji":"电机","mada":"马达",
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
  S.VERSION = "V2.1.16(2026-09-05)";

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
    /* V2.1.12:页数从 SITE_SECTIONS 单源计算(与首页统计/C5 同口径);
       原先读异步的 search-index,未就绪时长期落到 fallback 35 */
    var nPages = 95;
    try{
      if(window.SITE_SECTIONS){
        var tk2 = 0;
        window.SITE_SECTIONS.forEach(function(sc2){ tk2 += (sc2.ids ? sc2.ids.length : 0); });
        nPages = tk2 + 1;
      }
    }catch(e2){}
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

  /* ---------- V2.1.11 顶栏阅读进度环(scroll rAF 节流) ---------- */
  function initScrollProgress(){
    var el = document.querySelector(".nav-prog .np-p");
    if(!el) return;
    var txt = document.getElementById("navProgTxt");
    var ticking = false;
    function update(){
      ticking = false;
      var h = document.documentElement.scrollHeight - window.innerHeight;
      var pct = h > 40 ? Math.min(100, Math.max(0, Math.round(window.scrollY / h * 100))) : 100;
      el.style.strokeDashoffset = (97.4 * (1 - pct / 100)).toFixed(1);
      if(txt) txt.textContent = pct + "%";
    }
    window.addEventListener("scroll", function(){
      if(!ticking){ ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  /* ---------- V2.1.11 卡片滚动错峰入场:只挂初始视口外的 .grid>.card;
     V2.1.12 修正:同一批进入视口的卡片按屏幕位置自上而下排序后依次播放,
     节奏整齐不再随机跳序;JS 不可用时不加 hold、一切如旧 ---------- */
  function initReveal(){
    var els = [];
    try{
      var all = document.querySelectorAll(".grid > .card");
      for(var i = 0; i < all.length; i++){
        if(all[i].getBoundingClientRect().top > window.innerHeight + 40) els.push(all[i]);
      }
    }catch(e){ return; }
    if(!els.length || !("IntersectionObserver" in window)) return;
    var reduce = false;
    try{ reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches; }catch(e){}
    if(reduce) return;
    var io = new IntersectionObserver(function(entries){
      var coming = [];
      for(var i = 0; i < entries.length; i++){
        if(entries[i].isIntersecting) coming.push(entries[i].target);
      }
      if(!coming.length) return;
      coming.sort(function(a, b){ return a.getBoundingClientRect().top - b.getBoundingClientRect().top; });
      for(var j = 0; j < coming.length; j++){
        (function(el, idx){
          io.unobserve(el);
          setTimeout(function(){
            el.classList.remove("rv-hold");
            el.style.animation = "fadeUp .4s cubic-bezier(.2,.8,.3,1.05) both";
          }, idx * 40);
        })(coming[j], j);
      }
    }, { rootMargin: "0px 0px -8% 0px" });
    els.forEach(function(el){ el.classList.add("rv-hold"); io.observe(el); });
  }

  /* ---------- V2.1.12 顶栏按钮磁吸(hover 时按钮向鼠标微移 ≤3px,离开回弹) ---------- */
  function initMagnet(){
    if(!window.matchMedia || !matchMedia("(hover:hover) and (pointer:fine)").matches) return;
    try{ if(matchMedia("(prefers-reduced-motion: reduce)").matches) return; }catch(e){}
    var st = document.createElement("style");
    st.textContent = ".topnav .nav-search,.topnav .nav-theme,.topnav .nav-done,.topnav .nav-print,.topnav .nav-dd-btn,.topnav .nav-sst{transition:transform .2s cubic-bezier(.2,.8,.3,1.15),background-color .15s,border-color .15s,color .15s}";
    document.head.appendChild(st);
    var sel = ".nav-search,.nav-theme,.nav-done,.nav-print,.nav-sst,.nav-dd-btn";
    var btns = document.querySelectorAll(".topnav " + sel);
    for(var i = 0; i < btns.length; i++){
      (function(b){
        if(b.__mag) return;
        b.__mag = true;
        b.addEventListener("pointermove", function(e){
          var r = b.getBoundingClientRect();
          var dx = (e.clientX - r.left - r.width / 2) / (r.width / 2);
          var dy = (e.clientY - r.top - r.height / 2) / (r.height / 2);
          b.style.transform = "translate(" + (dx * 3).toFixed(1) + "px," + (dy * 2.5).toFixed(1) + "px)";
        });
        b.addEventListener("pointerleave", function(){ b.style.transform = ""; });
      })(btns[i]);
    }
  }

  /* ---------- 打印按钮(导航右侧) ---------- */
  function initPrintBtn(){
    var nav = document.querySelector(".topnav .nav-inner");
    if(!nav) return;
    var b = document.createElement("button");
    b.className = "nav-print";
    b.innerHTML = ICONS.print;
    b.title = "打印 / 导出 PDF"; b.setAttribute("aria-label","打印或导出PDF");
    b.onclick = function(){ window.print(); };
    /* V2.1.12c:插到搜索按钮后(图标三连聚在一起,汉堡保持最右) */
    var search = nav.querySelector(".nav-search");
    if(search && search.nextSibling) nav.insertBefore(b, search.nextSibling);
    else nav.appendChild(b);
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

  /* V2.1.14:初始化链逐项 try-catch 隔离——此前串行裸调用,任一上游抛错
     (第三方脚本污染/未来改动引入)会连带丢失 SW 注册/自动保存/自检挂件等全部下游 */
  var INIT_CHAIN = [
    initFavicon, applyTheme, injectChrome, buildToc, initBackTop, S.initQuiz,
    injectLearningGoals, injectPageStamp, initPrintBtn, initGlass, initAiFab,
    initOnboarding, initSW, initAutoSave, initTermTip, initComments,
    initKaTeX, injectJsonLd, initScrollProgress, initReveal, initMagnet
  ];
  function bootSite(){
    for(var i = 0; i < INIT_CHAIN.length; i++){
      try{ INIT_CHAIN[i](); }
      catch(err){ try{ console.warn("[site] 初始化项失败(已隔离,不影响其余功能):", (INIT_CHAIN[i].name || "anonymous"), err); }catch(e2){} }
    }
  }
  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", bootSite);
  }else{
    bootSite();
  }
})();
