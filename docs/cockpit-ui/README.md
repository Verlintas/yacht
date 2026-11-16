# 第一人称座舱 / HUD 垂直切片（A-30 + AR10）

Worktree：`/Users/apple/.local/share/opencode/worktree/e0f2de/cockpit-ui`
分支：`cockpit-ui`（不合并主仓）

## 实现

- DOM HUD 重做：heading ribbon、speed/altitude/V-S、throttle、hull/shield/parts、target card、2.5D radar、warp ring、master caution、fault list、hit-direction wedge、scanlines/glass reflection。
- 3D 座舱：`src/game/cockpit.ts`。独立 `THREE.Scene` + `PerspectiveCamera(near=0.02)` + 自定义 `CockpitPass`，在世界 pass 之后、hdr clamp/bloom 之前 `clearDepth()` 绘制，避免世界 near=0.5 裁掉近景内饰，也避免太阳/环境光洗白。
- A-30 使用 light cockpit kit；AR10 使用同一 kit 放大到 capital 比例，并增加舰桥侧台/顶部状态条。
- 旧的 10 个黑框（`ship.ts` 的 `cockpitGroup`）已移除，避免与新的座舱 scene 重叠。
- 3D MFD 显示真实二级信息（FLIGHT/SYSTEMS/NAV），8 Hz 更新；DOM HUD 为飞行主信息，不重复 speed/hull。
- 保留第三人称/自由视角：cockpit pass 只在第一人称启用，第三人称 HUD 与舰体模型不受影响。

## 数据接线

HUD 使用现有状态：

- `flight.speed / throttle / boostMode / shiftMultiplier / warpPhase / warpCharge / warpProgress`
- `flight.forwardVector / quaternion / velocity / position`
- `world.bodies` 最近行星高度、V/S、最近天体
- `playerState.hull / shield / shieldDelay / parts` + `spec.hull / shield / parts`
- `combat.nearestNpc / contacts` + 新增的 `hostile/velocity/alerted` 只读字段
- `target`（星图选择）
- 武器组来自 `manualWeaponTypes` + `weapons.cooldowns`

没有 ammo 系统，所以武器面板显示组/数量/READY 条，不伪造弹药数；无 lock 机制，target card 显示 `TRACKING`，不伪造 `LOCKED`。

## 统计

`window.__cockpitStats`（`?debug=1`）：

| kit | triangles | parts | mesh draw calls |
|---|---:|---:|---:|
| light (A-30) | 72,884 | 434 | ~31 |
| capital (AR10) | 81,060 | 475 | ~33 |

统计为场景内 mesh 数（含独立屏幕/玻璃/裂纹/灯），不是 renderer 实际 draw call；静态几何已按材质合并。三角形略高于设计的 45–65k，优先保留细节。

## 截图

Before（主仓 4329，旧实现，dispatch `V` 两次进入第一人称）：

- `before-a30-first.png`
- `before-ar10-first.png`

After：

- `a30-first.png` — A-30 first person
- `ar10-first.png` — AR10 first person
- `a30-third.png` — A-30 third person 回归
- `a30-first-1280.png` — 1280×720 响应式
- `a30-damage.png` — 真实低 hull / shield 0 / parts 损坏（caution + fault + canopy crack）
- `a30-hit.png` — 方向受击楔形（截图时强制保留 0.55s 动画）
- `a30-warp.png` — warp charge 状态；世界 warp FX 很强，HUD ring 可见但被拖影覆盖

截图用 headless Chrome + SwiftShader，1600×900（除 1280×720），`?ship=...&view=first&target=station-dock&debug=1&peace` 可选。SwiftShader FPS（约 20）不代表真机。

## 验收/测试

```sh
npm run check   # 0 errors
npm run build   # 通过
```

## 限制 / 后续

- 3D kit 是程序化 authored kit（beveled RoundedBox / Lathe / Tube / CanvasTexture），不是 Blender 45–65k GLB；没有 2K PBR atlas。
- AR10 目前是同一 light kit 的 capital 比例 + 桥楼附加件，不是完整 capital 舰桥。
- 静态几何已合并，但独立 MFD/玻璃/裂纹/灯仍约 31 mesh；比设计 10–14 draw call 高。
- target box 在目标重叠时可能互相覆盖；标签已做垂直偏移，但未做 collision avoid。
- 3D MFD 文本在 1280 下是二级信息，主信息以 DOM HUD 为准。
- `a30-warp.png` 的世界 warp 拖影强于 HUD；如果要更干净的验收图，应在真实 GPU 上抓 charge 状态或临时降低 warpPass。
