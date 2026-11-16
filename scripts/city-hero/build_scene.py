"""Build the Nautilus Reach hero city deck sample.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/city-hero/build_scene.py

Outputs /private/tmp/city-hero/scene.blend and a build report.
"""
import bpy, bmesh, math, os, sys, re, random, json, time
from mathutils import Vector, Matrix

HERE=os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0,HERE)
from lib_city import *
from city_deck import build_deck
from city_port import port, beam, beam_box

ROOT="/private/tmp/city-hero"
BLEND=f"{ROOT}/scene.blend"
os.makedirs(ROOT,exist_ok=True)
random.seed(24)

# ------------------------------------------------------------------ scene
sc=reset()
sc.render.engine='CYCLES'
C_GROUND=collection("01_GROUND")
C_MODS=collection("00_MODULES")
C_BLDG=collection("02_BUILDINGS")
C_CITY=collection("03_CITY")
C_PORT=collection("04_PORT")
C_PROPS=collection("05_PROPS")
C_PEOPLE=collection("06_PEOPLE")
C_SHIP=collection("07_SHIP")
C_LIGHT=collection("08_LIGHTS")
C_CAM=collection("09_CAMERAS")

# ------------------------------------------------------------------ materials
mats=make_deck_materials()
# repair terrain UV scale: surface_mat was built with 22; use a fresh material
M_TER=mats['terrain']
for n in M_TER.node_tree.nodes:
    if n.type=='MAPPING':
        n.inputs['Scale'].default_value=(1,1,1)
# allow terrain UVs to be world/68 (set in build_deck)

M={}
M['white_panel']=mat_k046('KB3D_HEM_MetalPaintWhite')
M['steel']=mat_k046('KB3D_HEM_MetalA')
M['iron']=mat_k046('KB3D_HEM_MetalFrame')
M['corrugated']=mat_k046('KB3D_HEM_MetalPanelCorrugated')
M['tank']=mat_k046('KB3D_HEM_MetalPaintWhite')
M['pipe']=mat_k046('KB3D_HEM_PipesA')
M['rust']=mat_k046('KB3D_HEM_RustA')
M['light']=emission_mat("Port_Light_White",(0.70,0.84,1.0),12.0,(0.03,0.03,0.035))
M['warm']=emission_mat("Port_Light_Warm",(1.0,0.56,0.22),10.0,(0.04,0.03,0.02))
M['edge']=emission_mat("Port_Edge_Cyan",(0.12,0.55,1.0),9.0,(0.01,0.02,0.03))
M['red']=emission_mat("Port_Beacon_Red",(1.0,0.05,0.02),35.0,(0.02,0.0,0.0))
M['orange']=solid_mat("Port_SafetyOrange",(0.92,0.24,0.02),0.42,0.05)
M['dark']=solid_mat("Port_DarkSteel",(0.028,0.031,0.036),0.48,0.55)
M['glass']=pbr_material("Port_Glass",None,None,None,None,glass=True)
M['concrete']=mats['plaza']
M['asphalt']=mats['asphalt']
M['hazard']=mats['hazard']
M['container_red']=mat_k046('KB3D_HEM_MetalPaintRed')
M['container_blue']=mat_k046('KB3D_HEM_MetalPaintBlue')
M['container_grey']=mat_k046('KB3D_HEM_MetalPanelBlack')
M['container_tan']=mat_k046('KB3D_HEM_MetalPaintYellow')
M['white']=mats['white']; M['yellow']=mats['yellow']
M['deck']=mats['deck']; M['plaza']=mats['plaza']; M['wall']=mats['wall']

# K039 close-up materials used on port annex modules
M39={
 'Metal':mat_k039('Metal'), 'PanelsWhite':mat_k039('PanelsWhite'),
 'PanelsBlack':mat_k039('PanelsBlack'), 'Panels2':mat_k039('Panels2'),
 'PanelsLightBlue':mat_k039('PanelsLightBlue'), 'Iron':mat_k039('Iron'),
 'Glass':mat_k039('Glass'), 'Tech':mat_k039('Tech'), 'Lights':mat_k039('Lights'),
 'PanelsBrown':mat_k039('PanelsBrown'), 'Floor':mat_k039('Floor'),
}

# ------------------------------------------------------------------ deck
print("BUILD DECK", flush=True)
build_deck(C_GROUND,mats)

# ------------------------------------------------------------------ kit modules
print("IMPORT K032", flush=True)
k32=import_modules(
    f"{K032_DIR}/Kitbash3d_NeoShanghai.FBX",'K32',
    re.compile(r'^(BldgLG_[A-Z]|BldgM_[A-Z]|BldgS_[A-Z])_'),
    C_MODS, mat_k032,
    )
# restrict to authored modules we actually use
wanted32={'BldgLG_A','BldgLG_B','BldgLG_C','BldgLG_E','BldgM_A','BldgM_D'}
for k in list(k32):
    if k not in wanted32:
        try: bpy.data.objects.remove(k32[k],do_unlink=True)
        except Exception: pass
        k32.pop(k,None)
print("IMPORT K038", flush=True)
k38=import_modules(
    f"{K038_DIR}/FBX格式/Kitbash3d_NeoTokyo2-Native.FBX",'K38',
    re.compile(r'^Desirefx\.me_(Large[A-Z])_'),
    C_MODS, mat_k038,
    )
wanted38={'LargeJ','LargeI','LargeC','LargeE'}
for k in list(k38):
    if k not in wanted38:
        try: bpy.data.objects.remove(k38[k],do_unlink=True)
        except Exception: pass
        k38.pop(k,None)
print("IMPORT K046", flush=True)
k46=import_modules(
    f"{K046_DIR}/KB3D_HeavyMetal-Native.fbx",'K46',
    re.compile(r'^KB3D_HEM_(BldgLG_[A-Z]|BldgMD_[A-Z]|BldgSM_[A-Z])_'),
    C_MODS, mat_k046,
    )
wanted46={'BldgLG_G','BldgLG_D','BldgLG_H','BldgLG_E','BldgMD_B','BldgMD_D','BldgMD_G'}
for k in list(k46):
    if k not in wanted46:
        try: bpy.data.objects.remove(k46[k],do_unlink=True)
        except Exception: pass
        k46.pop(k,None)
