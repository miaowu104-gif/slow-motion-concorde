/* ============================================================
 * 02_stage.js —— 舞台、时间轴、重音
 *
 * 教训规避（注意事项.md ②）：
 *   上一轮作品里 W / H / U 是某个模块的私有变量，画板文件却到处引用，
 *   结果 131 块画板全部抛 "U is not defined"，一块都没画出来，
 *   而异常被 try/catch 吞掉，覆盖率检查照样"100% 通过"。
 *
 * 本项目的做法：
 *   1) 舞台常量挂在 window.SM.Stage 上，全局可见；
 *   2) 所有画板一律接收 stage 对象作为参数，不依赖闭包外变量；
 *   3) 画板内的异常一律记录并上抛到错误面板，绝不静默。
 * ============================================================ */
(function (global) {
  'use strict';

  var SM = global.SM = global.SM || {};

  /* ---------------- 逻辑舞台 ---------------- */
  /* 所有画板只用这 1600x900 的坐标系写代码，
     真实窗口尺寸由 ctx 变换吸收，画板里不会出现尺寸常量。 */
  var W = 1600;
  var H = 900;

  /* cover 模式下允许裁掉的最大逻辑像素数。
     用户先反馈"画面覆盖不全"，改 cover 后又反馈"中央出现黑框、框外渲染不全"——
     黑框的根因是暗角只画在逻辑区域内（已修），但结论是明确的：
     **画面要铺满窗口**。所以这里放宽到 100，16:10（溢出 80）也走 cover。
     代价是左右各裁约 5%，所以构图必须守住安全区：
     字幕居中、日轮居中、轨道环右端 1500 < 1520，都在安全区内。 */
  var MAX_OVERFLOW = 100;

  var Stage = {
    W: W,
    H: H,
    U: 1,          // 逻辑坐标 -> CSS 像素的统一缩放
    dpr: 1,
    cssW: 0,
    cssH: 0,
    rw: 0,         // 画面在 CSS 像素下的宽（= W * U）
    rh: 0,
    offX: 0,       // 画面左上角在画布内的设备像素偏移
    offY: 0,
    _based: false,
    canvas: null,
    ctx: null,

    attach: function (canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      return this;
    },

    hasLetterbox: function () {
      return this.offX > 0.5 || this.offY > 0.5;
    },

    /* 选择缩放：优先 cover（铺满，不留黑边），只在极端宽高比时退回 contain。
     *
     * 原来一律用 contain，用户在 1.6~1.87 的窗口里看到两侧大片空白，
     * 明确反馈"画面覆盖不全"。改成：
     *   · 先算 cover 会裁掉多少（逻辑像素）；
     *   · 裁切量在 MAX_OVERFLOW 以内就铺满（16:10 也铺满），否则完整显示；
     *   · 无论哪种模式，暗角与天幕都带 BLEED 铺满整块画布，
     *     所以永远不会出现"中央一个黑框、框外没内容"的观感。
     */
    resize: function () {
      var cv = this.canvas;
      if (!cv) return this;
      var rect = cv.parentNode.getBoundingClientRect();
      var vw = Math.max(1, Math.round(rect.width));
      var vh = Math.max(1, Math.round(rect.height));
      var dpr = Math.min(global.devicePixelRatio || 1, 2);

      var coverU = Math.max(vw / W, vh / H);
      var containU = Math.min(vw / W, vh / H);
      var ovX = Math.max(0, (W * coverU - vw) / 2 / coverU);
      var ovY = Math.max(0, (H * coverU - vh) / 2 / coverU);
      var scale = (ovX <= MAX_OVERFLOW && ovY <= MAX_OVERFLOW) ? coverU : containU;

      this.cssW = vw;
      this.cssH = vh;
      this.dpr = dpr;
      this.U = scale;
      this.fit = (scale === coverU) ? 'cover' : 'contain';
      this.rw = W * scale;
      this.rh = H * scale;
      this.offX = Math.round((vw - this.rw) / 2 * dpr);
      this.offY = Math.round((vh - this.rh) / 2 * dpr);

      cv.width = Math.round(vw * dpr);
      cv.height = Math.round(vh * dpr);
      cv.style.width = vw + 'px';
      cv.style.height = vh + 'px';
      return this;
    },

    /* 每帧开始调用。
     *
     * 这里修掉了一个很隐蔽的 bug（用户报告"左右两边素材一直堆积、不消失、成乱码"）：
     *   旧版只做了 clearRect(0, 0, W, H) —— 那是【逻辑区域】1600x900，
     *   而画布铺满整个窗口。窗口宽高比不是 16:9 时，两侧的 letterbox
     *   从来不参与清屏；偏偏人群(x 从 -160)、刻度尺、云带(x 从 -400)、
     *   地球弧这些绘制在逻辑坐标里是越界的，它们落进 letterbox 之后
     *   逐帧叠加、永不消失，就堆成了乱码。
     *
     *   修法三步：
     *     1) 用恒等变换清掉【整块画布】，一个像素都不留；
     *     2) letterbox 用当帧视点的天幕色填满，不留黑边；
     *     3) 进入逻辑坐标后 clip 到 1600x900，越界绘制一律裁掉，永不外溢。
     *   save/restore 严格配对（每帧先 restore 到基准态），所以 clip 不会逐帧求交。 */
    beginFrame: function (ctx, S) {
      var cv = this.canvas;
      if (!cv) return;
      var k = this.U * this.dpr;

      if (this._based) ctx.restore();
      ctx.save();
      this._based = true;

      /* 1) 清掉整块画布 */
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);

      /* 2) letterbox 铺满当帧天幕色 */
      if (this.hasLetterbox()) {
        var top = (S && S.V) ? S.V.skyTop : '#04060c';
        var bot = (S && S.V) ? S.V.skyBottom : '#04060c';
        var g = ctx.createLinearGradient(0, 0, 0, cv.height);
        g.addColorStop(0, top);
        g.addColorStop(1, bot);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, cv.width, cv.height);
      }

      /* 3) 进入逻辑坐标。
         这里【不再 clip】：天幕、星空、地平线、云、刻度尺都带了 BLEED 余量，
         会自然延伸到留边区 —— 留边因此不是空框，而是"画面本来就这么宽"。
         越界绘制由画布边界自然裁掉，而且每帧都清整块画布，不会累积。 */
      ctx.setTransform(k, 0, 0, k, this.offX, this.offY);
    },

    /* 逻辑坐标 -> 真实设备像素（截图与命中测试用） */
    toDevice: function (x, y) {
      var k = this.U * this.dpr;
      return { x: x * k + this.offX, y: y * k + this.offY };
    },
  };

  /* ---------------- 段落结构 ---------------- */
  /* 时间来源：《理解笔记》第 3.5 节结构总表，
     由 LRC 时间戳 + onset 密度 + 中置声道人声强度三重对齐得出。 */
  var SECTIONS = [
    { id: 'intro',     t0: 0,      t1: 44700,  name: '等待',        view: 'idle' },
    { id: 'eclipse',   t0: 44700,  t1: 49300,  name: '入影',        view: 'void' },
    { id: 'buildup',   t0: 49300,  t1: 55388,  name: '起飞',        view: 'idle' },
    { id: 'chorus1',   t0: 55388,  t1: 73600,  name: '副歌#1 地面仰望', view: 'ground' },
    { id: 'interlude', t0: 73600,  t1: 92081,  name: '飞行',        view: 'cruise' },
    { id: 'chorus2',   t0: 92081,  t1: 110600, name: '副歌#2 高空俯视', view: 'altitude' },
    { id: 'bridge',    t0: 112878, t1: 129000, name: 'bridge 驾驶舱', view: 'cockpit' },
    { id: 'breath',    t0: 129000, t1: 131481, name: '呼吸',        view: 'void' },
    { id: 'chorus3',   t0: 131481, t1: 150039, name: '副歌#3 月影内侧', view: 'shadow' },
    { id: 'chorus4',   t0: 150039, t1: 168424, name: '副歌#4 轨道',  view: 'orbit' },
    { id: 'chorus5',   t0: 168424, t1: 186977, name: '副歌#5 太阳回望', view: 'sun' },
    { id: 'outro',     t0: 186977, t1: 193977, name: '标语',        view: 'void' },
  ];

  /* 音频时长。浏览器实测 <audio>.duration = 186.977 s，
     与 Apple Music 标注的 186,977 ms 逐毫秒一致。 */
  var AUDIO_MS = 186977;

  /* 尾帧：用户要求"等画面完全暗下去之后再加标语"，所以影片比音频长 7 秒 ——
     音频走完 → 画面渐黑 → 黑场 → 标语淡入并停留。 */
  var OUTRO_MS = 7000;
  var TOTAL_MS = AUDIO_MS + OUTRO_MS;      /* 193977 */

  /* ---------------- 时间轴 ---------------- */
  var Timeline = {
    sections: SECTIONS,
    totalMs: TOTAL_MS,

    sectionAt: function (ms) {
      for (var i = 0; i < SECTIONS.length; i++) {
        if (ms < SECTIONS[i].t1) return SECTIONS[i];
      }
      return SECTIONS[SECTIONS.length - 1];
    },

    sectionIndexAt: function (ms) {
      for (var i = 0; i < SECTIONS.length; i++) {
        if (ms < SECTIONS[i].t1) return i;
      }
      return SECTIONS.length - 1;
    },

    /* 当前 cue 索引；首句之前返回 -1 */
    cueIndexAt: function (ms) {
      var cues = SM.CUES;
      if (!cues || !cues.length) return -1;
      var lo = 0, hi = cues.length - 1, ans = -1;
      while (lo <= hi) {
        var mid = (lo + hi) >> 1;
        if (cues[mid].ms <= ms) { ans = mid; lo = mid + 1; } else { hi = mid - 1; }
      }
      return ans;
    },

    /* 当前 cue 的结束时刻（下一句开始；最后一句收在【音频末尾】——
       不是影片末尾，因为尾帧那段只有标语、不再有歌词） */
    cueEndMs: function (idx) {
      var cues = SM.CUES;
      if (idx < 0) return cues.length ? cues[0].ms : 0;
      if (idx + 1 < cues.length) return cues[idx + 1].ms;
      return AUDIO_MS;
    },

    /* cue 内进度 0..1 */
    cueProgress: function (ms, idx) {
      if (idx < 0) return 0;
      var a = SM.CUES[idx].ms;
      var b = this.cueEndMs(idx);
      if (b <= a) return 1;
      var p = (ms - a) / (b - a);
      return p < 0 ? 0 : (p > 1 ? 1 : p);
    },

    /* 段落内进度 0..1 */
    sectionProgress: function (ms) {
      var s = this.sectionAt(ms);
      if (ms <= s.t0) return 0;
      if (ms >= s.t1) return 1;
      return (ms - s.t0) / (s.t1 - s.t0);
    },

    /* 段落交界处的淡入淡出权重（用于转场） */
    transition: function (ms) {
      var FADE = 900;
      var i = this.sectionIndexAt(ms);
      var s = SECTIONS[i];
      var inA = Math.min(1, (ms - s.t0) / FADE);
      var outA = Math.min(1, (s.t1 - ms) / FADE);
      return {
        index: i,
        fadeIn: inA < 0 ? 0 : inA,
        fadeOut: outA < 0 ? 0 : outA,
      };
    },
  };

  /* ---------------- 重音（来自真实演奏，不是节拍器） ---------------- */
  /* MEL 是扁平数组 [ms, pitch, ms, pitch, ...]，由 MIDI 分析结果提取。
     每个音符起点生成一条指数衰减脉冲，叠加成当前重音强度。
     这样卡点踩在真实演奏上 —— 注意事项.md 建议 2。 */
  var _melMs = null;
  var _melP = null;

  function buildMel() {
    if (_melMs) return;
    var raw = SM.MEL || [];
    var n = raw.length >> 1;
    _melMs = new Float64Array(n);
    _melP = new Float64Array(n);
    for (var i = 0; i < n; i++) {
      _melMs[i] = raw[i * 2];
      _melP[i] = raw[i * 2 + 1];
    }
  }

  function melIndexAt(ms) {
    var lo = 0, hi = _melMs.length - 1, ans = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (_melMs[mid] <= ms) { ans = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    return ans;
  }

  var Accent = {
    /* 0..1 的瞬时重音强度 */
    level: function (ms) {
      buildMel();
      if (!_melMs || !_melMs.length) return 0;
      var pmin = SM.PITCH_MIN || 46;
      var pmax = SM.PITCH_MAX || 82;
      var span = Math.max(1, pmax - pmin);
      var i = melIndexAt(ms);
      var sum = 0;
      for (var k = i; k >= 0 && k > i - 26; k--) {
        var dt = ms - _melMs[k];
        if (dt > 430) break;
        if (dt < 0) continue;
        var amp = 0.35 + 0.65 * (_melP[k] - pmin) / span;
        sum += amp * Math.exp(-dt / 105);
      }
      return sum > 1 ? 1 : sum;
    },

    /* 距离上一个音符起点多少毫秒（用于"击发"式卡点） */
    sinceOnset: function (ms) {
      buildMel();
      var i = melIndexAt(ms);
      if (i < 0) return 1e9;
      return ms - _melMs[i];
    },

    /* 当前和弦名 */
    chordAt: function (ms) {
      var ch = SM.CHORDS || [];
      var names = SM.CHORD_NAMES || [];
      var ans = -1;
      for (var i = 0; i < ch.length; i++) {
        if (ch[i * 2] <= ms) ans = i; else break;
      }
      if (ans < 0) return names[0] || '?';
      return names[ch[ans * 2 + 1]] || '?';
    },

    /* 一个时段内的音符密度（每 100ms 音符数），用于编配密度可视化 */
    density: function (ms, windowMs) {
      buildMel();
      var w = windowMs || 1000;
      var a = melIndexAt(ms - w);
      var b = melIndexAt(ms);
      return (b - a) / (w / 1000);
    },
  };

  /* ---------------- 通用小工具 ---------------- */
  var U = {
    clamp: function (v, a, b) { return v < a ? a : (v > b ? b : v); },
    lerp: function (a, b, t) { return a + (b - a) * t; },
    /* 0..1 平滑 */
    smooth: function (t) { t = U.clamp(t, 0, 1); return t * t * (3 - 2 * t); },
    /* 更慢的 S 曲线 */
    smoother: function (t) { t = U.clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); },
    easeOut: function (t) { t = U.clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); },
    easeIn: function (t) { t = U.clamp(t, 0, 1); return t * t * t; },
    /* 确定性伪随机：同一 seed 永远同一结果，保证跳转后画面完全一致 */
    hash: function (n) {
      var x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
      return x - Math.floor(x);
    },
    /* 平滑噪声 */
    noise: function (x) {
      var i = Math.floor(x), f = x - i;
      var a = U.hash(i), b = U.hash(i + 1);
      return U.lerp(a, b, U.smooth(f));
    },
    fmtTime: function (ms) {
      if (!isFinite(ms) || ms < 0) ms = 0;
      var t = Math.floor(ms);
      var m = Math.floor(t / 60000);
      var s = Math.floor((t % 60000) / 1000);
      var x = t % 1000;
      return m + ':' + (s < 10 ? '0' + s : s) + '.' + (x < 100 ? (x < 10 ? '00' : '0') + x : x);
    },
  };

  /* ---------------- 错误上报（绝不静默 —— 坑②） ---------------- */
  var ErrorLog = {
    items: [],
    push: function (where, err) {
      var msg = (err && err.stack) ? err.stack : String(err);
      this.items.push({ where: where, msg: msg });
      if (this.items.length <= 40) {
        // 完整上下文，便于定位（坑③：把实际路径/名字打全）
        console.error('[SM] ' + where + '\n' + msg);
      }
      if (global.SM_onError) global.SM_onError(where, msg);
    },
  };

  SM.Stage = Stage;
  SM.Timeline = Timeline;
  SM.Accent = Accent;
  SM.U = U;
  SM.ErrorLog = ErrorLog;
  SM.AUDIO_MS = AUDIO_MS;
  SM.OUTRO_MS = OUTRO_MS;
  SM.TOTAL_MS = TOTAL_MS;

})(window);
