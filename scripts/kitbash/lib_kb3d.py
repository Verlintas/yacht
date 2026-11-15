"""Shared helpers for the Anvil Landing Kitbash3D port build.
Blender 5.3 / headless. 1 unit = 1 metre.
"""
import bpy, bmesh, math, os, re, random
from mathutils import Vector, Matrix, Euler

TEX = "/tmp/kb3d_tex/Textures"
WORK = "/Users/apple/.local/share/opencode/worktree/e0f2de/kitbash-port"
GEN_TEX = f"{WORK}/docs/kitbash-port/textures"

# ---------------------------------------------------------------- scene
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'
    sc.unit_settings.scale_length = 1.0
    sc.render.engine = 'BLENDER_EEVEE'
    return sc

def collection(name, parent=None):
    c = bpy.data.collections.get(name)
    if not c:
        c = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(c)
    return c

def link(obj, coll=None):
    (coll or bpy.context.scene.collection).objects.link(obj)
    return obj

# ---------------------------------------------------------------- textures
_img_cache = {}
def find_tex(set_name, kind):
    """Resolve KB3D_SF_{set}_{kind} case-insensitively, with diffuse/emissive fallbacks."""
    key = (set_name, kind)
    if key in _img_cache:
        return _img_cache[key]
    if not os.path.isdir(TEX):
        return None
    prefix = f"kb3d_sf_{set_name.lower()}_"
    files = [f for f in os.listdir(TEX) if f.lower().startswith(prefix) and f.lower().endswith(('.jpg', '.png', '.jpeg'))]
    wants = [kind.lower()]
    if kind.lower() in ('basecolor', 'base'):
        wants += ['diffuse', 'diffuse_1']
    if kind.lower() == 'emissive':
        wants += ['emissive_1']
    if kind.lower() == 'ao':
        wants += ['ao_1']
    for want in wants:
        for f in files:
            rest = f[len(prefix):].rsplit('.', 1)[0].lower()
            if rest == want:
                img = bpy.data.images.load(os.path.join(TEX, f), check_existing=True)
                _img_cache[key] = img
                return img
    _img_cache[key] = None
    return None

def set_cs(img, cs):
    if img:
        img.colorspace_settings.name = cs

def tex_node(nt, img, loc=(-700, 0), noncolor=False, interp='Linear'):
    n = nt.nodes.new('ShaderNodeTexImage')
    n.image = img
    n.location = loc
    n.interpolation = interp
    if img and noncolor:
        set_cs(img, 'Non-Color')
    return n

def mix_multiply(nt, a, b, fac=1.0, loc=(-300, 100)):
    m = nt.nodes.new('ShaderNodeMix')
    m.data_type = 'RGBA'
    m.blend_type = 'MULTIPLY'
    m.inputs[0].default_value = fac
    nt.links.new(a, m.inputs[6])
    nt.links.new(b, m.inputs[7])
    m.location = loc
    return m

# ---------------------------------------------------------------- materials
MAT_MAP = {
    'Metal': 'Metal', 'MetalSilver': 'MetalSilver',
    'PanelsWhite': 'PanelsWhite', 'PanelsBlack': 'PanelsBlack',
    'PanelsBrown': 'PanelsBrown', 'Panels2': 'Panels2',
    'PanelsLightBlue': 'PanelsLightBlue', 'Iron': 'Iron',
    'Glass': 'Glass', 'Tech': 'Tech', 'lights': 'Lights', 'Floor': 'Floor',
}

# cool/warm paint tints keep the neutral scans from reading as one beige mass
MAT_TINT = {
    'Metal': (0.94, 0.97, 1.02),
    'MetalSilver': (1.00, 1.02, 1.06),
    'PanelsWhite': (1.05, 1.07, 1.10),
    'PanelsBlack': (0.60, 0.68, 0.76),
    'PanelsBrown': (1.12, 0.80, 0.56),
    'Panels2': (0.98, 1.05, 0.82),
    'PanelsLightBlue': (0.50, 0.80, 1.18),
    'Iron': (0.72, 0.77, 0.82),
    'Glass': (0.45, 0.68, 0.90),
    'Tech': (0.90, 0.96, 1.05),
    'Lights': (1.00, 1.00, 1.00),
    'Floor': (0.88, 0.86, 0.80),
}

