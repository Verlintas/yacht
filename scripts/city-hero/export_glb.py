"""Export the optimized real-time city GLB.

- keeps hero K032/K038 geometry native (275-358k tris)
- decimates mid/background/port detail
- replaces 4K sources with 1K/512 WebP base + normal + packed ORM
- joins by material via gltf-transform and applies Meshopt
"""
import bpy, bmesh, math, os, sys, json, subprocess
from mathutils import Vector
HERE=os.path.dirname(os.path.abspath(__file__))
ROOT="/private/tmp/city-hero"
BLEND=f"{ROOT}/scene.blend"
GLB=f"{ROOT}/glb"
os.makedirs(GLB,exist_ok=True)
MAN=json.load(open(f"{ROOT}/rt_manifest.json"))

bpy.ops.wm.open_mainfile(filepath=BLEND)
sc=bpy.context.scene
bpy.context.view_layer.update()

def tris(o):
    try:
        o.data.calc_loop_triangles(); return len(o.data.loop_triangles)
    except Exception: return sum(len(p.vertices)-2 for p in o.data.polygons)

# ------------------------------------------------------------------ material conversion
_mats={}
def load_img(path,noncolor=False):
    if not path: return None
    im=bpy.data.images.load(path,check_existing=True)
    im.colorspace_settings.name='Non-Color' if noncolor else 'sRGB'
    return im

def rt_pbr(name, base=None, normal=None, orm=None, emis=None, color=(0.5,0.5,0.5),
           rough=0.55, metal=0.0, tint=None, emis_strength=4.0, glass=False, emis_color=None):
    if name in _mats: return _mats[name]
    m=bpy.data.materials.new(name); m.use_nodes=True
    nt=m.node_tree; nt.nodes.clear()
    out=nt.nodes.new('ShaderNodeOutputMaterial'); out.location=(500,0)
    b=nt.nodes.new('ShaderNodeBsdfPrincipled'); b.location=(220,0)
    nt.links.new(b.outputs['BSDF'],out.inputs['Surface'])
    if base:
        bn=nt.nodes.new('ShaderNodeTexImage'); bn.image=load_img(base); bn.location=(-650,300)
        col=bn.outputs['Color']
        if tint:
            mx=nt.nodes.new('ShaderNodeMix'); mx.data_type='RGBA'; mx.blend_type='MULTIPLY'
            mx.inputs[0].default_value=1.0; mx.inputs[6].default_value=(*tint,1)
            mx.location=(-380,300)
            nt.links.new(col,mx.inputs[7]); col=mx.outputs[2]
        nt.links.new(col,b.inputs['Base Color'])
    else:
        b.inputs['Base Color'].default_value=(*color,1)
    if normal:
        nn=nt.nodes.new('ShaderNodeTexImage'); nn.image=load_img(normal,True); nn.location=(-650,-80)
        nm=nt.nodes.new('ShaderNodeNormalMap'); nm.location=(-380,-60); nm.inputs['Strength'].default_value=0.9
        nt.links.new(nn.outputs['Color'],nm.inputs['Color']); nt.links.new(nm.outputs['Normal'],b.inputs['Normal'])
    if orm:
        on=nt.nodes.new('ShaderNodeTexImage'); on.image=load_img(orm,True); on.location=(-650,-380)
        sep=nt.nodes.new('ShaderNodeSeparateColor'); sep.location=(-380,-380)
        nt.links.new(on.outputs['Color'],sep.inputs['Color'])
        nt.links.new(sep.outputs['Green'],b.inputs['Roughness'])
        nt.links.new(sep.outputs['Blue'],b.inputs['Metallic'])
    else:
        b.inputs['Roughness'].default_value=rough
        b.inputs['Metallic'].default_value=metal
    if emis:
        en=nt.nodes.new('ShaderNodeTexImage'); en.image=load_img(emis); en.location=(-650,-650)
        nt.links.new(en.outputs['Color'],b.inputs['Emission Color'])
        b.inputs['Emission Strength'].default_value=emis_strength
    elif emis_color:
        b.inputs['Emission Color'].default_value=(*emis_color,1)
        b.inputs['Emission Strength'].default_value=emis_strength
    elif glass:
        b.inputs['Base Color'].default_value=(0.006,0.012,0.02,1)
        b.inputs['Metallic'].default_value=0.72
        b.inputs['Roughness'].default_value=0.06
    _mats[name]=m
    return m

