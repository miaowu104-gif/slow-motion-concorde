/* ============================================================
 * 05_draw.js —— 渲染主循环
 *
 * 教训规避：
 *   ④ 渲染循环不能被一次异常永久毒死：
 *      tick() 第一行清 pending，渲染体包在 try/catch 里，
 *      然后【无条件】重新排程。任何异常都不会让循环停摆。
 *   ⑥ 毫秒级同步偏移只加在【时钟】上，绝不写回 audio.currentTime。
 *   ① audio 元素不加 crossorigin（见 index.html）。
 *   ③ 资源出错时把【实际请求的完整路径】打出来。
 * ============================================================ */
(function (global) {
  'use strict';

  var SM = global.SM;
  var Stage = SM.Stage;
  var U = SM.U;

  var App = {
    audio: null,
    playing: false,
    syncOffsetMs: 0,
    volume: 0.9,
    fixedMs: null,        /* ?t=毫秒 —— 定格渲染，用于截图核对 */
    debug: false,
    wallMs: 0,
    _wallLast: 0,
    frames: 0,
    fps: 0,
    _fpsT: 0,
    _fpsN: 0,
    lastMs: 0,
    ready: false,
    outroMs: 0,           /* 音频结束后的尾帧时钟（第 2 版） */
    onFrame: null,
  };

  /* ---------------- 时基 ---------------- */
  /* 唯一的真相：audio.currentTime。偏移只在这里相加。
     第 2 版新增：音频走完后影片还要继续 7 秒（画面渐黑 → 标语），
     而 audio.currentTime 到末尾就不动了 —— 所以尾段改用帧间隔累加的
     outroMs 接力，保证视频总长 = 音频 + 尾帧。 */
  App.nowMs = function () {
    if (App.fixedMs != null) return App.fixedMs;
    var a = App.audio;
    if (a && a.readyState >= 2 && isFinite(a.currentTime)) {
      var t = a.currentTime * 1000;
      var tail = (isFinite(a.duration) && a.duration > 0) ? a.duration * 1000 : SM.AUDIO_MS;
      if (t >= tail - 12) {
        return Math.min(SM.TOTAL_MS, SM.AUDIO_MS + App.outroMs) + App.syncOffsetMs;
      }
      return t + App.syncOffsetMs;
    }
    /* 音频尚未就绪时用墙钟兜底，保证页面不会黑屏无反应（坑④后半句） */
    return App.wallMs + App.syncOffsetMs;
  };

  App.wallReset = function () {
    App._wallLast = (global.performance && global.performance.now)
      ? global.performance.now() : Date.now();
  };

  /* 到了音频末尾就同时累加 outroMs（尾帧时钟） */
  App.atAudioTail = function () {
    var a = App.audio;
    if (!a || a.readyState < 2 || !isFinite(a.currentTime)) return false;
    var tail = (isFinite(a.duration) && a.duration > 0) ? a.duration * 1000 : SM.AUDIO_MS;
    return a.currentTime * 1000 >= tail - 12;
  };

  App.wallTick = function () {
    var now = (global.performance && global.performance.now)
      ? global.performance.now() : Date.now();
    var dt = now - App._wallLast;
    App._wallLast = now;
    if (dt > 0 && dt < 1000) {
      App.wallMs += dt;
      if (App.atAudioTail()) {
        App.outroMs = Math.min(SM.OUTRO_MS, App.outroMs + dt);
      }
    }
  };

  /* ---------------- 渲染循环 ---------------- */
  var pending = 0;

  function tick() {
    pending = 0;
    try {
      App.wallTick();
      App.render();
    } catch (e) {
      /* 绝不静默，但也绝不让它中断排程 */
      SM.ErrorLog.push('tick', e);
    }
    requestFrame();          /* 无条件重新排程 —— 坑④的解药 */
  }

  function requestFrame() {
    if (pending) return;
    pending = global.requestAnimationFrame(tick);
  }

  App.render = function () {
    var ctx = Stage.ctx;
    if (!ctx) return;
    var ms = App.nowMs();
    App.lastMs = ms;

    /* 先算出当帧状态：beginFrame 需要它来决定 letterbox 用什么天色铺满 */
    var S = null;
    try { S = SM.makeState(ms); }
    catch (e) { SM.ErrorLog.push('makeState@' + ms, e); }

    Stage.beginFrame(ctx, S);
    SM.renderFrame(ctx, ms, S ? { state: S } : {});

    /* FPS 统计 */
    App.frames++;
    App._fpsN++;
    var now = (global.performance && global.performance.now)
      ? global.performance.now() : Date.now();
    if (!App._fpsT) App._fpsT = now;
    if (now - App._fpsT >= 500) {
      App.fps = Math.round(App._fpsN * 1000 / (now - App._fpsT));
      App._fpsT = now;
      App._fpsN = 0;
    }

    if (App.onFrame) {
      try { App.onFrame(ms); } catch (e) { SM.ErrorLog.push('onFrame', e); }
    }
  };

  /* ---------------- 播放控制 ---------------- */
  App.play = function () {
    var a = App.audio;
    if (!a) return Promise.resolve();
    var pr = a.play();
    if (pr && pr.catch) {
      return pr.catch(function (err) {
        SM.ErrorLog.push('audio.play', err);
        App.setStatus('播放被浏览器拦截，请再点一次播放按钮');
      });
    }
    return Promise.resolve();
  };

  App.pause = function () {
    if (App.audio) App.audio.pause();
  };

  App.toggle = function () {
    if (!App.audio) return;
    if (App.audio.paused) App.play(); else App.pause();
  };

  App.replay = function () {
    var a = App.audio;
    if (!a) return;
    App.fixedMs = null;
    App.outroMs = 0;
    try { a.currentTime = 0; } catch (e) { SM.ErrorLog.push('replay.seek', e); }
    App.wallMs = 0;
    App.wallReset();
    App.play();
  };

  /* 跳转：只写 audio.currentTime，不把它当作偏移的载体 */
  App.seek = function (ms) {
    var a = App.audio;
    if (!a) return;
    ms = U.clamp(ms, 0, SM.TOTAL_MS);
    App.outroMs = 0;
    /* 落到尾帧区时，把音频停在结尾前一点 —— 尾帧由 outroMs 接力推进 */
    if (ms > SM.AUDIO_MS - 60) ms = SM.AUDIO_MS - 60;
    try {
      a.currentTime = ms / 1000;
    } catch (e) {
      SM.ErrorLog.push('seek(' + ms + 'ms)', e);
    }
    App.wallMs = ms;
    App.wallReset();
    /* 跳转后立刻重画一帧，避免暂停状态下画面停留在旧帧 */
    try { App.render(); } catch (e) { SM.ErrorLog.push('seek.render', e); }
  };

  App.setSyncOffset = function (ms) {
    App.syncOffsetMs = U.clamp(Math.round(ms), -2000, 2000);
    try { App.render(); } catch (e) { SM.ErrorLog.push('syncOffset.render', e); }
  };

  App.setVolume = function (v) {
    App.volume = U.clamp(v, 0, 1);
    if (App.audio) {
      try { App.audio.volume = App.volume; } catch (e) { SM.ErrorLog.push('volume', e); }
    }
  };

  App.setStatus = function (msg) {
    var el = document.getElementById('status');
    if (el) el.textContent = msg || '';
  };

  /* ---------------- 启动 ---------------- */
  App.boot = function (opts) {
    opts = opts || {};
    var canvas = document.getElementById('stage');
    Stage.attach(canvas).resize();
    global.addEventListener('resize', function () {
      try { Stage.resize(); App.render(); } catch (e) { SM.ErrorLog.push('resize', e); }
    });

    /* URL 参数 */
    var q = new global.URLSearchParams(global.location.search);
    if (q.has('t')) {
      var t = parseFloat(q.get('t'));
      if (isFinite(t)) App.fixedMs = t > 1000 ? t : t * 1000;
    }
    App.debug = q.has('debug');

    App.audio = document.getElementById('audio');
    App.setVolume(App.volume);

    var a = App.audio;
    if (a) {
      a.addEventListener('play', function () {
        App.playing = true;
        App.wallReset();
        if (App.onStateChange) App.onStateChange();
      });
      a.addEventListener('pause', function () {
        App.playing = false;
        if (App.onStateChange) App.onStateChange();
      });
      a.addEventListener('ended', function () {
        App.playing = false;
        if (App.onStateChange) App.onStateChange();
      });
      a.addEventListener('loadedmetadata', function () {
        App.ready = true;
        App.setStatus('');
        if (App.onStateChange) App.onStateChange();
      });
      /* 坑③：把实际请求的完整路径打出来 */
      a.addEventListener('error', function () {
        var e = a.error;
        var NAMES = { 1: 'MEDIA_ERR_ABORTED', 2: 'MEDIA_ERR_NETWORK',
                      3: 'MEDIA_ERR_DECODE', 4: 'MEDIA_ERR_SRC_NOT_SUPPORTED' };
        var detail = '音频加载失败\n' +
          '  实际请求路径 : ' + (a.currentSrc || a.getAttribute('src')) + '\n' +
          '  页面地址     : ' + global.location.href + '\n' +
          '  错误码       : ' + (e ? e.code : '?') + ' ' + (e ? (NAMES[e.code] || '') : '') +
          (e && e.message ? '\n  消息         : ' + e.message : '');
        App.showFatal(detail);
        SM.ErrorLog.push('audio.error', new Error(detail));
      });
      /* 首次交互后尝试播放（浏览器自动播放策略） */
      a.addEventListener('canplay', function () { App.setStatus(''); });
    }

    if (App.debug) {
      var dbg = document.getElementById('debug');
      if (dbg) dbg.style.display = 'block';
    }

    App.wallReset();
    requestFrame();          /* 心跳与播放状态无关 —— 坑④ */

    return App;
  };

  App.showFatal = function (msg) {
    var el = document.getElementById('fatal');
    if (!el) return;
    el.style.display = 'block';
    el.textContent = msg;
  };

  SM.App = App;
  SM.H = undefined;   /* 显式不使用任何隐藏尺寸常量 */

})(window);
