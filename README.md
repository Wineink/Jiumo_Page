# Jiumo_Page

**在线页面：** [点击访问](https://jiumooo.github.io/Jiumo_Page/)
**页面后台：** [点击进入](https://jiumooo.github.io/Jiumo_Page/admin/)

一个**纯静态、零构建、带管理后台**的页面，直接部署在 GitHub Pages 上。

- 前台：首页文章列表、搜索、文章详情（Markdown 渲染）
- 后台：访问 `/admin`，用 GitHub Personal Access Token 登录，在线新建 / 编辑 / 删除文章
- 原理：后台通过 [GitHub Contents API](https://docs.github.com/en/rest/repos/contents) 把 Markdown 文件直接提交到仓库，Token 仅保存在当前浏览器的 localStorage
- 无服务器、无数据库、无构建步骤，原生 HTML / CSS / JavaScript

## 目录结构

```
Jiumo_blog/
├── index.html                # 博客首页
├── post.html                 # 文章详情页
├── site-config.json          # 站点配置（标题/外观/组件开关）
├── admin/                    # 管理后台
│   └── index.html            # 管理后台
├── assets/                   # 站点资源
│   ├── css/style.css         # 全局样式
│   ├── js/config.js          # 站点配置 + GitHub API 封装（改这里）
│   ├── js/blog.js            # 前台逻辑
│   ├── js/ui.js              # 前端交互（返回顶部/主题切换/粒子等）
│   ├── js/admin.js           # 后台逻辑
│   └── vendor/marked.min.js  # Markdown 渲染库（本地内置）
├── modules/                  # 侧栏功能模块
│   ├── README.md             # 模块开发指南
│   ├── datetime/module.js    # 日期时间模块
│   ├── weather/module.js     # 天气模块
│   ├── ghchart/module.js     # GitHub 贡献热力图
│   └── stats/module.js       # 访问统计
├── posts/                    # 文章目录（Markdown 文件）
└── .nojekyll                 # 禁用 GitHub Pages 的 Jekyll 处理
```

## 部署步骤（约 3 分钟）

### 1. 修改站点配置

打开 `assets/js/config.js`，把 `owner` 改成你的 GitHub 用户名：

```js
window.SiteConfig = {
  owner: '你的用户名',   // 必改
  repo: 'Jiumo_Page',     // 若仓库名不同则一并修改
  branch: 'main',
  ...
};
```

### 2. 在 GitHub 新建仓库

在 GitHub 创建一个仓库（例如 `Jiumo_Page`，建议 Public），然后把本目录内容推送上去：

```bash
cd Jiumo_Page
git init
git add .
git commit -m "init Jiumo_Page"
git branch -M main
git remote add origin https://github.com/你的用户名/Jiumo_Page.git
git push -u origin main
```

### 3. 开启 GitHub Pages

仓库页面进入 **Settings → Pages**：

- **Source** 选择 `Deploy from a branch`
- **Branch** 选择 `main` 分支、目录选择 `/ (root)`，保存

约 1 分钟后访问：

```
https://你的用户名.github.io/Jiumo_Page/
```

### 4. 登录后台写文章

1. 打开 `https://jiumooo.github.io/Jiumo_Page/admin/`
2. 生成 Fine-grained Token：访问
   <https://github.com/settings/personal-access-tokens/new>
   - **Repository access**：`Only select repositories`，勾选本仓库
   - **Permissions → Repository permissions → Contents**：设为 `Read and write`
3. 把 `github_pat_` 开头的 Token 粘贴到后台登录框，登录后即可写作发布

## 本地预览

直接双击 `index.html` 即可在浏览器查看前台；后台的登录、发布功能在本地双击打开时同样可用（页面直接与 GitHub API 通信）。

## 常见自定义

- **页面名称 / 简介**：`assets/js/config.js` 中的 `siteTitle`、`siteDesc`
- **配色**：`assets/css/style.css` 顶部 `:root` 变量（如 `--accent` 强调色）
- **文章图片**：把图片放进 `posts/images/`，正文用 `![描述](images/文件名.png)` 引用

## 安全说明

- Token 只保存在当前浏览器 localStorage，仅发送给 `api.github.com`，不经过任何第三方服务器
- 后台地址即使被他人访问，没有 Token 也无法操作；建议 Token 设置过期时间，并仅授予单仓库 Contents 权限
- 删除文章会直接在仓库产生提交，后台不可恢复，请谨慎操作

## 常见问题

| 现象 | 原因与处理 |
| --- | --- |
| 首页提示"尚未配置仓库" | 未修改 `config.js` 中的 `owner` |
| 登录返回 403 / 401 | Token 错误或未授予该仓库 Contents 权限 |
| 保存提示同名文章已存在 | 同一天已存在同标题文章，调整标题或日期 |
| 公开访问提示 API rate limit | GitHub 未认证请求每小时 60 次，稍后自动恢复；正文走 raw 通道不受此限制 |
