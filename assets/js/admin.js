/* ============================================================
 * Jiumo_blog 管理后台逻辑
 * 登录验证 / 文章列表 / 新建编辑删除 / Markdown 预览 / 草稿
 * 站点设置（分类管理：仓库登录/基本信息/头像布局/侧栏模块/外观主题/组件模块/动画）
 * ============================================================ */
(function () {
  /* 视图容器 */
  var loginView = document.getElementById('loginView');
  var adminView = document.getElementById('adminView');
  var listPanel = document.getElementById('listPanel');
  var editorPanel = document.getElementById('editorPanel');
  var settingsPanel = document.getElementById('settingsPanel');
  var adminList = document.getElementById('adminList');
  var repoInfo = document.getElementById('repoInfo');
  var filenameBox = document.getElementById('filenameBox');

  /* 编辑器元素 */
  var editTitle = document.getElementById('editTitle');
  var editDate = document.getElementById('editDate');
  var editTags = document.getElementById('editTags');
  var editSummary = document.getElementById('editSummary');
  var editBody = document.getElementById('editBody');
  var editBodyWrap = document.getElementById('editBodyWrap');
  var editPreview = document.getElementById('editPreview');

  var state = {
    posts: [],
    isNew: false,
    editing: null,
    draftTimer: null,
    configSha: null
  };

  /* ----------------------------------------------------------
   * 视图切换
   * -------------------------------------------------------- */
  function showLogin() {
    loginView.classList.remove('hidden');
    adminView.classList.add('hidden');
  }

  function showAdmin() {
    loginView.classList.add('hidden');
    adminView.classList.remove('hidden');
  }

  function showPanel(name) {
    listPanel.classList.toggle('hidden', name !== 'list');
    editorPanel.classList.toggle('hidden', name !== 'editor');
    settingsPanel.classList.toggle('hidden', name !== 'settings');
  }

  /* ----------------------------------------------------------
   * 登录
   * -------------------------------------------------------- */
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
    showPanel('list');
    loadPosts();
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

  /* 删除文章 */
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
    showPanel('editor');
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
      showPanel('editor');
    }).catch(function (err) {
      showToast('文章读取失败：' + err.message, 'error');
    });
  }

  /* 编辑 / 预览 切换 */
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

  /* 草稿自动保存（仅新建文章） */
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

  /* 保存并发布 */
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

    /* 编辑已有文章前重新取最新 sha，避免冲突 */
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
      showPanel('list');
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
    showPanel('list');
  });

  /* ----------------------------------------------------------
   * 设置面板（仓库登录 + 分类站点配置）
   * -------------------------------------------------------- */
  /* 仓库设置：填充 / 保存（localStorage） */
  function fillRepoSettings() {
    var c = getConfig();
    document.getElementById('setOwner').value = c.owner;
    document.getElementById('setRepo').value = c.repo;
    document.getElementById('setBranch').value = c.branch;
    document.getElementById('setToken').value = c.token;
  }

  /* 分类标签切换 */
  function initSettingsTabs() {
    var tabs = document.querySelectorAll('#settingsTabs button');
    tabs.forEach(function (btn) {
      btn.addEventListener('click', function () {
        tabs.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        var panes = document.querySelectorAll('.settings-pane');
        panes.forEach(function (p) {
          p.classList.toggle('active', p.id === btn.getAttribute('data-pane'));
        });
      });
    });
  }

  /* 从 site-config 填充站点设置表单 */
  function fillConfigForm(cfg) {
    cfg = cfg || {};
    var site = cfg.site || {};
    var profile = cfg.profile || {};
    var sidebar = cfg.sidebar || {};
    var appearance = cfg.appearance || {};
    var widgets = cfg.widgets || {};
    var anim = cfg.animation || {};

    setVal('cfgSiteTitle', site.title);
    setVal('cfgSiteDesc', site.desc);
    setVal('cfgShowAvatar', profile.showAvatar);
    setVal('cfgAvatarUrl', profile.avatar);
    setVal('cfgAvatarShape', profile.avatarShape);
    setVal('cfgProfileIntro', profile.intro);
    setVal('cfgSidebarEnabled', sidebar.enabled);
    setVal('cfgSidebarSticky', sidebar.sticky);
    setVal('cfgSidebarTitle', sidebar.title);
    setVal('cfgSidebarContent', sidebar.content);
    setVal('cfgTheme', appearance.theme);
    setVal('cfgAccent', appearance.accent);
    setVal('cfgAccentDark', appearance.accentDark);
    setVal('cfgButtonStyle', appearance.buttonStyle);
    setVal('cfgRadius', appearance.radius);
    setVal('cfgFontSize', appearance.fontSize);
    setVal('cfgWBackTop', widgets.backToTop);
    setVal('cfgWDarkToggle', widgets.darkToggle);
    setVal('cfgWBusuanzi', widgets.busuanzi);
    setVal('cfgWScrollReveal', widgets.scrollReveal);
    setVal('cfgWParticles', widgets.particles);
    setVal('cfgWParticlesPreset', widgets.particlesPreset);
    setVal('cfgWTyping', widgets.typing);
    setVal('cfgWTypingText',
      (widgets.typingText || []).join(';'));
    var utt = widgets.utterances || {};
    setVal('cfgUtterEnabled', utt.enabled);
    setVal('cfgUtterRepo', utt.repo);
    setVal('cfgUtterIssueTerm', utt.issueTerm);
    var gk = widgets.gitalk || {};
    setVal('cfgGitalkEnabled', gk.enabled);
    setVal('cfgGitalkClientID', gk.clientID);
    setVal('cfgGitalkClientSecret', gk.clientSecret);
    setVal('cfgGitalkRepo', gk.repo);
    setVal('cfgAnimSpeed', anim.speed);
  }

  /* 从站点设置表单收集配置对象 */
  function collectConfigForm() {
    var typingText = val('cfgWTypingText')
      .split(';').map(function (t) { return t.trim(); }).filter(Boolean);
    return {
      site: {
        title: val('cfgSiteTitle'),
        desc: val('cfgSiteDesc')
      },
      profile: {
        showAvatar: checked('cfgShowAvatar'),
        avatar: val('cfgAvatarUrl'),
        avatarShape: val('cfgAvatarShape'),
        intro: val('cfgProfileIntro')
      },
      sidebar: {
        enabled: checked('cfgSidebarEnabled'),
        sticky: checked('cfgSidebarSticky'),
        title: val('cfgSidebarTitle'),
        content: val('cfgSidebarContent')
      },
      appearance: {
        theme: val('cfgTheme'),
        accent: val('cfgAccent'),
        accentDark: val('cfgAccentDark'),
        buttonStyle: val('cfgButtonStyle'),
        radius: parseInt(val('cfgRadius'), 10) || 12,
        fontSize: parseInt(val('cfgFontSize'), 10) || 16
      },
      widgets: {
        backToTop: checked('cfgWBackTop'),
        darkToggle: checked('cfgWDarkToggle'),
        busuanzi: checked('cfgWBusuanzi'),
        scrollReveal: checked('cfgWScrollReveal'),
        particles: checked('cfgWParticles'),
        particlesPreset: val('cfgWParticlesPreset'),
        typing: checked('cfgWTyping'),
        typingText: typingText,
        utterances: {
          enabled: checked('cfgUtterEnabled'),
          repo: val('cfgUtterRepo'),
          issueTerm: val('cfgUtterIssueTerm'),
          theme: 'github-light'
        },
        gitalk: {
          enabled: checked('cfgGitalkEnabled'),
          clientID: val('cfgGitalkClientID'),
          clientSecret: val('cfgGitalkClientSecret'),
          repo: val('cfgGitalkRepo')
        }
      },
      animation: {
        speed: val('cfgAnimSpeed')
      }
    };
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

  /* 打开设置面板：填仓库设置 + 从远端加载站点配置 */
  document.getElementById('btnSettings').addEventListener('click', function () {
    fillRepoSettings();
    showPanel('settings');
    getSiteConfigMeta().then(function (res) {
      state.configSha = res.sha;
      fillConfigForm(res.config);
      /* 应用主题与外观到后台，便于预览效果 */
      applyAppearance(res.config);
      applyTheme();
    }).catch(function () {
      fillConfigForm(SITE_CFG);
      state.configSha = null;
    });
  });

  /* 保存仓库设置（localStorage） */
  document.getElementById('btnSaveRepo').addEventListener('click', function () {
    var s = {
      owner: document.getElementById('setOwner').value.trim(),
      repo: document.getElementById('setRepo').value.trim(),
      branch: document.getElementById('setBranch').value.trim(),
      token: document.getElementById('setToken').value.trim()
    };
    if (!s.owner || !s.repo || !s.branch || !s.token) {
      showToast('请填写完整仓库信息', 'error');
      return;
    }
    saveSettings(s);
    apiRequest('/user').then(function (user) {
      showToast('仓库设置已保存', 'success');
      enterApp(user);
    }).catch(function (err) {
      showToast('Token 验证失败：' + err.message, 'error');
    });
  });

  /* 保存站点配置（推送到仓库根 site-config.json） */
  document.getElementById('btnSaveConfig').addEventListener('click', function () {
    var cfg = collectConfigForm();
    var btn = document.getElementById('btnSaveConfig');
    btn.disabled = true;
    btn.textContent = '保存中…';
    /* 保存前重新读取远端 sha，避免覆盖他人修改 */
    getSiteConfigMeta().then(function (res) {
      return saveSiteConfig(cfg, res.sha);
    }).then(function () {
      state.configSha = null;
      btn.disabled = false;
      btn.textContent = '保存站点配置';
      showToast('站点配置已保存，Pages 约 1 分钟后生效', 'success');
      SITE_CFG = deepMerge(JSON.parse(JSON.stringify(window.DEFAULT_SITE_CONFIG)), cfg);
      applyAppearance(SITE_CFG);
      applyTheme();
    }).catch(function (err) {
      btn.disabled = false;
      btn.textContent = '保存站点配置';
      showToast('保存失败：' + err.message, 'error');
    });
  });

  document.getElementById('btnBackFromSet').addEventListener('click', function () {
    showPanel('list');
  });

  /* ----------------------------------------------------------
   * 登出
   * -------------------------------------------------------- */
  document.getElementById('btnLogout').addEventListener('click', function () {
    if (!window.confirm('确定登出？本浏览器保存的 Token 将被清除。')) {
      return;
    }
    clearSettings();
    location.reload();
  });

  /* ----------------------------------------------------------
   * 启动
   * -------------------------------------------------------- */
  initSettingsTabs();
  loadSiteConfigFile().then(function (cfg) {
    /* 后台应用主题与外观（配合右下角深浅色按钮） */
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