def source_key(matname):
    n=matname or ''
    if n.startswith('MEGA_'): n=n[5:]
    if n.startswith('KB32_'): return 'K32_'+n[5:].split('.')[0]
    if n.startswith('KB38_'):
        m=n[5:].split('.')[0]
        if m in ('Glass','GlassTri'): return 'GLASS'
        return 'K38_'+m
    if n.startswith('KB46_KB3D_HEM_'): return 'K46_'+n[len('KB46_KB3D_HEM_'):].split('.')[0]
    if n.startswith('KB46_'): return 'K46_'+n[5:].split('.')[0]
    if n.startswith('KB39_'): return 'K39_'+n[5:].split('.')[0]
    return None

def palette_key(matname):
    n=(matname or '').lower()
    # K034 rooftop props
    if any(k in n for k in ('metaldark','metalblack','iron','dark')): return 'K34_Dark'
    if any(k in n for k in ('metallight','silver','chrome','galvan')): return 'K34_Light'
    if any(k in n for k in ('plasticwhite','white')): return 'K34_White'
    if any(k in n for k in ('red','brick','brown','wood')): return 'K34_Red'
    if any(k in n for k in ('blue',)): return 'K34_Blue'
    if 'glass' in n: return 'GLASS'
    # K014 greebles
    if 'plaster' in n: return 'K14_Plaster'
    if 'concrete' in n: return 'K14_Concrete'
    if 'red' in n: return 'K14_Red'
    if 'chrome' in n: return 'K14_Chrome'
    # CityStreets
    if 'tree' in n or 'leaf' in n or 'hedge' in n: return 'CS_Green'
    if 'glass' in n or 'window' in n: return 'GLASS'
    if 'brick' in n or 'red' in n: return 'CS_Brick'
    return 'K34_Dark'

def character_key(matname):
    n=(matname or '').lower()
    if 'headhands' in n or 'pupil' in n or 'eyelash' in n: return 'CH_Head'
    if 'suit_' in n: return 'CH_Suit'
    if 'boot' in n or 'glove' in n: return 'CH_Boot'
    if 'glass' in n or 'goggle' in n: return 'GLASS'
    return 'CH_Metal'

def compact_material(old,obj=None):
    if not old: return None
    col=obj.users_collection[0].name if obj and obj.users_collection else ''
    on=obj.name if obj else ''
    if 'A 30' in old.name or (obj and obj.users_collection and obj.users_collection[0].name=='07_SHIP'):
        return old
    if col=='03_CITY': return mega_palette(old)
    if col=='02_BUILDINGS' and on not in ('K32_A','K38_J','K38_I','K38_I2'): return building_palette(old)
    if col=='04_PORT': return port_palette(old)
    if col=='01_GROUND': return ground_palette(old)
    if col=='05_PROPS': return props_palette(old)
    key=source_key(old.name)
    if key and key in MAN:
        n=f"RT_{key}"
        if n in _mats: return _mats[n]
        d=MAN[key]
        lk=old.name.lower()
        emis_strength=6.0 if ('light' in lk or 'sign' in lk or 'speedway' in lk) else 2.0 if 'tech' in lk else 2.0
        return rt_pbr(n,d.get('base'),d.get('normal'),d.get('orm'),d.get('emis'),emis_strength=emis_strength)
    if key=='GLASS': return rt_pbr('RT_Glass',glass=True)
    # named scene materials
    n=old.name
    if n in ('Deck_Concrete','Plaza_Concrete','Deck_RetainingWall'): return rt_pbr('RT_Deck',MAN['Deck']['base'],MAN['Deck']['normal'],MAN['Deck']['orm'],tint=(0.7,0.68,0.64))
    if n=='Deck_Asphalt': return rt_pbr('RT_Asphalt',MAN['Asphalt']['base'],MAN['Asphalt']['normal'],MAN['Asphalt']['orm'])
    if n=='Terrain_PBR': return rt_pbr('RT_Terrain',MAN['Terrain']['base'],MAN['Terrain']['normal'],MAN['Terrain']['orm'])
    if n=='Hazard_Stripes': return rt_pbr('RT_Hazard',MAN['Hazard']['base'])
    if n.startswith('KB34_') or any(x in n for x in ('MetalDark','MetalLight','PlasticWhite')):
        pk=palette_key(n)
        return palette_solid(pk)
    if n.startswith('KB14_') or any(x in n for x in ('MetalPlasterDirty','MetalWorn','MetalFlake','PlasterDirty','ConcreteSmooth')):
        return palette_solid(palette_key(n))
    # CityStreets imported material names are arbitrary; use palette
    if n.startswith('KB3D_CTS_') or any(x in n for x in ('Tree','Kiosk','Dumpster','Trailer','Sidewalk','Lamp')):
        return palette_solid(palette_key(n))
    # characters
    if any(x in n for x in ('Suit_','HeadHands','Boots_','Gloves','Pupils','Eyelashes','HeadArmor','Headphones','Goggles','Device','Cap_','FaceMask')):
        ck=character_key(n)
        if ck=='GLASS': return rt_pbr('RT_CH_Glass',glass=True)
        d=MAN.get(ck)
        if d: return rt_pbr(f"RT_{ck}",d['base'],d.get('normal'),d.get('orm'))
        return palette_solid('CH_Metal')
    # custom scene solids: preserve Principled values when possible
    b=next((x for x in old.node_tree.nodes if x.type=='BSDF_PRINCIPLED'),None) if old.use_nodes else None
    if b:
        bc=b.inputs['Base Color']; col=tuple(bc.default_value)[:3] if not bc.is_linked else (0.4,0.42,0.45)
        rg=b.inputs['Roughness'].default_value if not b.inputs['Roughness'].is_linked else 0.55
        mt=b.inputs['Metallic'].default_value if not b.inputs['Metallic'].is_linked else 0.0
        ec=b.inputs['Emission Color']; es=b.inputs['Emission Strength'].default_value
        if es>0.01 and not ec.is_linked:
            ecv=tuple(ec.default_value)[:3]
            return rt_pbr('RT_'+old.name+'_em',color=col,rough=rg,metal=mt,emis_color=ecv,emis_strength=es)
        return rt_pbr('RT_'+old.name,color=col,rough=rg,metal=mt)
    return rt_pbr('RT_Fallback')

