/* ============================================================
 * verify.js —— 几何级验证（不经过光栅器）
 *
 * 依据 注意事项.md ②⑤：
 *   ② 覆盖率必须验证"画出来了"，不能只验证"注册了"。
 *   ⑤ 判断作品对不对的工具本身必须先是对的 ——
 *      所以这里不做像素光栅化，而是直接量【绘图调用的坐标】。
 *
 * 用法: node tools/verify.js
 * ============================================================ */
'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const PROJ = path.resolve(__dirname, '..');
const W = 1600, H = 900;

let FAIL = 0;
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  if (!ok) FAIL++;
}

/* ============================================================
 * 1. 记录型 Canvas 2D 上下文
 * ============================================================ */
function bboxOf(pts) {
  if (!pts.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    if (p[0] < x0) x0 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[0] > x1) x1 = p[0];
    if (p[1] > y1) y1 = p[1];
  }
  return { x0, y0, x1, y1, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

function createMockCtx() {
  const ops = [];
  let pts = [];              // 当前路径的点
  const st = {
    fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1,
    lineCap: 'butt', lineJoin: 'miter', globalAlpha: 1,
    globalCompositeOperation: 'source-over', font: '10px sans-serif',
    textAlign: 'start', textBaseline: 'alphabetic', shadowColor: '#000',
    shadowBlur: 0, lineDashOffset: 0, filter: 'none',
  };
  const stack = [];

  const grad = () => ({ addColorStop() {} });
  const arcPts = (x, y, r) => [[x - r, y - r], [x + r, y + r], [x, y], [x - r, y], [x + r, y]];

  function fontPx() {
    const m = /(\d+(?:\.\d+)?)px/.exec(String(st.font));
    return m ? parseFloat(m[1]) : 10;
  }

  function push(kind, style, points, extra) {
    const bb = bboxOf(points);
    ops.push({
      kind, style, extra: extra || null, alpha: st.globalAlpha,
      lw: st.lineWidth, bbox: bb, npts: points.length,
      zeroAlpha: st.globalAlpha <= 0.003,
    });
  }

  const ctx = {
    /* --- 状态 --- */
    save() { stack.push(Object.assign({}, st)); },
    restore() { const s = stack.pop(); if (s) Object.assign(st, s); },
    /* --- 路径 --- */
    beginPath() { pts = []; },
    closePath() { if (pts.length) pts.push(pts[0].slice()); },
    moveTo(x, y) { pts.push([x, y]); },
    lineTo(x, y) { pts.push([x, y]); },
    quadraticCurveTo(cx, cy, x, y) { pts.push([cx, cy], [x, y]); },
    bezierCurveTo(a, b, c, d, x, y) { pts.push([a, b], [c, d], [x, y]); },
    arcTo(x1, y1, x2, y2, r) { pts.push([x1, y1], [x2, y2]); },
    rect(x, y, w, h) { pts.push([x, y], [x + w, y + h]); },
    arc(x, y, r) { pts = pts.concat(arcPts(x, y, r)); },
    ellipse(x, y, rx, ry) { pts = pts.concat(arcPts(x, y, Math.max(rx, ry))); },
    fill() { push('fill', st.fillStyle, pts, { path: true }); },
    stroke() { push('stroke', st.strokeStyle, pts, { path: true }); },
    clip() {
      ops.push({ kind: 'clip', style: '#clip', extra: { clip: true }, alpha: st.globalAlpha,
                 lw: st.lineWidth, bbox: null, npts: 0, zeroAlpha: false });
    },
    /* --- 直接图元 --- */
    fillRect(x, y, w, h) {
      push('fillRect', st.fillStyle, [[x, y], [x + w, y + h]],
           { x, y, w, h, full: (w >= W - 1 && h >= H - 1) });
    },
    strokeRect(x, y, w, h) {
      push('strokeRect', st.strokeStyle, [[x, y], [x + w, y + h]], { x, y, w, h });
    },
    clearRect(x, y, w, h) {
      push('clearRect', '#clear', [[x, y], [x + w, y + h]], { clear: true, x, y, w, h });
    },
    fillText(text, x, y) {
      const w = String(text).length * fontPx() * 0.52;
      push('fillText', st.fillStyle, [[x - w / 2, y - fontPx()], [x + w / 2, y + fontPx() * 0.3]],
           { text: String(text) });
    },
    strokeText(text, x, y) {
      const w = String(text).length * fontPx() * 0.52;
      push('strokeText', st.strokeStyle, [[x - w / 2, y - fontPx()], [x + w / 2, y + fontPx() * 0.3]],
           { text: String(text) });
    },
    measureText(t) { return { width: String(t).length * fontPx() * 0.52 }; },
    /* --- 变换（几何量测用逻辑坐标，变换不参与） --- */
    translate() {}, rotate() {}, scale() {}, transform() {},
    setTransform() {}, resetTransform() {},
    /* --- 其它 --- */
    setLineDash() {}, getLineDash() { return []; },
    createLinearGradient: grad, createRadialGradient: grad, createPattern: grad,
    drawImage() {}, putImageData() {}, getImageData() { return { data: [] }; },
    isPointInPath() { return false; },
    /* --- 属性代理 --- */
    __ops: ops,
    __state: st,
  };

  /* 让 fillStyle / globalAlpha 等的读写走 st */
  for (const k of Object.keys(st)) {
    Object.defineProperty(ctx, k, {
      get() { return st[k]; },
      set(v) { st[k] = v; },
      enumerable: true,
    });
  }
  return ctx;
}

/* ============================================================
 * 2. 载入作品脚本（与 index.html 完全相同的加载顺序）
 * ============================================================ */
const sandbox = {
  console,
  Math, Date, JSON, Object, Array, String, Number, Boolean, Error,
  isFinite, parseFloat, parseInt, Infinity, NaN, undefined,
  Float64Array, Uint8Array,
  setTimeout, clearTimeout,
  performance: { now: () => Date.now() },
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => {},
  devicePixelRatio: 1,
  URLSearchParams: class { constructor() {} has() { return false; } get() { return null; } },
  location: { href: 'file:///E:/deepseek/slow-motion-concorde/slow-motion-animation/index.html', search: '' },
  document: {
    readyState: 'complete',
    getElementById: () => null,
    addEventListener: () => {},
    documentElement: {},
    fullscreenElement: null,
  },
  addEventListener: () => {},
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const LOAD = [
  'js/00_lyrics.js', 'js/01_score.js', 'js/02_stage.js',
  'js/03_palette.js', 'js/04_scenes.js', 'js/05_draw.js', 'js/06_ui.js',
];
const loadErrors = [];
for (const f of LOAD) {
  const p = path.join(PROJ, f);
  if (!fs.existsSync(p)) { loadErrors.push('缺文件: ' + f); continue; }
  try {
    vm.runInContext(fs.readFileSync(p, 'utf8'), sandbox, { filename: f });
  } catch (e) {
    loadErrors.push(f + ' -> ' + (e && e.stack ? e.stack.split('\n')[0] : e));
  }
}
check('全部脚本可加载（经典 script，无 module/CORS 依赖）', loadErrors.length === 0, loadErrors.join('\n'));

const SM = sandbox.window.SM;
check('SM 命名空间已建立', !!SM && !!SM.renderFrame, SM ? Object.keys(SM).join(',') : 'none');
if (!SM || !SM.renderFrame || !SM.Timeline || !SM.CUES || !SM.Stage) {
  /* 作品脚本没能正常加载（例如某个文件有语法错误，整个 IIFE 都不会执行）。
     这时后续检查全部无意义 —— 立刻停下并如实列出已有结果，
     而不是继续跑下去在半路抛一个看不懂的 TypeError。 */
  console.log('');
  console.log('='.repeat(78));
  console.log('  致命：作品脚本未能正确加载，后续检查无法进行。');
  console.log('='.repeat(78));
  for (const r of results) {
    console.log('  ' + (r.ok ? '[PASS]' : '[FAIL]') + ' ' + r.name +
                (r.detail ? '  ' + r.detail.slice(0, 400) : ''));
  }
  console.log('='.repeat(78));
  process.exit(1);
}

/* ============================================================
 * 3. 基础数据检查
 * ============================================================ */
const data = JSON.parse(fs.readFileSync(path.join(PROJ, 'tools', '_data.json'), 'utf8'));

check('歌词 cue = 24 条', SM.CUES.length === 24, '实际 ' + SM.CUES.length);
check('旋律音符数据已内嵌 (' + data.melodyNotes + ' 音)',
      SM.MEL.length / 2 === data.melodyNotes, '实际 ' + SM.MEL.length / 2);
check('和弦段数据已内嵌 (' + data.chordSegs + ' 段)',
      SM.CHORDS.length / 2 === data.chordSegs, '实际 ' + SM.CHORDS.length / 2);

const lchk = SM.lyricsSelfCheck();
check('歌词"内嵌文本 vs 硬编码数组"双份互校验', lchk.ok, lchk.msg);

/* 24 块画板是否全部注册 */
const missingScenes = SM.sceneIds.filter((id) => typeof SM.Scenes[id] !== 'function');
check('24 块 cue 画板全部注册', missingScenes.length === 0, '缺: ' + missingScenes.join(','));
const missingSections = SM.sectionIds.filter((id) => typeof SM.SectionArt[id] !== 'function');
check('无词段落画板全部注册', missingSections.length === 0, '缺: ' + missingSections.join(','));

/* ============================================================
 * 4. 逐块画板：几何级"真的画出来了"
 * ============================================================ */
const MIN_OPS = 10;          // 一帧至少要有这么多绘制调用
const MIN_COVER = 0.05;      // 前景包围盒至少覆盖画布 5%

function renderAt(ms) {
  const ctx = createMockCtx();
  SM.renderFrame(ctx, ms, { quiet: true });
  return ctx.__ops;
}

function analyse(ops) {
  const draw = ops.filter((o) => o.kind !== 'clearRect' && !o.zeroAlpha);
  const colors = new Set(draw.map((o) => String(o.style)).filter((s) => s && s !== '#clear'));
  /* 前景 = 非全屏铺底的绘制。墨量 ink = 前景绘制与画布的交集面积之和 / 画布面积。
     注意：arc 的 bbox 按整圆算，是保守（偏大）估计，所以 ink 只用于
     判断"有没有画东西"，不用于判断"画得准不准"。 */
  const fore = draw.filter((o) => !(o.extra && o.extra.full));
  let area = 0;
  let bbox = null;
  for (const o of fore) {
    if (!o.bbox) continue;
    const ix = Math.max(0, Math.min(W, o.bbox.x1) - Math.max(0, o.bbox.x0));
    const iy = Math.max(0, Math.min(H, o.bbox.y1) - Math.max(0, o.bbox.y0));
    area += ix * iy;
    bbox = bbox ? {
      x0: Math.min(bbox.x0, o.bbox.x0), y0: Math.min(bbox.y0, o.bbox.y0),
      x1: Math.max(bbox.x1, o.bbox.x1), y1: Math.max(bbox.y1, o.bbox.y1),
    } : { x0: o.bbox.x0, y0: o.bbox.y0, x1: o.bbox.x1, y1: o.bbox.y1 };
  }
  const cover = area / (W * H);          /* 墨量（可 > 1） */
  const spread = bbox ? ((bbox.x1 - bbox.x0) * (bbox.y1 - bbox.y0)) / (W * H) : 0;
  const texts = draw.filter((o) => o.extra && o.extra.text).map((o) => o.extra.text);
  return { draw, colors, fore, area, cover, spread, texts, ops };
}

/* 4a. 每一块 cue 画板 */
const cueReport = [];
for (const cue of SM.CUES) {
  const end = SM.Timeline.cueEndMs(cue.i);
  /* 在字幕可见区间取样：入场 260ms、出场 200ms 之后/之前 */
  const a = cue.ms + 520;
  const b = end - 320;
  const samples = [];
  if (b - a < 200) {
    samples.push(Math.round((cue.ms + end) / 2));
  } else {
    for (let k = 0; k < 4; k++) samples.push(Math.round(a + (b - a) * k / 3));
  }

  let worst = null;
  let captionSeen = false;
  for (const ms of samples) {
    const an = analyse(renderAt(ms));
    const ok = an.draw.length >= MIN_OPS && an.cover >= MIN_COVER && an.colors.size >= 3;
    if (!worst || an.draw.length < worst.draw.length) {
      worst = { ms, draw: an.draw.length, cover: an.cover, colors: an.colors.size, ok };
    }
    if (an.texts.some((t) => t.indexOf(cue.en) >= 0)) captionSeen = true;
  }
  cueReport.push({ cue, worst, captionSeen });
}

const weakCues = cueReport.filter((r) => !r.worst || !r.worst.ok);
check('24 块 cue 画板都真的画出了图元（op数/覆盖/配色）', weakCues.length === 0,
      weakCues.map((r) => r.cue.scene + ' ops=' + r.worst.draw +
        ' cover=' + (r.worst.cover * 100).toFixed(1) + '% colors=' + r.worst.colors).join('; '));

const noCaption = cueReport.filter((r) => !r.captionSeen);
check('24 句歌词的字幕都被实际绘制（fillText 命中原文）', noCaption.length === 0,
      noCaption.map((r) => r.cue.scene + ' "' + r.cue.en + '"').join('; '));

/* 4b. 相邻画板必须真的不同（"每句独立视觉表达"） */
function signature(ms) {
  const an = analyse(renderAt(ms));
  return an.draw.map((o) => o.kind + '|' + o.style + '|' +
    (o.bbox ? [o.bbox.x0, o.bbox.y0, o.bbox.x1, o.bbox.y1].map((v) => Math.round(v)).join(',') : '')).join(';');
}
const sigs = cueReport.map((r) => {
  const ms = Math.round(r.cue.ms + (SM.Timeline.cueEndMs(r.cue.i) - r.cue.ms) * 0.6);
  return { scene: r.cue.scene, sig: signature(ms) };
});
let dupCount = 0;
const dupPairs = [];
for (let i = 0; i < sigs.length; i++) {
  for (let j = i + 1; j < sigs.length; j++) {
    if (sigs[i].sig === sigs[j].sig) { dupCount++; dupPairs.push(sigs[i].scene + '=' + sigs[j].scene); }
  }
}
check('24 块画板两两画面不相同（重复歌词也各有变化）', dupCount === 0, dupPairs.join(' '));

/* ============================================================
 * 5. 全程覆盖：0 .. 186980 无空洞
 * ============================================================ */
const STEP = 200;
const holes = [];
const sectionHits = {};
let totalFrames = 0;
let minOps = Infinity, minOpsAt = -1;

for (let ms = 0; ms <= SM.TOTAL_MS; ms += STEP) {
  const an = analyse(renderAt(ms));
  totalFrames++;
  const n = an.draw.length;
  if (n < minOps) { minOps = n; minOpsAt = ms; }
  const sid = SM.Timeline.sectionAt(ms).id;
  sectionHits[sid] = (sectionHits[sid] || 0) + 1;
  /* 尾帧的黑场是刻意的（用户要求"等画面完全暗下去之后再加标语"），
     所以 outro 段落允许只有铺底调用（sky + vignette = 2 个），
     也不要求前景墨量。 */
  if ((sid === 'outro' ? n < 2 : n < 3) || (an.cover <= 0.001 && sid !== 'outro')) {
    holes.push(ms + '(' + sid + ',ops=' + n + ',cover=' + an.cover.toFixed(4) + ')');
  }
}
check('全程 ' + totalFrames + ' 个采样点每一帧都有图元（步长 ' + STEP + 'ms）',
      holes.length === 0, holes.slice(0, 8).join('; '));
check('12 个段落全部被画到', Object.keys(sectionHits).length === 12,
      Object.keys(sectionHits).join(','));
check('最稀疏的一帧也有足够图元（尾帧全黑有意为之，允许底限 2）',
      minOps >= 2, 'min ops=' + minOps + ' @' + minOpsAt + 'ms');

/* 前奏（无词）也不能是空画面 */
const introAn = analyse(renderAt(20000));
check('前奏 20s 处画面非空（不是黑屏）', introAn.draw.length >= 10 && introAn.cover > 0.05,
      'ops=' + introAn.draw.length + ' cover=' + (introAn.cover * 100).toFixed(1) + '%');
/* 入影静默段也是有内容的 */
const eclAn = analyse(renderAt(47000));
check('入影静默段 47s 处仍有图元（静默≠空白）', eclAn.draw.length >= 4,
      'ops=' + eclAn.draw.length);
/* 尾奏 */
const tailAn = analyse(renderAt(186500));
check('尾奏 186.5s 处画面非空', tailAn.draw.length >= 10 && tailAn.cover > 0.05,
      'ops=' + tailAn.draw.length + ' cover=' + (tailAn.cover * 100).toFixed(1) + '%');

/* ============================================================
 * 6. 终点对齐
 * ============================================================ */
check('音频时长常量 = 186977 ms（与浏览器实测 duration 一致）',
      SM.AUDIO_MS === 186977, String(SM.AUDIO_MS));
check('影片总长 = 音频 + 7 秒尾帧 = 193977 ms（第 2 版延长）',
      SM.TOTAL_MS === 193977 && SM.OUTRO_MS === 7000, String(SM.TOTAL_MS));
check('音频实测时长与常量一致 (186.98s)',
      Math.abs(data.audio.durationSec * 1000 - SM.AUDIO_MS) < 40,
      data.audio.durationSec + 's vs ' + SM.AUDIO_MS + 'ms');
const lastCueEnd = SM.Timeline.cueEndMs(SM.CUES.length - 1);
check('最后一句的结束点 = 音频终点', lastCueEnd === SM.AUDIO_MS, String(lastCueEnd));
check('最后一个段落（尾帧）收在 193977 ms',
      SM.Timeline.sections[SM.Timeline.sections.length - 1].t1 === SM.TOTAL_MS,
      String(SM.Timeline.sections[SM.Timeline.sections.length - 1].t1));

/* index.html 的进度条上限 */
const htmlRaw = fs.readFileSync(path.join(PROJ, 'index.html'), 'utf8');
/* 先剥掉 HTML 注释再检查 —— 否则注释里写的示例代码会被自己的正则命中。
   （这正是 注意事项.md ⑤ 说的"验证工具本身会骗你"：第一次跑时，
     本文件在注释里写了 type="module" 这个词，于是这条检查报了假 FAIL。）

   再剥掉 <script> 的正文，但保留标签本身（<script src> 要算资源）。
   第二次跑时，页面自检代码里有一句 a.getAttribute('src')，
   被下面的资源正则当成了一个 src="..." 属性，又报了一次假 FAIL。 */
const html = htmlRaw
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/g, '$1$3');
check('index.html 进度条 max 与全曲时长一致', html.indexOf('max="193977"') >= 0, '');
check('index.html 中 audio 未使用 crossorigin（事项①）',
      !/<audio[^>]*crossorigin/i.test(html), '');
check('index.html 未使用 type="module"（file:// 下会被 CORS 拦）',
      !/type\s*=\s*["']module["']/.test(html), '');

/* ============================================================
 * 7. 跳转后画面正确恢复 + 无状态泄漏
 * ============================================================ */
/* 7a. 同一时刻重复渲染必须逐指令一致 */
let nondet = [];
for (let k = 0; k < 40; k++) {
  const ms = Math.round((k * 4703 + 311) % SM.TOTAL_MS);
  const s1 = signature(ms);
  const s2 = signature(ms);
  if (s1 !== s2) nondet.push(ms + 'ms');
}
check('同一时刻重复渲染结果完全一致（确定性）', nondet.length === 0, nondet.join(','));

/* 7b. 打乱顺序渲染，结果仍与顺序渲染一致 —— 捕捉跨帧状态泄漏 */
const probes = [1500, 30000, 46200, 60000, 80000, 100000, 115000, 130000, 140000, 160000, 175000, 185000];
const ordered = probes.map((ms) => signature(ms));
/* 先用一批无关时刻"污染"渲染器状态 */
for (let ms = 0; ms < SM.TOTAL_MS; ms += 3137) renderAt(ms);
const shuffled = probes.map((ms) => signature(ms));
let leak = [];
for (let i = 0; i < probes.length; i++) {
  if (ordered[i] !== shuffled[i]) leak.push(probes[i] + 'ms');
}
check('任意跳转后画面正确恢复（无跨帧状态泄漏）', leak.length === 0, leak.join(','));

/* 7c. 从任意点跳入，与从头播放到该点，画面相同 */
let seekDiff = [];
for (const ms of [55388, 92081, 112878, 131481, 168424, 182201]) {
  /* 模拟"跳转"：直接渲染 */
  const jumped = signature(ms);
  /* 模拟"播放到该点"：先渲染前面若干帧再渲染该点 */
  for (let k = 1; k <= 6; k++) renderAt(Math.max(0, ms - k * 700));
  const played = signature(ms);
  if (jumped !== played) seekDiff.push(ms + 'ms');
}
check('跳转进入 vs 播放进入，同一时刻画面一致', seekDiff.length === 0, seekDiff.join(','));

/* ============================================================
 * 8. 资源完整性
 * ============================================================ */
const srcs = [...html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)].map((m) => m[1])
  .filter((s) => !/^(https?:|data:|#|javascript:)/i.test(s));
const missingRes = [];
for (const s of srcs) {
  const p = path.join(PROJ, s.replace(/\//g, path.sep));
  if (!fs.existsSync(p)) missingRes.push(s);
}
check('index.html 引用的本地资源全部存在 (' + srcs.length + ' 项)', missingRes.length === 0,
      missingRes.join(', '));

const audioPath = path.join(PROJ, 'audio', 'slow_motion.mp3');
check('音频文件存在且非空', fs.existsSync(audioPath) && fs.statSync(audioPath).size > 1000000,
      fs.existsSync(audioPath) ? fs.statSync(audioPath).size + ' bytes' : 'missing');
check('音频文件名不含空格/括号（规避事项③）',
      !/[\s()]/.test(path.basename(audioPath)), path.basename(audioPath));

/* ============================================================
 * 9. 清屏范围与越界裁剪
 *    —— 针对用户报告的"画面左右两边素材一直堆积、不消失、成乱码"
 *
 *    根因：旧版 beginFrame 只 clearRect(0,0,W,H)，那是【逻辑区域】1600x900；
 *    而画布铺满整个窗口，窗口不是 16:9 时两侧的 letterbox 从不参与清屏，
 *    越界绘制（人群光痕 x 从 -160、云带 x 从 -400、刻度尺、地球弧）
 *    落进去就逐帧叠加，堆成了乱码。
 *
 *    这里真的调用 resize + beginFrame，量它到底清了多少像素。
 * ============================================================ */
function probeBeginFrame(winW, winH) {
  const ctx = createMockCtx();
  const cv = {
    width: 0, height: 0, style: {},
    parentNode: { getBoundingClientRect: () => ({ width: winW, height: winH }) },
    getContext: () => ctx,
  };
  const keep = { canvas: SM.Stage.canvas, ctx: SM.Stage.ctx, based: SM.Stage._based };
  SM.Stage.attach(cv);
  SM.Stage.resize();
  const info = { fit: SM.Stage.fit, dpr: SM.Stage.dpr, offX: SM.Stage.offX, offY: SM.Stage.offY };
  SM.Stage.beginFrame(ctx, SM.makeState(60000));
  SM.Stage.canvas = keep.canvas;
  SM.Stage.ctx = keep.ctx;
  SM.Stage._based = keep.based;
  return { cv, info, ops: ctx.__ops };
}

const FIT_CASES = [
  { name: '16:9  1600x900', w: 1600, h: 900 },
  { name: '宽    1900x900', w: 1900, h: 900 },
  { name: '窄    1000x900', w: 1000, h: 900 },
  { name: '极宽  2560x720', w: 2560, h: 720 },
  { name: '竖屏   700x1200', w: 700, h: 1200 },
];
const clearBad = [], fullBad = [], fitInfo = [];
for (const sc of FIT_CASES) {
  const r = probeBeginFrame(sc.w, sc.h);
  const cw = Math.round(sc.w * r.info.dpr), ch = Math.round(sc.h * r.info.dpr);
  /* a) 画布必须铺满窗口 */
  if (r.cv.width !== cw || r.cv.height !== ch) clearBad.push(sc.name + ' 画布尺寸不符');
  /* b) clearRect 必须覆盖整块画布，一个像素都不留 */
  const clears = r.ops.filter((o) => o.kind === 'clearRect');
  const covered = clears.some((c) => c.extra.w >= cw - 1 && c.extra.h >= ch - 1);
  if (!covered) {
    clearBad.push(sc.name + ' 清屏仅 ' +
      clears.map((c) => c.extra.w + 'x' + c.extra.h).join('/') + '，画布 ' + cw + 'x' + ch);
  }
  /* c) 有留边时，留边必须被铺满（不能是黑边，更不能是残影） */
  if (r.info.offX > 0.5 || r.info.offY > 0.5) {
    const full = r.ops.some((o) => o.kind === 'fillRect' && o.extra &&
                                   o.extra.w >= cw - 1 && o.extra.h >= ch - 1);
    if (!full) fullBad.push(sc.name);
  }
  fitInfo.push(sc.name + ' → ' + r.info.fit +
               (r.info.offX > 0.5 || r.info.offY > 0.5
                 ? '（留边 ' + r.info.offX + ',' + r.info.offY + ' 设备像素）' : '（铺满）'));
}
check('各窗口比例下 clearRect 都覆盖整块画布（这是"残影堆积"的修复点）',
      clearBad.length === 0, clearBad.join(' | '));
/* 背景原语必须带 BLEED 余量：留边区靠它们填，而不是靠一层纯色兜底。
   检查天幕的 fillRect 是否明显超出逻辑区域。 */
check('天幕绘制范围超出逻辑区域（留边区有背景，不是空框）',
      analyse(renderAt(60000)).ops.some((o) =>
        o.kind === 'fillRect' && o.extra && o.extra.w > W + 200 && o.extra.h > H + 200),
      '');
check('留边时用天幕色铺满（不留黑边）', fullBad.length === 0, fullBad.join(' | '));
check('16:9 窗口铺满（无溢出，cover）',
      probeBeginFrame(1600, 900).info.fit === 'cover',
      'fit=' + probeBeginFrame(1600, 900).info.fit);
/* 用户屏幕是 16:10，最终结论是"画面要铺满窗口"，所以这一档也必须 cover。
   代价是左右各裁约 80 逻辑像素，所以构图要守住安全区。 */
check('16:10 窗口铺满（用户屏幕比例，cover）',
      probeBeginFrame(1600, 1000).info.fit === 'cover',
      'fit=' + probeBeginFrame(1600, 1000).info.fit +
      '  各比例: ' + fitInfo.join('  |  '));
/* 黑框回归防线：天幕和暗角都必须带 BLEED 铺满整块画布。
   上一版暗角只画 fillRect(0,0,W,H)，contain 时中央比四周暗，
   看起来就是画面正中一个黑框、框外元素渲染不全。 */
const bigFills = analyse(renderAt(60000)).ops.filter((o) =>
  o.kind === 'fillRect' && o.extra && o.extra.w > W + 200 && o.extra.h > H + 200);
check('天幕与暗角都铺满整块画布（防"中央黑框"回归）', bigFills.length >= 2,
      '铺满画布的填充数=' + bigFills.length);

/* ============================================================
 * 10. 运行期异常
 * ============================================================ */
const errs = SM.ErrorLog.items;
check('渲染全程无异常（异常绝不静默）', errs.length === 0,
      errs.slice(0, 5).map((e) => e.where + ': ' + e.msg.split('\n')[0]).join(' | '));

/* ============================================================
 * 报告
 * ============================================================ */
function report() {
  const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
  console.log('');
  console.log('='.repeat(78));
  console.log('  《SLOW MOTION (CASTLE. Remix)》网页动画 —— 几何级验证报告');
  console.log('='.repeat(78));
  for (const r of results) {
    console.log('  ' + (r.ok ? '[PASS]' : '[FAIL]') + ' ' + pad(r.name, 52) +
                (r.detail ? '  ' + r.detail.slice(0, 90) : ''));
  }
  console.log('-'.repeat(78));
  console.log('  每块画板最稀疏一帧：');
  for (const r of cueReport) {
    console.log('    ' + pad(r.cue.scene, 8) + pad(r.cue.view, 10) +
                pad('ops=' + r.worst.draw, 10) +
                pad('cover=' + (r.worst.cover * 100).toFixed(1) + '%', 14) +
                pad('colors=' + r.worst.colors, 12) +
                (r.captionSeen ? '字幕OK' : '字幕缺失!') +
                '  ' + r.cue.en.slice(0, 34));
  }
  console.log('-'.repeat(78));
  console.log('  段落覆盖采样：' + JSON.stringify(sectionHits));
  console.log('='.repeat(78));
  console.log(FAIL === 0 ? '  全部 ' + results.length + ' 项检查通过。' 
                        : '  有 ' + FAIL + ' 项未通过（共 ' + results.length + ' 项）。');
  console.log('='.repeat(78));
}

report();
process.exit(FAIL === 0 ? 0 : 1);
