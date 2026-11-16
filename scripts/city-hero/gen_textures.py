"""Generate/copy tiling surfaces for the city sample (Blender textures)."""
import os, shutil, numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = "/private/tmp/city-hero/tex"
SRC = "/Users/apple/.local/share/opencode/worktree/e0f2de/kitbash-port/docs/kitbash-port/textures"
PUB = "/Users/apple/.local/share/opencode/worktree/e0f2de/city-hero-sample/public/terrain-sample/textures"
os.makedirs(ROOT, exist_ok=True)

def copy(src, dst):
    if os.path.exists(src):
        shutil.copy2(src, os.path.join(ROOT, dst))
        print("copy", dst)

# project-owned / generated concrete from the previous sample
copy(f"{SRC}/concrete_albedo.jpg", "concrete_albedo.jpg")
copy(f"{SRC}/concrete_normal.png", "concrete_normal.png")
copy(f"{SRC}/concrete_roughness.jpg", "concrete_rough.jpg")
copy(f"{SRC}/hazard_stripes.jpg", "hazard.jpg")

# terrain surfaces (CC0, already in the project sample)
copy(f"{PUB}/rock_color.jpg", "terrain_albedo.jpg")
copy(f"{PUB}/rock_normal.jpg", "terrain_normal.png")
copy(f"{PUB}/rock_rough.jpg", "terrain_rough.jpg")

def fft_noise(n, scale, rng, aniso=1.0):
    """Tileable smooth noise via spectral filtering."""
    w = rng.normal(size=(n, n))
    fy = np.fft.fftfreq(n)[:, None]
    fx = np.fft.fftfreq(n)[None, :]
    f = np.sqrt((fx * aniso) ** 2 + fy ** 2)
    filt = np.exp(-(f * scale) ** 2)
    out = np.real(np.fft.ifft2(np.fft.fft2(w) * filt))
    out -= out.min(); out /= max(out.max(), 1e-6)
    return out

def normal_from_height(h, strength=1.0):
    gx, gy = np.gradient(h * strength)
    nx = -gx; ny = -gy; nz = np.ones_like(h)
    l = np.sqrt(nx*nx + ny*ny + nz*nz)
    nx/=l; ny/=l; nz/=l
    out = np.stack([(nx*0.5+0.5), (ny*0.5+0.5), (nz*0.5+0.5)], axis=-1)
    return (out*255).clip(0,255).astype(np.uint8)

N = 2048
rng = np.random.default_rng(7)
# asphalt: coarse aggregate, fine grain, subtle wear patches
h = np.zeros((N,N), np.float32)
for s, a in [(1.5,0.55),(6,0.26),(22,0.13),(70,0.06)]:
    h += fft_noise(N, s, rng) * a
h -= h.min(); h /= h.max()
# aggregate stones
rng2 = np.random.default_rng(19)
coords = rng2.integers(0, N, size=(90000,2))
stones = np.zeros((N,N), np.float32)
for x,y in coords:
    r = rng2.integers(1,3)
    stones[max(0,x-r):x+r+1, max(0,y-r):y+r+1] += rng2.uniform(0.4,1.0)
stones = np.clip(stones,0,1)
base = 0.11 + h*0.10
base = base + stones*0.16
# oil / tire stains
stain = fft_noise(N, 18, rng, aniso=0.5)
base = base * (1.0 - 0.18 * (stain**2))
rgb = np.stack([base*1.00, base*1.01, base*1.04], -1)
Image.fromarray((rgb.clip(0,1)*255).astype(np.uint8)).save(f"{ROOT}/asphalt_albedo.jpg", quality=92)
rough = (0.68 + h*0.18 + stones*0.10).clip(0,1)
Image.fromarray((rough*255).astype(np.uint8)).save(f"{ROOT}/asphalt_rough.jpg", quality=90)
nh = (h*0.65 + stones*0.35)
Image.fromarray(normal_from_height(nh, 2.0)).save(f"{ROOT}/asphalt_normal.png")
print("generated asphalt", N)
