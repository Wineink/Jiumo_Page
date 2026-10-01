/* ============================================================
 * Jiumo_Page 前台逻辑：首页文章列表 / 文章详情
 * 启动流程：加载 site-config.json -> 应用站点配置 -> 渲染内容 -> 启动交互模块
 * ============================================================ */
(function () {
  var cfg = getConfig();

  /* 取 URL 参数中的文件名，只保留最后一段并校验后缀 */
  function getFileParam() {
    var f = new URLSearchParams(location.search).get('f') || '';
    f = f.split('/').pop().split('\\').pop();
    return /\.md$/i.test(f) ? f : '';
  }

  function tagsHtml(tags) {
    return (tags || []).map(function (t) {
      return '<span class="tag">' + escapeHtml(t) + '</span>';
    }).join(' ');
  }

  /* 由正文生成简短摘要（无 summary 字段时兜底） */
  function makeSummary(body) {
    return String(body || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/[#>*`_~\-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 110);
  }

  /* ----------------------------------------------------------
   * 首页：文章列表
   * -------------------------------------------------------- */
  function renderHome() {
    var listEl = document.getElementById('postList');
    if (!listEl) {
      return;
    }
    var searchEl = document.getElementById('searchBox');
    document.title = (SITE_CFG.site && SITE_CFG.site.title) || cfg.siteTitle;
    var layout = SITE_CFG.layout || {};
    var showSearch = layout.showSearch !== false;
    var showSummary = layout.showSummary !== false;
    var pageSize = parseInt(layout.pageSize, 10) || 20;
    if (searchEl) {
      searchEl.classList.toggle('hidden', !showSearch);
    }
    var allPosts = [];
    var searchKw = '';

    /* 搜索词高亮：对文本中的关键词加 <mark>（先转义再替换，防 XSS） */
    function highlight(text, kw) {
      var safe = escapeHtml(String(text || ''));
      if (!kw) {
        return safe;
      }
      var esc = escapeHtml(kw.trim());
      if (!esc) {
        return safe;
      }
      var re = new RegExp('(' + esc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      return safe.replace(re, '<mark>$1</mark>');
    }

    function renderList(posts) {
      if (!posts.length) {
        listEl.innerHTML =
          '<div class="state-box">没有匹配的文章。可去 <a href="admin/">管理后台</a> 发布第一篇。</div>';
        return;
      }
      var shown = posts.slice(0, pageSize);
      listEl.innerHTML = shown.map(function (p, i) {
        var meta = p.meta;
        var summary = meta.summary || makeSummary(meta.body);
        return '<a class="post-card reveal" style="transition-delay:' +
          Math.min(i * 60, 360) + 'ms" href="post.html?f=' +
          encodeURIComponent(p.file.name) + '">' +
          '<h2>' + highlight(meta.title || p.file.name, searchKw) + '</h2>' +
          '<div class="post-meta"><span>' + escapeHtml(meta.date || '') +
          '</span> ' + tagsHtml(meta.tags) + '</div>' +
          (showSummary && summary ? '<p class="post-summary">' + highlight(summary, searchKw) + '</p>' : '') +
          '</a>';
      }).join('') +
        (posts.length > pageSize
          ? '<div class="state-box">共 ' + posts.length + ' 篇，仅显示前 ' + pageSize +
            ' 篇（可在后台「页面管理」调整）</div>'
          : '');
    }

    function filterPosts(kw) {
      kw = kw.trim().toLowerCase();
      searchKw = kw;
      if (!kw) {
        return allPosts;
      }
      return allPosts.filter(function (p) {
        var haystack = [
          p.meta.title,
          p.meta.tags.join(' '),
          p.meta.summary,
          p.meta.body
        ].join(' ').toLowerCase();
        return haystack.indexOf(kw) !== -1;
      });
    }

    listPostFiles().then(function (files) {
      return Promise.all(files.map(function (f) {
        return getPostRaw(f.name).then(function (raw) {
          return { file: f, meta: parseFrontMatter(raw) };
        }).catch(function () {
          return null;
        });
      }));
    }).then(function (posts) {
      allPosts = posts.filter(Boolean)
        /* 待发布文章（front matter draft: true）不出现在首页 */
        .filter(function (p) {
          return !(p.meta.draft === 'true' || p.meta.draft === true);
        })
        .sort(function (a, b) {
          var da = a.meta.date || a.file.name;
          var db = b.meta.date || b.file.name;
          return da < db ? 1 : da > db ? -1 : 0;
        });
      renderList(allPosts);
    }).catch(function (err) {
      var tip = '文章加载失败：' + err.message;
      if (cfg.owner === 'your-github-username') {
        tip = '尚未配置仓库：请打开 assets/js/config.js，把 owner 改成你的 GitHub 用户名';
      }
      listEl.innerHTML = '<div class="state-box error">' + escapeHtml(tip) +
        '<br><br><button class="btn btn-ghost btn-sm" onclick="location.reload()">重新加载</button></div>';
    });

    searchEl.addEventListener('input', function () {
      renderList(filterPosts(searchEl.value));
    });
  }

  /* ----------------------------------------------------------
   * 详情页：渲染单篇文章
   * -------------------------------------------------------- */
  function renderPost() {
    var box = document.getElementById('postContainer');
    if (!box) {
      return;
    }
    var file = getFileParam();
    if (!file) {
      box.innerHTML = '<div class="state-box error">缺少文章参数，请从<a href="index.html">文章列表</a>进入。</div>';
      return;
    }
    getPostRaw(file).then(function (raw) {
      var meta = parseFrontMatter(raw);
      /* 待发布文章不允许前台直接访问 */
      if (meta.draft === 'true' || meta.draft === true) {
        box.innerHTML = '<div class="state-box">这篇文章还没有发布，稍后再来看看吧。<br>' +
          '<small>发布入口：后台「文章管理」→ 对应文章 → 发布</small></div>';
        return;
      }
      box.innerHTML =
        '<article class="post-article reveal">' +
        '<h1>' + escapeHtml(meta.title || file) + '</h1>' +
        '<div class="post-meta"><span>' + escapeHtml(meta.date || '') +
        '</span> ' + tagsHtml(meta.tags) + '</div>' +
        renderMarkdown(meta.body) +
        '</article>';
      var article = box.querySelector('.post-article');
      fixRelativeLinks(article, cfg.postsDir);
      document.title = (meta.title || file) + ' - ' +
        ((SITE_CFG.site && SITE_CFG.site.title) || cfg.siteTitle);
      /* 通知阅读设置（reader.js）恢复上次阅读位置 */
      document.dispatchEvent(new CustomEvent('jiumo:postRendered'));
    }).catch(function (err) {
      box.innerHTML = '<div class="state-box error">文章加载失败：' +
        escapeHtml(err.message) + '</div>';
    });
  }

  /* ----------------------------------------------------------
   * 启动：先加载站点配置再渲染
   * -------------------------------------------------------- */
  loadSiteConfigFile().then(function (siteCfg) {
    applySiteConfig(siteCfg);
    renderHome();
    renderPost();
    /* 启动交互模块（右下角按钮/滚动动画/粒子/打字机/评论区） */
    if (window.initJiumoUI) {
      window.initJiumoUI();
    }
    /* 配置热更新：后台应用设置后前台自动生效，无需手动刷新 */
    if (window.startConfigWatch) {
      window.startConfigWatch();
    }
  });
})();
