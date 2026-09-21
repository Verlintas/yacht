---
title: 这个百科怎么维护的
category: resources
scenarios: []
order: 20
tags: [说明, 维护]
updated: 2026-09-21
status: sourced
summary: 条目的来源规则、审核状态的含义，以及为什么本站不复述剂量和名单。
sources:
  - title: MtF.wiki · 贡献者指南
    url: https://mtf.wiki/zh-cn/docs/contributor-guide
  - title: MtF.wiki · 已过时列表
    url: https://mtf.wiki/zh-cn/docs/outdated
  - title: MtF.wiki · 未确认列表
    url: https://mtf.wiki/zh-cn/docs/unconfirmed
  - title: WPATH Standards of Care, Version 8
    url: https://www.wpath.org/publications/soc
upstream:
  - title: MtF.wiki · 贡献者指南
    url: https://mtf.wiki/zh-cn/docs/contributor-guide
---

## 维护规则

### 0. 先说清楚：内容是 AI 整理的（重要）

本百科的条目由 **AI 协助整理**，可能出错。具体表现包括：

- 转录来源时抄错数字或单位
- 把某个来源的结论当成普遍结论
- 漏掉重要的限制条件或禁忌
- 内容过时，但页面没跟着更新

所以每个条目都做了三件事：**列出全部来源、标注审核状态、页脚写明 AI 参与**。看的时候请连来源一起看，涉及用药和办证的内容请点开原文核对。

### 1. 每条都必须有来源

每个条目在 frontmatter 里必须有 `sources` 字段，至少一条。构建前有脚本检查，**缺来源会直接构建失败**，部署不出去。

这不是形式主义。它保证了任何一个说法都能被追溯到上游。

### 2. 数字必须能追到来源

需要持续校对的内容，处理方式分两类：

| 内容 | 处理方式 | 去处 |
| --- | --- | --- |
| 药物剂量 | 已单独成页，每行附来源、状态标草稿 | [药物剂量速查](/wiki/medication-doses/) |
| 医院与医生名单 | 不复制，只给上游入口 | [HRT 资源](https://mtf.wiki/zh-cn/docs/hrt/overview) |
| 热线与联系方式 | 不复制，只给上游入口 | [公益组织](https://mtf.wiki/zh-cn/docs/useful-info/organizations) |
| 费用与排期 | 不复制，只给上游入口 | 上游对应条目 |
| 政策细节 | 只写顺序框架，细节指向官方 | [实名信息变更指引](https://mtf.wiki/zh-cn/docs/useful-info/real-name-info) |

**判断标准是「能不能追到来源」，不是「是不是敏感」。** 剂量数字有公开指南可依，就写，但每行标注来源、整页标草稿；医院名单和热线号码变化太快、二手转录必然过时，就只给上游入口。

### 3. 状态公开

每条都标一个状态：

| 状态 | 含义 |
| --- | --- |
| 草稿 | 内容尚未核对，请谨慎参考 |
| 有来源 | 每个事实性说法都附了来源，但未经人工复核 |
| 已核对 | 已人工核对过来源与表述 |
| 已过时 | 内容可能已过期，以上游来源为准 |

**审不完的部分就老实标草稿。** 这比假装权威安全得多。

## 怎么核对一条

不用通读全文。打开条目，扫一眼来源链接，确认表述没有夸大，然后改 frontmatter：

```yaml
status: reviewed
updated: 2026-09-21
```

逐条打勾的清单在[待核对清单](/wiki/review/)页面，勾选记录存在浏览器本地。

## 自动检查

构建流程里有一个脚本做两件事：

1. **检查来源字段** — 缺 sources、缺 title/url、url 格式不对，直接失败。
2. **检查外链可用性** — 报告失效链接（不阻塞部署，因为部分站点会拦截自动检查）。

## 为什么不做成「更权威的平行 wiki」

因为那会造成伤害。具体理由：

1. **准确性需要临床审核。** 由模型生成、无人复核的医疗内容，写得越详细越危险。
2. **平行资料会漂移。** 上游更新了，副本不会跟着更新，最终变成一个过时陷阱。
3. **社群已经有维护良好的资料库。** 重复建设分散贡献，不如把内容提给上游。

**所以本站的定位是索引层。** 如果你发现某条内容有价值，更好的做法是把它贡献给 [MtF.wiki](https://mtf.wiki/zh-cn/docs/contributor-guide)，那里有更多人能看到、也有人校对。

## 想改本站的内容

条目都在 `src/content/wiki/` 下，是 Markdown 文件。改完提交，GitHub Actions 会自动部署。

新增条目记得带上 `sources`，否则构建会失败——这是故意的。

## 相关页面

- [待核对清单](/wiki/review/)
- [资源总索引](/wiki/resource-index/)
- [如何判断一条信息是否可信](/wiki/info-literacy/)
