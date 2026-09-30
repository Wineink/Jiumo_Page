/* ============================================================
 * 模块：访问统计（stats）
 * 复用不蒜子页面底部的全站浏览/访客数据，无需额外接口
 * ============================================================ */
window.JiumoModules = window.JiumoModules || {};

window.JiumoModules.stats = {
  id: 'stats',
  fields: [
    { key: 'title', label: '模块标题', type: 'text' },
    { key: 'showPv', label: '显示全站浏览', type: 'checkbox' },
    { key: 'showUv', label: '显示访客数', type: 'checkbox' }
  ],
  render: function (el, m) {
    var html = '';
    if (m.showPv !== false) {
      html += '<div class="stat-row">全站浏览 <b class="stat-pv">-</b> 次</div>';
    }
    if (m.showUv) {
      html += '<div class="stat-row">访客数 <b class="stat-uv">-</b> 人</div>';
    }
    el.innerHTML = html;
    var tick = function () {
      var pv = document.getElementById('busuanzi_value_site_pv');
      var uv = document.getElementById('busuanzi_value_site_uv');
      if (pv && m.showPv !== false) {
        var elPv = el.querySelector('.stat-pv');
        if (elPv && pv.textContent) {
          elPv.textContent = pv.textContent;
        }
      }
      if (uv && m.showUv) {
        var elUv = el.querySelector('.stat-uv');
        if (elUv && uv.textContent) {
          elUv.textContent = uv.textContent;
        }
      }
    };
    tick();
    _sidebarTimers.push(setInterval(tick, 2500));
  }
};
