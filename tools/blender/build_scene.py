#!/usr/bin/env python3
"""Build the Anvil Landing port scene in Blender from the Kitbash3D K039 kit.

Run headless:
  Blender -b --python tools/blender/build_scene.py -- --stage build
  Blender -b --python tools/blender/build_scene.py -- --stage render --shots port pad vista

The source FBX is not committed. The script expects the extracted pack at
/tmp/kb3d_fbx/asset_1.fbx and the extracted posed-character .blend at
/tmp/ms_char/ModelshopGreebles_CHARACTERS_POSED_2K.blend. See assets-manifest.json
for the local source packs.
"""

from __future__ import annotations

import argparse
import math
import os
import re
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
TERRAIN_DIR = ROOT / "public" / "terrain-sample"
RENDER_DIR = ROOT / "docs"
TMP_RENDER = Path("/tmp/port_render")
APRON_Z = 28.0
PAD_SIZE = 60.0
APRON_W = 420.0
APRON_D = 260.0
SHIP_PATH = ROOT / "public" / "models" / "thunderbolt.glb"
KB_FBX = Path("/tmp/kb3d_fbx/asset_1.fbx")
KB_TEXTURES = Path("/tmp/kb3d_2k")
CHARACTER_BLEND = Path("/tmp/ms_char/ModelshopGreebles_CHARACTERS_POSED_2K.blend")
CHARACTER_TEXTURES = Path("/tmp/ms_char/textures")
SKY_HDR = Path("/tmp/terrain-assets/sky_4k.hdr")

# ---------------------------------------------------------------------------
# Generic helpers
# ---------------------------------------------------------------------------


def ensure_dirs() -> None:
    RENDER_DIR.mkdir(parents=True, exist_ok=True)
    TMP_RENDER.mkdir(parents=True, exist_ok=True)


def clear_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for data in (
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.images,
        bpy.data.lights,
        bpy.data.cameras,
        bpy.data.worlds,
        bpy.data.curves,
    ):
        for item in list(data):
            if item.users == 0:
                data.remove(item)


def srgb(path: Path, non_color: bool = False):
    if not path.exists():
        return None
    img = bpy.data.images.load(str(path), check_existing=True)
    if non_color:
        img.colorspace_settings.name = "Non-Color"
    else:
        img.colorspace_settings.name = "sRGB"
    return img


def tex_node(nodes, image, x: float, y: float, non_color: bool = False):
    node = nodes.new("ShaderNodeTexImage")
    node.image = image
    node.location = (x, y)
    if non_color:
        node.image.colorspace_settings.name = "Non-Color"
    return node


