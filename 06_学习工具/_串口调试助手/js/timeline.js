/* ============================================================
   网页端串口调试助手 · SerialLab
   模块：timeline（时间线：录制 / 冻结 / 回放）
   职责：把流过的帧录成一条可回放、可导出的事故档案。
   依赖：core、util、datastore
   取舍说明：录制数据只放内存（不写 localStorage），因为一次几分钟的
     50Hz 录制就有上万帧，写进 5MB 的 localStorage 只会把配额打爆并
     连带影响配置保存。需要留存时导出 JSON 文件即可。
   ============================================================ */
;(function (global) {
  "use strict";

  var SL = global.SerialLab = global.SerialLab || {};
  var U = SL.util;
  var core = SL.core;

  var T = {};

  var MAX_FRAMES = 200000;    /* 单次录制帧数上限，约 1 小时 @50Hz */
  var MAX_KEEP = 20;          /* 内存里最多保留多少条录制 */

  var records = [];
  var cur = null;

  var playing = false;
  var playRaf = null;
  var playSpeed = 1;
  var playIdx = 0;
  var playStart = 0;
  var playT0 = 0;
  var playRecord = null;

  /* ------------------------------------------------------------
     1) 录制
     ------------------------------------------------------------ */
  T.startRecord = function (name) {
    if (cur) { return cur; }
    cur = {
      id: U.nextId("rec"),
      name: name || ("录制 " + new Date().toLocaleTimeString()),
      startedAt: U.now(),
      endedAt: 0,
      channels: SL.datastore.snapshot(),
      rule: U.clone(core.config.rule),
      frames: []
    };
    core.set("recording", true);
    core.emit("timeline:record", { state: "start", record: cur });
    core.log("info", "开始录制");
    return cur;
  };

  T.stopRecord = function () {
    if (!cur) { return null; }
    cur.endedAt = U.now();
    var rec = cur;
    cur = null;
    records.push(rec);
    while (records.length > MAX_KEEP) { records.shift(); }
    core.set("recording", false);
    core.emit("timeline:record", { state: "stop", record: rec });
    core.log("info", "录制结束：" + rec.frames.length + " 帧，时长 "
      + Math.round((rec.endedAt - rec.startedAt)) + "ms");
    return rec;
  };

  T.isRecording = function () { return !!cur; };
  T.current = function () { return cur; };
  T.frameCount = function () { return cur ? cur.frames.length : 0; };

  T.list = function () {
    var out = [];
    for (var i = 0; i < records.length; i++) { out.push(records[i]); }
    return out;
  };

  T.get = function (id) {
    for (var i = 0; i < records.length; i++) { if (records[i].id === id) { return records[i]; } }
    return null;
  };

  T.remove = function (id) {
    for (var i = records.length - 1; i >= 0; i--) {
      if (records[i].id === id) { records.splice(i, 1); }
    }
    core.emit("timeline:list", {});
  };

  T.clear = function () {
    records = [];
    core.emit("timeline:list", {});
  };

  /* 订阅管线广播的每一帧 */
  core.on("frame", function (frame) {
    if (!cur) { return; }
    if (frame && frame.source === "playback") { return; }   /* 回放出来的帧不再录进去 */
    if (cur.frames.length >= MAX_FRAMES) {
      core.log("warn", "录制已达上限（" + MAX_FRAMES + " 帧），自动停止");
      T.stopRecord();
      return;
    }
    cur.frames.push({
      t: Math.round(frame.t * 1000) / 1000,
      dir: frame.dir || "rx",
      rawHex: frame.raw ? U.bytesToHex(frame.raw) : "",
      text: frame.text || "",
      values: U.clone(frame.values || {})
    });
    if (cur.frames.length % 200 === 0) {
      core.emit("timeline:progress", { count: cur.frames.length });
    }
  });

  /* ------------------------------------------------------------
     2) 冻结显示
     ------------------------------------------------------------ */
  T.freeze = function (on) {
    core.set("paused", !!on);
    core.emit("timeline:freeze", { frozen: !!core.state.paused });
    if (SL.views) {
      if (core.state.paused) { SL.views.stop(); }
      else { SL.views.start(); SL.views.redraw(); }
    }
    core.log("info", core.state.paused ? "显示已冻结（数据仍在接收）" : "显示已恢复");
  };

  T.toggleFreeze = function () { T.freeze(!core.state.paused); };
  T.isFrozen = function () { return !!core.state.paused; };

  /* ------------------------------------------------------------
     3) 回放
     按帧的相对时间戳重新喂给 datastore，让图表重演当时的过程。
     ------------------------------------------------------------ */
  T.play = function (record, opts) {
    opts = opts || {};
    if (!record || !record.frames || !record.frames.length) {
      core.emit("toast", { level: "warn", msg: "这条录制是空的，无法回放" });
      return false;
    }
    T.stopPlay();

    playRecord = record;
    playSpeed = (typeof opts.speed === "number" && opts.speed > 0) ? opts.speed : 1;
    playIdx = 0;
    playStart = U.now();
    playT0 = record.frames[0].t;
    playing = true;

    /* 回放期间解除冻结，否则屏幕上什么都看不到 */
    if (core.state.paused) { T.freeze(false); }

    core.emit("timeline:play", { state: "start", record: record, speed: playSpeed });

    (function tick() {
      if (!playing) { return; }
      var elapsed = (U.now() - playStart) * playSpeed;
      var pushed = 0;
      while (playIdx < record.frames.length && (record.frames[playIdx].t - playT0) <= elapsed && pushed < 500) {
        var f = record.frames[playIdx];
        SL.datastore.pushFrame({
          t: U.now(),                 /* 用当前时间，让波形滚动起来 */
          values: f.values,
          dir: f.dir,
          raw: f.rawHex ? U.hexToBytes(f.rawHex) : null,
          text: f.text,
          source: "playback"
        });
        playIdx++;
        pushed++;
      }
      if (playIdx >= record.frames.length) {
        T.stopPlay();
        core.emit("toast", { level: "ok", msg: "回放完成：" + record.frames.length + " 帧" });
        return;
      }
      playRaf = global.requestAnimationFrame(tick);
    })();

    return true;
  };

  T.stopPlay = function () {
    if (!playing) { return; }
    playing = false;
    if (playRaf) { global.cancelAnimationFrame(playRaf); playRaf = null; }
    core.emit("timeline:play", { state: "stop", record: playRecord });
    playRecord = null;
  };

  T.isPlaying = function () { return playing; };
  T.playProgress = function () {
    if (!playing || !playRecord) { return 0; }
    return playRecord.frames.length ? (playIdx / playRecord.frames.length) : 0;
  };
  T.setPlaySpeed = function (s) { playSpeed = Math.max(0.1, Math.min(50, s || 1)); };
  T.playSpeed = function () { return playSpeed; };

  /* ------------------------------------------------------------
     4) 记录序列化（导出 / 导入）
     ------------------------------------------------------------ */
  T.toJSON = function (recordOrList) {
    var payload;
    if (Object.prototype.toString.call(recordOrList) === "[object Array]") {
      payload = recordOrList;
    } else if (recordOrList) {
      payload = [recordOrList];
    } else {
      payload = records;
    }
    return JSON.stringify({
      kind: "seriallab-record",
      version: 1,
      exportedAt: new Date().toISOString(),
      records: payload
    }, null, 1);
  };

  T.fromJSON = function (text) {
    var obj;
    try { obj = JSON.parse(text); }
    catch (e) { return { ok: false, added: 0, errors: ["不是合法的 JSON"] }; }

    if (!obj || obj.kind !== "seriallab-record") {
      return { ok: false, added: 0, errors: ["录制文件类型不匹配（期望 seriallab-record）"] };
    }
    var v = parseInt(obj.version, 10);
    if (isNaN(v)) { v = 0; }
    if (v > 1) { return { ok: false, added: 0, errors: ["录制文件版本（v" + v + "）高于本应用支持的 v1"] }; }

    var list = Object.prototype.toString.call(obj.records) === "[object Array]" ? obj.records : [];
    var errors = [];
    var added = 0;

    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (!r || typeof r !== "object") { errors.push("第 " + (i + 1) + " 条记录非法，已跳过"); continue; }
      var frames = Object.prototype.toString.call(r.frames) === "[object Array]" ? r.frames : [];
      var clean = [];
      for (var j = 0; j < frames.length && j < MAX_FRAMES; j++) {
        var f = frames[j];
        if (!f || typeof f !== "object") { continue; }
        clean.push({
          t: typeof f.t === "number" ? f.t : 0,
          dir: f.dir === "tx" ? "tx" : "rx",
          rawHex: typeof f.rawHex === "string" ? f.rawHex : "",
          text: typeof f.text === "string" ? f.text : "",
          values: (f.values && typeof f.values === "object") ? f.values : {}
        });
      }
      records.push({
        id: U.nextId("rec"),
        name: typeof r.name === "string" ? r.name : ("导入录制 " + (i + 1)),
        startedAt: typeof r.startedAt === "number" ? r.startedAt : 0,
        endedAt: typeof r.endedAt === "number" ? r.endedAt : 0,
        channels: Object.prototype.toString.call(r.channels) === "[object Array]" ? r.channels : [],
        rule: (r.rule && typeof r.rule === "object") ? r.rule : {},
        frames: clean
      });
      added++;
    }
    while (records.length > MAX_KEEP) { records.shift(); }
    core.emit("timeline:list", {});
    return { ok: added > 0, added: added, errors: errors };
  };

  /* 记录的时长与体积摘要（列表显示用） */
  T.summary = function (rec) {
    if (!rec) { return { frames: 0, durationMs: 0 }; }
    var dur = (rec.endedAt && rec.startedAt) ? (rec.endedAt - rec.startedAt) : 0;
    if (!dur && rec.frames.length > 1) { dur = rec.frames[rec.frames.length - 1].t - rec.frames[0].t; }
    return { frames: rec.frames.length, durationMs: Math.round(dur) };
  };

  SL.timeline = T;

  /* UMD 尾：校验脚本可加载 toJSON / fromJSON 做往返断言 */
  if (typeof module !== "undefined" && module.exports) { module.exports = SL.timeline; }
})(typeof window !== "undefined" ? window : globalThis);
