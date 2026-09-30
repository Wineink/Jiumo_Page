/* ============================================================
 * 模块：GitHub 贡献热力图（ghchart）
 * 使用第三方 SVG 服务 ghchart.rshah.org，无需 API Key
 * ============================================================ */
window.JiumoModules = window.JiumoModules || {};

window.JiumoModules.ghchart = {
  id: 'ghchart',
  fields: [
    { key: 'title', label: '模块标题', type: 'text' },
    { key: 'username', label: 'GitHub 用户名', type: 'text' }
  ],
  render: function (el, m) {
    var user = (m.username || (getConfig().owner || '')).trim();
    el.innerHTML =
      '<div class="ghchart-wrap"><img class="ghchart" alt="' + escapeHtml(user) +
      ' 的 GitHub 贡献图" src="https://ghchart.rshah.org/' + encodeURIComponent(user) +
      '" onerror="this.closest(\'.ghchart-wrap\').innerHTML=\'<div class=state-box style=padding:12px 0;>贡献图加载失败</div>\'"></div>' +
      '<div class="ghchart-user">@' + escapeHtml(user) + '</div>';
  }
};
