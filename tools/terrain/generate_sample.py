#!/usr/bin/env python3
"""Generate the deterministic Anvil Landing terrain sample.

The tile is 1 km x 1 km, sampled on a 257 x 257 grid (3.90625 m spacing).
It is authored offline: FBM + ridged noise, hydraulic erosion, canyon carving,
mild smoothing, and a fully flattened 420 x 260 m port apron with a
60 x 60 m TLOF at the centre.

Outputs (default: public/terrain-sample/):
  heights.r16  257*257 little-endian uint16 heightfield
  meta.json    decoder metadata and feature dimensions

The runtime never generates terrain noise; it only decodes this file.

Usage:
  python3 tools/terrain/generate_sample.py
  python3 tools/terrain/generate_sample.py --out /tmp/terrain --preview /tmp/hm.png

Requires: Python 3.10+, numpy. Pillow is only needed for --preview.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np

# ---------------------------------------------------------------------------
# Authored constants
# ---------------------------------------------------------------------------

SEED = 20261116
GRID_SIZE = 257
TILE_SIZE_M = 1000.0
SPACING_M = TILE_SIZE_M / (GRID_SIZE - 1)

HEIGHT_SCALE_M = 200.0  # uint16 0..65535 -> 0..200 m
PAD_ELEVATION_M = 54.0
APRON_WIDTH_M = 420.0
APRON_DEPTH_M = 260.0
PAD_SIZE_M = 60.0

# Canyon centreline, west/north-west to south-east. Kept clear of the apron.
CANYON_PATH = np.array(
    [
        (-540.0, -450.0),
        (-430.0, -280.0),
        (-395.0, -120.0),
        (-370.0, 60.0),
        (-320.0, 240.0),
        (-230.0, 420.0),
        (-120.0, 540.0),
    ],
    dtype=np.float64,
)

# Ridge crest, roughly north-south on the western side of the tile.
RIDGE_PATH = np.array(
    [
        (-400.0, -540.0),
        (-370.0, -330.0),
        (-405.0, -120.0),
        (-365.0, 90.0),
        (-400.0, 300.0),
        (-350.0, 540.0),
    ],
    dtype=np.float64,
)


# ---------------------------------------------------------------------------
# Deterministic noise
# ---------------------------------------------------------------------------


def smoothstep(edge0: float, edge1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def gradient_noise(u: np.ndarray, v: np.ndarray, res: int, seed: int) -> np.ndarray:
    """Periodic 2D gradient noise in roughly [-1, 1].

    A periodic lattice keeps the 1 km tile edge-safe if it is ever repeated.
    """
    rng = np.random.default_rng(seed)
    angles = rng.random((res, res)) * math.tau
    gx = np.cos(angles)
    gy = np.sin(angles)

    x = u * res
    y = v * res
    x0 = np.floor(x).astype(np.int64)
    y0 = np.floor(y).astype(np.int64)
    tx = x - x0
    ty = y - y0
    x0i = np.mod(x0, res)
    y0i = np.mod(y0, res)
    x1i = np.mod(x0 + 1, res)
    y1i = np.mod(y0 + 1, res)

    n00 = gx[y0i, x0i] * tx + gy[y0i, x0i] * ty
    n10 = gx[y0i, x1i] * (tx - 1.0) + gy[y0i, x1i] * ty
    n01 = gx[y1i, x0i] * tx + gy[y1i, x0i] * (ty - 1.0)
    n11 = gx[y1i, x1i] * (tx - 1.0) + gy[y1i, x1i] * (ty - 1.0)

    fade_x = tx * tx * tx * (tx * (tx * 6.0 - 15.0) + 10.0)
    fade_y = ty * ty * ty * (ty * (ty * 6.0 - 15.0) + 10.0)
    nx0 = n00 + fade_x * (n10 - n00)
    nx1 = n01 + fade_x * (n11 - n01)
    return (nx0 + fade_y * (nx1 - nx0)) * math.sqrt(2.0)


def fbm(u: np.ndarray, v: np.ndarray, *, seed: int, octaves: int = 6, base: int = 4) -> np.ndarray:
    total = np.zeros_like(u)
    amp = 1.0
    norm = 0.0
    res = base
    for index in range(octaves):
        total += amp * gradient_noise(u, v, res, seed + index * 7919)
        norm += amp
        amp *= 0.5
        res *= 2
    return total / norm


def ridged(u: np.ndarray, v: np.ndarray, *, seed: int, octaves: int = 5, base: int = 4) -> np.ndarray:
    total = np.zeros_like(u)
    amp = 1.0
    norm = 0.0
    res = base
    for index in range(octaves):
        n = 1.0 - np.abs(gradient_noise(u, v, res, seed + index * 6151))
        total += amp * n * n
        norm += amp
        amp *= 0.52
        res *= 2
    return total / norm


# ---------------------------------------------------------------------------
# Shape helpers
# ---------------------------------------------------------------------------


def distance_to_polyline(x: np.ndarray, z: np.ndarray, points: np.ndarray) -> np.ndarray:
    dist = np.full_like(x, np.inf)
    for start, end in zip(points[:-1], points[1:]):
        ax, az = start
        bx, bz = end
        dx, dz = bx - ax, bz - az
        length_sq = dx * dx + dz * dz
        t = np.clip(((x - ax) * dx + (z - az) * dz) / length_sq, 0.0, 1.0)
        px = ax + t * dx
        pz = az + t * dz
        dist = np.minimum(dist, np.hypot(x - px, z - pz))
    return dist


def rounded_rect_distance(x: np.ndarray, z: np.ndarray, half_w: float, half_d: float) -> np.ndarray:
    """Signed distance to an axis-aligned rectangle (negative inside)."""
    dx = np.abs(x) - half_w
    dz = np.abs(z) - half_d
    outside = np.hypot(np.maximum(dx, 0.0), np.maximum(dz, 0.0))
    inside = np.minimum(np.maximum(dx, dz), 0.0)
    return outside + inside


# ---------------------------------------------------------------------------
# Height composition
# ---------------------------------------------------------------------------


def build_natural_height(x: np.ndarray, z: np.ndarray) -> np.ndarray:
    u = x / TILE_SIZE_M + 0.5
    v = z / TILE_SIZE_M + 0.5

    # Domain warp keeps the broad shapes from looking like a value-noise grid.
    warp_x = fbm(u, v, seed=SEED + 101, octaves=3, base=3) * 0.055
    warp_z = fbm(u, v, seed=SEED + 211, octaves=3, base=3) * 0.055
    uw = u + warp_x
    vw = v + warp_z

    broad = fbm(uw, vw, seed=SEED + 307, octaves=7, base=3)
    detail = fbm(uw, vw, seed=SEED + 401, octaves=5, base=8)

    # Rolling base plateau, roughly 40-60 m around the port.
    height = 45.0 + broad * 20.0 + detail * 4.5

    # Broad high plateau in the east; its western edge is a readable scarp.
    scarp_x = 272.0 + 30.0 * np.sin(z / 155.0 + 0.7) + 13.0 * np.sin(z / 54.0)
    plateau_mask = smoothstep(0.0, 38.0, x - scarp_x)
    plateau_top = 100.0 + broad * 8.0 + fbm(uw + 3.1, vw, seed=SEED + 503, octaves=5, base=8) * 5.5
    height = height + plateau_mask * (plateau_top - height)

    # Rugged north-south ridge on the west side.
    ridge_dist = distance_to_polyline(x, z, RIDGE_PATH)
    ridge_crest = np.exp(-((ridge_dist / 74.0) ** 2))
    ridge_texture = ridged(uw, vw, seed=SEED + 601, octaves=6, base=8)
    height += ridge_crest * (70.0 + ridge_texture * 58.0)

    # Canyon: flatten a narrow floor, then climb steep walls.
    canyon_dist = distance_to_polyline(x, z, CANYON_PATH)
    canyon_mask = 1.0 - smoothstep(14.0, 90.0, canyon_dist)
    canyon_floor = (
        15.0
        + fbm(uw + 7.3, vw - 2.8, seed=SEED + 701, octaves=4, base=7) * 5.0
        + ridged(uw, vw, seed=SEED + 709, octaves=3, base=6) * 3.0
    )
    height = height * (1.0 - canyon_mask) + canyon_floor * canyon_mask

    return height


def hydraulic_erosion(
    height: np.ndarray,
    *,
    droplets: int = 14000,
    max_life: int = 38,
    seed: int = 17,
) -> np.ndarray:
    """Small deterministic droplet erosion pass.

    This is intentionally simple but produces gullies on the ridge and soft
    alluvial fans at its base. It runs once offline, never in the browser.
    """
    rng = np.random.default_rng(seed)
    h = height.copy()
    n = h.shape[0]

    inertia = 0.06
    capacity_factor = 3.4
    min_capacity = 0.0004
    erode_speed = 0.28
    deposit_speed = 0.34
    evaporate = 0.012
    gravity = 7.0

    for _ in range(droplets):
        px = float(rng.uniform(2.0, n - 3.0))
        py = float(rng.uniform(2.0, n - 3.0))
        dx = 0.0
        dy = 0.0
        speed = 1.0
        water = 1.0
        sediment = 0.0

        for _step in range(max_life):
            ix = int(px)
            iy = int(py)
            fx = px - ix
            fy = py - iy
            if ix < 1 or iy < 1 or ix >= n - 2 or iy >= n - 2:
                break

            h00 = h[iy, ix]
            h10 = h[iy, ix + 1]
            h01 = h[iy + 1, ix]
            h11 = h[iy + 1, ix + 1]

            gx = (h10 - h00) * (1.0 - fy) + (h11 - h01) * fy
            gy = (h01 - h00) * (1.0 - fx) + (h11 - h10) * fx
            old_h = (
                h00 * (1.0 - fx) * (1.0 - fy)
                + h10 * fx * (1.0 - fy)
                + h01 * (1.0 - fx) * fy
                + h11 * fx * fy
            )

            dx = dx * inertia - gx * (1.0 - inertia)
            dy = dy * inertia - gy * (1.0 - inertia)
            length = math.hypot(dx, dy)
            if length < 1e-9:
                break
            dx /= length
            dy /= length

            nx = px + dx
            ny = py + dy
            if nx < 1.0 or ny < 1.0 or nx >= n - 2.0 or ny >= n - 2.0:
                break

            nix = int(nx)
            niy = int(ny)
            nfx = nx - nix
            nfy = ny - niy
            new_h = (
                h[niy, nix] * (1.0 - nfx) * (1.0 - nfy)
                + h[niy, nix + 1] * nfx * (1.0 - nfy)
                + h[niy + 1, nix] * (1.0 - nfx) * nfy
                + h[niy + 1, nix + 1] * nfx * nfy
            )
            delta_h = new_h - old_h

            capacity = max(-delta_h, 0.0) * speed * water * capacity_factor
            capacity = max(capacity, min_capacity)

            if sediment > capacity or delta_h > 0.0:
                amount = (sediment - capacity) * deposit_speed
                if delta_h > 0.0:
                    amount = min(amount + delta_h * 0.15, sediment)
                if amount > 0.0:
                    w00 = (1.0 - fx) * (1.0 - fy)
                    w10 = fx * (1.0 - fy)
                    w01 = (1.0 - fx) * fy
                    w11 = fx * fy
                    h[iy, ix] += amount * w00
                    h[iy, ix + 1] += amount * w10
                    h[iy + 1, ix] += amount * w01
                    h[iy + 1, ix + 1] += amount * w11
                    sediment -= amount
            else:
                amount = min((capacity - sediment) * erode_speed, -delta_h)
                if amount > 0.0:
                    w00 = (1.0 - fx) * (1.0 - fy)
                    w10 = fx * (1.0 - fy)
                    w01 = (1.0 - fx) * fy
                    w11 = fx * fy
                    h[iy, ix] -= amount * w00
                    h[iy, ix + 1] -= amount * w10
                    h[iy + 1, ix] -= amount * w01
                    h[iy + 1, ix + 1] -= amount * w11
                    sediment += amount

            speed = math.sqrt(max(speed * speed - delta_h * gravity, 0.01))
            water *= 1.0 - evaporate
            px = nx
            py = ny

    return h


def box_blur(a: np.ndarray, passes: int = 2) -> np.ndarray:
    """Small separable box blur, edge clamped. Softens single-cell erosion pits."""
    out = a.copy()
    for _ in range(passes):
        padded = np.pad(out, 1, mode="edge")
        out = (
            padded[1:-1, 1:-1] * 4.0
            + padded[:-2, 1:-1]
            + padded[2:, 1:-1]
            + padded[1:-1, :-2]
            + padded[1:-1, 2:]
        ) / 8.0
    return out


def flatten_apron(height: np.ndarray, x: np.ndarray, z: np.ndarray) -> np.ndarray:
    """Flatten the full 420 x 260 m apron, blending into terrain outside it."""
    d = rounded_rect_distance(x, z, APRON_WIDTH_M / 2.0, APRON_DEPTH_M / 2.0)
    mask = 1.0 - smoothstep(0.0, 42.0, d)
    return height * (1.0 - mask) + PAD_ELEVATION_M * mask


# ---------------------------------------------------------------------------
# Preview (optional, development aid)
# ---------------------------------------------------------------------------


def write_preview(path: Path, height: np.ndarray, meta: dict) -> None:
    from PIL import Image, ImageDraw  # imported lazily: not needed for exports

    gy, gx = np.gradient(height, SPACING_M)
    slope = np.hypot(gx, gy)
    shade = np.clip(0.72 - gx * 0.55 - gy * 0.38, 0.18, 1.0)

    lo = np.array([80, 96, 70], dtype=np.float32)
    mid = np.array([126, 132, 102], dtype=np.float32)
    hi = np.array([172, 168, 148], dtype=np.float32)
    snow = np.array([226, 230, 226], dtype=np.float32)
    rock = np.array([98, 96, 88], dtype=np.float32)
    water = np.array([54, 91, 103], dtype=np.float32)

    t = np.clip((height - 5.0) / 145.0, 0.0, 1.0)[..., None]
    rgb = lo * (1.0 - t) + mid * t
    rgb = rgb + (hi - rgb) * np.clip((t - 0.55) / 0.45, 0.0, 1.0)
    rock_mix = np.clip((slope - 0.55) / 0.85, 0.0, 1.0)[..., None]
    rgb = rgb * (1.0 - rock_mix) + rock * rock_mix
    snow_mix = np.clip((height - 132.0) / 22.0, 0.0, 1.0)[..., None]
    rgb = rgb * (1.0 - snow_mix) + snow * snow_mix
    rgb = rgb * shade[..., None]

    # A hint of water in the deepest canyon bottom.
    wet = np.clip((18.5 - height) / 3.0, 0.0, 1.0)[..., None]
    rgb = rgb * (1.0 - wet) + water * wet

    img = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), "RGB")
    draw = ImageDraw.Draw(img)
    ax0 = int((-APRON_WIDTH_M / 2 + TILE_SIZE_M / 2) / SPACING_M)
    ax1 = int((APRON_WIDTH_M / 2 + TILE_SIZE_M / 2) / SPACING_M)
    az0 = int((-APRON_DEPTH_M / 2 + TILE_SIZE_M / 2) / SPACING_M)
    az1 = int((APRON_DEPTH_M / 2 + TILE_SIZE_M / 2) / SPACING_M)
    draw.rectangle((ax0, az0, ax1, az1), outline=(240, 190, 90), width=2)
    px0 = int((-PAD_SIZE_M / 2 + TILE_SIZE_M / 2) / SPACING_M)
    px1 = int((PAD_SIZE_M / 2 + TILE_SIZE_M / 2) / SPACING_M)
    draw.rectangle((px0, az0 + (az1 - az0) // 2 - (px1 - px0) // 2,
                    px1, az0 + (az1 - az0) // 2 + (px1 - px0) // 2),
                   outline=(255, 255, 255), width=1)
    draw.rectangle((px0, az0 + (az1 - az0) // 2 - (px1 - px0) // 2,
                    px1, az0 + (az1 - az0) // 2 + (px1 - px0) // 2),
                   outline=(10, 20, 24), width=1)
    draw.text((8, 8), f"Anvil Landing 257x257  min {meta['elevation']['min_m']:.1f} m  max {meta['elevation']['max_m']:.1f} m", fill=(245, 245, 240))
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "public" / "terrain-sample",
        help="output directory for heights.r16 and meta.json",
    )
    parser.add_argument("--preview", type=Path, default=None, help="optional hillshade PNG")
    parser.add_argument("--droplets", type=int, default=14000, help="hydraulic erosion droplets")
    args = parser.parse_args()

    coords = np.linspace(-TILE_SIZE_M / 2.0, TILE_SIZE_M / 2.0, GRID_SIZE)
    x, z = np.meshgrid(coords, coords, indexing="xy")  # rows: z, columns: x

    print(f"seed {SEED}: composing {GRID_SIZE}x{GRID_SIZE} heightfield ...")
    height = build_natural_height(x, z)

    print(f"eroding ({args.droplets} droplets) ...")
    height = hydraulic_erosion(height, droplets=args.droplets)
    height = box_blur(height, passes=2)

    # Re-carve the canyon floor after erosion so it stays a readable feature.
    canyon_dist = distance_to_polyline(x, z, CANYON_PATH)
    canyon_mask = 1.0 - smoothstep(14.0, 90.0, canyon_dist)
    canyon_floor = (
        15.0
        + fbm(x / TILE_SIZE_M + 0.5, z / TILE_SIZE_M + 0.5, seed=SEED + 811, octaves=4, base=7) * 4.0
    )
    height = height * (1.0 - canyon_mask) + canyon_floor * canyon_mask

    print("flattening 420x260 m apron and 60x60 m TLOF ...")
    height = flatten_apron(height, x, z)

    # Keep the authored tile within the R16 budget and remove accidental spikes.
    height = np.clip(height, 0.0, HEIGHT_SCALE_M)

    # Pad must be exactly flat after any numeric pass.
    apron_mask = rounded_rect_distance(x, z, APRON_WIDTH_M / 2.0, APRON_DEPTH_M / 2.0) <= 0.0
    height[apron_mask] = PAD_ELEVATION_M

    r16 = np.round(height / HEIGHT_SCALE_M * 65535.0).astype("<u2")
    raw = r16.tobytes(order="C")
    checksum = hashlib.sha256(raw).hexdigest()

    # Sampled feature elevations, for the README / overlay / sanity checks.
    def at(px: float, pz: float) -> float:
        col = int(round((px + TILE_SIZE_M / 2.0) / SPACING_M))
        row = int(round((pz + TILE_SIZE_M / 2.0) / SPACING_M))
        col = min(max(col, 0), GRID_SIZE - 1)
        row = min(max(row, 0), GRID_SIZE - 1)
        return float(height[row, col])

    ridge_peak = float(np.max(height[:, : GRID_SIZE // 2]))
    canyon_floor_sample = at(-370.0, 60.0)
    pad_sample = at(0.0, 0.0)

    meta = {
        "name": "Anvil Landing terrain sample",
        "generator": "tools/terrain/generate_sample.py",
        "seed": SEED,
        "license": "procedural sample, generated in-repo (no third-party assets)",
        "grid": {
            "width": GRID_SIZE,
            "height": GRID_SIZE,
            "spacing_m": SPACING_M,
        },
        "tile_size_m": TILE_SIZE_M,
        "heightmap": {
            "file": "heights.r16",
            "format": "r16le",
            "dtype": "uint16",
            "height_scale_m": HEIGHT_SCALE_M,
            "row_order": "north_to_south",
            "column_order": "west_to_east",
            "origin": "northwest corner",
            "decode": "height_m = value / 65535 * height_scale_m",
            "sha256": checksum,
        },
        "elevation": {
            "min_m": round(float(np.min(height)), 2),
            "max_m": round(float(np.max(height)), 2),
            "ridge_peak_m": round(ridge_peak, 2),
            "canyon_floor_m": round(canyon_floor_sample, 2),
            "pad_m": round(pad_sample, 2),
        },
        "apron": {
            "center_m": [0.0, 0.0],
            "size_m": [APRON_WIDTH_M, APRON_DEPTH_M],
            "elevation_m": PAD_ELEVATION_M,
        },
        "pad": {
            "name": "TLOF",
            "center_m": [0.0, 0.0],
            "size_m": [PAD_SIZE_M, PAD_SIZE_M],
            "elevation_m": PAD_ELEVATION_M,
            "markings": ["H", "touchdown circle", "border", "corner brackets"],
        },
        "features": {
            "ridge": "west side, roughly north-south, cut by the canyon",
            "plateau": "eastern scarp plateau",
            "canyon": "diagonal gorge west/south-west of the apron",
        },
    }

    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "heights.r16").write_bytes(raw)
    (args.out / "meta.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")

    print(f"wrote {args.out / 'heights.r16'} ({len(raw):,} bytes, sha256 {checksum[:16]}...)")
    print(f"wrote {args.out / 'meta.json'}")
    print(
        "elevation: "
        f"{meta['elevation']['min_m']:.1f}-{meta['elevation']['max_m']:.1f} m, "
        f"pad {meta['elevation']['pad_m']:.1f} m, "
        f"ridge {meta['elevation']['ridge_peak_m']:.1f} m, "
        f"canyon floor {meta['elevation']['canyon_floor_m']:.1f} m"
    )

    if args.preview:
        write_preview(args.preview, height, meta)
        print(f"wrote preview {args.preview}")


if __name__ == "__main__":
    main()