def principled_material(
    name: str,
    color_path: Path | None = None,
    normal_path: Path | None = None,
    rough_path: Path | None = None,
    metal_path: Path | None = None,
    emissive_path: Path | None = None,
    *,
    rough_value: float | None = None,
    metal_value: float | None = None,
    emission_strength: float = 0.0,
    base_tint: tuple[float, float, float, float] | None = None,
    normal_strength: float = 1.0,
    uv_scale: float | None = None,
):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    out.location = (520, 0)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (180, 0)
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    uv = None
    if uv_scale and any((color_path, normal_path, rough_path, metal_path)):
        uv = nt.nodes.new("ShaderNodeTexCoord")
        uv.location = (-900, 0)
        mapping = nt.nodes.new("ShaderNodeMapping")
        mapping.location = (-720, 0)
        mapping.inputs["Scale"].default_value = (uv_scale, uv_scale, 1.0)
        nt.links.new(uv.outputs["UV"], mapping.inputs["Vector"])

    def vector_socket(node):
        if uv_scale:
            return mapping.outputs["Vector"]
        if uv:
            return uv.outputs["UV"]
        return node.outputs["UV"]

    if color_path:
        img = srgb(color_path)
        node = tex_node(nt.nodes, img, -480, 260)
        if uv_scale:
            nt.links.new(mapping.outputs["Vector"], node.inputs["Vector"])
        if base_tint:
            mix = nt.nodes.new("ShaderNodeMixRGB")
            mix.blend_type = "MULTIPLY"
            mix.inputs["Fac"].default_value = 1.0
            mix.inputs["Color1"].default_value = base_tint
            mix.location = (-180, 260)
            nt.links.new(node.outputs["Color"], mix.inputs["Color2"])
            nt.links.new(mix.outputs["Color"], bsdf.inputs["Base Color"])
        else:
            nt.links.new(node.outputs["Color"], bsdf.inputs["Base Color"])
    if normal_path:
        nimg = srgb(normal_path, non_color=True)
        nnode = tex_node(nt.nodes, nimg, -480, 20, non_color=True)
        if uv_scale:
            nt.links.new(mapping.outputs["Vector"], nnode.inputs["Vector"])
        nmap = nt.nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = normal_strength
        nmap.location = (-160, 20)
        nt.links.new(nnode.outputs["Color"], nmap.inputs["Color"])
        nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    if rough_path:
        rimg = srgb(rough_path, non_color=True)
        rnode = tex_node(nt.nodes, rimg, -480, -220, non_color=True)
        if uv_scale:
            nt.links.new(mapping.outputs["Vector"], rnode.inputs["Vector"])
        nt.links.new(rnode.outputs["Color"], bsdf.inputs["Roughness"])
    if rough_value is not None:
        bsdf.inputs["Roughness"].default_value = rough_value
    if metal_path:
        mimg = srgb(metal_path, non_color=True)
        mnode = tex_node(nt.nodes, mimg, -480, -440, non_color=True)
        if uv_scale:
            nt.links.new(mapping.outputs["Vector"], mnode.inputs["Vector"])
        nt.links.new(mnode.outputs["Color"], bsdf.inputs["Metallic"])
    if metal_value is not None:
        bsdf.inputs["Metallic"].default_value = metal_value
    if emissive_path:
        eimg = srgb(emissive_path)
        enode = tex_node(nt.nodes, eimg, -480, -660)
        if uv_scale:
            nt.links.new(mapping.outputs["Vector"], enode.inputs["Vector"])
        nt.links.new(enode.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat




def add_detail_mix(mat, detail_path, scale, fac=0.45):
    """Multiply a tiled high-frequency detail map into an existing material."""
    if not detail_path.exists():
        return
    nt = mat.node_tree
    bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if not bsdf:
        return
    base_link = bsdf.inputs["Base Color"].links[0] if bsdf.inputs["Base Color"].links else None
    if not base_link:
        return
    uv = nt.nodes.new("ShaderNodeTexCoord"); uv.location = (-1000, 360)
    mapping = nt.nodes.new("ShaderNodeMapping"); mapping.location = (-820, 360)
    mapping.inputs["Scale"].default_value = (scale, scale, 1.0)
    nt.links.new(uv.outputs["UV"], mapping.inputs["Vector"])
    img = srgb(detail_path)
    node = tex_node(nt.nodes, img, -580, 360)
    nt.links.new(mapping.outputs["Vector"], node.inputs["Vector"])
    mix = nt.nodes.new("ShaderNodeMixRGB"); mix.blend_type = "MULTIPLY"; mix.location = (-120, 300)
    mix.inputs["Fac"].default_value = fac
    nt.links.new(base_link.from_socket, mix.inputs["Color1"])
    nt.links.new(node.outputs["Color"], mix.inputs["Color2"])
    nt.links.new(mix.outputs["Color"], bsdf.inputs["Base Color"])


def kit_material(name: str):
    base = KB_TEXTURES / f"{name}_basecolor.jpg"
    normal = KB_TEXTURES / f"{name}_normal.jpg"
    rough = KB_TEXTURES / f"{name}_roughness.jpg"
    metal = KB_TEXTURES / f"{name}_metallic.jpg"
    emissive = None
    for cand in (KB_TEXTURES / f"{name}_emissive.jpg", KB_TEXTURES / f"{name}_Emissive.jpg"):
        if cand.exists():
            emissive = cand
            break
    if name == "Glass":
        return principled_material(
            name,
            base,
            normal,
            rough,
            emissive,
            rough_value=0.08,
            metal_value=0.85,
            emission_strength=4.0,
            base_tint=(0.32, 0.42, 0.48, 1.0),
        )
    if name == "Lights":
        return principled_material(
            name,
            base,
            None,
            None,
            None,
            emissive or base,
            rough_value=0.4,
            metal_value=0.0,
            emission_strength=16.0,
        )
    if name in ("Metal", "MetalSilver", "Iron"):
        return principled_material(
            name,
            base,
            normal,
            rough,
            metal,
            rough_value=0.42,
            metal_value=0.8,
            normal_strength=1.0,
        )
    return principled_material(
        name,
        base,
        normal,
        rough,
        metal,
        rough_value=0.55,
        metal_value=0.25,
    )


def simple_pbr(
    name: str,
    color: tuple[float, float, float, float],
    roughness: float = 0.6,
    metallic: float = 0.0,
    emission: tuple[float, float, float, float] | None = None,
    emission_strength: float = 0.0,
):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    out.location = (300, 0)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (0, 0)
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission:
        bsdf.inputs["Emission Color"].default_value = emission
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def add_box(name, size, location, mat, rotation=(0, 0, 0), collection=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    obj.rotation_euler = rotation
    obj.data.materials.append(mat)
    if collection:
        for c in list(obj.users_collection):
            c.objects.unlink(obj)
        collection.objects.link(obj)
    return obj


def add_cylinder(name, radius, depth, location, mat, vertices=32, rotation=(0, 0, 0), collection=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = rotation
    obj.data.materials.append(mat)
    if collection:
        for c in list(obj.users_collection):
            c.objects.unlink(obj)
        collection.objects.link(obj)
    return obj


def make_collection(name: str):
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def join_objects(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    return obj


# ---------------------------------------------------------------------------
# Terrain
# ---------------------------------------------------------------------------


def build_terrain():
    meta = __import__("json").loads((TERRAIN_DIR / "meta.json").read_text())
    grid = meta["grid"]
    g = grid["width"]
    scale = meta["heightmap"]["height_scale_m"]
    raw = np.frombuffer((TERRAIN_DIR / "heights.r16").read_bytes(), dtype="<u2").astype(np.float32)
    heights = raw.reshape((g, g)) / 65535.0 * scale
    step = 2
    h = heights[::step, ::step]
    n = h.shape[0]
    coords = np.linspace(-meta["tile_size_m"] / 2, meta["tile_size_m"] / 2, g)[::step]
    verts = np.zeros((n * n, 3), dtype=np.float32)
    xx, yy = np.meshgrid(coords, coords)
    verts[:, 0] = xx.ravel()
    verts[:, 1] = yy.ravel()
    verts[:, 2] = h.ravel()
    faces = []
    for row in range(n - 1):
        for col in range(n - 1):
            a = row * n + col
            b = a + 1
            c = a + n + 1
            d = a + n
            faces.append((a, b, c, d))
    mesh = bpy.data.meshes.new("AnvilTerrain")
    mesh.from_pydata(verts.tolist(), [], faces)
    mesh.update()
    uv = mesh.uv_layers.new(name="UVMap")
    for li, loop in enumerate(mesh.loops):
        vi = loop.vertex_index
        uv.data[li].uv = ((verts[vi, 0] + 512) / 1024.0, (verts[vi, 1] + 512) / 1024.0)
    obj = bpy.data.objects.new("AnvilTerrain", mesh)
    bpy.context.scene.collection.objects.link(obj)
    for p in mesh.polygons:
        p.use_smooth = True

    mat = bpy.data.materials.new("Terrain_PBR")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial"); out.location = (700, 0)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled"); bsdf.location = (380, 0)
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    uvnode = nt.nodes.new("ShaderNodeTexCoord"); uvnode.location = (-1100, 0)
    # splat map
    splat_img = srgb(TERRAIN_DIR / "splat.png", non_color=True)
    splat = tex_node(nt.nodes, splat_img, -880, 200, non_color=True)
    nt.links.new(uvnode.outputs["UV"], splat.inputs["Vector"])
    # macro variation
    noise = nt.nodes.new("ShaderNodeTexNoise"); noise.location = (-880, -260)
    noise.inputs["Scale"].default_value = 2.5
    noise.inputs["Detail"].default_value = 5.0
    noise.inputs["Roughness"].default_value = 0.55
    nt.links.new(uvnode.outputs["UV"], noise.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB"); ramp.location = (-640, -260)
    ramp.color_ramp.elements[0].position = 0.3; ramp.color_ramp.elements[0].color = (0.72, 0.72, 0.72, 1)
    ramp.color_ramp.elements[1].position = 0.75; ramp.color_ramp.elements[1].color = (1.12, 1.10, 1.02, 1)
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])

    # four colour maps
    color_sockets = []
    for i, layer in enumerate(("grass", "dirt", "rock", "sand")):
        img = srgb(Path("/tmp/terrain-assets/2k") / f"{layer}_color.jpg")
        node = tex_node(nt.nodes, img, -880, 520 - i * 230)
        mapping = nt.nodes.new("ShaderNodeMapping"); mapping.location = (-1060, 520 - i * 230)
        mapping.inputs["Scale"].default_value = (46.0, 46.0, 1.0)
        nt.links.new(uvnode.outputs["UV"], mapping.inputs["Vector"])
        nt.links.new(mapping.outputs["Vector"], node.inputs["Vector"])
        color_sockets.append(node.outputs["Color"])

    # weighted sum via multiply + add
    weighted = []
    for i in range(4):
        mul = nt.nodes.new("ShaderNodeMixRGB"); mul.blend_type = "MULTIPLY"; mul.location = (-520, 520 - i * 190)
        mul.inputs["Fac"].default_value = 1.0
        sep = nt.nodes.new("ShaderNodeSeparateColor"); sep.location = (-700, 520 - i * 190)
        nt.links.new(splat.outputs["Color"], sep.inputs["Color"])
        channel = splat.outputs["Alpha"] if i == 3 else sep.outputs[i]
        nt.links.new(channel, mul.inputs["Color2"])
        nt.links.new(color_sockets[i], mul.inputs["Color1"])
        weighted.append(mul)
    add1 = nt.nodes.new("ShaderNodeMixRGB"); add1.blend_type = "ADD"; add1.location = (-300, 430)
    add1.inputs["Fac"].default_value = 1.0
    nt.links.new(weighted[0].outputs["Color"], add1.inputs["Color1"])
    nt.links.new(weighted[1].outputs["Color"], add1.inputs["Color2"])
    add2 = nt.nodes.new("ShaderNodeMixRGB"); add2.blend_type = "ADD"; add2.location = (-150, 330)
    add2.inputs["Fac"].default_value = 1.0
    nt.links.new(add1.outputs["Color"], add2.inputs["Color1"])
    nt.links.new(weighted[2].outputs["Color"], add2.inputs["Color2"])
    add3 = nt.nodes.new("ShaderNodeMixRGB"); add3.blend_type = "ADD"; add3.location = (0, 250)
    add3.inputs["Fac"].default_value = 1.0
    nt.links.new(add2.outputs["Color"], add3.inputs["Color1"])
    nt.links.new(weighted[3].outputs["Color"], add3.inputs["Color2"])
    tint = nt.nodes.new("ShaderNodeMixRGB"); tint.blend_type = "MULTIPLY"; tint.location = (160, 250)
    tint.inputs["Fac"].default_value = 1.0
    nt.links.new(add3.outputs["Color"], tint.inputs["Color1"])
    nt.links.new(ramp.outputs["Color"], tint.inputs["Color2"])
    nt.links.new(tint.outputs["Color"], bsdf.inputs["Base Color"])

    # normal map
    normal_img = srgb(TERRAIN_DIR / "normal.png", non_color=True)
    nnode = tex_node(nt.nodes, normal_img, -640, -520, non_color=True)
    nt.links.new(uvnode.outputs["UV"], nnode.inputs["Vector"])
    nmap = nt.nodes.new("ShaderNodeNormalMap"); nmap.location = (-300, -520)
    nmap.inputs["Strength"].default_value = 0.9
    nt.links.new(nnode.outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])

    # roughness follows the rock/grass mix
    rough = nt.nodes.new("ShaderNodeMixRGB"); rough.blend_type = "MIX"; rough.location = (-300, -250)
    rough.inputs["Color1"].default_value = (0.95, 0.95, 0.95, 1)
    rough.inputs["Color2"].default_value = (0.7, 0.7, 0.7, 1)
    # use blue channel (rock) as fac
    sep2 = nt.nodes.new("ShaderNodeSeparateColor"); sep2.location = (-700, -80)
    nt.links.new(splat.outputs["Color"], sep2.inputs["Color"])
    nt.links.new(sep2.outputs[2], rough.inputs["Fac"])
    nt.links.new(rough.outputs["Color"], bsdf.inputs["Roughness"])
    bsdf.inputs["Metallic"].default_value = 0.0

    # AO multiplies the base colour
    ao_img = srgb(TERRAIN_DIR / "ao.png", non_color=True)
    aon = tex_node(nt.nodes, ao_img, -640, -760, non_color=True)
    nt.links.new(uvnode.outputs["UV"], aon.inputs["Vector"])
    aomix = nt.nodes.new("ShaderNodeMixRGB"); aomix.blend_type = "MULTIPLY"; aomix.location = (300, 180)
    aomix.inputs["Fac"].default_value = 1.0
    nt.links.new(tint.outputs["Color"], aomix.inputs["Color1"])
    nt.links.new(aon.outputs["Color"], aomix.inputs["Color2"])
    nt.links.new(aomix.outputs["Color"], bsdf.inputs["Base Color"])

    obj.data.materials.append(mat)
    obj.visible_shadow = False
    return obj


def build_sea():
    mat = bpy.data.materials.new("SeaWater")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial"); out.location = (500, 0)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled"); bsdf.location = (240, 0)
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    bsdf.inputs["Base Color"].default_value = (0.012, 0.045, 0.058, 1)
    bsdf.inputs["Roughness"].default_value = 0.12
    bsdf.inputs["Metallic"].default_value = 0.05
    bsdf.inputs["IOR"].default_value = 1.333
    # animated-looking ripple bump
    coord = nt.nodes.new("ShaderNodeTexCoord"); coord.location = (-900, -100)
    noise = nt.nodes.new("ShaderNodeTexNoise"); noise.location = (-700, -100)
    noise.inputs["Scale"].default_value = 220.0
    noise.inputs["Detail"].default_value = 5.0
    noise.inputs["Roughness"].default_value = 0.58
    nt.links.new(coord.outputs["Object"], noise.inputs["Vector"])
    bump = nt.nodes.new("ShaderNodeBump"); bump.location = (-420, -100)
    bump.inputs["Strength"].default_value = 0.16
    bump.inputs["Distance"].default_value = 0.3
    nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    # foam near the coast
    shore_img = srgb(TERRAIN_DIR / "shore.png", non_color=True)
    shore = tex_node(nt.nodes, shore_img, -700, 250, non_color=True)
    # object coords in metres -> uv 0..1 over the 1024 m tile
    mapnode = nt.nodes.new("ShaderNodeMapping"); mapnode.location = (-880, 250)
    mapnode.inputs["Location"].default_value = (0.5, 0.5, 0.0)
    mapnode.inputs["Scale"].default_value = (1.0 / 1024.0, 1.0 / 1024.0, 1.0)
    nt.links.new(coord.outputs["Object"], mapnode.inputs["Vector"])
    nt.links.new(mapnode.outputs["Vector"], shore.inputs["Vector"])
    sep = nt.nodes.new("ShaderNodeSeparateColor"); sep.location = (-460, 250)
    nt.links.new(shore.outputs["Color"], sep.inputs["Color"])
    foam = nt.nodes.new("ShaderNodeMixRGB"); foam.blend_type = "MIX"; foam.location = (0, 220)
    foam.inputs["Color1"].default_value = (0.012, 0.045, 0.058, 1)
    foam.inputs["Color2"].default_value = (0.75, 0.82, 0.8, 1)
    nt.links.new(sep.outputs[1], foam.inputs["Fac"])
    nt.links.new(foam.outputs["Color"], bsdf.inputs["Base Color"])
    bpy.ops.mesh.primitive_plane_add(size=20000, location=(0, 0, 0.12))
    sea = bpy.context.object
    sea.name = "Sea"
    sea.data.materials.append(mat)
    sea.visible_shadow = False
    return sea


