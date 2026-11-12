---
title: NOIR
owner: personal
status: active
updated: 2026-11-12
loc: 8887
chars: 337557
commits: 53
tests: 78
versions: 15
metricsAt: 2026-11-12
stack: [Kotlin Multiplatform, adb, jadx, TUI, MIT]
repo: https://github.com/Verlintas/NOIR
summary: 手机隐私审计：用 adb 扫出 Android 应用的权限、上报端点与数据流向，给出可回滚的处置。
---

桌面端的 Android 泄漏审计工具。接上手机，扫出应用申请了哪些权限、往哪些端点上报数据、数据怎么流动，然后给出**可回滚**的处置建议。

## 为什么做这个

预装的、必装的、绕不开的应用，权限和数据流向基本是黑盒。NOIR 用 adb + 静态分析把它拆开，让「关掉什么」变成一个有依据的决定，而不是照着教程点。

## 关键点

- 跨平台桌面端 + 终端界面
- 权限、上报端点、数据流向三类证据分开呈现
- 处置建议都带回滚，改坏了能退回去
- 用 jadx 做静态分析，不依赖 root

## 状态

发布 15 个版本，MIT。上线两周 3,300+ star、300+ fork。
