#!/usr/bin/env python3
"""
Prepare the real asphalt street textures for the cyber-city road.

Source: AmbientCG Asphalt012 (CC0), copied to scripts/cyber-city/source/asphalt.
Outputs to public/cyber-city/tex/street:
  asphalt_base.webp   albedo
  asphalt_normal.webp normal (OpenGL)
  asphalt_orm.webp    R=AO(255), G=roughness, B=metallic(0)
  asphalt_macro.webp  low-frequency dirt/tar variation for the road shader
  puddle_mask.webp    localized puddle mask
"""
from __future__ import annotations

import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "scripts/cyber-city/source/asphalt"
OUT = ROOT / "public/cyber-city/tex/street"


def save(im: Image.Image, name: str, quality: int = 90) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    if im.mode not in ("RGB", "RGBA"):
        im = im.convert("RGB")
    im.save(OUT / name, "WEBP", quality=quality, method=6)


def main() -> None:
    color = Image.open(SRC / "color.jpg").convert("RGB")
    color = color.resize((1024, 1024), Image.LANCZOS)
    # cool-neutral, slightly lifted asphalt; keep aggregate/cracks
    color = ImageEnhance.Color(color).enhance(0.55)
    color = ImageEnhance.Brightness(color).enhance(1.12)
    color = ImageEnhance.Contrast(color).enhance(1.08)
    save(color, "asphalt_base.webp", 90)

    normal = Image.open(SRC / "normal.jpg").convert("RGB").resize((1024, 1024), Image.LANCZOS)
    save(normal, "asphalt_normal.webp", 92)

    rough = Image.open(SRC / "roughness.jpg").convert("L").resize((1024, 1024), Image.LANCZOS)
    # AmbientCG roughness is already white=rough. Pack ORM.
    orm = Image.new("RGB", (1024, 1024))
    rp = rough.load()
    op = orm.load()
    for y in range(1024):
        for x in range(1024):
            r = rp[x, y]
            op[x, y] = (255, r, 0)
    save(orm, "asphalt_orm.webp", 88)

    # low-frequency macro grunge to break tiling
    macro = Image.new("L", (512, 512), 128)
    md = ImageDraw.Draw(macro)
    rnd = random.Random(8123)
    for _ in range(140):
        x = rnd.randrange(512)
        y = rnd.randrange(512)
        rx = rnd.randrange(10, 90)
        ry = rnd.randrange(10, 110)
        v = rnd.randrange(40, 210)
        md.ellipse((x - rx, y - ry, x + rx, y + ry), fill=v)
    macro = macro.filter(ImageFilter.GaussianBlur(22))
    macro = ImageEnhance.Contrast(macro).enhance(1.25)
    save(macro.convert("RGB"), "asphalt_macro.webp", 85)

    # localized puddles: large, elongated blobs, blurred
    mask = Image.new("L", (1024, 1024), 0)
    md = ImageDraw.Draw(mask)
    rnd = random.Random(4417)
    for _ in range(56):
        x = rnd.randrange(1024)
        y = rnd.randrange(1024)
        rx = rnd.randrange(24, 110)
        ry = rnd.randrange(50, 190)
        md.ellipse((x - rx, y - ry, x + rx, y + ry), fill=rnd.randrange(160, 255))
    for _ in range(26):
        x = rnd.randrange(1024)
        y = rnd.randrange(1024)
        r = rnd.randrange(15, 70)
        md.ellipse((x - r, y - r, x + r, y + r), fill=rnd.randrange(120, 230))
    mask = mask.filter(ImageFilter.GaussianBlur(18))
    mask = mask.point(lambda v: int(min(255, max(0, (v - 30) * 1.35))))
    save(mask.convert("RGB"), "puddle_mask.webp", 88)

    print("street textures written to", OUT)


if __name__ == "__main__":
    main()
