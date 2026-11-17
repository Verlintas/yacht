import * as THREE from 'three';

export const ASSET_BASE = new URL('../../../public/cyber-city/', import.meta.url).href;

/** Resolve a path relative to the deployed page (works under /yacht/). */
export function asset(path: string): string {
  return new URL(path, document.baseURI).href;
}

const texLoader = new THREE.TextureLoader();
const texCache = new Map<string, THREE.Texture>();

export function loadTexture(path: string, colorSpace: THREE.ColorSpace = THREE.SRGBColorSpace): THREE.Texture {
  const full = asset(path);
  const cached = texCache.get(full);
  if (cached) {
    cached.colorSpace = colorSpace;
    return cached;
  }
  const tex = texLoader.load(full);
  tex.colorSpace = colorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  texCache.set(full, tex);
  return tex;
}

export function configureLoadedMaterial(mat: THREE.Material, key: string): void {
  const m = mat as THREE.MeshStandardMaterial;
  if ('envMapIntensity' in m) m.envMapIntensity = 1.15;

  const glass = new Set(['Glass', 'Window', 'GlsBlack', 'GlsE', 'GlsF', 'GlassBlack', 'Material #25', 'GlassTransparent']);
  if (glass.has(key)) {
    m.metalness = key === 'GlassTransparent' ? 0.15 : 0.92;
    m.roughness = 0.055;
    m.color = new THREE.Color(key === 'GlassTransparent' ? 0x8fb9bf : 0x050b10);
    m.envMapIntensity = 2.1;
    if (key === 'GlassBlack' || key === 'GlassTransparent') {
      m.transparent = true;
      m.opacity = key === 'GlassBlack' ? 0.48 : 0.26;
      m.depthWrite = false;
    }
    m.side = THREE.FrontSide;
  }

  if (key === 'GlassBottle') {
    m.transparent = true;
    m.opacity = 0.45;
    m.roughness = 0.12;
    m.metalness = 0.15;
    m.depthWrite = false;
    m.envMapIntensity = 1.4;
  }

  if (key === 'Signs_Lights' || key === 'EmissiveLightMTL') {
    m.emissive = new THREE.Color(key === 'Signs_Lights' ? 0xff8b3d : 0xbcd8ff);
    m.emissiveIntensity = key === 'Signs_Lights' ? 2.6 : 1.8;
    m.color = new THREE.Color(0x141210);
    m.roughness = 0.45;
    m.metalness = 0.0;
  }

  if (key === 'Pic_Banners') {
    m.color = new THREE.Color(0x5d6b78);
    m.emissive = new THREE.Color(0x1a2a36);
    m.emissiveIntensity = 0.6;
  }

  if (key === 'Decals') {
    m.emissive = new THREE.Color(0x2a211a);
    m.emissiveIntensity = 0.55;
    m.roughness = 0.6;
    m.metalness = 0.0;
  }

  if (key === 'Screens' || key === 'ScreensDim') {
    m.emissive = new THREE.Color(key === 'Screens' ? 0x2f9dff : 0x1a4b70);
    m.emissiveIntensity = key === 'Screens' ? 1.4 : 0.7;
    m.roughness = 0.35;
  }

  if (key.startsWith('Light')) {
    const colors: Record<string, number> = {
      LightRed: 0xff2a1f,
      LightBlue: 0x2aa8ff,
      LightWhite: 0xdcecff,
      LightOrange: 0xff7a1f,
      LightYellow: 0xffcf4a,
    };
    m.emissive = new THREE.Color(colors[key] ?? 0xffffff);
    m.emissiveIntensity = 3.2;
    m.color = new THREE.Color(0x101010);
    m.roughness = 0.4;
    m.metalness = 0.0;
  }

  if (key === 'Characters') {
    m.emissive = new THREE.Color(0x9ad4ff);
    m.emissiveIntensity = 1.1;
    m.transparent = true;
    m.alphaTest = 0.25;
    m.depthWrite = false;
  }

  if (key === 'Clothes') {
    m.transparent = false;
    m.alphaTest = 0.45;
    m.side = THREE.DoubleSide;
  }

  if (key === 'PlasticWhite' || key === 'PaintWhiteRusty' || key === 'PaperWhite') {
    m.color.multiplyScalar(0.64);
  }

  if (key === 'MetalGrating') {
    m.alphaTest = 0.45;
    m.side = THREE.DoubleSide;
  }

  if ('dithering' in m) m.dithering = true;
  m.needsUpdate = true;
}

