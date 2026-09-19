/* ============================================================
 * 00_lyrics.js —— 歌词与时间轴（内嵌，运行时零网络依赖）
 * 本文件由 tools/extract.js 自动生成，请勿手改。
 * ============================================================ */

(function (global) {
  'use strict';

  // 【第一份】LRC 原文，逐字保留，用于加载时互校验
  var LRC_TEXT = [
    "[ti:SLOW MOTION (CASTLE. Remix)]",
    "[ar:Jonah Marais / Castle.]",
    "[al:SLOW MOTION REMIXES]",
    "[length:03:07]",
    "[offset:0]",
    "[by:时间轴取自网易云音乐 · 已用本地音频 onset 校验]",
    "[00:55.388]Can't believe my eyes, running around the sun",
    "[00:59.872]Everyone I know runs, everyone I know runs",
    "[01:04.601]At the speed of light, can we just have some fun",
    "[01:09.123]Everyone slow motion, everyone slow motion",
    "[01:32.081]Can't believe my eyes, running around the sun",
    "[01:36.744]Everyone I know runs, everyone I know runs",
    "[01:41.423]At the speed of light, can we just have some fun",
    "[01:46.065]Everyone slow motion, everyone slow motion",
    "[01:52.878]Runnin' around the sun",
    "[01:55.132]Everyone I know runs, everyone I know runs",
    "[01:59.891]At the speed of light, can't we just have some fun",
    "[02:04.361]Everyone slow motion, everyone slow motion",
    "[02:11.481]Can't believe my eyes, running around the sun",
    "[02:16.058]Everyone I know runs, everyone I know runs",
    "[02:20.716]At the speed of light, can we just have some fun",
    "[02:25.369]Everyone slow motion, everyone slow motion",
    "[02:30.039]Can't believe my eyes, running around the sun",
    "[02:34.491]Everyone I know runs, everyone I know runs",
    "[02:39.204]At the speed of light, can we just have some fun",
    "[02:43.739]Everyone slow motion, everyone slow motion",
    "[02:48.424]Can't believe my eyes, running around the sun",
    "[02:53.019]Everyone I know runs, everyone I know runs",
    "[02:57.683]At the speed of light, can we just have some fun",
    "[03:02.201]Everyone slow motion, everyone slow motion",
  ].join("\n");

  // 【第二份】硬编码 cue 数组（运行时真正使用的数据）
  var CUES = [
    { i: 0, ms: 55388, t: 55.388, g: 0, line: 0, kind: "chorus", view: "ground", scene: "g0l0", en: "Can't believe my eyes, running around the sun", zh: "不敢相信 我追逐着太阳" },
    { i: 1, ms: 59872, t: 59.872, g: 0, line: 1, kind: "chorus", view: "ground", scene: "g0l1", en: "Everyone I know runs, everyone I know runs", zh: "我认识的人 皆匆匆而过" },
    { i: 2, ms: 64601, t: 64.601, g: 0, line: 2, kind: "chorus", view: "ground", scene: "g0l2", en: "At the speed of light, can we just have some fun", zh: "如同光速飞掠 可否稍作停留" },
    { i: 3, ms: 69123, t: 69.123, g: 0, line: 3, kind: "chorus", view: "ground", scene: "g0l3", en: "Everyone slow motion, everyone slow motion", zh: "每个人都慢下来 每个人都慢下来" },
    { i: 4, ms: 92081, t: 92.081, g: 1, line: 0, kind: "chorus", view: "altitude", scene: "g1l0", en: "Can't believe my eyes, running around the sun", zh: "不敢相信 我追逐着太阳" },
    { i: 5, ms: 96744, t: 96.744, g: 1, line: 1, kind: "chorus", view: "altitude", scene: "g1l1", en: "Everyone I know runs, everyone I know runs", zh: "我认识的人 皆匆匆而过" },
    { i: 6, ms: 101423, t: 101.423, g: 1, line: 2, kind: "chorus", view: "altitude", scene: "g1l2", en: "At the speed of light, can we just have some fun", zh: "如同光速飞掠 可否稍作停留" },
    { i: 7, ms: 106065, t: 106.065, g: 1, line: 3, kind: "chorus", view: "altitude", scene: "g1l3", en: "Everyone slow motion, everyone slow motion", zh: "每个人都慢下来 每个人都慢下来" },
    { i: 8, ms: 112878, t: 112.878, g: 2, line: 0, kind: "bridge", view: "cockpit", scene: "g2l0", en: "Runnin' around the sun", zh: "追逐着太阳" },
    { i: 9, ms: 115132, t: 115.132, g: 2, line: 1, kind: "bridge", view: "cockpit", scene: "g2l1", en: "Everyone I know runs, everyone I know runs", zh: "我认识的人 皆匆匆而过" },
    { i: 10, ms: 119891, t: 119.891, g: 2, line: 2, kind: "bridge", view: "cockpit", scene: "g2l2", en: "At the speed of light, can't we just have some fun", zh: "如同光速飞掠 可否稍作停留" },
    { i: 11, ms: 124361, t: 124.361, g: 2, line: 3, kind: "bridge", view: "cockpit", scene: "g2l3", en: "Everyone slow motion, everyone slow motion", zh: "每个人都慢下来 每个人都慢下来" },
    { i: 12, ms: 131481, t: 131.481, g: 3, line: 0, kind: "chorus", view: "shadow", scene: "g3l0", en: "Can't believe my eyes, running around the sun", zh: "不敢相信 我追逐着太阳" },
    { i: 13, ms: 136058, t: 136.058, g: 3, line: 1, kind: "chorus", view: "shadow", scene: "g3l1", en: "Everyone I know runs, everyone I know runs", zh: "我认识的人 皆匆匆而过" },
    { i: 14, ms: 140716, t: 140.716, g: 3, line: 2, kind: "chorus", view: "shadow", scene: "g3l2", en: "At the speed of light, can we just have some fun", zh: "如同光速飞掠 可否稍作停留" },
    { i: 15, ms: 145369, t: 145.369, g: 3, line: 3, kind: "chorus", view: "shadow", scene: "g3l3", en: "Everyone slow motion, everyone slow motion", zh: "每个人都慢下来 每个人都慢下来" },
    { i: 16, ms: 150039, t: 150.039, g: 4, line: 0, kind: "chorus", view: "orbit", scene: "g4l0", en: "Can't believe my eyes, running around the sun", zh: "不敢相信 我追逐着太阳" },
    { i: 17, ms: 154491, t: 154.491, g: 4, line: 1, kind: "chorus", view: "orbit", scene: "g4l1", en: "Everyone I know runs, everyone I know runs", zh: "我认识的人 皆匆匆而过" },
    { i: 18, ms: 159204, t: 159.204, g: 4, line: 2, kind: "chorus", view: "orbit", scene: "g4l2", en: "At the speed of light, can we just have some fun", zh: "如同光速飞掠 可否稍作停留" },
    { i: 19, ms: 163739, t: 163.739, g: 4, line: 3, kind: "chorus", view: "orbit", scene: "g4l3", en: "Everyone slow motion, everyone slow motion", zh: "每个人都慢下来 每个人都慢下来" },
    { i: 20, ms: 168424, t: 168.424, g: 5, line: 0, kind: "chorus", view: "sun", scene: "g5l0", en: "Can't believe my eyes, running around the sun", zh: "不敢相信 我追逐着太阳" },
    { i: 21, ms: 173019, t: 173.019, g: 5, line: 1, kind: "chorus", view: "sun", scene: "g5l1", en: "Everyone I know runs, everyone I know runs", zh: "我认识的人 皆匆匆而过" },
    { i: 22, ms: 177683, t: 177.683, g: 5, line: 2, kind: "chorus", view: "sun", scene: "g5l2", en: "At the speed of light, can we just have some fun", zh: "如同光速飞掠 可否稍作停留" },
    { i: 23, ms: 182201, t: 182.201, g: 5, line: 3, kind: "chorus", view: "sun", scene: "g5l3", en: "Everyone slow motion, everyone slow motion", zh: "每个人都慢下来 每个人都慢下来" },
  ];

  // 【互校验】把 CUES 重新格式化成 LRC，与 LRC_TEXT 逐行比对。
  // 任一文件被改动，这里立刻暴露。
  function selfCheck() {
    var rebuilt = CUES.map(function (c) {
      var mm = Math.floor(c.ms / 60000);
      var ss = Math.floor((c.ms % 60000) / 1000);
      var xxx = c.ms % 1000;
      return "[" + pad2(mm) + ":" + pad2(ss) + "." + pad3(xxx) + "]" + c.en;
    });
    var expect = LRC_TEXT.split("\n").filter(function (s) {
      return /^\[\d{2}:\d{2}\.\d{3}\]/.test(s.trim());
    }).map(function (s) { return s.trim(); });
    if (rebuilt.length !== expect.length) {
      return { ok: false, msg: "LRC 行数不符: 数组 " + rebuilt.length + " vs 文本 " + expect.length };
    }
    for (var i = 0; i < rebuilt.length; i++) {
      if (rebuilt[i] !== expect[i]) {
        return { ok: false, msg: "LRC 第 " + (i + 1) + " 行不符\n  数组: " + rebuilt[i] + "\n  文本: " + expect[i] };
      }
    }
    return { ok: true, msg: "歌词双份数据一致（" + rebuilt.length + " 行）" };
  }

  function pad2(n) { return n < 10 ? "0" + n : "" + n; }
  function pad3(n) { return n < 10 ? "00" + n : (n < 100 ? "0" + n : "" + n); }

  global.SM = global.SM || {};
  global.SM.LRC_TEXT = LRC_TEXT;
  global.SM.CUES = CUES;
  global.SM.lyricsSelfCheck = selfCheck;

})(window);