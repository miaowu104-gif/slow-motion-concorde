/* ============================================================
 * 04_scenes.js —— 绘制原语、母题、24 块画板、无词段落
 *
 * 覆盖率不是"注册了就算"（注意事项.md ②）。本文件里每一块画板
 * 都必须真正调用绘图 API 产生图元，tools/verify.js 会逐块用
 * 记录型 ctx 量它的绘图指令数与覆盖面积。
 *
 * 全部随机数都走 U.hash(seed) —— 确定性伪随机，
 * 保证任意跳转后同一时刻画出完全相同的画面。
 * ============================================================ */
(function (global) {
  'use strict';

  var SM = global.SM;
  var U = SM.U;
  var P = SM.Palette;
  var W = 1600, H = 900;
  var TAU = Math.PI * 2;
  /* 背景元素向逻辑区域外延伸的余量。
     窗口比例与 16:9 不同时会留边 —— 让天空、星星、地平线延伸过去，
     留边区就不是空框，而是"画面本来就这么宽"。
     越界绘制由画布边界自然裁掉，且每帧都清整块画布，不会累积。 */
  var BLEED = 920;

  /* 三次贝塞尔取值与切线角 —— 飞行段让飞机沿【原有那条斜线】飞，
     机头始终指向运动方向（第一版机头朝左却向右移动，是倒着飞的）。 */
  function bez1(a, b, c, d, u) {
    var m = 1 - u;
    return m * m * m * a + 3 * m * m * u * b + 3 * m * u * u * c + u * u * u * d;
  }
  function bezAngle(x0, x1, x2, x3, y0, y1, y2, y3, u) {
    var m = 1 - u;
    var dx = 3 * m * m * (x1 - x0) + 6 * m * u * (x2 - x1) + 3 * u * u * (x3 - x2);
    var dy = 3 * m * m * (y1 - y0) + 6 * m * u * (y2 - y1) + 3 * u * u * (y3 - y2);
    return Math.atan2(dy, dx);
  }
  /* 飞行段那条航迹的四个控制点（与 Prim.trail 完全一致） */
  function trailPts() {
    return {
      x: [-60, W * 0.30, W * 0.62, W + 60],
      y: [H * 0.78, H * 0.62, H * 0.30, H * 0.20],
    };
  }

  /* ============================================================
   * 一、绘制原语
   * ============================================================ */
  var Prim = {};

  /* --- 天幕：延伸到逻辑区域之外，留边区不会成为空框 --- */
  Prim.sky = function (ctx, top, bottom) {
    /* 渐变仍按 0..H 定义，画面内的配色完全不变；
       超出 0..H 的部分由 Canvas 自动取端点色，所以留边区是天幕的自然延续。 */
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(-BLEED, -BLEED, W + BLEED * 2, H + BLEED * 2);
  };

  /* --- 星空：确定性布点 --- */
  Prim.stars = function (ctx, count, seed, alpha, color) {
    if (count <= 0 || alpha <= 0.002) return;
    var spanX = W + BLEED * 2, spanY = H + BLEED * 1.5;
    for (var i = 0; i < count; i++) {
      var x = U.hash(seed + i * 3.1) * spanX - BLEED;
      var y = U.hash(seed + i * 7.7) * spanY - BLEED * 0.8;
      var r = 0.6 + U.hash(seed + i * 11.3) * 1.5;
      var tw = 0.55 + 0.45 * Math.sin(seed * 0.7 + i * 1.7);
      ctx.globalAlpha = alpha * tw;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  /* --- 日冕：放射状细线 + 外晕 --- */
  Prim.corona = function (ctx, cx, cy, R, t, glow, alpha, spikes) {
    if (alpha <= 0.002) return;
    var n = spikes || 96;
    ctx.save();
    ctx.globalAlpha = alpha;
    /* 外晕 */
    var g = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 2.6);
    g.addColorStop(0, P.rgba(glow, 0.55));
    g.addColorStop(0.35, P.rgba(glow, 0.16));
    g.addColorStop(1, P.rgba(glow, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 2.6, 0, TAU);
    ctx.fill();
    /* 放射细线：长度随角度与时间脉动 */
    ctx.strokeStyle = P.rgba(glow, 0.5);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (var i = 0; i < n; i++) {
      var a = (i / n) * TAU;
      var k = 0.5 + 0.5 * Math.sin(a * 5 + t * 0.7);
      var k2 = 0.5 + 0.5 * Math.sin(a * 11 - t * 0.43);
      var len = R * (0.10 + 0.30 * k * k2);
      var x0 = cx + Math.cos(a) * R * 1.02;
      var y0 = cy + Math.sin(a) * R * 1.02;
      ctx.moveTo(x0, y0);
      ctx.lineTo(cx + Math.cos(a) * (R * 1.02 + len), cy + Math.sin(a) * (R * 1.02 + len));
    }
    ctx.stroke();
    ctx.restore();
  };

  /* --- 日轮（月影盘）：全曲反复出现的唯一符号 --- */
  Prim.sunDisc = function (ctx, cx, cy, R, core, glow, alpha, ringW) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.fill();
    if (ringW > 0) {
      ctx.strokeStyle = P.rgba(glow, 0.9);
      ctx.lineWidth = ringW;
      ctx.beginPath();
      ctx.arc(cx, cy, R + ringW * 0.5, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  };

  /* --- 地平线：暗色地面 + 近地辉光 + 一条亮线 ---
         第一版只填了一层几乎全黑的色块，在深蓝夜空上根本看不出"地面"，
         逐段截图核对时才发现空间锚点丢了。 */
  Prim.horizon = function (ctx, y, color, alpha, ink) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = ink;
    ctx.fillRect(-BLEED, y, W + BLEED * 2, H + BLEED * 2 - y);
    var g = ctx.createLinearGradient(0, y, 0, y + 200);
    g.addColorStop(0, P.rgba(color, 0.30));
    g.addColorStop(1, P.rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(-BLEED, y, W + BLEED * 2, 200);
    ctx.strokeStyle = P.rgba(color, 0.8);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-BLEED, y);
    ctx.lineTo(W + BLEED, y);
    ctx.stroke();
    ctx.restore();
  };

  /* --- 人群：竖直光痕。count 越大越密，speed 越大越快 --- */
  Prim.crowd = function (ctx, baseY, count, t, speed, color, alpha, seed, heightScale) {
    if (count <= 0 || alpha <= 0.002) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    for (var i = 0; i < count; i++) {
      var r1 = U.hash(seed + i * 2.3);
      var r2 = U.hash(seed + i * 5.9);
      var r3 = U.hash(seed + i * 9.1);
      var span = W + 320;
      var x = ((r1 * span + t * speed * (0.55 + r2)) % span) - 160;
      var h = (36 + r3 * 96) * (heightScale || 1);
      var y = baseY - r3 * 26;
      ctx.lineWidth = 1.2 + r2 * 2.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - h);
      ctx.stroke();
    }
    ctx.restore();
  };

  /* --- 时间刻度尺：本作的标题性符号 ---
     每一格 = 1 秒，格宽 spacing 直接表现"时间被拉长"（slow motion）。
     位置由【时间】决定：x = (sec - t) * spacing + 左边距，
     即"现在"固定在屏幕左侧 12% 处，未来在右、过去在左，
     时间推移时刻度向左流动 —— 符合时间轴的直觉方向。
     （第一版方向写反了，而且数字的流动偏移被重复扣了一次，
       出现 -1 / 4 / 9 这种错位；两处都是逐段截图肉眼核对才发现的，
       几何检查查不出"数字对不对、方向对不对"。） */
  Prim.ruler = function (ctx, y, spacing, t, color, alpha, opts) {
    opts = opts || {};
    if (alpha <= 0.002 || spacing <= 1) return;
    var major = opts.major || 5;
    var tall = opts.tall || 30;
    var tick = opts.tick || 14;
    var per = opts.secPerTick || 1;
    var head = W * 0.12;                       /* "现在"所在的 x */
    var first = Math.max(0, Math.floor(t - head / spacing) - 2);
    var last = Math.ceil(t + (W - head) / spacing + 2);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    var nums = [];
    for (var sec = first; sec <= last; sec++) {
      var x = (sec - t) * spacing + head;
      if (x < -spacing || x > W + spacing) continue;
      var isMajor = (sec % major) === 0;
      var h = isMajor ? tall : tick;
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - h);
      if (isMajor && opts.numbers) nums.push([x, sec * per]);
    }
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();

    if (nums.length) {
      ctx.fillStyle = color;
      ctx.font = '500 18px ui-monospace, Menlo, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.globalAlpha = alpha * 0.7;
      for (var i = 0; i < nums.length; i++) {
        ctx.fillText(String(nums[i][1]), nums[i][0], y + 26);
      }
    }
    ctx.restore();
  };

  /* --- 光速线：一条笔直的贯穿光线 --- */
  Prim.lightRay = function (ctx, y, t, color, alpha, opts) {
    opts = opts || {};
    var reach = opts.reach == null ? 1 : opts.reach;   /* 0..1 伸长 */
    var x1 = U.lerp(0, W + 40, U.easeOut(reach));
    ctx.save();
    ctx.globalAlpha = alpha;
    var g = ctx.createLinearGradient(0, y, W, y);
    g.addColorStop(0, P.rgba(color, 0));
    g.addColorStop(0.25, P.rgba(color, 0.85));
    g.addColorStop(0.75, P.rgba(color, 0.85));
    g.addColorStop(1, P.rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, y - (opts.w || 3) / 2, x1, opts.w || 3);
    /* 线芯 */
    ctx.fillStyle = P.rgba('#ffffff', 0.75 * alpha);
    ctx.fillRect(0, y - 0.6, x1, 1.2);
    ctx.restore();
  };

  /* --- 环：绕行轨道 / 张开的眼 / 绽开的"fun" --- */
  Prim.ring = function (ctx, cx, cy, R, color, alpha, w, dash, phase) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = w || 2;
    if (dash) ctx.setLineDash(dash);
    if (phase) ctx.lineDashOffset = phase;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.stroke();
    ctx.restore();
  };

  /* --- 绕行点：一个点在轨道上运行（"running around the sun"） --- */
  Prim.orbiter = function (ctx, cx, cy, R, ang, color, alpha, r, tail) {
    ctx.save();
    ctx.globalAlpha = alpha;
    if (tail) {
      ctx.strokeStyle = P.rgba(color, 0.5);
      ctx.lineWidth = r * 0.8;
      ctx.beginPath();
      for (var i = 0; i < 26; i++) {
        var a = ang - i * 0.045;
        var x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    var px = cx + Math.cos(ang) * R, py = cy + Math.sin(ang) * R;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = P.rgba('#ffffff', 0.9);
    ctx.beginPath();
    ctx.arc(px, py, r * 0.45, 0, TAU);
    ctx.fill();
    ctx.restore();
  };

  /* --- 地球弧线 --- */
  Prim.earthArc = function (ctx, R, t, alpha) {
    if (alpha <= 0.002) return;
    var cx = W / 2, cy = H + R * 0.72;
    ctx.save();
    ctx.globalAlpha = alpha;
    var g = ctx.createRadialGradient(cx, cy - R, R * 0.94, cx, cy - R, R * 1.14);
    g.addColorStop(0, P.rgba('#2a6bb5', 0.0));
    g.addColorStop(0.72, P.rgba('#2a6bb5', 0.45));
    g.addColorStop(0.86, P.rgba('#8fd0ff', 0.28));
    g.addColorStop(1, P.rgba('#8fd0ff', 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = P.rgba('#a9dcff', 0.5);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(cx, cy, R, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.restore();
  };

  /* --- 驾驶舱窗框与仪表 --- */
  Prim.cabin = function (ctx, t, accent, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    /* 窗框四边 */
    ctx.fillStyle = 'rgba(6,2,1,0.92)';
    ctx.fillRect(0, 0, W, 54);
    ctx.fillRect(0, H - 210, W, 210);
    ctx.fillRect(0, 0, 78, H);
    ctx.fillRect(W - 78, 0, 78, H);
    ctx.strokeStyle = P.rgba(accent, 0.45);
    ctx.lineWidth = 2;
    ctx.strokeRect(78, 54, W - 156, H - 264);
    /* 中央窗棂 */
    ctx.fillStyle = 'rgba(6,2,1,0.85)';
    ctx.fillRect(W / 2 - 9, 54, 18, H - 264);
    /* 仪表：一排指针 */
    var n = 9;
    for (var i = 0; i < n; i++) {
      var cx = 150 + i * 162;
      var cy = H - 118;
      ctx.strokeStyle = P.rgba(accent, 0.34);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(cx, cy, 40, Math.PI * 0.88, Math.PI * 2.12);
      ctx.stroke();
      var a = -Math.PI * 0.5 + Math.sin(t * 1.6 + i * 0.9) * 1.05;
      ctx.strokeStyle = P.rgba(accent, 0.9);
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * 32, cy + Math.sin(a) * 32);
      ctx.stroke();
      ctx.fillStyle = P.rgba(accent, 0.6);
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  };

  /* --- 航迹：一条被拉长的贝塞尔弧 --- */
  Prim.trail = function (ctx, t, color, alpha, k) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.4;
    ctx.setLineDash([26, 20]);
    ctx.lineDashOffset = -t * 120 * (k || 1);
    ctx.beginPath();
    ctx.moveTo(-60, H * 0.78);
    ctx.bezierCurveTo(W * 0.3, H * 0.62, W * 0.62, H * 0.30, W + 60, H * 0.20);
    ctx.stroke();
    ctx.restore();
  };

  /* --- 云带：高空俯视时的地表纹理 --- */
  Prim.clouds = function (ctx, t, V, alpha, count) {
    var n = count || 8;
    if (alpha <= 0.002) return;
    ctx.save();
    for (var i = 0; i < n; i++) {
      var y = 250 + U.hash(501 + i * 3.7) * 520;
      var w = 200 + U.hash(504 + i * 2.9) * 520;
      var h = 12 + U.hash(505 + i * 4.1) * 26;
      var x = ((U.hash(502 + i * 5.1) * (W + 800) + t * (10 + U.hash(503 + i * 7.3) * 22)) % (W + 800)) - 400;
      ctx.globalAlpha = alpha * (0.22 + 0.55 * U.hash(506 + i * 6.7));
      var g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
      g.addColorStop(0, P.rgba(V.hint, 0));
      g.addColorStop(0.5, P.rgba(V.hint, 0.6));
      g.addColorStop(1, P.rgba(V.hint, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, w / 2, h / 2, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  };

  /* --- 协和：俯视轮廓（机头朝右，原点在机身中心）---
     尺寸按真实比例来：协和机身长 61.66 m、翼展 25.6 m，约 2.4:1。
     所以这里机身跨 x ∈ [-340, 360]（长 700），半展只到 ±150 ——
     机身必须明显长于翼展，否则就只是个"箭头"。
     三个识别特征缺一不可：
       ① 极细长的机身 + 尖长的机头
       ② ogival（双曲率）三角翼 —— 前缘是 S 形曲线，不是直线
       ③ 翼下四台发动机，两两成对，从机翼后缘向后伸出
     第一版机身只有 252 长而翼展 ±192（翼展比机身宽），
     用户反馈"过于抽象，看不出是什么"。 */
  Prim.concordePath = function (ctx) {
    ctx.beginPath();
    ctx.moveTo(360, 0);                                   /* 机头尖 */
    ctx.quadraticCurveTo(318, -7, 240, -10);
    ctx.lineTo(60, -12);                                  /* 翼根前缘起点 */
    /* 右翼 ogival 前缘：S 形双曲率，这是协和最好认的地方 */
    ctx.bezierCurveTo(10, -42, -62, -104, -130, -150);
    ctx.lineTo(-180, -144);                               /* 翼尖 */
    ctx.lineTo(-150, -16);                                /* 后缘回机身 */
    ctx.lineTo(-250, -14);                                /* 后机身 */
    ctx.quadraticCurveTo(-310, -11, -340, -5);            /* 尾锥 */
    ctx.lineTo(-340, 5);
    /* 下侧镜像 */
    ctx.quadraticCurveTo(-310, 11, -250, 14);
    ctx.lineTo(-150, 16);
    ctx.lineTo(-180, 144);
    ctx.lineTo(-130, 150);
    ctx.bezierCurveTo(-62, 104, 10, 42, 60, 12);
    ctx.lineTo(240, 10);
    ctx.quadraticCurveTo(318, 7, 360, 0);
    ctx.closePath();
  };

  /* view: 'top'（默认，俯视）| 'under'（从斜下方仰视）
     仰视是对真实观察角度的还原 —— 站在跑道边看一架正在滑跑的协和，
     看到的是机腹，而且翼展会因透视被压掉一点。平面轮廓无法真正做透视，
     所以这里用三件事凑出"从下往上看"的感觉：
       ① 纵向压缩（ctx.scale 的 y 分量）
       ② 发动机短舱画得更宽更深（它们离观察者最近）
       ③ 机腹中线用暗带而不是亮线（体积感） */
  Prim.concorde = function (ctx, cx, cy, s, rot, fill, edge, glow, podFill, view) {
    var under = (view === 'under');
    var squash = under ? 0.86 : 1;
    s = s || 1;
    ctx.save();
    ctx.translate(cx, cy);
    if (rot) ctx.rotate(rot);
    ctx.scale(s, s * squash);

    /* 机体 */
    Prim.concordePath(ctx);
    ctx.fillStyle = fill;
    ctx.fill();
    if (edge) {
      ctx.strokeStyle = edge;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    /* 翼下四台发动机，两两成对，从机翼后缘向后伸出。
       俯视时它们落在机翼上，所以用比机体深一档的填充、且【不描边】——
       描边会变成机翼上的四条横纹，小尺寸下整架飞机糊成"梯子"。 */
    var pods = under
      ? [[-108, -62], [-58, -16], [16, 58], [62, 108]]
      : [[-100, -68], [-60, -28], [28, 60], [68, 100]];
    for (var i = 0; i < pods.length; i++) {
      var a = pods[i][0], b = pods[i][1];
      ctx.beginPath();
      ctx.moveTo(-214, a);
      ctx.lineTo(-118, a);
      ctx.lineTo(-104, (a + b) / 2);
      ctx.lineTo(-118, b);
      ctx.lineTo(-214, b);
      ctx.closePath();
      ctx.fillStyle = podFill || 'rgba(10,22,38,0.92)';
      ctx.fill();
    }

    if (under) {
      /* 机腹的弧度：一条比机体更暗的窄带，给平面轮廓一点体积感 */
      ctx.save();
      ctx.globalAlpha *= 0.5;
      ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(-318, 0);
      ctx.lineTo(344, 0);
      ctx.stroke();
      ctx.restore();
    } else if (edge) {
      /* 俯视：机身中线用亮线 */
      ctx.save();
      ctx.globalAlpha *= 0.30;
      ctx.strokeStyle = edge;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-332, 0);
      ctx.lineTo(356, 0);
      ctx.stroke();
      ctx.restore();
    }

    /* 驾驶舱窗 + 机背观测窗（1973 年那次任务在机顶开了专用观测窗） */
    if (glow) {
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.ellipse(300, 0, 10, 5, 0, 0, TAU);
      ctx.fill();
      if (!under) {
        ctx.save();
        ctx.globalAlpha *= 0.75;
        ctx.beginPath();
        ctx.ellipse(30, 0, 13, 5, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  };

  /* 四台发动机短舱在【世界坐标】下的中心 y（相对机身中线），
     与上面 under 版的 pods 一致；供尾焰定位用。 */
  Prim.POD_OFFSETS = [-85, -37, 37, 85];
  Prim.UNDER_SQUASH = 0.86;

  /* --- 跑道灯：起飞前的地面锚点，一排向观众散开的灯 --- */
  Prim.runwayLights = function (ctx, hy, t, color, alpha) {
    ctx.save();
    for (var i = 0; i < 13; i++) {
      var u = i / 12;
      var y = hy + 12 + u * u * (H - hy - 46);
      var spread = 46 + u * 560;
      var blink = 0.42 + 0.58 * Math.abs(Math.sin(t * 1.6 + i * 0.55));
      ctx.globalAlpha = alpha * blink * (1 - u * 0.32);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(W / 2 - spread, y, 1.8 + u * 3.2, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(W / 2 + spread, y, 1.8 + u * 3.2, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  };

  /* --- 地面上仰望的人：everyone I know 的第一次出现 --- */
  Prim.watchers = function (ctx, hy, t, ink, accent, alpha) {
    var xs = [150, 268, 405, 1180, 1320, 1455];
    ctx.save();
    for (var i = 0; i < xs.length; i++) {
      var h = 54 + U.hash(801 + i * 3.7) * 34;
      var x = xs[i] + Math.sin(t * 0.28 + i * 1.7) * 4;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.moveTo(x - 5, hy);
      ctx.lineTo(x - 4, hy - h * 0.66);
      ctx.lineTo(x + 4, hy - h * 0.66);
      ctx.lineTo(x + 5, hy);
      ctx.closePath();
      ctx.fill();
      /* 头：略微后仰 —— 他们在看天 */
      ctx.beginPath();
      ctx.arc(x, hy - h * 0.76, 6, 0, TAU);
      ctx.fill();
      /* 视线：一条极短的仰视线（第一版画到 190 长，看起来像天线） */
      ctx.globalAlpha = alpha * 0.16;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, hy - h * 0.80);
      ctx.lineTo(x + (i < 3 ? 28 : -28), hy - h * 0.80 - 74);
      ctx.stroke();
    }
    ctx.restore();
  };

  /* --- 地平线上的机场/城市微光 --- */
  Prim.cityGlow = function (ctx, hy, t, color, alpha) {
    ctx.save();
    for (var i = 0; i < 7; i++) {
      var x = U.hash(701 + i * 3.3) * W;
      var w = 110 + U.hash(703 + i * 5.1) * 240;
      var pulse = 0.7 + 0.3 * Math.sin(t * 0.45 + i * 1.3);
      var g = ctx.createRadialGradient(x, hy, 0, x, hy, w);
      g.addColorStop(0, P.rgba(color, 0.26 * alpha * pulse));
      g.addColorStop(1, P.rgba(color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, hy, w, w * 0.26, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  };

  /* --- 缓慢自转的星空：让"等待"里也有时间在走 --- */
  Prim.starsDrift = function (ctx, count, seed, alpha, color, ang) {
    var cx = W / 2, cy = H * 0.40;
    ctx.save();
    for (var i = 0; i < count; i++) {
      var a = U.hash(seed + i * 3.1) * TAU + ang;
      var r = 150 + U.hash(seed + i * 7.7) * 1180;
      var x = cx + Math.cos(a) * r;
      var y = cy + Math.sin(a) * r * 0.70;
      if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
      var tw = 0.55 + 0.45 * Math.sin(seed * 0.7 + i * 1.7);
      ctx.globalAlpha = alpha * tw;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 0.6 + U.hash(seed + i * 11.3) * 1.5, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  };

  /* --- 航线：横贯画面的水平航路 + 菱形航点 + 两端方向刻度。
     这一条就是用户在 1:15 中场看到、并希望把飞机放上去的那根线。 --- */
  Prim.airLane = function (ctx, y, t, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = P.rgba(color, 0.45);
    ctx.lineWidth = 1.3;
    ctx.setLineDash([20, 15]);
    ctx.lineDashOffset = -(t * 110) % 35;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
    ctx.setLineDash([]);
    var n = 7, gap = W / n;
    for (var i = 0; i < n; i++) {
      var x = ((i * gap + t * 46) % (W + gap)) - gap * 0.5;
      ctx.strokeStyle = P.rgba(color, 0.7);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(x, y - 9);
      ctx.lineTo(x + 9, y);
      ctx.lineTo(x, y + 9);
      ctx.lineTo(x - 9, y);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.strokeStyle = P.rgba(color, 0.5);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, y - 16); ctx.lineTo(0, y + 16);
    ctx.moveTo(W, y - 16); ctx.lineTo(W, y + 16);
    ctx.stroke();
    ctx.restore();
  };

  /* --- 通用航迹：可配置控制点、颜色、虚线节奏。
     原来那条 trail 是青色 + 固定控制点写死的，开头要复用同一套画法
     就得先把它抽出来。 */
  Prim.trailEx = function (ctx, TP, t, color, alpha, dash, speed) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.4;
    if (dash !== false) {
      ctx.setLineDash(dash || [26, 20]);
      ctx.lineDashOffset = -(t * (speed || 120)) % 46;
    }
    ctx.beginPath();
    ctx.moveTo(TP.x[0], TP.y[0]);
    ctx.bezierCurveTo(TP.x[1], TP.y[1], TP.x[2], TP.y[2], TP.x[3], TP.y[3]);
    ctx.stroke();
    ctx.restore();
  };

  /* ============================================================
   * 第 2 版新增：俯瞰地图 / 月影航线 / 封面标题 / 结尾标语
   * ============================================================ */

  /* --- 地面：深色底 + 稀疏点阵 ---
     用户反馈：第 1 版是暗色风格，第 2 版开头却把海和国界画得太清楚、
     颜色也太亮，两段接不上。所以去掉海陆分界与国界线，
     改成暗色底 + 小方点阵（像素感），只暗示"这是一片大地"。
     月影随后叠上去时，点阵在影子里自然变暗 —— 影子因此看得见。 */
  Prim.groundMap = function (ctx) {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#060b14');
    g.addColorStop(1, '#0b1622');
    ctx.fillStyle = g;
    ctx.fillRect(-BLEED, -BLEED, W + BLEED * 2, H + BLEED * 2);

    ctx.save();
    var cols = 46, rows = 26;
    var cw = (W + BLEED * 1.2) / cols;
    var ch = (H + BLEED * 0.9) / rows;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var n = U.hash(900 + r * 71 + c * 13);
        if (n < 0.42) continue;
        var x = -BLEED * 0.6 + c * cw + (U.hash(901 + r * 17 + c * 29) - 0.5) * cw * 0.6;
        var y = -BLEED * 0.45 + r * ch + (U.hash(902 + r * 23 + c * 31) - 0.5) * ch * 0.6;
        ctx.globalAlpha = 0.16 + n * 0.34;
        ctx.fillStyle = '#37637a';
        var s = 1.8 + U.hash(903 + r * 11 + c * 7) * 2.6;
        ctx.fillRect(x, y, s, s);
      }
    }
    ctx.restore();
  };

  /* --- 航线：横贯画面的亮弧（参考图里那条白线） --- */
  Prim.ROUTE = {
    x: [-BLEED, W * 0.30, W * 0.58, W + BLEED],
    y: [H * 0.50, H * 0.45, H * 0.53, H * 0.63],
  };

  Prim.airRoute = function (ctx) {
    var T = Prim.ROUTE;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(T.x[0], T.y[0]);
    ctx.bezierCurveTo(T.x[1], T.y[1], T.x[2], T.y[2], T.x[3], T.y[3]);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 13;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.88)';
    ctx.lineWidth = 4.5;
    ctx.stroke();
    ctx.restore();
  };

  /* --- 封面标题：左上三行中文 / 右下三行英文（同款写法） --- */
  Prim.coverTitles = function (ctx, alpha) {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textBaseline = 'alphabetic';

    var zh = ['超音速客机', '极速逐日', '协和'];
    ctx.textAlign = 'left';
    ctx.font = '700 54px "Microsoft YaHei", "Segoe UI", sans-serif';
    for (var i = 0; i < zh.length; i++) {
      var y = 96 + i * 70;
      ctx.lineWidth = 7;
      ctx.strokeStyle = 'rgba(0,0,0,0.72)';
      ctx.strokeText(zh[i], 64, y);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(zh[i], 64, y);
    }

    var en = ['THE', 'CONCORDE', 'SUPERSONIC'];
    ctx.textAlign = 'right';
    ctx.font = '700 52px "Segoe UI", system-ui, sans-serif';
    for (var j = 0; j < en.length; j++) {
      /* 基线必须留在 0..900 之内：原来写成 H-116+64j，第三行落到 912，
         正好被底部的控制条压掉一半。现在与左上的 96/166/236 上下对称。 */
      var yy = H - 200 + j * 64;
      ctx.lineWidth = 7;
      ctx.strokeStyle = 'rgba(0,0,0,0.72)';
      ctx.strokeText(en[j], W - 64, yy);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(en[j], W - 64, yy);
    }
    ctx.restore();
  };

  /* --- 结尾标语：中文在上、换行写英文 ---
     字体与第 1 版的字幕【完全相同】（同一套字体栈、同一种阴影描边方式），
     不另开字体 —— 用户明确要求统一。 */
  Prim.endSlogan = function (ctx, alpha, y) {
    if (alpha <= 0.01) return;
    var yy = y == null ? H * 0.44 : y;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 14;
    /* 中文行：与 caption 的主行同款 */
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 40px "Segoe UI", system-ui, -apple-system, "Microsoft YaHei", sans-serif';
    ctx.fillText('在起飞前降落，于出发前抵达', W / 2, yy);
    /* 英文行：与 caption 的译文行同款 */
    ctx.fillStyle = P.rgba('#ffb547', 0.95);
    ctx.font = '400 25px "Segoe UI", system-ui, -apple-system, sans-serif';
    ctx.fillText('Arrive before departure, land before takeoff', W / 2, yy + 38);
    ctx.restore();
  };

  /* --- 暗角：必须覆盖到逻辑区域之外 ---
     contain 留边时，只画 0..W 的暗角会在画面中央形成一个"黑框"：
     框内有暗角、框外没有，中央反而比四周暗。用户看到的正是这个。
     现在半径放宽到 H*1.9 并带 BLEED 铺满，整个画布一起渐暗，
     画面内的观感不变，也不会有边界。 */
  Prim.vignette = function (ctx, strength) {
    strength = U.clamp(strength, 0, 1);
    var g = ctx.createRadialGradient(W / 2, H / 2, H * 0.30, W / 2, H / 2, H * 1.90);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.52, 'rgba(0,0,0,' + (strength * 0.88).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(0,0,0,' + strength.toFixed(3) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(-BLEED, -BLEED, W + BLEED * 2, H + BLEED * 2);
  };

  /* --- 字幕 ---
     基线从 H-92 上移到 H-150：一是让中文行不再压在 y=800 的刻度尺上，
     二是给 cover 缩放留出裁切余量 —— 字幕底端到画面底边的距离，
     就是 cover 模式允许裁掉的最大逻辑像素数。 */
  Prim.caption = function (ctx, en, zh, alpha, accent, y) {
    if (alpha <= 0.01) return;
    var yy = y == null ? H - 150 : y;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 40px "Segoe UI", system-ui, -apple-system, sans-serif';
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 14;
    ctx.fillText(en, W / 2, yy);
    if (zh) {
      ctx.fillStyle = P.rgba(accent, 0.95);
      ctx.font = '400 25px "Segoe UI", system-ui, -apple-system, "Microsoft YaHei", sans-serif';
      ctx.fillText(zh, W / 2, yy + 38);
    }
    ctx.restore();
  };

  /* ============================================================
   * 二、母题 —— 四句歌词各自的视觉命题
   * ============================================================ */

  /* 母题 A：Can't believe my eyes —— 一只由同心环张开的"眼" */
  function motifEyes(ctx, S, o) {
    o = o || {};
    var V = S.V;
    var cx = o.cx == null ? V.sunX : o.cx;
    var cy = o.cy == null ? V.sunY : o.cy;
    var open = U.smoother(S.p * 1.6);            /* 眼睑张开 */
    var R = V.sunR * (o.scale || 1);
    var alpha = (o.alpha == null ? 1 : o.alpha);
    var acc = S.accent;

    /* 虹膜 = 日冕环，随重音收缩 */
    var ir = R * (0.72 + 0.10 * acc);
    Prim.corona(ctx, cx, cy, ir, S.t, V.glow, 0.85 * alpha, 84);
    Prim.sunDisc(ctx, cx, cy, ir * 0.92, V.core, V.glow, alpha, 2.2);

    /* 上下眼睑：两条随开合移动的弧。眼睑必须落在日冕环【之外】，
       否则会被光晕整个盖住，眼睛就只剩一个圆点。 */
    var lid = R * (1.95 - 0.72 * open);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = P.rgba(V.hint, 0.75);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - R * 2.05, cy - lid);
    ctx.quadraticCurveTo(cx, cy - lid * 1.42, cx + R * 2.05, cy - lid);
    ctx.moveTo(cx - R * 2.05, cy + lid);
    ctx.quadraticCurveTo(cx, cy + lid * 1.42, cx + R * 2.05, cy + lid);
    ctx.stroke();
    /* 睫毛 */
    ctx.lineWidth = 1.6;
    for (var i = -3; i <= 3; i++) {
      var lx = cx + i * R * 0.52;
      ctx.beginPath();
      ctx.moveTo(lx, cy - lid * 1.16);
      ctx.lineTo(lx + i * 2.5, cy - lid * 1.16 - R * 0.20);
      ctx.moveTo(lx, cy + lid * 1.16);
      ctx.lineTo(lx + i * 2.5, cy + lid * 1.16 + R * 0.20);
      ctx.stroke();
    }
    ctx.restore();

    /* 轨道：从瞳孔里长出来的第一圈 */
    if (o.orbit) {
      var orbR = R * 2.35;
      Prim.ring(ctx, cx, cy, orbR, P.rgba(V.glow, 0.5), alpha * 0.8, 1.4, [10, 12], -S.ms * 0.02);
      Prim.orbiter(ctx, cx, cy, orbR, S.local * 0.9 - 1.2, V.glow, alpha, 5.5, true);
    }
  }

  /* 母题 B：Everyone I know runs —— 群像，重复两遍所以画两批 */
  function motifCrowd(ctx, S, o) {
    o = o || {};
    var V = S.V;
    var base = o.base == null ? V.crowdY : o.base;
    var inten = S.G.intensity;
    /* 地面必须【先】画：第一版把地平线放在人群之后，
       填充的地面把光痕整个盖住，整块画板看起来几乎是空的。
       （逐段截图核对时发现 —— 几何检查只知道"画了 150 个图元"，
        不知道它们被后画的色块遮没了。） */
    if (V.horizon != null) Prim.horizon(ctx, V.horizon, V.hint, 0.9, V.ink);
    /* 两批：第一批是"everyone"，第二批是重复 —— 错位且更快 */
    var n1 = Math.round(U.lerp(22, 64, (inten - 0.50) / 0.20) * (o.density || 1));
    var n2 = Math.round(n1 * 0.62);
    var sp = (o.speed || 900) * (1 - 0.45 * S.p);
    Prim.crowd(ctx, base, n1, S.t, sp, P.rgba(V.hint, 0.85), 0.85 * (o.alpha == null ? 1 : o.alpha), 11.3, o.hScale || 1);
    Prim.crowd(ctx, base - 26, n2, S.t, sp * 1.7, P.rgba(V.glow, 0.9), 0.6 * (o.alpha == null ? 1 : o.alpha), 47.9, (o.hScale || 1) * 1.25);
  }

  /* 母题 C：At the speed of light —— 一条贯穿的直线，末端绽环 */
  function motifLight(ctx, S, o) {
    o = o || {};
    var V = S.V;
    var y = o.y == null ? H * 0.46 : o.y;
    var reach = U.clamp(S.p * 2.2, 0, 1);
    var blocked = !!o.blocked;
    Prim.lightRay(ctx, y, S.t, V.glow, 0.95 * (o.alpha == null ? 1 : o.alpha), {
      reach: blocked ? Math.min(reach, 0.56) : reach,
      w: o.w || 3.5,
    });
    if (blocked) {
      /* 撞在窗框上：断口处炸开一圈碎裂的光 */
      var bx = W * 0.56;
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = P.rgba(V.glow, 0.85);
      ctx.lineWidth = 2;
      for (var i = 0; i < 16; i++) {
        var a = (i / 16) * TAU + S.t * 0.6;
        var len = 22 + 40 * U.hash(i * 4.4) * (0.5 + 0.5 * Math.sin(S.t * 3 + i));
        ctx.beginPath();
        ctx.moveTo(bx, y);
        ctx.lineTo(bx + Math.cos(a) * len, y + Math.sin(a) * len);
        ctx.stroke();
      }
      ctx.restore();
    }
    /* 末端绽环：can we just have some fun */
    /* 绽环位置必须收在画面内：原式终点是 W+40，圆心跑到画面外，
       16:10 cover 后（可见到 x=1520）整圈几乎看不见 ——
       用户两次报告"右侧靠近边缘的圆裁切过多"（1:08 与 2:23，
       正是 g0l2 与 g3l2 这两格，都走这个母题）。 */
    var bloom = U.clamp((S.p - 0.42) / 0.5, 0, 1);
    if (bloom > 0.01) {
      var ex = blocked ? W * 0.56 : U.lerp(0, W * 0.86, U.easeOut(reach));
      var br = U.lerp(4, 96, U.easeOut(bloom));
      Prim.ring(ctx, ex, y, br, P.rgba(V.glow, 0.8), bloom, 3);
      Prim.ring(ctx, ex, y, br * 0.62, P.rgba('#ffffff', 0.6), bloom * 0.9, 1.6, [8, 10], -S.t * 40);
      Prim.ring(ctx, ex, y, br * 0.34, P.rgba(V.glow, 0.9), bloom * 0.8, 2);
    }
  }

  /* 母题 D：Everyone slow motion —— 刻度尺被拉宽，一切减速 */
  function motifDecel(ctx, S, o) {
    o = o || {};
    var V = S.V;
    var y = o.y == null ? H * 0.74 : o.y;
    /* spacing 从"正常"被拉到"很宽" —— 这就是 slow motion 的字面化 */
    var base = o.base || 46;
    var spacing = U.lerp(base, base * 4.6, U.smoother(S.p));
    Prim.ruler(ctx, y, spacing, S.t, P.rgba(V.glow, 0.8), 0.9 * (o.alpha == null ? 1 : o.alpha), {
      major: 5, tall: 34, tick: 15, numbers: o.numbers !== false, secPerTick: 1,
    });
    /* 被拉长的运动残影：同一条光痕在减速中被"抹开" */
    var smear = U.smoother(S.p);
    ctx.save();
    ctx.globalAlpha = 0.55 * (o.alpha == null ? 1 : o.alpha);
    var g = ctx.createLinearGradient(0, y - 150, 0, y);
    g.addColorStop(0, P.rgba(V.glow, 0));
    g.addColorStop(1, P.rgba(V.glow, 0.30 * smear));
    ctx.fillStyle = g;
    ctx.fillRect(0, y - 150, W, 150);
    ctx.restore();
  }

  /* 母题 E：Runnin' around the sun —— bridge 专用，减到只剩一个点和一个太阳 */
  function motifBareOrbit(ctx, S, o) {
    o = o || {};
    var V = S.V;
    var cx = V.sunX, cy = V.sunY;
    var R = V.sunR;
    var grow = U.easeOut(U.clamp(S.p * 1.8, 0, 1));
    Prim.corona(ctx, cx, cy, R * 0.86, S.t, V.glow, 0.75, 56);
    Prim.sunDisc(ctx, cx, cy, R * 0.86, V.core, V.glow, 1, 2);
    var orbR = U.lerp(R * 1.2, R * 2.9, grow);
    Prim.ring(ctx, cx, cy, orbR, P.rgba(V.glow, 0.42), 0.9, 1.3);
    Prim.orbiter(ctx, cx, cy, orbR, S.local * 0.62 - 1.1, V.glow, 1, 7, true);
    /* 这一句只有三个词，文字一律交给统一字幕层 —— 画板里不再重复写一遍 */
  }

  /* ============================================================
   * 三、场景壳：背景 + 视点差异
   * ============================================================ */
  function backdrop(ctx, S) {
    var V = S.V;
    Prim.sky(ctx, V.skyTop, V.skyBottom);
    /* 三连副歌逐渐升温（对应人声强度 0.511→0.518→0.554） */
    if (S.G.warm > 0.01) {
      ctx.save();
      ctx.globalAlpha = S.G.warm * 0.30;
      var g = ctx.createLinearGradient(0, H, 0, 0);
      g.addColorStop(0, P.rgba('#ff7a2f', 0.9));
      g.addColorStop(1, P.rgba('#ff7a2f', 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    if (V.stars > 0.01) {
      Prim.stars(ctx, Math.round(180 * V.stars), 3.7, 0.75 * V.stars + 0.2 * S.accent, '#dfe9ff');
    }
    /* 视点专属道具 */
    if (V.earthArc) Prim.earthArc(ctx, H * 1.62, S.t, 0.9);
    if (V.horizon != null) Prim.horizon(ctx, V.horizon, V.hint, 0.85, V.ink);
    if (V.frame) Prim.cabin(ctx, S.t, V.hint, 0.95);
  }

  function outro(ctx, S) {
    Prim.vignette(ctx, S.V.frame ? 0.34 : 0.52);
  }

  /* ============================================================
   * 四、24 块画板
   *     g{组} l{句} —— 组决定"观看距离"，句决定"母题"
   * ============================================================ */
  var Scenes = {};

  /* ---------- 组0 ground：第一次开口，人声融在律动里 ---------- */
  Scenes['g0l0'] = function (ctx, S) {
    motifEyes(ctx, S, { orbit: true });
  };
  Scenes['g0l1'] = function (ctx, S) {
    motifEyes(ctx, S, { alpha: 0.34, scale: 0.72, cy: S.V.sunY - 40 });
    motifCrowd(ctx, S, { base: S.V.crowdY, speed: 1050, density: 1.0, hScale: 1.0 });
  };
  Scenes['g0l2'] = function (ctx, S) {
    motifCrowd(ctx, S, { base: S.V.crowdY, speed: 720, density: 0.5, alpha: 0.42, hScale: 0.7 });
    motifLight(ctx, S, { y: H * 0.50 });
  };
  Scenes['g0l3'] = function (ctx, S) {
    motifLight(ctx, S, { y: H * 0.50, alpha: 0.28 });
    motifDecel(ctx, S, { y: H * 0.76, base: 44 });
  };

  /* ---------- 组1 altitude：编配被抽空（onset 0.49），视觉同步变稀 ---------- */
  Scenes['g1l0'] = function (ctx, S) {
    motifEyes(ctx, S, { orbit: true, scale: 0.78, alpha: 0.9 });
  };
  Scenes['g1l1'] = function (ctx, S) {
    motifCrowd(ctx, S, { base: S.V.crowdY, speed: 520, density: 0.42, alpha: 0.55, hScale: 0.55 });
    /* 高空看下去，人群是稀落的点阵而不是光痕 */
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = P.rgba(S.V.hint, 0.8);
    for (var i = 0; i < 46; i++) {
      var x = U.hash(91 + i * 3.3) * W;
      var y = 620 + U.hash(17 + i * 6.1) * 180;
      ctx.beginPath();
      ctx.arc(x, y, 1.8, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  };
  Scenes['g1l2'] = function (ctx, S) {
    /* 高空视角：光速线穿过云层与地表。
       这一组的编配被抽空（onset 密度 0.49），但画面不能跟着变空 ——
       云层与沙漠暗斑给了它必要的体量，否则只剩一条细线，看起来像没画。 */
    Prim.clouds(ctx, S.t, S.V, 1.0, 14);
    ctx.save();
    ctx.globalAlpha = 0.55;
    for (var i = 0; i < 22; i++) {          /* 下方沙漠：被暗影扫过的地表 */
      var x = U.hash(611 + i * 3.1) * W;
      var y = 430 + U.hash(613 + i * 5.7) * 400;
      var r = 44 + U.hash(617 + i * 7.3) * 132;
      ctx.fillStyle = P.rgba(S.V.ink, 0.55);
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.30, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    motifLight(ctx, S, { y: H * 0.46, w: 2.4 });
  };
  Scenes['g1l3'] = function (ctx, S) {
    motifDecel(ctx, S, { y: H * 0.72, base: 58, numbers: false });
  };

  /* ---------- 组2 cockpit：全曲心脏，人声 0.680，最贴耳 ---------- */
  Scenes['g2l0'] = function (ctx, S) {
    /* bridge 第一句只有三个词 —— 画面也必须减到最少 */
    motifBareOrbit(ctx, S, {});
  };
  Scenes['g2l1'] = function (ctx, S) {
    motifBareOrbit(ctx, S, {});
    motifCrowd(ctx, S, { base: H - 196, speed: 380, density: 0.5, alpha: 0.5, hScale: 0.5 });
  };
  Scenes['g2l2'] = function (ctx, S) {
    /* can't we —— 全曲唯一一次恳求：光被窗框挡住 */
    motifLight(ctx, S, { y: H * 0.40, blocked: true, w: 4.5 });
    Prim.ring(ctx, W * 0.56, H * 0.40, U.lerp(6, 150, U.smoother(U.clamp(S.p * 1.3, 0, 1))),
              P.rgba(S.V.glow, 0.5), 0.7, 2, [14, 12], S.t * 30);
  };
  Scenes['g2l3'] = function (ctx, S) {
    motifDecel(ctx, S, { y: H - 214, base: 40, numbers: true });
  };

  /* ---------- 组3 shadow：从月影里往外看 ---------- */
  Scenes['g3l0'] = function (ctx, S) {
    motifEyes(ctx, S, { orbit: true, alpha: 0.78, scale: 1.05 });
    /* 前景暗影压住下半：我们是从暗处往外看的 */
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = S.V.ink;
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, H * 0.62);
    ctx.quadraticCurveTo(W * 0.5, H * 0.44, W, H * 0.66);
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  Scenes['g3l1'] = function (ctx, S) {
    motifCrowd(ctx, S, { base: H * 0.90, speed: 620, density: 0.7, alpha: 0.6, hScale: 0.8 });
  };
  Scenes['g3l2'] = function (ctx, S) {
    /* 光从暗影的缝隙里射出来 */
    ctx.save();
    ctx.globalAlpha = 0.85;
    for (var i = 0; i < 5; i++) {
      var x = W * (0.14 + i * 0.18);
      var g = ctx.createLinearGradient(x, 0, x + 90, H);
      g.addColorStop(0, P.rgba(S.V.glow, 0.30));
      g.addColorStop(1, P.rgba(S.V.glow, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 70, 0);
      ctx.lineTo(x + 190, H);
      ctx.lineTo(x + 96, H);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    motifLight(ctx, S, { y: H * 0.34, alpha: 0.55, w: 2.6 });
  };
  Scenes['g3l3'] = function (ctx, S) {
    motifDecel(ctx, S, { y: H * 0.68, base: 50, numbers: true });
  };

  /* ---------- 组4 orbit：地球弧线，逐渐升温 ---------- */
  Scenes['g4l0'] = function (ctx, S) {
    motifEyes(ctx, S, { orbit: true, cy: S.V.sunY - 60, scale: 0.86 });
  };
  Scenes['g4l1'] = function (ctx, S) {
    Prim.earthArc(ctx, H * 1.28, S.t, 0.85);
    motifCrowd(ctx, S, { base: H * 0.94, speed: 430, density: 0.8, alpha: 0.55, hScale: 0.6 });
  };
  Scenes['g4l2'] = function (ctx, S) {
    Prim.earthArc(ctx, H * 1.28, S.t, 0.6);
    motifLight(ctx, S, { y: H * 0.30, w: 3 });
    /* 轨道环：第一版圆心 (W/2, H*1.28)、半径 H*1.28，右端伸到 x=1952，
       16:10 屏幕上被裁掉一大块（用户反馈"右侧的圆画在屏幕外太多"）。
       现在圆心下移、半径收到 H*0.778=700：右端 1500、左端 100，
       整圈都落在 16:10 的安全区内。 */
    Prim.ring(ctx, W / 2, H * 1.333, H * 0.778,
              P.rgba(S.V.glow, 0.4), 0.75, 2, [18, 16], -S.t * 46);
  };
  Scenes['g4l3'] = function (ctx, S) {
    Prim.earthArc(ctx, H * 1.40, S.t, 0.5);
    motifDecel(ctx, S, { y: H * 0.62, base: 54, numbers: false });
  };

  /* ---------- 组5 sun：极简，最高点被切断 ---------- */
  Scenes['g5l0'] = function (ctx, S) {
    motifEyes(ctx, S, { orbit: true, alpha: 1, scale: 1.0 });
  };
  Scenes['g5l1'] = function (ctx, S) {
    /* 日冕里无数细小的点在跑 —— everyone runs，在天上也是 */
    var V = S.V;
    ctx.save();
    ctx.globalAlpha = 0.85;
    for (var i = 0; i < 120; i++) {
      var a = U.hash(301 + i * 2.7) * TAU;
      var rr = V.sunR * (1.18 + U.hash(302 + i * 5.3) * 1.9);
      var sp = 0.22 + U.hash(303 + i * 7.1) * 0.6;
      var aa = a + S.t * sp * 0.01;
      var x = V.sunX + Math.cos(aa) * rr;
      var y = V.sunY + Math.sin(aa) * rr;
      ctx.fillStyle = P.rgba(V.glow, 0.55 + 0.4 * Math.sin(S.t * 2 + i));
      ctx.beginPath();
      ctx.arc(x, y, 1.6 + U.hash(304 + i * 3.9) * 2.4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    Prim.sunDisc(ctx, V.sunX, V.sunY, V.sunR * 0.9, V.core, V.glow, 1, 2.6);
  };
  Scenes['g5l2'] = function (ctx, S) {
    Prim.corona(ctx, S.V.sunX, S.V.sunY, S.V.sunR * 0.7, S.t, S.V.glow, 0.6, 64);
    motifLight(ctx, S, { y: S.V.sunY, w: 5 });
  };
  Scenes['g5l3'] = function (ctx, S) {
    /* 最后一句话是全曲最后一个词；刻度被拉到最宽，亮度升到最高 */
    motifDecel(ctx, S, { y: H * 0.80, base: 40, numbers: true });
    var V = S.V;
    Prim.corona(ctx, V.sunX, V.sunY, V.sunR * 0.5, S.t, V.glow, 0.5 + 0.4 * S.p, 48);
    ctx.save();
    ctx.globalAlpha = 0.30 * S.p;
    ctx.fillStyle = P.rgba('#ffffff', 0.9);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  };

  /* ============================================================
   * 五、无词段落的画板（前奏 / 入影 / 起飞 / 飞行 / 呼吸）
   * ============================================================ */
  var SectionArt = {};

  /* 0:00–0:44.7 俯瞰：月影正扫过北非，协和在影子里追日。
     依据用户给的参考图：巨大的半透明外影 + 中心纯黑的本影，
     本影里是协和的纯色外形，一条亮线横贯画面表示当时的航线。
     影、机、航线三者沿同一条航线一起移动 —— 这就是"协和逐日"。
     （第 2 版特有；第 1 版这里是跑道滑跑 + 仰视爬升，已另存保留。） */
  SectionArt['intro'] = function (ctx, S) {
    var sp = U.clamp(S.p, 0, 1);

    /* 地面：沙漠 + 海洋 + 国界 + 加那利群岛 */
    Prim.groundMap(ctx);

    /* 航线：横贯画面的亮弧（参考图里那条白线） */
    Prim.airRoute(ctx);

    /* 影与机沿同一条航线移动，但【影子更快】——
       飞机在影内由前部滑向后部，正对应现实中飞机比月影慢一点。
       偏移量取 ±(本影半径 − 机头长度)，保证【整机始终不出影子】：
       开场机头贴着影的前缘，收尾机尾贴着影的后缘。
       机头在本地坐标是 +360、机尾是 −340（见 concordePath）。 */
    var T = Prim.ROUTE;
    var u = U.lerp(0.22, 0.62, sp);
    var sx = bez1(T.x[0], T.x[1], T.x[2], T.x[3], u);
    var sy = bez1(T.y[0], T.y[1], T.y[2], T.y[3], u);
    var ang = bezAngle(T.x[0], T.x[1], T.x[2], T.x[3],
                       T.y[0], T.y[1], T.y[2], T.y[3], u);

    var UMBRA_R = 96;
    var PLANE_S = 0.115;
    var slide = U.lerp(1, -1, U.smooth(sp)) * (UMBRA_R - 360 * PLANE_S);
    var px = sx + Math.cos(ang) * slide;
    var py = sy + Math.sin(ang) * slide;

    /* 外影（半影）：巨大的柔和暗圆，边缘化开 */
    var penR = 520;
    var g = ctx.createRadialGradient(sx, sy, penR * 0.14, sx, sy, penR);
    g.addColorStop(0, 'rgba(26,18,2,0.72)');
    g.addColorStop(0.50, 'rgba(26,18,2,0.46)');
    g.addColorStop(1, 'rgba(26,18,2,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, penR, 0, TAU);
    ctx.fill();

    /* 本影：纯黑 */
    Prim.sunDisc(ctx, sx, sy, UMBRA_R, '#000000', '#000000', 1, 0);

    /* 本影里的协和纯色外形，机头朝航线切线方向 */
    Prim.concorde(ctx, px, py, PLANE_S, ang, '#ffffff', null, null, 'top');

    /* 封面标题已按用户要求撤掉：开头不再单独开字体。
       （Prim.coverTitles 仍保留在文件里，需要时一行即可恢复。） */

    /* 时间刻度：世界在跑 */
    Prim.ruler(ctx, 846, 46, S.t, 'rgba(255,255,255,0.62)', 0.7, { major: 5, numbers: true });
  };

  /* 0:44.7–0:49.3 入影：4.6 秒静默，几乎全黑，只余一圈极暗的冕 */
  SectionArt['eclipse'] = function (ctx, S) {
    var k = U.smoother(U.clamp(S.p * 1.5, 0, 1));
    Prim.sky(ctx, '#000000', '#04040a');
    var R = U.lerp(74, 128, k);
    Prim.corona(ctx, 800, 400, R, 0, '#2a3550', 0.30 * (1 - k * 0.45), 40);
    Prim.sunDisc(ctx, 800, 400, R, '#000000', '#2a3550', 1, 1.2);
    /* 残留的一条刻度：时间被冻住 */
    Prim.ruler(ctx, 800, 46, 44.7, '#2a3550', 0.35 * (1 - k * 0.6), { major: 5, numbers: false });
  };

  /* 0:49.3–0:55.4 起飞：光从边缘回归，刻度加速 */
  SectionArt['buildup'] = function (ctx, S) {
    var VO = P.VOID.idle;
    var k = U.smoother(S.p);
    Prim.sky(ctx, VO.skyTop, P.mix(VO.skyBottom, '#2a1a08', k * 0.7));
    Prim.stars(ctx, 160, 8.1, 0.5 * (1 - k), '#dfe9ff');
    Prim.horizon(ctx, 700, VO.accent, 0.9, VO.ink);
    var R = U.lerp(60, 96, k);
    Prim.corona(ctx, 800, 400, R, S.t, '#ffb547', 0.25 + 0.75 * k, 72);
    Prim.sunDisc(ctx, 800, 400, R * 0.94, '#150a02', '#ffb547', 1, 2.4);
    /* 刻度加速：格宽随起飞收窄 —— 每秒走过的刻度变多 */
    Prim.ruler(ctx, 800, U.lerp(46, 22, k), S.t, P.rgba('#ffb547', 0.75), 0.5 + 0.5 * k,
               { major: 5, numbers: false });
    /* 加速的航迹 */
    Prim.trail(ctx, S.t, P.rgba('#ffb547', 0.5), 0.35 + 0.5 * k, 1 + 2 * k);
  };

  /* 1:13.6–1:32.1 飞行：纯过程，没有人说话。
     全曲脉冲最规整的地方（onset 密度 3.03/s，间隔标准差仅 0.122s）。
     用户要求：让客机沿着【原来就有的那条左下→右上斜线】运动，
     不要另画一条航线，而且方向要正过来。
     所以这里只保留原有的 trail，飞机沿同一条贝塞尔航迹飞，
     机头用切线角旋转到运动方向。 */
  SectionArt['interlude'] = function (ctx, S) {
    var VO = P.VOID.cruise;
    Prim.sky(ctx, VO.skyTop, VO.skyBottom);
    Prim.stars(ctx, 260, 21.5, 0.9, '#cfe6ff');

    /* 机械脉冲 */
    var beat = 60 / 104 * 1000;                 /* 577ms 一拍 */
    var ph = (S.ms % beat) / beat;
    ctx.save();
    ctx.globalAlpha = 0.5 * (1 - ph);
    ctx.fillStyle = P.rgba(VO.accent, 0.5);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    for (var i = 0; i < 33; i++) {
      var t0 = i * beat * 4;
      if (S.ms < t0) break;
      var age = (S.ms - t0) / 1400;
      if (age < 0 || age > 1) continue;
      Prim.ring(ctx, W / 2, 420, age * 700, P.rgba(VO.accent, 0.5), (1 - age) * 0.75, 2);
    }

    /* 原来就有的那条斜线：左下 → 右上 */
    Prim.trail(ctx, S.t, P.rgba(VO.accent, 0.8), 0.9, 1.6);

    /* 协和沿同一条航迹飞行：一趟 9.5 秒，机头朝切线方向 */
    var T = trailPts();
    var flightMs = 9500;
    var u = ((S.ms - S.section.t0) % flightMs) / flightMs;
    var x = bez1(T.x[0], T.x[1], T.x[2], T.x[3], u);
    var y = bez1(T.y[0], T.y[1], T.y[2], T.y[3], u);
    var ang = bezAngle(T.x[0], T.x[1], T.x[2], T.x[3], T.y[0], T.y[1], T.y[2], T.y[3], u);
    Prim.concorde(ctx, x, y, 0.40, ang,
                  'rgba(16,40,58,0.95)', P.rgba(VO.accent, 0.9), '#9ff0ff',
                  'rgba(8,24,38,0.95)');

    /* 刻度：稳定推进 */
    Prim.ruler(ctx, 800, 46, S.t, P.rgba(VO.accent, 0.8), 0.9, { major: 5, numbers: true });
  };

  /* 2:09.0–2:11.5 呼吸：全曲最静（人声强度 0.448），为三连副歌蓄势 */
  SectionArt['breath'] = function (ctx, S) {
    Prim.sky(ctx, '#000000', '#050508');
    var k = Math.sin(U.clamp(S.p, 0, 1) * Math.PI);
    Prim.corona(ctx, 800, 430, 60, 0, '#cfe3ff', 0.16 + 0.30 * k, 34);
    Prim.sunDisc(ctx, 800, 430, 70, '#000000', '#cfe3ff', 1, 1.4);
    Prim.ruler(ctx, 800, 46, 129, '#6d7fa8', 0.20 * k, { major: 5, numbers: false });
  };

  /* 3:06.977–3:13.977 尾帧：画面收黑，然后浮出标语。
     影片比音频长 7 秒 —— 用户要求"等画面完全暗下去之后再加标语"，
     但中间全黑的时间不能太长（反馈：上一版暗了 3.5 秒，太久）。
     现在收黑只用 0.24（≈1.7 s），停顿 0.03，标语随即淡入，
     余下的 4 秒都留给标语本身。 */
  SectionArt['outro'] = function (ctx, S) {
    var sp = U.clamp(S.p, 0, 1);

    Prim.sky(ctx, '#000000', '#000000');

    /* 收掉上一帧的余晖（前 24% ≈ 1.7 秒） */
    var fadeK = U.smooth(U.clamp(sp / 0.24, 0, 1));
    if (fadeK < 0.999) {
      var g = ctx.createRadialGradient(W / 2, H * 0.44, 0, W / 2, H * 0.44, 640);
      g.addColorStop(0, P.rgba('#3a2a12', (1 - fadeK) * 0.85));
      g.addColorStop(1, P.rgba('#000000', 0));
      ctx.fillStyle = g;
      ctx.fillRect(-BLEED, -BLEED, W + BLEED * 2, H + BLEED * 2);

      /* 残存的最后一格刻度，一起淡出 */
      Prim.ruler(ctx, 846, 46, 186.977, 'rgba(255,255,255,0.5)',
                 0.35 * (1 - fadeK), { major: 5, numbers: false });
    }

    /* 画面暗下去之后立刻浮出标语（27% ≈ 1.9 秒处开始，43% ≈ 3.0 秒处全显） */
    Prim.endSlogan(ctx, U.smooth(U.clamp((sp - 0.27) / 0.16, 0, 1)));
  };

  /* ============================================================
   * 六、导出
   * ============================================================ */
  SM.Prim = Prim;
  SM.Scenes = Scenes;
  SM.SectionArt = SectionArt;

  /* 供 tools/verify.js 检查：24 块画板必须全部注册 */
  SM.sceneIds = (function () {
    var ids = [];
    for (var g = 0; g < 6; g++) for (var l = 0; l < 4; l++) ids.push('g' + g + 'l' + l);
    return ids;
  })();
  SM.sectionIds = ['intro', 'eclipse', 'buildup', 'interlude', 'breath', 'outro'];

  /* 构建一份统一的绘制状态，浏览器与 Node 验证脚本共用同一套逻辑 */
  SM.makeState = function (ms, extras) {
    var tl = SM.Timeline;
    var idx = tl.cueIndexAt(ms);
    var cue = idx >= 0 ? SM.CUES[idx] : null;
    var g = cue ? SM.Palette.group(cue.g) : SM.Palette.group(0);
    var viewId = cue ? (cue.kind === 'bridge' ? 'cockpit' : g.view) : tl.sectionAt(ms).view;
    var V = SM.Palette.VIEWS[viewId] || SM.Palette.VIEWS.ground;
    var st = {
      ms: ms,
      t: ms / 1000,
      local: cue ? (ms - cue.ms) / 1000 : ms / 1000,
      p: idx >= 0 ? tl.cueProgress(ms, idx) : 0,
      cueIndex: idx,
      cue: cue,
      section: tl.sectionAt(ms),
      sectionP: tl.sectionProgress(ms),
      G: g,
      V: V,
      viewId: viewId,
      accent: SM.Accent.level(ms),
      chord: SM.Accent.chordAt(ms),
      opacity: 1,
      showCaption: true,
      focus: cue ? { x: V.sunX, y: V.sunY } : null,
    };
    if (extras) for (var k in extras) if (Object.prototype.hasOwnProperty.call(extras, k)) st[k] = extras[k];
    return st;
  };

  /* 统一的渲染入口：一段时刻 -> 一帧画面
     浏览器主循环和 Node 验证脚本都调用它，保证两边测的是同一份代码。 */
  SM.renderFrame = function (ctx, ms, opts) {
    opts = opts || {};
    var S = SM.makeState(ms, opts.state);
    var tl = SM.Timeline;
    ctx.save();
    try {
      /* 1) 段落底色（保证任何时刻都有图元，覆盖率不留空洞） */
      var art = SM.SectionArt[S.section.id];
      if (art) {
        S.p = S.sectionP;
        art(ctx, S);
      } else {
        /* 有词段落：先铺该组视点的天幕 */
        SM.Prim.sky(ctx, S.V.skyTop, S.V.skyBottom);
        if (S.V.earthArc) SM.Prim.earthArc(ctx, H * 1.4, S.t, 0.6);
        if (S.V.frame) SM.Prim.cabin(ctx, S.t, S.V.hint, 0.95);
        if (S.V.stars > 0.01) SM.Prim.stars(ctx, Math.round(180 * S.V.stars), 3.7, 0.6, '#dfe9ff');
      }
      /* 2) 当前 cue 的画板。尾帧段落（outro）里不再画歌词与字幕，
            否则标语会和最后一句歌词叠在一起。 */
      if (S.cueIndex >= 0 && S.cue && S.section.id !== 'outro') {
        S.p = tl.cueProgress(ms, S.cueIndex);
        var fn = SM.Scenes[S.cue.scene];
        if (fn) {
          /* 转场：每句入场 260ms、出场 200ms */
          var inA = U.clamp((ms - S.cue.ms) / 260, 0, 1);
          var nextMs = tl.cueEndMs(S.cueIndex);
          var outA = U.clamp((nextMs - ms) / 200, 0, 1);
          ctx.save();
          ctx.globalAlpha = U.smooth(Math.min(inA, outA));
          fn(ctx, S);
          ctx.restore();
          /* 字幕 */
          if (S.showCaption) {
            SM.Prim.caption(ctx, S.cue.en, S.cue.zh,
                            U.smooth(Math.min(inA, outA)) * 0.98, S.V.glow,
                            S.V.frame ? H - 250 : H - 150);
          }
        } else if (!opts.quiet) {
          SM.ErrorLog.push('renderFrame', new Error('画板未注册: ' + S.cue.scene));
        }
      }
      /* 3) 收尾（结尾标语已并入 outro 段落画板，这里不再重复触发） */
      SM.Prim.vignette(ctx, S.V.frame ? 0.34 : 0.5);
    } catch (e) {
      SM.ErrorLog.push('renderFrame@' + ms + 'ms (' + (S.cue ? S.cue.scene : S.section.id) + ')', e);
    }
    ctx.restore();
    return S;
  };

})(window);
