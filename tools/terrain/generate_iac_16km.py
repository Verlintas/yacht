#!/usr/bin/env python3
"""Generate the IAC Forgeheart / Anvil Landing 16 km authored heightfield.

Outputs (public/iac-landing/terrain):
  height_16km.r16   641 x 641, 16-bit LE, 25 m spacing, 16.384 km square
  backdrop.r16      193 x 193, 16-bit LE, 250 m spacing, 48 km square
  splat.png         512 x 512 RGBA: rock / dirt / grass / sand
  macro.png         512 x 512 RGB low-frequency tint
  meta.json

The landing plateau is exactly 40 m high, 1.8 km east-west and 1.6 km
north-south. The port's authored 1.2 km deck sits on it. Authoring is
deterministic; no noise is generated at runtime.

Run: python3 tools/terrain/generate_iac_16km.py
"""
from __future__ import annotations

import json
import math
import os
import shutil

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "public", "iac-landing", "terrain")
TEX_SRC = os.path.join(ROOT, "public", "terrain-sample", "textures")
os.makedirs(OUT, exist_ok=True)
os.makedirs(os.path.join(OUT, "textures"), exist_ok=True)

GRID = 641
EXTENT = 16384.0
SPACING = EXTENT / (GRID - 1)
HALF = EXTENT * 0.5
PLATEAU_H = 40.0
PLATEAU_HX = 1100.0
PLATEAU_HZ = 1300.0
PLATEAU_R = 260.0

RNG = np.random.default_rng(20261117)

# ---------------------------------------------------------------------------
# deterministic value noise
# ---------------------------------------------------------------------------
_PERM = RNG.permutation(512).astype(np.int32)
_PERM = np.concatenate([_PERM, _PERM])


def _fade(t):
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0)


def _grid_hash(ix, iy, seed):
    h = (ix * 374761393 + iy * 668265263 + seed * 1013904223) & 0xFFFFFFFF
    h = (h ^ (h >> 13)) * 1274126177 & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFFFF) / float(0xFFFFFF)


def value_noise(x, y, seed=0):
    """Vectorised value noise, values in [-1, 1]."""
    x = np.asarray(x, dtype=np.float64)
    y = np.asarray(y, dtype=np.float64)
    ix = np.floor(x).astype(np.int64)
    iy = np.floor(y).astype(np.int64)
    fx = x - ix
    fy = y - iy
    u = _fade(fx)
    v = _fade(fy)
    a = _grid_hash(ix, iy, seed)
    b = _grid_hash(ix + 1, iy, seed)
    c = _grid_hash(ix, iy + 1, seed)
    d = _grid_hash(ix + 1, iy + 1, seed)
    ab = a + (b - a) * u
    cd = c + (d - c) * u
    return (ab + (cd - ab) * v) * 2.0 - 1.0


def fbm(x, y, octaves=5, seed=1, lacunarity=2.03, gain=0.5):
    total = 0.0
    amp = 0.5
    norm = 0.0
    fx = np.asarray(x, dtype=np.float64)
    fy = np.asarray(y, dtype=np.float64)
    for o in range(octaves):
        total = total + value_noise(fx, fy, seed + o * 17) * amp
        norm += amp
        amp *= gain
        fx = fx * lacunarity + 19.19
        fy = fy * lacunarity + 7.73
    return total / norm


def ridged(x, y, octaves=5, seed=11):
    n = 1.0 - np.abs(fbm(x, y, octaves=octaves, seed=seed))
    return n * n


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def sd_rounded_rect(x, z, hx, hz, r):
    qx = np.abs(x) - (hx - r)
    qz = np.abs(z) - (hz - r)
    ox = np.maximum(qx, 0.0)
    oz = np.maximum(qz, 0.0)
    return np.sqrt(ox * ox + oz * oz) + np.minimum(np.maximum(qx, qz), 0.0) - r