# ---------------------------------------------------------------------------
# Port surfaces
# ---------------------------------------------------------------------------


def build_apron():
    col = make_collection("PortSurface")
    # apron
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, APRON_Z + 0.02))
    apron = bpy.context.object
    apron.name = "Apron"
    apron.scale = (APRON_W, APRON_D, 1)  # plane size 1 -> dimensions 420 x 260
    apron.data.materials.append(
        principled_material(
            "ApronPBR",
            Path("/tmp/port_tex/apron_color.jpg"),
            None,
            Path("/tmp/port_tex/apron_rough.jpg"),
            rough_value=0.78,
            metal_value=0.0,
            uv_scale=1.0,
        )
    )
    # normal detail uses a second mapping via a separate material helper; add it manually
    mat = apron.data.materials[0]
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    texcoord = nt.nodes.new("ShaderNodeTexCoord"); texcoord.location = (-900, -200)
    mapping = nt.nodes.new("ShaderNodeMapping"); mapping.location = (-720, -200)
    mapping.inputs["Scale"].default_value = (42.0, 26.0, 1.0)
    nt.links.new(texcoord.outputs["UV"], mapping.inputs["Vector"])
    nimg = srgb(Path("/tmp/terrain-assets/2k/concrete_normal.jpg"), non_color=True)
    nnode = tex_node(nt.nodes, nimg, -480, -200, non_color=True)
    nt.links.new(mapping.outputs["Vector"], nnode.inputs["Vector"])
    nmap = nt.nodes.new("ShaderNodeNormalMap"); nmap.location = (-180, -200)
    nmap.inputs["Strength"].default_value = 0.6
    nt.links.new(nnode.outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    add_detail_mix(mat, Path("/tmp/terrain-assets/2k/concrete_color.jpg"), 105.0, 0.42)
    for c in list(apron.users_collection):
        c.objects.unlink(apron)
    col.objects.link(apron)

    # pad, 4 cm above the apron to avoid z fighting
    bpy.ops.mesh.primitive_plane_add(size=PAD_SIZE, location=(0, 0, APRON_Z + 0.08))
    pad = bpy.context.object
    pad.name = "TLOFPad"
    pad.data.materials.append(
        principled_material(
            "TLOFPadPBR",
            Path("/tmp/port_tex/pad_color.jpg"),
            None,
            Path("/tmp/port_tex/pad_rough.jpg"),
            rough_value=0.72,
            metal_value=0.0,
            uv_scale=1.0,
        )
    )
    mat = pad.data.materials[0]
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    texcoord = nt.nodes.new("ShaderNodeTexCoord"); texcoord.location = (-900, -200)
    mapping = nt.nodes.new("ShaderNodeMapping"); mapping.location = (-720, -200)
    mapping.inputs["Scale"].default_value = (14.0, 14.0, 1.0)
    nt.links.new(texcoord.outputs["UV"], mapping.inputs["Vector"])
    nimg = srgb(Path("/tmp/terrain-assets/2k/concrete_normal.jpg"), non_color=True)
    nnode = tex_node(nt.nodes, nimg, -480, -200, non_color=True)
    nt.links.new(mapping.outputs["Vector"], nnode.inputs["Vector"])
    nmap = nt.nodes.new("ShaderNodeNormalMap"); nmap.location = (-180, -200)
    nmap.inputs["Strength"].default_value = 0.7
    nt.links.new(nnode.outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    add_detail_mix(mat, Path("/tmp/terrain-assets/2k/concrete_color.jpg"), 20.0, 0.40)
    for c in list(pad.users_collection):
        c.objects.unlink(pad)
    col.objects.link(pad)

    # thin steel lip around the TLOF
    lip_mat = simple_pbr("PadLip", (0.07, 0.08, 0.085, 1), 0.32, 0.85)
    for name, size, loc in [
        ("PadLipW", (0.32, PAD_SIZE + 0.32, 0.18), (-PAD_SIZE / 2, 0, APRON_Z + 0.09)),
        ("PadLipE", (0.32, PAD_SIZE + 0.32, 0.18), (PAD_SIZE / 2, 0, APRON_Z + 0.09)),
        ("PadLipN", (PAD_SIZE + 0.32, 0.32, 0.18), (0, -PAD_SIZE / 2, APRON_Z + 0.09)),
        ("PadLipS", (PAD_SIZE + 0.32, 0.32, 0.18), (0, PAD_SIZE / 2, APRON_Z + 0.09)),
    ]:
        add_box(name, size, loc, lip_mat, collection=col)

    # concrete curb / edge upstand around the apron
    curb_mat = simple_pbr("ApronCurb", (0.23, 0.235, 0.23, 1), 0.82, 0.0)
    add_box("CurbW", (0.8, APRON_D + 0.8, 0.35), (-APRON_W / 2, 0, APRON_Z + 0.17), curb_mat, collection=col)
    add_box("CurbE", (0.8, APRON_D + 0.8, 0.35), (APRON_W / 2, 0, APRON_Z + 0.17), curb_mat, collection=col)
    add_box("CurbN", (APRON_W + 0.8, 0.8, 0.35), (0, -APRON_D / 2, APRON_Z + 0.17), curb_mat, collection=col)
    add_box("CurbS", (APRON_W + 0.8, 0.8, 0.35), (0, APRON_D / 2, APRON_Z + 0.17), curb_mat, collection=col)

    # emissive perimeter strips
    strip_mat = simple_pbr("PadStrip", (0.4, 0.65, 0.75, 1), 0.35, 0.0, (0.16, 0.45, 0.58, 1), 2.2)
    for name, size, loc in [
        ("PadStripW", (0.12, PAD_SIZE - 4, 0.04), (-PAD_SIZE / 2 + 1.1, 0, APRON_Z + 0.24)),
        ("PadStripE", (0.12, PAD_SIZE - 4, 0.04), (PAD_SIZE / 2 - 1.1, 0, APRON_Z + 0.24)),
        ("PadStripN", (PAD_SIZE - 4, 0.12, 0.04), (0, -PAD_SIZE / 2 + 1.1, APRON_Z + 0.24)),
        ("PadStripS", (PAD_SIZE - 4, 0.12, 0.04), (0, PAD_SIZE / 2 - 1.1, APRON_Z + 0.24)),
    ]:
        add_box(name, size, loc, strip_mat, collection=col)
    return col


# ---------------------------------------------------------------------------
# Kitbash buildings
# ---------------------------------------------------------------------------


class Kit:
    def __init__(self):
        self.objects = []
        self.groups: dict[str, list] = {}

    def load(self):
        bpy.ops.import_scene.fbx(filepath=str(KB_FBX))
        for o in bpy.context.scene.objects:
            if o.type != "MESH":
                continue
            if not o.name.startswith("Desirefx.me_"):
                continue
            self.objects.append(o)
            base = re.sub(
                r"_(PanelsWhite|PanelsBlack|PanelsLightBlue|PanelsBrown|Panels2|MetalSilver|Metal|Iron|Glass|Floor|Tech|lights)$",
                "",
                o.name.replace("Desirefx.me_", ""),
            )
            self.groups.setdefault(base, []).append(o)
        # Build the material library once, replacing the legacy import materials.
        for name in [
            "Floor", "Glass", "Iron", "Lights", "Metal", "MetalSilver",
            "Panels2", "PanelsBlack", "PanelsBrown", "PanelsLightBlue",
            "PanelsWhite", "Tech",
        ]:
            old = bpy.data.materials.get(name)
            new = kit_material(name)
            if old and old != new:
                old.user_remap(new)
                bpy.data.materials.remove(old)

    def group_objects(self, prefix: str):
        return [o for o in self.objects if re.sub(r"_(PanelsWhite|PanelsBlack|PanelsLightBlue|PanelsBrown|Panels2|MetalSilver|Metal|Iron|Glass|Floor|Tech|lights)$", "", o.name.replace("Desirefx.me_", "")).startswith(prefix)]

    def place(self, prefix: str, x: float, y: float, z: float, angle_deg: float, collection_name: str | None = None):
        members = self.group_objects(prefix)
        if not members:
            print(f"[kit] missing {prefix}")
            return None
        lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
        for o in members:
            for c in o.bound_box:
                w = o.matrix_world @ Vector(c)
                lo = Vector((min(lo[i], w[i]) for i in range(3)))
                hi = Vector((max(hi[i], w[i]) for i in range(3)))
        cx = (lo.x + hi.x) * 0.5
        cy = (lo.y + hi.y) * 0.5
        base_z = lo.z
        angle = math.radians(angle_deg)
        rot = Matrix.Rotation(angle, 4, "Z")
        M = Matrix.Translation((x, y, z)) @ rot @ Matrix.Translation((-cx, -cy, -base_z))
        col = make_collection(collection_name or prefix)
        for o in members:
            o.matrix_world = M @ o.matrix_world
            for c in list(o.users_collection):
                c.objects.unlink(o)
            col.objects.link(o)
        print(f"[kit] placed {prefix} ({len(members)} meshes) at {x},{y}")
        return col


# ---------------------------------------------------------------------------
# Custom port props
# ---------------------------------------------------------------------------




def build_vegetation(col):
    """Scatter optimized procedural conifers, broadleaf trees and shrubs."""
    import numpy as np
    meta = __import__("json").loads((TERRAIN_DIR / "meta.json").read_text())
    g = meta["grid"]["width"]
    scale_m = meta["heightmap"]["height_scale_m"]
    raw = np.frombuffer((TERRAIN_DIR / "heights.r16").read_bytes(), dtype="<u2").astype(np.float32)
    heights = (raw.reshape((g, g)) / 65535.0 * scale_m)
    spacing = meta["grid"]["spacing_m"]
    half = meta["tile_size_m"] / 2.0

    def height_at(x, z):
        gx = min(max((x + half) / spacing, 0), g - 1.0001)
        gz = min(max((z + half) / spacing, 0), g - 1.0001)
        x0 = int(gx); z0 = int(gz)
        tx = gx - x0; tz = gz - z0
        x1 = min(x0 + 1, g - 1); z1 = min(z0 + 1, g - 1)
        return float(
            heights[z0, x0] * (1 - tx) * (1 - tz)
            + heights[z0, x1] * tx * (1 - tz)
            + heights[z1, x0] * (1 - tx) * tz
            + heights[z1, x1] * tx * tz
        )

    bark = simple_pbr("TreeBark", (0.10, 0.065, 0.038, 1), 0.82, 0.0)
    foliage_a = simple_pbr("ConiferGreen", (0.035, 0.065, 0.028, 1), 0.88, 0.0)
    foliage_b = simple_pbr("BroadleafGreen", (0.075, 0.105, 0.035, 1), 0.82, 0.0)
    foliage_c = simple_pbr("ShrubGreen", (0.060, 0.085, 0.038, 1), 0.9, 0.0)

    temp = make_collection("_veg_temp")

    def add_prim(kind, **kwargs):
        if kind == "cylinder":
            bpy.ops.mesh.primitive_cylinder_add(vertices=6, **kwargs)
        elif kind == "cone":
            bpy.ops.mesh.primitive_cone_add(vertices=7, **kwargs)
        elif kind == "ico":
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, **kwargs)
        obj = bpy.context.object
        for c in list(obj.users_collection):
            c.objects.unlink(obj)
        temp.objects.link(obj)
        return obj

    def prototype_conifer():
        parts = []
        trunk = add_prim("cylinder", radius=0.32, depth=4.2, location=(0, 0, 2.1))
        trunk.data.materials.append(bark); parts.append(trunk)
        for i, (r, d, z) in enumerate([(3.4, 4.6, 4.8), (2.7, 4.0, 7.2), (1.9, 3.4, 9.8)]):
            cone = add_prim("cone", radius1=r, radius2=0.0, depth=d, location=(0, 0, z))
            cone.data.materials.append(foliage_a); parts.append(cone)
        return join_objects(parts, "_proto_conifer")

    def prototype_broadleaf():
        parts = []
        trunk = add_prim("cylinder", radius=0.42, depth=4.4, location=(0, 0, 2.2))
        trunk.data.materials.append(bark); parts.append(trunk)
        for i, (r, z) in enumerate([(3.4, 5.8), (2.7, 7.4), (1.9, 8.6)]):
            blob = add_prim("ico", radius=r, location=(0.35 * (i - 1), 0.25 * i, z))
            blob.scale = (1.0, 0.85, 0.75)
            blob.data.materials.append(foliage_b); parts.append(blob)
        return join_objects(parts, "_proto_broadleaf")

    def prototype_shrub():
        parts = []
        for i, (r, z, x, y) in enumerate([(1.15, 0.95, 0, 0), (0.8, 1.55, 0.6, 0.2), (0.65, 1.2, -0.55, -0.15)]):
            blob = add_prim("ico", radius=r, location=(x, y, z))
            blob.data.materials.append(foliage_c); parts.append(blob)
        return join_objects(parts, "_proto_shrub")

    proto_conifer = prototype_conifer()
    proto_broadleaf = prototype_broadleaf()
    proto_shrub = prototype_shrub()
    for p in (proto_conifer, proto_broadleaf, proto_shrub):
        for c in list(p.users_collection):
            c.objects.unlink(p)
        p.hide_render = True

    rng = np.random.default_rng(20261116)
    placed = {0: [], 1: [], 2: []}
    attempts = 0
    targets = [320, 120, 110]
    while attempts < 5000 and any(len(placed[i]) < targets[i] for i in range(3)):
        attempts += 1
        x = rng.uniform(-500, 500)
        z = rng.uniform(-500, 500)
        # keep the apron clear
        if abs(x) < 235 and abs(z) < 155:
            continue
        # favour the east ridge and coastal margins
        if rng.random() < 0.35 and x < 180:
            continue
        h = height_at(x, z)
        if h < 3.0 or h > 155.0:
            continue
        # skip steep cliffs (approx slope via samples)
        sx = height_at(x + 2, z) - height_at(x - 2, z)
        sz = height_at(x, z + 2) - height_at(x, z - 2)
        slope = math.hypot(sx, sz) / 4.0
        if slope > 0.85:
            continue
        dist = math.hypot(x, z)
        if dist > 520:
            continue
        variant = 0
        r = rng.random()
        if r < 0.70:
            variant = 0
        elif r < 0.90:
            variant = 1
        else:
            variant = 2
        if len(placed[variant]) >= targets[variant]:
            variant = 0 if len(placed[0]) < targets[0] else 1 if len(placed[1]) < targets[1] else 2
            if len(placed[variant]) >= targets[variant]:
                continue
        placed[variant].append((x, z, h, rng.uniform(0.65, 1.45), rng.uniform(0, math.tau)))

    for variant, entries in placed.items():
        proto = (proto_conifer, proto_broadleaf, proto_shrub)[variant]
        objs = []
        for i, (x, z, h, sc, rot) in enumerate(entries):
            dup = proto.copy()
            dup.data = proto.data
            dup.name = f"_veg_{variant}_{i}"
            bpy.context.scene.collection.objects.link(dup)
            dup.location = (x, z, h - 0.25)
            dup.scale = (sc, sc, sc)
            dup.rotation_euler = (0, 0, rot)
            dup.hide_render = False
            objs.append(dup)
            for c in list(dup.users_collection):
                c.objects.unlink(dup)
            col.objects.link(dup)
        # join variant instances into one drawable object
        if objs:
            joined = join_objects(objs, f"Vegetation_{['Conifer','Broadleaf','Shrub'][variant]}")
            joined.visible_shadow = False
    # remove prototypes
    for p in (proto_conifer, proto_broadleaf, proto_shrub):
        bpy.data.objects.remove(p, do_unlink=True)
    bpy.data.collections.remove(temp)
    print(f"[veg] placed {sum(len(v) for v in placed.values())} plants")


def build_fuel_truck(col):
    white = simple_pbr("TruckWhite", (0.62, 0.64, 0.6, 1), 0.55, 0.2)
    orange = simple_pbr("TruckOrange", (0.62, 0.20, 0.035, 1), 0.5, 0.2)
    dark = simple_pbr("TruckDark", (0.055, 0.06, 0.065, 1), 0.55, 0.6)
    glass = simple_pbr("TruckGlass", (0.02, 0.08, 0.10, 1), 0.12, 0.8)
    tire = simple_pbr("TruckTire", (0.02, 0.02, 0.02, 1), 0.85, 0.0)
    add_box("TruckChassis", (7.2, 2.3, 0.5), (0, 0, 0.7), dark, collection=col)
    add_box("TruckCab", (2.4, 2.3, 2.4), (2.2, 0, 1.95), white, collection=col)
    add_box("TruckCabGlass", (0.06, 1.9, 1.1), (3.42, 0, 2.2), glass, collection=col)
    add_box("TruckBumper", (0.25, 2.3, 0.35), (3.55, 0, 0.75), dark, collection=col)
    add_cylinder("TruckTank", 1.35, 5.6, (-1.1, 0, 2.25), orange, vertices=24, rotation=(0, math.pi / 2, 0), collection=col)
    for sx in (-2.3, 2.2):
        for sy in (-1.05, 1.05):
            add_cylinder(f"TruckWheel{sx}{sy}", 0.6, 0.4, (sx, sy, 0.6), tire, vertices=16, rotation=(math.pi / 2, 0, 0), collection=col)
    # light bar
    add_box("TruckBeacon", (0.7, 0.18, 0.14), (2.2, 0, 3.2), orange, collection=col)
    # place at 20 deg, near the pad edge
    group = make_collection("FuelTruck")
    members = [o for o in col.objects if o.name.startswith("Truck")]
    for o in members:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        group.objects.link(o)
    root = bpy.data.objects.new("FuelTruckRoot", None)
    bpy.context.scene.collection.objects.link(root)
    for o in members:
        o.parent = root
    root.location = (-45, -14, APRON_Z + 0.16)
    root.rotation_euler = (0, 0, math.radians(96)) 



def build_radar_dish(col):
    steel = simple_pbr("RadarSteel", (0.38, 0.40, 0.41, 1), 0.38, 0.65)
    dark = simple_pbr("RadarDark", (0.04, 0.05, 0.06, 1), 0.5, 0.7)
    add_cylinder("RadarMast", 0.14, 3.4, (-45, -44, APRON_Z + 18.0), steel, vertices=12, collection=col)
    # shallow parabola approximated with a cone
    bpy.ops.mesh.primitive_cone_add(vertices=40, radius1=2.0, radius2=0.25, depth=0.5, location=(-45, -44, APRON_Z + 19.8), rotation=(math.radians(62), 0, 0))
    dish = bpy.context.object
    dish.name = "RadarDish"
    dish.data.materials.append(steel)
    for c in list(dish.users_collection):
        c.objects.unlink(dish)
    col.objects.link(dish)
    add_cylinder("RadarFeed", 0.05, 1.8, (-45, -42.8, APRON_Z + 20.0), dark, vertices=8, rotation=(math.radians(62), 0, 0), collection=col)
    beacon = simple_pbr("RadarBeacon", (1, 0.05, 0.02, 1), 0.4, 0.0, (3.0, 0.02, 0.01, 1), 12.0)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=6, radius=0.18, location=(-45, -44, APRON_Z + 21.7))
    obj = bpy.context.object
    obj.name = "RadarBeacon"
    obj.data.materials.append(beacon)
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    col.objects.link(obj)


