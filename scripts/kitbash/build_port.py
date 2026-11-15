"""Port hardware: A-30 ship, landing gear, gantry, light masts, containers, tanks, people."""
import bpy, bmesh, math, os, sys, random
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib_kb3d import *

SHIP_GLB = "/Users/apple/orca/projects/verlins_home/public/models/thunderbolt.glb"

# ---------------------------------------------------------------- beams
def beam(name, p1, p2, w, h, mat, coll, bevel=0.025):
    p1 = Vector(p1); p2 = Vector(p2)
    d = p2 - p1
    ob = box(name, (w, h, d.length), ((p1 + p2) / 2), mat, coll=coll, bevel=bevel)
    ob.rotation_mode = 'QUATERNION'
    ob.rotation_quaternion = d.to_track_quat('Z', 'Y')
    return ob

def hbeam(name, x0, x1, y, z, w, h, mat, coll, bevel=0.02):
    return box(name, (x1 - x0, w, h), ((x0 + x1) / 2, y, z), mat, coll=coll, bevel=bevel)

# ---------------------------------------------------------------- ship
def build_ship(coll, M_METAL, M_ORANGE, M_DARK, M_HAZARD, M_NEON_CYAN, M_NEON_RED, M_NEON_WARM):
    bpy.ops.import_scene.gltf(filepath=SHIP_GLB)
    objs = [o for o in bpy.context.selected_objects if o.type == 'MESH']
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ship = bpy.context.object
    ship.name = "A30_Thunderbolt"
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # origin at bbox bottom centre
    bb = [Vector(c) for c in ship.bound_box]
    mn = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
    mx = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
    ctr = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    ship.data.transform(Matrix.Translation(-ctr))
    ship.location = ctr
    # scale to 25 m length (source length is 30 m along Y)
    s = 25.0 / (mx.y - mn.y)
    ship.scale = (s, s, s)
    ship.rotation_euler = (0, 0, math.radians(72))
    ship.location = (-8.0, 0.0, 1.38)
    for c in list(ship.users_collection): c.objects.unlink(ship)
    coll.objects.link(ship)
    bpy.context.view_layer.update()

    # material polish
    for mat in ship.data.materials:
        if not mat or not mat.use_nodes: continue
        if 'Glass' in mat.name:
            nt = mat.node_tree; nt.nodes.clear()
            out = nt.nodes.new('ShaderNodeOutputMaterial'); out.location = (300, 0)
            b = nt.nodes.new('ShaderNodeBsdfPrincipled'); b.location = (0, 0)
            b.inputs['Base Color'].default_value = (0.012, 0.03, 0.045, 1)
            b.inputs['Metallic'].default_value = 0.55
            b.inputs['Roughness'].default_value = 0.06
            b.inputs['IOR'].default_value = 1.48
            b.inputs['Coat Weight'].default_value = 1.0
            b.inputs['Emission Color'].default_value = (0.10, 0.35, 0.5, 1)
            b.inputs['Emission Strength'].default_value = 0.4
            nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])
        else:
            b = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
            if b:
                b.inputs['Metallic'].default_value = max(0.18, b.inputs['Metallic'].default_value)
                b.inputs['Roughness'].default_value = min(0.52, b.inputs['Roughness'].default_value)
                b.inputs['Coat Weight'].default_value = 0.25
                b.inputs['Coat Roughness'].default_value = 0.22

    # landing gear
    mw = ship.matrix_world
    local = [(0.0, -9.4), (-5.6, 7.2), (5.6, 7.2)]
    for gi, (lx, ly) in enumerate(local):
        p = mw @ Vector((lx, ly, 0.0))
        # vertical shock strut
        cyl(f"Gear_Strut_{gi}", 0.16, 1.18, (p.x, p.y, 0.78), M_DARK, coll=coll, verts=16, bevel=0.02)
        cyl(f"Gear_Piston_{gi}", 0.09, 0.75, (p.x, p.y, 0.6), M_METAL, coll=coll, verts=12)
        # angled brace toward ship centre
        brace_end = mw @ Vector((lx * 0.55, ly - 1.8, 0.0))
        beam(f"Gear_Brace_{gi}", (p.x, p.y, 0.18), (brace_end.x, brace_end.y, 1.3),
             0.11, 0.11, M_METAL, coll)
        # ski pad
        pad = box(f"Gear_Pad_{gi}", (2.5, 1.35, 0.16), (p.x, p.y, 0.09), M_DARK,
                  rot=(0, 0, math.radians(72)), coll=coll, bevel=0.05)
        box(f"Gear_PadStripe_{gi}", (2.2, 0.18, 0.02), (p.x, p.y - 0.42, 0.18), M_ORANGE,
            rot=(0, 0, math.radians(72)), coll=coll, bevel=0.005)
        # hazard chevron on pad front
        box(f"Gear_Hazard_{gi}", (0.5, 1.25, 0.03), (p.x + 0.85, p.y, 0.18), M_HAZARD,
            rot=(0, 0, math.radians(72)), coll=coll, bevel=0.003)
    # nav lights at wingtips
    for side, col, nm in [(-1, M_NEON_RED, "Red"), (1, M_NEON_CYAN, "Green")]:
        p = mw @ Vector((side * 10.7, -0.5, 1.1))
        sphere(f"Nav_{nm}", 0.13, p, col, segs=12, rings=8, coll=coll)
    p = mw @ Vector((0, 12.0, 3.1))
    sphere("Nav_Strobe", 0.12, p, M_NEON_WARM, segs=12, rings=8, coll=coll)
    # subtle pad underglow strips under the hull
    for i, (gx, gy) in enumerate([(-5, -2), (0, 2), (5, -2)]):
        p = mw @ Vector((gx, gy, 0.05))
        box(f"Ship_UnderGlow_{i}", (5.5, 0.18, 0.03), (p.x, p.y, 0.06), M_NEON_CYAN,
            rot=(0, 0, math.radians(72)), coll=coll, bevel=0.01)
    return ship

