# Archon texture pass scripts

Pipeline for `public/models/candidates/rta_archon.glb` (AR-10). See
`docs/ARCHON-TEXTURE-PASS.md` for results and the honest AO/4K limitations.

## Prereqs

- Node 22+ with `npm install` (repo deps; already includes `mikktspace`, `sharp`,
  `@gltf-transform/cli`)
- Blender 5.3 at `/Applications/Blender.app`
- Python 3 with `Pillow`, `numpy`
- Optional: KTX-Software CLI for the KTX2 comparison (free; see `ktx2.sh`)

## 1. Unpack the source

```bash
# Before the pass is merged, use the original GLB from the main repo or git history:
#   git show 80a49f4:public/models/candidates/rta_archon.glb > /tmp/rta_archon_orig.glb
scripts/archon-textures/prepare.sh /tmp/rta_archon_orig.glb
```

This creates `work/archon.gltf`, `work/*.webp`, and PNG copies.

## 2. 0-cost pass

```bash
# AO bake (2K, Cycles CPU, ~20 s; see the UV0 warning in the script)
/Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/archon-textures/bake_ao.py

# Final maps: albedo x1.5, ORM (R=AO, G=original roughness, B=metal), emissive
python3 scripts/archon-textures/pack_textures.py

# Manual MikkTSpace + material/texture build
node scripts/archon-textures/build_glb_mt.mjs work/glb/archon_optimized_raw.glb
npx @gltf-transform/cli meshopt work/glb/archon_optimized_raw.glb work/glb/archon_optimized.glb --level high
python3 scripts/archon-textures/dedupe_occlusion.py work/glb/archon_optimized.glb

# Verify transform / triangles / normals
node scripts/archon-textures/verify_geometry.mjs work/glb/archon_optimized.glb

cp work/glb/archon_optimized.glb public/models/candidates/rta_archon.glb
```

Or run `scripts/archon-textures/build.sh` after step 1.

### Why manual MikkTSpace?

`@gltf-transform/functions`' `tangents()` calls `unweld()`, which corrupts this
asset's `KHR_mesh_quantization` (normalized int16 POSITION + normalized int8
NORMAL, interleaved bufferView). Symptoms: scrambled triangles/normals and
bright specular streaks. `build_glb_mt.mjs` unwelds manually from the index
buffer, dequantizes, runs `mikktspace`, and writes unindexed attributes. Do not
re-weld afterwards — MikkTSpace requires unindexed triangles.

Known harmless artifact: glTF-Transform writes a second texture entry when the
same ORM texture is used by `occlusionTexture` and `metallicRoughnessTexture`.
Three.js keys its cache by texture index, so that would upload the ORM twice.
`dedupe_occlusion.py` rewrites the JSON so both slots share one texture index
and drops the unused entry.

## 3. Optional KTX2 comparison

```bash
export PATH="$PWD/work/tools/ktx/payload/usr/local/bin:$PATH"  # see ktx2.sh header
scripts/archon-textures/ktx2.sh
```

Results (deduped, meshopt):
- 2K mixed: ETC1S albedo/emissive + UASTC normal/ORM, ~8.55 MB GLB, ~16.8 MB VRAM.
- 4K: UASTC all, 4K normal+ORM + 2K color, ~23.95 MB GLB, ~55.9 MB VRAM.

The game/setup currently do **not** have `KTX2Loader`; these files are
comparison artifacts, not wired into `public/`.

## 4. Renders

```bash
python3 -m http.server 8137 --bind 127.0.0.1   # repo root
scripts/archon-textures/render_screenshots.sh
```

`render_compare.html` uses the same camera/lighting for before/after. The
`gameplay` view is ~10 km third-person distance; `closeup` is the bridge/bow;
`hull` is a mid-hull side view; `macro` is ~140 m for the 2K/4K test. The render
rig uses exposure 1.0 and an extra camera fill for review; it is identical for
both variants. Gameplay screenshots use the real game at `?ship=rta_archon`.

## Outputs

- Shipped: `public/models/candidates/rta_archon.glb`
- Report/renders: `docs/ARCHON-TEXTURE-PASS.md`, `docs/archon-textures/`
- Intermediates: `work/` (gitignored)
