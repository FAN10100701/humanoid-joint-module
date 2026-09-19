/* ============================================================
   人形机器人学习站 · PocketBase 集成层(阶段一本地闭环)  _assets/pb.js
   依赖: notes.js 先行加载(暴露 window.SiteNotes 单源 API)
   能力:
   1. 笔记云同步 —— notes 集合(user 关联,itemId 唯一索引),
      本地/云端按条目 ts 最后写入胜(LWW),双向补差
   2. 教师补充 —— content 集合(pageId 唯一,公开读/登录可写,阶段一单教师口径),
      有内容则在 page-head 下方注入「📢 教师补充」讲义框,登录用户可编辑
   边界与降级:
   - /api/health 不可达 → 仅保留「☁ 未连接」入口,其余静默,不影响页面
   - 线上 HTTPS 站调本地 http 端点属混合内容,浏览器拦截 —— 本地闭环仅限
     本地预览(http://127.0.0.1:8123);线上启用需阶段三 HTTPS 部署
   - 密码不落盘:email 存 localStorage,token 存 sessionStorage(会话级)
   - 教师内容展示前强制过 Site.sanitizeHTML 白名单消毒(跨用户内容红线)
   ============================================================ */
(function(){
  "use strict";
  if(window.__SitePBLoaded) return;
  window.__SitePBLoaded = true;

  var P = window.PAGE || {};
  if(!P.pageId) return;                       /* 仅内容页 */
  var S = window.Site || {};
  var toast = function(m, ms){ if(S.toast) S.toast(m, ms); };
  var sanitize = function(h){ return (S && S.sanitizeHTML) ? S.sanitizeHTML(h) : ""; };

  var CFG_KEY = "site-pb-config-v1";          /* { endpoint, email } */
  var TOKEN_KEY = "site-pb-token";            /* sessionStorage 会话级 */
  var DEFAULT_EP = "http://127.0.0.1:8090";
  var st = { endpoint: DEFAULT_EP, email: "", token: "", uid: "", role: "", ready: false };

  function el(tag, cls, text){ var e = document.createElement(tag); if(cls) e.className = cls; if(text != null) e.textContent = text; return e; }
  function esc(s){ return (S && S.esc) ? S.esc(s) : String(s == null ? "" : s); }

  function loadCfg(){
    try{
      var d = JSON.parse(localStorage.getItem(CFG_KEY) || "{}");
      if(d && d.endpoint) st.endpoint = d.endpoint;
      if(d && d.email) st.email = d.email;
    }catch(e){}
    try{ st.token = sessionStorage.getItem(TOKEN_KEY) || ""; }catch(e){}
  }
  function saveCfg(){
    try{ localStorage.setItem(CFG_KEY, JSON.stringify({ endpoint: st.endpoint, email: st.email })); }catch(e){}
    try{ if(st.token) sessionStorage.setItem(TOKEN_KEY, st.token); else sessionStorage.removeItem(TOKEN_KEY); }catch(e){}
  }

  /* ---------- PB REST(零依赖 fetch) ---------- */
  function api(method, path, body, auth){
    var headers = { "Content-Type": "application/json" };
    if(auth && st.token) headers.Authorization = st.token;
    return fetch(st.endpoint + path, {
      method: method,
      headers: headers,
      body: body ? JSON.stringify(body) : undefined
    }).then(function(r){
      return r.json().catch(function(){ return {}; }).then(function(j){
        if(!r.ok){ var err = new Error((j && j.message) || ("HTTP " + r.status)); err.code = (j && j.code) || 0; throw err; }
        return j;
      });
    });
  }
  function ping(){
    return fetch(st.endpoint + "/api/health", { method: "GET" })
      .then(function(r){ return r.ok; })
      .catch(function(){ return false; });
  }
  function login(email, pass){
    return api("POST", "/api/collections/users/auth-with-password", { identity: email, password: pass }, false)
      .then(function(j){
        st.token = j.token; st.uid = j.record && j.record.id; st.role = (j.record && j.record.role) || "";
        st.email = email; saveCfg();
        return j;
      });
  }

  /* ---------- 笔记云同步:LWW 双向补差 ---------- */
  function flattenLocal(store){
    var out = [];
    for(var pid in store.pages){
      var items = (store.pages[pid] && store.pages[pid].items) || [];
      for(var i = 0; i < items.length; i++) out.push({ pageId: pid, item: items[i] });
    }
    return out;
  }
  function doSync(){
    if(!window.SiteNotes){ toast("笔记模块未加载,无法同步"); return Promise.resolve(); }
    var store = window.SiteNotes.loadAll();
    var local = flattenLocal(store);
    var localById = {};
    for(var i = 0; i < local.length; i++) localById[local[i].item.id] = local[i];
    return loginFlow().then(function(){
      return api("GET", "/api/collections/notes/records?filter=" +
        encodeURIComponent("(user='" + st.uid + "')") + "&perPage=200&sort=-ts", null, true);
    }).then(function(res){
      var server = {};
      (res.items || []).forEach(function(r){ server[r.itemId] = r; });
      var merged = [], toPush = [], toCreate = 0, toUpdate = 0, pulled = 0;
      /* 1) 云端条目并入本地(服务器独有=其他设备新增;服务器较新=以服务器为准) */
      for(var sid in server){
        var r = server[sid];
        var loc = localById[sid];
        if(!loc){
          merged.push({ pageId: r.pageId, item: { id: r.itemId, type: r.type, text: r.text || "", quote: r.quote || "", occ: r.occ || 0, color: r.color || "y", url: r.url || "", ts: r.ts || 0 } });
          pulled++;
        }else if((r.ts || 0) > (loc.item.ts || 0)){
          loc.item = { id: r.itemId, type: r.type, text: r.text || "", quote: r.quote || "", occ: r.occ || 0, color: r.color || "y", url: r.url || "", ts: r.ts || 0 };
          pulled++;
        }
      }
      /* 2) 本地条目:服务器没有 → 新建;本地较新 → 更新(LWW) */
      for(var lid in localById){
        var pair = localById[lid];
        merged.push(pair);
        var r2 = server[lid];
        var payload = { user: st.uid, itemId: lid, pageId: pair.pageId, type: pair.item.type,
                        text: pair.item.text || "", quote: pair.item.quote || "", occ: pair.item.occ || 0,
                        color: pair.item.color || "y", url: pair.item.url || "", ts: pair.item.ts || 0 };
        if(!r2){ toPush.push(api("POST", "/api/collections/notes/records", payload, true)); toCreate++; }
        else if((pair.item.ts || 0) > (r2.ts || 0)){ toPush.push(api("PATCH", "/api/collections/notes/records/" + r2.id, payload, true)); toUpdate++; }
      }
      /* 3) 合并结果按页写回本地存储(单源 API) */
      var newStore = { version: 1, pages: {} };
      for(var m = 0; m < merged.length; m++){
        var pg = merged[m].pageId;
        if(!newStore.pages[pg]) newStore.pages[pg] = { items: [] };
        newStore.pages[pg].items.push(merged[m].item);
      }
      window.SiteNotes.saveAll(newStore);
      if(!toPush.length) return { pulled: pulled, created: 0, updated: 0 };
      return Promise.all(toPush.map(function(p){ return p.catch(function(e){ return { error: e.message }; }); }))
        .then(function(results){
          var fail = 0;
          for(var k = 0; k < results.length; k++){ if(results[k] && results[k].error) fail++; }
          return { pulled: pulled, created: toCreate - fail, updated: toUpdate, fail: fail };
        });
    }).then(function(r3){
      toast("同步完成:拉取 " + r3.pulled + " 条,上传新建 " + (r3.created || 0) + " 条,更新 " + (r3.updated || 0) + " 条" + (r3.fail ? "(失败 " + r3.fail + " 条)" : ""));
      loadTeacherBox();   /* 登录发生在 boot 之后:补拉教师补充(教师账号可编辑) */
    });
  }
  function loginFlow(){
    if(st.token && st.uid) return Promise.resolve();
    var email = st.email || window.prompt("PocketBase 登录邮箱:", st.email || "admin@local.test");
    if(!email) return Promise.reject(new Error("cancel"));
    var pass = window.prompt("PocketBase 密码(仅本次会话使用,不落盘):");
    if(!pass) return Promise.reject(new Error("cancel"));
    return login(email, pass).catch(function(e){
      toast("登录失败:" + e.message);
      throw e;
    });
  }

  /* ---------- 教师补充(按页讲义) ---------- */
  function renderTeacherBox(rec){
    var old = document.querySelector(".pb-teacher");
    if(old) old.remove();
    var head = document.querySelector(".page-head");
    if(!head) return;
    if(!rec || !rec.body){
      if(!st.uid) return;                 /* 未登录且无内容:不显示 */
      var box0 = el("div", "pb-teacher");
      box0.style.cssText = "margin:14px 0;padding:12px 16px;border-radius:12px;border:1px dashed rgba(59,130,246,.45);background:rgba(59,130,246,.05);display:flex;align-items:center;gap:10px";
      box0.appendChild(el("b", null, "📢 教师补充"));
      var btn0 = el("button", null, "✏ 写教师补充");
      btn0.style.cssText = "font-size:12px;padding:3px 12px;border-radius:7px;cursor:pointer;font-family:inherit";
      btn0.onclick = function(){ editTeacher(null); };
      box0.appendChild(btn0);
      head.parentNode.insertBefore(box0, head.nextSibling);
      return;
    }
    var box = el("div", "pb-teacher");
    box.style.cssText = "margin:14px 0;padding:12px 16px;border-radius:12px;border:1px solid rgba(59,130,246,.35);border-left:4px solid #3b82f6;background:rgba(59,130,246,.07)";
    var h = el("div", null, null);
    h.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:5px";
    h.appendChild(el("b", null, "📢 教师补充"));
    if(st.uid){
      var edit = el("button", null, "编辑");
      edit.style.cssText = "margin-left:auto;font-size:11px;padding:2px 10px;border-radius:6px;cursor:pointer;font-family:inherit";
      edit.onclick = function(){ editTeacher(rec); };
      h.appendChild(edit);
    }
    box.appendChild(h);
    var body = el("div", "pb-teacher-body");
    /* 跨用户内容:强制白名单消毒后进 innerHTML */
    body.innerHTML = sanitize(rec.body || "");
    box.appendChild(body);
    head.parentNode.insertBefore(box, head.nextSibling);
  }
  function editTeacher(rec){
    var box = document.querySelector(".pb-teacher");
    if(!box) return;
    var ta = el("textarea");
    ta.value = rec ? (rec.body || "") : "";
    ta.style.cssText = "width:100%;box-sizing:border-box;height:120px;margin-top:6px;font-size:13px;padding:9px;border-radius:8px;border:1px solid rgba(59,130,246,.35);font-family:inherit;background:rgba(255,255,255,.85);color:#0f172a";
    var row = el("div");
    row.style.cssText = "display:flex;gap:8px;margin-top:6px";
    var saveB = el("button", null, "保存到云端");
    saveB.style.cssText = "font-size:12px;padding:5px 14px;border-radius:7px;cursor:pointer;font-family:inherit;background:#2563eb;border:none;color:#fff;font-weight:700";
    var cancel = el("button", null, "取消");
    cancel.style.cssText = "font-size:12px;padding:5px 14px;border-radius:7px;cursor:pointer;font-family:inherit";
    row.appendChild(saveB); row.appendChild(cancel);
    box.appendChild(ta); box.appendChild(row);
    cancel.onclick = function(){ ta.remove(); row.remove(); };
    saveB.onclick = function(){
      var body = ta.value;
      var op = rec && rec.id
        ? api("PATCH", "/api/collections/content/records/" + rec.id, { body: body }, true)
        : api("POST", "/api/collections/content/records", { pageId: P.pageId, body: body }, true);
      op.then(function(rec2){ ta.remove(); row.remove(); renderTeacherBox(rec2); toast("教师补充已保存到云端"); })
        .catch(function(e){ toast("保存失败:" + e.message + "(需教师账号登录)"); });
    };
  }
  function loadTeacherBox(){
    return api("GET", "/api/collections/content/records?filter=" +
      encodeURIComponent("(pageId='" + P.pageId + "')") + "&perPage=1", null, false)
      .then(function(res){ renderTeacherBox(res.items && res.items[0]); })
      .catch(function(){ /* 不可达/无记录:静默 */ });
  }

  /* ---------- UI:面板 footer ☁ 按钮 ---------- */
  function wirePanelButton(){
    var tries = 0;
    var timer = setInterval(function(){
      tries++;
      var foot = document.querySelector(".notes-panel .ntp-foot");
      if(foot || tries > 40){
        clearInterval(timer);
        if(!foot) return;
        var b = el("button", null, "☁ 同步");
        b.title = "与 PocketBase 云端同步笔记(阶段一本地闭环)";
        b.onclick = function(){
          ping().then(function(ok){
            if(!ok){ toast("云端不可达:请先启动本地 PocketBase(见 _本地工具/pocketbase/README);线上 HTTPS 站无法调本地 http 端点"); return; }
            doSync().catch(function(e){ if(e && e.message !== "cancel") toast("同步失败:" + e.message); });
          });
        };
        foot.insertBefore(b, foot.querySelector("button"));
      }
    }, 150);
  }

  loadCfg();
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  function boot(){
    wirePanelButton();
    ping().then(function(ok){
      if(!ok) return;                       /* 优雅降级:PB 不在则整层静默 */
      st.ready = true;
      if(st.token){
        /* 会话恢复:auth-refresh 取回 uid/role(无 /me 路由);失效则清会话 */
        api("POST", "/api/collections/users/auth-refresh", null, true)
          .then(function(j){ st.uid = j.record && j.record.id; st.role = (j.record && j.record.role) || ""; loadTeacherBox(); })
          .catch(function(){ st.token = ""; st.uid = ""; saveCfg(); });
      }
      loadTeacherBox();
    });
  }
})();
