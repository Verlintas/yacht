# 夜航 · 游戏路线图

**更新：** 2026-11-16  
**当前提交：** `bea79f7`  
**目标：** 从静态个人站升级为可飞行、可下船、可探索六组织母星的 Three.js 太空游戏。

---

## 1. 当前已完成

### 飞行与战斗

- 6 艘原舰 + AR-10 共 7 艘玩家可飞舰。
- AR-10：T10 / 8,000 m / 45 门武器 / 13 喷口。
- 舰首炮 W1–W8：`P A`，355,000 伤害，3,300 m/s，8 门手动。
- 鱼雷 W13–W33：`su A`，177,500 伤害，3,600 m/s，5–15 秒动态装填。
- 21 具鱼雷独立装填；全局发射闸门约 0.476 秒/发；左右交错、多目标分配。
- 自动炮只攻击已攻击我方的目标；护盾受击延迟/脱战加速回复。
- 舰船逐三角 BVH 碰撞 + 撞击伤害。
- NPC 舰队：最多 4 队，全图最多 1 支敌对；海盗概率 32%，初始 1 敌 3 中立。

### 行星与视觉

- 行星半径 2,400–6,600 km；轨道 80,000 km 起。
- 大气层高度降为 **100 km**；视觉大气壳固定约 **55 km** 厚。
- 修复近行星黑屏/黑矩形：禁用低空地形占位平面，行星夜面/夜空/大气提高底噪，太阳与行星着色器加 NaN 保护，bloom 前增加 HDR 安全钳制。
- 太阳光晕启用深度测试，不再穿透行星。

### 资产与工具

- 12 艘候选舰硬点、舰级、尺寸已整理；`/yacht/setup/` 可查看 18 艘。
- Phalanx kitbash pilot 已接入：49,945 tris、9 材质、LOD/碰撞。
- Archon 尾部 62 个二维占位卡片已清理。
- Blender kitbash 管线、网络资产目录、舰船审计报告已产出。

### 已知问题

- AR-10 纹理密度仍然很低，需要 re-UV / 2K trim sheet / 材质重做。
- 12 艘候选舰大部分仍是 conversion-only shell。
- 星球表面仍是 shader 球体；真实地形、城市、角色、起降均未接入。
- T12 正式名称未定。
- Unity 空间站/基地/城市资产路径与格式仍未提供。

---

## 2. 核心架构决定

1. **行星用 authored terrain，不默认运行时生成。**
   - 轨道层：现有 shader globe 作为 impostor。
   - 主行星：一个 16–32 km 高精区域，真实地形网格 + 碰撞 + 植被 + 城市。
   - 高精区外：低精地形/球体。
   - 运行时只负责流式加载、LOD、剔除和碰撞。

2. **城市用自定义离线生成器 + Blender 模块化 kitbash。**
   - City Generator 仅作道具/参考，不作地表城市生产。
   - 城市 tile 约 1 km；道路、地块、建筑、碰撞、导航数据离线生成。
   - 运行时用 `InstancedMesh` / `BatchedMesh` / `LOD`。

3. **玩家角色独立于飞船。**
   - 角色胶囊控制器 + GLB 骨骼动画 + 交互系统。
   - 飞船降落后切换为步行；登船后切回飞行。
   - 商店、NPC、对话、任务都在步行模式中。

4. **小船着陆，大舰轨道/空间站停靠。**
   - 20–120 m 小船可在城市 pads 起降。
   - 1,200–3,000 m 大舰停靠轨道船坞或近地悬停。
   - AR-10 8,000 m 不进入大气层着陆，只做轨道/船坞交互。

5. **六组织母星各一个主题星球。**
   - IAC 炉心星、WRS 白脊星、APA 琥珀港、ORT 环轨星、RTA 赤潮星、MVB 苔幕星。
   - 每个星球至少一个命名高精区 + 城市/着陆点 + 商店/NPC。
   - RTA / MVB 高危险。

---

## 3. 实现研究结论（2026-11-16）

四份实现研究已经完成，下面是可以直接执行的结论。

### 3.1 星球地形

采用 **三层结构**：

1. **轨道层**：现有 shader globe 作为 far impostor。
2. **低精外环**：约 128 km 范围，16 km 低精 tile。
3. **高精区**：16–32 km，首个 IAC 区域 16 × 16 km。

关键选择：

