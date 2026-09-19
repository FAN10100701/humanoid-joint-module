/* ============================================================
   人形机器人学习站 · 电子教科书阅读模式  _assets/reader.js
   (批次三;site.js initReader 加载口按页注入,首页/3D 主页不注入)
   - 沉浸:收起顶栏/目录/面包屑/翻页/页脚/AI 球/回顶/学习目标
   - 字号:容器 zoom 三档(A− / A+),全站内容同步缩放
   - 书签:阅读中滚动位置按页自动记忆,重进自动回到上次位置
   - 连读:底部常驻「下一篇 →」胶囊,沿 prevnext 链连续阅读
   - 存储:site-reader-v1(Site.store 版本化;混布窗口内置兜底)
   - Esc 退出;打印自动隐藏悬浮件;类名 site-reading / reader- 前缀
   ============================================================ */
(function(){
  "use strict";
  if(window.__SiteReaderLoaded) return;
  window.__SiteReaderLoaded = true;

  var P = window.PAGE || {};
  if(!P.pageId) return;                       /* 与打卡/笔记同口径:无 pageId 不注入 */
  var S = window.Site || {};
  var toast = function(m, ms){ if(S.toast) S.toast(m, ms); };

  var KEY = "site-reader-v1";
  var ZOOMS = [1, 1.15, 1.3];
  function load(){
    var d = null;
    if(S.store && S.store.get){ d = S.store.get(KEY); }
    else{ try{ d = JSON.parse(localStorage.getItem(KEY) || "null"); }catch(e){ d = null; } }
    if(!d || typeof d !== "object" || typeof d.on !== "boolean") d = { version: 1, on: false, zoom: 1, pages: {} };
    if(!d.pages || typeof d.pages !== "object") d.pages = {};
    return d;
  }
  function save(d){
    d.version = 1;
    if(S.store && S.store.set) return S.store.set(KEY, d);
    try{ localStorage.setItem(KEY, JSON.stringify(d)); return true; }catch(e){ return false; }
  }

  var st = load();
  var zoomIdx = 0, i;
  for(i = 0; i < ZOOMS.length; i++){ if(Math.abs(ZOOMS[i] - (st.zoom || 1)) < 0.01) zoomIdx = i; }
  var container = null, bar = null, pill = null, btn = null, saveT = 0;

  function el(tag, cls, text){ var e = document.createElement(tag); if(cls) e.className = cls; if(text != null) e.textContent = text; return e; }

  var STYLE = ''
    + '.nav-reader{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);color:#c9d1d9;height:30px;width:34px;padding:0;border-radius:8px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background-color .15s,border-color .15s,color .15s,transform .2s cubic-bezier(.2,.8,.3,1.15);flex-shrink:0}'
    + '.nav-reader:hover{background:rgba(255,255,255,.11);border-color:rgba(255,255,255,.24);color:#fff}'
    + 'html:not([data-theme-early="dark"]) .nav-reader{background:rgba(255,255,255,.65);border-color:rgba(100,116,139,.28);color:#475569}'
    + 'html:not([data-theme-early="dark"]) .nav-reader:hover{background:rgba(37,99,235,.1);border-color:rgba(37,99,235,.35);color:#2563eb}'
    + '.nav-reader.on{background:rgba(88,166,255,.22);border-color:rgba(88,166,255,.5);color:#cfe6ff}'
    + 'html:not([data-theme-early="dark"]) .nav-reader.on{background:rgba(37,99,235,.14);border-color:rgba(37,99,235,.45);color:#1d4ed8}'
    + 'body.site-reading .topnav,body.site-reading .toc-sidebar,body.site-reading .toc-toggle,body.site-reading .breadcrumb,body.site-reading .prevnext,body.site-reading .site-footer,body.site-reading .ai-fab,body.site-reading .ai-fab-panel,body.site-reading .backtop,body.site-reading .page-head .tags,body.site-reading .key-point{display:none!important}'
    + '.reader-bar{position:fixed;top:10px;right:12px;z-index:300;display:none;align-items:center;gap:5px;padding:5px 6px;border-radius:10px;background:rgba(12,17,26,.88);border:1px solid rgba(140,190,255,.28);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}'
    + 'html:not([data-theme-early="dark"]) .reader-bar{background:rgba(255,255,255,.92);border-color:rgba(60,90,140,.2);box-shadow:0 10px 30px rgba(40,70,130,.18)}'
    + '.reader-bar button{font-size:12px;padding:5px 10px;border-radius:7px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.05);color:#c9d1d9;cursor:pointer;font-family:inherit;white-space:nowrap}'
    + '.reader-bar button:hover{border-color:#58a6ff;color:#fff}'
    + 'html:not([data-theme-early="dark"]) .reader-bar button{background:rgba(37,99,235,.05);border-color:rgba(60,90,140,.18);color:#475569}'
    + 'html:not([data-theme-early="dark"]) .reader-bar button:hover{border-color:#2563eb;color:#1d4ed8}'
    + '.reader-next{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:290;display:none;align-items:center;max-width:86vw;padding:10px 22px;border-radius:999px;background:linear-gradient(135deg,#2563eb,#3b82f6);color:#fff;font-size:13.5px;font-weight:700;text-decoration:none;box-shadow:0 12px 30px rgba(37,99,235,.4);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '.reader-next:hover{filter:brightness(1.12);color:#fff;text-decoration:none}'
    + '@media print{.reader-bar,.reader-next,.nav-reader{display:none!important}body.site-reading .topnav{display:none!important}}';

  var ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>';

  function apply(){
    var on = !!st.on;
    document.body.classList.toggle("site-reading", on);
    if(container) container.style.zoom = on ? String(ZOOMS[zoomIdx]) : "";
    if(btn) btn.classList.toggle("on", on);
    if(bar) bar.style.display = on ? "flex" : "none";
    if(pill) pill.style.display = (on && P.next && P.next.u) ? "flex" : "none";
  }
  function setOn(on){
    if(st.on === on) return;
    st.on = on; save(st); apply();
    if(on) toast("阅读模式开启:Esc 退出 · A± 调字号 · 阅读位置自动记忆");
  }
  function setZoom(dir){
    zoomIdx = Math.max(0, Math.min(ZOOMS.length - 1, zoomIdx + dir));
    st.zoom = ZOOMS[zoomIdx]; save(st); apply();
  }
  function saveBookmark(){
    if(!st.on) return;
    var y = Math.round(window.scrollY || 0);
    if(y < 300) return;
    st.pages = st.pages || {};
    st.pages[P.pageId] = { y: y, ts: Date.now() };
    save(st);
  }

  function buildUI(){
    var nav = document.querySelector(".topnav .nav-inner");
    if(nav){
      btn = el("button", "nav-reader");
      btn.innerHTML = ICON;
      btn.title = "阅读模式(沉浸 + 字号 + 书签)";
      btn.setAttribute("aria-label", "阅读模式");
      btn.onclick = function(){ setOn(!st.on); };
      var search = nav.querySelector(".nav-search");
      if(search) nav.insertBefore(btn, search);
      else nav.appendChild(btn);
    }
    bar = el("div", "reader-bar");
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", "阅读模式工具条");
    var minus = el("button", "rb-a", "A−"); minus.title = "缩小字号"; minus.onclick = function(){ setZoom(-1); };
    var plus = el("button", "rb-a", "A+"); plus.title = "放大字号"; plus.onclick = function(){ setZoom(1); };
    var note = el("button", "rb-a", "✏ 笔记"); note.title = "学习笔记面板"; note.onclick = function(){ var nb = document.querySelector(".nav-notes"); if(nb) nb.click(); else toast("笔记模块未加载"); };
    var exit = el("button", "rb-exit", "退出阅读"); exit.onclick = function(){ setOn(false); };
    bar.appendChild(minus); bar.appendChild(plus); bar.appendChild(note); bar.appendChild(exit);
    document.body.appendChild(bar);
    if(P.next && P.next.u){
      pill = el("a", "reader-next", "连读 · 下一篇:" + (P.next.t || "下一页") + " →");
      pill.href = P.next.u;
      document.body.appendChild(pill);
    }
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  function boot(){
    container = document.querySelector(".container");
    var st2 = document.createElement("style");
    st2.textContent = STYLE;
    document.head.appendChild(st2);
    buildUI();
    apply();
    window.addEventListener("scroll", function(){
      clearTimeout(saveT);
      saveT = setTimeout(saveBookmark, 900);
    }, { passive: true });
    document.addEventListener("keydown", function(e){ if(e.key === "Escape" && st.on) setOn(false); });
    if(st.on && st.pages && st.pages[P.pageId] && st.pages[P.pageId].y > 400){
      var y = st.pages[P.pageId].y;
      setTimeout(function(){
        window.scrollTo(0, y);
        toast("已回到上次阅读位置");
      }, 350);
    }
  }
})();
