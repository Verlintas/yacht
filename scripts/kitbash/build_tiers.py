"""Three-tier city: 5-6x K039 midground towers, low-rise blocks,
and 500-850 m background megatowers stacked from K039 MD/SM modules."""
import bpy, math, random
from mathutils import Vector
from lib_kb3d import *
from build_greebles import dress_midground as _dress_mid, dress_background as _dress_bg

def _unhide(ob):
    ob.hide_render=False; ob.hide_set(False)


MIDGROUND = [
    ('BldgLG_G', -330, 430, 5.0, -8,  'G'),
    ('BldgLG_H', -120, 400, 4.5,  6,  'H'),
    ('BldgLG_I',  120, 440, 5.0, -4,  'I'),
    ('BldgLG_J',  340, 430, 5.0,  8,  'J'),
    ('BldgLG_C', -520, 440, 3.5,  0,  'C'),
    ('BldgLG_D',  520, 450, 4.0,  0,  'D'),
]

BACKGROUND = [
    # label, x, y, rot, base(key, scale, decimate), upper(key, scale, decimate)|None, spire_scale
    ('M1', -380, 560, -6, ('BldgLG_G',20.0,0.18), ('BldgLG_G',8.0,0.20), 3),
    ('M2',  -40, 600,  4, ('BldgLG_H',20.0,0.16), ('BldgLG_H',8.0,0.20), 3),
    ('M3',  300, 680, -8, ('BldgLG_I',18.0,0.22), ('BldgLG_J',12.0,0.24), 3),
    ('M4',  450, 740,  7, ('BldgLG_D',25.0,0.25), ('BldgLG_G',8.0,0.20), 3),
    ('M5', -150, 700, 10, ('BldgLG_G',16.0,0.18), ('BldgLG_J',8.0,0.24), 3),
]

def _decimate_copy(src, ratio, coll):
    ob=src.copy(); ob.data=src.data.copy()
    ob.hide_render=False; ob.hide_set(False)
    if coll: coll.objects.link(ob)
    else: bpy.context.scene.collection.objects.link(ob)
    if ratio < 0.999 and len(ob.data.polygons)>500:
        md=ob.modifiers.new("bg_dec",'DECIMATE'); md.decimate_type='COLLAPSE'; md.ratio=ratio
        try: md.use_collapse_triangulate=True
        except Exception: pass
        bpy.context.view_layer.objects.active=ob
        bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
        bpy.ops.object.modifier_apply(modifier=md.name)
    return ob

def build_midground(mods, coll, city_coll, G, dress=True):
    out=[]
    for key,x,y,s,rz,label in MIDGROUND:
        if key not in mods: continue
        ob=mods[key]; _unhide(ob)
        place(ob,(x,y,0),rz,s,coll)
        bpy.context.view_layer.update()
        bb=bbox(ob)
        out.append({'label':label,'key':key,'scale':s,'pos':[x,y],'bbox':bb,
                    'height':round(bb[1].z-bb[0].z,1),'dims':[round(bb[1][i]-bb[0][i],1) for i in range(3)]})
        if dress:
            _dress_mid(G,bb,label,city_coll,seed=sum(ord(c) for c in label)%97)
    print("MIDGROUND",[(o['label'],o['height'],o['scale']) for o in out])
    return out

