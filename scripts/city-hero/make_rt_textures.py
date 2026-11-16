"""Build compact WebP texture sets (basecolor+AO, normal, packed ORM, emissive)
for the real-time city GLB.
"""
import os, json, re
import numpy as np
from PIL import Image

ROOT="/private/tmp/city-hero"
OUT=f"{ROOT}/rt_tex"
os.makedirs(OUT,exist_ok=True)
ASSETS="/private/tmp/city-hero-assets"
K032=f"{ASSETS}/k032/K032新上海城市Kitbash3D-NeoShanghai/Textures"
K038=f"{ASSETS}/k038/Textures"
K046=f"{ASSETS}/k046/K046重金属建筑Blender/KB3DTextures"
K039="/tmp/kb3d_tex/Textures"
GEN=f"{ROOT}/tex"

def files(d):
    try: return {f.lower():f for f in os.listdir(d)}
    except Exception: return {}

def find(d,stem,kind):
    fs=files(d); stem=stem.lower()
    wants=[kind]
    if kind=='basecolor': wants+=['diffuse','color','albedo']
    if kind=='ao': wants+=['ambient_occlusion','ao']
    if kind=='roughness': wants+=['rough']
    if kind=='metallic': wants+=['metal','metalness']
    if kind=='emissive': wants+=['emission']
    for w in wants:
        for ext in ('.jpg','.jpeg','.png'):
            k=f"{stem}_{w}{ext}"
            if k in fs: return os.path.join(d,fs[k])
    for f in os.listdir(d) if os.path.isdir(d) else []:
        fl=f.lower()
        if fl.startswith(stem) and any(w in fl for w in wants) and fl.endswith(('.jpg','.jpeg','.png')):
            return os.path.join(d,f)
    return None

def load(path):
    if not path: return None
    im=Image.open(path).convert('RGB')
    return im

def resize(im,n):
    if im is None: return None
    if max(im.size)>n:
        return im.resize((n,n),Image.LANCZOS)
    return im

def save(im,name):
    if im is None: return None
    p=f"{OUT}/{name}.webp"
    im.save(p,'WEBP',quality=86,method=5)
    return p

def make_set(tag,mat,base,normal,rough,metal,ao,emis,res_base=1024,res_normal=512,res_orm=512):
    key=f"RT_{tag}_{mat}"
    b=load(base)
    if b is not None:
        b=b.convert('RGB')
        if ao:
            a=load(ao)
            if a:
                a=resize(a,b.size[0]).convert('L')
                arr=np.asarray(b).astype(np.float32)
                aa=np.asarray(a).astype(np.float32)[:,:,None]/255.0
                b=Image.fromarray((arr*(0.35+0.65*aa)).clip(0,255).astype(np.uint8))
        b=resize(b,res_base)
        bp=save(b,key+'_base')
    else: bp=None
    n=resize(load(normal),res_normal) if normal else None
    npth=save(n,key+'_normal') if n else None
    r=load(rough); m=load(metal)
    if r or m:
        rr=np.asarray(resize(r,res_orm).convert('L')).astype(np.float32) if r else np.full((res_orm,res_orm),128,np.float32)
        mm=np.asarray(resize(m,res_orm).convert('L')).astype(np.float32) if m else np.zeros((res_orm,res_orm),np.float32)
        orm=np.stack([np.full_like(rr,255),rr,mm],-1).clip(0,255).astype(np.uint8)
        op=save(Image.fromarray(orm,'RGB'),key+'_orm')
    else: op=None
    ep=save(resize(load(emis),512),key+'_emis') if emis else None
    return {'base':bp,'normal':npth,'orm':op,'emis':ep}

manifest={}
# K032
used32=['AsphaltHexagonRoof','ConcreteAccent','ConcreteBlocks','ConcretePattern','GalvanizedSteel',
        'MetalAccent','MetalGrating','MetalOxidized','PaintedMetal','SatinSteel','SpeedwayTiles',
        'Glass','Pic_Banners','Signs_Lights','Characters']
alias={'MetalOxidized':'OxidizedSteel','PaintedMetal':'PaintedMetall'}
for mat in used32:
    stem='KB3D_'+alias.get(mat,mat)
    if mat=='Pic_Banners': base=f"{K032}/KB3D_NSbanner_Diffuse.jpg"; emis=None
    elif mat=='Signs_Lights': base=f"{K032}/KB3D_NSletters_Diffuse.jpg"; emis=base
    else:
        base=find(K032,stem,'basecolor'); emis=find(K032,stem,'emissive')
    manifest[f"K32_{mat}"]=make_set('K32',mat,base,find(K032,stem,'normal'),
        find(K032,stem,'roughness'),find(K032,stem,'metallic'),find(K032,stem,'ao'),emis,1024,1024,512)
