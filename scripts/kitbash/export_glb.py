"""Build the real-time Anvil Landing GLB kit from the final Blender scene.
- visible meshes only
- compact PBR materials with 2K/1K textures (AO + tint baked into basecolor)
- decimate background/hero buildings
- join into logical per-material groups
- export GLB, then gltf-transform optimize (meshopt + webp)
"""
import bpy, bmesh, math, os, sys, json, shutil, random
from mathutils import Vector

WORK = "/Users/apple/.local/share/opencode/worktree/e0f2de/kitbash-port"
BLEND = f"{WORK}/docs/kitbash-port/anvil_landing.blend"
GLB = f"{WORK}/docs/kitbash-port/glb"
TEXOUT = f"{GLB}/textures"
KB = "/tmp/kb3d_tex/Textures"
GEN = f"{WORK}/docs/kitbash-port/textures"
os.makedirs(TEXOUT, exist_ok=True)


SET_BY_MAT = {
    'KB3D_Metal': 'Metal', 'MetalSilver': 'MetalSilver', 'KB3D_MetalSilver': 'MetalSilver',
    'KB3D_PanelsWhite': 'PanelsWhite', 'KB3D_PanelsBlack': 'PanelsBlack',
    'KB3D_PanelsBrown': 'PanelsBrown', 'KB3D_Panels2': 'Panels2',
    'KB3D_PanelsLightBlue': 'PanelsLightBlue', 'KB3D_Iron': 'Iron',
    'KB3D_Glass': 'Glass', 'KB3D_Tech': 'Tech', 'KB3D_Lights': 'Lights', 'KB3D_Floor': 'Floor',
}
SET_RES = {
    'Metal': 2048, 'MetalSilver': 2048, 'PanelsWhite': 2048, 'PanelsBlack': 2048,
    'PanelsBrown': 2048, 'Panels2': 2048, 'PanelsLightBlue': 2048, 'Iron': 2048,
    'Tech': 1024, 'Lights': 1024, 'Floor': 1024,
}

with open(f"{GLB}/texture_paths.json") as _f:
    tex_paths = json.load(_f)

# ---------------------------------------------------------------- materials
mats = {}
def img_node(nt, path, noncolor=False, loc=(-420,0)):
    im = bpy.data.images.load(path, check_existing=True)
    im.colorspace_settings.name = 'Non-Color' if noncolor else 'sRGB'
    n = nt.nodes.new('ShaderNodeTexImage'); n.image = im; n.location = loc
    return n

