# Cyber City · Kowloon 9

Real-time Three.js night street block, built as a standalone vertical slice at
`/yacht/cyber-city/`. This is **not** the rejected IAC landing slice and does not
reuse its terrain, HUD, characters or procedural placeholders.

- Page: `src/pages/cyber-city.astro`
- Runtime: `src/scripts/cyber-city/*`
- Assets: `public/cyber-city/models/*.glb`, `public/cyber-city/tex/{street,misc}`
- Screenshots: `docs/cyber-city/{hero,store,street,wide,ui}.png`
- Perf + capture data: `docs/cyber-city/{perf,captures}.json`
- Worktree: `/Users/apple/.local/share/opencode/worktree/e0f2de/cyber-city`

## What is in the slice

A 300 m street canyon with:

- **7 authored K044 street towers** (+ one duplicate BldgS_B podium on the
  left + one distant skyline module, TowerC):
  TowerF 218.6 m, BldgLG_E 140.3 m, XL_Bldg_C 106.3 m, Tower_02 62.1 m,
  MidRiseG 57.5 m, BldgM_D 50.7 m, BldgS_B 27.1 m; TowerC 159.7 m is the
  decimated skyline backdrop. No procedural stretching, no stacked towers.
- **Native hero geometry**: the two nearest towers, Tower_02 (460,272 tris) and
  BldgS_B (132,820 tris, placed twice), are exported at ratio **1.00**. Only the
  background towers and skyline are decimated. The background reduction is how
  the block stays under the 2 M triangle budget without touching hero detail.
- **5 authored K003 storefronts**: Sushi/Akira's noodle bar, StreetStore,
  Black Rain café, CHROME electronics (mid-block) and a 24 h pharmacy
  (far right). They retain their authored interiors, stools, counters, bottles,
  coffee tank, awnings, vents, cables and signage. Shop glass is dark tinted
  glass, not flat blue panels; the interiors are visible behind it.
- **Parked authored K042 supercar** — a complete `SuperCarB` assembly from the
  K042 kit: body shell, four authored wheels, glass, cockpit/interior, wing and
  light parts, exported to `car.glb` at 123,203 tris / 6 materials. The bodyshell
  is raised 10 cm relative to the wheels so the tyres are visible at street
  level; the tyres sit on the asphalt at y=0.008 with a soft contact shadow and
  four tyre contact patches. It is static, sits at the right curb in the hero
  shot, casts a real shadow and is included in the planar reflection through a
  low-cost proxy. No procedural fake car.
- **Real wet asphalt**: AmbientCG `Asphalt012` (CC0) 1K albedo/normal/roughness
  processed to 1K WebP + ORM + a low-frequency macro map and a localized puddle
  mask. The street has lane paint, centre dashes, two real crosswalks (z=40 and
  z=116), stop lines, lane arrows, manholes with grate patterns, curb stones and
  textured drainage grates.
- **K003 street props**: lamps, overhead cables, facade pipe runs and cross-street
  pipe bridges, AC units, vending/newspaper machines, dumpster, trash bags/cans,
  road barriers, hydrant, crates, vents, fuse boxes, pots and cardboard.
- Neon blade/fascia signs, an atlas-packed sign system, two holographic ad
  panels, a 2×2 in-world poster atlas, hanging cloth banners, large poster
  boards over Akira's and on the left tower, and lit window grids. The large
  authored K044 banner material (`Pic_Banners`/`SignageOld`) is mapped to the
  poster atlas; no blank white billboard cards remain in the acceptance shots.
- Rain, wet street, controlled planar reflection, fog/blue hour, moon, distant
  traffic points, neon spill lights, ACES/AgX + subtle bloom.
- Modern minimal HUD: location card, objective, interaction prompt, sector
  label, live FPS/tris/draw-call telemetry. No radar, tapes, or cockpit HUD.

## Scale audit (K044)

Source FBX: `Kitbash3d_CyberPunk_MiniKit.FBX` (74 MB, 271 mesh objects,
3,580,395 source tris, 53 materials). Imported at ×100: source bbox
373 × 210 × 218 m. A tower base/door measures 2.2–3.5 m after ×100; all towers
are therefore treated as metres (1 unit = 1 m).

Chosen LOD0 tower modules and source → exported triangles:

| Module | Source height | Source tris | LOD0 tris | Ratio |
|---|---:|---:|---:|---:|
| TowerF | 218.4 m | 370,616 | 166,776 | 0.45 |
| BldgLG_E | 140.3 m | 324,027 | 113,409 | 0.35 |
| Tower_02 | 62.1 m | 460,272 | **460,272** | **1.00 (native)** |
| XL_Bldg_C | 106.3 m | 175,136 | 61,297 | 0.35 |
| BldgM_D | 50.7 m | 249,384 | 87,284 | 0.35 |
| BldgS_B | 27.1 m | 132,820 | **132,820** | **1.00 (native)** |
| MidRiseG | 57.5 m | 25,829 | 15,497 | 0.60 |
| TowerC | 159.7 m | 672,998 | 40,378 | 0.06 (skyline) |

