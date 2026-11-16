#!/usr/bin/env python3
"""Blender headless 2K AO bake for rta_archon.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/archon-textures/bake_ao.py

Requires <work>/archon.gltf (unpacked by prepare.sh). Output:
  <work>/tex/archon_ao_2k.png

Known limitation: UV0 is reused ~5.7x and the mesh has ~16k loose parts.
Baking on UV0 is last-face-wins; the diagonal gradient is a UV-overlap artifact,
not a clean per-surface AO. pack_textures.py uses this only as a low-weight
large-scale cue, multiplied by a normal-map cavity. See docs/ARCHON-TEXTURE-PASS.md.
"""
import bpy
import os
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
WORK = Path(os.environ.get("ARCHON_WORK", REPO / "work"))
TEX = WORK / "tex"
TEX.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(WORK / "archon.gltf"))

ob = next(o for o in bpy.data.objects if o.type == "MESH")
bpy.context.view_layer.objects.active = ob
ob.select_set(True)

# Bake target image node.
mat = ob.data.materials[0]
nt = mat.node_tree
img = bpy.data.images.new("ArchonAO", 2048, 2048, alpha=False)
img.colorspace_settings.name = "Non-Color"
node = nt.nodes.new("ShaderNodeTexImage")
node.image = img
node.select = True
nt.nodes.active = node

scene = bpy.context.scene
scene.world = bpy.data.worlds.new("World")
# 0.5 local units is about 9.5 m at final 8 km scale; short-range crevice AO.
scene.world.light_settings.distance = 0.5
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 64
scene.cycles.use_denoising = False
scene.render.bake.use_clear = True
scene.render.bake.margin = 16
scene.render.bake.target = "IMAGE_TEXTURES"

print("BAKE START", flush=True)
t0 = time.time()
bpy.ops.object.bake(type="AO")
print("BAKE DONE in", round(time.time() - t0, 2), "s", flush=True)

img.filepath_raw = str(TEX / "archon_ao_2k.png")
img.file_format = "PNG"
img.save()
print("SAVED", img.filepath_raw)
