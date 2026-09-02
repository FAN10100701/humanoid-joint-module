/* ============================================================
   人形机器人学习站 · AI 悬浮内嵌聊天(V2.1.8 重做)
   - 玻璃拟态 AI 球:双主题自适应 + SVG 机器人头;可拖拽,
     释放贴边吸附(过冲回弹),位置记忆 localStorage
   - 位移 <6px 判定为点击(开面板);面板弹出侧跟随球所在边
   - 引擎复用 _assets/ai-assistant.js(配置/Key/历史与 13 页共用)
   - 自动携带当前页标题作为上下文;未配 Key 时面板内给引导
   由 site.js 注入本文件;加载失败静默
   ============================================================ */
(function(){
  "use strict";
  function boot(){
    if(document.getElementById("aiFabBtn")) return;
    if(!window.AIChat){                       /* 引擎未就绪:轮询等待(最多6s) */
      if((boot._t = (boot._t||0)+1) > 60) return;
      setTimeout(boot, 100);
      return;
    }
    var root = (window.PAGE && window.PAGE.root) || "";
    var chatURL = (root ? root + "/" : "") + "08_学习工具/13_AI答疑助手.html";
    var POS_KEY = "humanoid-ai-fab-pos-v1";

    var st = document.createElement("style");
    st.textContent =
      /* ---- 球体:双主题玻璃 ---- */
      ".ai-fab-btn{position:fixed;right:18px;bottom:76px;z-index:96;width:50px;height:50px;border-radius:16px;cursor:grab;" +
      "border:1px solid rgba(140,190,255,.4);color:#9ecbff;display:flex;align-items:center;justify-content:center;padding:0;" +
      "background:linear-gradient(160deg,rgba(34,54,96,.88),rgba(10,18,36,.94));backdrop-filter:blur(12px) saturate(140%);" +
      "box-shadow:0 10px 28px rgba(30,80,200,.4), inset 0 1px 0 rgba(160,200,255,.22);" +
      "transition:transform .25s cubic-bezier(.34,1.56,.64,1),box-shadow .3s,border-color .3s;touch-action:none}" +
      /* V2.1.12:呼吸光晕改由伪元素 opacity 动画承担(box-shadow 逐帧重绘→合成器透明度,省绘制) */
      ".ai-fab-btn::before{content:\"\";position:absolute;inset:-3px;border-radius:20px;pointer-events:none;box-shadow:0 12px 32px rgba(30,80,200,.5);opacity:.55;animation:aifGlow 3.6s ease-in-out infinite}" +
      ".ai-fab-btn.aif-drag::before{animation:none;opacity:0}" +
      ".ai-fab-btn svg{pointer-events:none}" +
      ".ai-fab-btn:hover{transform:translateY(-2px) scale(1.06);border-color:rgba(140,190,255,.7)}" +
      ".ai-fab-btn.aif-drag{cursor:grabbing;transition:none;transform:scale(1.1);animation:none;box-shadow:0 18px 44px rgba(30,80,200,.55)}" +
      ".ai-fab-btn.aif-snap{transition:left .45s cubic-bezier(.22,1.4,.36,1),top .45s cubic-bezier(.22,1.4,.36,1)}" +
      "body:not([data-theme]),body[data-theme='light'] .ai-fab-btn{color:#2563eb;border-color:rgba(37,99,235,.32);" +
      "background:rgba(255,255,255,.8);box-shadow:0 10px 26px rgba(37,99,235,.2), inset 0 1px 0 rgba(255,255,255,.9)}" +
      "body:not([data-theme]),body[data-theme='light'] .ai-fab-btn:hover{border-color:rgba(37,99,235,.6)}" +
      "body:not([data-theme]),body[data-theme='light'] .ai-fab-btn.aif-drag{box-shadow:0 18px 40px rgba(37,99,235,.3)}" +
      "@keyframes aifGlow{0%,100%{opacity:.4}50%{opacity:1}}" +
      "body:not([data-theme]),body[data-theme='light'] .ai-fab-btn::before{box-shadow:0 12px 30px rgba(37,99,235,.32)}" +
      /* ---- 面板(glass-panel 提供底色,内部元素双主题) ---- */
      ".ai-fab-panel{position:fixed;right:18px;bottom:134px;z-index:200;width:min(380px,92vw);height:min(540px,72vh);" +
      "border-radius:var(--gr-lg);overflow:hidden;display:none;flex-direction:column;" +
      "box-shadow:0 30px 80px rgba(0,0,0,.55);backdrop-filter:blur(22px) saturate(150%);transform-origin:bottom right;animation:ddPop .42s cubic-bezier(.34,1.56,.64,1) both}" +
      ".ai-fab-panel.open{display:flex}" +
      ".aif-head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid rgba(140,190,255,.16);color:#eef4fb;font-size:13.5px;font-weight:700;cursor:move;user-select:none;background:linear-gradient(rgba(140,190,255,.08),transparent)}" +
      ".aif-head .sp{margin-left:auto;display:flex;gap:6px}" +
      ".aif-head button{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#c9d1d9;font-size:11.5px;padding:4px 10px;border-radius:8px;cursor:pointer;font-family:inherit}" +
      ".aif-head button:hover{border-color:#58a6ff;color:#fff}" +
      ".aif-msgs{flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:10px}" +
      ".aif-msgs .m{max-width:88%;padding:9px 12px;border-radius:12px;font-size:13px;line-height:1.75;white-space:pre-wrap;word-break:break-word}" +
      ".aif-msgs .m.u{align-self:flex-end;background:rgba(88,166,255,.16);border:1px solid rgba(88,166,255,.3);color:#dbe6f5}" +
      ".aif-msgs .m.b{align-self:flex-start;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);color:#c9d1d9}" +
      ".aif-msgs .m.err{align-self:flex-start;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.35);color:#fca5a5;font-size:12.5px}" +
      ".aif-empty{margin:auto;text-align:center;color:#7d8a9c;font-size:12.5px;line-height:2.1;padding:0 18px}" +
      ".aif-empty a{color:#58a6ff}" +
      ".aif-bar{display:flex;gap:8px;padding:10px 12px;border-top:1px solid rgba(255,255,255,.08)}" +
      ".aif-bar textarea{flex:1;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:11px;color:#e6edf3;font-size:13px;padding:9px 12px;resize:none;height:42px;max-height:110px;outline:none;font-family:inherit}" +
      ".aif-bar textarea:focus{border-color:#58a6ff}" +
      ".aif-bar button{border:none;border-radius:11px;padding:0 16px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;color:#fff;background:linear-gradient(135deg,#2563eb,#3b82f6)}" +
      ".aif-bar button.stop{background:linear-gradient(135deg,#dc2626,#ef4444)}" +
      /* ---- 面板浅色主题 ---- */
      "body:not([data-theme]) .ai-fab-panel,body[data-theme='light'] .ai-fab-panel{box-shadow:0 24px 70px rgba(40,70,130,.25)}" +
      "body:not([data-theme]) .aif-head,body[data-theme='light'] .aif-head{color:#0f172a;border-bottom-color:rgba(60,80,120,.14);background:linear-gradient(rgba(37,99,235,.06),transparent)}" +
      "body:not([data-theme]) .aif-head button,body[data-theme='light'] .aif-head button{background:rgba(37,99,235,.06);border-color:rgba(37,99,235,.22);color:#475569}" +
      "body:not([data-theme]) .aif-head button:hover,body[data-theme='light'] .aif-head button:hover{border-color:#2563eb;color:#1e3a8a}" +
      "body:not([data-theme]) .aif-msgs .m.u,body[data-theme='light'] .aif-msgs .m.u{background:rgba(37,99,235,.08);border-color:rgba(37,99,235,.25);color:#1e3a8a}" +
      "body:not([data-theme]) .aif-msgs .m.b,body[data-theme='light'] .aif-msgs .m.b{background:rgba(60,80,120,.05);border-color:rgba(60,80,120,.16);color:#334155}" +
      "body:not([data-theme]) .aif-msgs .m.err,body[data-theme='light'] .aif-msgs .m.err{color:#b91c1c}" +
      "body:not([data-theme]) .aif-empty,body[data-theme='light'] .aif-empty{color:#64748b}" +
      "body:not([data-theme]) .aif-empty a,body[data-theme='light'] .aif-empty a{color:#2563eb}" +
      "body:not([data-theme]) .aif-bar,body[data-theme='light'] .aif-bar{border-top-color:rgba(60,80,120,.12)}" +
      "body:not([data-theme]) .aif-bar textarea,body[data-theme='light'] .aif-bar textarea{background:rgba(255,255,255,.7);border-color:rgba(60,80,120,.2);color:#0f172a}" +
      "body:not([data-theme]) .aif-bar textarea:focus,body[data-theme='light'] .aif-bar textarea:focus{border-color:#2563eb}" +
      "@media (max-width:640px){.ai-fab-panel{left:8px !important;right:8px !important;width:auto}}";
    document.head.appendChild(st);

    /* ---------- DOM ---------- */
    var SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<rect x="4.5" y="8.2" width="15" height="10.3" rx="3.2"/>'
      + '<circle cx="9.3" cy="13.2" r="1.15" fill="currentColor" stroke="none"/>'
      + '<circle cx="14.7" cy="13.2" r="1.15" fill="currentColor" stroke="none"/>'
      + '<path d="M12 8.2V5.4"/><circle cx="12" cy="4.2" r="1.2"/>'
      + '<path d="M4.5 12.6H2.9M21.1 12.6h-1.6"/>'
      + '</svg>';

    var btn = document.createElement("button");
    btn.id = "aiFabBtn"; btn.className = "ai-fab-btn";
    btn.innerHTML = SVG;
    btn.title = "AI 答疑(点击提问,可拖动)"; btn.setAttribute("aria-label", "AI 答疑");
    document.body.appendChild(btn);

    var panel = document.createElement("div");
    panel.className = "ai-fab-panel glass-panel";
    panel.innerHTML =
      '<div class="aif-head">🤖 AI 答疑<span class="sp">' +
      '<button data-a="full" title="打开完整版">⧉</button>' +
      '<button data-a="min" title="收起">—</button></span></div>' +
      '<div class="aif-msgs" id="aifMsgs"><div class="aif-empty">直接输入问题,回车发送 ✦<br>回答基于你配置的 API Key<br><a href="' + chatURL + '">配置 / 完整版 →</a></div></div>' +
      '<div class="aif-bar"><textarea id="aifIn" rows="1" placeholder="输入问题,回车发送…"></textarea><button id="aifSend">➤</button></div>';
    document.body.appendChild(panel);

    var msgs = panel.querySelector("#aifMsgs"), input = panel.querySelector("#aifIn"),
        sendBtn = panel.querySelector("#aifSend");
    var history = [];   /* {role, content} 本面板会话(轻量,不与13页历史混存) */
    var ctxPage = (document.title || "").replace(/^人形机器人学习站\s*·\s*/, "");

    /* ---------- 球体定位:拖拽 / 贴边吸附 / 位置记忆 ---------- */
    var panelSide = "r";                                  /* 面板弹出侧跟随球 */
    function clampY(y){
      var h = btn.offsetHeight || 50;
      return Math.max(60, Math.min(window.innerHeight - h - 12, y));
    }
    function place(x, y, anim){
      if(anim) btn.classList.add("aif-snap"); else btn.classList.remove("aif-snap");
      var w = btn.offsetWidth || 50;
      x = Math.max(8, Math.min(window.innerWidth - w - 8, x));
      btn.style.left = x + "px"; btn.style.top = clampY(y) + "px";
      btn.style.right = "auto"; btn.style.bottom = "auto";
    }
    function savePos(side, y){
      try{ localStorage.setItem(POS_KEY, JSON.stringify({ side:side, y:Math.round(y) })); }catch(e){}
    }
    function edgeSnap(anim){
      var x = parseFloat(btn.style.left) || 0, y = parseFloat(btn.style.top) || 0;
      var w = btn.offsetWidth || 50;
      var side = (x + w / 2 < window.innerWidth / 2) ? "l" : "r";
      var nx = side === "l" ? 12 : window.innerWidth - w - 12;
      place(nx, y, anim);
      savePos(side, parseFloat(btn.style.top));
      panelSide = side;
      return side;
    }
    (function restore(){
      var p = null;
      try{ p = JSON.parse(localStorage.getItem(POS_KEY) || "null"); }catch(e){}
      if(p && (p.side === "l" || p.side === "r") && typeof p.y === "number"){
        panelSide = p.side;
        place(p.side === "l" ? 12 : window.innerWidth - (btn.offsetWidth || 50) - 12, clampY(p.y), false);
      }                                        /* 无记忆:保持 CSS 默认 right/bottom */
    })();
    window.addEventListener("resize", function(){
      if(btn.style.left) place(parseFloat(btn.style.left), parseFloat(btn.style.top), false);
    });

    var dragging = false, moved = false, sx = 0, sy = 0, bx = 0, by = 0;
    btn.addEventListener("pointerdown", function(e){
      if(e.button) return;
      dragging = true; moved = false;
      sx = e.clientX; sy = e.clientY;
      var r = btn.getBoundingClientRect(); bx = r.left; by = r.top;
      if(btn.setPointerCapture) try{ btn.setPointerCapture(e.pointerId); }catch(err){}
    });
    btn.addEventListener("pointermove", function(e){
      if(!dragging) return;
      if(!moved && Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) < 6) return;
      moved = true;
      btn.classList.add("aif-drag");
      place(bx + (e.clientX - sx), by + (e.clientY - sy), false);
    });
    btn.addEventListener("pointerup", function(){
      if(!dragging) return;
      dragging = false;
      btn.classList.remove("aif-drag");
      if(!moved){ toggle(); return; }         /* 位移阈值内=点击,不误触 */
      edgeSnap(true);
    });
    btn.addEventListener("pointercancel", function(){
      dragging = false;
      btn.classList.remove("aif-drag");
      if(moved) edgeSnap(true);
    });

    /* ---------- 聊天逻辑 ---------- */
    function scrollEnd(){ msgs.scrollTop = msgs.scrollHeight; }
    function addMsg(cls, text){
      var d = document.createElement("div");
      d.className = "m " + cls;
      d.textContent = text;
      msgs.appendChild(d); scrollEnd();
      return d;
    }
    function needKey(){
      var c = window.AIChat.getConfig();
      if(c.key) return true;
      addMsg("err", "还没有配置 API Key:点击右上角 ⧉ 打开完整版,在配置面板选择 DeepSeek/豆包并填入 Key(仅保存在本机浏览器)。配置一次,全站可用。");
      return false;
    }
    function send(){
      var text = input.value.trim();
      if(!text || window.AIChat.busy()) return;
      if(!needKey()){ return; }
      history.push({ role:"user", content:text });
      addMsg("u", text);
      input.value = input.style.height = "";
      var b = addMsg("b", "…");
      sendBtn.className = "stop"; sendBtn.textContent = "⏹";
      window.AIChat.chat(
        window.AIChat.buildMessages(history.slice(-14), text, ctxPage),
        { onDelta: function(_, full){ b.textContent = full; scrollEnd(); } }
      ).then(function(full){
        sendBtn.className = ""; sendBtn.textContent = "➤";
        if(full){ history.push({ role:"assistant", content:full }); b.textContent = full; }
        else b.textContent = "(已停止)";
        scrollEnd();
      }).catch(function(err){
        sendBtn.className = ""; sendBtn.textContent = "➤";
        b.className = "m err";
        b.textContent = (err && err.message) || String(err);
        scrollEnd();
      });
    }
    sendBtn.onclick = function(){ if(window.AIChat.busy()) window.AIChat.abort(); else send(); };
    input.addEventListener("keydown", function(e){
      if(e.key === "Enter" && !e.shiftKey){ e.preventDefault(); send(); }
    });
    input.addEventListener("input", function(){
      this.style.height = "auto"; this.style.height = Math.min(this.scrollHeight, 110) + "px";
    });

    /* ---------- 开合(面板弹出侧跟随球所在边) ---------- */
    function layoutPanel(){
      if(window.innerWidth <= 640) return;    /* 窄屏由 CSS 全宽接管 */
      if(panelSide === "l"){ panel.style.left = "12px"; panel.style.right = "auto"; }
      else{ panel.style.right = "18px"; panel.style.left = "auto"; }
      panel.style.transformOrigin = panelSide === "l" ? "bottom left" : "bottom right";
    }
    function toggle(){
      var opening = !panel.classList.contains("open");
      if(opening) layoutPanel();
      panel.classList.toggle("open", opening);
      btn.style.display = opening ? "none" : "flex";
      if(opening){
        needKey();
        setTimeout(function(){ input.focus(); }, 60);
      }
    }
    /* 头部拖动移动面板(保留) */
    var head = panel.querySelector(".aif-head"), hdrag = false, dx0 = 0, dy0 = 0, pl = 0, pt = 0;
    head.addEventListener("pointerdown", function(e){
      if(e.target.tagName === "BUTTON") return;
      hdrag = true;
      var r = panel.getBoundingClientRect();
      pl = r.left; pt = r.top;
      dx0 = e.clientX - pl; dy0 = e.clientY - pt;
      panel.style.right = "auto"; panel.style.bottom = "auto";
      panel.style.left = pl + "px"; panel.style.top = pt + "px";
      if(head.setPointerCapture) try{ head.setPointerCapture(e.pointerId); }catch(err){}
    });
    head.addEventListener("pointermove", function(e){
      if(!hdrag) return;
      panel.style.left = Math.max(6, Math.min(innerWidth - 120, e.clientX - dx0)) + "px";
      panel.style.top = Math.max(6, Math.min(innerHeight - 80, e.clientY - dy0)) + "px";
    });
    head.addEventListener("pointerup", function(){ hdrag = false; });
    panel.querySelector('[data-a="min"]').onclick = function(){ panel.classList.remove("open"); btn.style.display = "flex"; };
    panel.querySelector('[data-a="full"]').onclick = function(){
      window.location.href = chatURL + "?q=" + encodeURIComponent(input.value || "");
    };
  }
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