def kb_material(set_name):
    """Build a PBR material from the Kitbash3D texture set."""
    name = f"KB3D_{set_name}"
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); out.location = (400, 0)
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled'); bsdf.location = (80, 0)
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    base = find_tex(set_name, 'basecolor')
    rough = find_tex(set_name, 'roughness')
    metal = find_tex(set_name, 'metallic')
    normal = find_tex(set_name, 'normal')
    ao = find_tex(set_name, 'ao')
    emis = find_tex(set_name, 'emissive')
    opacity = find_tex(set_name, 'opacity')

    bn = tex_node(nt, base, (-650, 320)) if base else None
    tint = MAT_TINT.get(set_name, (1, 1, 1))
    if bn:
        col_socket = bn.outputs['Color']
        if ao:
            an = tex_node(nt, ao, (-650, 90), noncolor=True)
            mm = mix_multiply(nt, col_socket, an.outputs['Color'], 0.78, (-330, 240))
            col_socket = mm.outputs[2]
        tm = nt.nodes.new('ShaderNodeMix'); tm.data_type = 'RGBA'; tm.blend_type = 'MULTIPLY'
        tm.inputs[0].default_value = 1.0
        tm.inputs[6].default_value = (*tint, 1)
        tm.location = (-100, 300)
        nt.links.new(col_socket, tm.inputs[7])
        nt.links.new(tm.outputs[2], bsdf.inputs['Base Color'])
    else:
        bsdf.inputs['Base Color'].default_value = (0.45, 0.46, 0.48, 1)
    if rough:
        rn = tex_node(nt, rough, (-650, -120), noncolor=True)
        nt.links.new(rn.outputs['Color'], bsdf.inputs['Roughness'])
    else:
        bsdf.inputs['Roughness'].default_value = 0.5
    if metal:
        mn = tex_node(nt, metal, (-650, -330), noncolor=True)
        nt.links.new(mn.outputs['Color'], bsdf.inputs['Metallic'])
    else:
        bsdf.inputs['Metallic'].default_value = 0.0
    if normal:
        nn = tex_node(nt, normal, (-650, -560), noncolor=True)
        nm = nt.nodes.new('ShaderNodeNormalMap'); nm.location = (-330, -500)
        nm.inputs['Strength'].default_value = 0.85 if set_name != 'Glass' else 0.4
        nt.links.new(nn.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    if emis:
        en = tex_node(nt, emis, (-650, -760))
        nt.links.new(en.outputs['Color'], bsdf.inputs['Emission Color'])
        if set_name == 'Lights':
            bsdf.inputs['Emission Strength'].default_value = 9.0
            bsdf.inputs['Base Color'].default_value = (0.05, 0.05, 0.05, 1)
        elif set_name == 'Tech':
            bsdf.inputs['Emission Strength'].default_value = 3.0
        else:
            bsdf.inputs['Emission Strength'].default_value = 1.2
    if set_name == 'Glass':
        bsdf.inputs['Transmission Weight'].default_value = 0.12
        bsdf.inputs['IOR'].default_value = 1.46
        bsdf.inputs['Roughness'].default_value = 0.07
        bsdf.inputs['Metallic'].default_value = 0.68
        if opacity:
            on = tex_node(nt, opacity, (-650, -950), noncolor=True)
            # use opacity to modulate alpha subtly
            nt.links.new(on.outputs['Color'], bsdf.inputs['Alpha'])
        try:
            mat.use_raytrace_refraction = True
            mat.use_screen_refraction = True
            mat.surface_render_method = 'DITHERED'
        except Exception:
            pass
    return mat

def assign_kb_materials(objs):
    """Replace imported slots named Metal etc. with our PBR builds."""
    mats = {}
    for set_name in set(MAT_MAP.values()):
        mats[set_name] = kb_material(set_name)
    for o in objs:
        if o.type != 'MESH':
            continue
        for i, slot in enumerate(o.material_slots):
            old = slot.material.name if slot.material else ''
            if old in MAT_MAP:
                slot.material = mats[MAT_MAP[old]]
    return mats

def tint_material(src, name, tint, rough_scale=1.0):
    """Copy a KB3D material, multiply its albedo by tint and scale roughness."""
    mat = src.copy()
    mat.name = name
    nt = mat.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not bsdf:
        return mat
    link = bsdf.inputs['Base Color'].links
    if link:
        from_socket = link[0].from_socket
        tm = nt.nodes.new('ShaderNodeMix'); tm.data_type = 'RGBA'; tm.blend_type = 'MULTIPLY'
        tm.inputs[0].default_value = 1.0
        tm.inputs[6].default_value = (*tint, 1)
        tm.location = (bsdf.location.x - 250, bsdf.location.y + 180)
        nt.links.new(from_socket, tm.inputs[7])
        nt.links.new(tm.outputs[2], bsdf.inputs['Base Color'])
    else:
        bsdf.inputs['Base Color'].default_value = (*tint, 1)
    if rough_scale != 1.0:
        link = bsdf.inputs['Roughness'].links
        if link:
            from_socket = link[0].from_socket
            rm = nt.nodes.new('ShaderNodeMix'); rm.data_type = 'FLOAT'; rm.blend_type = 'MULTIPLY'
            rm.inputs[0].default_value = 1.0
            rm.inputs[3].default_value = rough_scale
            nt.links.new(from_socket, rm.inputs[2])
            nt.links.new(rm.outputs[0], bsdf.inputs['Roughness'])
        else:
            bsdf.inputs['Roughness'].default_value *= rough_scale
    return mat

def solid_mat(name, color, rough=0.5, metal=0.0, emis=None, emis_strength=0.0, alpha=1.0):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emis:
        b.inputs['Emission Color'].default_value = (*emis, 1)
        b.inputs['Emission Strength'].default_value = emis_strength
    m.diffuse_color = (*color, alpha)
    return m

def emission_mat(name, color, strength, base=(0.02, 0.02, 0.02)):
    m = solid_mat(name, base, 0.4, 0.0, color, strength)
    return m

def surface_mat(name, albedo, normal, roughmap, tint=(1, 1, 1), rough_scale=1.0, uv_scale=1.0,
                normal_strength=1.0):
    """Generic tiling PBR surface material using UV coordinates."""
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); out.location = (500, 0)
    b = nt.nodes.new('ShaderNodeBsdfPrincipled'); b.location = (220, 0)
    nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])
    uv = nt.nodes.new('ShaderNodeTexCoord'); uv.location = (-950, 0)
    mp = nt.nodes.new('ShaderNodeMapping'); mp.location = (-760, 0)
    mp.inputs['Scale'].default_value = (uv_scale, uv_scale, uv_scale)
    nt.links.new(uv.outputs['UV'], mp.inputs['Vector'])
    a = tex_node(nt, albedo, (-520, 280)); nt.links.new(mp.outputs['Vector'], a.inputs['Vector'])
    n = tex_node(nt, normal, (-520, -20), noncolor=True); nt.links.new(mp.outputs['Vector'], n.inputs['Vector'])
    r = tex_node(nt, roughmap, (-520, -320), noncolor=True); nt.links.new(mp.outputs['Vector'], r.inputs['Vector'])
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'
    mx.inputs[0].default_value = 1.0
    mx.inputs[6].default_value = (*tint, 1); mx.location = (-200, 260)
    nt.links.new(a.outputs['Color'], mx.inputs[7])
    nt.links.new(mx.outputs[2], b.inputs['Base Color'])
    rm = nt.nodes.new('ShaderNodeMath'); rm.operation = 'MULTIPLY'; rm.location = (-200, -280)
    rm.inputs[1].default_value = rough_scale
    nt.links.new(r.outputs['Color'], rm.inputs[0])
    nt.links.new(rm.outputs[0], b.inputs['Roughness'])
    nm = nt.nodes.new('ShaderNodeNormalMap'); nm.location = (-200, -20)
    nm.inputs['Strength'].default_value = normal_strength
    nt.links.new(n.outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    m.diffuse_color = (*tint, 1)
    return m

def world_image_sky(scene, path, strength=0.7, rot_z=0.0):
    w = bpy.data.worlds.new("AnvilSky"); scene.world = w
    w.use_nodes = True
    nt = w.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputWorld'); out.location = (500, 0)
    bg = nt.nodes.new('ShaderNodeBackground'); bg.location = (250, 0)
    env = nt.nodes.new('ShaderNodeTexEnvironment'); env.location = (-250, 0)
    img = bpy.data.images.load(path, check_existing=True)
    env.image = img
    env.projection = 'EQUIRECTANGULAR'
    mp = nt.nodes.new('ShaderNodeMapping'); mp.location = (-500, 0)
    mp.inputs['Rotation'].default_value = (0, 0, math.radians(rot_z))
    tc = nt.nodes.new('ShaderNodeTexCoord'); tc.location = (-720, 0)
    nt.links.new(tc.outputs['Generated'], mp.inputs['Vector'])
    nt.links.new(mp.outputs['Vector'], env.inputs['Vector'])
    nt.links.new(env.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = strength
    # brighter sky for camera rays, calmer ambient for lighting
    bg2 = nt.nodes.new('ShaderNodeBackground'); bg2.location = (250, 180)
    nt.links.new(env.outputs['Color'], bg2.inputs['Color'])
    bg2.inputs['Strength'].default_value = strength * 2.6
    lp = nt.nodes.new('ShaderNodeLightPath'); lp.location = (-40, 260)
    mix = nt.nodes.new('ShaderNodeMixShader'); mix.location = (420, 80)
    nt.links.new(lp.outputs['Is Camera Ray'], mix.inputs['Fac'])
    nt.links.new(bg.outputs['Background'], mix.inputs[1])
    nt.links.new(bg2.outputs['Background'], mix.inputs[2])
    nt.links.new(mix.outputs['Shader'], out.inputs['Surface'])
    w.mist_settings.start = 80
    w.mist_settings.depth = 700
    w.mist_settings.falloff = 'QUADRATIC'
    return w

def image_mat(name, img, rough=0.8, tint=(1, 1, 1), uv_scale=1.0, noncolor=False, emission=False):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); out.location = (300, 0)
    b = nt.nodes.new('ShaderNodeBsdfPrincipled'); b.location = (0, 0)
    nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])
    tn = tex_node(nt, img, (-500, 200), noncolor=noncolor)
    mp = nt.nodes.new('ShaderNodeMapping'); mp.location = (-700, 200)
    mp.inputs['Scale'].default_value = (uv_scale, uv_scale, uv_scale)
    uv = nt.nodes.new('ShaderNodeTexCoord'); uv.location = (-900, 200)
    nt.links.new(uv.outputs['UV'], mp.inputs['Vector'])
    nt.links.new(mp.outputs['Vector'], tn.inputs['Vector'])
    if not emission:
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
        mix.inputs[0].default_value = 1.0
        mix.inputs[6].default_value = (*tint, 1)
        nt.links.new(tn.outputs['Color'], mix.inputs[7])
        nt.links.new(mix.outputs[2], b.inputs['Base Color'])
        b.inputs['Roughness'].default_value = rough
    else:
        nt.links.new(tn.outputs['Color'], b.inputs['Emission Color'])
        b.inputs['Emission Strength'].default_value = rough
        b.inputs['Base Color'].default_value = (0.02, 0.02, 0.02, 1)
    m.diffuse_color = (*tint, 1)
    return m

