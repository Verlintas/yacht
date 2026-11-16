"""Shared helpers for the Nautilus Reach hero city sample.

Blender 5.3 headless.  1 unit = 1 metre.
All Kitbash3D source files are read-only from /private/tmp/city-hero-assets.
"""
import bpy, bmesh, math, os, re, random, sys
from mathutils import Vector, Matrix
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "kitbash"))
from lib_kb3d import (box, box_uv, cyl, sphere, cone, ring, text_mesh, curve,
                      collection, link, bbox, place, solid_mat, emission_mat,
                      surface_mat, image_mat, make_light, point_at,
                      world_image_sky)

ROOT = "/private/tmp/city-hero"
ASSETS = "/private/tmp/city-hero-assets"
K032_DIR = f"{ASSETS}/k032/K032新上海城市Kitbash3D-NeoShanghai"
K038_DIR = f"{ASSETS}/k038"
K046_DIR = f"{ASSETS}/k046/K046重金属建筑FBX格式"
K046_TEX = f"{ASSETS}/k046/K046重金属建筑Blender/KB3DTextures"
K034_DIR = f"{ASSETS}/k034/FBX格式Kitbash3D Props Rooftops"
K014_DIR = "/tmp/kb3d_greebles"
K039_TEX = "/tmp/kb3d_tex/Textures"
CITYSTREETS_BLEND = "/Users/apple/Documents/3D Models/209套Blender城市街道建筑模型/209系列城市建筑模型/Blender Native/KB3D_CityStreets-Native.blend"
CITYSTREETS_TEX = "/Users/apple/Documents/3D Models/209套Blender城市街道建筑模型/209系列城市建筑模型/Blender Native/KB3DTextures"
CHAR_BLEND = "/tmp/ms_char/ModelshopGreebles_CHARACTERS_POSED_2K.blend"
SKY_HDR = "/Users/apple/.local/share/opencode/worktree/e0f2de/city-hero-sample/public/terrain-sample/sky.hdr"
GEN = f"{ROOT}/tex"

# --------------------------------------------------------------------------
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'
    sc.unit_settings.scale_length = 1.0
    sc.render.engine = 'CYCLES'
    return sc

def ensure_gen():
    os.makedirs(GEN, exist_ok=True)

def get_font():
    """Load after factory reset; font datablocks do not survive wm.read_factory_settings."""
    for f in bpy.data.fonts:
        if 'Avenir' in f.name:
            return f
    return bpy.data.fonts.load("/System/Library/Fonts/Avenir Next Condensed.ttc")

def _files(d):
    try:
        return os.listdir(d)
    except Exception:
        return []

def find_tex(d, stem, kind, exts=('.jpg','.png','.jpeg','.tif','.exr')):
    """Case-insensitive texture lookup with sensible PBR aliases."""
    if not d or not os.path.isdir(d):
        return None
    kind = kind.lower()
    wants = [kind]
    if kind in ('basecolor','base'):
        wants += ['diffuse','color','albedo']
    if kind == 'ao':
        wants += ['ambient_occlusion','ambient occlusion']
    if kind == 'metal':
        wants += ['metallic','metalness']
    if kind == 'normal':
        wants += ['nrm','normalmap']
    if kind == 'emissive':
        wants += ['emission','emissive_mask']
    files = _files(d)
    lower = {f.lower(): f for f in files}
    for want in wants:
        for ext in exts:
            key = f"{stem.lower()}_{want}{ext}".lower()
            if key in lower:
                return os.path.join(d, lower[key])
    # some packs omit the underscore kind, e.g. material_diffuse_1
    for f in files:
        fl = f.lower()
        if fl.startswith(stem.lower()) and any(w in fl for w in wants) and fl.endswith(exts):
            return os.path.join(d, f)
    return None

_img_cache = {}
def img(path, noncolor=False):
    if not path:
        return None
    key = (path, noncolor)
    if key in _img_cache:
        return _img_cache[key]
    im = bpy.data.images.load(path, check_existing=True)
    if noncolor:
        im.colorspace_settings.name = 'Non-Color'
    _img_cache[key] = im
    return im

def node_tex(nt, path, noncolor=False, loc=(-600,0), interp='Linear'):
    n = nt.nodes.new('ShaderNodeTexImage')
    n.image = img(path, noncolor)
    n.location = loc
    n.interpolation = interp
    return n

