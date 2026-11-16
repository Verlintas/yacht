# 夜航 · 项目上下文总表

**更新：** 2026-11-16  
**仓库：** `/Users/apple/orca/projects/verlins_home`  
**线上：** `https://verlintas.dev/yacht/`  
**目标：** 把静态个人站升级成可飞行、可下船、可探索六组织母星的 Three.js 太空游戏。

> 这个文件用于在上下文丢失后快速恢复。  
> 重要信息优先写这里；详细设计放 `docs/` 和研究目录。

---

## 1. 当前状态速览

- 7 艘原舰 + AR-10 + 7 艘候选舰 = **14 艘玩家可飞舰**。
- 六组织母星、18 个高精区、城市/商店/NPC/起降方案已设计，尚未全部实现。
- 行星表面目前仍是 shader 球体；真实地形、城市、步行、起降未接入主游戏。
- 已有多个视觉样本：
  - `/yacht/terrain-sample/` — 1 km authored terrain + 420×260 m 港区 + 60 m TLOF
  - `/yacht/kitbash-port/` — K039 kitbash 英雄港区实时预览
  - `/yacht/city-hero/` — city-hero v4：单栋 K032/K038 hero + 港口街区 + T2 到港厅 + 1200 m 平台（离线 Cycles 样本，不是最终城市系统）
- 护盾已改为舰体三角面壳；BHN 跃迁、NPC 舰队、爆炸、第三人称相机已做一轮实机修复。
- TM-5 / TG-6 / RH-7 硬点已用 setup 截图验收：`docs/hardpoints/`。
- 第一人称座舱 v3 已合并：独立 `Scene`/`CockpitPass`、VX-9 HUD、canopy mask、伤害裂纹、warp 遮挡；A-30 103k tris / AR10 108k tris，31 draw calls。截图在 `docs/cockpit-ui/`。
- Archon 贴图 0 成本 pass 已合并：AO/ORM、金属/自发光、MikkTSpace tangents、anisotropy 16；几何/硬点不变，2K WebP 4.67 MB，纹理 VRAM ≈89.5 MB，4K 不作为默认。报告 `docs/ARCHON-TEXTURE-PASS.md`。
- 鱼雷/爆炸 VFX v2 已合并：InstancedMesh 弹体、分层尾迹、破缺冲击波、多瓣火球、棱角残骸、终末级联殉爆；220 枚鱼雷 bench `Combat.update` ≈0.39 ms/帧，鱼雷相关 11 draw calls。测试场 `/yacht/vfx-torpedo-test/`。
- 建模流程已确定：**不能只靠 CLI 程序化改模**；必须 authored/Blender/kitbash，静态近景单物体至少 5,000 tris（球体除外）。
- Tripo：**不买来做建筑/城市**；最多 Pro 月付试 props/rocks/角色底模。

---

## 2. 用户的硬规矩 / 偏好

### 沟通

- 用中文。
- 不要用“大概、可能”掩盖没验证的东西；能实测就实测。
- 不要反复找不同原因却不真正修复。
- 截图验证要动视角、逐帧看；静态一张图不算验证。

### 建模与资产

- **不要程序化 CLI 直接改模**，除非能保证单个静态物体 ≥5,000 tris（球体另算）。
- 不要用低模盒子、顶点色地形、程序化拉伸冒充最终资产。
- **K038 是独立建筑，不能把两栋叠成 563 m 巨构。**
- 建筑歪七扭八、间距失控 = 不合格。
- 近景 hero 需要 authored 细节；K039 只适合中景/背景，K039 的 props 平均只有 158 tris。
- 模型可以来自本地购买资产；项目非商业/开源，用户明确不做版权审查流程。  
  但公开 Web 构建要单独考虑：Kitbash3D/BMS/Fab 标准 EULA 禁止 standalone redistribution。
- 用户正在自己搜集更多模型素材；我们也要持续找本地和网上高细节资产。

### 视觉

