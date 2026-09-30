/* ============================================================
 * Jiumo_Page 公共配置与 GitHub API 封装
 * 前台与后台共用，纯静态、零构建，直接部署到 GitHub Pages
 *
 * 配置体系说明（为以后开发主题做准备）：
 * 1. window.SiteConfig      -> 部署信息（owner / repo / branch / postsDir）
 * 2. window.DEFAULT_SITE_CONFIG -> 站点可视化配置的默认值（主题、布局、模块）
 * 3. site-config.json（仓库根） -> 后台保存的可视化配置，前台加载后与默认值合并
 *    所以前端显示的一切（站点名、头像、侧栏、主题色、模块开关）都可后台配置
 * 4. SITE_CFG              -> 当前生效的合并后配置，页面元素通过 applySiteConfig 应用
 * ============================================================ */

/* 站点默认配置：部署前把 owner 改成你的 GitHub 用户名 */
window.SiteConfig = {
  owner: 'Wineink',
  repo: 'Jiumo_Page',
  branch: 'main',
  postsDir: 'posts',
  siteTitle: '酒墨的页面',
  siteDesc: '一个托管在 GitHub Pages 上的静态页面，在 /admin 后台管理'
};

/* 后台设置在 localStorage 中的键名（保留旧键名，用户无需重新登录） */
var STORE_KEY = 'jiumo_blog_admin';
var DRAFT_KEY = 'jiumo_blog_draft';
var THEME_KEY = 'jiumo_theme';   /* 用户手动切换的深浅主题记忆 */

/* 站点可视化配置默认值：仓库根 site-config.json 不存在或字段缺失时使用 */
window.DEFAULT_SITE_CONFIG = {
  site: {
    title: '酒墨的页面',
    desc: '一个托管在 GitHub Pages 上的静态页面，在 /admin 后台管理'
  },
  profile: {
    showAvatar: true,          /* 是否显示头像 */
    avatar: '',                /* 头像图片地址，留空则用默认首字母头像 */
    avatarShape: 'circle',     /* circle 圆形 / square 方形 */
    intro: '欢迎来到酒墨的页面；记录生活与代码'
  },
  layout: {
    showSearch: true,          /* 首页是否显示搜索框 */
    showSummary: true,         /* 文章卡片是否显示摘要 */
    pageSize: 20               /* 首页每页显示文章数 */
  },
  sidebar: {
    enabled: true,             /* 是否显示右侧模块 */
    sticky: true,              /* 是否固定不随页面上下滑动 */
    modules: [                 /* 侧栏模块列表，可后台增删开关与排序 */
      { id: 'about', enabled: true, title: '关于本站',
        content: '这里可以放公告、简介、友情链接等内容。\n\n> 在后台「组件模块」中修改，支持 Markdown。' },
      { id: 'datetime', enabled: true, title: '日期时间',
        showDate: true, showTime: true, format12: false },
      { id: 'weather', enabled: false, title: '天气',
        city: '无锡', lat: 31.49, lon: 120.31, unit: 'celsius' },
      { id: 'ghchart', enabled: false, title: 'GitHub 贡献',
        username: 'Wineink' },
      { id: 'stats', enabled: false, title: '访问统计',
        showPv: true, showUv: false }
    ]
  },
  appearance: {
    theme: 'light',            /* light 浅色 / dark 深色 / auto 跟随系统 */
    accent: '#0f766e',         /* 浅色主题主色 */
    accentDark: '#14b8a6',     /* 深色主题主色 */
    buttonStyle: 'rounded',    /* rounded 圆角 / square 直角 */
    radius: 12,                /* 卡片圆角像素 */
    fontSize: 16               /* 正文字号像素 */
  },
  widgets: {
    backToTop: true,           /* 右下角回到顶部按钮 */
    darkToggle: true,          /* 深浅色切换按钮 */
    darkTogglePos: 'bottom-right', /* 深浅色按钮位置：bottom-right 右下角 / top-right 右上角 / hidden 隐藏 */
    headerButtons: [],         /* 右上角自定义按钮：[{text, url}]，显示在设置按钮左侧 */
    busuanzi: true,            /* 不蒜子浏览量统计 */
    scrollReveal: true,        /* 滚动入场动画 */
    particles: false,          /* 粒子背景 */
    particlesPreset: 'default',/* default 连线粒子 / snow 雪花 */
    typing: false,             /* 打字机效果 */
    typingText: ['欢迎来到酒墨的页面', '记录生活与代码'],
    gitalk: { enabled: false, clientID: '', clientSecret: '', repo: '' },
    utterances: { enabled: false, repo: '', issueTerm: 'pathname', theme: 'github-light' }
  },
  animation: {
    speed: 'normal'            /* slow 慢 / normal 正常 / fast 快 */
  }
};

