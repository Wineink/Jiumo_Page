---
title: "欢迎使用 Jiumo_Page"
date: 2026-09-29
tags: ["公告", "教程"]
summary: "这是 Jiumo_Page 的第一篇示例文章，介绍如何在管理后台写作、发布与管理文章。"
---




**线上博客：** [点击访问](https://wineink.github.io/Jiumo_Page/)
**线上后台：** [点击进入](https://wineink.github.io/Jiumo_Page/admin/)

## 这是什么

**Jiumo_Page** 是一个纯静态博客，没有服务器、没有数据库：

- 文章就是仓库 `posts/` 目录下的 Markdown 文件；
- 打开 `/admin` 管理后台，用 GitHub Token 登录后即可在线写作；
- 点击「保存并发布」，文章会通过 GitHub API 自动提交到仓库；
- GitHub Pages 自动更新，通常 1 分钟内线上可见。

## 常用 Markdown 语法

### 列表

- 无序列表项一
- 无序列表项二
  - 嵌套列表项

1. 有序列表项一
2. 有序列表项二

### 引用与代码

> 这是一段引用文字，适合放名言或重点提示。

行内代码：用 `printf("hello")` 这样的格式。

```c
/* 代码块示例 */
#include <stdio.h>
int main(void) {
    printf("hello, Jiumo_Page!\r\n");
    return 0;
}
```

### 表格

| 功能 | 入口 | 说明 |
| --- | --- | --- |
| 看文章 | 首页 | 自动按日期倒序排列 |
| 写文章 | /admin | 支持实时预览 |
| 删文章 | /admin | 删除后立即提交仓库 |

### 链接和图片

链接：[GitHub 官网](https://github.com)。

图片可先放入仓库（例如 `posts/images/` 目录），再用 `![描述](images/图片名.png)` 引用；也可以直接粘贴图床链接。

## 接下来

1. 删除或修改这篇示例文章；
2. 在后台点击「+ 新建文章」写下你的第一篇；
3. 如需修改博客名称，编辑 `assets/js/config.js` 中的 `siteTitle`。

祝写作愉快。