LOD0 total including the duplicated BldgS_B podium: **1,210,553 tris / 22 draws**.
LOD1 (used for distance >172 m): **347,968 tris / 13 draws**.
The wide shot forces LOD0 so the authored detail is visible in the screenshot.

Tradeoff: native Tower_02 + BldgS_B cost ~593k tris, so the background modules
were reduced harder (0.35–0.60) and the skyline module to 0.06. Hero detail was
not traded away.

K003 source: 759 objects / 4,876,972 tris. Only selected shopfronts and props
were imported; the 320 MB FBX is never bundled. Shopfront source → exported:
Sushi 304,891 → 76,221; StreetStore 222,747 → 40,093; Cofe 221,214 → 48,666;
Tech 336,440 → 33,644; Pharmacy 207,036 → 20,702. Placed shops + props:
**578,142 tris / 20 draws**.

The K042 source kit has 280 meshes / 5.9 M tris across three complete parented
cars (`SuperCarA/B/C`). The parked car is the authored **SuperCarB** assembly,
not a loose body shell: body, wheels, glass, cockpit/interior, wing and light
parts all come from that group. It is exported to `car.glb` at
**123,203 tris / 6 materials**. The bodyshell is lifted **0.10 m** relative to
the wheels so the tyres read at street level; the four tyres are grounded at
y=0 and a contact-shadow plane with four tyre patches sits under the car.

Street width is **22 m** (11 m half-width), sidewalks **4 m**, curb **0.16 m**.
Buildings start at x = ±15.4 m. Towers sit on y = 0; shops sit on the 0.16 m
sidewalk. All tower bboxes were checked for ground contact and pairwise
overlap; the final build logs no overlap/ground warnings.

## Materials and textures

- K044 textures: basecolor + normal + packed ORM (R=AO, G=roughness,
  B=metallic), 1K–2K WebP. Materials relinked by name from the packed FBX.
- K003 textures: diffuse + gloss → roughness + ORM. K003 has **no normal
  maps**; a normal was generated from `ConcretePlastered_Bump`, and the rest
  relies on roughness/AO. This is a source limitation, not a hidden error.
- Road: real CC0 asphalt scan (`Asphalt012`) with albedo/normal/roughness, plus
  `asphalt_orm`, `asphalt_macro` and `puddle_mask`. The shader darkens the base,
  modulates roughness with the macro map, and mixes reflection in puddles and
  along the gutters. No tiling-gradient road.
- The K003 authored screen panels are dark tinted glass (`GlassBlack`,
  `GlassTransparent`, `Screens`), so the modeled interior stays visible. A
  separate emissive menu board sits over Akira's counter, and a 4-poster cluster
  covers the blank service panel beside the shop.
- Emissive windows: a runtime threshold pass turns the authored `FacadeE` and
  `FacadeF` window maps into warm/cool lit-window emissive maps. Plain concrete
  facades (BldgS_B, XL_Bldg_C) get authored-style lit-window grid decals.
- Neon: physical blade/fascia geometry + canvas typography packed into one
  4096×2560 sign atlas, one additive draw call. This is not bloom-only neon.
- Textures committed: only optimized WebP/GLB derivatives and the CC0 asphalt
  source scans. Paid K044/K003 source textures are **not** committed;
  `prepare-textures.py` regenerates them from the private archives.

## Lighting / wet street

- AgX tone mapping, exposure 1.26, 1600×900, DPR 1 (headless capture).
- Directional moon key + sky/hemisphere fill + orange rim + cool front fill
  + RectAreaLights + neon wash/practical point lights.
- Procedural equirectangular night sky → PMREM environment; exponential fog
  `0.0034`; subtle moon disc + halo.
- **Controlled planar reflection**: 896×448 HalfFloat render target, updated
  every 2nd frame. Only layer-2 LOD1 building proxies, sign quads and the car
  proxy are rendered into it (no full 2 M-tri scene re-render). The wet road is a
  `MeshStandardMaterial` with injected shader code: screen-projected reflection,
  normal distortion, puddle mask, fresnel and vertical reflection smear.
  Additive neon streak decals reinforce the wet-neon read.
- Bloom is deliberately subtle (`0.27 / 0.50 / 1.20`); the image is carried by
  materials, emissive geometry and practical lights.

## Performance (measured, not estimated)

Chrome headless, ANGLE Metal on **Apple M4 Max**, 1600×900, DPR 1, 1280×720 UI:

| Shot | Draw calls | Visible tris | FPS | CPU submit |
|---|---:|---:|---:|---:|
| hero | **96** | **1,988,698** | 60 (vsync) | ~0.99 ms |
| store | 75 | 1,598,215 | 60 | ~1.03 ms |
| street | 95 | 1,987,722 | 60 | ~1.01 ms |
| wide | 99 | 1,992,208 | 60 | ~1.07 ms |
| ui (1280×720) | 75 | 1,598,215 | 60 | ~0.75 ms |
| bench hero (180 frames) | 96 | 1,988,698 | 60.0 | avg 16.67 ms, p95 16.8 ms |

