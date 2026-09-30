/* ============================================================
 * 模块：天气（weather）
 * 使用 Open-Meteo 免费接口，无需 API Key
 * ============================================================ */
window.JiumoModules = window.JiumoModules || {};

window.JiumoModules.weather = {
  id: 'weather',
  fields: [
    { key: 'title', label: '模块标题', type: 'text' },
    { key: 'city', label: '城市名', type: 'text' },
    { key: 'lat', label: '纬度', type: 'number', step: '0.0001' },
    { key: 'lon', label: '经度', type: 'number', step: '0.0001' },
    { key: 'unit', label: '温度单位', type: 'select',
      options: [['celsius', '摄氏度'], ['fahrenheit', '华氏度']] }
  ],
  render: function (el, m) {
    var wmo = {
      0: '☀️ 晴', 1: '🌤️ 大部晴朗', 2: '⛅ 多云', 3: '☁️ 阴',
      45: '🌫️ 雾', 48: '🌫️ 雾凇',
      51: '🌦️ 毛毛雨', 53: '🌦️ 毛毛雨', 55: '🌦️ 毛毛雨',
      61: '🌧️ 小雨', 63: '🌧️ 中雨', 65: '🌧️ 大雨',
      71: '🌨️ 小雪', 73: '🌨️ 中雪', 75: '🌨️ 大雪',
      80: '🌦️ 阵雨', 81: '🌧️ 阵雨', 82: '🌧️ 强阵雨',
      95: '⛈️ 雷阵雨', 96: '⛈️ 雷阵雨伴冰雹', 99: '⛈️ 强雷暴'
    };
    var api = 'https://api.open-meteo.com/v1/forecast?latitude=' +
      encodeURIComponent(m.lat) + '&longitude=' + encodeURIComponent(m.lon) +
      '&current_weather=true&timezone=auto';
    el.innerHTML = '<div class="state-box" style="padding:12px 4px;"><span class="spinner"></span>加载天气…</div>';
    fetch(api).then(function (r) { return r.json(); }).then(function (data) {
      var cur = data.current_weather;
      if (!cur) {
        el.innerHTML = '<div class="state-box" style="padding:12px 4px;">暂无天气数据</div>';
        return;
      }
      var temp = m.unit === 'fahrenheit' ?
        Math.round(cur.temperature * 9 / 5 + 32) + '°F' :
        Math.round(cur.temperature) + '°C';
      var code = wmo[cur.weathercode] || '🌡️ 未知';
      var wind = Math.round(cur.windspeed);
      el.innerHTML =
        '<div class="weather-row">' +
          '<span class="weather-emoji">' + (code.split(' ')[0] || '🌡️') + '</span>' +
          '<span class="weather-temp">' + temp + '</span>' +
          '<span>' + (m.city ? escapeHtml(m.city) : '') + '</span>' +
        '</div>' +
        '<div class="weather-desc">' + escapeHtml(code) + '</div>' +
        '<div class="weather-extra">风速 ' + wind + ' km/h</div>';
    }).catch(function () {
      el.innerHTML = '<div class="state-box" style="padding:12px 4px;">天气加载失败<br><small>检查网络或经纬度</small></div>';
    });
  }
};
