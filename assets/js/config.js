/* ============================================================
 * ink-blog 公共配置与 GitHub API 封装
 * 前台与后台共用，纯静态、零构建，直接部署到 GitHub Pages
 * ============================================================ */

/* 站点默认配置：部署前把 owner 改成你的 GitHub 用户名 */
window.SiteConfig = {
  owner: 'Wineink',
  repo: 'Jiumo_blog',
  branch: 'main',
  postsDir: 'posts',
  siteTitle: '墨迹博客',
  siteDesc: '一个托管在 GitHub Pages 上的静态博客，在 /admin 后台写作发布'
};

/* 后台设置在 localStorage 中的键名 */
var STORE_KEY = 'ink_blog_admin';
var DRAFT_KEY = 'ink_blog_draft';

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
      cfg.repo = saved.repo || cfg.repo;
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

/* 读取文章原文：优先走 raw（不占 API 限额），失败回退 Contents API（支持私有仓库） */
function getPostRaw(filename) {
  var c = getConfig();
  var rawUrl = 'https://raw.githubusercontent.com/' + c.owner + '/' + c.repo +
    '/' + c.branch + '/' + c.postsDir + '/' + filename;
  return fetch(rawUrl).then(function (res) {
    if (!res.ok) {
      throw new Error('raw 加载失败：HTTP ' + res.status);
    }
    return res.text();
  }).catch(function () {
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
