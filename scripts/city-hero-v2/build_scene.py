"""Nautilus Reach v2 — authored single-building skyline + 1:1 arrival port.

Rebuild after the K038 563 m stacking rejection:
  * 1200 x 1200 m flat city deck, retaining wall, roads and plaza.
  * K032 BldgLG_A 220 m / K038 LargeJ 223 m / K038 LargeI 241 m as three
    separate native buildings, one mesh each, scale 1.0.
  * 650M1 CommunityCentre (103 x 87 x 27 m, 1.37 M tris) as T2 arrival hall.
  * Foreground port is 1:1 authored detail, A-30 sized to 25 m class.
  * K015 Neo Tokyo towers are distant, unit-corrected (x100) silhouettes only.
  * No vertical K038 stacking, no stretched K039 hero buildings.

Build:
  /Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/city-hero-v2/build_scene.py
"""
import bpy, bmesh, math, os, sys, re, random, json, time
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
LEGACY = os.path.normpath(os.path.join(HERE, "..", "city-hero"))
KIT = os.path.normpath(os.path.join(HERE, "..", "kitbash"))
sys.path.insert(0, LEGACY)
sys.path.insert(0, KIT)

import lib_city as L
from lib_city import (reset, collection, link, box, box_uv, cyl, sphere, cone,
                      ring, text_mesh, curve, get_font, solid_mat, emission_mat,
                      surface_mat, image_mat, make_light, point_at, world_image_sky,
                      import_modules, clone, place_ground, world_bbox, tri_count,
                      hide, unhide, mat_k032, mat_k038, mat_k046, mat_k039,
                      K032_DIR, K038_DIR, K046_DIR, K034_DIR, K014_DIR,
                      CITYSTREETS_BLEND, CHAR_BLEND, get_font)
from city_deck import build_deck, stripe
from city_port import (gantry, tank_farm, container_yard, light_mast,
                       ground_support, pad_dressing, control_tower,
                       boarding_stairs, ship_landing_gear, pipe_run,
                       container, beam, beam_box, warehouse)

ROOT = "/private/tmp/city-hero-v2"
BLEND = f"{ROOT}/scene.blend"
TEX = "/private/tmp/city-hero/tex"
SKY_HDR = "/Users/apple/.local/share/opencode/worktree/e0f2de/city-hero-v2/public/terrain-sample/sky.hdr"
COMMUNITY = "/Users/apple/Documents/3D Models/650M1/CommunityCentre.blend"
K015_FBX = "/private/tmp/city-hero-v2-assets/k015/KITBASH3D_TOKYO.fbx"
C2184 = "/Users/apple/Documents/3D Models/29_9月18日9时54文件仅保留30天使用后请存转备份C2184-6个科幻建筑面板模型素材mmuL/Blender-C2184/Sci-Fi Architecture Panels.blend"
SHIP_GLB = "/Users/apple/.local/share/opencode/worktree/e0f2de/city-hero-v2/public/models/thunderbolt.glb"

os.makedirs(ROOT, exist_ok=True)
os.makedirs(f"{ROOT}/renders_raw", exist_ok=True)
random.seed(77)

# ---------------------------------------------------------------------------
def log(*a):
    print(*a, flush=True)

# ---------------------------------------------------------------------------
def make_mats():
    """Dark, cool concrete for the deck; warm paint only where intended."""
    ensure = lambda p: p if os.path.exists(p) else None
    ALB = L.img(ensure(f"{TEX}/concrete_albedo.jpg"))
    NRM = L.img(ensure(f"{TEX}/concrete_normal.png"), True)
    RGH = L.img(ensure(f"{TEX}/concrete_rough.jpg"), True)
    AALB = L.img(ensure(f"{TEX}/asphalt_albedo.jpg"))
    ANRM = L.img(ensure(f"{TEX}/asphalt_normal.png"), True)
    ARGH = L.img(ensure(f"{TEX}/asphalt_rough.jpg"), True)
    TALB = L.img(ensure(f"{TEX}/terrain_albedo.jpg"))
    TNRM = L.img(ensure(f"{TEX}/terrain_normal.png"), True)
    TRGH = L.img(ensure(f"{TEX}/terrain_rough.jpg"), True)
    M_DECK = surface_mat("V2_Deck_Concrete", ALB, NRM, RGH,
        tint=(0.48, 0.50, 0.535), rough_scale=0.92, normal_strength=1.15)
    M_PLAZA = surface_mat("V2_Plaza_Concrete", ALB, NRM, RGH,
        tint=(0.38, 0.39, 0.415), rough_scale=1.0, normal_strength=1.1)
    M_WALL = surface_mat("V2_Retaining_Wall", ALB, NRM, RGH,
        tint=(0.29, 0.30, 0.32), rough_scale=1.05, normal_strength=1.2)
    M_ASP = surface_mat("V2_Asphalt", AALB, ANRM, ARGH,
        tint=(0.62, 0.65, 0.70), rough_scale=1.0, normal_strength=1.3)
    M_TER = surface_mat("V2_Terrain", TALB, TNRM, TRGH,
        tint=(0.46, 0.44, 0.41), rough_scale=1.0, normal_strength=1.0, uv_scale=1.0)
    M_WHITE = solid_mat("V2_Paint_White", (0.78, 0.78, 0.74), 0.55)
    M_YELLOW = solid_mat("V2_Paint_Yellow", (0.92, 0.55, 0.055), 0.48)
    M_DARK = solid_mat("V2_Paint_Dark", (0.018, 0.020, 0.024), 0.55, 0.18)
    M_HAZ = image_mat("V2_Hazard_Stripes", L.img(f"{TEX}/hazard.jpg"),
                      rough=0.62, uv_scale=1.0)
    M_EDGE = emission_mat("V2_Edge_Glow_Cyan", (0.10, 0.45, 1.0), 3.5)
    M_EDGE_W = emission_mat("V2_Edge_Glow_Warm", (1.0, 0.48, 0.18), 4.0)
    return dict(deck=M_DECK, plaza=M_PLAZA, wall=M_WALL, asphalt=M_ASP,
                terrain=M_TER, white=M_WHITE, yellow=M_YELLOW, dark=M_DARK,
                hazard=M_HAZ, edge=M_EDGE, edge_warm=M_EDGE_W,
                concrete=M_PLAZA)

# ---------------------------------------------------------------------------
def port_mats(mats):
    """PBR materials shared by the custom 1:1 port geometry."""
    M = {}
    M['white_panel'] = mat_k046('KB3D_HEM_MetalPaintWhite')
    M['steel'] = mat_k046('KB3D_HEM_MetalA')
    M['iron'] = mat_k046('KB3D_HEM_MetalFrame')
    M['corrugated'] = mat_k046('KB3D_HEM_MetalPanelCorrugated')
    M['tank'] = mat_k046('KB3D_HEM_MetalPaintWhite')
    M['pipe'] = mat_k046('KB3D_HEM_PipesA')
    M['rust'] = mat_k046('KB3D_HEM_RustA')
    M['light'] = emission_mat("V2_Port_Light_White", (0.72, 0.85, 1.0), 11.0, (0.03, 0.03, 0.035))
    M['warm'] = emission_mat("V2_Port_Light_Warm", (1.0, 0.50, 0.16), 9.0, (0.04, 0.03, 0.02))
    M['edge'] = emission_mat("V2_Port_Edge_Cyan", (0.10, 0.52, 1.0), 1.8, (0.01, 0.02, 0.03))
    M['red'] = emission_mat("V2_Port_Beacon_Red", (1.0, 0.04, 0.015), 28.0, (0.02, 0.0, 0.0))
    M['orange'] = solid_mat("V2_Safety_Orange", (0.84, 0.20, 0.012), 0.42, 0.05)
    M['dark'] = solid_mat("V2_Dark_Steel", (0.024, 0.027, 0.032), 0.46, 0.55)
    M['glass'] = L.pbr_material("V2_Port_Glass", None, None, None, None, glass=True)
    M['concrete'] = mats['plaza']
    M['asphalt'] = mats['asphalt']
    M['hazard'] = mats['hazard']
    M['container_red'] = mat_k046('KB3D_HEM_MetalPaintRed')
    M['container_blue'] = mat_k046('KB3D_HEM_MetalPaintBlue')
    M['container_grey'] = mat_k046('KB3D_HEM_MetalPanelBlack')
    M['container_tan'] = mat_k046('KB3D_HEM_MetalPaintYellow')
    M['white'] = mats['white']; M['yellow'] = mats['yellow']
    M['deck'] = mats['deck']; M['plaza'] = mats['plaza']; M['wall'] = mats['wall']
    M['edge_warm'] = mats['edge_warm']; M['edge_cool'] = mats['edge']
    return M

