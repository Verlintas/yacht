"""Architecture, city edge, road and rock outcrops for Anvil Landing."""
import bpy, math, os, sys, random
from mathutils import Vector, Matrix, noise
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib_kb3d import *
from build_port import beam

def control_cab(coll, bbox, glass, metal, dark, warm, light_coll, name="ControlCab", scale=2.2):
    mn, mx = bbox
    S = scale
    cx = (mn.x + mx.x) / 2 - 2.0 * S
    cy = (mn.y + mx.y) / 2
    z0 = mx.z - 0.25
    cyl(f"{name}_Base", 2.45*S, 1.4*S, (cx, cy, z0 + 0.7*S), dark, coll=coll, verts=24, bevel=0.04*S)
    cab = bpy.data.materials.get("Cab_Glass")
    if cab is None:
        cab = glass.copy(); cab.name = "Cab_Glass"
        b = next((n for n in cab.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if b:
            b.inputs['Base Color'].default_value = (0.012, 0.025, 0.04, 1)
            b.inputs['Metallic'].default_value = 0.3
            b.inputs['Roughness'].default_value = 0.16
            b.inputs['Transmission Weight'].default_value = 0.38
    cyl(f"{name}_Glass", 2.15*S, 2.0*S, (cx, cy, z0 + 2.45*S), cab, coll=coll, verts=24)
    cyl(f"{name}_Roof", 2.55*S, 0.3*S, (cx, cy, z0 + 3.55*S), metal, coll=coll, verts=24, bevel=0.04*S)
    cyl(f"{name}_Inner", 1.55*S, 1.35*S, (cx, cy, z0 + 2.35*S), warm, coll=coll, verts=20)
    for i in range(12):
        a = i * math.tau / 12
        box(f"{name}_Mullion_{i}", (0.08*S, 0.08*S, 2.05*S),
            (cx + math.cos(a) * 2.17*S, cy + math.sin(a) * 2.17*S, z0 + 2.45*S),
            dark, rot=(0, 0, a), coll=coll, bevel=0.01*S)
    cyl(f"{name}_Strip", 2.18*S, 0.08*S, (cx, cy, z0 + 1.55*S),
        bpy.data.materials.get('Edge_Glow_Warm'), coll=coll, verts=24)
    cyl(f"{name}_Mast", 0.08*S, 6.5*S, (cx, cy, z0 + 6.8*S), metal, coll=coll, verts=8)
    sphere(f"{name}_Beacon", 0.16*S, (cx, cy, z0 + 10.1*S),
           bpy.data.materials.get('Neon_Red'), segs=12, rings=8, coll=coll)
    ld = bpy.data.lights.new(f"{name}_Light", 'POINT')
    ld.energy = 260 * S * S; ld.color = (1.0, 0.72, 0.40); ld.shadow_soft_size = 1.2*S
    lo = bpy.data.objects.new(f"{name}_Light", ld); lo.location = (cx, cy, z0 + 2.5*S)
    link(lo, light_coll)
    return (cx, cy, z0)

def skybridge(coll, h_bbox, i_bbox, glass, metal, dark, warm, light_coll, name="Skybridge"):
    hmn, hmx = h_bbox; imn, imx = i_bbox
    x0, x1 = hmx.x - 0.3, imn.x + 0.3
    cy = 62.0
    z0 = 20.0; h = 5.0; w = 7.0
    length = x1 - x0; cx = (x0 + x1) / 2
    box(f"{name}_Floor", (length, w, 0.45), (cx, cy, z0), dark, coll=coll, bevel=0.03)
    box(f"{name}_Roof", (length + 0.6, w + 0.6, 0.4), (cx, cy, z0 + h), dark, coll=coll, bevel=0.03)
    for sy in (-1, 1):
        box(f"{name}_Glass_{sy}", (length, 0.08, h - 0.6), (cx, cy + sy * w / 2, z0 + h / 2),
            glass, coll=coll, bevel=0.01)
        for i in range(int(length / 2.5) + 1):
            x = x0 + i * 2.5
            box(f"{name}_Mullion_{sy}_{i}", (0.14, 0.16, h - 0.5), (x, cy + sy * w / 2, z0 + h / 2),
                metal, coll=coll, bevel=0.01)
    box(f"{name}_InnerGlow", (length - 1.0, 0.10, 0.14), (cx, cy, z0 + h - 0.45), warm, coll=coll, uv=False)
    for i in range(int(length / 3.0)):
        x = x0 + 1.2 + i * 3.0
        beam(f"{name}_TrussA_{i}", (x, cy - w / 2 + 0.3, z0 - 0.8), (x + 2.8, cy + w / 2 - 0.3, z0 - 0.2),
             0.12, 0.12, metal, coll)
    beam(f"{name}_BottomChordA", (x0, cy - w / 2 + 0.3, z0 - 0.8), (x1, cy - w / 2 + 0.3, z0 - 0.8), 0.16, 0.16, metal, coll)
    beam(f"{name}_BottomChordB", (x0, cy + w / 2 - 0.3, z0 - 0.8), (x1, cy + w / 2 - 0.3, z0 - 0.8), 0.16, 0.16, metal, coll)
    for x in (x0, x1):
        box(f"{name}_Portal_{x}", (0.45, w + 0.6, h + 0.6), (x, cy, z0 + h / 2), metal, coll=coll, bevel=0.03)
    for x in (x0 + 4, cx, x1 - 4):
        ld = bpy.data.lights.new(f"{name}_Light_{x}", 'POINT')
        ld.energy = 500; ld.color = (1.0, 0.72, 0.42); ld.shadow_soft_size = 1.8
        lo = bpy.data.objects.new(f"{name}_Light_{x}", ld); lo.location = (x, cy, z0 + h - 0.5)
        link(lo, light_coll)
    return (x0, x1, cy, z0)

def hangar_door(coll, i_bbox, metal, dark, edge, warm, light_coll, name="HangarDoor"):
    mn, mx = i_bbox
    cx = (mn.x + mx.x) / 2 + 4.0
    fy = mn.y - 0.15
    W = 26.0; H = 15.0
    box(f"{name}_Recess", (W, 0.5, H), (cx, fy + 0.08, H / 2 + 0.02), dark, coll=coll, bevel=0.03)
    n = 8; leaf_w = 2.95; spacing = 3.15
    for i in range(n):
        x = cx - (n - 1) * spacing / 2 + i * spacing
        box(f"{name}_Leaf_{i}", (leaf_w, 0.16, H - 0.5), (x, fy - 0.12, H / 2 + 0.05), metal, coll=coll, bevel=0.025)
        box(f"{name}_Rib_{i}", (leaf_w*0.85, 0.1, 0.16), (x, fy - 0.24, H * 0.56), dark, coll=coll, bevel=0.005)
    # horizontal seams, leaf gaps and vehicle-scale stencils
    for k in range(6):
        z = 2.3 + k * 2.35
        box(f"{name}_Seam_{k}", (W - 1.2, 0.16, 0.18), (cx, fy - 0.30, z), dark, coll=coll, bevel=0.01)
    for i in range(1, 8):
        x = cx - W/2 + i * (W/8.0)
        box(f"{name}_Gap_{i}", (0.16, 0.16, H - 1.0), (x, fy - 0.30, H/2), dark, coll=coll, bevel=0.01)
    box(f"{name}_StencilBack", (5.6, 0.18, 5.6), (cx, fy - 0.38, H * 0.56), dark, coll=coll, bevel=0.02)
    text_mesh(f"{name}_Number", "03", 4.2, (cx, fy - 0.52, H * 0.56),
              bpy.data.materials.get('Sign_Glow_Warm'), rot=(math.radians(90), 0, 0),
              font=bpy.data.fonts.get("Avenir Next Condensed Bold"), coll=coll, extrude=0.02)
    box(f"{name}_HazardBase", (W - 1.8, 0.3, 0.8), (cx, fy - 0.36, 1.15),
        bpy.data.materials.get('Hazard_Stripes'), coll=coll, bevel=0.01)
    bx = cx - 8.0
    box(f"{name}_Personnel", (2.4, 0.3, 3.2), (bx, fy - 0.34, 1.65), dark, coll=coll, bevel=0.03)
    box(f"{name}_PersonnelGlow", (2.0, 0.06, 0.2), (bx, fy - 0.52, 3.0),
        bpy.data.materials.get('Edge_Glow_Warm'), coll=coll, uv=False)
    for sx in (-1, 1):
        box(f"{name}_FrameV_{sx}", (0.6, 0.5, H + 0.8), (cx + sx * (W / 2 + 0.3), fy, H / 2), metal, coll=coll, bevel=0.04)
        box(f"{name}_NeonV_{sx}", (0.12, 0.08, H - 0.4), (cx + sx * (W / 2 - 0.1), fy - 0.3, H / 2), edge, coll=coll, uv=False)
    box(f"{name}_FrameH", (W + 1.4, 0.5, 0.7), (cx, fy, H + 0.3), metal, coll=coll, bevel=0.04)
    box(f"{name}_NeonH", (W, 0.08, 0.16), (cx, fy - 0.3, H - 0.25), edge, coll=coll, uv=False)
    box(f"{name}_InnerGlow", (W - 2.4, 0.12, 0.3), (cx, fy - 0.28, H - 0.9), warm, coll=coll, uv=False)
    for sx in (-1, 1):
        box(f"{name}_Hazard_{sx}", (1.0, 0.4, 1.4), (cx + sx * (W / 2 + 1.0), fy, 0.7),
            bpy.data.materials.get('Hazard_Stripes'), coll=coll, bevel=0.01)
    text_mesh(f"{name}_Sign", "HANGAR 03", 2.0, (cx, fy - 0.35, H + 2.6),
              bpy.data.materials.get('Sign_Glow_Warm'), rot=(math.radians(90), 0, 0),
              font=bpy.data.fonts.get("Avenir Next Condensed Bold"), coll=coll, extrude=0.02)
    ld = bpy.data.lights.new(f"{name}_Light", 'AREA')
    ld.energy = 9000; ld.color = (1.0, 0.72, 0.42); ld.size = 20; ld.size_y = 8
    lo = bpy.data.objects.new(f"{name}_Light", ld); lo.location = (cx, fy - 4.0, 7.0)
    lo.rotation_euler = (math.radians(90), 0, 0); link(lo, light_coll)
    return (cx, fy, W, H)

def lit_windows(coll, bbox, seed, name, warm, cyan, dark, size_scale=2.0):
    mn, mx = bbox
    w = mx.x - mn.x; h = mx.z - mn.z
    rng = random.Random(seed)
    n = 20
    for i in range(n):
        x = mn.x + rng.uniform(0.14, 0.86) * w
        z = mn.z + rng.uniform(0.22, 0.62) * h
        sw = rng.uniform(0.7, 1.5)*size_scale; sh = rng.uniform(0.4, 0.65)*size_scale
        mat = warm if rng.random() < 0.58 else (cyan if rng.random() < 0.55 else dark)
        box(f"{name}_WinFrame_{i}", (sw + 0.14, 0.09, sh + 0.12), (x, mn.y - 0.14, z), dark, coll=coll, bevel=0.01)
        box(f"{name}_Win_{i}", (sw, 0.035, sh), (x, mn.y - 0.21, z), mat, coll=coll, uv=False)

def road(coll, y=84.0, x0=-240, x1=240):
    asphalt = bpy.data.materials.new("Asphalt"); asphalt.use_nodes = True
    b = asphalt.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (0.035, 0.036, 0.038, 1)
    b.inputs['Roughness'].default_value = 0.85
    box("CityRoad", (x1 - x0, 15, 0.12), ((x0 + x1) / 2, y, -0.28), asphalt, coll=coll, uv=False)
    yellow = bpy.data.materials.get('Paint_Yellow')
    white = bpy.data.materials.get('Paint_White')
    for i, x in enumerate(range(x0 + 4, x1, 12)):
        box(f"RoadDash_{i}", (6, 0.35, 0.02), (x, y, -0.21), yellow, coll=coll, uv=False)
    for sy in (-1, 1):
        box(f"RoadEdge_{sy}", (x1 - x0, 0.18, 0.02), ((x0 + x1) / 2, y + sy * 7.1, -0.21), white, coll=coll, uv=False)
    # road light poles
    metal = kb_material('Metal'); warm = bpy.data.materials.get('Neon_Warm')
    for i, x in enumerate(range(x0 + 20, x1, 40)):
        cyl(f"RoadPole_{i}", 0.1, 9, (x, y + 8.2, 4.2), metal, coll=coll, verts=8)
        box(f"RoadLampArm_{i}", (0.12, 1.6, 0.12), (x, y + 7.4, 8.7), metal, coll=coll, bevel=0.01)
        box(f"RoadLamp_{i}", (0.5, 0.8, 0.15), (x, y + 6.7, 8.55), warm, coll=coll, bevel=0.01)
    # fence along port edge (skip gate at -45..-30)
    fence_y = y - 8.2
    for i, x in enumerate(range(x0 + 10, x1, 8)):
        if -48 < x < -26:
            continue
        box(f"FencePost_{i}", (0.12, 0.12, 2.6), (x, fence_y, 1.3), metal, coll=coll, bevel=0.01)
    for z in (0.9, 1.9, 2.5):
        box(f"FenceRail_{z}", (x1 - x0 - 20, 0.05, 0.05), ((x0 + x1) / 2, fence_y, z), metal, coll=coll, uv=False)
    return asphalt

def city_edge(coll, mods, mat_metal, mat_edge, mat_warm, mat_red, scale=1.0):
    blocks = [(-155, 138, 1.55, -8, 'BldgLG_C'),
              (-100, 145, 1.75, 6, 'BldgLG_B'),
              (-42, 140, 1.55, -4, 'BldgLG_D'),
              (22, 146, 1.65, 10, 'BldgLG_C'),
              (86, 140, 1.6, -6, 'BldgLG_B'),
              (148, 146, 1.7, 8, 'BldgLG_D')]
    for i, (x, y, s, rz, key) in enumerate(blocks):
        if key not in mods: continue
        ob = mods[key]
        dup = ob.copy(); dup.data = ob.data
        dup.name = f"EDGE_{i}_{key}"; dup.hide_render = False
        link(dup, coll); place(dup, (x, y, -0.38), rz, s*scale, coll)
        bpy.context.view_layer.update()
        mn, mx = bbox(dup)
        box(f"EDGE_Sign_{i}", ((mx.x - mn.x) * 0.55, 0.3, 1.8*scale*0.8), ((mn.x + mx.x) / 2, mn.y - 0.2, mn.z + (mx.z - mn.z) * 0.7),
            bpy.data.materials.get('Paint_Dark'), coll=coll, bevel=0.02)
        box(f"EDGE_Glow_{i}", ((mx.x - mn.x) * 0.5, 0.07, 0.18), ((mn.x + mx.x) / 2, mn.y - 0.35, mn.z + (mx.z - mn.z) * 0.7),
            mat_edge, coll=coll, uv=False)
        if i % 2 == 0:
            cyl(f"EDGE_Silo_{i}", 2.2*scale*0.8, 9.5*scale*0.8, (x - 12, y - 4, 4.75*scale*0.8), mat_metal, coll=coll, verts=20, bevel=0.04)
            sphere(f"EDGE_SiloCap_{i}", 2.2*scale*0.8, (x - 12, y - 4, 9.5*scale*0.8), mat_metal, segs=20, rings=10, coll=coll)
            sphere(f"EDGE_SiloBeacon_{i}", 0.12, (x - 12, y - 4, 11.5*scale*0.8), mat_red, segs=8, rings=6, coll=coll)
    # skyline spires behind the edge blocks
    for i, x in enumerate([-165, -120, -70, -12, 40, 92, 145, 190]):
        h = (22 + (i * 7) % 18) * scale * 0.8
        cyl(f"SKY_Spire_{i}", 0.2, h, (x, 190 + (i % 3) * 10, h / 2 + 8), mat_metal, coll=coll, verts=8)
        sphere(f"SKY_SpireBeacon_{i}", 0.28, (x, 190 + (i % 3) * 10, h + 8.3), mat_red, segs=8, rings=6, coll=coll)

def rock_outcrops(coll, mat_rock, terrain_obj, spots):
    """Angular low-poly outcrops sitting on the terrain, for the background rim."""
    for i, (x, y, sx, sy, sz) in enumerate(spots):
        hit, loc, nor, idx, obj, m = bpy.context.scene.ray_cast(
            bpy.context.evaluated_depsgraph_get(), Vector((x, y, 600)), Vector((0, 0, -1)))
        z = loc.z if hit else 0
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1.0, location=(x, y, z + sz * 0.15))
        r = bpy.context.object; r.name = f"Outcrop_{i}"
        r.scale = (sx, sy, sz)
        bpy.ops.object.transform_apply(scale=True)
        md = r.modifiers.new("disp", 'DISPLACE'); md.strength = sx * 0.35
        md.texture = bpy.data.textures.new(f"outcropT{i}", 'CLOUDS'); md.texture.noise_scale = sx * 0.22
        bpy.context.view_layer.objects.active = r
        bpy.ops.object.modifier_apply(modifier=md.name)
        for p in r.data.polygons: p.use_smooth = False
        if not r.data.uv_layers:
            r.data.uv_layers.new(name="UVMap"); box_uv(r.data, 0.03)
        r.data.materials.append(mat_rock)
        for c in list(r.users_collection): c.objects.unlink(r)
        coll.objects.link(r)


def cliff_wall(coll, mat, x0=-380, x1=380, y_base=190.0):
    """Jagged escarpment behind the city, built as a faceted grid."""
    nx = 280; nz = 14
    verts = []; faces = []
    heights = []
    for i in range(nx + 1):
        x = x0 + (x1 - x0) * i / nx
        n = noise.noise(Vector((x * 0.008, 0.3, 0.7)))
        n2 = abs(noise.noise(Vector((x * 0.034, 1.2, 2.1))))
        h = 36.0 + 27.0 * (0.5 + 0.5 * n) + 12.0 * n2 + 5.0 * math.sin(x * 0.018)
        h -= 18.0 * max(0.0, math.sin(x * 0.012 + 1.2) - 0.55) / 0.45
        heights.append(max(16.0, h))
    for j in range(nz + 1):
        t = j / nz
        for i in range(nx + 1):
            x = x0 + (x1 - x0) * i / nx
            h = heights[i]
            rough = noise.noise(Vector((x * 0.055, t * 7.0, 4.2))) * (2.5 + 4.0 * t)
            y = y_base + t * 10.0 + rough
            z = t * h + (noise.noise(Vector((x * 0.1, t * 2.0, 9.1))) * 1.2 if 0 < j < nz else 0)
            verts.append((x, y, 0.0 if j == 0 else z))
    for j in range(nz):
        for i in range(nx):
            a = j * (nx + 1) + i; b = a + 1; c = a + nx + 2; d = a + nx + 1
            faces.append((a, b, c, d))
    me = bpy.data.meshes.new("CliffWall"); me.from_pydata(verts, [], faces); me.update()
    uv = me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = (v.x / 46.0, v.z / 46.0)
    for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new("CliffWall", me); link(ob, coll)
    ob.data.materials.append(mat)
    return ob
