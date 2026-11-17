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
- **3 authored K003 storefronts**: Sushi/Akira's noodle bar, StreetStore,
  Black Rain café. They retain their authored interiors, stools, counters,
  awnings, vents, cables and signage.
- **K003 street props**: lamps, overhead cables, facade pipe runs, AC units,
  vending/newspaper machines, dumpster, trash bags/cans, road barriers,
  hydrant, crates, vents, fuse boxes, pots.
- Sidewalks with textured tiles, curbs, drainage grates, manholes, crosswalk,
  lane paint, wet service yard, overhead cables and steam vents.
- Neon blade signs/fascia signs, an atlas-packed sign system, two holographic
  ad panels, authored blank billboards (tinted), neon edge strips, lit windows.
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
| TowerF | 218.4 m | 370,616 | 240,899 | 0.65 |
| BldgLG_E | 140.3 m | 324,027 | 210,617 | 0.65 |
| Tower_02 | 62.1 m | 460,272 | 359,011 | 0.78 |
| XL_Bldg_C | 106.3 m | 175,136 | 113,837 | 0.65 |
| BldgM_D | 50.7 m | 249,384 | 162,099 | 0.65 |
| BldgS_B | 27.1 m | 132,820 | 86,332 | 0.65 |
| MidRiseG | 57.5 m | 25,829 | 19,370 | 0.75 |
| TowerC | 159.7 m | 672,998 | 80,759 | 0.12 (skyline) |

LOD0 total including the duplicated BldgS_B podium: **1,359,256 tris / 22 draws**.
LOD1 (30% of LOD0, used for distance >172 m): **381,735 tris / 13 draws**.
The wide shot forces LOD0 so the authored detail is visible in the screenshot.

K003 source: 759 objects / 4,876,972 tris. Only selected shopfronts and props
were imported; the 320 MB FBX is never bundled. Shopfront source → exported:
Sushi 304,891 → 76,221; StreetStore 222,747 → 40,093; Cofe 221,214 → 48,666.
Placed shops + props: **485,684 tris / 20 draws**.

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
- Emissive windows: a runtime threshold pass turns the authored `FacadeE` and
  `FacadeF` window maps into warm/cool lit-window emissive maps. Plain
  concrete facades (BldgS_B, XL_Bldg_C) get authored-style lit-window grid
  decals so the block reads as inhabited.
- Glass: dark reflective PBR, no transmission for background towers; selected
  K003 shop glass is translucent so the modeled interiors remain visible.
- Neon: physical blade/fascia geometry + canvas typography packed into one
  4096×2560 sign atlas, one additive draw call. This is not bloom-only neon.
- Textures committed: only optimized WebP/GLB derivatives. Source K044/K003
  textures are **not** committed; `prepare-textures.py` regenerates them from
  the private archives.

## Lighting / wet street

- AgX tone mapping, exposure 1.26, 1600×900, DPR 1 (headless capture).
- Directional moon key + sky/hemisphere fill + orange rim + cool front fill
  + 3 RectAreaLights + neon wash/practical point lights.
- Procedural equirectangular night sky → PMREM environment; exponential fog
  `0.0034`; subtle moon disc + halo.
- **Controlled planar reflection**: 896×448 HalfFloat render target, updated
  every 2nd frame. Only layer-2 LOD1 building proxies and sign quads are
  rendered into it (no full 2 M-tri scene re-render). The wet road is a
  `MeshStandardMaterial` with injected shader code: screen-projected
  reflection, normal distortion, puddle mask, fresnel, and vertical reflection
  smear. Additive neon streak decals on the road reinforce the wet-neon read.
- Bloom is deliberately subtle (`0.34 / 0.56 / 1.15`); the image is carried by
  materials, emissive geometry and practical lights.

## Performance (measured, not estimated)

Chrome headless, ANGLE Metal on **Apple M4 Max**, 1600×900, DPR 1, 1280×720 UI:

| Shot | Draw calls | Visible tris | FPS | CPU submit |
|---|---:|---:|---:|---:|
| hero | **82** | **1,856,591** | 60 (vsync) | ~0.85 ms |
| store | 69 | 1,408,535 | 60 | ~1.0 ms |
| street | 79 | 1,854,215 | 60 | ~1.1 ms |
| wide | 83 | 1,858,229 | 60 | ~0.79 ms |
| ui (1280×720) | 69 | 1,408,535 | 60 | ~0.82 ms |
| bench hero (180 frames) | 82 | 1,856,591 | 60.0 | avg frame 16.67 ms |

`perf.json` contains the raw `p50/p95/min/max`, GPU string and reflection
timing. The rAF benchmark is vsync-capped at 60; no frame drops occurred in the
180-frame hero or 120-frame wide benches. Draw calls include post-processing
passes; scene-only submissions are lower. **Targets met: <2 M tris, <100 calls,
60 fps.**

## Screenshots

| File | What it shows |
|---|---|
| `hero.png` | Street-level hero: canyon, neon signs, lit windows, wet road, barriers, moon |
| `store.png` | Storefront close-up: Akira's noodle bar, menu sign, Sushi sign, interior/stools |
| `street.png` | Low wet-street view: shops, vending machine, signs, reflections, rain |
| `wide.png` | Low aerial block: towers, storefront roofs, street canyon, lit windows |
| `ui.png` | 1280×720 HUD: location card, objective, E prompt, sector label, live telemetry |

## QA / honest limits

- No console errors; the earlier favicon 404 is fixed.
- No tower overlap / ground-contact warnings in the final build.
- No posed humans in close-up. The square is intentionally empty of characters.
- **Parked vehicles/drones are missing.** Local K040 Drones and K042 Supercars
  are unassembled parts kits (K040: 174 meshes / 9.1 M tris; K042: 280 meshes /
  5.9 M tris), not complete vehicles. Building one would be a separate Blender
  assembly pass; a fake procedural car would violate the brief. Distant traffic
  light points are present instead. This is a real scope gap, not hidden.
- Storefronts are authored facades with visible modeled interiors, but they are
  not enterable. Pressing E shows an honest “interior link offline in this
  slice” toast.
- K003 has no normal maps; K044 normal maps are included.
- Some authored K044 billboard panels remain blank advertising surfaces
  (tinted dark to avoid white cards). They are real authored geometry, not
  untextured placeholders, but they are not art-directed ads.
- LOD0 is decimated from the authored source to fit the triangle budget; LOD1
  is 30% of LOD0 for >172 m. The wide shot forces LOD0.
- The page is a standalone vertical slice; it is not wired into the main game,
  shops, NPCs, combat, planet terrain or save system.
- The wide shot still reveals the dark block ground at its edges; the
  street-level shots are the acceptance shots.

## Licensing — important

K044 Mini Kit Cyberpunk and K003 Cyber Streets are **paid Kitbash3D assets**
owned by the project owner. This is a **private / non-commercial** slice.
Kitbash3D's standard EULA does not permit standalone redistribution of the raw
or derived assets. The 3D files and screenshots in this worktree must not be
published as a public asset bundle or used in a public Web build without a
licensing decision or replacement assets. Source FBX/ZIP files are not
committed; only optimized derivatives are.

See `asset-manifest.json` for per-asset provenance.

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
python3 scripts/cyber-city/prepare-textures.py
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
  --python scripts/cyber-city/export_assets.py -- k044
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
  --python scripts/cyber-city/export_assets.py -- k003
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
Only the optimized runtime GLBs and the street/misc textures are in the build.
