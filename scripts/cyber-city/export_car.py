import bpy, math, os
from mathutils import Vector

OUT = "/Users/apple/.local/share/opencode/worktree/e0f2de/cyber-city/public/cyber-city/models/car.glb"
SRC = "/private/var/folders/fj/gwg4chqx7nvfvygvwmcyxh240000gn/T/opencode/cyber/k042/Vehicles_SuperCar.FBX"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=SRC, use_anim=False, global_scale=1.0)

def select(ob):
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob

def apply_all(ob):
    select(ob)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

def bbox(ob):
    mw = ob.matrix_world
    pts = [mw @ Vector(c) for c in ob.bound_box]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return mn, mx

def decimate(ob, ratio):
    select(ob)
    mod = ob.modifiers.new("dec", 'DECIMATE')
    mod.ratio = ratio
    mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=mod.name)

body = bpy.data.objects.get('Body_C')
wheel = bpy.data.objects.get('Wheel_D')
for ob in bpy.context.scene.objects:
    if ob.type == 'MESH':
        ob.hide_viewport = ob not in (body, wheel)
        ob.hide_render = ob not in (body, wheel)

apply_all(body)
mn, mx = bbox(body)
body.location = (-(mn.x + mx.x) / 2, -(mn.y + mx.y) / 2, 0.32 - mn.z)
apply_all(body)
decimate(body, 0.33)

wheels = []
for i, (x, y, flip) in enumerate([(0.95, 1.55, False), (-0.95, 1.55, True), (0.95, -1.55, False), (-0.95, -1.55, True)]):
    w = wheel.copy(); w.data = wheel.data.copy(); bpy.context.collection.objects.link(w)
    w.name = f'Wheel_{i}'
    apply_all(w)
    wmn, wmx = bbox(w)
    ctr = (wmn + wmx) / 2
    w.location = (-ctr.x, -ctr.y, -ctr.z)
    apply_all(w)
    decimate(w, 0.09)
    if flip:
        w.rotation_euler[2] = math.pi
    w.location = (x, y, 0.42)
    apply_all(w)
    wheels.append(w)

# authored glass canopy + light parts from the same K042 kit
aux_specs = [
    ('CarA039', (0.0, 0.20, 1.36), (0.0, 0.0, 0.0), 0.82),   # windshield/roof glass
    ('CarC008', (-0.78, -2.38, 0.62), (0.0, 0.0, 0.0), 1.0), # headlight
    ('CarC007', (0.78, -2.38, 0.62), (0.0, 0.0, 0.0), 1.0),  # headlight
    ('CarC019', (0.0, 2.42, 0.68), (0.0, 0.0, 0.0), 1.0),    # brake light
]
aux = []
for name, loc, rot, sc in aux_specs:
    ob = bpy.data.objects.get(name)
    if not ob:
        print('missing aux', name); continue
    ob.hide_viewport = False; ob.hide_render = False
    if ob.name != name:
        pass
    # unparent/apply, recenter bbox, then place
    bpy.context.view_layer.objects.active = ob
    select(ob)
    if ob.parent:
        bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    apply_all(ob)
    mn, mx = bbox(ob)
    ctr = (mn + mx) / 2
    ob.location = (-ctr.x, -ctr.y, -ctr.z)
    apply_all(ob)
    ob.scale = (sc, sc, sc)
    ob.rotation_euler = rot
    ob.location = loc
    apply_all(ob)
    aux.append(ob)
    print('aux', name, 'dim', (bbox(ob)[1]-bbox(ob)[0])[:])

bpy.ops.object.select_all(action='DESELECT')
for o in [body] + wheels + aux:
    o.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
car = bpy.context.view_layer.objects.active
car.name = 'CAR_HERO'
car.location.z = -0.0055
apply_all(car)
car.data.calc_loop_triangles()
print('car tris', len(car.data.loop_triangles))

