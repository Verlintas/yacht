#!/usr/bin/env python3
"""
Blender 5.3 asset export for the cyber-city slice.

Usage:
  Blender -b --factory-startup --python export_assets.py -- k044
  Blender -b --factory-startup --python export_assets.py -- k003

Exports:
  public/cyber-city/models/towers.glb        (7 LOD0 towers + 1 decimated skyline tower)
  public/cyber-city/models/towers_lod1.glb   (7 low-detail towers, untextured materials)
  public/cyber-city/models/props.glb         (3 storefronts + selected street props)
"""
from __future__ import annotations

import json
import math
import os
import re
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "public/cyber-city"
MODELS = PUBLIC / "models"
SCRIPTS = ROOT / "scripts/cyber-city"

K044_FBX = Path("/private/var/folders/fj/gwg4chqx7nvfvygvwmcyxh240000gn/T/opencode/cyber/Kitbash3d_CyberPunk_MiniKit.FBX")
K003_FBX = Path("/private/var/folders/fj/gwg4chqx7nvfvygvwmcyxh240000gn/T/opencode/cyber/k003/Kitbash3d_CyberpunkProps-Native.fbx")


def load_manifest(name: str) -> dict[str, dict]:
    data = json.loads((SCRIPTS / f"manifest-{name}.json").read_text())
    return {entry["name"]: entry for entry in data}


def reset() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_fbx(path: Path) -> None:
    bpy.ops.import_scene.fbx(
        filepath=str(path),
        use_anim=False,
        global_scale=100.0,
        use_custom_normals=True,
    )


def build_material(name: str, entry: dict, simple: bool = False) -> bpy.types.Material:
    """Create one clean Principled material from the prepared manifest."""
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    out.location = (420, 0)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (80, 0)
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    color = entry.get("color", [1, 1, 1]) if entry else [0.6, 0.6, 0.6]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = float(entry.get("roughness", 0.7)) if entry else 0.7
    bsdf.inputs["Metallic"].default_value = float(entry.get("metalness", 0.0)) if entry else 0.0

    if entry and not simple:
        base = entry.get("base")
        if base:
            p = PUBLIC / base
            if p.exists():
                img = bpy.data.images.load(str(p), check_existing=True)
                tex = nt.nodes.new("ShaderNodeTexImage")
                tex.image = img
                tex.location = (-420, 180)
                img.colorspace_settings.name = "sRGB"
                nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
                if entry.get("alpha"):
                    nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
                    mat.blend_method = "CLIP"
                    mat.alpha_threshold = float(entry.get("alphaCutoff", 0.45))
        normal = entry.get("normal")
        if normal:
            p = PUBLIC / normal
            if p.exists():
                img = bpy.data.images.load(str(p), check_existing=True)
                img.colorspace_settings.name = "Non-Color"
                tex = nt.nodes.new("ShaderNodeTexImage")
                tex.image = img
                tex.location = (-420, -120)
                nm = nt.nodes.new("ShaderNodeNormalMap")
                nm.location = (-160, -120)
                nm.inputs["Strength"].default_value = 1.0
                nt.links.new(tex.outputs["Color"], nm.inputs["Color"])
                nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
        em = entry.get("emissive")
        if em:
            bsdf.inputs["Emission Color"].default_value = (*em, 1.0)
            bsdf.inputs["Emission Strength"].default_value = float(entry.get("emissiveStrength", 1.0))
    else:
        # simple LOD material: keep a flat approximation, no textures
        if entry:
            bsdf.inputs["Base Color"].default_value = (*color, 1.0)
            if entry.get("emissive"):
                bsdf.inputs["Emission Color"].default_value = (*entry["emissive"], 1.0)
                bsdf.inputs["Emission Strength"].default_value = float(entry.get("emissiveStrength", 1.0))

    mat.use_backface_culling = False
    return mat


def assign_materials(objects, manifest: dict, simple: bool = False, prefix: str = "") -> None:
    cache: dict[str, bpy.types.Material] = {}
    for ob in objects:
        if ob.type != "MESH":
            continue
        for slot in ob.material_slots:
            src = slot.material.name if slot.material else None
            if not src:
                continue
            key = re.sub(r"\.\d+$", "", src)
            entry = manifest.get(key)
            if entry is None:
                # try the unmodified name
                entry = manifest.get(src)
            if key not in cache:
                cache[key] = build_material(prefix + key, entry or {"color": [0.35, 0.35, 0.38]}, simple=simple)
            slot.material = cache[key]


def join_module(objs, name: str, ratio: float) -> bpy.types.Object:
    bpy.ops.object.select_all(action="DESELECT")
    for ob in objs:
        ob.select_set(True)
    active = objs[0]
    bpy.context.view_layer.objects.active = active
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    bpy.ops.object.material_slot_remove_unused()

    if ratio < 0.999:
        mod = ob.modifiers.new("lod_decimate", "DECIMATE")
        mod.decimate_type = "COLLAPSE"
        mod.ratio = ratio
        mod.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=mod.name)

    # put the footprint centre at the origin, bottom on z=0
    mw = ob.matrix_world
    corners = [mw @ Vector(c) for c in ob.bound_box]
    mn = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
    mx = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
    center = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    ob.matrix_world = Matrix.Translation(-center) @ mw
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    ob.name = name
    return ob


def tri_count(ob: bpy.types.Object) -> int:
    ob.data.calc_loop_triangles()
    return len(ob.data.loop_triangles)


def export_glb(objs, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for ob in objs:
        ob.select_set(True)
    if objs:
        bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
        export_materials="EXPORT",
        export_image_format="WEBP",
        export_image_quality=86,
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_extras=True,
    )


# ---------------------------------------------------------------------------
# K044 towers
# ---------------------------------------------------------------------------