def build_puddle(col):
    mat = bpy.data.materials.new("PuddleWater")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial"); out.location = (300, 0)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled"); bsdf.location = (0, 0)
    bsdf.inputs["Base Color"].default_value = (0.008, 0.016, 0.02, 1)
    bsdf.inputs["Roughness"].default_value = 0.24
    bsdf.inputs["Metallic"].default_value = 0.05
    img = bpy.data.images.load("/tmp/port_tex/puddle_alpha.png", check_existing=True)
    node = nt.nodes.new("ShaderNodeTexImage"); node.image = img; node.location = (-400, 0)
    nt.links.new(node.outputs["Alpha"], bsdf.inputs["Alpha"])
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    try:
        mat.surface_render_method = "DITHERED"
        mat.use_transparent_shadow = True
    except Exception:
        pass
    bpy.ops.mesh.primitive_plane_add(size=1, location=(-2, 2, APRON_Z + 0.13))
    obj = bpy.context.object
    obj.name = "Puddle"
    obj.scale = (10, 6, 1)
    obj.data.materials.append(mat)
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    col.objects.link(obj)


def build_containers(col, mat_metal, mat_orange, mat_teal):
    rng = np.random.default_rng(9)
    positions = [(-54, 2, 0), (-54, 5.5, 0), (-54, 9, 0), (-48, 2, 0), (-48, 5.5, 1)]
    for i, (x, y, layer) in enumerate(positions):
        mat = [mat_orange, mat_teal, mat_metal][i % 3]
        z = APRON_Z + 0.16 + layer * 2.62
        add_box(f"Container{i}", (12.2, 2.44, 2.6), (x, y, z + 1.3), mat, collection=col)
        # corrugation ribs
        for k in range(8):
            add_box(f"Container{i}Rib{k}", (0.08, 2.5, 2.5), (x - 5.3 + k * 1.5, y, z + 1.3), mat_metal, collection=col)
        # corner castings
        for sx in (-1, 1):
            for sy in (-1, 1):
                add_box(f"Container{i}Cast{sx}{sy}", (0.25, 0.25, 0.24), (x + sx * 6, y + sy * 1.15, z + 0.12), mat_metal, collection=col)


