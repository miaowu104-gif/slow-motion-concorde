/* ============================================================
 * 03_palette.js —— 色彩与"六种观看距离"
 *
 * 设计来源：《理解笔记》第 3.5 节与第 4 节。
 *   全曲只有四句话，唱了六遍。六遍的人声强度与编配密度都不同
 *   （副歌 0.51–0.55，bridge 0.68，末段升到 0.686），
 *   所以视觉上也不能是同一张画 —— 本文件把六遍定义为六种"观看距离"：
 *
 *     组0 ground    地面仰望  —— 第一次开口，人声融在律动里（0.521）
 *     组1 altitude  高空俯视  —— 伴奏被抽空，空旷的重复（0.530 / onset 0.49）
 *     组2 cockpit   驾驶舱    —— 全曲心脏，人声最贴耳（0.680）
 *     组3 shadow    月影内侧  —— 三连副歌起，从暗处向外看（0.511）
 *     组4 orbit     轨道      —— 地球弧线，逐渐升温（0.518）
 *     组5 sun       太阳回望  —— 极简，最高点被切断（0.554→0.686）
 * ============================================================ */
(function (global) {
  'use strict';

  var SM = global.SM = global.SM || {};
  var U = SM.U;

  /* ---------------- 颜色工具 ---------------- */
  function hex(c) {
    if (typeof c !== 'string') return [255, 255, 255];
    var s = c.replace('#', '');
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    var n = parseInt(s, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, t) {
    t = U.clamp(t, 0, 1);
    var A = hex(a), B = hex(b);
    return 'rgb(' + Math.round(U.lerp(A[0], B[0], t)) + ',' +
                    Math.round(U.lerp(A[1], B[1], t)) + ',' +
                    Math.round(U.lerp(A[2], B[2], t)) + ')';
  }
  function rgba(c, a) {
    var A = hex(c);
    return 'rgba(' + A[0] + ',' + A[1] + ',' + A[2] + ',' + U.clamp(a, 0, 1) + ')';
  }

  /* ---------------- 六种观看距离 ---------------- */
  /* sunX / sunY 用逻辑坐标（1600x900）；R 是日轮半径 */
  var VIEWS = {
    /* 组0：站在地上仰望。太阳很小很远，人很多很近。 */
    ground: {
      label: '地面仰望',
      skyTop: '#04070f', skyBottom: '#0b1730',
      glow: '#ffb547', core: '#1a0d02', ink: '#02050c', hint: '#5f7fb8',
      sunX: 800, sunY: 300, sunR: 74,
      horizon: 690, stars: 0.5, frame: false, earthArc: false,
      crowdY: 860, scaleFeel: 1.0,
    },
    /* 组1：从 17000 米往下看。一切变小，颜色被抽掉。 */
    altitude: {
      label: '高空俯视',
      skyTop: '#070d18', skyBottom: '#16233a',
      glow: '#ffd08a', core: '#120c06', ink: '#0a1220', hint: '#7d96bb',
      sunX: 800, sunY: 250, sunR: 92,
      horizon: 520, stars: 0.35, frame: false, earthArc: false,
      crowdY: 800, scaleFeel: 0.62,
    },
    /* 组2：驾驶舱。全曲人声最贴耳的一段，所以画面最贴近、最热。 */
    cockpit: {
      label: '驾驶舱',
      skyTop: '#1a0806', skyBottom: '#2b0f08',
      glow: '#ff7a2f', core: '#150402', ink: '#0d0301', hint: '#ffc46b',
      sunX: 800, sunY: 340, sunR: 132,
      horizon: null, stars: 0.15, frame: true, earthArc: false,
      crowdY: 880, scaleFeel: 1.6,
    },
    /* 组3：从月影里往外看。四周是暗的，光在边缘。 */
    shadow: {
      label: '月影内侧',
      skyTop: '#030308', skyBottom: '#0a0a14',
      glow: '#cfe3ff', core: '#000000', ink: '#05050a', hint: '#6d7fa8',
      sunX: 800, sunY: 420, sunR: 112,
      horizon: 780, stars: 0.7, frame: false, earthArc: false,
      crowdY: 880, scaleFeel: 0.85,
    },
    /* 组4：轨道视角。地球的弧线出现在下方。 */
    orbit: {
      label: '轨道',
      skyTop: '#010208', skyBottom: '#060b1c',
      glow: '#fff2d0', core: '#04040a', ink: '#02030a', hint: '#8fa9d8',
      sunX: 800, sunY: 260, sunR: 150,
      horizon: null, stars: 1.0, frame: false, earthArc: true,
      crowdY: 880, scaleFeel: 0.5,
    },
    /* 组5：从太阳回望。极简，只有最大的日轮。 */
    sun: {
      label: '太阳回望',
      skyTop: '#100a04', skyBottom: '#241505',
      glow: '#fffdf2', core: '#0a0500', ink: '#0a0500', hint: '#e8c88a',
      sunX: 800, sunY: 400, sunR: 212,
      horizon: null, stars: 0.2, frame: false, earthArc: false,
      crowdY: 880, scaleFeel: 0.4,
    },
  };

  /* ---------------- 六组的分量 ---------------- */
  /* intensity 直接取自《理解笔记》3.5 节实测的中置声道 1k–4k 占比，
     用来控制画板的视觉密度 —— 数据决定画面，不靠感觉。 */
  var GROUPS = [
    { g: 0, view: 'ground',   intensity: 0.521, warm: 0.00, onsetDensity: 1.54, label: '宣告' },
    { g: 1, view: 'altitude', intensity: 0.530, warm: 0.08, onsetDensity: 0.49, label: '空旷的重复' },
    { g: 2, view: 'cockpit',  intensity: 0.680, warm: 0.55, onsetDensity: 1.55, label: '心脏' },
    { g: 3, view: 'shadow',   intensity: 0.511, warm: 0.20, onsetDensity: 0.88, label: '堆叠 I' },
    { g: 4, view: 'orbit',    intensity: 0.518, warm: 0.42, onsetDensity: 0.88, label: '堆叠 II' },
    { g: 5, view: 'sun',      intensity: 0.554, warm: 0.85, onsetDensity: 0.88, label: '兑现' },
  ];

  /* ---------------- 无词段落的色调 ---------------- */
  var VOID = {
    idle:    { skyTop: '#03050c', skyBottom: '#081226', accent: '#6f9bd8', ink: '#01030a' },
    void:    { skyTop: '#000000', skyBottom: '#050508', accent: '#2a3550', ink: '#000000' },
    cruise:  { skyTop: '#050a12', skyBottom: '#0d1a2a', accent: '#57c8d8', ink: '#03070d' },
  };

  SM.Palette = {
    hex: hex, mix: mix, rgba: rgba,
    VIEWS: VIEWS, GROUPS: GROUPS, VOID: VOID,
    view: function (id) { return VIEWS[id] || VIEWS.ground; },
    group: function (g) { return GROUPS[U.clamp(g, 0, GROUPS.length - 1)]; },
  };

})(window);
