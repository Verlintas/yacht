"""Port props: containers, tanks, pipe rack, ground power, stairs, suited crew."""
import bpy, bmesh, math, os, sys, random
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib_kb3d import *

# ---------------------------------------------------------------- containers
def container(coll, name, loc, rot, body_mat, L=12.19, W=2.44, H=2.59, z=0.02, doors=True):
    x, y, zz = loc[0], loc[1], z
    yaw = math.radians(rot)
    b = box(name, (L, W, H), (x, y, zz + H / 2), body_mat, rot=(0, 0, yaw), coll=coll, bevel=0.045)
    # corner castings
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (0, 1):
                px = x + sx * (L / 2 - 0.14); py = y + sy * (W / 2 - 0.1)
                p = Vector((px, py, zz + 0.14 + sz * (H - 0.28)))
                R = Matrix.Rotation(yaw, 3, 'Z')
                d = R @ Vector((px - x, py - y, p.z - (zz + H / 2)))
                box(f"{name}_Cast_{sx}_{sy}_{sz}", (0.28, 0.26, 0.28),
                    (x + d.x, y + d.y, zz + H / 2 + d.z), bpy.data.materials.get('Paint_Dark') or body_mat,
                    rot=(0, 0, yaw), coll=coll, bevel=0.02)
    # corrugated ribs on sides
    nrib = 15
    for i in range(nrib):
        u = -L / 2 + 0.55 + i * (L - 1.1) / (nrib - 1)
        for sy in (-1, 1):
            R = Matrix.Rotation(yaw, 3, 'Z')
            d = R @ Vector((u, sy * (W / 2 + 0.035), 0))
            box(f"{name}_Rib_{i}_{sy}", (0.075, 0.07, H - 0.28),
                (x + d.x, y + d.y, zz + H / 2), body_mat, rot=(0, 0, yaw), coll=coll, bevel=0.008)
    # top and bottom rails
    for sy in (-1, 1):
        R = Matrix.Rotation(yaw, 3, 'Z')
        d = R @ Vector((0, sy * (W / 2 + 0.03), 0))
        box(f"{name}_RailT_{sy}", (L, 0.08, 0.1), (x + d.x, y + d.y, zz + H - 0.08),
            body_mat, rot=(0, 0, yaw), coll=coll, bevel=0.01)
        box(f"{name}_RailB_{sy}", (L, 0.08, 0.1), (x + d.x, y + d.y, zz + 0.08),
            body_mat, rot=(0, 0, yaw), coll=coll, bevel=0.01)
    if doors:
        # door end + lock bars
        R = Matrix.Rotation(yaw, 3, 'Z')
        d = R @ Vector((L / 2 + 0.02, 0, 0))
        box(f"{name}_Door", (0.06, W - 0.12, H - 0.2), (x + d.x, y + d.y, zz + H / 2),
            bpy.data.materials.get('Paint_Dark'), rot=(0, 0, yaw), coll=coll, bevel=0.01)
        for k in (-1, 0, 1):
            dy = k * 0.62
            d2 = R @ Vector((L / 2 + 0.09, dy, 0))
            cyl(f"{name}_Lock_{k}", 0.035, H - 0.6, (x + d2.x, y + d2.y, zz + H / 2),
                bpy.data.materials.get('MetalSilver'), rot=(0, 0, yaw), coll=coll, verts=8)
        # stencil
        d3 = R @ Vector((0, -(W / 2 + 0.09), 0))
        text_mesh(f"{name}_Text", "ANVIL 2045", 0.5, (x + d3.x, y + d3.y, zz + H * 0.66),
                  bpy.data.materials.get('Paint_White'), rot=(math.radians(90), 0, yaw), coll=coll, extrude=0.004)
    return b

def crate(coll, name, loc, size, rot, mat):
    b = box(name, size, (loc[0], loc[1], loc[2] + size[2] / 2), mat, rot=(0, 0, math.radians(rot)),
            coll=coll, bevel=0.03)
    # edge rails
    for sz in (0.04, size[2] - 0.04):
        for sy in (-1, 1):
            R = Matrix.Rotation(math.radians(rot), 3, 'Z')
            d = R @ Vector((0, sy * (size[1] / 2 - 0.02), 0))
            box(f"{name}_Edge_{sy}_{sz}", (size[0] * 0.96, 0.06, 0.06),
                (loc[0] + d.x, loc[1] + d.y, loc[2] + sz), bpy.data.materials.get('SafetyOrange'), rot=(0, 0, math.radians(rot)),
                coll=coll, bevel=0.005)
    return b

