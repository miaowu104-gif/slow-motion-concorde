/* ============================================================
 * extract.js —— 把 LRC 时间轴与 MIDI 分析结果提取为可内嵌的数据
 * 用法: node tools/extract.js
 *
 * 产出:
 *   js/00_lyrics.js   歌词（内嵌原文 + 硬编码数组，双份互校验）
 *   js/01_score.js    重音数据（旋律音符起点 / 和弦段 / 低音）
 *   tools/_data.json  提取摘要，供验证脚本比对
 * ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');            // E:\2
const PROJ = path.resolve(__dirname, '..');                  // E:\deepseek\slow-motion-concorde\slow-motion-animation
const REPORT = path.join(ROOT, 'SLOW_MOTION_CASTLE_Remix_MIDI_交付包',
                         '分析报告', '分析报告_BPM104_F小调.json');
const LRC_EN = path.join(ROOT, 'lrc', 'Jonah Marais _ Castle_ - SLOW MOTION (CASTLE_ Remix).lrc');
const LRC_BI = path.join(ROOT, 'lrc', 'Jonah Marais _ Castle_ - SLOW MOTION (CASTLE_ Remix)_中英双语.lrc');

/* ---------- 读取 ---------- */
function readText(p) {
  if (!fs.existsSync(p)) throw new Error('文件不存在，实际请求路径: ' + p);
  // 去掉 BOM
  return fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
}

const report = JSON.parse(readText(REPORT));
const lrcEn = readText(LRC_EN);
const lrcBi = readText(LRC_BI);

/* ---------- 解析 LRC ---------- */
// [mm:ss.xxx]text
const LINE_RE = /^\[(\d{2}):(\d{2})\.(\d{3})\](.*)$/;

function parseLrc(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const m = LINE_RE.exec(raw.trim());
    if (!m) continue;
    const t = (+m[1]) * 60 + (+m[2]) + (+m[3]) / 1000;
    out.push({ t: Math.round(t * 1000) / 1000, text: m[4].trim() });
  }
  return out;
}

const enLines = parseLrc(lrcEn);
// 双语文件里同一时间戳有两行（英文 + 中文），按时间戳分组
const biRaw = parseLrc(lrcBi);
const biMap = new Map();
for (const r of biRaw) {
  if (!biMap.has(r.t)) biMap.set(r.t, []);
  biMap.get(r.t).push(r.text);
}

/* ---------- 组合 cue ---------- */
// 结构（来自《理解笔记》第 3.5 节）：
//   组0 副歌#1 0:55.388   组1 副歌#2 1:32.081   组2 bridge 1:52.878
//   组3 副歌#3 2:11.481   组4 副歌#4 2:30.039   组5 副歌#5 2:48.424
const GROUP_STARTS = [55388, 92081, 112878, 131481, 150039, 168424];
const GROUP_KIND = ['chorus', 'chorus', 'bridge', 'chorus', 'chorus', 'chorus'];
const GROUP_VIEW = ['ground', 'altitude', 'cockpit', 'shadow', 'orbit', 'sun'];

const cues = enLines.map((line, i) => {
  const group = GROUP_STARTS.findIndex((g, gi) =>
    line.t * 1000 >= g - 1 &&
    (gi === GROUP_STARTS.length - 1 || line.t * 1000 < GROUP_STARTS[gi + 1] - 1));
  const bi = biMap.get(line.t) || [];
  const zh = bi.length > 1 ? bi[1] : '';
  const idxInGroup = enLines
    .slice(0, i)
    .filter((l) => {
      const g = GROUP_STARTS.findIndex((gg, gi) =>
        l.t * 1000 >= gg - 1 &&
        (gi === GROUP_STARTS.length - 1 || l.t * 1000 < GROUP_STARTS[gi + 1] - 1));
      return g === group;
    }).length;
  return {
    i,
    t: line.t,
    ms: Math.round(line.t * 1000),
    en: line.text,
    zh: zh,
    group: group,
    line: idxInGroup,
    kind: GROUP_KIND[group] || 'chorus',
    view: GROUP_VIEW[group] || 'ground',
    scene: 'g' + group + 'l' + idxInGroup,
  };
});