/* 当前生效的可视化配置（加载 site-config.json 后合并，未加载时等于默认值） */
var SITE_CFG = JSON.parse(JSON.stringify(window.DEFAULT_SITE_CONFIG));

/* 深度合并对象 b 到 a（用于配置与默认值合并，数组直接覆盖） */
function deepMerge(a, b) {
  if (!b || typeof b !== 'object') {
    return a;
  }
  Object.keys(b).forEach(function (k) {
    var v = b[k];
    if (v && typeof v === 'object' && !Array.isArray(v) &&
        a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) {
      deepMerge(a[k], v);
    } else {
      a[k] = v;
    }
  });
  return a;
}

/* site-config.json 的相对路径：后台页面在 /admin/ 目录下，要回到仓库根 */
function siteConfigUrl() {
  return location.pathname.indexOf('/admin/') !== -1 ?
    '../site-config.json' : 'site-config.json';
}

/* 后台应用设置后的跨标签页广播键：前台收到 storage 事件立即热更新配置 */
var CFG_PUSH_KEY = 'jiumo_cfg_push';

/* 加载仓库根 site-config.json；文件不存在或读取失败时使用默认配置
 * 走 no-store + 时间戳，绕过 GitHub Pages 静态缓存，保证设置完立即生效 */
function loadSiteConfigFile() {
  var url = siteConfigUrl();
  url += (url.indexOf('?') === -1 ? '?' : '&') + 't=' + Date.now();
  return fetch(url, { cache: 'no-store' }).then(function (res) {
    if (!res.ok) {
      throw new Error('config missing');
    }
    return res.json();
  }).then(function (json) {
    migrateSidebarConfig(json);
    SITE_CFG = deepMerge(JSON.parse(JSON.stringify(window.DEFAULT_SITE_CONFIG)), json);
    return SITE_CFG;
  }).catch(function () {
    SITE_CFG = JSON.parse(JSON.stringify(window.DEFAULT_SITE_CONFIG));
    return SITE_CFG;
  });
}

/* 前台配置热更新：
 * 1. 后台「应用所有设置」保存成功后广播 storage 事件，前台立即重拉配置并应用；
 * 2. 兜底轮询（默认 60 秒，可在后台 layout.configRefresh 调），配置变化自动生效；
 * 3. 只在配置真正变化时重建页面元素，避免无谓闪烁。 */
function startConfigWatch() {
  if (location.pathname.indexOf('/admin/') !== -1) {
    return; /* 后台页面不轮询 */
  }
  _cfgLastJson = JSON.stringify(SITE_CFG);
  var applyIfChanged = function () {
    loadSiteConfigFile().then(function (cfg) {
      var now = JSON.stringify(cfg);
      if (now !== _cfgLastJson) {
        _cfgLastJson = now;
        if (window.applySiteConfig) {
          applySiteConfig(cfg);
          showToast('设置已更新，页面已自动应用', 'success');
        }
      }
    }).catch(function () {});
  };
  window.addEventListener('storage', function (e) {
    if (e.key === CFG_PUSH_KEY) {
      applyIfChanged();
    }
  });
  var refresh = (SITE_CFG.layout && SITE_CFG.layout.configRefresh) || 60;
  setInterval(applyIfChanged, Math.max(10, refresh) * 1000);
}
var _cfgLastJson = '';

/* 兼容旧版 sidebar 配置：只有 title/content 时转成 modules 数组 */
function migrateSidebarConfig(json) {
  if (!json || !json.sidebar) {
    return;
  }
  if (!json.sidebar.modules &&
      (json.sidebar.content || json.sidebar.title)) {
    json.sidebar.modules = [{
      id: 'about',
      enabled: true,
      title: json.sidebar.title || '关于本站',
      content: json.sidebar.content || ''
    }];
    delete json.sidebar.title;
    delete json.sidebar.content;
  }
}