_solids={}
def palette_solid(key):
    if key in _solids: return _solids[key]
    cols={
      'K34_Dark':((0.035,0.04,0.045),0.45,0.6), 'K34_Light':((0.45,0.48,0.50),0.38,0.8),
      'K34_White':((0.62,0.62,0.58),0.55,0.1), 'K34_Red':((0.36,0.10,0.06),0.55,0.2),
      'K34_Blue':((0.08,0.18,0.30),0.5,0.3),
      'K14_Metal':((0.30,0.31,0.32),0.42,0.8), 'K14_Plaster':((0.48,0.44,0.36),0.8,0.0),
      'K14_Concrete':((0.42,0.41,0.38),0.85,0.0), 'K14_Red':((0.34,0.08,0.05),0.55,0.25),
      'K14_Chrome':((0.62,0.65,0.68),0.18,1.0),
      'CS_Green':((0.06,0.16,0.05),0.8,0.0), 'CS_Brick':((0.30,0.18,0.12),0.8,0.0),
      'CH_Metal':((0.16,0.18,0.20),0.35,0.8),
    }
    c,r,m=cols.get(key,((0.4,0.4,0.4),0.6,0.0))
    _solids[key]=rt_pbr('RT_'+key,color=c,rough=r,metal=m)
    return _solids[key]

_pal_cache={}
def rep_pbr(name, key, tint=None, emis_strength=3.0):
    if name in _pal_cache: return _pal_cache[name]
    d=MAN.get(key,{})
    m=rt_pbr(name,d.get('base'),d.get('normal'),d.get('orm'),d.get('emis'),tint=tint,emis_strength=emis_strength)
    _pal_cache[name]=m; return m

def building_palette(old):
    n=(old.name or '').lower()
    if 'glass' in n: return rt_pbr('BP_Glass',glass=True)
    if 'concrete' in n or 'stone' in n: return rep_pbr('BP_Concrete','K32_ConcretePattern')
    if 'whitepanel' in n or 'white' in n: return rep_pbr('BP_White','K38_WhitePanels')
    if 'red' in n or 'brick' in n: return rep_pbr('BP_Red','K46_MetalPaintRed')
    if 'blue' in n: return rep_pbr('BP_Blue','K46_MetalPaintBlue')
    if 'green' in n: return rep_pbr('BP_Green','K46_MetalPaintLGreenA')
    if 'black' in n or 'dark' in n: return rep_pbr('BP_Dark','K38_MetalBlack')
    if 'metal' in n or 'steel' in n or 'iron' in n: return rep_pbr('BP_Metal','K32_SatinSteel')
    return rep_pbr('BP_Metal','K32_SatinSteel')

