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

  SL.exporters = E;

  /* UMD 尾：校验脚本可加载 toCsv / withBom / configFromText 做断言 */
  if (typeof module !== "undefined" && module.exports) { module.exports = SL.exporters; }
})(typeof window !== "undefined" ? window : globalThis);