- 离线 authored heightfield，运行时只流式加载和 LOD，不跑 erosion/noise。
- 高精 tile：1 km × 1 km，129² / 257² 网格，预构建 LOD 金字塔。
- 地形格式用自定义 `.cterr`（R16 height + header），不用 GLB 做地形。
- CPU 使用 `float64` 绝对坐标；地表用 region ENU；tile 用局部 `float32`。
- 碰撞用 heightfield 双线性采样 + pad 平面；`three-mesh-bvh` 只用于建筑/岩石/道具/舰船。
- 深度优先 reverse-Z，保留 logarithmic depth fallback；CSM 3 × 2048，maxFar 5 km。
- 工具链**$0、macOS 原生**：Python 3.12/3.13 + `pyfastnoiselite` + `fastscapelib` + Blender 5.3 headless + Pillow/OpenEXR + KTX-Software。
- 许可证坑：World Machine Basic / Houdini Apprentice / Gaea Community / Terragen Free 都只能 non-commercial，不适合可再分发的开源资产链；TerreSculptor 2.0 可商用但 Windows-only。
- 质量预期：舰船/飞行视角约为 World Machine 的 75–85%；1–10 m 近景、沉积扇、悬垂/洞穴需要额外的 Blender 手工/贴图补强。

估算：IAC 垂直切片 **8–11 周**；含植被/城市 polish **11–15 周**；六组织母星 6–9 个月内容 + 2–3 个月工程。

### 3.2 城市

采用 **Kit → Stamp → District → Build → Runtime** 五层管线：

- 512 m city cell 流式加载；1–3 km 城区约 4–36 个 cell。
- 每个 org 一套 kit family：12–28 个模块 + trim sheet。
- 40–160 m block stamp 手工拼装；district 用 `city.plan.json` authored。
- headless Blender `build_city.py` 按 plan 组装、切 cell、导出 LOD/collision/nav。
- 运行时 `CityStreamer`、`CityCollision`、`InstancedMesh` / `BatchedMesh`。
- 质量分层：英雄镜头/主城区用本地 purchased Kitbash3D + Blender 手工拼装 + 原包 PBR；背景量用 CC0 Quaternius/Kenney/Poly Haven，经 decimate + KTX2 优化。

尺度规则：

- 20–600 m 船可落地。
- 2.0–2.6 km 主力舰只停 XL cradle 或轨道。
- **8 km Archon 永不落地**。
- S pad 60 m TLOF / M 300 m / L 900 m / XL 3,000 m cradle。

Anvil Landing 切片：600 × 600 m、1 个 S pad、1 个 hero shop、3 个 NPC；2 工程 + 1 美术约 6 周，solo 12–14 周。

### 3.3 玩家角色

- 自定义 **kinematic capsule**（0.35 m 半径 / 1.8 m 高），固定 1/60 s 步长。
- 地形用解析 heightfield；城市/舰体用 `three-mesh-bvh`。
- 必须使用 **SurfaceFrame 局部坐标**：5,000 km 处 float32 ULP ≈ 0.5 m，绝对坐标会让角色抖动。
- 必须冻结当前行星公转；IAC 轨道线速度约 3.9 m/s，否则泊位一分钟漂 230 m。
- `FlightController` 加 `enabled` / `InputRouter`，on-foot 时切断飞行输入。
- 一套 `PerspectiveCamera` + `CameraDirector`：第三人称默认，V 切第一人称。
- 角色资产：Quaternius CC0 基础体 + 动画库；55–65 骨骼、22–30 clips。
- 局部阴影：2048² / ±60 m + blob shadow；现有 1024² / ±5 km 不可用。
- 交互/商店/对话/任务/存档全部在步行层实现。

估算：工程约 47 人日、美术约 25 人日；1 工程 + 1 美术约 9–10 周，2 工程 + 1 美术约 5–6 周。

### 3.4 飞船起降

七个正式状态：

`space` / `atmospheric` / `approach` / `landing` / `landed` / `takeoff` / `docked`，外加 `docking` / `crash`。

- 同一时间只有一个系统拥有飞船姿态，避免“落地后还在滑”。
- **禁止 teleport 着陆**；现有 `startDock()` 行星分支必须替换。
- MVP 只允许 prepared pad 着陆；没有 pad 时显示 `NO PREPARED PAD — LANDING DENIED`。
- 接地检测用 3–6 个起落架接触点，pad 平面解析计算，不做整船地形 BVH。
- 起落架优先用 GLB 命名节点/动画；`_landed.glb` 只作 fallback，且不能重新居中。
- 默认 assist；`F` 请求 clearance，再按 `F` 启动 autoland，`X` 取消回手动。
- 大舰 >600 m 只做轨道/空间站停靠；AR10 只做轨道/船坞。

