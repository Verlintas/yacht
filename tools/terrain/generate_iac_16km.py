#!/usr/bin/env python3
"""Generate the IAC Forgeheart / Anvil Landing 16 km authored heightfield.

Outputs (public/iac-landing/terrain):
  height_16km.r16   641 x 641, 16-bit LE, 25 m spacing, 16.384 km square
  backdrop.r16      193 x 193, 16-bit LE, 250 m spacing, 48 km square
  splat.png         512 x 512 RGBA: rock / dirt / grass / sand
  macro.png         512 x 512 RGB low-frequency tint
  meta.json

The port is a 40 m-high engineered terrace cut into a dry, eroded basin:
  * 1.52 x 1.56 km flat terrace, rounded rectangle centered at z=-420
  * 1.2 km authored deck + 40 m apron
  * retaining wall / berm, 220 m graded cut to the basin
  * a 13 m service road descending south from the wall gap into the basin
  * a dry braided riverbed and gullies in the basin
  * north foundry ridge, east scarp, south mesas, west canyon

The heightfield is authored offline. No runtime noise is generated.

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
PLATEAU_H = 36.8
PORT_CZ = -420.0
TERR_HX = 760.0
TERR_HZ = 780.0
TERR_R = 230.0
BASIN_H = 12.0

# Service road: starts on the terrace, exits through the south wall gap at
# z=360, then descends into the basin. The same points are exported for the
# Three.js road mesh.
ROAD_CTRL = [
    (250.0, 330.0),
    (250.0, 402.0),
    (286.0, 505.0),
    (286.0, 620.0),
    (240.0, 742.0),
    (196.0, 862.0),
    (218.0, 984.0),
    (322.0, 1100.0),
    (404.0, 1220.0),
    (426.0, 1320.0),
]
ROAD_WIDTH = 13.0
ROAD_START_H = 36.8
ROAD_END_H = 15.0

# Dry braided river west/southwest of the port.
RIVER_CTRL = [
    (-2900.0, -3000.0),
    (-2350.0, -1900.0),
    (-1900.0, -850.0),
    (-1600.0, 250.0),
    (-1510.0, 1250.0),
    (-1720.0, 2350.0),
    (-2150.0, 3300.0),
    (-2700.0, 3900.0),
]

# Two eroded gullies feeding the basin from the north/east ridge.
GULLY1 = [(900.0, -2400.0), (1080.0, -1450.0), (1240.0, -450.0), (1160.0, 560.0), (980.0, 1500.0)]
GULLY2 = [(-2050.0, -1700.0), (-1650.0, -650.0), (-1380.0, 350.0), (-1250.0, 1200.0)]

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


def polyline_metrics(x, z, points):
    """Distance to a polyline and normalized distance along it."""
    x = np.asarray(x, dtype=np.float64)
    z = np.asarray(z, dtype=np.float64)
    best = np.full(x.shape, np.inf, dtype=np.float64)
    best_frac = np.zeros(x.shape, dtype=np.float64)
    lengths = []
    total = 0.0
    for i in range(len(points) - 1):
        x0, z0 = points[i]
        x1, z1 = points[i + 1]
        length = math.hypot(x1 - x0, z1 - z0)
        lengths.append((x0, z0, x1 - x0, z1 - z0, length, total))
        total += length
    for x0, z0, dx, dz, length, before in lengths:
        inv = 1.0 / (length * length)
        t = np.clip(((x - x0) * dx + (z - z0) * dz) * inv, 0.0, 1.0)
        px = x0 + t * dx
        pz = z0 + t * dz
        d = np.sqrt((x - px) ** 2 + (z - pz) ** 2)
        mask = d < best
        best = np.where(mask, d, best)
        best_frac = np.where(mask, (before + t * length) / total, best_frac)
    return best, best_frac


def natural_height(x, z):
    """Basin, ridges, riverbed and gullies before the port terrace is cut."""
    x = np.asarray(x, dtype=np.float64)
    z = np.asarray(z, dtype=np.float64)

    base = BASIN_H + 8.0 * fbm(x / 2600.0, z / 2600.0, octaves=5, seed=3)
    base += 3.6 * fbm(x / 720.0, z / 720.0, octaves=4, seed=7)
    base += 1.2 * fbm(x / 180.0, z / 180.0, octaves=3, seed=9)

    # North foundry mountain arc.
    north_mask = smoothstep(-1450.0, -4300.0, z)
    north_mask *= 0.55 + 0.45 * smoothstep(-2400.0, 2800.0, x)
    north_ridge = ridged(x / 2300.0, z / 2100.0, octaves=6, seed=13)
    north = 760.0 * np.power(north_ridge, 1.55) * north_mask

    # A nearer north wall behind Anvil Landing.
    near_mask = smoothstep(-1500.0, -3300.0, z)
    near_mask *= 0.55 + 0.45 * smoothstep(-1800.0, 1800.0, x)
    near = 300.0 * ridged(x / 1200.0, z / 1000.0, octaves=5, seed=83) * near_mask

    # East mesa / foundry scarp.
    east_mask = smoothstep(1150.0, 2900.0, x) * smoothstep(2600.0, -2600.0, z)
    east = 360.0 * (0.42 + 0.58 * ridged(x / 1300.0, z / 1100.0, octaves=5, seed=23)) * east_mask

    # West canyon.
    ax, az = -1180.0, 900.0
    bx, bz = -3300.0, -1500.0
    vx, vz = bx - ax, bz - az
    t = np.clip(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz), 0.0, 1.0)
    px, pz = ax + vx * t, az + vz * t
    canyon_d = np.sqrt((x - px) ** 2 + (z - pz) ** 2)
    canyon_w = 260.0 + 160.0 * fbm(x / 900.0, z / 900.0, octaves=3, seed=31)
    canyon_mask = np.exp(-np.power(canyon_d / canyon_w, 4.0))
    canyon_mask *= smoothstep(-2600.0, 1600.0, z) * smoothstep(-4000.0, -1800.0, x)
    canyon = 105.0 * canyon_mask

    # South mesas beyond the service road.
    south_mask = smoothstep(1550.0, 3600.0, z) * smoothstep(-2400.0, 2400.0, x)
    south = 170.0 * ridged(x / 1700.0, z / 1400.0, octaves=5, seed=37) * south_mask

    # West rim: a broken 420 m ridge beyond the canyon, giving the basin a
    # closed horizon instead of an open tan plane behind the terminal.
    west_mask = smoothstep(-1800.0, -4200.0, x) * smoothstep(-3200.0, 3200.0, z)
    west_ridge = ridged(x / 1500.0, z / 1200.0, octaves=6, seed=29)
    west = 570.0 * np.power(west_ridge, 1.35) * west_mask

    h = base + north + near + east + south + west - canyon

    # Dry riverbed (broad wash + narrow braided inner channel).
    river_d, _ = polyline_metrics(x, z, RIVER_CTRL)
    river_w = 112.0 + 58.0 * fbm(x / 620.0, z / 620.0, octaves=3, seed=91)
    river_depth = 12.5 + 7.0 * fbm(x / 260.0, z / 260.0, octaves=3, seed=93)
    river = river_depth * np.exp(-np.power(river_d / river_w, 3.0))
    braid_w = 30.0 + 20.0 * fbm(x / 160.0, z / 160.0, octaves=2, seed=95)
    river += 4.6 * np.exp(-np.power(river_d / braid_w, 4.0))
    h -= river

    # Two eroded gullies feeding the basin.
    for pts, depth, width, seed in (
        (GULLY1, 7.0, 44.0, 101),
        (GULLY2, 6.0, 38.0, 103),
    ):
        gd, _ = polyline_metrics(x, z, pts)
        gw = width * (0.8 + 0.4 * fbm(x / 260.0, z / 260.0, octaves=2, seed=seed))
        h -= depth * np.exp(-np.power(gd / gw, 3.0))

    # Eroded badlands / alluvial fans around the port terrace. These sit
    # outside the 230 m cut and give the basin a broken mid-ground silhouette
    # instead of a smooth tan plane.
    d_terrace = sd_rounded_rect(x, z - PORT_CZ, TERR_HX, TERR_HZ, TERR_R)
    badland_mask = smoothstep(260.0, 900.0, d_terrace) * (1.0 - smoothstep(2900.0, 4300.0, d_terrace))
    badland = ridged(x / 340.0, z / 300.0, octaves=4, seed=113)
    h += 24.0 * np.power(badland, 2.0) * badland_mask
    h -= 7.0 * np.exp(-np.power((d_terrace - 360.0) / 120.0, 2.0)) * badland_mask
    # A low southern escarpment the service road contours around.
    south_step_mask = smoothstep(520.0, 1250.0, z) * smoothstep(2600.0, 3200.0, z)
    south_step_mask *= 0.55 + 0.45 * fbm(x / 780.0, z / 780.0, octaves=3, seed=117)
    h += 22.0 * south_step_mask

    # Dry wind-erosion ripples in the basin. Keep them low-frequency enough for
    # the 25 m runtime grid.
    h += 1.1 * fbm(x / 95.0, z / 95.0, octaves=3, seed=107) * smoothstep(0.0, 180.0, river_d)
    return h


def terrain_height(x, z):
    """Region-local height in metres, +Y up. x east, z south (Three.js)."""
    x = np.asarray(x, dtype=np.float64)
    z = np.asarray(z, dtype=np.float64)

    # Terrace footprint centered at z=-420; the deck + 40 m apron are inside.
    d = sd_rounded_rect(x, z - PORT_CZ, TERR_HX, TERR_HZ, TERR_R)
    cut = 0.58 * smoothstep(0.0, 34.0, d) + 0.42 * smoothstep(34.0, 200.0, d)
    berm = 2.4 * np.exp(-np.power((d - 17.0) / 28.0, 2.0))
    berm *= 0.62 + 0.38 * fbm(x / 190.0, z / 190.0, octaves=3, seed=41)
    h = natural_height(x, z) + berm * smoothstep(0.0, 35.0, d)
    h = h * cut + PLATEAU_H * (1.0 - cut)
    # A machine-cut bench / drainage shelf halfway down the retaining slope.
    bench = 1.9 * (smoothstep(62.0, 80.0, d) - smoothstep(96.0, 120.0, d))
    bench *= 0.55 + 0.45 * fbm(x / 210.0, z / 210.0, octaves=2, seed=43)
    h += bench * smoothstep(0.0, 40.0, d)
    # Drainage ditch at the foot of the engineered berm.
    h -= 1.3 * np.exp(-np.power((d - 52.0) / 13.0, 2.0)) * smoothstep(0.0, 30.0, d)

    # The service road is a cut/fill bench through the terrace edge. The same
    # polyline is used by the Three.js road mesh.
    road_d, road_frac = polyline_metrics(x, z, ROAD_CTRL)
    road_h = ROAD_START_H - (ROAD_START_H - ROAD_END_H) * smoothstep(0.0, 1.0, road_frac)
    road_mask = 1.0 - smoothstep(7.0, 34.0, road_d)
    h = h * (1.0 - road_mask) + road_h * road_mask

    # A small berm on the downhill shoulder of the road.
    h += 0.55 * np.exp(-np.power((road_d - 22.0) / 7.0, 2.0)) * smoothstep(0.05, 0.25, road_frac)
    return h


# ---------------------------------------------------------------------------
# heightfields
# ---------------------------------------------------------------------------
print("building 16 km heightfield", GRID, "x", GRID)
coords = np.linspace(-HALF, HALF, GRID, dtype=np.float64)
xx, zz = np.meshgrid(coords, coords)
height = terrain_height(xx, zz)

# Small deterministic roughness on the cut slope, not on the terrace, apron,
# deck or road.
d = sd_rounded_rect(xx, zz - PORT_CZ, TERR_HX, TERR_HZ, TERR_R)
road_d, _ = polyline_metrics(xx, zz, ROAD_CTRL)
edge_band = (d > 4.0) & (d < 320.0) & (road_d > 36.0)
rough = 1.35 * fbm(xx / 90.0, zz / 90.0, octaves=3, seed=53) * edge_band
height = height + rough

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

eps = 32.0
hx1 = terrain_height(sxx + eps, szz)
hx0 = terrain_height(sxx - eps, szz)
hz1 = terrain_height(sxx, szz + eps)
hz0 = terrain_height(sxx, szz - eps)
slope = np.sqrt(((hx1 - hx0) / (2 * eps)) ** 2 + ((hz1 - hz0) / (2 * eps)) ** 2)
slope = np.clip(slope * 1.3, 0.0, 1.0)

relief = np.clip((sh - hmin) / max(1.0, hmax - hmin), 0.0, 1.0)
d_splat = sd_rounded_rect(sxx, szz - PORT_CZ, TERR_HX, TERR_HZ, TERR_R)
terrace = 1.0 - smoothstep(-8.0, 52.0, d_splat)
river_d, _ = polyline_metrics(sxx, szz, RIVER_CTRL)
road_d, _ = polyline_metrics(sxx, szz, ROAD_CTRL)
river_near = 1.0 - smoothstep(55.0, 150.0, river_d)
road_near = 1.0 - smoothstep(9.0, 34.0, road_d)
gully_near = np.maximum(
    1.0 - smoothstep(30.0, 90.0, polyline_metrics(sxx, szz, GULLY1)[0]),
    1.0 - smoothstep(28.0, 80.0, polyline_metrics(sxx, szz, GULLY2)[0]),
)

rock = smoothstep(0.11, 0.42, slope) * 1.0 + smoothstep(0.42, 0.82, relief) * 0.62
rock += 0.24 * smoothstep(0.015, 0.18, slope)
dirt = smoothstep(0.02, 0.28, 1.0 - slope) * 0.92
grass = smoothstep(0.34, 0.68, 1.0 - relief) * smoothstep(0.0, 0.22, 1.0 - slope)
grass *= 0.35 + 0.65 * smoothstep(-0.35, 0.35, fbm(sxx / 720.0, szz / 720.0, octaves=4, seed=61))
sand = smoothstep(0.0, 0.12, 1.0 - relief) * smoothstep(0.0, 0.18, 1.0 - slope) * 0.7
sand += smoothstep(0.08, 0.02, relief) * 0.6

# Terrace: compacted ash / gravel, no grass or dune sand. The authored apron
# mesh lays concrete over the deck ring.
grass *= (1.0 - terrace)
sand *= (1.0 - terrace)
dirt = dirt * (1.0 - terrace) + terrace * 0.78
rock = rock * (1.0 - terrace * 0.72)

# Riverbed and gully gravel.
sand = np.maximum(sand, river_near * 0.94)
dirt = dirt * (1.0 - river_near * 0.62) + river_near * 0.18
grass *= (1.0 - river_near * 0.92)
rock *= (1.0 - river_near * 0.48)
sand = np.maximum(sand, gully_near * 0.42)
dirt = np.maximum(dirt, road_near * 0.35)
rock = np.maximum(rock, road_near * 0.15)
# Dark eroded basalt fields in the basin.
basalt = smoothstep(0.18, 0.58, fbm(sxx / 470.0, szz / 470.0, octaves=4, seed=131))
basalt *= smoothstep(260.0, 520.0, d_splat) * (1.0 - terrace)
rock = np.maximum(rock, basalt * 0.7)
dirt *= 1.0 - basalt * 0.25

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
macro[:] = np.array([0.26, 0.24, 0.23], dtype=np.float32)  # basalt
macro = macro * (1.0 - dweight[..., None]) + np.array([0.45, 0.37, 0.27], dtype=np.float32) * dweight[..., None]
macro = macro * (1.0 - g[..., None]) + np.array([0.28, 0.30, 0.20], dtype=np.float32) * g[..., None]
macro = macro * (1.0 - s[..., None]) + np.array([0.63, 0.53, 0.40], dtype=np.float32) * s[..., None]
macro = macro * (1.0 - terrace[..., None]) + np.array([0.36, 0.33, 0.29], dtype=np.float32) * terrace[..., None]
mottle = fbm(sxx / 1200.0, szz / 1200.0, octaves=5, seed=71)
macro *= (0.68 + 0.55 * (mottle[..., None] * 0.5 + 0.5))
# Broad erosion streaks / wash fan tinting.
streak = fbm(sxx / 2400.0, szz / 650.0, octaves=4, seed=137)
macro *= (0.88 + 0.24 * streak[..., None])
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
    "schema": 2,
    "name": "IAC Forgeheart / Anvil Landing 16 km authored terrace",
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
        "center_z": PORT_CZ,
        "size_m": [TERR_HX * 2, TERR_HZ * 2],
        "corner_radius_m": TERR_R,
        "apron_m": 40,
        "cut_slope_m": 200,
    },
    "road": {
        "width_m": ROAD_WIDTH,
        "start_h": ROAD_START_H,
        "end_h": ROAD_END_H,
        "points": [[float(x), float(z)] for x, z in ROAD_CTRL],
    },
    "maps": {
        "splat": "splat.png",
        "splat_channels": ["rock", "dirt", "grass", "sand"],
        "macro": "macro.png",
    },
    "features": {
        "terrace": "engineered 1.52 x 1.56 km port terrace cut into the basin",
        "cut": "retaining wall/berm and 200 m graded cut around the terrace",
        "road": "13 m service road descending from the south wall gap into the basin",
        "riverbed": "dry braided river/wash west of the terrace",
        "gullies": "two eroded gullies feeding the basin",
        "ridges": "760 m north foundry ridge, east scarp, south mesas, 570 m west rim",
    },
    "license": "project-owned procedural heightfield; detail textures from the existing project terrain sample",
}
with open(os.path.join(OUT, "meta.json"), "w", encoding="utf-8") as f:
    json.dump(meta, f, ensure_ascii=False, indent=1)

print("wrote", OUT)
print("height_16km.r16", os.path.getsize(os.path.join(OUT, "height_16km.r16")))
print("backdrop.r16", os.path.getsize(os.path.join(OUT, "backdrop.r16")))
