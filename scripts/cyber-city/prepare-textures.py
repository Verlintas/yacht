#!/usr/bin/env python3
"""
Prepare K044 / K003 textures for the cyber-city slice.

Outputs WebP base color / normal / packed ORM (R=AO, G=roughness, B=metallic)
and JSON manifests used by the Blender export + runtime material builder.

Source assets are read-only. Output goes to public/cyber-city/tex/.
"""
from __future__ import annotations

import json
import math
import os
import re
from pathlib import Path

from PIL import Image, ImageFilter, ImageOps, ImageChops

ROOT = Path(__file__).resolve().parents[2]
SRC_K044 = Path("/private/var/folders/fj/gwg4chqx7nvfvygvwmcyxh240000gn/T/opencode/cyber/KB3DTextures")
SRC_K003 = Path("/private/var/folders/fj/gwg4chqx7nvfvygvwmcyxh240000gn/T/opencode/cyber/k003/tex")
OUT = ROOT / "public/cyber-city/tex"
OUT_K044 = OUT / "k044"
OUT_K003 = OUT / "k003"
SCRIPTS = ROOT / "scripts/cyber-city"

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def load(name: str, src: Path) -> Image.Image | None:
    p = src / name
    if not p.exists():
        return None
    im = Image.open(p)
    return im.convert("RGBA") if im.mode in ("RGBA", "LA", "P") else im.convert("RGB")


def resize(im: Image.Image, max_side: int) -> Image.Image:
    w, h = im.size
    if max(w, h) <= max_side:
        return im
    s = max_side / max(w, h)
    return im.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)