def build_background(mods, coll, city_coll, G, dress=True):
    out=[]
    for label,x,y,rz,base,upper,spire_scale in BACKGROUND:
        bk,bs,br=base
        if bk not in mods: continue
        ob=_decimate_copy(mods[bk],br,city_coll)
        ob.name=f"MEGA_{label}_base_{bk}"
        place(ob,(x,y,0),rz,bs,city_coll)
        bpy.context.view_layer.update(); bb=bbox(ob)
        base_h=bb[1].z-bb[0].z; base_w=bb[1].x-bb[0].x; base_d=bb[1].y-bb[0].y
        z=base_h*0.94
        joint=z
        if upper:
            uk,us,ur=upper
            if uk in mods:
                up=_decimate_copy(mods[uk],ur,city_coll)
                up.name=f"MEGA_{label}_upper_{uk}"
                place(up,(x,y,z),rz,us,city_coll)
                bpy.context.view_layer.update(); ub=bbox(up)
                up_h=ub[1].z-ub[0].z
                # collar / greeble band at the stack joint
                box(f"MEGA_{label}_Collar",(base_w+18,base_d+18,16),(x,y,z+4),
                    bpy.data.materials.get('KB3D_Iron'),coll=city_coll,bevel=0.4)
                box(f"MEGA_{label}_CollarLight",(base_w+12,base_d+12,0.8),(x,y,z+12),
                    bpy.data.materials.get('Edge_Glow_Warm'),coll=city_coll,uv=False)
                z += up_h*0.96
        total_h=z
        # vertical mega service spines at base corners
        for j,(sx,sy) in enumerate([(-1,-1),(1,-1),(-1,1),(1,1)]):
            px=x+sx*base_w*0.42; py=y+sy*base_d*0.36
            cyl(f"MEGA_{label}_Spine_{j}",4.0,total_h*0.9,(px,py,total_h*0.45),
                bpy.data.materials.get('KB3D_Metal'),coll=city_coll,verts=10)
            for zz in range(60,int(total_h*0.9),100):
                box(f"MEGA_{label}_SpineBand_{j}_{zz}",(11,11,4),(px,py,zz),
                    bpy.data.materials.get('KB3D_Iron'),coll=city_coll,bevel=0.25)
        # crown + antenna
        box(f"MEGA_{label}_Crown",(base_w*0.55,base_d*0.55,14),(x,y,z-5),
            bpy.data.materials.get('KB3D_Iron'),coll=city_coll,bevel=0.3)
        if spire_scale:
            G.place('K034_Spire_MetalDark_2',(x,y,z-2),0,spire_scale,city_coll)
        sphere(f"MEGA_{label}_Beacon",2.2,(x,y,z+spire_scale*21.3),
               bpy.data.materials.get('Neon_Red'),segs=12,rings=8,coll=city_coll)
        if dress:
            _dress_bg(G,(Vector((x-base_w/2,y-base_d/2,0)),Vector((x+base_w/2,y+base_d/2,total_h))),
                      label,[joint],city_coll,seed=sum(ord(c) for c in label)%89)
        out.append({'label':label,'pos':[x,y],'base':base,'upper':upper,'height':round(total_h,1),
                    'height_with_spire':round(total_h+spire_scale*21.3,1),'joint':round(joint,1)})
    print("BACKGROUND",[(o['label'],o['height'],o['height_with_spire']) for o in out])
    return out

def low_rise(mods, city_coll, G, seed=5):
    rng=random.Random(seed)
    specs=[('BldgMD_A',-480,500,4.0,-20),('BldgMD_C',-300,490,4.5,10),
           ('BldgMD_G',-120,505,4.0,0),('BldgMD_F',80,495,4.5,25),
           ('BldgMD_A',260,505,4.0,-15),('BldgMD_C',460,500,4.2,10),
           ('BldgSM_C',-190,515,4.0,0),('BldgSM_H',160,520,3.5,0)]
    for i,(key,x,y,s,rz) in enumerate(specs):
        if key not in mods: continue
        ob=mods[key].copy(); ob.data=mods[key].data
        ob.name=f"LOW_{i}_{key}"; _unhide(ob)
        place(ob,(x,y,0),rz,s,city_coll)
        bpy.context.view_layer.update(); bb=bbox(ob)
        # rooftop breakups
        try:
            G.place('K034_AirHandlerXL_PlasticWhite',(x,y+2,bb[1].z-0.5),rng.randint(0,90),2.5,city_coll)
            G.place('K034_WaterTowerTall_MetalDark',(x+8,y-4,bb[1].z-0.5),0,2.0,city_coll)
            G.place('K034_BillboardShort_MetalDark_2',(x,y-6,bb[1].z+4),180,2.0,city_coll)
            box(f"LOW_{i}_Band",(max(20,(bb[1].x-bb[0].x)*0.5),0.8,1.0),
                (x,bb[0].y-1.0,bb[1].z*0.55),bpy.data.materials.get('Edge_Glow_Warm'),coll=city_coll,uv=False)
        except Exception as e:
            print("low-rise dress",e)
    print("LOWRISE",len(specs))
