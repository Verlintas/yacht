# Nautilus Reach v3 — authored port district

**Date:** 2026-11-17  
**Worktree:** `/Users/apple/.local/share/opencode/worktree/e0f2de/city-hero-v2`  
**Route:** `/yacht/city-hero/`  
**Build:** `scripts/city-hero-v2/build_scene.py`; **render:** `render_v2.py`; **grade:** `grade_final.py`; **manifest:** `make_manifest.py`

## 1. v3 changes on top of 06eb41f

- Replaced the empty-apron showcase with a **port district**: ~90 single native
  K039/K032/K038 modules, continuous shop rows, second-row mid-rise blocks, a
  Port 07 gate, sidewalks/curbs, streetlights/cables, market stalls, taxis/buses,
  container yards, rail gantries, steam vents, crates and ~30 Modelshop people.
- Kept the three hero buildings exactly:
  K032 `BldgLG_A` 220.3 m / **275,250 tris**, K038 `LargeJ` 222.7 m / **357,771 tris**,
  K038 `LargeI` 240.7 m / **206,982 tris**. One native mesh each, scale 1.0.
  **No K038 stacking, no uniform giant scaling, no facade stretch.**
- T2 terminal facade now has real doors, door frames, interior warm glow,
  arrivals board, canopy truss/downlights, queue barriers, baggage carts,
  benches, taxis, people and C2184 panel detail. The CommunityCentre shell is a
  1.03 M-tri authored subset of the 1.37 M source.
- Background K015 ring: 600 m authored city bases with single K032/K039 modules,
  not untextured boxes. 1K K015 textures are used only as dim silhouette detail.
- Outer terrain: authored asteroid rock ridges, ring/hill service roads with
  lamps/edge markers, macro colour variation and atmospheric volume.
- New cameras: low street/port canyon, low 3/4 aerial, denser platform aerial,
  terminal approach, terminal detail, pad close.
- **No flat blue massing boxes** remain in the background.

## 2. Hero placements

| Object | Asset | x / y | Height | Tris | Scale |
|---|---|---:|---:|---:|---:|
| `Hero_K032_A` | K032 BldgLG_A | -290 / -150 | 220.3 m | 275,250 | 1.0 |
| `Hero_K038_J` | K038 LargeJ | 245 / -150 | 222.7 m | 357,771 | 1.0 |
| `Hero_K038_I` | K038 LargeI | 430 / 200 | 240.7 m | 206,982 | 1.0 |

Secondary single buildings: K032 `BldgLG_B` 139.5 m, `BldgLG_C` 167.9 m,
`BldgLG_D` 88.6 m, `BldgLG_E` 140.3 m, `BldgLG_F` 99.1 m, `BldgLG_H` 92.8 m;
K038 `LargeC` 137.4 m, `LargeE` 144.6 m, `LargeD` 193.9 m; plus K032 M/S
mid-rise blocks. All single, native scale.

## 3. Scene totals / audit

- **34,378,548 tris** total.
- Deck 1200 × 1200 m, 40 m retaining wall; no terrain under the deck.
- TLOF 60 m; A-30 **24.99 m length / 28.84 m span / 9.34 m height**, 46,774 tris.
- Build audit **OK**: no deck/terrain intersection, no primary-mass AABB overlap,
  no building overlap with the eight authored carriageways, each hero one mesh,
  hero scale 1.0. `stacking: none`.
- K015 towers 531.8–690.7 m (×100 unit correction), used only as background.

## 4. Render setup

- Cycles GPU (Metal), 1920 × 1080, 160 samples, adaptive 0.012, OIDN.
- AgX Medium High Contrast, exposure 0.45.
- HDRI sky + physical sun 9 W/m² @0.55° + cool area fills + warm practicals.
- Finite atmosphere volume density 0.00014 /m; World Output Volume rejected
  because it suppressed the HDRI surface in Blender 5.3.
- In-render compositor mist rejected; final JPGs use a light post grade
  (contrast/saturation/cool shadows/warm highlights/vignette/grain).

## 5. Renders

`public/city-hero/renders/`:

1. `01_port_wide.jpg` — T2 terminal approach + K038 LargeJ + dense district.
2. `02_street_canyon.jpg` — 1.7 m port canyon, A-30 under gantry, gate/heroes.
3. `03_pad_closeup.jpg` — 60 m TLOF / A-30 / district behind.
4. `04_dense_aerial.jpg` — low 3/4 aerial of terminal, pad, hero cluster.
5. `05_platform_aerial.jpg` — 1200 m platform, rocks/roads/background skyline.
6. `06_terminal_detail.jpg` — T2 doors, arrivals board, queue, taxis, canopy.

## 6. Limitations

- Offline Cycles stills only; realtime GLB/preview not rebuilt.
- CommunityCentre terminal is a 1.03 M-tri authored subset, not the full 1.37 M.
- K015 is background only; its 1K textures are not close-up detail.
- K046 is used as material/detail reference on the custom port, not as a hero
  building geometry kit.
- Kitbash3D / Modelshop assets are private/offline; public Web redistribution
  needs separate licence review.

## 7. Reproduce

```sh
cd /Users/apple/.local/share/opencode/worktree/e0f2de/city-hero-v2
/Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/city-hero-v2/build_scene.py
/Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/city-hero-v2/render_v2.py -- \
  --shots termwide,street,pad,aerial_low,aerial,detail \
  --res 1920x1080 --samples 160 --tag final
python3 scripts/city-hero-v2/grade_final.py
python3 scripts/city-hero-v2/make_manifest.py
npm run check && npm run build
```