def terrain_height(x, z):
    """Region-local height in metres, +Y up. x east, z south (Three.js)."""
    x = np.asarray(x, dtype=np.float64)
    z = np.asarray(z, dtype=np.float64)

    # Base plain / rolling ash country
    base = 9.0 + 8.0 * fbm(x / 2400.0, z / 2400.0, octaves=5, seed=3)
    base += 3.2 * fbm(x / 520.0, z / 520.0, octaves=4, seed=7)
    base += 1.1 * fbm(x / 130.0, z / 130.0, octaves=3, seed=9)

    # North mountain arc, cut by a wide saddle
    north_mask = smoothstep(-1200.0, -4300.0, z)
    north_mask *= 0.55 + 0.45 * smoothstep(-2400.0, 2800.0, x)
    north_ridge = ridged(x / 2300.0, z / 2100.0, octaves=6, seed=13)
    north = 760.0 * np.power(north_ridge, 1.55) * north_mask

    # A nearer north wall behind Anvil Landing, so the port has a real horizon
    # instead of a low hill band. It starts just outside the flat plateau.
    near_mask = smoothstep(-1450.0, -3200.0, z)
    near_mask *= 0.55 + 0.45 * smoothstep(-1800.0, 1800.0, x)
    near = 300.0 * ridged(x / 1200.0, z / 1000.0, octaves=5, seed=83) * near_mask

    # East mesa / foundry scarp
    east_mask = smoothstep(1150.0, 2900.0, x) * smoothstep(2600.0, -2600.0, z)
    east = 360.0 * (0.42 + 0.58 * ridged(x / 1300.0, z / 1100.0, octaves=5, seed=23)) * east_mask

    # West canyon: distance to a diagonal line
    ax, az = -1180.0, 900.0
    bx, bz = -3300.0, -1500.0
    vx, vz = bx - ax, bz - az
    t = np.clip(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz), 0.0, 1.0)
    px, pz = ax + vx * t, az + vz * t
    canyon_d = np.sqrt((x - px) ** 2 + (z - pz) ** 2)
    canyon_w = 260.0 + 160.0 * fbm(x / 900.0, z / 900.0, octaves=3, seed=31)
    canyon_mask = np.exp(-np.power(canyon_d / canyon_w, 4.0))
    canyon_mask *= smoothstep(-2600.0, 1600.0, z) * smoothstep(-4000.0, -1800.0, x)
    canyon = 115.0 * canyon_mask

    # A couple of low foundry mesas to the south for the road horizon
    south_mask = smoothstep(1600.0, 3600.0, z) * smoothstep(-2400.0, 2400.0, x)
    south = 150.0 * ridged(x / 1700.0, z / 1400.0, octaves=5, seed=37) * south_mask

    h = base + north + near + east + south - canyon

    # The landing plateau: flat top, short blend at the edge, then a rocky lip.
    d = sd_rounded_rect(x, z, PLATEAU_HX, PLATEAU_HZ, PLATEAU_R)
    flat = 1.0 - smoothstep(-120.0, 10.0, d)
    # rocky lip: lift a 90 m band just outside the plateau, then let it fall
    lip = np.exp(-np.power((d - 45.0) / 95.0, 2.0)) * 8.0
    lip *= 0.55 + 0.45 * fbm(x / 140.0, z / 140.0, octaves=3, seed=41)
    h = h + lip
    h = h * (1.0 - flat) + PLATEAU_H * flat

    # Guarantee the port footprint is dead flat.
    port_flat = 1.0 - smoothstep(560.0, 670.0, np.maximum(np.abs(x) / 1.15, np.abs(z)))
    h = h * (1.0 - port_flat) + PLATEAU_H * port_flat
    return h


# ---------------------------------------------------------------------------
# heightfields
# ---------------------------------------------------------------------------
print("building 16 km heightfield", GRID, "x", GRID)
coords = np.linspace(-HALF, HALF, GRID, dtype=np.float64)
xx, zz = np.meshgrid(coords, coords)
height = terrain_height(xx, zz)

