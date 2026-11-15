"""Anvil Landing — hero Kitbash3D port scene.
Builds geometry/materials/lights and saves docs/kitbash-port/anvil_landing.blend.
Run: Blender -b -P scripts/kitbash/build_scene.py
"""
import bpy, bmesh, math, os, sys, random
from mathutils import Vector, Matrix, noise

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib_kb3d import *

WORK = "/Users/apple/.local/share/opencode/worktree/e0f2de/kitbash-port"
OUT_BLEND = f"{WORK}/docs/kitbash-port/anvil_landing.blend"
random.seed(12)

# ================================================================ scene
sc = reset()
sc.unit_settings.scale_length = 1.0
C_GROUND = collection("01_GROUND")
C_BLDG = collection("02_BUILDINGS")
C_CITY = collection("03_CITY")
C_PORT = collection("04_PORT")
C_GANTRY = collection("05_GANTRY")
C_PROPS = collection("06_PROPS")
C_SHIP = collection("07_SHIP")
C_PEOPLE = collection("08_PEOPLE")
C_LIGHT = collection("09_LIGHTS")
C_CAM = collection("10_CAMERAS")

# fonts
FONT = bpy.data.fonts.load("/System/Library/Fonts/Avenir Next Condensed.ttc")

# ================================================================ materials
kb_mats = {}
for s in ['Metal', 'MetalSilver', 'PanelsWhite', 'PanelsBlack', 'PanelsBrown',
          'Panels2', 'PanelsLightBlue', 'Iron', 'Glass', 'Tech', 'Lights', 'Floor']:
    kb_mats[s] = kb_material(s)

M_METAL = kb_mats['Metal']; M_IRON = kb_mats['Iron']; M_PANEL_W = kb_mats['PanelsWhite']
M_PANEL_B = kb_mats['PanelsBlack']; M_PANEL_BR = kb_mats['PanelsBrown']; M_PANEL_2 = kb_mats['Panels2']
M_PANEL_LB = kb_mats['PanelsLightBlue']; M_GLASS = kb_mats['Glass']; M_TECH = kb_mats['Tech']
M_LIGHTS = kb_mats['Lights']; M_FLOOR = kb_mats['Floor']; M_SILVER = kb_mats['MetalSilver']

M_WHITE = solid_mat("Paint_White", (0.78, 0.77, 0.72), 0.55)
M_YELLOW = solid_mat("Paint_Yellow", (0.85, 0.55, 0.06), 0.55)
M_RED = solid_mat("Paint_Red", (0.62, 0.08, 0.04), 0.55)
M_DARK = solid_mat("Paint_Dark", (0.035, 0.038, 0.042), 0.6)
M_GREY = solid_mat("Paint_Grey", (0.19, 0.20, 0.21), 0.7, 0.1)
M_RUBBER = solid_mat("Rubber", (0.018, 0.019, 0.021), 0.7)
M_ORANGE = solid_mat("SafetyOrange", (0.85, 0.24, 0.035), 0.5)
M_SUIT = solid_mat("Suit_Fabric", (0.36, 0.34, 0.28), 0.66)
M_SUIT_DARK = solid_mat("Suit_Dark", (0.06, 0.065, 0.07), 0.7)
M_VISOR = solid_mat("Suit_Visor", (0.01, 0.02, 0.03), 0.12, 0.6,
                    emis=(0.15, 0.55, 0.75), emis_strength=2.5)
M_NEON_CYAN = emission_mat("Neon_Cyan", (0.25, 0.85, 1.0), 22.0)
M_NEON_WARM = emission_mat("Neon_Warm", (1.0, 0.68, 0.32), 26.0)
M_NEON_RED = emission_mat("Neon_Red", (1.0, 0.08, 0.04), 30.0)
M_NEON_BLUE = emission_mat("Neon_Blue", (0.2, 0.45, 1.0), 18.0)
M_SIGN = emission_mat("Sign_Glow", (0.55, 0.85, 1.0), 5.0)
M_EDGE = emission_mat("Edge_Glow", (0.10, 0.55, 1.0), 5.0)
M_EDGE_WARM = emission_mat("Edge_Glow_Warm", (1.0, 0.62, 0.28), 4.0)
M_LAMP = emission_mat("Lamp_Warm", (1.0, 0.82, 0.60), 12.0)
M_FACADE = emission_mat("Facade_Glow", (0.06, 0.45, 1.0), 2.4)
M_FACADE_WARM = emission_mat("Facade_Glow_Warm", (1.0, 0.55, 0.22), 2.6)
M_SIGN_WARM = emission_mat("Sign_Glow_Warm", (1.0, 0.72, 0.40), 4.5)

# image-based special surfaces
M_HAZARD = image_mat("Hazard_Stripes", bpy.data.images.load(f"{GEN_TEX}/hazard_stripes.jpg"),
                     rough=0.62, uv_scale=1.0)
M_TERRAIN = bpy.data.materials.new("Terrain_PBR"); M_TERRAIN.use_nodes = True
nt = M_TERRAIN.node_tree; nt.nodes.clear()
out = nt.nodes.new('ShaderNodeOutputMaterial'); out.location = (500, 0)
bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled'); bsdf.location = (200, 0)
nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
uvn = nt.nodes.new('ShaderNodeTexCoord'); uvn.location = (-900, 100)
mp = nt.nodes.new('ShaderNodeMapping'); mp.location = (-700, 100)
mp.inputs['Scale'].default_value = (1, 1, 1)
nt.links.new(uvn.outputs['UV'], mp.inputs['Vector'])
albedo = bpy.data.images.load(f"{GEN_TEX}/terrain_albedo.jpg")
nrm = bpy.data.images.load(f"{GEN_TEX}/terrain_normal.png")
rgh = bpy.data.images.load(f"{GEN_TEX}/terrain_roughness.jpg")
set_cs(nrm, 'Non-Color'); set_cs(rgh, 'Non-Color')
t1 = nt.nodes.new('ShaderNodeTexImage'); t1.image = albedo; t1.location = (-450, 300)
t2 = nt.nodes.new('ShaderNodeTexImage'); t2.image = nrm; t2.location = (-450, 0)
t3 = nt.nodes.new('ShaderNodeTexImage'); t3.image = rgh; t3.location = (-450, -300)
for t in (t1, t2, t3):
    nt.links.new(mp.outputs['Vector'], t.inputs['Vector'])
