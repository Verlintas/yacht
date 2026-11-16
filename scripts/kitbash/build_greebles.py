"""Import K014 Greebles + K034 Props Rooftops as prototype objects,
normalize them, assign the scene's PBR materials, and dress the hero terminal,
midground K039 towers and background megatowers.
"""
import bpy, os, sys, random, math
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib_kb3d import *

K014 = "/tmp/kb3d_greebles/Kitbash3d_Greebles.FBX"
K034 = "/tmp/kb3d_rooftops/Kitbash3D Props Rooftops.fbx"

K014_KEYS = ['Greeble_A','Greeble_B','Greeble_C','Greeble_D','Greeble_E','Greeble_F',
             'Greeble_G','Greeble_H','Greeble_I','Greeble_N','Greeble_O','Greeble_S',
             'Greeble_V','Greeble_W','Greeble_AA','Greeble_BB','Greeble_DD']
K034_KEYS = [
    'AirHandlerXL_PlasticWhite','AirHandlerLG_PlasticWhite','AirHandlerMD_MetalLight',
    'AirHandlerSM_PlasticWhite','WaterTowerTall_MetalDark','WaterTowerLow_MetalBlue',
    'WaterTank_MetalRed','AntennaTower_MetalDark_2','AntennaTower_MetalLight',
    'AntennaLG_MetalLight','AntennaSM_MetalDark','SatelliteLG_PlasticWhite_5',
    'AntDishA_PlasticWhite','BillboardTall_MetalDark_4','BillboardShort_MetalDark_2',
    'FireEscape_MetalDark_7','FireEscape_MetalDark_2','SkylightLG_MetalDark',
    'SkylightLONG_MetalDark','VentE_MetalLight','PipesLow_MetalDark',
    'BoxVentLOW_MetalLight','Platform_MetalDark_5','Spire_MetalDark_2',
    'Spire_MetalLight_5','SpireNeedle_MetalDark','AntennaTower_PlasticWhite_3',
    'RoofAccessLG_MetalLight','AirHandlerXL_MetalDark',
]

def _mat_for(name):
    n=(name or '').lower()
    if 'glass' in n: return bpy.data.materials.get('KB3D_Glass')
    if 'chrome' in n or 'silver' in n: return bpy.data.materials.get('KB3D_MetalSilver')
    if 'blue' in n: return bpy.data.materials.get('KB3D_PanelsLightBlue')
    if 'red' in n or 'brown' in n or 'wood' in n: return bpy.data.materials.get('KB3D_PanelsBrown')
    if 'dark' in n: return bpy.data.materials.get('KB3D_Iron')
    if 'white' in n or 'plastic' in n: return bpy.data.materials.get('KB3D_PanelsWhite')
    if 'metal' in n: return bpy.data.materials.get('KB3D_Metal')
    return bpy.data.materials.get('KB3D_Metal')

def _prep(o, coll):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True); bpy.context.view_layer.objects.active=o
    bpy.context.view_layer.update()
    if o.parent is not None:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_parent_inverse.identity()
        o.matrix_world = mw
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if o.data.users > 1:
        o.data=o.data.copy()
    bb=[Vector(c) for c in o.bound_box]
    mn=Vector((min(v.x for v in bb),min(v.y for v in bb),min(v.z for v in bb)))
    mx=Vector((max(v.x for v in bb),max(v.y for v in bb),max(v.z for v in bb)))
    ctr=Vector(((mn.x+mx.x)/2,(mn.y+mx.y)/2,mn.z))
    o.data.transform(Matrix.Translation(-ctr))
    o.location=(0,0,0)
    for slot in o.material_slots:
        if slot.material:
            slot.material=_mat_for(slot.material.name)
    for c in list(o.users_collection): c.objects.unlink(o)
    coll.objects.link(o)
    o.hide_render=True; o.hide_set(True)
    return o

class Greebles:
    def __init__(self, proto_coll):
        self.proto={}
        self.proto_coll=proto_coll
        self._load(K014,'K014_',K014_KEYS)
        self._load(K034,'K034_',K034_KEYS)
        print("GREEBLE PROTOS",len(self.proto), sorted(self.proto.keys()))
    def _load(self,path,prefix,keys):
        before=set(bpy.data.objects)
        bpy.ops.import_scene.fbx(filepath=path)
        new=[o for o in bpy.data.objects if o not in before and o.type=='MESH']
        by={o.name:o for o in new}
        selected=[]
        for k in keys:
            if k in by: selected.append((k,by[k]))
        # fallback exact suffix variants
        for k,o in by.items():
            base=k.split('.')[0]
            if base in keys and (base,o) not in selected:
                selected.append((base,o))
        selset={o for _,o in selected}
        for k,o in selected:
            try:
                p=_prep(o,self.proto_coll)
                self.proto[f"{prefix}{k}"]=p
            except Exception as e:
                print("greeble prep fail",k,e)
        # delete unselected imports
        for o in new:
            if o not in selset and o.name in bpy.data.objects:
                try: bpy.data.objects.remove(o,do_unlink=True)
                except Exception: pass
    def place(self,key,loc,rot=0,scale=1,coll=None):
        p=self.proto.get(key)
        if not p: return None
        o=p.copy(); o.data=p.data; o.hide_render=False; o.hide_set(False)
        if coll: coll.objects.link(o)
        else: bpy.context.scene.collection.objects.link(o)
        o.location=loc; o.rotation_euler=(0,0,math.radians(rot)); o.scale=(scale,scale,scale)
        return o