# ---------------------------------------------------------------- tanks
def tank_vertical(coll, name, loc, r, h, accent_mat, mat=None):
    x, y = loc
    mat = mat or kb_material('Metal')
    cyl(f"{name}_Body", r, h, (x, y, h / 2 + 0.35), mat, coll=coll, verts=32, bevel=0.05)
    # domed top
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=r, location=(x, y, h + 0.35))
    dome = bpy.context.object; dome.name = f"{name}_Dome"; dome.scale.z = 0.45
    bpy.ops.object.transform_apply(scale=True)
    for p in dome.data.polygons: p.use_smooth = True
    dome.data.materials.append(mat)
    for c in list(dome.users_collection): c.objects.unlink(dome)
    coll.objects.link(dome)
    # bottom skirt
    cyl(f"{name}_Skirt", r * 1.03, 0.5, (x, y, 0.3), mat, coll=coll, verts=32)
    # bands
    for i, z in enumerate([h * 0.25 + 0.35, h * 0.55 + 0.35, h * 0.82 + 0.35]):
        ring(f"{name}_Band_{i}", r + 0.06, 0.08, (x, y, z), accent_mat, coll, scale_z=1.0)
    # ladder
    for sx in (-1, 1):
        cyl(f"{name}_LadderRail_{sx}", 0.035, h * 0.8, (x + r + 0.12, y + sx * 0.22, h * 0.45),
            bpy.data.materials.get('MetalSilver'), coll=coll, verts=6)
    for i in range(8, int(h / 0.4)):
        cyl(f"{name}_Rung_{i}", 0.022, 0.44, (x + r + 0.12, y, 0.35 + i * 0.4),
            bpy.data.materials.get('MetalSilver'), rot=(math.radians(90), 0, 0), coll=coll, verts=6)
    # pipe elbow + valve on top
    cyl(f"{name}_TopPipe", 0.18, 2.4, (x - r * 0.3, y, h + 0.9), mat, coll=coll, verts=12)
    cyl(f"{name}_TopPipeH", 0.18, 3.4, (x - r * 0.3, y + 1.0, h + 2.1), mat,
        rot=(math.radians(90), 0, 0), coll=coll, verts=12)
    cyl(f"{name}_Valve", 0.32, 0.32, (x - r * 0.3, y + 2.7, h + 2.1), bpy.data.materials.get('SafetyOrange'),
        rot=(math.radians(90), 0, 0), coll=coll, verts=8)
    # hazard base band
    box(f"{name}_Hazard", (0.5, 1.1, 0.4), (x + r + 0.05, y, 0.55), bpy.data.materials.get('Hazard_Stripes'),
        rot=(0, 0, 0), coll=coll, bevel=0.005)

def tank_horizontal(coll, name, loc, r, length, accent_mat):
    x, y = loc
    mat = kb_material('Metal')
    cyl(f"{name}_Body", r, length, (x, y, r + 1.0), mat, rot=(0, math.radians(90), 0), coll=coll, verts=32)
    for sx in (-1, 1):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=r,
                                              location=(x + sx * length / 2, y, r + 1.0))
        d = bpy.context.object; d.name = f"{name}_Cap_{sx}"; d.scale.x = 0.42
        bpy.ops.object.transform_apply(scale=True)
        for p in d.data.polygons: p.use_smooth = True
        d.data.materials.append(mat)
        for c in list(d.users_collection): c.objects.unlink(d)
        coll.objects.link(d)
    for i, dx in enumerate([-length * 0.3, 0, length * 0.3]):
        cyl(f"{name}_Band_{i}", r + 0.055, 0.13, (x + dx, y, r + 1.0), accent_mat,
            rot=(0, math.radians(90), 0), coll=coll, verts=32)
    # saddles
    for dx in (-length * 0.32, length * 0.32):
        box(f"{name}_Saddle_{dx}", (1.0, 2.8, 0.9), (x + dx, y, 0.45), bpy.data.materials.get('Paint_Dark'), coll=coll, bevel=0.05)
    # pipes
    cyl(f"{name}_Pipe", 0.14, length * 0.7, (x, y, r + 1.0), mat, rot=(0, math.radians(90), 0), coll=coll, verts=10)

