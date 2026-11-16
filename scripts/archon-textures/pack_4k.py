#!/usr/bin/env python3
"""Optional 4K hero pass: 2x normal (renormalized) + 2x ORM.

Albedo/emissive are intentionally NOT upscaled: the source albedo is near-black
and the source is 2K, so Lanczos resampling adds no real detail. This is a
resolution-only test; see docs/ARCHON-TEXTURE-PASS.md for the 4K verdict.
"""
from PIL import Image
import numpy as np
import os
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
WORK = Path(os.environ.get("ARCHON_WORK", REPO / "work"))
TEX = WORK / "tex"
OUT = TEX / "final"


def u8(x):
    return (np.clip(x, 0, 1) * 255.0 + 0.5).astype(np.uint8)


n = Image.open(TEX / "normal_1.png").convert("RGB")
n4 = n.resize((4096, 4096), Image.LANCZOS)
a = np.asarray(n4).astype(np.float32) / 255.0 * 2.0 - 1.0
a = np.clip(a, -1, 1)
a /= np.maximum(np.linalg.norm(a, axis=2, keepdims=True), 1e-6)
Image.fromarray(u8(a * 0.5 + 0.5)).save(OUT / "normal_4k.png", optimize=True)

o = Image.open(OUT / "orm_final.png").convert("RGB")
o.resize((4096, 4096), Image.LANCZOS).save(OUT / "orm_4k.png", optimize=True)
print("wrote", OUT / "normal_4k.png", OUT / "orm_4k.png")