# ---------------------------------------------------------------- mesh primitives
def _finish(obj, mat, coll, smooth=False):
    if mat:
        obj.data.materials.append(mat)
    link(obj, coll)
    if smooth:
        for p in obj.data.polygons:
            p.use_smooth = True
    return obj

def box(name, size, loc, mat=None, rot=(0, 0, 0), bevel=0.0, coll=None, uv=True):
    sx, sy, sz = size
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=2, affect='EDGES')
    bm.to_mesh(me); bm.free()
    if uv:
        box_uv(me)
    ob = bpy.data.objects.new(name, me)
    ob.location = loc
    ob.rotation_euler = rot
    return _finish(ob, mat, coll)

def box_uv(me, scale=1.0):
    """Simple per-face box projection so image textures work without unwrap."""
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    uvl = me.uv_layers[0]
    for poly in me.polygons:
        n = poly.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            if az >= ax and az >= ay:
                u, vv = v.x, v.y
            elif ay >= ax:
                u, vv = v.x, v.z
            else:
                u, vv = v.y, v.z
            uvl.data[li].uv = (u * scale, vv * scale)

def cyl(name, radius, depth, loc, mat=None, rot=(0, 0, 0), verts=24, coll=None, smooth=True, bevel=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=loc, rotation=rot)
    ob = bpy.context.object
    ob.name = name
    if bevel:
        md = ob.modifiers.new("bev", 'BEVEL'); md.width = bevel; md.segments = 2
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier=md.name)
    return _finish(ob, mat, coll, smooth)