def dress_terminal(G, term_bb, wh_bb, tw_bb, C_PORT):
    mn,mx=term_bb; cx=(mn.x+mx.x)/2; fy=mn.y
    # facade greeble panels low + mid
    panels=[('K014_Greeble_A',-30,6,1.3,0),('K014_Greeble_B',-20,4,1.2,0),
            ('K014_Greeble_C',-47,8,1.1,90),('K014_Greeble_D',34,4,1.2,0),
            ('K014_Greeble_E',40,7,1.2,-90),('K014_Greeble_F',-28,12,1.25,0),
            ('K014_Greeble_H',36,12,1.4,0),('K014_Greeble_I',48,13,1.2,90)]
    for k,x,z,s,r in panels:
        G.place(k,(x,fy-0.7,z),r,s,C_PORT)
    # roof dressing
    roof=mx.z*0+29.2
    G.place('K034_AirHandlerXL_PlasticWhite',(-16,98,roof),20,2.0,C_PORT)
    G.place('K034_AirHandlerLG_PlasticWhite',(35,98,roof),-10,2.2,C_PORT)
    G.place('K034_AirHandlerMD_MetalLight',(35,126,roof),0,2.0,C_PORT)
    G.place('K034_WaterTowerTall_MetalDark',(-16,128,roof),0,2.2,C_PORT)
    G.place('K034_SatelliteLG_PlasticWhite_5',(40,108,roof),35,2.0,C_PORT)
    G.place('K034_AntennaTower_MetalLight',(40,130,roof),0,1.8,C_PORT)
    G.place('K034_SkylightLG_MetalDark',(-15,116,roof),0,2.5,C_PORT)
    G.place('K034_PipesLow_MetalDark',(34,118,roof),0,2.2,C_PORT)
    G.place('K034_VentE_MetalLight',(-15,126,roof),0,2.0,C_PORT)
    G.place('K034_BillboardTall_MetalDark_4',(10,134,roof),180,2.0,C_PORT)
    # fire escapes on side / warehouse
    G.place('K034_FireEscape_MetalDark_7',(-42,100,6),90,2.2,C_PORT)
    G.place('K034_FireEscape_MetalDark_2',(62,108,5),-90,2.0,C_PORT)
    G.place('K034_AntennaTower_PlasticWhite_3',(48,124,roof+3),0,1.6,C_PORT)
    # warehouse roof
    wmn,wmx=wh_bb; wroof=21.5
    G.place('K034_AirHandlerSM_PlasticWhite',(-110,126,wroof),0,2.0,C_PORT)
    G.place('K034_WaterTank_MetalRed',(-86,132,wroof),0,2.0,C_PORT)
    G.place('K034_VentE_MetalLight',(-100,120,wroof),0,2.0,C_PORT)
    G.place('K034_FireEscape_MetalDark_2',(-130,130,4),90,1.8,C_PORT)
    G.place('K034_BillboardShort_MetalDark_2',(-100,128,24),180,1.8,C_PORT)
    # tower roof
    tmn,tmx=tw_bb
    G.place('K034_AntennaLG_MetalLight',(96,132,47),0,1.8,C_PORT)
    G.place('K034_SatelliteLG_PlasticWhite_5',(92,136,47),20,1.4,C_PORT)
    G.place('K034_AirHandlerMD_MetalLight',(101,127,47),90,1.2,C_PORT)
    G.place('K034_FireEscape_MetalDark_7',(105,132,4),90,1.6,C_PORT)