nt.links.new(t1.outputs['Color'], bsdf.inputs['Base Color'])
nt.links.new(t3.outputs['Color'], bsdf.inputs['Roughness'])
nm = nt.nodes.new('ShaderNodeNormalMap'); nm.location = (-150, 0)
nm.inputs['Strength'].default_value = 0.85
nt.links.new(t2.outputs['Color'], nm.inputs['Color'])
# fine rocky bump stacked over the normal map
bn = nt.nodes.new('ShaderNodeTexNoise'); bn.location = (-180, 900)
bn.inputs['Scale'].default_value = 7.0; bn.inputs['Detail'].default_value = 8.0
bn.inputs['Roughness'].default_value = 0.65
nt.links.new(mp.outputs['Vector'], bn.inputs['Vector'])
bump = nt.nodes.new('ShaderNodeBump'); bump.location = (20, 880)
bump.inputs['Strength'].default_value = 0.38; bump.inputs['Distance'].default_value = 0.9
nt.links.new(bn.outputs['Fac'], bump.inputs['Height'])
nt.links.new(nm.outputs['Normal'], bump.inputs['Normal'])
nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
# macro color variation + distance desaturation via a second noise
noise_n = nt.nodes.new('ShaderNodeTexNoise'); noise_n.location = (-450, 550)
noise_n.inputs['Scale'].default_value = 3.0
nt.links.new(mp.outputs['Vector'], noise_n.inputs['Vector'])
ramp = nt.nodes.new('ShaderNodeValToRGB'); ramp.location = (-200, 550)
ramp.color_ramp.elements[0].color = (0.42, 0.45, 0.30, 1)
ramp.color_ramp.elements[1].color = (1.0, 0.97, 0.9, 1)
nt.links.new(noise_n.outputs['Fac'], ramp.inputs['Fac'])
mixc = nt.nodes.new('ShaderNodeMix'); mixc.data_type = 'RGBA'; mixc.blend_type = 'MULTIPLY'
mixc.inputs[0].default_value = 0.35
mixc.location = (0, 300)
nt.links.new(t1.outputs['Color'], mixc.inputs[6])
nt.links.new(ramp.outputs['Color'], mixc.inputs[7])
# steep faces take a darker rock tone
geo = nt.nodes.new('ShaderNodeNewGeometry'); geo.location = (-450, 750)
sepz = nt.nodes.new('ShaderNodeSeparateXYZ'); sepz.location = (-250, 750)
nt.links.new(geo.outputs['Normal'], sepz.inputs['Vector'])
slope = nt.nodes.new('ShaderNodeValToRGB'); slope.location = (0, 780)
slope.color_ramp.elements[0].position = 0.30; slope.color_ramp.elements[0].color = (1, 1, 1, 1)
slope.color_ramp.elements[1].position = 0.78; slope.color_ramp.elements[1].color = (0, 0, 0, 1)
nt.links.new(sepz.outputs['Z'], slope.inputs['Fac'])
slopemix = nt.nodes.new('ShaderNodeMix'); slopemix.data_type = 'RGBA'; slopemix.blend_type = 'MULTIPLY'
slopemix.inputs[0].default_value = 0.72
slopemix.inputs[6].default_value = (0.18, 0.165, 0.15, 1)
slopemix.location = (180, 560)
nt.links.new(slope.outputs['Color'], slopemix.inputs[0])
nt.links.new(mixc.outputs[2], slopemix.inputs[7])
tt = nt.nodes.new('ShaderNodeMix'); tt.data_type = 'RGBA'; tt.blend_type = 'MULTIPLY'
tt.inputs[0].default_value = 1.0
tt.inputs[6].default_value = (0.62, 0.62, 0.58, 1)
tt.location = (330, 560)
nt.links.new(slopemix.outputs[2], tt.inputs[7])
nt.links.new(tt.outputs[2], bsdf.inputs['Base Color'])

# ================================================================ terrain
def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)

def terrain_h(x, y):
    d = math.sqrt((x * 1.0) ** 2 + ((y - 30) * 0.95) ** 2)
    flat = smoothstep(235, 330, d)
    n1 = noise.noise(Vector((x * 0.004, y * 0.004, 0.5)))
    n2 = noise.noise(Vector((x * 0.013, y * 0.013, 1.7)))
    n3 = noise.noise(Vector((x * 0.031, y * 0.031, 4.2)))
    ridged = 1.0 - abs(noise.noise(Vector((x * 0.007, y * 0.007, 2.3))))
    ridged = ridged * ridged
    hills = (n1 * 0.42 + n2 * 0.26 + n3 * 0.10 + ridged * 0.38 + 0.55) * 26.0
    # mesa / cliff wall behind the city — deliberately not flattened by the port mask
    mesa_n = noise.noise(Vector((x * 0.0035, y * 0.002, 6.1)))
    mesa_y0 = 202 + mesa_n * 22
    mesa = smoothstep(mesa_y0, mesa_y0 + 14, y) * (1.0 - smoothstep(520, 600, y))
    mesa_h = 44.0 * (0.50 + 0.50 * noise.noise(Vector((x * 0.006, 0, 9.2))))
    ridge = mesa * mesa_h
    ridge += 8.0 * math.sin(x * 0.02) * smoothstep(230, 260, y) * (1 - flat)
    ridge += 95.0 * math.exp(-((y - 620) / 130.0) ** 2) * (0.55 + 0.45 * noise.noise(Vector((x * 0.003, 0, 3.7))))
    ridge += 55.0 * math.exp(-((x + 450) / 110.0) ** 2) * (0.6 + 0.4 * noise.noise(Vector((0, y * 0.004, 5.1))))
    ridge += 50.0 * math.exp(-((x - 470) / 120.0) ** 2) * (0.6 + 0.4 * noise.noise(Vector((0, y * 0.005, 8.2))))
    return hills * flat + ridge - 0.38

