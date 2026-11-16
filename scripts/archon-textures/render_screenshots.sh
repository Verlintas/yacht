#!/usr/bin/env bash
# Render before/after review screenshots with headless Chrome + SwiftShader.
# Serve the repo root first:
#   python3 -m http.server 8137 --bind 127.0.0.1
# Then:
#   scripts/archon-textures/render_screenshots.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="${ARCHON_WORK:-$ROOT/work}"
OUT="$WORK/renders"
mkdir -p "$OUT"

if [ ! -f "$WORK/glb/archon_control_meshopt.glb" ]; then
  node "$ROOT/scripts/archon-textures/build_control.mjs" "$WORK/glb/archon_control.glb"
  npx @gltf-transform/cli meshopt "$WORK/glb/archon_control.glb" "$WORK/glb/archon_control_meshopt.glb" --level high
fi

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
URL="http://127.0.0.1:8137/scripts/archon-textures/render_compare.html"

shot() {
  local model="$1" view="$2" name="$3"
  "$CHROME" --headless=new --disable-gpu-sandbox --enable-unsafe-swiftshader \
    --use-angle=swiftshader --window-size=1600,900 --virtual-time-budget=90000 \
    --screenshot="$OUT/$name.png" "$URL?model=$model&view=$view&v=$name" >/dev/null 2>&1
  echo "$name $(stat -f%z "$OUT/$name.png")"
}

# "before" = control re-encode of the original source; "after" = shipped GLB.
shot /work/glb/archon_control_meshopt.glb closeup before_closeup
shot /public/models/candidates/rta_archon.glb closeup after_closeup
shot /work/glb/archon_control_meshopt.glb hull before_hull
shot /public/models/candidates/rta_archon.glb hull after_hull
shot /work/glb/archon_control_meshopt.glb gameplay before_gameplay
shot /public/models/candidates/rta_archon.glb gameplay after_gameplay

if [ -f "$WORK/glb/archon_2k_ktx2_opt.glb" ] && [ -f "$WORK/glb/archon_4k_ktx2_opt.glb" ]; then
  shot /work/glb/archon_2k_ktx2_opt.glb macro ktx2_2k_macro
  shot /work/glb/archon_4k_ktx2_opt.glb macro ktx2_4k_macro
fi