print("IMPORT K039", flush=True)
k39=import_modules(
    "/tmp/kb3d_fbx/asset_1.fbx",'K39',
    re.compile(r'^(?:Desirefx\.me_)?(Bldg(?:LG|MD|SM)_[A-Z])_'),
    C_MODS, mat_k039,
    )
wanted39={'BldgLG_C','BldgLG_D'}
for k in list(k39):
    if k not in wanted39:
        try: bpy.data.objects.remove(k39[k],do_unlink=True)
        except Exception: pass
        k39.pop(k,None)

mods={}
for k,v in k32.items(): mods['K32_'+k]=v
for k,v in k38.items(): mods['K38_'+k]=v
for k,v in k46.items(): mods['K46_'+k]=v
for k,v in k39.items(): mods['K39_'+k]=v

# A clean 38 m stack block made from the authored K046 G main mass.  The
# full 88 m module carries antennas/roof plant that collide when stacked;
# the main industrial block is designed to be repeated vertically.
if 'K46_BldgLG_G' in mods:
    src=mods['K46_BldgLG_G']
    ob=src.copy(); ob.data=src.data.copy(); ob.name='K46_G_STACK'
    bm=bmesh.new(); bm.from_mesh(ob.data)
    dead=[f for f in bm.faces if f.calc_center_median().z > 39.2]
    bmesh.ops.delete(bm, geom=dead, context='FACES')
    loose=[v for v in bm.verts if not v.link_faces]
    if loose: bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bm.to_mesh(ob.data); bm.free()
    vs=[v.co for v in ob.data.vertices]
    mn=Vector((min(v.x for v in vs),min(v.y for v in vs),min(v.z for v in vs)))
    mx=Vector((max(v.x for v in vs),max(v.y for v in vs),max(v.z for v in vs)))
    ob.data.transform(Matrix.Translation(Vector((-(mn.x+mx.x)/2,-(mn.y+mx.y)/2,-mn.z))))
    for c in list(ob.users_collection): c.objects.unlink(ob)
    C_MODS.objects.link(ob); hide(ob); mods['K46_G_STACK']=ob
    print("STACKBLOCK",[round(v,1) for v in ob.dimensions],tri_count(ob),flush=True)
print("MODULES", {k:(round(v.dimensions.z,1),tri_count(v)) for k,v in mods.items()}, flush=True)

# ------------------------------------------------------------------ port
print("BUILD PORT", flush=True)
term,wh,ct,gant,tf=port(C_PORT,C_LIGHT,M)
# K039 authored service annexes at 1:1
for key,name,pos,rot in [('BldgLG_C','K39_PumpHouse',(-232,-387),12),
                         ('BldgLG_D','K39_ServiceAnnex',(-205,-395),-8)]:
    if key in k39:
        ob=clone(k39[key],name,C_PORT)
        place_ground(ob,pos[0],pos[1],0.14,rot,C_PORT)
        print("PLACE",name,[round(v,1) for v in world_bbox(ob)[1]-world_bbox(ob)[0]],flush=True)
        # roof conduit / base band
        w=ob.dimensions.x; d=ob.dimensions.y
        box(f"{name}_Curb",(w+2,d+2,0.35),(pos[0],pos[1],0.2),M['concrete'],coll=C_PORT,bevel=0.04,uv=False)
# K039 detail band at the terminal/warehouse link
if 'BldgLG_C' in k39:
    ob=clone(k39['BldgLG_C'],'K39_WestLink',C_PORT)
    place_ground(ob,-188,-465,0.14,90,C_PORT)

# ------------------------------------------------------------------ hero towers
HERO=[
 ('K32_A',  -240,-135, 8,  'K32_BldgLG_A', None),
 ('K38_J',   245,-115,-14, 'K38_LargeJ',   None),
 ('K38_I',  -330, -55,  5, 'K38_LargeI',   None),
 ('K38_I2',  350, -60,-8, 'K38_LargeI', None),
]
for name,x,y,rot,key,mode in HERO:
    src=mods[key]
    if mode=='stack2':
        b=clone(src,f"{name}_base",C_BLDG,0.92)
        place_ground(b,x,y,0.0,rot,C_BLDG)
        h=b.dimensions.z
        u=clone(src,f"{name}_upper",C_BLDG,0.92)
        place_ground(u,x,y,h-2.5,rot,C_BLDG)
        box(f"{name}_Collar",(b.dimensions.x+7,b.dimensions.y+7,3.0),(x,y,h-1.0),
            M['iron'],coll=C_BLDG,bevel=0.12)
        box(f"{name}_CollarLight",(b.dimensions.x+5,b.dimensions.y+5,0.18),(x,y,h+0.4),
            M['edge'],coll=C_BLDG,uv=False)
        top=h*2-2.5
    else:
        ob=clone(src,name,C_BLDG,1.0)
        place_ground(ob,x,y,0.0,rot,C_BLDG)
        top=ob.dimensions.z
    # structural collar / service spine / podium band
    bb=world_bbox(bpy.data.objects[name] if name in bpy.data.objects else bpy.data.objects[name+'_base'])
    w=bb[1].x-bb[0].x; d=bb[1].y-bb[0].y
    # Native K032/K038 facades already carry their own setback bands; adding
    # rings here reads as floating floors above the taper.  Keep the towers
    # authored and let the service spine carry the extra structure.
    # vertical service spine at a corner
    sx=-1 if (x<0) else 1; sy=-1
    px=x+sx*w*0.48; py=y+sy*d*0.42
    cyl(f"{name}_Spine",2.4,top*0.92,(px,py,top*0.46),M['steel'],coll=C_BLDG,verts=12)
    for k,z in enumerate(range(40,int(top*0.9),55)):
        box(f"{name}_SpineClamp{k}",(3.6,3.6,1.6),(px,py,z),M['iron'],coll=C_BLDG,bevel=0.04)
        box(f"{name}_SpineLight{k}",(0.9,0.9,0.18),(px,py,z+0.9),M['edge'],coll=C_BLDG,uv=False)
    # podium ring / entrance canopy / lit band at grade
    box(f"{name}_Podium",(w*0.82,d*0.82,6.0),(x,y,3.0),M['concrete'],coll=C_BLDG,bevel=0.12,uv=False)
    box(f"{name}_PodiumBand",(w*0.84,d*0.84,0.24),(x,y,6.15),M['edge'],coll=C_BLDG,uv=False)
    for j in range(4):
        box(f"{name}_PodiumDoor{j}",(4.0,0.4,5.0),(x-w*0.25+j*w*0.17,y-d*0.41-3.2,2.8),M['glass'],coll=C_BLDG,bevel=0.03)
    # roof crown / antenna mast
    box(f"{name}_RoofRing",(w*0.55,d*0.55,2.0),(x,y,top+0.4),M['iron'],coll=C_BLDG,bevel=0.08)
    cyl(f"{name}_RoofMast",0.22,14.0,(x,y,top+8.0),M['steel'],coll=C_BLDG,verts=8)
    sphere(f"{name}_RoofBeacon",0.45,(x,y,top+15.2),M['red'],segs=10,rings=6,coll=C_BLDG)
    print("HERO",name,"h",round(top,1),"dims",[round(v,1) for v in (bb[1]-bb[0])],flush=True)

