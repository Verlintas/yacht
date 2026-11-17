"""Assemble and export one complete authored K042 supercar for cyber-city.

Source: Vehicles_SuperCar.FBX (paid Kitbash3D K042 kit, private use).
The FBX contains three complete car assemblies (SuperCarA/B/C) as parented
groups. This script uses SuperCarB, keeps its authored body, wheels, glass,
interior and light parts, decimates the heavy hidden/mechanical meshes, maps the
authored materials to a small runtime palette and grounds the tyres at z=0.

Usage:
  Blender -b --factory-startup --python scripts/cyber-city/export_car.py
"""
from __future__ import annotations

import math
import os

import bpy
from mathutils import Vector

GROUP = "SuperCarB"
OUT = "/Users/apple/.local/share/opencode/worktree/e0f2de/cyber-city/public/cyber-city/models/car.glb"
SRC = "/private/var/folders/fj/gwg4chqx7nvfvygvwmcyxh240000gn/T/opencode/cyber/k042/Vehicles_SuperCar.FBX"
PREVIEW = "/private/var/folders/fj/gwg4chqx7nvfvygvwmcyxh240000gn/T/opencode/cyber/car_complete_preview.png"


def select(ob: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob


def apply_all(ob: bpy.types.Object) -> None:
    select(ob)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def bbox(ob: bpy.types.Object) -> tuple[Vector, Vector]:
    mw = ob.matrix_world
    pts = [mw @ Vector(c) for c in ob.bound_box]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return mn, mx


def decimate(ob: bpy.types.Object, ratio: float) -> None:
    if ob.data.users > 1:
        ob.data = ob.data.copy()
    select(ob)
    mod = ob.modifiers.new("dec", "DECIMATE")
    mod.ratio = ratio
    mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=mod.name)


def mat(name: str, color: tuple[float, float, float], metallic: float, rough: float,
        emission: tuple[float, float, float] | None = None, strength: float = 0.0,
        coat: float = 0.0) -> bpy.types.Material:
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = rough
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = coat
        bsdf.inputs["Coat Roughness"].default_value = 0.18
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = strength
    return m


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=SRC, use_anim=False, global_scale=1.0)

root = bpy.data.objects.get(GROUP)
if root is None:
    raise SystemExit(f"missing car group {GROUP}")

desc = [o for o in root.children_recursive if o.type == "MESH"]
if not desc:
    raise SystemExit(f"no meshes under {GROUP}")

for ob in bpy.context.scene.objects:
    if ob.type == "MESH":
        ob.hide_viewport = ob not in desc
        ob.hide_render = ob not in desc

# Raise the bodyshell relative to the wheels by 10 cm. The source kit is a
# ground-hugging show car whose skirts hide almost all of the tyre; at street
# level that reads as a floating wedge. The wheels stay authored and grounded.
RIDE_LIFT = 0.10
for ob in desc:
    if not ob.name.startswith("Wheel_"):
        mw = ob.matrix_world.copy()
        mw.translation.z += RIDE_LIFT
        ob.matrix_world = mw

# Per-part decimation: axles/mechanics are mostly hidden, body and wheels keep
# enough silhouette detail for the hero shot.
for ob in desc:
    faces = len(ob.data.polygons)
    if ob.name.startswith("Mech_AxleAssembly"):
        ratio = 0.08
    elif ob.name.startswith("Wheel_"):
        ratio = 0.50
    elif faces > 20000:
        ratio = 0.25
    elif faces > 5000:
        ratio = 0.35
    elif faces > 1000:
        ratio = 0.55
    else:
        ratio = 0.85
    if ratio < 1.0:
        decimate(ob, ratio)
    print(f"  {ob.name:32s} {faces:7d} -> {len(ob.data.polygons):7d}  ratio {ratio}")

bpy.ops.object.select_all(action="DESELECT")
for ob in desc:
    ob.select_set(True)
bpy.context.view_layer.objects.active = desc[0]
bpy.ops.object.join()
car = bpy.context.view_layer.objects.active
car.name = "CAR_HERO"
# detach from the SuperCarB empty and bake its world transform before recentring
mw = car.matrix_world.copy()
car.parent = None
car.matrix_world = mw
apply_all(car)

# second, global pass: the complete car has a lot of tiny authored detail.
# Keep a clean silhouette at hero distance while staying inside the 2M budget.
decimate(car, 0.57)

