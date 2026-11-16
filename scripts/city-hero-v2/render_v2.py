"""Render the Nautilus Reach v2 scene.

Usage:
  Blender -b -P scripts/city-hero-v2/render_v2.py -- --shots wide,pad,aerial,detail \
      --res 960x600 --samples 48 --tag test
"""
import bpy, sys, os, time
from mathutils import Vector

ROOT = "/private/tmp/city-hero-v2"
BLEND = f"{ROOT}/scene.blend"
OUT = f"{ROOT}/renders_raw"
os.makedirs(OUT, exist_ok=True)

argv = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
def arg(name, default=None):
    return argv[argv.index(name)+1] if name in argv else default

shots = arg('--shots', 'wide,pad,aerial,detail').split(',')
res = arg('--res', '960x600')
rx, ry = [int(v) for v in res.lower().split('x')]
samples = int(arg('--samples', '48'))
tag = arg('--tag', 'test')

bpy.ops.wm.open_mainfile(filepath=BLEND)
sc = bpy.context.scene
sc.render.resolution_x = rx
sc.render.resolution_y = ry
sc.render.resolution_percentage = 100
sc.cycles.samples = samples
sc.cycles.use_denoising = True
try: sc.cycles.denoiser = 'OPENIMAGEDENOISE'
except Exception: pass
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_mode = 'RGB'
sc.render.image_settings.compression = 10

# Keep the authored camera set, but allow quick iteration overrides.
CAM = {
    'wide': 'Cam_Wide',
    'termwide': 'Cam_TermWide',
    'pad': 'Cam_Pad',
    'aerial': 'Cam_Aerial',
    'aerial_low': 'Cam_AerialLow',
    'detail': 'Cam_Detail',
    'hero': 'Cam_Hero',
}
OVERRIDES = {
    # name: (loc, target, lens, fstop)
    'wide': ((-100, -595, 4.0), (-50, -350, 45), 24, 8.0),
    'termwide': ((-170, -575, 4.8), (-100, -430, 38), 35, 8.0),
    'pad': ((-45, -520, 3.0), (4, -420, 6.5), 50, 7.1),
    'aerial': ((-800, -1100, 600), (0, 80, 110), 35, 11.0),
    'aerial_low': ((-600, -950, 480), (-30, 80, 160), 35, 11.0),
    'detail': ((-110, -560, 4.0), (-145, -485, 8), 45, 6.3),
    'hero': ((245, -270, 2.2), (245, -160, 110), 35, 8.0),
}
for s, (loc, tgt, lens, fs) in OVERRIDES.items():
    ob = bpy.data.objects.get(CAM[s])
    if not ob: continue
    ob.location = loc
    d = Vector(tgt) - Vector(loc)
    ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    ob.data.lens = lens
    ob.data.dof.use_dof = True
    ob.data.dof.aperture_fstop = fs
    ob.data.dof.focus_distance = d.length

for s in shots:
    cam = CAM.get(s)
    if not cam or cam not in bpy.data.objects:
        print("SKIP", s, flush=True); continue
    sc.camera = bpy.data.objects[cam]
    sc.render.filepath = f"{OUT}/{tag}_{s}.png"
    t = time.time()
    bpy.ops.render.render(write_still=True)
    print("RENDER", s, round(time.time()-t, 1), sc.render.filepath, flush=True)