- **视觉效果 / 真实性 / 细节优先。**
- 不要用 bloom 掩盖材质/光照问题。
- 先修机位、镜头、光比、材质，再加雾/体积/接触阴影，最后才加 bloom/SSR。
- 第一人称座舱细节和 UI 必须补强。
- 爆炸要真实/科幻，终末爆炸要够猛。
- 大舰跃迁要有更强的 UI/动态效果。

### 玩法

- A 级主炮：4 发击毁同型号舰船；A 级鱼雷伤害为主炮一半。
- AR10 鱼雷：177,500 伤害，3,600 m/s，5–15 秒动态装填，独立发射器、交错发射、多目标。
- 自动鱼雷不再用全局 1.1 秒冷却；允许刷屏，但每个发射器独立装填。
- 大舰武器射程不能贴脸；已按 `sqrt(length/25)` 放大。
- 大型舰 BHN 必须 **持续按住 3 秒**，不是同一瞬间按下。
- NPC 舰队分散在全图，允许多支敌对，不能因玩家跃迁逃离出现长期和平。

---

## 3. 已实现的运行时系统

### 飞行

- `src/game/flight.ts`
- 普通推进、Shift 2–5× 极速（按舰型/船体完好度）。
- 目标式跃迁：B 开始，跃迁中 B 取消。
- 大舰 `warpCombo`：持续按住 B+H+N 3 秒。
- 大舰跃迁 FOV/拖影强度按舰长增强。
- 第三人称动态相机：高速后拉、横向/纵向惯性摆动、转向侧倾、FOV 随速度变化。

### 战斗

- `src/game/combat.ts`
- 舰船逐三角 BVH 碰撞 + 撞击伤害。
- 护盾三角面壳：沿舰体法线外扩；异步简化到 4k–14k 顶点；静态不膨胀。
- 弹丸命中：broadphase 球 + 舰体 BVH 精确求交，命中点用于伤害/特效。
- 自动炮只攻击已攻击我方的目标。
- 护盾受击延迟 3.5 秒；交战中 35%、脱战 300%、按最大护盾比例回复。
- 爆炸：
  - T10 武器/导弹模块随机殉爆，不再按 W1→W45 一排排爆。
  - 终末爆炸：沿舰体轴线的 10 次级联殉爆 + 多瓣火球 + 白/青热核 + 暗色烟尘外层 + 破缺/变色的等离子冲击环 + 5 种棱角残骸 + 预置点光源/长余晖；屏幕闪光有 final 专用更强衰减。
  - 普通命中：定向火焰/等离子喷流 + 火花 + 局部火球，不再是纯粒子点。
  - 冲击环不再是完美霓虹圈：4 张程序化破缺纹理，白/青 → 琥珀 → 暗红，低透明度、慢膨胀。
- 鱼雷视觉：
  - A 级/小型鱼雷使用不同尺度的独立导弹弹体（鼻锥/尾翼/舵面/助推器），InstancedMesh 共享几何/材质。
  - 分层尾迹（亮核 + 宽柔光丝带 + 热核/辉光/火花/分形烟粒子）、额外低频螺旋、亮但不过曝的引擎核心、终端增推视觉。
  - 3,600 m/s 速度与 5–15 秒装填逻辑未改。
  - 长度 ≥ 500 m 的大舰鱼雷命中增加细长胶囊兜底 + 船壳 BVH 吸附，避免从发动机口/结构缝穿过。
- NPC 舰队：
  - 最多 8 支舰队。
  - 最多 3 支敌对。
  - 刷新距离 60–820 km，分散全图。
  - 跃迁逃离不会制造长期和平。

### 武器

- `src/game/ships.ts`
- 射程按 `sqrt(length / 25)` 放大：
  - AR10 P A：57.2 km
  - AR10 鱼雷：143 km
  - AR10 副炮：60.8 km
  - BB6 P：28.6 km
- AR10 P A：355,000 伤害，3,300 m/s，8 门手动。
- AR10 鱼雷：177,500 伤害，3,600 m/s，5–15 秒动态装填。
- Archon P A 定制重炮音效 + 大弹体 + 三层炮口闪光。
- 舰船贴图 anisotropy = 8；emissive 不再被压到 0.06。

---

## 4. 舰船数据与硬点规则

### 当前玩家舰

