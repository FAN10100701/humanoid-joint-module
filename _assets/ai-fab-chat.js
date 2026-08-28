/* ============================================================
   人形机器人学习站 · AI 悬浮内嵌聊天(V2.1.3)
   - 右下角玻璃 AI 圆钮:点击原地面板展开,直接提问,流式回答
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

    var st = document.createElement("style");
    st.textContent =
      ".ai-fab-btn{position:fixed;right:18px;bottom:76px;z-index:96;width:48px;height:48px;border-radius:50%;border:1px solid rgba(140,190,255,.45);cursor:pointer;" +
      "background:radial-gradient(circle at 30% 25%, rgba(140,190,255,.35), rgba(20,40,80,.9) 60%),linear-gradient(160deg,#123,#0a1428);" +
      "color:#dceaff;font-size:20px;display:flex;align-items:center;justify-content:center;" +
      "box-shadow:0 10px 30px rgba(30,80,200,.45), inset 0 0 18px rgba(120,180,255,.18);animation:aifPulse 3.2s ease-in-out infinite;transition:transform .25s cubic-bezier(.34,1.56,.64,1)}" +
      ".ai-fab-btn:hover{transform:scale(1.1)}.ai-fab-btn:active{animation:ddJelly .5s ease}" +
      "@keyframes aifPulse{0%,100%{box-shadow:0 10px 30px rgba(30,80,200,.45), inset 0 0 18px rgba(120,180,255,.18)}50%{box-shadow:0 10px 36px rgba(30,80,200,.65), inset 0 0 26px rgba(120,180,255,.3)}}" +
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
      "@media (max-width:640px){.ai-fab-panel{right:8px;left:8px;width:auto}}";
    document.head.appendChild(st);

    /* ---------- DOM ---------- */
    var btn = document.createElement("button");
    btn.id = "aiFabBtn"; btn.className = "ai-fab-btn"; btn.innerHTML = "🤖";
    btn.title = "AI 答疑(点开直接问)";
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

    /* ---------- 开合 ---------- */
    function toggle(){
      var opening = !panel.classList.contains("open");
      panel.classList.toggle("open", opening);
      btn.style.display = opening ? "none" : "flex";
      if(opening){
        needKey();
        setTimeout(function(){ input.focus(); }, 60);
      }
    }
    btn.onclick = toggle;
    /* 头部拖动移动面板 */
    var head = panel.querySelector(".aif-head"), dragging = false, dx0 = 0, dy0 = 0, pl = 0, pt = 0;
    head.addEventListener("pointerdown", function(e){
      if(e.target.tagName === "BUTTON") return;
      dragging = true;
      var r = panel.getBoundingClientRect();
      pl = r.left; pt = r.top;
      dx0 = e.clientX - pl; dy0 = e.clientY - pt;
      panel.style.right = "auto"; panel.style.bottom = "auto";
      panel.style.left = pl + "px"; panel.style.top = pt + "px";
      head.setPointerCapture && head.setPointerCapture(e.pointerId);
    });
    head.addEventListener("pointermove", function(e){
      if(!dragging) return;
      panel.style.left = Math.max(6, Math.min(innerWidth - 120, e.clientX - dx0)) + "px";
      panel.style.top = Math.max(6, Math.min(innerHeight - 80, e.clientY - dy0)) + "px";
    });
    head.addEventListener("pointerup", function(){ dragging = false; });
    panel.querySelector('[data-a="min"]').onclick = function(){ panel.classList.remove("open"); btn.style.display = "flex"; };
    panel.querySelector('[data-a="full"]').onclick = function(){
      window.location.href = chatURL + "?q=" + encodeURIComponent(input.value || "");
    };
  }
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
