# Nautilus Reach v4 — focused port polish

**Date:** 2026-11-17  
**Worktree:** `/Users/apple/.local/share/opencode/worktree/e0f2de/city-hero-v2`  
**Route:** `/yacht/city-hero/`  
**Build:** `scripts/city-hero-v2/build_scene.py`; **render:** `render_v2.py`; **grade:** `grade_final.py`; **manifest:** `make_manifest.py`

## 1. v4 changes on top of 9867539

- **Brand scrub:** deleted 338,448 faces across 45 objects carrying source
  Ads / Banner / Signs_Lights / Screens / Decals materials. No KITBASH3D or
  asset-store branding remains in the visible scene. `brand_audit: OK`.
- **In-world signage:** Nautilus Reach, Port 07, T2 Arrivals, Berth 07/12,
  Ship Line 09, Nautilus Freight, Orbital Line, Night Market, Fuel Depot,
  Danger / No Entry, plus Chinese neon “夜航 / 港口 / 货运 / 夜市 / 禁止入内”.
- **District reduced and unified:** removed the 86-module asset dump; kept
  **45 single modules** in four coherent blocks (Canyon West, Canyon East,
  Port Gate, North/Port edge), using repeated K032 facade families and K039
  shop rows. All placed at scale 1.0; no stacking.
- **Palette:** district materials copied and multiplied to a cool dark-metal
  palette; heroes keep native materials. Street furniture and signs use warm
  sodium + teal/amber neon.
- **Terminal:** real doors/frames, warm interior, arrivals board, canopy truss
  and downlights, queue barriers, baggage carts, taxis, people, C2184 panel bank,
  plus a south-facing T2 arrival pylon readable from the pad.
- **Industrial terrain / slab edge:** refinery clusters (columns, tanks,
  chimneys, flares, pipe racks), wall warehouses, portal cranes, raised
  perimeter road/pipe band, asteroid rock ridges, ring/hill/foreground roads,
  long-exposure traffic lights, height-gradient atmosphere volume.
- **Composition:** 5 stills:
  1. low 1.7 m port approach with T2 pylon, A-30, all three hero towers and street;
  2. 1.7 m pad/street canyon with A-30 under the gantry and in-world signage;
  3. T2 terminal detail;
  4. dense district 3/4 aerial;
  5. 1200 m platform aerial showing the industrial edge.

## 2. Hero placements / rules

| Object | Asset | x / y | Height | Tris | Scale |
|---|---|---:|---:|---:|---:|
| `Hero_K032_A` | K032 BldgLG_A | -290 / -150 | 220.3 m | 275,250 | 1.0 |
| `Hero_K038_J` | K038 LargeJ | 245 / -150 | 222.7 m | 357,771 | 1.0 |
| `Hero_K038_I` | K038 LargeI | 430 / 200 | 240.7 m | 206,982 | 1.0 |

No K038 vertical stacking, no uniform giant scaling, no terrain intersection.
Build audit **OK** including road-overlap checks.

## 3. Scene totals

- **28,396,958 tris** total.
- 1200 × 1200 m deck, 40 m retaining wall, no terrain under city.
- TLOF 60 m; A-30 24.99 m length / 28.84 m span / 9.34 m height, 46,774 tris.
- District: 45 single modules; heroes: 3 native meshes.
- CommunityCentre terminal: 1.03 M-tri authored subset of 1.37 M source.
- K015 background: 531.8–690.7 m, ×100 unit correction, 600 m authored bases.

## 4. Render setup

Cycles GPU, 1920 × 1080, 160 samples, adaptive 0.012, OIDN, AgX Medium High
Contrast. HDRI + physical sun 9 W/m² + area practicals; height-gradient atmosphere volume
(extra fog volumes were removed for render time). In-render compositing disabled; final
JPGs receive a light post grade.

## 5. Renders

`public/city-hero/renders/`:

1. `01_port_approach.jpg` — 1.7 m, T2 pylon + terminal + A-30 + three heroes.
2. `02_street_canyon.jpg` — A-30 under gantry, neon shop canyon.
3. `03_terminal_detail.jpg` — T2 doors/arrivals/queue/taxis.
4. `04_dense_aerial.jpg` — focused district/port/hero cluster.
5. `05_platform_aerial.jpg` — industrial edge, warehouses/refineries, 1200 m deck.

## 6. Honest limitations

- Offline Cycles stills only; realtime GLB/preview not rebuilt.
- CommunityCentre terminal is the 1.03 M-tri authored subset.
- K015 is background only; 1K textures are not close-up detail.
- K046 native modules read as ship hulls, so K046 is used only as material/detail
  reference on the custom port, not as a district building kit.
- The platform is still a 1200 m engineered deck; outer logistics yards remain,
  but the edge is now dressed with warehouses/road/industry and haze.
- Kitbash3D / Modelshop assets are private/offline; public Web needs separate
  licence review.