# ---------------------------------------------------------------- gantry
def build_gantry(coll, M_METAL, M_IRON, M_HAZARD, M_NEON_WARM, M_NEON_RED, M_NEON_CYAN,
                 M_DARK, M_YELLOW, light_coll=None):
    GX = 24.0
    Y0, Y1 = -28.0, 28.0
    H = 24.0
    TS = 3.4
    # concrete plinths
    for cy in (Y0, Y1):
        box(f"Gantry_Plinth_{cy}", (5.6, 5.6, 0.5), (GX, cy, 0.25), M_DARK, coll=coll, bevel=0.06)
    # towers
    for ti, cy in enumerate((Y0, Y1)):
        for sx in (-1, 1):
            for sy in (-1, 1):
                x = GX + sx * TS / 2; y = cy + sy * TS / 2
                beam(f"Gantry_Leg_{ti}_{sx}_{sy}", (x, y, 0.35), (x, y, H), 0.26, 0.26, kb_material('MetalSilver'), coll)
                # hazard sleeve at base
                box(f"Gantry_Hazard_{ti}_{sx}_{sy}", (0.34, 0.34, 1.1), (x, y, 0.85), M_HAZARD,
                    coll=coll, bevel=0.01)
                # beacon
        for lev in range(1, 9):
            z = 0.5 + lev * (H - 0.5) / 8
            # 4 horizontal belts
            for sy in (-1, 1):
                beam(f"Gantry_Belt_{ti}_{lev}_{sy}", (GX - TS/2, cy + sy*TS/2, z), (GX + TS/2, cy + sy*TS/2, z),
                     0.16, 0.16, M_IRON, coll)
            for sx in (-1, 1):
                beam(f"Gantry_BeltX_{ti}_{lev}_{sx}", (GX + sx*TS/2, cy - TS/2, z), (GX + sx*TS/2, cy + TS/2, z),
                     0.16, 0.16, M_IRON, coll)
            # 4 diagonal X braces
            z2 = 0.5 + (lev + 1) * (H - 0.5) / 8
            for sy in (-1, 1):
                beam(f"Gantry_DiagA_{ti}_{lev}_{sy}", (GX - TS/2, cy + sy*TS/2, z), (GX + TS/2, cy + sy*TS/2, z2),
                     0.10, 0.10, M_IRON, coll)
                beam(f"Gantry_DiagB_{ti}_{lev}_{sy}", (GX + TS/2, cy + sy*TS/2, z), (GX - TS/2, cy + sy*TS/2, z2),
                     0.10, 0.10, M_IRON, coll)
            for sx in (-1, 1):
                beam(f"Gantry_DiagC_{ti}_{lev}_{sx}", (GX + sx*TS/2, cy - TS/2, z), (GX + sx*TS/2, cy + TS/2, z2),
                     0.10, 0.10, M_IRON, coll)
                beam(f"Gantry_DiagD_{ti}_{lev}_{sx}", (GX + sx*TS/2, cy + TS/2, z), (GX + sx*TS/2, cy - TS/2, z2),
                     0.10, 0.10, M_IRON, coll)
        # top platform + railing
        box(f"Gantry_Top_{ti}", (5.2, 5.2, 0.18), (GX, cy, H), M_DARK, coll=coll, bevel=0.03)
        for sx in (-1, 1):
            for sy in (-1, 1):
                x = GX + sx * 2.5; y = cy + sy * 2.5
                cyl(f"Gantry_Rail_{ti}_{sx}_{sy}", 0.04, 1.1, (x, y, H + 0.55), M_METAL, coll=coll, verts=8)
        # stair/ladder on outer face
        for sy in (-1, 1):
            x = GX + sy * (TS/2 + 0.12)
            clear = 1.4
            rails = []
            for rz in (-1, 1):
                rails.append(cyl(f"Gantry_LadderRail_{ti}_{sy}_{rz}", 0.035, H - 0.4,
                                 (x + rz*0.25, cy - TS/2 + 0.2, (H+0.3)/2), M_METAL, coll=coll, verts=8))
            for r in range(1, int(H / 0.42)):
                z = r * 0.42
                cyl(f"Gantry_Rung_{ti}_{sy}_{r}", 0.022, 0.5, (x, cy - TS/2 + 0.2, z), M_METAL,
                    rot=(0, math.radians(90), 0), coll=coll, verts=6)
    # bridge truss
    BZ0, BZ1 = H - 2.9, H  # 21.1 to 24
    for sx in (-1, 1):
        x = GX + sx * 2.7
        beam(f"Gantry_ChordBot_{sx}", (x, Y0, BZ0), (x, Y1, BZ0), 0.24, 0.24, kb_material('MetalSilver'), coll)
        beam(f"Gantry_ChordTop_{sx}", (x, Y0, BZ1), (x, Y1, BZ1), 0.2, 0.2, kb_material('MetalSilver'), coll)
    for cy in range(int(Y0), int(Y1) + 1, 4):
        for sx in (-1, 1):
            x = GX + sx * 2.7
            beam(f"Gantry_Vert_{sx}_{cy}", (x, cy, BZ0), (x, cy, BZ1), 0.12, 0.12, M_IRON, coll)
            if cy < Y1:
                beam(f"Gantry_BDiag_{sx}_{cy}", (x, cy, BZ0), (x, cy+4, BZ1), 0.08, 0.08, M_IRON, coll)
        beam(f"Gantry_Cross_{cy}", (GX - 2.7, cy, BZ0), (GX + 2.7, cy, BZ0), 0.12, 0.14, M_IRON, coll)
        beam(f"Gantry_CrossTop_{cy}", (GX - 2.7, cy, BZ1), (GX + 2.7, cy, BZ1), 0.1, 0.12, M_IRON, coll)
    # catwalk deck
    box("Gantry_Deck", (5.5, Y1 - Y0, 0.12), (GX, 0, BZ0 - 0.12), M_DARK, coll=coll, bevel=0.015)
    # deck grating ribs
    for cy in range(int(Y0) + 1, int(Y1), 2):
        box(f"Gantry_DeckRib_{cy}", (5.3, 0.06, 0.03), (GX, cy, BZ0 - 0.04), M_METAL, coll=coll, bevel=0.0)
    # railings
    for sx in (-1, 1):
        x = GX + sx * 2.75
        for cy in range(int(Y0), int(Y1) + 1, 2):
            cyl(f"Gantry_RPost_{sx}_{cy}", 0.035, 1.05, (x, cy, BZ0 + 0.5), M_METAL, coll=coll, verts=6)
        for z in (BZ0 + 0.55, BZ0 + 1.0):
            beam(f"Gantry_Rail_{sx}_{z}", (x, Y0, z), (x, Y1, z), 0.05, 0.05, M_METAL, coll)
    # pipes along bridge
    for i, (px, pz, r) in enumerate([(GX + 2.0, BZ1 + 0.45, 0.11), (GX - 2.1, BZ1 + 0.4, 0.08)]):
        cyl(f"Gantry_Pipe_{i}", r, Y1 - Y0 - 2, (px, 0, pz), M_METAL,
            rot=(math.radians(90), 0, 0), coll=coll, verts=12)
        for cy in range(-24, 25, 8):
            box(f"Gantry_PipeClamp_{i}_{cy}", (0.3, 0.18, 0.38), (px, cy, pz - 0.15), M_IRON, coll=coll, bevel=0.01)
    # underside lights
    for i, cy in enumerate([-20, -8, 4, 16]):
        box(f"Gantry_LightBar_{i}", (4.2, 1.0, 0.14), (GX, cy, BZ0 - 0.28), M_NEON_WARM, coll=coll, bevel=0.02)
        # housing
        box(f"Gantry_LightHouse_{i}", (4.5, 1.25, 0.2), (GX, cy, BZ0 - 0.15), M_DARK, coll=coll, bevel=0.02)
        # actual spotlight
        ld = bpy.data.lights.new(f"Gantry_Spot_{i}", 'SPOT')
        ld.energy = 4200; ld.color = (1.0, 0.82, 0.62); ld.spot_size = math.radians(58); ld.spot_blend = 0.5
        lo = bpy.data.objects.new(f"Gantry_Spot_{i}", ld); lo.location = (GX, cy, BZ0 - 0.4)
        lo.rotation_euler = (0, 0, 0); point_at(lo, (GX, cy, 0))
        link(lo, light_coll or coll)
    # trolley + hook + suspended pod
    trolley_y = 17.0
    box("Trolley_Frame", (6.4, 3.6, 0.5), (GX, trolley_y, BZ0 - 0.45), M_METAL, coll=coll, bevel=0.04)
    box("Trolley_Cabin", (3.2, 2.8, 2.1), (GX, trolley_y, BZ0 + 0.6), M_METAL, coll=coll, bevel=0.04)
    box("Trolley_Window", (2.6, 0.02, 0.9), (GX, trolley_y - 1.42, BZ0 + 0.85), kb_material('Glass'), coll=coll)
    for wx in (-2.4, 2.4):
        for wy in (-1.2, 1.2):
            cyl(f"Trolley_Wheel_{wx}_{wy}", 0.35, 0.3, (GX + wx, trolley_y + wy, BZ0 - 0.5), M_DARK,
                rot=(0, math.radians(90), 0), coll=coll, verts=16)
    # hook cable (no pod, keeps the hangar door readable)
    curve("Trolley_HookCable", [(GX, trolley_y, BZ0 - 0.7), (GX, trolley_y, 12.0)], 0.035, M_DARK, coll=coll)
    box("Trolley_HookBlock", (0.6, 0.5, 0.45), (GX, trolley_y, 11.7), bpy.data.materials.get('SafetyOrange'), coll=coll, bevel=0.04)
    cyl("Trolley_Hook", 0.18, 0.8, (GX, trolley_y, 11.0), M_DARK, coll=coll, verts=8)

    # top beacons
    for ti, cy in enumerate((Y0, Y1)):
        sphere(f"Gantry_Beacon_{ti}", 0.19, (GX, cy, H + 0.3), M_NEON_RED, segs=12, rings=8, coll=coll)
    # sign backing on west face
    box("Gantry_Sign", (0.12, 14, 2.2), (GX - 2.86, 0, BZ1 - 0.8), M_DARK, coll=coll, bevel=0.02)
    text_mesh("Gantry_SignText", "GANTRY 02  //  TLOF-01", 1.15, (GX - 2.96, 0, BZ1 - 0.85),
              M_YELLOW, rot=(math.radians(90), 0, math.radians(-90)), font=None, coll=coll, extrude=0.01)

