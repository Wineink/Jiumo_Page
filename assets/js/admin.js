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

  /* 编辑器元素 */
  var editTitle = document.getElementById('editTitle');
  var editDate = document.getElementById('editDate');
  var editTags = document.getElementById('editTags');
  var editSummary = document.getElementById('editSummary');
  var editBody = document.getElementById('editBody');
  var editBodyWrap = document.getElementById('editBodyWrap');
  var editPreview = document.getElementById('editPreview');

  /* 视图名映射 */
  var VIEW_NAMES = {
    posts: '文章管理',
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
  }

  function showAdmin() {
    loginView.classList.add('hidden');
    adminView.classList.remove('hidden');
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

  function renderAdminList() {
    if (!state.posts.length) {
      adminList.innerHTML =
        '<div class="state-box">还没有文章，点击右上角「+ 新建文章」开始。</div>';
      return;
    }
    adminList.innerHTML = state.posts.map(function (p) {
      var title = p.meta.title || p.name;
      var tags = p.meta.tags.map(function (t) {
        return '<span class="tag">' + escapeHtml(t) + '</span>';
      }).join(' ');
      return '<div class="admin-item">' +
        '<div class="item-main">' +
          '<div class="item-title">' + escapeHtml(title) + '</div>' +
          '<div class="item-sub">' + escapeHtml(p.meta.date || '') + ' ' +
            tags + ' · ' + escapeHtml(p.name) + '</div>' +
        '</div>' +
        '<div class="item-actions">' +
          '<button class="btn btn-ghost btn-sm" data-action="edit" data-name="' +
            encodeURIComponent(p.name) + '">编辑</button>' +
          '<button class="btn btn-danger btn-sm" data-action="del" data-name="' +
            encodeURIComponent(p.name) + '">删除</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  adminList.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-action]');
    if (!btn) {
      return;
    }
    var name = decodeURIComponent(btn.getAttribute('data-name'));
    if (btn.getAttribute('data-action') === 'edit') {
      openEditor(name);
    } else {
      confirmDelete(name);
    }
  });

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
   * 编辑器
   * -------------------------------------------------------- */
  function collectForm() {
    return {
      title: editTitle.value,
      date: editDate.value,
      tags: editTags.value,
      summary: editSummary.value,
      body: editBody.value
    };
  }

  function resetEditor() {
    editTitle.value = '';
    editDate.value = todayStr();
    editTags.value = '';
    editSummary.value = '';
    editBody.value = '';
    editPreview.innerHTML = '';
    switchEditTab('edit');
  }

  document.getElementById('btnNew').addEventListener('click', function () {
    state.isNew = true;
    state.editing = null;
    resetEditor();
    filenameBox.textContent = '新文章，保存时自动生成文件名：' + todayStr() + '-标题.md';
    editorPanel.classList.remove('hidden');
    tryRestoreDraft();
    editTitle.focus();
  });

  function openEditor(name) {
    getPostMeta(name).then(function (data) {
      var meta = parseFrontMatter(base64ToUtf8(data.content));
      state.isNew = false;
      state.editing = { name: name, sha: data.sha };
      editTitle.value = meta.title || '';
      editDate.value = meta.date || name.slice(0, 10);
      editTags.value = meta.tags.join(', ');
      editSummary.value = meta.summary || '';
      editBody.value = meta.body || '';
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
      editPreview.innerHTML =
        '<h1>' + escapeHtml(editTitle.value || '无标题') + '</h1>' +
        '<div class="post-meta"><span>' + escapeHtml(editDate.value) + '</span></div>' +
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
        editDate.value = d.date || todayStr();
        editTags.value = d.tags || '';
        editSummary.value = d.summary || '';
        editBody.value = d.body || '';
      } else {
        localStorage.removeItem(DRAFT_KEY);
      }
    }
  }

  [editTitle, editDate, editTags, editSummary, editBody].forEach(function (el) {
    el.addEventListener('input', scheduleDraft);
  });

  document.getElementById('btnSave').addEventListener('click', function () {
    var f = collectForm();
    if (!f.title.trim()) {
      showToast('请先填写标题', 'error');
      editTitle.focus();
      return;
    }
    if (!f.date.trim()) {
      f.date = todayStr();
    }
    var tags = f.tags.split(',')
      .map(function (t) { return t.trim(); })
      .filter(Boolean);
    var fullContent = buildFrontMatter({
      title: f.title.trim(),
      date: f.date.trim(),
      tags: tags,
      summary: f.summary.trim()
    }) + f.body;

    var filename;
    var sha = null;
    if (state.isNew) {
      filename = buildFilename(f.title, f.date.trim());
    } else {
      filename = state.editing.name;
    }

    var btn = document.getElementById('btnSave');
    btn.disabled = true;
    btn.textContent = '保存中…';

    var prep = Promise.resolve();
    if (!state.isNew) {
      prep = getPostMeta(filename).then(function (m) {
        sha = m.sha;
      });
    }

    prep.then(function () {
      var msg = (state.isNew ? '发布文章：' : '更新文章：') + filename;
      return savePost(filename, fullContent, sha, msg);
    }).then(function () {
      localStorage.removeItem(DRAFT_KEY);
      showToast('已保存，GitHub Pages 通常 1 分钟内生效', 'success');
      btn.disabled = false;
      btn.textContent = '保存并发布';
      editorPanel.classList.add('hidden');
      loadPosts();
    }).catch(function (err) {
      btn.disabled = false;
      btn.textContent = '保存并发布';
      var msg = '保存失败：' + err.message;
      if (err.status === 422) {
        msg = '保存失败：同名文章已存在，请调整标题或日期';
      }
      showToast(msg, 'error');
    });
  });

  document.getElementById('btnCancel').addEventListener('click', function () {
    editorPanel.classList.add('hidden');
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
    d.widgets.typing = checked('cfgWTyping');
    /* 个人介绍与打字机文案同步：同一个输入框，分号分句 */
    d.widgets.typingText = introVal
      .split(';').map(function (t) { return t.trim(); }).filter(Boolean);
    d.widgets.utterances = {
      enabled: checked('cfgUtterEnabled'),
      repo: val('cfgUtterRepo'),
      issueTerm: val('cfgUtterIssueTerm'),
      theme: 'github-light'
    };
    d.widgets.gitalk = {
      enabled: checked('cfgGitalkEnabled'),
      clientID: val('cfgGitalkClientID'),
      clientSecret: val('cfgGitalkClientSecret'),
      repo: val('cfgGitalkRepo')
    };
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
    setVal('cfgWTyping', w.typing);
    var utt = w.utterances || {};
    setVal('cfgUtterEnabled', utt.enabled);
    setVal('cfgUtterRepo', utt.repo);
    setVal('cfgUtterIssueTerm', utt.issueTerm);
    var gk = w.gitalk || {};
    setVal('cfgGitalkEnabled', gk.enabled);
    setVal('cfgGitalkClientID', gk.clientID);
    setVal('cfgGitalkClientSecret', gk.clientSecret);
    setVal('cfgGitalkRepo', gk.repo);
    setVal('cfgAnimSpeed', anim.speed);
    setVal('cfgSidebarEnabled', sb.enabled);
    setVal('cfgSidebarSticky', sb.sticky);
    renderModulesList();
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
    'cfgUtterEnabled': '组件模块', 'cfgUtterRepo': '组件模块', 'cfgUtterIssueTerm': '组件模块',
    'cfgGitalkEnabled': '组件模块', 'cfgGitalkClientID': '组件模块',
    'cfgGitalkClientSecret': '组件模块', 'cfgGitalkRepo': '组件模块',
    'cfgSidebarEnabled': '组件模块', 'cfgSidebarSticky': '组件模块',
    'cfgWScrollReveal': '动画管理', 'cfgAnimSpeed': '动画管理',
    'cfgWParticles': '动画管理', 'cfgWParticlesPreset': '动画管理',
    'cfgWTyping': '动画管理'
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
      { key: 'username', label: 'GitHub 用户名', type: 'text' }
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
      return '<div class="mod-card" data-id="' + m.id + '">' +
        '<div class="mod-head">' +
          '<label class="mod-name"><input type="checkbox" class="mod-enabled" data-mod="' +
            m.id + '"' + (m.enabled ? ' checked' : '') + '> ' +
            escapeHtml(m.title || m.id) + ' <span class="mod-badge">' + m.id + '</span></label>' +
          '<div class="mod-actions">' +
            '<select class="mod-pos" data-mod="' + m.id + '" data-key="position" title="模块放置位置">' +
              '<option value="left"' + (m.position === 'left' ? ' selected' : '') + '>左栏</option>' +
              '<option value="right"' + (m.position !== 'left' ? ' selected' : '') + '>右栏</option>' +
            '</select>' +
            '<button class="btn btn-ghost btn-sm mod-arrow" data-move="up" data-idx="' + idx +
            '" title="上移">↑</button>' +
            '<button class="btn btn-ghost btn-sm mod-arrow" data-move="down" data-idx="' + idx +
            '" title="下移">↓</button>' +
          '</div>' +
        '</div>' +
        '<div class="mod-body">' + body + '</div>' +
      '</div>';
    }).join('') ||
      '<div class="state-box" style="padding:20px 0;">暂无模块</div>';
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
  });

  document.getElementById('modulesList').addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-move]');
    if (!btn || !state.draft) {
      return;
    }
    var mods = (state.draft.sidebar && state.draft.sidebar.modules) || [];
    var idx = parseInt(btn.getAttribute('data-idx'), 10);
    var dir = btn.getAttribute('data-move') === 'up' ? -1 : 1;
    var ni = idx + dir;
    if (idx < 0 || ni < 0 || ni >= mods.length) {
      return;
    }
    var tmp = mods[idx];
    mods[idx] = mods[ni];
    mods[ni] = tmp;
    renderModulesList();
    markDirty('组件模块');
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

  document.getElementById('btnLogout').addEventListener('click', function () {
    guardExit(function () {
      clearSettings();
      location.reload();
    });
  });

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