def mix_mul(nt, a, b, fac=1.0, loc=(-300,200)):
    m = nt.nodes.new('ShaderNodeMix')
    m.data_type = 'RGBA'; m.blend_type = 'MULTIPLY'
    m.inputs[0].default_value = fac
    nt.links.new(a, m.inputs[6])
    nt.links.new(b, m.inputs[7])
    m.location = loc
    return m

def pbr_material(name, base, normal, rough, metal, ao=None, emis=None,
                 tint=(1,1,1), rough_scale=1.0, normal_strength=1.0,
                 emis_strength=0.0, alpha=None, glass=False):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); out.location = (500,0)
    b = nt.nodes.new('ShaderNodeBsdfPrincipled'); b.location = (230,0)
    nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])
    if base:
        bn = node_tex(nt, base, False, (-650,300))
        col = bn.outputs['Color']
        if ao:
            an = node_tex(nt, ao, True, (-650,60))
            mm = mix_mul(nt, col, an.outputs['Color'], 0.82, (-380,240))
            col = mm.outputs[2]
        tm = nt.nodes.new('ShaderNodeMix'); tm.data_type='RGBA'; tm.blend_type='MULTIPLY'
        tm.inputs[0].default_value = 1.0
        tm.inputs[6].default_value = (*tint,1)
        tm.location = (-80,300)
        nt.links.new(col, tm.inputs[7])
        nt.links.new(tm.outputs[2], b.inputs['Base Color'])
    else:
        b.inputs['Base Color'].default_value = (*tint,1)
    if glass:
        b.inputs['Base Color'].default_value = (0.008,0.014,0.022,1)
        b.inputs['Metallic'].default_value = 0.62
        b.inputs['Roughness'].default_value = 0.075
        b.inputs['IOR'].default_value = 1.46
        b.inputs['Transmission Weight'].default_value = 0.06
    else:
        if rough:
            rn = node_tex(nt, rough, True, (-650,-120))
            rm = nt.nodes.new('ShaderNodeMath'); rm.operation='MULTIPLY'
            rm.inputs[1].default_value = rough_scale
            rm.location=(-380,-120)
            nt.links.new(rn.outputs['Color'], rm.inputs[0])
            nt.links.new(rm.outputs[0], b.inputs['Roughness'])
        else:
            b.inputs['Roughness'].default_value = 0.5
        if metal:
            mn = node_tex(nt, metal, True, (-650,-340))
            nt.links.new(mn.outputs['Color'], b.inputs['Metallic'])
        else:
            b.inputs['Metallic'].default_value = 0.0
    if normal:
        nn = node_tex(nt, normal, True, (-650,-580))
        nm = nt.nodes.new('ShaderNodeNormalMap'); nm.location=(-380,-520)
        nm.inputs['Strength'].default_value = normal_strength
        nt.links.new(nn.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    if emis:
        en = node_tex(nt, emis, False, (-650,-820))
        nt.links.new(en.outputs['Color'], b.inputs['Emission Color'])
        b.inputs['Emission Strength'].default_value = emis_strength
    if alpha:
        an = node_tex(nt, alpha, True, (-650,-1000))
        nt.links.new(an.outputs['Color'], b.inputs['Alpha'])
        try: m.surface_render_method='DITHERED'
        except Exception: pass
    m.diffuse_color = (*tint,1)
    return m

# --------------------------------------------------------------------------
# Pack-specific material maps
K032_ALIASES = {
    'MetalOxidized': 'OxidizedSteel',
    'PaintedMetal': 'PaintedMetall',
}
K032_SPECIAL = {
    'Pic_Banners': ('KB3D_NSbanner_Diffuse.jpg', None, None, None, 1.0),
    'Signs_Lights': ('KB3D_NSletters_Diffuse.jpg', None, None, 'KB3D_NSletters_Diffuse.jpg', 4.0),
    'Characters': ('KB3D_NSbanner_Diffuse.jpg', None, None, None, 1.0),
}
def mat_k032(mat):
    stem = "KB3D_" + K032_ALIASES.get(mat, mat)
    d = f"{K032_DIR}/Textures"
    base = find_tex(d, stem, 'basecolor')
    normal = find_tex(d, stem, 'normal')
    rough = find_tex(d, stem, 'roughness')
    metal = find_tex(d, stem, 'metallic')
    ao = find_tex(d, stem, 'ao')
    emis = find_tex(d, stem, 'emissive')
    glass = mat == 'Glass'
    strength = 7.0 if mat == 'Signs_Lights' else 3.0 if mat == 'SpeedwayTiles' else 0.0
    if mat in K032_SPECIAL:
        f = K032_SPECIAL[mat]
        base = f"{d}/{f[0]}" if f[0] else None
        emis = f"{d}/{f[3]}" if f[3] else None
        strength = f[4]
    return pbr_material(f"KB32_{mat}", base, normal, rough, metal, ao, emis,
                        normal_strength=0.85, emis_strength=strength, glass=glass,
                        alpha=find_tex(d, stem, 'opacity'))

def mat_k038(mat):
    st = f"KB3D_NTT_{mat}"
    d = f"{K038_DIR}/Textures"
    base = find_tex(d, st, 'basecolor')
    normal = find_tex(d, st, 'normal')
    rough = find_tex(d, st, 'roughness')
    metal = find_tex(d, st, 'metallic')
    ao = find_tex(d, st, 'ao')
    emis = find_tex(d, st, 'emissive')
    glass = mat in ('Glass','GlassTri')
    strength = 6.0 if mat in ('Light','Ads') else 2.0 if mat == 'SolarPanels' else 0.0
    return pbr_material(f"KB38_{mat}", base, normal, rough, metal, ao, emis,
                        normal_strength=0.9, emis_strength=strength, glass=glass,
                        alpha=find_tex(d, st, 'opacity'))

def mat_k046(mat):
    stem = mat  # KB3D_HEM_...
    d = K046_TEX
    base = find_tex(d, stem, 'basecolor')
    normal = find_tex(d, stem, 'normal')
    rough = find_tex(d, stem, 'roughness')
    metal = find_tex(d, stem, 'metallic')
    emis = find_tex(d, stem, 'emissive')
    strength = 8.0 if 'Light' in mat else 0.0
    return pbr_material(f"KB46_{mat}", base, normal, rough, metal, None, emis,
                        normal_strength=1.0, emis_strength=strength,
                        glass=('Windows' in mat or 'Glass' in mat))

def mat_k039(mat):
    st = f"KB3D_SF_{mat}"
    d = K039_TEX
    base = find_tex(d, st, 'basecolor')
    normal = find_tex(d, st, 'normal')
    rough = find_tex(d, st, 'roughness')
    metal = find_tex(d, st, 'metallic')
    ao = find_tex(d, st, 'ao')
    emis = find_tex(d, st, 'emissive')
    return pbr_material(f"KB39_{mat}", base, normal, rough, metal, ao, emis,
                        normal_strength=1.0,
                        emis_strength=5.0 if mat=='Lights' else 1.0 if mat=='Tech' else 0.0,
                        glass=mat=='Glass')

def mat_k034(mat):
    """K034's 255 variants collapse to a few 4K texture families."""
    fam = 'MetalDark'
    ml = mat.lower()
    for k in ('metalblack','metal dark','metaldark','iron','dark'):
        if k in ml: fam='MetalDark'; break
    for k in ('metallight','silver','chrome','galvan'):
        if k in ml: fam='MetalLight'; break
    for k in ('plasticwhite','white'):
        if k in ml: fam='PlasticWhite'; break
    for k in ('plasticblue','blue'):
        if k in ml: fam='MetalBlue'; break
    for k in ('red','brick','brown','wood'):
        if k in ml: fam='MetalRed'; break
    for k in ('glass',):
        if k in ml: return bpy.data.materials.get('Glass_Common') or pbr_material(
            'Glass_Common', None, None, None, None, glass=True)
    d = f"{K034_DIR}/tex"
    stem = f"KB3D_{fam}"
    base = find_tex(d, stem, 'diffuse')
    normal = find_tex(d, stem, 'normal')
    rough = find_tex(d, stem, 'rough')
    return pbr_material(f"KB34_{fam}", base, normal, rough, None,
                        normal_strength=0.8, tint=(1,1,1))

def mat_k014(mat):
    d = K014_DIR
    # imported names vary; match by material name / texture family
    ml = (mat or '').lower()
    if 'plaster' in ml:
        stem='KB3D_PlasterDirty'
    elif 'concrete' in ml:
        stem='KB3D_ConcreteSmooth'
    elif 'metalworn' in ml or 'iron' in ml:
        stem='KB3D_MetalWorn'
    else:
        stem='KB3D_MetalFlake'
    base = find_tex(d, stem, 'diffuse')
    normal = find_tex(d, stem, 'normal')
    rough = find_tex(d, stem, 'rough')
    tint = (1,1,1)
    if 'red' in ml:
        tint = (1.4,0.45,0.28)
    elif 'white' in ml:
        tint = (1.25,1.22,1.16)
    return pbr_material(f"KB14_{mat}", base, normal, rough, None,
                        normal_strength=0.9, tint=tint)

# --------------------------------------------------------------------------
# FBX import / grouping
def _join(objs, name, coll):
    # FBX imports often parent meshes to an empty; bake world transforms first.
    for o in objs:
        if o.parent is not None:
            mw = o.matrix_world.copy()
            o.parent = None
            o.matrix_world = mw
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    # K038 ships an FBX take that keys object locations; it would override
    # every placement on depsgraph update.  Static kit only.
    try:
        ob.animation_data_clear()
    except Exception:
        pass
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bb = [Vector(c) for c in ob.bound_box]
    mn = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
    mx = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
    ctr = Vector(((mn.x+mx.x)/2, (mn.y+mx.y)/2, mn.z))
    ob.data.transform(Matrix.Translation(-ctr))
    ob.location = (0,0,0)
    # move to module collection
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    coll.objects.link(ob)
    hide(ob)
    return ob

def hide(ob):
    ob.hide_render = True
    ob.hide_set(True)

def unhide(ob):
    ob.hide_render = False
    ob.hide_set(False)

def import_modules(path, tag, key_re, coll, mat_fn, normalize=True, keep_ratio=None, max_modules=None):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path, use_custom_normals=True,
                             use_image_search=True, ignore_leaf_bones=True)
    new = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    groups = defaultdict(list)
    for o in new:
        m = key_re.match(o.name)
        if m:
            groups[m.group(1)].append(o)
    print(f"IMPORT {tag}: {len(new)} meshes -> {len(groups)} modules")
    out = {}
    for key, objs in groups.items():
        # prefer larger groups, skip obviously empty keys
        ob = _join(objs, f"{tag}_{key}", coll)
        for slot in ob.material_slots:
            if slot.material:
                try:
                    slot.material = mat_fn(slot.material.name)
                except Exception as e:
                    print("mat fail", tag, key, slot.material.name, e)
        objs_count = len(objs)
        out[key] = ob
        print(f"  MOD {key}: {objs_count} parts, tris={tri_count(ob)}, dims={[round(v,1) for v in ob.dimensions]}")
    # delete everything not used
    keep = set(out.values())
    for o in new:
        if o not in keep:
            try:
                bpy.data.objects.remove(o, do_unlink=True)
            except Exception:
                pass
    return out

