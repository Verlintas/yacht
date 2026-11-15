# Anvil Landing · authored terrain sample

A standalone, offline-authored terrain and landing-pad sample for the yacht game.
It proves out the 1 km tile / 420 × 260 m apron / 60 × 60 m TLOF scale stack
without touching the game page or the flight runtime.

- Page: `/yacht/terrain-sample/` (`src/pages/terrain-sample.astro`)
- Scene code: `src/scripts/terrain-sample.ts`
- Generator: `tools/terrain/generate_sample.py`
- Committed data: `public/terrain-sample/heights.r16`, `public/terrain-sample/meta.json`
- Preview: `docs/terrain-sample-preview.png`
- Heightmap hillshade: `docs/terrain-sample-heightmap.png`

## What is in the sample

| Feature | Size / value |
| --- | --- |
| Terrain tile | 1 km × 1 km, 257 × 257 samples (3.90625 m spacing) |
| Height encoding | R16 little-endian, 200 m full scale, loaded at runtime |
| Port apron | 420 × 260 m, fully flattened at 54 m |
| Landing pad (TLOF) | 60 × 60 m, painted border / circle / H / corner brackets |
| Terminal | 30 × 18 m, with control tower and rooftop plant |
| Shop kiosk | 12 m wide |
| A-30 silhouette | 25 m long, ~20.7 m wingspan |
| Player capsule | 1.8 m tall |
| Extras | approach and pad-edge lights, wind sock, crates, low-poly rocks |

The terrain is composed from deterministic gradient-noise FBM and ridged noise,
then a small droplet-erosion pass, box smoothing, canyon carving, and an apron
flattening pass. The result is a readable western ridge (up to ~163 m), an
eastern scarp plateau, and a diagonal canyon west of the port. A 1 km square
tile skirt and a procedural sea make the tile edge legible.

## Generate the heightmap

Requires Python 3.10+ and numpy. Pillow is only used for the optional hillshade
preview.

```sh
python3 tools/terrain/generate_sample.py
# optional:
python3 tools/terrain/generate_sample.py \
  --out public/terrain-sample \
  --preview docs/terrain-sample-heightmap.png
```

The generator is deterministic; `SEED = 20261116`. Re-running it produces the
same `heights.r16` SHA-256 for a given script revision. Output format:

```text
heights.r16  257 * 257 little-endian uint16
meta.json    grid, elevation stats, apron/pad dimensions, sha256, decode rule
```

Runtime decode: `height_m = uint16 / 65535 * 200`. Rows run north → south,
columns west → east, with the origin at the north-west corner. No noise is
generated in the browser.

## Controls

- Drag: orbit · wheel: zoom · right-drag: pan
- **V**: toggle first-person walk (WASD, Shift sprint, mouse look, Esc to release)
- **L**: toggle world labels
- **R**: reset to the port view
- On-screen presets: 港区 (port), 起降坪 (pad), 整块瓦片 (full tile)

Walk mode samples the same 257 × 257 heightfield bilinearly and treats the
apron and TLOF surfaces as walkable. There is no collision against buildings or
the ship in this sample.

## Run

```sh
npm run dev -- --port 4329
# http://localhost:4329/yacht/terrain-sample/
```

`npm run check` and `npm run build` are expected to pass. The preview screenshot
was captured with headless Chrome and `--enable-unsafe-swiftshader`.

## Limitations / next steps

- Low-poly placeholders only; the ship is an A-30 silhouette, not the final GLB.
- One tile, one LOD, no streaming, no vegetation, no real collision or navmesh.
- No runtime terrain generation is intended; the binary is the source of truth.
- The sea / tile skirt are presentation geometry, not gameplay water.
- The apron and pad use procedural canvas textures; no paid or unclear-license assets.
