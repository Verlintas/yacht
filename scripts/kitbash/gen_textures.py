"""Generate self-contained PBR textures + dusk sky for Anvil Landing.
All procedural / deterministic, private sample. 2048px terrain & concrete.
"""
import numpy as np
import math
from PIL import Image, ImageDraw, ImageFilter
import os

OUT = "/Users/apple/.local/share/opencode/worktree/e0f2de/kitbash-port/docs/kitbash-port/textures"
os.makedirs(OUT, exist_ok=True)

def fractal(size, octaves=6, base=4, persistence=0.55, lacunarity=2.0, seed=0):
    r = np.random.default_rng(seed)
    out = np.zeros((size, size), np.float32)
    amp = 1.0; total = 0.0
    for o in range(octaves):
        res = max(2, int(base * (lacunarity ** o)))
        g = r.random((res, res)).astype(np.float32)
        ys = np.linspace(0, res - 1, size); xs = np.linspace(0, res - 1, size)
        y0 = np.floor(ys).astype(int); x0 = np.floor(xs).astype(int)
        y1 = np.minimum(y0 + 1, res - 1); x1 = np.minimum(x0 + 1, res - 1)
        fy = (ys - y0)[:, None]; fx = (xs - x0)[None, :]
        g00 = g[np.ix_(y0, x0)]; g01 = g[np.ix_(y0, x1)]
        g10 = g[np.ix_(y1, x0)]; g11 = g[np.ix_(y1, x1)]
        up = (g00 * (1 - fx) + g01 * fx) * (1 - fy) + (g10 * (1 - fx) + g11 * fx) * fy
        out += up * amp; total += amp; amp *= persistence
    out /= total
    return (out - out.min()) / (out.max() - out.min() + 1e-6)

def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)

# ================================================================ terrain
S = 2048
n1 = fractal(S, 7, 4, 0.55, 2.0, 11)
n2 = fractal(S, 6, 8, 0.5, 2.2, 22)
n3 = fractal(S, 5, 32, 0.55, 2.0, 33)
fine = fractal(S, 4, 256, 0.5, 2.0, 44)

grass = np.array([0.135, 0.125, 0.070], np.float32)
grass2 = np.array([0.235, 0.205, 0.115], np.float32)
rock = np.array([0.175, 0.165, 0.150], np.float32)
rock2 = np.array([0.320, 0.300, 0.265], np.float32)
soil = np.array([0.105, 0.080, 0.060], np.float32)
dust = np.array([0.310, 0.255, 0.165], np.float32)

veg = smoothstep(0.40, 0.68, n1 * 0.7 + n2 * 0.3)
rockmask = smoothstep(0.50, 0.76, n2 * 0.65 + n3 * 0.35)
col = grass[None, None, :] + (grass2 - grass)[None, None, :] * n3[..., None]
col = col * (1 - rockmask[..., None]) + (rock + (rock2 - rock) * fine[..., None]) * rockmask[..., None]
col = col * (0.70 + 0.45 * n2[..., None])
soil_mask = smoothstep(0.32, 0.8, n1)[..., None]
col = col * (1 - 0.45 * soil_mask) + soil * (0.45 * soil_mask)
col = col * (0.86 + 0.22 * fine[..., None])
col = col * (1 - 0.22 * veg[..., None]) + dust * (0.22 * veg[..., None])
# dry wash streaks
col *= (0.92 + 0.16 * n3[..., None])
col = np.clip(col, 0, 1)
Image.fromarray((col ** (1 / 2.2) * 255).astype(np.uint8)).save(f"{OUT}/terrain_albedo.jpg", quality=94)

height = (n1 * 0.40 + n2 * 0.25 + n3 * 0.22 + fine * 0.13).astype(np.float32)
height = (height - height.mean()) / (height.std() + 1e-6)
strength = 2.6
dx = np.gradient(height, axis=1) * strength
dy = np.gradient(height, axis=0) * strength
nz = np.ones_like(height); ln = np.sqrt(dx*dx + dy*dy + nz*nz)
normal = np.stack([-dx/ln * 0.5 + 0.5, -dy/ln * 0.5 + 0.5, nz/ln * 0.5 + 0.5], axis=-1)
Image.fromarray((normal * 255).astype(np.uint8)).save(f"{OUT}/terrain_normal.png")
rough = 0.84 + 0.12 * n3 + 0.04 * fine
Image.fromarray((np.clip(rough, 0, 1) * 255).astype(np.uint8)).save(f"{OUT}/terrain_roughness.jpg", quality=92)