def mega_palette(old):
    n=(old.name or '').lower()
    if 'glass' in n: return rt_pbr('MP_Glass',glass=True)
    if 'whitepanel' in n or 'white' in n: return rep_pbr('MP_Light','K38_WhitePanels',(0.55,0.60,0.70))
    if 'black' in n or 'dark' in n: return rep_pbr('MP_Dark','K38_MetalBlack',(0.48,0.53,0.62))
    if 'metal' in n: return rep_pbr('MP_Metal','K38_MetalStriated',(0.50,0.55,0.64))
    return rep_pbr('MP_Metal','K38_MetalStriated',(0.50,0.55,0.64))

def port_palette(old):
    n=(old.name or '').lower()
    if n.startswith('kb39_'):
        if 'glass' in n: return rt_pbr('PP_Glass',glass=True)
        if 'panelswhite' in n or 'white' in n: return rep_pbr('PP_K39_White','K39_PanelsWhite')
        if 'panelsblack' in n or 'black' in n: return rep_pbr('PP_K39_Black','K39_PanelsBlack')
        return rep_pbr('PP_K39_Metal','K39_Metal')
    if n.startswith('kb46_'):
        if 'light' in n: return rep_pbr('PP_Light','K46_Light',emis_strength=8.0)
        if 'window' in n or 'glass' in n: return rt_pbr('PP_Glass',glass=True)
        if 'paintwhite' in n: return rep_pbr('PP_White','K46_MetalPaintWhite')
        if 'paintred' in n: return rep_pbr('PP_Red','K46_MetalPaintRed')
        if 'paintblue' in n: return rep_pbr('PP_Blue','K46_MetalPaintBlue')
        if 'paintyellow' in n: return rep_pbr('PP_Yellow','K46_MetalPaintYellow')
        if 'paintlgreen' in n or 'greena' in n: return rep_pbr('PP_Green','K46_MetalPaintLGreenA')
        if 'corrugated' in n: return rep_pbr('PP_Corrugated','K46_MetalPanelCorrugated')
        if 'black' in n: return rep_pbr('PP_Black','K46_MetalPanelBlack')
        if 'rust' in n: return rep_pbr('PP_Rust','K46_RustA')
        if 'pipe' in n: return rep_pbr('PP_Pipe','K46_PipesA')
        return rep_pbr('PP_Metal','K46_MetalA')
    if 'glass' in n: return rt_pbr('PP_Glass',glass=True)
    if 'hazard' in n: return rt_pbr('PP_Hazard',MAN['Hazard']['base'])
    if 'asphalt' in n: return rt_pbr('PP_Asphalt',MAN['Asphalt']['base'],MAN['Asphalt']['normal'],MAN['Asphalt']['orm'])
    if 'concrete' in n or 'plaza' in n: return rt_pbr('PP_Deck',MAN['Deck']['base'],MAN['Deck']['normal'],MAN['Deck']['orm'],tint=(0.68,0.66,0.62))
    if any(k in n for k in ('edge','neon','cyan')): return rt_pbr('PP_EmCyan',color=(0.05,0.5,1.0),emis_color=(0.1,0.55,1.0),emis_strength=9.0)
    if any(k in n for k in ('warm','lamp','sign','windowglow')): return rt_pbr('PP_EmWarm',color=(1.0,0.5,0.15),emis_color=(1.0,0.55,0.22),emis_strength=9.0)
    if 'red' in n: return rt_pbr('PP_EmRed',color=(1.0,0.03,0.01),emis_color=(1.0,0.05,0.02),emis_strength=18.0)
    if 'light' in n: return rt_pbr('PP_EmWhite',color=(0.8,0.9,1.0),emis_color=(0.78,0.88,1.0),emis_strength=10.0)
    if 'white' in n: return rt_pbr('PP_PaintWhite',color=(0.75,0.74,0.70),rough=0.55)
    if 'yellow' in n: return rt_pbr('PP_PaintYellow',color=(0.9,0.62,0.05),rough=0.5)
    if 'orange' in n: return rt_pbr('PP_PaintOrange',color=(0.9,0.22,0.02),rough=0.45)
    if 'dark' in n or 'rubber' in n or 'black' in n: return rt_pbr('PP_Dark',color=(0.025,0.03,0.035),rough=0.45,metal=0.5)
    return rt_pbr('PP_Metal',color=(0.30,0.32,0.34),rough=0.4,metal=0.8)