def rt_mat(name, base=None, normal=None, rough=None, metal=None, emis=None,
           color=(0.5,0.5,0.5), rough_v=0.6, metal_v=0.0, emis_color=None, emis_strength=0.0,
           alpha=1.0):
    if name in mats: return mats[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); out.location = (300,0)
    b = nt.nodes.new('ShaderNodeBsdfPrincipled'); b.location = (20,0)
    nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])
    if base:
        tn = img_node(nt, base, False, (-450,250)); nt.links.new(tn.outputs['Color'], b.inputs['Base Color'])
    else:
        b.inputs['Base Color'].default_value = (*color, 1)
    if normal:
        tn = img_node(nt, normal, True, (-450,-50))
        nm = nt.nodes.new('ShaderNodeNormalMap'); nm.location = (-180,-80); nm.inputs['Strength'].default_value = 0.9
        nt.links.new(tn.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    if rough:
        tn = img_node(nt, rough, True, (-450,-350)); nt.links.new(tn.outputs['Color'], b.inputs['Roughness'])
    else:
        b.inputs['Roughness'].default_value = rough_v
    if metal:
        tn = img_node(nt, metal, True, (-450,-600)); nt.links.new(tn.outputs['Color'], b.inputs['Metallic'])
    else:
        b.inputs['Metallic'].default_value = metal_v
    if emis:
        tn = img_node(nt, emis, False, (-450,500)); nt.links.new(tn.outputs['Color'], b.inputs['Emission Color'])
        b.inputs['Emission Strength'].default_value = emis_strength
    elif emis_color:
        b.inputs['Emission Color'].default_value = (*emis_color, 1)
        b.inputs['Emission Strength'].default_value = emis_strength
    b.inputs['Alpha'].default_value = alpha
    mats[name] = m
    return m

def kb_rt(set_name):
    key = f"RT_KB3D_{set_name}"
    if key in mats: return mats[key]
    if set_name == 'Glass':
        return rt_mat(key, color=(0.018,0.035,0.055), rough_v=0.08, metal_v=0.72)
    t = tex_paths[set_name]
    if set_name == 'Lights':
        return rt_mat(key, base=t['base'], emis=t['emis'], emis_strength=6.0,
                      rough_v=0.45, metal_v=0.1)
    if set_name == 'Tech':
        return rt_mat(key, base=t['base'], normal=t['normal'], rough=t['rough'], metal=t['metal'],
                      emis=t['emis'], emis_strength=2.0)
    return rt_mat(key, base=t['base'], normal=t['normal'], rough=t['rough'], metal=t['metal'])

# solid materials copied from the original Principled values
def solid_rt(old):
    key = f"RT_{old.name}"
    if key in mats: return mats[key]
    b = next((n for n in old.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None) if old.use_nodes else None
    if not b:
        return rt_mat(key, color=(0.4,0.4,0.4))
    bc = b.inputs['Base Color']
    color = tuple(bc.default_value)[:3] if not bc.is_linked else (0.5,0.5,0.5)
    rough = b.inputs['Roughness'].default_value if not b.inputs['Roughness'].is_linked else 0.6
    metal = b.inputs['Metallic'].default_value if not b.inputs['Metallic'].is_linked else 0.0
    ec = b.inputs['Emission Color']
    ecol = tuple(ec.default_value)[:3] if not ec.is_linked else None
    estr = b.inputs['Emission Strength'].default_value if not b.inputs['Emission Strength'].is_linked else 0.0
    return rt_mat(key, color=color, rough_v=rough, metal_v=metal,
                  emis_color=ecol if estr > 0.01 else None, emis_strength=estr)

def compact_material(old):
    if old is None: return None
    name = old.name
    if name.startswith('RT_'):
        return old
    if name.startswith('A 30'):
        return old
    if name in ('Apron_Concrete',):
        return rt_mat('RT_Apron', base=tex_paths['Apron']['base'], normal=tex_paths['Apron']['normal'],
                      rough=tex_paths['Apron']['rough'])
    if name in ('Pad_Concrete',):
        return rt_mat('RT_Pad', base=tex_paths['Pad']['base'], normal=tex_paths['Pad']['normal'],
                      rough=tex_paths['Pad']['rough'])
    if name in ('Deck_Concrete','Plaza_Concrete','Deck_RetainingWall'):
        return rt_mat('RT_Deck', base=tex_paths['Apron']['base'], normal=tex_paths['Apron']['normal'],
                      rough=tex_paths['Apron']['rough'])
    if name in ('Deck_Asphalt','Deck_Joint'):
        return rt_mat('RT_DeckAsphalt', color=(0.03,0.031,0.033), rough_v=0.9)
    if name == 'Terrain_PBR':
        return rt_mat('RT_Terrain', base=tex_paths['Terrain']['base'], normal=tex_paths['Terrain']['normal'],
                      rough=tex_paths['Terrain']['rough'])
    if name == 'Cliff_Rock':
        return rt_mat('RT_Cliff', base=tex_paths['Cliff']['base'], normal=tex_paths['Cliff']['normal'],
                      rough=tex_paths['Cliff']['rough'])
    if name in ('Rock', 'Rock_Dark'):
        return rt_mat('RT_Rock', base=tex_paths['Rock']['base'], normal=tex_paths['Rock']['normal'],
                      rough=tex_paths['Rock']['rough'])
    if name == 'Hazard_Stripes':
        return rt_mat('RT_Hazard', base=tex_paths['Hazard']['base'], rough_v=0.7)
    if name in SET_BY_MAT:
        return kb_rt(SET_BY_MAT[name])
    if name.startswith('KB3D_') and name[5:] in SET_BY_MAT.values():
        return kb_rt(name[5:])
    if name == 'Cab_Glass':
        return rt_mat('RT_CabGlass', color=(0.01,0.02,0.03), rough_v=0.15, metal_v=0.35)
    if name == 'Asphalt':
        return rt_mat('RT_Asphalt', color=(0.025,0.026,0.028), rough_v=0.9)
    return solid_rt(old)

# ---------------------------------------------------------------- load and clean
bpy.ops.wm.open_mainfile(filepath=BLEND)
sc = bpy.context.scene
COLS = ['01_GROUND','02_BUILDINGS','03_CITY','04_PORT','05_GANTRY','06_PROPS','07_SHIP','08_PEOPLE']
groups = {c: [] for c in COLS}
for cname in COLS:
    col = bpy.data.collections.get(cname)
    if not col: continue
    for o in col.objects:
        if o.type != 'MESH': continue
        if o.hide_render or o.hide_get(): continue
        if not o.visible_get(): continue
        groups[cname].append(o)
print("VISIBLE", {k: len(v) for k,v in groups.items()})

# assign compact materials
for cname, objs in groups.items():
    for o in objs:
        for slot in o.material_slots:
            old = slot.material
            if old:
                slot.material = compact_material(old)
print("compact materials", len(mats))

# ---------------------------------------------------------------- decimate
def ratio_for(o, cname):
    n = o.name
    if cname == '03_CITY':
        if n.startswith('MEGA_'): return 0.50
        if n.startswith('LOW_'): return 0.30
        if n.startswith(('K014_','K034_')): return 0.25
        if n.startswith(('BldgLG_','BldgMD_','BldgSM_')):
            if n in ('BldgLG_G','BldgLG_H'): return 0.10
            if n in ('BldgLG_I','BldgLG_J'): return 0.15
            return 0.20
        return 0.25
    if cname == '02_BUILDINGS':
        return 0.65
    if cname == '01_GROUND':
        if n == 'TerrainRing': return 0.45
        if n.startswith('Rock_'): return 0.5
        return 0.8
    if cname == '05_GANTRY': return 0.45
    if cname == '04_PORT': return 0.45
    if cname == '07_SHIP': return 0.85
    if cname == '08_PEOPLE': return 0.6
    return 1.0

def tris(o): return sum(len(p.vertices)-2 for p in o.data.polygons)

for cname, objs in groups.items():
    for o in objs:
        r = ratio_for(o, cname)
        if r >= 0.999: continue
        if len(o.data.polygons) < 200: continue
        if o.data.users > 1:
            o.data = o.data.copy()
        md = o.modifiers.new("rt_dec", 'DECIMATE')
        md.decimate_type = 'COLLAPSE'; md.ratio = r
        try: md.use_collapse_triangulate = True
        except Exception: pass
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
        try:
            bpy.ops.object.modifier_apply(modifier=md.name)
        except Exception as e:
            print("decimate fail", o.name, e)
            o.modifiers.remove(md)
print("decimated")

# ---------------------------------------------------------------- join groups
GROUP_MAP = {
    '01_GROUND': 'RT_Ground',
    '02_BUILDINGS': 'RT_Buildings',
    '03_CITY': 'RT_City',
    '04_PORT': 'RT_Port',
    '05_GANTRY': 'RT_Port',
    '06_PROPS': 'RT_Port',
    '07_SHIP': 'RT_Ship',
    '08_PEOPLE': 'RT_People',
}
joined = {}
tmp = {}
for cname, objs in groups.items():
    if not objs: continue
    gname = GROUP_MAP[cname]
    if gname in tmp:
        tmp[gname].extend(objs)
    else:
        tmp[gname] = list(objs)
for gname, objs in tmp.items():
    objs = [o for o in objs if o.name in bpy.data.objects]
    if not objs: continue
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.object
    ob.name = gname
    if ob.data.users > 1:
        ob.data = ob.data.copy()
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # clean duplicate slots without losing polygon material assignments
    me = ob.data
    oldmats = list(me.materials)
    unique = []; idx = {}; remap = {}
    for i, m in enumerate(oldmats):
        if not m: continue
        if m.name not in idx:
            idx[m.name] = len(unique); unique.append(m)
        remap[i] = idx[m.name]
    mapped = [remap.get(p.material_index, 0) for p in me.polygons]
    me.materials.clear()
    for m in unique: me.materials.append(m)
    for p, mi in zip(me.polygons, mapped):
        p.material_index = mi
    joined[gname] = ob
    from collections import Counter
    cc = Counter(p.material_index for p in me.polygons)
    print("JOINED", gname, "tris", tris(ob), "mats", len(unique))
    print("  usage", [(i, me.materials[i].name if i < len(me.materials) else "OUT", cc.get(i, 0)) for i in range(min(len(me.materials), 45))])

# delete all other objects (lights/cameras/leftover meshes)
keep = set(joined.values())
for o in list(bpy.data.objects):
    if o not in keep:
        bpy.data.objects.remove(o, do_unlink=True)
# prune orphan data
for _ in range(3):
    bpy.ops.outliner.orphans_purge(do_recursive=True) if False else None
print("MESHES LEFT", [(o.name, tris(o)) for o in bpy.data.objects if o.type=='MESH'])

# ---------------------------------------------------------------- export
bpy.ops.object.select_all(action='DESELECT')
for o in joined.values():
    o.select_set(True)
bpy.context.view_layer.objects.active = list(joined.values())[0]
raw = f"{GLB}/anvil_landing_port_raw.glb"
kwargs = dict(filepath=raw, export_format='GLB', use_selection=True,
              export_apply=True, export_yup=True, export_texcoords=True,
              export_normals=True, export_tangents=False, export_materials='EXPORT',
              export_image_format='AUTO', export_jpeg_quality=88,
              export_cameras=False, export_lights=False, export_animations=False,
              export_skins=False, export_morph=False, export_extras=True)
props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
kwargs = {k:v for k,v in kwargs.items() if k in props}
bpy.ops.export_scene.gltf(**kwargs)
print("EXPORTED", raw, os.path.getsize(raw))

stats = {o.name: {"tris": tris(o), "verts": len(o.data.vertices),
                  "materials": [m.name for m in o.data.materials]} for o in joined.values()}
with open(f"{GLB}/export_stats.json","w") as f: json.dump(stats, f, indent=1)
print("STATS", json.dumps({k:v["tris"] for k,v in stats.items()}, indent=0))