def tri_count(o):
    for m in o.modifiers:
        if m.type == 'DECIMATE':
            pass
    me = o.data
    try:
        me.calc_loop_triangles()
        return len(me.loop_triangles)
    except Exception:
        return sum(len(p.vertices)-2 for p in me.polygons)

def clone(src, name, coll, decimate=None):
    ob = src.copy()
    ob.data = src.data.copy()
    ob.name = name
    try:
        ob.animation_data_clear()
    except Exception:
        pass
    unhide(ob)
    coll.objects.link(ob)
    if decimate and decimate < 0.999:
        md = ob.modifiers.new("ratio", 'DECIMATE')
        md.decimate_type='COLLAPSE'; md.ratio=decimate
        try: md.use_collapse_triangulate=True
        except Exception: pass
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
        bpy.ops.object.modifier_apply(modifier=md.name)
    return ob

def place_ground(ob, x, y, z=0.0, rot_z=0.0, coll=None):
    if coll:
        for c in list(ob.users_collection):
            c.objects.unlink(ob)
        coll.objects.link(ob)
    ob.location = (x, y, z)
    ob.rotation_euler = (0,0,math.radians(rot_z))
    unhide(ob)
    # explicit ground snap, robust to source-object origins
    bpy.context.view_layer.update()
    bb=world_bbox(ob)
    ob.location.z += z - bb[0].z
    ob.location.x += x - ((bb[0].x+bb[1].x)/2)
    ob.location.y += y - ((bb[0].y+bb[1].y)/2)
    return ob

