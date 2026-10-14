/* ============================================================
   网页端串口调试助手 · SerialLab
   模块：aichan（把现场数据送到「AI 读得到」的地方）
   职责：
     1) 生成可直接粘贴的「AI 提示词」（拼自调试包摘要）
     2) 持续把调试包写进本地文件（File System Access API，零本地服务）
     3) 定时把调试包 POST 到本地收件箱（配 _本地工具/serial-inbox.py）
   依赖：util、core、exporters（只读），不碰 DOM
   设计：本模块只负责「产出数据 + 持有句柄」，所有界面反馈通过 core.emit("ai:state")
         交给 ui.js 渲染；任何一条通道失败都不影响正常调试（静默降级 + 状态可见）。
   为什么不做「浏览器自动开串口」：Web Serial 的 requestPort() 必须在真实用户手势
   的调用栈里，且端口选择是浏览器原生弹窗 —— AI 无法接管。这是平台安全红线。
   所以真正让 AI「自己读串口」的路径在浏览器之外：_本地工具/serial-bridge（见
   docs/维护/串口调试助手_评估与优化路线图.md 第三节）。本模块解决的是
   「人操作、AI 读」那一段，把搬运环节从「下载 + 粘贴」降到一个开关。
   ============================================================ */
;(function (global) {
  "use strict";

  var SL = global.SerialLab = global.SerialLab || {};
  var U = SL.util;
  var core = SL.core;

  var AI = {};

  /* ---------------- 易失状态（不持久化） ---------------- */
  var fileHandle = null;      /* FileSystemFileHandle */
  var fileWriter = null;      /* FileSystemWritableFileStream */
  var fileSeq = 0;
  var fileLastErr = "";
  var fileNeedsPick = false;  /* 配置开了 fileLog 但句柄还没选（刷新后必然如此） */

  var httpSeq = 0;
  var httpLastErr = "";
  var httpLastAt = 0;
  var httpFailStreak = 0;

  var timer = 0;
  var tickMs = 0;
  var writing = false;        /* 文件写入串行闸：上一笔没落盘就不排新的一笔 */
  var pendingLine = "";       /* 写入忙时最多缓存一行，避免堆积 */

  /* ---------------- 能力与状态 ---------------- */
  AI.fileSupported = function () {
    return typeof global.showSaveFilePicker === "function";
  };

  AI.status = function () {
    var ai = core.config.ai || {};
    return {
      file: {
        supported: AI.fileSupported(),
        configured: !!ai.fileLog,
        active: !!fileWriter,
        needsPick: fileNeedsPick,
        count: fileSeq,
        error: fileLastErr,
        name: fileHandle && fileHandle.name ? fileHandle.name : ""
      },
      http: {
        configured: !!ai.httpPush,
        port: parseInt(ai.httpPort, 10) || 7788,
        intervalMs: (typeof ai.httpIntervalMs === "number" && ai.httpIntervalMs) || 5000,
        count: httpSeq,
        lastAt: httpLastAt,
        error: httpLastErr,
        failStreak: httpFailStreak
      }
    };
  };

  function emit() { core.emit("ai:state", AI.status()); }

  /* ---------------- 1) AI 提示词 ---------------- */
  /* 一行小工具：把 Date 变成 20261014-161335 */
  function stamp(d) {
    d = d || new Date();
    return "" + d.getFullYear() + U.pad2(d.getMonth() + 1) + U.pad2(d.getDate()) +
      "-" + U.pad2(d.getHours()) + U.pad2(d.getMinutes()) + U.pad2(d.getSeconds());
  }

  /* 线上传输/落盘用的包体：与 debugBundle 同结构，只去掉 brief（摘要单独承载） */
  AI.wireBundle = function (samples) {
    if (!SL.exporters || !SL.exporters.debugBundle) { return null; }
    var full = SL.exporters.debugBundle({ samples: samples || 60 });
    var out = {}, k;
    for (k in full) {
      if (!Object.prototype.hasOwnProperty.call(full, k)) { continue; }
      if (k === "brief") { continue; }
      out[k] = full[k];
    }
    return { bundle: out, brief: full.brief || "" };
  };

  /* 拼一段自解释的提示词：AI 拿到就能开始判断，不必再问「你用的是哪个规则」 */
  AI.buildPrompt = function () {
    var packed = AI.wireBundle(40);
    if (!packed) { return ""; }
    var stats = packed.bundle.stats || {};
    var lines = [];
    lines.push("【SerialLab 现场数据 · 请据此帮我定位问题】");
    lines.push("");
    lines.push("我把串口调试助手的现场摘要贴给你。它包含：生效的串口参数与解析规则、帧结构说明、");
    lines.push("各通道统计、解析/校验失败样本（带原因）、以及自动诊断提示。");
    lines.push("");
    lines.push("请按这个顺序回答：");
    lines.push("1) 现在这套解析规则是否与设备实际输出一致？不一致的话，最可能是哪一项（帧头/长度字段口径/校验起点/字节序/偏移）？");
    lines.push("2) 失败样本里有没有能直接定位根因的（逐字节对齐说明）？");
    lines.push("3) 我下一步该改哪一处配置，或者该怎么改固件？");
    lines.push("");
    lines.push("读数：帧 " + (stats.parsedFrames === undefined ? "-" : stats.parsedFrames) +
      " · 原始 " + (stats.rawRecords === undefined ? "-" : stats.rawRecords) +
      " · 失败 " + (stats.failedFrames === undefined ? "-" : stats.failedFrames) +
      " · 字节 " + (stats.bytes === undefined ? "-" : stats.bytes));
    lines.push("");
    lines.push("--- 人读摘要 ---");
    lines.push(packed.brief);
    lines.push("");
    lines.push("--- 机器可读（JSON，与上面摘要同源） ---");
    lines.push("```json");
    lines.push(JSON.stringify(packed.bundle, null, 2));
    lines.push("```");
    lines.push("");
    lines.push("（若需要更长的原始样本或完整录制，我可以再导出 seriallab-debug-*.json 整包。）");
    return lines.join("\n");
  };

  /* 注意：剪贴板写入不放在本模块 —— 那是界面职责（需要 DOM 兜底方案），
     由 ui.js 用既有的 copyText() 完成。本模块只负责「造出该复制的文本」。 */

  /* ---------------- 2) 持续写本地文件 ---------------- */
  function logMeta() {
    var ai = core.config.ai || {};
    return {
      kind: "seriallab-log",
      version: 1,
      tool: "SerialLab",
      appVersion: SL.version || "",
      site: "humanoid-robot-lab",
      startedAt: new Date().toISOString(),
      intervalMs: (typeof ai.httpIntervalMs === "number" && ai.httpIntervalMs) || 5000,
      format: "NDJSON：每行一个 JSON。首行为本 meta；其后每行为 { seq, tWall, iso, bundle, brief }，bundle 与「AI 调试包」同结构（已省略 brief 以省体积）。",
      readHint: "bundle.frameLayout 说明帧结构；bundle.channels 是各通道统计（min/max/avg/span）；bundle.failures 是解析/校验失败样本（含原因）；bundle.hints 是自动诊断建议。"
    };
  }

  /* 打开（或重开）落盘：必须在用户手势里调用 */
  AI.startFileLog = function () {
    if (!AI.fileSupported()) {
      fileLastErr = "当前浏览器不支持 File System Access API（请用 Chrome / Edge 等 Chromium 系）";
      emit();
      return Promise.resolve({ ok: false, reason: fileLastErr });
    }
    var name = "seriallab-log-" + stamp() + ".jsonl";
    return global.showSaveFilePicker({
      suggestedName: name,
      types: [{ description: "SerialLab 调试日志（NDJSON）", accept: { "application/x-ndjson": [".jsonl"], "application/json": [".json"] } }]
    }).then(function (h) {
      fileHandle = h;
      return h.createWritable();
    }).then(function (w) {
      fileWriter = w;
      fileSeq = 0;
      fileLastErr = "";
      fileNeedsPick = false;
      return writeLine(JSON.stringify(logMeta()));
    }).then(function () {
      emit();
      return { ok: true, name: fileHandle && fileHandle.name };
    })["catch"](function (e) {
      var msg = (e && e.name === "AbortError") ? "已取消选择" : String((e && e.message) || e);
      fileLastErr = msg;
      fileWriter = null;
      fileNeedsPick = !!(core.config.ai && core.config.ai.fileLog);
      emit();
      return { ok: false, reason: msg };
    });
  };

  function writeLine(line) {
    if (!fileWriter) { return Promise.reject(new Error("尚未选择保存文件")); }
    if (writing) { pendingLine = line; return Promise.resolve(); }
    writing = true;
    return Promise.resolve(fileWriter.write(line + "\n"))["catch"](function (e) {
      fileLastErr = String((e && e.message) || e);
      fileWriter = null;
      fileNeedsPick = !!(core.config.ai && core.config.ai.fileLog);
      emit();
    })["then"](function () {
      writing = false;
      if (pendingLine) { var p = pendingLine; pendingLine = ""; return writeLine(p); }
      return null;
    });
  }

  /* 追加一笔现场快照 */
  AI.appendToFile = function () {
    if (core.config.ai && core.config.ai.fileLog && !fileWriter) {
      /* 配置开着但没句柄（刷新后 / 用户取消）：只提示，不反复报错 */
      fileNeedsPick = true;
      emit();
      return Promise.resolve({ ok: false, reason: "尚未选择保存文件" });
    }
    if (!fileWriter) { return Promise.resolve({ ok: false, reason: "未启用文件落盘" }); }
    var packed = AI.wireBundle(60);
    if (!packed) { return Promise.resolve({ ok: false, reason: "导出模块未就绪" }); }
    fileSeq++;
    var rec = {
      seq: fileSeq,
      tWall: Date.now(),
      iso: new Date().toISOString(),
      brief: packed.brief,
      bundle: packed.bundle
    };
    return writeLine(JSON.stringify(rec)).then(function () {
      emit();
      return { ok: true, seq: fileSeq };
    });
  };

  AI.stopFileLog = function () {
    var w = fileWriter;
    fileWriter = null;
    fileNeedsPick = false;
    fileLastErr = "";
    if (w && w.close) {
      try { return Promise.resolve(w.close()).then(function () { emit(); return { ok: true }; }); }
      catch (e) { /* 已被浏览器关掉：忽略 */ }
    }
    fileHandle = null;
    emit();
    return Promise.resolve({ ok: true });
  };

  AI.fileLogging = function () { return !!fileWriter; };

  /* ---------------- 2b) 数据文件夹模式（V2.2.6）----------------
     绑定一个本地文件夹，按规范命名落盘：
       seriallab_v<版本>_<功能标识>_<日期时间>.ndjson   （持续调试流）
       seriallab_v<版本>_<功能标识>_<日期时间>.csv      （手动导出的数据表）
     功能标识可自定义（如 foc-test），AI / 脚本按 seriallab_v* 通配即可定位。
     目录里只认这个前缀，历史超量自动清理（保留最近 N 个）。 */
  var dirHandle = null;
  var dirFileHandle = null;
  var dirWriter = null;
  var dirWriting = false, dirPending = "";

  function aiCfg() { return core.config.ai || {}; }

  function buildLogName(kind, ext) {
    var tag = String(aiCfg().tag || "debug").replace(/[\\/:*?"<>|\s]+/g, "-").slice(0, 24) || "debug";
    return "seriallab_v" + (SL.version || "0") + "_" + kind + "-" + tag + "_" + stamp() + "." + ext;
  }

  function writeDirLine(line) {
    if (!dirWriter) { return Promise.reject(new Error("尚未绑定数据文件夹")); }
    if (dirWriting) { dirPending = line; return Promise.resolve(); }
    dirWriting = true;
    return Promise.resolve(dirWriter.write(line + "\n"))["catch"](function (e) {
      fileLastErr = String((e && e.message) || e);
      dirWriter = null;
      emit();
    })["then"](function () {
      dirWriting = false;
      if (dirPending) { var p = dirPending; dirPending = ""; return writeDirLine(p); }
      return null;
    });
  }

  /* 绑定文件夹（用户手势里调用）；绑定后立刻做一次超量清理 */
  AI.bindFolder = function () {
    if (!AI.fileSupported()) {
      return Promise.resolve({ ok: false, reason: "当前浏览器不支持 File System Access API" });
    }
    return global.showDirectoryPicker({ mode: "readwrite" }).then(function (h) {
      dirHandle = h;
      aiCfg().folderName = h.name;
      core.saveConfig();
      emit();
      return AI.cleanLogs();
    }).then(function (r) {
      var cleaned = (r && r.ok) ? r.removed : 0;
      return { ok: true, dir: dirHandle && dirHandle.name, cleaned: cleaned };
    })["catch"](function (e) {
      var msg = (e && e.name === "AbortError") ? "已取消选择" : String((e && e.message) || e);
      return { ok: false, reason: msg };
    });
  };

  AI.folderBound = function () { return !!dirHandle; };
  AI.folderName = function () { return dirHandle ? dirHandle.name : (aiCfg().folderName || ""); };

  /* 在数据文件夹里开一个规范命名的持续日志（与「选择文件并开始」二选一） */
  AI.startDirLog = function () {
    if (!AI.fileSupported()) {
      return Promise.resolve({ ok: false, reason: "当前浏览器不支持 File System Access API" });
    }
    if (!dirHandle) { return Promise.resolve({ ok: false, reason: "先点「绑定数据文件夹」" }); }
    var name = buildLogName("log", "ndjson");
    return dirHandle.getFileHandle(name, { create: true }).then(function (fh) {
      dirFileHandle = fh;
      return fh.createWritable();
    }).then(function (w) {
      dirWriter = w;
      fileSeq = 0;
      return writeDirLine(JSON.stringify(logMeta()));
    }).then(function () {
      emit();
      return { ok: true, name: dirFileHandle.name };
    })["catch"](function (e) {
      var msg = (e && e.name === "AbortError") ? "已取消" : String((e && e.message) || e);
      fileLastErr = msg;
      dirWriter = null;
      emit();
      return { ok: false, reason: msg };
    });
  };

  AI.dirLogging = function () { return !!dirWriter; };

  AI.stopDirLog = function () {
    var w = dirWriter;
    dirWriter = null;
    if (w && w.close) {
      try { return Promise.resolve(w.close()).then(function () { emit(); return { ok: true }; }); }
      catch (e) { /* 已关 */ }
    }
    emit();
    return Promise.resolve({ ok: true });
  };

  /* 追加到目录日志（appendToFile 的目录版） */
  AI.appendToDirLog = function () {
    if (!dirWriter) { return Promise.resolve({ ok: false, reason: "目录日志未开启" }); }
    var packed = AI.wireBundle(60);
    if (!packed) { return Promise.resolve({ ok: false, reason: "导出模块未就绪" }); }
    fileSeq++;
    var rec = {
      seq: fileSeq,
      tWall: Date.now(),
      iso: new Date().toISOString(),
      brief: packed.brief,
      bundle: packed.bundle
    };
    return writeDirLine(JSON.stringify(rec)).then(function () {
      emit();
      return { ok: true, seq: fileSeq };
    });
  };

  /* 列出数据文件夹里的 seriallab_v* 文件（名字/大小/修改时间） */
  AI.listLogs = function () {
    if (!dirHandle) { return Promise.resolve({ ok: false, reason: "尚未绑定数据文件夹" }); }
    var out = [];
    var iter = dirHandle.entries();
    function step() {
      return iter.next().then(function (r) {
        if (r.done) { return { ok: true, files: out }; }
        var name = r.value[0], fh = r.value[1];
        if (fh.kind === "file" && /^seriallab_v.*\.(ndjson|jsonl|csv)$/i.test(name)) {
          return fh.getFile().then(function (f) {
            out.push({ name: name, size: f.size, lastModified: f.lastModified });
            return step();
          }, function () { return step(); });
        }
        return step();
      });
    }
    return step()["catch"](function (e) {
      return { ok: false, reason: String((e && e.message) || e) };
    });
  };

  /* 清理：wipe=true 全删；否则按保留数量（config.ai.logKeep，默认 10）留下最新的 */
  AI.cleanLogs = function (wipe) {
    return AI.listLogs().then(function (res) {
      if (!res.ok) { return res; }
      var keepN = parseInt(aiCfg().logKeep, 10);
      if (!(keepN > 0)) { keepN = 10; }
      var files = res.files.slice().sort(function (a, b) { return b.lastModified - a.lastModified; });
      var victims = wipe ? files : files.slice(keepN);
      var chain = Promise.resolve();
      var removed = 0;
      for (var i = 0; i < victims.length; i++) {
        (function (name) {
          chain = chain.then(function () {
            return dirHandle.removeEntry(name).then(function () { removed++; }, function () { /* 已不在 */ });
          });
        })(victims[i].name);
      }
      return chain.then(function () {
        return { ok: true, removed: removed, remain: files.length - removed };
      });
    });
  };

  /* CSV 直接写进数据文件夹（Excel 可直接打开；带 BOM 中文不乱码） */
  AI.writeCsvToFolder = function (csvText) {
    if (!dirHandle) { return Promise.resolve({ ok: false, reason: "先绑定数据文件夹" }); }
    var name = buildLogName("data", "csv");
    return dirHandle.getFileHandle(name, { create: true }).then(function (fh) {
      return fh.createWritable();
    }).then(function (w) {
      var text = (SL.exporters && SL.exporters.withBom) ? SL.exporters.withBom(csvText) : ("\ufeff" + csvText);
      return w.write(text).then(function () {
        return w.close();
      });
    }).then(function () {
      return { ok: true, name: name };
    })["catch"](function (e) {
      return { ok: false, reason: String((e && e.message) || e) };
    });
  };

  /* ---------------- 3) HTTP 上报本地收件箱 ---------------- */
  AI.inboxUrl = function () {
    var ai = core.config.ai || {};
    var port = parseInt(ai.httpPort, 10) || 7788;
    return "http://127.0.0.1:" + port + "/ingest";
  };

  AI.pushNow = function () {
    var packed = AI.wireBundle((core.config.ai && core.config.ai.bundleSamples) || 400);
    if (!packed) { return Promise.resolve({ ok: false, reason: "导出模块未就绪" }); }
    var body = JSON.stringify({
      kind: "seriallab-push",
      version: 1,
      seq: httpSeq + 1,
      tWall: Date.now(),
      iso: new Date().toISOString(),
      brief: packed.brief,
      bundle: packed.bundle
    });
    var res;
    try {
      res = global.fetch(AI.inboxUrl(), {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "application/json" },
        body: body
      });
    } catch (e) {
      httpLastErr = String((e && e.message) || e);
      httpFailStreak++;
      emit();
      return Promise.resolve({ ok: false, reason: httpLastErr });
    }
    return Promise.resolve(res).then(function (r) {
      if (r && r.ok) {
        httpSeq++;
        httpFailStreak = 0;
        httpLastErr = "";
        httpLastAt = Date.now();
      } else {
        httpFailStreak++;
        httpLastErr = "收件箱返回 HTTP " + (r && r.status) + "（先确认 serial-inbox.py 在跑、端口一致）";
      }
      emit();
      return { ok: !!(r && r.ok), status: r && r.status };
    })["catch"](function (e) {
      httpFailStreak++;
      httpLastErr = "连不上收件箱：" + String((e && e.message) || e) + "（先在本地跑 python _本地工具/serial-inbox.py）";
      emit();
      return { ok: false, reason: httpLastErr };
    });
  };

  /* ---------------- 4) 心跳定时器 ---------------- */
  function tick() {
    var ai = core.config.ai || {};
    if (ai.httpPush) { AI.pushNow(); }
    /* 目录日志优先：绑了文件夹就走规范命名的那套；没有再用单文件模式 */
    if (dirWriter) { AI.appendToDirLog(); }
    else if (ai.fileLog) { AI.appendToFile(); }
  }

  function refresh() {
    var ai = core.config.ai || {};
    var want = !!(ai.fileLog || ai.httpPush || dirWriter);
    var ms = U.clamp(parseInt(ai.httpIntervalMs, 10) || 5000, 1000, 600000);
    ai.httpIntervalMs = ms;
    if (!want) {
      if (timer) { global.clearInterval(timer); timer = 0; tickMs = 0; }
      emit();
      return;
    }
    if (timer && tickMs === ms) { emit(); return; }
    if (timer) { global.clearInterval(timer); }
    tickMs = ms;
    timer = global.setInterval(tick, ms);
    /* 刚打开就先来一笔，别让用户等一个周期才看到效果 */
    tick();
    emit();
  }
  AI.refresh = refresh;

  /* 启动：把配置里开着但句柄已丢失的情况说清楚（刷新后必然发生） */
  AI.boot = function () {
    var ai = core.config.ai || {};
    if (ai.fileLog && !fileWriter) {
      fileNeedsPick = true;
      fileLastErr = "需重新点一次「选择文件并开始」（浏览器不允许页面记住文件位置）";
    }
    refresh();
  };

  AI.reset = function () {
    fileHandle = null;
    fileWriter = null;
    fileSeq = 0;
    fileLastErr = "";
    fileNeedsPick = false;
    httpSeq = 0;
    httpLastErr = "";
    httpLastAt = 0;
    httpFailStreak = 0;
    if (timer) { global.clearInterval(timer); timer = 0; tickMs = 0; }
    emit();
  };

  SL.aichan = AI;

  /* UMD 尾：供校验脚本 require 真实源文件（纯函数部分：buildPrompt / logMeta / stamp） */
  if (typeof module !== "undefined" && module.exports) { module.exports = SL.aichan; }
})(typeof window !== "undefined" ? window : globalThis);
