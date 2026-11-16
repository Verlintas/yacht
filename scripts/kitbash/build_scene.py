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
C_PROTO = collection("00_PROTO")

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

# ================================================================ authored city deck
from build_deck import deck as build_city_deck
build_city_deck(C_GROUND, M_TERRAIN, M_DARK, M_WHITE, M_YELLOW, M_HAZARD, M_EDGE, M_EDGE_WARM,
                M_METAL, M_PANEL_B, M_PANEL_W, FONT)

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

# ================================================================ ship + gantry
from build_port import build_ship, build_gantry, build_light_mast

ship = build_ship(C_SHIP, M_METAL, M_ORANGE, M_DARK, M_HAZARD, M_EDGE, M_NEON_RED, M_EDGE_WARM)
print("SHIP", [round(v,2) for v in ship.dimensions])
build_gantry(C_GANTRY, M_METAL, M_IRON, M_HAZARD, M_EDGE_WARM, M_NEON_RED, M_EDGE,
             M_DARK, M_YELLOW, light_coll=C_LIGHT)
for i, (lx, ly, tx, ty) in enumerate([(82, -38, 10, 0), (-96, 20, -20, 0),
                                      (-105, 40, -30, 25), (100, 20, 20, 10)]):
    build_light_mast(C_PORT, f"ApronLight_{i}", (lx, ly), (tx, ty), height=22.0, light_coll=C_LIGHT)

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
build_person(C_PEOPLE, "Crew_C", (24.7, -22, 27.12), 95, 'stand')
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


# ================================================================ hero port foreground
from build_terminal import hero_terminal
from build_greebles import Greebles, dress_terminal
from build_tiers import build_midground, build_background, low_rise

term_bb, wh_bb, tw_bb = hero_terminal(
    C_PORT, C_LIGHT, M_METAL, M_IRON, M_PANEL_W, M_PANEL_B, M_PANEL_BR, M_PANEL_2,
    M_PANEL_LB, M_GLASS, M_TECH, M_LIGHTS, M_WHITE, M_YELLOW, M_DARK, M_ORANGE,
    M_HAZARD, M_EDGE, M_EDGE_WARM, M_NEON_RED, M_NEON_WARM, M_SIGN, M_SIGN_WARM, FONT)
print("TERMINAL BBOX", term_bb[0][:], term_bb[1][:])

G = Greebles(C_PROTO)
dress_terminal(G, term_bb, wh_bb, tw_bb, C_PORT)

# ================================================================ city tiers
mid = build_midground(mods, C_CITY, C_CITY, G, dress=True)
bg = build_background(mods, C_CITY, C_CITY, G, dress=True)
low_rise(mods, C_CITY, G)

# ================================================================ lighting
world = world_image_sky(sc, f"{GEN_TEX}/dusk_sky.jpg", strength=0.46, rot_z=0.0)
sun = make_light("Sun_Key", 'SUN', (-350, -260, 180), 6.4, (1.0, 0.83, 0.63),
                 coll=C_LIGHT, angle=math.radians(2.0))
point_at(sun, (0, 220, 0))
make_light("Sky_Fill", 'AREA', (0, -300, 260), 32000, (0.48, 0.64, 1.0),
           size=(760, 320), coll=C_LIGHT)
point_at(bpy.data.objects["Sky_Fill"], (0, 260, 150))
make_light("City_Fill", 'AREA', (0, 190, 220), 50000, (0.80, 0.86, 1.0),
           size=(900, 320), coll=C_LIGHT)
point_at(bpy.data.objects["City_Fill"], (0, 480, 140))
make_light("City_Rim", 'AREA', (380, 560, 420), 42000, (0.55, 0.72, 1.0),
           size=(600, 260), coll=C_LIGHT)
point_at(bpy.data.objects["City_Rim"], (0, 420, 280))
make_light("Rim_Back", 'AREA', (250, 300, 160), 18000, (0.55, 0.72, 1.0),
           size=(300, 140), coll=C_LIGHT)
point_at(bpy.data.objects["Rim_Back"], (0, 120, 100))
make_light("Pad_Key", 'AREA', (0, -5, 36), 18000, (1.0, 0.84, 0.66),
           size=(46, 36), coll=C_LIGHT)
point_at(bpy.data.objects["Pad_Key"], (0, 0, 0))
make_light("Apron_Bounce", 'AREA', (-25, -45, 22), 9000, (0.58, 0.72, 1.0),
           rot=(math.radians(12), 0, 0), size=(170, 110), coll=C_LIGHT)
sk = make_light("Ship_Key", 'AREA', (-14, -6, 20), 5500, (1.0, 0.86, 0.70),
                size=(13, 9), coll=C_LIGHT); point_at(sk, (-6, 0, 3))
rk = make_light("Ship_Rim", 'AREA', (18, 18, 14), 4500, (0.45, 0.70, 1.0),
                size=(15, 8), coll=C_LIGHT); point_at(rk, (-6, 0, 4))
sf = make_light("Ship_Front", 'AREA', (-23, -23, 6.5), 4200, (1.0, 0.84, 0.66),
                size=(12, 6), coll=C_LIGHT); point_at(sf, (-6, 0, 4))
pf = make_light("Port_Fill", 'AREA', (-20, 30, 42), 26000, (1.0, 0.86, 0.70),
                size=(260, 120), coll=C_LIGHT); point_at(pf, (10, 80, 20))
cf = make_light("Port_Cool", 'AREA', (-80, 20, 24), 10000, (0.55, 0.72, 1.0),
                size=(100, 50), coll=C_LIGHT); point_at(cf, (-50, 100, 18))

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

# ================================================================ cameras
def camera(name, loc, target, lens=42, fstop=8.0):
    cd = bpy.data.cameras.new(name); ob = bpy.data.objects.new(name, cd); link(ob, C_CAM)
    ob.location = loc; cd.lens = lens; cd.clip_start = 0.2; cd.clip_end = 6000
    point_at(ob, target)
    return ob
cam_wide = camera("Cam_Wide", (-65, -110, 12), (0, 8, 30), 32)
cam_close = camera("Cam_Close", (-35, -65, 7.5), (0, 5, 6), 45)
cam_aerial = camera("Cam_Aerial", (-650, -1000, 700), (0, 150, 300), 24)
cam_detail = camera("Cam_Detail", (-17, -30, 3.2), (-4, -2, 4.2), 70)
sc.camera = cam_wide

bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print("SAVED", OUT_BLEND)