| 代码 | 名称 | 级 | 全长 |
|---|---|---:|---:|
| A-30 | 雷霆 | T2 | 25 m |
| F-008 | 短剑 | T2 | 22 m |
| CR-3 | 轰炸机 | T4 | 180 m |
| MB-4 | 货船 | T5 | 520 m |
| CG-7 | Commander | T7 | 2,400 m |
| BB-6 | 战列舰 | T6 | 2,000 m |
| AR-10 | RTA Archon | T10 | 8,000 m |
| DK-6 | SF Bomber-DK6 | T2 | 35 m |
| GL-4 | Gladius | T4 | 90 m |
| TM-5 | Templar | T5 | 1,200 m |
| TG-6 | Tigris | T6 | 1,600 m |
| PH-3 | Phalanx | T3 | 80 m |
| RH-7 | Rhodes | T7 | 3,000 m |
| SH-3 | Shark | T3 | 28 m |

NPC Only：VA-3、F2-5、HS-2、OS-8。

### 舰级标准

`docs/SHIP-CLASS-STANDARD.md`

- T1 8–15 m
- T2 18–60 m
- T3 45–150 m
- T4 90–400 m
- T5 250–1,500 m
- T6 1,500–2,500 m
- T7 2,400–4,000 m
- T8 3,000–6,000 m
- T9 5,000–7,500 m
- T10 8,000–12,000 m
- T11 15,000–25,000 m
- T12 30,000 m+ 保留，无现役舰

### 硬点缩放（重要）

- 模型加载：`ship.ts` 按 **glTF Z 轴长度** 缩放到 `spec.length`。
- `ships.ts` 里 `ANNOTATION_LENGTH` 只在硬点标注长度 ≠ 最终长度时才需要。
- 候选舰修正：
  - TM-5：硬点已经是 **1,200 m 最终坐标**，`ANNOTATION_LENGTH = 1200`
  - TG-6：`ANNOTATION_LENGTH = 1600`
  - RH-7：`ANNOTATION_LENGTH = 3000`
  - 之前错误地设成 160/280/350，导致游戏又缩放一次，硬点和模型不匹配。
- 不要再用 `max(x,y,z)` 缩放；宽翼展舰会被按翼展缩小。
- 硬点/喷口/驾驶舱必须与模型最终长度一致。

### 候选舰数据

- `~/Documents/ship-sheets/flyable-candidates/candidates.json`
- 12 艘候选舰 GLB：`public/models/candidates/`
- setup 编辑器：`/yacht/setup/`；18 艘可查看。
- 舰船审计/kitbash：
  - `~/Documents/ship-sheets/flyable-candidates/BLENDER-KITBASH-PIPELINE.md`
  - `~/Documents/ship-sheets/flyable-candidates/kitbash-pilot/`
  - `docs/SHIP-CLASS-STANDARD.md`

---

## 5. 行星 / 城市 / 角色 / 起降计划

### 行星

- 六组织母星：
  - IAC 炉心星 / Forgeheart
  - WRS 白脊星 / Whitepoint
  - APA 琥珀港 / Amber Harbor
  - ORT 环轨星 / Ringhold
  - RTA 赤潮星 / Redtide（高危险）
  - MVB 苔幕星 / Mossveil（高危险）
- 三层结构：轨道 globe → 128 km 低精外环 → 16–32 km 高精区。
- 离线 authored heightfield；运行时只流式加载、LOD、碰撞。
- 高精 tile：1 km × 1 km，129²/257²，`.cterr` R16。
- CPU float64 绝对坐标；surface 用 region ENU；tile float32。
- 碰撞：heightfield 双线性 + pad 平面；BVH 只用于建筑/岩石/道具。
- 大气层：100 km；视觉壳约 55 km。
- 当前 `surfacePatch` 已禁用；真实地形未接入主游戏。

### 城市