def ground_palette(old):
    n=old.name
    if n in ('Deck_Concrete','Plaza_Concrete','Deck_RetainingWall'): return rt_pbr('RT_Deck',MAN['Deck']['base'],MAN['Deck']['normal'],MAN['Deck']['orm'],tint=(0.7,0.68,0.64))
    if n=='Deck_Asphalt': return rt_pbr('RT_Asphalt',MAN['Asphalt']['base'],MAN['Asphalt']['normal'],MAN['Asphalt']['orm'])
    if n=='Terrain_PBR': return rt_pbr('RT_Terrain',MAN['Terrain']['base'],MAN['Terrain']['normal'],MAN['Terrain']['orm'])
    if n=='Hazard_Stripes': return rt_pbr('RT_Hazard',MAN['Hazard']['base'])
    if 'White' in n or 'white' in n: return rt_pbr('GP_White',color=(0.8,0.79,0.75),rough=0.55)
    if 'Yellow' in n: return rt_pbr('GP_Yellow',color=(0.92,0.62,0.08),rough=0.5)
    if 'Glow' in n or 'Edge' in n: return rt_pbr('GP_Edge',color=(0.1,0.5,1.0),emis_color=(0.1,0.55,1.0),emis_strength=8.0)
    return rt_pbr('GP_Dark',color=(0.03,0.033,0.038),rough=0.6,metal=0.1)

def props_palette(old):
    n=(old.name or '').lower()
    if 'tree' in n or 'leaf' in n or 'hedge' in n or 'grass' in n: return rt_pbr('CS_Green',color=(0.06,0.16,0.05),rough=0.8)
    if 'glass' in n: return rt_pbr('CS_Glass',glass=True)
    if 'brick' in n or 'red' in n: return rt_pbr('CS_Brick',color=(0.30,0.18,0.12),rough=0.8)
    if 'white' in n or 'plastic' in n: return rt_pbr('CS_White',color=(0.55,0.55,0.52),rough=0.6)
    if 'light' in n or 'lamp' in n: return rt_pbr('CS_Light',color=(0.8,0.85,0.9),emis_color=(0.8,0.85,1.0),emis_strength=8.0)
    return rt_pbr('CS_Dark',color=(0.08,0.09,0.1),rough=0.6,metal=0.4)

# ------------------------------------------------------------------ cull + decimate
EXPORT_COLLS=['01_GROUND','02_BUILDINGS','03_CITY','04_PORT','05_PROPS','06_PEOPLE','07_SHIP']
keep=[]
for o in list(bpy.data.objects):
    if o.type!='MESH':
        try: bpy.data.objects.remove(o,do_unlink=True)
        except Exception: pass
        continue
    if o.name=='Atmosphere' or o.hide_render or not o.visible_get():
        bpy.data.objects.remove(o,do_unlink=True); continue
    keep.append(o)

def ratio_for(o):
    n=o.name
    if n in ('K32_A','K38_J','K38_I','K38_I2'): return 1.0
    if n.startswith(('M1_','M2_','M3_','M4_','M5_')): return 0.34
    if n.startswith(('INF_','K46_MD_','K32_M_','K38_C','K38_E','K46_G','K32_E','K46_D')): return 0.30
    if n.startswith('K39_'): return 0.30
    if n.startswith(('K34_','K14_','YardGreeb')): return 0.35
    if n.startswith(('KB3D_CTS_','CS_')): return 0.25
    if n.startswith(('CTN_','RS_','TF_','WH_','Term_','Gant','Mast','Pad','Crate','Barrel','GPU','Truck','Jersey','Boarding','Gear','PipeRun','TF_')): return 0.45
    if o.users_collection and o.users_collection[0].name=='06_PEOPLE': return 0.40
    if o.users_collection and o.users_collection[0].name=='04_PORT': return 0.45
    if o.users_collection and o.users_collection[0].name=='03_CITY': return 0.30
    if o.users_collection and o.users_collection[0].name=='02_BUILDINGS': return 0.30
    return 1.0

