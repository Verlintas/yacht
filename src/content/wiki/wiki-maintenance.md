---
title: 这个百科怎么维护的
category: resources
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

## 三条规则

### 1. 每条都必须有来源

每个条目在 frontmatter 里必须有 `sources` 字段，至少一条。构建前有脚本检查，**缺来源会直接构建失败**，部署不出去。

这不是形式主义。它保证了任何一个说法都能被追溯到上游。

### 2. 不复述会过期的东西

以下内容本站**刻意不写**：

| 不写的内容 | 原因 | 去哪看 |
| --- | --- | --- |
| 药物剂量 | 需要跟着指南更新，复述就会过时 | [药物与剂量索引](/wiki/medication-index/) |
| 医院与医生名单 | 接诊情况变化快 | [HRT 资源](https://mtf.wiki/zh-cn/docs/hrt/overview) |
| 热线与联系方式 | 号码会变更或停用 | [公益组织](https://mtf.wiki/zh-cn/docs/useful-info/organizations) |
| 费用与排期 | 因机构、时间而异 | 上游对应条目 |
| 政策细节 | 各地口径不同且会变 | [实名信息变更指引](https://mtf.wiki/zh-cn/docs/useful-info/real-name-info) |

**只写「去哪看、按什么顺序看」，不写「具体数字是多少」。**

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