- 城市平台/terrain 接口必须处理地形起伏；目前城市 hero 样本采用 1200 m 平 deck，避免穿模。
- 城市生产：Kit → Stamp → District → Build → Runtime。
- 512 m city cell；1–3 km 城区 4–36 cells。
- 小船落地，大舰轨道/空间站。
- 20–600 m 船可落地；2–2.6 km 只停 XL cradle/轨道；AR10 8 km 永不落地。
- 当前样本：
  - `/yacht/terrain-sample/` 1 km 地形 + 420×260 m 港区 + 60 m TLOF
  - `/yacht/city-hero/` K032/K038 + 城市平台（WIP，堆叠巨构被用户否决）
- 用户否定了把 K038 两栋叠成 563 m 的做法；后续只用单栋原生建筑 + authored 构图。

### 角色

- 自定义 kinematic capsule（0.35 m 半径 / 1.8 m 高），固定 1/60 s 步长。
- 地形 heightfield；城市/舰体 BVH。
- 必须用 SurfaceFrame 局部坐标（5,000 km 处 float32 ULP ≈ 0.5 m）。
- `FlightController` 需要 `enabled`/`InputRouter`，步行时切断飞行输入。
- 相机：第三人称默认，V 切第一人称。
- 角色资产：Quaternius CC0 或 Modelshop（本地高质量）。
- 局部阴影 2048² / ±60 m + blob shadow；现有全局 1024²/±5 km 不够。

### 起降

- 七状态：`space` / `atmospheric` / `approach` / `landing` / `landed` / `takeoff` / `docked`，加 `docking`/`crash`。
- 同一时间只有一个系统拥有飞船姿态。
- 禁止 teleport 着陆；MVP 只允许 prepared pad。
- 接地检测用 3–6 个起落架接触点；pad 平面解析。
- 起落架优先 GLB 命名节点/动画；`_landed.glb` 只作 fallback。
- 默认 assist；F 请求 clearance，再按 F 启动 autoland，X 取消。
- 垂直切片：A-30 25 m 在 60 m S pad 完整 land → disembark → walk → re-board → takeoff。

---

## 6. 资产库与采购结论

### 本地高质量资产

| 用途 | 资产 | 规格 |
|---|---|---|
| 200 m hero 塔楼 | K032 NeoShanghai `BldgLG_A` | 220 m / 275k tris / 4K |
| 高效 hero 塔楼 | K038 Neo Tokyo 2 `LargeJ` | 223 m / 358k；LargeI 241 m / 207k |
| 工业细节/堆叠 | K046 Heavy Metal `BldgLG_G` | 88 m / 332k |
| 中景/基座 | K039 Sci-Fi Industrial | 建筑壳过 5k；props 平均 158 tris |
| 街道/店面 | CityStreets 209 | 421 objects / 5.53M / 4K |
| 角色 | Modelshop Greebles | posed 155–177k/角色；rig 179k |
| 近景面板 | C2184 Sci-Fi Architecture Panels | 21 面板 / 408k / 只有 2K diffuse，需 relink |
| terminal | 650M1 CommunityCentre.blend | 1.37M tris / 103×87×27 m / 4K / Mission to Minerva |
| greeble | chtazi kitbash 35–38 | 868k unique tris / 1,577 unique components |

K047 不完整（只有 `.baiduyun.p.downloading`）；K043/K022 无贴图；K021 无贴图；K015 1K 远景；K025 无材质。

### 在线资产 shortlist

- Kitbash3D Lunar Base $145
- BMS Modelshop Greebles $175
- BMS Cyberpunk $175
- BMS AstroNova $175
- Kitbash3D High Tech Streets $95
- Leartes Hangar $69.99
- BMS Industrial Zone Hero Buildings $99
- REX Panels Vol 03 $10.99

结论：没有在线包能一键解决 200–800 m hero close-up；用 K032/K038 massing + 近景 panel/greeble + CommunityCentre/Leartes terminal。

### 工具 / 插件

- 免费：Cargo、BAM Decalit/Import As Decal/Slap It、Krita/GIMP、Material Maker、MeshLab、glTF-Transform、KTX-Software、xatlas。
- 5.3 已验证核心：MESHmachine + UVPackmaster + True Terrain（约 $149）。
- DECALmachine/HardOps/KIT OPS/Cargo 目前 5.2 更稳；建议 **5.2 LTS 建模 + 5.3 导出/验证**。
- 不做 hero 城市生成器：Nodee Buildings 只适合现代背景；SceneCity Apple Silicon 不可用；City Builder 3D 已停更；The City Generator 5.3 UI 损坏。