# ================================================================ concrete
S = 2048
base = fractal(S, 6, 8, 0.55, 2.0, 101)
stain = fractal(S, 4, 3, 0.6, 2.0, 102)
agg = fractal(S, 3, 512, 0.5, 2.0, 103)
conc = np.array([0.255, 0.250, 0.235], np.float32)[None, None, :] * (0.8 + 0.4 * base[..., None])
conc *= (0.85 + 0.17 * agg[..., None])
# stains
conc *= (1.0 - 0.35 * smoothstep(0.45, 0.75, stain)[..., None])
# faint tire paths
yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
tire = np.exp(-((yy - S * 0.22) / (S * 0.035)) ** 2) + np.exp(-((yy - S * 0.72) / (S * 0.028)) ** 2)
conc *= (1.0 - 0.10 * tire[..., None])

# slab joints every quarter
height = np.zeros((S, S), np.float32)
for k in range(1, 4):
    c = k * S // 4
    line = np.zeros((S, S), np.float32)
    line[:, max(0, c-4):c+4] = 1.0
    line[max(0, c-4):c+4, :] = 1.0
    conc *= (1.0 - 0.38 * line[..., None])
    height -= line * 1.2
# tiny expansion joint dark line
for k in range(1, 8):
    c = k * S // 8
    line = np.zeros((S, S), np.float32)
    line[:, max(0, c-1):c+1] = 1.0
    line[max(0, c-1):c+1, :] = 1.0
    conc *= (1.0 - 0.10 * line[..., None])

# cracks (drawn on PIL, merged as dark + height grooves)
crack_im = Image.new('L', (S, S), 0)
dr = ImageDraw.Draw(crack_im)
rng = np.random.default_rng(9)
for i in range(14):
    x = rng.uniform(0, S); y = rng.uniform(0, S)
    pts = [(x, y)]
    ang = rng.uniform(0, 6.28)
    for j in range(rng.integers(8, 24)):
        ang += rng.uniform(-0.5, 0.5)
        x += math.cos(ang) * rng.uniform(8, 28)
        y += math.sin(ang) * rng.uniform(8, 28)
        pts.append((x, y))
    dr.line(pts, fill=255, width=rng.integers(1, 3))
crack = np.asarray(crack_im.filter(ImageFilter.GaussianBlur(0.6)), np.float32) / 255
conc *= (1.0 - 0.45 * crack[..., None])
height -= crack * 0.8

agg_h = (agg - 0.5) * 0.5 + (base - 0.5) * 0.25
height += agg_h
dy, dx = np.gradient(height, axis=0), np.gradient(height, axis=1)
nstr = 1.4
ln = np.sqrt(dx*dx*nstr*nstr + dy*dy*nstr*nstr + 1.0)
normal = np.stack([-dx*nstr/ln*0.5+0.5, -dy*nstr/ln*0.5+0.5, 1.0/ln*0.5+0.5], axis=-1)
Image.fromarray((np.clip(normal, 0, 1) * 255).astype(np.uint8)).save(f"{OUT}/concrete_normal.png")
Image.fromarray((np.clip(conc, 0, 1) ** (1/2.2) * 255).astype(np.uint8)).save(f"{OUT}/concrete_albedo.jpg", quality=94)
rough = 0.72 + 0.16 * base - 0.10 * smoothstep(0.45, 0.75, stain)
rough = np.clip(rough, 0, 1)
Image.fromarray((rough * 255).astype(np.uint8)).save(f"{OUT}/concrete_roughness.jpg", quality=92)

