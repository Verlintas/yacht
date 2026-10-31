---
title: VerlinPark
owner: personal
flagship: true
status: active
updated: 2026-10-31
stack: [Rust, Swift, macOS, ACP, MCP]
repo: https://github.com/Verlintas/VerlinPark
summary: macOS 原生的多智能体开发环境，给「一队并行 agent」用的工作台。
---

macOS 原生的 agentic 开发环境，目标是同时调度一队并行工作的 agent。

## 关键点

- 原生 macOS 外壳，不是 Electron 套壳
- 按 git worktree 隔离每个 agent 的工作区
- 支持 ACP 与 MCP，接不同的模型与工具
- 围绕「多个 agent 同时改同一个仓库」设计协调机制

## 状态

早期。接口和内部结构都还在动。