### Tripo

- Studio 没有个人 Premium；实际 Free/Pro/Max/Team。
- Pro 年付约 US$13/月，Max 年付约 US$36/月。
- H3.1 单次约 55 credits；Pro 约 54 次/月。
- 不适合硬表面 hero 建筑/太空港；quad 上限低、无 LOD/collision。
- **不要买来做建筑/城市。** 想试 AI 最多 Pro 月付做 props/rocks/角色底模。

### 公开 Web 许可

- Kitbash3D/BMS/Fab/ArtStation 标准 EULA 禁止 standalone redistribution。
- Three.js 公开 GLB 可被提取；购买资产只建议 private build/离线渲染。
- 公开版只用 CC0 / CC-BY（带署名）/ 项目自有，或购买明确再分发许可。

---

## 7. 研究文档索引

`~/Documents/ship-sheets/asset-inventory/planet-research/`

### 行星/城市/角色/起降

- `00-consolidated-plan.md`
- `01-terrain-architecture.md`
- `02-generation-pipeline.md`
- `03-local-assets.md`
- `04-city-generator-audit.md`
- `05-city-generation-alternatives.md`
- `06-org-planet-bibles.md`
- `07-characters-shops-landing.md`
- `08-highdetail-map-navigation.md`
- `09-org-planets-master-plan.md`
- `10-flyable-ship-pipeline.md`

### 实现研究

`implementation/`

- `11-planet-terrain-implementation.md`
- `12-city-implementation.md`
- `13-player-character-implementation.md`
- `14-ship-takeoff-landing-implementation.md`
- `15-free-terrain-toolchain.md`
- `16-free-assets.md`
- `17-quality-assets.md`
- `18-blender-addons-generators.md`
- `19-local-asset-audit.md`
- `20-online-sci-fi-assets.md`
- `21-tripo-premium-evaluation.md`
- `22-city-generator-poly-audit.md`
- `23-hero-asset-decimation-test.md`
- `24-rendering-lighting-realism.md`
- `25-visual-helper-tools.md`
- `26-texture-upscaling.md`
- `27-cockpit-ui.md`
- `28-new-hero-assets.md`

### cockpit mockup

- `implementation/mockups/27-cockpit/cockpit-mockup.html`
- `implementation/mockups/27-cockpit/preview.png`

### 本仓视觉/系统文档

- `docs/ARCHON-TEXTURE-PASS.md` — Archon 贴图 pass、UV/AO 限制、2K/4K 对比
- `docs/TORPEDO-VFX.md` — 鱼雷/爆炸 VFX 架构、性能、限制
- `docs/cockpit-ui/README.md` — 第一人称座舱/HUD、截图、数据接线
- `docs/hardpoints/README.md` — TM-5/TG-6/RH-7 硬点验收

---

## 8. 关键代码地图

