/* ============================================================
 * Jiumo_blog 前台逻辑：首页文章列表 / 文章详情
 * ============================================================ */
(function () {
  var cfg = getConfig();

  /* 填充站点头部 */
  var titleEl = document.getElementById('siteTitle');
  var descEl = document.getElementById('siteDesc');
  if (titleEl) {
    titleEl.textContent = cfg.siteTitle;
  }
  if (descEl) {
    descEl.textContent = cfg.siteDesc;
  }

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
  var listEl = document.getElementById('postList');
  var searchEl = document.getElementById('searchBox');

  if (listEl) {
    document.title = cfg.siteTitle;
    var allPosts = [];

    function renderList(posts) {
      if (!posts.length) {
        listEl.innerHTML =
          '<div class="state-box">没有匹配的文章。可去 <a href="admin/">管理后台</a> 发布第一篇。</div>';
        return;
      }
      listEl.innerHTML = posts.map(function (p) {
        var meta = p.meta;
        var summary = meta.summary || makeSummary(meta.body);
        return '<a class="post-card" href="post.html?f=' +
          encodeURIComponent(p.file.name) + '">' +
          '<h2>' + escapeHtml(meta.title || p.file.name) + '</h2>' +
          '<div class="post-meta"><span>' + escapeHtml(meta.date || '') +
          '</span> ' + tagsHtml(meta.tags) + '</div>' +
          (summary ? '<p class="post-summary">' + escapeHtml(summary) + '</p>' : '') +
          '</a>';
      }).join('');
    }

    function filterPosts(kw) {
      kw = kw.trim().toLowerCase();
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
      allPosts = posts.filter(Boolean).sort(function (a, b) {
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
      listEl.innerHTML = '<div class="state-box error">' + escapeHtml(tip) + '</div>';
    });

    searchEl.addEventListener('input', function () {
      renderList(filterPosts(searchEl.value));
    });
  }

  /* ----------------------------------------------------------
   * 详情页：渲染单篇文章
   * -------------------------------------------------------- */
  var box = document.getElementById('postContainer');

  if (box) {
    var file = getFileParam();
    if (!file) {
      box.innerHTML = '<div class="state-box error">缺少文章参数，请从<a href="index.html">文章列表</a>进入。</div>';
    } else {
      getPostRaw(file).then(function (raw) {
        var meta = parseFrontMatter(raw);
        box.innerHTML =
          '<article class="post-article">' +
          '<h1>' + escapeHtml(meta.title || file) + '</h1>' +
          '<div class="post-meta"><span>' + escapeHtml(meta.date || '') +
          '</span> ' + tagsHtml(meta.tags) + '</div>' +
          renderMarkdown(meta.body) +
          '</article>';
        var article = box.querySelector('.post-article');
        fixRelativeLinks(article, cfg.postsDir);
        document.title = (meta.title || file) + ' - ' + cfg.siteTitle;
      }).catch(function (err) {
        box.innerHTML = '<div class="state-box error">文章加载失败：' +
          escapeHtml(err.message) + '</div>';
      });
    }
  }
})();
