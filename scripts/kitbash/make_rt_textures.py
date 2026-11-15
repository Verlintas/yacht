"""Generate compact real-time textures with system Python (PIL/numpy)."""
import os, json
from PIL import Image
import numpy as np

WORK = "/Users/apple/.local/share/opencode/worktree/e0f2de/kitbash-port"
GLB = f"{WORK}/docs/kitbash-port/glb"
TEXOUT = f"{GLB}/textures"
KB = "/tmp/kb3d_tex/Textures"
GEN = f"{WORK}/docs/kitbash-port/textures"
os.makedirs(TEXOUT, exist_ok=True)

MAT_TINT = {
    'Metal': (0.94, 0.97, 1.02), 'MetalSilver': (1.00, 1.02, 1.06),
    'PanelsWhite': (1.05, 1.07, 1.10), 'PanelsBlack': (0.60, 0.68, 0.76),
    'PanelsBrown': (1.12, 0.80, 0.56), 'Panels2': (0.98, 1.05, 0.82),
    'PanelsLightBlue': (0.50, 0.80, 1.18), 'Iron': (0.72, 0.77, 0.82),
    'Glass': (0.45, 0.68, 0.90), 'Tech': (0.90, 0.96, 1.05),
    'Lights': (1.00, 1.00, 1.00), 'Floor': (0.88, 0.86, 0.80),
}
SET_RES = {'Metal': 2048, 'MetalSilver': 2048, 'PanelsWhite': 2048, 'PanelsBlack': 2048,
           'PanelsBrown': 2048, 'Panels2': 2048, 'PanelsLightBlue': 2048, 'Iron': 2048,
           'Tech': 1024, 'Lights': 1024, 'Floor': 1024}

def kb_file(set_name, kind):
    prefix = f"kb3d_sf_{set_name.lower()}_"
    files = [f for f in os.listdir(KB) if f.lower().startswith(prefix) and f.lower().endswith(('.jpg','.png'))]
    wants = {'basecolor': ['basecolor','diffuse','diffuse_1'], 'normal': ['normal'],
             'roughness': ['roughness'], 'metallic': ['metallic'], 'ao': ['ao','ao_1'],
             'emissive': ['emissive','emissive_1'], 'opacity': ['opacity']}[kind]
    for w in wants:
        for f in files:
            rest = f[len(prefix):].rsplit('.',1)[0].lower()
            if rest == w:
                return os.path.join(KB, f)
    return None

def resize_save(src, dst, size, quality=90, tint=None, bake_ao=None):
    im = Image.open(src).convert('RGB')
    if im.size != (size,size):
        im = im.resize((size,size), Image.LANCZOS)
    if tint is not None or bake_ao is not None:
        a = np.asarray(im).astype(np.float32)/255.0
        if bake_ao is not None:
            ao = Image.open(bake_ao).convert('L').resize((size,size), Image.LANCZOS)
            ao = np.asarray(ao).astype(np.float32)/255.0
            a = a * (0.62 + 0.38 * ao[...,None])
        if tint is not None:
            a = a * np.array(tint, np.float32)[None,None,:]
        a = np.clip(a,0,1)
        im = Image.fromarray((a*255).astype(np.uint8))
    im.save(dst, quality=quality, subsampling=0)

def compact_tex(name, src, size, quality=88, tint=None, bake_ao=None):
    if not src: return None
    dst = os.path.join(TEXOUT, f"{name}.jpg")
    if not os.path.exists(dst):
        resize_save(src, dst, size, quality, tint, bake_ao)
    return dst

paths = {}
for set_name in ['Metal','MetalSilver','PanelsWhite','PanelsBlack','PanelsBrown','Panels2',
                 'PanelsLightBlue','Iron','Tech','Lights','Floor']:
    size = SET_RES.get(set_name, 1024)
    base = kb_file(set_name,'basecolor'); ao = kb_file(set_name,'ao')
    nrm = kb_file(set_name,'normal'); rgh = kb_file(set_name,'roughness'); met = kb_file(set_name,'metallic')
    emi = kb_file(set_name,'emissive')
    tint = MAT_TINT.get(set_name, (1,1,1))
    paths[set_name] = {
        'base': compact_tex(f"{set_name}_base", base, size, 90, tint, ao),
        'normal': compact_tex(f"{set_name}_normal", nrm, min(size,1024), 92),
        'rough': compact_tex(f"{set_name}_rough", rgh, 512, 88),
        'metal': compact_tex(f"{set_name}_metal", met, 512, 88),
        'emis': compact_tex(f"{set_name}_emis", emi, 512, 88) if emi else None,
    }
paths['Apron'] = {
    'base': compact_tex("Apron_base", f"{GEN}/concrete_albedo.jpg", 2048, 90, (0.72,0.70,0.64)),
    'normal': compact_tex("Concrete_normal", f"{GEN}/concrete_normal.png", 1024, 92),
    'rough': compact_tex("Concrete_rough", f"{GEN}/concrete_roughness.jpg", 512, 88),
}
paths['Pad'] = {'base': compact_tex("Pad_base", f"{GEN}/concrete_albedo.jpg", 2048, 90, (0.95,0.93,0.86)),
                'normal': paths['Apron']['normal'], 'rough': paths['Apron']['rough']}
paths['Terrain'] = {
    'base': compact_tex("Terrain_base", f"{GEN}/terrain_albedo.jpg", 2048, 90, (0.62,0.62,0.58)),
    'normal': compact_tex("Terrain_normal", f"{GEN}/terrain_normal.png", 1024, 92),
    'rough': compact_tex("Terrain_rough", f"{GEN}/terrain_roughness.jpg", 1024, 88),
}
paths['Cliff'] = {'base': compact_tex("Cliff_base", f"{GEN}/terrain_albedo.jpg", 2048, 90, (0.62,0.59,0.54)),
                  'normal': paths['Terrain']['normal'], 'rough': paths['Terrain']['rough']}
paths['Rock'] = {'base': compact_tex("Rock_base", f"{GEN}/terrain_albedo.jpg", 1024, 88, (0.42,0.40,0.37)),
                 'normal': paths['Terrain']['normal'], 'rough': paths['Terrain']['rough']}
paths['Hazard'] = {'base': compact_tex("Hazard_base", f"{GEN}/hazard_stripes.jpg", 512, 90)}
with open(f"{GLB}/texture_paths.json", "w") as f:
    json.dump(paths, f, indent=1)
print("textures", sum(1 for p in paths.values() for v in p.values() if v))
print("bytes", sum(os.path.getsize(v) for p in paths.values() for v in p.values() if v and os.path.exists(v)))