| 文件 | 作用 |
|---|---|
| `src/game/main.ts` | 主循环、HUD、跃迁、输入、着陆、BOSS/目标、后处理 |
| `src/game/flight.ts` | 飞行物理、跃迁状态机、第一/第三/自由相机 |
| `src/game/ship.ts` | GLB 加载、缩放、居中、BVH、程序化舰 |
| `src/game/cockpit.ts` | 第一人称独立座舱 Scene/CockpitPass、3D 内饰、MFD、裂纹/灯光 |
| `src/game/ships.ts` | 舰船数据、武器解析、射程、护盾回复、A 级规则 |
| `src/game/combat.ts` | NPC 舰队、弹丸、护盾/结构、BVH 碰撞、爆炸、死亡序列 |
| `src/game/torpedo-vfx.ts` | 鱼雷/导弹 InstancedMesh 弹体、尾迹丝带/粒子、终端增推 |
| `src/game/explosion-vfx.ts` | 火球、等离子冲击环、残骸、灯光、级联殉爆 |
| `src/game/vfx-common.ts` | 程序化 VFX 贴图、固定容量 GPU 粒子场 |
| `src/game/damage.ts` | 护盾壳、命中特效、烟/火、损伤可视化 |
| `src/game/world.ts` | 行星、太阳、空间站、天空、阴影 |
| `src/game/shaders.ts` | 行星/太阳/大气/天空/环 |
| `src/game/audio.ts` | 引擎声、武器声、爆炸声 |
| `src/pages/index.astro` | 游戏 HTML/CSS/HUD |
| `src/pages/terrain-sample.astro` | 1 km 地形样本 |
| `src/pages/city-hero.astro` | Nautilus Reach city-hero v4 港口街区样本 |
| `src/pages/vfx-torpedo-test.astro` | 鱼雷/爆炸 VFX 测试场 |
| `src/pages/kitbash-port.astro` | K039 港口预览 |
| `src/scripts/hardpoint-data.ts` | setup 编辑器 18 艘船硬点 |
| `tools/terrain/generate_sample.py` | 地形高度场样本 |
| `scripts/city-hero-v2/` | Nautilus Reach city-hero v4 Blender 场景 |
| `scripts/kitbash/` | K039 港区 Blender 场景 |

---

## 9. 运行 / 构建 / 验证

```sh
cd /Users/apple/orca/projects/verlins_home
npm run dev -- --port 4329
# 游戏： http://localhost:4329/yacht/
# setup：http://localhost:4329/yacht/setup/
# 鱼雷/爆炸 VFX 测试场：http://localhost:4329/yacht/vfx-torpedo-test/?scene=finale&hud=0
```

鱼雷/爆炸 VFX 逐帧截图与性能：

```sh
VFX_URL='http://localhost:4329/yacht/vfx-torpedo-test/' node scripts/vfx-capture.mjs
# 单场景：VFX_SCENES=impact,finale ...
```

产物：`docs/vfx-torpedo/*.jpg`、`docs/vfx-torpedo/captures.json`、`docs/vfx-torpedo/perf.json`。
设计与限制说明：`docs/TORPEDO-VFX.md`。

构建：

```sh
npm run check
npm run build
```

截图/验证：

- 用 headless Chrome + `--enable-unsafe-swiftshader --use-angle=swiftshader`。
- 主屏截图：`screencapture -x -m`。
- 逐帧检查要用 CDP screencast，不要只看一张静态图。
- 当前 Chrome CDP 端口常用 9333；用完可重启。

---

## 10. 当前样本 / 已知问题

### 样本

- `/yacht/terrain-sample/` — authored terrain + 港区尺度样本
- `/yacht/kitbash-port/` — K039 英雄港口实时预览
- `/yacht/city-hero/` — city-hero v4 港口街区 + 单栋 K032/K038 hero + T2 到港厅；5 张 Cycles renders

### 已知问题

- K032/K038 原生 hero 几何 200–360k 已够；不要减到 100k 做近景。
- Archon 贴图不是分辨率不够，而是 UV/texel budget/材质：UV 97.3% packed、平均 5.7× 重叠、约 5.3 texels/m。0 成本 pass 已合并；4K 在 140 m macro 下与 2K 几乎不可区分，不作为默认。真 AO 需要 UV1/re-UV。
- 4K 贴图单栋 hero 2.3–3.2 GB VRAM；1K–2K + KTX2 才适合 WebGL。
- 第一人称座舱 v3 已合并；仍是程序化 authored kit，不是 Blender 45–65k GLB + 2K PBR atlas；AR10 是 light kit 放大 + 桥楼附加件，不是独立 capital 舰桥。
- 座舱 103k/108k tris，高于设计 45–65k；draw call 保持 31。
- 爆炸/鱼雷 VFX v2 已合并；冲击环仍是相机朝向 Sprite，不是真实 3D 球壳；需真机长时间 Archon 实战 FPS 验收。
- city-hero v4 已合并：单栋 K032/K038 hero、45 个街区模块、品牌清理、工业边缘；仍是离线 Cycles stills + 1200 m 工程平台，不是最终城市系统。K015 只做远景。
- 行星真实地形/城市/步行/起降仍未接入主游戏。
- `surfacePatch` 已禁用；地形占位平面会产生黑块/边缘。
- 大型舰落地规则：AR10 永不落地；2–2.6 km 只 XL cradle/轨道。

