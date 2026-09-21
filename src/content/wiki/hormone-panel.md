---
title: 激素六项怎么看
category: medical
scenarios: [hrt]
order: 55
tags: [监测, 验血, 实用]
updated: 2026-09-21
status: sourced
summary: 报告单上那六项分别是什么、哪几项真正需要关注、数值怎么对照。
sources:
  - title: MtF.wiki · 治疗期间的监测
    url: https://mtf.wiki/zh-cn/docs/medicine/monitoring
  - title: MtF.wiki · HRT 全面指南
    url: https://mtf.wiki/zh-cn/docs/medicine/overview
  - title: LabCorp · 内分泌参考值与单位换算表（PDF）
    url: https://specialtytesting.labcorp.com/sites/default/files/2021-07/L5167-0421-18%20Endocrine%20Expected%20Values_0.pdf
  - title: 美国内分泌学会 · 性别焦虑诊疗指南
    url: https://www.endocrine.org/clinical-practice-guidelines/gender-dysphoria-guideline
upstream:
  - title: MtF.wiki · 治疗期间的监测
    url: https://mtf.wiki/zh-cn/docs/medicine/monitoring
---

## 六项分别是什么

「激素六项」通常指：

| 缩写 | 全称 | 关注度 |
| --- | --- | --- |
| E2 | 雌二醇 | **重点** |
| T | 睾酮 | **重点** |
| PRL | 泌乳素 | 建议观察 |
| LH | 促黄体激素 | 青春期阻断时才有参考意义 |
| FSH | 促卵泡激素 | 同上 |
| P4 | 孕酮 | 参考意义有限 |

## 只有两项是重点

上游说得很直接：**重点观察雌二醇和睾酮**，建议观察泌乳素；LH、FSH 只在青春期阻断治疗期间才有直接参考意义；孕酮基本没有参考意义。

所以拿到报告先看两个数：

| 指标 | 目标（成年） | 来源 |
| --- | --- | --- |
| 雌二醇 | 100–200 pg/mL（367–734 pmol/L） | WPATH SOC-8 |
| 睾酮 | 低于 0.5 ng/mL（低于 1.7 nmol/L） | WPATH SOC-8 |

完整参考范围见[药物剂量速查](/wiki/medication-doses/)里的表格。

## 单位换算

同一份血样，不同实验室可能用不同单位，数字看起来差很多。**这是单位不同，不是结果不同。**

| 指标 | 常见两种单位 |
| --- | --- |
| 雌二醇 | pg/mL ↔ pmol/L |
| 睾酮 | ng/mL ↔ nmol/L |

换算用上游的[激素换算工具](https://mtf.wiki/zh-cn/converter)。**不要凭记忆乘系数。**

## 采血时间点为什么重要

**结果和「上次给药到现在多久」直接相关。** 所以：

- 医生要求空腹就空腹
- 要求「下次给药前抽血」就按那个时间点去
- 注射方案的波动比口服大，时间点尤其关键
- **不要自行改时间**，否则数据没法解释

<div class="guide">
<strong>拿到报告先做这三件事</strong>
<p>1. <b>看采血时间</b>是否符合要求——不符合的话，数字再好看也没意义。</p>
<p>2. <b>看单位</b>，和上一次的报告对齐。</p>
<p>3. <b>看趋势而不是单次数值</b>——一两次波动很正常，连续几次同方向才值得调整。</p>
</div>

## 数值不在目标区间怎么办

**不要自己调药。** 正确的顺序是：

1. 确认采血时间点和单位有没有问题
2. 带着报告找开药的医生
3. 由医生判断是调整剂量、换剂型，还是继续观察

**常见情况：**

| 情况 | 可能的方向 |
| --- | --- |
| 雌二醇偏低 | 调整剂量或剂型；检查依从性 |
| 雌二醇偏高 | 减量；检查采血时间点 |
| 睾酮没压下去 | 评估抗雄方案；确认依从性 |
| 睾酮过低 | 评估是否抑制过度 |
| 泌乳素升高 | 密切随访，见[泌乳素升高怎么办](/wiki/prolactin/) |

## 还要一起查什么

激素六项之外，通常还要看：

- **肝功能** — 见[肝功能指标怎么看](/wiki/liver-function/)
- **血常规与凝血相关** — 血栓风险相关
- **肾功能与电解质** — 部分抗雄药物相关

完整清单见[治疗期间的监测](/wiki/monitoring-index/)。

## 记录建议

建一张表，每次复查填一行：日期、E2、T、PRL、肝功能关键项、当时用药方案（写药名即可）、身体感受。

**复诊时带着，医生能更快判断趋势。** 这份记录属于隐私，不要公开发布。

## 相关页面

- [治疗期间的监测](/wiki/monitoring-index/)
- [药物剂量速查](/wiki/medication-doses/)
- [激素换算工具](/wiki/hormone-converter/)
- [用药记录怎么做](/wiki/hrt-log/)
