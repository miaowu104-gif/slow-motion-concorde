/* ============================================================
 * 06_ui.js —— 控制条
 *
 * PROMPT.md 第 5 条要求：开始、暂停、重播、进度跳转、音量、
 * 全屏、毫秒级同步偏移，一个都不能少。
 *
 * 关键（注意事项.md ⑥）：
 *   拖动进度条时画面直接跟随（走 fixedMs），松手才写 audio.currentTime；
 *   同步偏移只改时钟，audio.currentTime 永远不被偏移写入。
 * ============================================================ */
(function (global) {
  'use strict';

  var SM = global.SM;
  var App = SM.App;
  var U = SM.U;

  function $(id) { return document.getElementById(id); }

  var els = {};
  var dragging = false;
  var uiClock = 0;

  function durationMs() {
    /* 第 2 版：进度条走完的是【影片总长】（音频 + 7 秒尾帧），
       不是 audio.duration —— 否则最后那段标语永远拖不到。 */
    return SM.TOTAL_MS;
  }

  function setOffset(ms) {
    App.setSyncOffset(ms);
    if (els.offset) els.offset.value = String(App.syncOffsetMs);
    if (els.offsetVal) {
      var v = App.syncOffsetMs;
      els.offsetVal.textContent = (v > 0 ? '+' : '') + v + ' ms';
    }
  }

  function toggleFullscreen() {
    var el = document.documentElement;
    try {
      if (!document.fullscreenElement) {
        if (el.requestFullscreen) el.requestFullscreen();
      } else if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    } catch (e) {
      SM.ErrorLog.push('fullscreen', e);
    }
  }

  function syncPlayButton() {
    if (!els.play) return;
    var p = App.audio && !App.audio.paused;
    els.play.textContent = p ? '❚❚ 暂停' : '▶ 播放';
    els.play.setAttribute('aria-label', p ? '暂停' : '播放');
  }

  /* ---------------- 每帧刷新（节流到 ~12Hz） ---------------- */
  App.onFrame = function (ms) {
    var now = (global.performance && global.performance.now)
      ? global.performance.now() : Date.now();
    if (now - uiClock < 80) return;
    uiClock = now;

    var total = durationMs();
    if (els.timeNow) els.timeNow.textContent = U.fmtTime(ms);
    if (els.timeTotal) els.timeTotal.textContent = U.fmtTime(total);

    if (!dragging && els.seek) {
      els.seek.max = String(Math.round(total));
      els.seek.value = String(Math.round(U.clamp(ms, 0, total)));
    }

    var pct = total > 0 ? U.clamp(ms / total, 0, 1) : 0;
    if (els.bar) els.bar.style.width = (pct * 100).toFixed(2) + '%';

    /* 当前段落 / 句子 */
    var sec = SM.Timeline.sectionAt(ms);
    var idx = SM.Timeline.cueIndexAt(ms);
    var label = sec.name;
    if (idx >= 0) {
      var c = SM.CUES[idx];
      label += '　·　第 ' + (c.g + 1) + ' 遍 第 ' + (c.line + 1) + ' 句　·　视点 ' + c.view;
    } else {
      label += '　·　器乐段';
    }
    if (els.scene) els.scene.textContent = label;

    if (App.debug && els.debug) {
      els.debug.textContent =
        'ms=' + ms.toFixed(0) +
        '  section=' + sec.id +
        '  cue=' + (idx >= 0 ? SM.CUES[idx].scene : '—') +
        '  accent=' + SM.Accent.level(ms).toFixed(3) +
        '  chord=' + SM.Accent.chordAt(ms) +
        '  fps=' + App.fps +
        '  offset=' + App.syncOffsetMs + 'ms' +
        '  fixed=' + (App.fixedMs == null ? 'no' : App.fixedMs.toFixed(0));
    }
  };

  App.onStateChange = syncPlayButton;

  /* ---------------- 绑定 ---------------- */
  function init() {
    els.play = $('btn-play');
    els.replay = $('btn-replay');
    els.seek = $('seek');
    els.bar = $('seek-fill');
    els.timeNow = $('time-now');
    els.timeTotal = $('time-total');
    els.vol = $('vol');
    els.offset = $('offset');
    els.offsetVal = $('offset-val');
    els.offsetReset = $('offset-reset');
    els.fs = $('btn-fs');
    els.scene = $('scene-label');
    els.debug = $('debug');

    if (els.play) els.play.addEventListener('click', function () { App.toggle(); });
    if (els.replay) els.replay.addEventListener('click', function () { App.replay(); });
    if (els.fs) els.fs.addEventListener('click', toggleFullscreen);

    if (els.vol) {
      els.vol.addEventListener('input', function () { App.setVolume(+els.vol.value / 100); });
    }

    if (els.seek) {
      /* 拖动中：画面直接跟随，不写音频 */
      els.seek.addEventListener('input', function () {
        dragging = true;
        App.fixedMs = +els.seek.value;
        if (els.timeNow) els.timeNow.textContent = U.fmtTime(App.fixedMs);
      });
      /* 松手：真正 seek 音频 */
      var commit = function () {
        if (!dragging) return;
        dragging = false;
        var v = +els.seek.value;
        App.fixedMs = null;
        App.seek(v);
      };
      els.seek.addEventListener('change', commit);
      els.seek.addEventListener('pointerup', commit);
    }

    if (els.offset) {
      els.offset.addEventListener('input', function () { setOffset(+els.offset.value); });
    }
    if (els.offsetReset) {
      els.offsetReset.addEventListener('click', function () { setOffset(0); });
    }

    /* 键盘 */
    document.addEventListener('keydown', function (e) {
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' && e.key !== ' ') return;
      switch (e.key) {
        case ' ': e.preventDefault(); App.toggle(); break;
        case 'ArrowLeft': e.preventDefault(); App.seek(App.nowMs() - (e.shiftKey ? 1000 : 5000)); break;
        case 'ArrowRight': e.preventDefault(); App.seek(App.nowMs() + (e.shiftKey ? 1000 : 5000)); break;
        case 'r': case 'R': App.replay(); break;
        case 'f': case 'F': toggleFullscreen(); break;
        case '[': setOffset(App.syncOffsetMs - 10); break;
        case ']': setOffset(App.syncOffsetMs + 10); break;
        case '0': setOffset(0); break;
        default: break;
      }
    });

    /* 歌词双份互校验 —— 注意事项.md 建议 3 */
    var chk = SM.lyricsSelfCheck ? SM.lyricsSelfCheck() : { ok: true, msg: 'n/a' };
    if (!chk.ok) {
      SM.ErrorLog.push('lyricsSelfCheck', new Error(chk.msg));
      App.showFatal('歌词数据自校验失败：\n' + chk.msg);
    } else if (App.debug) {
      console.log('[SM] ' + chk.msg);
    }

    setOffset(0);
    syncPlayButton();
    App.setStatus('按空格或点击「播放」开始');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      try { init(); } catch (e) { SM.ErrorLog.push('ui.init', e); }
    });
  } else {
    try { init(); } catch (e) { SM.ErrorLog.push('ui.init', e); }
  }

})(window);