SIZE = 1300
SEG = 200
verts = []
for j in range(SEG + 1):
    y = -SIZE / 2 + SIZE * j / SEG
    for i in range(SEG + 1):
        x = -SIZE / 2 + SIZE * i / SEG
        z = terrain_h(x, y)
        # tiny undulation on flat apron surroundings
        if z < -0.35:
            z += 0.06 * noise.noise(Vector((x * 0.12, y * 0.12, 0.1)))
        verts.append((x, y, z))
faces = []
for j in range(SEG):
    for i in range(SEG):
        a = j * (SEG + 1) + i
        faces.append((a, a + 1, a + SEG + 2, a + SEG + 1))
me = bpy.data.meshes.new("Terrain"); me.from_pydata(verts, [], faces); me.update()
for p in me.polygons: p.use_smooth = True
uv = me.uv_layers.new(name="UVMap")
for poly in me.polygons:
    for li in poly.loop_indices:
        v = me.vertices[me.loops[li].vertex_index].co
        uv.data[li].uv = (v.x / 75.0 + 0.5, v.y / 75.0 + 0.5)
terrain = bpy.data.objects.new("Terrain", me); link(terrain, C_GROUND)
terrain.data.materials.append(M_TERRAIN)

# scattered boulders — sunk into the terrain, dark rock face
M_ROCK = surface_mat("Rock", bpy.data.images.load(f"{GEN_TEX}/terrain_albedo.jpg"),
                     bpy.data.images.load(f"{GEN_TEX}/terrain_normal.png"),
                     bpy.data.images.load(f"{GEN_TEX}/terrain_roughness.jpg"),
                     tint=(0.42, 0.40, 0.37), rough_scale=1.0)
rng_r = random.Random(23)
for i in range(16):
    ang = rng_r.uniform(0, math.tau)
    rad = rng_r.uniform(210, 540)
    x = math.cos(ang) * rad
    y = math.sin(ang) * rad + 40
    if abs(x) < 155 and -95 < y < 130:
        continue
    z = terrain_h(x, y)
    r = rng_r.uniform(3.0, 8.5)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=r, location=(x, y, z - r * 0.42))
    rock = bpy.context.object; rock.name = f"Rock_{i}"
    rock.scale = (rng_r.uniform(0.9, 1.9), rng_r.uniform(0.8, 1.6), rng_r.uniform(0.45, 0.9))
    bpy.ops.object.transform_apply(scale=True)
    md = rock.modifiers.new("disp", 'DISPLACE'); md.strength = r * 0.35
    md.texture = bpy.data.textures.new(f"rockT{i}", 'CLOUDS')
    md.texture.noise_scale = r * 0.35
    bpy.context.view_layer.objects.active = rock
    bpy.ops.object.modifier_apply(modifier=md.name)
    for p in rock.data.polygons: p.use_smooth = True
    if not rock.data.uv_layers:
        rock.data.uv_layers.new(name="UVMap")
        box_uv(rock.data, 0.06)
    rock.data.materials.append(M_ROCK)
    for c in list(rock.users_collection): c.objects.unlink(rock)
    C_GROUND.objects.link(rock)

# ================================================================ apron
APRON_Z = 0.0
apron_pts = [(-95, -60), (95, -60), (105, -50), (105, 70), (95, 80), (-95, 80), (-105, 70), (-105, -50)]
me = bpy.data.meshes.new("Apron")
bm = bmesh.new()
vs = [bm.verts.new((x, y, 0)) for x, y in apron_pts]
face = bm.faces.new(vs)
r = bmesh.ops.extrude_face_region(bm, geom=[face])
for v in r['geom']:
    if isinstance(v, bmesh.types.BMVert):
        v.co.z = -0.65
bm.normal_update()
bm.to_mesh(me); bm.free()
box_uv(me, 0.05)
apron = bpy.data.objects.new("Apron", me); link(apron, C_GROUND)
M_APRON = surface_mat("Apron_Concrete",
    bpy.data.images.load(f"{GEN_TEX}/concrete_albedo.jpg"),
    bpy.data.images.load(f"{GEN_TEX}/concrete_normal.png"),
    bpy.data.images.load(f"{GEN_TEX}/concrete_roughness.jpg"),
    tint=(0.52, 0.515, 0.495), rough_scale=1.05, normal_strength=0.9)
apron.data.materials.append(M_APRON)

# pad: 60 x 60, chamfer 5
pad_pts = [(-25, -30), (25, -30), (30, -25), (30, 25), (25, 30), (-25, 30), (-30, 25), (-30, -25)]
me = bpy.data.meshes.new("TLOF")
bm = bmesh.new()
vs = [bm.verts.new((x, y, 0)) for x, y in pad_pts]
f = bm.faces.new(vs)
r = bmesh.ops.extrude_face_region(bm, geom=[f])
for v in r['geom']:
    if isinstance(v, bmesh.types.BMVert):
        v.co.z = -0.12
bm.normal_update(); bm.to_mesh(me); bm.free()
box_uv(me, 0.05)
pad = bpy.data.objects.new("TLOF_Pad", me); link(pad, C_GROUND)
pad.location.z = 0.035
M_PAD = surface_mat("Pad_Concrete",
    bpy.data.images.load(f"{GEN_TEX}/concrete_albedo.jpg"),
    bpy.data.images.load(f"{GEN_TEX}/concrete_normal.png"),
    bpy.data.images.load(f"{GEN_TEX}/concrete_roughness.jpg"),
    tint=(0.82, 0.80, 0.75), rough_scale=1.0, normal_strength=1.0)
