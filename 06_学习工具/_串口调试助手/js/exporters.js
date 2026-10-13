/* ============================================================
   网页端串口调试助手 · SerialLab
   模块：exporters（导出与配置）
   职责：
     1) CSV / JSON / BIN / TXT 数据导出（CSV 带 UTF-8 BOM，Excel 打开中文不乱码）
     2) 全局配置的复制 / 导出 / 导入（带版本校验，拒绝未来版本）
     3) 单文件离线版装配（把整站应用的 HTML + CSS + JS 内联成一个 .html）
   依赖：core、util、datastore、timeline
   ============================================================ */
;(function (global) {
  "use strict";

  var SL = global.SerialLab = global.SerialLab || {};
  var U = SL.util;
  var core = SL.core;

  var E = {};

  var BOM = "\uFEFF";

  /* ------------------------------------------------------------
     1) CSV 基元
     ------------------------------------------------------------ */
  function csvCell(v) {
    var s = (v === null || v === undefined) ? "" : String(v);
    if (s.indexOf('"') >= 0 || s.indexOf(",") >= 0 || s.indexOf("\n") >= 0 || s.indexOf("\r") >= 0) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  /* rows: 二维数组（首行通常为表头） */
  E.toCsv = function (rows) {
    var lines = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i] || [];
      var cells = [];
      for (var j = 0; j < row.length; j++) { cells.push(csvCell(row[j])); }
      lines.push(cells.join(","));
    }
    return lines.join("\r\n");
  };

  /* 加 BOM：Excel 默认按本地编码猜，不加 BOM 中文会乱码 */
  E.withBom = function (text) { return BOM + text; };

  /* ------------------------------------------------------------
     2) 数据导出
     ------------------------------------------------------------ */
  function stamp() {
    var d = new Date();
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate())
      + "_" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }
  E.stamp = stamp;

  /* 解析结果 CSV：时间 + 各通道（列 = 出现过的所有通道键） */
  E.buildParsedCsv = function (maxRecs) {
    var recs = SL.datastore.recentRaw(maxRecs || 100000);
    var keys = [];
    var seen = {};
    var i, j, k;
    for (i = 0; i < recs.length; i++) {
      var vals = recs[i].values;
      if (!vals) { continue; }
      for (k in vals) {
        if (Object.prototype.hasOwnProperty.call(vals, k) && !seen[k]) { seen[k] = 1; keys.push(k); }
      }
    }
    var header = ["时间(s)"];
    for (j = 0; j < keys.length; j++) {
      var ch = SL.datastore.getChannel(keys[j]);
      header.push(ch && ch.unit ? (keys[j] + "(" + ch.unit + ")") : keys[j]);
    }
    var rows = [header];
    var t0 = recs.length ? recs[0].t : 0;
    for (i = 0; i < recs.length; i++) {
      var rec = recs[i];
      if (rec.dir === "tx") { continue; }         /* 解析结果表只列接收方向 */
      var row = [((rec.t - t0) / 1000).toFixed(4)];
      for (j = 0; j < keys.length; j++) {
        var v = rec.values ? rec.values[keys[j]] : undefined;
        row.push(v === undefined ? "" : v);
      }
      rows.push(row);
    }
    return { csv: E.toCsv(rows), rows: rows };
  };

  /* 原始记录 CSV：序号 / 时间 / 方向 / HEX / 文本 */
  E.buildRawCsv = function (maxRecs) {
    var recs = SL.datastore.recentRaw(maxRecs || 100000);
    var rows = [["序号", "时间(s)", "方向", "HEX", "文本"]];
    var t0 = recs.length ? recs[0].t : 0;
    for (var i = 0; i < recs.length; i++) {
      var rec = recs[i];
      rows.push([
        i + 1,
        ((rec.t - t0) / 1000).toFixed(4),
        rec.dir === "tx" ? "TX" : "RX",
        rec.hex || "",
        (rec.text || "").replace(/[\r\n]+$/, "")
      ]);
    }
    return E.toCsv(rows);
  };

  /* 原始二进制：把所有接收方向的实际字节按时间顺序拼起来 */
  E.buildBin = function () {
    var recs = SL.datastore.recentRaw();
    var chunks = [];
    var total = 0;
    for (var i = 0; i < recs.length; i++) {
      var hex = recs[i].hex;
      if (!hex) { continue; }
      var b = U.hexToBytes(hex);
      if (b && b.length) { chunks.push(b); total += b.length; }
    }
    var out = new Uint8Array(total);
    var off = 0;
    for (var j = 0; j < chunks.length; j++) { out.set(chunks[j], off); off += chunks[j].length; }
    return out;
  };

  /* 文本流：接收到的可读文本 */
  E.buildTxt = function () {
    var recs = SL.datastore.recentRaw();
    var parts = [];
    for (var i = 0; i < recs.length; i++) {
      var t = recs[i].text;
      if (!t) { continue; }
      parts.push((recs[i].dir === "tx" ? "> " : "< ") + t.replace(/[\r\n]+$/, ""));
    }
    return parts.join("\r\n") + "\r\n";
  };

  /* 完整 JSON 快照（配置 + 通道 + 数据） */
  E.buildJson = function () {
    var snap = {
      kind: "seriallab-data",
      version: 1,
      exportedAt: new Date().toISOString(),
      config: core.config,
      channels: SL.datastore.snapshot(),
      frames: SL.datastore.recentRaw()
    };
    return JSON.stringify(snap, null, 1);
  };

  /* ---------------- 下载入口 ---------------- */
  E.downloadCsv = function (csvText, name) {
    var blob = new Blob([E.withBom(csvText)], { type: "text/csv;charset=utf-8" });
    return U.download(blob, name || ("seriallab_" + stamp() + ".csv"));
  };

  E.downloadText = function (text, name, mime) {
    var blob = new Blob([text], { type: (mime || "text/plain") + ";charset=utf-8" });
    return U.download(blob, name || ("seriallab_" + stamp() + ".txt"));
  };

  E.downloadBin = function (u8, name) {
    var blob = new Blob([u8], { type: "application/octet-stream" });
    return U.download(blob, name || ("seriallab_" + stamp() + ".bin"));
  };

  E.exportParsedCsv = function () {
    var r = E.buildParsedCsv();
    if (r.rows.length <= 1) {
      core.emit("toast", { level: "warn", msg: "还没有可导出的解析数据" });
      return false;
    }
    var ok = E.downloadCsv(r.csv, "seriallab_解析结果_" + stamp() + ".csv");
    core.emit("toast", { level: ok ? "ok" : "bad", msg: ok ? "已导出解析结果 CSV" : "导出失败，当前环境不支持下载" });
    return ok;
  };

  E.exportRawCsv = function () {
    var csv = E.buildRawCsv();
    if (SL.datastore.rawCount() === 0) {
      core.emit("toast", { level: "warn", msg: "还没有可导出的原始记录" });
      return false;
    }
    var ok = E.downloadCsv(csv, "seriallab_原始记录_" + stamp() + ".csv");
    core.emit("toast", { level: ok ? "ok" : "bad", msg: ok ? "已导出原始记录 CSV" : "导出失败，当前环境不支持下载" });
    return ok;
  };

  E.exportJson = function () {
    var ok = E.downloadText(E.buildJson(), "seriallab_数据_" + stamp() + ".json", "application/json");
    core.emit("toast", { level: ok ? "ok" : "bad", msg: ok ? "已导出 JSON" : "导出失败，当前环境不支持下载" });
    return ok;
  };

  E.exportBin = function () {
    var u8 = E.buildBin();
    if (!u8.length) {
      core.emit("toast", { level: "warn", msg: "还没有可导出的原始字节" });
      return false;
    }
    var ok = E.downloadBin(u8, "seriallab_原始数据_" + stamp() + ".bin");
    core.emit("toast", { level: ok ? "ok" : "bad", msg: ok ? "已导出 BIN" : "导出失败，当前环境不支持下载" });
    return ok;
  };

  E.exportTxt = function () {
    var txt = E.buildTxt();
    if (txt.replace(/[\r\n]+/g, "") === "") {
      core.emit("toast", { level: "warn", msg: "还没有可导出的文本" });
      return false;
    }
    var ok = E.downloadText(txt, "seriallab_文本_" + stamp() + ".txt");
    core.emit("toast", { level: ok ? "ok" : "bad", msg: ok ? "已导出 TXT" : "导出失败，当前环境不支持下载" });
    return ok;
  };

  /* ------------------------------------------------------------
     3) 配置导入导出
     ------------------------------------------------------------ */
  E.configToText = function (pretty) {
    var cfg = U.clone(core.config);
    return JSON.stringify(cfg, null, pretty === false ? 0 : 1);
  };

  E.configFromText = function (text) {
    var obj;
    try { obj = JSON.parse(text); }
    catch (e) { return { ok: false, config: null, errors: ["不是合法的 JSON"] }; }

    if (!obj || typeof obj !== "object") {
      return { ok: false, config: null, errors: ["配置内容为空"] };
    }
    var v = parseInt(obj.version, 10);
    if (isNaN(v)) { v = 0; }
    if (v > core.CFG_VERSION) {
      return { ok: false, config: null,
        errors: ["配置版本（v" + v + "）高于本应用支持的 v" + core.CFG_VERSION + "，请升级应用后再导入"] };
    }
    var config = core.migrateConfig(obj);
    return { ok: true, config: config, errors: [] };
  };

  E.exportConfigFile = function () {
    var ok = E.downloadText(E.configToText(), "seriallab_配置_" + stamp() + ".json", "application/json");
    core.emit("toast", { level: ok ? "ok" : "bad", msg: ok ? "已导出配置文件" : "导出失败" });
    return ok;
  };

  /* ------------------------------------------------------------
     4) 单文件离线版装配
     说明：把 css 与所有 js 内联进一个 html。
     局限（务必向用户讲清）：file:// 不是安全上下文，浏览器不允许 Web Serial，
       所以离线单文件只能看界面与演示数据；真机调试必须通过 localhost 或 HTTPS。
     ------------------------------------------------------------ */
  E.offlineLimitationHtml = '<div class="sl-note is-warn">离线单文件已生成。'
    + '受浏览器安全模型限制，<b>通过 file:// 直接打开时无法使用真实串口</b>（Web Serial 只允许 HTTPS 或 localhost）。'
    + '如需真机调试，请用本地 HTTP 服务打开，或访问在线版本。</div>';

  function fetchText(url) {
    return fetch(url, { cache: "no-store" }).then(function (r) {
      if (!r.ok) { throw new Error("读取失败 " + url + "（" + r.status + "）"); }
      return r.text();
    });
  }

  E.scriptList = function () {
    var out = [];
    var list = document.getElementsByTagName("script");
    for (var i = 0; i < list.length; i++) {
      var src = list[i].getAttribute("src");
      if (src) { out.push(src); }
    }
    return out;
  };

  /* 取当前页面的 body 结构（去掉所有外链脚本，保留静态标记） */
  function bodyMarkup() {
    var clone = document.body.cloneNode(true);
    var scripts = clone.getElementsByTagName("script");
    for (var i = scripts.length - 1; i >= 0; i--) {
      if (scripts[i].parentNode) { scripts[i].parentNode.removeChild(scripts[i]); }
    }
    return clone.innerHTML;
  }

  E.buildOfflineHtml = function () {
    if (typeof fetch === "undefined") {
      return Promise.reject(new Error("当前环境不支持 fetch，无法装配离线版"));
    }
    var jsList = E.scriptList();
    var tasks = [fetchText("app.css")];
    for (var i = 0; i < jsList.length; i++) { tasks.push(fetchText(jsList[i])); }

    return Promise.all(tasks).then(function (texts) {
      var css = texts[0];
      var js = texts.slice(1).join("\n;\n");
      /* 防止源码里出现 </script 提前闭合外层脚本标签 */
      js = js.replace(/<\/script/gi, "<\\/script");
      css = css.replace(/<\/style/gi, "<\\/style");

      var html =
        "<!DOCTYPE html>\n"
        + '<html lang="zh-CN">\n<head>\n'
        + '<meta charset="UTF-8">\n'
        + '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
        + '<script>(function(){try{var t=localStorage.getItem("site-theme")||"light";'
        + 'document.documentElement.setAttribute("data-theme",t);'
        + 'document.documentElement.setAttribute("data-theme-early",t);}catch(e){}})();<\/script>\n'
        + '<title>串口调试助手 · 离线版 · SerialLab</title>\n'
        + '<meta name="description" content="串口调试助手离线单文件版（Web Serial 需 HTTPS 或 localhost）。">\n'
        + "<style>\n" + css + "\n</style>\n"
        + "</head>\n<body>\n"
        + bodyMarkup()
        + "\n<script>\n" + js + "\n<\/script>\n"
        + "</body>\n</html>\n";
      return html;
    });
  };

  E.exportOffline = function () {
    core.emit("toast", { level: "info", msg: "正在装配离线单文件，请稍候…" });
    return E.buildOfflineHtml().then(function (html) {
      var ok = E.downloadText(html, "串口调试助手_离线版_" + stamp() + ".html", "text/html");
      core.emit("toast", {
        level: ok ? "ok" : "bad",
        msg: ok ? "已导出离线单文件（file:// 下串口不可用，仅可查看）" : "导出失败，当前环境不支持下载"
      });
      return ok;
    })["catch"](function (e) {
      core.log("error", "装配离线版失败：" + ((e && e.message) || e));
      core.emit("toast", { level: "bad", msg: "装配离线版失败：" + ((e && e.message) || e) });
      return false;
    });
  };

  /* ------------------------------------------------------------
     5) 面向 AI 的「调试包」（自己串口调试 + 丢给 AI 定位问题）
     设计目标：一个自包含 JSON，AI 只读它就能回答
       「现在按什么规则解帧 / 解出来的量长什么样 / 哪里失败 / 该怎么改规则」，
     无需用户来回截图、复制粘贴。
     同时产出一段纯文本 brief，可直接粘到对话框里。
     ------------------------------------------------------------ */
  var BUNDLE_KIND = "seriallab-debug-bundle";
  var BUNDLE_VERSION = 1;

  /* ---------- 文本排版小工具（ES5 无 padStart/padEnd） ---------- */
  function padR(s, n) {
    s = (s === null || s === undefined) ? "" : String(s);
    while (s.length < n) { s += " "; }
    return s;
  }
  function padL(s, n) {
    s = (s === null || s === undefined) ? "" : String(s);
    while (s.length < n) { s = " " + s; }
    return s;
  }
  function fmtNum(v, p) {
    if (typeof v !== "number" || !isFinite(v)) { return "-"; }
    var d = (typeof p === "number" && p >= 0 && p <= 8) ? p : 3;
    return v.toFixed(d);
  }
  /* 单行化：日志里的换行会让表格错位，统一收成可见分隔 */
  function oneLine(s, n) {
    s = (s === null || s === undefined) ? "" : String(s);
    s = s.replace(/[\r\n\t]+/g, " ");
    if (n && s.length > n) { s = s.slice(0, n) + "\u2026"; }
    return s;
  }
  /* "AAAA" -> "AA AA"；容忍奇数长度与空格 */
  function hexSpaced(h) {
    var s = String(h || "").replace(/[^0-9a-fA-F]/g, "").toUpperCase();
    if (!s) { return ""; }
    var out = [];
    for (var i = 0; i < s.length; i += 2) { out.push(s.substr(i, 2)); }
    return out.join(" ");
  }

  /* ---------- 帧结构人话说明（AI 靠这段理解硬件在发什么） ---------- */
  function describeRule(activeName, r) {
    var L = [];
    if (activeName !== "hex") {
      L.push("模式: 文本 / 键值自适应解析");
      L.push("分隔符: " + ((r.seps && r.seps.length) ? r.seps.join(" ") : "= :"));
      L.push("数值正则: " + (r.number || "(默认)"));
      L.push("后缀通道: " + (r.suffixChannels ? "temp1/temp2 视为不同通道" : "同名合并"));
      L.push("切帧: 优先按换行；无换行裸流按静默超时切帧");
      L.push("示例: temperature=25.63, rpm:-1200.5, vbus:24.01");
      return L;
    }
    L.push("模式: 二进制 / 按显式帧结构解析");
    L.push("帧头: " + (r.head ? hexSpaced(r.head) : "(未设置：靠帧尾或长度字段定界)"));
    var len = r.len || {};
    if (len.mode && len.mode !== "none" && len.size > 0) {
      L.push("长度字段: 位于第 " + len.offset + " 字节，占 " + len.size + " 字节，"
        + (len.mode === "payload" ? "表示「数据段字节数」" : "表示「整帧字节数」"));
    } else {
      L.push("长度字段: (未使用)");
    }
    var fs = r.fields || [];
    if (fs.length) {
      var parts = [];
      for (var i = 0; i < fs.length; i++) {
        var f = fs[i];
        parts.push(f.key + "(" + (f.type || "uint8") + "@" + f.offset
          + (f.size ? "×" + f.size : "")
          + (f.scale && f.scale !== 1 ? " ×" + f.scale : "")
          + ((f.type === "int16" || f.type === "uint16" || f.type === "int32" || f.type === "uint32" || f.type === "float32" || f.type === "float64")
            ? (f.big ? " BE" : " LE") : "")
          + ")");
      }
      L.push("数据字段: " + parts.join("  "));
    } else {
      L.push("数据字段: (未定义；当前不会解出任何数值通道)");
    }
    var ck = r.checksum || {};
    function ckName(t) {
      if (t === "sum8") { return "8 位累加和"; }
      if (t === "xor8") { return "8 位异或"; }
      if (t === "sum16") { return "16 位累加和"; }
      if (t === "crc16modbus") { return "CRC16/MODBUS"; }
      return "无";
    }
    if (ck.type && ck.type !== "none") {
      L.push("校验: " + ckName(ck.type) + "（从第 " + (ck.from || 0) + " 字节抽到 "
        + (ck.to === -1 || ck.to === undefined ? "帧末" : ("第 " + ck.to + " 字节")) + "）");
    } else {
      L.push("校验: 无（不做完整性判断）");
    }
    L.push("帧尾: " + (r.tail ? hexSpaced(r.tail) : "(未设置)"));
    L.push("字节序: 多字节字段默认小端，字段上可勾「大端」逐项覆盖");
    return L;
  }

  /* ---------- 单条原始记录 -> 精简样本 ---------- */
  function sampleOf(rec, seq) {
    var s = {
      seq: seq,
      dir: rec.dir === "tx" ? "TX" : "RX"
    };
    if (rec.tLabelAbs) { s.tAbs = rec.tLabelAbs; }
    if (rec.tLabel) { s.tRel = rec.tLabel; }
    if (rec.hex) { s.hex = oneLine(rec.hex, 512); }
    if (rec.text) { s.text = oneLine(rec.text, 240); }
    if (rec.ok === false) {
      s.ok = false;
      if (rec.reason) { s.reason = oneLine(rec.reason, 160); }
    }
    if (rec.values) {
      var vals = {}, has = false;
      for (var k in rec.values) {
        if (!Object.prototype.hasOwnProperty.call(rec.values, k)) { continue; }
        var v = rec.values[k];
        if (typeof v !== "number" || !isFinite(v)) { continue; }
        vals[k] = Math.round(v * 1e6) / 1e6;   /* 收一下尾数，别把包撑大 */
        has = true;
      }
      if (has) { s.values = vals; }
    }
    return s;
  }

  /* ---------- 通道统计（含颜色，便于 AI 判断「哪条线是哪路」） ---------- */
  function channelStats() {
    var list = SL.datastore.listChannels();
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var ch = list[i];
      var st = SL.datastore.stat(ch.key);
      out.push({
        key: ch.key,
        label: ch.label,
        unit: ch.unit || "",
        color: ch.color,
        precision: ch.precision,
        source: ch.source,
        visible: ch.visible !== false,
        count: st.count,
        last: (typeof st.last === "number" && isFinite(st.last)) ? st.last : null,
        min: (typeof st.min === "number" && isFinite(st.min)) ? st.min : null,
        max: (typeof st.max === "number" && isFinite(st.max)) ? st.max : null,
        avg: (typeof st.avg === "number" && isFinite(st.avg)) ? st.avg : null,
        span: (typeof st.span === "number" && isFinite(st.span)) ? st.span : null
      });
    }
    return out;
  }

  /* ---------- 主体 ---------- */
  E.debugBundle = function (opts) {
    opts = opts || {};
    var wantSamples = U.clamp(parseInt(opts.samples, 10) || 400, 20, 5000);

    var cfg = core.config;
    var rule = cfg.rule || {};
    var activeName = (rule.active === "hex") ? "hex" : "text";
    var activeRule = rule[activeName] || {};
    var tp = cfg.transport || {};

    /* 采样：取末尾 wantSamples 条，失败样本单独抽出（最多 40 条） */
    var all = SL.datastore.recentRaw();
    var totalRec = all.length;
    var from = Math.max(0, totalRec - wantSamples);
    var samples = [];
    var failures = [];
    var reasonHist = {};
    var tx = 0, rx = 0;
    var i;
    for (i = 0; i < totalRec; i++) {
      if (all[i].dir === "tx") { tx++; } else { rx++; }
    }
    for (i = from; i < totalRec; i++) {
      var s = sampleOf(all[i], i + 1);
      samples.push(s);
      if (s.ok === false) {
        var rk = s.reason || "未知原因";
        reasonHist[rk] = (reasonHist[rk] || 0) + 1;
        if (failures.length < 40) { failures.push(s); }
      }
    }
    /* 全窗口的失败计数（不只是采样窗） */
    var failTotal = 0;
    for (i = 0; i < totalRec; i++) { if (all[i].ok === false) { failTotal++; } }

    var failList = [];
    for (var rk2 in reasonHist) {
      if (Object.prototype.hasOwnProperty.call(reasonHist, rk2)) {
        failList.push({ reason: rk2, count: reasonHist[rk2] });
      }
    }
    failList.sort(function (a, b) { return b.count - a.count; });

    var chans = channelStats();

    /* 简易规律提示：给 AI 一个起点，别让它全靠猜 */
    var hints = [];
    if (activeName === "text") {
      hints.push("文本模式：若 AI 看到大量「未识别出键值对」，多半是分隔符或数值正则与该设备输出不符。");
      hints.push("可用内置预设一键切换：FireWater / Teleplot（文本），JustFloat / 匿名 V1.0（二进制）。");
    } else {
      hints.push("二进制模式：优先核对帧头、长度字段含义（数据段 or 整帧）与校验起点，这三项最容易对不上。");
      if (!activeRule.head) { hints.push("当前未设帧头，收帧只能靠帧尾或长度字段，长噪声下容易串帧，建议补帧头。"); }
      if (!(activeRule.fields && activeRule.fields.length)) { hints.push("当前未定义数据字段，因此不会有数值通道产出。"); }
    }
    if (failTotal > 0) {
      hints.push("存在解析/校验失败帧（共 " + failTotal + " 条），先把失败样本的 HEX 与规则逐字节对齐，通常能直接定位偏移错误。");
    }
    if (!chans.length) {
      hints.push("还没有任何数值通道：确认设备输出的是 key=value 形式，或改用带字段定义的二进制规则。");
    } else {
      var flat = [];
      for (i = 0; i < chans.length; i++) {
        if (chans[i].count > 0 && chans[i].span === 0) { flat.push(chans[i].key); }
      }
      if (flat.length) { hints.push("以下通道数值恒定（span=0），可能是固定增益、占位字段或解析偏移错位：" + flat.join(", ")); }
    }
    hints.push("本包内的 samples 保留原始 HEX 与解出值，可据此离线复算；改完规则后在本应用「按当前规则重放缓存」即可验证，不必让硬件重跑。");

    var generatedAt = new Date();
    var bundle = {
      kind: BUNDLE_KIND,
      version: BUNDLE_VERSION,
      generatedAt: generatedAt.toISOString(),
      app: { name: "SerialLab · 网页端串口调试助手", configVersion: core.CFG_VERSION },
      connection: {
        conn: core.state.conn || "idle",
        demo: !!core.state.demo,
        paused: !!core.state.paused,
        baudRate: tp.baudRate, dataBits: tp.dataBits, stopBits: tp.stopBits,
        parity: tp.parity, flow: tp.flow, encoding: tp.encoding,
        timeMode: tp.timeMode || "abs", hexRecv: !!tp.hexRecv
      },
      rule: { active: activeName, detail: U.clone(activeRule) },
      frameLayout: describeRule(activeName, activeRule),
      /* 设置快照：AI 要能看懂「用户当前是怎么配的」，否则给出的建议会答非所问 */
      settings: {
        transport: U.clone(tp),
        display: U.clone(cfg.ui || {}),
        panels: (function () {
          var ps = cfg.panels || [];
          var o = [];
          for (var m = 0; m < ps.length; m++) {
            o.push({ id: ps[m].id, type: ps[m].type, slot: ps[m].slot, h: ps[m].h, span: ps[m].span });
          }
          return o;
        })(),
        send: {
          timed: ((cfg.send && cfg.send.timed) || []).length,
          triggers: ((cfg.send && cfg.send.triggers) || []).length,
          presets: ((cfg.send && cfg.send.presets) || []).length
        }
      },
      availablePresets: (function () {
        var src = core.presets ? core.presets() : [];
        var out = [];
        for (var j = 0; j < src.length; j++) {
          out.push({ id: src[j].id, name: src[j].name, brand: src[j].brand, note: src[j].note, sample: src[j].sample });
        }
        return out;
      })(),
      channels: chans,
      stats: {
        rawRecords: totalRec,
        parsedFrames: SL.datastore.totalFrames(),
        bytes: SL.datastore.totalBytes(),
        tx: tx, rx: rx,
        failedFrames: failTotal,
        failureReasons: failList,
        sampleWindow: samples.length
      },
      samples: samples,
      failures: failures,
      hints: hints
    };

    /* ---------------- 纯文本摘要（可直接粘给 AI） ---------------- */
    function ts2(d) {
      function p(n) { return (n < 10 ? "0" : "") + n; }
      return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate())
        + " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
    }
    var B = [];
    B.push("=== SerialLab 串口调试包 v" + BUNDLE_VERSION + " ===");
    B.push("生成时间: " + ts2(generatedAt));
    B.push("应用: SerialLab · 网页端串口调试助手（站点在线版同样可用）");
    B.push("");
    B.push("[连接] " + (bundle.connection.conn) + (bundle.connection.demo ? " · 演示数据" : "")
      + (bundle.connection.paused ? " · 已暂停刷新" : "")
      + " · " + tp.baudRate + " " + tp.dataBits + (String(tp.parity || "none").charAt(0).toUpperCase())
      + tp.stopBits + " · 编码 " + tp.encoding
      + " · 时间戳 " + (bundle.connection.timeMode === "rel" ? "相对秒" : "绝对时刻"));
    B.push("[显示设置] 刷新节流 " + (bundle.settings.display.drawInterval || 40) + "ms"
      + " · 字号 " + (bundle.settings.display.fontSize || 12) + "px"
      + " · 数字标红 " + (bundle.settings.display.highlightNumbers ? "开" : "关")
      + " · 失败行标红 " + (bundle.settings.display.markFailed !== false ? "开" : "关")
      + " · 自动存档 " + (bundle.settings.display.autoRecord !== false ? "开" : "关")
      + "（上限 " + (bundle.settings.display.recordCap || 20000) + " 帧）"
      + " · 图表框 " + bundle.settings.panels.length + " 个");
    B.push("");
    B.push("[帧结构]");
    for (i = 0; i < bundle.frameLayout.length; i++) { B.push("  " + bundle.frameLayout[i]); }
    B.push("");
    B.push("[统计] 原始记录 " + totalRec + " 条 · 解析帧 " + SL.datastore.totalFrames()
      + " · 字节 " + SL.datastore.totalBytes() + " · TX " + tx + " · RX " + rx
      + " · 失败 " + failTotal + " 条");
    if (failList.length) {
      var fr = [];
      for (i = 0; i < failList.length; i++) { fr.push(failList[i].reason + " ×" + failList[i].count); }
      B.push("  失败原因分布: " + fr.join(" / "));
    }
    B.push("");
    if (chans.length) {
      B.push("[通道 " + chans.length + "]");
      B.push("  " + padR("key", 14) + padR("label", 14) + padR("unit", 7)
        + padL("count", 7) + padL("last", 12) + padL("min", 12) + padL("max", 12) + padL("avg", 12) + "  color");
      for (i = 0; i < chans.length; i++) {
        var c = chans[i];
        B.push("  " + padR(oneLine(c.key, 13), 14) + padR(oneLine(c.label, 13), 14) + padR(oneLine(c.unit, 6), 7)
          + padL(c.count, 7)
          + padL(fmtNum(c.last, c.precision), 12)
          + padL(fmtNum(c.min, c.precision), 12)
          + padL(fmtNum(c.max, c.precision), 12)
          + padL(fmtNum(c.avg, c.precision), 12)
          + "  " + c.color);
      }
    } else {
      B.push("[通道] 无（尚未解析出任何数值通道）");
    }
    B.push("");
    /* 只挑尾部若干条，避免摘要过长；完整样本在 JSON 里 */
    var tailN = Math.min(samples.length, 24);
    if (tailN) {
      B.push("[最近 " + tailN + " 条原始记录]（seq 为全局序号，完整 " + samples.length + " 条见 JSON.samples）");
      for (i = samples.length - tailN; i < samples.length; i++) {
        var sm = samples[i];
        var line = "  #" + padL(sm.seq, 6) + " " + padR(sm.tAbs || sm.tRel || "", 14)
          + padR(sm.dir, 4) + padR(sm.ok === false ? "FAIL" : "ok", 6);
        if (sm.hex) { line += padR(oneLine(sm.hex, 38), 40); }
        else if (sm.text) { line += padR(oneLine(sm.text, 38), 40); }
        else { line += padR("", 40); }
        if (sm.values) {
          var kv = [];
          for (var kk in sm.values) {
            if (Object.prototype.hasOwnProperty.call(sm.values, kk)) { kv.push(kk + "=" + sm.values[kk]); }
          }
          line += kv.join(" ");
        }
        if (sm.reason) { line += "  <-- " + sm.reason; }
        B.push(line);
      }
    }
    if (failures.length) {
      B.push("");
      B.push("[失败样本 " + failures.length + " 条]");
      for (i = 0; i < failures.length; i++) {
        var f = failures[i];
        B.push("  #" + padL(f.seq, 6) + " " + padR(f.tAbs || f.tRel || "", 14)
          + padR(f.hex || f.text || "", 40) + "  <-- " + (f.reason || "未知"));
      }
    }
    B.push("");
    B.push("[给 AI 的提示]");
    for (i = 0; i < hints.length; i++) { B.push("  - " + hints[i]); }
    B.push("");
    B.push("[使用方法] 把本段文本（或整个 JSON）发给 AI，并说明「设备在跑什么、期望看到什么」。");
    B.push("           改好规则后回到应用：解析页签套用预设或手改，再点「按当前规则重放缓存」，");
    B.push("           无需让硬件重跑即可当场验证。");

    bundle.brief = B.join("\n");
    return bundle;
  };

  /* 一步到位：生成 + 下载 + 返回摘要（供脚本/控制台调用） */
  E.exportDebugBundleFile = function (opts) {
    var b = E.debugBundle(opts);
    var ok = E.downloadText(JSON.stringify(b, null, 2),
      "seriallab-debug-" + stamp() + ".json", "application/json");
    return { ok: ok, brief: b.brief, bundle: b };
  };

  SL.exporters = E;

  /* UMD 尾：校验脚本可加载 toCsv / withBom / configFromText 做断言 */
  if (typeof module !== "undefined" && module.exports) { module.exports = SL.exporters; }
})(typeof window !== "undefined" ? window : globalThis);