# ---------------------------------------------------------------- pipe rack
def pipe_rack(coll, y, x0, x1, z0=3.5):
    mat = kb_material('Metal'); acc = kb_material('PanelsLightBlue')
    for i, (dz, r) in enumerate([(0, 0.22), (0.75, 0.16), (1.35, 0.12)]):
        cyl(f"PipeRack_{y}_{i}", r, x1 - x0, ((x0 + x1) / 2, y, z0 + dz), mat,
            rot=(0, math.radians(90), 0), coll=coll, verts=16)
    for i, x in enumerate(range(int(x0), int(x1) + 1, 9)):
        box(f"PipeRack_Post_{y}_{i}", (0.25, 0.25, z0 + 1.5), (x, y, (z0 + 1.5) / 2), bpy.data.materials.get('KB3D_Iron'), coll=coll, bevel=0.02)
        box(f"PipeRack_Beam_{y}_{i}", (0.3, 3.0, 0.22), (x, y, z0 - 0.2), bpy.data.materials.get('KB3D_Iron'), coll=coll, bevel=0.02)
        cyl(f"PipeRack_Flange_{y}_{i}", 0.34, 0.12, (x, y, z0), mat,
            rot=(0, math.radians(90), 0), coll=coll, verts=16)
    # cyan trace line
    box(f"PipeRack_Trace_{y}", (x1 - x0, 0.05, 0.05), ((x0 + x1) / 2, y + 0.28, z0 + 0.32), bpy.data.materials.get('Neon_Cyan'), coll=coll)

# ---------------------------------------------------------------- GPU / stairs
def ground_power(coll, name, loc, rot, ship_mw=None):
    x, y = loc; yaw = math.radians(rot)
    R = Matrix.Rotation(yaw, 3, 'Z')
    def W(dx, dy, dz):
        d = R @ Vector((dx, dy, dz)); return (x + d.x, y + d.y, dz * 0 + d.z)
    body = box(f"{name}_Body", (3.0, 1.8, 1.35), (x, y, 0.85), bpy.data.materials.get('KB3D_PanelsLightBlue'), rot=(0, 0, yaw), coll=coll, bevel=0.06)
    box(f"{name}_Stripe", (3.05, 0.22, 0.25), (x, y - 0.55, 1.0), bpy.data.materials.get('SafetyOrange'), rot=(0, 0, yaw), coll=coll, bevel=0.01)
    box(f"{name}_Vent", (1.0, 0.05, 0.6), W(-0.6, -0.93, 0.9), bpy.data.materials.get('Paint_Dark'), rot=(0, 0, yaw), coll=coll, bevel=0.01)
    box(f"{name}_Screen", (0.7, 0.04, 0.35), W(0.9, -0.93, 1.1), bpy.data.materials.get('Neon_Cyan'), rot=(0, 0, yaw), coll=coll, bevel=0.01)
    for sx in (-1, 1):
        for sy in (-1, 1):
            cyl(f"{name}_Wheel_{sx}_{sy}", 0.28, 0.2, W(sx * 1.1, sy * 0.75, 0.3), bpy.data.materials.get('Rubber'),
                rot=(math.radians(90), 0, 0), coll=coll, verts=16)
    # cable reel
    cyl(f"{name}_Reel", 0.55, 0.5, W(-1.65, 0, 0.9), bpy.data.materials.get('Paint_Dark'), rot=(0, math.radians(90), 0), coll=coll, verts=18)
    cyl(f"{name}_ReelHub", 0.22, 0.6, W(-1.65, 0, 0.9), bpy.data.materials.get('SafetyOrange'), rot=(0, math.radians(90), 0), coll=coll, verts=12)
    # cable to ship belly
    if ship_mw:
        p = ship_mw @ Vector((-3.5, -7.0, 0.1))
        pts = [W(-1.65, 0, 0.6), (x - 1.0, y - 2.0, 0.25),
               ((x + p.x) / 2, (y + p.y) / 2 - 1.5, 0.15), (p.x, p.y, 0.2)]
        curve(f"{name}_Cable", pts, 0.06, bpy.data.materials.get('Rubber'), coll=coll, res=3)
    return body