垂直切片：A-30 25 m 在 AP-03 S pad 完成 land → disembark → walk → re-board → takeoff；Phalanx 80 m 作为内部 M pad 测试。

估算：46 工程人日；solo 约 9 周；2 工程 + 1 美术约 5–6 周。

---

## 3.5 资产与工具选型（2026-11-16 研究）

### 本地资产优先级

| 用途 | 首选 | 说明 |
|---|---|---|
| 200 m 级 hero 塔楼 | **K032 BldgLG_A** 220 m / **275k tris** | 原生几何已在 WebGL 预算，不要减面 |
| 高效 hero 塔楼 | **K038 LargeJ** 223 m / **358k tris**；LargeI 241 m / 207k | 原生几何直接用；纹理压到 1K/2K |
| 工业细节/堆叠 | **K046 BldgLG_G** 88 m / 332k tris | 先合并 4K 贴图通道，再接 |
| 100 m 街区/裙房 | **City Generator L1** 3.6M / 62 DC / 86 MB | 只做 tile；整城不做 |
| 中景/近景基座 | **K039 Sci-Fi Industrial** | 建筑壳过 5k；props 平均仅 158 tris，近景需换 kit |
| 街道/店面 | **CityStreets 209** | 421 objects / 5.53M / 4K |
| 角色 | **Modelshop Greebles** posed/rig | 155–177k tris/角色 |
| greebles/管线 | K014 / K034 / Modelshop KitObjects | K039 props 不够近景 |

**不要用**：K043 / K022（无贴图）、K021（无贴图 massing）、K015（1K 远景）、K025（无材质）。

### Hero 减面结论

- K032/K038 的 hero mesh 原生只有 **200–360k tris**，已经在 WebGL 预算内；不需要做 100k/250k/1M LOD。
- 100k 减面在 95 m 会打穿窗洞，SSIM 掉到 0.58–0.84；只适合 400–500 m 外。
- 真正的成本是 **4K PBR 纹理**：单栋 hero 2.3–3.2 GB VRAM、GLB 239–319 MB。
- 用 **1K–2K 纹理 + atlas/channel-pack + KTX2**：GLB 降到 15–24 MB，95 m SSIM 0.999。
- 结论：**保留原生 250–360k 几何，压纹理，不做无意义减面。**

### Blender 插件

- 先装 **Cargo（免费）**。
- 可选付费：SCIFI Flex 2（$19.50）、MESHmachine（$44.99）、KIT OPS 4 Pro（$35）、True Terrain 5（$49）。
- Blender 5.3 刚发布，部分插件只支持 5.2；建议 **5.2 LTS 建模 + 5.3 导出/验证**。
- 不为 hero 购买城市生成器：Nodee Buildings 只适合现代背景；SceneCity 在 Apple Silicon 不可用；City Builder 3D 已停更；The City Generator 在 5.3 UI 损坏且面数爆炸。

### Tripo / AI 3D

- Tripo Studio 没有个人 “Premium” 档，实际是 **Free / Pro / Max / Team**；Premium 应核对为 **Max**。
- 2026-11 香港区：Pro 年付约 US$13/月（3,000 credits），Max 年付约 US$36/月（25,000 credits、8K 纹理、私有+商用）。
- 实际 H3.1 单次约 55 credits，不是 15；Pro 约 54 次/月，Max 约 454 次/月。
- 硬表面建筑/太空港不适合：建筑需要拆件生成；quad 上限 150k（P2.0 仅 25k quads）；无 LOD/collision/明确 emissive；社区反馈复杂件修 8 小时。
- **不要为 hero 建筑/城市买 Tripo。** 想试 AI 最多买 Pro 月付一个月（约 US$20），做 props/rocks/character base，然后取消。
- 付费输出许可较宽：可商用/可分发/可做 asset pack；免费档输出公开且 Tripo 拥有权利。
- 现阶段更值得：本地 K032/K038/K046；若要买，Lunar Base + BMS Modelshop Greebles。

### 渲染/光影

- 当前最大提升不是继续加 bloom/SSR，而是：1.7 m 人眼机位、35/50/85 mm 镜头、HDR 天空、4:1–8:1 主辅光比、fog/体积、hero 2K + tangent normal + AO + 玻璃分流。
- 后处理最后做；不要用 bloom 掩盖材质/光照问题。
- Blender hero 用 Cycles + denoise + AgX；EEVEE 只做迭代。
- Three.js 用 PMREM HDR 环境、Sun + CSM、GTAO、适度 bloom、Fog/aerial perspective、contact shadows、AgX/ACES；MSAA/SMAA 保底。
- 1080p 先保 60 fps；1440p 降一档阴影/GTAO。