# ---------------------------------------------------------------------------
def append_community(coll):
    """Append the authored 650M1 CommunityCentre shell + a restrained interior."""
    prefixes = (
        'KB3D_MTM_BldgLgCommunityCenter_A_Building',
        'KB3D_MTM_BldgLgCommunityCenter_A_InteriorPlaza',
        'KB3D_MTM_BldgLgCommunityCenter_A_Lawn',
        'KB3D_MTM_BldgLgCommunityCenter_A_Planters',
        'KB3D_MTM_BldgLgCommunityCenter_A_HologramMap',
        'KB3D_MTM_BldgLgCommunityCenter_A_SofaA',
        'KB3D_MTM_BldgLgCommunityCenter_A_SofaB',
        'KB3D_MTM_BldgLgCommunityCenter_A_SofaC',
        'KB3D_MTM_BldgLgCommunityCenter_A_SofaD',
        'KB3D_MTM_BldgLgCommunityCenter_A_ChairA',
        'KB3D_MTM_BldgLgCommunityCenter_A_ChairB',
        'KB3D_MTM_BldgLgCommunityCenter_A_ChairC',
        'KB3D_MTM_BldgLgCommunityCenter_A_ChairD',
        'KB3D_MTM_BldgLgCommunityCenter_A_ChairE',
        'KB3D_MTM_BldgLgCommunityCenter_A_ChairF',
        'KB3D_MTM_BldgLgCommunityCenter_A_TableA',
        'KB3D_MTM_BldgLgCommunityCenter_A_TableB',
        'KB3D_MTM_BldgLgCommunityCenter_A_TableC',
        'KB3D_MTM_BldgLgCommunityCenter_A_TableD',
        'KB3D_MTM_BldgLgCommunityCenter_A_KioskA',
        'KB3D_MTM_BldgLgCommunityCenter_A_KioskB',
        'KB3D_MTM_BldgLgCommunityCenter_A_KioskC',
        'KB3D_MTM_BldgLgCommunityCenter_A_KioskD',
        'KB3D_MTM_BldgLgCommunityCenter_A_BillboardA',
        'KB3D_MTM_BldgLgCommunityCenter_A_BillboardB',
    )
    with bpy.data.libraries.load(COMMUNITY, link=False) as (src, dst):
        dst.objects = [n for n in src.objects if n.startswith(prefixes)]
    objs = [o for o in dst.objects if o and o.type == 'MESH']
    for o in objs:
        if o.parent:
            mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
        for c in list(o.users_collection):
            c.objects.unlink(o)
        coll.objects.link(o)
        o.hide_render = False; o.hide_set(False)
    log("COMMUNITY objects", len(objs), "tris", sum(tri_count(o) for o in objs))
    return objs

def parent_group(objs, name, coll):
    root = bpy.data.objects.new(name, None)
    coll.objects.link(root)
    for o in objs:
        if o.parent:
            mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
        o.parent = root
        o.matrix_parent_inverse = Matrix.Identity(4)
    return root

