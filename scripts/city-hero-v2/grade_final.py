"""Grade the final raw Cycles PNGs into public JPGs for v3.

Run after render_v2.py:
  python3 scripts/city-hero-v2/grade_final.py
"""
import os
import numpy as np
from PIL import Image, ImageFilter

RAW = "/private/tmp/city-hero-v2/renders_raw"
OUT = "/Users/apple/.local/share/opencode/worktree/e0f2de/city-hero-v2/public/city-hero/renders"
os.makedirs(OUT, exist_ok=True)

MAP = [
    ("final_termwide.png", "01_port_wide.jpg"),
    ("final_street.png", "02_street_canyon.jpg"),
    ("final_pad.png", "03_pad_closeup.jpg"),
    ("final_aerial_low.png", "04_dense_aerial.jpg"),
    ("final_aerial.png", "05_platform_aerial.jpg"),
    ("final_detail.png", "06_terminal_detail.jpg"),
]

def grade(src, dst):
    im = Image.open(src).convert("RGB")
    a = np.asarray(im).astype(np.float32) / 255.0
    a = np.clip((a - 0.5) * 1.12 + 0.5, 0, 1)
    lum = 0.2126*a[:, :, 0] + 0.7152*a[:, :, 1] + 0.0722*a[:, :, 2]
    a = np.clip(lum[:, :, None] + (a - lum[:, :, None]) * 1.16, 0, 1)
    sh = (1 - np.clip(lum * 2.0, 0, 1))[:, :, None]
    hi = np.clip((lum - 0.45) * 2.0, 0, 1)[:, :, None]
    a = a + sh * np.array([0.004, 0.007, 0.014], dtype=np.float32) \
          + hi * np.array([0.019, 0.004, -0.010], dtype=np.float32)
    h, w, _ = a.shape
    y = np.linspace(0, 1, h, dtype=np.float32)[:, None, None]
    a = a + np.clip(1 - y*1.6, 0, 1) * np.array([-0.003, 0.005, 0.016], dtype=np.float32)
    yy, xx = np.mgrid[0:h, 0:w]
    r = np.sqrt(((xx-w/2)/(w/2))**2 + ((yy-h/2)/(h/2))**2) / 1.414
    a = a * (1 - 0.18 * np.clip(r, 0, 1)**2)[:, :, None]
    a = np.clip(a, 0, 1)
    rng = np.random.default_rng(7)
    a = np.clip(a + rng.normal(0, 0.0025, a.shape).astype(np.float32), 0, 1)
    out = Image.fromarray((a*255).astype(np.uint8))
    out = out.filter(ImageFilter.UnsharpMask(radius=1.2, percent=45, threshold=2))
    out.save(dst, quality=91, subsampling=1)
    print("GRADE", os.path.basename(src), "->", dst, out.size)

for src_name, dst_name in MAP:
    src = os.path.join(RAW, src_name)
    if not os.path.exists(src):
        print("MISSING", src)
        continue
    grade(src, os.path.join(OUT, dst_name))