pad.data.materials.append(M_PAD)

# taxiway west + east
for nm, x0, x1, y0, y1 in [("Taxiway_W", -160, -105, -16, 16), ("Taxiway_E", 105, 145, -16, 16)]:
    w = x1 - x0; h = y1 - y0
    ob = box(nm, (w, h, 0.6), ((x0 + x1) / 2, (y0 + y1) / 2, -0.3), M_APRON, coll=C_GROUND, uv=True)
    box_uv(ob.data, 0.05)

# apron perimeter line
def stripe(name, x0, y0, x1, y1, width=0.45, mat=M_WHITE, z=0.012):
    dx = x1 - x0; dy = y1 - y0
    length = math.hypot(dx, dy)
    ang = math.atan2(dy, dx)
    ob = box(name, (length, width, 0.012), ((x0 + x1) / 2, (y0 + y1) / 2, z), mat, rot=(0, 0, ang), coll=C_GROUND, uv=False)
    return ob

stripe("Line_S", -92, -54, 92, -54, 0.5)
stripe("Line_N", -92, 76, 92, 76, 0.5)
stripe("Line_W", -101, -48, -101, 74, 0.5)
stripe("Line_E", 101, -48, 101, 74, 0.5)
# dashed taxi centerline
for i in range(14):
    x = 34 + i * 4.8
    stripe(f"TaxiDash_{i}", x, 0, x + 2.6, 0, 0.42, M_YELLOW, 0.014)
for i in range(8):
    x = -36 - i * 4.8
    stripe(f"TaxiDashW_{i}", x - 2.6, 0, x, 0, 0.42, M_YELLOW, 0.014)

# pad circle + H
ring("TLOF_Ring", 21.0, 0.35, (0, 0, 0.055), M_WHITE, C_GROUND, scale_z=0.05)
ring("TLOF_Ring2", 25.0, 0.16, (0, 0, 0.052), M_WHITE, C_GROUND, scale_z=0.05)
# H bars
box("TLOF_H_L", (2.0, 13, 0.006), (-6.2, 0, 0.055), M_WHITE, coll=C_GROUND, uv=False)
box("TLOF_H_R", (2.0, 13, 0.006), (6.2, 0, 0.055), M_WHITE, coll=C_GROUND, uv=False)
box("TLOF_H_C", (10.4, 2.0, 0.006), (0, 0, 0.055), M_WHITE, coll=C_GROUND, uv=False)
# corner brackets on pad
for sx in (-1, 1):
    for sy in (-1, 1):
        cx, cy = sx * 27.5, sy * 27.5
        stripe(f"PadCornerA_{sx}_{sy}", cx - sx * 2.2, cy, cx, cy, 0.45, M_WHITE, 0.02)
        stripe(f"PadCornerB_{sx}_{sy}", cx, cy - sy * 2.2, cx, cy, 0.45, M_WHITE, 0.02)

# apron lettering
t = text_mesh("ApronTitle", "ANVIL LANDING", 5.4, (-18, -32, 0.06), M_WHITE, font=FONT, coll=C_GROUND, extrude=0.005, spacing=0.92)
t2 = text_mesh("ApronSub", "PORT AUTHORITY  //  APRON A  //  SECTOR 07", 2.1, (-18, -37.5, 0.06), M_WHITE, font=FONT, coll=C_GROUND, extrude=0.004, spacing=0.95)
text_mesh("PadTLOF", "TLOF-01", 2.0, (0, -27.5, 0.06), M_WHITE, font=FONT, coll=C_GROUND, extrude=0.004)
text_mesh("PadSize", "60 m  /  R 21", 1.6, (0, 27.0, 0.06), M_WHITE, font=FONT, coll=C_GROUND, extrude=0.004)
text_mesh("PadCode", "A-30", 3.2, (-19, 20, 0.06), M_YELLOW, font=FONT, coll=C_GROUND, extrude=0.004)

# parking stands west
for idx, (cx, cy) in enumerate([(-72, -30), (-72, 18), (-35, -42)]):
    stripe(f"Stand_{idx}_a", cx - 16, cy - 11, cx + 16, cy - 11, 0.35, M_YELLOW, 0.012)
    stripe(f"Stand_{idx}_b", cx - 16, cy + 11, cx + 16, cy + 11, 0.35, M_YELLOW, 0.012)
    stripe(f"Stand_{idx}_c", cx - 16, cy - 11, cx - 16, cy + 11, 0.35, M_YELLOW, 0.012)
    stripe(f"Stand_{idx}_d", cx + 16, cy - 11, cx + 16, cy + 11, 0.35, M_YELLOW, 0.012)
    text_mesh(f"StandNum_{idx}", f"P{idx+2}", 2.6, (cx, cy - 8.6, 0.055), M_YELLOW, font=FONT, coll=C_GROUND, extrude=0.003)
# big arrow on apron
stripe("ArrowShaft", 42, -42, 52, -42, 1.2, M_YELLOW, 0.013)
stripe("ArrowL", 52, -42, 48, -38.5, 0.9, M_YELLOW, 0.013)
stripe("ArrowR", 52, -42, 48, -45.5, 0.9, M_YELLOW, 0.013)

# skid marks
M_SKID = solid_mat("Skid_Marks", (0.05, 0.05, 0.05), 0.75)
for i, (x, y, ang, ln) in enumerate([(-8, -38, 8, 22), (-2, -40, 10, 18), (40, 25, -5, 26)]):
    ob = box(f"Skid_{i}", (ln, 0.35 + i * 0.08, 0.005), (x, y, 0.024), M_SKID, rot=(0, 0, math.radians(ang)), coll=C_GROUND, uv=False)
    ob.data.materials.clear(); ob.data.materials.append(M_SKID)