# ================================================================ hazard + paint
H = 1024
yy, xx = np.mgrid[0:H, 0:H]
stripe = (((xx + yy) // 110) % 2).astype(np.float32)
warn = np.array([0.82, 0.47, 0.045], np.float32)
blk = np.array([0.028, 0.03, 0.033], np.float32)
haz = warn[None, None, :] * stripe[..., None] + blk[None, None, :] * (1 - stripe[..., None])
grime = fractal(H, 4, 16, 0.5, 2.0, 77)
haz *= (0.65 + 0.35 * grime[..., None])
Image.fromarray((haz ** (1/2.2) * 255).astype(np.uint8)).save(f"{OUT}/hazard_stripes.jpg", quality=93)

paint = fractal(1024, 6, 6, 0.55, 2.0, 99)
paint = smoothstep(0.3, 0.7, paint) * 0.7 + 0.3
Image.fromarray((paint * 255).astype(np.uint8)).save(f"{OUT}/paint_wear.jpg", quality=92)

# ================================================================ dramatic late-afternoon sky (equirect)
W, H = 2048, 1024
u = np.linspace(0, 1, W, endpoint=False)[None, :]
v = np.linspace(0, 1, H, endpoint=False)[:, None]
az = (u - 0.5) * 2 * np.pi + math.radians(200)
el = (v - 0.5) * np.pi
dx = np.cos(el) * np.sin(az)
dy = np.cos(el) * np.cos(az)
dz = np.sin(el) * np.ones_like(dx)
el_deg = np.degrees(np.arcsin(np.clip(dz, -1, 1)))

stops_el = np.array([-10, 0, 3, 8, 15, 30, 60, 90], np.float32)
stops_col = np.array([
    [0.26, 0.23, 0.22],
    [0.62, 0.48, 0.38],
    [0.48, 0.43, 0.42],
    [0.25, 0.37, 0.56],
    [0.115, 0.235, 0.455],
    [0.055, 0.125, 0.300],
    [0.022, 0.055, 0.155],
    [0.012, 0.032, 0.095],
], np.float32)
sky = np.stack([np.interp(el_deg, stops_el, stops_col[:, c]) for c in range(3)], axis=-1).astype(np.float32)

# soft sun glow (no hard disc: keeps shadows from the sun lamp unambiguous)
sun_az = math.radians(238); sun_el = math.radians(20)
sx = math.cos(sun_el) * math.sin(sun_az); sy = math.cos(sun_el) * math.cos(sun_az); sz = math.sin(sun_el)
dot = np.clip(dx * sx + dy * sy + dz * sz, -1, 1)
ang = np.arccos(dot)
glow = np.exp(-(ang ** 2) / (2 * math.radians(16) ** 2))
sky += np.array([1.0, 0.55, 0.25], np.float32)[None, None, :] * glow[..., None] * 0.50
core = np.exp(-(ang ** 2) / (2 * math.radians(2.2) ** 2))
sky += np.array([1.0, 0.85, 0.62], np.float32)[None, None, :] * core[..., None] * 0.85

def upscale(arr, w, h):
    im = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8))
    return np.asarray(im.resize((w, h), Image.BICUBIC), np.float32) / 255.0

# seamless, higher-coverage cumulus deck
cn_half = fractal(1024, 7, 5, 0.55, 2.05, 501)
cn = np.concatenate([cn_half, cn_half[:, ::-1]], axis=1)
cn = upscale(cn, W, H)
warp_half = fractal(512, 3, 4, 0.6, 2.0, 502)
warp = np.concatenate([warp_half, warp_half[:, ::-1]], axis=1)
warp = upscale(warp, W, H)
band = np.exp(-((el_deg - 10.0) / 7.0) ** 2) * 0.95 + np.exp(-((el_deg - 24.0) / 11.0) ** 2) * 0.55
cloud = smoothstep(0.43, 0.58, cn * 0.82 + warp * 0.18) * np.clip(band, 0, 1)
cloud *= (el_deg > 1.0)
# lit / shadow side of clouds
cn2 = upscale(fractal(1024, 5, 6, 0.55, 2.0, 503), W, H)
lit = smoothstep(0.35, 0.7, cn2 * 0.7 + glow[..., None].squeeze() * 0.3) if False else smoothstep(0.35, 0.7, cn2)
warmlit = np.array([0.92, 0.82, 0.70], np.float32)[None, None, :]
shadow = np.array([0.24, 0.30, 0.40], np.float32)[None, None, :]
cloudcol = shadow + (warmlit - shadow) * lit[..., None]
cloudcol = cloudcol * (0.75 + 0.55 * glow[..., None])
sky = sky * (1 - cloud[..., None] * 0.88) + cloudcol * (cloud[..., None] * 0.88)

# high cirrus
cn3 = upscale(fractal(1024, 5, 4, 0.6, 2.1, 511), W, H)
cirrus = smoothstep(0.50, 0.74, cn3) * np.exp(-((el_deg - 38.0) / 18.0) ** 2) * 0.28
sky = sky * (1 - cirrus[..., None]) + np.array([0.50, 0.56, 0.65], np.float32)[None, None, :] * cirrus[..., None]

sky = np.clip(sky, 0, 1.5)
Image.fromarray((np.clip(sky[::-1], 0, 1) ** (1/2.2) * 255).astype(np.uint8)).save(f"{OUT}/dusk_sky.jpg", quality=94)
print("done")