# ------------------------------------------------------------------ background megas
_mega_mat_cache={}
def tint_mega(ob, tint=(0.62,0.68,0.78)):
    """Darken distant masses so they read against the sky at dusk; keep
    emissive window maps untouched."""
    for slot in ob.material_slots:
        m=slot.material
        if not m: continue
        key=(m.name, tint)
        if key not in _mega_mat_cache:
            nm=m.copy(); nm.name=f"MEGA_{m.name}"
            nt=nm.node_tree
            bsdf=next((n for n in nt.nodes if n.type=='BSDF_PRINCIPLED'),None)
            if bsdf:
                bc=bsdf.inputs['Base Color']
                if bc.is_linked:
                    src=bc.links[0].from_socket
                    mix=nt.nodes.new('ShaderNodeMix'); mix.data_type='RGBA'; mix.blend_type='MULTIPLY'
                    mix.inputs[0].default_value=1.0
                    mix.inputs[6].default_value=(*tint,1)
                    mix.location=(bsdf.location.x-260, bsdf.location.y+180)
                    nt.links.new(src, mix.inputs[7]); nt.links.new(mix.outputs[2], bc)
                else:
                    c=list(bc.default_value); bc.default_value=(c[0]*tint[0],c[1]*tint[1],c[2]*tint[2],c[3])
                rg=bsdf.inputs['Roughness']
                if not rg.is_linked: rg.default_value=min(1.0,rg.default_value*1.08)
            _mega_mat_cache[key]=nm
        slot.material=_mega_mat_cache[key]
    return ob

MEGA=[
 ('M1',-500,470, 0, [('K38_LargeI',0.62),('K38_LargeI',0.62)]),
 ('M2', 175,520, 6, [('K38_LargeI',0.62),('K38_LargeI',0.62)]),
 ('M3',-170,560, 4, [('K38_LargeI',0.62),('K38_LargeI',0.62)]),
 ('M4', 520,300, 7, [('K38_LargeI',0.62),('K38_LargeI',0.62)]),
 ('M5',-520,240,10, [('K38_LargeI',0.62),('K38_LargeI',0.62)]),
]
# ------------------------------------------------------------------ midground
MID=[
 ('K38_C',   0, 250,  2, 'K38_LargeC', 0.82),
 ('K38_E', -500, 220, 20, 'K38_LargeE', 0.82),
 ('K46_G',  520, 220,-15, 'K46_BldgLG_G', 0.82),
 ('K32_E',  110, 350,  8, 'K32_BldgLG_E', 0.82),
 ('K46_D',  470,-150, 12, 'K46_BldgLG_D', 1.0),
]
for name,x,y,rot,key,dec in MID:
    ob=clone(mods[key],name,C_BLDG,dec)
    tint_mega(ob,(0.78,0.82,0.92))
    place_ground(ob,x,y,0.0,rot,C_BLDG)
    bb=world_bbox(ob); h=bb[1].z-bb[0].z; w=bb[1].x-bb[0].x; d=bb[1].y-bb[0].y
    # lit window bands to break the mass
    for i,z in enumerate((h*0.22,h*0.48,h*0.74)):
        box(f"{name}_LightBand{i}",(w*0.72,0.35,0.22),(x,y+ (d*0.5+0.2)*(1 if i%2==0 else -1),z),
            M['warm'],coll=C_BLDG,uv=False)
    box(f"{name}_Crown",(w*0.55,d*0.55,1.4),(x,y,h+0.4),M['iron'],coll=C_BLDG,bevel=0.06)
    print("MID",name,"h",round(h,1),flush=True)


