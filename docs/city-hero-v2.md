# Nautilus Reach v2 — authored city hero sample

**Date:** 2026-11-16  
**Worktree:** `/Users/apple/.local/share/opencode/worktree/e0f2de/city-hero-v2`  
**Route:** `/yacht/city-hero/`  
**Build:** `scripts/city-hero-v2/build_scene.py`; **render:** `render_v2.py`; **manifest:** `make_manifest.py`

## 1. What changed from the rejected sample

- Removed all K038 vertical stacking. The old 563 m “megastructures” are gone.
- The three hero towers are **single native meshes at scale 1.0**, not stretched or stacked:
  - K032 `BldgLG_A` — 220.3 m — **275,250 tris**
  - K038 `LargeJ` — 222.7 m — **357,771 tris**
  - K038 `LargeI` — 240.7 m — **206,982 tris**
- The city platform is 1200 × 1200 m flat, with a 40 m retaining wall and no terrain under the deck.
- The terminal is the authored **650M1 CommunityCentre**: 103.3 × 86.7 × 26.8 m, using a
  1.03 M-tri subset (shell + interior) of the 1.37 M source.
- K039 is used only as **1:1 low-rise/midground** (10–28 m), never stretched into a hero.
- K015 is used only as a **distant silhouette ring at ~1.3 km**. The source kit is 1:100,
  so those background meshes receive a documented ×100 unit correction; they are not
  stacked and not used as close-up detail.
- The port foreground is authored 1:1: T2 entrance hall, 60 m TLOF, 25 m A-30,
  80 m gantry, tank farm, pipes, containers, C2184 panel banks, K014/K034 greebles,
  CityStreets props and Modelshop characters.

## 2. Hero placements

| Object | Asset | x / y | Height | Tris | Scale |
|---|---|---:|---:|---:|---:|
| `Hero_K032_A` | K032 BldgLG_A | -290 / -150 | 220.3 m | 275,250 | 1.0 |
| `Hero_K038_J` | K038 LargeJ | 245 / -150 | 222.7 m | 357,771 | 1.0 |
| `Hero_K038_I` | K038 LargeI | 430 / 200 | 240.7 m | 206,982 | 1.0 |

Secondary single buildings (all native, one mesh each): K032 `BldgLG_B` 139.5 m,
K038 `LargeC` 137.4 m, K038 `LargeE` 144.6 m, K032 `BldgLG_E` 140.3 m,
K046 `BldgLG_G` 88.3 m, K046 `BldgLG_E` 61.9 m, K046 `BldgLG_D` 98.1 m.

K039 low-rise: 20 placements at 1:1 (10.9–28.1 m), concentrated along the boulevards
and the port edge. K015 background: 531.8–690.7 m silhouettes with 300 m
background platforms and low massing at their bases.

## 3. Scale / audit

- Deck: 1200 × 1200 m, top z = 0, no terrain under the city; terrain ring starts
  outside the retaining wall.
- TLOF: 60 m diameter; A-30: **24.99 m length / 28.84 m span / 9.34 m height**,
  46,774 tris (25 m class).
- Scene total: **15,348,529 tris**.
- Build audit: **OK** — no deck building intersects terrain, no primary-mass AABB
  overlaps, no hero duplicate/stack count, no hero scale ≠ 1.0.
- `stacking: none; each hero is one native mesh at scale 1.0`.

## 4. Render setup

- Cycles GPU (Metal), 1920 × 1080, 160 samples, adaptive threshold 0.012,
  OpenImageDenoise.
- AgX, “AgX – Medium High Contrast”, exposure 0.45.
- HDRI sky + physical low sun (9 W/m², 0.55° angular size) + cool area fills +
  warm practicals. Finite atmosphere volume (density 0.00008 /m) instead of a
  world volume: a World Output Volume was tested and suppressed the HDRI surface
  in Blender 5.3, so it was rejected.
- The in-render compositor mist stack was also rejected because it crushed the
  frame; final JPGs receive a light post grade (contrast/saturation/cool shadows/
  warm highlights/vignette) and are saved from the raw AgX PNGs.
- Cameras: 24 mm wide, 50 mm pad, 35 mm aerials, 45 mm terminal, 35 mm hero facade.

## 5. Renders

Final files are in `public/city-hero/renders/`:

1. `01_wide_port.jpg` — port wide, all three native heroes, apron markings.
2. `02_pad_closeup.jpg` — 60 m TLOF / A-30 / gantry.
3. `03_aerial_skyline.jpg` — low aerial over the port and hero cluster.
4. `04_terminal_detail.jpg` — T2 entrance hall, characters, C2184/DETAIL.
5. `05_hero_facade.jpg` — K038 LargeJ native facade close-up.
6. `06_city_platform.jpg` — whole 1200 m platform aerial.
7. `07_terminal_approach.jpg` — T2 terminal approach with K038 LargeJ / LargeI.

## 6. Limitations

- Offline Cycles stills only; no realtime GLB/preview rebuild in this pass.
- CommunityCentre uses a 1.03 M-tri authored subset of the 1.37 M source.
- K015 is background-only; its 1K textures are not close-up detail.
- Kitbash3D/Modelshop assets are private/offline; public Web redistribution needs
  separate licence review.
- The 1200 m deck is intentionally a flat engineered platform; this is a sample,
  not the final procedural city system.

## 7. Reproduce

```sh
cd /Users/apple/.local/share/opencode/worktree/e0f2de/city-hero-v2
/Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/city-hero-v2/build_scene.py
/Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/city-hero-v2/render_v2.py -- \
  --shots wide,pad,aerial_low,aerial,detail,hero,termwide \
  --res 1920x1080 --samples 160 --tag final
python3 scripts/city-hero-v2/make_manifest.py
npm run check && npm run build
```
