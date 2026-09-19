/* ============================================================
   人形机器人学习站 · 学习笔记面板(M1)  _assets/notes.js
   设计文档: docs/维护/笔记功能设计提案_2026-09-06.md(M1 期)
   - 每页左侧滑出面板:文字 / 链接 / 图片(引用) / 荧光笔划线 四类条目 + 面板内搜索
   - 存储: localStorage「humanoid-notes-v1」,读写只经本模块(数据单源纪律);
     Site.store 可用时走它(键版本化 + 配额统一 toast),否则内置兜底
     (site.js 与 notes.js 新旧版本混布窗口,SWR 生效前可能短暂共存)
   - 隐私红线: 笔记不出网,本模块零网络请求;导出仅本机下载 JSON
   - 荧光笔边界: 只包裹纯文本节点;排除 svg/pre/code/katex/顶栏/目录/本面板等;
     锚点 = 原文引文(≤240字) + 第几次出现(Hypothes.is 式);页面改版后引文
     失配的划线降级为"失效条目",面板可见可删,不再自动包裹
   - 类名空间: 全部 notes- / ntp- 前缀(全库 grep 排重;A-55 注入样式约定)
   - ES5 底线: 无箭头函数/模板串/let/const;对照 srs.js 风格
   ============================================================ */
(function(){
  "use strict";
  if(window.__SiteNotesLoaded) return;
  window.__SiteNotesLoaded = true;

  var P = window.PAGE || {};
  var PID = P.pageId;
  if(!PID) return;                       /* 无 pageId 不注入(与打卡口径一致) */
  var S = window.Site || {};
  var toast = function(msg, ms){ if(S.toast) S.toast(msg, ms); };

  /* ---------- 存储层(单源) ---------- */
  var KEY = "humanoid-notes-v1", VER = 1;
  function loadAll(){
    var d = null;
    if(S.store && S.store.get){ d = S.store.get(KEY); }
    else{ try{ d = JSON.parse(localStorage.getItem(KEY) || "null"); }catch(e){ d = null; } }
    if(!d || typeof d !== "object" || !d.pages || typeof d.pages !== "object") d = { version: VER, pages: {} };
    return d;
  }
  function saveAll(d){
    d.version = VER;
    if(S.store && S.store.set) return S.store.set(KEY, d);   /* false=配额满(site.js 已 toast) */
    try{ localStorage.setItem(KEY, JSON.stringify(d)); return true; }catch(e){ return false; }
  }
  function getItems(){ var d = loadAll(); var pg = d.pages[PID]; return (pg && pg.items) ? pg.items : []; }
  function setItems(arr){
    var d = loadAll();
    if(arr && arr.length) d.pages[PID] = { items: arr };
    else delete d.pages[PID];
    return saveAll(d);
  }
  function uid(){ return "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function fmtTs(ts){
    var d = new Date(ts);
    function p2(n){ return n < 10 ? "0" + n : "" + n; }
    return p2(d.getMonth() + 1) + "-" + p2(d.getDate()) + " " + p2(d.getHours()) + ":" + p2(d.getMinutes());
  }

  /* ---------- 荧光笔:可划范围判定 ---------- */
  var SKIP_TAGS = { SCRIPT:1, STYLE:1, NOSCRIPT:1, TEXTAREA:1, INPUT:1, SELECT:1,
                    BUTTON:1, MARK:1, SVG:1, PRE:1, CODE:1, KBD:1, SAMP:1, H1:1 };
  var SKIP_CLS = { "topnav":1, "drawer":1, "toc-sidebar":1, "toc-toggle":1,
                   "notes-panel":1, "notes-inline":1, "notes-pop":1, "notes-quick":1,
                   "site-search":1, "search-overlay":1, "search-box":1,
                   "page-head":1, "site-footer":1, "prevnext":1, "glass-pillbar":1,
                   "quicknav":1, "ai-fab":1, "ai-fab-panel":1, "backtop":1,
                   "katex":1, "katex-display":1, "site-toast":1 };
  function classSkip(n){
    var c = n.className;
    if(!c || typeof c !== "string") return false;   /* SVG 元素 className 是对象,直接放过(tag 层已拦 SVG) */
    var arr = c.split(/\s+/);
    for(var i = 0; i < arr.length; i++){ if(SKIP_CLS[arr[i]]) return true; }
    return false;
  }
  function inSkipZone(node){
    var n = node;
    while(n && n !== document.body){
      if(n.nodeType === 1){
        if(SKIP_TAGS[n.tagName] || classSkip(n)) return true;
        if(n.getAttribute && n.getAttribute("contenteditable") === "true") return true;
      }
      n = n.parentNode;
    }
    return false;
  }

  /* ---------- 荧光笔:全文文本索引(锚定的唯一事实源,存取口径一致) ---------- */
  function buildTextIndex(){
    var text = "", nodes = [];
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function(n){
        if(!n.nodeValue || !n.nodeValue.replace(/^\s+|\s+$/g, "")) return NodeFilter.FILTER_REJECT;
        if(inSkipZone(n)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var n;
    while((n = w.nextNode())){ nodes.push({ node: n, start: text.length }); text += n.nodeValue; }
    return { text: text, nodes: nodes };
  }
  /* 绝对文本偏移 → { i:节点序号, off:节点内偏移 };找不到返回 -1 */
  function nodeAt(t, idx){
    var lo = 0, hi = t.nodes.length - 1, i = -1;
    while(lo <= hi){
      var mid = (lo + hi) >> 1;
      if(t.nodes[mid].start <= idx){ i = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    if(i < 0) return -1;
    return { i: i, off: idx - t.nodes[i].start };
  }
  /* Range.start 在文本索引中的绝对偏移;定位不了返回 -1 */
  function absStart(range, t){
    var sc = range.startContainer, j;
    if(sc.nodeType === 3){
      for(j = 0; j < t.nodes.length; j++){ if(t.nodes[j].node === sc) return t.nodes[j].start + range.startOffset; }
      return -1;
    }
    if(sc.nodeType !== 1) return -1;
    var target = sc.childNodes[range.startOffset] || null;
    for(j = 0; j < t.nodes.length; j++){
      var nd = t.nodes[j].node;
      if(target){ if(target.contains(nd)) return t.nodes[j].start; }
      else if(sc.compareDocumentPosition(nd) & 4) return t.nodes[j].start;   /* nd 在 sc 之后 */
    }
    return -1;
  }
  function rangeIntersects(range, tn){
    if(range.intersectsNode) return range.intersectsNode(tn);
    var r2 = document.createRange(); r2.selectNodeContents(tn);
    return range.compareBoundaryPoints(Range.END_TO_START, r2) < 0 &&
           range.compareBoundaryPoints(Range.START_TO_END, r2) > 0;
  }
  /* 从文本索引 idx 起,向后包裹 len 个字符为 mark(逐文本节点分段) */
  function wrapAt(t, idx, len, nid, color){
    var at = nodeAt(t, idx);
    if(at === -1) return false;
    var off = at.off, left = len, made = 0;
    for(var j = at.i; j < t.nodes.length && left > 0; j++){
      var tn = t.nodes[j].node;
      var startOff = (j === at.i) ? off : 0;
      var avail = tn.nodeValue.length - startOff;
      if(avail <= 0) continue;
      var take = Math.min(left, avail);
      var frag = tn;
      try{
        if(startOff + take < frag.nodeValue.length) frag.splitText(startOff + take);
        if(startOff > 0) frag = frag.splitText(startOff);
        var mk = document.createElement("mark");
        mk.className = "notes-hl notes-hl-" + (color || "y");
        mk.setAttribute("data-nid", nid);
        mk.title = "学习笔记划线";
        frag.parentNode.replaceChild(mk, frag);
        mk.appendChild(frag);
        made++;
      }catch(e){ break; }
      left -= take;
    }
    return made > 0;
  }
  function unwrap(nid){
    var marks = document.querySelectorAll('mark.notes-hl[data-nid="' + String(nid).replace(/[^a-z0-9]/gi, "") + '"]');
    for(var i = marks.length - 1; i >= 0; i--){
      var mk = marks[i], pa = mk.parentNode;
      while(mk.firstChild) pa.insertBefore(mk.firstChild, mk);
      pa.removeChild(mk);
      try{ pa.normalize(); }catch(e){}
    }
  }

  /* ---------- 荧光笔:划选保存 ---------- */
  function captureSelection(color){
    var sel = window.getSelection ? window.getSelection() : null;
    if(!sel || !sel.rangeCount || sel.isCollapsed) return "empty";
    var range = sel.getRangeAt(0);
    var quote = String(sel.toString()).replace(/^\s+|\s+$/g, "");
    if(!quote) return "empty";
    if(quote.length > 240) quote = quote.slice(0, 240);
    /* 排除检查:选区内任何文本节点落在不可划区/已有划线 → 整体拒绝(保持数据==视图) */
    var root = range.commonAncestorContainer;
    if(root.nodeType !== 1) root = root.parentNode;
    if(!root || root === document.body) { /* 大选区:仍走全量文本节点检查 */ }
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null), n;
    while((n = w.nextNode())){
      if(!rangeIntersects(range, n)) continue;
      if(inSkipZone(n)) return "skip";
      var up = n.parentNode;
      while(up && up !== document.body){
        if(up.nodeType === 1 && up.tagName === "MARK" && /(^|\s)notes-hl/.test(up.className || "")) return "dup";
        up = up.parentNode;
      }
    }
    var t = buildTextIndex();
    var startIdx = absStart(range, t);
    if(startIdx < 0) return "skip";
    var occ = 1, i = t.text.indexOf(quote);
    while(i !== -1 && i < startIdx){ occ++; i = t.text.indexOf(quote, i + quote.length); }
    var it = { id: uid(), type: "hl", text: quote, quote: quote, occ: occ, color: color, ts: Date.now() };
    if(!wrapAt(t, startIdx, quote.length, it.id, color)) return "skip";
    var arr = getItems();
    arr.push(it);
    if(!setItems(arr)){ unwrap(it.id); toast("本地存储空间已满,划线未保存"); return "full"; }
    try{ sel.removeAllRanges(); }catch(e2){}
    return "ok";
  }
  /* 页面载入:划线重建 + 段落笔记卡内嵌原文;失配条目在面板标"失效" */
  var _applyState = {};
  function locateQuote(t, quote, want){
    var seen = 0, cur = t.text.indexOf(quote);
    while(cur !== -1){
      seen++;
      if(seen === want) return cur;
      cur = t.text.indexOf(quote, cur + quote.length);
    }
    return -1;
  }
  function applyAll(){
    var arr = getItems();
    _applyState = {};
    for(var i = 0; i < arr.length; i++){
      var it = arr[i];
      /* 每条独立重建索引:wrapAt 的 splitText 会让缓存索引偏移(多划线同页的锚点漂移隐患) */
      var t = buildTextIndex();
      if(it.type === "hl"){
        var idx = it.quote ? locateQuote(t, it.quote, it.occ || 1) : -1;
        var ok = false;
        if(idx !== -1){ try{ ok = wrapAt(t, idx, it.quote.length, it.id, it.color); }catch(e){ ok = false; } }
        _applyState[it.id] = ok;
      }else if(it.type === "text" && it.quote){
        var idx2 = locateQuote(t, it.quote, it.occ || 1);
        var ok2 = false;
        if(idx2 !== -1){
          var at = nodeAt(t, idx2);
          if(at !== -1){
            var block = anchorBlockOf(t.nodes[at.i].node);
            if(block){ renderInlineCard(it, block); ok2 = true; }
          }
        }
        _applyState[it.id] = ok2;
      }else{
        _applyState[it.id] = true;
      }
    }
  }

  /* ---------- 原文交互:段落笔记卡 + 划线气泡 + 选中速记 ----------
     参考:微信读书(选中弹泡/划线点击改删)、Kindle(笔记卡内嵌原文)、
     Hypothes.is(引文+次序锚定,本模块既有机制) */
  var BLOCK_TAGS = { P:1, H2:1, H3:1, H4:1, H5:1, BLOCKQUOTE:1, LI:1, TD:1, TH:1, DD:1, DT:1, FIGURE:1, SUMMARY:1 };
  function anchorBlockOf(n){
    var e = (n && n.nodeType === 1) ? n : (n ? n.parentNode : null);
    while(e && e !== document.body){
      if(BLOCK_TAGS[e.tagName]) return e;
      if(e.classList && (e.classList.contains("container") || e.classList.contains("page-head"))) return e;
      e = e.parentNode;
    }
    return null;
  }
  function typeName(it){
    if(it.type === "text") return it.quote ? "段落笔记" : "文字";
    return { link: "链接", image: "图片", hl: "划线" }[it.type] || "笔记";
  }
  function flashEl(e2){ e2.classList.add("notes-flash"); setTimeout(function(){ e2.classList.remove("notes-flash"); }, 1600); }
  function deleteItem(nid){
    var arr = getItems(), out = [], gone = null;
    for(var i = 0; i < arr.length; i++){ if(arr[i].id === nid) gone = arr[i]; else out.push(arr[i]); }
    if(gone){ unwrap(nid); setItems(out); render(); }
    return gone;
  }
  function renderInlineCard(it, block){
    if(!block || !block.parentNode) return null;
    var old = block.parentNode.querySelector('div.notes-inline[data-nid="' + it.id + '"]');
    if(old) old.remove();
    var card = el("div", "notes-inline");
    card.setAttribute("data-nid", it.id);
    var h = el("div", "ni-h");
    h.appendChild(el("span", "ni-tag", "📝 笔记"));
    h.appendChild(el("span", "ni-ts", fmtTs(it.ts || 0)));
    var x = el("button", "ni-x", "✕ 删除");
    x.title = "删除这条笔记";
    x.onclick = function(){ deleteItem(it.id); card.remove(); };
    h.appendChild(x);
    card.appendChild(h);
    card.appendChild(el("div", "ni-tx", it.text || ""));
    block.parentNode.insertBefore(card, block.nextSibling);
    return card;
  }
  function setHlColor(nid, color){
    var arr = getItems();
    for(var i = 0; i < arr.length; i++){ if(arr[i].id === nid){ arr[i].color = color; break; } }
    setItems(arr);
    var marks = document.querySelectorAll('mark.notes-hl[data-nid="' + nid + '"]');
    for(var j = 0; j < marks.length; j++) marks[j].className = "notes-hl notes-hl-" + color;
    render();
  }
  /* 划线气泡:点击正文中任意划线,就地改色/删除(微信读书式) */
  var pop = null;
  function closePop(){ if(pop){ pop.remove(); pop = null; } }
  function openPop(mark){
    closePop(); closeQuick();
    var nid = mark.getAttribute("data-nid");
    var it = null, arr = getItems();
    for(var i = 0; i < arr.length; i++){ if(arr[i].id === nid){ it = arr[i]; break; } }
    if(!it) return;
    pop = el("div", "notes-pop");
    pop.setAttribute("role", "toolbar");
    pop.setAttribute("aria-label", "划线操作");
    var colors = [["y", "#e7c400", "黄:概念"], ["g", "#3cb96a", "绿:例子"], ["r", "#e0655f", "红:疑问"]];
    var cur = it.color || "y";
    for(var c = 0; c < colors.length; c++){
      (function(cl){
        var d = el("button", "np-d" + (cl[0] === cur ? " on" : ""));
        d.style.background = cl[1]; d.style.color = cl[1];
        d.title = cl[2]; d.setAttribute("aria-label", cl[2]);
        d.onclick = function(ev){
          ev.stopPropagation();
          setHlColor(nid, cl[0]);
          var all = pop.querySelectorAll(".np-d");
          for(var k = 0; k < all.length; k++) all[k].classList.toggle("on", all[k] === d);
        };
        pop.appendChild(d);
      })(colors[c]);
    }
    var del = el("button", "np-x", "删除划线");
    del.onclick = function(ev){ ev.stopPropagation(); deleteItem(nid); closePop(); };
    pop.appendChild(del);
    document.body.appendChild(pop);
    var r = mark.getBoundingClientRect();
    var left = Math.max(8, Math.min(r.left + r.width / 2 - pop.offsetWidth / 2, window.innerWidth - pop.offsetWidth - 8));
    var top = r.top - pop.offsetHeight - 8;
    if(top < 8) top = r.bottom + 8;
    pop.style.left = left + "px";
    pop.style.top = top + "px";
  }
  /* 选中速记:非划线模式下选中正文,浮出小卡,存为"段落笔记"并内嵌原文 */
  var quick = null, quickAnchor = null;
  function closeQuick(){ if(quick){ quick.remove(); quick = null; } quickAnchor = null; }
  function saveQuick(){
    if(!quick || !quickAnchor) return;
    var ta = quick.querySelector("textarea");
    var v = ta.value.replace(/^\s+|\s+$/g, "");
    if(!v){ toast("先写点内容再保存"); return; }
    var arr = getItems();
    var it = { id: uid(), type: "text", text: v, quote: quickAnchor.quote, occ: quickAnchor.occ, ts: Date.now() };
    arr.push(it);
    if(!setItems(arr)){ toast("本地存储空间已满,笔记未保存"); return; }
    renderInlineCard(it, quickAnchor.block);
    _applyState[it.id] = true;
    try{ window.getSelection().removeAllRanges(); }catch(e){}
    closeQuick();
    render();
  }
  function showQuick(range){
    closeQuick(); closePop();
    var sel = window.getSelection ? window.getSelection() : null;
    var quote = sel ? String(sel.toString()).replace(/^\s+|\s+$/g, "") : "";
    if(!quote) return;
    if(quote.length > 240) quote = quote.slice(0, 240);
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null), n;
    while((n = w.nextNode())){
      if(!rangeIntersects(range, n)) continue;
      if(inSkipZone(n)) return;
    }
    var t = buildTextIndex();
    var startIdx = absStart(range, t);
    if(startIdx < 0) return;
    var occ = 1, i = t.text.indexOf(quote);
    while(i !== -1 && i < startIdx){ occ++; i = t.text.indexOf(quote, i + quote.length); }
    var block = anchorBlockOf(range.startContainer);
    if(!block) return;
    quickAnchor = { quote: quote, occ: occ, block: block };
    quick = el("div", "notes-quick");
    var ta = el("textarea");
    ta.placeholder = "针对这段文字记点笔记…";
    quick.appendChild(ta);
    var row = el("div", "nq-row");
    row.appendChild(el("span", "nq-quote", "「" + quote.slice(0, 18) + (quote.length > 18 ? "…" : "") + "」"));
    var cancel = el("button", null, "取消");
    cancel.onclick = function(){ closeQuick(); try{ sel.removeAllRanges(); }catch(e){} };
    var save = el("button", "pri", "存到原文");
    save.onclick = saveQuick;
    row.appendChild(cancel); row.appendChild(save);
    quick.appendChild(row);
    document.body.appendChild(quick);
    var r = range.getBoundingClientRect();
    var left = Math.max(8, Math.min(r.left, window.innerWidth - quick.offsetWidth - 8));
    var top = r.bottom + 8;
    if(top + quick.offsetHeight > window.innerHeight - 8) top = Math.max(8, r.top - quick.offsetHeight - 8);
    quick.style.left = left + "px";
    quick.style.top = top + "px";
    ta.focus();
  }

  /* ---------- 面板 UI ---------- */
  var panel = null, hlMode = false, hlColor = "y", _listBox = null, _qInput = null;
  function el(tag, cls, text){ var e = document.createElement(tag); if(cls) e.className = cls; if(text != null) e.textContent = text; return e; }
  function validUrl(u){
    u = String(u || "").replace(/^\s+|\s+$/g, "");
    if(!u) return null;
    if(/^(https?:\/\/|\/|\.\/|\.\.\/|#)/i.test(u)) return u;
    return null;
  }

  var STYLE = ''
    + '.nav-notes{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);color:#c9d1d9;height:30px;width:34px;padding:0;border-radius:8px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background-color .15s,border-color .15s,color .15s,transform .2s cubic-bezier(.2,.8,.3,1.15);flex-shrink:0}'
    + '.nav-notes:hover{background:rgba(255,255,255,.11);border-color:rgba(255,255,255,.24);color:#fff}'
    + 'html:not([data-theme-early="dark"]) .nav-notes{background:rgba(255,255,255,.65);border-color:rgba(100,116,139,.28);color:#475569}'
    + 'html:not([data-theme-early="dark"]) .nav-notes:hover{background:rgba(37,99,235,.1);border-color:rgba(37,99,235,.35);color:#2563eb}'
    + '.notes-panel{position:fixed;left:16px;top:76px;width:270px;max-height:calc(100vh - 96px);display:flex;flex-direction:column;z-index:150;background:rgba(17,22,30,.72);backdrop-filter:blur(18px) saturate(160%);-webkit-backdrop-filter:blur(18px) saturate(160%);border:1px solid rgba(255,255,255,.1);border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.42);opacity:0;pointer-events:none;transform:translateX(-14px);transition:opacity .22s,transform .22s;font-family:inherit}'
    + '.notes-panel.open{opacity:1;pointer-events:auto;transform:translateX(0)}'
    + 'html:not([data-theme-early="dark"]) .notes-panel{background:rgba(255,255,255,.9);border-color:rgba(255,255,255,.85);box-shadow:0 14px 40px rgba(50,80,140,.16)}'
    + 'body.notes-open .toc-sidebar{opacity:0;pointer-events:none}'
    + '.ntp-head{display:flex;align-items:center;gap:8px;padding:12px 14px 8px;color:#eef4fb;font-size:14px;font-weight:700}'
    + 'html:not([data-theme-early="dark"]) .ntp-head{color:#0f172a}'
    + '.ntp-badge{font-family:Consolas,"Courier New",monospace;font-size:10px;color:#8b98a9;border:1px solid rgba(148,163,184,.3);border-radius:4px;padding:1px 6px;font-weight:normal}'
    + '.ntp-x{margin-left:auto;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);color:inherit;width:24px;height:24px;border-radius:50%;cursor:pointer;font-size:12px;line-height:1;flex-shrink:0}'
    + 'html:not([data-theme-early="dark"]) .ntp-x{background:rgba(37,99,235,.06);border-color:rgba(37,99,235,.2)}'
    + '.ntp-tools{padding:0 14px 8px;display:flex;flex-direction:column;gap:7px}'
    + '.ntp-row{display:flex;align-items:center;gap:6px}'
    + '.ntp-mode{font-size:11.5px;padding:4px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.05);color:#aab8c8;cursor:pointer;font-family:inherit;white-space:nowrap}'
    + '.ntp-mode.on{background:rgba(240,164,55,.2);border-color:#f0a437;color:#ffd9a0;font-weight:700}'
    + 'html:not([data-theme-early="dark"]) .ntp-mode{background:rgba(37,99,235,.05);border-color:rgba(37,99,235,.2);color:#475569}'
    + 'html:not([data-theme-early="dark"]) .ntp-mode.on{background:rgba(180,83,9,.12);border-color:#b45309;color:#b45309}'
    + '.ntp-dot{width:17px;height:17px;border-radius:50%;border:2px solid transparent;cursor:pointer;padding:0;flex-shrink:0;opacity:.45;transition:.15s}'
    + '.ntp-dot.on{opacity:1;border-color:currentColor;transform:scale(1.12)}'
    + '.ntp-dot-y{background:#e7c400}.ntp-dot-g{background:#3cb96a}.ntp-dot-r{background:#e0655f}'
    + '.ntp-hint{font-size:10.5px;color:#8b98a9;line-height:1.5}'
    + 'html:not([data-theme-early="dark"]) .ntp-hint{color:#7c8aa0}'
    + '.ntp-q,.ntp-ta,.ntp-url,.ntp-cap{width:100%;box-sizing:border-box;font-size:12.5px;padding:7px 10px;border-radius:9px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:inherit;outline:none;font-family:inherit}'
    + '.ntp-q:focus,.ntp-ta:focus,.ntp-url:focus,.ntp-cap:focus{border-color:#58a6ff}'
    + 'html:not([data-theme-early="dark"]) .ntp-q,html:not([data-theme-early="dark"]) .ntp-ta,html:not([data-theme-early="dark"]) .ntp-url,html:not([data-theme-early="dark"]) .ntp-cap{background:rgba(255,255,255,.75);border-color:rgba(37,99,235,.22);color:#0f172a}'
    + '.ntp-ta{resize:vertical;min-height:56px;max-height:130px}'
    + '.ntp-btns{display:flex;gap:6px}'
    + '.ntp-btn{flex:1;font-size:11.5px;padding:6px 0;border-radius:8px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.05);color:#aab8c8;cursor:pointer;font-family:inherit;white-space:nowrap}'
    + '.ntp-btn:hover{border-color:#58a6ff;color:#fff}'
    + 'html:not([data-theme-early="dark"]) .ntp-btn{background:rgba(37,99,235,.05);border-color:rgba(37,99,235,.22);color:#475569}'
    + 'html:not([data-theme-early="dark"]) .ntp-btn:hover{border-color:#2563eb;color:#1d4ed8;background:rgba(37,99,235,.08)}'
    + '.ntp-btn.pri{background:rgba(88,166,255,.2);border-color:rgba(88,166,255,.5);color:#cfe6ff;font-weight:700}'
    + 'html:not([data-theme-early="dark"]) .ntp-btn.pri{background:rgba(37,99,235,.12);border-color:rgba(37,99,235,.4);color:#1d4ed8}'
    + '.ntp-list{overflow-y:auto;padding:2px 14px 10px;flex:1;min-height:60px}'
    + '.ntp-item{border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:8px 10px;margin:6px 0;background:rgba(255,255,255,.03)}'
    + 'html:not([data-theme-early="dark"]) .ntp-item{border-color:rgba(37,99,235,.14);background:rgba(37,99,235,.03)}'
    + '.ntp-item.broken{opacity:.75;border-style:dashed}'
    + '.ntp-ih{display:flex;align-items:center;gap:6px;margin-bottom:4px}'
    + '.ntp-type{font-size:10px;color:#8b98a9;letter-spacing:.06em}'
    + '.ntp-cdot{display:inline-block;width:9px;height:9px;border-radius:50%;vertical-align:-1px}'
    + '.ntp-ts{margin-left:auto;font-size:10px;color:#8b98a9;font-family:Consolas,"Courier New",monospace}'
    + '.ntp-del{background:none;border:none;color:#8b98a9;cursor:pointer;font-size:13px;line-height:1;padding:2px 4px;border-radius:5px}'
    + '.ntp-del:hover{color:#f87171}'
    + '.ntp-text{font-size:12.5px;color:#d7dee8;line-height:1.7;white-space:pre-wrap;word-break:break-word}'
    + 'html:not([data-theme-early="dark"]) .ntp-text{color:#1e293b}'
    + '.ntp-quote{font-size:12px;color:#b6c2d1;line-height:1.7;cursor:pointer;word-break:break-word}'
    + 'html:not([data-theme-early="dark"]) .ntp-quote{color:#334155}'
    + '.ntp-quote:hover{color:#ffd9a0}html:not([data-theme-early="dark"]) .ntp-quote:hover{color:#b45309}'
    + '.ntp-link{font-size:12.5px;color:#9ecbff;word-break:break-all;text-decoration:none;display:block}'
    + '.ntp-link:hover{text-decoration:underline}'
    + 'html:not([data-theme-early="dark"]) .ntp-link{color:#1d4ed8}'
    + '.ntp-img{max-width:100%;border-radius:8px;display:block;margin:2px 0;cursor:pointer}'
    + '.ntp-cap{display:block;font-size:11px;color:#8b98a9;margin-top:3px}'
    + 'html:not([data-theme-early="dark"]) .ntp-cap{color:#7c8aa0}'
    + '.ntp-flag{display:inline-block;font-size:10px;color:#f0a437;border:1px dashed rgba(240,164,55,.5);border-radius:4px;padding:1px 6px;margin-top:4px}'
    + 'html:not([data-theme-early="dark"]) .ntp-flag{color:#b45309;border-color:rgba(180,83,9,.45)}'
    + '.ntp-empty{padding:20px 8px;text-align:center;color:#8b98a9;font-size:12px;line-height:1.8}'
    + '.ntp-foot{padding:8px 14px 10px;border-top:1px solid rgba(255,255,255,.08);font-size:10.5px;color:#8b98a9;display:flex;align-items:center;gap:8px}'
    + 'html:not([data-theme-early="dark"]) .ntp-foot{border-color:rgba(37,99,235,.12);color:#7c8aa0}'
    + '.ntp-foot button{background:none;border:none;color:#9ecbff;cursor:pointer;font-size:11px;padding:2px 4px;font-family:inherit}'
    + '.ntp-foot button:hover{text-decoration:underline}'
    + 'html:not([data-theme-early="dark"]) .ntp-foot button{color:#1d4ed8}'
    + 'mark.notes-hl{color:inherit;background-color:rgba(250,204,21,.34);padding:0 1px;border-radius:2px;-webkit-box-decoration-break:clone;box-decoration-break:clone;cursor:pointer}'
    + 'mark.notes-hl-y{background-color:rgba(250,204,21,.34)}'
    + 'mark.notes-hl-g{background-color:rgba(74,222,128,.3)}'
    + 'mark.notes-hl-r{background-color:rgba(252,165,165,.32)}'
    + 'html:not([data-theme-early="dark"]) mark.notes-hl-y{background-color:#ffe58a}'
    + 'html:not([data-theme-early="dark"]) mark.notes-hl-g{background-color:#b7ebc9}'
    + 'html:not([data-theme-early="dark"]) mark.notes-hl-r{background-color:#ffc9c9}'
    + 'mark.notes-flash{outline:2px solid #f0a437;outline-offset:2px}'
    + 'body.notes-hlmode{cursor:text}'
    + '.notes-pop{position:fixed;z-index:380;display:flex;align-items:center;gap:6px;padding:7px 10px;border-radius:10px;background:rgba(12,17,26,.96);border:1px solid rgba(140,190,255,.3);box-shadow:0 12px 30px rgba(0,0,0,.45)}'
    + 'html:not([data-theme-early="dark"]) .notes-pop{background:rgba(255,255,255,.98);border-color:rgba(60,90,140,.22);box-shadow:0 10px 26px rgba(40,70,130,.22)}'
    + '.notes-pop .np-d{width:16px;height:16px;border-radius:50%;border:2px solid transparent;cursor:pointer;padding:0;opacity:.5;flex-shrink:0}'
    + '.notes-pop .np-d.on{opacity:1;border-color:rgba(148,163,184,.8)}'
    + '.notes-pop .np-x{background:rgba(239,68,68,.14);border:1px solid rgba(239,68,68,.45);color:#f87171;font-size:11px;padding:3px 9px;border-radius:7px;cursor:pointer;font-family:inherit;white-space:nowrap}'
    + '.notes-pop .np-x:hover{background:rgba(239,68,68,.3);color:#fff}'
    + '.notes-quick{position:fixed;z-index:380;width:min(320px,86vw);padding:9px;border-radius:12px;background:rgba(12,17,26,.97);border:1px solid rgba(140,190,255,.3);box-shadow:0 16px 40px rgba(0,0,0,.5)}'
    + 'html:not([data-theme-early="dark"]) .notes-quick{background:rgba(255,255,255,.99);border-color:rgba(60,90,140,.22);box-shadow:0 14px 36px rgba(40,70,130,.24)}'
    + '.notes-quick textarea{width:100%;box-sizing:border-box;height:58px;resize:vertical;font-size:12.5px;padding:7px 9px;border-radius:8px;border:1px solid rgba(140,190,255,.25);background:rgba(255,255,255,.05);color:inherit;outline:none;font-family:inherit}'
    + 'html:not([data-theme-early="dark"]) .notes-quick textarea{background:rgba(37,99,235,.04);border-color:rgba(37,99,235,.25);color:#0f172a}'
    + '.notes-quick .nq-row{display:flex;gap:6px;margin-top:6px;align-items:center}'
    + '.notes-quick .nq-quote{font-size:10.5px;color:#8b98a9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}'
    + '.notes-quick button{font-size:11.5px;padding:4px 12px;border-radius:7px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.05);color:#aab8c8;cursor:pointer;font-family:inherit}'
    + '.notes-quick button.pri{background:rgba(88,166,255,.22);border-color:rgba(88,166,255,.5);color:#cfe6ff;font-weight:700}'
    + 'html:not([data-theme-early="dark"]) .notes-quick button{background:rgba(37,99,235,.05);border-color:rgba(37,99,235,.22);color:#475569}'
    + 'html:not([data-theme-early="dark"]) .notes-quick button.pri{background:rgba(37,99,235,.12);border-color:rgba(37,99,235,.4);color:#1d4ed8}'
    + '.notes-inline{margin:10px 0;padding:9px 12px;border-radius:0 10px 10px 0;border-left:3px solid #f0a437;background:rgba(240,164,55,.07);font-size:12.5px;line-height:1.7}'
    + 'html:not([data-theme-early="dark"]) .notes-inline{background:rgba(240,164,55,.1);border-left-color:#b45309}'
    + '.notes-inline .ni-h{display:flex;align-items:center;gap:7px;margin-bottom:3px}'
    + '.notes-inline .ni-tag{font-size:10px;color:#f0a437;letter-spacing:.08em;font-weight:700}'
    + 'html:not([data-theme-early="dark"]) .notes-inline .ni-tag{color:#b45309}'
    + '.notes-inline .ni-ts{font-size:10px;color:#8b98a9;font-family:Consolas,monospace}'
    + '.notes-inline .ni-x{margin-left:auto;background:none;border:none;color:#8b98a9;cursor:pointer;font-size:11px;padding:1px 6px;border-radius:5px;font-family:inherit}'
    + '.notes-inline .ni-x:hover{color:#f87171}'
    + '.notes-inline .ni-tx{color:#c9d1d9;white-space:pre-wrap;word-break:break-word}'
    + 'html:not([data-theme-early="dark"]) .notes-inline .ni-tx{color:#1e293b}'
    + '@media print{.notes-panel,.nav-notes{display:none!important}}';

  var ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';

  function render(){
    if(!_listBox) return;
    _listBox.textContent = "";
    var q = (_qInput && _qInput.value ? _qInput.value : "").replace(/^\s+|\s+$/g, "").toLowerCase();
    var arr = getItems().slice().sort(function(a, b){ return (b.ts || 0) - (a.ts || 0); });
    var shown = 0;
    for(var i = 0; i < arr.length; i++){
      var it = arr[i];
      var hay = ((it.text || "") + " " + (it.quote || "") + " " + (it.url || "")).toLowerCase();
      if(q && hay.indexOf(q) === -1) continue;
      shown++;
      _listBox.appendChild(itemNode(it));
    }
    if(!shown){
      var empty = el("div", "ntp-empty");
      empty.textContent = q ? "没有匹配的笔记" : "这一页还没有笔记。\n选中正文后点荧光笔划线,或在上方记文字。";
      _listBox.appendChild(empty);
    }
  }
  function itemNode(it){
    var box = el("div", "ntp-item");
    if(it.type === "hl" && _applyState[it.id] === false) box.classList.add("broken");
    var ih = el("div", "ntp-ih");
    if(it.type === "hl"){
      var dot = el("i", "ntp-cdot ntp-cdot-" + (it.color || "y"));
      dot.style.background = it.color === "g" ? "#3cb96a" : (it.color === "r" ? "#e0655f" : "#e7c400");
      ih.appendChild(dot);
    }
    ih.appendChild(el("span", "ntp-type", typeName(it)));
    ih.appendChild(el("span", "ntp-ts", fmtTs(it.ts || 0)));
    var del = el("button", "ntp-del", "✕");
    del.title = "删除这条笔记";
    del.setAttribute("aria-label", "删除笔记");
    del.onclick = function(){
      if(it.type === "hl") unwrap(it.id);
      var arr = getItems(), out = [];
      for(var k = 0; k < arr.length; k++){ if(arr[k].id !== it.id) out.push(arr[k]); }
      setItems(out);
      render();
    };
    ih.appendChild(del);
    box.appendChild(ih);
    if(it.type === "text"){
      var tx = el("div", "ntp-text", it.text || "");
      if(it.quote){
        if(_applyState[it.id] !== false){
          tx.title = "点击跳到原文附注";
          tx.style.cursor = "pointer";
          tx.onclick = function(){
            var card = document.querySelector('div.notes-inline[data-nid="' + it.id + '"]');
            if(card){ card.scrollIntoView({ block: "center", behavior: "smooth" }); flashEl(card); }
          };
        }else{
          box.classList.add("broken");
          box.appendChild(el("span", "ntp-flag", "原文已改版,附注失效(可删除)"));
        }
      }
      box.appendChild(tx);
    }else if(it.type === "link"){
      var a = el("a", "ntp-link", it.text || it.url || "链接");
      a.href = it.url || "#";
      a.target = "_blank"; a.rel = "noopener";
      box.appendChild(a);
      if(it.text && it.url && it.text !== it.url) box.appendChild(el("span", "ntp-cap", it.url));
    }else if(it.type === "image"){
      var im = document.createElement("img");
      im.className = "ntp-img"; im.src = it.url || ""; im.alt = it.text || "笔记图片";
      im.loading = "lazy";
      im.onerror = function(){ im.style.display = "none"; box.appendChild(el("span", "ntp-flag", "图片地址失效")); };
      im.onclick = function(){ if(im.src) window.open(im.src, "_blank", "noopener"); };
      box.appendChild(im);
      if(it.text) box.appendChild(el("span", "ntp-cap", it.text));
    }else if(it.type === "hl"){
      var qt = el("div", "ntp-quote", "「" + (it.quote || it.text || "") + "」");
      if(_applyState[it.id] !== false){
        qt.title = "点击跳到划线处";
        qt.onclick = function(){
          var mk = document.querySelector('mark.notes-hl[data-nid="' + it.id + '"]');
          if(!mk) return;
          mk.scrollIntoView({ block: "center", behavior: "smooth" });
          mk.classList.add("notes-flash");
          setTimeout(function(){ mk.classList.remove("notes-flash"); }, 1600);
        };
      }else{
        box.appendChild(el("span", "ntp-flag", "原文已改版,划线失效(可删除)"));
      }
      box.appendChild(qt);
    }
    return box;
  }

  function addText(){
    var ta = panel.querySelector(".ntp-ta");
    var v = ta.value.replace(/^\s+|\s+$/g, "");
    if(!v){ toast("先写点内容再保存"); return; }
    var arr = getItems();
    arr.push({ id: uid(), type: "text", text: v, ts: Date.now() });
    if(!setItems(arr)) return;   /* 配额提示已由 site.js 弹 */
    ta.value = "";
    render();
  }
  function addRef(kind){
    var urlIn = panel.querySelector(".ntp-url"), capIn = panel.querySelector(".ntp-cap");
    var u = validUrl(urlIn.value);
    if(!u){ toast("地址需以 http(s)://、/ 或 ./ 开头"); return; }
    var arr = getItems();
    arr.push({ id: uid(), type: kind, url: u, text: capIn.value.replace(/^\s+|\s+$/g, ""), ts: Date.now() });
    if(!setItems(arr)) return;
    urlIn.value = ""; capIn.value = "";
    render();
  }
  function toggleHlMode(force){
    hlMode = (force !== undefined) ? force : !hlMode;
    document.body.classList.toggle("notes-hlmode", hlMode);
    var mb = panel.querySelector(".ntp-mode");
    if(mb) mb.classList.toggle("on", hlMode);
    var dots = panel.querySelector(".ntp-dots");
    if(dots) dots.style.display = hlMode ? "flex" : "none";
    var hint = panel.querySelector(".ntp-hint");
    if(hint) hint.textContent = hlMode ? "选中正文一段话,再点上方颜色即划线(黄=概念 绿=例子 红=疑问)" : "打开荧光笔后,选中正文即可划线;划线只存本机";
  }
  function onDocMouseUp(e){
    if(e && e.target && e.target.closest &&
       (e.target.closest(".notes-panel") || e.target.closest(".notes-quick") ||
        e.target.closest(".notes-pop") || e.target.closest(".topnav"))) return;
    var sel = window.getSelection ? window.getSelection() : null;
    if(hlMode){
      if(sel && sel.rangeCount && !sel.isCollapsed){
        var r = captureSelection(hlColor);
        if(r === "dup") toast("这一段已经划过线了");
        else if(r === "skip") toast("此处不支持划线(代码/公式/导航等区域除外)");
        else if(r === "ok") render();
      }
      return;
    }
    if(sel && sel.rangeCount && !sel.isCollapsed){ showQuick(sel.getRangeAt(0)); }
    else closeQuick();
  }
  function open(){ panel.classList.add("open"); document.body.classList.add("notes-open"); render(); }
  function close(){ panel.classList.remove("open"); document.body.classList.remove("notes-open"); toggleHlMode(false); }
  function toggle(){ panel.classList.contains("open") ? close() : open(); }

  function exportJson(){
    var d = loadAll();
    var blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    var url = URL.createObjectURL(blob);
    a.href = url;
    var dt = new Date();
    function p2(n){ return n < 10 ? "0" + n : "" + n; }
    a.download = "学习笔记备份_" + dt.getFullYear() + p2(dt.getMonth() + 1) + p2(dt.getDate()) + ".json";
    document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); }, 400);
  }
  function importJson(file){
    if(!file) return;
    var fr = new FileReader();
    fr.onload = function(){
      var d = null;
      try{ d = JSON.parse(String(fr.result)); }catch(e){ d = null; }
      if(!d || typeof d !== "object" || !d.pages || typeof d.pages !== "object"){ toast("文件格式不对:需要本站导出的笔记 JSON"); return; }
      if(!window.confirm("导入将覆盖本机现有全部笔记,确定继续?")) return;
      /* 先拆掉本页已渲染划线,再整体替换 */
      var marks = document.querySelectorAll("mark.notes-hl[data-nid]");
      for(var i = marks.length - 1; i >= 0; i--){
        var mk = marks[i], pa = mk.parentNode;
        while(mk.firstChild) pa.insertBefore(mk.firstChild, mk);
        pa.removeChild(mk);
        try{ pa.normalize(); }catch(e2){}
      }
      _applyState = {};
      if(!saveAll(d)){ render(); return; }
      applyAll();
      render();
      toast("笔记已导入");
    };
    fr.readAsText(file, "utf-8");
  }

  function buildPanel(){
    panel = el("div", "notes-panel");
    panel.setAttribute("role", "complementary");
    panel.setAttribute("aria-label", "学习笔记面板");
    var head = el("div", "ntp-head");
    head.appendChild(el("span", null, "学习笔记"));
    head.appendChild(el("span", "ntp-badge", PID));
    var x = el("button", "ntp-x", "✕");
    x.title = "关闭"; x.setAttribute("aria-label", "关闭笔记面板");
    x.onclick = close;
    head.appendChild(x);
    panel.appendChild(head);

    var tools = el("div", "ntp-tools");
    var row1 = el("div", "ntp-row");
    var mb = el("button", "ntp-mode", "🖍 荧光笔");
    mb.onclick = function(){ toggleHlMode(); };
    row1.appendChild(mb);
    var dots = el("span", "ntp-row ntp-dots");
    dots.style.display = "none";
    var colors = [["y", "#e7c400", "黄色:概念"], ["g", "#3cb96a", "绿色:例子"], ["r", "#e0655f", "红色:疑问"]];
    for(var i = 0; i < colors.length; i++){
      (function(c){
        var d = el("button", "ntp-dot ntp-dot-" + c[0]);
        d.style.background = c[1]; d.style.color = c[1];
        d.title = c[2]; d.setAttribute("aria-label", c[2]);
        d.onclick = function(){
          hlColor = c[0];
          var all = dots.querySelectorAll(".ntp-dot");
          for(var k = 0; k < all.length; k++) all[k].classList.toggle("on", all[k] === d);
        };
        if(c[0] === "y") d.classList.add("on");
        dots.appendChild(d);
      })(colors[i]);
    }
    row1.appendChild(dots);
    tools.appendChild(row1);
    tools.appendChild(el("div", "ntp-hint", "打开荧光笔后,选中正文即可划线;划线只存本机"));
    var row2 = el("div", "ntp-row");
    _qInput = el("input", "ntp-q");
    _qInput.type = "text";
    _qInput.placeholder = "搜索本页笔记…";
    _qInput.setAttribute("aria-label", "搜索本页笔记");
    _qInput.oninput = render;
    row2.appendChild(_qInput);
    tools.appendChild(row2);
    panel.appendChild(tools);

    var add = el("div", "ntp-tools");
    var ta = el("textarea", "ntp-ta");
    ta.placeholder = "记点什么…(Ctrl+Enter 保存)";
    ta.onkeydown = function(e){ if((e.ctrlKey || e.metaKey) && e.key === "Enter") addText(); };
    add.appendChild(ta);
    var url = el("input", "ntp-url");
    url.type = "text"; url.placeholder = "链接 / 图片地址(http(s):// 或 ./ ../)";
    add.appendChild(url);
    var cap = el("input", "ntp-cap");
    cap.type = "text"; cap.placeholder = "题注(可选)";
    add.appendChild(cap);
    var btns = el("div", "ntp-btns");
    var b1 = el("button", "ntp-btn pri", "存文字");
    b1.onclick = addText;
    var b2 = el("button", "ntp-btn", "存链接");
    b2.onclick = function(){ addRef("link"); };
    var b3 = el("button", "ntp-btn", "存图片");
    b3.onclick = function(){ addRef("image"); };
    btns.appendChild(b1); btns.appendChild(b2); btns.appendChild(b3);
    add.appendChild(btns);
    panel.appendChild(add);

    _listBox = el("div", "ntp-list");
    panel.appendChild(_listBox);

    var foot = el("div", "ntp-foot");
    foot.appendChild(el("span", null, "仅存本机 · 不上传"));
    var sp = el("span"); sp.style.flex = "1"; foot.appendChild(sp);
    var ex = el("button", null, "导出");
    ex.title = "导出全部笔记为 JSON(换设备迁移)";
    ex.onclick = exportJson;
    foot.appendChild(ex);
    var im = el("button", null, "导入");
    im.title = "从备份 JSON 导入(覆盖现有)";
    im.onclick = function(){ filePick.click(); };
    foot.appendChild(im);
    var filePick = el("input");
    filePick.type = "file"; filePick.accept = ".json,application/json";
    filePick.style.display = "none";
    filePick.onchange = function(){ importJson(filePick.files && filePick.files[0]); filePick.value = ""; };
    foot.appendChild(filePick);
    panel.appendChild(foot);

    document.body.appendChild(panel);
  }

  function init(){
    try{
      var st = document.createElement("style");
      st.textContent = STYLE;
      document.head.appendChild(st);
    }catch(e){}
    var nav = document.querySelector(".topnav .nav-inner");
    if(nav){
      var b = el("button", "nav-notes");
      b.innerHTML = ICON;                 /* 静态图标字符串,无用户数据 */
      b.title = "学习笔记";
      b.setAttribute("aria-label", "学习笔记");
      b.onclick = toggle;
      var search = nav.querySelector(".nav-search");
      if(search) nav.insertBefore(b, search);
      else nav.appendChild(b);
    }
    buildPanel();
    try{ applyAll(); }catch(e){ _applyState = {}; }
    render();
    document.addEventListener("mouseup", onDocMouseUp, false);
    /* 点击正文划线 → 气泡;点空白处收起 */
    document.addEventListener("click", function(e){
      var t = e.target;
      var mk = (t && t.closest) ? t.closest("mark.notes-hl") : null;
      if(mk){ openPop(mk); return; }
      if(pop && !(t && pop.contains(t))) closePop();
    });
    window.addEventListener("scroll", function(){ closeQuick(); closePop(); }, { passive: true });
    document.addEventListener("keydown", function(e){
      if(e.key === "Escape"){
        if(quick || pop){ closeQuick(); closePop(); return; }
        if(panel.classList.contains("open")) close();
      }
    });
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  /* 单源 API:云端同步等扩展模块经此读写,禁止另写 localStorage 字面量 */
  window.SiteNotes = { loadAll: loadAll, saveAll: saveAll, getItems: getItems, typeName: typeName };
})();