`perf.json` contains the raw `p50/p95/min/max`, GPU string and reflection
timing. The rAF benchmark is vsync-capped at 60; no frame drops occurred in the
180-frame hero or 120-frame wide benches. Draw calls include post-processing
passes; scene-only submissions are lower. **Targets met: <2 M tris, <100 calls,
60 fps**, with the two nearest towers at native geometry.

## Screenshots

| File | What it shows |
|---|---|
| `hero.png` | Low 3/4 accept shot: complete K042 supercar (wheels grounded, contact shadow) and curb left, Akira's/poster wall right, wet asphalt, crosswalk, neon canyon |
| `store.png` | Storefront close-up: interior, counter, stools, menu screen, kiosk ads, Akira's/Sushi signs, cables, trash, AC |
| `street.png` | Low wet-street view: car, manhole, crosswalk, vending machine, five-shop row, reflections, rain |
| `wide.png` | Aerial block: native hero tower, decimated background towers, five shops, pipe bridges, banners, traffic |
| `ui.png` | 1280×720 HUD: location card, objective, E prompt, sector label, live telemetry |

## QA / honest limits

- No console errors; the earlier favicon 404 is fixed.
- No tower overlap / ground-contact warnings in the final build.
- **One complete parked vehicle; no moving car.** The K042 `SuperCarB` assembly
  is static, grounded and contact-shadowed. K040 Drones remain 174 unassembled
  meshes / 9.1 M tris; the DLNK `CityVehicles00.fbx` was inspected and rejected
  as a low-poly scene/vehicle prop sheet (~4.1k tris) without a complete
  hero-scale car. A second vehicle or a moving car would need another assembly
  pass; none was faked.
- Storefronts are authored facades with visible modeled interiors, but they are
  not enterable. Pressing E shows an honest “interior link offline in this
  slice” toast.
- K003 has no normal maps; K044 normal maps are included.
- Large authored K044 banner panels are mapped to the generated poster atlas or
  tinted dark. No blank white billboard cards remain in the five acceptance
  shots; unvisited authored panels may still be plain.
- The wide shot sees the puddle sheets from above and reads them as pale wet
  patches; street-level shots are the acceptance shots for the wet-road look.
- Native hero geometry is deliberate: Tower_02 and BldgS_B are not decimated.
  Background towers are visibly coarser if inspected closely; that is the
  documented budget tradeoff.
- The page is a standalone vertical slice; it is not wired into the main game,
  shops, NPCs, combat, planet terrain or save system.

## Licensing — important

K044 Mini Kit Cyberpunk and K003 Cyber Streets are **paid Kitbash3D assets**
owned by the project owner. K042 Supercars is also a paid Kitbash3D kit. This is
a **private / non-commercial** slice. Kitbash3D's standard EULA does not permit
standalone redistribution of the raw or derived assets. The 3D files and
screenshots in this worktree must not be published as a public asset bundle or
used in a public Web build without a licensing decision or replacement assets.
Source FBX/ZIP files are not committed; only optimized derivatives are.

The road texture is **AmbientCG Asphalt012, CC0 1.0**; the source scans and the
derived runtime maps are safe to redistribute. See `asset-manifest.json` for
per-asset provenance.

## Reproduce

```sh
cd /Users/apple/.local/share/opencode/worktree/e0f2de/cyber-city
npm install
npm run dev -- --port 4331
# http://localhost:4331/yacht/cyber-city/

# screenshots + perf (Chrome headless, ANGLE Metal)
node scripts/cyber-city/capture.mjs
```

Asset pipeline (private source paths are in the scripts):

```sh
# K044/K003 texture derivatives + sidewalk maps
python3 scripts/cyber-city/prepare-textures.py
# real Asphalt012 road maps + puddle/macro masks
python3 scripts/cyber-city/prepare-street.py

/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
  --python scripts/cyber-city/export_assets.py -- k044
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
  --python scripts/cyber-city/export_assets.py -- k003
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
  --python scripts/cyber-city/export_car.py

node scripts/cyber-city/postprocess-gltf.mjs k044 \
  public/cyber-city/models/towers.glb public/cyber-city/models/towers_pbr.glb
npx gltf-transform optimize \
  public/cyber-city/models/towers_pbr.glb \
  public/cyber-city/models/towers.opt.glb \
  --compress meshopt --flatten false --join false --instance false \
  --simplify false --texture-compress webp --texture-size 2048 --palette false

node scripts/cyber-city/postprocess-gltf.mjs k003 \
  public/cyber-city/models/props.glb public/cyber-city/models/props_pbr.glb
npx gltf-transform optimize \
  public/cyber-city/models/props_pbr.glb \
  public/cyber-city/models/props.opt.glb \
  --compress meshopt --flatten false --join false --instance false \
  --simplify false --texture-compress webp --texture-size 2048 --palette false
```

Intermediate `towers.glb`, `towers_pbr.glb`, `props.glb`, `props_pbr.glb` and
the K044/K003 external texture folders are intentionally **not committed**.
Only the optimized runtime GLBs, street/misc textures and the CC0 asphalt source
scans are in the build.
