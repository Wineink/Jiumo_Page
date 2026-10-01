/* ============================================================
 * 模块：每日一言（quotes）
 * 内置语录库，可设置刷新间隔（秒），前台与后台自动识别
 * ============================================================ */
window.JiumoModules = window.JiumoModules || {};

/* 内置语录库（可自行增删） */
var QUOTES_LIB = [
  '生活不是等待风暴过去，而是学会在雨中起舞。',
  '所有的伟大，都是熬出来的。',
  '保持热爱，奔赴山海。',
  '人生如逆旅，我亦是行人。',
  '道阻且长，行则将至。',
  '心之所向，素履以往。',
  '慢慢来，比较快。',
  '你现在的努力，是为了以后有更多的选择。',
  '星光不问赶路人，时光不负有心人。',
  '把每一天都当作生命的最后一天来过。',
  '世界以痛吻我，我要报之以歌。',
  '凡是过往，皆为序章。',
  '生活明朗，万物可爱。',
  '做你自己，因为别人都有人做了。',
  '种一棵树最好的时间是十年前，其次是现在。',
  '清醒时做事，糊涂时读书，大怒时睡觉。',
  '你若盛开，清风自来。',
  '不乱于心，不困于情，不畏将来，不念过往。',
  '路虽远，行则将至；事虽难，做则必成。',
  '每一次低头，都是对自己的肯定。',
  '知不足而奋进，望远山而前行。',
  '山高路远，看世界，也找自己。',
  '把期望降低，把依赖变少，你会过得很好。',
  '今天比昨天好，就是希望。',
  '你的时间有限，不要浪费在别人的生活里。',
  '温柔半两，从容一生。',
  '与其互为人间，不如自成宇宙。',
  '岁月不居，时节如流。',
  '此心安处是吾乡。',
  '乘风好去，长空万里，直下看山河。'
];

window.JiumoModules.quotes = {
  id: 'quotes',
  fields: [
    { key: 'title', label: '模块标题', type: 'text' },
    { key: 'refresh', label: '刷新间隔（秒，0=不自动刷新）', type: 'number' },
    { key: 'typewriter', label: '打字机效果', type: 'checkbox' },
    { key: 'typeSpeed', label: '打字速度（每字毫秒，默认80）', type: 'number' },
    { key: 'author', label: '署名（可留空）', type: 'text' }
  ],
  render: function (el, m) {
    var refresh = parseInt(m.refresh, 10);
    if (!refresh || refresh < 0) {
      refresh = 10;
    }
    var author = (m.author || '').trim();
    /* 打字机效果：默认开启；打字速度可后台设置 */
    var typewriter = m.typewriter !== false;
    var speed = Math.max(10, Math.min(300, parseInt(m.typeSpeed, 10) || 80));
    var idx = Math.floor(Math.random() * QUOTES_LIB.length);
    var draw = function () {
      var q = QUOTES_LIB[idx];
      el.innerHTML =
        '<div class="quote-text"></div>' +
        (author ? '<div class="quote-author">—— ' + escapeHtml(author) + '</div>' : '');
      var span = el.querySelector('.quote-text');
      if (!typewriter) {
        /* 关闭打字机：直接整句显示 */
        span.textContent = q;
        return;
      }
      /* 打字机：入全局队列（随机延迟后逐字打出，打完一直保留到下一次刷新） */
      if (window.queueTypewriter) {
        span.textContent = '';
        window.queueTypewriter(span, q, speed, 300, 900);
      } else {
        span.textContent = q;
      }
    };
    draw();
    if (refresh > 0) {
      _sidebarTimers.push(setInterval(function () {
        idx = (idx + 1) % QUOTES_LIB.length;
        draw();
      }, refresh * 1000));
    }
  }
};
