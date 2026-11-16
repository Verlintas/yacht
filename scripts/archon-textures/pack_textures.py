#!/usr/bin/env python3
"""Build the 2K Archon texture maps used by the optimized GLB.

Inputs (ARCHON work dir, default <repo>/work):
  archon_ao_2k.png            - Cycles AO bake (see bake_ao.py)
  baseColor_1.png             - source albedo (2K)
  normal_1.png                - source normal (2K)
  metallicRoughness_1.png     - source ORM (2K; G=roughness, B=metal)
  emissive_1.png              - source emissive (2K)

Outputs: <work>/tex/final/
  albedo_final.png            - albedo x1.5 + very light unsharp (readability only)
  normal_final.png            - untouched normal copy
  orm_final.png               - R=AO/cavity, G=original roughness, B=authored metal
  emissive_final.png          - authored red glow boosted + cyan window lights from albedo

Honest limitations:
  * UV0 is reused ~5.7x, so a per-surface AO bake cannot be represented in UV0.
    The bake is kept only as a low-weight large-scale cue, multiplied by a
    normal-map cavity. True AO would need UV1 + an extra AO texture or a re-UV.
  * Albedo x1.5 is a display/readability lift, not new detail. It is intended
    to offset the darkening from AO/metalness; the median is still ~5-16/255.
"""
from PIL import Image, ImageFilter
import numpy as np
import os
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
WORK = Path(os.environ.get("ARCHON_WORK", REPO / "work"))
TEX = WORK / "tex"
OUT = TEX / "final"
OUT.mkdir(parents=True, exist_ok=True)


def u8(x):
    return (np.clip(x, 0, 1) * 255.0 + 0.5).astype(np.uint8)


def srgb_to_linear(x):
    return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)


albedo = np.asarray(Image.open(TEX / "baseColor_1.png").convert("RGB")).astype(np.float32) / 255.0
normal = np.asarray(Image.open(TEX / "normal_1.png").convert("RGB")).astype(np.float32) / 255.0
orm = np.asarray(Image.open(TEX / "metallicRoughness_1.png").convert("RGB")).astype(np.float32) / 255.0
emissive = np.asarray(Image.open(TEX / "emissive_1.png").convert("RGB")).astype(np.float32) / 255.0
bake = np.asarray(Image.open(TEX / "archon_ao_2k.png").convert("L")).astype(np.float32) / 255.0

# ---------- cavity from normal map (UV-consistent, no UV1 needed) ----------
n = normal * 2.0 - 1.0
n /= np.maximum(np.linalg.norm(n, axis=2, keepdims=True), 1e-6)
nx, ny = n[..., 0], n[..., 1]
gx = (np.roll(nx, -1, axis=1) - np.roll(nx, 1, axis=1)) * 0.5
gy = (np.roll(nx, -1, axis=0) - np.roll(nx, 1, axis=0)) * 0.5
hx = (np.roll(ny, -1, axis=1) - np.roll(ny, 1, axis=1)) * 0.5
hy = (np.roll(ny, -1, axis=0) - np.roll(ny, 1, axis=0)) * 0.5
mag = np.sqrt(gx * gx + gy * gy + hx * hx + hy * hy)
lo, hi = np.percentile(mag, [1.0, 99.0])
edge = np.clip((mag - lo) / max(hi - lo, 1e-6), 0, 1)
edge = np.asarray(Image.fromarray(u8(edge)).filter(ImageFilter.GaussianBlur(1.4))).astype(np.float32) / 255.0
cavity = np.clip(1.0 - 0.48 * edge, 0, 1)  # 1.0 flat, ~0.52 deep crease

# ---------- AO: low-weight geometry bake + normal cavity ----------
bake_soft = np.clip(0.58 + 0.42 * bake, 0, 1)
bake_soft = np.asarray(
    Image.fromarray(u8(bake_soft)).filter(ImageFilter.GaussianBlur(2.0))
).astype(np.float32) / 255.0
ao = np.clip(bake_soft * (0.72 + 0.28 * cavity), 0, 1)

# ---------- metalness ----------
mx = albedo.max(axis=2)
mn = albedo.min(axis=2)
sat = (mx - mn) / np.maximum(mx, 1e-5)
lum = 0.2126 * albedo[..., 0] + 0.7152 * albedo[..., 1] + 0.0722 * albedo[..., 2]
paint = np.clip(sat * np.clip(mx / 0.16, 0, 1) * 1.6, 0, 1)
t = np.clip((lum - 0.02) / 0.14, 0, 1)
smooth = t * t * (3 - 2 * t)
metal = (0.18 + 0.62 * smooth) * (1.0 - 0.75 * paint)
metal = np.clip(metal, 0.04, 0.86)
metal = np.asarray(
    Image.fromarray(u8(metal)).filter(ImageFilter.GaussianBlur(0.7))
).astype(np.float32) / 255.0

# ---------- albedo readability lift (no new detail) ----------
lifted = np.clip(albedo * 1.5, 0, 1)
blurred = np.asarray(
    Image.fromarray(u8(lifted)).filter(ImageFilter.GaussianBlur(0.8))
).astype(np.float32) / 255.0
albedo_final = np.clip(lifted + 0.15 * (lifted - blurred), 0, 1)

# ---------- emissive ----------
em_lin = srgb_to_linear(emissive)
alb_lin = srgb_to_linear(albedo)
red = em_lin * 2.4
cyan_mask = (
    (albedo[..., 2] > albedo[..., 0] * 1.35)
    & (albedo[..., 1] > albedo[..., 0] * 1.20)
    & (mx > 0.10)
).astype(np.float32)
cyan_mask = np.asarray(
    Image.fromarray(u8(cyan_mask * 0.85)).filter(ImageFilter.GaussianBlur(0.8))
).astype(np.float32) / 255.0
cyan = alb_lin * cyan_mask[..., None] * 2.2
white_mask = ((lum > 0.34) & (sat < 0.22)).astype(np.float32)
white_mask = np.asarray(
    Image.fromarray(u8(white_mask)).filter(ImageFilter.GaussianBlur(0.6))
).astype(np.float32) / 255.0
white = alb_lin * white_mask[..., None] * 1.4
em_final = np.clip(np.maximum.reduce([red, cyan, white]), 0, 1)

# ---------- save ----------
Image.fromarray(u8(albedo_final)).save(OUT / "albedo_final.png", optimize=True)
Image.fromarray(u8(normal)).save(OUT / "normal_final.png", optimize=True)
Image.fromarray(u8(em_final)).save(OUT / "emissive_final.png", optimize=True)
Image.fromarray(u8(np.stack([ao, orm[..., 1], metal], axis=-1))).save(OUT / "orm_final.png", optimize=True)

# previews
for name in ["orm_final", "emissive_final"]:
    Image.open(OUT / f"{name}.png").convert("RGB").resize((512, 512), Image.LANCZOS).save(
        OUT / f"{name}_preview.png"
    )

print("AO  mean/min/max", round(float(ao.mean()), 3), round(float(ao.min()), 3), round(float(ao.max()), 3))
print("metal p1/p50/p99", np.percentile(metal, [1, 50, 99]))
print("rough p1/p50/p99", np.percentile(orm[..., 1], [1, 50, 99]))
print("albedo mean (sRGB)", round(float(albedo_final.mean() * 255), 2))
print("emissive >16/255", round(float((em_final.max(axis=2) > 16 / 255).mean() * 100), 3), "%")
for f in sorted(OUT.glob("*_final.png")):
    print(f.name, f.stat().st_size)