def save_webp(im: Image.Image, path: Path, quality: int = 88, lossless: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if im.mode not in ("RGB", "RGBA"):
        im = im.convert("RGB")
    im.save(path, "WEBP", quality=quality, method=6, lossless=lossless)


def to_gray(im: Image.Image) -> Image.Image:
    return im.convert("L")


def bump_to_normal(src: Image.Image, strength: float = 1.8) -> Image.Image:
    """Generate an OpenGL (+Y up) tangent-space normal map from a bump/height map."""
    g = src.convert("L").filter(ImageFilter.GaussianBlur(0.6))
    w, h = g.size
    px = g.load()
    out = Image.new("RGB", (w, h))
    op = out.load()
    for y in range(h):
        ym = (y - 1) % h
        yp = (y + 1) % h
        for x in range(w):
            xm = (x - 1) % w
            xp = (x + 1) % w
            dx = (px[xp, y] - px[xm, y]) / 255.0
            dy = (px[x, yp] - px[x, ym]) / 255.0
            nx = -dx * strength
            ny = dy * strength
            nz = 1.0
            inv = 1.0 / math.sqrt(nx * nx + ny * ny + nz * nz)
            op[x, y] = (
                max(0, min(255, int((nx * inv * 0.5 + 0.5) * 255))),
                max(0, min(255, int((ny * inv * 0.5 + 0.5) * 255))),
                max(0, min(255, int((nz * inv * 0.5 + 0.5) * 255))),
            )
    return out


def pack_orm(ao: Image.Image | None, rough: Image.Image | None, metal: Image.Image | None,
             rough_const: float = 1.0, metal_const: float = 1.0) -> Image.Image:
    size = None
    for im in (ao, rough, metal):
        if im is not None:
            size = im.size
            break
    if size is None:
        size = (4, 4)
    ao = ao.convert("L").resize(size, Image.LANCZOS) if ao else None
    rough = rough.convert("L").resize(size, Image.LANCZOS) if rough else None
    metal = metal.convert("L").resize(size, Image.LANCZOS) if metal else None
    out = Image.new("RGB", size)
    op = out.load()
    aop = ao.load() if ao else None
    rop = rough.load() if rough else None
    mop = metal.load() if metal else None
    for y in range(size[1]):
        for x in range(size[0]):
            a = aop[x, y] if aop else 255
            r = int(rop[x, y] * rough_const) if rop else int(max(0, min(1, rough_const)) * 255)
            m = int(mop[x, y] * metal_const) if mop else int(max(0, min(1, metal_const)) * 255)
            op[x, y] = (a, max(0, min(255, r)), max(0, min(255, m)))
    return out


def solid(size: int, color: tuple[int, int, int]) -> Image.Image:
    return Image.new("RGB", (size, size), color)


# ---------------------------------------------------------------------------
# K044 source mapping
# ---------------------------------------------------------------------------

def k044_material(spec: dict, files: dict[str, str]) -> dict:
    """spec keys: base, normal, bump, gloss, rough, metal, ao, tint, alpha, ...
    values are texture basenames without .jpg (or explicit full names).
    Returns manifest entry.
    """
    name = spec["name"]
    slug = re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_")
    entry = {"name": name, "base": None, "normal": None, "orm": None,
             "roughness": spec.get("roughness", 1.0), "metalness": spec.get("metalness", 1.0),
             "emissive": spec.get("emissive"), "emissiveStrength": spec.get("emissiveStrength", 1.0),
             "alpha": spec.get("alpha", False), "alphaCutoff": 0.45,
             "color": spec.get("tint", [1, 1, 1])}
    maxside = spec.get("size", 1024)
    nside = spec.get("nsize", maxside)
    oside = spec.get("osize", min(maxside, 1024))

    def f(key):
        v = files.get(key)
        if v is None:
            return None
        return SRC_K044 / v

    base = load(files.get(spec.get("base", "")), SRC_K044) if spec.get("base") else None
    alpha_map = load(files.get(spec["alphaMap"]), SRC_K044) if spec.get("alphaMap") else None
    if base is not None:
        base = resize(base, maxside)
        if alpha_map is not None:
            a = alpha_map.convert("L").resize(base.size, Image.LANCZOS)
            base = base.convert("RGB")
            base.putalpha(a)
        save_webp(base.convert("RGBA") if alpha_map is not None else base.convert("RGB"),
                  OUT_K044 / f"{slug}_base.webp", 88)
        entry["base"] = f"tex/k044/{slug}_base.webp"
    elif alpha_map is not None:
        # no diffuse, only a cutout mask -> flat cloth colour with alpha
        tint = spec.get("tint", [0.22, 0.2, 0.17])
        size = (512, 512)
        a = alpha_map.convert("L").resize(size, Image.LANCZOS)
        base = Image.new("RGBA", size, (int(tint[0] * 255), int(tint[1] * 255), int(tint[2] * 255), 255))
        base.putalpha(a)
        save_webp(base, OUT_K044 / f"{slug}_base.webp", 88)
        entry["base"] = f"tex/k044/{slug}_base.webp"

    normal = None
    if spec.get("normal"):
        normal = load(files[spec["normal"]], SRC_K044)
    elif spec.get("bump"):
        b = load(files[spec["bump"]], SRC_K044)
        if b is not None:
            normal = bump_to_normal(b, spec.get("bumpStrength", 1.8))
    if normal is not None:
        normal = resize(normal.convert("RGB"), nside)
        save_webp(normal, OUT_K044 / f"{slug}_normal.webp", 92)
        entry["normal"] = f"tex/k044/{slug}_normal.webp"

    ao = load(files[spec["ao"]], SRC_K044) if spec.get("ao") else None
    rough = load(files[spec["rough"]], SRC_K044) if spec.get("rough") else None
    if rough is None and spec.get("gloss"):
        g = load(files[spec["gloss"]], SRC_K044)
        if g is not None:
            inverse = ImageOps.invert(g.convert("L"))
            # glossiness maps are often very dark; renormalise a little
            inverse = inverse.point(lambda v: int(min(255, max(0, (v - 12) * 255 / 243))))
            rough = inverse
    metal = load(files[spec["metal"]], SRC_K044) if spec.get("metal") else None
    if ao is not None or rough is not None or metal is not None:
        orm = pack_orm(ao, rough, metal, spec.get("roughness", 1.0), spec.get("metalness", 1.0))
        orm = resize(orm, oside)
        save_webp(orm, OUT_K044 / f"{slug}_orm.webp", 88)
        entry["orm"] = f"tex/k044/{slug}_orm.webp"
        # multiply factors with map is handled by glTF; keep factor 1 for maps
        entry["roughness"] = 1.0
        entry["metalness"] = 1.0
    return entry


K044_FILES = {
    "SatinSteel_basecolor": "KB3D_SatinSteel_basecolor.jpg",
    "SatinSteel_normal": "KB3D_SatinSteel_normal.jpg",
    "SatinSteel_roughness": "KB3D_SatinSteel_roughness.jpg",
    "SatinSteel_metallic": "KB3D_SatinSteel_metallic.jpg",
    "SatinSteel_ao": "KB3D_SatinSteel_ambient_occlusion.jpg",
    "OxidizedSteel_basecolor": "KB3D_OxidizedSteel_basecolor.jpg",
    "OxidizedSteel_normal": "KB3D_OxidizedSteel_normal.jpg",
    "OxidizedSteel_roughness": "KB3D_OxidizedSteel_roughness.jpg",
    "OxidizedSteel_metallic": "KB3D_OxidizedSteel_metallic.jpg",
    "OxidizedSteel_ao": "KB3D_OxidizedSteel_ambient_occlusion.jpg",
    "GalvanizedSteel_basecolor": "KB3D_GalvanizedSteel_basecolor.jpg",
    "GalvanizedSteel_normal": "KB3D_GalvanizedSteel_normal.jpg",
    "GalvanizedSteel_roughness": "KB3D_GalvanizedSteel_roughness.jpg",
    "GalvanizedSteel_metallic": "KB3D_GalvanizedSteel_metallic.jpg",
    "GalvanizedSteel_ao": "KB3D_GalvanizedSteel_ambient_occlusion.jpg",
    "PaintedMetall_basecolor": "KB3D_PaintedMetall_basecolor.jpg",
    "PaintedMetall_normal": "KB3D_PaintedMetall_normal.jpg",
    "PaintedMetall_glossiness": "KB3D_PaintedMetall_glossiness.jpg",
    "PaintedMetall_roughness": "KB3D_PaintedMetall_roughness.jpg",
    "PaintedMetall_metallic": "KB3D_PaintedMetall_metallic.jpg",
    "PaintedMetall_ao": "KB3D_PaintedMetall_ambient_occlusion.jpg",
    "MetalAccent_basecolor": "KB3D_MetalAccent_basecolor.jpg",
    "MetalAccent_normal": "KB3D_MetalAccent_normal.jpg",
    "MetalAccent_roughness": "KB3D_MetalAccent_roughness.jpg",
    "MetalAccent_metallic": "KB3D_MetalAccent_metallic.jpg",
    "MetalAccent_ao": "KB3D_MetalAccent_ambient_occlusion.jpg",
    "MetalGrating_basecolor": "KB3D_MetalGrating_basecolor.jpg",
    "MetalGrating_normal": "KB3D_MetalGrating_normal.jpg",
    "MetalGrating_roughness": "KB3D_MetalGrating_roughness.jpg",
    "MetalGrating_metallic": "KB3D_MetalGrating_metallic.jpg",
    "MetalGrating_ao": "KB3D_MetalGrating_ambient_occlusion.jpg",
    "MetalGrating_opacity": "KB3D_MetalGrating_opacity.jpg",
    "ConcreteBlocks_basecolor": "KB3D_ConcreteBlocks_basecolor.jpg",
    "ConcreteBlocks_normal": "KB3D_ConcreteBlocks_normal.jpg",
    "ConcreteBlocks_roughness": "KB3D_ConcreteBlocks_roughness.jpg",
    "ConcreteBlocks_metallic": "KB3D_ConcreteBlocks_metallic.jpg",
    "ConcreteBlocks_ao": "KB3D_ConcreteBlocks_ambient_occlusion.jpg",
    "ConcretePattern_basecolor": "KB3D_ConcretePattern_basecolor.jpg",
    "ConcretePattern_normal": "KB3D_ConcretePattern_normal.jpg",
    "ConcretePattern_roughness": "KB3D_ConcretePattern_roughness.jpg",
    "ConcretePattern_metallic": "KB3D_ConcretePattern_metallic.jpg",
    "ConcretePattern_ao": "KB3D_ConcretePattern_ambient_occlusion.jpg",
    "AsphaltHexagonRoof_basecolor": "KB3D_AsphaltHexagonRoof_basecolor.jpg",
    "AsphaltHexagonRoof_altnormal": "KB3D_AsphaltHexagonRoof_altnormal.jpg",
    "AsphaltHexagonRoof_roughness": "KB3D_AsphaltHexagonRoof_roughness.jpg",
    "AsphaltHexagonRoof_metallic": "KB3D_AsphaltHexagonRoof_metallic.jpg",
    "AsphaltHexagonRoof_ao": "KB3D_AsphaltHexagonRoof_ambient_occlusion.jpg",
    "ConcFormHoles_base": "KB3D_ConcFormHoles_Base_Color.jpg",
    "ConcFormHoles_normal": "KB3D_ConcFormHoles_Normal.jpg",
    "ConcFormHoles_gloss": "KB3D_ConcFormHoles_Glossiness.jpg",
    "ConcFormNoHoles_base": "KB3D_ConcFormNoHoles_Base_Color.jpg",
    "ConcFormNoHoles_normal": "KB3D_ConcFormNoHoles_Normal.jpg",
    "ConcFormNoHoles_gloss": "KB3D_ConcFormNoHoles_Glossiness.jpg",
    "ConcGeneral_base": "KB3D_ConcGeneral_Base_Color.jpg",
    "ConcGeneral_normal": "KB3D_ConcGeneral_Normal.jpg",
    "ConcGeneral_gloss": "KB3D_ConcGeneral_Glossiness.jpg",
    "ConcGeneralBrown_base": "KB3D_ConcGeneralBrown_Base_Color.jpg",
    "ConcGeneralBrown_normal": "KB3D_ConcGeneralBrown_Normal.jpg",
    "ConcGeneralBrown_gloss": "KB3D_ConcGeneralBrown_Glossiness.jpg",
    "ConcHorizontal_base": "KB3D_ConcHorizontal_Base_Color.jpg",
    "ConcHorizontal_normal": "KB3D_ConcHorizontal_Normal.jpg",
    "ConcHorizontal_gloss": "KB3D_ConcHorizontal_Glossiness.jpg",
    "ConcLongBlock_base": "KB3D_ConcLongBlock_Base_Color.jpg",
    "ConcLongBlock_normal": "KB3D_ConcLongBlock_Normal.jpg",
    "ConcLongBlock_gloss": "KB3D_ConcLongBlock_Glossiness.jpg",
    "ConcFloorTiles_base": "KB3D_ConcFloorTiles_Base_Color.jpg",
    "ConcFloorTiles_normal": "KB3D_ConcFloorTiles_Normal.jpg",
    "ConcFloorTiles_gloss": "KB3D_ConcFloorTiles_Glossiness.jpg",
    "ConcreteGrime_base": "KB3D_ConcreteGrime_Diffuse..jpg",
    "ConcreteGrime_normal": "KB3D_ConcreteGrime_Normal.jpg",
    "ConcreteGrime_gloss": "KB3D_ConcreteGrime_Glossiness.jpg",
    "Concrete_base": "KB3D_NeoConcrete_Diffuse.jpg",
    "Concrete_normal": "KB3D_NeoConcrete_Normal.jpg",
    "Concrete_gloss": "KB3D_NeoConcrete_Glossiness.jpg",
    "ConcreteMix_base": "KB3D_ConcreteMix_Diffuse.jpg",
    "ConcreteMix_bump": "KB3D_ConcreteMix_Bump.jpg",
    "ConcreteMixWhite_base": "KB3D_ConcreteMix_DiffuseWhite.jpg",
    "MetalPitted_base": "KB3D_MetalPitted_DiffuseGrey.jpg",
    "MetalPitted_brown": "KB3D_MetalPitted_DiffuseBrown.jpg",
    "MetalPitted_rough": "KB3D_MetalPitted_Rough.jpg",
    "AC_base": "KB3D_AC_Diffuse.jpg",
    "AC_normal": "KB3D_AC_Diffuse_Normal.jpg",
    "AC_gloss": "KB3D_AC_Diffuse_Glossiness.jpg",
    "FutureAC_base": "KB3D_FutureSlums_AC_Diffuse.jpg",
    "FutureAC_normal": "KB3D_FutureSlums_AC_Normal.jpg",
    "BldgD_base": "KB3D_BldgD_Diffuse.jpg",
    "BldgD_normal": "KB3D_BldgD_Normal.jpg",
    "BldgD_gloss": "KB3D_BldgD_Glossiness.jpg",
    "BldgE_base": "KB3D_BldgE_Diffuse.jpg",
    "BldgE_normal": "KB3D_BldgE_Normal.jpg",
    "BldgE_gloss": "KB3D_BldgE_Glossiness.jpg",
    "BldgF_base": "KB3D_BldgF_Diffuse.jpg",
    "BldgF_normal": "KB3D_BldgF_Normal.jpg",
    "BldgF_gloss": "KB3D_BldgF_Glossiness.jpg",
    "BldgI_base": "KB3D_BldgI_Diffuse.jpg",
    "BldgI_normal": "KB3D_BldgI_Normal.jpg",
    "BldgI_gloss": "KB3D_BldgI_Glossiness.jpg",
    "BldgJ_base": "KB3D_BldgJ_Diffuse.jpg",
    "BldgJ_normal": "KB3D_BldgJ_Normal.jpg",
    "BldgJ_gloss": "KB3D_BldgJ_Glossiness.jpg",
    "RoofTar_base": "KB3D_RoofTar_Diffuse.jpg",
    "RoofTar_normal": "KB3D_RoofTar_Normal.jpg",
    "RoofTar_gloss": "KB3D_RoofTar_Glossiness.jpg",
    "RoofCorrugated_base": "KB3D_RoofCorrugated_Diffuse.jpg",
    "RoofCorrugated_normal": "KB3D_RoofCorrugated_Normal.jpg",
    "WhitePlastic_base": "KB3D_whitePlastic_DiffuseDirty.jpg",
    "WhitePlastic_bump": "KB3D_whitePlastic_Bump.jpg",
    "MetalFlake_base": "KB3D_MetalFlake_DiffuseDirty.jpg",
    "MetalFlake_bump": "KB3D_MetalFlake_Bump.jpg",
    "MetalFlake_rough": "KB3D_MetalFlake_Rough.jpg",
    "NSbanner": "KB3D_NSbanner_Diffuse.jpg",
    "NSletters": "KB3D_NSletters_Diffuse.jpg",
    "SignageOld_base": "KB3d_SignageOld_Diffuse.jpg",
    "SignageOld_normal": "KB3d_SignageOld_Normal.jpg",
    "DoorSingle_base": "KB3D_DoorSingle_Diffuse.jpg",
    "DoorSingle_normal": "KB3D_DoorSingle_Normal.jpg",
    "DoorSingle_gloss": "KB3D_DoorSingle_Glossiness.jpg",
    "StoneFloor_base": "KB3D_StoneFloor_Diffuse.jpg",
    "StoneFloor_normal": "KB3D_StoneFloor_Normal.jpg",
    "StoneFloor_gloss": "KB3D_StoneFloor_Glossiness.jpg",
    "ClothGreen": "KB3D_Cloth_DiffuseGreen.jpg",
    "Cloth_bump": "KB3D_Cloth_Bump.jpg",
    "Clothes_alpha": "KB3D_FutureSlums_Clothes_Alpha.jpg",
    "Clothes_normal": "KB3D_FutureSlums_Clothes_Normal.jpg",
    "GlassBlack_gloss": "KB3D_GlassBlack_Glossiness.jpg",
    "GlassBlack_normal": "KB3D_GlassBlack_Normal.jpg",
    "SpeedwayTiles_base": "KB3D_SpeedwayTiles_basecolor.jpg",
    "SpeedwayTiles_normal": "KB3D_SpeedwayTiles_normal.jpg",
    "SpeedwayTiles_rough": "KB3D_SpeedwayTiles_roughness.jpg",
    "SpeedwayTiles_metal": "KB3D_SpeedwayTiles_metallic.jpg",
    "SpeedwayTiles_ao": "KB3D_SpeedwayTiles_ambient_occlusion.jpg",
}

K044_SPECS = [
    dict(name="SatinSteel", base="SatinSteel_basecolor", normal="SatinSteel_normal", rough="SatinSteel_roughness", metal="SatinSteel_metallic", ao="SatinSteel_ao", roughness=1, metalness=1, size=2048),
    dict(name="MetalOxidized", base="OxidizedSteel_basecolor", normal="OxidizedSteel_normal", rough="OxidizedSteel_roughness", metal="OxidizedSteel_metallic", ao="OxidizedSteel_ao", roughness=1, metalness=1, size=2048),
    dict(name="GalvanizedSteel", base="GalvanizedSteel_basecolor", normal="GalvanizedSteel_normal", rough="GalvanizedSteel_roughness", metal="GalvanizedSteel_metallic", ao="GalvanizedSteel_ao", roughness=1, metalness=1, size=2048),
    dict(name="PaintedMetal", base="PaintedMetall_basecolor", normal="PaintedMetall_normal", rough="PaintedMetall_roughness", metal="PaintedMetall_metallic", ao="PaintedMetall_ao", roughness=1, metalness=1, size=2048),
    dict(name="MetalAccent", base="MetalAccent_basecolor", normal="MetalAccent_normal", rough="MetalAccent_roughness", metal="MetalAccent_metallic", ao="MetalAccent_ao", roughness=1, metalness=1, size=1024),
    dict(name="MetalGrating", base="MetalGrating_basecolor", normal="MetalGrating_normal", rough="MetalGrating_roughness", metal="MetalGrating_metallic", ao="MetalGrating_ao", alphaMap="MetalGrating_opacity", alpha=True, roughness=1, metalness=1, size=1024),
    dict(name="ConcreteBlocks", base="ConcreteBlocks_basecolor", normal="ConcreteBlocks_normal", rough="ConcreteBlocks_roughness", metal="ConcreteBlocks_metallic", ao="ConcreteBlocks_ao", roughness=1, metalness=1, size=2048),
    dict(name="ConcretePattern", base="ConcretePattern_basecolor", normal="ConcretePattern_normal", rough="ConcretePattern_roughness", metal="ConcretePattern_metallic", ao="ConcretePattern_ao", roughness=1, metalness=1, size=1024),
    dict(name="AsphaltHexagonRoof", base="AsphaltHexagonRoof_basecolor", normal="AsphaltHexagonRoof_altnormal", rough="AsphaltHexagonRoof_roughness", metal="AsphaltHexagonRoof_metallic", ao="AsphaltHexagonRoof_ao", roughness=1, metalness=1, size=1024),
    dict(name="ConcFormHoles", base="ConcFormHoles_base", normal="ConcFormHoles_normal", gloss="ConcFormHoles_gloss", roughness=1, metalness=1, size=2048),
    dict(name="ConcFormNoHoles", base="ConcFormNoHoles_base", normal="ConcFormNoHoles_normal", gloss="ConcFormNoHoles_gloss", roughness=1, metalness=1, size=1024),
    dict(name="ConcGeneral", base="ConcGeneral_base", normal="ConcGeneral_normal", gloss="ConcGeneral_gloss", roughness=1, metalness=1, size=1024),
    dict(name="ConcGeneralBrown", base="ConcGeneralBrown_base", normal="ConcGeneralBrown_normal", gloss="ConcGeneralBrown_gloss", roughness=1, metalness=1, size=1024),
    dict(name="ConcHorizontal", base="ConcHorizontal_base", normal="ConcHorizontal_normal", gloss="ConcHorizontal_gloss", roughness=1, metalness=1, size=1024),
    dict(name="ConcLongBlock", base="ConcLongBlock_base", normal="ConcLongBlock_normal", gloss="ConcLongBlock_gloss", roughness=1, metalness=1, size=1024),
    dict(name="ConcFloorTiles", base="ConcFloorTiles_base", normal="ConcFloorTiles_normal", gloss="ConcFloorTiles_gloss", roughness=1, metalness=1, size=1024),
    dict(name="ConcGrime", base="ConcreteGrime_base", normal="ConcreteGrime_normal", gloss="ConcreteGrime_gloss", roughness=1, metalness=1, size=1024),
    dict(name="Concrete", base="Concrete_base", normal="Concrete_normal", gloss="Concrete_gloss", roughness=1, metalness=1, size=1024),
    dict(name="ConcreteMix", base="ConcreteMix_base", bump="ConcreteMix_bump", roughness=0.92, metalness=0.0, size=1024),
    dict(name="ConcreteMix_White", base="ConcreteMixWhite_base", bump="ConcreteMix_bump", roughness=0.9, metalness=0.0, size=1024),
    dict(name="MetalPitted_Grey", base="MetalPitted_base", rough="MetalPitted_rough", roughness=1, metalness=0.75, size=1024),
    dict(name="MetalPitted_Brown", base="MetalPitted_brown", rough="MetalPitted_rough", roughness=1, metalness=0.55, size=1024),
    dict(name="Mullions", base="MetalPitted_base", rough="MetalPitted_rough", roughness=1, metalness=0.8, size=1024),
    dict(name="AC", base="AC_base", normal="AC_normal", gloss="AC_gloss", roughness=1, metalness=0.55, size=1024),
    dict(name="Material #26", base="FutureAC_base", normal="FutureAC_normal", roughness=0.62, metalness=0.35, size=1024),
    dict(name="FacadeD", base="BldgD_base", normal="BldgD_normal", gloss="BldgD_gloss", roughness=1, metalness=1, size=1024),
    dict(name="FacadeE", base="BldgE_base", normal="BldgE_normal", gloss="BldgE_gloss", roughness=1, metalness=1, size=1024),
    dict(name="FacadeF", base="BldgF_base", normal="BldgF_normal", gloss="BldgF_gloss", roughness=1, metalness=1, size=2048),
    dict(name="FacadeI", base="BldgI_base", normal="BldgI_normal", gloss="BldgI_gloss", roughness=1, metalness=1, size=2048),
    dict(name="FacadeJ", base="BldgJ_base", normal="BldgJ_normal", gloss="BldgJ_gloss", roughness=1, metalness=1, size=1024),
    dict(name="GlsE", normal="BldgE_normal", gloss="BldgE_gloss", tint=[0.10, 0.16, 0.19], roughness=0.12, metalness=0.88, size=512),
    dict(name="GlsF", normal="BldgF_normal", gloss="BldgF_gloss", tint=[0.10, 0.16, 0.19], roughness=0.12, metalness=0.88, size=512),
    dict(name="GlsBlack", base=None, normal="GlassBlack_normal", gloss="GlassBlack_gloss", tint=[0.06, 0.08, 0.1], roughness=0.08, metalness=0.9, size=512),
    dict(name="RoofTar", base="RoofTar_base", normal="RoofTar_normal", gloss="RoofTar_gloss", roughness=1, metalness=0.2, size=1024),
    dict(name="RoofCorrugated", base="RoofCorrugated_base", normal="RoofCorrugated_normal", roughness=0.7, metalness=0.6, size=1024),
    dict(name="WhitePlastic_Dirty", base="WhitePlastic_base", bump="WhitePlastic_bump", roughness=0.72, metalness=0.0, size=1024),
    dict(name="MetalWhite", base="MetalFlake_base", bump="MetalFlake_bump", rough="MetalFlake_rough", roughness=1, metalness=0.65, size=2048),
    dict(name="MetalRed", bump="MetalFlake_bump", rough="MetalFlake_rough", tint=[0.42, 0.045, 0.03], roughness=1, metalness=0.6, size=1024),
    dict(name="Railing", bump="MetalFlake_bump", rough="MetalFlake_rough", tint=[0.09, 0.09, 0.1], roughness=1, metalness=0.85, size=512),
    dict(name="Pic_Banners", base="NSbanner", roughness=0.8, metalness=0.0, emissive=[0.12, 0.14, 0.16], emissiveStrength=0.5, size=2048),
    dict(name="Characters", base="NSletters", alpha=True, roughness=0.5, metalness=0.0, emissive=[0.35, 0.3, 0.2], emissiveStrength=1.2, size=2048),
    dict(name="SignageOld", base="SignageOld_base", normal="SignageOld_normal", roughness=0.55, metalness=0.2, emissive=[0.1, 0.1, 0.1], emissiveStrength=0.4, size=1024),
    dict(name="DoorSingle", base="DoorSingle_base", normal="DoorSingle_normal", gloss="DoorSingle_gloss", roughness=1, metalness=1, size=1024),
    dict(name="StoneFloor", base="StoneFloor_base", normal="StoneFloor_normal", gloss="StoneFloor_gloss", roughness=1, metalness=1, size=1024),
    dict(name="ClothGreen_Curtains", base="ClothGreen", bump="Cloth_bump", roughness=0.95, metalness=0.0, size=1024),
    dict(name="Clothes", alphaMap="Clothes_alpha", normal="Clothes_normal", tint=[0.22, 0.2, 0.17], roughness=0.95, metalness=0.0, alpha=True, size=512),
    dict(name="SpeedwayTiles", base="SpeedwayTiles_base", normal="SpeedwayTiles_normal", rough="SpeedwayTiles_rough", metal="SpeedwayTiles_metal", ao="SpeedwayTiles_ao", roughness=1, metalness=1, size=1024),
    dict(name="Glass", tint=[0.035, 0.055, 0.07], roughness=0.05, metalness=0.92, roughness_f=0.05),
    dict(name="Window", tint=[0.04, 0.06, 0.075], roughness=0.05, metalness=0.92),
    dict(name="Material #25", tint=[0.03, 0.05, 0.06], roughness=0.05, metalness=0.92),
    dict(name="MullionDark", tint=[0.016, 0.018, 0.02], roughness=0.35, metalness=0.85),
    dict(name="Signs_Lights", tint=[0.18, 0.14, 0.1], roughness=0.5, metalness=0.0, emissive=[1.0, 0.55, 0.24], emissiveStrength=2.4),
    dict(name="EmissiveLightMTL", tint=[0.2, 0.2, 0.18], roughness=0.4, metalness=0.0, emissive=[0.8, 0.9, 1.0], emissiveStrength=2.0),
]


def build_k044() -> list[dict]:
    entries = []
    for spec in K044_SPECS:
        e = k044_material(spec, K044_FILES)
        if "roughness_f" in spec:
            e["roughness"] = spec["roughness_f"]
        # if no orm, keep actual factors from spec
        hit = next((x for x in entries if x["name"] == e["name"]), None)
        if hit is None:
            entries.append(e)
    return entries


# ---------------------------------------------------------------------------
# K003
# ---------------------------------------------------------------------------

K003_TEXTURE_INFO = {
    # name: (diffuse, gloss, specular)
    "AluminiumBrushed": ("AluminiumBrushed_Diffuse", None, None),
    "BlackCloth": ("BlackCloth_Diffuse", None, None),
    "Brass": ("Brass_Diffuse", None, "Brass_Specular"),
    "Cardboard": ("Cardboard_Diffuse", None, None),
    "Concrete": ("Concrete_Diffuse", None, None),
    "ConcretePlastered": ("ConcretePlastered_Diffuse", None, None),
    "ConcreteTiles": ("ConcreteTiles_Diffuse", "ConcreteTiles_Glossiness", None),
    "PaintBlack": ("PaintBlack_Diffuse", "PaintBlack_Glossiness", None),
    "PaintBlue": ("PaintBlue_Diffuse", "PaintBlue_Glossiness", None),
    "PaintGreen": ("PaintGreen_Diffuse", None, None),
    "PaintRed": ("PaintRed_Diffuse", None, None),
    "PaintWhiteRusty": ("PaintWhiteRusty_Diffuse", None, None),
    "PaperWhite": ("PaperWhite_Diffuse", None, None),
    "PlasticBlack": ("PlasticBlack_Diffuse", "PlasticBlack_Glossiness", None),
    "PlasticFoil": ("PlasticFoil_Diffuse", "PlasticFoil_Glossiness", None),
    "PlasticWhite": ("PlasticWhite_Diffuse", None, None),
    "PlasticYellow": ("PlasticYellow_Diffuse", None, None),
    "RedWhiteStripes": ("RedWhiteStripes_Diffuse", None, None),
    "Rubber": ("Rubber_Diffuse", None, None),
    "SteelRaw": ("SteelRaw_Diffuse", None, "SteelRaw_Specular"),
    "Wood": ("Wood_Diffuse", None, None),
    "WoodLacquered": ("WoodLacquered_Diffuse", None, None),
    "Speaker": ("Speaker_Diffuse", None, None),
}

K003_FACTORS = {
    "AluminiumBrushed": (0.45, 0.85),
    "BlackCloth": (0.9, 0.0),
    "Brass": (0.3, 0.9),
    "Cardboard": (0.92, 0.0),
    "Concrete": (0.88, 0.0),
    "ConcretePlastered": (0.9, 0.0),
    "ConcreteTiles": (0.7, 0.05),
    "PaintBlack": (0.45, 0.1),
    "PaintBlue": (0.48, 0.1),
    "PaintGreen": (0.52, 0.1),
    "PaintRed": (0.5, 0.1),
    "PaintWhiteRusty": (0.65, 0.1),
    "PaperWhite": (0.9, 0.0),
    "PlasticBlack": (0.4, 0.05),
    "PlasticFoil": (0.55, 0.1),
    "PlasticWhite": (0.5, 0.0),
    "PlasticYellow": (0.5, 0.0),
    "RedWhiteStripes": (0.6, 0.0),
    "Rubber": (0.85, 0.0),
    "SteelRaw": (0.4, 0.85),
    "Wood": (0.78, 0.0),
    "WoodLacquered": (0.5, 0.0),
    "Speaker": (0.7, 0.1),
    "ConcreteGrey": (0.85, 0.0),
    "Decals": (0.55, 0.0),
    "GlassBlack": (0.05, 0.65),
    "GlassBottle": (0.08, 0.25),
    "GlassTransparent": (0.04, 0.1),
    "LightBlue": (0.4, 0.0),
    "LightOrange": (0.4, 0.0),
    "LightRed": (0.4, 0.0),
    "LightWhite": (0.4, 0.0),
    "LightYellow": (0.4, 0.0),
    "Mirror": (0.03, 0.95),
    "Screens": (0.25, 0.0),
    "ScreensDim": (0.35, 0.0),
}

K003_EMISSIVE = {
    "LightBlue": ([0.12, 0.55, 1.0], 3.0),
    "LightOrange": ([1.0, 0.38, 0.08], 3.0),
    "LightRed": ([1.0, 0.08, 0.06], 3.0),
    "LightWhite": ([0.9, 0.95, 1.0], 2.4),
    "LightYellow": ([1.0, 0.85, 0.4], 2.6),
    "Screens": ([0.3, 0.6, 0.9], 1.3),
    "ScreensDim": ([0.2, 0.4, 0.6], 0.9),
}


def build_k003() -> list[dict]:
    entries = []
    for name, (diffuse, gloss, specular) in K003_TEXTURE_INFO.items():
        roughness, metalness = K003_FACTORS.get(name, (0.7, 0.0))
        slug = re.sub(r"[^A-Za-z0-9]+", "_", name)
        e = {"name": name, "base": None, "normal": None, "orm": None,
             "roughness": roughness, "metalness": metalness,
             "emissive": None, "emissiveStrength": 1.0, "alpha": False,
             "alphaCutoff": 0.45, "color": [1, 1, 1]}
        base = load(f"KB3D_CPP_{diffuse}.jpg", SRC_K003)
        if base is not None:
            base = resize(base, 2048 if name in ("SteelRaw", "ConcreteTiles", "PaintRed", "Concrete") else 1024)
            save_webp(base, OUT_K003 / f"{slug}_base.webp", 86)
            e["base"] = f"tex/k003/{slug}_base.webp"
        rough = None
        if gloss:
            g = load(f"KB3D_CPP_{gloss}.jpg", SRC_K003)
            if g is not None:
                g = ImageOps.invert(g.convert("L"))
                rough = g.point(lambda v: int(min(255, max(0, (v - 10) * 255 / 245))))
        # only generate normal for plastered bump
        if name == "ConcretePlastered":
            b = load("KB3D_CPP_ConcretePlastered_Bump.jpg", SRC_K003)
            if b is not None:
                n = bump_to_normal(b, 1.3)
                n = resize(n, 1024)
                save_webp(n, OUT_K003 / f"{slug}_normal.webp", 92)
                e["normal"] = f"tex/k003/{slug}_normal.webp"
        orm = pack_orm(None, rough, None, roughness, metalness)
        orm = resize(orm, 1024)
        save_webp(orm, OUT_K003 / f"{slug}_orm.webp", 86)
        e["orm"] = f"tex/k003/{slug}_orm.webp"
        e["roughness"] = 1.0
        e["metalness"] = 1.0
        entries.append(e)

    # flat materials
    for name, (rough, metal) in K003_FACTORS.items():
        if name in K003_TEXTURE_INFO:
            continue
        slug = re.sub(r"[^A-Za-z0-9]+", "_", name)
        e = {"name": name, "base": None, "normal": None, "orm": None,
             "roughness": rough, "metalness": metal, "emissive": None,
             "emissiveStrength": 1.0, "alpha": False, "alphaCutoff": 0.45,
             "color": [1, 1, 1]}
        if name in K003_EMISSIVE:
            col, strength = K003_EMISSIVE[name]
            e["emissive"] = col
            e["emissiveStrength"] = strength
            e["color"] = [c * 0.2 for c in col]
        elif name == "GlassBlack":
            e["color"] = [0.035, 0.06, 0.07]
        elif name == "GlassBottle":
            e["color"] = [0.15, 0.28, 0.2]
        elif name == "GlassTransparent":
            e["color"] = [0.6, 0.75, 0.78]
            e["alpha"] = True
        elif name == "Mirror":
            e["color"] = [0.7, 0.75, 0.8]
        elif name == "ScreensDim":
            e["color"] = [0.05, 0.08, 0.1]
        entries.append(e)

    # decal atlas
    decal = load("KB3D_CPP_DecalSheet_Albedo.jpg", SRC_K003)
    if decal is not None:
        decal = resize(decal, 4096)
        save_webp(decal, OUT_K003 / "Decals_base.webp", 90)
        for e in entries:
            if e["name"] == "Decals":
                e["base"] = "tex/k003/Decals_base.webp"
                e["roughness"] = 0.6
                e["metalness"] = 0.0
                e["emissive"] = [0.35, 0.28, 0.22]
                e["emissiveStrength"] = 0.8
    return entries


# ---------------------------------------------------------------------------
# street material textures (generated, not baked into authored assets)
# ---------------------------------------------------------------------------

def hash_noise(size: int) -> Image.Image:
    import random
    rnd = random.Random(90210)
    im = Image.new("L", (size, size))
    p = im.load()
    for y in range(size):
        for x in range(size):
            p[x, y] = rnd.randrange(256)
    return im


def make_sidewalk() -> None:
    """Sidewalk tiles from the authored K003/K044 maps.

    The road itself uses the real CC0 Asphalt012 scans and is generated by
    `prepare-street.py`; this function must not overwrite those outputs.
    """
    b = load("KB3D_CPP_ConcreteTiles_Diffuse.jpg", SRC_K003)
    g = load("KB3D_CPP_ConcreteTiles_Glossiness.jpg", SRC_K003)
    if b:
        b = resize(b, 1024)
        save_webp(b, OUT / "street/sidewalk_base.webp", 88)
    if g:
        r = ImageOps.invert(g.convert("L"))
        orm = pack_orm(None, r, None, 1.0, 0.0)
        orm = resize(orm, 512)
        save_webp(orm, OUT / "street/sidewalk_orm.webp", 88)
    # concrete normal from K044 concrete blocks for sidewalk subtlety
    nb = load("KB3D_ConcreteBlocks_normal.jpg", SRC_K044)
    if nb:
        nb = resize(nb.convert("RGB"), 1024)
        save_webp(nb, OUT / "street/sidewalk_normal.webp", 90)


def make_misc() -> None:
    # steam puff
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    p = im.load()
    import random
    rnd = random.Random(99)
    for y in range(size):
        for x in range(size):
            dx = (x - size / 2) / (size / 2)
            dy = (y - size / 2) / (size / 2)
            d = math.sqrt(dx * dx + dy * dy)
            n = rnd.random() * 0.15
            a = max(0, min(1, max(0.0, 1 - d) ** 1.8 + n - 0.1))
            p[x, y] = (220, 230, 240, int(a * 120))
    im.save(OUT / "misc/steam.png")


def main() -> None:
    for d in (OUT_K044, OUT_K003, OUT / "street", OUT / "misc"):
        d.mkdir(parents=True, exist_ok=True)
    k044 = build_k044()
    k003 = build_k003()
    make_sidewalk()
    make_misc()
    (SCRIPTS / "manifest-k044.json").write_text(json.dumps(k044, indent=1))
    (SCRIPTS / "manifest-k003.json").write_text(json.dumps(k003, indent=1))
    print(f"K044 materials: {len(k044)}  K003 materials: {len(k003)}")
    print(f"output: {OUT}")


if __name__ == "__main__":
    main()
