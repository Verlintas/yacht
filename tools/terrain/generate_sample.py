#!/usr/bin/env python3
"""Generate the deterministic Anvil Landing heightfield and terrain maps.

This is the offline authoring step for the port sample. The 1025 x 1025 grid
is 1 km across with 1 m spacing. It is composed from deterministic gradient
noise, a coastal island mask, a north/east mountain arc, a diagonal canyon and
a flattened 420 x 260 m port apron. A droplet erosion pass is then applied and
the apron is re-flattened.

Outputs (default public/terrain-sample/):
  heights.r16    1025*1025 little-endian uint16 heightfield (200 m full scale)
  normal.png     1024*1024 tangent-space normal map (OpenGL convention)
  ao.png         1024*1024 horizon-based ambient occlusion
  splat.png      1024*1024 RGBA weights: grass, dirt, rock, sand
  shore.png      512*512 water depth/foam mask for the coast shader
  meta.json      decode metadata, statistics, feature dimensions
  preview.png    optional hillshade / diagnostics (with --preview)

Usage:
  python3 tools/terrain/generate_sample.py
  python3 tools/terrain/generate_sample.py --out /tmp/terrain --preview /tmp/hm.png
  python3 tools/terrain/generate_sample.py --droplets 80000

Requires: Python 3.10+, numpy, Pillow.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np

SEED = 20261116
GRID_SIZE = 1025
TILE_SIZE_M = 1024.0
SPACING_M = TILE_SIZE_M / (GRID_SIZE - 1)
HEIGHT_SCALE_M = 256.0
PAD_ELEVATION_M = 28.0
APRON_WIDTH_M = 420.0
APRON_DEPTH_M = 260.0
PAD_SIZE_M = 60.0
SEA_LEVEL = 0.0

# A mountain arc that wraps the north and east of the port. The port itself
# sits on the low coastal shelf in the middle of the tile.
RIDGE_PATH = np.array(
    [
        (350.0, -470.0),
        (385.0, -300.0),
        (415.0, -110.0),
        (430.0, 80.0),
        (415.0, 260.0),
        (380.0, 430.0),
    ],
    dtype=np.float64,
)

# A diagonal canyon drains the ridge into a bay on the south-west coast.
CANYON_PATH = np.array(
    [
        (330.0, -260.0),
        (230.0, -205.0),
        (90.0, -180.0),
        (-70.0, -170.0),
        (-210.0, -140.0),
        (-295.0, -30.0),
        (-335.0, 120.0),
        (-355.0, 260.0),
        (-370.0, 400.0),
    ],
    dtype=np.float64,
)

BAY_CENTER = (-405.0, 390.0)
BAY_RADIUS = 205.0


# ---------------------------------------------------------------------------
# Noise helpers
# ---------------------------------------------------------------------------


def smoothstep(edge0: float, edge1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def gradient_noise(u: np.ndarray, v: np.ndarray, res: int, seed: int) -> np.ndarray:
    """Periodic 2D gradient noise in roughly [-1, 1]."""
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


def fbm(
    u: np.ndarray,
    v: np.ndarray,
    *,
    seed: int,
    octaves: int = 6,
    base: int = 4,
) -> np.ndarray:
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


def ridged(
    u: np.ndarray,
    v: np.ndarray,
    *,
    seed: int,
    octaves: int = 5,
    base: int = 4,
) -> np.ndarray:
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
    dx = np.abs(x) - half_w
    dz = np.abs(z) - half_d
    outside = np.hypot(np.maximum(dx, 0.0), np.maximum(dz, 0.0))
    inside = np.minimum(np.maximum(dx, dz), 0.0)
    return outside + inside


# ---------------------------------------------------------------------------
# Height composition
# ---------------------------------------------------------------------------


def island_radius(x: np.ndarray, z: np.ndarray, u: np.ndarray, v: np.ndarray) -> np.ndarray:
    """Rounded-square island radius in normalized units, with a noisy coast."""
    r = ((np.abs(x) / (TILE_SIZE_M * 0.5)) ** 6 + (np.abs(z) / (TILE_SIZE_M * 0.5)) ** 6) ** (1.0 / 6.0)
    coast_warp = fbm(u, v, seed=SEED + 91, octaves=4, base=4) * 0.055
    coast_warp += fbm(u, v, seed=SEED + 97, octaves=3, base=12) * 0.018
    return r + coast_warp


def build_natural_height(x: np.ndarray, z: np.ndarray) -> np.ndarray:
    u = x / TILE_SIZE_M + 0.5
    v = z / TILE_SIZE_M + 0.5

    warp_x = fbm(u, v, seed=SEED + 101, octaves=3, base=3) * 0.045
    warp_z = fbm(u, v, seed=SEED + 211, octaves=3, base=3) * 0.045
    uw = u + warp_x
    vw = v + warp_z

    broad = fbm(uw, vw, seed=SEED + 307, octaves=7, base=3)
    detail = fbm(uw, vw, seed=SEED + 401, octaves=6, base=10)

    # Coastal bench around the port, low and rolling.
    height = 24.0 + broad * 13.0 + detail * 3.4

    # Mountain arc across the north and east. This is the backdrop behind the
    # terminal when the camera looks north from the apron.
    ridge_dist = distance_to_polyline(x, z, RIDGE_PATH)
    crest = np.exp(-((ridge_dist / 118.0) ** 2))
    ridge_texture = ridged(uw, vw, seed=SEED + 601, octaves=6, base=6)
    peak_mod = fbm(uw, vw, seed=SEED + 607, octaves=3, base=5) * 14.0
    height += crest * (38.0 + ridge_texture * 62.0 + peak_mod)

    # A low foothill shelf on the east, softened into the coastal plain.
    foothill = smoothstep(240.0, 380.0, x) * smoothstep(-300.0, -120.0, z) * (1.0 - smoothstep(300.0, 390.0, z))
    height += foothill * (18.0 + ridged(uw, vw, seed=SEED + 611, octaves=4, base=7) * 18.0)

    # Canyon incision: a low floor with steep walls.
    canyon_dist = distance_to_polyline(x, z, CANYON_PATH)
    canyon_mask = 1.0 - smoothstep(18.0, 102.0, canyon_dist)
    canyon_floor = (
        6.0
        + fbm(uw + 7.3, vw - 2.8, seed=SEED + 701, octaves=4, base=7) * 4.0
        + ridged(uw, vw, seed=SEED + 709, octaves=3, base=9) * 2.5
    )
    height = height * (1.0 - canyon_mask) + canyon_floor * canyon_mask

    # Island mask: everything outside the authored coastline is sea floor.
    radius = island_radius(x, z, u, v)
    land = 1.0 - smoothstep(0.79, 0.985, radius)
    height = SEA_LEVEL + (height - SEA_LEVEL) * land

    # Beach terrace: a soft, sandy shelf right at the waterline.
    beach = smoothstep(0.80, 0.875, radius) * (1.0 - smoothstep(0.925, 1.0, radius))
    beach_height = 1.1 + fbm(uw, vw, seed=SEED + 803, octaves=3, base=18) * 0.7
    height = height * (1.0 - beach * 0.78) + beach_height * (beach * 0.78)

    # Drowned bay at the south-west corner. Applied after the beach so the
    # inlet stays below sea level and reads as water, not a dry flat.
    bay_dist = np.hypot(x - BAY_CENTER[0], z - BAY_CENTER[1])
    bay_mask = 1.0 - smoothstep(BAY_RADIUS * 0.38, BAY_RADIUS, bay_dist)
    height = height * (1.0 - bay_mask) + (-3.5) * bay_mask

    # A very low shoulder around the apron; the port reads as carved into
    # the coastal shelf without becoming a crater.
    apron_d = rounded_rect_distance(x, z, APRON_WIDTH_M / 2.0, APRON_DEPTH_M / 2.0)
    terrace = smoothstep(12.0, 70.0, apron_d)
    height += terrace * 2.2

    return height, radius


def hydraulic_erosion(
    height: np.ndarray,
    *,
    droplets: int = 60000,
    max_life: int = 34,
    seed: int = 17,
) -> np.ndarray:
    """Deterministic droplet erosion; run once offline, never in the browser."""
    rng = np.random.default_rng(seed)
    h = height.copy()
    n = h.shape[0]

    inertia = 0.055
    capacity_factor = 3.2
    min_capacity = 0.00035
    erode_speed = 0.24
    deposit_speed = 0.32
    evaporate = 0.011
    gravity = 6.5

    for drop in range(droplets):
        px = float(rng.uniform(3.0, n - 4.0))
        py = float(rng.uniform(3.0, n - 4.0))
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


def box_blur(a: np.ndarray, passes: int = 1) -> np.ndarray:
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
    d = rounded_rect_distance(x, z, APRON_WIDTH_M / 2.0, APRON_DEPTH_M / 2.0)
    mask = 1.0 - smoothstep(0.0, 46.0, d)
    # A shallow service shelf continues 18 m around the apron before the
    # natural terrain takes over.
    shelf = 1.0 - smoothstep(0.0, 18.0, d)
    flattened = height * (1.0 - mask) + PAD_ELEVATION_M * mask
    flattened = flattened * (1.0 - shelf) + (PAD_ELEVATION_M - 0.4) * shelf
    return flattened


# ---------------------------------------------------------------------------
# Derived maps
# ---------------------------------------------------------------------------


def compute_normal_map(height: np.ndarray, size: int = 1024) -> np.ndarray:
    h = height[:size, :size]
    dx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * 0.5 / SPACING_M
    dz = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) * 0.5 / SPACING_M
    # OpenGL tangent-space normal: +X = east, +Y = north (v), +Z = up.
    nx = -dx
    ny = -dz
    nz = np.ones_like(dx)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    nx /= length
    ny /= length
    nz /= length
    rgb = np.stack([nx * 0.5 + 0.5, ny * 0.5 + 0.5, nz * 0.5 + 0.5], axis=-1)
    return np.clip(rgb * 255.0 + 0.5, 0, 255).astype(np.uint8)


def compute_ao(height: np.ndarray, size: int = 1024) -> np.ndarray:
    h = height[:size, :size]
    directions = [(1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1)]
    distances = [2, 4, 8, 16, 32, 64]
    occlusion = np.zeros_like(h, dtype=np.float32)
    for dx, dz in directions:
        norm = math.hypot(dx, dz)
        dx /= norm
        dz /= norm
        for d in distances:
            shift_x = int(round(dx * d))
            shift_z = int(round(dz * d))
            shifted = np.roll(np.roll(h, -shift_z, axis=0), -shift_x, axis=1)
            horizon = np.maximum(0.0, (shifted - h) / max(d, 1.0))
            occlusion = np.maximum(occlusion, horizon)
    # Convert maximum horizon slope to a soft sky-visibility term.
    ao = 1.0 - np.clip(occlusion * 1.35, 0.0, 1.0) * 0.72
    # Slight cavity darkening from local curvature.
    blur = box_blur(h, passes=4)
    cavity = np.clip((blur - h) * 0.22, 0.0, 0.35)
    ao = np.clip(ao - cavity, 0.18, 1.0)
    return np.clip(ao * 255.0 + 0.5, 0, 255).astype(np.uint8)


def compute_splat(
    height: np.ndarray,
    radius: np.ndarray,
    x: np.ndarray,
    z: np.ndarray,
    size: int = 1024,
) -> np.ndarray:
    h = height[:size, :size]
    r = radius[:size, :size]
    xx = x[:size, :size]
    zz = z[:size, :size]
    dx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * 0.5 / SPACING_M
    dz = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) * 0.5 / SPACING_M
    slope = np.hypot(dx, dz)

    u = xx / TILE_SIZE_M + 0.5
    v = zz / TILE_SIZE_M + 0.5
    patch = fbm(u, v, seed=SEED + 901, octaves=5, base=9) * 0.5 + 0.5
    micro = fbm(u, v, seed=SEED + 907, octaves=6, base=24) * 0.5 + 0.5

    rock = smoothstep(0.42, 1.15, slope + (patch - 0.5) * 0.22)
    rock = np.maximum(rock, smoothstep(105.0, 155.0, h) * 0.75)
    sand = smoothstep(0.845, 0.92, r) * (1.0 - smoothstep(0.965, 1.0, r))
    sand = np.maximum(sand, smoothstep(6.0, 0.5, h) * 0.75)
    sand = np.clip(sand * (0.8 + micro * 0.4), 0.0, 1.0)

    grass = (1.0 - rock) * (1.0 - sand) * smoothstep(2.5, 9.0, h) * (0.35 + patch * 0.9)
    grass = np.clip(grass, 0.0, 1.0)
    dirt = (1.0 - rock) * (1.0 - sand) * (1.0 - grass) * 0.9 + (1.0 - sand) * smoothstep(0.15, 0.45, slope) * 0.35
    dirt = np.clip(dirt, 0.0, 1.0)

    # The apron itself is handled by the port geometry, but keep the natural
    # surface around it sane: dry dirt/gravel shoulder.
    total = grass + dirt + rock + sand + 1e-5
    rgba = np.stack([grass / total, dirt / total, rock / total, sand / total], axis=-1)
    return np.clip(rgba * 255.0 + 0.5, 0, 255).astype(np.uint8)


def compute_shore(height: np.ndarray, size: int = 512) -> np.ndarray:
    step = max(1, (height.shape[0] - 1) // size)
    h = height[::step, ::step][:size, :size]
    depth = np.clip(-h / 14.0, 0.0, 1.0)
    foam = np.clip(1.0 - np.abs(h - 0.8) / 2.2, 0.0, 1.0)
    foam *= (h > -2.5).astype(np.float32)
    # Break the foam line up with a little noise.
    yy, xx = np.mgrid[0 : h.shape[0], 0 : h.shape[1]]
    n = np.sin(xx * 0.11 + yy * 0.037) * np.sin(yy * 0.09 - xx * 0.021) * 0.18
    foam = np.clip(foam + n * foam, 0.0, 1.0)
    rgba = np.stack([depth, foam, np.clip(depth * 2.0, 0, 1), np.ones_like(depth)], axis=-1)
    return np.clip(rgba * 255.0 + 0.5, 0, 255).astype(np.uint8)


def write_preview(path: Path, height: np.ndarray, meta: dict) -> None:
    from PIL import Image, ImageDraw

    gy, gx = np.gradient(height, SPACING_M)
    slope = np.hypot(gx, gy)
    shade = np.clip(0.7 - gx * 0.55 - gy * 0.38, 0.16, 1.0)
    t = np.clip((height - 2.0) / 190.0, 0.0, 1.0)[..., None]
    low = np.array([86, 100, 74], dtype=np.float32)
    mid = np.array([125, 129, 101], dtype=np.float32)
    high = np.array([176, 170, 151], dtype=np.float32)
    rock = np.array([95, 94, 88], dtype=np.float32)
    water = np.array([47, 83, 96], dtype=np.float32)
    rgb = low * (1.0 - t) + mid * t
    rgb = rgb + (high - rgb) * np.clip((t - 0.55) / 0.45, 0.0, 1.0)
    rock_mix = np.clip((slope - 0.5) / 0.9, 0.0, 1.0)[..., None]
    rgb = rgb * (1.0 - rock_mix) + rock * rock_mix
    snow = np.clip((height - 170.0) / 24.0, 0.0, 1.0)[..., None]
    rgb = rgb * (1.0 - snow) + np.array([226, 230, 226], dtype=np.float32) * snow
    rgb = rgb * shade[..., None]
    wet = np.clip((1.5 - height) / 3.0, 0.0, 1.0)[..., None]
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
    pz0 = int((-PAD_SIZE_M / 2 + TILE_SIZE_M / 2) / SPACING_M)
    pz1 = int((PAD_SIZE_M / 2 + TILE_SIZE_M / 2) / SPACING_M)
    draw.rectangle((px0, pz0, px1, pz1), outline=(255, 255, 255), width=2)
    draw.text(
        (8, 8),
        f"Anvil Landing 1025x1025  {meta['elevation']['min_m']:.1f}-{meta['elevation']['max_m']:.1f} m  "
        f"pad {meta['apron']['elevation_m']:.1f} m",
        fill=(245, 245, 240),
    )
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
        help="output directory for terrain data",
    )
    parser.add_argument("--preview", type=Path, default=None, help="optional hillshade PNG")
    parser.add_argument("--droplets", type=int, default=60000, help="hydraulic erosion droplets")
    parser.add_argument("--no-erosion", action="store_true", help="skip erosion for fast iteration")
    args = parser.parse_args()

    coords = np.linspace(-TILE_SIZE_M / 2.0, TILE_SIZE_M / 2.0, GRID_SIZE)
    x, z = np.meshgrid(coords, coords, indexing="xy")  # rows: z, columns: x

    print(f"seed {SEED}: composing {GRID_SIZE}x{GRID_SIZE} heightfield ...")
    height, radius = build_natural_height(x, z)

    if not args.no_erosion:
        print(f"eroding ({args.droplets:,} droplets) ...")
        height = hydraulic_erosion(height, droplets=args.droplets)
        height = box_blur(height, passes=1)
    else:
        print("skipping erosion")

    # Re-carve the canyon floor so it stays readable after erosion.
    canyon_dist = distance_to_polyline(x, z, CANYON_PATH)
    canyon_mask = 1.0 - smoothstep(16.0, 95.0, canyon_dist)
    canyon_floor = 5.5 + fbm(
        x / TILE_SIZE_M + 0.5, z / TILE_SIZE_M + 0.5, seed=SEED + 811, octaves=4, base=7
    ) * 3.5
    height = height * (1.0 - canyon_mask) + canyon_floor * canyon_mask

    print("flattening 420x260 m apron and 60x60 m TLOF ...")
    height = flatten_apron(height, x, z)
    height = np.clip(height, 0.0, 190.0)

    # Pad must be exactly flat after every numeric pass.
    apron_mask = rounded_rect_distance(x, z, APRON_WIDTH_M / 2.0, APRON_DEPTH_M / 2.0) <= 0.0
    height[apron_mask] = PAD_ELEVATION_M

    r16 = np.round(height / HEIGHT_SCALE_M * 65535.0).astype("<u2")
    raw = r16.tobytes(order="C")
    checksum = hashlib.sha256(raw).hexdigest()

    def at(px: float, pz: float) -> float:
        col = int(round((px + TILE_SIZE_M / 2.0) / SPACING_M))
        row = int(round((pz + TILE_SIZE_M / 2.0) / SPACING_M))
        col = min(max(col, 0), GRID_SIZE - 1)
        row = min(max(row, 0), GRID_SIZE - 1)
        return float(height[row, col])

    ridge_peak = float(np.max(height))
    meta = {
        "name": "Anvil Landing authored terrain sample",
        "generator": "tools/terrain/generate_sample.py",
        "seed": SEED,
        "license": "procedural project-owned heightfield (no third-party terrain assets)",
        "grid": {"width": GRID_SIZE, "height": GRID_SIZE, "spacing_m": SPACING_M},
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
        "maps": {
            "normal": "normal.png",
            "ao": "ao.png",
            "splat": "splat.png",
            "splat_channels": ["grass", "dirt", "rock", "sand"],
            "shore": "shore.png",
            "shore_channels": ["depth", "foam", "shallow", "unused"],
        },
        "elevation": {
            "min_m": round(float(np.min(height)), 2),
            "max_m": round(float(np.max(height)), 2),
            "ridge_peak_m": round(ridge_peak, 2),
            "canyon_floor_m": round(at(-335.0, 120.0), 2),
            "pad_m": round(at(0.0, 0.0), 2),
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
            "ridge": "north/east mountain arc, cut by the canyon",
            "plateau": "eastern scarp shelf",
            "canyon": "diagonal gorge west/north-west of the apron",
            "coast": "south-west bay + sandy south coast",
        },
    }

    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "heights.r16").write_bytes(raw)
    print("computing normal / AO / splat / shore maps ...")
    from PIL import Image

    Image.fromarray(compute_normal_map(height), "RGB").save(args.out / "normal.png")
    Image.fromarray(compute_ao(height), "L").save(args.out / "ao.png")
    Image.fromarray(compute_splat(height, radius, x, z), "RGBA").save(args.out / "splat.png")
    Image.fromarray(compute_shore(height), "RGBA").save(args.out / "shore.png")
    (args.out / "meta.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")

    print(f"wrote {args.out / 'heights.r16'} ({len(raw):,} bytes, sha256 {checksum[:16]}...)")
    print(
        "elevation: "
        f"{meta['elevation']['min_m']:.1f}-{meta['elevation']['max_m']:.1f} m, "
        f"pad {meta['elevation']['pad_m']:.1f} m, "
        f"ridge {meta['elevation']['ridge_peak_m']:.1f} m"
    )

    if args.preview:
        write_preview(args.preview, height, meta)
        print(f"wrote preview {args.preview}")


if __name__ == "__main__":
    main()