K044_MODULES = {
    # module prefix : (lod0 ratio, include in LOD0)
    "TowerF": 0.65,
    "BldgLG_E": 0.65,
    "Tower_02": 0.78,
    "XL_Bldg_C": 0.65,
    "BldgM_D": 0.65,
    "BldgS_B": 0.65,
    "MidRiseG": 0.75,
    "TowerC": 0.12,      # distant skyline only
    # "Tower_08": 0.22,  # optional long slab; kept out this round for budget
}

K044_LOD1_MAIN = ["TowerF", "BldgLG_E", "Tower_02", "XL_Bldg_C", "BldgM_D", "BldgS_B", "MidRiseG"]


def export_k044() -> None:
    reset()
    import_fbx(K044_FBX)
    manifest = load_manifest("k044")
    all_meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    print("K044 imported meshes:", len(all_meshes))

    # assign clean materials before joining
    assign_materials(all_meshes, manifest)

    modules: dict[str, list[bpy.types.Object]] = {k: [] for k in K044_MODULES}
    for ob in all_meshes:
        for prefix in K044_MODULES:
            if ob.name.startswith(prefix + "_"):
                modules[prefix].append(ob)
                break

    lod0_objs = []
    lod0_originals: dict[str, bpy.types.Object] = {}
    for prefix, ratio in K044_MODULES.items():
        objs = modules[prefix]
        if not objs:
            print("WARN missing module", prefix)
            continue
        tris = sum(tri_count(o) for o in objs)
        ob = join_module(objs, prefix, ratio)
        print(f"  {prefix:12s} {tris:7d} -> {tri_count(ob):7d} tris")
        lod0_objs.append(ob)
        if prefix in K044_LOD1_MAIN:
            lod0_originals[prefix] = ob

    export_glb(lod0_objs, MODELS / "towers.glb")

    # LOD1: duplicate the LOD0 mesh, decimate further, use flat materials
    lod1_objs = []
    for prefix in K044_LOD1_MAIN:
        src = lod0_originals.get(prefix)
        if not src:
            continue
        dup = src.copy()
        dup.data = src.data.copy()
        bpy.context.collection.objects.link(dup)
        dup.name = "LOD1_" + prefix
        bpy.ops.object.select_all(action="DESELECT")
        dup.select_set(True)
        bpy.context.view_layer.objects.active = dup
        mod = dup.modifiers.new("lod1_decimate", "DECIMATE")
        mod.decimate_type = "COLLAPSE"
        mod.ratio = 0.30
        mod.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=mod.name)
        # swap to flat materials (matching names, LOD1_ prefix)
        assign_materials([dup], manifest, simple=True, prefix="LOD1_")
        print(f"  LOD1 {prefix:12s} -> {tri_count(dup):7d} tris")
        lod1_objs.append(dup)
    export_glb(lod1_objs, MODELS / "towers_lod1.glb")


# ---------------------------------------------------------------------------
# K003 storefronts + props
# ---------------------------------------------------------------------------

K003_MODULES = {
    # module prefix : decimation ratio
    "CyberShop_Sushi": 0.25,
    "CyberShop_StreetStore": 0.18,
    "CyberShop_Cofe": 0.22,
    "CyberProp_SodaMachine": 0.18,
    "CyberProp_Trash": 0.10,
    "CyberProp_Lamp": 0.50,
    "CyberProp_NewsPaperMachine": 0.45,
    "CyberProp_RoadBlock": 1.00,
    "CyberProp_AC": 0.45,
    "CyberProp_Dumpster": 0.12,
    "CyberProp_PhoneBooth": 0.85,
    "CyberProp_ShoppingCart": 0.25,
    "CyberProp_Tank": 0.40,
    "CyberProp_Generator": 1.00,
    "CyberAcc_ElectricWires": 1.00,
    "CyberAcc_Pipe": 1.00,
    "CyberAcc_Vent": 1.00,
    "CyberAcc_FuseBox_A": 1.00,
    "CyberAcc_TrashCan": 0.60,
    "CyberAcc_TrashBag_A": 0.15,
    "CyberAcc_Crate": 1.00,
    "CyberAcc_CardboardBox_A": 1.00,
    "CyberAcc_FireHydrant_A": 0.35,
    "CyberAcc_Tyre": 0.30,
    "CyberAcc_Pot_A": 0.7,
    "CyberAcc_AC_A": 0.7,
    "CyberAcc_AC_B": 0.8,
}


def export_k003() -> None:
    reset()
    import_fbx(K003_FBX)
    manifest = load_manifest("k003")
    all_meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    print("K003 imported meshes:", len(all_meshes))
    assign_materials(all_meshes, manifest)

    modules: dict[str, list[bpy.types.Object]] = {k: [] for k in K003_MODULES}
    for ob in all_meshes:
        for prefix in K003_MODULES:
            if ob.name.startswith("Desirefx_me_" + prefix + "_"):
                modules[prefix].append(ob)
                break

    out_objs = []
    for prefix, ratio in K003_MODULES.items():
        objs = modules[prefix]
        if not objs:
            print("WARN missing module", prefix)
            continue
        tris = sum(tri_count(o) for o in objs)
        ob = join_module(objs, prefix, ratio)
        print(f"  {prefix:30s} n={len(objs):3d} {tris:7d} -> {tri_count(ob):7d} tris")
        out_objs.append(ob)

    export_glb(out_objs, MODELS / "props.glb")


def main() -> None:
    args = sys.argv
    asset = args[args.index("--") + 1] if "--" in args else "k044"
    MODELS.mkdir(parents=True, exist_ok=True)
    if asset == "k044":
        export_k044()
    elif asset == "k003":
        export_k003()
    else:
        raise SystemExit(f"unknown asset {asset}")


if __name__ == "__main__":
    main()
