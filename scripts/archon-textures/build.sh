#!/usr/bin/env bash
# Full 0-cost pass: bake AO -> pack maps -> manual MikkTSpace GLB -> meshopt -> dedupe -> verify.
# Assumes prepare.sh has already unpacked archon.gltf and the source PNGs.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="${ARCHON_WORK:-$ROOT/work}"
cd "$ROOT"

/Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/archon-textures/bake_ao.py
python3 scripts/archon-textures/pack_textures.py
node scripts/archon-textures/build_glb_mt.mjs "$WORK/glb/archon_optimized_raw.glb"
npx @gltf-transform/cli meshopt "$WORK/glb/archon_optimized_raw.glb" "$WORK/glb/archon_optimized.glb" --level high
python3 scripts/archon-textures/dedupe_occlusion.py "$WORK/glb/archon_optimized.glb"
node scripts/archon-textures/verify_geometry.mjs "$WORK/glb/archon_optimized.glb"

cp "$WORK/glb/archon_optimized.glb" "$ROOT/public/models/candidates/rta_archon.glb"
echo "installed public/models/candidates/rta_archon.glb"