### 网上资产

如果以后愿意买：

- **Kitbash3D Lunar Base $145**：78 models / 3.2M polys / 28 PBR，最贴近航天港。
- **BMS Modelshop Greebles $175**：近景 greeble/pipe/cable 最佳补充。
- **BMS Cyberpunk $175**：2 hero + 2 mega + 37 modular + 67 neon；crowd 面数太高，不能全量进 WebGL。
- **BMS AstroNova $175**：岩石/悬崖/陨石坑 + 200–250k hero astronaut/rover。

但当前本地库已经有 K032/K038/K046/Modelshop，**不需要先买新建筑包**。

### 公开 Web 许可红线

Kitbash3D / BMS / Fab / ArtStation 等标准 EULA 禁止 standalone redistribution；Three.js 公开构建的 GLB 可被用户提取。保守做法：

- 私有/离线 / 内部质量演示：可使用已购买本地资产。
- 公开 Web 构建：只用 CC0 / CC-BY（带署名）/ 项目自有，或购买明确的再分发许可。
- 公开版可把购买资产用于 Blender 参考渲染，游戏内替换为自建/CC0 资产。

**当前本地方案：** 继续用 K032/K038/K046 做 hero 质量验证；公开版资产策略单独决策。

---

## 4. 工作流

| 工作流 | 内容 | 主要文件/资产 |
|---|---|---|
| A. 行星地形 | authored heightmap、tile、LOD、碰撞、植被、海洋 | `src/game/world.ts`、新增 `terrain/` |
| B. 城市 | 离线布局、模块化建筑、pads、道路、商店、导航 | 新增 `city/`、Blender kit |
| C. 角色 | 胶囊控制器、动画、交互、商店、对话、NPC | 新增 `character/`、`npc/` |
| D. 起降 | 飞行状态机、landing gear、pad 检测、下船/登船 | `flight.ts`、`ship.ts`、`main.ts` |
| E. 舰船 | 剩余候选舰接入、材质/LOD、武器平衡 | `ships.ts`、GLB 资产 |
| F. 平台 | 性能、流式加载、存档、地图/导航、QA | `main.ts`、`world.ts` |

---

## 5. 里程碑

### M0 — 稳定与基础（当前）

- [x] 7 艘玩家舰、AR10 武器/鱼雷调优
- [x] 大气层减薄到 100 km
- [x] 近行星黑屏修复
- [x] NPC 密度与海盗频率调整
- [x] Anvil Landing v2 样本：Kitbash3D K039 + Blender + PBR + 实际 A-30
- [ ] AR-10 / 候选舰纹理与 LOD 收尾
- [ ] 帧率与内存基线（目标：1080p / 60 fps，高精地表 30 fps+）

### M1 — IAC 炉心星垂直切片（12–16 周，2 工程 + 1 美术）

目标：**一颗星球、一个城市、一个角色、一次完整起降。**

可以并行的四条线：

| 线 | 内容 | 工期 |
|---|---|---:|
| A. 地形 | 16 km 高精区、1 km tile、LOD、heightfield 碰撞、pad 平台 | 8–11 周 |
| B. 起降 | 状态机、起落架、pad 检测、autoland、起飞 | 5–6 周 |
| C. 角色 | SurfaceFrame、胶囊、相机、交互、商店、3 NPC | 5–6 周 |
| D. 城市 | 600×600 m Anvil Landing、S pad、1 shop、kit/stamp | 6 周 |

关键路径是地形；B/C/D 在 A 的 pad 与 heightfield 接口稳定后合流。若只做 core loop、砍掉植被和城市 polish，可压缩到 **9–11 周**。Solo 估算 **20–28 周**。

M1 具体交付：

- 16 km 高精地形（Forgeheart / Anvil Landing）
- Anvil Landing：420×260 m port apron + AP-03 **S 60×60 m TLOF** + 1 家商店 + 3 个 NPC
- 玩家角色：下船、步行、交互、登船
- 1 艘小船完整起降：**A-30 25 m 为主**；Phalanx 80 m 作为内部 M pad 测试
- 地图 POI + 导航 + 着陆标记
- 性能预算：地形 tile 流式加载、城市 draw call、角色/NPC LOD

### M2 — 高危险星球（6–8 周，复用管线）

- RTA 赤潮星：掠夺者港、残骸航道、赏金板
- 危险度地图层、敌对 NPC、海盗事件
- 第二套城市 kit / 地形 recipe

### M3 — 其余组织母星（16–24 周 + 内容制作）