def world_bbox(ob):
    bpy.context.view_layer.update()
    bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    return (Vector((min(v.x for v in bb),min(v.y for v in bb),min(v.z for v in bb))),
            Vector((max(v.x for v in bb),max(v.y for v in bb),max(v.z for v in bb))))

# --------------------------------------------------------------------------
def imported_material_swap(objs, fn):
    for o in objs:
        if o.type != 'MESH': continue
        for slot in o.material_slots:
            if slot.material:
                try: slot.material = fn(slot.material.name)
                except Exception: pass

def append_citystreet_group(names, coll, mat_fn=None):
    """Append all objects in one CityStreets group (children share prefix)."""
    with bpy.data.libraries.load(CITYSTREETS_BLEND, link=False) as (src, dst):
        allnames = list(src.objects)
        chosen = [n for n in allnames if n in names or any(n.startswith(p) for p in names)]
        dst.objects = chosen
    new = [o for o in dst.objects if o is not None and o.type=='MESH']
    for o in new:
        try: coll.objects.link(o)
        except Exception: pass
        if o.users_collection and o.name not in coll.objects:
            pass
    # objects may be parented; join world transforms
    bpy.context.view_layer.update()
    for o in new:
        if o.parent:
            mw = o.matrix_world.copy()
            o.parent = None
            o.matrix_world = mw
    return new