---

## 11. 下一步优先级

1. **实机验收**：BHN 3 秒、NPC 多敌对、护盾简化/静态、鱼雷/爆炸 VFX v2、座舱、第三人称 HUD、Archon 贴图。
2. **第一人称座舱验收**：已合并 v3；真机检查 A-30/AR10、1280×720、warp/受击/损伤，再决定是否用 Blender GLB 替换程序化 kit。
3. **Archon 贴图后续**：0 成本 pass 已合并；如需进一步降 VRAM，再接 KTX2Loader 走 2K KTX2（16.8 MB），不要默认 4K。
4. **候选舰硬点验收**：TM5/TG6/RH7 已在 setup 截图确认，标记落在舰体正确位置；截图在 `docs/hardpoints/`。实机开火/喷口朝向仍待逐舰飞行验收。
5. **城市 hero**：v4 已合并为港口街区样本；下一步把已验证的 hero 尺度/街区规则带到 IAC 真实地形，而不是继续堆 1200 m 平台。
6. **IAC 垂直切片**：16 km authored terrain + Anvil Landing + 1 shop + 3 NPC + player + A-30 landing。
7. **资产采购决策**：本地优先；若要买，Lunar Base + BMS Greebles；Tripo 不买。

---

## 12. 最近提交

- `90a37dd` — 合并鱼雷/爆炸 VFX v2（InstancedMesh 弹体、破缺冲击波、多瓣火球、棱角残骸）
- `e5c250d` / `9955ff9` — VFX v2.1/v2：软冲击波、多瓣火球、残骸形状、长烟尘
- `1678c12` — 合并 city-hero v4（单栋 hero、港口街区、品牌清理、工业边缘）
- `972a759` — city-hero v4：品牌清理、45 个街区模块、T2 门厅、地形/工业边缘
- `9867539` — city-hero v3：dense port district、T2 facade、terrain/skyline
- `06eb41f` — city-hero v2：单栋 K032/K038 hero + CommunityCentre T2
- `4e65086` — 第三人称 HUD：舰队情报框与 boss 血条分层，修复重叠与可读性
- `a820345` — TM-5/TG-6/RH-7 硬点 setup 验收截图
- `2dfb79e` — 合并 Archon 贴图 0 成本 pass（AO/ORM、MikkTSpace、anisotropy 16）
- `5903714` — Archon 贴图 pass：ORM/自发光/albedo、手写 MikkTSpace、2K/4K 对比
- `2a72749` — 合并第一人称座舱 v3（独立 cockpit scene/pass、VX-9 HUD、canopy mask、伤害裂纹、warp 遮挡）
- `e4e7b44` — 座舱 v3：移除 AR10 悬浮 overhead bar、局部裂纹、目标框 canopy mask、侧轨支架
- `56179b8` — 座舱 v2：细框、可读 MFD、HUD 安全边距、warp 遮挡
- `4bc0052` — 座舱 v1：独立 cockpit scene/pass、VX-9 HUD 垂直切片
- `1da9467` — TM5/TG6/RH7 硬点 annotation length 修正；舰船贴图 anisotropy/emissive；新增本文件
- `ce44db0` — BHN 3 秒、NPC 全图多敌对、护盾简化/静态、爆炸随机殉死、第三人称动态、7 艘候选舰接入
- `85b6d77` — Nautilus Reach hero 样本
- `cc2cf01` — 路线图记录 Nautilus Reach
- `fcf1588` — 渲染/光影研究
- `92f3fc8` — hero 减面实测
- `2b088d0` — Tripo 评估
- `ed73894` — City Generator 结论修正
- `41b316c` — 大舰射程/Archon 炮声光效/护盾抽搐
- `bea79f7` — 城市平台/三层尺度样本

---

## 13. 一句话提醒

**视觉质量优先，但不要再用程序化低模、CLI 拉伸、叠楼来伪装细节。**  
**能用本地高质量 authored 资产 + Blender 手工构图，就不要生成。**
