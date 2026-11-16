"""Render hero shots from the saved city scene.
Usage: Blender -b -P render_city.py -- --shots wide,pad,aerial --res 960x600 --samples 48
"""
import bpy, sys, os, math, time
from mathutils import Vector
ROOT="/private/tmp/city-hero"
BLEND=f"{ROOT}/scene.blend"
OUT=f"{ROOT}/renders_raw"
os.makedirs(OUT,exist_ok=True)
argv=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
def arg(name,default=None):
    if name in argv:
        i=argv.index(name); return argv[i+1]
    return default
shots=(arg('--shots','wide,pad,aerial')).split(',')
res=arg('--res','960x600'); rx,ry=[int(x) for x in res.lower().split('x')]
samples=int(arg('--samples','48'))
tag=arg('--tag','test')
bpy.ops.wm.open_mainfile(filepath=BLEND)
sc=bpy.context.scene
sc.render.resolution_x=rx; sc.render.resolution_y=ry
sc.cycles.samples=samples
sc.cycles.use_denoising=True
try: sc.cycles.denoiser='OPENIMAGEDENOISE'
except Exception: pass
sc.render.image_settings.file_format='PNG'
sc.render.image_settings.color_mode='RGB'
sc.render.image_settings.compression=10
# path fixes for appended Modelshop images
for im in bpy.data.images:
    if im.source=='FILE' and im.filepath:
        p=im.filepath.replace('\\','/')
        if not os.path.exists(p):
            base=os.path.basename(p)
            cand=f"/tmp/ms_char/textures/{base}"
            if os.path.exists(cand):
                im.filepath=cand
# camera tweaks for iteration
CAM_OVERRIDES={
 'wide':((-55,-600,20),(-40,-430,28),30,6.3),
 'pad':((-48,-496,4.8),(-2,-420,6.4),38,4.0),
 'aerial':((-600,-980,430),(0,80,250),26,11.0),
 'detail':((-110,-545,8),(-140,-465,14),50,5.6),
}
for name,(loc,tgt,lens,fs) in CAM_OVERRIDES.items():
    ob=bpy.data.objects.get('Cam_'+name.capitalize()) or bpy.data.objects.get({'wide':'Cam_Wide','pad':'Cam_Pad','aerial':'Cam_Aerial','detail':'Cam_Detail'}[name])
    if not ob: continue
    ob.location=loc
    d=Vector(tgt)-Vector(loc)
    ob.rotation_euler=d.to_track_quat('-Z','Y').to_euler()
    ob.data.lens=lens
    ob.data.dof.use_dof=True; ob.data.dof.aperture_fstop=fs; ob.data.dof.focus_distance=d.length
for s in shots:
    cam={'wide':'Cam_Wide','pad':'Cam_Pad','aerial':'Cam_Aerial','detail':'Cam_Detail'}.get(s)
    if not cam: continue
    sc.camera=bpy.data.objects[cam]
    sc.render.filepath=f"{OUT}/{tag}_{s}.png"
    t=time.time(); bpy.ops.render.render(write_still=True)
    print("RENDER",s,round(time.time()-t,1),sc.render.filepath,flush=True)
