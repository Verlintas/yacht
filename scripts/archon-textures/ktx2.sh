#!/usr/bin/env bash
# Optional KTX2 comparison builds. Requires KTX-Software (free) on PATH.
#
# Get the macOS arm64 tools without sudo:
#   mkdir -p work/tools/ktx && cd work/tools/ktx
#   curl -sLO https://github.com/KhronosGroup/KTX-Software/releases/download/v4.4.2/KTX-Software-4.4.2-Darwin-arm64.pkg
#   pkgutil --expand KTX-Software-4.4.2-Darwin-arm64.pkg expanded
#   mkdir -p payload-lib payload-tools
#   (cd payload-lib && gzip -dc ../expanded/KTX-Software-4.4.2-Darwin-arm64-library.pkg/Payload | cpio -idm)
#   (cd payload-tools && gzip -dc ../expanded/KTX-Software-4.4.2-Darwin-arm64-tools.pkg/Payload | cpio -idm)
#   mkdir -p payload/usr/local/lib payload/usr/local/bin
#   cp payload-lib/usr/local/lib/* payload/usr/local/lib/
#   cp payload-tools/usr/local/bin/* payload/usr/local/bin/
#   export PATH="$PWD/payload/usr/local/bin:$PATH"
#
# Then:
#   scripts/archon-textures/ktx2.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="${ARCHON_WORK:-$ROOT/work}"
cd "$ROOT"

# 2K PNG intermediate (uastc/etc1s cannot read WebP sources).
PNG=1 NORMAL_PATH="$WORK/tex/final/normal_final.png" node scripts/archon-textures/build_glb_mt.mjs "$WORK/glb/archon_2k_png_mt.glb"
PNG=1 NORMAL_PATH="$WORK/tex/final/normal_4k.png" ORM_PATH="$WORK/tex/final/orm_4k.png" \
  node scripts/archon-textures/build_glb_mt.mjs "$WORK/glb/archon_4k_png_mt.glb"

# 2K mixed: ETC1S color (small VRAM), UASTC normal+ORM (quality).
npx @gltf-transform/cli etc1s "$WORK/glb/archon_2k_png_mt.glb" "$WORK/glb/step2k_c1.glb" \
  --slots baseColorTexture --quality 255 --compression 5
npx @gltf-transform/cli etc1s "$WORK/glb/step2k_c1.glb" "$WORK/glb/step2k_c2.glb" \
  --slots emissiveTexture --quality 255 --compression 5
npx @gltf-transform/cli uastc "$WORK/glb/step2k_c2.glb" "$WORK/glb/step2k_n.glb" \
  --slots normalTexture --level 2 --zstd 18
npx @gltf-transform/cli uastc "$WORK/glb/step2k_n.glb" "$WORK/glb/archon_2k_ktx2.glb" \
  --slots metallicRoughnessTexture --level 2 --zstd 18

# 4K: all UASTC (2K albedo/emissive, 4K normal+ORM).
npx @gltf-transform/cli uastc "$WORK/glb/archon_4k_png_mt.glb" "$WORK/glb/archon_4k_ktx2.glb" \
  --level 2 --zstd 18

npx @gltf-transform/cli meshopt "$WORK/glb/archon_2k_ktx2.glb" "$WORK/glb/archon_2k_ktx2_opt.glb" --level high
npx @gltf-transform/cli meshopt "$WORK/glb/archon_4k_ktx2.glb" "$WORK/glb/archon_4k_ktx2_opt.glb" --level high
python3 scripts/archon-textures/dedupe_occlusion.py "$WORK/glb/archon_2k_ktx2_opt.glb"
python3 scripts/archon-textures/dedupe_occlusion.py "$WORK/glb/archon_4k_ktx2_opt.glb"
npx @gltf-transform/cli inspect "$WORK/glb/archon_2k_ktx2_opt.glb" | tail -40
npx @gltf-transform/cli inspect "$WORK/glb/archon_4k_ktx2_opt.glb" | tail -40