/* 读取配置：默认配置与后台保存的配置合并 */
function getConfig() {
  var cfg = {};
  for (var k in window.SiteConfig) {
    cfg[k] = window.SiteConfig[k];
  }
  cfg.token = '';
  try {
    var saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (saved) {
      cfg.owner = saved.owner || cfg.owner;
      /* 仓库改名兼容：旧浏览器里保存的还是 Jiumo_blog，自动使用新名，无需重新登录 */
      cfg.repo = (saved.repo === 'Jiumo_blog' || !saved.repo) ? cfg.repo : saved.repo;
      cfg.branch = saved.branch || cfg.branch;
      cfg.token = saved.token || '';
    }
  } catch (e) {}
  return cfg;
}

/* 保存后台登录设置 */
function saveSettings(s) {
  localStorage.setItem(STORE_KEY, JSON.stringify(s));
}

/* 清除后台登录设置 */
function clearSettings() {
  localStorage.removeItem(STORE_KEY);
}

function getToken() {
  return getConfig().token;
}

/* ------------------------------------------------------------
 * GitHub REST API 请求封装
 * ---------------------------------------------------------- */
function apiRequest(path, options) {
  options = options || {};
  var headers = options.headers || {};
  headers['Accept'] = 'application/vnd.github+json';
  headers['X-GitHub-Api-Version'] = '2022-11-28';
  var token = getToken();
  if (token) {
    headers['Authorization'] = 'Bearer ' + token;
  }
  return fetch('https://api.github.com' + path, {
    method: options.method || 'GET',
    headers: headers,
    body: options.body || undefined
  }).then(function (res) {
    return res.text().then(function (text) {
      var data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (e) {
        data = { message: text };
      }
      if (!res.ok) {
        var err = new Error((data && data.message) || ('请求失败：HTTP ' + res.status));
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return data;
    });
  });
}

/* 获取 posts 目录下的 Markdown 文件列表（公开仓库无需 Token） */
function listPostFiles() {
  var c = getConfig();
  var path = '/repos/' + c.owner + '/' + c.repo + '/contents/' + c.postsDir +
    '?ref=' + encodeURIComponent(c.branch);
  return apiRequest(path).then(function (items) {
    return (Array.isArray(items) ? items : [])
      .filter(function (f) {
        return f.type === 'file' && /\.md$/i.test(f.name);
      })
      .map(function (f) {
        return { name: f.name, sha: f.sha, path: f.path };
      });
  });
}

/* 读取文章原文：优先走 raw（不占 API 限额），5 秒超时后回退 Contents API（支持私有仓库） */
function getPostRaw(filename) {
  var c = getConfig();
  var rawUrl = 'https://raw.githubusercontent.com/' + c.owner + '/' + c.repo +
    '/' + c.branch + '/' + c.postsDir + '/' + filename;
  var ctrl = new AbortController();
  var timer = setTimeout(function () {
    ctrl.abort();
  }, 5000);
  return fetch(rawUrl, { signal: ctrl.signal }).then(function (res) {
    clearTimeout(timer);
    if (!res.ok) {
      throw new Error('raw 加载失败：HTTP ' + res.status);
    }
    return res.text();
  }).catch(function () {
    clearTimeout(timer);
    var path = '/repos/' + c.owner + '/' + c.repo + '/contents/' + c.postsDir +
      '/' + filename + '?ref=' + encodeURIComponent(c.branch);
    return apiRequest(path).then(function (data) {
      return base64ToUtf8(data.content || '');
    });
  });
}

/* 后台读取单个文章元信息（含 sha，用于更新/删除） */
function getPostMeta(filename) {
  var c = getConfig();
  var path = '/repos/' + c.owner + '/' + c.repo + '/contents/' + c.postsDir +
    '/' + filename + '?ref=' + encodeURIComponent(c.branch);
  return apiRequest(path);
}

/* 新建或更新文章（sha 为空表示新建） */
function savePost(filename, content, sha, message) {
  var c = getConfig();
  var payload = {
    message: message || ('发布文章：' + filename),
    content: utf8ToBase64(content),
    branch: c.branch
  };
  if (sha) {
    payload.sha = sha;
  }
  var path = '/repos/' + c.owner + '/' + c.repo + '/contents/' + c.postsDir + '/' + filename;
  return apiRequest(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

/* 删除文章 */
function removePost(filename, sha) {
  var c = getConfig();
  var path = '/repos/' + c.owner + '/' + c.repo + '/contents/' + c.postsDir +
    '/' + filename + '?ref=' + encodeURIComponent(c.branch);
  return apiRequest(path, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: '删除文章：' + filename,
      branch: c.branch,
      sha: sha
    })
  });
}

