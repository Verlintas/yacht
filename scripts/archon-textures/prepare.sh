#!/usr/bin/env bash
# Unpack the source Archon GLB into a local work dir and convert WebP->PNG.
#
# Usage:
#   scripts/archon-textures/prepare.sh [source.glb]
#
# If omitted, source defaults to the pre-pass GLB in the main repo. After this
# pass is merged, get the original from git history, e.g.:
#   git show 80a49f4:public/models/candidates/rta_archon.glb > /tmp/rta_archon_orig.glb
#   scripts/archon-textures/prepare.sh /tmp/rta_archon_orig.glb
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="${ARCHON_WORK:-$ROOT/work}"
SRC="${1:-/Users/apple/orca/projects/verlins_home/public/models/candidates/rta_archon.glb}"

mkdir -p "$WORK/tex" "$WORK/glb" "$WORK/renders"
cp "$SRC" "$WORK/rta_archon_src.glb"

npx --yes @gltf-transform/cli@4.5.1 copy "$WORK/rta_archon_src.glb" "$WORK/archon.gltf"

for f in "$WORK"/*.webp; do
  sips -s format png "$f" --out "${f%.webp}.png" >/dev/null
done

echo "work dir: $WORK"
echo "source:   $SRC"
echo "next: bake_ao.py -> pack_textures.py -> build_glb_mt.mjs -> meshopt -> dedupe_occlusion.py"
