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

def get_cjk_font():
    for f in bpy.data.fonts:
        if 'PingFang' in f.name or 'Heiti' in f.name:
            return f
    for path in ('/System/Library/Fonts/PingFang.ttc',
                 '/System/Library/Fonts/STHeiti Medium.ttc'):
        try:
            if os.path.exists(path):
                return bpy.data.fonts.load(path)
        except Exception:
            pass
    return get_font()

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
    # macro-scale terrain colour variation: breaks the repeating single texture
    # on the outer ring without changing geometry.
    try:
        nt = M_TER.node_tree
        b = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if b and b.inputs['Base Color'].is_linked:
            src = b.inputs['Base Color'].links[0].from_socket
            tc = nt.nodes.new('ShaderNodeTexCoord'); tc.location = (-1100, -100)
            noise = nt.nodes.new('ShaderNodeTexNoise'); noise.location = (-900, -100)
            noise.inputs['Scale'].default_value = 0.0045
            noise.inputs['Detail'].default_value = 6.0
            noise.inputs['Roughness'].default_value = 0.62
            ramp = nt.nodes.new('ShaderNodeValToRGB'); ramp.location = (-700, -100)
            ramp.color_ramp.elements[0].position = 0.25
            ramp.color_ramp.elements[0].color = (0.40, 0.36, 0.31, 1)
            ramp.color_ramp.elements[1].position = 0.82
            ramp.color_ramp.elements[1].color = (0.98, 0.94, 0.86, 1)
            mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
            mix.inputs[0].default_value = 1.0; mix.location = (-420, 160)
            nt.links.new(tc.outputs['Object'], noise.inputs['Vector'])
            nt.links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
            nt.links.new(ramp.outputs['Color'], mix.inputs[6])
            nt.links.new(src, mix.inputs[7])
            nt.links.new(mix.outputs[2], b.inputs['Base Color'])
    except Exception as e:
        print("terrain variation failed", e)
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
    M['timber'] = solid_mat("V2_Timber", (0.17, 0.10, 0.055), 0.82, 0.0)
    M['fabric_red'] = solid_mat("V2_Fabric_Red", (0.42, 0.025, 0.018), 0.82, 0.0)
    M['fabric_teal'] = solid_mat("V2_Fabric_Teal", (0.018, 0.20, 0.20), 0.82, 0.0)
    M['fabric_yellow'] = solid_mat("V2_Fabric_Yellow", (0.48, 0.30, 0.015), 0.82, 0.0)
    M['shrub'] = solid_mat("V2_Shrub", (0.018, 0.055, 0.025), 0.85, 0.0)
    M['sign_warm'] = emission_mat("V2_Sign_Warm", (1.0, 0.42, 0.10), 3.2, (0.02, 0.01, 0.005))
    M['sign_cyan'] = emission_mat("V2_Sign_Cyan", (0.08, 0.68, 1.0), 3.2, (0.005, 0.015, 0.02))
    M['sign_red'] = emission_mat("V2_Sign_Red", (1.0, 0.035, 0.018), 3.4, (0.02, 0.002, 0.001))
    M['sign_green'] = emission_mat("V2_Sign_Green", (0.15, 1.0, 0.32), 2.5, (0.005, 0.02, 0.008))
    M['sign_white'] = emission_mat("V2_Sign_White", (0.85, 0.92, 1.0), 2.4, (0.01, 0.012, 0.015))
    M['shop_glow'] = emission_mat("V2_Shop_Glow", (1.0, 0.52, 0.22), 2.2, (0.02, 0.015, 0.01))
    M['glass'] = L.pbr_material("V2_Port_Glass", None, None, None, None, glass=True)
    M['t2_glass'] = L.pbr_material("V2_T2_Glass", None, None, None, None, glass=True)
    t2b = next((n for n in M['t2_glass'].node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if t2b:
        t2b.inputs['Base Color'].default_value = (0.72, 0.80, 0.80, 1)
        t2b.inputs['Metallic'].default_value = 0.0
        t2b.inputs['Roughness'].default_value = 0.035
        t2b.inputs['Transmission Weight'].default_value = 0.82
        t2b.inputs['IOR'].default_value = 1.45
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
    # keep all native module prototypes hidden; the district only places single
    # modules at scale 1.0, never a stack or a stretched facade.
    log("IMPORT K038")
    k38 = import_modules(f"{K038_DIR}/FBX格式/Kitbash3d_NeoTokyo2-Native.FBX", 'K38',
                         re.compile(r'^Desirefx\.me_(Large[A-Z])_'),
                         C_MODS, mat_k038)
    log("IMPORT K046")
    k46 = import_modules(f"{K046_DIR}/KB3D_HeavyMetal-Native.fbx", 'K46',
                         re.compile(r'^KB3D_HEM_(BldgLG_[A-Z]|BldgMD_[A-Z]|BldgSM_[A-Z])_'),
                         C_MODS, mat_k046)
    log("IMPORT K039")
    k39 = import_modules("/tmp/kb3d_fbx/asset_1.fbx", 'K39',
                         re.compile(r'^(?:Desirefx\.me_|Desirefx_me_)?(Bldg(?:LG|MD|SM)_[A-Z])_'),
                         C_MODS, mat_k039)

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

    # ---------------------------------------------------------------- district kitbash helpers
    FABRIC = [M['fabric_red'], M['fabric_teal'], M['fabric_yellow']]
    SIGNMATS = [M['sign_warm'], M['sign_cyan'], M['sign_red'], M['sign_green'], M['sign_white']]

    def add_shopfront(ob, name, side, idx=0, text=None, sign_mat=None, awn=True):
        bb = world_bbox(ob)
        w = bb[1].x - bb[0].x; d = bb[1].y - bb[0].y
        if side in ('E','W'):
            face = bb[1].x if side == 'E' else bb[0].x
            nx = 1.0 if side == 'E' else -1.0
            cy = (bb[0].y + bb[1].y) * 0.5
            width = d
            def at(off, z): return (face + nx*off, cy, z)
            def sz(a,b,c): return (a, b, c)
            text_rot = (math.radians(90), 0, math.radians(90 if side == 'E' else -90))
        else:
            face = bb[1].y if side == 'N' else bb[0].y
            ny = 1.0 if side == 'N' else -1.0
            cx = (bb[0].x + bb[1].x) * 0.5
            width = w
            def at(off, z): return (cx, face + ny*off, z)
            def sz(a,b,c): return (b, a, c)
            text_rot = (math.radians(90), 0, math.radians(0 if side == 'S' else 180))
        gw = min(width*0.72, 16.0)
        # dark glazing with warm shop light behind a narrow top band
        box(f"{name}_ShopGlass", sz(0.10, gw, 2.5), at(0.045, 1.85), M['glass'], coll=C_CITY, bevel=0.01)
        box(f"{name}_ShopGlow", sz(0.10, gw*0.92, 0.30), at(0.10, 3.05), M['shop_glow'], coll=C_CITY, uv=False)
        for j in range(5):
            u = -gw*0.42 + j*(gw*0.84/4)
            off = (0.0, u) if side in ('E','W') else (u, 0.0)
            if side in ('E','W'):
                box(f"{name}_Mull{j}", (0.14, 0.10, 2.6), (face+nx*0.10, cy+u, 1.85), M['dark'], coll=C_CITY, uv=False)
            else:
                box(f"{name}_Mull{j}", (0.10, 0.14, 2.6), (cx+u, face+ny*0.10, 1.85), M['dark'], coll=C_CITY, uv=False)
        # door
        box(f"{name}_Door", sz(0.18, 1.7, 2.4), at(0.12, 1.6), M['dark'], coll=C_CITY, bevel=0.01)
        box(f"{name}_DoorGlass", sz(0.10, 1.35, 2.1), at(0.22, 1.6), M['glass'], coll=C_CITY, uv=False)
        if awn:
            fabric = FABRIC[idx % 3]
            box(f"{name}_Awning", sz(1.7, gw+0.9, 0.12), at(0.95, 4.35), fabric, coll=C_CITY, bevel=0.01)
            box(f"{name}_AwnLip", sz(0.10, gw+0.9, 0.18), at(1.78, 4.35), M['dark'], coll=C_CITY, uv=False)
            for j in range(3):
                u = -gw*0.35 + j*(gw*0.70/2)
                xx, yy = (face+nx*1.55, cy+u) if side in ('E','W') else (cx+u, face+ny*1.55)
                sphere(f"{name}_Bulb{j}", 0.10, (xx, yy, 4.05), M['sign_warm'], segs=8, rings=5, coll=C_CITY)
        # sign board above awning
        sign_w = min(gw*0.55, 8.0)
        sign_mat = sign_mat or SIGNMATS[idx % len(SIGNMATS)]
        box(f"{name}_SignBoard", sz(0.18, sign_w, 1.0), at(0.18, 5.55), M['dark'], coll=C_CITY, bevel=0.01)
        box(f"{name}_SignFace", sz(0.06, sign_w*0.94, 0.84), at(0.30, 5.55), sign_mat, coll=C_CITY, uv=False)
        if text:
            tx, ty, tz = at(0.38, 5.42)
            text_mesh(f"{name}_SignText", text, 0.42, (tx, ty, tz), M['white'],
                      rot=text_rot, font=get_font(), coll=C_CITY, extrude=0.004, spacing=0.96)
        # a vertical blade sign on every other block
        if idx % 2 == 0:
            if side in ('E','W'):
                bx, by = face+nx*0.72, cy - gw*0.42
                box(f"{name}_Blade", (0.22, 0.65, 2.4), (bx, by, 3.8), sign_mat, coll=C_CITY, uv=False)
            else:
                bx, by = cx - gw*0.42, face+ny*0.72
                box(f"{name}_Blade", (0.65, 0.22, 2.4), (bx, by, 3.8), sign_mat, coll=C_CITY, uv=False)
        # street clutter, 1 in 3 blocks
        if idx % 3 == 0:
            if side in ('E','W'):
                cx2, cy2 = face+nx*0.9, cy - gw*0.46
            else:
                cx2, cy2 = cx - gw*0.46, face+ny*0.9
            box(f"{name}_Crate", (1.1, 0.8, 0.75), (cx2, cy2, 0.58), M['timber'], coll=C_CITY, bevel=0.03)
            cyl(f"{name}_Barrel", 0.35, 0.8, (cx2+1.2, cy2+0.4, 0.52), M['container_blue'], coll=C_CITY, verts=12)

    def add_block(name, key, x, y, rot, kind='mid', front='E', label=None, idx=0, roof=True):
        ob = clone(mods[key], name, C_CITY, 1.0)
        place_ground(ob, x, y, 0.16, rot, C_CITY)
        bb = world_bbox(ob)
        w = bb[1].x - bb[0].x; d = bb[1].y - bb[0].y; h = bb[1].z - bb[0].z
        box(f"{name}_Pad", (w+2.5, d+2.5, 0.16), (x, y, 0.08), M['concrete'], coll=C_CITY, bevel=0.02, uv=False)
        add_shopfront(ob, name, front, idx=idx, text=label, awn=(kind != 'tall'))
        if roof:
            if h > 65:
                k34_place('AntennaTower_MetalDark_2', f"{name}_Antenna",
                          (x+w*0.24, y+d*0.18, h+0.18), 0, 0.8, C_CITY)
                k34_place('AirHandlerLG_PlasticWhite', f"{name}_AC",
                          (x-w*0.25, y-d*0.14, h+0.18), 0, 0.75, C_CITY)
            elif h > 18:
                k34_place('AirHandlerMD_MetalLight_2', f"{name}_AC",
                          (x+w*0.22, y+d*0.18, h+0.18), 0, 0.8, C_CITY)
                if idx % 2 == 0:
                    k34_place('WaterTowerTall_MetalDark', f"{name}_Water",
                              (x-w*0.25, y-d*0.18, h+0.18), 0, 0.55, C_CITY)
        # facade service pipes / cable trays
        if idx % 3 == 0:
            px = bb[1].x - 0.7; py = bb[0].y + 1.0
            cyl(f"{name}_Downpipe", 0.08, min(h*0.7, 45.0), (px, py, min(h*0.35, 22.0)+0.2),
                M['steel'], coll=C_CITY, verts=8)
        # no full-roof emissive slab: it reads as a floating plane from below.
        log("BLOCK", name, key, "h", round(h,1), "dims", [round(v,1) for v in (w,d)], "tris", tri_count(ob))
        return dict(name=name, obj=ob.name, x=x, y=y, h=round(h,2), w=round(w,2), d=round(d,2),
                    tris=tri_count(ob), scale=list(ob.scale), kind=kind, asset_key=key)

    def sidewalk_rect(name, x0, x1, y0, y1, coll=C_GROUND):
        w = x1-x0; d = y1-y0
        box(name, (w, d, 0.14), ((x0+x1)/2, (y0+y1)/2, 0.07), M['plaza'], coll=coll, bevel=0.015, uv=False)
        if w > d:
            for y in (y0+0.12, y1-0.12):
                box(f"{name}_Curb{int(y)}", (w, 0.24, 0.20), ((x0+x1)/2, y, 0.10), M['white'], coll=coll, uv=False)
        else:
            for x in (x0+0.12, x1-0.12):
                box(f"{name}_Curb{int(x)}", (0.24, d, 0.20), (x, (y0+y1)/2, 0.10), M['white'], coll=coll, uv=False)

    def street_lamp(name, x, y, arm=1.0, light=False, coll=C_GROUND):
        cyl(f"{name}_Pole", 0.10, 8.6, (x, y, 4.3), M['dark'], coll=coll, verts=10)
        box(f"{name}_Base", (0.55, 0.55, 0.35), (x, y, 0.18), M['dark'], coll=coll, bevel=0.03)
        box(f"{name}_Arm", (2.2, 0.12, 0.12), (x+arm*1.0, y, 8.5), M['dark'], coll=coll, uv=False)
        box(f"{name}_Head", (0.85, 0.38, 0.14), (x+arm*1.95, y, 8.38), M['sign_warm'], coll=coll, bevel=0.02, uv=False)
        if light:
            ld = bpy.data.lights.new(f"{name}_L", 'POINT')
            ld.energy = 110.0; ld.color = (1.0, 0.62, 0.32); ld.shadow_soft_size = 0.45
            lo = bpy.data.objects.new(f"{name}_L", ld); lo.location = (x+arm*1.95, y, 8.3)
            link(lo, C_LIGHT)

    def vehicle(name, x, y, rot=0, kind='car', paint=None):
        R = Matrix.Rotation(math.radians(rot), 3, 'Z')
        paint = paint or M['container_tan']
        def wloc(dx, dy, dz): 
            v = R @ Vector((dx, dy, dz)); return (x+v.x, y+v.y, dz)
        def wbox(n, sx, sy, sz, dx, dy, dz, mat, bevel=0.02):
            return box(n, (sx, sy, sz), wloc(dx,dy,dz), mat, rot=(0,0,math.radians(rot)), coll=C_PORT, bevel=bevel)
        if kind == 'bus':
            L, W, H = 11.8, 2.5, 3.2
            wbox(f"{name}_Body", L, W, H-0.6, 0, 0, H/2+0.1, paint)
            wbox(f"{name}_Roof", L*0.94, W*0.92, 0.22, 0, 0, H+0.12, M['white_panel'])
            for i in range(6):
                dx = -L/2 + 1.2 + i*(L-2.4)/5
                for sy in (-1,1):
                    wbox(f"{name}_Win{i}_{sy}", 1.3, 0.06, 0.85, dx, sy*(W/2+0.02), 2.2, M['glass'], 0.005)
            for sx in (-1,1):
                for sy in (-1,1):
                    cyl(f"{name}_Wheel{sx}{sy}", 0.45, 0.28, wloc(sx*L*0.32, sy*1.05, 0.48),
                        M['dark'], rot=(math.radians(90),0,math.radians(rot)), coll=C_PORT, verts=12)
        elif kind == 'truck':
            L, W, H = 7.0, 2.35, 2.6
            wbox(f"{name}_Chassis", L, W, 0.9, 0, 0, 0.95, M['dark'])
            wbox(f"{name}_Cab", 2.2, W*0.92, 2.1, L/2-1.1, 0, 2.0, paint, 0.05)
            wbox(f"{name}_CabGlass", 0.08, W*0.74, 0.75, L/2-0.01, 0, 2.45, M['glass'], 0.005)
            wbox(f"{name}_Cargo", L*0.6, W*0.94, 2.1, -L*0.14, 0, 2.15, M['corrugated'], 0.03)
            for sx in (-1,1):
                for sy in (-1,1):
                    cyl(f"{name}_Wheel{sx}{sy}", 0.42, 0.28, wloc(sx*L*0.30, sy*0.98, 0.46),
                        M['dark'], rot=(math.radians(90),0,math.radians(rot)), coll=C_PORT, verts=12)
        else:
            L, W, H = (4.6, 1.9, 1.45) if kind == 'car' else (5.4, 2.05, 2.15)
            wbox(f"{name}_Body", L, W, 0.62, 0, 0, 0.72, paint)
            wbox(f"{name}_Cabin", L*0.52, W*0.88, 0.62 if kind=='car' else 0.9, -L*0.06, 0, 1.25 if kind=='car' else 1.55, paint, 0.05)
            for sy in (-1,1):
                wbox(f"{name}_SideWin{sy}", L*0.35, 0.06, 0.42, -L*0.05, sy*(W*0.44+0.02), 1.42 if kind=='car' else 1.7, M['glass'], 0.005)
            wbox(f"{name}_Windshield", 0.06, W*0.70, 0.42, L*0.24, 0, 1.42 if kind=='car' else 1.7, M['glass'], 0.005)
            for sx in (-1,1):
                for sy in (-1,1):
                    cyl(f"{name}_Wheel{sx}{sy}", 0.32, 0.22, wloc(sx*L*0.31, sy*(W*0.47), 0.38),
                        M['dark'], rot=(math.radians(90),0,math.radians(rot)), coll=C_PORT, verts=12)
            for sy in (-1,1):
                wbox(f"{name}_Head{sy}", 0.10, 0.28, 0.18, L*0.50, sy*W*0.33, 0.78, M['sign_warm'], 0.005)
                wbox(f"{name}_Tail{sy}", 0.08, 0.24, 0.16, -L*0.50, sy*W*0.33, 0.78, M['sign_red'], 0.005)
            if kind == 'taxi':
                wbox(f"{name}_TaxiSign", 0.8, 0.35, 0.25, -0.1, 0, 1.92, M['sign_warm'], 0.01)

    def queue_barrier(name, p1, p2, h=1.0, mat=None):
        mat = mat or M['sign_red']
        for i,p in enumerate((p1,p2)):
            cyl(f"{name}_Post{i}", 0.06, h, (p[0],p[1],h/2+0.16), M['steel'], coll=C_PORT, verts=8)
            cyl(f"{name}_Foot{i}", 0.22, 0.08, (p[0],p[1],0.19), M['dark'], coll=C_PORT, verts=12)
        curve(f"{name}_Belt", [(p1[0],p1[1],h+0.10),( (p1[0]+p2[0])/2, (p1[1]+p2[1])/2, h-0.03), (p2[0],p2[1],h+0.10)],
              0.035, mat, coll=C_PORT, res=2)

    def stall(name, x, y, rot=0, fabric=None, label='MARKET'):
        R = Matrix.Rotation(math.radians(rot), 3, 'Z')
        fabric = fabric or M['fabric_red']
        def wloc(dx,dy,dz):
            v=R@Vector((dx,dy,dz)); return (x+v.x,y+v.y,dz)
        box(f"{name}_Counter", (3.6, 1.1, 0.85), wloc(0,0,0.60), M['timber'], rot=(0,0,math.radians(rot)), coll=C_PORT, bevel=0.03)
        for sx in (-1,1):
            for sy in (-1,1):
                cyl(f"{name}_Pole{sx}{sy}", 0.06, 2.8, wloc(sx*1.6, sy*1.3, 1.55), M['steel'], coll=C_PORT, verts=8)
        box(f"{name}_Canopy", (4.2, 3.3, 0.14), wloc(0,0,2.95), fabric, rot=(0,0,math.radians(rot)), coll=C_PORT, bevel=0.02)
        box(f"{name}_Sign", (2.0, 0.08, 0.55), wloc(0,-1.7,2.55), M['sign_warm'], rot=(0,0,math.radians(rot)), coll=C_PORT, uv=False)
        text_mesh(f"{name}_Label", label, 0.35, wloc(0,-1.78,2.48), M['white'],
                  rot=(math.radians(90),0,math.radians(rot)), font=get_font(), coll=C_PORT, extrude=0.003)
        for i in range(3):
            box(f"{name}_Crate{i}", (0.65,0.55,0.5), wloc(-1.1+i*0.8, 0.2, 1.2), M['container_tan'] if i%2 else M['container_red'], rot=(0,0,math.radians(rot)), coll=C_PORT, bevel=0.02)
        sphere(f"{name}_Bulb", 0.10, wloc(0,0,2.75), M['sign_warm'], segs=8, rings=5, coll=C_PORT)

    def steam_vent(name, x, y, scale=1.0):
        cyl(f"{name}_Grate", 0.65, 0.18, (x,y,0.22), M['dark'], coll=C_PORT, verts=14)
        sm = bpy.data.materials.get("V2_Steam_Volume")
        if not sm:
            sm = bpy.data.materials.new("V2_Steam_Volume"); sm.use_nodes = True
            nt = sm.node_tree; nt.nodes.clear()
            out = nt.nodes.new('ShaderNodeOutputMaterial')
            vol = nt.nodes.new('ShaderNodeVolumePrincipled')
            vol.inputs['Color'].default_value = (0.72,0.76,0.82,1)
            vol.inputs['Density'].default_value = 0.010
            vol.inputs['Anisotropy'].default_value = 0.25
            nt.links.new(vol.outputs['Volume'], out.inputs['Volume'])
        cone(f"{name}_Plume", 1.1*scale, 0.35*scale, 5.2*scale, (x,y,2.8*scale),
             sm, rot=(0,0,0), verts=20, coll=C_PORT)
        cyl(f"{name}_Pipe", 0.22, 1.2, (x+0.7,y,0.75), M['steel'], coll=C_PORT, verts=10)

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
    mids.append(add_single('Mid_K032_E', mods['K32_BldgLG_E'], -100, 520, 18, C_BLDG, M, k34_place))
    mids.append(add_single('Mid_K032_D', mods['K32_BldgLG_D'], 500, 440, -90, C_BLDG, M, k34_place))
    mids.append(add_single('Mid_K032_H', mods['K32_BldgLG_H'], 150, 480, 90, C_BLDG, M, k34_place))
    mids.append(add_single('Mid_K032_F', mods['K32_BldgLG_F'], -280, -360, 12, C_BLDG, M, k34_place))

    # ---------------------------------------------------------------- dense port district
    log("DENSE DISTRICT")
    district = []
    # Central canyon: low shopfront wall at x ±35 and native mid-rise behind.
    KEEP = set(
        [f'Canyon_W{i}' for i in range(1,15)] +
        [f'Canyon_E{i}' for i in range(1,15)] +
        ['Gate_W1','Gate_W2','Gate_E1','Gate_E2'] +
        ['West_1','West_2','West_3','East_1','East_2','East_3','East_4'] +
        ['North_1','North_2','North_3','Port_W1','Port_E1','Port_E2']
    )
    for args in [
        ('Canyon_W1', 'K32_BldgLG_G', -72, -235, 90, 'mid', 'E', 'NOODLE'),
        ('Canyon_W2', 'K32_BldgM_A', -75, -160, 0, 'mid', 'E', 'PARTS'),
        ('Canyon_W3', 'K32_BldgLG_G', -80, -80, 0, 'mid', 'E', 'FUEL'),
        ('Canyon_W4', 'K32_BldgM_A', -75, -5, 90, 'mid', 'E', 'CAFE'),
        ('Canyon_W5', 'K32_BldgLG_G', -85, 55, 0, 'mid', 'E', 'HOTEL'),
        ('Canyon_W6', 'K39_BldgLG_E', -35, -235, 0, 'low', 'E', 'TEA'),
        ('Canyon_W7', 'K39_BldgLG_F', -33, -160, 0, 'low', 'E', 'GEAR'),
        ('Canyon_W8', 'K39_BldgLG_E', -35, -80, 0, 'low', 'E', 'FOOD'),
        ('Canyon_W9', 'K39_BldgLG_E', -35, -5, 0, 'low', 'E', 'OPEN'),
        ('Canyon_W10', 'K39_BldgLG_F', -35, 70, 0, 'low', 'E', 'RAMEN'),
        ('Canyon_E1', 'K32_BldgLG_F', 72, -235, 90, 'mid', 'W', 'RAMEN'),
        ('Canyon_E2', 'K32_BldgM_D', 75, -160, 0, 'mid', 'W', 'TRADE'),
        ('Canyon_E3', 'K32_BldgLG_F', 80, -80, 0, 'mid', 'W', 'MARKET'),
        ('Canyon_E4', 'K32_BldgM_D', 75, -5, 0, 'mid', 'W', 'REPAIR'),
        ('Canyon_E5', 'K32_BldgLG_F', 80, 55, 0, 'mid', 'W', 'BAR'),
        ('Canyon_E6', 'K39_BldgLG_E', 35, -235, 0, 'low', 'W', 'CAFE'),
        ('Canyon_E7', 'K39_BldgLG_F', 33, -160, 0, 'low', 'W', 'DUTY'),
        ('Canyon_E8', 'K39_BldgLG_E', 35, -80, 0, 'low', 'W', 'SUSHI'),
        ('Canyon_E9', 'K39_BldgLG_E', 35, -5, 0, 'low', 'W', 'HOTEL'),
        ('Canyon_E10', 'K39_BldgLG_F', 35, 70, 0, 'low', 'W', 'T2'),
        # port gate row: frames the apron-to-city canyon and fills the gap
        # between the terminal and the CrossPort street.
        ('Gate_W1', 'K32_BldgM_A', -150, -340, 0, 'mid', 'S', 'PORT 07'),
        ('Gate_W2', 'K32_BldgM_D', -50, -340, 0, 'mid', 'S', 'MARKET'),
        ('Gate_E1', 'K32_BldgM_A', 60, -340, 0, 'mid', 'S', 'CAFE'),
        ('Gate_E2', 'K32_BldgM_D', 160, -340, 0, 'mid', 'S', 'FREIGHT'),
        # infill shop row: continuous street wall in the gaps between big blocks
        ('Canyon_W11', 'K39_BldgLG_E', -35, -190, 0, 'low', 'E', 'TEA'),
        ('Canyon_W12', 'K39_BldgLG_F', -35, -120, 0, 'low', 'E', 'PARTS'),
        ('Canyon_W13', 'K39_BldgLG_E', -35, -45, 0, 'low', 'E', 'CAFE'),
        ('Canyon_W14', 'K39_BldgLG_F', -35, 25, 0, 'low', 'E', 'OPEN'),
        ('Canyon_E11', 'K39_BldgLG_E', 35, -190, 0, 'low', 'W', 'GEAR'),
        ('Canyon_E12', 'K39_BldgLG_F', 35, -120, 0, 'low', 'W', 'NOODLE'),
        ('Canyon_E13', 'K39_BldgLG_E', 35, -45, 0, 'low', 'W', 'DUTY'),
        ('Canyon_E14', 'K39_BldgLG_F', 35, 25, 0, 'low', 'W', 'BAR'),
        # low-rise street walls along the outer avenues and boulevard
        ('WestAve_L1', 'K39_BldgLG_E', -395, -160, 0, 'low', 'E', 'SHOP'),
        ('WestAve_L2', 'K39_BldgLG_F', -395, -10, 0, 'low', 'E', 'REPAIR'),
        ('WestAve_L3', 'K39_BldgLG_E', -395, 50, 0, 'low', 'E', 'CAFE'),
        ('WestAve_L4', 'K39_BldgLG_F', -395, 190, 0, 'low', 'E', 'PARTS'),
        ('EastAve_L1', 'K39_BldgLG_E', 395, -160, 0, 'low', 'W', 'SHOP'),
        ('EastAve_L2', 'K39_BldgLG_F', 395, -10, 0, 'low', 'W', 'DUTY'),
        ('EastAve_L3', 'K39_BldgLG_E', 395, 50, 0, 'low', 'W', 'CAFE'),
        ('EastAve_L4', 'K39_BldgLG_F', 395, 290, 0, 'low', 'W', 'PARTS'),
        ('Blvd_L1', 'K39_BldgLG_E', -400, 165, 0, 'low', 'S', 'MARKET'),
        ('Blvd_L2', 'K39_BldgLG_F', -300, 165, 0, 'low', 'S', 'BAR'),
        ('Blvd_L3', 'K39_BldgLG_E', -150, 165, 0, 'low', 'S', 'CAFE'),
        ('Blvd_L4', 'K39_BldgLG_F', 60, 165, 0, 'low', 'S', 'SHOP'),
        ('Blvd_L5', 'K39_BldgLG_E', 160, 165, 0, 'low', 'S', 'NOODLE'),
        ('Blvd_L6', 'K39_BldgLG_F', 300, 165, 0, 'low', 'S', 'DUTY'),
        ('North_L1', 'K39_BldgLG_E', -500, 300, 0, 'low', 'S', 'DEPOT'),
        ('North_L2', 'K39_BldgLG_F', -300, 300, 0, 'low', 'S', 'SHOP'),
        ('North_L3', 'K39_BldgLG_E', -150, 300, 0, 'low', 'S', 'CAFE'),
        ('North_L4', 'K39_BldgLG_F', 100, 300, 0, 'low', 'S', 'BAR'),
        ('North_L5', 'K39_BldgLG_E', 250, 300, 0, 'low', 'S', 'REPAIR'),
        ('North_L6', 'K39_BldgLG_F', 400, 300, 0, 'low', 'S', 'MARKET'),
        # second-row mid-rise: fills the blocks behind the street walls
        ('West_M1', 'K32_BldgM_C', -450, -250, 0, 'mid', 'E', 'DEPOT'),
        ('West_M2', 'K32_BldgS_A', -450, -100, 0, 'mid', 'E', 'SHOP'),
        ('West_M3', 'K32_BldgM_E', -450, 40, 0, 'mid', 'E', 'CAFE'),
        ('West_M4', 'K32_BldgM_C', -450, 250, 0, 'mid', 'E', 'HOTEL'),
        ('East_M1', 'K32_BldgM_C', 440, -250, 0, 'mid', 'W', 'YARD'),
        ('East_M2', 'K32_BldgS_A', 450, -100, 0, 'mid', 'W', 'SHOP'),
        ('East_M3', 'K32_BldgM_E', 450, 40, 0, 'mid', 'W', 'CAFE'),
        ('East_M4', 'K32_BldgM_C', 450, 300, 0, 'mid', 'W', 'HOTEL'),
        ('CW_M1', 'K32_BldgM_A', -220, -250, 0, 'mid', 'E', 'MARKET'),
        ('CW_M2', 'K32_BldgS_A', -200, -60, 0, 'mid', 'E', 'SHOP'),
        ('CW_M3', 'K32_BldgM_B', -250, 20, 0, 'mid', 'E', 'BAR'),
        ('CE_M1', 'K32_BldgM_C', 150, -250, 0, 'mid', 'W', 'CAFE'),
        ('CE_M2', 'K32_BldgS_A', 160, -60, 0, 'mid', 'W', 'SHOP'),
        ('CE_M3', 'K32_BldgM_B', 160, 20, 0, 'mid', 'W', 'BAR'),
        # West avenue / service district
        ('West_1', 'K32_BldgLG_F', -500, -230, 0, 'mid', 'E', 'PORT 07'),
        ('West_2', 'K32_BldgM_A', -500, -150, 0, 'mid', 'E', 'CARGO'),
        ('West_3', 'K32_BldgM_A', -500, -70, 0, 'mid', 'E', 'DOCK'),
        ('West_4', 'K32_BldgM_D', -500, 180, 90, 'mid', 'E', 'HOSTEL'),
        ('West_5', 'K39_BldgLG_E', -395, -230, 0, 'low', 'E', 'FUEL'),
        ('West_6', 'K39_BldgLG_F', -395, -70, 0, 'low', 'E', 'SUPPLY'),
        # East avenue / service district
        ('East_1', 'K32_BldgLG_H', 500, -230, 0, 'mid', 'W', 'YARD'),
        ('East_2', 'K32_BldgM_D', 500, -150, 0, 'mid', 'W', 'FREIGHT'),
        ('East_3', 'K32_BldgLG_H', 500, -70, 0, 'mid', 'W', 'DEPOT'),
        ('East_4', 'K38_LargeD', 555, 280, 0, 'tall', 'W', 'TOWER'),
        ('East_5', 'K39_BldgLG_E', 395, -230, 0, 'low', 'W', 'YARD'),
        ('East_6', 'K39_BldgLG_F', 395, -70, 0, 'low', 'W', 'PARTS'),
        # North district / skyline depth
        ('North_1', 'K32_BldgM_A', -250, 200, 0, 'mid', 'S', 'MARKET'),
        ('North_2', 'K32_BldgM_B', -200, 270, 0, 'mid', 'S', 'LOFTS'),
        ('North_3', 'K32_BldgLG_G', 100, 200, 90, 'mid', 'S', 'HALL'),
        ('North_4', 'K32_BldgM_D', 300, 270, 0, 'mid', 'S', 'TRADE'),
        ('North_5', 'K32_BldgLG_F', -140, 390, 0, 'mid', 'S', 'WORKS'),
        # Port-edge warehouses
        ('Port_W1', 'K32_BldgM_A', -500, -420, 0, 'mid', 'E', 'WAREHOUSE'),
        ('Port_E1', 'K32_BldgM_B', 240, -420, 0, 'mid', 'W', 'CARGO'),
        ('Port_E2', 'K32_BldgM_D', 280, -350, 0, 'mid', 'W', 'FREIGHT'),
    ]:
        name, key, x, y, rot, kind, front, label = args
        if name not in KEEP:
            continue
        if key in mods:
            district.append(add_block(name, key, x, y, rot, kind, front, label, idx=len(district)))
    lows = district

    # port gate arch over the apron-to-city avenue
    for sx, x in ((-1, -25.0), (1, 36.0)):
        cyl(f"PortGate_Col{sx}", 0.38, 9.0, (x, -332, 4.5), M['steel'], coll=C_CITY, verts=12)
        box(f"PortGate_Foot{sx}", (1.6,1.6,0.45), (x, -332, 0.23), M['dark'], coll=C_CITY, bevel=0.04)
    box("PortGate_Beam", (63, 0.55, 0.8), (5.5, -332, 8.8), M['steel'], coll=C_CITY, bevel=0.04)
    box("PortGate_Sign", (22, 0.30, 2.0), (5.5, -332.5, 8.0), M['dark'], coll=C_CITY, bevel=0.03)
    box("PortGate_Light", (22, 0.14, 0.12), (5.5, -332.7, 9.05), M['sign_warm'], coll=C_CITY, uv=False)
    text_mesh("PortGate_Text", "PORT 07  //  NAUTILUS REACH", 0.78, (5.5, -332.8, 7.92),
              M['white'], rot=(math.radians(90),0,0), font=get_font(),
              coll=C_CITY, extrude=0.005, spacing=0.94)
    for i in range(8):
        x = -22 + i*7.0
        box(f"PortGate_Lamp{i}", (0.60, 0.25, 0.15), (x, -332.4, 9.0), M['sign_warm'], coll=C_CITY, uv=False)

    # sidewalks, curbs, streetlights, cables and planters
    log("STREET GRID")
    sidewalk_rect('Sidewalk_CenterW', -40, -13, -289, 102)
    sidewalk_rect('Sidewalk_CenterE', 13, 40, -289, 102)
    sidewalk_rect('Sidewalk_WestW', -400, -374, -289, 102)
    sidewalk_rect('Sidewalk_WestE', -346, -320, -289, 102)
    sidewalk_rect('Sidewalk_EastW', 320, 346, -289, 102)
    sidewalk_rect('Sidewalk_EastE', 374, 400, -289, 102)
    sidewalk_rect('Sidewalk_BlvdS', -600, 600, 80, 102)
    sidewalk_rect('Sidewalk_BlvdN', -600, 600, 140, 162)
    sidewalk_rect('Sidewalk_NorthS', -600, 600, 295, 317)
    sidewalk_rect('Sidewalk_NorthN', -600, 600, 343, 365)
    # crosswalks
    for i in range(8):
        y = -300 + i*0.0
        stripe(f"Crosswalk_CenterS_{i}", -12+i*3.2, -300, -11.2+i*3.2, -290, 0.55, mats['white'], z=0.22, coll=C_GROUND)
        stripe(f"Crosswalk_CenterN_{i}", -12+i*3.2, 100, -11.2+i*3.2, 110, 0.55, mats['white'], z=0.22, coll=C_GROUND)
    for i in range(10):
        stripe(f"Crosswalk_West_{i}", -374, -240+i*3.2, -346, -239.2+i*3.2, 0.55, mats['white'], z=0.22, coll=C_GROUND)
        stripe(f"Crosswalk_East_{i}", 346, -240+i*3.2, 374, -239.2+i*3.2, 0.55, mats['white'], z=0.22, coll=C_GROUND)
    # canvass/lamps along the central canyon and the port gate
    for i, y in enumerate(range(-270, 100, 40)):
        street_lamp(f"CanyonLampW_{i}", -14.6, y, arm=1.0, light=(i % 2 == 0))
        street_lamp(f"CanyonLampE_{i}", 14.6, y, arm=-1.0, light=(i % 2 == 1))
    for i, y in enumerate((-372, -330)):
        street_lamp(f"GateLampW_{i}", -14.6, y, arm=1.0, light=True)
        street_lamp(f"GateLampE_{i}", 14.6, y, arm=-1.0, light=True)
    # cables between lamp posts
    for i, y in enumerate(range(-255, 95, 40)):
        curve(f"CanyonCableW_{i}", [(-14.6,y,7.9),(-14.6,y+20,7.15),(-14.6,y+40,7.9)], 0.018, M['dark'], coll=C_GROUND, res=2)
        curve(f"CanyonCableE_{i}", [(14.6,y,7.9),(14.6,y+20,7.15),(14.6,y+40,7.9)], 0.018, M['dark'], coll=C_GROUND, res=2)
    # planters + benches + bollards on the sidewalks
    for i, (x, y) in enumerate([(-22,-270),(-22,-205),(-22,-135),(-22,-45),(-22,25),(22,-250),(22,-180),(22,-50),(22,35)]):
        box(f"Planter_{i}", (2.4, 1.2, 0.65), (x, y, 0.47), M['timber'], coll=C_GROUND, bevel=0.03)
        sphere(f"PlanterShrub_{i}", 0.55, (x, y, 0.95), M['shrub'], segs=10, rings=6, coll=C_GROUND)
    for i, (x, y, rot) in enumerate([(-24,-250,0),(-24,-100,0),(24,-220,180),(24,-30,180)]):
        box(f"Bench_{i}_Seat", (2.2, 0.55, 0.10), (x, y, 0.65), M['timber'], rot=(0,0,math.radians(rot)), coll=C_GROUND, bevel=0.02)
        box(f"Bench_{i}_Back", (2.2, 0.10, 0.55), (x, y+0.25, 0.95), M['timber'], rot=(0,0,math.radians(rot)), coll=C_GROUND, bevel=0.02)
        for sx in (-0.8, 0.8):
            box(f"Bench_{i}_Leg{sx}", (0.10, 0.45, 0.55), (x+sx, y, 0.30), M['steel'], rot=(0,0,math.radians(rot)), coll=C_GROUND, uv=False)
    for i, (x, y) in enumerate([(-18,-280),(-18,-150),(-18,-20),(18,-260),(18,-120),(18,10)]):
        cyl(f"Bollard_{i}", 0.075, 0.85, (x, y, 0.58), M['steel'], coll=C_GROUND, verts=8)
        sphere(f"BollardCap_{i}", 0.09, (x, y, 1.02), M['sign_warm'], segs=8, rings=5, coll=C_GROUND)
    # market stalls along the canyon and at the terminal
    for i, (x, y, rot, label) in enumerate([(-23,-250,0,'MARKET'),(-23,-165,0,'TEA'),(-23,-85,0,'GEAR'),
                                             (23,-230,180,'FOOD'),(23,-150,180,'PARTS'),(-220,-535,0,'ARRIVALS'),
                                             (-22,-372,0,'MARKET'),(22,-372,180,'TEA')]):
        stall(f"Market_{i}", x, y, rot, FABRIC[i%3], label)
    # steam vents and service clutter
    for i, (x, y, s) in enumerate([(-22,-280,1.0),(22,-145,0.8),(70,-360,1.2)]):
        steam_vent(f"Steam_{i}", x, y, s)
    for i, (x, y, rot) in enumerate([(-24,-300,0),(-24,-195,0),(24,-270,180),(-250,-500,0)]):
        box(f"ServiceCrate_{i}", (1.6, 1.0, 1.0), (x, y, 0.66), M['timber'], rot=(0,0,math.radians(rot)), coll=C_GROUND, bevel=0.03)
        cyl(f"ServiceBarrel_{i}", 0.38, 0.9, (x+1.2, y, 0.62), M['container_blue'] if i%2 else M['container_red'], coll=C_GROUND, verts=12)
    # vehicles: taxis at T2, buses on the boulevard, cargo at the port
    vehicle('Taxi_A', -172, -520.5, 0, 'taxi', M['container_tan'])
    vehicle('Taxi_B', -158, -520.5, 0, 'taxi', M['container_tan'])
    vehicle('Taxi_C', -144, -520.5, 0, 'taxi', M['container_grey'])
    vehicle('Bus_A', -220, 120, 0, 'bus', M['container_blue'])
    vehicle('Bus_B', 240, 120, 0, 'bus', M['container_red'])
    vehicle('CargoTruck_A', 180, -470, 90, 'truck', M['container_grey'])
    vehicle('CargoTruck_B', -255, -440, 0, 'truck', M['container_red'])
    vehicle('UtilityVan', 34, -472, 0, 'van', M['white_panel'])
    for i, (x, y, paint) in enumerate([(-6,-200,M['container_red']),(-5,-120,M['container_blue']),
                                        (-7,-30,M['container_tan']),(6,30,M['container_grey'])]):
        vehicle(f'CanyonCar_{i}', x, y, 0, 'car', paint)
    # foreground apron life: masts, crates, a second baggage cart
    light_mast(C_PORT, M, C_LIGHT, 'ForeMastW', -62, -560, 20, 20)
    light_mast(C_PORT, M, C_LIGHT, 'ForeMastE', 62, -560, 200, 20)
    for nm, x, y, h in [('ForeMastW',-62,-560,20),('ForeMastE',62,-560,20)]:
        ld = bpy.data.lights.new(nm+'_L','POINT'); ld.energy=260; ld.color=(1.0,0.62,0.32); ld.shadow_soft_size=0.5
        lo = bpy.data.objects.new(nm+'_L',ld); lo.location=(x,y,h-1.0); link(lo,C_LIGHT)
    for i, (x,y,rot) in enumerate([(32,-558,8),(44,-552,-12),(-30,-565,4)]):
        box(f"ForeCrate_{i}", (1.6,1.1,1.0), (x,y,0.65), M['timber'], rot=(0,0,math.radians(rot)), coll=C_PORT, bevel=0.03)
        cyl(f"ForeBarrel_{i}", 0.38, 0.9, (x+1.4,y,0.60), M['container_blue'] if i%2 else M['container_red'], coll=C_PORT, verts=12)
    box("ForeCart2_Deck", (2.2,1.2,0.14), (-52,-556,0.72), M['steel'], coll=C_PORT, bevel=0.02)
    for sx in (-1,1):
        for sy in (-1,1):
            cyl(f"ForeCart2_Wheel{sx}{sy}", 0.22, 0.12, (-52+sx*0.8,-556+sy*0.52,0.40), M['dark'], rot=(math.radians(90),0,0), coll=C_PORT, verts=10)
    box("ForeCart2_Case", (1.2,0.9,0.7), (-52,-556,1.0), M['container_tan'], coll=C_PORT, bevel=0.03)

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
        M['t2_glass'], coll=C_PORT, bevel=0.01)
    for i in range(10):
        x = -158 + i*2.9
        box(f"T2_Landside_Mullion{i}", (0.16, 0.36, 7.5), (x, -507.35, 4.45),
            M['steel'], coll=C_PORT, bevel=0.008, uv=False)
    for i, x in enumerate((-154, -145, -136)):
        box(f"T2_Landside_Door{i}", (4.2, 0.16, 5.6), (x, -507.48, 3.2),
            M['t2_glass'], coll=C_PORT, bevel=0.008)
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
            M['t2_glass'], coll=C_PORT, bevel=0.01)
        for i in range(4):
            box(f"T2_Landside_SideMull{sx}_{i}", (0.20, 0.25, 5.3),
                (x, -504.0+i*2.0, 4.6), M['steel'], coll=C_PORT, uv=False)
    # interior: warm floor, columns, check-in counter, visible through t2 glass
    box("T2_InteriorFloor", (26, 10, 0.18), (-145, -501, 0.63), M['concrete'], coll=C_PORT, uv=False)
    box("T2_InteriorCeiling", (26, 10, 0.28), (-145, -501, 8.55), M['dark'], coll=C_PORT, uv=False)
    box("T2_InteriorGlow", (24.5, 0.10, 4.7), (-145, -505.6, 4.4), M['sign_warm'], coll=C_PORT, uv=False)
    box("T2_InteriorBackGlow", (23.5, 0.10, 5.2), (-145, -503.4, 4.5), M['sign_warm'], coll=C_PORT, uv=False)
    for i in range(3):
        box(f"T2_CeilingLight{i}", (20, 0.18, 0.12), (-145, -505.2+i*2.2, 8.35), M['sign_warm'], coll=C_PORT, uv=False)
    for i, x in enumerate((-155, -145, -135)):
        box(f"T2_InteriorCol{i}", (0.42, 0.42, 7.7), (x, -502.2, 4.45), M['steel'], coll=C_PORT, bevel=0.02)
    box("T2_CheckIn", (13.5, 1.2, 1.15), (-145, -503.2, 1.35), M['timber'], coll=C_PORT, bevel=0.04)
    box("T2_CheckInTop", (13.8, 1.4, 0.10), (-145, -503.2, 1.95), M['white'], coll=C_PORT, bevel=0.01)
    # arrivals board over the doors
    box("T2_ArrivalsBoard", (12.0, 0.28, 2.25), (-145, -507.85, 7.35), M['dark'], coll=C_PORT, bevel=0.02)
    box("T2_ArrivalsFrame", (12.3, 0.14, 2.45), (-145, -507.72, 7.35), M['steel'], coll=C_PORT, bevel=0.01)
    text_mesh("T2_ArrivalsTitle", "ARRIVALS", 0.58, (-145, -508.05, 7.95),
              M['sign_white'], rot=(math.radians(90),0,0), font=get_font(),
              coll=C_PORT, extrude=0.004, spacing=0.96)
    text_mesh("T2_ArrivalsRow1", "GATE 07   ON TIME   T2", 0.30, (-145, -508.05, 7.30),
              M['white'], rot=(math.radians(90),0,0), font=get_font(),
              coll=C_PORT, extrude=0.003, spacing=0.92)
    text_mesh("T2_ArrivalsRow2", "GATE 08   BOARDING   NR 2045", 0.30, (-145, -508.05, 6.82),
              M['white'], rot=(math.radians(90),0,0), font=get_font(),
              coll=C_PORT, extrude=0.003, spacing=0.92)
    # door frames, handles, thresholds
    for i, x in enumerate((-154, -145, -136)):
        box(f"T2_DoorFrameL{i}", (0.18, 0.26, 5.7), (x-2.1, -507.58, 3.2), M['steel'], coll=C_PORT, uv=False)
        box(f"T2_DoorFrameR{i}", (0.18, 0.26, 5.7), (x+2.1, -507.58, 3.2), M['steel'], coll=C_PORT, uv=False)
        box(f"T2_DoorFrameT{i}", (4.35, 0.26, 0.16), (x, -507.58, 6.02), M['steel'], coll=C_PORT, uv=False)
        box(f"T2_DoorHandle{i}", (0.06, 0.20, 0.65), (x+0.45, -507.66, 3.2), M['sign_white'], coll=C_PORT, uv=False)
    for i in range(3):
        box(f"T2_DoorThreshold{i}", (4.4, 0.7, 0.07), (-154+i*9, -507.6, 0.58), M['steel'], coll=C_PORT, uv=False)
    # canopy truss + downlights
    for i in range(7):
        x = -159 + i*4.6
        box(f"T2_CanopyRib{i}", (0.24, 7.0, 0.24), (x, -510.0, 9.55), M['steel'], coll=C_PORT, uv=False)
        cyl(f"T2_CanopyDown{i}", 0.22, 0.04, (x, -508.7, 9.53), M['sign_warm'], coll=C_PORT, verts=12)
    box("T2_CanopyEdge", (36, 0.26, 0.30), (-145, -513.55, 9.60), M['steel'], coll=C_PORT, uv=False)
    # facade ribs / vents / cable tray on the side walls
    for sx, x in ((-1, -161.0), (1, -129.0)):
        for i in range(6):
            box(f"T2_SideRib{sx}_{i}", (0.22, 0.55, 8.2), (x, -505+i*1.7, 4.9), M['steel'], coll=C_PORT, bevel=0.01)
        box(f"T2_SideVent{sx}", (0.35, 3.2, 1.1), (x, -500.8, 6.5), M['dark'], coll=C_PORT, bevel=0.02)
        for i in range(4):
            box(f"T2_SideVentLouver{sx}_{i}", (0.4, 2.9, 0.10), (x, -500.8, 6.0+i*0.35), M['steel'], coll=C_PORT, uv=False)
        box(f"T2_SideTray{sx}", (0.45, 0.25, 5.6), (x, -497.8, 4.9), M['steel'], coll=C_PORT, uv=False)
    # queue barriers / benches / baggage at the doors
    for i, x0 in enumerate((-168, -188)):
        queue_barrier(f"T2_Queue{i}", (x0,-515.5), (x0+34,-515.5), 1.0, M['sign_red'])
    for i, x in enumerate((-180, -110)):
        box(f"T2_Baggage{i}_Deck", (2.2, 1.2, 0.14), (x, -512.5, 0.72), M['steel'], coll=C_PORT, bevel=0.02)
        for sx in (-1,1):
            for sy in (-1,1):
                cyl(f"T2_Baggage{i}_Wheel{sx}{sy}", 0.22, 0.12, (x+sx*0.8, -512.5+sy*0.52, 0.40),
                    M['dark'], rot=(math.radians(90),0,0), coll=C_PORT, verts=10)
        for j in range(3):
            box(f"T2_Baggage{i}_Case{j}", (0.62,0.48,0.40), (x-0.55+j*0.56, -512.5, 1.0),
                M['container_red'] if j==1 else M['container_blue'], coll=C_PORT, bevel=0.02)
    # taxi drop-off lane and bollards
    box("T2_TaxiLane", (86, 7.0, 0.035), (-145, -520.5, 0.15), M['asphalt'], coll=C_PORT, uv=False)
    box("T2_TaxiCurb", (86, 0.35, 0.14), (-145, -516.8, 0.20), M['white'], coll=C_PORT, uv=False)
    for i in range(7):
        x = -182 + i*12
        cyl(f"T2_TaxiBollard{i}", 0.08, 0.85, (x, -516.4, 0.58), M['steel'], coll=C_PORT, verts=8)
    # entrance area light, warm, under the canopy
    t2h = make_light("T2_Hall_Area", 'AREA', (-145, -513.0, 8.8), 6500,
                     (1.0, 0.72, 0.45), size=(24, 5), coll=C_LIGHT)
    point_at(t2h, (-145, -500, 5.0))
    t2i = make_light("T2_Interior_Area", 'AREA', (-145, -502.0, 7.6), 4200,
                     (1.0, 0.66, 0.38), size=(18, 7), coll=C_LIGHT)
    point_at(t2i, (-145, -500, 2.0))
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
    place_ground(p1, -118, -495.0, 0.62, 0, C_PORT)
    box("C2184_SouthBank_Frame", (10.6, 0.55, 4.4), (-118, -495.2, 2.8),
        M['dark'], coll=C_PORT, bevel=0.03)
    # K014 greebles on the terminal plinth + south utility wall
    for i, (key, x, z, rot, s) in enumerate([
        ('Greeble_E', -108, 3.1, 0, 1.1), ('Greeble_H', -126, 3.3, 0, 1.0),
        ('Greeble_D', -118, 1.7, 0, 1.2), ('Greeble_A', -95, 2.4, 0, 1.0),
        ('Greeble_I', -100, 2.0, 90, 1.0)]):
        k14_place(key, f"TermGreeb_{i}", (x, -496.2, z), rot, s, C_PORT)
    # canopy signage on the T2 roof edge
    # ---------------------------------------------------------------- port props
    log("PORT")
    control_tower(C_PORT, M, C_LIGHT)
    gantry(C_PORT, M, C_LIGHT, -420)
    tank_farm(C_PORT, M, C_LIGHT)
    container_yard(C_PORT, M)
    # satellite container yards and two rail gantry cranes: the outer deck is
    # working logistics space, not empty plaza.
    def add_yard(name, x0, y0, cols, rows, rot=0, step_x=13.0, step_y=3.0):
        pal = ['container_red','container_blue','container_tan','container_grey']
        for j in range(rows):
            for i in range(cols):
                container(C_PORT, M, f"{name}_{i}_{j}", (x0+i*step_x, y0+j*step_y), rot,
                          mat=M[pal[(i+j) % 4]], stack=(j % 3))
    add_yard('YardWest', -586, -250, 1, 12, 90, 13.0, 12.0)
    add_yard('YardEast', 586, -250, 1, 12, 90, 13.0, 12.0)
    add_yard('YardSouthW', -568, -540, 6, 3, 0, 13.0, 6.0)
    # simple authored gantry cranes over the west/east yards
    for cx, cy in [(-575,-185), (575,-185)]:
        for sx in (-1,1):
            for sy in (-1,1):
                box(f"Crane_{cx}_Leg{sx}{sy}", (1.2,1.2,28), (cx+sx*16, cy+sy*7, 14), M['steel'], coll=C_PORT, bevel=0.04)
            box(f"Crane_{cx}_Beam{sx}", (38,2.0,2.4), (cx, cy+sx*7, 28), M['white_panel'], coll=C_PORT, bevel=0.04)
        box(f"Crane_{cx}_Trolley", (5,4,2.2), (cx+4, cy, 29.5), M['dark'], coll=C_PORT, bevel=0.04)
        box(f"Crane_{cx}_Spreader", (5,2.2,1.2), (cx+4, cy, 18.0), M['orange'], coll=C_PORT, bevel=0.03)
        cyl(f"Crane_{cx}_Cable", 0.05, 10.0, (cx+4, cy, 23.7), M['dark'], coll=C_PORT, verts=6)
        for sx in (-1,1):
            box(f"Crane_{cx}_Rail{sx}", (44,0.5,0.25), (cx, cy+sx*7, 0.18), M['dark'], coll=C_PORT, uv=False)
    light_mast(C_PORT, M, C_LIGHT, "MastSW", -110, -470, 20, 28)
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

    # ---------------------------------------------------------------- brand scrub / unified palette / in-world signs
    log("BRAND SCRUB / DISTRICT PALETTE")
    BLACKLIST = ('ads', 'banner', 'signs_lights', 'screens', 'decals', 'logo', 'watermark')
    ad_dark = solid_mat("V2_InWorld_AdPanel", (0.035, 0.042, 0.052), 0.50, 0.30)
    ad_warm = emission_mat("V2_InWorld_AdWarm", (1.0, 0.45, 0.13), 1.8, (0.02, 0.012, 0.006))
    brand_replaced = []
    brand_faces_removed = 0
    for coll in (C_BLDG, C_CITY, C_PORT):
        for ob in list(coll.objects):
            if ob.type != 'MESH' or not ob.data.materials:
                continue
            bad_idx = {i for i, m in enumerate(ob.data.materials)
                       if m and any(k in m.name.lower() for k in BLACKLIST)}
            if not bad_idx:
                continue
            me = ob.data
            bm = bmesh.new(); bm.from_mesh(me)
            dead = [f for f in bm.faces if f.material_index in bad_idx]
            if dead:
                bmesh.ops.delete(bm, geom=dead, context='FACES')
                bm.to_mesh(me); bm.free()
                brand_faces_removed += len(dead)
                brand_replaced.append((ob.name, [ob.data.materials[i].name for i in bad_idx]))
                # keep the slots neutral but empty so the audit can still see
                for i in bad_idx:
                    ob.data.materials[i] = ad_dark
            else:
                bm.free()
    # final slot scrub: catches shared/empty slots that had no deletable faces
    for coll in (C_BLDG, C_CITY, C_PORT):
        for ob in list(coll.objects):
            if ob.type != 'MESH':
                continue
            for slot in ob.material_slots:
                if slot.material and any(k in slot.material.name.lower() for k in BLACKLIST):
                    slot.material = ad_dark
    log("BRAND_REPLACED", len(brand_replaced), "FACES", brand_faces_removed)
    # cool industrial palette for the district layer, heroes keep native materials
    tint_cache = {}
    TINT = (0.60, 0.67, 0.78)
    def tint_mat(m):
        if not m or m.name in tint_cache:
            return tint_cache.get(m.name)
        if m.name.startswith('V2_'):
            return m
        nm = m.copy(); nm.name = "V3_PAL_" + m.name
        try:
            nt = nm.node_tree
            b = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
            if b:
                if b.inputs['Base Color'].is_linked:
                    src = b.inputs['Base Color'].links[0].from_socket
                    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type='RGBA'; mix.blend_type='MULTIPLY'
                    mix.inputs[0].default_value = 1.0
                    mix.inputs[6].default_value = (*TINT, 1)
                    nt.links.new(src, mix.inputs[7])
                    nt.links.new(mix.outputs[2], b.inputs['Base Color'])
                else:
                    c = list(b.inputs['Base Color'].default_value)
                    b.inputs['Base Color'].default_value = (c[0]*TINT[0], c[1]*TINT[1], c[2]*TINT[2], c[3])
        except Exception:
            pass
        tint_cache[m.name] = nm
        return nm
    for d in district + mids:
        ob = bpy.data.objects.get(d.get('obj', ''))
        if not ob:
            continue
        for slot in ob.material_slots:
            if slot.material:
                slot.material = tint_mat(slot.material)

    def billboard(name, x, y, z, w, h, face, lines):
        if face in ('S', 'N'):
            box(f"{name}_Board", (w, 0.35, h), (x, y, z), ad_dark, coll=C_CITY, bevel=0.05)
            box(f"{name}_EdgeT", (w+0.4, 0.40, 0.10), (x, y-0.02, z+h/2), M['sign_cyan'], coll=C_CITY, uv=False)
            box(f"{name}_EdgeB", (w+0.4, 0.40, 0.10), (x, y-0.02, z-h/2), M['sign_cyan'], coll=C_CITY, uv=False)
            box(f"{name}_Frame", (w+0.5, 0.42, h+0.5), (x, y+ (0.08 if face=='S' else -0.08), z),
                M['steel'], coll=C_CITY, bevel=0.03)
            sy = y - 0.24 if face == 'S' else y + 0.24
            trot = (math.radians(90), 0, 0 if face == 'S' else math.radians(180))
            for i, (txt, size, mat) in enumerate(lines):
                font = get_cjk_font() if any(ord(c) > 127 for c in txt) else get_font()
                text_mesh(f"{name}_L{i}", txt, size, (x, sy, z + h*0.28 - i*size*1.25),
                          mat, rot=trot, font=font, coll=C_CITY, extrude=0.006, spacing=0.94)
        else:
            box(f"{name}_Board", (0.35, w, h), (x, y, z), ad_dark, coll=C_CITY, bevel=0.05)
            box(f"{name}_EdgeT", (0.40, w+0.4, 0.10), (x-0.02, y, z+h/2), M['sign_cyan'], coll=C_CITY, uv=False)
            box(f"{name}_EdgeB", (0.40, w+0.4, 0.10), (x-0.02, y, z-h/2), M['sign_cyan'], coll=C_CITY, uv=False)
            box(f"{name}_Frame", (0.42, w+0.5, h+0.5), (x + (0.08 if face=='E' else -0.08), y, z),
                M['steel'], coll=C_CITY, bevel=0.03)
            sx = x + 0.24 if face == 'E' else x - 0.24
            trot = (math.radians(90), 0, math.radians(90 if face == 'E' else -90))
            for i, (txt, size, mat) in enumerate(lines):
                font = get_cjk_font() if any(ord(c) > 127 for c in txt) else get_font()
                text_mesh(f"{name}_L{i}", txt, size, (sx, y, z + h*0.28 - i*size*1.25),
                          mat, rot=trot, font=font, coll=C_CITY, extrude=0.006, spacing=0.94)

    billboard('SignGateW', -50, -357.0, 18.5, 34, 8, 'S',
              [('NAUTILUS REACH', 2.55, M['sign_warm']),
               ('PORT 07 // BERTH 12', 1.35, M['sign_cyan']),
               ('夜航 港口', 1.10, M['white'])])
    billboard('SignGateE', 60, -357.0, 17.5, 32, 7.5, 'S',
              [('T2 // ARRIVALS', 2.35, M['sign_warm']),
               ('SHIP LINE 09', 1.30, M['sign_cyan']),
               ('NR 2045', 1.00, M['white'])])
    billboard('SignCanyonW', -44.7, -235, 24, 28, 8, 'E',
              [('NAUTILUS FREIGHT', 1.80, M['sign_cyan']),
               ('BERTH 07', 1.35, M['sign_warm']),
               ('货运 07', 1.10, M['white'])])
    billboard('SignCanyonE', 56.7, -80, 26, 26, 7, 'W',
              [('ORBITAL LINE', 1.80, M['sign_warm']),
               ('PORT 07', 1.30, M['sign_cyan']),
               ('夜航', 1.20, M['white'])])
    billboard('SignFuel', -476.7, -230, 18, 20, 6, 'E',
              [('FUEL DEPOT', 1.35, M['sign_red']),
               ('DANGER / NO ENTRY', 0.85, M['white']),
               ('禁止入内', 0.95, M['sign_red'])])
    billboard('SignEastLine', 467.7, -230, 20, 20, 6, 'W',
              [('SHIP LINE 09', 1.35, M['sign_cyan']),
               ('T2 CARGO', 1.15, M['sign_warm']),
               ('BERTH 12', 0.85, M['white'])])
    billboard('SignMarket', -250, 184.8, 18, 24, 6, 'S',
              [('NIGHT MARKET', 1.50, M['sign_warm']),
               ('PORT 07', 1.00, M['sign_cyan']),
               ('夜市 24H', 0.95, M['white'])])
    # south-facing T2 arrival pylon, readable from the pad
    for px in (-75, -65):
        cyl(f"T2PylonPost_{px}", 0.26, 6.0, (px, -460, 3.0), M['steel'], coll=C_PORT, verts=10)
    billboard('T2Pylon', -70, -460, 6.0, 10, 5.5, 'S',
              [('T2 // ARRIVALS', 1.25, M['sign_warm']),
               ('NAUTILUS REACH', 0.72, M['white']),
               ('BERTH 07', 0.55, M['sign_cyan'])])

    # vertical Chinese/English neon on the canyon shop wall
    for i, (x, y, side, txt, mat) in enumerate([
        (-29.7, -190, 'E', '夜航', M['sign_cyan']),
        (-29.7, -120, 'E', '货运', M['sign_warm']),
        (29.7, -190, 'W', '酒吧', M['sign_warm']),
        (29.7, -45, 'W', '夜市', M['sign_cyan'])]):
        font = get_cjk_font()
        box(f"NeonBlade_{i}", (0.18, 0.55, 4.2),
            (x, y, 10.0) if side == 'E' else (x, y, 10.0), mat, coll=C_CITY, uv=False)
        text_mesh(f"NeonBlade_{i}_T", txt, 0.62,
                  (x + (0.20 if side == 'E' else -0.20), y, 10.0),
                  M['white'], rot=(math.radians(90), 0, math.radians(90 if side == 'E' else -90)),
                  font=font, coll=C_CITY, extrude=0.004, spacing=1.0)
    # berth / warning boards at the port
    text_mesh("Berth07Sign", "BERTH 07   //   NR LINES", 0.55, (-202.5, -470, 2.8),
              M['sign_cyan'], rot=(math.radians(90),0,math.radians(-90)), font=get_font(),
              coll=C_PORT, extrude=0.004)
    text_mesh("DangerSign", "DANGER  //  NO ENTRY", 0.40, (-24.5, -331.0, 5.0),
              M['sign_red'], rot=(math.radians(90),0,0), font=get_font(),
              coll=C_CITY, extrude=0.004)
    text_mesh("DangerSignCn", "危险  禁止入内", 0.48, (-24.5, -331.0, 4.2),
              M['sign_red'], rot=(math.radians(90),0,0), font=get_cjk_font(),
              coll=C_CITY, extrude=0.004)

    # brand audit on visible building/terminal objects
    brand_left = []
    for coll in (C_BLDG, C_CITY, C_PORT):
        for ob in coll.objects:
            if ob.type != 'MESH':
                continue
            for slot in ob.material_slots:
                if slot.material and any(k in slot.material.name.lower() for k in BLACKLIST):
                    brand_left.append((ob.name, slot.material.name))
    log("BRAND_AUDIT", "OK" if not brand_left else brand_left)

    # ---------------------------------------------------------------- characters
    log("CHARACTERS")
    char_names = ['10_Idle2_Radio','12_Idle4_Crossedhands','17_Carrying1',
                  '26_Signal_Hold','9_Idle1','23_Sit2','27_Signal_Hold2',
                  '5_Walk4','18_Carrying2','31_Signal_Move4','3_Walk2',
                  '14_Idle6_Device','13_Idle5','11_Idle3','16_Scan','19_Carrying3',
                  '28_Signal_Move','29_Signal_Move2','30_Signal_Move3',
                  '32_Signal_Thumb','33_Signal_Launch1','4_Walk3','6_Run1','2_Walk1','7_Run2','8_Run3','25_Sit5','15_Idle7_Knee','23_Sit1','25_Sit6','23_Sit4']
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
        ('14_Idle6_Device', (-155, -499.5, 0.65), 4),
        ('13_Idle5', (-137, -499.5, 0.65), 176),
        ('11_Idle3', (-146, -516, 0.22), 0),
        ('16_Scan', (-122, -516, 0.22), 180),
        ('19_Carrying3', (-24, -245, 0.18), 18),
        ('28_Signal_Move', (-27, -190, 0.18), 200),
        ('29_Signal_Move2', (-22, -125, 0.18), 30),
        ('30_Signal_Move3', (-26, -55, 0.18), 170),
        ('32_Signal_Thumb', (24, -205, 0.18), 150),
        ('33_Signal_Launch1', (26, -135, 0.18), 20),
        ('4_Walk3', (23, -65, 0.18), 190),
        ('6_Run1', (-220, -538, 0.18), 80),
        ('2_Walk1', (20, -400, 0.20), 120),
        ('7_Run2', (30, -438, 0.20), 250),
        ('8_Run3', (-20, -345, 0.18), 10),
        ('25_Sit5', (20, -345, 0.18), 190),
        ('15_Idle7_Knee', (-30, -455, 0.18), 70),
        ('23_Sit1', (28, -448, 0.18), 250),
        ('25_Sit6', (-70, -550, 0.18), 150),
        ('23_Sit4', (10, -545, 0.18), 20),
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
    # Distant silhouette ring; native 500-691 m, unit-corrected from the 1:100
    # K015 kit.  Each tower gets a 600 m authored city base with single
    # K039/K032/K038/K046 modules around it: no flat massing boxes, no stacking.
    bg_spec = [
        ('K015_002_NW', 'Tower_002', -1200, 1000, 18, 0),
        ('K015_006_NE', 'Tower_006', 1200, 1100, -22, 1),
        ('K015_009_E',  'Tower_009', 1200, 250, -8, 2),
        ('K015_010_N',  'Tower_010', 150, 1200, 5, 3),
    ]
    bg_modules = [
        'K32_BldgM_B', 'K32_BldgS_A', 'K39_BldgLG_E',
        'K39_BldgLG_F', 'K39_BldgLG_E',
    ]
    rng = random.Random(902)
    for ti, (name, key, x, y, rot, variant) in enumerate(bg_spec):
        src = k15.get(key)
        if not src: continue
        ob = clone(src, name, C_BG, 1.0)
        z = terrain_h(x, y) + 1.0
        ob.location = (x, y, z)
        ob.rotation_euler = (0, 0, math.radians(rot))
        for slot in ob.material_slots:
            slot.material = bg_tower_mat(slot.material)
        # authored distant city base, 600 x 600 m
        box(f"{name}_CityBase", (600, 600, 34), (x, y, z-17.0),
            mats['plaza'], coll=C_BG, bevel=0.1, uv=False)
        for rx in (-1, 1):
            box(f"{name}_RoadX{rx}", (600, 12, 0.16),
                (x, y + rx*120, z+0.08), mats['asphalt'], coll=C_BG, uv=False)
        for ry in (-1, 1):
            box(f"{name}_RoadY{ry}", (12, 600, 0.16),
                (x + ry*120, y, z+0.08), mats['asphalt'], coll=C_BG, uv=False)
        for i in range(12):
            box(f"{name}_RoadDash{i}", (6, 0.5, 0.03),
                (x-270+i*49, y+120, z+0.19), M['white'], coll=C_BG, uv=False)
        # 6 native modules around the tower footprint
        offsets = [(190, 0, 90), (-190, 0, -90), (0, 200, 0), (0, -200, 180),
                   (175, 175, 45)]
        for mi, ((ox, oy, mr), mkey) in enumerate(zip(offsets, bg_modules[variant:] + bg_modules[:variant])):
            if mkey not in mods: continue
            bx, by = x+ox, y+oy
            bmod = clone(mods[mkey], f"{name}_Mod{mi}", C_BG, 1.0)
            place_ground(bmod, bx, by, z+0.25, mr, C_BG)
            bb = world_bbox(bmod)
            box(f"{name}_ModPad{mi}", (bb[1].x-bb[0].x+3, bb[1].y-bb[0].y+3, 0.25),
                (bx, by, z+0.16), mats['plaza'], coll=C_BG, uv=False)
        # a couple of authored background towers for silhouette scale
        if variant in (0, 2):
            bmod = clone(mods['K38_LargeD'], f"{name}_TowerD", C_BG, 1.0)
            place_ground(bmod, x+230, y-230, z+0.25, 20, C_BG)
        sphere(f"{name}_Beacon", 0.9, (x, y, z + ob.dimensions.z + 1.5),
               M['red'], segs=10, rings=6, coll=C_BG)
        bg.append(dict(name=name, x=x, y=y, z=round(z,1), h=round(ob.dimensions.z,1),
                       tris=tri_count(ob)))
        log("BG", name, "h", round(ob.dimensions.z,1), "tris", tri_count(ob))

    # ---------------------------------------------------------------- outer terrain / rocks / roads
    log("OUTER TERRAIN")
    AST = "/Users/apple/Documents/3D Models/Blender宇宙资产包场景源文件太空星球陨石黑洞星云模型建模600/ProjectFiles/Blends/10c - Asteroid_pack.blend"
    with bpy.data.libraries.load(AST, link=False) as (src, dst):
        dst.objects = [n for n in ['asteroid_04','asteroid_01','asteroid_03','asteroid_06','asteroid_02'] if n in src.objects]
    rocks = []
    for o in dst.objects:
        if not o or o.type != 'MESH': continue
        for c in list(o.users_collection): c.objects.unlink(o)
        C_BG.objects.link(o)
        if o.parent:
            mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
        bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        if o.name in ('asteroid_03','asteroid_06'):
            md = o.modifiers.new('rock_lod','DECIMATE'); md.decimate_type='COLLAPSE'; md.ratio=0.08
            bpy.ops.object.modifier_apply(modifier=md.name)
        bb = [Vector(c) for c in o.bound_box]
        mn = Vector((min(v.x for v in bb),min(v.y for v in bb),min(v.z for v in bb)))
        ctr = Vector(((mn.x+max(v.x for v in bb))/2,(mn.y+max(v.y for v in bb))/2,mn.z))
        o.data.transform(Matrix.Translation(-ctr)); o.location=(0,0,0)
        rocks.append(o)
    rock_spec = [
        ('Rock_A', 350, -780, 88, 18), ('Rock_B', -760, -860, 115, 200),
        ('Rock_C', 680, -680, 72, 75), ('Rock_D', -680, -680, 80, 300),
        ('Rock_E', 650, -880, 125, 40), ('Rock_F', -700, -880, 135, 220),
    ]
    for i, (nm, rx, ry, rs, rr) in enumerate(rock_spec):
        if i >= len(rocks): break
        ob = rocks[i]; ob.name = nm
        ob.scale = (rs, rs*0.8, rs*0.65)
        ob.rotation_euler = (0,0,math.radians(rr))
        bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.transform_apply(scale=True)
        z = terrain_h(rx, ry)
        place_ground(ob, rx, ry, z+0.3, rr, C_BG)
        log("ROCK", nm, [round(v,1) for v in ob.dimensions], tri_count(ob))

    def terrain_road(name, x0, y0, x1, y1, width=14.0):
        dx = x1-x0; dy = y1-y0; ln = math.hypot(dx,dy)
        n = max(1, int(ln/24))
        ang = math.atan2(dy,dx)
        for i in range(n):
            t0 = i/n; t1 = (i+1)/n
            ax = x0+dx*t0; ay = y0+dy*t0; bx = x0+dx*t1; by = y0+dy*t1
            mx = (ax+bx)/2; my = (ay+by)/2
            z = terrain_h(mx,my)
            seg = math.hypot(bx-ax,by-ay)+0.5
            box(f"{name}_{i}", (seg, width, 0.22), (mx,my,z+0.16),
                mats['asphalt'], rot=(0,0,ang), coll=C_BG, uv=False)
            if i % 2 == 0:
                box(f"{name}_Dash{i}", (3.0, 0.35, 0.04), (mx,my,z+0.29),
                    mats['white'], rot=(0,0,ang), coll=C_BG, uv=False)
    terrain_road('RingRoadS', -640, -660, 640, -660)
    terrain_road('RingRoadN', 640, 660, -640, 660)
    terrain_road('RingRoadW', -660, 640, -660, -640)
    terrain_road('RingRoadE', 660, -640, 660, 640)
    terrain_road('HillRoad_SW', -620, -620, -1120, -1050)
    terrain_road('HillRoad_NE', 620, 620, 1120, 1050)
    terrain_road('HillRoad_SE', 620, -620, 1120, -980)
    terrain_road('HillRoad_NW', -620, 620, -1120, 980)
    terrain_road('OuterHighwayS', -820, -840, 820, -840, width=18)
    terrain_road('OuterHighwayN', 820, 840, -820, 840, width=18)
    terrain_road('ForeRoad', -900, -1000, 900, -1000, width=22)
    for i, x in enumerate(range(-760, 801, 80)):
        for y in (-840, 840):
            z = terrain_h(x, y)
            box(f"OuterHighwayLight{i}_{y}", (0.7,0.25,0.15), (x, y+10, z+1.0), M['sign_warm'], coll=C_BG, uv=False)
    # distant road lights
    for i, (lx, ly) in enumerate([(-640,-660),(-320,-660),(0,-660),(320,-660),(640,-660),
                                   (-640,660),(-320,660),(0,660),(320,660),(640,660),
                                   (-660,-320),(-660,0),(-660,320),(660,-320),(660,0),(660,320)]):
        lz = terrain_h(lx,ly)
        cyl(f"RingLight_{i}_Pole", 0.14, 8.0, (lx,ly,lz+4.0), M['dark'], coll=C_BG, verts=8)
        box(f"RingLight_{i}_Head", (0.7,0.3,0.16), (lx+0.6,ly,lz+8.0), M['sign_warm'], coll=C_BG, uv=False)

    # ---------------------------------------------------------------- industrial horizon / deck edge
    log("INDUSTRIAL HORIZON")
    def industrial_cluster(name, cx, cy, rot=0, scale=1.0):
        z = terrain_h(cx, cy)
        R = Matrix.Rotation(math.radians(rot), 3, 'Z')
        def wl(dx,dy,dz):
            v=R@Vector((dx,dy,dz)); return (cx+v.x, cy+v.y, z+dz)
        box(f"{name}_Pad", (180*scale,180*scale,4), (cx,cy,z-2), M['concrete'], coll=C_BG, bevel=0.1, uv=False)
        # distillation columns
        for i,(dx,dy,r,h) in enumerate([(-35,10,4.5,72),(-10,-20,5.5,58),(20,15,3.8,84)]):
            x,y,_=wl(dx*scale,dy*scale,2)
            cyl(f"{name}_Col{i}", r*scale, h*scale, (x,y,z+2+h*scale/2), M['steel'], coll=C_BG, verts=20, smooth=True)
            cyl(f"{name}_ColCap{i}", r*1.2*scale, 1.2, (x,y,z+2+h*scale), M['dark'], coll=C_BG, verts=20)
            for k in range(4):
                cyl(f"{name}_ColBand{i}_{k}", r*1.04*scale, 0.35, (x,y,z+8+k*h*scale*0.2), M['rust'], coll=C_BG, verts=20)
            box(f"{name}_ColLadder{i}", (0.20,0.20,h*scale*0.8), (x+r*scale+0.4,y,z+2+h*scale*0.4), M['dark'], coll=C_BG, uv=False)
            sphere(f"{name}_ColBeacon{i}", 0.35, (x,y,z+3+h*scale), M['red'], segs=8, rings=5, coll=C_BG)
        # storage tanks
        for i,(dx,dy,r,h) in enumerate([(48,-22,12,20),(52,18,10,16)]):
            x,y,_=wl(dx*scale,dy*scale,2)
            cyl(f"{name}_Tank{i}", r*scale, h*scale, (x,y,z+2+h*scale/2), M['tank'], coll=C_BG, verts=24, smooth=True)
            d=sphere(f"{name}_TankDome{i}", r*scale, (x,y,z+2+h*scale), M['tank'], segs=20, rings=10, coll=C_BG)
            d.scale.z=0.38
            for k in range(3):
                cyl(f"{name}_TankBand{i}_{k}", r*1.02*scale, 0.22, (x,y,z+4+k*h*scale*0.22), M['steel'], coll=C_BG, verts=24)
        # chimney + flare
        x,y,_=wl(-55,-30,2)
        cyl(f"{name}_Chimney", 2.2*scale, 112*scale, (x,y,z+2+56*scale), M['concrete'], coll=C_BG, verts=18)
        for k in range(4):
            cyl(f"{name}_ChimBand{k}", 2.4*scale, 0.5, (x,y,z+12+k*26*scale), M['rust'], coll=C_BG, verts=18)
        sphere(f"{name}_ChimBeacon", 0.5, (x,y,z+114*scale), M['red'], segs=8, rings=5, coll=C_BG)
        x,y,_=wl(42,-38,2)
        cyl(f"{name}_Flare", 1.2*scale, 70*scale, (x,y,z+2+35*scale), M['rust'], coll=C_BG, verts=14)
        cone(f"{name}_Flame", 2.2*scale, 0.2, 6*scale, (x,y,z+72*scale), M['sign_warm'], coll=C_BG, verts=12)
        # pipe rack and lights
        for i in range(3):
            dx=-70+i*55
            x,y,_=wl(dx*scale, 32*scale, 2)
            cyl(f"{name}_Pipe{i}", 0.8*scale, 150*scale, (x,y,z+7), M['pipe'], rot=(0,math.radians(90),0), coll=C_BG, verts=12)
        for i in range(4):
            x,y,_=wl((-60+i*40)*scale, -55*scale, 3)
            sphere(f"{name}_WarnLight{i}", 0.5, (x,y,z+3), M['sign_warm'], segs=8, rings=5, coll=C_BG)
        # container stack
        for i in range(6):
            x,y,_=wl((-45+i*15)*scale, -70*scale, 1.3)
            box(f"{name}_Box{i}", (12.2,2.5,2.6), (x,y,z+1.3+(i%2)*2.65),
                M['container_red'] if i%3==0 else M['container_blue'] if i%3==1 else M['container_tan'],
                coll=C_BG, bevel=0.03)
    industrial_cluster('Refinery_NW', -760, 850, 18, 1.0)
    industrial_cluster('Refinery_NE', 780, 900, -22, 1.0)
    industrial_cluster('Refinery_SW', -850, -880, 8, 1.0)
    industrial_cluster('Refinery_SE', 850, -900, -12, 1.0)
    industrial_cluster('Refinery_N1', -500, 780, 20, 0.82)
    industrial_cluster('Refinery_N2', 500, 800, -15, 0.78)
    industrial_cluster('Refinery_S1', -700, -750, 4, 0.80)
    industrial_cluster('Refinery_S2', 700, -750, -8, 0.82)
    industrial_cluster('Refinery_ForeW', -720, -980, 10, 0.80)
    industrial_cluster('Refinery_ForeE', 750, -980, -10, 0.80)

    def edge_refinery(name, cx, cy):
        z = 0.0
        box(f"{name}_Pad", (150,110,2.0), (cx,cy,1.0), M['concrete'], coll=C_BG, bevel=0.06, uv=False)
        for i,(dx,dy,r,h) in enumerate([(-32,-10,4,56),(0,12,5,68),(30,-8,3.5,48)]):
            cyl(f"{name}_Col{i}", r, h, (cx+dx,cy+dy,1+h/2), M['steel'], coll=C_BG, verts=18, smooth=True)
            cyl(f"{name}_ColCap{i}", r*1.15, 1.0, (cx+dx,cy+dy,1+h), M['dark'], coll=C_BG, verts=18)
            for k in range(3):
                cyl(f"{name}_ColBand{i}_{k}", r*1.04, 0.3, (cx+dx,cy+dy,8+k*h*0.25), M['rust'], coll=C_BG, verts=18)
            sphere(f"{name}_Beacon{i}", 0.35, (cx+dx,cy+dy,3+h), M['red'], segs=8, rings=5, coll=C_BG)
        for i,(dx,dy,r,h) in enumerate([(45,-20,10,16),(-52,25,11,18)]):
            cyl(f"{name}_Tank{i}", r, h, (cx+dx,cy+dy,1+h/2), M['tank'], coll=C_BG, verts=22, smooth=True)
            d=sphere(f"{name}_TankDome{i}", r, (cx+dx,cy+dy,1+h), M['tank'], segs=18, rings=8, coll=C_BG); d.scale.z=0.35
        cyl(f"{name}_Chimney", 2.0, 96, (cx-58,cy-35,49), M['concrete'], coll=C_BG, verts=16)
        sphere(f"{name}_ChimBeacon", 0.45, (cx-58,cy-35,97), M['red'], segs=8, rings=5, coll=C_BG)
        for i in range(3):
            cyl(f"{name}_Pipe{i}", 0.5, 120, (cx,cy-42+i*3,7+i*2), M['pipe'], rot=(0,math.radians(90),0), coll=C_BG, verts=10)
        for i in range(5):
            box(f"{name}_Box{i}", (12.2,2.5,2.6), (cx-50+i*13,cy+40,1.3+(i%2)*2.65),
                M['container_red'] if i%2 else M['container_blue'], coll=C_BG, bevel=0.03)
        for i in range(3):
            sphere(f"{name}_Warn{i}", 0.4, (cx-60+i*55,cy+48,4), M['sign_warm'], segs=8, rings=5, coll=C_BG)
    edge_refinery('EdgeRefineryW', -540, -535)
    edge_refinery('EdgeRefineryE', 540, -535)

    # raised perimeter road and pipe band hide the flat slab edge
    def edge_road(name, axis, fixed):
        if axis == 'x':
            box(f"{name}_Deck", (1240,14,1.2), (0,fixed,-1.2), M['asphalt'], coll=C_BG, bevel=0.04)
            box(f"{name}_Rail", (1240,0.4,1.0), (0,fixed+7.0,-0.1), M['steel'], coll=C_BG, uv=False)
            for i,x in enumerate(range(-600,601,60)):
                box(f"{name}_Col{i}", (2.0,2.0,39), (x,fixed,-20.5), M['concrete'], coll=C_BG, bevel=0.04)
                cyl(f"{name}_Lamp{i}", 0.10,7.0, (x,fixed-5.5,3.0), M['dark'], coll=C_BG, verts=8)
                box(f"{name}_LampHead{i}", (0.8,0.35,0.15), (x,fixed-5.5,6.5), M['sign_warm'], coll=C_BG, uv=False)
        else:
            box(f"{name}_Deck", (14,1240,1.2), (fixed,0,-1.2), M['asphalt'], coll=C_BG, bevel=0.04)
            box(f"{name}_Rail", (0.4,1240,1.0), (fixed+7.0,0,-0.1), M['steel'], coll=C_BG, uv=False)
            for i,y in enumerate(range(-600,601,60)):
                box(f"{name}_Col{i}", (2.0,2.0,39), (fixed,y,-20.5), M['concrete'], coll=C_BG, bevel=0.04)
                cyl(f"{name}_Lamp{i}", 0.10,7.0, (fixed-5.5,y,3.0), M['dark'], coll=C_BG, verts=8)
                box(f"{name}_LampHead{i}", (0.35,0.8,0.15), (fixed-5.5,y,6.5), M['sign_warm'], coll=C_BG, uv=False)
    edge_road('EdgeRoadS','x',-612)
    edge_road('EdgeRoadN','x',612)
    edge_road('EdgeRoadW','y',-612)
    edge_road('EdgeRoadE','y',612)
    # service warehouses hanging off the retaining wall hide the flat slab edge
    for i, x in enumerate((-480,-320,-160,0,160,320,480)):
        box(f"WallWarehouseS{i}", (96,15,38), (x,-636,-19), M['corrugated'], coll=C_BG, bevel=0.08)
        box(f"WallWarehouseSRoof{i}", (98,17,0.8), (x,-636,0.0), M['dark'], coll=C_BG, bevel=0.04)
        for k in range(3):
            box(f"WallWarehouseSDoor{i}_{k}", (12,0.4,8), (x-28+k*28,-644,4.0), M['dark'], coll=C_BG, bevel=0.03)
            box(f"WallWarehouseSLight{i}_{k}", (12.4,0.2,0.22), (x-28+k*28,-644.3,8.4), M['sign_warm'], coll=C_BG, uv=False)
        k34_place('AirHandlerLG_PlasticWhite', f"WallWarehouseSAC{i}", (x,-636,0.8), 0, 0.7, C_BG)
    for side, fixed in (('W',-636),('E',636)):
        for i, y in enumerate((-420,-240,-60,120,300)):
            box(f"WallWarehouse{side}{i}", (15,96,38), (fixed,y,-19), M['corrugated'], coll=C_BG, bevel=0.08)
            box(f"WallWarehouse{side}Roof{i}", (17,98,0.8), (fixed,y,0.0), M['dark'], coll=C_BG, bevel=0.04)
            for k in range(3):
                box(f"WallWarehouse{side}Door{i}_{k}", (0.4,12,8), (fixed+8,y-28+k*28,4.0), M['dark'], coll=C_BG, bevel=0.03)
                box(f"WallWarehouse{side}Light{i}_{k}", (0.2,12.4,0.22), (fixed+8.3,y-28+k*28,8.4), M['sign_warm'], coll=C_BG, uv=False)
    # portal cranes on the south apron edge
    for i, x in enumerate((-360,0,360)):
        for sx in (-1,1):
            box(f"PortalCrane{i}_Leg{sx}", (2.0,2.0,70), (x+sx*10,-660, -5), M['steel'], coll=C_BG, bevel=0.05)
            box(f"PortalCrane{i}_Base{sx}", (5,5,2), (x+sx*10,-660,-39), M['concrete'], coll=C_BG, bevel=0.05)
        box(f"PortalCrane{i}_Beam", (24,2.4,2.6), (x,-660,28), M['white_panel'], coll=C_BG, bevel=0.05)
        box(f"PortalCrane{i}_Trolley", (4,3.5,2.0), (x+4,-660,26), M['dark'], coll=C_BG, bevel=0.04)
        cyl(f"PortalCrane{i}_Cable", 0.06, 15, (x+4,-660,17.5), M['dark'], coll=C_BG, verts=6)
        box(f"PortalCrane{i}_Hook", (2.5,1.4,1.5), (x+4,-660,10), M['orange'], coll=C_BG, bevel=0.04)
        sphere(f"PortalCrane{i}_Beacon", 0.4, (x,-660,30), M['red'], segs=8, rings=5, coll=C_BG)
    # pipe band along the retaining wall
    for side, fixed in [('S',-604),('N',604)]:
        for k,z in enumerate((-7,-15,-23)):
            cyl(f"WallPipe{side}_{k}", 0.7, 1180, (0, fixed, z), M['pipe'], rot=(0,math.radians(90),0), coll=C_BG, verts=12)
    for side, fixed in [('W',-604),('E',604)]:
        for k,z in enumerate((-7,-15,-23)):
            cyl(f"WallPipe{side}_{k}", 0.7, 1180, (fixed, 0, z), M['pipe'], rot=(math.radians(90),0,0), coll=C_BG, verts=12)

    # traffic point-lights on the outer highways
    for i, x in enumerate(range(-760,761,76)):
        for yy, mat in [(-840, M['sign_warm']), (840, M['sign_red'])]:
            sphere(f"RoadCar_{i}_{yy}", 0.30, (x,yy,terrain_h(x,yy)+0.8), mat, segs=6, rings=4, coll=C_BG)

    # long-exposure traffic lights on the outer highways
    for i, (yy, mat, off) in enumerate([(-840, M['sign_warm'], 3.0), (-840, M['sign_white'], 5.0),
                                         (840, M['sign_warm'], -3.0), (840, M['sign_white'], -5.0),
                                         (-1000, M['sign_warm'], 3.0), (-1000, M['sign_red'], -3.0)]):
        pts=[]
        for x in range(-800, 801, 100):
            pts.append((x, yy+off, terrain_h(x,yy)+2.2))
        curve(f"TrafficTrail_{i}", pts, 0.22, mat, coll=C_BG, res=1)

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
    av.inputs['Density'].default_value = 0.00014
    av.inputs['Anisotropy'].default_value = 0.38
    _tc = ant.nodes.new('ShaderNodeTexCoord')
    _sep = ant.nodes.new('ShaderNodeSeparateXYZ')
    _mr = ant.nodes.new('ShaderNodeMapRange')
    _mr.inputs['From Min'].default_value = 0.0; _mr.inputs['From Max'].default_value = 1.0
    _mr.inputs['To Min'].default_value = 0.00026; _mr.inputs['To Max'].default_value = 0.000025
    ant.links.new(_tc.outputs['Generated'], _sep.inputs['Vector'])
    ant.links.new(_sep.outputs['Z'], _mr.inputs['Value'])
    ant.links.new(_mr.outputs['Result'], av.inputs['Density'])
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
    cam_wide = camera("Cam_Wide", (-55, -490, 1.7), (0, -180, 110), 18, 8.0)
    cam_street = camera("Cam_Street", (0, -470, 1.7), (0, -140, 110), 20, 8.0)
    cam_termwide = camera("Cam_TermWide", (-170, -575, 5.5), (-100, -430, 40), 32, 8.0)
    cam_pad = camera("Cam_Pad", (-45, -520, 3.0), (4, -420, 6.5), 50, 7.1)
    cam_aerial = camera("Cam_Aerial", (-600, -1400, 500), (0, 0, 80), 35, 11.0)
    cam_aerial_low = camera("Cam_AerialLow", (-700, -900, 300), (0, -100, 40), 35, 11.0)
    cam_detail = camera("Cam_Detail", (-80, -580, 4.5), (-145, -500, 7.5), 38, 6.3)
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
    # authored street rects; a primary building must not sit on a carriageway
    roads = [(-600,600,-575,-555), (-600,600,-315,-289), (-600,600,102,138),
             (-600,600,317,343), (-374,-346,-600,600), (346,374,-600,600),
             (-11,11,-289,600), (-17,17,-600,-450)]
    for nm in buildings:
        bb = bbox_of(nm)
        if not bb: continue
        for r in roads:
            if bb[1].x > r[0] and bb[0].x < r[1] and bb[1].y > r[2] and bb[0].y < r[3]:
                issues.append(f"ROAD {nm} overlaps road {r}")
    log("AUDIT", "OK" if not issues else issues)
    for s in issues:
        log("AUDIT_ISSUE", s)
    sb = [o.matrix_world @ Vector(c) for o in ship_parts for c in o.bound_box]
    smn = Vector((min(v.x for v in sb), min(v.y for v in sb), min(v.z for v in sb)))
    smx = Vector((max(v.x for v in sb), max(v.y for v in sb), max(v.z for v in sb)))
    report = dict(heroes=heroes, mids=mids, lows=lows, background=bg,
                  total_tris=total, by_collection=per, audit=issues,
                  brand_replaced=len(brand_replaced), brand_faces_removed=brand_faces_removed,
                  brand_audit='OK' if not brand_left else brand_left,
                  in_world_signs=['NAUTILUS REACH','PORT 07','T2 ARRIVALS','BERTH 07/12',
                                  'NAUTILUS FREIGHT','ORBITAL LINE','SHIP LINE 09','NIGHT MARKET',
                                  'FUEL DEPOT','DANGER / NO ENTRY','夜航 港口','货运 07','夜市 24H'],
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
