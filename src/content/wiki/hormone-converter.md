---
title: 激素换算工具
category: medical
scenarios: [hrt]
order: 80
tags: [HRT, 工具, 单位]
updated: 2026-09-21
status: sourced
summary: 为什么单位换算会出错，以及上游的换算工具怎么用。
sources:
  - title: MtF.wiki · 激素换算
    url: https://mtf.wiki/zh-cn/converter
  - title: MtF.wiki · 治疗期间的监测
    url: https://mtf.wiki/zh-cn/docs/medicine/monitoring
  - title: MtF.wiki · HRT 全面指南
    url: https://mtf.wiki/zh-cn/docs/medicine/overview
upstream:
  - title: MtF.wiki · 激素换算
    url: https://mtf.wiki/zh-cn/converter
  - title: MtF.wiki · 胸围计算
    url: https://mtf.wiki/zh-cn/cup-calculator
---

## 为什么会有换算问题

激素检查报告上的单位不止一种。不同医院、不同实验室可能用不同的单位体系，同一份血样的数字看起来会差很多。

**这是「单位不同」，不是「结果不同」。** 但不做换算就直接比较，会得出完全错误的结论。

## 上游工具

MtF.wiki 提供了[激素换算](https://mtf.wiki/zh-cn/converter)工具，覆盖常见的激素指标与单位组合。

**本站不自己实现一套换算。** 原因和剂量一样：换算系数需要准确，复制一份就可能出错，而上游的版本有人维护。

## 使用建议

1. **先看报告上的单位**，不要凭记忆填。
2. **确认换算的是同一类指标**（例如雌二醇与总雌激素不是一回事）。
3. **换算结果只用于理解数字量级**，判断是否达标要交给医生，因为参考范围因方案、时间和实验室而异。
4. **保留原始报告。** 换算只是辅助，原始数据才是依据。

## 常见的坑

- **把不同单位的数值直接比较**，得出「我的数值比别人低很多」的结论。
- **忽略采血时间点**，和上次给药的间隔不同，数值本来就会不同。
- **只看单一指标**，激素水平要和整体情况一起看。
- **拿换算结果自行调整用药。** 这是最危险的做法。

## 另一个工具

上游还有一个[胸围计算](https://mtf.wiki/zh-cn/cup-calculator)工具。它是估算工具，受测量方式影响较大，不要把它当成硬性指标。

## 相关页面

- [治疗期间的监测](/wiki/monitoring-index/)
- [药物与剂量索引](/wiki/medication-index/)