# ---------------------------------------------------------------- light mast
def build_light_mast(coll, name, loc, target, height=17.0, light_coll=None):
    x, y = loc
    M_METAL = kb_material('Metal'); M_DARK = bpy.data.materials.get('Paint_Dark')
    M_WARM = bpy.data.materials.get('Neon_Warm'); M_RED = bpy.data.materials.get('Neon_Red')
    box(f"{name}_Base", (1.8, 1.8, 0.5), (x, y, 0.25), M_DARK, coll=coll, bevel=0.05)
    cyl(f"{name}_Pole", 0.22, height, (x, y, height / 2 + 0.3), M_METAL, coll=coll, verts=14)
    cyl(f"{name}_PoleTop", 0.12, 1.0, (x, y, height + 0.8), M_METAL, coll=coll, verts=10)
    # crossarm
    box(f"{name}_Arm", (4.4, 0.18, 0.18), (x, y, height + 0.7), M_METAL, coll=coll, bevel=0.02)
    for i, off in enumerate((-1.6, -0.55, 0.55, 1.6)):
        box(f"{name}_LampHouse_{i}", (0.75, 0.42, 0.32), (x + off, y, height + 0.45), M_DARK, coll=coll, bevel=0.03)
        box(f"{name}_Lamp_{i}", (0.6, 0.06, 0.2), (x + off, y - 0.23, height + 0.42), M_WARM, coll=coll, bevel=0.01)
    sphere(f"{name}_Beacon", 0.13, (x, y, height + 1.4), M_RED, segs=10, rings=6, coll=coll)
    ld = bpy.data.lights.new(f"{name}_Spot", 'SPOT')
    ld.energy = 5000; ld.color = (1.0, 0.84, 0.66); ld.spot_size = math.radians(58); ld.spot_blend = 0.6
    lo = bpy.data.objects.new(f"{name}_Spot", ld); lo.location = (x, y, height + 0.5)
    point_at(lo, (target[0], target[1], 0)); link(lo, light_coll or coll)
