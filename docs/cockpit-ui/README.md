# 第一人称座舱 / HUD 垂直切片（A-30 + AR10）

Worktree：`/Users/apple/.local/share/opencode/worktree/e0f2de/cockpit-ui`
分支：`cockpit-ui`（不合并主仓）

## 实现

- DOM HUD：heading ribbon、speed/altitude/V-S、throttle、hull/shield/parts、target card、2.5D radar、warp ring、master caution、fault list、hit-direction wedge、scanlines/glass reflection。
- 3D 座舱：`src/game/cockpit.ts`。独立 `THREE.Scene` + `PerspectiveCamera(near=0.02)` + 自定义 `CockpitPass`，`clearDepth()` 后绘制，避免世界 `near=0.5` 裁掉近景内饰，也避免太阳/环境光洗白。
- `CockpitPass` 现在位于世界 `warpPass` 之后、`OutputPass` 之前：world warp 拖影只存在于座舱玻璃外的世界，dash/canopy/struts 正确遮挡，第一人称不再“透明”。
- A-30 使用 light cockpit kit；AR10 使用同一 kit 放大到 capital 比例，并增加舰桥侧台/顶部状态条。
- 旧的 10 个黑框（`ship.ts` 的 `cockpitGroup`）已移除，避免与新的座舱 scene 重叠。
- 3D MFD 显示真实二级信息（FLIGHT/SYSTEMS/NAV），8 Hz 更新；DOM HUD 为飞行主信息，不重复 speed/hull。
- 保留第三人称/自由视角：cockpit pass 只在第一人称启用，第三人称 HUD 与舰体模型不受影响。

## v2/v3 polish

- 移除横跨视野的顶部 overhead slab：只保留贴 canopy header 的窄 breaker rail（默认在视野外），不再挡 HDG ribbon，也没有被近裁剪切掉的文字。
- canopy 顶部横梁移除，只保留 bow 顶部的中央 latch；bow/侧轨改为分段 beveled 金属框（宽 20–30% 更窄），增加接缝、螺栓、gasket lip、细 trim 和明暗材质变化。
- 顶部/大尺寸 cyan 灯带降为低强度 teal edge（`tealDim`），不再是最亮物体；dash glare shield 改为哑光深色。
- AR10 不再绘制舰桥顶部 5-toggle 仪表条；避免任何 free-floating overhead bar 出现在玻璃上。
- Dash 增加面板接缝、rocker banks、breaker rows、vent/screw、worn edge、stencil 标签；把黑色球状旋钮替换成 brass base + 橡胶 knurled cap + 指示线。
- 油门/操纵杆重做：底座、brass collar、橡胶/皮革 grip、trigger、按钮、cable；去掉金色 ingot。
- MFD 屏幕加大并前移，避免被 dash 前缘/遮光檐切掉顶部；FLIGHT 显示 attitude + SPD/ALT/V-S/THR/WARP/HDG，SYSTEMS 显示舰体示意 + 5 条损伤条，NAV 显示 2.5D radar + primary/hostile 列表。字号加大，1280×720 可读。
- 目标框/标签/右侧卡片加入 safe margin：目标框中心 clamp 到左右 HUD 之间；右侧 HUD 固定留出 radar/card 区域；右侧目标标签改为向内对齐，避免裁切。
- 世界目标框只允许出现在 canopy glass 投影多边形内；投影落在 dash/struts/throttle/MFD 上或玻璃外时直接隐藏，避免目标框压在仪表台上。
- Canopy 损伤改为局部撞击裂纹：2 个边缘/角落 impact zone，细亮裂纹 + 暗色压碎核心，alpha 0.3–0.5，不跨中心 reticle 与 caution banner。
- A 柱/侧轨增加可见的 dash mount、bow clamp 和侧台支架，左右两侧都做。
- 第一人称仍然只显示 `#cockpit`，第三人称面板隐藏；第三人称截图回归通过。

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
| light (A-30) | 103,014 | 640 | 31 |
| capital (AR10) | 108,370 | 658 | 31 |

统计为场景内 mesh 数（含独立屏幕/玻璃/裂纹/灯），不是 renderer 实际 draw call；静态几何已按材质合并。三角形高于设计的 45–65k，优先保留细节；draw call 保持 31。

## 截图

Before（主仓 4329，旧实现，dispatch `V` 两次进入第一人称）：

- `before-a30-first.png`
- `before-ar10-first.png`

After（v2）：

- `a30-first.png` — A-30 first person 1600×900
- `a30-first-1280.png` — 1280×720；目标框/右侧卡片无裁切
- `ar10-first.png` — AR10 first person
- `a30-third.png` — A-30 third person 回归
- `a30-damage.png` — 真实低 hull / shield 0 / parts 损坏（caution + fault + canopy crack）
- `a30-hit.png` — 方向受击楔形（截图时强制保留 0.55s 动画）
- `a30-warp.png` — warp charge；cockpit 几何保持实心，warp 拖影只在玻璃外区域

截图用 headless Chrome + SwiftShader，1600×900（除 1280×720），`?ship=...&view=first&target=station-dock&debug=1`。SwiftShader FPS（约 20）不代表真机。

## 验收/测试

```sh
npm run check   # 0 errors
npm run build   # 通过
```

## 限制 / 后续

- 3D kit 是程序化 authored kit（beveled RoundedBox / Lathe / Tube / CanvasTexture），不是 Blender 45–65k GLB；没有 2K PBR atlas。
- AR10 目前是同一 light kit 的 capital 比例 + 桥楼附加件，不是完整 capital 舰桥。
- 静态几何已合并，但独立 MFD/玻璃/裂纹/灯仍约 31 mesh；比设计 10–14 draw call 高。
- target box 在目标重叠时仍可能互相覆盖；已保证不超出屏幕和右侧 HUD safe zone。
- 3D MFD 文本在 1280 下可读，但仍是二级信息，主信息以 DOM HUD 为准。