for label,x,y,rot,stack in MEGA:
    z=0.0; top=0.0; bw=60.0; bd=60.0; joints=[]; maxw=60.0; maxd=60.0
    for i,(key,dec) in enumerate(stack):
        if key not in mods: continue
        ob=clone(mods[key],f"{label}_{i}_{key}",C_CITY,dec)
        tint_mega(ob)
        place_ground(ob,x,y,z,rot,C_CITY)
        bb=world_bbox(ob); h=bb[1].z-bb[0].z; bw=bb[1].x-bb[0].x; bd=bb[1].y-bb[0].y
        maxw=max(maxw,bw); maxd=max(maxd,bd)
        if i>0:
            joints.append(z)
            # structural collar bridging the different footprints
            box(f"{label}_Collar{i}",(bw+1.5,bd+1.5,1.6),(x,y,z+0.5),M['iron'],coll=C_CITY,bevel=0.08)
            # sky-deck edge light + railing + crown at every mega terrace
            for nm,size,pos in [
                (f"{label}_DeckL{i}",(bw+1.0,0.16,0.16),(x,y-bd*0.5-0.4,z+1.4)),
                (f"{label}_DeckR{i}",(bw+1.0,0.16,0.16),(x,y+bd*0.5+0.4,z+1.4)),
                (f"{label}_DeckF{i}",(0.16,bd+1.0,0.16),(x-bw*0.5-0.4,y,z+1.4)),
                (f"{label}_DeckB{i}",(0.16,bd+1.0,0.16),(x+bw*0.5+0.4,y,z+1.4))]:
                box(nm,size,pos,M['warm'],coll=C_CITY,uv=False)
            box(f"{label}_DeckCore{i}",(bw*0.24,bd*0.24,5.0),(x,y,z+2.0),M['iron'],coll=C_CITY,bevel=0.1)
            # glass sky-lobby parapet closes each authored setback into a room
            for side,(sz,bx,by) in enumerate([(bw*0.98,0.35,0),(0.35,bd*0.98,0),(0.35,bd*0.98,0),(bw*0.98,0.35,0)]):
                if side==0: pos=(x,y-bd*0.5-0.3,z+3.2)
                elif side==1: pos=(x,y+bd*0.5+0.3,z+3.2)
                elif side==2: pos=(x-bw*0.5-0.3,y,z+3.2)
                else: pos=(x+bw*0.5+0.3,y,z+3.2)
                box(f"{label}_SkyLobby{i}_{side}",(bx,by,3.0),pos,M['glass'],coll=C_CITY,bevel=0.02)
            for sx in (-1,1):
                for sy in (-1,1):
                    sphere(f"{label}_DeckBeacon{i}_{sx}_{sy}",0.6,(x+sx*bw*0.47,y+sy*bd*0.45,z+1.3),M['red'],segs=8,rings=5,coll=C_CITY)
            if i==len(stack)-1:
                # transfer outriggers around the crown shoulder
                for q,(qx,qy) in enumerate([(-1,-1),(1,-1),(-1,1),(1,1)]):
                    beam(f"{label}_Transfer{q}",(x+qx*bw*0.48,y+qy*bd*0.42,z-2),(x+qx*10,y+qy*10,z+45),0.55,M['steel'],C_CITY,8)
                    box(f"{label}_TransferPad{q}",(5,5,2.0),(x+qx*10,y+qy*10,z+44),M['iron'],coll=C_CITY,bevel=0.1)
        z += h-2.0
        top = z+2.0
    total=top
    # two inner mechanical service spines
    for j,(sx,sy) in enumerate([(-1,-1),(1,1)]):
        px=x+sx*(bw*0.42); py=y+sy*(bd*0.38)
        cyl(f"{label}_Spine{j}",3.0,total*0.94,(px,py,total*0.47),M['steel'],coll=C_CITY,verts=10)
        for k,zz in enumerate(range(55,int(total*0.9),80)):
            box(f"{label}_SpineClamp{j}_{k}",(4.8,4.8,2.2),(px,py,zz),M['iron'],coll=C_CITY,bevel=0.05)
            box(f"{label}_SpineLight{j}_{k}",(1.0,1.0,0.18),(px,py,zz+1.2),M['warm'],coll=C_CITY,uv=False)
    # lit service floors around the perimeter
    for k,zz in enumerate(range(40,int(total*0.9),60)):
        box(f"{label}_SvcBandA{k}",(bw*0.82,0.25,0.16),(x,y-bd*0.5-0.2,zz),M['warm'],coll=C_CITY,uv=False)
        box(f"{label}_SvcBandB{k}",(0.25,bd*0.82,0.16),(x+bw*0.5+0.2,y,zz),M['edge'],coll=C_CITY,uv=False)
    # crown + spire
    # custom service crown: mechanical floors + antenna, no stretching
    box(f"{label}_Crown",(bw*0.52,bd*0.52,36.0),(x,y,total+18.0),M['iron'],coll=C_CITY,bevel=0.2)
    for k,zz in enumerate((total+8,total+20,total+32)):
        box(f"{label}_CrownBand{k}",(bw*0.54,bd*0.54,0.8),(x,y,zz),M['steel'],coll=C_CITY,uv=False)
        box(f"{label}_CrownLight{k}",(bw*0.50,bd*0.50,0.18),(x,y,zz+0.55),M['warm'],coll=C_CITY,uv=False)
    cyl(f"{label}_Spire",1.2,30.0,(x,y,total+50.0),M['steel'],coll=C_CITY,verts=10)
    cyl(f"{label}_SpireNeedle",0.20,20.0,(x,y,total+72.0),M['steel'],coll=C_CITY,verts=6)
    sphere(f"{label}_Beacon",1.2,(x,y,total+83.0),M['red'],segs=12,rings=8,coll=C_CITY)
    # facade floor lights at intervals
    for k,zz in enumerate(range(40,int(total*0.82),42)):
        box(f"{label}_FloorLightA{k}",(bw*0.30,0.25,0.18),(x-bw*0.18,y-bd*0.5-0.2,zz),M['warm'],coll=C_CITY,uv=False)
        box(f"{label}_FloorLightB{k}",(0.25,bd*0.26,0.18),(x+bw*0.5+0.2,y-bd*0.18,zz),M['edge'],coll=C_CITY,uv=False)
    print("MEGA",label,"h",round(total+84,1),"modules",len(stack),flush=True)

# ------------------------------------------------------------------ city district
CITY_TILE=[
 ('K46_MD_B', 195,-430, 7, 'K46_BldgMD_B', 1.0),
 ('K46_MD_D', 240,-455,-4, 'K46_BldgMD_D', 1.0),
 ('K46_MD_G', 205,-485,20, 'K46_BldgMD_G', 1.0),
 ('K32_M_A',  135,-345, 2, 'K32_BldgM_A',  1.0),
 ('K32_M_D',  300,-360,-8, 'K32_BldgM_D',  1.0),
]
for name,x,y,rot,key,_ in CITY_TILE:
    ob=clone(mods[key],name,C_BLDG,1.0)
    place_ground(ob,x,y,0.0,rot,C_BLDG)
    bb=world_bbox(ob); h=bb[1].z; w=bb[1].x-bb[0].x; d=bb[1].y-bb[0].y
    box(f"{name}_Pad",(w+6,d+6,0.35),(x,y,0.18),M['concrete'],coll=C_BLDG,bevel=0.04,uv=False)
    # ground-floor shop band / signage
    box(f"{name}_ShopGlow",(w*0.7,0.25,0.55),(x,y-d*0.5-0.3,4.2),M['warm'],coll=C_BLDG,uv=False)
    print("DISTRICT",name,"h",round(h,1),flush=True)
# 100 m street tile surfacing
box("District_Plaza",(150,120,0.08),(230,-410,0.13),M['concrete'],coll=C_GROUND,bevel=0.1,uv=False)
for i,x in enumerate(range(158,310,14)):
    box(f"District_JointX{i}",(0.12,120,0.01),(x,-410,0.18),M['dark'],coll=C_GROUND,uv=False)
for i,y in enumerate(range(-470,-350,14)):
    box(f"District_JointY{i}",(150,0.12,0.01),(230,y,0.18),M['dark'],coll=C_GROUND,uv=False)