def dress_midground(G, bb, key, C_CITY, seed=0):
    mn,mx=bb; w=mx.x-mn.x; d=mx.y-mn.y; h=mx.z-mn.z
    cx=(mn.x+mx.x)/2; fy=mn.y
    rng=random.Random(seed)
    # facade greeble clusters on the lower 100 m
    keys=['K014_Greeble_A','K014_Greeble_B','K014_Greeble_C','K014_Greeble_D',
          'K014_Greeble_E','K014_Greeble_F','K014_Greeble_H','K014_Greeble_I',
          'K014_Greeble_N','K014_Greeble_S']
    for i,(z,s) in enumerate([(22,4.0),(45,5.0),(70,5.5),(92,4.5)]):
        k=keys[(seed+i)%len(keys)]
        x=cx + (rng.uniform(-0.28,0.28))*w
        G.place(k,(x,fy-1.0,z),0,s,C_CITY)
        if i%2==0:
            G.place('K034_FireEscape_MetalDark_7',(mn.x+2,fy+2,z-8),0,3.2,C_CITY)
    # AC / billboard / vents on front
    G.place('K034_AirHandlerXL_MetalDark',(cx-w*0.2,fy-2,34),0,4.0,C_CITY)
    G.place('K034_AirHandlerXL_PlasticWhite',(cx+w*0.22,fy-2,66),0,4.5,C_CITY)
    G.place('K034_BillboardTall_MetalDark_4',(cx,fy-3,min(100,h*0.55)),180,3.2,C_CITY)
    G.place('K034_PipesLow_MetalDark',(cx-w*0.34,fy-2,52),0,4.0,C_CITY)
    # roof
    G.place('K034_AntennaTower_MetalDark_2',(cx,fy+d*0.45,mx.z-2),0,3.0,C_CITY)
    G.place('K034_WaterTowerTall_MetalDark',(cx-w*0.28,fy+d*0.35,mx.z-2),0,3.0,C_CITY)
    G.place('K034_AirHandlerLG_PlasticWhite',(cx+w*0.25,fy+d*0.3,mx.z-2),0,3.0,C_CITY)
    # large lit window bands / facade breakup
    for i,z in enumerate((28,52,76,100)):
        if z>h*0.85: continue
        bw=w*rng.uniform(0.30,0.48)
        box(f"{key}_WinBand_{i}",(bw,0.7,1.5),(cx,fy-1.2,z),bpy.data.materials.get('Edge_Glow_Warm'),coll=C_CITY,uv=False)
        box(f"{key}_WinBar_{i}",(bw*1.04,0.9,2.0),(cx,fy-0.8,z),bpy.data.materials.get('Paint_Dark'),coll=C_CITY,bevel=0.03)
    # side service pipes/spines
    for j,off in enumerate((-0.38,0.36)):
        px=cx+off*w
        cyl(f"{key}_Spine_{j}",1.0,min(110,h*0.8),(px,fy+d*0.4,min(110,h*0.8)/2),bpy.data.materials.get('KB3D_Metal'),coll=C_CITY,verts=10)
        for z in range(12,100,18):
            box(f"{key}_SpineClamp_{j}_{z}",(2.4,2.4,0.6),(px,fy+d*0.4,z),bpy.data.materials.get('KB3D_Iron'),coll=C_CITY,bevel=0.02)
    # vertical neon corner
    box(f"{key}_CornerNeon",(0.35,0.35,min(95,h*0.75)),(mn.x+1.2,fy-1.4,min(95,h*0.75)/2),
        bpy.data.materials.get('Edge_Glow'),coll=C_CITY,uv=False)

def dress_background(G, bb, key, joints, C_CITY, seed=0):
    mn,mx=bb; w=mx.x-mn.x; d=mx.y-mn.y; h=mx.z-mn.z
    cx=(mn.x+mx.x)/2; fy=mn.y
    rng=random.Random(seed)
    # huge greeble clusters at the base and joints
    keys=['K014_Greeble_A','K014_Greeble_B','K014_Greeble_C','K014_Greeble_D',
          'K014_Greeble_E','K014_Greeble_H','K014_Greeble_I']
    levels=[25,95]+[j for j in joints[1:-1]]
    for i,z in enumerate(levels):
        if z>h*0.8: continue
        k=keys[(seed+i)%len(keys)]
        x=cx+rng.uniform(-0.25,0.25)*w
        G.place(k,(x,fy-2.0,z),0,rng.uniform(10,18),C_CITY)
    G.place('K034_AntennaTower_MetalDark_2',(cx,fy+d*0.4,mx.z-4),0,12.0,C_CITY)
    G.place('K034_Spire_MetalDark_2',(cx-w*0.22,fy+d*0.3,mx.z-4),0,10.0,C_CITY)
    G.place('K034_AirHandlerXL_PlasticWhite',(cx+w*0.2,fy+d*0.2,min(mx.z*0.5,220)),0,15.0,C_CITY)
    # window/light bands every ~80m
    for i,z in enumerate(range(70, int(h*0.85), 80)):
        bw=w*rng.uniform(0.25,0.42)
        box(f"{key}_Band_{i}",(bw,1.2,2.2),(cx,fy-2.2,z),bpy.data.materials.get('Edge_Glow_Warm'),coll=C_CITY,uv=False)
    # giant billboard screen on the lower facade
    G.place('K034_BillboardTall_MetalDark_4',(cx,fy-3.0,130),180,8.0,C_CITY)