def join_world(objs, name, coll):
    if not objs: return None
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    # K038 ships an FBX take that keys object locations; it would override
    # every placement on depsgraph update.  Static kit only.
    try:
        ob.animation_data_clear()
    except Exception:
        pass
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for c in list(ob.users_collection): c.objects.unlink(ob)
    coll.objects.link(ob)
    return ob

def normalize_bottom(ob):
    bb = [Vector(c) for c in ob.bound_box]
    mn = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
    mx = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
    ctr = Vector(((mn.x+mx.x)/2,(mn.y+mx.y)/2,mn.z))
    ob.data.transform(Matrix.Translation(-ctr))
    ob.location = (0,0,0)

# --------------------------------------------------------------------------
def make_deck_materials():
    ensure_gen()
    M_DECK = surface_mat("Deck_Concrete",
        img(f"{GEN}/concrete_albedo.jpg"), img(f"{GEN}/concrete_normal.png", True), img(f"{GEN}/concrete_rough.jpg", True),
        tint=(0.66,0.64,0.60), rough_scale=0.95, normal_strength=1.15)
    M_PLAZA = surface_mat("Plaza_Concrete",
        img(f"{GEN}/concrete_albedo.jpg"), img(f"{GEN}/concrete_normal.png", True), img(f"{GEN}/concrete_rough.jpg", True),
        tint=(0.50,0.49,0.46), rough_scale=1.0, normal_strength=1.1)
    M_WALL = surface_mat("Deck_RetainingWall",
        img(f"{GEN}/concrete_albedo.jpg"), img(f"{GEN}/concrete_normal.png", True), img(f"{GEN}/concrete_rough.jpg", True),
        tint=(0.38,0.37,0.35), rough_scale=1.08, normal_strength=1.2)
    M_ASP = surface_mat("Deck_Asphalt",
        img(f"{GEN}/asphalt_albedo.jpg"), img(f"{GEN}/asphalt_normal.png", True), img(f"{GEN}/asphalt_rough.jpg", True),
        tint=(0.95,0.95,0.95), rough_scale=1.0, normal_strength=1.25)
    M_TER = surface_mat("Terrain_PBR",
        img(f"{GEN}/terrain_albedo.jpg"), img(f"{GEN}/terrain_normal.png", True), img(f"{GEN}/terrain_rough.jpg", True),
        tint=(0.95,0.92,0.88), rough_scale=1.0, normal_strength=1.0, uv_scale=22.0)
    M_WHITE = solid_mat("Paint_White", (0.80,0.79,0.75), 0.55)
    M_YELLOW = solid_mat("Paint_Yellow", (0.92,0.62,0.08), 0.48)
    M_DARK = solid_mat("Paint_Dark", (0.030,0.033,0.038), 0.62, 0.15)
    M_HAZ = image_mat("Hazard_Stripes", img(f"{GEN}/hazard.jpg"), rough=0.62, uv_scale=1.0)
    M_EDGE = emission_mat("Edge_Glow", (0.10,0.50,1.0), 7.0)
    M_EDGE_W = emission_mat("Edge_Glow_Warm", (1.0,0.58,0.24), 6.0)
    return dict(deck=M_DECK, plaza=M_PLAZA, wall=M_WALL, asphalt=M_ASP,
                terrain=M_TER, white=M_WHITE, yellow=M_YELLOW, dark=M_DARK,
                hazard=M_HAZ, edge=M_EDGE, edge_warm=M_EDGE_W)