# --- clean, authored-feeling car materials ---
def mat(name, color, metallic, rough, emission=None, strength=0.0, coat=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1.0)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = rough
    if 'Coat Weight' in bsdf.inputs:
        bsdf.inputs['Coat Weight'].default_value = coat
        bsdf.inputs['Coat Roughness'].default_value = 0.16
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*emission, 1.0)
        bsdf.inputs['Emission Strength'].default_value = strength
    return m

paint = mat('CAR_Paint', (0.07, 0.08, 0.11), 0.6, 0.3, coat=0.5)
accent = mat('CAR_Accent', (0.32, 0.005, 0.10), 0.4, 0.32, emission=(1.0, 0.01, 0.22), strength=3.0, coat=0.3)
glass = mat('CAR_Glass', (0.008, 0.014, 0.022), 0.9, 0.045)
tire = mat('CAR_Tire', (0.012, 0.012, 0.013), 0.0, 0.82)
rim = mat('CAR_Rim', (0.42, 0.44, 0.47), 1.0, 0.22)
metal = mat('CAR_Metal', (0.10, 0.11, 0.13), 0.9, 0.3)
dark = mat('CAR_Dark', (0.025, 0.027, 0.032), 0.2, 0.55)
red = mat('CAR_LightRed', (0.12, 0.0, 0.0), 0.0, 0.3, emission=(1.0, 0.015, 0.008), strength=5.0)
white = mat('CAR_LightWhite', (0.5, 0.6, 0.7), 0.0, 0.2, emission=(0.7, 0.88, 1.0), strength=6.0)
orange = mat('CAR_LightOrange', (0.4, 0.1, 0.0), 0.0, 0.3, emission=(1.0, 0.32, 0.04), strength=3.0)

def target_name(src):
    n = src or ''
    if 'Tire' in n: return tire
    if 'Rim' in n or 'Chrome' in n or 'DISCS' in n: return rim
    if 'LED_Red' in n: return red
    if 'LED_White' in n: return white
    if 'LED_Orange' in n: return orange
    if 'Glass' in n: return glass
    if 'CarPaint_Accent' in n: return accent
    if 'CarPaint' in n: return paint
    if 'Carbon' in n or 'Plastic' in n or 'Leather' in n or 'Harness' in n or 'Wiring' in n: return dark
    return metal

for slot in car.material_slots:
    src = slot.material.name if slot.material else ''
    if src.startswith('CAR_'):
        continue
    slot.material = target_name(src)

select(car)
bpy.ops.object.material_slot_remove_unused()

car.data.calc_loop_triangles()
print('final car tris', len(car.data.loop_triangles), 'materials', len(car.material_slots))

# preview with clean materials
world = bpy.data.worlds.new('W'); bpy.context.scene.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (0.02, 0.03, 0.05, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = 0.5
sun = bpy.data.lights.new('Sun', 'SUN'); sun.energy = 4.0; sun.angle = math.radians(3)
so = bpy.data.objects.new('Sun', sun); bpy.context.collection.objects.link(so)
so.rotation_euler = (math.radians(55), 0, math.radians(35))
sc = bpy.context.scene; sc.render.engine = 'BLENDER_EEVEE'; sc.eevee.taa_render_samples = 24
sc.render.resolution_x = 1000; sc.render.resolution_y = 700
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'
cam_data = bpy.data.cameras.new('Cam'); cam = bpy.data.objects.new('Cam', cam_data); bpy.context.collection.objects.link(cam)
sc.camera = cam; cam_data.lens = 55
mn, mx = bbox(car); ctr = (mn + mx) / 2; size = (mx - mn).length
cam.location = ctr + Vector((size * 0.75, -size * 1.05, size * 0.42))
cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler()
sc.render.filepath = '/private/var/folders/fj/gwg4chqx7nvfvygvwmcyxh240000gn/T/opencode/cyber/car_preview2.png'
bpy.ops.render.render(write_still=True)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format='GLB',
    use_selection=True,
    export_apply=True,
    export_yup=True,
    export_animations=False,
    export_cameras=False,
    export_lights=False,
    export_materials='EXPORT',
    export_image_format='NONE',
    export_texcoords=False,
    export_normals=True,
    export_tangents=False,
)
print('EXPORTED', OUT)