/* ---------- 校验 ---------- */
const problems = [];
if (cues.length !== 24) problems.push('cue 数应为 24，实际 ' + cues.length);
for (const c of cues) {
  if (!c.zh) problems.push('cue ' + c.i + ' 缺中文译文');
  if (c.group < 0) problems.push('cue ' + c.i + ' 未归入任何组');
}
// 每组的行序必须是 0,1,2,3
for (let g = 0; g < 6; g++) {
  const inG = cues.filter((c) => c.group === g).map((c) => c.line).sort();
  const want = [0, 1, 2, 3];
  if (JSON.stringify(inG) !== JSON.stringify(want)) {
    problems.push('组 ' + g + ' 行序异常: ' + JSON.stringify(inG));
  }
}
// bridge 组第 3 句必须是 can't we
const bridgeLine2 = cues.find((c) => c.kind === 'bridge' && c.line === 2);
if (!bridgeLine2 || !/can't we/i.test(bridgeLine2.en)) {
  problems.push('bridge 第 3 句未检出 can\'t we');
}

/* ---------- 重音数据 ---------- */
const mel = report['音符明细'].map((n) => ({
  ms: Math.round(n.start * 1000),
  endMs: Math.round(n.end * 1000),
  p: n.pitch,
}));
const chords = report['和弦序列'].map((c) => ({
  ms: Math.round(c.start * 1000),
  endMs: Math.round(c.end * 1000),
  c: c.chord,
}));

const CHORD_NAMES = [...new Set(chords.map((c) => c.c))];

/* ---------- 写出 ---------- */
function banner(title) {
  return '/* ' + '='.repeat(60) + '\n' +
         ' * ' + title + '\n' +
         ' * 本文件由 tools/extract.js 自动生成，请勿手改。\n' +
         ' * ' + '='.repeat(60) + ' */\n';
}

// ---- 00_lyrics.js ----
const lyr = [];
lyr.push(banner('00_lyrics.js —— 歌词与时间轴（内嵌，运行时零网络依赖）'));
lyr.push('(function (global) {');
lyr.push("  'use strict';");
lyr.push('');
lyr.push('  // 【第一份】LRC 原文，逐字保留，用于加载时互校验');
lyr.push('  var LRC_TEXT = [');
for (const raw of lrcEn.split(/\r?\n/)) {
  if (!raw.trim()) continue;
  lyr.push('    ' + JSON.stringify(raw.trim()) + ',');
}
lyr.push('  ].join("\\n");');
lyr.push('');
lyr.push('  // 【第二份】硬编码 cue 数组（运行时真正使用的数据）');
lyr.push('  var CUES = [');
for (const c of cues) {
  lyr.push('    { i: ' + c.i + ', ms: ' + c.ms + ', t: ' + c.t +
           ', g: ' + c.group + ', line: ' + c.line +
           ', kind: ' + JSON.stringify(c.kind) +
           ', view: ' + JSON.stringify(c.view) +
           ', scene: ' + JSON.stringify(c.scene) +
           ', en: ' + JSON.stringify(c.en) +
           ', zh: ' + JSON.stringify(c.zh) + ' },');
}
lyr.push('  ];');
lyr.push('');
lyr.push('  // 【互校验】把 CUES 重新格式化成 LRC，与 LRC_TEXT 逐行比对。');
lyr.push('  // 任一文件被改动，这里立刻暴露。');
lyr.push('  function selfCheck() {');
lyr.push('    var rebuilt = CUES.map(function (c) {');
lyr.push('      var mm = Math.floor(c.ms / 60000);');
lyr.push('      var ss = Math.floor((c.ms % 60000) / 1000);');
lyr.push('      var xxx = c.ms % 1000;');
lyr.push('      return "[" + pad2(mm) + ":" + pad2(ss) + "." + pad3(xxx) + "]" + c.en;');
lyr.push('    });');
lyr.push('    var expect = LRC_TEXT.split("\\n").filter(function (s) {');
lyr.push('      return /^\\[\\d{2}:\\d{2}\\.\\d{3}\\]/.test(s.trim());');
lyr.push('    }).map(function (s) { return s.trim(); });');
lyr.push('    if (rebuilt.length !== expect.length) {');
lyr.push('      return { ok: false, msg: "LRC 行数不符: 数组 " + rebuilt.length + " vs 文本 " + expect.length };');
lyr.push('    }');
lyr.push('    for (var i = 0; i < rebuilt.length; i++) {');
lyr.push('      if (rebuilt[i] !== expect[i]) {');
lyr.push('        return { ok: false, msg: "LRC 第 " + (i + 1) + " 行不符\\n  数组: " + rebuilt[i] + "\\n  文本: " + expect[i] };');
lyr.push('      }');
lyr.push('    }');
lyr.push('    return { ok: true, msg: "歌词双份数据一致（" + rebuilt.length + " 行）" };');
lyr.push('  }');
lyr.push('');
lyr.push('  function pad2(n) { return n < 10 ? "0" + n : "" + n; }');
lyr.push('  function pad3(n) { return n < 10 ? "00" + n : (n < 100 ? "0" + n : "" + n); }');
lyr.push('');
lyr.push('  global.SM = global.SM || {};');
lyr.push('  global.SM.LRC_TEXT = LRC_TEXT;');
lyr.push('  global.SM.CUES = CUES;');
lyr.push('  global.SM.lyricsSelfCheck = selfCheck;');
lyr.push('');
lyr.push('})(window);');
fs.writeFileSync(path.join(PROJ, 'js', '00_lyrics.js'), lyr.join('\n'), 'utf8');

