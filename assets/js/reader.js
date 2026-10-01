/* ==========================================================
 * 文章阅读设置（post.html 专用）
 * 功能：字号档位预设 / A- A+ 微调 / 行宽 / 行距 / 字体
 *       记住阅读位置；代码块字号联动；选择存 localStorage
 * ========================================================== */
(function () {
  'use strict';

  var KEY = 'jiumo_reader';
  var POS_KEY = 'jiumo_reader_pos_';

  var DEFAULTS = { preset: 'mid', fontSize: 16, width: 'standard', lh: 'standard', font: 'sans' };
  var FS = { small: 14, mid: 16, large: 18, xlarge: 20 };
  var WIDTH = { narrow: '720px', standard: '860px', wide: '100%' };
  var LH = { compact: 1.6, standard: 1.8, loose: 2.1 };
  var FONTS = {
    serif: "'Noto Serif SC','Songti SC','SimSun',Georgia,'Times New Roman',serif",
    sans: "-apple-system,'Segoe UI','Microsoft YaHei','PingFang SC',sans-serif"
  };

  var toolbar = document.getElementById('readerToolbar');
  /* 前台详情页（postContainer）或后台编辑器预览（editPreview）共用一套逻辑 */
  var root = document.getElementById('postContainer') || document.getElementById('editPreview');
  if (!toolbar || !root) {
    return;
  }
  var isPost = !!document.getElementById('postContainer');

  var state = load();

  function load() {
    try {
      return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY) || '{}'));
    } catch (e) {
      return Object.assign({}, DEFAULTS);
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {}
  }

  /* 应用当前设置到正文容器（CSS 变量 + 行宽类） */
  function apply() {
    root.style.setProperty('--reader-fs', state.fontSize + 'px');
    root.style.setProperty('--reader-lh', String(LH[state.lh] || LH.standard));
    root.style.setProperty('--reader-font', FONTS[state.font] || FONTS.sans);
    root.classList.remove('reader-w-narrow', 'reader-w-standard', 'reader-w-wide');
    root.classList.add('reader-w-' + (WIDTH[state.width] ? state.width : 'standard'));

    /* 档位按钮高亮：按当前字号就近匹配 */
    var preset = nearestPreset(state.fontSize);
    toolbar.querySelectorAll('[data-preset]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-preset') === preset);
    });
    toolbar.querySelectorAll('[data-width]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-width') === state.width);
    });
    toolbar.querySelectorAll('[data-lh]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-lh') === state.lh);
    });
    toolbar.querySelectorAll('[data-font]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-font') === state.font);
    });
  }

  function nearestPreset(fs) {
    var best = 'mid', diff = 99;
    Object.keys(FS).forEach(function (k) {
      var d = Math.abs(FS[k] - fs);
      if (d < diff) { diff = d; best = k; }
    });
    return best;
  }

  /* 档位预设 */
  toolbar.querySelectorAll('[data-preset]').forEach(function (b) {
    b.addEventListener('click', function () {
      state.preset = b.getAttribute('data-preset');
      state.fontSize = FS[state.preset];
      apply();
      save();
    });
  });

  /* A- / A+ 微调（范围 13 ~ 24） */
  var dec = document.getElementById('rtDec');
  var inc = document.getElementById('rtInc');
  if (dec) {
    dec.addEventListener('click', function () {
      state.fontSize = Math.max(13, state.fontSize - 1);
      state.preset = nearestPreset(state.fontSize);
      apply();
      save();
    });
  }
  if (inc) {
    inc.addEventListener('click', function () {
      state.fontSize = Math.min(24, state.fontSize + 1);
      state.preset = nearestPreset(state.fontSize);
      apply();
      save();
    });
  }

  /* 行宽 */
  toolbar.querySelectorAll('[data-width]').forEach(function (b) {
    b.addEventListener('click', function () {
      state.width = b.getAttribute('data-width');
      apply();
      save();
    });
  });

  /* 行距 */
  toolbar.querySelectorAll('[data-lh]').forEach(function (b) {
    b.addEventListener('click', function () {
      state.lh = b.getAttribute('data-lh');
      apply();
      save();
    });
  });

  /* 字体 */
  toolbar.querySelectorAll('[data-font]').forEach(function (b) {
    b.addEventListener('click', function () {
      state.font = b.getAttribute('data-font');
      apply();
      save();
    });
  });

  /* 初次应用 */
  apply();

  /* ----------------------------------------------------------
   * 记住阅读位置：仅前台详情页启用（后台编辑器滚动的是内部区域）
   * -------------------------------------------------------- */
  var fileName = '';
  try {
    var m = location.search.match(/[?&]f=([^&]+)/);
    fileName = m ? decodeURIComponent(m[1]) : '';
  } catch (e) {}

  function restorePos() {
    if (!isPost || !fileName) {
      return;
    }
    var y = 0;
    try {
      y = parseInt(localStorage.getItem(POS_KEY + fileName), 10) || 0;
    } catch (e) {}
    if (y > 0) {
      window.scrollTo(0, y);
    }
  }

  function savePos() {
    if (!isPost || !fileName) {
      return;
    }
    try {
      localStorage.setItem(POS_KEY + fileName, String(window.scrollY));
    } catch (e) {}
  }

  var posTimer = null;
  window.addEventListener('scroll', function () {
    if (!isPost) {
      return;
    }
    if (posTimer) {
      clearTimeout(posTimer);
    }
    posTimer = setTimeout(savePos, 400);
  }, { passive: true });

  /* 文章渲染完成（blog.js 派发）后恢复位置 */
  document.addEventListener('jiumo:postRendered', function () {
    setTimeout(restorePos, 60);
  });
})();