def boarding_stairs(coll, name, base, rot, ship_mw=None, top=2.1, steps=9):
    x, y = base; yaw = math.radians(rot); R = Matrix.Rotation(yaw, 3, 'Z')
    def W(dx, dy, dz):
        d = R @ Vector((dx, dy, dz)); return (x + d.x, y + d.y, d.z)
    run = 0.32
    for i in range(steps):
        z = 0.12 + i * (top - 0.12) / steps
        d = R @ Vector((0, -i * run, 0))
        box(f"{name}_Step_{i}", (1.5, run + 0.04, 0.08), (x + d.x, y + d.y, z),
            bpy.data.materials.get('MetalSilver'), rot=(0, 0, yaw), coll=coll, bevel=0.008)
    # rails
    for sx in (-1, 1):
        for i in range(steps):
            z = 0.12 + i * (top - 0.12) / steps + 0.5
            d = R @ Vector((sx * 0.78, -i * run, 0))
            cyl(f"{name}_RailPost_{sx}_{i}", 0.025, 1.0, (x + d.x, y + d.y, z), bpy.data.materials.get('MetalSilver'), coll=coll, verts=6)
        d0 = R @ Vector((sx * 0.78, 0, 0)); d1 = R @ Vector((sx * 0.78, -(steps - 1) * run, 0))
        curve(f"{name}_Rail_{sx}", [(x + d0.x, y + d0.y, 0.6), (x + d1.x, y + d1.y, top + 0.6)],
              0.04, bpy.data.materials.get('MetalSilver'), coll=coll)
    # top platform
    d = R @ Vector((0, -(steps) * run - 0.5, 0))
    box(f"{name}_Platform", (1.8, 1.6, 0.12), (x + d.x, y + d.y, top + 0.06), bpy.data.materials.get('MetalSilver'),
        rot=(0, 0, yaw), coll=coll, bevel=0.02)
    box(f"{name}_Hazard", (1.5, 0.18, 0.04), (x, y - 0.1, 0.13), bpy.data.materials.get('Hazard_Stripes'), rot=(0, 0, yaw), coll=coll, bevel=0.005)

# ---------------------------------------------------------------- crew
def build_person(coll, name, loc, rot, pose='stand'):
    """1.86 m suited ground-crew figure, built at origin then joined."""
    parts = []
    def add(o):
        parts.append(o); return o
    suit = bpy.data.materials.get('Suit_Fabric')
    dark = bpy.data.materials.get('Suit_Dark')
    orange = bpy.data.materials.get('SafetyOrange')
    visor = bpy.data.materials.get('Suit_Visor')
    metal = kb_material('Metal')
    cyan = bpy.data.materials.get('Neon_Cyan')
    # legs
    for sx in (-1, 1):
        add(box(f"{name}_Boot_{sx}", (0.16, 0.30, 0.14), (sx * 0.12, -0.04, 0.08), dark, bevel=0.02, coll=coll))
        add(cyl(f"{name}_Shin_{sx}", 0.072, 0.42, (sx * 0.12, 0.0, 0.36), suit, coll=coll, verts=14, bevel=0.01))
        add(box(f"{name}_Knee_{sx}", (0.17, 0.12, 0.14), (sx * 0.12, -0.055, 0.56), dark, bevel=0.03, coll=coll))
        add(cyl(f"{name}_Thigh_{sx}", 0.088, 0.4, (sx * 0.12, 0.0, 0.82), suit, coll=coll, verts=14, bevel=0.01))
        # orange leg band
        add(cyl(f"{name}_LegBand_{sx}", 0.095, 0.07, (sx * 0.12, 0.0, 0.68), orange, coll=coll, verts=14))
    add(box(f"{name}_Hips", (0.36, 0.24, 0.2), (0, 0, 1.03), dark, bevel=0.04, coll=coll))
    # torso
    add(box(f"{name}_Torso", (0.42, 0.27, 0.5), (0, 0, 1.33), suit, bevel=0.08, coll=coll))
    add(box(f"{name}_ChestPlate", (0.33, 0.07, 0.28), (0, -0.155, 1.4), suit, bevel=0.03, coll=coll))
    add(box(f"{name}_ChestLight", (0.10, 0.03, 0.05), (0.09, -0.20, 1.42), cyan, bevel=0.01, coll=coll))
    add(box(f"{name}_Belt", (0.43, 0.29, 0.09), (0, 0, 1.10), dark, bevel=0.02, coll=coll))
    for sx in (-1, 1):
        add(box(f"{name}_Pouch_{sx}", (0.12, 0.09, 0.15), (sx * 0.15, -0.17, 1.06), dark, bevel=0.02, coll=coll))
    # shoulders / arms
    for sx in (-1, 1):
        add(sphere(f"{name}_Shoulder_{sx}", 0.13, (sx * 0.255, 0, 1.51), suit, segs=16, rings=10, coll=coll))
        ang = 8 if pose == 'stand' else (28 if sx < 0 else -8)
        a = math.radians(ang)
        add(cyl(f"{name}_UpperArm_{sx}", 0.063, 0.34, (sx * 0.28, 0, 1.30), suit,
                rot=(0, math.radians(sx * -6), 0), coll=coll, verts=12))
        add(cyl(f"{name}_Forearm_{sx}", 0.057, 0.32, (sx * 0.30, -0.03, 1.05), suit, coll=coll, verts=12))
        add(box(f"{name}_Glove_{sx}", (0.11, 0.16, 0.11), (sx * 0.30, -0.05, 0.87), dark, bevel=0.03, coll=coll))
        add(cyl(f"{name}_ArmBand_{sx}", 0.07, 0.07, (sx * 0.285, 0, 1.39), orange, coll=coll, verts=12))
    # neck + helmet
    add(cyl(f"{name}_Neck", 0.07, 0.09, (0, 0, 1.60), dark, coll=coll, verts=12))
    add(sphere(f"{name}_Helmet", 0.145, (0, 0, 1.73), suit, segs=24, rings=16, coll=coll))
    add(box(f"{name}_Visor", (0.21, 0.06, 0.115), (0, -0.13, 1.73), visor, bevel=0.03, coll=coll))
    add(box(f"{name}_Brow", (0.23, 0.07, 0.04), (0, -0.12, 1.82), orange, bevel=0.01, coll=coll))
    add(cyl(f"{name}_Antenna", 0.012, 0.26, (0.10, 0.04, 1.92), metal, coll=coll, verts=6))
    # backpack
    add(box(f"{name}_Pack", (0.34, 0.19, 0.4), (0, 0.2, 1.38), dark, bevel=0.05, coll=coll))
    for sx in (-1, 1):
        add(cyl(f"{name}_O2_{sx}", 0.06, 0.34, (sx * 0.09, 0.31, 1.4), metal, coll=coll, verts=12))
    add(box(f"{name}_Clipboard", (0.25, 0.02, 0.34), (0.05, -0.25, 1.2), dark, bevel=0.005, coll=coll))
    # join
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    p = bpy.context.object; p.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # origin at feet centre
    bb = [Vector(c) for c in p.bound_box]
    mn = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
    mx = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
    ctr = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    p.data.transform(Matrix.Translation(-ctr))
    p.location = Vector(loc) + ctr
    p.rotation_euler = (0, 0, math.radians(rot))
    for c in list(p.users_collection): c.objects.unlink(p)
    coll.objects.link(p)
    return p

