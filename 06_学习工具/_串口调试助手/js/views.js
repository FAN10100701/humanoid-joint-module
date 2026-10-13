/* ============================================================
   网页端串口调试助手 · SerialLab
   模块：views（工作区视图调度）
   职责：图表框（面板）的增删、顺序（含手写拖拽排序）、折叠、
         以及统一的渲染节流循环；并向渲染器提供 data provider。
   依赖：core、util、plugins、datastore
   渲染节流说明：串口数据可能上百 Hz 到达，但屏幕只需要 20~25 fps。
     这里用 requestAnimationFrame 驱动，并按 DRAW_INTERVAL 抽帧，
     避免每个字节都触发一次重绘把主线程压死。
   ============================================================ */
;(function (global) {
  "use strict";

  var SL = global.SerialLab = global.SerialLab || {};
  var U = SL.util;
  var core = SL.core;
  var Plugins = SL.plugins;

  var V = {};

  var gridEl = null;
  var panels = [];              /* 描述符数组，顺序即显示顺序 */
  var instances = {};           /* id -> 渲染器实例 */
  var els = {};                 /* id -> 面板 DOM */
  var rafId = null;
  var running = false;
  var lastDraw = 0;
  var drawInterval = 40;        /* ms，约 25 fps */
  var dragId = null;

  /* data provider：渲染器只认这个接口，不直接依赖 datastore，便于替换与测试 */
  var data = {
    channels: function () { return SL.datastore.listChannels(); },
    count: function (key) { return SL.datastore.count(key); },
    forEach: function (key, n, cb) { return SL.datastore.forEachRecent(key, n, cb); },
    copy: function (key, n) { return SL.datastore.copyRecent(key, n); },
    stat: function (key, n) { return SL.datastore.stat(key, n); },
    recentRaw: function (n) { return SL.datastore.recentRaw(n); },
    now: function () { return U.now(); }
  };
  V.data = data;

  /* ------------------------------------------------------------
     1) DOM 构建
     ------------------------------------------------------------ */
  function buildPanelEl(panel) {
    var el = document.createElement("div");
    el.className = "sl-panel";
    el.setAttribute("data-panel-id", panel.id);

    var head = document.createElement("div");
    head.className = "sl-panel-head";
    head.title = "按住拖动可调整位置";

    var title = document.createElement("span");
    title.className = "sl-panel-title";
    title.textContent = panel.title;
    head.appendChild(title);

    var type = document.createElement("span");
    type.className = "sl-panel-type";
    var r = Plugins.get(panel.type);
    type.textContent = r ? r.label : panel.type;
    head.appendChild(type);

    var btnCollapse = document.createElement("button");
    btnCollapse.type = "button";
    btnCollapse.className = "sl-btn is-sm";
    btnCollapse.textContent = "收起";
    btnCollapse.onclick = function (e) {
      e.stopPropagation();
      V.toggleCollapse(panel.id);
    };
    head.appendChild(btnCollapse);

    var btnDel = document.createElement("button");
    btnDel.type = "button";
    btnDel.className = "sl-btn is-sm is-danger";
    btnDel.textContent = "移除";
    btnDel.onclick = function (e) {
      e.stopPropagation();
      V.removePanel(panel.id);
    };
    head.appendChild(btnDel);

    head.addEventListener("pointerdown", function (e) {
      /* 点在按钮上不触发拖拽 */
      if (e.target && e.target.tagName === "BUTTON") { return; }
      startDrag(panel.id, e);
    });

    el.appendChild(head);

    var body = document.createElement("div");
    body.className = "sl-panel-body";
    el.appendChild(body);

    return el;
  }

  /* ------------------------------------------------------------
     2) 拖拽排序（手写 pointer 事件，不依赖任何库）
     策略：拖动过程中实时把元素插入到「离指针最近的其它面板」的前/后，
           松手即提交顺序，视觉反馈最直接。
     ------------------------------------------------------------ */
  function startDrag(id, e) {
    if (!els[id]) { return; }
    dragId = id;
    els[id].classList.add("is-dragging");
    if (e.preventDefault) { e.preventDefault(); }

    var move = function (ev) { onDragMove(ev); };
    var up = function () {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      if (dragId && els[dragId]) { els[dragId].classList.remove("is-dragging"); }
      dragId = null;
      commitOrder();
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  }

  function onDragMove(e) {
    if (!dragId) { return; }
    var el = els[dragId];
    if (!el || !gridEl) { return; }

    var kids = [];
    for (var i = 0; i < gridEl.children.length; i++) {
      var n = gridEl.children[i];
      if (n !== el && n.className && n.className.indexOf("sl-panel") >= 0) { kids.push(n); }
    }
    if (!kids.length) { return; }

    var best = null, bestDist = Infinity;
    for (var j = 0; j < kids.length; j++) {
      var r = kids[j].getBoundingClientRect();
      var cx = r.left + r.width / 2;
      var cy = r.top + r.height / 2;
      var d = Math.abs(e.clientX - cx) + Math.abs(e.clientY - cy);
      if (d < bestDist) { bestDist = d; best = kids[j]; }
    }
    if (!best) { return; }

    var br = best.getBoundingClientRect();
    var insertBefore = e.clientY < br.top + br.height / 2;
    if (insertBefore) {
      if (best.previousSibling !== el) { gridEl.insertBefore(el, best); }
    } else {
      if (best.nextSibling !== el) { gridEl.insertBefore(el, best.nextSibling); }
    }
  }

  /* 把 DOM 顺序同步到 panels 数组与配置 */
  function commitOrder() {
    if (!gridEl) { return; }
    var newOrder = [];
    for (var i = 0; i < gridEl.children.length; i++) {
      var n = gridEl.children[i];
      var pid = n.getAttribute && n.getAttribute("data-panel-id");
      if (pid) { newOrder.push(pid); }
    }
    var sorted = [];
    for (var k = 0; k < newOrder.length; k++) {
      for (var m = 0; m < panels.length; m++) {
        if (panels[m].id === newOrder[k]) { sorted.push(panels[m]); break; }
      }
    }
    if (sorted.length === panels.length) { panels = sorted; }
    V.save();
    core.emit("panels:changed", { reason: "order" });
  }

  /* ------------------------------------------------------------
     3) 面板增删
     ------------------------------------------------------------ */
  V.addPanel = function (desc, silent) {
    if (!gridEl) { return null; }
    /* 监视器面板的显示开关跟随全局配置（时间戳 / HEX 显示）：
       只在该面板未显式指定时播种，导入的面板包里的显式设置优先。
       这里是所有面板的唯一入口，覆盖「+串口监视器」「插件页新增」
       「启动恢复配置面板」「首次默认面板」四条路径。 */
    if (desc && desc.type === "textmon") {
      desc = U.clone(desc);
      desc.opts = desc.opts || {};
      if (desc.opts.showTimestamp === undefined) {
        desc.opts.showTimestamp = core.config.transport.showTimestamp !== false;
      }
      if (desc.opts.showHex === undefined) {
        desc.opts.showHex = !!core.config.transport.hexRecv;
      }
    }
    var res = Plugins.validate(desc);
    if (!res.panel) {
      core.log("error", "面板描述符不可用：" + res.errors.join("；"));
      return null;
    }
    var panel = res.panel;
    /* id 去重，避免导入重复面板时互相覆盖 */
    var guard = 0;
    while (els[panel.id] && guard++ < 1000) { panel.id = U.nextId("p"); }

    if (res.errors.length) {
      core.log("warn", "面板「" + panel.title + "」已自动修正：" + res.errors.join("；"));
      if (!silent) { core.emit("toast", { level: "warn", msg: "面板配置已自动修正：" + res.errors[0] }); }
    }

    var el = buildPanelEl(panel);
    gridEl.appendChild(el);
    els[panel.id] = el;
    panels.push(panel);

    var inst = Plugins.instantiate(panel, el.lastElementChild);
    instances[panel.id] = inst;

    V.save();
    core.emit("panels:changed", { reason: "add", panel: panel });
    if (!silent) { V.redraw(); }
    return panel;
  };

  V.removePanel = function (id) {
    var el = els[id];
    var inst = instances[id];
    if (inst && inst.destroy) {
      try { inst.destroy(); } catch (e) { /* 单个面板销毁失败不影响其它 */ }
    }
    if (el && el.parentNode) { el.parentNode.removeChild(el); }
    delete els[id];
    delete instances[id];
    for (var i = panels.length - 1; i >= 0; i--) {
      if (panels[i].id === id) { panels.splice(i, 1); }
    }
    V.save();
    core.emit("panels:changed", { reason: "remove", id: id });
  };

  V.toggleCollapse = function (id) {
    var el = els[id];
    if (!el) { return; }
    var collapsed = el.className.indexOf("is-collapsed") >= 0;
    el.className = collapsed
      ? el.className.replace(/\s*is-collapsed/, "")
      : el.className + " is-collapsed";
    if (collapsed && instances[id] && instances[id].resize) {
      /* 展开后画布尺寸变了，补一次适配 */
      setTimeout(function () {
        if (instances[id] && instances[id].resize) { instances[id].resize(); }
        V.redraw();
      }, 0);
    }
  };

  V.clearPanels = function () {
    var ids = [];
    for (var i = 0; i < panels.length; i++) { ids.push(panels[i].id); }
    for (var j = 0; j < ids.length; j++) { V.removePanel(ids[j]); }
  };

  V.list = function () {
    var out = [];
    for (var i = 0; i < panels.length; i++) { out.push(U.clone(panels[i])); }
    return out;
  };

  V.getPanel = function (id) {
    for (var i = 0; i < panels.length; i++) { if (panels[i].id === id) { return panels[i]; } }
    return null;
  };

  V.count = function () { return panels.length; };

  /* 更新面板描述符（插件编辑器用）——重建该面板以应用新配置 */
  V.updatePanel = function (id, patch) {
    var old = V.getPanel(id);
    if (!old) { return null; }
    var merged = U.clone(old);
    for (var k in patch) { if (Object.prototype.hasOwnProperty.call(patch, k)) { merged[k] = patch[k]; } }
    merged.id = id;

    var index = -1;
    for (var i = 0; i < panels.length; i++) { if (panels[i].id === id) { index = i; } }
    var el = els[id];
    if (el && el.parentNode) { el.parentNode.removeChild(el); }
    if (instances[id] && instances[id].destroy) {
      try { instances[id].destroy(); } catch (e) { /* 忽略 */ }
    }
    delete els[id];
    delete instances[id];
    if (index >= 0) { panels.splice(index, 1); }

    var res = Plugins.validate(merged);
    if (!res.panel) { return null; }
    var panel = res.panel;
    panel.id = id;

    var newEl = buildPanelEl(panel);
    /* 插回原位置 */
    var ref = gridEl.children[index] || null;
    gridEl.insertBefore(newEl, ref);
    els[panel.id] = newEl;
    panels.splice(index, 0, panel);
    instances[panel.id] = Plugins.instantiate(panel, newEl.lastElementChild);

    V.save();
    core.emit("panels:changed", { reason: "update", panel: panel });
    V.redraw();
    return panel;
  };

  /* ------------------------------------------------------------
     4) 渲染循环
     ------------------------------------------------------------ */
  function frame() {
    if (!running) { return; }
    rafId = global.requestAnimationFrame(frame);
    var now = U.now();
    if (now - lastDraw < drawInterval) { return; }
    lastDraw = now;
    V.redraw();
  }

  /* 立即重绘全部（可见）面板；单个面板异常被隔离 */
  V.redraw = function () {
    if (!gridEl) { return; }
    for (var i = 0; i < panels.length; i++) {
      var p = panels[i];
      var el = els[p.id];
      var inst = instances[p.id];
      if (!el || !inst) { continue; }
      if (el.className.indexOf("is-collapsed") >= 0) { continue; }
      /* 滚动出视口的面板暂不重绘，省 CPU */
      var body = el.lastElementChild;
      if (body) {
        var rc = body.getBoundingClientRect();
        if (rc.bottom < -80 || rc.top > (global.innerHeight || 800) + 80) { continue; }
      }
      try {
        inst.update(data);
      } catch (e) {
        core.log("error", "面板「" + p.title + "」渲染异常：" + ((e && e.message) || e));
        /* 换成一个空实现，避免每帧刷日志、也避免整个工作区被一个坏面板拖停 */
        var host = el.lastElementChild;
        host.textContent = "";
        var msg = document.createElement("div");
        msg.className = "sl-panel-msg";
        msg.textContent = "该图框渲染出错，已停止刷新（可移除后重新添加）";
        host.appendChild(msg);
        instances[p.id] = { update: function () {}, resize: function () {}, destroy: function () {} };
      }
    }
  };

  V.start = function () {
    if (running) { return; }
    running = true;
    rafId = global.requestAnimationFrame(frame);
  };

  V.stop = function () {
    running = false;
    if (rafId) { global.cancelAnimationFrame(rafId); rafId = null; }
  };

  V.setDrawInterval = function (ms) {
    drawInterval = Math.max(16, Math.min(1000, ms || 40));
  };

  V.drawInterval = function () { return drawInterval; };

  /* ------------------------------------------------------------
     5) 配置持久化
     ------------------------------------------------------------ */
  V.save = function () {
    core.config.panels = V.list();
    core.config.ui.layout = (function () {
      var ids = [];
      for (var i = 0; i < panels.length; i++) { ids.push(panels[i].id); }
      return ids;
    })();
    core.emit("config:dirty", {});
  };

  /* 按配置里的顺序重排（启动时用） */
  function applyLayoutOrder() {
    if (!gridEl) { return; }
    var layout = (core.config.ui && core.config.ui.layout) || [];
    if (!layout.length) { return; }
    for (var i = 0; i < layout.length; i++) {
      var el = els[layout[i]];
      if (el) { gridEl.appendChild(el); }
    }
    /* 同步 panels 数组顺序 */
    var sorted = [];
    for (var k = 0; k < layout.length; k++) {
      for (var m = 0; m < panels.length; m++) {
        if (panels[m].id === layout[k]) { sorted.push(panels[m]); break; }
      }
    }
    if (sorted.length === panels.length) { panels = sorted; }
  }

  /* ------------------------------------------------------------
     6) 初始化
     ------------------------------------------------------------ */
  V.init = function (grid, opts) {
    gridEl = grid;
    if (opts && opts.drawInterval) { V.setDrawInterval(opts.drawInterval); }

    /* 配置里的面板（静默恢复，避免启动时弹一堆修正提示） */
    var saved = (core.config.panels && core.config.panels.length) ? core.config.panels : null;
    if (saved) {
      for (var i = 0; i < saved.length; i++) { V.addPanel(saved[i], true); }
      applyLayoutOrder();
    }

    /* 首次使用给一个默认面板，避免用户面对空白工作区 */
    if (!panels.length) {
      V.addPanel({
        type: "timeplot", title: "时域波形", channels: ["auto"], window: 500
      }, true);
      V.addPanel({
        type: "textmon", title: "串口监视器", channels: [], window: 400
      }, true);
    }
  };

  SL.views = V;

  /* UMD 尾：校验脚本可加载（本模块依赖 DOM，纯逻辑断言有限） */
  if (typeof module !== "undefined" && module.exports) { module.exports = SL.views; }
})(typeof window !== "undefined" ? window : globalThis);
