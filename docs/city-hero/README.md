# Nautilus Reach — hero port / city sample

Private, local sample built in the `city-hero-sample` worktree. It replaces the
previous single-kit port with a higher-detail port district and a native-asset
skyline.

## What is in the scene

- **1200 × 1200 m flat city deck** at apron elevation, with a **40 m retaining
  wall**, parapet, buttress bays, expansion joints, roads, plaza and a 60 m
  TLOF. Terrain exists only outside the deck, at −40 m.
- **Hero port foreground** (custom, 1:1): terminal hall with steel/glass facade,
  airlock, canopy, loading docks, roof plant, signage; control tower; 80 m
  service gantry; cryogenic tank farm and pipe bridge; container yard; light
  masts; GPU, hoses, cones, chocks, tool cart, boarding stairs and landing gear.
- **Hero towers**: K032 `BldgLG_A` 220.3 m / 275k tris (native); K038 `LargeJ`
  222.7 m / 358k (native); K038 `LargeI` 240.7 m / 207k (native, two placements).
  No hero mesh is reduced below native.
- **Mega background**: five 563–566 m stacks of native K038 `LargeI` modules,
  with service spines, mechanical collars and lit sky-deck edges. These are
  stacked authored modules, not stretched single buildings; the stack setbacks
  read as sky terraces at 600–900 m.
- **Midground / district**: K038 and K046 mid-rise blocks, 100 m-scale industrial
  street pods, 14 infill blocks, CityStreets street furniture (trees, kiosk,
  trailer, dumpster, bench, lamp, billboard).
- **Characters**: five posed Modelshop figures at 1.7–1.8 m, plus the 25 m A-30
  Thunderbolt on the TLOF.
- **Greebles/details**: K034 rooftop props and K014 facade panels on the
  terminal, warehouse, tank farm, tower podiums and hero rooftops; k039
  `BldgLG_C/D` service annexes at 1:1 near the terminal.

## Source assets and scale

| Asset | Use | Native scale / measured tris |
|---|---|---|
| K032 NeoShanghai `BldgLG_A` | hero tower | 42 × 45 × 220.3 m, 275,250 tris |
| K038 Neo Tokyo 2 `LargeJ` | hero tower | 100 × 99 × 222.7 m, 357,771 tris |
| K038 Neo Tokyo 2 `LargeI` | hero + mega modules | 78 × 86 × 240.7 m, 206,982 tris |
| K046 Heavy Metal `BldgLG_G` / `D` | midground / industrial blocks | 160 × 38 × 88.3 m / 69 × 35 × 98.1 m |
| K039 Sci-Fi Industrial `BldgLG_C/D` | port service annexes | 12 × 5 × 11 m / 11 × 5 × 16.6 m |
| K034 Props Rooftops | antennas, AC, water towers, dishes, billboards | 4–21 m |
| K014 Greebles | facade/pipe detail panels | 2–8 m |
| CityStreets | street pods/furniture, not a whole city | trees 4.8 m, kiosk 2.6 m |
| Modelshop posed characters | crew at human scale | 1.7–1.8 m, 90–106k source tris each |
| A-30 Thunderbolt | 25 m ship on the 60 m TLOF | 27 × 30 × 9.7 m |

Scale is corrected before placement. No kit is stretched 8–30× to fake a
200–800 m mass; hero meshes use their authored footprint and height.

## Build and render

```bash
python3 scripts/city-hero/gen_textures.py
/Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/city-hero/build_scene.py
/Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/city-hero/render_city.py -- \
  --shots wide,pad,aerial,detail --res 1920x1200 --samples 128 --tag final
python3 scripts/city-hero/make_rt_textures.py
/Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/city-hero/export_glb.py
npx @gltf-transform/cli optimize \
  /private/tmp/city-hero/glb/nautilus_city_raw.glb \
  public/city-hero/glb/nautilus_city.glb \
  --compress meshopt --texture-compress webp --texture-size 1024 \
  --simplify false --palette false --join true --join-meshes true \
  --instance false --flatten true
```

Blender scene source is kept at `/private/tmp/city-hero/scene.blend` (not
committed). Hero Kitbash3D source FBX/BLEND files are not committed.

## Renders

- `public/city-hero/renders/01_wide_port.jpg` — eye-level port wide, terminal,
  pad, gantry, hero towers
- `public/city-hero/renders/02_pad_closeup.jpg` — A-30, gantry, pad dressing,
  crew and container yard
- `public/city-hero/renders/03_aerial_skyline.jpg` — deck edge, port, five mega
  stacks and city infill
- `public/city-hero/renders/04_terminal_detail.jpg` — terminal sign, glazing,
  facade ribs, roof plant

Blender renders: Cycles, 1920 × 1200, 128 samples + OpenImageDenoise, AgX,
HDRI + physical sun + area/portal fills, contact shadows, volumetric haze,
DOF and compositor glare/vignette.

## Real-time preview

`public/city-hero/preview/index.html` (URL `/yacht/city-hero/preview/`).

- Meshopt + WebP GLB, 3.12 M tris, 72 materials, 78 primitives, 40.93 MB.
- 1K / 512 texture ladder; ORM is channel-packed; AO multiplied into basecolor.
- HDR environment + PMREM, AgX tone mapping, PCF soft shadows, GTAO, bloom,
  fog and a 44° camera.
- Hero K032/K038 meshes keep native geometry. Mid/background, port detail,
  characters and street props are decimated for the live budget.
- Draw calls are primitive-bound (~78), under the 100 target.

## Known limitations

- The local CityStreets 209 `.blend` contains street furniture and diorama
  groups, not a complete 4–14 m building district. It is used only as street
  pods, as the audit suggests.
- City Generator L1 was not realized: the measured 100 m tile is ~3.6 M tris /
  62 draw calls / 86 MB, and the 5.3 add-on UI is unstable. The district is
  custom massing plus K034/K039/ CityStreets detail.
- The mega stacks are five K038 `LargeI` stacks with authored setbacks. At
  600–900 m they intentionally read as sky terraces; they are not bespoke
  800 m architecture.
- Character source is the 2K posed pack. Real-time uses a four-material palette
  (suit, head, boot, metal) and 1K base maps.
- Preview is one static GLB, no streaming/LOD switching; the terrain outside
  the deck is a procedural ridge mesh, not a scan.
- Licensed Kitbash3D/Modelshop assets are private-sample derivatives only; do
  not redistribute the source packs or use as a public asset pack.