def sphere(name, radius, loc, mat=None, segs=24, rings=16, coll=None, smooth=True):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=rings, radius=radius, location=loc)
    ob = bpy.context.object; ob.name = name
    return _finish(ob, mat, coll, smooth)

def cone(name, r1, r2, depth, loc, mat=None, rot=(0, 0, 0), verts=16, coll=None):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=depth, location=loc, rotation=rot)
    ob = bpy.context.object; ob.name = name
    return _finish(ob, mat, coll, True)

def ring(name, major, minor, loc, mat=None, coll=None, scale_z=1.0):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor,
                                     major_segments=96, minor_segments=8, location=loc)
    ob = bpy.context.object; ob.name = name
    ob.scale.z = scale_z
    bpy.ops.object.transform_apply(scale=True)
    return _finish(ob, mat, coll, True)

def text_mesh(name, body, size, loc, mat=None, rot=(0, 0, 0), extrude=0.015,
              font=None, coll=None, align='CENTER', spacing=1.0):
    cu = bpy.data.curves.new(name, 'FONT')
    cu.body = body
    cu.size = size
    cu.extrude = extrude
    cu.align_x = align
    cu.align_y = 'CENTER'
    cu.space_character = spacing
    if font:
        cu.font = font
    ob = bpy.data.objects.new(name, cu)
    ob.location = loc
    ob.rotation_euler = rot
    link(ob, coll)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
    bpy.ops.object.convert(target='MESH')
    ob = bpy.context.object
    if mat:
        ob.data.materials.append(mat)
    return ob