export function configureMaterialMap(map: Map<string, THREE.Material>): void {
  for (const [key, mat] of map) configureLoadedMaterial(mat, key);
}

/** Build a small, dark night-city equirect environment with neon horizon glow. */
export function createNightSky(renderer: THREE.WebGLRenderer): {
  background: THREE.Texture;
  environment: THREE.Texture;
  skyCanvas: HTMLCanvasElement;
} {
  const w = 2048;
  const h = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0.0, '#030812');
  grad.addColorStop(0.35, '#071422');
  grad.addColorStop(0.52, '#0d2230');
  grad.addColorStop(0.58, '#17313e');
  grad.addColorStop(0.63, '#1d3945');
  grad.addColorStop(0.70, '#0a1118');
  grad.addColorStop(1.0, '#030507');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // stars (upper hemisphere only)
  let seed = 7331;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  for (let i = 0; i < 1400; i += 1) {
    const x = rand() * w;
    const y = rand() * h * 0.45;
    const r = rand() * 1.1 + 0.2;
    const a = rand() * 0.5 + 0.08;
    ctx.fillStyle = `rgba(${190 + rand() * 60 | 0},${205 + rand() * 40 | 0},255,${a})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // horizon city glow: warm left, cyan right
  const glow = (x: number, y: number, rx: number, ry: number, color: string, alpha: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
    g.addColorStop(0, color.replace('ALPHA', String(alpha)));
    g.addColorStop(0.45, color.replace('ALPHA', String(alpha * 0.42)));
    g.addColorStop(1, color.replace('ALPHA', '0'));
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, ry / rx);
    ctx.translate(-x, -y);
    ctx.fillStyle = g;
    ctx.fillRect(x - rx, y - rx, rx * 2, rx * 2);
    ctx.restore();
  };
  glow(w * 0.24, h * 0.545, 520, 110, 'rgba(255,116,58,ALPHA)', 0.42);
  glow(w * 0.72, h * 0.54, 480, 90, 'rgba(42,206,255,ALPHA)', 0.36);
  glow(w * 0.48, h * 0.56, 620, 70, 'rgba(255,48,140,ALPHA)', 0.16);

  // distant skyline silhouette
  ctx.fillStyle = 'rgba(1,3,6,0.92)';
  let bx = 0;
  while (bx < w) {
    const bw = 10 + rand() * 44;
    const bh = 10 + rand() * 90;
    ctx.fillRect(bx, h * 0.56 - bh, bw, bh + 20);
    // sparse windows
    for (let wy = h * 0.56 - bh + 8; wy < h * 0.56 - 6; wy += 9) {
      for (let wx = bx + 4; wx < bx + bw - 4; wx += 7) {
        if (rand() > 0.86) {
          ctx.fillStyle = rand() > 0.5 ? 'rgba(255,190,110,0.55)' : 'rgba(120,220,255,0.45)';
          ctx.fillRect(wx, wy, 2, 1.5);
          ctx.fillStyle = 'rgba(1,3,6,0.92)';
        }
      }
    }
    bx += bw + 3 + rand() * 12;
  }

  // low haze band
  const haze = ctx.createLinearGradient(0, h * 0.48, 0, h * 0.66);
  haze.addColorStop(0, 'rgba(80,130,160,0)');
  haze.addColorStop(0.5, 'rgba(70,120,150,0.12)');
  haze.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, h * 0.45, w, h * 0.25);

  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();

  return { background: tex, environment: env, skyCanvas: canvas };
}

/** Crisp moon disc with a soft halo. */
export function makeMoonTexture(): THREE.Texture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.30, 'rgba(240,248,255,0.98)');
  g.addColorStop(0.42, 'rgba(205,230,255,0.9)');
  g.addColorStop(0.48, 'rgba(150,195,235,0.35)');
  g.addColorStop(0.7, 'rgba(90,140,190,0.08)');
  g.addColorStop(1.0, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Soft additive glow sprite texture (generated). */
export function makeGlowTexture(): THREE.Texture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.22)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
