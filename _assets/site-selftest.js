/* ============================================================
   人形机器人学习站 · 右上角自检挂件(site-selftest.js,V2.1.0)
   - 每页自动运行基础+共享功能+页面专项检查;外部资源分组不拉红
   - 全绿✅绿 / 有失败❌红;点击展开明细;隐藏记忆 localStorage
   - URL 加 ?selftest=1 可重新唤回;由 site.js 注入本文件
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
  register("共享功能", "面包屑 .breadcrumb", function(){ return has(".breadcrumb"); });
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
  register("共享功能", "页面更新印章", function(){ return has(".page-stamp", "印章已注入"); });
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
  register("页面专项", "玻璃挂件自启", function(){ return has(".glass", "设计系统样式已注入") ; });

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

  /* ---------- UI 挂件 ---------- */
  function ui(){
    var pill = document.createElement("div");
    pill.id = "sstPill";
    pill.style.cssText = "position:fixed;top:64px;right:12px;z-index:220;font-size:12px;padding:7px 14px;border-radius:999px;cursor:pointer;font-family:inherit;color:#eef; background:rgba(34,197,94,.85);box-shadow:0 6px 20px rgba(0,0,0,.3);backdrop-filter:blur(8px)";
    pill.title = "本页自检(点击展开明细)";
    pill.textContent = "🧪 自检 …";
    document.body.appendChild(pill);

    var panel = document.createElement("div");
    panel.id = "sstPanel";
    panel.style.cssText = "display:none;position:fixed;top:100px;right:12px;z-index:221;width:min(360px,92vw);max-height:70vh;overflow:auto;background:rgba(10,14,24,.94);border:1px solid rgba(140,190,255,.3);border-radius:14px;padding:14px 16px;color:#dbe6f5;font-size:12.5px;line-height:1.8;backdrop-filter:blur(14px)";
    document.body.appendChild(panel);

    pill.onclick = function(){ panel.style.display = panel.style.display === "none" ? "block" : "none"; renderPanel(); };

    var hidden = false;
    try{ hidden = localStorage.getItem(hideKey) === "1"; }catch(e){}
    var qs = location.search.indexOf("selftest=1") >= 0;
    if(hidden && !qs){ pill.style.display = "none"; panel.style.display = "none"; }
    var dbl = 0;
    pill.addEventListener("dblclick", function(){
      hidden = !hidden;
      try{ localStorage.setItem(hideKey, hidden ? "1" : "0"); }catch(e){}
      pill.style.display = hidden ? "none" : "block";
      if(hidden) panel.style.display = "none";
    });
    SST._ui = { pill: pill, panel: panel, renderPanel: renderPanel, paint: paint };
  }
  function paint(txt){
    if(!SST._ui) return;
    SST._ui.pill.textContent = "🧪 自检 " + txt;
  }
  function renderPanel(){
    if(!SST._ui) return;
    var html = "<b style='color:#8ec5ff'>🧪 本页自检报告</b><br><span style='color:#8b98a9;font-size:11.5px'>" + location.pathname.split("/").pop() + "</span><hr style='border-color:rgba(255,255,255,.1)'>";
    var curG = null;
    SST.groups.forEach(function(it){
      if(it.g !== curG){ curG = it.g; html += "<div style='margin:8px 0 2px;color:#8ec5ff;font-weight:700'>" + curG + "</div>"; }
      var r = it.result;
      var mark = !r ? "<span style='color:#6b7280'>…</span>" : (r.ok ? "<span style='color:#22c55e'>✓</span>" : "<span style='color:#ef4444'>✗</span>");
      html += "<div>" + mark + " " + it.name + (r && !r.ok ? "<br><span style='color:#fca5a5;font-size:11.5px;padding-left:18px'>" + r.detail + "</span>" : "") + "</div>";
    });
    if(errors.length) html += "<div style='margin-top:8px;color:#fbbf24'>⚠ 运行期错误 " + errors.length + " 条(详见 Console)</div>";
    html += "<div style='margin-top:10px'><button onclick='SiteSelfTest.run()' style='background:rgba(88,166,255,.15);border:1px solid rgba(88,166,255,.4);color:#9ecbff;padding:5px 12px;border-radius:8px;cursor:pointer;font-family:inherit;font-size:12px'>重新检测</button> <span style='color:#6b7280;font-size:11px'>双击挂件可隐藏</span></div>";
    SST._ui.panel.innerHTML = html;
  }
  function paintDone(){
    var fail = 0, warn = 0;
    SST.groups.forEach(function(it){
      if(!it.result || !it.result.ok){ fail++; }
    });
    if(!SST._ui) ui();
    SST._ui.pill.style.background = fail ? "rgba(239,68,68,.88)" : "rgba(34,197,94,.85)";
    SST._ui.pill.textContent = fail ? "🧪 自检 ✗ " + fail + " 项" : "🧪 自检 ✅ 全绿";
    renderPanel();
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", function(){ ui(); run(); });
  }else{
    ui(); run();
  }
})();