# hazard area at gantry base
for sx in (-1, 1):
    ob = box(f"Hazard_Gantry_{sx}", (9, 4, 0.012), (20, sx * 26, 0.03), M_HAZARD, coll=C_GROUND, uv=True)
    box_uv(ob.data, 0.25)

# ================================================================ kit import
print("IMPORT KITBASH3D ...")
mods = import_fbx()
print("modules", len(mods))
for o in mods.values():
    for c in list(o.users_collection):
        c.objects.unlink(o)
    C_BLDG.objects.link(o)
    hide_render(o)
assign_kb_materials([o for o in mods.values()])

# ================================================================ hero buildings
HERO = [
    # key, x, y, rot, scale, collection
    ("BldgLG_G", -38, 52, 4, 1.0),
    ("BldgLG_H", -10, 50, -3, 1.0),
    ("BldgLG_I", 30, 51, 0, 1.14),
    ("BldgLG_J", 61, 55, 7, 1.0),
]
placed = {}
for key, x, y, rz, s in HERO:
    ob = mods[key]
    ob.hide_render = False; ob.hide_set(False)
    place(ob, (x, y, 0), rz, s, C_BLDG)
    placed[key] = ob
    print("HERO", key, "dims", [round(v, 1) for v in ob.dimensions])

# secondary backdrop buildings at port edge
SEC = [
    ("BldgSM_C", -30, 80, 0, 2.4),
    ("BldgSM_H", 54, 80, 10, 2.2),
]
for key, x, y, rz, s in SEC:
    if key not in mods: continue
    ob = mods[key]; ob.hide_render = False; ob.hide_set(False)
    place(ob, (x, y, 0), rz, s, C_BLDG)
    placed[key] = ob

# ================================================================ background city
city_pool = [k for k in mods if k.startswith(("BldgMD_", "BldgSM_"))]
random.shuffle(city_pool)
city_spots = []
for i in range(24):
    x = random.uniform(-190, 190)
    y = random.uniform(95, 175)
    if abs(x) < 18 and y < 110:
        continue
    city_spots.append((x, y))
for i, (x, y) in enumerate(city_spots):
    key = city_pool[i % len(city_pool)]
    ob = mods[key]
    dup = ob.copy(); dup.data = ob.data  # linked mesh data
    dup.name = f"CITY_{i}_{key}"
    dup.hide_render = False
    link(dup, C_CITY)
    base_scale = random.uniform(2.0, 4.2)
    place(dup, (x, y, -0.38), random.uniform(-180, 180), base_scale, C_CITY)
    # some vertical extension
    if random.random() < 0.3:
        h = random.uniform(1.2, 2.0)
        dup.scale.z *= h

# ================================================================ ship + gantry
from build_port import build_ship, build_gantry, build_light_mast

ship = build_ship(C_SHIP, M_METAL, M_ORANGE, M_DARK, M_HAZARD, M_EDGE, M_NEON_RED, M_EDGE_WARM)
print("SHIP", [round(v,2) for v in ship.dimensions])
build_gantry(C_GANTRY, M_METAL, M_IRON, M_HAZARD, M_EDGE_WARM, M_NEON_RED, M_EDGE,
             M_DARK, M_YELLOW, light_coll=C_LIGHT)
for i, (lx, ly, tx, ty) in enumerate([(82, -38, 10, 0), (-96, 58, -30, 28), (92, 52, 20, 20)]):
    build_light_mast(C_PORT, f"ApronLight_{i}", (lx, ly), (tx, ty), height=17.0, light_coll=C_LIGHT)

# ================================================================ port dressing
from build_props import (container, crate, tank_vertical, tank_horizontal, pipe_rack,
                         ground_power, boarding_stairs, build_person, pad_edge_lights,
                         barrel, windsock, tug)
from build_architecture import (control_cab, skybridge, hangar_door, lit_windows,
                                road, city_edge, cliff_wall)

def scale_uv(ob, s):
    for layer in ob.data.uv_layers:
        for d in layer.data:
            d.uv = (d.uv[0] * s, d.uv[1] * s)

# container yard (right foreground) and secondary stack (left)
container(C_PORT, "Container_R1", (34, -37), 12, M_PANEL_BR)
container(C_PORT, "Container_R2", (34, -37, 2.63), 12, M_PANEL_2)
container(C_PORT, "Container_R3", (47, -39), -8, M_PANEL_LB)
container(C_PORT, "Container_R4", (47, -39, 2.63), -8, M_PANEL_B)
container(C_PORT, "Container_L1", (-58, -33), -22, M_PANEL_LB)
container(C_PORT, "Container_L2", (-58, -33, 2.63), -22, M_PANEL_BR)
# crates
crate(C_PORT, "Crate_1", (47, -32, 0.02), (4.6, 2.6, 2.2), 14, M_PANEL_2)
crate(C_PORT, "Crate_2", (52, -33, 0.02), (3.0, 2.2, 1.7), -6, M_PANEL_BR)
crate(C_PORT, "Crate_3", (49, -33, 2.24), (3.6, 2.2, 1.6), 8, M_PANEL_B)
crate(C_PORT, "Crate_4", (-64, -43, 0.02), (3.4, 2.4, 1.9), 23, M_PANEL_LB)
crate(C_PORT, "Crate_5", (-69, -44, 0.02), (2.4, 2.4, 1.4), -12, M_PANEL_2)

# cryo tank farm with bund wall
for i, ty in enumerate((33, 46)):
    tank_vertical(C_PORT, f"CryoTank_{i}", (-82, ty), 3.0, 10.5, M_PANEL_LB)
tank_horizontal(C_PORT, "DayTank", (-61, 40), 2.0, 10.0, M_PANEL_LB)
# bund walls
for nm, size, pos in [("Bund_S", (22, 0.5, 1.0), (-80, 24, 0.5)),
                      ("Bund_N", (22, 0.5, 1.0), (-80, 55, 0.5)),
                      ("Bund_W", (0.5, 31, 1.0), (-91, 39.5, 0.5)),
                      ("Bund_E", (0.5, 31, 1.0), (-69, 39.5, 0.5))]:
    box(nm, size, pos, M_APRON, coll=C_PORT, bevel=0.04)
    box(nm+"_Haz", (size[0] * 0.9, size[1] + 0.04, 0.06), (pos[0], pos[1], 1.02), M_HAZARD, coll=C_PORT, bevel=0.005)
