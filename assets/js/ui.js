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
   * -------------------------------------------------------- */
  function initScrollReveal() {
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

    var targets = document.querySelectorAll('.reveal');
    if (!targets.length) {
      return;
    }
    if (!('IntersectionObserver' in window)) {
      targets.forEach(function (el) { el.classList.add('revealed'); });
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
    targets.forEach(function (el) { io.observe(el); });
  }

  /* ----------------------------------------------------------
   * 粒子背景（tsParticles，CDN 按需加载）
   * -------------------------------------------------------- */
  function initParticles() {
    var w = SITE_CFG.widgets || {};
    if (!w.particles) {
      return;
    }
    var box = document.getElementById('particles-bg');
    if (!box) {
      box = document.createElement('div');
      box.id = 'particles-bg';
      document.body.insertBefore(box, document.body.firstChild);
    }
    var start = function () {
      if (!window.tsParticles) {
        return;
      }
      var preset = w.particlesPreset === 'snow' ? 'snow' : 'default';
      var opts;
      if (preset === 'snow') {
        opts = {
          fpsLimit: 40,
          particles: {
            number: { value: 80 },
            color: { value: '#ffffff' },
            shape: { type: 'circle' },
            opacity: { value: 0.5 },
            size: { value: 3, random: true },
            move: { enable: true, speed: 1.2, direction: 'bottom', straight: true }
          },
          detectRetina: true
        };
      } else {
        opts = {
          fpsLimit: 40,
          particles: {
            number: { value: 45 },
            color: { value: '#0f766e' },
            links: { enable: true, distance: 130, color: '#0f766e', opacity: 0.25, width: 1 },
            move: { enable: true, speed: 0.8 },
            size: { value: 2.5, random: true },
            opacity: { value: 0.4 }
          },
          detectRetina: true
        };
      }
      /* tsparticles v4 的 load 接口为对象签名：{ id, options } */
      window.tsParticles.load({ id: 'particles-bg', options: opts })
        .catch(function (err) {
          console.error('粒子加载失败：', err);
        });
    };
    if (window.tsParticles) {
      start();
    } else {
      loadScript(
        'https://cdn.jsdelivr.net/npm/@tsparticles/slim@4/tsparticles.slim.bundle.min.js',
        start
      );
    }
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
   * 统一入口：页面加载完 site-config 后调用
   * -------------------------------------------------------- */
  window.initJiumoUI = function () {
    initCornerButtons();
    initScrollReveal();
    initParticles();
    initTyping();
  };
})();