# ---------------------------------------------------------------- pad edge lights
def pad_edge_lights(coll, size=30.0, step=5.0):
    M_CYAN = bpy.data.materials.get('Edge_Glow') or bpy.data.materials.get('Neon_Cyan')
    M_WARM = bpy.data.materials.get('Edge_Glow_Warm') or bpy.data.materials.get('Neon_Warm')
    i = 0
    for t in range(-int(size), int(size) + 1, int(step)):
        for (x, y, sx, sy) in [(t, -size, 1, 0), (t, size, 1, 0), (-size, t, 0, 1), (size, t, 0, 1)]:
            if abs(t) == int(size):
                continue
            box(f"PadLight_{i}_h", (0.34 if sx else 0.5, 0.5 if sx else 0.34, 0.16),
                (x, y, 0.10), bpy.data.materials.get('Paint_Dark'), coll=coll, bevel=0.02)
            box(f"PadLight_{i}_e", (0.22 if sx else 0.38, 0.38 if sx else 0.22, 0.035),
                (x, y, 0.195), M_CYAN if i % 4 else M_WARM, coll=coll, bevel=0.008)
            i += 1


# ---------------------------------------------------------------- small port props
def barrel(coll, name, loc, mat=None, r=0.32, h=0.98, rot=0):
    mat = mat or bpy.data.materials.get('KB3D_PanelsLightBlue')
    x, y = loc
    cyl(f"{name}_Body", r, h, (x, y, h / 2 + 0.02), mat, coll=coll, verts=20, bevel=0.02)
    for z in (0.18, h - 0.15):
        ring(f"{name}_Ring_{z}", r + 0.015, 0.035, (x, y, z), bpy.data.materials.get('KB3D_Iron'), coll)
    cyl(f"{name}_Cap", r * 0.75, 0.05, (x, y, h + 0.04), bpy.data.materials.get('KB3D_Iron'), coll=coll, verts=16)
    box(f"{name}_Label", (0.34, 0.02, 0.24), (x, y - r - 0.01, h * 0.55), bpy.data.materials.get('Paint_White'), coll=coll, bevel=0.004)

