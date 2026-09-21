# yacht

Verlintas 的小窝 —— 自己用的私人港口，部署在 <https://verlintas.github.io/yacht/>。

对外展示的主页是另一个仓库（`Verlintas.github.io`），两者独立部署、互不影响。

## 常用命令

```bash
npm install          # 首次
npm run dev          # 本地开发 http://localhost:4321/yacht/
npm run build        # 构建到 dist/
npm run preview      # 预览构建结果
npm run check        # 类型检查
npm run check:sources # 检查百科来源字段（缺来源会失败）
npm run verify       # check + check:sources + build
```

推送 `main` 分支后，GitHub Actions 会自动部署，约一分钟生效。

## 目录

```
src/
├─ data/
│  ├─ berths.ts       # 四个泊位（名称与坐标）
│  ├─ links.ts        # 港口页的快捷入口
│  ├─ nav.ts          # 顶部导航
│  └─ wiki.ts         # 百科分类与状态定义
├─ content/
│  ├─ notes/          # 航海日志（笔记）
│  ├─ projects/       # 船坞（项目清单）
│  └─ wiki/           # 百科条目
├─ components/        # 界面组件
├─ layouts/Base.astro # 页面外壳
├─ lib/
│  ├─ instruments.ts  # 天气/空气/海况的取数与渲染
│  └─ url.ts          # 链接工具（自动带 base 前缀）
└─ pages/             # 路由
```

## 怎么加内容

### 加一篇笔记

在 `src/content/notes/` 新建 `.md`：

```yaml
---
title: 标题
date: 2026-09-21
tags: [标签一, 标签二]
summary: 一句话摘要
pinned: false
---
```

### 加一个项目

在 `src/content/projects/` 新建 `.md`：

```yaml
---
title: 项目名
status: active        # active | paused | idea | done | archived
progress: 60          # 0-100，可省略
updated: 2026-09-21
stack: [Kotlin, Android]
repo: https://github.com/...   # 可省略
summary: 一句话说明
---
```

### 加一条百科

在 `src/content/wiki/` 新建 `.md`：

```yaml
---
title: 标题
category: start       # start | psych | medical | legal | life | resources
order: 10             # 同分类内排序，越小越前
tags: [标签]
updated: 2026-09-21
status: sourced       # draft | sourced | reviewed | outdated
summary: 一句话摘要
sources:              # 必填，至少一条，否则构建失败
  - title: 来源标题
    url: https://example.com
upstream:             # 可省略
  - title: 上游资料标题
    url: https://example.com
---
```

Markdown 里的站内链接写 `/wiki/其他条目/` 就行，构建时会自动补上 `/yacht` 前缀。

### 改快捷入口

编辑 `src/data/links.ts`，按分组加条目。空分组不会显示。

### 改泊位

编辑 `src/data/berths.ts`。**坐标会出现在构建产物里**，因为前端取天气必须带坐标。如果不想暴露精确位置，可以改成市级精度。

## 百科的维护规则

1. **每条必须有 `sources`**，`npm run check:sources` 会强制检查，缺了会让 CI 失败。
2. **数字必须能追到来源**：`/wiki/medication-doses/` 的每行剂量都标注来源缩写，页尾列全称与链接；该页状态为 `draft`，未经医生复核。
3. **医院名单、热线号码、费用、政策细节**不复制，只给上游入口（变化太快，二手转录必然过时）。
4. **状态公开**：审过的标 `reviewed`，没审的老实标 `draft` 或 `sourced`。
5. **核对清单**在 `/wiki/review/`，勾选记录存在浏览器本地，不会改仓库文件。

外链可用性检查（不阻塞部署）：

```bash
node scripts/check-sources.mjs --links
```

## 隐私约定

- 仓库是**公开**的，任何提交都会进入永久 git 历史，无法真正撤回。
- **不提交**个人医疗记录、证件信息、住址、真实姓名。
- 站点对外只用泊位代号，真实地名不写进任何会被提交的文件。
- 本地备忘写在 `LOCAL-*.md`（已被 `.gitignore` 忽略）。
- 站点加了 `noindex` 和 `robots.txt`，但**只挡搜索引擎，不挡爬虫和镜像**。

## 数据来源

天气、空气质量、海浪数据来自 [Open-Meteo](https://open-meteo.com/)，免费且无需 API key。组件有缓存与降级：接口失败时显示上次的缓存值，不会白屏。