def build_fuel_farm(col):
    steel = simple_pbr("TankSteel", (0.34, 0.36, 0.36, 1), 0.42, 0.8)
    dark = simple_pbr("TankDark", (0.09, 0.1, 0.11, 1), 0.55, 0.7)
    rust = simple_pbr("TankRust", (0.35, 0.17, 0.08, 1), 0.78, 0.15)
    for i, (x, y) in enumerate([(82, -8), (82, 10), (100, 1)]):
        add_cylinder(f"FuelTank{i}", 7.2, 13.0, (x, y, APRON_Z + 6.6), steel, vertices=48, collection=col)
        add_cylinder(f"FuelTank{i}Cap", 7.35, 0.5, (x, y, APRON_Z + 13.1), dark, vertices=48, collection=col)
        for k in range(3):
            bpy.ops.mesh.primitive_torus_add(
                major_radius=7.28, minor_radius=0.12,
                location=(x, y, APRON_Z + 3.5 + k * 3.4),
            )
            ring = bpy.context.object
            ring.name = f"FuelTank{i}Ring{k}"
            ring.data.materials.append(dark)
            for c in list(ring.users_collection):
                c.objects.unlink(ring)
            col.objects.link(ring)
        # ladder
        for k in range(7):
            add_box(f"Tank{i}Ladder{k}", (0.12, 0.75, 0.08), (x - 7.7, y, APRON_Z + 0.7 + k * 1.7), dark, collection=col)
        add_box(f"Tank{i}Pipe", (0.3, 0.3, 1.2), (x, y + 6.8, APRON_Z + 0.6), rust, collection=col)
    # pipe rack from tanks toward terminal
    add_box("PipeRack", (30, 2.0, 0.35), (66, 1, APRON_Z + 4.2), steel, collection=col)
    for k in range(4):
        add_box(f"PipeSupport{k}", (0.22, 0.22, 4.1), (54 + k * 8, 1, APRON_Z + 2.0), dark, collection=col)
    for k in range(3):
        add_cylinder(f"Pipe{k}", 0.16, 30, (66, 1 + (k - 1) * 0.5, APRON_Z + 4.6), rust, vertices=12, rotation=(0, math.pi / 2, 0), collection=col)


def build_gantry(col):
    steel = simple_pbr("GantrySteel", (0.12, 0.13, 0.14, 1), 0.38, 0.85)
    accent = simple_pbr("GantryAccent", (0.55, 0.27, 0.06, 1), 0.45, 0.55)
    # two 24 m towers and a 34 m truss bridge
    for x in (54, 78):
        for sx in (-1, 1):
            for sy in (-1, 1):
                add_box(f"GantryLeg{x}{sx}{sy}", (0.6, 0.6, 24), (x + sx * 1.4, -18 + sy * 1.4, APRON_Z + 12), steel, collection=col)
        for k in range(8):
            add_box(f"GantryBrace{x}{k}", (0.22, 3.1, 0.22), (x, -18, APRON_Z + 1.5 + k * 2.9), steel, rotation=(0, 0, k % 2 * math.pi / 2), collection=col)
        add_box(f"GantryCap{x}", (4.2, 4.2, 0.5), (x, -62, APRON_Z + 24.2), accent, collection=col)
    # horizontal truss
    for k in range(10):
        add_box(f"GantryChordTop{k}", (3.8, 0.3, 0.3), (55 + k * 3.1, -62, APRON_Z + 22.4), steel, collection=col)
        add_box(f"GantryChordBot{k}", (3.8, 0.3, 0.3), (55 + k * 3.1, -62, APRON_Z + 18.2), steel, collection=col)
        add_box(f"GantryDiag{k}", (0.18, 0.18, 4.6), (55 + k * 3.1 + 1.5, -62, APRON_Z + 20.3), steel, rotation=(0, math.radians(32 if k % 2 == 0 else -32), 0), collection=col)
    add_box("GantryTrolley", (2.2, 3.6, 1.2), (66, -62, APRON_Z + 18.8), accent, collection=col)
    add_box("GantryHookCable", (0.08, 0.08, 7.0), (66, -62, APRON_Z + 15.0), steel, collection=col)
    add_box("GantryHook", (0.8, 0.5, 0.6), (66, -62, APRON_Z + 11.3), accent, collection=col)
    # red aviation beacons
    beacon = simple_pbr("AviationRed", (1, 0.05, 0.02, 1), 0.4, 0.0, (3.0, 0.02, 0.01, 1), 16.0)
    for x in (54, 78):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=0.3, location=(x, -62, APRON_Z + 24.7))
        obj = bpy.context.object
        obj.name = f"Beacon{x}"
        obj.data.materials.append(beacon)
        for c in list(obj.users_collection):
            c.objects.unlink(obj)
        col.objects.link(obj)


def build_floodlights(col):
    pole_mat = simple_pbr("FloodPole", (0.1, 0.11, 0.12, 1), 0.45, 0.8)
    lamp_mat = simple_pbr("FloodLamp", (1, 0.94, 0.82, 1), 0.25, 0.0, (1.0, 0.83, 0.58, 1), 18.0)
    positions = [(-56, -26), (56, -26), (-56, 38), (56, 38)]
    for i, (x, y) in enumerate(positions):
        add_cylinder(f"FloodPole{i}", 0.22, 21.0, (x, y, APRON_Z + 10.5), pole_mat, vertices=10, collection=col)
        add_box(f"FloodHead{i}", (2.8, 0.7, 1.2), (x, y, APRON_Z + 21.1), pole_mat, collection=col)
        for k in range(3):
            add_box(f"FloodLens{i}{k}", (0.65, 0.12, 0.85), (x - 0.9 + k * 0.9, y + 0.4, APRON_Z + 21.1), lamp_mat, collection=col)
        # fill light for the scene (soft, front)
        light_data = bpy.data.lights.new(f"FloodLightData{i}", type="AREA")
        light_data.energy = 900.0
        light_data.shape = "RECTANGLE"
        light_data.size = 6.0
        light_data.size_y = 2.0
        light_data.color = (1.0, 0.78, 0.5)
        light = bpy.data.objects.new(f"FloodLight{i}", light_data)
        light.location = (x, y - 4, APRON_Z + 20.0)
        light.rotation_euler = (math.radians(20), 0, 0)
        col.objects.link(light)


def build_papi_and_lights(col):
    housing = simple_pbr("LightHousing", (0.06, 0.07, 0.075, 1), 0.4, 0.7)
    red = simple_pbr("PAPIRed", (1, 0.03, 0.01, 1), 0.25, 0.0, (3.0, 0.02, 0.005, 1), 22.0)
    white = simple_pbr("PAPIWhite", (1, 0.95, 0.82, 1), 0.25, 0.0, (1.0, 0.82, 0.55, 1), 22.0)
    green = simple_pbr("PadGreen", (0.08, 0.7, 0.28, 1), 0.35, 0.0, (0.04, 1.2, 0.35, 1), 7.0)
    for i, y in enumerate((-24, -16, 16, 24)):
        add_box(f"PAPIBase{i}", (1.6, 2.0, 0.7), (-42, y, APRON_Z + 0.4), housing, collection=col)
        for k in range(2):
            bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.23, depth=0.12, location=(-41.4, y - 0.4 + k * 0.8, APRON_Z + 0.82), rotation=(0, math.pi / 2, 0))
            obj = bpy.context.object
            obj.name = f"PAPI{i}{k}"
            obj.data.materials.append(red if i < 2 else white)
            for c in list(obj.users_collection):
                c.objects.unlink(obj)
            col.objects.link(obj)
    # green perimeter marker lights
    for i in range(16):
        for sx, sy in [(-1, -1), (1, -1), (-1, 1), (1, 1)]:
            if i in (0, 15) or (sx == -1 and i % 2 == 0) or (sx == 1 and i % 2 == 1):
                pass
        x = -30 + i * 4
        for y in (-30, 30):
            if i % 2 == 0:
                bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=6, radius=0.11, location=(x, y, APRON_Z + 0.32))
                obj = bpy.context.object
                obj.name = f"PadGreen{i}_{y}"
                obj.data.materials.append(green)
                for c in list(obj.users_collection):
                    c.objects.unlink(obj)
                col.objects.link(obj)
    # approach lights on the west centreline
    for i in range(7):
        x = -55 - i * 22
        add_cylinder(f"ApproachPole{i}", 0.07, 0.8, (x, 0, APRON_Z + 0.4), housing, vertices=8, collection=col)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=8, radius=0.2, location=(x, 0, APRON_Z + 0.95))
        obj = bpy.context.object
        obj.name = f"ApproachLamp{i}"
        obj.data.materials.append(white)
        for c in list(obj.users_collection):
            c.objects.unlink(obj)
        col.objects.link(obj)


