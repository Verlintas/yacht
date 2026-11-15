# Ship Class Standard — T1–T12

**Version:** 2026-11-16  
**Status:** project standard; replaces the older informal tier table.  
**Rule:** tier is decided primarily by **bridge/cockpit scale + tonnage + role**, then cross-checked against length. Length alone does not promote a ship; a carrier or drone can be an exception.

## Tier table

| Tier | Label | Typical length | Bridge / role | Typical examples |
|---|---|---:|---|---|
| **T1** | 微型 | 8–15 m | 单人舱/无人 | 微型无人机、侦察探针 |
| **T2** | 轻型 | 18–60 m | 单人战斗机座舱 | A-30 25 m、F-008 22 m、DK6 35 m、HS3 25 m（NPC drone） |
| **T3** | 中型 | 45–150 m | 小型多人员舰桥 | PH3 80 m、VA3 90 m（NPC）、SH3 28 m（interceptor exception） |
| **T4** | 重型 | 90–400 m | 中型舰桥/炮艇 | CR 180 m、GL4 90 m |
| **T5** | 大型 | 250–1,500 m | 驱逐/轻巡/武装货船 | MB 520 m、F24 600 m（NPC）、TM5 1,200 m |
| **T6** | 主力 | 1,500–2,500 m | 战列舰/重巡/航母舰桥 | BB6 2,000 m、TG6 1,600 m |
| **T7** | 旗舰 | 2,400–4,000 m | 旗舰/战巡舰桥 | CG7 2,400 m、RH7 3,000 m |
| **T8** | 母舰 | 3,000–6,000 m | 母舰/航母指挥核心 | OS8 3,000 m（NPC carrier） |
| **T9** | 无畏 | 5,000–7,500 m | 无畏舰桥/舰队指挥 | 暂无现役玩家舰 |
| **T10** | 超无畏 | 8,000–12,000 m | 超无畏指挥核心 | AR10 8,000 m |
| **T11** | 贡献 | 15,000–25,000 m | 战役级支援/母舰 | 暂无现役玩家舰 |
| **T12** | 未定 | 30,000 m+ | 等级保留 | **当前没有任何舰船达到 T12** |

Overlaps are intentional. T1–T5 keep the old 2× ladder; T6+ re-anchor around BB6 2,000 m / CG7 2,400 m and T10 8,000 m. A 3,000 m carrier can be T8 because of hangar/bridge capacity; a 90 m drone transport stays T3 despite being short; SH3 28 m is a T3 interceptor exception.

## Existing ships

| Ship | Tier | Length | Role | Notes |
|---|---:|---:|---|---|
| A-30 雷霆 | T2 | 25 m | multi-role fighter | player |
| F-008 短剑 | T2 | 22 m | interceptor | player |
| CR 轰炸机 | T4 | 180 m | heavy bomber | player |
| MB 货船 | T5 | 520 m | freighter | player |
| BB6 战列舰 | T6 | 2,000 m | battleship | player |
| CG7 Commander | T7 | 2,400 m | flagship | player |
| DK6 | T2 | 35 m | bomber | candidate |
| GL4 | T4 | 90 m | heavy corvette | candidate |
| TM5 | T5 | 1,200 m | frigate | candidate, supersedes 160 m |
| TG6 | T6 | 1,600 m | cruiser | candidate, supersedes 280 m |
| VA3 | T3 | 90 m | liquid/gas drone transport | **NPC only** |
| F2-5 | T5 | 600 m | unmanned freighter | **NPC only** |
| PH3 | T3 | 80 m | corvette | candidate |
| RH7 | T7 | 3,000 m | battlecruiser | candidate, supersedes 350 m |
| SH3 | T3 | 28 m | interceptor | candidate |
| AR10 | T10 | 8,000 m | destroyer/super-capital | candidate, 8,000 m |
| HS2 | T2 | 25 m | drone | **NPC only** |
| OS8 | T8 | 3,000 m | battlecarrier | **NPC only** |

## Scale rules

1. **Player ship length** is the value used by `loadShipModel` and the setup editor. All hardpoints must be expressed at that final length.
2. **Annotated hardpoints** at a different source length must be scaled by `finalLength / annotationLength`.
3. **T10 baseline is 8,000 m** (AR10). BB6 is 2,000 m and CG7 is 2,400 m; T10 is a strategic-scale hull, not a slightly enlarged battleship.
4. **T11** is 15,000–25,000 m; **T12** is reserved at 30,000 m+ and currently has no ship.
5. **NPC-only exceptions** do not become player-flyable just because their length fits a tier.

## Weapon semantics

| Tag | Meaning |
|---|---|
| `ca` | 机炮 / autocannon |
| `su` | 鱼雷 / torpedo |
| `le` | 激光 / laser |
| `K` | 轨道炮 / railgun |
| **`P`** | **舰首炮 / bow gun** |
| **`io`** | **副炮 / secondary battery** |
| `A` | 定制级主炮 |

- `A` damage is `(hull + shield) / 4` so four hits kill a same-tier ship.
- Custom `A` torpedoes have **2.4×** projectile speed; custom `A` bow guns have **1.5×** projectile speed.
- AR10 uses `P A` for W1–W8 bow guns and `su A` for W13–W33 torpedoes.
- `io` is a secondary battery; `P` is a bow gun. They are not interchangeable in role or placement.
- `Auto` turrets only fire at targets that have already attacked us.

## Armor / shield guidance

- T2–T4: light, fast regeneration; shield is a buffer, not a second hull.
- T5–T7: layered shields and armor; regeneration slower in combat.
- T8–T10: huge shield pools, percentage-based regeneration; out-of-combat recovery is accelerated.
- T11–T12: strategic assets; not currently player-flyable.

## Validation checklist

- [ ] tier label matches bridge/cockpit scale
- [ ] length is in the expected band or an explicit exception
- [ ] all hardpoints use the final length
- [ ] NPC-only flag is set where intended
- [ ] `io` and `P` are not swapped
- [ ] A-class four-hit rule still holds
- [ ] setup editor and `ships.ts` use the same length
