---
title: 安全与隐私基础
category: start
nature: reference
scenarios: [unsure, life, trouble]
order: 60
tags: [隐私, 安全, 入门]
updated: 2026-09-21
status: sourced
summary: 三类信息的边界、数字痕迹、账号分层、医疗信息与线下安全，以及一条核心原则。
sources:
  - title: MtF.wiki · 实名信息变更指引
    url: https://mtf.wiki/zh-cn/docs/useful-info/real-name-info
  - title: MtF.wiki · 常见法律问题
    url: https://mtf.wiki/zh-cn/docs/useful-info/legal-faq
  - title: MtF.wiki · 公益组织
    url: https://mtf.wiki/zh-cn/docs/useful-info/organizations
  - title: MtF.wiki · 校园指南
    url: https://mtf.wiki/zh-cn/docs/campus
  - title: Project Trans
    url: https://project-trans.org/
  - title: 中国政府网
    url: https://www.gov.cn/
upstream:
  - title: MtF.wiki · 公益组织
    url: https://mtf.wiki/zh-cn/docs/useful-info/organizations
  - title: MtF.wiki · 常见法律问题
    url: https://mtf.wiki/zh-cn/docs/useful-info/legal-faq
---

## 核心原则

**默认不公开，需要时才提供。** 顺序反过来的话，信息收不回来。

这一页讲的不是「怎么躲」，而是**信息边界**：哪些信息有必要给，哪些没必要给，哪些痕迹最好在开始前就处理掉。

## 先分清三类信息

| 类型 | 例子 | 建议 |
| --- | --- | --- |
| **必须提供** | 就诊时的身份信息、办证时的法定材料 | 按流程给，但**只给办理该事项所需的部分** |
| **可以选择提供** | 社交场合的称呼、代词、过往经历 | 由你决定，**没有义务交代** |
| **不应该公开** | 证件号、住址、就诊记录、用药明细、可定位的照片 | 不放进公开平台，**包括公开仓库** |

## 数字痕迹（最容易被检索到的部分）

| 痕迹 | 说明 | 处理 |
| --- | --- | --- |
| **公开代码仓库** | commit 历史、README、issue 里可能留下真实姓名、邮箱、城市 | 改过一次不代表删掉了，**git 历史会保留** |
| **社交账号关联** | 同一个头像、昵称、邮箱会把不同平台串起来 | 分层使用 |
| **照片元数据** | 部分相机与手机拍的照片带 GPS 坐标 | 上传前清除 |
| **旧账号发言** | 搜索引擎和存档站点可能还留着 | 定期自查 |
| **公开发布的日程与定位** | 连续发布某个地点的照片 = 公开活动范围 | 避免连续发布同一地点 |
| **实名信息变更前后的混用** | 新旧证件、新旧账号同时活跃会造成关联 | 尽快统一 |

## 分开账号：三层结构

**一个实用的做法是把身份分层：**

| 层 | 用途 | 要求 |
| --- | --- | --- |
| **法定身份层** | 就医、办证、工作 | 使用法定信息 |
| **社图层** | 朋友、社群 | 使用你选择的称呼与账号 |
| **公开层** | 作品、发言 | 使用公开笔名 |

**三层之间尽量不共用邮箱、手机号和头像。**

**这不是偏执，是降低「被人顺着一个线索找到全部」的概率。**

## 医疗信息的边界

| 事实 | 说明 |
| --- | --- |
| 就诊记录属于个人隐私 | 医疗机构有保密义务 |
| **但你自己主动公开的内容不受此保护** | 这是最容易忽略的一点 |
| 社群里分享用药经历很常见 | 但那是公开发言，**可以讲经验，不必贴出具体剂量与检查单** |
| 需要病假、证明材料时 | **尽量只提供办理事项所需的那一页** |

**详细说明见[个人信息与隐私保护](/wiki/privacy-law/)。**

## 线下安全

| 场景 | 做法 |
| --- | --- |
| **第一次见网友、去陌生场所** | 告诉一个信得过的人时间地点，保持手机有电 |
| **就医时** | 可以带一位陪同的人，多数医院允许 |
| **住宿与合租** | 选择连锁酒店或独立租住会省心一些，见[租房与合租](/wiki/renting/) |
| **遇到盘问或刁难** | **不需要向陌生人解释自己的身份** |
| **遇到威胁或跟踪** | 优先处理人身安全，必要时报警 |
| **出行** | 行程不要实时公开，见[旅行与住宿](/wiki/travel-accommodation/) |

## 需要法律帮助时

上游的[常见法律问题](https://mtf.wiki/zh-cn/docs/useful-info/legal-faq)条目讨论了常见情形。

**本站不复述热线号码与具体联系方式**，因为会变。见：

- [公益组织](https://mtf.wiki/zh-cn/docs/useful-info/organizations)（上游名单）
- [常见法律问题索引](/wiki/legal-faq-index/)
- [危机资源与紧急情况](/wiki/crisis-resources/)

## 一个自查清单

**每年做一次：**

- [ ] 搜索自己的常用昵称、邮箱、手机号
- [ ] 检查社交账号的隐私设置与可见范围
- [ ] 检查公开仓库里的个人信息
- [ ] 检查旧账号是否还活跃
- [ ] 检查照片是否有定位信息
- [ ] 确认紧急联系人信息是最新的

## 相关页面

- [个人信息与隐私保护](/wiki/privacy-law/)
- [材料与档案管理](/wiki/records-management/)
- [线上社群安全](/wiki/online-community-safety/)
- [网络暴力与取证](/wiki/online-harassment/)
- [中介与骗局识别](/wiki/scam-awareness/)
- [危机资源与紧急情况](/wiki/crisis-resources/)