def build_windsock(col):
    pole = simple_pbr("WindsockPole", (0.1, 0.11, 0.12, 1), 0.5, 0.8)
    sock = simple_pbr("Windsock", (0.85, 0.22, 0.04, 1), 0.72, 0.0)
    add_cylinder("WindsockPole", 0.08, 4.0, (-46, 24, APRON_Z + 2.0), pole, vertices=10, collection=col)
    bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=0.38, radius2=0.08, depth=1.9, location=(-46, 25.0, APRON_Z + 3.75), rotation=(0, math.radians(78), 0))
    obj = bpy.context.object
    obj.name = "Windsock"
    obj.data.materials.append(sock)
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    col.objects.link(obj)


def build_roof_greebles(kit: Kit, collections):
    """Sprinkle a few K039 prop meshes on roofs and service areas."""
    props = ["Tank_A", "Vent_A", "Antena_A", "Roof_Panel_A", "Pipe_A", "Box_A", "Chest_A"]
    targets = [
        (-18, -80, APRON_Z + 14.5),
        (30, -78, APRON_Z + 12.0),
        (-78, -40, APRON_Z + 12.0),
        (92, 14, APRON_Z + 6.5),
        (-92, 14, APRON_Z + 6.5),
    ]
    rng = np.random.default_rng(41)
    for ti, (x, y, z) in enumerate(targets):
        for pi, prop in enumerate(props):
            members = kit.group_objects(prop)
            if not members:
                continue
            src = members[0]
            dup = src.copy()
            dup.data = src.data.copy()
            dup.name = f"Roof_{prop}_{ti}_{pi}"
            bpy.context.scene.collection.objects.link(dup)
            # props are modelled at their showcase location; move the bounding box centre
            lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
            for c in dup.bound_box:
                w = dup.matrix_world @ Vector(c)
                lo = Vector((min(lo[i], w[i]) for i in range(3)))
                hi = Vector((max(hi[i], w[i]) for i in range(3)))
            scale = 5.0 if prop in ("Tank_A", "Vent_A", "Roof_Panel_A") else 3.0
            cx = (lo.x + hi.x) * 0.5
            cy = (lo.y + hi.y) * 0.5
            cz = (lo.z + hi.z) * 0.5
            M = Matrix.Translation((x + rng.uniform(-4, 4), y + rng.uniform(-3, 3), z + 0.3)) @ Matrix.Diagonal((scale, scale, scale, 1.0)) @ Matrix.Translation((-cx, -cy, -cz))
            dup.matrix_world = M @ dup.matrix_world
            for c in list(dup.users_collection):
                c.objects.unlink(dup)
            collections[0].objects.link(dup)


# ---------------------------------------------------------------------------
# Ship, character, signage
# ---------------------------------------------------------------------------


def import_ship(col):
    bpy.ops.import_scene.gltf(filepath=str(SHIP_PATH))
    imported = [o for o in bpy.context.selected_objects if o.type == "MESH"]
    if not imported:
        imported = [o for o in bpy.context.scene.objects if o.type == "MESH" and o.name.startswith("A_30")]
    bpy.ops.object.select_all(action="DESELECT")
    for o in imported:
        o.select_set(True)
    bpy.context.view_layer.objects.active = imported[0]
    bpy.ops.object.join()
    ship = bpy.context.object
    ship.name = "A30_Thunderbolt"
    # lift the very dark camo a touch so the hero ship reads in the dusk light
    for mat in ship.data.materials:
        if not mat or not mat.use_nodes:
            continue
        bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if not bsdf or not bsdf.inputs["Base Color"].links:
            continue
        src = bsdf.inputs["Base Color"].links[0].from_socket
        mix = mat.node_tree.nodes.new("ShaderNodeMixRGB")
        mix.blend_type = "MULTIPLY"; mix.inputs["Fac"].default_value = 0.55
        mix.inputs["Color2"].default_value = (1.65, 1.5, 1.3, 1)
        mat.node_tree.links.new(src, mix.inputs["Color1"])
        mat.node_tree.links.new(mix.outputs["Color"], bsdf.inputs["Base Color"])
    # Normalize: long axis 25 m, bottom on the pad.
    lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
    for c in ship.bound_box:
        w = ship.matrix_world @ Vector(c)
        lo = Vector((min(lo[i], w[i]) for i in range(3)))
        hi = Vector((max(hi[i], w[i]) for i in range(3)))
    size = hi - lo
    scale = 25.0 / size.y
    cx = (lo.x + hi.x) * 0.5
    cy = (lo.y + hi.y) * 0.5
    M = (
        Matrix.Translation((0, 0, APRON_Z + 0.28))
        @ Matrix.Rotation(math.radians(180), 4, "Z")
        @ Matrix.Diagonal((scale, scale, scale, 1.0))
        @ Matrix.Translation((-cx, -cy, -lo.z))
    )
    ship.matrix_world = M @ ship.matrix_world
    # keep the GLB's original materials
    for c in list(ship.users_collection):
        c.objects.unlink(ship)
    col.objects.link(ship)
    ship.visible_shadow = True
    # navigation lights and a tail strobe
    red = simple_pbr("NavRed", (1.0, 0.02, 0.01, 1), 0.3, 0.0, (3.0, 0.01, 0.005, 1), 20.0)
    green = simple_pbr("NavGreen", (0.02, 1.0, 0.25, 1), 0.3, 0.0, (0.01, 3.0, 0.4, 1), 20.0)
    white = simple_pbr("NavWhite", (1, 0.95, 0.85, 1), 0.3, 0.0, (2.0, 1.6, 1.0, 1), 20.0)
    for tag, local, mat in [
        ("PortNav", (-13.0, 0.0, 0.9), red),
        ("StarboardNav", (13.0, 0.0, 0.9), green),
        ("TailStrobe", (0.0, 14.0, 1.4), white),
    ]:
        p = ship.matrix_world @ Vector(local)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=6, radius=0.22, location=p)
        nav = bpy.context.object
        nav.name = tag
        nav.data.materials.append(mat)
        for c in list(nav.users_collection):
            c.objects.unlink(nav)
        col.objects.link(nav)
    print(f"[ship] placed scale {scale:.3f}, dims {ship.dimensions[:]}")
    return ship


def append_character(col, pose_name="12_Idle4_Crossedhands", target=(16, 13), angle_deg=205.0):
    with bpy.data.libraries.load(str(CHARACTER_BLEND), link=False) as (src, dst):
        dst.objects = [pose_name]
    obj = dst.objects[0]
    bpy.context.scene.collection.objects.link(obj)
    # repoint the Windows texture paths to the extracted local textures
    for mat in obj.data.materials:
        if not mat or not mat.use_nodes:
            continue
        for node in mat.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image:
                base = os.path.basename(node.image.filepath.replace("\\", "/"))
                candidate = CHARACTER_TEXTURES / base
                if candidate.exists():
                    node.image.filepath = str(candidate)
                    node.image.reload()
    # normalize height to 1.8 m
    lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
    for c in obj.bound_box:
        w = obj.matrix_world @ Vector(c)
        lo = Vector((min(lo[i], w[i]) for i in range(3)))
        hi = Vector((max(hi[i], w[i]) for i in range(3)))
    height = hi.z - lo.z
    scale = 1.8 / height
    cx = (lo.x + hi.x) * 0.5
    cy = (lo.y + hi.y) * 0.5
    M = (
        Matrix.Translation((16, 13, APRON_Z + 0.17))
        @ Matrix.Rotation(math.radians(180), 4, "Z")
        @ Matrix.Diagonal((scale, scale, scale, 1.0))
        @ Matrix.Translation((-cx, -cy, -lo.z))
    )
    obj.matrix_world = M @ obj.matrix_world
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    col.objects.link(obj)
    obj.name = "PortController"
    print(f"[character] {pose_name} -> 1.8 m")
    return obj