# ------------------------------------------------------------------ CityStreets street pods
print("APPEND CITYSTREETS", flush=True)
CS_SPECS=[
 ('KB3D_CTS_Tree_A_Main',      (170,-518,0.12), 24, 1.0),
 ('KB3D_CTS_Tree_A_Main',      (302,-452,0.12), -12, 1.0),
 ('KB3D_CTS_BldgMD_E_Kiosk',   (188,-468,0.12), 8, 1.0),
 ('KB3D_CTS_Trailer_C_Main',   (258,-500,0.12), -18, 1.0),
 ('KB3D_CTS_BldgLG_A_Dumpster',(226,-514,0.12), 70, 1.0),
 ('KB3D_CTS_BldgMD_L_BenchA',  (158,-446,0.12), 90, 1.0),
 ('KB3D_CTS_BldgMD_F_Lamp',    (148,-482,0.12), 0, 1.0),
 ('KB3D_CTS_BldgMD_E_Billboard',(286,-476,0.12), -8, 1.0),
 ('KB3D_CTS_Sidewalk_A_Main',  (215,-455,0.10), 0, 1.0),
]
with bpy.data.libraries.load(CITYSTREETS_BLEND,link=False) as (src,dst):
    dst.objects=list(dict.fromkeys(n for n,_,_,_ in CS_SPECS if n in src.objects))
cs_objs=[o for o in dst.objects if o and o.type=='MESH']
for o in cs_objs:
    if o.parent:
        mw=o.matrix_world.copy(); o.parent=None; o.matrix_world=mw
    for c in list(o.users_collection): c.objects.unlink(o)
    C_PROPS.objects.link(o)
# join each named prop (they are single meshes here) and place
_used=set()
for name,loc,rot,cscale in CS_SPECS:
    o=next((x for x in cs_objs if x.name==name),None)
    if not o: continue
    if name in _used:
        o=o.copy(); o.data=o.data.copy(); C_PROPS.objects.link(o)
    _used.add(name)
    bpy.context.view_layer.objects.active=o
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    bb=[Vector(c) for c in o.bound_box]
    mn=Vector((min(v.x for v in bb),min(v.y for v in bb),min(v.z for v in bb)))
    mx=Vector((max(v.x for v in bb),max(v.y for v in bb),max(v.z for v in bb)))
    ctr=Vector(((mn.x+mx.x)/2,(mn.y+mx.y)/2,mn.z))
    o.data.transform(Matrix.Translation(-ctr))
    o.hide_render=False; o.hide_set(False)
    o.location=loc; o.rotation_euler=(0,0,math.radians(rot)); o.scale=(cscale,cscale,cscale)
    bpy.context.view_layer.update()
    print("CSPROP",name,[round(v,2) for v in o.dimensions],flush=True)

# ------------------------------------------------------------------ city infill blocks
INFILL=[
 ('INF_A', -520,-120, 8, 'K46_BldgMD_B', 0.80),
 ('INF_B', -520,  20, 4, 'K46_BldgMD_D', 0.80),
 ('INF_C', -300, 320, 12,'K46_BldgMD_G', 0.85),
 ('INF_D', -180, 190, -8,'K32_BldgM_A',  0.80),
 ('INF_E',   80, 185,  6, 'K32_BldgM_D',  0.82),
 ('INF_F',  300, 120,-10, 'K46_BldgMD_B', 0.80),
 ('INF_G',  480,  60, 14, 'K46_BldgMD_D', 0.80),
 ('INF_H',  500, 420,  2, 'K46_BldgMD_G', 0.85),
 ('INF_I',  100, 430, -6, 'K46_BldgLG_H', 0.80),
 ('INF_J',  -80, 430, 10, 'K46_BldgLG_E', 0.80),
 ('INF_K',  400,-300, -8, 'K46_BldgLG_H', 0.80),
 ('INF_L', -480,-280, 12, 'K46_BldgLG_E', 0.80),
 ('INF_M',  220, 330, 18, 'K46_BldgMD_G', 0.85),
 ('INF_N', -380, 430, -4, 'K46_BldgMD_B', 0.80),
]
for name,x,y,rot,key,dec in INFILL:
    ob=clone(mods[key],name,C_BLDG,dec)
    tint_mega(ob,(0.78,0.82,0.92))
    place_ground(ob,x,y,0.0,rot,C_BLDG)
    bb=world_bbox(ob); h=bb[1].z; w=bb[1].x-bb[0].x; d=bb[1].y-bb[0].y
    box(f"{name}_Pad",(w+5,d+5,0.30),(x,y,0.16),M['concrete'],coll=C_BLDG,bevel=0.04,uv=False)
    box(f"{name}_ShopBand",(w*0.72,0.25,0.55),(x,y-d*0.5-0.4,3.8),M['warm'],coll=C_BLDG,uv=False)
    for wi,zz in enumerate((h*0.38,h*0.66)):
        box(f"{name}_WinBand{wi}",(w*0.76,0.22,0.20),(x,y-d*0.5-0.4,zz),M['warm'],coll=C_BLDG,uv=False)
        box(f"{name}_WinBandEdge{wi}",(0.22,d*0.76,0.20),(x+w*0.5+0.4,y,zz),M['edge'],coll=C_BLDG,uv=False)
    box(f"{name}_RoofCap",(w*0.55,d*0.55,0.8),(x,y,h+0.3),M['iron'],coll=C_BLDG,bevel=0.05)
    cyl(f"{name}_Mast",0.10,7.0,(x+w*0.3,y+d*0.25,h+3.2),M['steel'],coll=C_BLDG,verts=6)
    sphere(f"{name}_Beacon",0.20,(x+w*0.3,y+d*0.25,h+6.8),M['red'],segs=8,rings=5,coll=C_BLDG)
    print("INFILL",name,"h",round(h,1),flush=True)

