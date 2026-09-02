/* ============================================================
   人形机器人学习站 · AI 答疑引擎(_assets/ai-assistant.js)
   功能: 多供应商(DeepSeek / 豆包·火山方舟 / 自定义 OpenAI 兼容)流式对话
   安全: API Key 仅保存在本机浏览器 localStorage,绝不写入代码或发往本站
         (本站是纯静态站,无后端);请求由浏览器直连你所选的 API 服务商
   依赖: 无(ES5);KaTeX 按需加载用于渲染公式
   ============================================================ */
(function(){
  "use strict";
  var AIC = window.AIChat = {};

  /* ---------- 常量与预设 ---------- */
  var CFG_KEY  = "humanoid-ai-config-v1";   /* {provider, baseURL, model, key, persona} */
  var USE_KEY  = "humanoid-ai-usage-v1";    /* {calls, chars} 本机请求计数 */
  var CHAT_KEY = "humanoid-ai-chat-v1";     /* {sessions:[{id,title,ts,msgs}], cur} */

  AIC.PROVIDERS = {
    deepseek: { name:"DeepSeek", base:"https://api.deepseek.com",
      models:["deepseek-chat","deepseek-reasoner"],
      hint:"在 platform.deepseek.com 充值后创建 API Key(sk- 开头)" },
    ark: { name:"豆包 · 火山方舟", base:"https://ark.cn-beijing.volces.com/api/v3",
      models:["doubao-seed-1-6-flash-250715","doubao-1-5-pro-32k-250115","doubao-1-5-lite-32k-250115","ep-你的接入点ID"],
      hint:"在火山方舟控制台开通模型/创建接入点,model 填模型名或 ep- 接入点 ID" },
    custom: { name:"自定义(OpenAI 兼容)", base:"", models:[],
      hint:"填任意兼容 /chat/completions 的 baseURL(如自建中转、其它云厂商)" }
  };

  var SITE_CTX = "背景:用户正在「人形机器人关节模组学习站」(cyco.top)学习,站点体系覆盖:一体化关节机械结构(谐波/行星/RV减速器、连杆丝杠)、无框力矩电机选型、FOC驱动器硬件(功率级/栅驱/电流采样/PCB)、FOC三环控制与SVPWM、PID与ADRC、嵌入式(STM32/C/C++/FreeRTOS/CAN)、ROS2与仿真(MuJoCo/Isaac)、人形机器人前沿(WBC/MPC/VLA)。回答时可结合该知识体系举例。";

  AIC.PERSONAS = {
    interviewer: { icon:"🎓", name:"复试考官",
      sys:"你是一位资深的机器人/自动化方向研究生复试面试考官,严格但友善。" +
          "规则:每次只问一个问题,等学生回答后再点评(指出亮点、不足、更专业的表述),然后基于学生的回答深入追问 1 层,循序渐进。" +
          "不要一次抛出多个问题;学生回答跑题时温和拉回;每 3~4 轮给一次小结评价与改进建议。" },
    tutor: { icon:"📚", name:"课程助教",
      sys:"你是学习站的课程助教,讲解风格:先给结论,再讲原理,配公式(LaTeX 用 $$...$$)、表格、列表与工程实例,深入浅出、通俗易懂。" +
          "涉及站内主题时优先用关节模组语境举例(电机、减速器、FOC、三环、ROS)。回答控制在必要长度,不啰嗦。" },
    coder: { icon:"💻", name:"代码助手",
      sys:"你是嵌入式与机器人方向的技术助手。回答优先给可运行/可编译的代码片段并注明平台(如 STM32 HAL / FreeRTOS / ROS2 Humble)," +
          "指出常见坑(volatile、中断安全、内存、线程安全);代码放在 ``` 代码块中;关键行加中文注释。" },
    free: { icon:"💬", name:"自由问答",
      sys:"你是一个知识渊博、简洁友善的中文助手,回答准确、结构清晰,可用 Markdown 与 LaTeX 公式。" }
  };

  /* ---------- 配置 ---------- */
  AIC.getConfig = function(){
    try{ return JSON.parse(localStorage.getItem(CFG_KEY) || "{}"); }catch(e){ return {}; }
  };
  AIC.setConfig = function(cfg){
    try{ localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); }catch(e){}
  };
  AIC.clearKey = function(){
    var c = AIC.getConfig(); delete c.key; AIC.setConfig(c);
  };
  AIC.getUsage = function(){
    try{ return JSON.parse(localStorage.getItem(USE_KEY) || '{"calls":0,"chars":0}'); }catch(e){ return {calls:0,chars:0}; }
  };
  function bumpUsage(chars){
    var u = AIC.getUsage();
    u.calls++; u.chars += chars || 0;
    try{ localStorage.setItem(USE_KEY, JSON.stringify(u)); }catch(e){}
  }
  AIC.resetUsage = function(){
    try{ localStorage.setItem(USE_KEY, JSON.stringify({calls:0,chars:0})); }catch(e){}
  };

  /* ---------- 会话历史 ---------- */
  AIC.getChats = function(){
    try{ return JSON.parse(localStorage.getItem(CHAT_KEY) || '{"sessions":[],"cur":null}'); }catch(e){ return {sessions:[],cur:null}; }
  };
  AIC.saveChats = function(c){
    try{
      if(c.sessions.length > 10) c.sessions = c.sessions.slice(-10); /* 只保留最近 10 个会话 */
      localStorage.setItem(CHAT_KEY, JSON.stringify(c));
    }catch(e){}
  };
  AIC.newSession = function(){
    var c = AIC.getChats();
    var s = { id:"s" + Date.now(), title:"新会话", ts:Date.now(), msgs:[] };
    c.sessions.push(s); c.cur = s.id;
    AIC.saveChats(c);
    return s;
  };
  AIC.curSession = function(){
    var c = AIC.getChats();
    for(var i = 0; i < c.sessions.length; i++)
      if(c.sessions[i].id === c.cur) return c.sessions[i];
    return AIC.newSession();
  };
  AIC.delSession = function(id){
    var c = AIC.getChats();
    c.sessions = c.sessions.filter(function(s){ return s.id !== id; });
    if(c.cur === id) c.cur = c.sessions.length ? c.sessions[c.sessions.length-1].id : null;
    AIC.saveChats(c);
  };

  /* ---------- 对话请求(流式 SSE) ---------- */
  var curCtrl = null;
  AIC.abort = function(){ if(curCtrl){ try{ curCtrl.abort(); }catch(e){} curCtrl = null; } };
  AIC.busy = function(){ return !!curCtrl; };

  AIC.chat = function(messages, opt){
    opt = opt || {};
    var cfg = AIC.getConfig();
    var base = (cfg.baseURL || AIC.PROVIDERS.deepseek.base).replace(/\/+$/,"");
    var model = cfg.model || "deepseek-chat";
    var key = cfg.key || "";
    var url = base + "/chat/completions";

    return new Promise(function(resolve, reject){
      if(!key){ reject({ status:0, message:"尚未填写 API Key。展开「⚙️ 供应商与密钥配置」,填写后点「保存」。Key 只保存在本机浏览器。" }); return; }
      curCtrl = new AbortController();
      var full = "";
      fetch(url, {
        method:"POST",
        signal:curCtrl.signal,
        headers:{ "Content-Type":"application/json", "Authorization":"Bearer " + key },
        body:JSON.stringify({ model:model, messages:messages, stream:true, temperature:opt.temperature || 0.7, max_tokens:opt.maxTokens || 2048 })
      }).then(function(res){
        if(!res.ok){
          res.json().catch(function(){ return null; }).then(function(j){
            var msg = (j && j.error && (j.error.message || j.error.code)) || (res.status + " " + res.statusText);
            reject({ status:res.status, message:friendly(res.status, msg) });
          });
          curCtrl = null;
          return;
        }
        var reader = res.body.getReader();
        var dec = new TextDecoder("utf-8");
        var buf = "";
        (function pump(){
          reader.read().then(function(r){
            if(r.done){ curCtrl = null; bumpUsage(full.length); resolve(full); return; }
            buf += dec.decode(r.value, { stream:true });
            var lines = buf.split("\n");
            buf = lines.pop();
            for(var i = 0; i < lines.length; i++){
              var line = lines[i].trim();
              if(line.indexOf("data:") !== 0) continue;
              var data = line.slice(5).trim();
              if(data === "[DONE]") continue;
              try{
                var j = JSON.parse(data);
                var d = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
                if(d){ full += d; if(opt.onDelta) opt.onDelta(d, full); }
              }catch(e){}
            }
            pump();
          }).catch(function(err){
            curCtrl = null;
            if(err && err.name === "AbortError"){ resolve(full); }
            else reject({ status:0, message:"读取响应流失败:" + (err && err.message || err) });
          });
        })();
      }).catch(function(err){
        curCtrl = null;
        if(err && err.name === "AbortError"){ resolve(full); return; }
        reject({ status:0, message:"连接失败:浏览器无法访问该接口(" + url + ")。可能原因:①网络不通;②该服务商不允许浏览器直连(CORS 跨域拦截)——可换用 DeepSeek 或在「自定义」里填你信任的中转地址;③ baseURL 填写有误。原始错误:" + (err && err.message || err) });
      });
    });
  };
  function friendly(status, msg){
    if(status === 401) return "API Key 无效或未授权(401):请检查 Key 是否复制完整、是否属于所选服务商。服务端提示:" + msg;
    if(status === 402 || status === 403) return "余额不足或无权限(" + status + "):请到服务商控制台检查余额/开通对应模型。提示:" + msg;
    if(status === 404) return "接口路径或模型名不存在(404):检查 baseURL 是否以 https://… 开头、model 拼写是否正确。提示:" + msg;
    if(status === 429) return "请求过于频繁或触发限流(429):稍等几秒重试;免费额度有速率上限。提示:" + msg;
    if(status >= 500) return "服务商内部错误(" + status + "),请稍后重试。提示:" + msg;
    return "请求失败(" + status + "):" + msg;
  }

  /* ---------- 组装 messages(系统提示 + 人设 + 学科上下文) ---------- */
  AIC.buildMessages = function(history, userText, ctxSubject){
    var cfg = AIC.getConfig();
    var persona = AIC.PERSONAS[cfg.persona] || AIC.PERSONAS.tutor;
    var sys = persona.sys + "\n" + SITE_CTX;
    if(ctxSubject) sys += "\n当前聚焦学科:「" + ctxSubject + "」,回答尽量围绕该学科展开。";
    var msgs = [{ role:"system", content:sys }];
    for(var i = 0; i < history.length; i++)
      msgs.push({ role:history[i].role, content:history[i].content });
    msgs.push({ role:"user", content:userText });
    return msgs;
  };

  /* ---------- Markdown-lite 渲染(转义→代码块→行内元素→公式占位→段落/列表/表格) ---------- */
  AIC.md = function(src){
    var math = [];
    function stashMath(tex, disp){ math.push({ tex:tex, disp:disp }); return "\u0001M" + (math.length-1) + "\u0001"; }
    var s = String(src == null ? "" : src);
    /* 先抽走数学($$..$$ 优先,再 $..$;避免误伤代码块,先抽代码再抽数学,这里顺序:代码→数学→行内) */
    var codes = [];
    s = s.replace(/```([\w+-]*)\n?([\s\S]*?)```/g, function(m, lang, code){
      codes.push({ lang:lang, code:code });
      return "\u0001C" + (codes.length-1) + "\u0001";
    });
    s = s.replace(/\$\$([\s\S]+?)\$\$/g, function(m, t){ return stashMath(t, true); });
    s = s.replace(/(^|[^\\$])\$([^$\n]+?)\$/g, function(m, pre, t){ return pre + stashMath(t, false); });
    /* 转义 */
    s = s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    /* 行内元素 */
    s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");
    s = s.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
    /* 表格(连续 | 行) */
    s = s.replace(/(^\|.+\|\s*\n)+/gm, function(block){
      var rows = block.trim().split("\n").map(function(r){ return r.trim(); });
      var html = "", seenSep = false;
      html += "<div class='table-wrap'><table>";
      for(var i = 0; i < rows.length; i++){
        if(/^\|[\s:|-]+\|$/.test(rows[i])){ seenSep = true; continue; }
        var cells = rows[i].slice(1,-1).split("|");
        var tag = (i === 0 || !seenSep) ? "th" : "td";
        html += "<tr>";
        for(var j = 0; j < cells.length; j++) html += "<" + tag + ">" + cells[j].trim() + "</" + tag + ">";
        html += "</tr>";
      }
      return html + "</table></div>";
    });
    /* 逐行:标题/列表/引用/普通段 */
    var out = "", inUl = false, inOl = false, para = [];
    function flushP(){
      if(para.length){ out += "<p>" + para.join("<br>") + "</p>"; para = []; }
    }
    var lines = s.split("\n");
    for(var k = 0; k < lines.length; k++){
      var ln = lines[k];
      var h = ln.match(/^(#{1,4})\s+(.*)$/);
      if(h){ flushP(); if(inUl){out+="</ul>";inUl=false;} if(inOl){out+="</ol>";inOl=false;}
        out += "<h4>" + h[2] + "</h4>"; continue; }
      if(/^\s*[-*]\s+/.test(ln)){
        if(inOl){ out += "</ol>"; inOl = false; }
        if(!inUl){ flushP(); out += "<ul>"; inUl = true; }
        out += "<li>" + ln.replace(/^\s*[-*]\s+/,"") + "</li>"; continue;
      }
      if(/^\s*\d+[.、)]\s+/.test(ln)){
        if(inUl){ out += "</ul>"; inUl = false; }
        if(!inOl){ flushP(); out += "<ol>"; inOl = true; }
        out += "<li>" + ln.replace(/^\s*\d+[.、)]\s+/,"") + "</li>"; continue;
      }
      if(/^\s*>\s?/.test(ln)){ flushP(); out += "<blockquote>" + ln.replace(/^\s*>\s?/,"") + "</blockquote>"; continue; }
      if(/^\s*$/.test(ln)){
        flushP();
        if(inUl){ out += "</ul>"; inUl = false; }
        if(inOl){ out += "</ol>"; inOl = false; }
        continue;
      }
      para.push(ln);
    }
    flushP(); if(inUl) out += "</ul>"; if(inOl) out += "</ol>";
    /* 回填代码块与公式 */
    out = out.replace(/\u0001C(\d+)\u0001/g, function(m, i){
      return "<pre><code>" + codes[+i].code.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;") + "</code></pre>";
    });
    out = out.replace(/\u0001M(\d+)\u0001/g, function(m, i){
      return "<span class='ai-math' data-disp='" + (math[+i].disp?1:0) + "'>" + math[+i].tex.replace(/</g,"&lt;") + "</span>";
    });
    return out;
  };

  /* ---------- KaTeX 按需加载与公式渲染 ---------- */
  AIC.renderMath = function(scope){
    var els = (scope || document).querySelectorAll(".ai-math:not([data-done])");
    if(!els.length) return;
    for(var i = 0; i < els.length; i++) els[i].setAttribute("data-done","1");
    function doRender(){
      var all = document.querySelectorAll(".ai-math[data-done='1']");
      for(var i = 0; i < all.length; i++){
        try{
          window.katex.render(all[i].textContent, all[i],
            { throwOnError:false, displayMode:all[i].getAttribute("data-disp") === "1" });
        }catch(e){}
        all[i].setAttribute("data-done","2");
      }
    }
    if(window.katex){ doRender(); return; }
    /* V2.1.7:统一走 site.js 的 KatexLoader 单源加载器(JS+CSS 四级回退)。
       此前本处为 npmmirror 单源且无 onerror 回退,与 site.js 实现已漂移;
       site.js 不在场的兜底直接回调,doRender 内 try/catch 保持 LaTeX 原文 */
    (window.KatexLoader || { ensure:function(cb){ cb(); } }).ensure(doRender);
  };
})();