def curve(name, points, radius, mat, coll=None, cyclic=False, res=2):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.resolution_u = res
    cu.bevel_depth = radius
    cu.bevel_resolution = 2
    sp = cu.splines.new('POLY')
    sp.points.add(len(points) - 1)
    for i, p in enumerate(points):
        sp.points[i].co = (p[0], p[1], p[2], 1)
    sp.use_cyclic_u = cyclic
    ob = bpy.data.objects.new(name, cu)
    if mat:
        ob.data.materials.append(mat)
    link(ob, coll)
    return ob

# ---------------------------------------------------------------- kit modules
def import_fbx():
    bpy.ops.import_scene.fbx(filepath="/tmp/kb3d_fbx/asset_1.fbx")
    groups = {}
    for o in [x for x in bpy.context.scene.objects if x.type == 'MESH' and x.name.startswith('Desirefx.me_')]:
        m = re.match(r'Desirefx\.me_(.+)_([A-Za-z0-9]+)_(\w+)$', o.name)
        key = f"{m.group(1)}_{m.group(2)}" if m else o.name
        groups.setdefault(key, []).append(o)
    mods = {}
    for key, objs in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        if len(objs) > 1:
            bpy.ops.object.join()
        ob = bpy.context.view_layer.objects.active
        ob.name = key
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        # origin at bbox bottom centre
        bb = [Vector(c) for c in ob.bound_box]
        mn = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
        mx = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
        ctr = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
        ob.data.transform(Matrix.Translation(-ctr))
        ob.location = ctr
        for p in ob.data.polygons:
            p.use_smooth = False
        mods[key] = ob
    return mods

