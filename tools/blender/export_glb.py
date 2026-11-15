#!/usr/bin/env python3
"""Export the placed Anvil Landing district as an optimized real-time GLB.

Run:
  Blender -b /tmp/anvil_port.blend --python tools/blender/export_glb.py

This is a build step, not a source file. It decimates the Kitbash3D building
shells, switches to 1K building textures and 2K port-surface maps, and keeps
the A-30 glued to the pad transform authored in build_scene.py.
"""

from __future__ import annotations

import os
from pathlib import Path

import bpy

ROOT = Path("/Users/apple/.local/share/opencode/worktree/e0f2de/terrain-sample-v2")
OUT = ROOT / "public" / "terrain-sample" / "models" / "anvil-port.glb"
OUT.parent.mkdir(parents=True, exist_ok=True)

PORT_COLLECTIONS = {
    "TerminalJ", "HangarI", "TowerD", "TowerG", "TowerH",
    "OfficeA", "OfficeC", "OfficeE", "OfficeF", "OfficeD",
    "ServiceC", "ServiceJ", "PortProps", "PortSurface", "Vegetation", "A30",
}
EXCLUDE_NAMES = {"Puddle", "ShipContactShadow", "GroundHaze", "Sea", "AnvilTerrain"}

# ---------------------------------------------------------------------------
# texture downgrade
# ---------------------------------------------------------------------------

for img in bpy.data.images:
    path = (img.filepath or "").replace("\\", "/")
    base = os.path.basename(path)
    if "/kb3d_2k/" in path:
        candidate = Path("/tmp/kb3d_1k") / base
    elif "/port_tex/" in path:
        candidate = Path("/tmp/port_tex_rt") / base
    elif "/terrain-assets/2k/" in path:
        candidate = Path("/tmp/terrain-assets/2k") / base
    else:
        continue
    if candidate.exists():
        img.filepath = str(candidate)
        try:
            img.reload()
        except Exception:
            pass


def simple_surface_material(name: str, color_path: Path, rough_path: Path):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial"); out.location = (300, 0)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled"); bsdf.location = (0, 0)
    bsdf.inputs["Metallic"].default_value = 0.0
    cimg = bpy.data.images.load(str(color_path), check_existing=True)
    cnode = nt.nodes.new("ShaderNodeTexImage"); cnode.image = cimg; cnode.location = (-500, 150)
    nt.links.new(cnode.outputs["Color"], bsdf.inputs["Base Color"])
    rimg = bpy.data.images.load(str(rough_path), check_existing=True)
    rnode = nt.nodes.new("ShaderNodeTexImage"); rnode.image = rimg; rnode.location = (-500, -150)
    nt.links.new(rnode.outputs["Color"], bsdf.inputs["Roughness"])
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


for obj_name, mat_name, color, rough in [
    ("Apron", "ApronRT", "/tmp/port_tex_rt/apron_color.jpg", "/tmp/port_tex_rt/apron_rough.jpg"),
    ("TLOFPad", "TLOFPadRT", "/tmp/port_tex_rt/pad_color.jpg", "/tmp/port_tex_rt/pad_rough.jpg"),
]:
    obj = bpy.data.objects.get(obj_name)
    if obj:
        obj.data.materials.clear()
        obj.data.materials.append(simple_surface_material(mat_name, Path(color), Path(rough)))

# A-30: remove the Blender-only brightening MixRGB from the base-color chain so
# the glTF exporter keeps the embedded camo texture.
for mat in bpy.data.materials:
    if not mat.name.startswith("A 30"):
        continue
    if not mat.use_nodes:
        continue
    bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if not bsdf or not bsdf.inputs["Base Color"].links:
        continue
    link = bsdf.inputs["Base Color"].links[0]
    if link.from_node.type == "MIX_RGB" and link.from_node.inputs["Color1"].links:
        src = link.from_node.inputs["Color1"].links[0].from_socket
        mat.node_tree.links.new(src, bsdf.inputs["Base Color"])

# ---------------------------------------------------------------------------
# collect and decimate
# ---------------------------------------------------------------------------

def in_port_collection(obj):
    if obj.name in EXCLUDE_NAMES:
        return False
    if obj.hide_render:
        return False
    for c in obj.users_collection:
        if c.name in PORT_COLLECTIONS:
            return True
    return False


export_objs = [o for o in bpy.context.scene.objects if o.type == "MESH" and in_port_collection(o)]
print(f"[export] selected {len(export_objs)} meshes before decimation")

for obj in export_objs:
    polys = len(obj.data.polygons)
    if obj.name.startswith("A30"):
        continue
    if polys > 800_000:
        ratio = 0.08
    elif polys > 300_000:
        ratio = 0.12
    elif polys > 100_000:
        ratio = 0.18
    elif polys > 30_000:
        ratio = 0.30
    elif polys > 10_000:
        ratio = 0.50
    else:
        continue
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    mod = obj.modifiers.new("RT_Decimate", "DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = ratio
    try:
        bpy.ops.object.modifier_apply(modifier=mod.name)
    except Exception as exc:
        print(f"[export] decimate failed on {obj.name}: {exc}")
    obj.select_set(False)

tris = 0
for obj in export_objs:
    tris += sum(max(1, len(p.vertices) - 2) for p in obj.data.polygons)
print(f"[export] approximate triangles after decimation: {tris:,}")

# ---------------------------------------------------------------------------
# select meshes and export
# ---------------------------------------------------------------------------

bpy.ops.object.select_all(action="DESELECT")
for obj in export_objs:
    obj.select_set(True)
bpy.context.view_layer.objects.active = export_objs[0]

bpy.ops.export_scene.gltf(
    filepath=str(OUT),
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_yup=True,
    export_texcoords=True,
    export_normals=True,
    export_materials="EXPORT",
    export_image_format="AUTO",
    export_animations=False,
    export_skins=False,
    export_morph=False,
    export_lights=False,
    export_cameras=False,
    export_extras=False,
)
size = OUT.stat().st_size
print(f"[export] wrote {OUT} ({size/1_000_000:.1f} MB, ~{tris:,} tris)")