# ------------------------------------------------------------------ K034 rooftop props / K014 greebles
print("IMPORT K034/K014", flush=True)
# K034: keep authored prop geometry, normalize; original 4K materials
bpy.ops.wm.read_homefile(use_empty=False) if False else None
before=set(bpy.data.objects)
bpy.ops.import_scene.fbx(filepath=f"{K034_DIR}/Kitbash3D Props Rooftops.fbx")
new=[o for o in bpy.data.objects if o not in before and o.type=='MESH']
k34={}
for want in ['AntennaTower_MetalDark_2','AirHandlerXL_PlasticWhite','WaterTowerTall_MetalDark',
             'Spire_MetalLight_8','Spire_MetalDark_2','AntennaTower_MetalLight',
             'AntennaLG_MetalLight','SatelliteLG_PlasticWhite_5','BillboardTall_MetalDark_4',
             'AirHandlerLG_PlasticWhite','AirHandlerMD_MetalLight_2','VentE_MetalLight',
             'RoofAccessLG_MetalLight','PipesLow_MetalDark','FireEscape_MetalDark_2']:
    for o in new:
        if o.name==want or o.name.startswith(want+'.'):
            bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active=o
            if o.parent:
                mw=o.matrix_world.copy(); o.parent=None; o.matrix_world=mw
            bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active=o
            bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
            bb=[Vector(c) for c in o.bound_box]
            mn=Vector((min(v.x for v in bb),min(v.y for v in bb),min(v.z for v in bb)))
            mx=Vector((max(v.x for v in bb),max(v.y for v in bb),max(v.z for v in bb)))
            ctr=Vector(((mn.x+mx.x)/2,(mn.y+mx.y)/2,mn.z))
            o.data.transform(Matrix.Translation(-ctr)); o.location=(0,0,0)
            for c in list(o.users_collection): c.objects.unlink(o)
            C_PROPS.objects.link(o); hide(o); k34[want]=o
for o in new:
    if o not in k34.values() and o.name in bpy.data.objects:
        try: bpy.data.objects.remove(o,do_unlink=True)
        except Exception: pass
print("K034 protos",list(k34),flush=True)

before=set(bpy.data.objects)
bpy.ops.import_scene.fbx(filepath="/tmp/kb3d_greebles/Kitbash3d_Greebles.FBX")
new14=[o for o in bpy.data.objects if o not in before and o.type=='MESH']
k14={}
for want in ['Greeble_A','Greeble_B','Greeble_C','Greeble_D','Greeble_E','Greeble_F','Greeble_H','Greeble_I','Greeble_N','Greeble_S']:
    for o in new14:
        if o.name==want or o.name.startswith(want+'.'):
            bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active=o
            if o.parent:
                mw=o.matrix_world.copy(); o.parent=None; o.matrix_world=mw
            bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active=o
            bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
            bb=[Vector(c) for c in o.bound_box]
            mn=Vector((min(v.x for v in bb),min(v.y for v in bb),min(v.z for v in bb)))
            mx=Vector((max(v.x for v in bb),max(v.y for v in bb),max(v.z for v in bb)))
            ctr=Vector(((mn.x+mx.x)/2,(mn.y+mx.y)/2,mn.z))
            o.data.transform(Matrix.Translation(-ctr)); o.location=(0,0,0)
            for c in list(o.users_collection): c.objects.unlink(o)
            C_PROPS.objects.link(o); hide(o); k14[want]=o
            break
for o in new14:
    if o not in k14.values() and o.name in bpy.data.objects:
        try: bpy.data.objects.remove(o,do_unlink=True)
        except Exception: pass
print("K014 protos",list(k14),flush=True)

def k34_place(key,name,loc,rot=0,scale=1.0,coll=C_PORT):
    src=k34.get(key)
    if not src: return None
    o=src.copy(); o.data=src.data; o.name=name; unhide(o)
    if o.parent:
        mw=o.matrix_world.copy(); o.parent=None; o.matrix_world=mw
    coll.objects.link(o)
    o.location=loc; o.rotation_euler=(0,0,math.radians(rot)); o.scale=(scale,scale,scale)
    return o
def k14_place(key,name,loc,rot=0,scale=1.0,coll=C_PORT):
    src=k14.get(key)
    if not src: return None
    o=src.copy(); o.data=src.data; o.name=name; unhide(o)
    if o.parent:
        mw=o.matrix_world.copy(); o.parent=None; o.matrix_world=mw
    coll.objects.link(o)
    o.location=loc; o.rotation_euler=(0,0,math.radians(rot)); o.scale=(scale,scale,scale)
    return o

# terminal + warehouse + tower roof dressing
k34_place('AirHandlerXL_PlasticWhite','K34_TermAC_1',(-160,-455,23.6),20,1.4)
k34_place('AirHandlerLG_PlasticWhite','K34_TermAC_2',(-140,-467,23.6),-10,1.5)
k34_place('WaterTowerTall_MetalDark','K34_TermWater',(-112,-478,23.6),0,1.5)
k34_place('AntennaTower_MetalLight','K34_TermAntenna',(-180,-470,23.6),0,1.1)
k34_place('SatelliteLG_PlasticWhite_5','K34_TermDish',(-152,-477,33.0),35,1.0)
k34_place('BillboardTall_MetalDark_4','K34_TermBillboard',(-145,-467,33.0),180,0.8)
k34_place('AirHandlerXL_PlasticWhite','K34_WhAC_1',(-305,-470,19.7),0,1.6)
k34_place('WaterTowerTall_MetalDark','K34_WhWater',(-255,-492,19.7),0,1.7)
k34_place('AntennaTower_MetalDark_2','K34_WhAntenna',(-285,-455,19.7),0,1.2)
k34_place('AntennaLG_MetalLight','K34_CTAntenna',(-232,-512,76.0),0,1.0)
k34_place('AirHandlerMD_MetalLight_2','K34_CTBox',(-222,-505,53.0),0,1.2)
# hero tower roofs
for nm,x,y,h in [('K34_HeroA',-240,-135,220.2),('K34_HeroJ',245,-115,222.7),
                 ('K34_HeroI',-330,-55,238.0),('K34_HeroI2',350,-60,240.7)]:
    k34_place('AntennaTower_MetalDark_2',nm,(x,y+18,h),0,1.0,C_BLDG)
    k34_place('AirHandlerLG_PlasticWhite',nm+'_AC',(x+12,y-12,h),0,1.2,C_BLDG)
    k34_place('Spire_MetalDark_2',nm+'_Spire',(x-10,y+8,h),0,1.0,C_BLDG)
# midground roofs
for nm,x,y,h in [('K34_MidC',0,250,126.6),('K34_MidE',-500,220,140.9),
                 ('K34_MidG',520,220,88.3),('K34_MidE2',110,350,140.3),('K34_MidD',470,-150,98.1)]:
    k34_place('AntennaTower_MetalDark_2',nm,(x,y+10,h),0,1.0,C_BLDG)
    k34_place('WaterTowerTall_MetalDark',nm+'_W',(x-14,y-8,h),0,1.4,C_BLDG)

