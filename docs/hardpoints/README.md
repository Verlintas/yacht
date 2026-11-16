# 候选舰硬点验收（TM-5 / TG-6 / RH-7）

**日期：** 2026-11-16  
**页面：** `https://verlintas.dev/yacht/setup/`  
**目的：** 确认 `ANNOTATION_LENGTH` 改为最终长度后，硬点不再被二次缩放。

## 结论

三艘船的武器、喷口、驾驶舱标记都落在舰体表面/边缘的正确位置，没有出现硬点整体缩到舰体内部或飘到船外的情况。

| 舰 | 游戏全长 | 标记数 | 截图 |
|---|---:|---:|---|
| TM-5 Templar Frigate | 1200 m | 8 | `tm5-hardpoints.png` |
| TG-6 Yellowjackets Cruiser Tigris | 1600 m | 23 | `tg6-hardpoints.png` |
| RH-7 Rhodes Battlecruiser | 3000 m | 19 | `rh7-hardpoints.png` |

## 修复回顾

根因：硬点坐标已经是最终尺寸，但 `ANNOTATION_LENGTH` 还是旧尺寸，加载时又按比例缩放了一次。

已改为：

- TM-5：`160 → 1200`
- TG-6：`280 → 1600`
- RH-7：`350 → 3000`

## 说明

- 截图来自 headless Chrome + SwiftShader，setup 加载大模型较慢，单舰约 30–40 s。
- setup 默认相机是整体视图；如果要检查单个挂点，需要在页面里选中标记后放大。
- 本次只验证静态位置；实机开火/喷口朝向仍需逐舰飞行验收。