pipe_rack(C_PORT, 28, -95, -42, z0=3.0)

# ground power + boarding stairs + crew
ground_power(C_PORT, "GPU_01", (3.0, -10.0), 22, ship_mw=ship.matrix_world)
base = ship.matrix_world @ Vector((-10.5, -2.5, 0.0))
boarding_stairs(C_PORT, "Boarding_Stairs", (base.x, base.y), 72 + 90, ship_mw=ship.matrix_world, top=2.15)
build_person(C_PEOPLE, "Crew_A", (-16, -21, 0.02), 36, 'stand')
build_person(C_PEOPLE, "Crew_B", (-3.0, -12.5, 0.02), 220, 'stand')
build_person(C_PEOPLE, "Crew_C", (24.7, -22, 21.08), 95, 'stand')
build_person(C_PEOPLE, "Crew_D", (57, -31, 0.02), 200, 'stand')

# small port props
windsock(C_PORT, "Windsock", (-44, -38), 7.0, 20)
tug(C_PORT, "Tug_01", (16, -24), -18)
for i, (bx, by, bm) in enumerate([(36, -33, M_PANEL_LB), (37.4, -32.4, M_PANEL_BR), (36.7, -34.0, M_PANEL_2)]):
    barrel(C_PORT, f"Barrel_R{i}", (bx, by), bm)
for i, (bx, by, bm) in enumerate([(-18, -27, M_PANEL_BR), (-17, -28.2, M_PANEL_LB)]):
    barrel(C_PORT, f"Barrel_L{i}", (bx, by), bm)
# foreground crate near the close-up
crate(C_PORT, "Crate_Fore", (-30, -40, 0.02), (2.8, 2.0, 1.6), 18, M_PANEL_2)
crate(C_PORT, "Crate_Fore2", (-27, -41, 0.02), (2.0, 1.8, 1.3), -8, M_PANEL_BR)

# pad border + edge lights
for nm, size, pos in [("PadEdge_S", (61.0, 0.5, 0.03), (0, -30, 0.045)),
                      ("PadEdge_N", (61.0, 0.5, 0.03), (0, 30, 0.045)),
                      ("PadEdge_W", (0.5, 61.0, 0.03), (-30, 0, 0.045)),
                      ("PadEdge_E", (0.5, 61.0, 0.03), (30, 0, 0.045))]:
    box(nm, size, pos, M_DARK, coll=C_PORT, uv=False)
pad_edge_lights(C_PORT, size=30, step=5)

# neon facade strips + hangar sign
def facade_lights(ob, neon, warm):
    mn, mx = bbox(ob)
    h = mx.z - mn.z
    w = mx.x - mn.x
    cx = (mn.x + mx.x) / 2
    # base wash of warm light at the entrances
    box("FacadeBaseBar", (w * 0.70, 0.10, 0.10), (cx, mn.y - 0.12, mn.z + 0.8), M_DARK, coll=C_BLDG, bevel=0.01)
    box("FacadeBaseGlow", (w * 0.68, 0.035, 0.05), (cx, mn.y - 0.19, mn.z + 0.8), M_FACADE_WARM, coll=C_BLDG, uv=False)
    for frac in (0.32, 0.60):
        box("FacadeBandBar", (w * 0.55, 0.10, 0.12), (cx, mn.y - 0.13, mn.z + h * frac), M_DARK, coll=C_BLDG, bevel=0.01)
        box("FacadeBand", (w * 0.53, 0.035, 0.05), (cx, mn.y - 0.20, mn.z + h * frac), warm, coll=C_BLDG, uv=False)

facade_lights(placed['BldgLG_G'], M_FACADE, M_FACADE_WARM)
facade_lights(placed['BldgLG_H'], M_FACADE_WARM, M_FACADE)
facade_lights(placed['BldgLG_I'], M_FACADE, M_FACADE_WARM)
facade_lights(placed['BldgLG_J'], M_FACADE, M_FACADE_WARM)
# big hangar sign on I
mn, mx = bbox(placed['BldgLG_I'])
cx = (mn.x + mx.x) / 2; w = mx.x - mn.x; h = mx.z
sy = mn.y - 0.3
box("HangarSign_Back", (w * 0.42, 0.28, 2.5), (cx, sy, h * 0.79), M_DARK, coll=C_BLDG, bevel=0.03)
text_mesh("HangarSign_Main", "ANVIL LANDING", 1.22, (cx, sy - 0.20, h * 0.79 + 0.35),
          M_SIGN, rot=(math.radians(90), 0, 0), font=FONT, coll=C_BLDG, extrude=0.015, spacing=0.9)
text_mesh("HangarSign_Sub", "PORT 07   //   HANGAR 3", 0.48, (cx, sy - 0.21, h * 0.79 - 0.62),
          M_SIGN_WARM, rot=(math.radians(90), 0, 0), font=FONT, coll=C_BLDG, extrude=0.01, spacing=0.95)
# neon frame around the sign
for sx in (-1, 1):
    box(f"HangarSign_FrameV_{sx}", (0.06, 0.05, 2.4), (cx + sx * w * 0.21, sy - 0.22, h * 0.79),
        M_EDGE, coll=C_BLDG, uv=False)
for sz in (-1, 1):
    box(f"HangarSign_FrameH_{sz}", (w * 0.42, 0.05, 0.06), (cx, sy - 0.22, h * 0.79 + sz * 1.2),
        M_EDGE, coll=C_BLDG, uv=False)