# K014 facade greebles: terminal, warehouse, tank bund, tower podiums
greeble_specs=[
 ('Greeble_A','TermGreeb_A',(-100,-478.7,5.0),0,1.2),
 ('Greeble_B','TermGreeb_B',(-160,-478.7,6.0),0,1.1),
 ('Greeble_D','TermGreeb_D',(-178,-455,8.0),90,1.1),
 ('Greeble_E','TermGreeb_E',(-100,-455,10.0),90,1.0),
 ('Greeble_H','TermGreeb_H',(-70,-479.1,14.0),0,1.1),
 ('Greeble_C','WhGreeb_C',(-250,-493.5,7.0),0,1.3),
 ('Greeble_F','WhGreeb_F',(-310,-493.5,9.0),0,1.3),
 ('Greeble_I','TankGreeb_I',(-290,-474,4.0),0,1.2),
 ('Greeble_N','HeroAGreeb',(-219,-157,22.0),0,2.0),
 ('Greeble_S','HeroJGreeb',(222,-137,24.0),0,2.0),
 ('Greeble_E','HeroIGreeb',(-309,-77,20.0),0,2.2),
]
for key,name,loc,rot,scale in greeble_specs:
    coll=C_BLDG if name.startswith('Hero') else C_PORT
    k14_place(key,name,loc,rot,scale,coll)
# K014 panels on the container-side wall
for i,key in enumerate(('Greeble_B','Greeble_D','Greeble_G')):
    if key in k14:
        k14_place(key,f"YardGreeb_{i}",(38+i*7,-475,6.0),180,1.5,C_PORT)

# ------------------------------------------------------------------ characters
print("APPEND CHARACTERS", flush=True)
char_names=['10_Idle2_Radio','12_Idle4_Crossedhands','17_Carrying1','26_Signal_Hold','9_Idle1']
with bpy.data.libraries.load(CHAR_BLEND,link=False) as (src,dst):
    dst.objects=[n for n in char_names if n in src.objects]
chars=[]
for o in dst.objects:
    if not o or o.type!='MESH': continue
    C_PEOPLE.objects.link(o)
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active=o
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    bb=[Vector(c) for c in o.bound_box]
    mn=Vector((min(v.x for v in bb),min(v.y for v in bb),min(v.z for v in bb)))
    mx=Vector((max(v.x for v in bb),max(v.y for v in bb),max(v.z for v in bb)))
    ctr=Vector(((mn.x+mx.x)/2,(mn.y+mx.y)/2,mn.z))
    o.data.transform(Matrix.Translation(-ctr)); o.location=(0,0,0)
    chars.append(o)
CH_PLACE=[('10_Idle2_Radio',(-30,-455,0.12),38),
          ('12_Idle4_Crossedhands',(-57,-432,0.12),-18),
          ('17_Carrying1',(18,-468,0.12),205),
          ('26_Signal_Hold',(9,-386,0.12),178),
          ('9_Idle1',(24,-404,0.12),-145)]
for name,loc,rot in CH_PLACE:
    ob=next((o for o in chars if o.name.startswith(name)),None)
    if not ob: continue
    ob.location=loc; ob.rotation_euler=(0,0,math.radians(rot))
    print("CHAR",name,[round(v,2) for v in ob.dimensions],flush=True)

# ------------------------------------------------------------------ A-30
print("IMPORT A-30", flush=True)
before=set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath="/Users/apple/.local/share/opencode/worktree/e0f2de/city-hero-sample/public/models/thunderbolt.glb")
ship_new=[o for o in bpy.data.objects if o not in before and o.type=='MESH']
ship_parts=[]
for o in ship_new:
    for c in list(o.users_collection): c.objects.unlink(o)
    C_SHIP.objects.link(o); ship_parts.append(o)
# keep authored transform (25.99 x 30.0 x 9.71), plant it on the pad
for o in ship_parts:
    if o.parent is None:
        pass
bpy.context.view_layer.update()
# move whole ship as a group to pad; bottom at z=0.65 (gear pads)
for o in ship_parts:
    o.location.x += 0
    o.location.y += -420
    o.location.z += 4.86
# gear pads / boarding stairs
sys.path.insert(0,HERE)
from city_port import ship_landing_gear, boarding_stairs
ship_landing_gear(C_SHIP,M,0,-420)
boarding_stairs(C_SHIP,M,0,-420)
print("SHIP",[(o.name,[round(v,1) for v in o.dimensions]) for o in ship_parts],flush=True)

# ------------------------------------------------------------------ lighting
print("LIGHTING", flush=True)
try:
    world_image_sky(sc,SKY_HDR,strength=0.22,rot_z=118)
except Exception as e:
    print("world fail",e)
    w=bpy.data.worlds.new("Sky"); sc.world=w; w.use_nodes=True
    w.node_tree.nodes['Background'].inputs['Color'].default_value=(0.18,0.25,0.35,1)
    w.node_tree.nodes['Background'].inputs['Strength'].default_value=1.0
# physical sun
sun=make_light("Sun_Key",'SUN',(-900,-750,360),9.5,(1.0,0.61,0.34),coll=C_LIGHT,angle=math.radians(1.4))
point_at(sun,(0,100,0))
# sky / city fills
for nm,loc,tgt,power,color,size in [
    ("Sky_Fill",(0,-700,450),(0,150,150),32000,(0.42,0.62,1.0),(1000,360)),
    ("City_Fill",(250,800,420),(0,250,180),38000,(0.60,0.76,1.0),(900,320)),
    ("City_Rim",(700,250,420),(100,220,240),30000,(0.48,0.68,1.0),(600,260)),
    ("Port_Key",(-260,-650,70),(0,-360,20),42000,(1.0,0.78,0.56),(300,120)),
    ("Pad_Key",(0,-420,48),(0,-420,0),18000,(1.0,0.80,0.56),(70,50)),
    ("Terminal_Fill",(-60,-560,26),(-132,-450,16),16000,(0.55,0.72,1.0),(120,60)),
    ("West_Fill",(-500,-450,60),(-250,-380,20),22000,(0.58,0.74,1.0),(220,100)),
    ("Deck_Wash",(0,-120,190),(10,-200,0),62000,(0.68,0.78,0.94),(1000,720)),
    ("Port_Bounce",(-40,-430,30),(-20,-420,2),9000,(0.95,0.78,0.58),(120,70)),
]:
    lo=make_light(nm,'AREA',loc,power,color,size=size,coll=C_LIGHT)
    point_at(lo,tgt)