mn, mx = bbox(car)
car.location = (-(mn.x + mx.x) / 2, -(mn.y + mx.y) / 2, -mn.z)
apply_all(car)
mn, mx = bbox(car)
print("car bbox", [round(v, 4) for v in mn], [round(v, 4) for v in mx],
      "dim", [round(v, 4) for v in (mx - mn)])

# --- runtime material palette: 6 materials, one draw per material ---
paint = mat("CAR_Paint", (0.035, 0.045, 0.07), 0.72, 0.24, coat=0.55)
accent = mat("CAR_Accent", (0.32, 0.005, 0.12), 0.35, 0.3,
             emission=(1.0, 0.02, 0.2), strength=2.6, coat=0.3)
glass = mat("CAR_Glass", (0.008, 0.014, 0.022), 0.9, 0.045)
tire = mat("CAR_Tire", (0.012, 0.012, 0.013), 0.0, 0.82)
metal = mat("CAR_Metal", (0.075, 0.085, 0.10), 0.75, 0.32)
headlight = mat("CAR_LightWhite", (0.55, 0.66, 0.78), 0.0, 0.2,
                emission=(0.72, 0.9, 1.0), strength=4.0)


def target(src: str) -> bpy.types.Material:
    n = src or ""
    if "CarPaint_Accent" in n:
        return accent
    if "CarPaint_Main" in n:
        return paint
    if "Tire" in n:
        return tire
    if "LED_WhiteHeadlight" in n or "Headlight" in n and "Glass" not in n:
        return headlight
    if "LED_" in n:
        return accent
    if "Glass" in n:
        return glass
    if "Rim" in n or "Chrome" in n or "DISCS" in n:
        return metal
    if "Carbon" in n or "Plastic" in n or "Leather" in n or "Harness" in n or "Wiring" in n:
        return metal
    if "Engine" in n or "Metal" in n or "SuperCarMultiMaterial" in n:
        return metal
    return metal


old_mats = [slot.material for slot in car.material_slots]
new_mats: list[bpy.types.Material] = []
new_index: dict[str, int] = {}
poly_targets: list[tuple[bpy.types.Polygon, int]] = []
for poly in car.data.polygons:
    src = old_mats[poly.material_index].name if poly.material_index < len(old_mats) and old_mats[poly.material_index] else ""
    target_mat = target(src)
    idx = new_index.get(target_mat.name)
    if idx is None:
        idx = len(new_mats)
        new_index[target_mat.name] = idx
        new_mats.append(target_mat)
    poly_targets.append((poly, idx))

car.data.materials.clear()
for m in new_mats:
    car.data.materials.append(m)
for poly, idx in poly_targets:
    poly.material_index = idx

car.data.calc_loop_triangles()
print("final car tris", len(car.data.loop_triangles), "materials", len(car.material_slots),
      [m.name for m in new_mats])

# --- preview: front 3/4, clean studio light ---
world = bpy.data.worlds.new("W")
bpy.context.scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.03, 0.04, 0.06, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.7
sun = bpy.data.lights.new("Sun", "SUN")
sun.energy = 4.0
sun.angle = math.radians(4)
so = bpy.data.objects.new("Sun", sun)
bpy.context.collection.objects.link(so)
so.rotation_euler = (math.radians(52), 0, math.radians(30))
sc = bpy.context.scene
sc.render.engine = "BLENDER_EEVEE"
sc.eevee.taa_render_samples = 24
sc.render.resolution_x = 1000
sc.render.resolution_y = 700
sc.view_settings.view_transform = "AgX"
sc.view_settings.look = "AgX - Medium High Contrast"
cam_data = bpy.data.cameras.new("Cam")
cam = bpy.data.objects.new("Cam", cam_data)
bpy.context.collection.objects.link(cam)
sc.camera = cam
cam_data.lens = 55
mn, mx = bbox(car)
ctr = (mn + mx) / 2
size = (mx - mn).length
cam.location = ctr + Vector((size * 0.78, -size * 1.05, size * 0.42))
cam.rotation_euler = (ctr - cam.location).to_track_quat("-Z", "Y").to_euler()
sc.render.filepath = PREVIEW
bpy.ops.render.render(write_still=True)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_yup=True,
    export_animations=False,
    export_cameras=False,
    export_lights=False,
    export_materials="EXPORT",
    export_image_format="NONE",
    export_texcoords=False,
    export_normals=True,
    export_tangents=False,
)
print("EXPORTED", OUT)
