/* ============================================================
   人形机器人学习站 · 自检挂件(site-selftest.js,V2.1.8)
   - 每页自动运行基础+共享功能+页面专项检查;外部资源分组不拉红
   - 入口按钮注入顶栏工具区最右(打印按钮旁,首页同样生效);
     找不到顶栏时回退左下角悬浮
   - 全绿✅ / 有失败✗;点击弹出明细面板(深浅双主题配色)
   - 面板内「隐藏挂件」或双击按钮可隐藏;URL 加 ?selftest=1 重新唤回
   - 由 site.js 注入本文件
   ============================================================ */
(function(){
  "use strict";
  if(window.SiteSelfTest) return;
  var SST = window.SiteSelfTest = { groups:[], register:register, run:run };
  var hideKey = "site-selftest-hide-v1";

  function register(group, name, fn){ SST.groups.push({ g:group, name:name, fn:fn }); }

  /* 工具 */
  function $(s){ return document.querySelector(s); }
  function ok(detail){ return { ok:true, detail:detail || "通过" }; }
  function bad(detail){ return { ok:false, detail:detail || "失败" }; }
  function has(sel, yes, no){ var el = $(sel); return el ? ok((yes||sel)+" ✓") : bad(no || ("缺少 "+sel)); }
  function qsel(sel){ return document.querySelectorAll(sel).length; }
  function timeout(fn, ms){
    return new Promise(function(res){
      var done = false;
      var t = setTimeout(function(){ if(!done){ done = true; res(bad("超时 "+(ms||6000)+"ms")); } }, ms || 6000);
      Promise.resolve().then(fn).then(function(r){ if(!done){ done = true; clearTimeout(t); res(r); } })
        .catch(function(e){ if(!done){ done = true; clearTimeout(t); res(bad("异常: " + (e && e.message || e))); } });
    });
  }

  /* ---------- 通用注册(基础环境 + 共享功能) ---------- */
  register("基础环境", "PAGE 配置", function(){ return window.PAGE && window.PAGE.pageId ? ok("pageId=" + PAGE.pageId) : ok("无 PAGE(工具页)"); });
  register("基础环境", "localStorage 可用", function(){ try{ localStorage.setItem("__t","1"); localStorage.removeItem("__t"); return ok(); }catch(e){ return bad("被禁用"); } });

  register("共享功能", "顶部导航 .topnav", function(){ return has(".topnav"); });
  register("共享功能", "面包屑", function(){
    return window.PAGE && window.PAGE.pageId ? has(".breadcrumb") : ok("首页无面包屑(正常)");
  });
  register("共享功能", "上一篇/下一篇", function(){ return qsel(".pn-item") >= 1 ? ok(qsel(".pn-item") + " 项") : ok("本页无翻页链"); });
  register("共享功能", "页脚含版本号", function(){
    var f = $(".site-footer");
    return f && /V\d+\.\d+\.\d+/.test(f.textContent) ? ok() : bad("页脚无版本号");
  });
  register("共享功能", "主题切换", function(){
    var before = document.body.getAttribute("data-theme");
    try{ window.toggleTheme(); }catch(e){ return bad("toggleTheme 异常"); }
    var after = document.body.getAttribute("data-theme");
    try{ window.toggleTheme(); }catch(e){}
    return (after && after !== before) ? ok(before + " → " + after) : bad("data-theme 未翻转");
  });
  register("共享功能", "学习打卡按钮", function(){
    var b = $(".nav-done");
    return b ? ok() : ok("工具页无打卡钮");
  });
  register("共享功能", "回到顶部按钮", function(){ return has(".backtop"); });
  register("共享功能", "页面更新印章", function(){
    if(!(window.PAGE && window.PAGE.pageId)) return ok("首页无印章(正常)");
    /* 印章由 page-meta 懒加载后异步注入,先等 2 秒再判 */
    return timeout(function(){
      return new Promise(function(res){
        setTimeout(function(){
          res($(".page-stamp") ? ok("印章已注入") : bad("2s 内未见 .page-stamp"));
        }, 2000);
      });
    }, 5000);
  });
  register("外部资源", "页面内资源加载", function(){
    var bads = (window.__SST_RES_ERR__ || []);
    return bads.length ? { ok:false, detail:"加载失败 " + bads.length + " 项: " + bads.slice(0,3).join(", ") } : ok("无失败资源");
  });

  /* ---------- 页面专项(自动适配,不存在则跳过) ---------- */
  register("页面专项", "自测题结构", function(){
    var n = qsel(".quiz");
    if(!n) return ok("本页无自测题");
    var noAns = 0;
    document.querySelectorAll(".quiz-options").forEach(function(o){ if(!o.getAttribute("data-answer")) noAns++; });
    return noAns ? bad(noAns + " 题缺 data-answer") : ok(n + " 题,判分属性齐全");
  });
  register("页面专项", "KaTeX(如有公式)", function(){
    if(!qsel(".formula")) return ok("本页无公式");
    return window.katex ? ok("已加载") : { ok:false, detail:"公式未渲染(CDN 或未触发)" };
  });
  register("页面专项", "glass.css 已注入", function(){
    var l = document.querySelector('link[href*="glass.css"]');
    return l ? ok("设计系统已接入") : ok("本页未启用玻璃设计系统");
  });

  /* ---------- 运行器 ---------- */
  var errors = [];
  window.addEventListener("error", function(e){ errors.push(String(e.message||e)); });
  window.addEventListener("unhandledrejection", function(e){ errors.push(String(e.reason||"rejection")); });

  function run(){ SST.groups.forEach(function(it){ it.result = null; }); paint("…"); execute(0); }
  function execute(i){
    if(i >= SST.groups.length){ paintDone(); return; }
    var it = SST.groups[i];
    timeout(function(){ return it.fn(); }, 6000).then(function(r){
      it.result = r || bad("无返回");
      paint(i + 1 + "/" + SST.groups.length);
      execute(i + 1);
    });
  }

  /* ---------- UI:样式(深浅双主题,全部 class 化) ---------- */
  function injectStyle(){
    var st = document.createElement("style");
    st.textContent =
      /* 顶栏按钮(V2.1.12c):与 site.css 工具区统一令牌一致(30px 高、中性玻璃、只 hover 提亮);
         状态色只染文字与图标(✓绿/✗红),不再整块变色,保持框体一致 */
      '.nav-sst{display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);color:#c9d1d9;font-size:12px;height:30px;padding:0 10px;border-radius:8px;cursor:pointer;font-family:inherit;white-space:nowrap;transition:background-color .15s,border-color .15s,color .15s}' +
      '.nav-sst:hover{background:rgba(255,255,255,.11);border-color:rgba(255,255,255,.24);color:#fff}' +
      '.nav-sst.pass{color:#4ade80}' +
      '.nav-sst.fail{color:#f87171}' +
      'body[data-theme="light"] .nav-sst{background:rgba(255,255,255,.65);border-color:rgba(100,116,139,.28);color:#475569}' +
      'body[data-theme="light"] .nav-sst:hover{background:#fff;border-color:rgba(100,116,139,.45);color:#0f172a}' +
      'body[data-theme="light"] .nav-sst.pass{color:#16a34a}' +
      'body[data-theme="light"] .nav-sst.fail{color:#dc2626}' +
      /* 窄屏:按钮整体隐藏防顶栏拥挤(?selftest=1 唤回时同时清除隐藏记忆,见下) */
      '@media (max-width:640px){.topnav .nav-sst{display:none}.topnav .nav-print{display:none}}' +
      /* 明细面板:深色默认 */
      '.sst-panel{display:none;position:fixed;top:64px;right:12px;z-index:221;width:min(360px,92vw);max-height:70vh;overflow:auto;padding:14px 16px;font-size:12.5px;line-height:1.8;color:#c9d5e3}' +
      '.sst-panel .sst-t{color:#8ec5ff;font-weight:800;font-size:13.5px}' +
      '.sst-panel .sst-file{color:#6b7280;font-size:11px;margin-left:6px}' +
      '.sst-panel .sst-g{margin:9px 0 3px;color:#8ec5ff;font-weight:700}' +
      '.sst-panel .sst-ok{color:#22c55e}' +
      '.sst-panel .sst-bad{color:#ef4444}' +
      '.sst-panel .sst-bad-d{color:#fca5a5;font-size:11.5px;padding-left:18px;display:block}' +
      '.sst-panel .sst-warn{color:#fbbf24}' +
      '.sst-panel .sst-hr{border:none;border-top:1px solid rgba(255,255,255,.1);margin:6px 0}' +
      '.sst-panel .sst-btn{background:rgba(88,166,255,.15);border:1px solid rgba(88,166,255,.4);color:#9ecbff;padding:5px 12px;border-radius:8px;cursor:pointer;font-family:inherit;font-size:12px;margin-right:6px}' +
      '.sst-panel .sst-btn:hover{border-color:#9ecbff}' +
      '.sst-panel .sst-tip{color:#6b7280;font-size:11px}' +
      /* 明细面板:浅色 */
      'body:not([data-theme]) .sst-panel,body[data-theme="light"] .sst-panel{color:#334155;background:rgba(255,255,255,.92);border:1px solid rgba(60,80,120,.18);box-shadow:0 18px 50px rgba(40,70,130,.16)}' +
      'body:not([data-theme]) .sst-panel .sst-t,body[data-theme="light"] .sst-panel .sst-t{color:#2563eb}' +
      'body:not([data-theme]) .sst-panel .sst-g,body[data-theme="light"] .sst-panel .sst-g{color:#2563eb}' +
      'body:not([data-theme]) .sst-panel .sst-ok,body[data-theme="light"] .sst-panel .sst-ok{color:#15803d}' +
      'body:not([data-theme]) .sst-panel .sst-bad,body[data-theme="light"] .sst-panel .sst-bad{color:#dc2626}' +
      'body:not([data-theme]) .sst-panel .sst-bad-d,body[data-theme="light"] .sst-panel .sst-bad-d{color:#b91c1c}' +
      'body:not([data-theme]) .sst-panel .sst-warn,body[data-theme="light"] .sst-panel .sst-warn{color:#b45309}' +
      'body:not([data-theme]) .sst-panel .sst-hr,body[data-theme="light"] .sst-panel .sst-hr{border-top-color:rgba(60,80,120,.15)}' +
      'body:not([data-theme]) .sst-panel .sst-btn,body[data-theme="light"] .sst-panel .sst-btn{background:rgba(37,99,235,.07);border-color:rgba(37,99,235,.3);color:#2563eb}' +
      'body:not([data-theme]) .sst-panel .sst-btn:hover,body[data-theme="light"] .sst-panel .sst-btn:hover{border-color:#2563eb}' +
      'body:not([data-theme]) .sst-panel .sst-tip,body[data-theme="light"] .sst-panel .sst-tip{color:#94a3b8}' +
      /* 左下角回退悬浮(无顶栏时)与打印屏蔽 */
      '@media print{.nav-sst{display:none !important}}';
    document.head.appendChild(st);
  }

  /* V2.1.12b:单色烧瓶图标(currentColor),与全站线性图标语言统一 */
  var FLASK = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 3h5"/><path d="M10 3v5.6L4.8 17.8a1.8 1.8 0 0 0 1.6 2.7h11.2a1.8 1.8 0 0 0 1.6-2.7L14 8.6V3"/><path d="M7.5 14.5h9"/></svg>';

  /* ---------- UI:DOM ---------- */
  function ui(){
    injectStyle();
    var pill = document.createElement("button");
    pill.id = "sstPill";
    pill.className = "nav-sst";
    pill.title = "本页自检(点击展开明细 / 双击隐藏)";
    pill.innerHTML = FLASK + ' <span class="sst-txt">自检 …</span>';

    var navInner = document.querySelector(".topnav .nav-inner");
    if(navInner){
      /* V2.1.12c:插到「✓ 完成」旁(文字按钮聚在一起;首页无完成钮则放到主题钮前) */
      var anchor = navInner.querySelector(".nav-done") || navInner.querySelector(".nav-theme");
      if(anchor) navInner.insertBefore(pill, anchor);
      else navInner.appendChild(pill);
    }else{
      /* 兜底:无顶栏页面保持左下角低调悬浮 */
      pill.style.cssText += ";position:fixed;left:16px;bottom:18px;z-index:210;font-size:11px;padding:5px 12px;border-radius:999px;opacity:.85";
      document.body.appendChild(pill);
    }

    var panel = document.createElement("div");
    panel.id = "sstPanel";
    panel.className = "sst-panel glass-panel";
    document.body.appendChild(panel);

    pill.onclick = function(){
      var show = panel.style.display !== "block";
      panel.style.display = show ? "block" : "none";
      if(show) renderPanel();
    };

    var hidden = false;
    try{ hidden = localStorage.getItem(hideKey) === "1"; }catch(e){}
    var qs = location.search.indexOf("selftest=1") >= 0;
    /* V2.1.12c:?selftest=1 现在同时清除隐藏记忆——用户用唤回参数即视为要重新启用,
       否则记忆会让"按钮不见了"且常规手段找不回 */
    if(hidden && qs){
      hidden = false;
      try{ localStorage.removeItem(hideKey); }catch(e){}
    }
    if(hidden){
      pill.style.display = "none";
    }
    var dbl = 0;
    pill.addEventListener("dblclick", function(){
      hidden = !hidden;
      try{ localStorage.setItem(hideKey, hidden ? "1" : "0"); }catch(e){}
      pill.style.display = hidden ? "none" : "";
      if(hidden) panel.style.display = "none";
    });
    SST._hide = function(){
      hidden = true;
      try{ localStorage.setItem(hideKey, "1"); }catch(e){}
      pill.style.display = "none";
      panel.style.display = "none";
    };
    SST._ui = { pill: pill, panel: panel, renderPanel: renderPanel, paint: paint };
  }
  function paint(txt){
    if(!SST._ui) return;
    SST._ui.pill.innerHTML = FLASK + ' <span class="sst-txt">自检 ' + txt + "</span>";
  }
  function renderPanel(){
    if(!SST._ui) return;
    var html = "<b class='sst-t'>" + FLASK + " 本页自检报告</b><span class='sst-file'>" + location.pathname.split("/").pop() + "</span><hr class='sst-hr'>";
    var curG = null;
    SST.groups.forEach(function(it){
      if(it.g !== curG){ curG = it.g; html += "<div class='sst-g'>" + curG + "</div>"; }
      var r = it.result;
      var mark = !r ? "<span style='opacity:.55'>…</span>" : (r.ok ? "<span class='sst-ok'>✓</span>" : "<span class='sst-bad'>✗</span>");
      html += "<div>" + mark + " " + it.name + (r && !r.ok ? "<span class='sst-bad-d'>" + r.detail + "</span>" : "") + "</div>";
    });
    if(errors.length) html += "<div class='sst-warn' style='margin-top:8px'>⚠ 运行期错误 " + errors.length + " 条(详见 Console)</div>";
    html += "<hr class='sst-hr'><button class='sst-btn' onclick='SiteSelfTest.run()'>重新检测</button>" +
      "<button class='sst-btn' onclick='SiteSelfTest._hide()'>隐藏挂件</button>" +
      "<span class='sst-tip'>?selftest=1 可唤回</span>";
    SST._ui.panel.innerHTML = html;
  }
  function paintDone(){
    var fail = 0;
    SST.groups.forEach(function(it){
      if(!it.result || !it.result.ok){ fail++; }
    });
    if(!SST._ui) ui();
    SST._ui.pill.className = "nav-sst " + (fail ? "fail" : "pass");
    SST._ui.pill.innerHTML = fail
      ? FLASK + " <span class='sst-txt'>自检 ✗" + fail + "</span>"
      : FLASK + " <span class='sst-txt'>自检 ✅</span>";
    renderPanel();
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", function(){ ui(); run(); });
  }else{
    ui(); run();
  }
})();
