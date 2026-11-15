"""Final Anvil Landing renders. Usage:
   Blender -b -P render.py -- [--final]
"""
import bpy, sys, os

BLEND = "/Users/apple/.local/share/opencode/worktree/e0f2de/kitbash-port/docs/kitbash-port/anvil_landing.blend"
OUT = "/Users/apple/.local/share/opencode/worktree/e0f2de/kitbash-port/docs/kitbash-port/renders"
FINAL = "--final" in sys.argv
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.open_mainfile(filepath=BLEND)
sc = bpy.context.scene
sc.render.resolution_x = 1920 if FINAL else 1200
sc.render.resolution_y = 1200 if FINAL else 750
sc.eevee.taa_render_samples = 64 if FINAL else 24
sc.eevee.use_raytracing = True
try:
    sc.eevee.shadow_pool_size = '2048'
except Exception:
    pass
try:
    sc.eevee.ray_tracing_options.use_denoise = True
    sc.eevee.ray_tracing_options.screen_trace_quality = 0.8
except Exception:
    pass
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_mode = 'RGB'
sc.render.image_settings.compression = 15

# compositor: render -> fog glow -> subtle lens -> display
tree = bpy.data.node_groups.new("AnvilComp", 'CompositorNodeTree')
sc.compositing_node_group = tree
sc.use_nodes = True
rl = tree.nodes.new('CompositorNodeRLayers'); rl.location = (-400, 0)
gl = tree.nodes.new('CompositorNodeGlare'); gl.location = (-120, 0)
gl.inputs['Type'].default_value = 'Fog Glow'
gl.inputs['Quality'].default_value = 'High'
gl.inputs['Threshold'].default_value = 1.0
gl.inputs['Strength'].default_value = 0.28
gl.inputs['Size'].default_value = 0.55
gl.inputs['Saturation'].default_value = 1.0
tree.links.new(rl.outputs['Image'], gl.inputs['Image'])
tree.interface.new_socket(name="Image", in_out='OUTPUT', socket_type='NodeSocketColor')
comp = tree.nodes.new('NodeGroupOutput'); comp.location = (400, 0)
tree.links.new(gl.outputs['Image'], comp.inputs[0])

shots = [("01_wide_port", "Cam_Wide"),
         ("02_pad_closeup", "Cam_Close"),
         ("03_elevated_city", "Cam_Aerial")]
for name, cam in shots:
    sc.camera = bpy.data.objects[cam]
    sc.render.filepath = f"{OUT}/{name}.png"
    bpy.ops.render.render(write_still=True)
    print("RENDERED", sc.render.filepath)
