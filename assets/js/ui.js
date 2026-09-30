/* ============================================================
 * Jiumo_blog 前端交互模块
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
      btnDark.addEventListener('click', function () {
        var cur = applyTheme();
        var next = cur === 'dark' ? 'light' : 'dark';
        try {
          localStorage.setItem(THEME_KEY, next);
        } catch (e) {}
        applyTheme(next);
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
      window.tsParticles.load('particles-bg', opts);
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
    var texts = (w.typingText && w.typingText.length) ? w.typingText : ['欢迎来到 Jiumo_blog'];
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
   * 评论区：utterances（GitHub Issues）或 Gitalk（需 OAuth App）
   * 仅在文章详情页有 #commentBox 时生效
   * -------------------------------------------------------- */
  function initComment() {
    var box = document.getElementById('commentBox');
    if (!box) {
      return;
    }
    var w = SITE_CFG.widgets || {};
    var c = getConfig();
    var enabled = (w.utterances && w.utterances.enabled && w.utterances.repo) ||
      (w.gitalk && w.gitalk.enabled && w.gitalk.clientID);

    /* 已启用评论组件时，隐藏未启用提示 */
    var tip = box.querySelector('.comment-tip');
    if (tip) {
      tip.classList.toggle('hidden', !!enabled);
    }
    if (!enabled) {
      return;
    }

    if (w.utterances && w.utterances.enabled && w.utterances.repo) {
      var s = document.createElement('script');
      s.src = 'https://utteranc.es/client.js';
      s.setAttribute('repo', w.utterances.repo);
      s.setAttribute('issue-term', w.utterances.issueTerm || 'pathname');
      s.setAttribute('theme', w.utterances.theme || 'github-light');
      s.setAttribute('crossorigin', 'anonymous');
      s.async = true;
      box.appendChild(s);
      return;
    }

    if (w.gitalk && w.gitalk.enabled && w.gitalk.clientID) {
      var css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://cdn.jsdelivr.net/npm/gitalk@1.8.0/dist/gitalk.css';
      document.head.appendChild(css);
      loadScript('https://cdn.jsdelivr.net/npm/gitalk@1.8.0/dist/gitalk.min.js', function () {
        if (!window.Gitalk) {
          return;
        }
        var g = new window.Gitalk({
          clientID: w.gitalk.clientID,
          clientSecret: w.gitalk.clientSecret,
          repo: w.gitalk.repo || c.repo,
          owner: c.owner,
          admin: [c.owner],
          id: location.pathname,
          distractionFreeMode: false
        });
        g.render('commentBox');
      });
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
    initComment();
  };
})();
