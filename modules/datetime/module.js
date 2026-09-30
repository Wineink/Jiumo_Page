/* ============================================================
 * 模块：日期时间（datetime）
 * 注册到 window.JiumoModules，前台与后台自动识别
 * ============================================================ */
window.JiumoModules = window.JiumoModules || {};

window.JiumoModules.datetime = {
  id: 'datetime',
  fields: [
    { key: 'title', label: '模块标题', type: 'text' },
    { key: 'showDate', label: '显示日期', type: 'checkbox' },
    { key: 'showTime', label: '显示时间', type: 'checkbox' },
    { key: 'format12', label: '12 小时制', type: 'checkbox' }
  ],
  render: function (el, m) {
    var pad2n = function (n) { return (n < 10 ? '0' : '') + n; };
    var week = ['日', '一', '二', '三', '四', '五', '六'];
    var render = function () {
      var d = new Date();
      var dateStr = d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 星期' + week[d.getDay()];
      var h = m.format12 ? (d.getHours() % 12 || 12) : d.getHours();
      var ap = m.format12 ? (d.getHours() >= 12 ? ' 下午' : ' 上午') : '';
      var timeStr = pad2n(h) + ':' + pad2n(d.getMinutes()) + ':' + pad2n(d.getSeconds()) + ap;
      el.innerHTML =
        (m.showDate !== false ? '<div class="dt-date">' + dateStr + '</div>' : '') +
        (m.showTime !== false ? '<div class="dt-time">' + timeStr + '</div>' : '');
    };
    render();
    _sidebarTimers.push(setInterval(render, 1000));
  }
};