# K038
used38=['Ads','Asphalt','BlackPanels','BlackPanelsLong','BrownPanels','DecorGPanels','Glass','GlassTri',
        'Grass','Light','MetalBlack','MetalPanels','MetalStriated','Panels','Props','SolarPanels',
        'StoneFloor','Tar','TileDamage','WhitePanels']
for mat in used38:
    stem=f"KB3D_NTT_{mat}"
    if mat in ('Glass','GlassTri'): continue
    manifest[f"K38_{mat}"]=make_set('K38',mat,find(K038,stem,'basecolor'),find(K038,stem,'normal'),
        find(K038,stem,'roughness'),find(K038,stem,'metallic'),find(K038,stem,'ao'),
        find(K038,stem,'emissive'),1024,1024,512)
# K046
used46=['FloorB','Light','MetalA','MetalB','MetalBlackRough','MetalC','MetalFloorA','MetalFloorB',
        'MetalFrame','MetalPaintAqua','MetalPaintBlue','MetalPaintLBlackA','MetalPaintLGreenA',
        'MetalPaintRed','MetalPaintWhite','MetalPaintYellow','MetalPanelBlack','MetalPanelBlack2',
        'MetalPanelBlackHoles','MetalPanelCorrugated','MetalPanelWhite','PipesA','PipesB',
        'PlasticA','PlasticB','RustA','RustB','RustC','SolarA','WindowsA','WindowsC']
for mat in used46:
    stem=f"KB3D_HEM_{mat}"
    manifest[f"K46_{mat}"]=make_set('K46',mat,find(K046,stem,'basecolor'),find(K046,stem,'normal'),
        find(K046,stem,'roughness'),find(K046,stem,'metallic'),None,None,768,512,512)
# K039
used39=['Metal','PanelsWhite','PanelsBlack','Panels2','PanelsLightBlue','PanelsBrown','Iron','Glass','Tech','Lights','Floor']
for mat in used39:
    stem=f"KB3D_SF_{mat}"
    if mat=='Glass': continue
    manifest[f"K39_{mat}"]=make_set('K39',mat,find(K039,stem,'basecolor'),find(K039,stem,'normal'),
        find(K039,stem,'roughness'),find(K039,stem,'metallic'),find(K039,stem,'ao'),
        find(K039,stem,'emissive'),768,512,512)
# deck / terrain / hazard
manifest['Deck']=make_set('SURF','Deck',f"{GEN}/concrete_albedo.jpg",f"{GEN}/concrete_normal.png",
    f"{GEN}/concrete_rough.jpg",None,None,None,1024,1024,1024)
manifest['Asphalt']=make_set('SURF','Asphalt',f"{GEN}/asphalt_albedo.jpg",f"{GEN}/asphalt_normal.png",
    f"{GEN}/asphalt_rough.jpg",None,None,None,1024,1024,1024)
manifest['Terrain']=make_set('SURF','Terrain',f"{GEN}/terrain_albedo.jpg",f"{GEN}/terrain_normal.png",
    f"{GEN}/terrain_rough.jpg",None,None,None,1024,1024,1024)
manifest['Hazard']=make_set('SURF','Hazard',f"{GEN}/hazard.jpg",None,None,None,None,None,512,512,512)
# character texture palette
CH='/tmp/ms_char/textures'
def ch(prefix,color):
    return make_set('CH',prefix,f"{CH}/{color}",f"{CH}/{prefix}_normal.jpg" if os.path.exists(f"{CH}/{prefix}_normal.jpg") else None,
        f"{CH}/{prefix}_roughness.jpg" if os.path.exists(f"{CH}/{prefix}_roughness.jpg") else None,
        f"{CH}/{prefix}_metalness.jpg" if os.path.exists(f"{CH}/{prefix}_metalness.jpg") else None,
        None,None,1024,512,512)
manifest['CH_Suit']=ch('Suit_Chest','Suit_Chest_green_color.jpg')
manifest['CH_Head']=ch('HeadHands','HeadHands_color.jpg')
manifest['CH_Boot']=ch('Boots','Boots_black_color.jpg')
manifest['CH_Metal']=ch('HeadArmor','HeadArmor_base_color.jpg')
with open(f"{ROOT}/rt_manifest.json",'w') as f: json.dump(manifest,f,indent=1)
total=sum(os.path.getsize(v) for d in manifest.values() for v in d.values() if v and os.path.exists(v))
print('RT TEX',len(manifest),'sets',round(total/1048576,2),'MB')
