# 模块开发指南（modules/）

本项目的前台侧栏模块全部放在本目录，每个模块一个独立子文件夹。
开发新模块时**不需要改动** config.js / ui.js / blog.js，只需按下面步骤创建文件并在页面上引入即可。

## 目录结构

```
modules/
├── README.md            # 本文件
├── datetime/            # 日期时间模块
│   └── module.js
├── weather/             # 天气模块
│   └── module.js
├── ghchart/             # GitHub 贡献热力图
│   └── module.js
└── stats/               # 访问统计
    └── module.js
```

## 如何开发一个新模块

1. 新建文件夹 `modules/我的模块/`，创建 `module.js`；
2. 在文件里注册模块（渲染函数 + 后台可配置字段）：

```js
window.JiumoModules = window.JiumoModules || {};

window.JiumoModules.myModule = {
  id: 'myModule',
  /* 后台「组件模块」面板显示的配置表单字段 */
  fields: [
    { key: 'title', label: '模块标题', type: 'text' },
    { key: 'speed', label: '速度', type: 'number' }
  ],
  /* 渲染函数：el 为模块内容容器，cfg 为该模块的配置对象 */
  render: function (el, cfg) {
    el.innerHTML = '<div>' + cfg.speed + '</div>';
  }
};
```

3. 在需要显示该模块的页面 `<body>` 底部、`assets/js/ui.js` 之后引入：

```html
<script src="modules/myModule/module.js?v=3"></script>
```

4. 在后台「组件模块」面板勾选启用即可（模块列表从注册表自动读取，无需改后台代码）。

## 可用的公共能力（直接调用）

- `escapeHtml(str)`  HTML 转义
- `renderMarkdown(md)` Markdown 转 HTML（需 marked）
- `getConfig()` 当前部署配置（owner/repo/branch/postsDir）
- `_sidebarTimers.push(id)` 注册定时器，页面重渲染时会被自动清理
- 模块配置对象 `cfg` 里默认带：`id` / `title` / `enabled` / `position`（left 左侧栏 / right 右侧栏）

## 模块配置说明（site-config.json）

模块实例存于 `sidebar.modules` 数组，后台可配置：

| 字段 | 说明 |
| --- | --- |
| `id` | 模块标识，必须与注册的 `id` 一致 |
| `title` | 模块标题（前台卡片标题） |
| `enabled` | 是否启用 |
| `position` | `left` 放左侧栏 / `right` 放右侧栏 |
| 其他字段 | 由该模块的 `fields` 定义，后台自动生成表单 |

## 内置模块（about，无独立文件）

「关于本站」模块直接用后台填写的 Markdown 渲染，无需注册文件。
