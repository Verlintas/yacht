"""Subtle final grade for the Anvil Landing renders: contrast, warmth, vignette, sharpen."""
from PIL import Image, ImageFilter
import numpy as np, os, shutil

BASE = "/Users/apple/.local/share/opencode/worktree/e0f2de/kitbash-port/docs/kitbash-port/renders"
RAW = os.path.join(BASE, "raw")
os.makedirs(RAW, exist_ok=True)
files = ["01_wide_port.png", "02_pad_closeup.png", "03_elevated_city.png"]
for f in files:
    src = os.path.join(BASE, f)
    raw = os.path.join(RAW, f)
    if not os.path.exists(raw):
        continue
    im = Image.open(raw).convert("RGB")
    a = np.asarray(im).astype(np.float32) / 255.0
    lum = (0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2])[..., None]
    # gentle S-curve / contrast
    a = np.clip((a - 0.5) * 1.055 + 0.5, 0, 1)
    # saturation
    gray = lum.copy()
    a = np.clip(gray + (a - gray) * 1.09, 0, 1)
    # cool shadows, warm highlights
    a += (1 - lum) * np.array([0.004, 0.010, 0.016], np.float32)
    a += lum * np.array([0.013, 0.004, -0.008], np.float32)
    a = np.clip(a, 0, 1)
    # vignette
    h, w = a.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    nx = (xx - w / 2) / (w / 2); ny = (yy - h / 2) / (h / 2)
    r = np.sqrt(nx * nx + ny * ny) / 1.414
    t = np.clip((r - 0.45) / 0.55, 0, 1)
    v = 1.0 - 0.16 * (t * t * (3 - 2 * t))
    a *= v[..., None]
    out = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
    out = out.filter(ImageFilter.UnsharpMask(radius=1.4, percent=38, threshold=3))
    out.save(src, quality=95)
    print("graded", f, out.size)