# atmospheric haze volume
me=bpy.data.meshes.new("Atmosphere")
bm=bmesh.new()
bmesh.ops.create_cube(bm,size=1.0)
bmesh.ops.scale(bm,vec=(2400,2400,900),verts=bm.verts)
bmesh.ops.translate(bm,vec=(0,0,340),verts=bm.verts)
bm.to_mesh(me); bm.free()
atmo=bpy.data.objects.new("Atmosphere",me); link(atmo,C_LIGHT)
mat=bpy.data.materials.new("Atmosphere_Volume"); mat.use_nodes=True
nt=mat.node_tree; nt.nodes.clear()
out=nt.nodes.new('ShaderNodeOutputMaterial'); out.location=(300,0)
vol=nt.nodes.new('ShaderNodeVolumePrincipled'); vol.location=(0,0)
vol.inputs['Color'].default_value=(0.58,0.68,0.82,1)
vol.inputs['Density'].default_value=0.00009
vol.inputs['Anisotropy'].default_value=0.35
nt.links.new(vol.outputs['Volume'],out.inputs['Volume'])
atmo.data.materials.append(mat)

# ------------------------------------------------------------------ render settings
sc.render.engine='CYCLES'
prefs=bpy.context.preferences.addons['cycles'].preferences
try:
    prefs.compute_device_type='METAL'; prefs.get_devices()
    for d in prefs.devices: d.use=(d.type=='METAL')
    sc.cycles.device='GPU'
except Exception as e:
    print("GPU",e)
sc.cycles.samples=160
sc.cycles.use_denoising=True
try: sc.cycles.denoiser='OPENIMAGEDENOISE'
except Exception: pass
sc.cycles.max_bounces=8
sc.cycles.diffuse_bounces=4
sc.cycles.glossy_bounces=4
sc.cycles.transmission_bounces=4
sc.cycles.volume_bounces=2
sc.cycles.use_adaptive_sampling=True
sc.cycles.adaptive_threshold=0.015
sc.render.resolution_x=1920; sc.render.resolution_y=1200
sc.render.resolution_percentage=100
sc.render.film_transparent=False
sc.view_settings.view_transform='AgX'
try: sc.view_settings.look='AgX - Medium High Contrast'
except Exception: pass
sc.view_settings.exposure=0.34
sc.render.image_settings.file_format='PNG'
sc.render.image_settings.color_mode='RGB'
sc.render.image_settings.compression=15
sc.render.use_persistent_data=True
sc.render.threads_mode='AUTO'

# compositor: fog glow + subtle vignette
tree=bpy.data.node_groups.new("NautilusComp",'CompositorNodeTree')
sc.compositing_node_group=tree
sc.use_nodes=True
rl=tree.nodes.new('CompositorNodeRLayers'); rl.location=(-600,0)
gl=tree.nodes.new('CompositorNodeGlare'); gl.location=(-320,0)
gl.inputs['Type'].default_value='Fog Glow'; gl.inputs['Quality'].default_value='High'
gl.inputs['Threshold'].default_value=1.2; gl.inputs['Strength'].default_value=0.22
gl.inputs['Size'].default_value=0.6
tree.links.new(rl.outputs['Image'],gl.inputs['Image'])
ell=tree.nodes.new('CompositorNodeEllipseMask'); ell.location=(-320,-260)
ell.inputs['Size'].default_value=(1.05,1.05)
blur=tree.nodes.new('CompositorNodeBlur'); blur.location=(-100,-260)
blur.inputs['Size'].default_value=(220,220)
tree.links.new(ell.outputs['Mask'],blur.inputs['Image'])
mixv=tree.nodes.new('ShaderNodeMix'); mixv.data_type='RGBA'; mixv.blend_type='MULTIPLY'
mixv.location=(100,0); mixv.inputs[0].default_value=0.22
tree.links.new(gl.outputs['Image'],mixv.inputs[6])
tree.links.new(blur.outputs['Image'],mixv.inputs[7])
tree.interface.new_socket(name="Image",in_out='OUTPUT',socket_type='NodeSocketColor')
comp=tree.nodes.new('NodeGroupOutput'); comp.location=(420,0)
tree.links.new(mixv.outputs[2],comp.inputs[0])

# ------------------------------------------------------------------ cameras
def camera(name,loc,target,lens=35,fstop=8.0,focus=None):
    cd=bpy.data.cameras.new(name); ob=bpy.data.objects.new(name,cd); link(ob,C_CAM)
    ob.location=loc; cd.lens=lens; cd.clip_start=0.15; cd.clip_end=12000
    point_at(ob,target)
    if fstop:
        cd.dof.use_dof=True; cd.dof.aperture_fstop=fstop
        cd.dof.focus_distance=(Vector(target)-Vector(loc)).length if focus is None else focus
    return ob
cam_wide=camera("Cam_Wide",(-92,-566,12),(-46,-430,30),28,6.3)
cam_pad=camera("Cam_Pad",(-48,-496,4.8),(-2,-420,6.4),38,4.0)
cam_aerial=camera("Cam_Aerial",(-600,-980,430),(0,80,250),26,11.0)
cam_detail=camera("Cam_Detail",(-58,-505,4.2),(-18,-445,6.0),55,3.2)
sc.camera=cam_wide

# ------------------------------------------------------------------ save/report
bpy.ops.wm.save_as_mainfile(filepath=BLEND)
print("SAVED",BLEND,flush=True)
# stats
tot=0; per={}
for o in bpy.context.scene.objects:
    if o.type=='MESH' and not o.hide_render:
        n=tri_count(o); tot+=n
        per[o.users_collection[0].name if o.users_collection else '?']=per.get(o.users_collection[0].name if o.users_collection else '?',0)+n
print("SCENE TRIS",tot,flush=True)
print("TRIS BY COLL",per,flush=True)
with open(f"{ROOT}/build_report.json","w") as f:
    json.dump({"tris":tot,"by_collection":per},f,indent=1)