def build_signage(col):
    mat = bpy.data.materials.new("AnvilSign")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial"); out.location = (400, 0)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled"); bsdf.location = (100, 0)
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    tex = Path("/tmp/port_tex/sign_anvil_flip.png")
    img = bpy.data.images.load(str(tex), check_existing=True)
    node = nt.nodes.new("ShaderNodeTexImage"); node.image = img; node.location = (-260, 100)
    nt.links.new(node.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(node.outputs["Alpha"], bsdf.inputs["Alpha"])
    bsdf.inputs["Emission Color"].default_value = (1.0, 0.76, 0.38, 1)
    bsdf.inputs["Emission Strength"].default_value = 4.0
    bpy.ops.mesh.primitive_plane_add(size=1, location=(25, -38.35, APRON_Z + 8.3))
    sign = bpy.context.object
    sign.name = "AnvilLandingSign"
    sign.scale = (14, 3.5, 1)
    sign.rotation_euler = (math.radians(90), 0, 0)
    sign.data.materials.append(mat)
    for c in list(sign.users_collection):
        c.objects.unlink(sign)
    col.objects.link(sign)
    # subtle metal frame around the sign
    frame = simple_pbr("SignFrame", (0.08, 0.09, 0.09, 1), 0.4, 0.85)
    add_box("SignFrameTop", (14.4, 0.18, 0.28), (25, -38.15, APRON_Z + 10.2), frame, collection=col)
    add_box("SignFrameBottom", (14.4, 0.18, 0.28), (25, -38.15, APRON_Z + 6.4), frame, collection=col)
    add_box("SignFrameL", (0.28, 0.18, 3.8), (17.7, -38.15, APRON_Z + 8.3), frame, collection=col)
    add_box("SignFrameR", (0.28, 0.18, 3.8), (32.3, -38.15, APRON_Z + 8.3), frame, collection=col)


# ---------------------------------------------------------------------------
# World, lights, cameras, render
# ---------------------------------------------------------------------------


def build_world(sun_azimuth_deg=235.0, sun_elevation_deg=7.0):
    world = bpy.data.worlds.new("AnvilSky")
    bpy.context.scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld"); out.location = (400, 0)
    bg = nt.nodes.new("ShaderNodeBackground"); bg.location = (200, 0)
    env = nt.nodes.new("ShaderNodeTexEnvironment"); env.location = (-200, 0)
    img = bpy.data.images.load(str(SKY_HDR), check_existing=True)
    env.image = img
    mapping = nt.nodes.new("ShaderNodeMapping"); mapping.location = (-420, 0)
    mapping.inputs["Rotation"].default_value = (0, 0, math.radians(195))
    coord = nt.nodes.new("ShaderNodeTexCoord"); coord.location = (-620, 0)
    nt.links.new(coord.outputs["Generated"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], env.inputs["Vector"])
    nt.links.new(env.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 0.32
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])

    # sun
    azimuth = math.radians(sun_azimuth_deg)
    elevation = math.radians(sun_elevation_deg)
    direction = Vector((
        math.cos(elevation) * math.cos(azimuth),
        math.cos(elevation) * math.sin(azimuth),
        math.sin(elevation),
    ))
    light_data = bpy.data.lights.new("Sun", type="SUN")
    light_data.energy = 7.8
    light_data.color = (1.0, 0.46, 0.20)
    light_data.angle = math.radians(1.4)
    light = bpy.data.objects.new("Sun", light_data)
    light.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    bpy.context.scene.collection.objects.link(light)

    # soft sky fill from the opposite side (bounce)
    fill_data = bpy.data.lights.new("SkyFill", type="AREA")
    fill_data.energy = 1600.0
    fill_data.shape = "DISK"
    fill_data.size = 80.0
    fill_data.color = (0.44, 0.58, 0.82)
    fill = bpy.data.objects.new("SkyFill", fill_data)
    fill.location = (60, 140, APRON_Z + 65)
    fill.rotation_euler = (math.radians(28), 0, math.radians(180))
    bpy.context.scene.collection.objects.link(fill)

    # warm bounce/fill from the camera side so the ship's nose stays readable
    front_data = bpy.data.lights.new("FrontFill", type="AREA")
    front_data.energy = 4200.0
    front_data.shape = "RECTANGLE"
    front_data.size = 28.0
    front_data.size_y = 10.0
    front_data.color = (1.0, 0.62, 0.38)
    front = bpy.data.objects.new("FrontFill", front_data)
    front.location = (-4, 40, APRON_Z + 12)
    front.rotation_euler = (math.radians(65), 0, 0)
    bpy.context.scene.collection.objects.link(front)

    # dedicated ship key / rim lights for the hero pad reads
    key_data = bpy.data.lights.new("ShipKey", type="SPOT")
    key_data.energy = 9000.0
    key_data.spot_size = math.radians(70)
    key_data.spot_blend = 0.55
    key_data.color = (1.0, 0.72, 0.46)
    key_data.shadow_soft_size = 5.0
    key = bpy.data.objects.new("ShipKey", key_data)
    key.location = (38, 28, APRON_Z + 14)
    key.rotation_euler = (Vector((0, 0, APRON_Z + 2.5)) - key.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.collection.objects.link(key)
    rim_data = bpy.data.lights.new("ShipRim", type="AREA")
    rim_data.energy = 3000.0
    rim_data.shape = "RECTANGLE"
    rim_data.size = 14.0
    rim_data.size_y = 5.0
    rim_data.color = (0.45, 0.68, 1.0)
    rim = bpy.data.objects.new("ShipRim", rim_data)
    rim.location = (-18, -28, APRON_Z + 12)
    rim.rotation_euler = (Vector((0, 0, APRON_Z + 3.0)) - rim.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.collection.objects.link(rim)
    rim2_data = bpy.data.lights.new("ShipRim2", type="SPOT")
    rim2_data.energy = 5000.0
    rim2_data.spot_size = math.radians(48)
    rim2_data.spot_blend = 0.6
    rim2_data.color = (0.65, 0.8, 1.0)
    rim2_data.shadow_soft_size = 6.0
    rim2 = bpy.data.objects.new("ShipRim2", rim2_data)
    rim2.location = (20, -32, APRON_Z + 22)
    rim2.rotation_euler = (Vector((0, 0, APRON_Z + 2.0)) - rim2.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.collection.objects.link(rim2)
    return light


def build_cameras():
    cams = {}
    def make(name, pos, target, lens, fstop=None, focus=None):
        data = bpy.data.cameras.new(name)
        data.lens = lens
        data.sensor_width = 36.0
        if fstop:
            data.dof.use_dof = True
            data.dof.aperture_fstop = fstop
            if focus is not None:
                data.dof.focus_distance = focus
        cam = bpy.data.objects.new(name, data)
        cam.location = pos
        cam.rotation_euler = (Vector(target) - Vector(pos)).to_track_quat("-Z", "Y").to_euler()
        bpy.context.scene.collection.objects.link(cam)
        cams[name] = cam
        return cam

    # wide low-angle port view (south-west, ship and terminal)
    make("CAM_PortWide", (20, 48, APRON_Z + 3.4), (-2, -16, APRON_Z + 5.4), 35)
    make("CAM_PortWide2", (10, 50, APRON_Z + 3.4), (-4, -16, APRON_Z + 5.2), 40)
    make("CAM_PortWide3", (-10, 52, APRON_Z + 3.8), (-2, -18, APRON_Z + 5.4), 40)
    make("CAM_PortWide4", (40, 52, APRON_Z + 3.2), (-2, -18, APRON_Z + 5.2), 38)
    make("CAM_PortWide5", (28, 64, APRON_Z + 4.0), (-4, -18, APRON_Z + 5.4), 40)
    make("CAM_PortWide6", (-32, 50, APRON_Z + 3.0), (2, -16, APRON_Z + 5.0), 38)
    # close pad hero, looking up the nose of the A-30
    make("CAM_PadClose", (30, 38, APRON_Z + 2.4), (-2, 2, APRON_Z + 4.2), 46, 2.8, 30.0)
    make("CAM_PadClose2", (42, 18, APRON_Z + 2.2), (-4, -4, APRON_Z + 4.0), 50, 2.8, 32.0)
    make("CAM_PadClose3", (14, 28, APRON_Z + 2.0), (-2, -12, APRON_Z + 4.0), 45, 2.8, 30.0)
    make("CAM_PadClose4", (-22, 32, APRON_Z + 2.3), (0, -8, APRON_Z + 4.2), 45, 2.8, 32.0)
    # aerial vista from the bay
    make("CAM_Vista", (-405, 390, 36), (0, -30, APRON_Z + 12), 38)
    # terminal detail
    make("CAM_Terminal", (-34, 16, APRON_Z + 2.2), (10, -38, APRON_Z + 9.0), 55, 2.8, 55.0)
    return cams


def setup_render(res=(960, 540), samples=32):
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    sc.eevee.taa_render_samples = samples
    sc.eevee.use_raytracing = True
    sc.eevee.ray_tracing_method = "SCREEN"
    try:
        sc.eevee.ray_tracing_options.use_denoise = True
    except Exception:
        pass
    try:
        sc.eevee.volumetric_start = 1.0
        sc.eevee.volumetric_end = 2200.0
        sc.eevee.volumetric_samples = 48
        sc.eevee.use_volumetric_shadows = True
    except Exception:
        pass
    sc.eevee.use_shadows = True
    sc.eevee.shadow_ray_count = 2
    sc.eevee.shadow_step_count = 12
    sc.eevee.shadow_resolution_scale = 1.0
    try:
        sc.eevee.use_fast_gi = True
        sc.eevee.fast_gi_method = "GLOBAL_ILLUMINATION"
        sc.eevee.fast_gi_distance = 30.0
        sc.eevee.fast_gi_quality = 0.5
    except Exception:
        pass
    sc.render.resolution_x = res[0]
    sc.render.resolution_y = res[1]
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - High Contrast"
    sc.view_settings.exposure = -0.05
    sc.view_settings.gamma = 1.0
    bpy.context.scene.render.filepath = str(TMP_RENDER / "render.png")


def setup_compositor():
    """Small, reliable compositor: bloom + a gentle grade.

    Blender 5.3 replaced most of the legacy compositor nodes; keep this to the
    stable RLayers -> Glare -> Composite path so headless renders are stable.
    """
    sc = bpy.context.scene
    sc.use_nodes = True
    sc.render.use_compositing = True
    ng = bpy.data.node_groups.new("AnvilCompositor", "CompositorNodeTree")
    sc.compositing_node_group = ng
    nt = ng
    rl = nt.nodes.new("CompositorNodeRLayers"); rl.location = (-400, 0)
    glare = nt.nodes.new("CompositorNodeGlare"); glare.location = (-120, 0)
    glare.inputs["Type"].default_value = "Bloom"
    glare.inputs["Quality"].default_value = "High"
    glare.inputs["Threshold"].default_value = 1.0
    glare.inputs["Strength"].default_value = 0.28
    glare.inputs["Size"].default_value = 0.7
    nt.links.new(rl.outputs["Image"], glare.inputs["Image"])
    ng.interface.new_socket(name="Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    comp = nt.nodes.new("NodeGroupOutput"); comp.location = (200, 0)
    nt.links.new(glare.outputs["Image"], comp.inputs["Image"])



def build_haze():
    """Thin ground haze for aerial perspective. Kept low and warm so it does
    not wash out the sky."""
    mat = bpy.data.materials.new("GroundHaze")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial"); out.location = (300, 0)
    vol = nt.nodes.new("ShaderNodeVolumeScatter"); vol.location = (0, 0)
    vol.inputs["Color"].default_value = (0.62, 0.71, 0.86, 1)
    vol.inputs["Density"].default_value = 0.00016
    vol.inputs["Anisotropy"].default_value = 0.35
    nt.links.new(vol.outputs["Volume"], out.inputs["Volume"])
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 55))
    obj = bpy.context.object
    obj.name = "GroundHaze"
    obj.scale = (3000, 3000, 110)
    obj.data.materials.append(mat)
    obj.visible_shadow = False
    # keep it out of the GLB export / the port collections
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def add_contact_shadows(col):
    # soft blob under the ship (a cheap contact shadow that survives any lighting)
    mat = bpy.data.materials.new("ContactShadow")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial"); out.location = (300, 0)
    mix = nt.nodes.new("ShaderNodeMixShader"); mix.location = (100, 0)
    trans = nt.nodes.new("ShaderNodeBsdfTransparent"); trans.location = (-120, 80)
    diff = nt.nodes.new("ShaderNodeBsdfDiffuse"); diff.location = (-120, -80)
    diff.inputs["Color"].default_value = (0.0, 0.0, 0.0, 1)
    nt.links.new(trans.outputs["BSDF"], mix.inputs[1])
    nt.links.new(diff.outputs["BSDF"], mix.inputs[2])
    coord = nt.nodes.new("ShaderNodeTexCoord"); coord.location = (-500, 0)
    grad = nt.nodes.new("ShaderNodeTexGradient"); grad.gradient_type = "SPHERICAL"; grad.location = (-300, 0)
    nt.links.new(coord.outputs["Object"], grad.inputs["Vector"])
    nt.links.new(grad.outputs["Fac"], mix.inputs["Fac"])
    nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])
    bpy.ops.mesh.primitive_plane_add(size=34, location=(0, 0, APRON_Z + 0.3))
    obj = bpy.context.object
    obj.name = "ShipContactShadow"
    obj.data.materials.append(mat)
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    col.objects.link(obj)
    obj.visible_shadow = False