def normalize_module(ob):
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bb = [Vector(c) for c in ob.bound_box]
    mn = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
    mx = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
    ctr = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    ob.data.transform(Matrix.Translation(-ctr))
    ob.location = ctr
    return ob

def place(ob, loc, rot_z=0.0, scale=1.0, coll=None):
    if coll:
        for c in list(ob.users_collection):
            c.objects.unlink(ob)
        coll.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = (0, 0, math.radians(rot_z))
    ob.scale = (scale, scale, scale)
    return ob

def bbox(ob):
    bpy.context.view_layer.update()
    bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    return (Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb))),
            Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb))))

def hide_render(ob, viewport=True):
    ob.hide_render = True
    if viewport:
        ob.hide_set(True)

# ---------------------------------------------------------------- misc
def world_sky(scene, sun_elev=8.0, sun_rot=200.0, strength=0.45, warm=0.6):
    w = bpy.data.worlds.new("AnvilSky")
    scene.world = w
    w.use_nodes = True
    nt = w.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputWorld'); out.location = (400, 0)
    bg = nt.nodes.new('ShaderNodeBackground'); bg.location = (150, 0)
    sky = nt.nodes.new('ShaderNodeTexSky'); sky.location = (-200, 0)
    try:
        sky.sky_type = 'MULTIPLE_SCATTERING'
        sky.sun_elevation = math.radians(sun_elev)
        sky.sun_rotation = math.radians(sun_rot)
        sky.sun_disc = True
        sky.sun_size = math.radians(1.2)
        sky.sun_intensity = 1.0
        sky.altitude = 350
        sky.air_density = 0.9
        sky.aerosol_density = 1.6
        sky.ozone_density = 1.0
    except Exception as e:
        print("sky setup", e)
    nt.links.new(sky.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = strength
    nt.links.new(bg.outputs['Background'], out.inputs['Surface'])
    return w

def make_light(name, kind, loc, energy, color=(1, 1, 1), rot=(0, 0, 0), size=1.0,
               coll=None, angle=None, spot_size=None):
    ld = bpy.data.lights.new(name, kind)
    ld.energy = energy
    ld.color = color
    if kind == 'AREA':
        ld.shape = 'RECTANGLE' if isinstance(size, (tuple, list)) else 'SQUARE'
        if isinstance(size, (tuple, list)):
            ld.size, ld.size_y = size
        else:
            ld.size = size
    if kind == 'SUN' and angle is not None:
        ld.angle = angle
    if kind == 'SPOT' and spot_size is not None:
        ld.spot_size = spot_size
        ld.spot_blend = 0.4
    ob = bpy.data.objects.new(name, ld)
    ob.location = loc; ob.rotation_euler = rot
    link(ob, coll)
    return ob

def point_at(obj, target, up='Y'):
    d = (Vector(target) - obj.location).normalized()
    obj.rotation_euler = d.to_track_quat('-Z', up).to_euler()