def windsock(coll, name, loc, height=7.0, rot=0):
    x, y = loc
    metal = bpy.data.materials.get('KB3D_Metal')
    orange = bpy.data.materials.get('SafetyOrange')
    white = bpy.data.materials.get('Paint_White')
    box(f"{name}_Base", (1.2, 1.2, 0.25), (x, y, 0.12), bpy.data.materials.get('Paint_Dark'), coll=coll, bevel=0.03)
    cyl(f"{name}_Pole", 0.10, height, (x, y, height / 2 + 0.2), metal, coll=coll, verts=10)
    cyl(f"{name}_PoleTop", 0.05, 0.8, (x, y, height + 0.55), metal, coll=coll, verts=8)
    yaw = math.radians(rot)
    # three tapered segments, wide mouth at the pole
    segs = [(0.55, 0.36, 0.30, orange), (1.55, 0.29, 0.22, white), (2.55, 0.21, 0.12, orange)]
    for i, (d, r1, r2, mat) in enumerate(segs):
        px = x + d * math.cos(yaw); py = y + d * math.sin(yaw)
        cone(f"{name}_Sock_{i}", r1, r2, 1.0, (px, py, height + 0.05), mat,
             rot=(0, math.radians(90), yaw), verts=16, coll=coll)
        ring(f"{name}_SockRing_{i}", r1 + 0.01, 0.02, (px - 0.5 * math.cos(yaw), py - 0.5 * math.sin(yaw), height + 0.05),
             metal, coll)
    sphere(f"{name}_Beacon", 0.10, (x, y, height + 1.0), bpy.data.materials.get('Neon_Red'), segs=10, rings=6, coll=coll)

def tug(coll, name, loc, rot=0):
    x, y = loc; yaw = math.radians(rot)
    body = bpy.data.materials.get('KB3D_PanelsLightBlue')
    white = bpy.data.materials.get('KB3D_PanelsWhite')
    orange = bpy.data.materials.get('SafetyOrange')
    dark = bpy.data.materials.get('Paint_Dark')
    glass = kb_material('Glass')
    turn = lambda dx, dy: (x + dx * math.cos(yaw) - dy * math.sin(yaw),
                           y + dx * math.sin(yaw) + dy * math.cos(yaw))
    box(f"{name}_Chassis", (4.4, 2.0, 0.55), (x, y, 0.55), dark, rot=(0, 0, yaw), coll=coll, bevel=0.05)
    box(f"{name}_Bed", (2.4, 1.9, 0.25), (x, y, 0.92), body, rot=(0, 0, yaw), coll=coll, bevel=0.03)
    cx, cy = turn(1.3, 0)
    box(f"{name}_Cab", (1.55, 1.75, 1.5), (cx, cy, 1.75), white, rot=(0, 0, yaw), coll=coll, bevel=0.06)
    wx, wy = turn(2.09, 0)
    box(f"{name}_Windshield", (0.04, 1.45, 0.72), (wx, wy, 2.05), glass, rot=(0, 0, yaw), coll=coll, bevel=0.02)
    for sx in (-1, 1):
        for sy in (-1, 1):
            wx, wy = turn(1.35 * sx, 0.95 * sy)
            cyl(f"{name}_Wheel_{sx}_{sy}", 0.38, 0.3, (wx, wy, 0.4), bpy.data.materials.get('Rubber'),
                rot=(math.radians(90), 0, yaw), coll=coll, verts=16)
    box(f"{name}_Stripe", (4.5, 0.16, 0.2), (x, y - 0.98, 0.8), orange, rot=(0, 0, yaw), coll=coll, bevel=0.01)
    box(f"{name}_Bumper", (0.25, 2.0, 0.3), (x - 2.3, y, 0.55), orange, rot=(0, 0, yaw), coll=coll, bevel=0.03)
    bx, by = turn(-1.1, 0)
    box(f"{name}_Beacon", (0.18, 0.18, 0.12), (bx, by, 1.4), bpy.data.materials.get('Neon_Warm'), rot=(0, 0, yaw), coll=coll, bevel=0.01)
    cyl(f"{name}_Exhaust", 0.08, 0.6, (x - 1.8, y - 0.6, 1.2), dark, coll=coll, verts=8)
    # cargo on the bed
    crate(coll, f"{name}_Crate", (x - 0.3, y, 1.08), (1.7, 1.5, 1.0), rot, orange)
