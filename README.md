<div align="center">
  <img src="./docs/assets/cover.png" alt="Momona背景" width="30%" />
</div>

<div align="center">
  <h1>Momona</h1>
  <p>本地生成、静态部署的个人数字生活展示站点</p>
</div>

<div align="center">

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.12.0-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Astro](https://img.shields.io/badge/Astro-7-ff5d01?style=for-the-badge&logo=astro&logoColor=white)](https://astro.build/)
[![Vue](https://img.shields.io/badge/Vue-3-42b883?style=for-the-badge&logo=vue.js&logoColor=white)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-3178c6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: AGPL-3.0-only](https://img.shields.io/badge/License-AGPL--3.0--only-1f6feb?style=for-the-badge)](./LICENSE)
[![Version](https://img.shields.io/badge/version-0.0.1-6d5dfc?style=for-the-badge)](./package.json)

</div>

Momona 将个人资料、公开动态、收藏、友联、音乐和数据摘要整理到一个响应式站点中。它面向单用户本地编辑：开发阶段通过设置页同步数据并保存快照，发布阶段只输出纯静态文件，不需要在线数据库或运行中的后端服务。

项目的视觉和交互模式参考了 [Myriad](https://github.com/Myriad-You/Myriad)，具体实现由本仓库中的 Astro、Vue 和 TypeScript 代码完成。

## ✨ 特性

- **静态优先**：使用 Astro 构建独立 HTML 页面，生成物可部署到任意静态文件服务器。
- **个人控制面板**：集中展示个人资料、社交链接、活动、天气、音乐和游戏信息。
- **可编辑首页**：在本地设置页中调整首页组件的显示、顺序和网格尺寸。
- **多来源同步**：支持 Bangumi、Bilibili、GitHub、Steam、SFACG、网易云音乐和 QQ 音乐的公开内容。
- **资料库画布**：支持筛选、拖拽、缩放和重置，用于整理收藏内容。
- **阅读与报告**：提供订阅源阅读空间、文章详情弹层和个人数字生活数据报告。
- **本地凭据隔离**：访问令牌写入被 Git 忽略的本地凭据文件，不进入公开页面快照。
- **响应式界面**：桌面端与移动端共用应用外壳，支持站内无刷新切换和音乐播放控制。

## 📄 页面

| 路径        | 内容                                     | 环境       |
| ----------- | ---------------------------------------- | ---------- |
| `/`         | 个人控制面板、活动、天气、音乐和游戏信息 | 开发与生产 |
| `/library`  | 可筛选、拖拽、缩放和重置的资料库画布     | 开发与生产 |
| `/friends`  | 友联列表和订阅源内容                     | 开发与生产 |
| `/brew`     | 订阅源筛选、搜索、排序和文章详情         | 开发与生产 |
| `/reports`  | 数据指标、来源摘要和报告卡片             | 开发与生产 |
| `/settings` | 基础设置、数据管理和同步状态             | 仅本地开发 |
| `/404`      | 未找到页面                               | 生产构建   |

`/settings` 和 `/__momona/*` 本地接口由 Astro 开发期插件注入，生产构建不会将它们输出到 `dist/`。

## 🧩 数据来源

设置页支持按来源启用同步，并单独选择需要写入页面快照的内容类型。

| 来源                                  | 配置标识   | 支持内容                                                      |
| ------------------------------------- | ---------- | ------------------------------------------------------------- |
| [Bangumi](https://bgm.tv/)            | `bangumi`  | 追番、游戏、书籍、音乐收藏                                    |
| [Bilibili](https://www.bilibili.com/) | `bilibili` | 投稿视频、公开收藏夹、追番 / 追剧                             |
| [GitHub](https://github.com/)         | `github`   | 公开仓库或 Pinned 仓库，可按更新时间、Stars、Forks 或名称排序 |
| [Steam](https://steamcommunity.com/)  | `steam`    | 最近游玩、近两周时长；填写 Web API Key 后同步游戏库           |
| [SFACG](https://p.sfacg.com/)         | `sfacg`    | 输入公开书架地址，同步书架中的小说                            |
| 网易云音乐                            | `netease`  | 喜欢的音乐、创建的歌单、收藏的歌单                            |
| QQ 音乐                               | `qqmusic`  | 喜欢的音乐、创建的歌单、收藏的歌单                            |

## 🚀 快速开始

### 环境要求

- Node.js `>= 22.12.0`
- pnpm
- 能够访问所配置数据源的网络环境

### 安装与启动

```powershell
pnpm install
pnpm astro dev --background
```

1. 在“个人资料”中填写名称、签名和头像。
2. 在“数据来源”中启用来源，填写用户名或用户 ID，并勾选需要同步的内容。
3. 在设置页的“数据管理”中调整来源内容范围、游戏账号和音乐目录。
4. 对需要更新的来源执行“同步并保存”，然后刷新其他页面查看结果。

配置和快照写入 `.momona/`。首次使用时复制公开示例配置；真实的 `localConfig.json` 会被 Git 忽略，不应提交到公开仓库。

```powershell
New-Item -ItemType Directory -Force .momona
Copy-Item .momona/localConfig.example.json .momona/localConfig.json
```

### 环境变量配置

也可以通过 `MOMONA_CONFIG_JSON` 提供按 `LocalConfig` 结构组织的 JSON 配置。环境
变量配置整体优先于 `.momona/localConfig.json`，缺失字段使用默认值，适合在
GitHub Actions 等环境中由用户自行注入仓库 Secret；各数据源的凭据放在对应来源
的 `token` 字段中：

```json
{
  "sources": {
    "steam": {
      "enabled": true,
      "username": "76561198863810095",
      "token": "STEAM_WEB_API_KEY",
      "content": {
        "steamRecentGames": true,
        "steamLibrary": true
      }
    }
  }
}
```

配置读取时会自动剥离所有 `token`，所以凭据不会进入页面数据或公开配置；执行
数据同步时才会恢复凭据。`MOMONA_CONFIG_JSON` 只提供配置，不会让 `astro build`
自动请求远程数据，仍需在构建前按需执行现有的 `pnpm momona:sync`。

### 开发服务器管理

```powershell
pnpm astro dev status
pnpm astro dev logs
pnpm astro dev stop
```

### 编写与发布文章

文章使用 Astro 内容集合管理，文件放在 `src/content/articles/`。推荐为每篇文章建立一个
独立目录，目录中的 `index.md` 会成为文章正文；`draft: true` 的文章不会生成页面。

```markdown
---
title: "我的第一篇文章"
description: "文章列表中的摘要。"
pubDate: 2026-09-22
tags:
  - 随笔
  - 记录
draft: false
---

## 正文标题

这里写文章正文，支持标准 Markdown。
```

例如保存为 `src/content/articles/first-note/index.md` 后，打开 `Brew 阅读` 的第一个二级
Tab“我的文章”即可看到文章列表；详情页地址为 `/blog/first-note/`。

文章正文中的本地图片也放在这篇文章的目录里，并使用相对路径引用：

```text
src/content/articles/
└── first-note/
    ├── index.md
    └── screenshot.png
```

```markdown
![构建结果截图](./screenshot.png)
```

Astro 会在构建时处理这类相对图片路径，不要填写 Windows 本地绝对路径。若图片由多篇文章
共用，可以放到 `public/assets/articles/`，然后使用站点绝对路径，例如
`![头像](/assets/articles/avatar.png)`。文章 frontmatter 中的 `cover` 目前是公开资源路径，
例如 `cover: "/assets/articles/first-note/cover.jpg"`，封面应放在 `public/assets/` 下。

本地预览时运行 `pnpm astro dev`，打开 `/brew/` 的“我的文章”Tab；发布前运行 `pnpm astro check` 和
`pnpm build`。文章列表数据和详情页都是构建期生成的静态资源

## 📦 构建与部署

检查类型并生成静态文件：

```powershell
pnpm astro check
pnpm build
```

构建产物位于 `dist/`，可以部署到 GitHub Pages、Cloudflare Pages、Netlify、Nginx 或其他静态文件服务器。构建后可用以下命令在本地预览：

```powershell
pnpm preview
```

生产构建不会运行本地设置接口；如果没有 `.momona/` 快照，页面会使用空数据结构和默认首页布局。部署到非根路径时，请通过 `ASTRO_SITE` 和 `ASTRO_BASE` 配置 `site` 与 `base`。

### 公开仓库的使用方式

本仓库提供可复用的 Astro、Vue 和数据源实现。个人配置、文章和站点资源建议放在单独的私有实例仓库中，由私有仓库的工作流检出指定版本后再覆盖 `.momona/localConfig.json` 和个人资源。

公开仓库只包含构建检查工作流，不会发布任何个人站点。构建默认配置预览可以直接执行：

```powershell
pnpm install
pnpm astro check
pnpm build
```

## 🔐 本地数据与隐私

`.momona/` 只用于本机开发和构建，典型内容如下：

```text
.momona/
├── localConfig.example.json # 可复制的默认配置示例
├── localConfig.json         # 本地配置，不提交
├── credentials.json         # 本地凭据，不提交
├── generated.json         # 公开页面快照
├── brew-feeds.json        # RSS / Atom 文章缓存
└── sources/               # 原始响应与派生缓存
```

## 🗂️ 项目结构

```text
.
├── src/
│   ├── components/                 # Vue 页面和可复用组件
│   ├── composables/                # 画布、拖拽、缩放等交互逻辑
│   ├── data/                       # 类型、默认数据和页面配置
│   ├── layouts/                    # Astro 页面布局
│   ├── lib/dataCenter/             # 构建期统一数据入口
│   ├── lib/dataSources/            # 数据源适配器和快照转换
│   ├── integrations/               # 本地设置开发插件
│   ├── pages/                      # 生产静态路由
│   └── routes/settings.astro       # 仅开发期注入的设置页
├── public/assets/            # 图片、字体和游戏资源
├── scripts/                        # 构建辅助脚本
├── astro.config.mjs                # Astro 与 Vue 集成配置
├── package.json                    # 脚本和依赖
├── LICENSE                         # 原创源代码的 AGPL-3.0-only 许可证
├── .momona/                        # 示例配置和本地快照，不提交
└── dist/                           # 静态构建产物，不提交
```

## 🤝 参与贡献

欢迎提交 Issue 或 Pull Request。提交代码前建议：

1. 使用 pnpm 安装和管理依赖。
2. 保持数据源适配器的错误处理和公开数据边界。
3. 运行 `pnpm astro check` 和 `pnpm build`。
4. 不要提交 `.momona/`、`dist/`、`.astro/` 或包含令牌的文件。

## 📜 许可证

除另有说明外，本仓库的原创源代码采用 [GNU Affero General Public License v3.0 only](LICENSE)。

字体、图片、游戏 Logo、Live2D 运行时不适用 AGPL。
发布项目或构建产物前，应确认这些资源的来源、许可证和分发权限。

## 🙏 致谢

- [Myriad](https://github.com/Myriad-You/Myriad)：提供页面视觉和交互模式参考。