# ---------------------------------------------------------------------------
# Assembly
# ---------------------------------------------------------------------------


def build_all():
    ensure_dirs()
    clear_scene()
    sc = bpy.context.scene
    sc.unit_settings.system = "METRIC"
    sc.unit_settings.scale_length = 1.0
    sc.render.fps = 24

    print("[scene] terrain ...")
    terrain = build_terrain()
    print("[scene] sea ...")
    sea = build_sea()
    print("[scene] apron ...")
    surface = build_apron()
    print("[scene] kitbash ...")
    kit = Kit()
    kit.load()

    port_col = make_collection("PortDistrict")
    kit.place("BldgLG_J", -45, -44, APRON_Z + 0.06, 0, "TerminalJ")
    kit.place("BldgLG_I", 25, -44, APRON_Z + 0.06, 0, "HangarI")
    kit.place("BldgLG_D", -62, -22, APRON_Z + 0.06, 90, "TowerD")
    kit.place("BldgLG_G", 68, -66, APRON_Z + 0.06, -12, "TowerG")
    kit.place("BldgLG_H", -68, -70, APRON_Z + 0.06, 12, "TowerH")
    kit.place("BldgMD_A", -64, 2, APRON_Z + 0.06, 90, "OfficeA")
    kit.place("BldgMD_C", -64, 24, APRON_Z + 0.06, 90, "OfficeC")
    kit.place("BldgMD_E", 64, 2, APRON_Z + 0.06, -90, "OfficeE")
    kit.place("BldgMD_F", 64, 24, APRON_Z + 0.06, -90, "OfficeF")
    kit.place("BldgMD_D", 38, 78, APRON_Z + 0.06, 180, "OfficeD")
    kit.place("BldgSM_C", -22, -30, APRON_Z + 0.06, 10, "ServiceC")
    kit.place("BldgSM_J", 40, -34, APRON_Z + 0.06, -30, "ServiceJ")

    print("[scene] props ...")
    props_col = make_collection("PortProps")
    metal = simple_pbr("PortMetal", (0.22, 0.24, 0.25, 1), 0.38, 0.8)
    orange = simple_pbr("ContainerOrange", (0.55, 0.19, 0.04, 1), 0.62, 0.15)
    teal = simple_pbr("ContainerTeal", (0.04, 0.24, 0.25, 1), 0.55, 0.2)
    build_containers(props_col, metal, orange, teal)
    build_fuel_truck(props_col)
    # loose cargo in the foreground right (screen-left in the mirrorless render)
    crate_metal = simple_pbr("CrateMetal", (0.16, 0.20, 0.22, 1), 0.5, 0.5)
    crate_orange = simple_pbr("CrateOrange", (0.52, 0.20, 0.05, 1), 0.62, 0.1)
    crate_teal = simple_pbr("CrateTeal", (0.03, 0.20, 0.21, 1), 0.58, 0.1)
    for i, (x, y, s, m) in enumerate([(38, 29, 1.4, crate_teal), (39.5, 29, 1.4, crate_orange), (38.7, 29, 3.0, crate_metal), (33, 33, 1.1, crate_orange), (34.3, 33, 1.1, crate_teal)]):
        add_box(f"Cargo{i}", (s, s, s), (x, y, APRON_Z + 0.2 + s / 2 + (2.8 if i == 2 else 0)), m, collection=props_col)
        add_box(f"Cargo{i}Band", (s * 1.02, s * 0.15, s * 0.15), (x, y, APRON_Z + 0.2 + s / 2 + (2.8 if i == 2 else 0)), crate_metal, collection=props_col)
    build_fuel_farm(props_col)
    build_gantry(props_col)
    build_floodlights(props_col)
    build_papi_and_lights(props_col)
    build_windsock(props_col)
    build_radar_dish(props_col)
    build_puddle(props_col)
    build_signage(props_col)
    build_roof_greebles(kit, [props_col])
    # Hide the source showcase layout; only placed collections should render.
    placed = set()
    for c in bpy.data.collections:
        if c.name in {"PortDistrict", "TerminalJ", "HangarI", "TowerD", "TowerG", "TowerH", "OfficeA", "OfficeC", "OfficeE", "OfficeF", "OfficeD", "ServiceC", "ServiceJ", "A30", "Character", "PortProps", "PortSurface", "Vegetation", "FuelTruck"}:
            placed.update(c.objects)
    for o in kit.objects:
        if o not in placed:
            o.hide_render = True
            o.hide_set(True)

    print("[scene] vegetation ...")
    veg_col = make_collection("Vegetation")
    build_vegetation(veg_col)

    # warm facade uplights for the terminal and hangar
    for name, x, energy in [("TerminalUplight", -45, 1600.0), ("HangarUplight", 25, 1400.0)]:
        data = bpy.data.lights.new(name, type="AREA")
        data.energy = energy
        data.shape = "RECTANGLE"
        data.size = 14.0
        data.size_y = 7.0
        data.color = (1.0, 0.62, 0.36)
        light = bpy.data.objects.new(name, data)
        light.location = (x, -32, APRON_Z + 3.0)
        light.rotation_euler = (Vector((x, -44, APRON_Z + 9)) - light.location).to_track_quat("-Z", "Y").to_euler()
        bpy.context.scene.collection.objects.link(light)

    print("[scene] ship ...")
    ship_col = make_collection("A30")
    import_ship(ship_col)
    add_contact_shadows(props_col)
    print("[scene] character ...")
    char_col = make_collection("Character")
    append_character(char_col, "12_Idle4_Crossedhands", (-9, 34), 195)
    append_character(char_col, "10_Idle2_Radio", (17, 14), 245)
    print("[scene] world / lighting ...")
    build_world()
    build_haze()
    cams = build_cameras()
    setup_render()
    setup_compositor()

    sc.camera = cams["CAM_PortWide"]
    bpy.ops.wm.save_as_mainfile(filepath="/tmp/anvil_port.blend")
    print("[scene] saved /tmp/anvil_port.blend")
    return cams


def render_shots(shots, res=(960, 540), samples=32):
    sc = bpy.context.scene
    setup_render(res, samples)
    cams = {o.name: o for o in sc.objects if o.type == "CAMERA"}
    for shot in shots:
        cam = cams.get(f"CAM_{shot}")
        if not cam:
            print(f"[render] missing camera CAM_{shot}")
            continue
        sc.camera = cam
        sc.render.filepath = str(TMP_RENDER / f"{shot}.png")
        print(f"[render] {shot} ...")
        bpy.ops.render.render(write_still=True)
        print(f"[render] wrote {sc.render.filepath}")


def main():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage", default="all", choices=["build", "render", "all"])
    parser.add_argument("--shots", nargs="*", default=["PortWide", "PadClose", "Vista"])
    parser.add_argument("--res", default="960x540")
    parser.add_argument("--samples", type=int, default=32)
    args = parser.parse_args(args)
    res = tuple(int(v) for v in args.res.lower().split("x"))

    if args.stage in ("build", "all"):
        build_all()
    if args.stage in ("render", "all"):
        if args.stage == "render":
            bpy.ops.wm.open_mainfile(filepath="/tmp/anvil_port.blend")
        render_shots(args.shots, res, args.samples)


if __name__ == "__main__":
    main()