# ---------------------------------------------------------------------------
def import_k015_towers(coll):
    """Import the K015 kit, join selected tower + detail children, apply the
    1:100 unit correction, and return grounded native meshes.  These are the
    only assets in the scene that receive a uniform unit correction."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=K015_FBX, use_custom_normals=True,
                             use_image_search=True, ignore_leaf_bones=True)
    new = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    imported_names = [o.name for o in new if o.name in bpy.data.objects]
    wanted = ['Tower_002', 'Tower_006', 'Tower_009', 'Tower_010']
    out = {}
    for base_name in wanted:
        base = bpy.data.objects.get(base_name)
        if not base:
            continue
        parts = [o for o in bpy.data.objects
                 if o == base or o.name.startswith(base_name + '_details')]
        bpy.ops.object.select_all(action='DESELECT')
        for o in parts:
            o.select_set(True)
        bpy.context.view_layer.objects.active = base
        if len(parts) > 1:
            bpy.ops.object.join()
        ob = bpy.context.view_layer.objects.active
        if ob.parent:
            mw = ob.matrix_world.copy(); ob.parent = None; ob.matrix_world = mw
        bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        ob.scale = (100.0, 100.0, 100.0)
        bpy.ops.object.transform_apply(scale=True)
        # center footprint + ground
        vs = [v.co for v in ob.data.vertices]
        mn = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
        mx = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
        ob.data.transform(Matrix.Translation(Vector((-(mn.x+mx.x)/2, -(mn.y+mx.y)/2, -mn.z))))
        ob.location = (0, 0, 0)
        for c in list(ob.users_collection): c.objects.unlink(ob)
        coll.objects.link(ob)
        hide(ob)
        out[base_name] = ob
        log("K015", base_name, "dims", [round(v, 1) for v in ob.dimensions], "tris", tri_count(ob))
    keep = set(out.values())
    for name in imported_names:
        o = bpy.data.objects.get(name)
        if o and o not in keep:
            try: bpy.data.objects.remove(o, do_unlink=True)
            except Exception: pass
    return out

# ---------------------------------------------------------------------------
def append_c2184(coll, mat):
    with bpy.data.libraries.load(C2184, link=False) as (src, dst):
        dst.objects = [n for n in src.objects if n.startswith('Sci-Fi_01_')]
    objs = [o for o in dst.objects if o and o.type == 'MESH']
    for o in objs:
        if o.parent:
            mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
        for c in list(o.users_collection): c.objects.unlink(o)
        coll.objects.link(o)
        o.hide_render = False; o.hide_set(False)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = 'C2184_PanelBank'
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    vs = [v.co for v in ob.data.vertices]
    mn = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    mx = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    ob.data.transform(Matrix.Translation(Vector((-(mn.x+mx.x)/2, -(mn.y+mx.y)/2, -mn.z))))
    ob.location = (0, 0, 0)
    # authored geometry carries the detail; use the port steel family so the
    # panel bank reads as part of the terminal, not a separate material island
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    hide(ob)
    log("C2184", "dims", [round(v, 1) for v in ob.dimensions], "tris", tri_count(ob))
    return ob

# ---------------------------------------------------------------------------
def add_hero(name, src, x, y, rot, coll, M, k34_place, expected_tris):
    ob = clone(src, name, coll, 1.0)
    place_ground(ob, x, y, 0.20, rot, coll)
    bb = world_bbox(ob)
    w = bb[1].x - bb[0].x; d = bb[1].y - bb[0].y; h = bb[1].z - bb[0].z
    # civic foundation slab only (not another building module)
    box(f"{name}_Foundation", (w + 10, d + 10, 0.22), (x, y, 0.10),
        M['concrete'], coll=coll, bevel=0.04, uv=False)
    box(f"{name}_FoundationLightS", (w + 8, 0.10, 0.08), (x, y - d/2 - 4.6, 0.22),
        M['edge_warm'], coll=coll, uv=False)
    box(f"{name}_FoundationLightN", (w + 8, 0.10, 0.08), (x, y + d/2 + 4.6, 0.22),
        M['edge_warm'], coll=coll, uv=False)
    # a real entrance canopy at grade
    box(f"{name}_Canopy", (min(18.0, w*0.38), 3.4, 0.45),
        (x, y - d/2 - 1.4, 5.0), M['iron'], coll=coll, bevel=0.04)
    for sx in (-1, 1):
        cyl(f"{name}_CanopyCol{sx}", 0.16, 5.0,
            (x + sx*min(7.0, w*0.18), y - d/2 - 2.6, 2.5), M['steel'],
            coll=coll, verts=10)
    box(f"{name}_EntranceGlow", (min(14.0, w*0.30), 0.28, 0.30),
        (x, y - d/2 - 0.15, 2.9), M['warm'], coll=coll, uv=False)
    # authored roof equipment, not facade bands
    k34_place('AntennaTower_MetalDark_2', f"{name}_RoofAntenna",
              (x + w*0.26, y + d*0.18, h + 0.18), 12, 1.0, coll)
    k34_place('AirHandlerLG_PlasticWhite', f"{name}_RoofAC",
              (x - w*0.22, y - d*0.18, h + 0.18), -18, 0.9, coll)
    k34_place('Spire_MetalDark_2', f"{name}_RoofSpire",
              (x + w*0.08, y - d*0.24, h + 0.18), 0, 0.85, coll)
    sphere(f"{name}_RoofBeacon", 0.34, (x + w*0.26, y + d*0.18, h + 18.0),
           M['red'], segs=10, rings=6, coll=coll)
    log("HERO", name, "h", round(h, 1), "dims", [round(v, 1) for v in (w, d)],
        "tris", tri_count(ob), "expected", expected_tris, "scale", tuple(round(v, 3) for v in ob.scale))
    return dict(name=name, obj=ob.name, x=x, y=y, h=round(h, 2), w=round(w, 2), d=round(d, 2),
                tris=tri_count(ob), expected=expected_tris, scale=list(ob.scale))

def add_single(name, src, x, y, rot, coll, M, k34_place, base=True):
    ob = clone(src, name, coll, 1.0)
    place_ground(ob, x, y, 0.16, rot, coll)
    bb = world_bbox(ob)
    w = bb[1].x - bb[0].x; d = bb[1].y - bb[0].y; h = bb[1].z - bb[0].z
    if base:
        box(f"{name}_Base", (w + 6, d + 6, 0.16), (x, y, 0.08),
            M['concrete'], coll=coll, bevel=0.03, uv=False)
        box(f"{name}_EntryLight", (min(10.0, w*0.3), 0.22, 0.24),
            (x, y - d/2 - 0.15, 2.6), M['warm'], coll=coll, uv=False)
    k34_place('AntennaTower_MetalDark_2', f"{name}_Antenna",
              (x + w*0.24, y + d*0.15, h + 0.14), 0, 0.8, coll)
    log("SINGLE", name, "h", round(h, 1), "dims", [round(v, 1) for v in (w, d)],
        "tris", tri_count(ob))
    return dict(name=name, obj=ob.name, x=x, y=y, h=round(h, 2), w=round(w, 2), d=round(d, 2),
                tris=tri_count(ob), scale=list(ob.scale))

def add_k039(name, src, x, y, rot, coll, M, glow=True):
    ob = clone(src, name, coll, 1.0)
    place_ground(ob, x, y, 0.14, rot, coll)
    bb = world_bbox(ob)
    w = bb[1].x - bb[0].x; d = bb[1].y - bb[0].y; h = bb[1].z - bb[0].z
    box(f"{name}_Pad", (w + 3, d + 3, 0.16), (x, y, 0.08),
        M['concrete'], coll=coll, bevel=0.025, uv=False)
    if glow:
        box(f"{name}_ShopGlow", (w*0.72, 0.20, 0.35),
            (x, y - d/2 - 0.12, 3.4), M['warm'], coll=coll, uv=False)
    log("K039", name, "h", round(h, 1), "dims", [round(v, 1) for v in (w, d)],
        "tris", tri_count(ob))
    return dict(name=name, obj=ob.name, x=x, y=y, h=round(h, 2), w=round(w, 2), d=round(d, 2),
                tris=tri_count(ob), scale=list(ob.scale))

# ---------------------------------------------------------------------------
def terrain_h(x, y):
    """Same ring profile as city_deck, used only to ground the distant K015 set."""
    from mathutils import noise
    def smoothstep(a, b, x):
        t = max(0.0, min(1.0, (x-a)/(b-a)))
        return t*t*(3-2*t)
    e = max(abs(x)-620, abs(y)-620, 0)
    if e <= 0:
        return -40.0
    n1 = noise.noise(Vector((x*0.0035, y*0.0035, 0.7)))
    n2 = noise.noise(Vector((x*0.011, y*0.011, 4.2)))
    n3 = noise.noise(Vector((x*0.028, y*0.028, 9.1)))
    rise = smoothstep(0, 220, e)*(2.5+7.0*(0.5+0.5*n1)+2.0*n2)
    ridge = smoothstep(280, 900, e)*(24.0*(0.6+0.4*n1)+8.0*n2+2.0*n3)
    far = smoothstep(700, 1500, e)*(55.0*(0.55+0.45*n1)+10*n3)
    return -40.0+rise+ridge+far

# ---------------------------------------------------------------------------
def build():
    sc = reset()
    sc.render.engine = 'CYCLES'
    sc.unit_settings.system = 'METRIC'
    sc.unit_settings.scale_length = 1.0
    C_GROUND = collection("01_GROUND")
    C_MODS = collection("00_MODULES")
    C_BLDG = collection("02_BUILDINGS")
    C_CITY = collection("03_CITY")
    C_PORT = collection("04_PORT")
    C_PROPS = collection("05_PROPS")
    C_PEOPLE = collection("06_PEOPLE")
    C_SHIP = collection("07_SHIP")
    C_BG = collection("08_BACKGROUND")
    C_LIGHT = collection("09_LIGHTS")
    C_CAM = collection("10_CAMERAS")

    mats = make_mats()
    M = port_mats(mats)

    # ---------------------------------------------------------------- deck
    log("DECK")
    build_deck(C_GROUND, mats)

    # dark wet patches under the gantry / terminal edge (authored geometry)
    puddle_mat = L.pbr_material("V2_Wet_Concrete", None, None, None, None,
                                tint=(0.015, 0.018, 0.022))
    b = bpy.data.materials['V2_Wet_Concrete'].node_tree.nodes.get('Principled BSDF')
    if b:
        b.inputs['Roughness'].default_value = 0.16
        try:
            b.inputs['Coat Weight'].default_value = 0.5
            b.inputs['Coat Roughness'].default_value = 0.06
        except Exception:
            pass
    for i, (x, y, r, sx, sy, rot) in enumerate([
        (-72, -450, 6.0, 1.8, 0.8, 12), (-18, -438, 4.5, 1.3, 1.8, -20),
        (22, -405, 3.8, 1.0, 1.7, 30), (-110, -505, 5.2, 1.7, 1.0, 8),
        (46, -455, 4.0, 1.2, 1.0, -6), (-38, -390, 3.0, 1.0, 1.4, 22),
        (-175, -536, 6.0, 1.2, 0.8, -5)]):
        verts=[]; faces=[]
        seg=22
        for k in range(seg):
            a=2*math.pi*k/seg
            rr=r*(0.72+0.28*math.sin(a*3+i))
            verts.append((x+math.cos(a)*rr*sx, y+math.sin(a)*rr*sy, 0.181))
        faces.append(tuple(range(seg)))
        me=bpy.data.meshes.new(f"Puddle_{i}"); me.from_pydata(verts,[],faces); me.update()
        for p in me.polygons: p.use_smooth=True
        ob=bpy.data.objects.new(f"Puddle_{i}",me); link(ob,C_GROUND)
        ob.data.materials.append(puddle_mat)

    # apron lead-in, scale markings and deck text; 1:1 line widths
    log("APRON MARKINGS")
    for i in range(15):
        t = i/14.0
        x = -118 + 96*t
        y = -586 + 130*t
        stripe(f"ApronLead_{i}", x, y, x+3.0, y+4.1, 0.45,
               mats['yellow'], z=0.196, coll=C_GROUND)
    for i in range(12):
        t = i/11.0
        x = -136 + 96*t
        y = -592 + 145*t
        stripe(f"ApronWhite_{i}", x, y, x+2.0, y+3.0, 0.22,
               mats['white'], z=0.198, coll=C_GROUND)
    ring("ApronRoundel", 11.0, 0.22, (-64, -536, 0.200), mats['white'], C_GROUND, scale_z=0.02)
    ring("ApronRoundel2", 8.0, 0.14, (-64, -536, 0.202), mats['yellow'], C_GROUND, scale_z=0.02)
    text_mesh("ApronLabel", "APRON 01", 3.8, (-100, -546, 0.200),
              mats['white'], font=get_font(), coll=C_GROUND, extrude=0.004, spacing=0.98)
    text_mesh("ApronSub", "T2  //  NAUTILUS REACH  //  ELEV 0.00", 1.35,
              (-100, -553, 0.200), mats['yellow'], font=get_font(),
              coll=C_GROUND, extrude=0.003, spacing=0.96)
    text_mesh("ApronT2", "T2", 5.4, (-64, -558, 0.200),
              mats['white'], font=get_font(), coll=C_GROUND, extrude=0.004, spacing=1.0)
    text_mesh("ApronArrow", ">>>", 2.8, (-96, -570, 0.200),
              mats['yellow'], font=get_font(), coll=C_GROUND, extrude=0.003, spacing=1.0)

    # ---------------------------------------------------------------- K032/K038/K046/K039
    log("IMPORT K032")
    k32 = import_modules(f"{K032_DIR}/Kitbash3d_NeoShanghai.FBX", 'K32',
                         re.compile(r'^(BldgLG_[A-Z]|BldgM_[A-Z]|BldgS_[A-Z])_'),
                         C_MODS, mat_k032)
    for k in list(k32):
        if k not in {'BldgLG_A','BldgLG_B','BldgLG_E'}:
            try: bpy.data.objects.remove(k32[k], do_unlink=True)
            except Exception: pass
            k32.pop(k, None)
    log("IMPORT K038")
    k38 = import_modules(f"{K038_DIR}/FBX格式/Kitbash3d_NeoTokyo2-Native.FBX", 'K38',
                         re.compile(r'^Desirefx\.me_(Large[A-Z])_'),
                         C_MODS, mat_k038)
    for k in list(k38):
        if k not in {'LargeJ','LargeI','LargeC','LargeE'}:
            try: bpy.data.objects.remove(k38[k], do_unlink=True)
            except Exception: pass
            k38.pop(k, None)
    log("IMPORT K046")
    k46 = import_modules(f"{K046_DIR}/KB3D_HeavyMetal-Native.fbx", 'K46',
                         re.compile(r'^KB3D_HEM_(BldgLG_[A-Z]|BldgMD_[A-Z]|BldgSM_[A-Z])_'),
                         C_MODS, mat_k046)
    for k in list(k46):
        if k not in {'BldgLG_G','BldgLG_D','BldgLG_E'}:
            try: bpy.data.objects.remove(k46[k], do_unlink=True)
            except Exception: pass
            k46.pop(k, None)
    log("IMPORT K039")
    k39 = import_modules("/tmp/kb3d_fbx/asset_1.fbx", 'K39',
                         re.compile(r'^(?:Desirefx\.me_|Desirefx_me_)?(Bldg(?:LG|MD|SM)_[A-Z])_'),
                         C_MODS, mat_k039)
    for k in list(k39):
        if k not in {'BldgLG_D','BldgLG_E','BldgLG_F','BldgLG_G','BldgLG_I'}:
            try: bpy.data.objects.remove(k39[k], do_unlink=True)
            except Exception: pass
            k39.pop(k, None)

    mods = {}
    for k, v in k32.items(): mods['K32_'+k] = v
    for k, v in k38.items(): mods['K38_'+k] = v
    for k, v in k46.items(): mods['K46_'+k] = v
    for k, v in k39.items(): mods['K39_'+k] = v

    # ---------------------------------------------------------------- rooftop props
    log("IMPORT K034/K014")
    def import_props(fbx, wanted, tag):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.fbx(filepath=fbx, use_image_search=True)
        new = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
        out = {}
        for want in wanted:
            for o in new:
                if o.name == want or o.name.startswith(want + '.'):
                    if o.parent:
                        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
                    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
                    bpy.context.view_layer.objects.active = o
                    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
                    bb = [Vector(c) for c in o.bound_box]
                    mn = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
                    mx = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
                    ctr = Vector(((mn.x+mx.x)/2, (mn.y+mx.y)/2, mn.z))
                    o.data.transform(Matrix.Translation(-ctr)); o.location = (0,0,0)
                    for c in list(o.users_collection): c.objects.unlink(o)
                    C_PROPS.objects.link(o); hide(o); out[want] = o
                    break
        for o in new:
            if o not in out.values() and o.name in bpy.data.objects:
                try: bpy.data.objects.remove(o, do_unlink=True)
                except Exception: pass
        log(tag, "protos", list(out))
        return out
    k34 = import_props(f"{K034_DIR}/Kitbash3D Props Rooftops.fbx",
                       ['AntennaTower_MetalDark_2','AirHandlerXL_PlasticWhite',
                        'AirHandlerLG_PlasticWhite','AirHandlerMD_MetalLight_2',
                        'WaterTowerTall_MetalDark','Spire_MetalDark_2',
                        'AntennaTower_MetalLight','SatelliteLG_PlasticWhite_5',
                        'BillboardTall_MetalDark_4','FireEscape_MetalDark_2'], 'K034')
    k14 = import_props(f"{K014_DIR}/Kitbash3d_Greebles.FBX",
                       ['Greeble_A','Greeble_B','Greeble_C','Greeble_D','Greeble_E',
                        'Greeble_F','Greeble_G','Greeble_H','Greeble_I','Greeble_N',
                        'Greeble_S'], 'K014')
    def k34_place(key, name, loc, rot=0, scale=1.0, coll=C_PORT):
        src = k34.get(key)
        if not src: return None
        o = src.copy(); o.data = src.data; o.name = name; unhide(o)
        coll.objects.link(o)
        o.location = loc; o.rotation_euler = (0,0,math.radians(rot)); o.scale = (scale,scale,scale)
        return o
    def k14_place(key, name, loc, rot=0, scale=1.0, coll=C_PORT):
        src = k14.get(key)
        if not src: return None
        o = src.copy(); o.data = src.data; o.name = name; unhide(o)
        coll.objects.link(o)
        o.location = loc; o.rotation_euler = (0,0,math.radians(rot)); o.scale = (scale,scale,scale)
        return o

    # ---------------------------------------------------------------- hero towers
    log("HEROES")
    heroes = []
    heroes.append(add_hero('Hero_K032_A', mods['K32_BldgLG_A'], -290, -150, 8,
                           C_BLDG, M, k34_place, 275250))
    heroes.append(add_hero('Hero_K038_J', mods['K38_LargeJ'], 245, -150, -14,
                           C_BLDG, M, k34_place, 357771))
    heroes.append(add_hero('Hero_K038_I', mods['K38_LargeI'], 430, 200, 5,
                           C_BLDG, M, k34_place, 206982))

    # ---------------------------------------------------------------- single native mids
    log("MIDS")
    mids = []
    mids.append(add_single('Mid_K032_B', mods['K32_BldgLG_B'], -60, 440, -8, C_BLDG, M, k34_place))
    mids.append(add_single('Mid_K038_C', mods['K38_LargeC'], -430, 460, 20, C_BLDG, M, k34_place))
    mids.append(add_single('Mid_K038_E', mods['K38_LargeE'], 430, 470, -6, C_BLDG, M, k34_place))
    mids.append(add_single('Mid_K032_E', mods['K32_BldgLG_E'], 300, -250, 18, C_BLDG, M, k34_place))
    mids.append(add_single('Mid_K046_G', mods['K46_BldgLG_G'], 500, 420, -90, C_BLDG, M, k34_place))
    mids.append(add_single('Mid_K046_E', mods['K46_BldgLG_E'], 150, 480, 90, C_BLDG, M, k34_place))
    mids.append(add_single('Mid_K046_D', mods['K46_BldgLG_D'], -280, -360, 12, C_BLDG, M, k34_place))

    # ---------------------------------------------------------------- K039 1:1 low-rise
    log("K039 LOW-RISE")
    lows = []
    lows.append(add_k039('Low_K039_G', mods['K39_BldgLG_G'], -480, -120, 8, C_CITY, M, True))
    lows.append(add_k039('Low_K039_D1', mods['K39_BldgLG_D'], 420, -220, -12, C_CITY, M, True))
    lows.append(add_k039('Low_K039_D2', mods['K39_BldgLG_D'], -470, 180, 16, C_CITY, M, True))
    lows.append(add_k039('Low_K039_E2', mods['K39_BldgLG_E'], -80, 250, -6, C_CITY, M, True))
    lows.append(add_k039('Low_K039_F1', mods['K39_BldgLG_F'], 400, -300, 12, C_CITY, M, True))
    lows.append(add_k039('Low_K039_I1', mods['K39_BldgLG_I'], 520, -60, 2, C_CITY, M, True))
    # street-wall infill: authored 1:1 K039 low-rise along the boulevards.
    # These are deliberately not scaled; they are the midground layer that
    # makes the 1200 m deck read as a district rather than a parking lot.
    extra_lows = [
        ('Low_K039_E3', 'K39_BldgLG_E', -500, 160, 4),
        ('Low_K039_E4', 'K39_BldgLG_E', -440, 160, -6),
        ('Low_K039_E5', 'K39_BldgLG_E', -320, 160, 8),
        ('Low_K039_E6', 'K39_BldgLG_E', 320, 160, -4),
        ('Low_K039_E7', 'K39_BldgLG_E', 460, 140, 10),
        ('Low_K039_E8', 'K39_BldgLG_E', 500, 160, -12),
        ('Low_K039_F2', 'K39_BldgLG_F', -400, -200, 6),
        ('Low_K039_F3', 'K39_BldgLG_F', -400, 0, -8),
        ('Low_K039_F4', 'K39_BldgLG_F', -400, 200, 14),
        ('Low_K039_F5', 'K39_BldgLG_F', 400, -100, -6),
        ('Low_K039_F6', 'K39_BldgLG_F', 400, 50, 18),
        ('Low_K039_F7', 'K39_BldgLG_F', -200, 300, 2),
        ('Low_K039_F8', 'K39_BldgLG_F', 200, 300, -10),
        ('Low_K039_D3', 'K39_BldgLG_D', 500, 300, 8),
    ]
    for name, key, x, y, rot in extra_lows:
        if key in mods:
            lows.append(add_k039(name, mods[key], x, y, rot, C_CITY, M, True))

    # ---------------------------------------------------------------- terminal / T2
    log("TERMINAL CommunityCentre")
    term_objs = append_community(C_PORT)
    # dark reflective terminal glazing instead of the source cyan foil look.
    for m in bpy.data.materials:
        if not m.name.startswith('KB3D_MTM_Glass'):
            continue
        nt = m.node_tree
        b = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not b:
            continue
        for sock in ('Base Color', 'Roughness', 'Metallic', 'Transmission Weight', 'IOR',
                     'Emission Color', 'Emission Strength'):
            if sock in b.inputs:
                for l in list(b.inputs[sock].links):
                    nt.links.remove(l)
        b.inputs['Base Color'].default_value = (0.010, 0.018, 0.024, 1)
        b.inputs['Roughness'].default_value = 0.24
        b.inputs['Metallic'].default_value = 0.0
        if 'Emission Strength' in b.inputs:
            b.inputs['Emission Strength'].default_value = 0.0
        if 'Transmission Weight' in b.inputs:
            b.inputs['Transmission Weight'].default_value = 0.05
        if 'IOR' in b.inputs:
            b.inputs['IOR'].default_value = 1.46
    root = parent_group(term_objs, 'Terminal_T2_Root', C_PORT)
    root.location = (-145, -445, 0.62)
    root.rotation_euler = (0, 0, math.radians(0))
    # plinth and apron interface
    box("Terminal_Plinth", (117, 101, 0.62), (-145, -445, 0.31),
        M['concrete'], coll=C_PORT, bevel=0.06, uv=False)
    box("Terminal_PlinthBand", (117.4, 101.4, 0.10), (-145, -445, 0.62),
        M['edge'], coll=C_PORT, uv=False)
    # entrance portal / canopy on the pad-facing east side
    box("Terminal_PortalFrameL", (3.6, 3.2, 7.2), (-90.5, -438, 4.2), M['dark'], coll=C_PORT, bevel=0.05)
    box("Terminal_PortalFrameR", (3.6, 3.2, 7.2), (-90.5, -422, 4.2), M['dark'], coll=C_PORT, bevel=0.05)
    box("Terminal_PortalTop", (3.6, 19.2, 1.6), (-90.5, -430, 8.0), M['dark'], coll=C_PORT, bevel=0.05)
    box("Terminal_PortalGlass", (0.30, 14.0, 6.4), (-92.2, -430, 3.8), M['glass'], coll=C_PORT, bevel=0.015)
    for i in range(5):
        box(f"Terminal_PortalMull{i}", (0.16, 0.35, 6.5),
            (-92.35, -436+i*3.0, 3.8), M['dark'], coll=C_PORT, uv=False)
    box("Terminal_PortalGlow", (0.24, 13.4, 0.16), (-92.5, -430, 7.0), M['warm'], coll=C_PORT, uv=False)
    text_mesh("Terminal_T2_Sign", "T2  //  ARRIVALS", 1.30, (-89.1, -430, 9.6),
              M['warm'], rot=(math.radians(90), 0, math.radians(90)), font=get_font(),
              coll=C_PORT, extrude=0.012, spacing=0.92)
    # landside T2 entrance hall: a real 1:1 portal, canopy and sign on the
    # south face so the terminal reads as a building from the arrival apron.
    box("T2_Landside_Plinth", (38, 20, 0.55), (-145, -501, 0.275),
        M['concrete'], coll=C_PORT, bevel=0.05, uv=False)
    box("T2_Landside_Shell", (31, 12, 9.4), (-145, -501, 5.25),
        M['dark'], coll=C_PORT, bevel=0.08)
    box("T2_Landside_TopBand", (31.4, 12.4, 0.55), (-145, -501, 9.7),
        M['iron'], coll=C_PORT, bevel=0.04)
    box("T2_Landside_Glass", (26, 0.22, 7.4), (-145, -507.2, 4.45),
        M['glass'], coll=C_PORT, bevel=0.01)
    for i in range(10):
        x = -158 + i*2.9
        box(f"T2_Landside_Mullion{i}", (0.16, 0.36, 7.5), (x, -507.35, 4.45),
            M['steel'], coll=C_PORT, bevel=0.008, uv=False)
    for i, x in enumerate((-154, -145, -136)):
        box(f"T2_Landside_Door{i}", (4.2, 0.16, 5.6), (x, -507.48, 3.2),
            M['glass'], coll=C_PORT, bevel=0.008)
        box(f"T2_Landside_DoorLamp{i}", (4.4, 0.16, 0.14), (x, -507.6, 6.25),
            M['warm'], coll=C_PORT, uv=False)
    box("T2_Landside_Glow", (24, 0.18, 0.18), (-145, -505.7, 8.2),
        M['warm'], coll=C_PORT, uv=False)
    box("T2_Landside_Canopy", (36, 7.0, 0.45), (-145, -510.0, 9.8),
        M['iron'], coll=C_PORT, bevel=0.04)
    for x in (-158, -145, -132):
        cyl(f"T2_Landside_CanopyCol{x}", 0.18, 9.6, (x, -512.0, 4.8),
            M['steel'], coll=C_PORT, verts=10)
    for i in range(3):
        box(f"T2_Landside_Step{i}", (30, 1.8, 0.18),
            (-145, -509.0-i*1.7, 0.09+i*0.12), M['concrete'],
            coll=C_PORT, bevel=0.02, uv=False)
    # hero sign above the canopy
    box("T2_HallSignFrame", (32, 0.55, 4.8), (-145, -513.2, 12.55),
        M['dark'], coll=C_PORT, bevel=0.04)
    box("T2_HallSignLight", (30, 0.16, 0.12), (-145, -513.55, 14.8),
        M['edge'], coll=C_PORT, uv=False)
    text_mesh("T2_HallSign", "T2  //  ARRIVALS", 1.45, (-145, -513.6, 12.7),
              M['warm'], rot=(math.radians(90), 0, 0), font=get_font(),
              coll=C_PORT, extrude=0.012, spacing=0.92)
    text_mesh("T2_HallName", "NAUTILUS REACH", 1.10, (-145, -513.6, 10.8),
              M['white'], rot=(math.radians(90), 0, 0), font=get_font(),
              coll=C_PORT, extrude=0.010, spacing=0.98)
    for x in (-157, -133):
        cyl(f"T2_HallSignPost{x}", 0.12, 3.2, (x, -513.1, 11.2),
            M['steel'], coll=C_PORT, verts=8)
    # roof plant + side service windows
    box("T2_Landside_RoofAC", (7.0, 4.0, 1.6), (-154, -500, 10.9),
        M['iron'], coll=C_PORT, bevel=0.04)
    box("T2_Landside_RoofAC2", (5.0, 3.0, 1.2), (-136, -502, 10.7),
        M['steel'], coll=C_PORT, bevel=0.04)
    for sx, x in ((-1, -160.6), (1, -129.4)):
        box(f"T2_Landside_SideGlass{sx}", (0.16, 8.0, 5.2), (x, -501, 4.6),
            M['glass'], coll=C_PORT, bevel=0.01)
        for i in range(4):
            box(f"T2_Landside_SideMull{sx}_{i}", (0.20, 0.25, 5.3),
                (x, -504.0+i*2.0, 4.6), M['steel'], coll=C_PORT, uv=False)
    # entrance area light, warm, under the canopy
    t2h = make_light("T2_Hall_Area", 'AREA', (-145, -513.0, 8.8), 6500,
                     (1.0, 0.72, 0.45), size=(24, 5), coll=C_LIGHT)
    point_at(t2h, (-145, -500, 5.0))
    # covered walkway from T2 to the 60 m TLOF
    box("Walkway_Deck", (64, 6.4, 0.18), (-58, -430, 0.20), M['concrete'], coll=C_PORT, bevel=0.03, uv=False)
    box("Walkway_Roof", (64, 7.2, 0.28), (-58, -430, 5.0), M['iron'], coll=C_PORT, bevel=0.03)
    for i in range(7):
        x = -87 + i*9.6
        for sy in (-1, 1):
            cyl(f"Walkway_Col{i}_{sy}", 0.16, 4.8, (x, -430+sy*3.1, 2.55),
                M['steel'], coll=C_PORT, verts=10)
        box(f"Walkway_Light{i}", (7.2, 0.18, 0.10), (x, -430, 4.82),
            M['warm'], coll=C_PORT, uv=False)
    for sy in (-1, 1):
        box(f"Walkway_Glass{sy}", (64, 0.10, 2.0), (-58, -430+sy*3.15, 3.0),
            M['glass'], coll=C_PORT, bevel=0.01)
    # service panel bank on the south plinth: real C2184 authored geometry
    c2184 = append_c2184(C_PORT, M['iron'])
    p1 = clone(c2184, 'C2184_SouthBank', C_PORT, 1.0)
    place_ground(p1, -188, -495.0, 0.62, 0, C_PORT)
    box("C2184_SouthBank_Frame", (10.6, 0.55, 4.4), (-188, -495.2, 2.8),
        M['dark'], coll=C_PORT, bevel=0.03)
    p2 = clone(c2184, 'C2184_EastBank', C_PORT, 1.0)
    place_ground(p2, -202.0, -430, 0.62, 90, C_PORT)
    # K014 greebles on the terminal plinth + south utility wall
    for i, (key, x, z, rot, s) in enumerate([
        ('Greeble_E', -178, 3.1, 0, 1.1), ('Greeble_H', -196, 3.3, 0, 1.0),
        ('Greeble_D', -188, 1.7, 0, 1.2), ('Greeble_A', -165, 2.4, 0, 1.0),
        ('Greeble_I', -205, 2.0, 90, 1.0)]):
        k14_place(key, f"TermGreeb_{i}", (x, -496.2, z), rot, s, C_PORT)
    # canopy signage on the T2 roof edge
    # ---------------------------------------------------------------- port props
    log("PORT")
    control_tower(C_PORT, M, C_LIGHT)
    gantry(C_PORT, M, C_LIGHT, -420)
    tank_farm(C_PORT, M, C_LIGHT)
    container_yard(C_PORT, M)
    light_mast(C_PORT, M, C_LIGHT, "MastSW", -52, -462, 20, 28)
    light_mast(C_PORT, M, C_LIGHT, "MastSE", 55, -458, 200, 28)
    light_mast(C_PORT, M, C_LIGHT, "MastNW", -58, -386, 20, 26)
    light_mast(C_PORT, M, C_LIGHT, "MastNE", 55, -386, 200, 26)
    ground_support(C_PORT, M)
    pad_dressing(C_PORT, M, C_LIGHT)
    # extra authored pipe runs from tank farm to T2 and gantry
    pipe_run(C_PORT, M, -280, -470, -198, -470, 1.4, 0.16, 1)
    pipe_run(C_PORT, M, -280, -478, -198, -478, 2.2, 0.14, 1)
    pipe_run(C_PORT, M, -280, -486, -198, -486, 3.0, 0.12, 1)
    for i, (x, y, rot, col, st) in enumerate([
        (58, -430, -8, 'container_red', 0), (58, -430, -8, 'container_grey', 1),
        (85, -430, -8, 'container_blue', 0), (85, -430, -8, 'container_tan', 1),
        (112, -431, -6, 'container_blue', 0), (112, -431, -6, 'container_red', 1),
        (139, -432, -4, 'container_grey', 0), (44, -462, 84, 'container_tan', 0),
        (68, -460, 82, 'container_blue', 0), (44, -462, 84, 'container_grey', 1)]):
        container(C_PORT, M, f"CTN_V2_{i}", (x, y), rot, mat=M[col], stack=st)
    # K034 props on the industrial hall, control tower and tank bund
    for nm, key, loc, rot, s, coll in [
        ('Hall_Antenna','AntennaTower_MetalDark_2',(480,-180,88.2+0.1),0,1.0,C_BLDG),
        ('Hall_AC','AirHandlerXL_PlasticWhite',(455,-150,88.2+0.1),0,1.2,C_BLDG),
        ('Hall_Water','WaterTowerTall_MetalDark',(505,-140,88.2+0.1),0,1.2,C_BLDG),
        ('CT_Antenna','AntennaTower_MetalLight',(-232,-512+10,75.0),0,0.8,C_PORT),
        ('CT_Box','AirHandlerMD_MetalLight_2',(-222,-505,75.0),0,0.9,C_PORT),
        ('Tank_Antenna','AntennaTower_MetalDark_2',(-320,-475,21.5),0,0.7,C_PORT),
        ('Tank_Water','WaterTowerTall_MetalDark',(-345,-490,21.5),0,0.8,C_PORT)]:
        k34_place(key, nm, loc, rot, s, coll)
    for i, (key, loc, rot, s, coll) in enumerate([
        ('Greeble_B', (34, -475, 3.0), 180, 1.2, C_PORT),
        ('Greeble_D', (41, -475, 2.0), 180, 1.2, C_PORT),
        ('Greeble_G', (48, -475, 3.4), 180, 1.2, C_PORT),
        ('Greeble_E', (-284, -500, 3.0), 0, 1.2, C_PORT),
        ('Greeble_C', (-292, -444, 2.0), 0, 1.2, C_PORT)]):
        k14_place(key, f"YardGreeb_{i}", loc, rot, s, coll)
    # gantry control cabin, with C2184 panel bank
    box("Gantry_Cabin", (10.0, 5.0, 4.2), (30, -444, 2.4), M['dark'], coll=C_PORT, bevel=0.05)
    box("Gantry_CabinGlass", (9.6, 0.10, 1.8), (30, -446.55, 3.4), M['glass'], coll=C_PORT, bevel=0.01)
    box("Gantry_CabinLight", (10.2, 0.18, 0.16), (30, -446.7, 4.5), M['warm'], coll=C_PORT, uv=False)

    # ---------------------------------------------------------------- characters
    log("CHARACTERS")
    char_names = ['10_Idle2_Radio','12_Idle4_Crossedhands','17_Carrying1',
                  '26_Signal_Hold','9_Idle1','23_Sit2','27_Signal_Hold2',
                  '5_Walk4','18_Carrying2','31_Signal_Move4','3_Walk2']
    with bpy.data.libraries.load(CHAR_BLEND, link=False) as (src, dst):
        dst.objects = [n for n in char_names if n in src.objects]
    chars = []
    for o in dst.objects:
        if not o or o.type != 'MESH': continue
        for c in list(o.users_collection): c.objects.unlink(o)
        C_PEOPLE.objects.link(o)
        bpy.context.view_layer.update()
        bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        bb = [Vector(c) for c in o.bound_box]
        mn = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
        mx = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
        ctr = Vector(((mn.x+mx.x)/2, (mn.y+mx.y)/2, mn.z))
        o.data.transform(Matrix.Translation(-ctr)); o.location = (0,0,0)
        o.hide_render = False; o.hide_set(False)
        chars.append(o)
    CH_PLACE = [
        ('10_Idle2_Radio', (-157, -516, 0.25), 18),
        ('12_Idle4_Crossedhands', (-133, -516, 0.25), 162),
        ('17_Carrying1', (-112, -516, 0.25), 95),
        ('26_Signal_Hold', (-30, -412, 0.20), 195),
        ('9_Idle1', (48, -448, 0.20), 150),
        ('23_Sit2', (-150, -504, 0.55), 5),
        ('27_Signal_Hold2', (-55, -437, 0.20), 240),
        ('5_Walk4', (-88, -542, 0.20), 20),
        ('18_Carrying2', (-60, -525, 0.20), 100),
        ('31_Signal_Move4', (235, -222, 0.20), 10),
        ('3_Walk2', (-112, -579, 0.20), 8),
    ]
    for name, loc, rot in CH_PLACE:
        ob = next((o for o in chars if o.name.startswith(name)), None)
        if not ob: continue
        ob.location = loc; ob.rotation_euler = (0,0,math.radians(rot))
        log("CHAR", name, [round(v,2) for v in ob.dimensions])
    # near-camera baggage cart for scale on the apron
    box("ApronCart_Deck", (2.4, 1.4, 0.16), (-108.5, -581, 0.46), M['steel'], coll=C_PORT, bevel=0.03)
    for sx in (-1, 1):
        for sy in (-1, 1):
            cyl(f"ApronCart_Wheel{sx}{sy}", 0.25, 0.14,
                (-108.5+sx*0.9, -581+sy*0.62, 0.30), M['dark'],
                rot=(math.radians(90), 0, 0), coll=C_PORT, verts=12)
    box("ApronCart_CaseA", (1.3, 1.0, 0.85), (-109.0, -581, 0.98),
        M['container_blue'], coll=C_PORT, bevel=0.03)
    box("ApronCart_CaseB", (0.8, 0.9, 0.65), (-107.9, -581, 1.05),
        M['container_tan'], coll=C_PORT, bevel=0.03)
    cyl("ApronCart_Handle", 0.05, 0.8, (-109.9, -581, 1.0),
        M['steel'], rot=(0, math.radians(90), 0), coll=C_PORT, verts=8)

    # ---------------------------------------------------------------- A-30
    log("A-30")
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=SHIP_GLB)
    ship_new = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    ship_parts = []
    for o in ship_new:
        for c in list(o.users_collection): c.objects.unlink(o)
        C_SHIP.objects.link(o); ship_parts.append(o)
    bpy.context.view_layer.update()
    # Native GLB is a ~26 m class hull with a wider span.  Scale the whole
    # authored ship to a 25 m length class and ground it on its pads; this is
    # a 4% unit fit, not an art-direction stretch.
    ship_root = bpy.data.objects.new('A30_Root', None)
    C_SHIP.objects.link(ship_root)
    for o in ship_parts:
        if o.parent:
            mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
        o.parent = ship_root
        o.matrix_parent_inverse = Matrix.Identity(4)
    ship_root.scale = (0.9615, 0.9615, 0.9615)
    bpy.context.view_layer.update()
    bb = [o.matrix_world @ Vector(c) for o in ship_parts for c in o.bound_box]
    mn = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
    mx = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
    ship_root.location.x += 0.0 - (mn.x+mx.x)/2
    ship_root.location.y += -420.0 - (mn.y+mx.y)/2
    ship_root.location.z += 0.65 - mn.z
    bpy.context.view_layer.update()
    ship_landing_gear(C_SHIP, M, 0, -420)
    boarding_stairs(C_SHIP, M, 0, -420)
    bpy.context.view_layer.update()
    log("SHIP", [(o.name, [round(v,1) for v in o.dimensions]) for o in ship_parts])

    # ---------------------------------------------------------------- skyline K015
    log("K015 SKYLINE")
    k15 = import_k015_towers(C_BG)
    bg = []
    def bg_emit(name, color):
        m = bpy.data.materials.new(name); m.use_nodes = True
        nt = m.node_tree; nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        em = nt.nodes.new('ShaderNodeEmission')
        em.inputs['Color'].default_value = (*color, 1)
        em.inputs['Strength'].default_value = 1.0
        nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
        return m
    bg_sil = [
        bg_emit("BG_Distant_Tower_A", (0.016, 0.024, 0.038)),
        bg_emit("BG_Distant_Tower_B", (0.022, 0.032, 0.050)),
        bg_emit("BG_Distant_Tower_C", (0.010, 0.016, 0.028)),
    ]
    bg_tex_cache = {}
    def bg_tower_mat(src_mat):
        """Original 1K K015 texture, re-used as a dim emission silhouette."""
        if not src_mat:
            return bg_sil[0]
        if src_mat.name in bg_tex_cache:
            return bg_tex_cache[src_mat.name]
        img = None
        if src_mat.use_nodes:
            for n in src_mat.node_tree.nodes:
                if n.type == 'TEX_IMAGE' and n.image:
                    img = n.image; break
        m = bpy.data.materials.new(f"BG_SIL_{src_mat.name}")
        m.use_nodes = True
        nt = m.node_tree; nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        em = nt.nodes.new('ShaderNodeEmission')
        em.inputs['Strength'].default_value = 1.0
        if img:
            tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img
            mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
            mix.inputs[0].default_value = 1.0
            mix.inputs[6].default_value = (0.18, 0.24, 0.36, 1)
            nt.links.new(tex.outputs['Color'], mix.inputs[7])
            nt.links.new(mix.outputs[2], em.inputs['Color'])
        else:
            em.inputs['Color'].default_value = (0.012, 0.018, 0.030, 1)
        nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
        bg_tex_cache[src_mat.name] = m
        return m
    bg_window = emission_mat("BG_Distant_Window", (1.0, 0.58, 0.28), 1.4, (0.01, 0.01, 0.015))
    # Distant silhouette ring; native 500-691 m, unit-corrected from the 1:100
    # K015 kit.  Each tower gets a 300 m background platform and low massing so
    # the base never reads as a floating monolith, and the 1K textures are not
    # relied on at 1.3 km.
    bg_spec = [
        ('K015_002_NW', 'Tower_002', -1300, 1000, 18),
        ('K015_006_NE', 'Tower_006', 1200, 1150, -22),
        ('K015_009_E',  'Tower_009', 1300, 250, -8),
        ('K015_010_N',  'Tower_010', 150, 1300, 5),
    ]
    rng = random.Random(902)
    for ti, (name, key, x, y, rot) in enumerate(bg_spec):
        src = k15.get(key)
        if not src: continue
        ob = clone(src, name, C_BG, 1.0)
        z = terrain_h(x, y) + 1.0
        ob.location = (x, y, z)
        ob.rotation_euler = (0, 0, math.radians(rot))
        for slot in ob.material_slots:
            slot.material = bg_tower_mat(slot.material)
        # background platform / distant city base
        box(f"{name}_CityBase", (300, 300, 34), (x, y, z-17.0),
            mats['wall'], coll=C_BG, bevel=0.1, uv=False)
        for i in range(18):
            bx = x + rng.uniform(-245, 245)
            by = y + rng.uniform(-245, 245)
            if abs(bx-x) < 120 and abs(by-y) < 120:
                continue
            bw = rng.uniform(24, 72); bd = rng.uniform(24, 72)
            bh = rng.uniform(26, 135)
            box(f"{name}_Block{i}", (bw, bd, bh), (bx, by, z + bh/2),
                bg_sil[(ti+i) % len(bg_sil)], coll=C_BG, uv=False)
            if i % 3 == 0:
                box(f"{name}_BlockWin{i}", (bw*0.62, 0.35, 0.22),
                    (bx, by - bd/2 - 0.25, z + bh*0.63), bg_window, coll=C_BG, uv=False)
        sphere(f"{name}_Beacon", 0.9, (x, y, z + ob.dimensions.z + 1.5),
               M['red'], segs=10, rings=6, coll=C_BG)
        bg.append(dict(name=name, x=x, y=y, z=round(z,1), h=round(ob.dimensions.z,1),
                       tris=tri_count(ob)))
        log("BG", name, "h", round(ob.dimensions.z,1), "tris", tri_count(ob))

    # ---------------------------------------------------------------- CityStreets street life
    log("CITYSTREETS")
    CS_SPECS = [
        ('KB3D_CTS_Tree_A_Main', (-230, -355, 0.12), 24, 1.0),
        ('KB3D_CTS_Tree_A_Main', (-100, -350, 0.12), -12, 1.0),
        ('KB3D_CTS_Tree_A_Main', (180, -350, 0.12), 8, 1.0),
        ('KB3D_CTS_Tree_A_Main', (300, -360, 0.12), 60, 1.0),
        ('KB3D_CTS_Tree_A_Main', (-520, 80, 0.12), 12, 1.0),
        ('KB3D_CTS_Tree_A_Main', (520, 80, 0.12), -18, 1.0),
        ('KB3D_CTS_Tree_A_Main', (-300, 230, 0.12), 30, 1.0),
        ('KB3D_CTS_Tree_A_Main', (300, 230, 0.12), -10, 1.0),
        ('KB3D_CTS_Tree_A_Main', (-450, 80, 0.12), 18, 1.0),
        ('KB3D_CTS_Tree_A_Main', (-380, 80, 0.12), -22, 1.0),
        ('KB3D_CTS_Tree_A_Main', (380, 80, 0.12), 12, 1.0),
        ('KB3D_CTS_Tree_A_Main', (450, 80, 0.12), -16, 1.0),
        ('KB3D_CTS_Tree_A_Main', (-200, 310, 0.12), 42, 1.0),
        ('KB3D_CTS_Tree_A_Main', (200, 310, 0.12), -32, 1.0),
        ('KB3D_CTS_Tree_A_Main', (225, -220, 0.12), 12, 1.0),
        ('KB3D_CTS_BldgMD_E_Kiosk', (-80, -340, 0.12), 8, 1.0),
        ('KB3D_CTS_BldgMD_L_BenchA', (-112, -360, 0.12), 90, 1.0),
        ('KB3D_CTS_BldgMD_L_BenchA', (-170, -519, 0.12), 0, 1.0),
        ('KB3D_CTS_BldgMD_L_BenchA', (-120, -519, 0.12), 0, 1.0),
        ('KB3D_CTS_BldgMD_E_Kiosk', (-95, -532, 0.12), 10, 1.0),
        ('KB3D_CTS_BldgMD_E_Billboard', (205, -350, 0.12), -8, 1.0),
        ('KB3D_CTS_BldgMD_F_Lamp', (230, -345, 0.12), 0, 1.0),
        ('KB3D_CTS_Trailer_C_Main', (-210, -365, 0.12), -18, 1.0),
        ('KB3D_CTS_BldgLG_A_Dumpster', (-250, -340, 0.12), 70, 1.0),
    ]
    with bpy.data.libraries.load(CITYSTREETS_BLEND, link=False) as (src, dst):
        dst.objects = list(dict.fromkeys(n for n, _, _, _ in CS_SPECS if n in src.objects))
    cs_objs = [o for o in dst.objects if o and o.type == 'MESH']
    for o in cs_objs:
        if o.parent:
            mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
        for c in list(o.users_collection): c.objects.unlink(o)
        C_PROPS.objects.link(o)
    used = set()
    for name, loc, rot, s in CS_SPECS:
        o = next((x for x in cs_objs if x.name == name), None)
        if not o: continue
        if name in used:
            o = o.copy(); o.data = o.data.copy(); C_PROPS.objects.link(o)
        used.add(name)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        bb = [Vector(c) for c in o.bound_box]
        mn = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
        mx = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
        ctr = Vector(((mn.x+mx.x)/2, (mn.y+mx.y)/2, mn.z))
        o.data.transform(Matrix.Translation(-ctr))
        o.hide_render = False; o.hide_set(False)
        o.location = loc; o.rotation_euler = (0,0,math.radians(rot)); o.scale = (s,s,s)
        log("CSPROP", name, [round(v,2) for v in o.dimensions])

    # ---------------------------------------------------------------- lighting / atmosphere
    log("LIGHTING")
    try:
        world_image_sky(sc, SKY_HDR, strength=0.30, rot_z=196)
        # keep the sky readable but not clipped to white; the physical sun does
        # the key work, the HDRI supplies the cool sky fill.
        for n in sc.world.node_tree.nodes:
            if n.type == 'BACKGROUND' and n.inputs['Strength'].default_value > 0.5:
                n.inputs['Strength'].default_value = 0.38
    except Exception as e:
        log("world fail", e)
        w = bpy.data.worlds.new("Sky"); sc.world = w; w.use_nodes = True
        w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.12,0.18,0.28,1)
        w.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
    # physical low sun, ~7.5 deg, from the south-west
    sun = make_light("Sun_Key", 'SUN', (-1100, -520, 180), 9.0,
                     (1.0, 0.58, 0.30), coll=C_LIGHT, angle=math.radians(0.55))
    point_at(sun, (0, 120, 0))
    # fill is sky/HDRI; only a restrained cool rim + practical pools are added
    for nm, loc, tgt, power, color, size in [
        ("Sky_Fill", (-300, -900, 420), (0, 100, 60), 5000, (0.40, 0.60, 1.0), (700, 300)),
        ("City_Rim", (650, 800, 380), (0, 350, 250), 9000, (0.45, 0.65, 1.0), (520, 220)),
        ("City_Fill", (750, -300, 300), (0, 150, 140), 22000, (0.55, 0.72, 1.0), (500, 280)),
        ("West_Fill", (-800, -250, 260), (-250, 120, 120), 11000, (0.48, 0.65, 1.0), (420, 240)),
        ("HeroA_Fill", (-80, -500, 220), (-290, 0, 120), 9000, (0.55, 0.70, 1.0), (200, 160)),
        ("Terminal_Fill", (-90, -540, 22), (-145, -445, 12), 2800, (0.60, 0.78, 1.0), (38, 12)),
        ("Pad_Key", (-10, -470, 34), (0, -420, 0), 4200, (1.0, 0.74, 0.48), (46, 28)),
        ("Pad_Fill", (0, -540, 30), (0, -420, 3), 5000, (1.0, 0.74, 0.48), (50, 24)),
        ("Walkway_Fill", (-55, -455, 10), (-58, -430, 4), 1200, (1.0, 0.70, 0.45), (30, 7)),
        ("Tank_Fill", (-330, -510, 20), (-320, -470, 8), 1500, (0.55, 0.72, 1.0), (36, 18)),
        ("T2_Interior", (-145, -445, 13), (-145, -445, 4), 5000, (1.0, 0.66, 0.36), (42, 32)),
        ("T2_Front", (-120, -520, 18), (-140, -445, 10), 2600, (1.0, 0.72, 0.45), (50, 14)),
    ]:
        lo = make_light(nm, 'AREA', loc, power, color, size=size, coll=C_LIGHT)
        point_at(lo, tgt)
    # pad floods (physical spots)
    for i, (x, y) in enumerate([(-38, -452), (38, -452), (-38, -388), (38, -388)]):
        ld = bpy.data.lights.new(f"PadFlood_{i}", 'SPOT')
        ld.energy = 2200; ld.color = (1.0, 0.74, 0.46)
        ld.spot_size = math.radians(58); ld.spot_blend = 0.55; ld.shadow_soft_size = 0.6
        lo = bpy.data.objects.new(f"PadFlood_{i}", ld); lo.location = (x, y, 26.0)
        point_at(lo, (x*0.3, y*0.4, 0)); link(lo, C_LIGHT)
    # terminal entrance practicals
    for i, y in enumerate((-440, -430, -420)):
        ld = bpy.data.lights.new(f"T2_Entrance_{i}", 'AREA')
        ld.energy = 2400; ld.color = (1.0, 0.70, 0.42)
        ld.shape = 'RECTANGLE'; ld.size = 12; ld.size_y = 1.2
        lo = bpy.data.objects.new(f"T2_Entrance_{i}", ld)
        lo.location = (-88.5, y, 7.2); lo.rotation_euler = (0, math.radians(90), 0)
        link(lo, C_LIGHT)

    # NOTE: a World Output Volume was tested in Blender 5.3 and suppressed the
    # HDRI surface entirely (black sky).  Atmosphere is therefore a finite
    # volume object, not a world volume.  The low density is deliberate.
    w = sc.world
    nt = w.node_tree
    out = next((n for n in nt.nodes if n.type == 'OUTPUT_WORLD'), None)
    atmo_me = bpy.data.meshes.new("Atmosphere_Finite")
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(3600, 3600, 1000), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(0, 0, 400), verts=bm.verts)
    bm.to_mesh(atmo_me); bm.free()
    atmo = bpy.data.objects.new("Atmosphere_Finite", atmo_me); link(atmo, C_LIGHT)
    am = bpy.data.materials.new("Atmosphere_Finite_Volume"); am.use_nodes = True
    ant = am.node_tree; ant.nodes.clear()
    aout = ant.nodes.new('ShaderNodeOutputMaterial')
    av = ant.nodes.new('ShaderNodeVolumePrincipled')
    av.inputs['Color'].default_value = (0.34, 0.47, 0.66, 1)
    av.inputs['Density'].default_value = 0.00008
    av.inputs['Anisotropy'].default_value = 0.38
    ant.links.new(av.outputs['Volume'], aout.inputs['Volume'])
    atmo.data.materials.append(am)

    # ---------------------------------------------------------------- render settings
    sc.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    try:
        prefs.compute_device_type = 'METAL'; prefs.get_devices()
        for d in prefs.devices: d.use = (d.type == 'METAL')
        sc.cycles.device = 'GPU'
    except Exception as e:
        log("GPU", e)
    sc.cycles.samples = 160
    sc.cycles.use_denoising = True
    try: sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    except Exception: pass
    sc.cycles.max_bounces = 8
    sc.cycles.diffuse_bounces = 4
    sc.cycles.glossy_bounces = 4
    sc.cycles.transmission_bounces = 4
    sc.cycles.volume_bounces = 2
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.adaptive_threshold = 0.012
    sc.render.resolution_x = 1920; sc.render.resolution_y = 1200
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'AgX'
    try: sc.view_settings.look = 'AgX - Medium High Contrast'
    except Exception: pass
    sc.view_settings.exposure = 0.45
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGB'
    sc.render.image_settings.compression = 15
    sc.render.use_persistent_data = True
    sc.render.threads_mode = 'AUTO'

    # compositor: subtle fog glow + vignette only.  No mist pass: a render-layer
    # mist mix was tested and it flattened the whole frame to grey.
    tree = bpy.data.node_groups.new("NautilusV2Comp", 'CompositorNodeTree')
    sc.compositing_node_group = tree
    sc.use_nodes = True
    rl = tree.nodes.new('CompositorNodeRLayers'); rl.location = (-700, 0)
    gl = tree.nodes.new('CompositorNodeGlare'); gl.location = (-420, 120)
    gl.inputs['Type'].default_value = 'Fog Glow'; gl.inputs['Quality'].default_value = 'High'
    gl.inputs['Threshold'].default_value = 1.55; gl.inputs['Strength'].default_value = 0.14
    gl.inputs['Size'].default_value = 0.62
    tree.links.new(rl.outputs['Image'], gl.inputs['Image'])
    ell = tree.nodes.new('CompositorNodeEllipseMask'); ell.location = (-160, -320)
    ell.inputs['Size'].default_value = (1.06, 1.06)
    blur = tree.nodes.new('CompositorNodeBlur'); blur.location = (60, -320)
    blur.inputs['Size'].default_value = (240, 240)
    tree.links.new(ell.outputs['Mask'], blur.inputs['Image'])
    mixv = tree.nodes.new('ShaderNodeMix'); mixv.data_type = 'RGBA'; mixv.blend_type = 'MULTIPLY'
    mixv.location = (260, 0); mixv.inputs[0].default_value = 0.12
    tree.links.new(gl.outputs['Image'], mixv.inputs[6])
    tree.links.new(blur.outputs['Image'], mixv.inputs[7])
    tree.interface.new_socket(name="Image", in_out='OUTPUT', socket_type='NodeSocketColor')
    comp = tree.nodes.new('NodeGroupOutput'); comp.location = (480, 0)
    tree.links.new(mixv.outputs[2], comp.inputs[0])
    # The compositor mist/multiply stack was also verified to crush the frame in
    # Blender 5.3; ship the raw AgX render and grade in post instead.
    sc.render.use_compositing = False

    # ---------------------------------------------------------------- cameras
    def camera(name, loc, target, lens=35, fstop=8.0, focus=None):
        cd = bpy.data.cameras.new(name); ob = bpy.data.objects.new(name, cd); link(ob, C_CAM)
        ob.location = loc; cd.lens = lens; cd.clip_start = 0.12; cd.clip_end = 16000
        point_at(ob, target)
        if fstop:
            cd.dof.use_dof = True; cd.dof.aperture_fstop = fstop
            cd.dof.focus_distance = (Vector(target)-Vector(loc)).length if focus is None else focus
        return ob
    cam_wide = camera("Cam_Wide", (-100, -595, 4.0), (-50, -350, 45), 24, 8.0)
    cam_termwide = camera("Cam_TermWide", (-170, -575, 4.8), (-100, -430, 38), 35, 8.0)
    cam_pad = camera("Cam_Pad", (-45, -520, 3.0), (4, -420, 6.5), 50, 7.1)
    cam_aerial = camera("Cam_Aerial", (-800, -1100, 600), (0, 80, 110), 35, 11.0)
    cam_aerial_low = camera("Cam_AerialLow", (-600, -950, 480), (-30, 80, 160), 35, 11.0)
    cam_detail = camera("Cam_Detail", (-110, -560, 4.0), (-145, -485, 8), 45, 6.3)
    cam_hero = camera("Cam_Hero", (245, -270, 2.2), (245, -160, 110), 35, 8.0)
    sc.camera = cam_wide

    # ---------------------------------------------------------------- save / report
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
    log("SAVED", BLEND)
    total = 0; per = {}
    for o in bpy.context.scene.objects:
        if o.type == 'MESH' and not o.hide_render:
            n = tri_count(o); total += n
            key = o.users_collection[0].name if o.users_collection else '?'
            per[key] = per.get(key, 0) + n
    log("SCENE TRIS", total)
    log("TRIS BY COLL", per)
    # placement audit: deck buildings must not intersect terrain, and the
    # primary masses must not overlap one another.
    def bbox_of(name):
        ob = bpy.data.objects.get(name)
        if not ob: return None
        b = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
        return (Vector((min(v.x for v in b), min(v.y for v in b), min(v.z for v in b))),
                Vector((max(v.x for v in b), max(v.y for v in b), max(v.z for v in b))))
    buildings = [d['obj'] for d in heroes + mids + lows]
    issues = []
    for nm in buildings:
        bb = bbox_of(nm)
        if not bb: continue
        if abs(bb[0].x) < 600 and abs(bb[0].y) < 600 and bb[0].z < -0.12:
            issues.append(f"TERRAIN {nm} minz={bb[0].z:.2f}")
    for i in range(len(buildings)):
        for j in range(i+1, len(buildings)):
            a = bbox_of(buildings[i]); b = bbox_of(buildings[j])
            if not a or not b: continue
            ox = min(a[1].x,b[1].x) - max(a[0].x,b[0].x)
            oy = min(a[1].y,b[1].y) - max(a[0].y,b[0].y)
            oz = min(a[1].z,b[1].z) - max(a[0].z,b[0].z)
            if ox > 0.2 and oy > 0.2 and oz > 0.2:
                issues.append(f"OVERLAP {buildings[i]} / {buildings[j]} dx={ox:.1f} dy={oy:.1f}")
    for nm in [d['obj'] for d in heroes]:
        cnt = len([o for o in bpy.context.scene.objects if o.name == nm and o.type == 'MESH'])
        if cnt != 1:
            issues.append(f"HERO_COUNT {nm} = {cnt}")
    log("AUDIT", "OK" if not issues else issues)
    for s in issues:
        log("AUDIT_ISSUE", s)
    sb = [o.matrix_world @ Vector(c) for o in ship_parts for c in o.bound_box]
    smn = Vector((min(v.x for v in sb), min(v.y for v in sb), min(v.z for v in sb)))
    smx = Vector((max(v.x for v in sb), max(v.y for v in sb), max(v.z for v in sb)))
    report = dict(heroes=heroes, mids=mids, lows=lows, background=bg,
                  total_tris=total, by_collection=per, audit=issues,
                  stacking='none; each hero is one native mesh at scale 1.0',
                  terminal=dict(name='CommunityCentre', x=-145, y=-445,
                                w=103.3, d=86.7, h=26.8,
                                tris=sum(tri_count(o) for o in term_objs),
                                note='1.03M-tri authored subset of the 1.37M source (shell + interior)'),
                  ship=dict(name='A-30', length=round(smx.x-smn.x, 2),
                            span=round(smx.y-smn.y, 2), height=round(smx.z-smn.z, 2),
                            tris=sum(tri_count(o) for o in ship_parts)))
    with open(f"{ROOT}/build_report.json", "w") as f:
        json.dump(report, f, indent=1)

if __name__ == '__main__':
    build()