# rooftop antennae / vents / doors from the kit (props are authored at 1/10 scale)
def place_prop(key, loc, rot=0, scale=10.0, coll=C_PORT, uv_scale=None):
    ob = mods.get(key)
    if not ob: return None
    ob.hide_render = False; ob.hide_set(False)
    place(ob, loc, rot, scale, coll)
    if uv_scale is None: uv_scale = scale / 10.0
    scale_uv(ob, uv_scale)
    return ob

hmn, hmx = bbox(placed['BldgLG_H'])
place_prop('Antenna_A', (hmn.x + 0.7 * (hmx.x - hmn.x), (hmn.y + hmx.y) / 2, hmx.z - 0.2), 8, 10.0)
place_prop('Vent_A', (hmn.x + 1.8, hmn.y + 2.0, hmx.z - 0.15), 0, 12.0)
imn, imx = bbox(placed['BldgLG_I'])
place_prop('Antenna_B', (imn.x + 2.0, (imn.y + imx.y) / 2, imx.z - 0.2), 0, 12.0)
place_prop('Vent_B', (imn.x + 0.8 * (imx.x - imn.x), (imn.y + imx.y) / 2, imx.z - 0.1), 15, 12.0)
place_prop('Gate_A', (imn.x + 5.5, imn.y - 0.15, 0.02), 0, 10.0)
place_prop('Door_B', (hmn.x + 2.4, hmn.y - 0.1, 0.02), 0, 10.0)
place_prop('Chest_B', (44, -34, 0.02), 20, 9.0)
place_prop('Chest_A', (-61, -39, 0.02), -30, 9.0)
place_prop('Vent_A', (24.2, -28.3, 24.12), 90, 9.0, coll=C_GANTRY)
place_prop('Antenna_A', (70, -29.5, 0.0), -8, 5.0)

# tall city skyline towers (thin silhouettes above the hero buildings)
skyline = [(-140, 145, 3.6, -12), (-105, 155, 4.0, 8), (-65, 150, 3.4, -6),
           (-20, 160, 4.2, 14), (25, 148, 3.8, -10), (70, 158, 4.0, 6),
           (115, 150, 3.5, -8), (155, 160, 3.7, 10)]
for i, (x, y, scl, rz) in enumerate(skyline):
    key = ['BldgMD_A', 'BldgMD_D', 'BldgMD_F', 'BldgMD_G', 'BldgSM_C'][i % 5]
    ob = mods[key]
    dup = ob.copy(); dup.data = ob.data
    dup.name = f"SKY_{i}_{key}"; dup.hide_render = False
    link(dup, C_CITY)
    place(dup, (x, y, -0.38), rz, scl, C_CITY)
    bpy.context.view_layer.update()
    mn, mx = bbox(dup)
    # vertical edge light + roofline
    box(f"SKY_Light_{i}", (0.5, 0.2, (mx.z - mn.z) * 0.6), (mn.x + 0.6, mn.y - 0.3, mn.z + (mx.z - mn.z) * 0.38),
        M_EDGE if i % 2 else M_EDGE_WARM, coll=C_CITY, uv=False)
    if i % 2 == 0:
        cyl(f"SKY_Spire_{i}", 0.18, 13, (x, y, mx.z + 6.5), M_METAL, coll=C_CITY, verts=8)
        sphere(f"SKY_Beacon_{i}", 0.35, (x, y, mx.z + 13.2), M_NEON_RED, segs=10, rings=6, coll=C_CITY)

# ================================================================ architecture
# control cab on the terminal tower
control_cab(C_BLDG, bbox(placed['BldgLG_H']), M_GLASS, M_METAL, M_DARK, M_FACADE_WARM,
            C_LIGHT, "TerminalCab")
# enclosed skybridge between H and I
skybridge(C_BLDG, bbox(placed['BldgLG_H']), bbox(placed['BldgLG_I']), M_GLASS, M_METAL,
          M_DARK, M_FACADE_WARM, C_LIGHT, "Skybridge")
# main hangar door
hangar_door(C_BLDG, bbox(placed['BldgLG_I']), M_PANEL_2, M_DARK, M_EDGE, M_FACADE_WARM,
            C_LIGHT, "HangarDoor")
# lit windows scattered over the hero fronts
lit_windows(C_BLDG, bbox(placed['BldgLG_G']), 41, "WinG", M_FACADE_WARM, M_FACADE, M_DARK)
lit_windows(C_BLDG, bbox(placed['BldgLG_H']), 42, "WinH", M_FACADE_WARM, M_FACADE, M_DARK)
lit_windows(C_BLDG, bbox(placed['BldgLG_I']), 43, "WinI", M_FACADE_WARM, M_FACADE, M_DARK)
lit_windows(C_BLDG, bbox(placed['BldgLG_J']), 44, "WinJ", M_FACADE_WARM, M_FACADE, M_DARK)

# road, city edge and rock rim
road(C_CITY, 84.0, -240, 240)
city_edge(C_CITY, mods, M_METAL, M_EDGE, M_FACADE_WARM, M_NEON_RED)
for i, (x, y, scl, rz, key) in enumerate([(-155, 132, 3.4, -10, 'BldgMD_A'),
                                          (-78, 136, 3.8, 6, 'BldgMD_C'),
                                          (12, 134, 3.6, -4, 'BldgMD_G'),
                                          (96, 138, 4.0, 8, 'BldgMD_D')]):
    if key not in mods: continue
    ob = mods[key]; dup = ob.copy(); dup.data = ob.data
    dup.name = f"ROW2_{i}_{key}"; dup.hide_render = False
    link(dup, C_CITY); place(dup, (x, y, -0.38), rz, scl, C_CITY)
    bpy.context.view_layer.update(); mn, mx = bbox(dup)
    box(f"ROW2_Glow_{i}", ((mx.x - mn.x) * 0.5, 0.25, 0.4), ((mn.x + mx.x) / 2, mn.y - 0.3, mn.z + (mx.z - mn.z) * 0.6),
        M_FACADE_WARM, coll=C_CITY, uv=False)
