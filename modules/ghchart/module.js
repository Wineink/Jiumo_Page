/* ============================================================
 * 模块：GitHub 贡献热力图（ghchart）
 * 数据来自公开聚合 API（github-contributions-api），无需 Key
 * 支持时间范围（全年/半年/三个月/一个月）与显示样式
 * ============================================================ */
window.JiumoModules = window.JiumoModules || {};

window.JiumoModules.ghchart = {
  id: 'ghchart',
  fields: [
    { key: 'title', label: '模块标题', type: 'text' },
    { key: 'username', label: 'GitHub 用户名', type: 'text' },
    { key: 'period', label: '时间范围', type: 'select',
      options: [['year', '全年'], ['half', '半年'], ['quarter', '三个月'], ['month', '一个月']] },
    { key: 'style', label: '显示样式', type: 'select',
      options: [['classic', '经典绿'], ['dark', '深色'], ['coral', '珊瑚橙'], ['custom', '自定义色']] },
    { key: 'color', label: '自定义主色（选择「自定义色」时生效）', type: 'text' },
    { key: 'rounded', label: '方块圆角', type: 'checkbox' }
  ],
  render: function (el, m) {
    var user = (m.username || (window.getConfig ? getConfig().owner : '') || '').trim();
    var wrap = document.createElement('div');
    wrap.className = 'ghchart-wrap';
    wrap.innerHTML =
      '<div class="ghchart-loading">正在加载贡献数据…</div>' +
      '<div class="ghchart-user">@' + escapeHtml(user) + '</div>';
    el.appendChild(wrap);
    if (!user) {
      wrap.innerHTML = '<div class="state-box" style="padding:12px 0;">请先在后台填写 GitHub 用户名</div>';
      return;
    }
    var api = 'https://github-contributions-api.jogruber.de/v4/' + encodeURIComponent(user);
    var opts = { method: 'GET' };
    fetch(api, opts).then(function (res) {
      if (!res.ok) {
        throw new Error('HTTP ' + res.status);
      }
      return res.json();
    }).then(function (data) {
      var list = (data && data.contributions) || [];
      if (!list.length) {
        wrap.innerHTML = '<div class="state-box" style="padding:12px 0;">未获取到贡献数据</div>';
        return;
      }
      wrap.innerHTML =
        drawChart(list, m) + '<div class="ghchart-user">@' + escapeHtml(user) + '</div>';
    }).catch(function () {
      wrap.innerHTML =
        '<div class="state-box" style="padding:12px 0;">贡献图加载失败' +
        '<br><button class="ghchart-retry">重试</button></div>';
      var retry = wrap.querySelector('.ghchart-retry');
      if (retry) {
        retry.addEventListener('click', function () {
          window.JiumoModules.ghchart.render(el, m);
        });
      }
    });
  }
};

/* 各级贡献对应的颜色（0~4 级） */
function ghChartPalette(style, customColor) {
  var base = {
    classic: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
    dark: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'],
    coral: ['#ebedf0', '#fdd0c4', '#fb9e8d', '#f26d51', '#d73a1e']
  }[style] || ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'];
  if (style === 'custom') {
    var c = customColor || '#0f766e';
    if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c)) {
      c = '#0f766e';
    }
    base = [mixColor(c, '#ffffff', 0.85), mixColor(c, '#ffffff', 0.6),
      mixColor(c, '#ffffff', 0.35), mixColor(c, '#ffffff', 0.12), c];
  }
  return base;
}

/* 主色与白色混合生成浅色阶 */
function mixColor(hex, white, ratio) {
  function h2d(s) {
    return parseInt(s, 16);
  }
  var h = hex.replace('#', '');
  if (h.length === 3) {
    h = h.split('').map(function (x) { return x + x; }).join('');
  }
  var r = h2d(h.slice(0, 2)), g = h2d(h.slice(2, 4)), b = h2d(h.slice(4, 6));
  var wr = parseInt(white.slice(1, 3), 16), wg = parseInt(white.slice(3, 5), 16),
    wb = parseInt(white.slice(5, 7), 16);
  function p(v, wv) {
    return Math.round(v + (wv - v) * ratio);
  }
  function hx(n) {
    var s = n.toString(16);
    return s.length < 2 ? '0' + s : s;
  }
  return '#' + hx(p(r, wr)) + hx(p(g, wg)) + hx(p(b, wb));
}

function ghLevel(count) {
  if (!count || count <= 0) {
    return 0;
  }
  if (count <= 3) {
    return 1;
  }
  if (count <= 6) {
    return 2;
  }
  if (count <= 9) {
    return 3;
  }
  return 4;
}

/* 按日期倒排取最近 N 天，生成周列 × 7 行 SVG */
function drawChart(list, m) {
  var days = { year: 365, half: 180, quarter: 90, month: 30 }[m.period] || 365;
  var palette = ghChartPalette(m.style, m.color);
  var rounded = m.rounded !== false;
  var byDate = {};
  list.forEach(function (c) {
    if (c && c.date) {
      byDate[c.date] = c.count || 0;
    }
  });

  var today = new Date();
  today.setHours(0, 0, 0, 0);
  /* 生成最近 days 天（含今天），从最旧到最新 */
  var seq = [];
  var cursor = new Date(today);
  cursor.setDate(cursor.getDate() - (days - 1));
  for (var i = 0; i < days; i++) {
    var d = new Date(cursor);
    d.setDate(cursor.getDate() + i);
    var key = d.getFullYear() + '-' +
      (d.getMonth() + 1 < 10 ? '0' : '') + (d.getMonth() + 1) + '-' +
      (d.getDate() < 10 ? '0' : '') + d.getDate();
    seq.push({ key: key, date: d, count: byDate[key] || 0 });
  }

  var cell = 10, gap = 3, w = cell + gap;
  var cols = Math.ceil(seq.length / 7);
  var svgW = cols * w + 2;
  var svgH = 7 * w + 2;
  var rects = '';
  var weekStart = new Date(seq[0].date);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  /* 每列顶部补足周日起始（GitHub 风格：列从上到下为周日→周六） */
  seq.forEach(function (item) {
    var dow = item.date.getDay();
    var diff = Math.floor((item.date - weekStart) / 86400000);
    var col = Math.floor(diff / 7);
    var row = dow;
    var x = 1 + col * w;
    var y = 1 + row * w;
    var lv = ghLevel(item.count);
    var fill = lv === 0 && m.style === 'dark' ? palette[0] : palette[lv];
    var rx = rounded ? 2 : 0;
    rects += '<rect x="' + x + '" y="' + y + '" width="' + cell + '" height="' + cell +
      '" rx="' + rx + '" fill="' + fill + '" data-count="' + item.count +
      '" data-date="' + item.key + '"><title>' + item.key +
      '：' + item.count + ' 次贡献</title></rect>';
  });

  var label = { year: '最近一年', half: '最近半年', quarter: '最近三个月', month: '最近一个月' }[m.period] || '最近一年';
  var legend = palette.map(function (c, i) {
    return '<rect x="0" y="0" width="10" height="10" rx="' + (rounded ? 2 : 0) +
      '" fill="' + c + '"></rect>';
  }).join('');
  return '<svg class="ghchart-svg" viewBox="0 0 ' + svgW + ' ' + svgH +
    '" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">' +
    rects + '</svg>' +
    '<div class="ghchart-foot"><span>' + label + '</span>' +
    '<span class="ghchart-legend">' + legend + '</span></div>';
}
