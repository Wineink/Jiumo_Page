/* ============================================================
 * Jiumo_Page 前端交互模块
 * 右下角按钮 / 深浅主题切换 / 滚动入场动画 / 粒子背景 / 打字机 / 评论区
 * 所有模块的开关与配置都来自 SITE_CFG（后台「组件模块」分类管理）
 * ============================================================ */
(function () {
  /* ----------------------------------------------------------
   * 右下角按钮：返回顶部 + 深浅色切换
   * -------------------------------------------------------- */
  function initCornerButtons() {
    var btnTop = document.getElementById('btnTop');
    if (btnTop) {
      btnTop.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      /* 滚动超过一屏后显示返回顶部按钮（淡入淡出） */
      var show = function () {
        if (window.scrollY > 200) {
          btnTop.classList.add('show');
        } else {
          btnTop.classList.remove('show');
        }
      };
      window.addEventListener('scroll', show, { passive: true });
      show();
    }

    var btnDark = document.getElementById('btnDark');
    if (btnDark) {
      btnDark.addEventListener('click', function (e) {
        var cur = applyTheme();
        var next = cur === 'dark' ? 'light' : 'dark';
        var anim = (SITE_CFG.widgets && SITE_CFG.widgets.themeAnim) || 'ripple';
        /* 圆形扩散动画：以点击位置为圆心，从 0 扩散覆盖全屏 */
        if (anim === 'ripple') {
          var x = (e && e.clientX != null) ? e.clientX : window.innerWidth / 2;
          var y = (e && e.clientY != null) ? e.clientY : window.innerHeight / 2;
          var r = Math.hypot(
            Math.max(x, window.innerWidth - x),
            Math.max(y, window.innerHeight - y)
          );
          try {
            localStorage.setItem(THEME_KEY, next);
          } catch (err) {}
          applyTheme(next);
          var ov = document.createElement('div');
          ov.className = 'theme-ripple';
          ov.style.clipPath = 'circle(0px at ' + x + 'px ' + y + 'px)';
          document.body.appendChild(ov);
          /* 先应用新主题再取背景色，overlay 呈现新主题背景 */
          ov.style.background = getComputedStyle(document.documentElement)
            .getPropertyValue('--bg').trim() || (next === 'dark' ? '#12161b' : '#faf9f6');
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              ov.style.clipPath = 'circle(' + r + 'px at ' + x + 'px ' + y + 'px)';
            });
          });
          setTimeout(function () {
            ov.remove();
          }, 700);
        } else {
          try {
            localStorage.setItem(THEME_KEY, next);
          } catch (err) {}
          applyTheme(next);
        }
      });
    }
  }

  /* ----------------------------------------------------------
   * 滚动入场动画：元素添加 .reveal 类后，进入视口时淡入上滑
   * 动画速度由后台「动画」分类的 speed 控制
   * 管理后台不启用（后台实时预览区不参与入场动画）
   * 动态扫描：文章列表等异步渲染后新出现的 .reveal 元素
   * 也会被纳入观察，避免卡片永久透明不可见
   * -------------------------------------------------------- */
  function initScrollReveal() {
    if (document.querySelector('.admin-nav')) {
      return;
    }
    var w = SITE_CFG.widgets || {};
    if (!w.scrollReveal) {
      return;
    }
    var speedMap = { slow: 900, normal: 500, fast: 260 };
    var duration = speedMap[(SITE_CFG.animation && SITE_CFG.animation.speed) || 'normal'] || 500;
    var style = document.createElement('style');
    style.textContent = '.reveal{opacity:0;transform:translateY(22px);' +
      'transition:opacity ' + duration + 'ms ease,transform ' + duration + 'ms ease;}' +
      '.reveal.revealed{opacity:1;transform:none;}';
    document.head.appendChild(style);

    if (!('IntersectionObserver' in window)) {
      /* 不支持观察器的环境：直接全部显示，避免内容不可见 */
      var all = document.querySelectorAll('.reveal');
      all.forEach(function (el) { el.classList.add('revealed'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('revealed');
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.06, rootMargin: '0px 0px -30px 0px' });

    function scan() {
      var els = document.querySelectorAll('.reveal:not(.revealed)');
      els.forEach(function (el) {
        if (!el.__revealObserved) {
          el.__revealObserved = true;
          io.observe(el);
        }
      });
    }
    scan();
    /* 监听 DOM 变化：异步渲染（文章列表、搜索过滤等）后自动观察新卡片 */
    if ('MutationObserver' in window) {
      var mo = new MutationObserver(function () {
        scan();
      });
      mo.observe(document.body, { childList: true, subtree: true });
    }
  }

  /* ----------------------------------------------------------
   * 粒子背景（原生 Canvas 自绘，不依赖任何 CDN）
   * 两种预设：default 连线粒子 / snow 雪花飘落
   * 后台「动画管理」可开关
   * -------------------------------------------------------- */
  function initParticles() {
    if (document.querySelector('.admin-nav')) {
      return;                  /* 后台管理页不渲染粒子 */
    }
    var w = SITE_CFG.widgets || {};
    if (!w.particles) {
      return;
    }
    var cv = document.createElement('canvas');
    cv.id = 'particles-bg';
    document.body.insertBefore(cv, document.body.firstChild);
    var ctx = cv.getContext('2d');
    var dpr = window.devicePixelRatio || 1;

    function resize() {
      cv.width = Math.round(window.innerWidth * dpr);
      cv.height = Math.round(window.innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    var isSnow = w.particlesPreset === 'snow';
    var accent = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent').trim() || '#0f766e';
    var N = isSnow ? 70 : 48;
    var pts = [];
    for (var i = 0; i < N; i++) {
      pts.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.5,
        vy: isSnow ? (0.5 + Math.random() * 1.1) : (Math.random() - 0.5) * 0.35,
        r: isSnow ? (1 + Math.random() * 2.2) : (1.1 + Math.random() * 1.7),
        tw: Math.random() * Math.PI * 2
      });
    }

    function tick() {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      var ww = window.innerWidth, wh = window.innerHeight;
      pts.forEach(function (p) {
        p.x += p.vx;
        p.y += p.vy;
        p.tw += 0.02;
        if (p.x < -10) { p.x = ww + 10; }
        if (p.x > ww + 10) { p.x = -10; }
        if (p.y < -10) { p.y = wh + 10; }
        if (p.y > wh + 10) { p.y = -10; }
        if (isSnow) {
          /* 雪花：白色半透明，左右轻微摆动 */
          ctx.globalAlpha = 0.55 + Math.sin(p.tw) * 0.2;
          ctx.fillStyle = '#ffffff';
        } else {
          /* 连线粒子：主色，轻微呼吸透明度 */
          ctx.globalAlpha = 0.35 + Math.sin(p.tw) * 0.12;
          ctx.fillStyle = accent;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });
      /* 连线粒子：距离近的粒子之间画细线 */
      if (!isSnow) {
        ctx.lineWidth = 1;
        var i, j, dx, dy, d2;
        for (i = 0; i < pts.length; i++) {
          for (j = i + 1; j < pts.length; j++) {
            dx = pts[i].x - pts[j].x;
            dy = pts[i].y - pts[j].y;
            d2 = dx * dx + dy * dy;
            if (d2 < 16900) {           /* 130px 内连线 */
              ctx.globalAlpha = 0.24 * (1 - Math.sqrt(d2) / 130);
              ctx.strokeStyle = accent;
              ctx.beginPath();
              ctx.moveTo(pts[i].x, pts[i].y);
              ctx.lineTo(pts[j].x, pts[j].y);
              ctx.stroke();
            }
          }
        }
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(tick);
    }
    tick();
  }

  /* ----------------------------------------------------------
   * 打字机效果（Typed.js，CDN 按需加载）
   * -------------------------------------------------------- */
  function initTyping() {
    var w = SITE_CFG.widgets || {};
    if (!w.typing) {
      return;
    }
    var el = document.getElementById('typedTarget');
    if (!el) {
      return;
    }
    /* 打字机文案来源：后台「个人介绍（打字机）」；为空时兜底站点简介 */
    var texts = [];
    if (w.typingText && w.typingText.length) {
      texts = w.typingText;
    } else if (SITE_CFG.profile && SITE_CFG.profile.intro) {
      texts = String(SITE_CFG.profile.intro).split(';')
        .map(function (t) { return t.trim(); })
        .filter(Boolean);
    }
    if (!texts.length) {
      texts = ['欢迎来到 Jiumo_Page'];
    }
    var start = function () {
      if (!window.Typed) {
        return;
      }
      new window.Typed('#typedTarget', {
        strings: texts,
        typeSpeed: 70,
        backSpeed: 35,
        backDelay: 1500,
        startDelay: 400,
        loop: true,
        showCursor: true
      });
    };
    if (window.Typed) {
      start();
    } else {
      loadScript(
        'https://cdn.jsdelivr.net/npm/typed.js@2.1.0/dist/typed.umd.min.js',
        start
      );
    }
  }

  /* ----------------------------------------------------------
   * 顶部阅读进度条：页面滚动时显示阅读位置
   * 后台不启用（后台是固定布局，无需进度条）
   * -------------------------------------------------------- */
  function initProgressBar() {
    if (document.querySelector('.admin-nav')) {
      return;
    }
    var w = SITE_CFG.widgets || {};
    if (!w.progressBar) {
      return;
    }
    var bar = document.getElementById('readingProgress');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'readingProgress';
      document.body.appendChild(bar);
    }
    var update = function () {
      var doc = document.documentElement;
      var total = doc.scrollHeight - window.innerHeight;
      var pct = total > 0 ? (window.scrollY / total) * 100 : 0;
      bar.style.width = pct.toFixed(2) + '%';
    };
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    update();
  }

  /* ----------------------------------------------------------
   * 鼠标轨迹特效：鼠标移动时带出主色流光粒子拖尾
   * 后台「动画管理」可开关；触屏设备自动跳过
   * -------------------------------------------------------- */
  function initMouseTrail() {
    if (document.querySelector('.admin-nav')) {
      return;
    }
    var w = SITE_CFG.widgets || {};
    if (!w.mouseTrail || !window.matchMedia('(pointer: fine)').matches) {
      return;
    }
    var cv = document.createElement('canvas');
    cv.id = 'mouseTrail';
    document.body.appendChild(cv);
    var ctx = cv.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    function resize() {
      cv.width = Math.round(window.innerWidth * dpr);
      cv.height = Math.round(window.innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    var accent = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent').trim() || '#0f766e';
    var particles = [];
    var raf = null;
    var alive = true;

    /* 鼠标停止移动 2.5 秒后自动停止绘制（避免空白空转） */
    var stopTimer = null;
    function markMoving() {
      if (stopTimer) {
        clearTimeout(stopTimer);
      }
      stopTimer = setTimeout(function () { alive = false; }, 2500);
    }

    window.addEventListener('mousemove', function (e) {
      if (particles.length > 260) {
        return;
      }
      alive = true;
      markMoving();
      /* 每帧生成 4 个粒子：寿命更长、飘散范围更大，形成连续拖尾 */
      for (var i = 0; i < 4; i++) {
        particles.push({
          x: e.clientX + (Math.random() - 0.5) * 8,
          y: e.clientY + (Math.random() - 0.5) * 8,
          vx: (Math.random() - 0.5) * 1.8,
          vy: (Math.random() - 0.5) * 1.8 - 0.45,
          life: 1,
          size: 2 + Math.random() * 3.5,
          alpha: 0.5 + Math.random() * 0.4
        });
      }
    }, { passive: true });

    function tick() {
      if (!alive) {
        particles = [];
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        return;
      }
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      particles = particles.filter(function (p) { return p.life > 0; });
      particles.forEach(function (p) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.02;
        p.life -= 0.007;    /* 约 2.5 秒寿命，拖尾持续明显 */
        ctx.globalAlpha = p.life * p.alpha;
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(tick);
    }
    tick();
  }

  /* ----------------------------------------------------------
   * 节日主题自动切换：当天是节日时自动换主色调 + 顶部漂浮装饰
   * 后台「动画管理」可开关；平时不打扰
   * -------------------------------------------------------- */
  function initFestivalTheme() {
    if (document.querySelector('.admin-nav')) {
      return;
    }
    var w = SITE_CFG.widgets || {};
    if (w.festivalTheme === false) {
      return;
    }
    var now = new Date();
    var y = now.getFullYear();
    var md = pad2(now.getMonth() + 1) + '-' + pad2(now.getDate());
    function pad2(n) { return n < 10 ? '0' + n : String(n); }
    function inRange(from, to) { return md >= from && md <= to; }
    /* 日期字符串（MM-DD）偏移 N 天，跨月时用日期对象换算 */
    function shiftMd(base, n) {
      var ym = 2000, mm = parseInt(base.slice(0, 2), 10) - 1, dd = parseInt(base.slice(2), 10);
      var d = new Date(ym, mm, dd + n);
      return pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    }

    /* 农历节日用年份映射表（公历日期），其余按公历区间 */
    var FESTIVALS = [
      { name: '国庆', deco: '🎆', accent: '#dc2626',
        test: function () { return inRange('10-01', '10-07'); } },
      { name: '中秋', deco: '🌕', accent: '#8b5cf6',
        dates: { 2025: '10-06', 2026: '09-25', 2027: '09-15', 2028: '10-03', 2029: '09-22', 2030: '09-12', 2031: '10-01', 2032: '09-19' }, span: 3 },
      { name: '元旦', deco: '🎆', accent: '#ef4444',
        test: function () { return inRange('12-30', '01-03'); } },
      { name: '春节', deco: '🏮', accent: '#dc2626',
        dates: { 2025: '01-29', 2026: '02-17', 2027: '02-06', 2028: '01-26', 2029: '02-13', 2030: '02-03', 2031: '01-23', 2032: '02-11' }, span: 3 },
      { name: '元宵', deco: '🏮', accent: '#f59e0b',
        dates: { 2025: '02-12', 2026: '03-04', 2027: '02-20', 2028: '02-09', 2029: '02-28', 2030: '02-17', 2031: '02-05', 2032: '02-24' }, span: 2 },
      { name: '情人节', deco: '💗', accent: '#ec4899',
        test: function () { return inRange('02-13', '02-15'); } },
      { name: '圣诞', deco: '🎄', accent: '#16a34a',
        test: function () { return inRange('12-20', '12-27'); } },
      { name: '万圣节', deco: '🎃', accent: '#ea580c',
        test: function () { return inRange('10-30', '11-01'); } }
    ];

    var hit = null;
    for (var i = 0; i < FESTIVALS.length; i++) {
      var f = FESTIVALS[i];
      if (f.test) {
        if (f.test()) { hit = f; break; }
      } else {
        var base = f.dates && f.dates[y];
        if (base) {
          var from = shiftMd(base, -f.span);
          var to = shiftMd(base, f.span);
          if (md >= from && md <= to) { hit = f; break; }
        }
      }
    }
    if (!hit) {
      return;
    }
    /* 节日主色覆盖站点主题色（仅当天生效） */
    document.documentElement.style.setProperty('--accent', hit.accent);

    /* 顶部漂浮装饰（随机位置，不跟随滚动） */
    if (document.querySelector('.fest-deco')) {
      return;
    }
    var decos = hit.deco;
    var count = 8;
    var chars = decos.split(' ');
    for (var k = 0; k < count; k++) {
      var el = document.createElement('span');
      el.className = 'fest-deco';
      el.textContent = chars[k % chars.length];
      el.style.left = (2 + Math.random() * 92) + '%';
      el.style.top = (6 + Math.random() * 80) + '%';
      el.style.fontSize = (20 + Math.random() * 22) + 'px';
      el.style.animationDelay = (Math.random() * 4) + 's';
      el.style.animationDuration = (5 + Math.random() * 4) + 's';
      document.body.appendChild(el);
    }
  }

  /* ----------------------------------------------------------
   * 统一入口：页面加载完 site-config 后调用
   * -------------------------------------------------------- */
  window.initJiumoUI = function () {
    initCornerButtons();
    initScrollReveal();
    initParticles();
    initTyping();
    initProgressBar();
    initMouseTrail();
    initFestivalTheme();
  };
})();