M_CLIFF = surface_mat("Cliff_Rock",
    bpy.data.images.load(f"{GEN_TEX}/terrain_albedo.jpg"),
    bpy.data.images.load(f"{GEN_TEX}/terrain_normal.png"),
    bpy.data.images.load(f"{GEN_TEX}/terrain_roughness.jpg"),
    tint=(0.62, 0.59, 0.54), rough_scale=1.0, normal_strength=1.5)
cliff_wall(C_GROUND, M_CLIFF, -380, 380, 190.0)

# ================================================================ lighting
world = world_image_sky(sc, f"{GEN_TEX}/dusk_sky.jpg", strength=0.46, rot_z=0.0)
sun = make_light("Sun_Key", 'SUN', (-250, -160, 97), 6.3, (1.0, 0.84, 0.66), coll=C_LIGHT,
                 angle=math.radians(2.0))
point_at(sun, (0, 10, 0))

make_light("Sky_Fill", 'AREA', (0, -180, 55), 2500, (0.45, 0.62, 1.0),
           rot=(math.radians(64), 0, 0), size=(210, 90), coll=C_LIGHT)
make_light("Rim_Back", 'AREA', (90, 150, 70), 7000, (0.50, 0.70, 1.0),
           rot=(math.radians(-55), 0, math.radians(160)), size=(150, 60), coll=C_LIGHT)
make_light("Pad_Key", 'AREA', (0, -5, 34), 18000, (1.0, 0.82, 0.64),
           rot=(0, 0, 0), size=(46, 36), coll=C_LIGHT)
point_at(bpy.data.objects["Pad_Key"], (0, 0, 0))
make_light("Apron_Bounce", 'AREA', (-25, -45, 22), 9000, (0.58, 0.72, 1.0),
           rot=(math.radians(12), 0, 0), size=(170, 110), coll=C_LIGHT)
sk = make_light("Ship_Key", 'AREA', (-14, -6, 20), 5500, (1.0, 0.86, 0.70),
           size=(13, 9), coll=C_LIGHT)
point_at(sk, (-6, 0, 3))
rk = make_light("Ship_Rim", 'AREA', (18, 18, 14), 4500, (0.45, 0.70, 1.0),
           size=(15, 8), coll=C_LIGHT)
point_at(rk, (-6, 0, 4))
sf = make_light("Ship_Front", 'AREA', (-23, -23, 6.5), 4200, (1.0, 0.84, 0.66),
           size=(12, 6), coll=C_LIGHT)
point_at(sf, (-6, 0, 4))
for i, (fx, fy, fz, tx, ty, tz, en) in enumerate([
        (-38, 34, 1.2, -38, 52, 16, 4500),
        (-10, 33, 1.2, -10, 50, 14, 4200),
        (30, 34, 1.2, 30, 51, 11, 4500),
        (61, 38, 1.2, 61, 55, 10, 3000)]):
    fl = make_light(f"Facade_Up_{i}", 'SPOT', (fx, fy, fz), en, (1.0, 0.78, 0.55),
                    spot_size=math.radians(55))
    point_at(fl, (tx, ty, tz))
# cool east rim and warm west accent
er = make_light("East_Rim", 'AREA', (145, -10, 45), 6500, (0.40, 0.62, 1.0),
                size=(70, 35), coll=C_LIGHT); point_at(er, (20, 45, 16))
wr = make_light("West_Warm", 'AREA', (-150, 12, 32), 5500, (1.0, 0.66, 0.36),
                size=(60, 30), coll=C_LIGHT); point_at(wr, (-30, 45, 15))
# broad soft front fill so the hero facades read like a lit port
ff = make_light("Facade_Fill", 'AREA', (5, 30, 17), 30000, (1.0, 0.86, 0.72),
                size=(105, 18), coll=C_LIGHT); point_at(ff, (5, 52, 13))
cf = make_light("Facade_Cool", 'AREA', (-55, 26, 9), 6000, (0.48, 0.66, 1.0),
                size=(45, 12), coll=C_LIGHT); point_at(cf, (-30, 52, 10))

# ================================================================ render settings
sc.render.engine = 'BLENDER_EEVEE'
sc.eevee.taa_render_samples = 48
sc.eevee.use_raytracing = True
try:
    sc.eevee.shadow_pool_size = '2048'
except Exception:
    pass
try:
    sc.eevee.ray_tracing_method = 'SCREEN'
    sc.eevee.ray_tracing_options.trace_max_roughness = 0.6
    sc.eevee.use_fast_gi = True
    sc.eevee.fast_gi_distance = 2.5
except Exception as e:
    print("eevee", e)
sc.render.resolution_x = 1920
sc.render.resolution_y = 1200
sc.render.resolution_percentage = 100
sc.render.film_transparent = False
sc.view_settings.view_transform = 'AgX'
try:
    sc.view_settings.look = 'AgX - Punchy'
except Exception:
    sc.view_settings.look = 'AgX - Medium High Contrast'
sc.view_settings.exposure = 0.68
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_mode = 'RGB'
sc.render.image_settings.compression = 15

# cameras
def camera(name, loc, target, lens=42, fstop=8.0):
    cd = bpy.data.cameras.new(name); ob = bpy.data.objects.new(name, cd); link(ob, C_CAM)
    ob.location = loc; cd.lens = lens; cd.clip_start = 0.2; cd.clip_end = 3000
    point_at(ob, target)
    return ob
cam_wide = camera("Cam_Wide", (-38, -76, 17), (3, 10, 12), 26)
cam_close = camera("Cam_Close", (-38, -54, 6.2), (-6, 1, 4.5), 42)
cam_aerial = camera("Cam_Aerial", (-120, -145, 82), (5, 40, 12), 55)
cam_detail = camera("Cam_Detail", (-17, -30, 3.2), (-4, -2, 4.2), 70)
sc.camera = cam_wide

bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print("SAVED", OUT_BLEND)