/* ------------------------------------------------------------
 * site-config.json 的读取与保存（后台设置面板使用）
 * ---------------------------------------------------------- */
/* 读取仓库根 site-config.json 内容（含 sha，用于更新），不存在则返回默认配置 */
function getSiteConfigMeta() {
  var c = getConfig();
  var path = '/repos/' + c.owner + '/' + c.repo + '/contents/site-config.json?ref=' +
    encodeURIComponent(c.branch);
  return apiRequest(path).then(function (data) {
    var cfg = null;
    try {
      cfg = JSON.parse(base64ToUtf8(data.content || '{}'));
    } catch (e) {
      cfg = null;
    }
    migrateSidebarConfig(cfg);
    return {
      sha: data.sha,
      config: deepMerge(JSON.parse(JSON.stringify(window.DEFAULT_SITE_CONFIG)), cfg)
    };
  }).catch(function () {
    return {
      sha: null,
      config: JSON.parse(JSON.stringify(window.DEFAULT_SITE_CONFIG))
    };
  });
}

/* 保存 site-config.json 到仓库根 */
function saveSiteConfig(config, sha) {
  var c = getConfig();
  var payload = {
    message: '更新站点配置：site-config.json',
    content: utf8ToBase64(JSON.stringify(config, null, 2) + '\n'),
    branch: c.branch
  };
  if (sha) {
    payload.sha = sha;
  }
  var path = '/repos/' + c.owner + '/' + c.repo + '/contents/site-config.json';
  return apiRequest(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

/* ------------------------------------------------------------
 * Base64 与 UTF-8 互转（保证中文不乱码）
 * ---------------------------------------------------------- */
function utf8ToBase64(str) {
  var bytes = new TextEncoder().encode(str);
  var bin = '';
  for (var i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

function base64ToUtf8(b64) {
  var bin = atob((b64 || '').replace(/\s/g, ''));
  var bytes = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

/* ------------------------------------------------------------
 * Markdown Front Matter 解析与生成
 * ---------------------------------------------------------- */
function parseFrontMatter(raw) {
  var meta = { title: '', date: '', tags: [], summary: '' };
  var body = raw;
  var m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (m) {
    body = m[2];
    m[1].split(/\r?\n/).forEach(function (line) {
      var p = /^([A-Za-z_]+)\s*:\s*(.*)$/.exec(line);
      if (!p) {
        return;
      }
      var key = p[1].trim();
      var val = p[2].trim();
      if (key === 'tags') {
        meta.tags = val.replace(/^\[|\]$/g, '').split(',')
          .map(function (t) { return unquoteYaml(t.trim()); })
          .filter(Boolean);
      } else {
        meta[key] = unquoteYaml(val);
      }
    });
  }
  meta.body = body;
  return meta;
}

/* 去掉 YAML 值外层引号并还原转义 */
function unquoteYaml(val) {
  var v = String(val == null ? '' : val).trim();
  var first = v.charAt(0);
  var last = v.charAt(v.length - 1);
  if (first === '"' && last === '"' && v.length >= 2) {
    return v.slice(1, -1).replace(/\\(.)/g, function (m, c) {
      if (c === 'n') return '\n';
      if (c === 't') return '\t';
      return c;
    });
  }
  if (first === "'" && last === "'" && v.length >= 2) {
    return v.slice(1, -1).replace(/''/g, "'");
  }
  return v;
}

function quoteYaml(s) {
  return '"' + String(s == null ? '' : s).replace(/"/g, '\\"') + '"';
}

function buildFrontMatter(meta) {
  var tags = (meta.tags || [])
    .map(function (t) { return String(t).trim(); })
    .filter(Boolean);
  var lines = ['---'];
  lines.push('title: ' + quoteYaml(meta.title));
  lines.push('date: ' + meta.date);
  if (tags.length) {
    lines.push('tags: [' + tags.map(quoteYaml).join(', ') + ']');
  }
  if (meta.summary) {
    lines.push('summary: ' + quoteYaml(meta.summary));
  }
  lines.push('---');
  return lines.join('\n') + '\n\n';
}

/* ------------------------------------------------------------
 * 工具函数
 * ---------------------------------------------------------- */
function pad2(n) {
  return (n < 10 ? '0' : '') + n;
}

function todayStr() {
  var d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

/* 由标题生成文件名片段：保留中文、字母与数字 */
function slugify(title) {
  var s = String(title || '').toLowerCase().trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'post';
}

/* 新建文章的默认文件名：日期-标题 slug */
function buildFilename(title, date) {
  return (date || todayStr()) + '-' + slugify(title) + '.md';
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c];
  });
}

/* Markdown 渲染为 HTML */
function renderMarkdown(md) {
  if (window.marked) {
    marked.setOptions({ gfm: true, breaks: false });
    return marked.parse(md);
  }
  return '<pre>' + escapeHtml(md) + '</pre>';
}

/* 修正文章正文里的相对资源地址，统一加上 posts 目录前缀 */
function fixRelativeLinks(container, dirPrefix) {
  container.querySelectorAll('img[src]').forEach(function (img) {
    var src = img.getAttribute('src');
    if (!/^https?:\/\//i.test(src) && !src.startsWith('/') && !src.startsWith('data:')) {
      img.setAttribute('src', dirPrefix + '/' + src);
    }
  });
  container.querySelectorAll('a[href]').forEach(function (a) {
    var href = a.getAttribute('href');
    if (!/^https?:\/\//i.test(href) && !href.startsWith('/') &&
        !href.startsWith('#') && !href.startsWith('mailto:')) {
      a.setAttribute('href', dirPrefix + '/' + href);
    }
  });
}

/* 简单的页面提示 toast */
function showToast(msg, type) {
  var el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = 'toast show' + (type === 'error' ? ' error' : type === 'success' ? ' success' : '');
  clearTimeout(el._timer);
  el._timer = setTimeout(function () {
    el.className = 'toast';
  }, 2600);
}

/* ------------------------------------------------------------
 * 主题与外观应用（前台与后台共用）
 * ---------------------------------------------------------- */
/* 计算当前主题：配置模式 > 跟随系统 */
function resolveTheme(mode) {
  var m = mode || 'light';
  if (m === 'auto') {
    return (window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  return m === 'dark' ? 'dark' : 'light';
}

/* 应用主题到 document，返回实际主题；用户手动切换优先于配置 */
function applyTheme(force) {
  var saved = null;
  try {
    saved = localStorage.getItem(THEME_KEY);
  } catch (e) {}
  var theme;
  if (force) {
    theme = force;
  } else if (saved) {
    theme = saved;
  } else {
    theme = resolveTheme(SITE_CFG.appearance && SITE_CFG.appearance.theme);
  }
  document.documentElement.setAttribute('data-theme', theme);
  var btn = document.getElementById('btnDark');
  if (btn) {
    btn.textContent = theme === 'dark' ? '☀' : '☾';
  }
  return theme;
}

/* 应用外观变量（主色、圆角、字号、按钮样式） */
function applyAppearance(cfg) {
  var a = (cfg && cfg.appearance) || {};
  var root = document.documentElement;
  root.style.setProperty('--accent', a.accent || '#0f766e');
  root.style.setProperty('--accent-dark-custom', a.accentDark || '#14b8a6');
  root.style.setProperty('--radius', (a.radius || 12) + 'px');
  root.style.setProperty('--font-size', (a.fontSize || 16) + 'px');
  root.classList.toggle('btn-square', a.buttonStyle === 'square');
}

/* 生成默认头像：SVG 圆形底 + 站点名首字符 */
function defaultAvatar(title) {
  var ch = String(title || 'B').trim().charAt(0).toUpperCase() || 'B';
  var svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>" +
    "<rect width='100' height='100' rx='50' fill='#0f766e'/>" +
    "<text x='50' y='70' font-size='52' text-anchor='middle' fill='#ffffff' font-family='sans-serif'>" +
    ch + '</text></svg>';
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

/* 应用站点可视化配置到页面元素（主题/头像/侧栏/模块/按钮） */
function applySiteConfig(cfg) {
  cfg = cfg || SITE_CFG;
  var s = cfg.site || {};
  var p = cfg.profile || {};
  var sb = cfg.sidebar || {};
  var w = cfg.widgets || {};

  /* 站点名与简介 */
  var titleEl = document.getElementById('siteTitle');
  if (titleEl && s.title) {
    titleEl.textContent = s.title;
  }
  var descEl = document.getElementById('siteDesc');
  if (descEl && s.desc) {
    descEl.textContent = s.desc;
  }

  /* 头像模块 */
  var avatarEl = document.getElementById('profileAvatar');
  if (avatarEl) {
    if (p.showAvatar) {
      avatarEl.classList.remove('hidden');
      avatarEl.src = p.avatar || defaultAvatar(s.title);
      avatarEl.className = 'avatar shape-' + (p.avatarShape === 'square' ? 'square' : 'circle');
      avatarEl.onerror = function () {
        this.src = defaultAvatar(s.title);
      };
    } else {
      avatarEl.classList.add('hidden');
    }
  }
  var nameEl = document.getElementById('profileName');
  if (nameEl) {
    nameEl.textContent = s.title || '';
  }
  var introEl = document.getElementById('profileIntro');
  if (introEl) {
    /* 打字机启用时隐藏静态介绍行，避免信息重复；未启用时显示静态介绍 */
    if (w.typing) {
      introEl.classList.add('hidden');
    } else {
      introEl.classList.remove('hidden');
      introEl.textContent = p.intro || '';
    }
  }

  /* 右侧侧栏模块（多模块：关于/日期时间/天气/GitHub 贡献/访问统计） */
  var sbPanel = document.getElementById('sidebarPanel');
  if (sbPanel) {
    if (sb.enabled) {
      sbPanel.classList.remove('hidden');
      sbPanel.classList.toggle('sticky-panel', !!sb.sticky);
      renderSidebarModules(cfg);
    } else {
      sbPanel.classList.add('hidden');
    }
  }

  /* 外观 */
  applyAppearance(cfg);
  applyTheme();

  /* 头部右上角：自定义按钮 + 暗色切换按钮（位置由后台配置） */
  var headerBtns = document.getElementById('headerBtns');
  if (headerBtns) {
    /* 先移除上一次渲染的自定义按钮，保留设置按钮 */
    headerBtns.querySelectorAll('.hdr-btn.custom').forEach(function (el) {
      el.remove();
    });
    var hbs = (w.headerButtons || []).filter(function (b) {
      return b && b.text && b.url;
    });
    hbs.forEach(function (b) {
      var a = document.createElement('a');
      a.className = 'hdr-btn custom';
      a.href = b.url;
      a.target = b.url.indexOf('http') === 0 ? '_blank' : '';
      a.rel = 'noopener';
      a.textContent = b.text;
      /* 插到设置按钮之前 */
      var setBtn = headerBtns.querySelector('a.hdr-btn[href="admin/index.html"]');
      headerBtns.insertBefore(a, setBtn);
    });
  }

  var cornerBtns = document.querySelector('.corner-btns');
  var btnDark = document.getElementById('btnDark');
  if (btnDark && headerBtns) {
    var pos = w.darkTogglePos || 'bottom-right';
    if (pos === 'top-right') {
      if (w.darkToggle !== false) {
        headerBtns.appendChild(btnDark);
        btnDark.classList.remove('hidden');
      } else {
        btnDark.classList.add('hidden');
      }
    } else if (pos === 'hidden') {
      btnDark.classList.add('hidden');
    } else {
      /* 默认右下角 */
      if (w.darkToggle !== false && cornerBtns) {
        cornerBtns.appendChild(btnDark);
        btnDark.classList.remove('hidden');
      } else {
        btnDark.classList.add('hidden');
      }
    }
  }

  /* 右下角按钮显隐 */
  var btnTop = document.getElementById('btnTop');
  if (btnTop) {
    btnTop.classList.toggle('hidden', !w.backToTop);
  }

  /* 页脚浏览量标签（不蒜子）显隐 */
  var pvWrap = document.getElementById('pvWrap');
  if (pvWrap) {
    pvWrap.classList.toggle('hidden', !w.busuanzi);
  }
}

/* ------------------------------------------------------------
 * 侧栏多模块渲染（关于/日期时间/天气/GitHub 贡献/访问统计）
 * 模块列表、开关与参数全部来自后台「组件模块」配置
 * ---------------------------------------------------------- */
var _sidebarTimers = [];

function clearSidebarTimers() {
  _sidebarTimers.forEach(function (t) { clearInterval(t); clearTimeout(t); });
  _sidebarTimers = [];
}

function renderSidebarModules(cfg) {
  var container = document.getElementById('sidebarModules');
  if (!container) {
    return;
  }
  clearSidebarTimers();
  var sb = cfg.sidebar || {};
  var modules = (sb.modules || []).filter(function (m) { return m && m.enabled; });
  if (!modules.length) {
    container.innerHTML = '<div class="state-box" style="padding:20px 10px;">暂无启用的模块</div>';
    return;
  }
  var html = modules.map(function (m) {
    return '<div class="sidebar-module reveal" data-id="' + escapeHtml(m.id) + '">' +
      '<h3>' + escapeHtml(m.title || '') + '</h3>' +
      '<div class="module-body" data-id="' + escapeHtml(m.id) + '"></div>' +
      '</div>';
  }).join('');
  container.innerHTML = html;

  modules.forEach(function (m) {
    var body = container.querySelector('.module-body[data-id="' + m.id + '"]');
    if (!body) {
      return;
    }
    if (m.id === 'about') {
      body.innerHTML = renderMarkdown(m.content || '');
      fixRelativeLinks(body, getConfig().postsDir);
    } else if (m.id === 'datetime') {
      renderDatetimeModule(body, m);
    } else if (m.id === 'weather') {
      renderWeatherModule(body, m);
    } else if (m.id === 'ghchart') {
      renderGhChartModule(body, m);
    } else if (m.id === 'stats') {
      renderStatsModule(body, m);
    }
  });
}

/* 日期时间模块 */
function renderDatetimeModule(body, m) {
  var pad2n = function (n) { return (n < 10 ? '0' : '') + n; };
  var week = ['日', '一', '二', '三', '四', '五', '六'];
  var render = function () {
    var d = new Date();
    var dateStr = d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 星期' + week[d.getDay()];
    var h = m.format12 ? (d.getHours() % 12 || 12) : d.getHours();
    var ap = m.format12 ? (d.getHours() >= 12 ? ' 下午' : ' 上午') : '';
    var timeStr = pad2n(h) + ':' + pad2n(d.getMinutes()) + ':' + pad2n(d.getSeconds()) + ap;
    body.innerHTML =
      (m.showDate !== false ? '<div class="dt-date">' + dateStr + '</div>' : '') +
      (m.showTime !== false ? '<div class="dt-time">' + timeStr + '</div>' : '');
  };
  render();
  _sidebarTimers.push(setInterval(render, 1000));
}

/* 天气模块（Open-Meteo 免费接口，无需密钥） */
function renderWeatherModule(body, m) {
  var codes = {
    0: '晴', 1: '大致晴朗', 2: '多云', 3: '阴',
    45: '雾', 48: '雾凇', 51: '小毛毛雨', 53: '毛毛雨', 55: '大毛毛雨',
    61: '小雨', 63: '中雨', 65: '大雨', 66: '冻雨', 67: '强冻雨',
    71: '小雪', 73: '中雪', 75: '大雪', 77: '雪粒',
    80: '小阵雨', 81: '阵雨', 82: '强阵雨', 85: '小阵雪', 86: '强阵雪',
    95: '雷暴', 96: '雷暴伴小冰雹', 99: '雷暴伴大冰雹'
  };
  body.innerHTML = '<div class="state-box" style="padding:16px 0;">天气加载中…</div>';
  var url = 'https://api.open-meteo.com/v1/forecast?latitude=' +
    encodeURIComponent(m.lat || 0) + '&longitude=' + encodeURIComponent(m.lon || 0) +
    '&current_weather=true&timezone=auto';
  var ctrl = new AbortController();
  var timer = setTimeout(function () { ctrl.abort(); }, 8000);
  fetch(url, { signal: ctrl.signal }).then(function (res) {
    clearTimeout(timer);
    if (!res.ok) {
      throw new Error('http ' + res.status);
    }
    return res.json();
  }).then(function (data) {
    var cw = data && data.current_weather;
    if (!cw) {
      throw new Error('no data');
    }
    var unit = m.unit === 'fahrenheit' ? '°F' : '°C';
    var temp = m.unit === 'fahrenheit' ?
      Math.round(cw.temperature * 9 / 5 + 32) : Math.round(cw.temperature);
    body.innerHTML =
      '<div class="weather-row"><span class="weather-emoji">' + weatherEmoji(cw.weathercode) +
      '</span><span class="weather-temp">' + temp + unit + '</span></div>' +
      '<div class="weather-desc">' + (codes[cw.weathercode] || '未知天气') +
      (m.city ? ' · ' + escapeHtml(m.city) : '') + '</div>' +
      '<div class="weather-extra">风速 ' + Math.round(cw.windspeed) + ' km/h</div>';
  }).catch(function () {
    clearTimeout(timer);
    body.innerHTML = '<div class="state-box" style="padding:16px 0;">天气加载失败</div>';
  });
}

function weatherEmoji(code) {
  if (code === 0 || code === 1) return '☀️';
  if (code === 2) return '⛅';
  if (code === 3) return '☁️';
  if (code >= 45 && code <= 48) return '🌫️';
  if (code >= 51 && code <= 67) return '🌧️';
  if (code >= 71 && code <= 77) return '❄️';
  if (code >= 80 && code <= 82) return '🌦️';
  if (code >= 85 && code <= 86) return '🌨️';
  if (code >= 95) return '⛈️';
  return '🌡️';
}

/* GitHub 贡献热力图模块（ghchart SVG 服务） */
function renderGhChartModule(body, m) {
  var user = (m.username || getConfig().owner).trim();
  body.innerHTML = '<div class="ghchart-wrap"><img class="ghchart" alt="' +
    escapeHtml(user) + ' 的 GitHub 贡献图" src="https://ghchart.rshah.org/' +
    encodeURIComponent(user) + '" onerror="this.closest(\'.ghchart-wrap\').innerHTML=\'<div class=state-box style=padding:12px 0;>贡献图加载失败</div>\'"></div>' +
    '<div class="ghchart-user">@' + escapeHtml(user) + '</div>';
}

/* 访问统计模块（复用不蒜子页脚数据） */
function renderStatsModule(body, m) {
  var html = '';
  if (m.showPv !== false) {
    html += '<div class="stat-row">全站浏览 <b class="stat-pv">-</b> 次</div>';
  }
  if (m.showUv) {
    html += '<div class="stat-row">访客数 <b class="stat-uv">-</b> 人</div>';
  }
  body.innerHTML = html;
  var tick = function () {
    var pv = document.getElementById('busuanzi_value_site_pv');
    var uv = document.getElementById('busuanzi_value_site_uv');
    if (pv && m.showPv !== false) {
      var el = body.querySelector('.stat-pv');
      if (el && pv.textContent) {
        el.textContent = pv.textContent;
      }
    }
    if (uv && m.showUv) {
      var el2 = body.querySelector('.stat-uv');
      if (el2 && uv.textContent) {
        el2.textContent = uv.textContent;
      }
    }
  };
  tick();
  _sidebarTimers.push(setInterval(tick, 2500));
}

/* 按需加载外部脚本 */
function loadScript(src, onload) {
  var s = document.createElement('script');
  s.src = src;
  s.async = true;
  if (onload) {
    s.onload = onload;
  }
  document.head.appendChild(s);
}
