/* ============================================================
 * Jiumo_Page 管理后台逻辑
 * 左侧分类导航：文章管理 / 仓库管理 / 页面管理 / 主题 / 组件模块 / 动画管理
 * 设置暂存机制：所有面板可随意修改，最后点「应用所有设置」一次性保存
 * 退出时如有未保存修改会提示；侧栏模块支持启用、参数、排序
 * ============================================================ */
(function () {
  /* 视图容器 */
  var loginView = document.getElementById('loginView');
  var adminView = document.getElementById('adminView');
  var adminList = document.getElementById('adminList');
  var editorPanel = document.getElementById('editorPanel');
  var repoInfo = document.getElementById('repoInfo');
  var filenameBox = document.getElementById('filenameBox');
  var viewTitle = document.getElementById('viewTitle');

  /* 编辑器元素（日期固定为创建时间，不提供输入） */
  var editTitle = document.getElementById('editTitle');
  var editTags = document.getElementById('editTags');
  var editSummary = document.getElementById('editSummary');
  var editBody = document.getElementById('editBody');
  var editBodyWrap = document.getElementById('editBodyWrap');
  var editPreview = document.getElementById('editPreview');

  /* 视图名映射 */
  var VIEW_NAMES = {
    posts: '文章管理',
    drafts: '草稿箱',
    repo: '仓库管理',
    pages: '页面管理',
    theme: '主题',
    widgets: '组件模块',
    animation: '动画管理'
  };

  var state = {
    posts: [],
    isNew: false,
    editing: null,
    draftTimer: null,
    configSha: null,
    draft: null,          /* 当前编辑中的站点配置副本 */
    repoDraft: null,      /* 当前编辑中的仓库设置副本 */
    dirty: false,
    dirtyGroups: {}       /* 记录哪些分类有未保存修改 */
  };

  /* ----------------------------------------------------------
   * 登录 / 视图切换
   * -------------------------------------------------------- */
  function showLogin() {
    loginView.classList.remove('hidden');
    adminView.classList.add('hidden');
    document.body.classList.remove('admin-locked');
  }

  function showAdmin() {
    loginView.classList.add('hidden');
    adminView.classList.remove('hidden');
    document.body.classList.add('admin-locked');
  }

  function fillLoginForm() {
    var c = getConfig();
    document.getElementById('loginOwner').value =
      c.owner === 'your-github-username' ? '' : c.owner;
    document.getElementById('loginRepo').value = c.repo;
    document.getElementById('loginBranch').value = c.branch;
  }

  document.getElementById('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var s = {
      owner: document.getElementById('loginOwner').value.trim(),
      repo: document.getElementById('loginRepo').value.trim(),
      branch: document.getElementById('loginBranch').value.trim(),
      token: document.getElementById('loginToken').value.trim()
    };
    if (!s.owner || !s.repo || !s.branch || !s.token) {
      showToast('请填写完整信息', 'error');
      return;
    }
    var btn = document.getElementById('loginBtn');
    btn.disabled = true;
    btn.textContent = '验证中…';
    saveSettings(s);
    apiRequest('/user').then(function (user) {
      showToast('登录成功，欢迎 ' + user.login, 'success');
      enterApp(user);
    }).catch(function (err) {
      clearSettings();
      btn.disabled = false;
      btn.textContent = '登录并验证';
      showToast('验证失败：' + err.message, 'error');
    });
  });

  function enterWithToken() {
    showAdmin();
    apiRequest('/user').then(function (user) {
      enterApp(user);
    }).catch(function (err) {
      showLogin();
      fillLoginForm();
      showToast('登录已失效，请重新登录（' + err.message + '）', 'error');
    });
  }

  function enterApp(user) {
    showAdmin();
    var c = getConfig();
    repoInfo.textContent = c.owner + '/' + c.repo + ' · 分支 ' + c.branch + ' · ' + user.login;
    switchView('posts');
    loadPosts();
    loadDraft();
  }

  /* ----------------------------------------------------------
   * 左侧分类导航
   * -------------------------------------------------------- */
  var navItems = document.querySelectorAll('.admin-nav .nav-item[data-view]');
  navItems.forEach(function (btn) {
    btn.addEventListener('click', function () {
      switchView(btn.getAttribute('data-view'));
      /* 草稿箱视图：数据就绪则立即渲染，未加载先加载 */
      if (btn.getAttribute('data-view') === 'drafts') {
        if (!state.posts.length) {
          loadPosts();
        } else {
          renderDraftsList();
        }
      }
    });
  });

  function switchView(name) {
    navItems.forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-view') === name);
    });
    document.querySelectorAll('.view-pane').forEach(function (p) {
      p.classList.toggle('hidden', p.id !== 'view-' + name);
    });
    viewTitle.textContent = VIEW_NAMES[name] || name;
    /* 切换分类时内容区回到顶部，避免面板与顶栏错位/露出 */
    var scroller = document.querySelector('.admin-content');
    if (scroller) {
      scroller.scrollTop = 0;
    }
  }

  /* ----------------------------------------------------------
   * 文章列表
   * -------------------------------------------------------- */
  function loadPosts() {
    adminList.innerHTML =
      '<div class="state-box"><span class="spinner"></span>正在加载…</div>';
    listPostFiles().then(function (files) {
      return Promise.all(files.map(function (f) {
        return getPostRaw(f.name).then(function (raw) {
          return { name: f.name, sha: f.sha, meta: parseFrontMatter(raw) };
        }).catch(function () {
          return { name: f.name, sha: f.sha, meta: parseFrontMatter('') };
        });
      }));
    }).then(function (posts) {
      state.posts = posts.sort(function (a, b) {
        var da = a.meta.date || a.name;
        var db = b.meta.date || b.name;
        return da < db ? 1 : da > db ? -1 : 0;
      });
      renderAdminList();
    }).catch(function (err) {
      adminList.innerHTML =
        '<div class="state-box error">加载失败：' + escapeHtml(err.message) + '</div>';
    });
  }

  /* 单条文章卡片 HTML（文章管理 / 草稿箱共用），含字数统计 */
  function adminItemHtml(p) {
    var title = p.meta.title || p.name;
    var tags = p.meta.tags.map(function (t) {
      return '<span class="tag">' + escapeHtml(t) + '</span>';
    }).join(' ');
    var isDraft = p.meta.draft === 'true' || p.meta.draft === true;
    var badge = isDraft ?
      '<span class="badge badge-draft" title="待发布：不会显示在首页">待发布</span>' :
      '<span class="badge badge-pub" title="已发布：显示在首页">已发布</span>';
    var toggleBtn = isDraft ?
      '<button class="btn btn-primary btn-sm" data-action="publish" data-name="' +
        encodeURIComponent(p.name) + '">发布</button>' :
      '<button class="btn btn-ghost btn-sm" data-action="unpublish" data-name="' +
        encodeURIComponent(p.name) + '">撤回</button>';
    var words = String(p.meta.body || '').replace(/\s/g, '').length;
    return '<div class="admin-item">' +
      '<div class="item-main">' +
        '<div class="item-title">' + escapeHtml(title) + ' ' + badge + '</div>' +
        '<div class="item-sub">' + escapeHtml(p.meta.date || '') + ' ' +
          tags + ' · ' + escapeHtml(p.name) +
          '<span class="item-words"> · 约 ' + words + ' 字</span></div>' +
      '</div>' +
      '<div class="item-actions">' +
        toggleBtn +
        '<button class="btn btn-ghost btn-sm" data-action="history" data-name="' +
          encodeURIComponent(p.name) + '">历史</button>' +
        '<button class="btn btn-ghost btn-sm" data-action="edit" data-name="' +
          encodeURIComponent(p.name) + '">编辑</button>' +
        '<button class="btn btn-danger btn-sm" data-action="del" data-name="' +
          encodeURIComponent(p.name) + '">删除</button>' +
      '</div>' +
    '</div>';
  }

  function renderAdminList() {
    if (!state.posts.length) {
      adminList.innerHTML =
        '<div class="state-box">还没有文章，点击右上角「+ 新建文章」或「导入 MD」开始。</div>';
      return;
    }
    adminList.innerHTML = state.posts.map(adminItemHtml).join('');
  }

  /* 草稿箱：仅显示待发布（draft: true）的文章 */
  function renderDraftsList() {
    var draftsEl = document.getElementById('draftsList');
    if (!draftsEl) {
      return;
    }
    var drafts = state.posts.filter(function (p) {
      return p.meta.draft === 'true' || p.meta.draft === true;
    });
    if (!drafts.length) {
      draftsEl.innerHTML =
        '<div class="state-box">草稿箱是空的。文章管理中点「撤回」可把已发布文章转为待发布；新建文章点「保存」即为草稿。</div>';
      return;
    }
    draftsEl.innerHTML = drafts.map(adminItemHtml).join('');
  }

  /* 文章列表与草稿箱列表共用的操作事件 */
  function onItemAction(e) {
    var btn = e.target.closest('button[data-action]');
    if (!btn) {
      return;
    }
    var name = decodeURIComponent(btn.getAttribute('data-name'));
    var action = btn.getAttribute('data-action');
    if (action === 'edit') {
      openEditor(name);
    } else if (action === 'del') {
      confirmDelete(name);
    } else if (action === 'publish') {
      toggleDraft(name, false);
    } else if (action === 'unpublish') {
      toggleDraft(name, true);
    } else if (action === 'history') {
      showHistory(name);
    }
  }

  adminList.addEventListener('click', onItemAction);
  var draftsList = document.getElementById('draftsList');
  if (draftsList) {
    draftsList.addEventListener('click', onItemAction);
  }

  /* ----------------------------------------------------------
   * 文章修改历史：通过 GitHub commits API 拉取该文件的提交记录
   * 每次提交可展开查看变更内容（diff patch）
   * -------------------------------------------------------- */
  function showHistory(name) {
    var mask = document.getElementById('historyMask');
    var box = document.getElementById('historyBody');
    var title = document.getElementById('historyTitle');
    if (!mask || !box) {
      return;
    }
    title.textContent = '《' + (escapeHtml(name) || name) + '》的修改历史';
    box.innerHTML = '<div class="state-box"><span class="spinner"></span>正在加载提交记录…</div>';
    mask.classList.remove('hidden');
    var c = getConfig();
    var q = 'path=' + encodeURIComponent(c.postsDir + '/' + name) +
      '&per_page=50&sha=' + encodeURIComponent(c.branch);
    apiRequest('/repos/' + c.owner + '/' + c.repo + '/commits?' + q)
      .then(function (list) {
        if (!list || !list.length) {
          box.innerHTML = '<div class="state-box">没有找到该文章的提交记录。</div>';
          return;
        }
        box.innerHTML = list.map(function (cm) {
          var msg = (cm.commit && cm.commit.message) || '更新';
          var date = (cm.commit && cm.commit.author && cm.commit.author.date) || '';
          var short = (cm.sha || '').slice(0, 7);
          return '<div class="hist-item" data-sha="' + cm.sha + '">' +
            '<div class="hist-head">' +
              '<span class="hist-msg">' + escapeHtml(msg) + '</span>' +
              '<span class="hist-meta">' + escapeHtml(short) + ' · ' +
                escapeHtml(formatHistDate(date)) + '</span>' +
            '</div>' +
            '<div class="hist-diff hidden"></div>' +
          '</div>';
        }).join('');
      })
      .catch(function (err) {
        box.innerHTML = '<div class="state-box error">加载失败：' +
          escapeHtml(err.message) + '</div>';
      });
  }

  function formatHistDate(s) {
    if (!s) {
      return '';
    }
    var d = new Date(s);
    if (isNaN(d.getTime())) {
      return s;
    }
    function p(n) {
      return n < 10 ? '0' + n : '' + n;
    }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* 点击某条提交 → 拉取该 commit 的文件 diff 展开显示 */
  document.getElementById('historyBody').addEventListener('click', function (e) {
    var item = e.target.closest('.hist-item');
    if (!item) {
      return;
    }
    var diffEl = item.querySelector('.hist-diff');
    if (diffEl.classList.contains('hidden')) {
      diffEl.classList.remove('hidden');
      diffEl.innerHTML = '<div class="state-box"><span class="spinner"></span>加载变更内容…</div>';
      var c = getConfig();
      apiRequest('/repos/' + c.owner + '/' + c.repo + '/commits/' + item.getAttribute('data-sha'))
        .then(function (data) {
          var files = data.files || [];
          if (!files.length) {
            diffEl.innerHTML = '<div class="state-box">该提交没有文件变更。</div>';
            return;
          }
          diffEl.innerHTML = files.map(function (f) {
            var patch = f.patch || '';
            var statusTxt = f.status === 'added' ? '新增' :
              (f.status === 'removed' ? '删除' : (f.status === 'renamed' ? '重命名' : '修改'));
            var head = '<div class="diff-file">' +
              '<span class="diff-status">' + statusTxt + '</span> ' +
              escapeHtml(f.filename) + (f.additions != null ?
                ' <span class="diff-num">+' + f.additions + ' -' + f.deletions + '</span>' : '') +
              '</div>';
            if (!patch) {
              return head + '<div class="diff-body"><span class="state-box">（无文本差异）</span></div>';
            }
            return head + '<pre class="diff-body">' + escapeHtml(patch) + '</pre>';
          }).join('');
        })
        .catch(function (err) {
          diffEl.innerHTML = '<div class="state-box error">加载失败：' +
            escapeHtml(err.message) + '</div>';
        });
    } else {
      diffEl.classList.add('hidden');
    }
  });

  document.getElementById('historyClose').addEventListener('click', function () {
    document.getElementById('historyMask').classList.add('hidden');
  });
  document.getElementById('historyMask').addEventListener('click', function (e) {
    if (e.target === this) {
      this.classList.add('hidden');
    }
  });

  /* 发布 / 撤回：修改文章 front matter 的 draft 字段并提交仓库 */
  function toggleDraft(name, toDraft) {
    var p = findPost(name);
    var title = (p && p.meta.title) || name;
    var actionText = toDraft ? '撤回《' + title + '》为待发布？\n撤回后文章将不再显示在首页。' :
      '发布《' + title + '》？\n发布后首页 1 分钟内可见。';
    if (!window.confirm(actionText)) {
      return;
    }
    getPostMeta(name).then(function (meta) {
      var fm = parseFrontMatter(base64ToUtf8(meta.content));
      fm.draft = toDraft;
      var full = buildFrontMatter(fm) + fm.body;
      return savePost(name, full, meta.sha,
        toDraft ? '撤回文章（待发布）：' + name : '发布文章：' + name);
    }).then(function () {
      showToast(toDraft ? '已撤回为待发布，首页不再显示' : '已发布，首页 1 分钟内可见', 'success');
      loadPosts();
    }).catch(function (err) {
      showToast('操作失败：' + err.message, 'error');
    });
  }

  function findPost(name) {
    for (var i = 0; i < state.posts.length; i++) {
      if (state.posts[i].name === name) {
        return state.posts[i];
      }
    }
    return null;
  }

  function confirmDelete(name) {
    var p = findPost(name);
    var title = (p && p.meta.title) || name;
    if (!window.confirm('确定删除《' + title + '》吗？\n删除会立即提交到 GitHub 仓库，后台无法恢复。')) {
      return;
    }
    getPostMeta(name).then(function (meta) {
      return removePost(name, meta.sha);
    }).then(function () {
      showToast('已删除：' + title, 'success');
      loadPosts();
    }).catch(function (err) {
      showToast('删除失败：' + err.message, 'error');
    });
  }

  /* ----------------------------------------------------------
   * 导入 MD 文章（单个或批量，导入后一律为待发布状态）
   * -------------------------------------------------------- */
  var importInput = document.getElementById('importInput');
  var btnImport = document.getElementById('btnImport');
  if (btnImport && importInput) {
    btnImport.addEventListener('click', function () {
      importInput.click();
    });
    importInput.addEventListener('change', function () {
      var files = Array.prototype.slice.call(importInput.files || []);
      if (!files.length) {
        return;
      }
      importInput.value = '';
      var btn = btnImport;
      btn.disabled = true;
      btn.textContent = '导入中…（' + files.length + ' 篇）';
      var queue = files.map(function (f) { return importMdFile(f); });
      Promise.all(queue).then(function (results) {
        var ok = results.filter(Boolean).length;
        btn.disabled = false;
        btn.textContent = '导入 MD';
        showToast('导入完成：成功 ' + ok + ' 篇' + (files.length - ok ? '，失败 ' + (files.length - ok) + ' 篇' : '') +
          '，均为待发布状态，可在列表中确认后再发布', ok ? 'success' : 'error');
        loadPosts();
      });
    });
  }

  /* 读取本地 .md 文件 → 解析 front matter → 提交为 draft: true（待发布） */
  function importMdFile(file) {
    return new Promise(function (resolve) {
      var reader = new FileReader();
      reader.onload = function () {
        var raw = String(reader.result || '');
        var meta = parseFrontMatter(raw);
        var nameBase = file.name.replace(/\.md$/i, '').replace(/^\d{4}-\d{2}-\d{2}-/, '');
        if (!meta.title) {
          meta.title = nameBase || '未命名文章';
        }
        if (!meta.date) {
          var m = /^(\d{4}-\d{2}-\d{2})/.exec(file.name);
          meta.date = m ? m[1] : todayStr();
        }
        if (!meta.tags) {
          meta.tags = [];
        }
        meta.draft = true;
        var filename = buildFilename(meta.title, meta.date);
        /* 同名处理：若已存在则追加 -2、-3… */
        var base = filename;
        var i = 2;
        while (state.posts.some(function (p) { return p.name === filename; })) {
          filename = base.replace(/\.md$/, '') + '-' + i + '.md';
          i++;
        }
        var full = buildFrontMatter(meta) + meta.body;
        savePost(filename, full, null, '导入文章（待发布）：' + filename).then(function () {
          resolve(true);
        }).catch(function () {
          resolve(false);
        });
      };
      reader.onerror = function () { resolve(false); };
      reader.readAsText(file, 'utf-8');
    });
  }

  /* ----------------------------------------------------------
   * 编辑器（日期固定为创建时间，不在表单中修改）
   * -------------------------------------------------------- */
  function collectForm() {
    return {
      title: editTitle.value,
      tags: editTags.value,
      summary: editSummary.value,
      body: editBody.value
    };
  }

  function resetEditor() {
    editTitle.value = '';
    editTags.value = '';
    editSummary.value = '';
    editBody.value = '';
    editPreview.innerHTML = '';
    if (document.getElementById('editDateHint')) {
      document.getElementById('editDateHint').textContent = '';
    }
    switchEditTab('edit');
  }

  document.getElementById('btnNew').addEventListener('click', function () {
    state.isNew = true;
    state.editing = null;
    sessionUploaded = {};      /* 新文章：重置会话图片记录 */
    resetEditor();
    filenameBox.textContent = '新文章，保存时自动生成文件名：' + todayStr() + '-标题.md';
    editorPanel.classList.remove('hidden');
    tryRestoreDraft();
    editTitle.focus();
  });

  function openEditor(name) {
    /* 从草稿箱点「编辑」时切回文章管理视图（编辑器在文章管理视图内） */
    switchView('posts');
    sessionUploaded = {};      /* 打开文章：重置会话图片记录（只清理本文章上传的图） */
    getPostMeta(name).then(function (data) {
      var meta = parseFrontMatter(base64ToUtf8(data.content));
      state.isNew = false;
      state.editing = { name: name, sha: data.sha, date: meta.date || name.slice(0, 10) };
      editTitle.value = meta.title || '';
      editTags.value = meta.tags.join(', ');
      editSummary.value = meta.summary || '';
      editBody.value = meta.body || '';
      var hint = document.getElementById('editDateHint');
      if (hint) {
        hint.textContent = '创建时间：' + state.editing.date + '（不可修改）';
      }
      filenameBox.textContent = '文件名：' + name + '（编辑时保持不变）';
      switchEditTab('edit');
      editorPanel.classList.remove('hidden');
    }).catch(function (err) {
      showToast('文章读取失败：' + err.message, 'error');
    });
  }

  function switchEditTab(which) {
    var isEdit = which === 'edit';
    document.getElementById('tabEdit').classList.toggle('active', isEdit);
    document.getElementById('tabPreview').classList.toggle('active', !isEdit);
    editBodyWrap.classList.toggle('hidden', !isEdit);
    editPreview.classList.toggle('hidden', isEdit);
    if (!isEdit) {
      var d = state.isNew ? todayStr() : (state.editing && state.editing.date) || '';
      editPreview.innerHTML =
        '<h1>' + escapeHtml(editTitle.value || '无标题') + '</h1>' +
        '<div class="post-meta"><span>' + escapeHtml(d) + '</span></div>' +
        renderMarkdown(editBody.value);
      fixRelativeLinks(editPreview, getConfig().postsDir);
    }
  }

  document.getElementById('tabEdit').addEventListener('click', function () {
    switchEditTab('edit');
  });
  document.getElementById('tabPreview').addEventListener('click', function () {
    switchEditTab('preview');
  });

  /* ----------------------------------------------------------
   * 编辑器粘贴/拖拽图片：自动上传到仓库 assets/img/ 并插入 markdown
   * 上传成功后光标位置插入 ![图片](URL)，预览/保存后文章内即可显示
   * -------------------------------------------------------- */
  var MAX_IMG_SIZE = 5 * 1024 * 1024;   /* 单张 5MB 上限 */

  /* 本会话（当前编辑文章）上传过的图片：保存时若正文不再引用则从仓库删除 */
  var sessionUploaded = {};             /* url -> 仓库内路径 assets/img/xx.png */

  function uploadImageFile(file, done) {
    if (!file || file.type.indexOf('image/') !== 0) {
      return done(false);
    }
    if (file.size > MAX_IMG_SIZE) {
      showToast('图片超过 5MB，请压缩后再粘贴', 'error');
      return done(false);
    }
    var reader = new FileReader();
    reader.onload = function () {
      var base64 = String(reader.result);            /* data:image/png;base64,... */
      var ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg').toLowerCase();
      var name = 'img-' + Date.now() + '-' +
        Math.random().toString(36).slice(2, 7) + '.' + ext;
      var c = getConfig();
      var path = 'assets/img/' + name;
      apiRequest('/repos/' + c.owner + '/' + c.repo +
        '/contents/' + encodeURIComponent(path), {
          method: 'PUT',
          body: JSON.stringify({
            message: '上传图片 ' + name,
            content: base64.split(',')[1],
            branch: c.branch
          })
        }).then(function () {
          /* 图片 URL 用 GitHub Pages 同源地址（owner.github.io/repo/assets/img/xx） */
          var url = 'https://' + (c.owner || '').toLowerCase() + '.github.io/' +
            (c.repo || '') + '/assets/img/' + name;
          sessionUploaded[url] = path;
          done(url);
        }).catch(function (err) {
          showToast('图片上传失败：' + err.message, 'error');
          done(false);
        });
    };
    reader.onerror = function () {
      showToast('图片读取失败', 'error');
      done(false);
    };
    reader.readAsDataURL(file);
  }

  function insertAtCursor(textarea, text) {
    var start = textarea.selectionStart;
    var end = textarea.selectionEnd;
    textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
    textarea.focus();
  }

  /* 提取正文中的全部图片引用 URL */
  function parseImgRefs(text) {
    var re = /!\[[^\]]*\]\(([^)]+)\)/g;
    var urls = [];
    var m;
    while ((m = re.exec(text || '')) !== null) {
      urls.push(m[1].trim());
    }
    return urls;
  }

  /* 删除仓库内一个文件（先取 sha 再 DELETE） */
  function deleteRepoFile(path) {
    var c = getConfig();
    var api = '/repos/' + c.owner + '/' + c.repo + '/contents/' + encodeURIComponent(path);
    return apiRequest(api).then(function (m) {
      return apiRequest(api, {
        method: 'DELETE',
        body: JSON.stringify({
          message: '删除图片 ' + path.split('/').pop(),
          sha: m.sha,
          branch: c.branch
        })
      });
    });
  }

  /* 保存后清理：本会话上传但正文已不再引用的图片，从仓库同步删除 */
  function cleanupUnusedImages(bodyText) {
    var urls = Object.keys(sessionUploaded);
    if (!urls.length) {
      return Promise.resolve();
    }
    var refs = parseImgRefs(bodyText);
    var unused = urls.filter(function (u) {
      return refs.indexOf(u) === -1;
    });
    if (!unused.length) {
      return Promise.resolve();
    }
    return Promise.all(unused.map(function (u) {
      var path = sessionUploaded[u];
      return deleteRepoFile(path).then(function () {
        delete sessionUploaded[u];
        return true;
      }).catch(function () {
        return false;
      });
    })).then(function (results) {
      var ok = results.filter(Boolean).length;
      if (ok) {
        showToast('已同步清理 ' + ok + ' 张不再引用的图片（仓库已删除）', 'success');
      }
    });
  }

  editBody.addEventListener('paste', function (e) {
    var items = (e.clipboardData || {}).items;
    if (!items) {
      return;
    }
    var imgItem = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf('image/') === 0) {
        imgItem = items[i];
        break;
      }
    }
    if (!imgItem) {
      return;
    }
    var file = imgItem.getAsFile();
    if (!file) {
      return;
    }
    e.preventDefault();
    uploadImageFile(file, function (url) {
      if (url) {
        insertAtCursor(editBody, '![图片](' + url + ')\n');
        showToast('图片已上传并插入文章', 'success');
      }
    });
  });

  editBody.addEventListener('drop', function (e) {
    var files = (e.dataTransfer || {}).files;
    if (!files || !files.length) {
      return;
    }
    var imgFiles = Array.prototype.filter.call(files, function (f) {
      return f.type.indexOf('image/') === 0;
    });
    if (!imgFiles.length) {
      return;
    }
    e.preventDefault();
    imgFiles.forEach(function (file) {
      uploadImageFile(file, function (url) {
        if (url) {
          insertAtCursor(editBody, '![图片](' + url + ')\n');
          showToast('图片已上传并插入文章', 'success');
        }
      });
    });
  });

  function scheduleDraft() {
    clearTimeout(state.draftTimer);
    state.draftTimer = setTimeout(saveDraft, 1500);
  }

  function saveDraft() {
    if (!state.isNew) {
      return;
    }
    var f = collectForm();
    if (!f.title && !f.body) {
      localStorage.removeItem(DRAFT_KEY);
      return;
    }
    f.date = todayStr();
    localStorage.setItem(DRAFT_KEY, JSON.stringify(f));
  }

  function tryRestoreDraft() {
    var d = null;
    try {
      d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    } catch (e) {}
    if (d && (d.title || d.body)) {
      if (window.confirm('发现上次未发布的草稿《' + (d.title || '无标题') + '》，是否恢复？')) {
        editTitle.value = d.title || '';
        editTags.value = d.tags || '';
        editSummary.value = d.summary || '';
        editBody.value = d.body || '';
      } else {
        localStorage.removeItem(DRAFT_KEY);
      }
    }
  }

  [editTitle, editTags, editSummary, editBody].forEach(function (el) {
    el.addEventListener('input', scheduleDraft);
  });

  /* 保存（保持当前发布状态）：新建保存为待发布；编辑保留原 draft 状态 */
  function doSave(publish) {
    var f = collectForm();
    if (!f.title.trim()) {
      showToast('请先填写标题', 'error');
      editTitle.focus();
      return;
    }
    var tags = f.tags.split(',')
      .map(function (t) { return t.trim(); })
      .filter(Boolean);

    var isNew = state.isNew;
    var filename;
    var sha = null;
    var date;
    var curDraft = false;

    if (isNew) {
      date = todayStr();
      filename = buildFilename(f.title, date);
      /* 新建文章：仅「保存并发布」为已发布，普通保存为待发布 */
      curDraft = !publish;
    } else {
      filename = state.editing.name;
      date = state.editing.date || todayStr();
    }

    var btn = document.getElementById(publish ? 'btnSave' : 'btnSaveDraft');
    var btnText = publish ? '保存并发布' : '保存';
    btn.disabled = true;
    btn.textContent = '保存中…';

    var prep = Promise.resolve();
    if (!isNew) {
      prep = getPostMeta(filename).then(function (m) {
        sha = m.sha;
        /* 编辑已有文章：保留文章当前的发布状态 */
        var cur = parseFrontMatter(base64ToUtf8(m.content));
        curDraft = cur.draft === 'true' || cur.draft === true;
      });
    }

    prep.then(function () {
      var meta = {
        title: f.title.trim(),
        date: date,
        tags: tags,
        summary: f.summary.trim()
      };
      if (curDraft) {
        meta.draft = true;
      }
      var fullContent = buildFrontMatter(meta) + f.body;
      var msg = publish ?
        ((isNew ? '发布文章：' : '更新并发布：') + filename) :
        ((isNew ? '保存文章（待发布）：' : '更新文章：') + filename);
      return savePost(filename, fullContent, sha, msg);
    }).then(function () {
      localStorage.removeItem(DRAFT_KEY);
      showToast(publish ?
        '已保存并发布，首页 1 分钟内可见' :
        (isNew ? '已保存为待发布，不会显示在首页' : '已保存'),
        'success');
      btn.disabled = false;
      btn.textContent = btnText;
      editorPanel.classList.add('hidden');
      loadPosts();
      /* 正文已不再引用的会话图片，从仓库同步删除 */
      cleanupUnusedImages(f.body);
    }).catch(function (err) {
      btn.disabled = false;
      btn.textContent = btnText;
      var msg = '保存失败：' + err.message;
      if (err.status === 422) {
        msg = '保存失败：同名文章已存在，请调整标题或日期';
      }
      showToast(msg, 'error');
    });
  }

  document.getElementById('btnSaveDraft').addEventListener('click', function () {
    doSave(false);
  });

  document.getElementById('btnSave').addEventListener('click', function () {
    doSave(true);
  });

  document.getElementById('btnCancel').addEventListener('click', function () {
    editorPanel.classList.add('hidden');
  });

  /* ----------------------------------------------------------
   * 编辑快捷键：Ctrl+S 保存草稿，Ctrl+Shift+S 保存并发布
   * 仅在编辑器打开时生效，否则不拦截
   * -------------------------------------------------------- */
  document.addEventListener('keydown', function (e) {
    if (!(e.ctrlKey || e.metaKey) || (e.key !== 's' && e.key !== 'S')) {
      return;
    }
    if (editorPanel.classList.contains('hidden')) {
      return;
    }
    e.preventDefault();
    if (e.shiftKey) {
      document.getElementById('btnSave').click();
    } else {
      document.getElementById('btnSaveDraft').click();
    }
  });

  /* ----------------------------------------------------------
   * 设置暂存机制
   * 表单改动即时写入 state.draft / state.repoDraft 并标记 dirty
   * 点「应用所有设置」一次性提交
   * -------------------------------------------------------- */
  function markDirty(group) {
    state.dirty = true;
    state.dirtyGroups[group] = true;
    document.getElementById('btnApplyAll').classList.add('dirty');
    var nameToView = {
      '文章管理': 'Posts', '仓库管理': 'Repo', '页面管理': 'Pages',
      '主题': 'Theme', '组件模块': 'Widgets', '动画管理': 'Animation'
    };
    var nav = document.getElementById('nav' + nameToView[group]);
    if (nav) {
      nav.classList.add('has-dirty');
    }
  }

  function clearDirty() {
    state.dirty = false;
    state.dirtyGroups = {};
    document.getElementById('btnApplyAll').classList.remove('dirty');
    document.querySelectorAll('.admin-nav .nav-item').forEach(function (b) {
      b.classList.remove('has-dirty');
    });
  }

  /* 收集站点配置表单到 state.draft */
  function collectAllForms() {
    var d = state.draft || {};
    var introVal = val('cfgProfileIntro');
    d.site = {
      title: val('cfgSiteTitle'),
      desc: val('cfgSiteDesc')
    };
    d.profile = {
      showAvatar: checked('cfgShowAvatar'),
      avatar: val('cfgAvatarUrl'),
      avatarShape: val('cfgAvatarShape'),
      intro: introVal
    };
    d.layout = {
      showSearch: checked('cfgShowSearch'),
      showSummary: checked('cfgShowSummary'),
      pageSize: parseInt(val('cfgPageSize'), 10) || 20
    };
    d.appearance = {
      theme: val('cfgTheme'),
      accent: val('cfgAccent'),
      accentDark: val('cfgAccentDark'),
      buttonStyle: val('cfgButtonStyle'),
      radius: parseInt(val('cfgRadius'), 10) || 12,
      fontSize: parseInt(val('cfgFontSize'), 10) || 16
    };
    d.widgets = d.widgets || {};
    d.widgets.backToTop = checked('cfgWBackTop');
    d.widgets.darkToggle = checked('cfgWDarkToggle');
    d.widgets.darkTogglePos = val('cfgWDarkPos');
    /* 右上角自定义按钮：每行「文字,链接」 */
    d.widgets.headerButtons = val('cfgHeaderBtns').split(/\r?\n/)
      .map(function (line) {
        var parts = line.split(',');
        if (parts.length < 2) {
          return null;
        }
        return { text: parts[0].trim(), url: parts.slice(1).join(',').trim() };
      })
      .filter(function (b) { return b && b.text && b.url; });
    d.widgets.busuanzi = checked('cfgWBusuanzi');
    d.widgets.scrollReveal = checked('cfgWScrollReveal');
    d.widgets.particles = checked('cfgWParticles');
    d.widgets.particlesPreset = val('cfgWParticlesPreset');
    /* 粒子颜色：auto 跟随主题 / custom 取自定义色值 */
    d.widgets.particlesColor = (val('cfgWParticlesColor') === 'custom')
      ? (val('cfgWParticlesColorPick') || '#0f766e')
      : 'auto';
    d.widgets.particlesCount = Math.max(10, Math.min(150, parseInt(val('cfgWParticlesCount'), 10) || 60));
    d.widgets.particlesOpacity = Math.max(0.1, Math.min(1, parseFloat(val('cfgWParticlesOpacity')) || 0.65));
    d.widgets.typing = checked('cfgWTyping');
    /* 个人介绍与打字机文案同步：同一个输入框，分号分句 */
    d.widgets.typingText = introVal
      .split(';').map(function (t) { return t.trim(); }).filter(Boolean);
    d.widgets.themeAnim = val('cfgWThemeAnim');
    d.widgets.progressBar = checked('cfgWProgressBar');
    d.widgets.mouseTrail = checked('cfgWMouseTrail');
    d.widgets.mouseTrailLife = val('cfgWMouseTrailLife') || 'long';
    d.widgets.mouseTrailSize = Math.max(1, Math.min(10, parseFloat(val('cfgWMouseTrailSize')) || 3.5));
    d.widgets.festivalTheme = checked('cfgWFestival');
    d.widgets.festivalDecoCount = Math.max(0, Math.min(20, parseInt(val('cfgWFestivalDecoCount'), 10) || 8));
    d.widgets.festivalDecoOpacity = Math.max(0.1, Math.min(1, parseFloat(val('cfgWFestivalDecoOpacity')) || 0.9));
    d.widgets.festivalDecoContent = (val('cfgWFestivalDecoContent') || '').trim();
    d.animation = { speed: val('cfgAnimSpeed') };
    d.sidebar = d.sidebar || {};
    d.sidebar.enabled = checked('cfgSidebarEnabled');
    d.sidebar.sticky = checked('cfgSidebarSticky');
    /* modules 由模块卡片管理，collect 时保持现状 */
    return d;
  }

  /* 填充全部站点配置表单 */
  function fillAllForms(d) {
    d = d || {};
    var site = d.site || {};
    var p = d.profile || {};
    var lay = d.layout || {};
    var a = d.appearance || {};
    var w = d.widgets || {};
    var sb = d.sidebar || {};
    var anim = d.animation || {};

    setVal('cfgSiteTitle', site.title);
    setVal('cfgSiteDesc', site.desc);
    setVal('cfgShowAvatar', p.showAvatar);
    setVal('cfgAvatarUrl', p.avatar);
    setVal('cfgAvatarShape', p.avatarShape);
    setVal('cfgProfileIntro',
      (w.typingText && w.typingText.length) ? w.typingText.join(';') : p.intro);
    setVal('cfgShowSearch', lay.showSearch);
    setVal('cfgShowSummary', lay.showSummary);
    setVal('cfgPageSize', lay.pageSize);
    setVal('cfgTheme', a.theme);
    setVal('cfgAccent', a.accent);
    setVal('cfgAccentDark', a.accentDark);
    setVal('cfgButtonStyle', a.buttonStyle);
    setVal('cfgRadius', a.radius);
    setVal('cfgFontSize', a.fontSize);
    setVal('cfgWBackTop', w.backToTop);
    setVal('cfgWDarkToggle', w.darkToggle);
    setVal('cfgWDarkPos', w.darkTogglePos);
    setVal('cfgHeaderBtns', (w.headerButtons || [])
      .map(function (b) { return b.text + ',' + b.url; }).join('\n'));
    setVal('cfgWBusuanzi', w.busuanzi);
    setVal('cfgWScrollReveal', w.scrollReveal);
    setVal('cfgWParticles', w.particles);
    setVal('cfgWParticlesPreset', w.particlesPreset);
    var pColor = (w.particlesColor || 'auto');
    setVal('cfgWParticlesColor', pColor === 'auto' ? 'auto' : 'custom');
    setVal('cfgWParticlesColorPick', pColor === 'auto' ? '#0f766e' : pColor);
    setVal('cfgWParticlesCount', w.particlesCount || 60);
    setVal('cfgWParticlesOpacity', w.particlesOpacity != null ? w.particlesOpacity : 0.65);
    setVal('cfgWTyping', w.typing);
    setVal('cfgWThemeAnim', w.themeAnim || 'ripple');
    setVal('cfgWProgressBar', w.progressBar !== false);
    setVal('cfgWMouseTrail', w.mouseTrail !== false);
    setVal('cfgWMouseTrailLife', w.mouseTrailLife || 'long');
    setVal('cfgWMouseTrailSize', w.mouseTrailSize != null ? w.mouseTrailSize : 3.5);
    setVal('cfgWFestival', w.festivalTheme !== false);
    setVal('cfgWFestivalDecoCount', w.festivalDecoCount != null ? w.festivalDecoCount : 8);
    setVal('cfgWFestivalDecoOpacity', w.festivalDecoOpacity != null ? w.festivalDecoOpacity : 0.9);
    setVal('cfgWFestivalDecoContent', w.festivalDecoContent || '');
    setVal('cfgAnimSpeed', anim.speed);
    setVal('cfgSidebarEnabled', sb.enabled);
    setVal('cfgSidebarSticky', sb.sticky);
    renderModulesList();
    previewModules();
  }

  function val(id) {
    var el = document.getElementById(id);
    return el ? el.value : '';
  }

  function setVal(id, v) {
    var el = document.getElementById(id);
    if (!el) {
      return;
    }
    if (el.type === 'checkbox') {
      el.checked = !!v;
    } else {
      el.value = (v == null ? '' : v);
    }
  }

  function checked(id) {
    var el = document.getElementById(id);
    return el ? el.checked : false;
  }

  /* 加载远端配置到草稿与表单 */
  function loadDraft() {
    getSiteConfigMeta().then(function (res) {
      state.configSha = res.sha;
      state.draft = res.config;
      state.repoDraft = {
        owner: getConfig().owner,
        repo: getConfig().repo,
        branch: getConfig().branch,
        token: getConfig().token
      };
      fillRepoForm();
      fillAllForms(state.draft);
      applyAppearance(state.draft);
      applyTheme();
    }).catch(function () {
      state.configSha = null;
      state.draft = JSON.parse(JSON.stringify(window.DEFAULT_SITE_CONFIG));
      fillAllForms(state.draft);
    });
  }

  /* 仓库表单 */
  function fillRepoForm() {
    if (!state.repoDraft) {
      return;
    }
    setVal('setOwner', state.repoDraft.owner);
    setVal('setRepo', state.repoDraft.repo);
    setVal('setBranch', state.repoDraft.branch);
    setVal('setToken', state.repoDraft.token);
  }

  /* 绑定所有设置表单的 change 事件（按所在分类分组，导航红点更准确） */
  var FORM_GROUPS = {
    'cfgSiteTitle': '页面管理', 'cfgSiteDesc': '页面管理',
    'cfgShowAvatar': '页面管理', 'cfgAvatarUrl': '页面管理',
    'cfgAvatarShape': '页面管理', 'cfgProfileIntro': '页面管理',
    'cfgShowSearch': '页面管理', 'cfgShowSummary': '页面管理', 'cfgPageSize': '页面管理',
    'cfgTheme': '主题', 'cfgAccent': '主题', 'cfgAccentDark': '主题',
    'cfgButtonStyle': '主题', 'cfgRadius': '主题', 'cfgFontSize': '主题',
    'cfgWBackTop': '主题', 'cfgWDarkToggle': '主题', 'cfgWDarkPos': '主题',
    'cfgHeaderBtns': '主题',
    'cfgWBusuanzi': '组件模块',
    'cfgSidebarEnabled': '组件模块', 'cfgSidebarSticky': '组件模块',
    'cfgWScrollReveal': '动画管理', 'cfgAnimSpeed': '动画管理',
    'cfgWParticles': '动画管理', 'cfgWParticlesPreset': '动画管理',
    'cfgWParticlesColor': '动画管理', 'cfgWParticlesColorPick': '动画管理',
    'cfgWParticlesCount': '动画管理', 'cfgWParticlesOpacity': '动画管理',
    'cfgWTyping': '动画管理', 'cfgWThemeAnim': '动画管理',
    'cfgWProgressBar': '动画管理', 'cfgWMouseTrail': '动画管理',
    'cfgWMouseTrailLife': '动画管理', 'cfgWMouseTrailSize': '动画管理',
    'cfgWFestival': '动画管理',
    'cfgWFestivalDecoCount': '动画管理', 'cfgWFestivalDecoOpacity': '动画管理',
    'cfgWFestivalDecoContent': '动画管理'
  };

  function bindConfigForms() {
    Object.keys(FORM_GROUPS).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) {
        return;
      }
      el.addEventListener('change', function () {
        state.draft = collectAllForms();
        applyAppearance(state.draft);
        applyTheme();
        markDirty(FORM_GROUPS[id]);
      });
    });
  }

  /* 仓库字段绑定 */
  ['setOwner', 'setRepo', 'setBranch', 'setToken'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', function () {
        if (!state.repoDraft) {
          return;
        }
        state.repoDraft.owner = val('setOwner');
        state.repoDraft.repo = val('setRepo');
        state.repoDraft.branch = val('setBranch');
        state.repoDraft.token = val('setToken');
        markDirty('仓库管理');
      });
    }
  });

  /* ----------------------------------------------------------
   * 侧栏模块管理（组件模块面板）
   * -------------------------------------------------------- */
  var MODULE_FIELDS = {
    about: [
      { key: 'title', label: '模块标题', type: 'text' },
      { key: 'content', label: '内容（支持 Markdown）', type: 'textarea', rows: 4 }
    ],
    datetime: [
      { key: 'title', label: '模块标题', type: 'text' },
      { key: 'showDate', label: '显示日期', type: 'checkbox' },
      { key: 'showTime', label: '显示时间', type: 'checkbox' },
      { key: 'format12', label: '12 小时制', type: 'checkbox' }
    ],
    weather: [
      { key: 'title', label: '模块标题', type: 'text' },
      { key: 'city', label: '城市名', type: 'text' },
      { key: 'lat', label: '纬度', type: 'number', step: '0.0001' },
      { key: 'lon', label: '经度', type: 'number', step: '0.0001' },
      { key: 'unit', label: '温度单位', type: 'select',
        options: [['celsius', '摄氏度'], ['fahrenheit', '华氏度']] }
    ],
    ghchart: [
      { key: 'title', label: '模块标题', type: 'text' },
      { key: 'username', label: 'GitHub 用户名', type: 'text' },
      { key: 'period', label: '时间范围', type: 'select',
        options: [['year', '全年'], ['half', '半年'], ['quarter', '三个月'], ['month', '一个月']] },
      { key: 'style', label: '显示样式', type: 'select',
        options: [['classic', '经典绿'], ['dark', '深色'], ['coral', '珊瑚橙'], ['custom', '自定义色']] },
      { key: 'color', label: '自定义主色（仅自定义色生效）', type: 'text' },
      { key: 'rounded', label: '方块圆角', type: 'checkbox' }
    ],
    stats: [
      { key: 'title', label: '模块标题', type: 'text' },
      { key: 'showPv', label: '显示全站浏览', type: 'checkbox' },
      { key: 'showUv', label: '显示访客数', type: 'checkbox' }
    ]
  };

  function renderModulesList() {
    var wrap = document.getElementById('modulesList');
    if (!wrap || !state.draft) {
      return;
    }
    var mods = (state.draft.sidebar && state.draft.sidebar.modules) || [];
    wrap.innerHTML = mods.map(function (m, idx) {
      /* 优先读 modules/ 注册表里的字段定义，新模块无需改后台代码 */
      var reg = (window.JiumoModules && window.JiumoModules[m.id]) || {};
      var fields = (reg.fields && reg.fields.length) ? reg.fields : (MODULE_FIELDS[m.id] || []);
      var body = fields.map(function (f) {
        var inputId = 'mod_' + m.id + '_' + f.key;
        if (f.type === 'checkbox') {
          return '<div class="form-row" style="margin-bottom:8px;">' +
            '<label><input type="checkbox" data-mod="' + m.id + '" data-key="' + f.key +
            '" id="' + inputId + '"' + (m[f.key] ? ' checked' : '') + '> ' +
            escapeHtml(f.label) + '</label></div>';
        }
        if (f.type === 'select') {
          var opts = (f.options || []).map(function (o) {
            return '<option value="' + o[0] + '"' + (String(m[f.key]) === o[0] ? ' selected' : '') +
              '>' + escapeHtml(o[1]) + '</option>';
          }).join('');
          return '<div class="form-row" style="margin-bottom:8px;"><label>' +
            escapeHtml(f.label) + '</label><select data-mod="' + m.id +
            '" data-key="' + f.key + '" id="' + inputId + '">' + opts + '</select></div>';
        }
        if (f.type === 'textarea') {
          return '<div class="form-row" style="margin-bottom:8px;"><label>' +
            escapeHtml(f.label) + '</label><textarea rows="' + (f.rows || 3) +
            '" data-mod="' + m.id + '" data-key="' + f.key + '" id="' + inputId +
            '">' + escapeHtml(m[f.key] || '') + '</textarea></div>';
        }
        return '<div class="form-row" style="margin-bottom:8px;"><label>' +
          escapeHtml(f.label) + '</label><input type="' + (f.type || 'text') +
          '" data-mod="' + m.id + '" data-key="' + f.key + '" id="' + inputId +
          '" value="' + escapeHtml(m[f.key] == null ? '' : m[f.key]) + '"' +
          (f.step ? ' step="' + f.step + '"' : '') + '></div>';
      }).join('');
      var pos = m.position === 'left' ? 'left' : 'right';
      return '<div class="mod-card" data-id="' + m.id + '" draggable="true">' +
        '<div class="mod-head">' +
          '<label class="mod-name">' +
            '<span class="mod-drag" title="拖动排序">⋮⋮</span>' +
            '<input type="checkbox" class="mod-enabled" data-mod="' +
              m.id + '"' + (m.enabled ? ' checked' : '') + '> ' +
            escapeHtml(m.title || m.id) + ' <span class="mod-badge">' + m.id + '</span></label>' +
          '<div class="mod-actions">' +
            '<button class="mod-pos-btn' + (pos === 'left' ? ' active' : '') +
              '" data-pos="left" data-mod="' + m.id + '" title="显示在左栏">左栏</button>' +
            '<button class="mod-pos-btn' + (pos === 'right' ? ' active' : '') +
              '" data-pos="right" data-mod="' + m.id + '" title="显示在右栏">右栏</button>' +
            '<button class="btn btn-ghost btn-sm mod-toggle" data-mod="' + m.id +
              '" title="折叠/展开设置">▸</button>' +
          '</div>' +
        '</div>' +
        '<div class="mod-body hidden">' + body + '</div>' +
      '</div>';
    }).join('') ||
      '<div class="state-box" style="padding:20px 0;">暂无模块</div>';
  }

  /* 实时预览：与主页面同款渲染函数，改设置即刻看到效果 */
  function previewModules() {
    if (!state.draft) {
      return;
    }
    if (typeof renderSidebarModules === 'function') {
      renderSidebarModules(state.draft);
      return;
    }
    var l = document.getElementById('leftModules');
    var r = document.getElementById('sidebarModules');
    if (l) {
      l.innerHTML = '';
      renderModuleHtml(l, state.draft, 'left');
    }
    if (r) {
      r.innerHTML = '';
      renderModuleHtml(r, state.draft, 'right');
    }
  }

  document.getElementById('modulesList').addEventListener('change', function (e) {
    var t = e.target;
    if (!state.draft || !t.dataset) {
      return;
    }
    var mods = (state.draft.sidebar && state.draft.sidebar.modules) || [];
    var mod = null;
    for (var i = 0; i < mods.length; i++) {
      if (mods[i].id === t.dataset.mod) {
        mod = mods[i];
        break;
      }
    }
    if (!mod) {
      return;
    }
    if (t.classList.contains('mod-enabled')) {
      mod.enabled = t.checked;
    } else if (t.dataset.key) {
      mod[t.dataset.key] = t.type === 'checkbox' ? t.checked :
        (t.type === 'number' ? parseFloat(t.value) : t.value);
    }
    markDirty('组件模块');
    renderModulesList();
    previewModules();
  });

  document.getElementById('modulesList').addEventListener('click', function (e) {
    if (!state.draft) {
      return;
    }
    /* 左右栏位置按钮 */
    var posBtn = e.target.closest('button[data-pos]');
    if (posBtn) {
      var mods = (state.draft.sidebar && state.draft.sidebar.modules) || [];
      for (var i = 0; i < mods.length; i++) {
        if (mods[i].id === posBtn.getAttribute('data-mod')) {
          mods[i].position = posBtn.getAttribute('data-pos');
          break;
        }
      }
      markDirty('组件模块');
      renderModulesList();
      previewModules();
      return;
    }
    /* 折叠 / 展开设置区（默认折叠） */
    var toggle = e.target.closest('.mod-toggle');
    if (toggle) {
      var card = toggle.closest('.mod-card');
      if (card) {
        var body = card.querySelector('.mod-body');
        body.classList.toggle('hidden');
        toggle.textContent = body.classList.contains('hidden') ? '▸' : '▾';
      }
      return;
    }
  });

  /* 拖拽排序：拖动模块卡片调整顺序 */
  var dragIdx = -1;
  document.getElementById('modulesList').addEventListener('dragstart', function (e) {
    var card = e.target.closest('.mod-card');
    if (!card || !state.draft) {
      return;
    }
    dragIdx = Array.prototype.indexOf.call(
      document.getElementById('modulesList').children, card);
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', String(dragIdx));
    } catch (err) {}
    card.classList.add('dragging');
  });
  document.getElementById('modulesList').addEventListener('dragend', function (e) {
    var card = e.target.closest('.mod-card');
    if (card) {
      card.classList.remove('dragging');
    }
    dragIdx = -1;
  });
  document.getElementById('modulesList').addEventListener('dragover', function (e) {
    if (dragIdx < 0) {
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    var target = e.target.closest('.mod-card');
    var box = document.getElementById('modulesList');
    if (!target) {
      return;
    }
    var ti = Array.prototype.indexOf.call(box.children, target);
    box.children.forEach(function (c) {
      c.classList.remove('drag-over');
    });
    target.classList.add('drag-over');
  });
  document.getElementById('modulesList').addEventListener('drop', function (e) {
    if (dragIdx < 0 || !state.draft) {
      return;
    }
    e.preventDefault();
    var target = e.target.closest('.mod-card');
    var box = document.getElementById('modulesList');
    if (!target) {
      return;
    }
    var ti = Array.prototype.indexOf.call(box.children, target);
    if (ti === dragIdx) {
      return;
    }
    var mods = (state.draft.sidebar && state.draft.sidebar.modules) || [];
    var moved = mods.splice(dragIdx, 1)[0];
    mods.splice(ti, 0, moved);
    markDirty('组件模块');
    renderModulesList();
    previewModules();
  });

  /* ----------------------------------------------------------
   * 应用所有设置
   * -------------------------------------------------------- */
  document.getElementById('btnApplyAll').addEventListener('click', function () {
    if (!state.dirty) {
      showToast('当前没有未保存的修改', '');
      return;
    }
    var btn = document.getElementById('btnApplyAll');
    btn.disabled = true;
    btn.textContent = '保存中…';

    /* 仓库设置（本地）与站点配置（远端）分别保存 */
    var repoChanged = !!state.dirtyGroups['仓库管理'];
    var siteChanged = !!state.draft;

    function afterRepo() {
      var d = state.draft;
      var save = getSiteConfigMeta().then(function (res) {
        state.configSha = res.sha;
        return saveSiteConfig(d, res.sha);
      });
      save.then(function () {
        btn.disabled = false;
        btn.textContent = '应用所有设置';
        clearDirty();
        /* 广播给同域名前台标签页：立即热更新，无需手动刷新 */
        try {
          localStorage.setItem(CFG_PUSH_KEY, String(Date.now()));
        } catch (e) {}
        showToast('设置已保存，前台页面已自动生效', 'success');
        SITE_CFG = deepMerge(JSON.parse(JSON.stringify(window.DEFAULT_SITE_CONFIG)), d);
        applyAppearance(SITE_CFG);
        applyTheme();
      }).catch(function (err) {
        btn.disabled = false;
        btn.textContent = '应用所有设置';
        showToast('保存失败：' + err.message, 'error');
      });
    }

    if (repoChanged) {
      var s = state.repoDraft;
      saveSettings({
        owner: (s.owner || '').trim(),
        repo: (s.repo || '').trim(),
        branch: (s.branch || '').trim(),
        token: (s.token || '').trim()
      });
      apiRequest('/user').then(function () {
        afterRepo();
      }).catch(function (err) {
        btn.disabled = false;
        btn.textContent = '应用所有设置';
        showToast('仓库 Token 验证失败：' + err.message, 'error');
      });
    } else {
      afterRepo();
    }
  });

  /* 退出提示：有未保存修改时提醒 */
  window.addEventListener('beforeunload', function (e) {
    if (state.dirty) {
      e.preventDefault();
      e.returnValue = '';
      return '';
    }
  });

  /* 草稿箱：返回文章管理 */
  var btnToPosts = document.getElementById('btnToPosts');
  if (btnToPosts) {
    btnToPosts.addEventListener('click', function () {
      switchView('posts');
    });
  }

  /* 点博客首页/登出时若 dirty 先提示 */
  function guardExit(cb) {
    if (state.dirty) {
      var names = Object.keys(state.dirtyGroups).join('、') || '设置';
      if (!window.confirm('有未保存的修改（' + names + '），确定不保存就离开吗？\n点「取消」回到后台继续编辑。')) {
        return;
      }
    }
    cb();
  }

  document.getElementById('btnLogoutTop').addEventListener('click', function () {
    guardExit(function () {
      clearSettings();
      location.reload();
    });
  });

  /* 页面顶部「博客首页」链接也需要拦截 —— 用事件捕获替代默认跳转 */
  document.querySelectorAll('.admin-nav a[href="../index.html"], .admin-topbar a[href="../index.html"]')
    .forEach(function (a) {
      a.addEventListener('click', function (e) {
        if (!state.dirty) {
          return;
        }
        e.preventDefault();
        var names = Object.keys(state.dirtyGroups).join('、') || '设置';
        if (window.confirm('有未保存的修改（' + names + '），确定不保存就离开吗？\n点「确定」前往首页，点「取消」回到后台。')) {
          window.location.href = a.getAttribute('href');
        }
      });
    });

  /* ----------------------------------------------------------
   * 登出（登录视图隐藏时的兜底）
   * -------------------------------------------------------- */

  /* ----------------------------------------------------------
   * 启动
   * -------------------------------------------------------- */
  bindConfigForms();
  loadSiteConfigFile().then(function (cfg) {
    applyAppearance(cfg);
    applyTheme();
    if (window.initJiumoUI) {
      window.initJiumoUI();
    }
  });

  if (getConfig().token) {
    enterWithToken();
  } else {
    fillLoginForm();
    showLogin();
  }
})();