for o in keep:
    me=o.data
    if len(me.uv_layers)==0:
        me.uv_layers.new(name='UVMap')
    else:
        while len(me.uv_layers)>1:
            me.uv_layers.remove(me.uv_layers[-1])
    r=ratio_for(o)
    col=o.users_collection[0].name if o.users_collection else ''
    if col=='02_BUILDINGS' and o.name not in ('K32_A','K38_J','K38_I','K38_I2'): r*=0.45
    elif col=='03_CITY': r*=0.50
    elif col=='04_PORT': r*=0.70
    elif col=='06_PEOPLE': r*=0.55
    elif col=='01_GROUND': r*=0.8
    elif col=='05_PROPS': r*=0.8
    if r<0.999 and len(o.data.polygons)>500:
        if o.data.users>1: o.data=o.data.copy()
        md=o.modifiers.new('rt', 'DECIMATE'); md.decimate_type='COLLAPSE'; md.ratio=r
        try: md.use_collapse_triangulate=True
        except Exception: pass
        bpy.context.view_layer.objects.active=o
        bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
        try: bpy.ops.object.modifier_apply(modifier=md.name)
        except Exception as e:
            print('dec fail',o.name,e); o.modifiers.remove(md)

# ------------------------------------------------------------------ materials + export
for o in keep:
    if o.data.users>1: o.data=o.data.copy()
    for slot in o.material_slots:
        if slot.material:
            try: slot.material=compact_material(slot.material,o)
            except Exception as e: print('mat fail',o.name,slot.material.name,e)
# purge empties / orphan meshes
for o in list(bpy.data.objects):
    if o.type!='MESH': bpy.data.objects.remove(o,do_unlink=True)

# Join into one mesh per logical collection.  Clones can live in multiple
# collections, so use a priority order rather than users_collection[0].
from collections import defaultdict
def group_of(o):
    names={c.name for c in o.users_collection}
    for n in ('01_GROUND','02_BUILDINGS','03_CITY','04_PORT','05_PROPS','06_PEOPLE','07_SHIP'):
        if n in names: return n
    return None
bycol=defaultdict(list)
for o in keep:
    g=group_of(o)
    if g: bycol[g].append(o)
joined=[]
for col,objs in bycol.items():
    objs=[o for o in objs if o.name in bpy.data.objects]
    if not objs: continue
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active=objs[0]
    if len(objs)>1:
        bpy.ops.object.join()
    ob=bpy.context.view_layer.objects.active
    ob.name='RT_'+col
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    me=ob.data
    old_m=list(me.materials); uniq=[]; idx={}; remap={}
    for i,m in enumerate(old_m):
        if not m: continue
        if m.name not in idx:
            idx[m.name]=len(uniq); uniq.append(m)
        remap[i]=idx[m.name]
    mapped=[remap.get(p.material_index,0) for p in me.polygons]
    me.materials.clear()
    for m in uniq: me.materials.append(m)
    for p,mi in zip(me.polygons,mapped): p.material_index=mi
    joined.append(ob)
    print('JOINED',col,'tris',tris(ob),'mats',len(uniq),'dims',[round(v,1) for v in ob.dimensions],flush=True)
keep=joined
for _ in range(2):
    try: bpy.ops.outliner.orphans_purge(do_recursive=True)
    except Exception: pass
bpy.ops.object.select_all(action='SELECT')
bpy.context.view_layer.objects.active=keep[0]
raw=f"{GLB}/nautilus_city_raw.glb"
kwargs=dict(filepath=raw,export_format='GLB',use_selection=True,export_apply=False,
    export_yup=True,export_texcoords=True,export_normals=True,export_tangents=False,
    export_materials='EXPORT',export_image_format='AUTO',export_jpeg_quality=86,
    export_cameras=False,export_lights=False,export_animations=False,export_skins=False,
    export_morph=False,export_extras=False)
props=bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
kwargs={k:v for k,v in kwargs.items() if k in props}
bpy.ops.export_scene.gltf(**kwargs)
print('RAW',raw,round(os.path.getsize(raw)/1048576,2),'MB',flush=True)
print('MESH COUNT',len(keep),'TRIS',sum(tris(o) for o in keep),flush=True)