- WRS、APA、ORT、MVB
- 每颗先做 1 个高精区，后续再加 2–3 个
- 商店/经济/对话扩展
- 城市间飞行与轨道站
- 六个星球的完整内容估算：**6–9 个月 content + 2–3 个月 engineering**，取决于 unique kit 和区域数量

### M4 — 打磨（持续）

- 起落架/坡道动画、城市人群/车辆
- 任务、发现、天气
- 全量 LOD/性能/存档/QA

---

## 6. IAC 垂直切片验收标准

- 从轨道定位 Anvil Landing，跃迁/飞行进入大气层。
- 在 16 km 高精区看到真实地形、岩石、植被、城市轮廓。
- 小船在 pad 上完成 landing gear、接地、下船。
- 玩家步行进入 1 家商店，与 3 个 NPC 交互。
- 返回飞船、起飞、离开大气层。
- 全程无黑屏、无穿透地形、无明显加载卡顿。

---

## 7. 研究文档

**当前质量样本：** `/yacht/terrain-sample/`，说明见 `docs/TERRAIN-SAMPLE.md`。Blender 参考渲染在 `docs/anvil-port-wide.png`、`docs/anvil-pad-close.png`、`docs/anvil-terrain-vista.png`；实时截图在 `docs/three-port.png`、`docs/three-pad.png`、`docs/three-vista.png`。

四份实现研究在：

`~/Documents/ship-sheets/asset-inventory/planet-research/implementation/`

- `11-planet-terrain-implementation.md`
- `12-city-implementation.md`
- `13-player-character-implementation.md`
- `14-ship-takeoff-landing-implementation.md`
- `15-free-terrain-toolchain.md` — 免费地形工具链与许可/性能实测
- `16-free-assets.md` — 免费资产与许可
- `17-quality-assets.md` — 高质量 CC0 材质/植被/角色/工业道具、实测面数与下载链接
- `18-blender-addons-generators.md` — Blender 插件/生成器选型与 5k 面数规则
- `19-local-asset-audit.md` — 本地 3D 资产审计（K032/K038/K046/Modelshop 等）
- `20-online-sci-fi-assets.md` — 网上高质量资产与许可
- `24-rendering-lighting-realism.md` — Blender/Three.js 真实感渲染与光影
- `25-visual-helper-tools.md` — 视觉辅助工具/插件
- `21-tripo-premium-evaluation.md` — Tripo Premium 评估（更新中）
- `22-city-generator-poly-audit.md` — City Generator 高面数/减面复检
- `23-hero-asset-decimation-test.md` — K032/K038/K046 hero 资产减面/LOD 测试（原生 200–360k 已够，纹理才是瓶颈）

已有设计底稿：

- `00-consolidated-plan.md` — 行星地形综合方案
- `06-org-planet-bibles.md` — 六母星设定
- `07-characters-shops-landing.md` — 角色/商店/着陆
- `08-highdetail-map-navigation.md` — 高精区/地图/导航
- `09-org-planets-master-plan.md` — 总体计划

---

## 8. 待定决策

研究已经给出默认推荐，除非明确反对，按推荐执行：

1. **玩家视角**：第三人称默认，V 切第一人称。
2. **小船起降**：assist 默认，autoland 可选；手动 landing Phase 2。
3. **城市切片**：600×600 m、S pad、1 个可进入商店、3 个 NPC；不先做 1 km 全城。
4. **地形工具链**：确定走 **Python 3.12/3.13 + pyfastnoiselite + fastscapelib + Blender 5.3** 的 $0 方案；不使用 World Machine / Houdini Apprentice / Gaea Community 等 non-commercial 许可。
5. **T12 正式名称**：仍未定；等级保留，无现役舰。
6. **候选舰接入顺序**：DK6 → F2-5 → PH3 → SH3，先接入垂直切片需要的 1 艘。
7. **资产许可**：Kitbash3D 本地镜像不能直接进 public repo；优先正版/CC0/自建 kit。

## 9. 第一周任务

1. 锁定 IAC K-IND kit 许可与 12 个模块清单。
2. 画 600×600 m Anvil Landing plan：pad、terminal、market row、shop、3 NPC anchor。
3. 用 1 个 512 m cell + 1 个 60 m pad 做性能/尺度 spike。
4. 把 `FlightController` 加 `enabled`、`InputRouter`、`SurfaceFrame` 接口。
5. 用 1 个 16 km heightmap blockout 验证 `.cterr` 格式、pad flatten、heightfield 采样。
6. 在 pad 上放一个 1.8 m capsule，走 100 m，验证地面高度/碰撞/相机。