// ---- 01_score.js ----
const sc = [];
sc.push(banner('01_score.js —— 重音谱（由 MIDI 分析结果提取，卡点用真实演奏而非节拍器）'));
sc.push('(function (global) {');
sc.push("  'use strict';");
sc.push('');
sc.push('  // 旋律音符起点（毫秒）与音高（MIDI），共 ' + mel.length + ' 个');
sc.push('  var MEL = [');
let row = [];
for (const n of mel) {
  row.push(n.ms + ',' + n.p);
  if (row.length === 10) { sc.push('    ' + row.join(',') + ','); row = []; }
}
if (row.length) sc.push('    ' + row.join(',') + ',');
sc.push('  ];');
sc.push('');
sc.push('  // 和弦段（毫秒），共 ' + chords.length + ' 段；名称索引见 CHORD_NAMES');
sc.push('  var CHORD_NAMES = ' + JSON.stringify(CHORD_NAMES) + ';');
sc.push('  var CHORDS = [');
row = [];
for (const c of chords) {
  row.push(c.ms + ',' + CHORD_NAMES.indexOf(c.c));
  if (row.length === 12) { sc.push('    ' + row.join(',') + ','); row = []; }
}
if (row.length) sc.push('    ' + row.join(',') + ',');
sc.push('  ];');
sc.push('');
sc.push('  global.SM = global.SM || {};');
sc.push('  global.SM.MEL = MEL;');
sc.push('  global.SM.CHORDS = CHORDS;');
sc.push('  global.SM.CHORD_NAMES = CHORD_NAMES;');
sc.push('  // 音高范围（用于映射视觉强度）');
sc.push('  global.SM.PITCH_MIN = ' + Math.min(...mel.map((n) => n.p)) + ';');
sc.push('  global.SM.PITCH_MAX = ' + Math.max(...mel.map((n) => n.p)) + ';');
sc.push('');
sc.push('})(window);');
fs.writeFileSync(path.join(PROJ, 'js', '01_score.js'), sc.join('\n'), 'utf8');

// ---- 摘要 ----
const summary = {
  audio: { durationSec: report['时长秒'], bpm: report['估计BPM'], key: report['推断调性'] },
  cues: cues.length,
  melodyNotes: mel.length,
  chordSegs: chords.length,
  firstCueMs: cues[0].ms,
  lastCueMs: cues[cues.length - 1].ms,
  problems: problems,
};
fs.writeFileSync(path.join(PROJ, 'tools', '_data.json'),
                 JSON.stringify(summary, null, 2), 'utf8');

/* ---------- 控制台报告 ---------- */
console.log('音频时长      : ' + summary.audio.durationSec + ' s');
console.log('BPM / 调性    : ' + summary.audio.bpm + ' / ' + summary.audio.key);
console.log('歌词 cue      : ' + summary.cues + ' 条  (首 ' + summary.firstCueMs + ' ms, 末 ' + summary.lastCueMs + ' ms)');
console.log('旋律音符      : ' + summary.melodyNotes);
console.log('和弦段        : ' + summary.chordSegs + '  (' + CHORD_NAMES.join(' ') + ')');
console.log('音高范围      : ' + Math.min(...mel.map((n) => n.p)) + ' .. ' + Math.max(...mel.map((n) => n.p)));
console.log('--- 六组视图 ---');
for (let g = 0; g < 6; g++) {
  const inG = cues.filter((c) => c.group === g);
  console.log('  组' + g + ' [' + GROUP_KIND[g] + '/' + GROUP_VIEW[g] + '] ' +
              inG.length + ' 行, 起 ' + inG[0].ms + ' ms');
}
if (problems.length) {
  console.log('\n!! 问题 ' + problems.length + ' 项:');
  for (const p of problems) console.log('   - ' + p);
  process.exitCode = 1;
} else {
  console.log('\nOK 数据校验全部通过');
}