# A tiny amount of deterministic roughness on the plateau edge only, to avoid
# a perfectly smooth 25 m slope. Do not touch the port footprint.
d = sd_rounded_rect(xx, zz, PLATEAU_HX, PLATEAU_HZ, PLATEAU_R)
edge_band = (d > 10.0) & (d < 360.0)
rough = 1.8 * fbm(xx / 90.0, zz / 90.0, octaves=3, seed=53) * edge_band
height = height + rough * (1.0 - (1.0 - smoothstep(560.0, 670.0, np.maximum(np.abs(xx) / 1.15, np.abs(zz)))))

hmin = float(height.min())
hmax = float(height.max())
print("height range", hmin, hmax, "plateau", height[GRID // 2, GRID // 2])

# R16 with per-field min/max; row 0 is north (z = -HALF).
u16 = np.round((height - hmin) / (hmax - hmin) * 65535.0).astype("<u2")
with open(os.path.join(OUT, "height_16km.r16"), "wb") as f:
    f.write(u16.tobytes())

# ---------------------------------------------------------------------------
# coarse horizon backdrop (48 km)
# ---------------------------------------------------------------------------
BG = 193
BG_EXTENT = 49152.0
bg_coords = np.linspace(-BG_EXTENT / 2, BG_EXTENT / 2, BG, dtype=np.float64)
bxx, bzz = np.meshgrid(bg_coords, bg_coords)
bh = terrain_height(bxx, bzz)
# lower the inner 16 km so the high-res tile always wins
inner = np.maximum(np.abs(bxx), np.abs(bzz)) < 8200.0
bh = bh - inner * 20.0
bhmin = float(bh.min())
bhmax = float(bh.max())
bu16 = np.round((bh - bhmin) / (bhmax - bhmin) * 65535.0).astype("<u2")
with open(os.path.join(OUT, "backdrop.r16"), "wb") as f:
    f.write(bu16.tobytes())

# ---------------------------------------------------------------------------
# splat: rock, dirt, grass, sand
# ---------------------------------------------------------------------------
SPLAT = 512
sc = np.linspace(-HALF, HALF, SPLAT, dtype=np.float64)
sxx, szz = np.meshgrid(sc, sc)
sh = terrain_height(sxx, szz)

# slope from a 32 m finite difference
eps = 32.0
hx1 = terrain_height(sxx + eps, szz)
hx0 = terrain_height(sxx - eps, szz)
hz1 = terrain_height(sxx, szz + eps)
hz0 = terrain_height(sxx, szz - eps)
slope = np.sqrt(((hx1 - hx0) / (2 * eps)) ** 2 + ((hz1 - hz0) / (2 * eps)) ** 2)
slope = np.clip(slope * 1.25, 0.0, 1.0)

relief = np.clip((sh - hmin) / max(1.0, hmax - hmin), 0.0, 1.0)
rock = smoothstep(0.16, 0.52, slope) * 0.85 + smoothstep(0.55, 0.9, relief) * 0.45
rock += 0.18 * smoothstep(0.02, 0.2, slope)
dirt = smoothstep(0.02, 0.28, 1.0 - slope) * 0.9
grass = smoothstep(0.42, 0.72, 1.0 - relief) * smoothstep(0.0, 0.22, 1.0 - slope)
grass *= 0.45 + 0.55 * smoothstep(-0.35, 0.35, fbm(sxx / 700.0, szz / 700.0, octaves=4, seed=61))
sand = smoothstep(0.0, 0.12, 1.0 - relief) * smoothstep(0.0, 0.18, 1.0 - slope) * 0.7
sand += smoothstep(0.08, 0.02, relief) * 0.6

# The industrial plateau is ash/dirt, not grass
flat_port = 1.0 - smoothstep(650.0, 850.0, np.maximum(np.abs(sxx), np.abs(szz)))
grass *= (1.0 - flat_port)
dirt = dirt * (1.0 - flat_port) + flat_port * 0.7
rock = rock * (1.0 - flat_port * 0.7)

w = np.stack([rock, dirt, grass, sand], axis=-1)
w = np.maximum(w, 0.0)
w = w / np.maximum(w.sum(axis=-1, keepdims=True), 1e-5)
splat = (np.clip(w, 0.0, 1.0) * 255.0).astype(np.uint8)
Image.fromarray(splat, "RGBA").save(os.path.join(OUT, "splat.png"))

# ---------------------------------------------------------------------------
# macro tint
# ---------------------------------------------------------------------------
macro = np.zeros((SPLAT, SPLAT, 3), dtype=np.float32)
r, dweight, g, s = (w[..., 0], w[..., 1], w[..., 2], w[..., 3])
macro[:] = np.array([0.38, 0.36, 0.34], dtype=np.float32)  # rock
macro = macro * (1.0 - dweight[..., None]) + np.array([0.40, 0.36, 0.30], dtype=np.float32) * dweight[..., None]
macro = macro * (1.0 - g[..., None]) + np.array([0.30, 0.33, 0.22], dtype=np.float32) * g[..., None]
macro = macro * (1.0 - s[..., None]) + np.array([0.52, 0.46, 0.38], dtype=np.float32) * s[..., None]
# low-frequency mottling and a dusty plateau tint
mottle = fbm(sxx / 1200.0, szz / 1200.0, octaves=5, seed=71)
macro *= (0.82 + 0.25 * (mottle[..., None] * 0.5 + 0.5))
macro = np.clip(macro * 255.0, 0, 255).astype(np.uint8)
Image.fromarray(macro, "RGB").save(os.path.join(OUT, "macro.png"))

# ---------------------------------------------------------------------------
# copy shared detail textures
# ---------------------------------------------------------------------------
for name in (
    "grass_color.jpg", "grass_normal.jpg", "grass_rough.jpg",
    "dirt_color.jpg", "dirt_normal.jpg", "dirt_rough.jpg",
    "rock_color.jpg", "rock_normal.jpg", "rock_rough.jpg",
    "sand_color.jpg", "sand_normal.jpg", "sand_rough.jpg",
):
    src = os.path.join(TEX_SRC, name)
    if os.path.exists(src):
        shutil.copy2(src, os.path.join(OUT, "textures", name))

meta = {
    "schema": 1,
    "name": "IAC Forgeheart / Anvil Landing 16 km tile",
    "generator": "tools/terrain/generate_iac_16km.py",
    "seed": 20261117,
    "grid": {"width": GRID, "height": GRID, "spacing_m": SPACING},
    "extent_m": EXTENT,
    "heightmap": {
        "file": "height_16km.r16",
        "format": "r16le",
        "min_h": hmin,
        "max_h": hmax,
        "row_order": "north_to_south",
        "origin": "northwest corner",
        "decode": "height_m = min_h + (value / 65535) * (max_h - min_h)",
    },
    "backdrop": {
        "file": "backdrop.r16",
        "grid": BG,
        "extent_m": BG_EXTENT,
        "min_h": bhmin,
        "max_h": bhmax,
    },
    "plateau": {
        "height_m": PLATEAU_H,
        "size_m": [PLATEAU_HX * 2, PLATEAU_HZ * 2],
        "corner_radius_m": PLATEAU_R,
        "port_flat_m": [640, 640],
    },
    "maps": {
        "splat": "splat.png",
        "splat_channels": ["rock", "dirt", "grass", "sand"],
        "macro": "macro.png",
    },
    "features": {
        "north_ridge": "760 m ridged mountain arc behind the market row",
        "east_scarp": "360 m foundry mesa east of the plateau",
        "west_canyon": "115 m deep diagonal canyon west of the plateau",
        "south_hills": "low foundry mesas beyond the cargo road",
    },
    "license": "project-owned procedural heightfield; detail textures from the existing project terrain sample",
}
with open(os.path.join(OUT, "meta.json"), "w", encoding="utf-8") as f:
    json.dump(meta, f, ensure_ascii=False, indent=1)

print("wrote", OUT)
print("height_16km.r16", os.path.getsize(os.path.join(OUT, "height_16km.r16")))
print("backdrop.r16", os.path.getsize(os.path.join(OUT, "backdrop.r16")))
