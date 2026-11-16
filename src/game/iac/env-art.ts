import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Collider } from './player';
import type { PortWorld } from './port';
import type { TerrainField, TerrainMeta } from './terrain';

/**
 * Environment-art pass for the Anvil Landing slice.
 *
 * All static detail is merged by material into a handful of meshes. The
 * architectural port GLB keeps its authored PBR materials; this module adds
 * the engineered terrace, apron/wall/road, pad markings and props, a container
 * outfitter, terminal forecourt furniture and mid-ground basin detail.
 */

export interface EnvironmentArt {
  root: THREE.Group;
  casters: THREE.Group;
  road: THREE.Group | null;
  colliders: Collider[];
  update: (elapsed: number) => void;
}

const TERRACE_CZ = -420;
const TERRACE_HX = 760;
const TERRACE_HZ = 780;
const TERRACE_R = 230;
const ROAD_GAP_X = 250;
const ROAD_GAP_HALF = 13;

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, repeat = false): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  draw(ctx);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  tex.needsUpdate = true;
  return tex;
}

function cloneMat(
  port: PortWorld,
  name: string,
  options: { color?: number; roughness?: number; metalness?: number; emissive?: number; emissiveIntensity?: number } = {},
): THREE.MeshStandardMaterial {
  const src = port.materials.get(name);
  const mat = src instanceof THREE.MeshStandardMaterial
    ? src.clone()
    : new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.8, metalness: 0.1 });
  mat.name = `ENV_${name}`;
  if (options.color !== undefined) mat.color.set(options.color);
  if (options.roughness !== undefined) mat.roughness = options.roughness;
  if (options.metalness !== undefined) mat.metalness = options.metalness;
  if (options.emissive !== undefined) mat.emissive.set(options.emissive);
  if (options.emissiveIntensity !== undefined) mat.emissiveIntensity = options.emissiveIntensity;
  mat.envMapIntensity = 0.55;
  mat.needsUpdate = true;
  return mat;
}

function concreteMaterial(): THREE.MeshStandardMaterial {
  const texture = canvasTexture(1024, 1024, (ctx) => {
    ctx.fillStyle = '#77736a';
    ctx.fillRect(0, 0, 1024, 1024);
    const rand = rng(9123);
    for (let i = 0; i < 5000; i += 1) {
      const v = 82 + Math.floor(rand() * 54);
      ctx.fillStyle = `rgba(${v},${v - 3},${v - 7},${0.06 + rand() * 0.12})`;
      ctx.fillRect(rand() * 1024, rand() * 1024, 1 + rand() * 4, 1 + rand() * 4);
    }
    // 10 m slab joints (texture covers 40 m at repeat 4)
    ctx.strokeStyle = 'rgba(38,35,31,0.62)';
    ctx.lineWidth = 3;
    for (const p of [0, 256, 512, 768, 1024]) {
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, 1024); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(1024, p); ctx.stroke();
    }
    // hairline cracks
    ctx.strokeStyle = 'rgba(30,27,24,0.4)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 26; i += 1) {
      let x = rand() * 1024;
      let y = rand() * 1024;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 6; k += 1) {
        x += (rand() - 0.5) * 90;
        y += (rand() - 0.5) * 70;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }, true);
  texture.repeat.set(4, 4);
  return new THREE.MeshStandardMaterial({
    map: texture,
    color: 0xa8a196,
    roughness: 0.92,
    metalness: 0.03,
    envMapIntensity: 0.28,
  });
}

function containerMaterial(): THREE.MeshStandardMaterial {
  const texture = canvasTexture(512, 512, (ctx) => {
    ctx.fillStyle = '#3f4b44';
    ctx.fillRect(0, 0, 512, 512);
    // corrugated vertical ribs with shaded edges
    for (let x = 0; x < 512; x += 22) {
      const g = ctx.createLinearGradient(x, 0, x + 22, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.36)');
      g.addColorStop(0.3, 'rgba(255,255,255,0.12)');
      g.addColorStop(0.55, 'rgba(0,0,0,0.08)');
      g.addColorStop(1, 'rgba(0,0,0,0.4)');
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, 22, 512);
    }
    const rand = rng(191);
    for (let i = 0; i < 900; i += 1) {
      ctx.fillStyle = `rgba(120,84,42,${0.04 + rand() * 0.18})`;
      ctx.fillRect(rand() * 512, rand() * 512, 1 + rand() * 8, 1 + rand() * 2);
    }
    ctx.strokeStyle = 'rgba(10,13,12,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(6, 6, 500, 500);
  }, true);
  texture.repeat.set(2, 1);
  return new THREE.MeshStandardMaterial({
    map: texture,
    color: 0x9fae9f,
    roughness: 0.58,
    metalness: 0.62,
    envMapIntensity: 0.48,
  });
}

function imageTexture(
  size: number,
  seed: number,
  paint: (ctx: CanvasRenderingContext2D, rand: () => number) => void,
  repeat = 1,
): THREE.CanvasTexture {
  const tex = canvasTexture(size, size, (ctx) => {
    ctx.clearRect(0, 0, size, size);
    paint(ctx, rng(seed));
  }, true);
  tex.repeat.set(repeat, repeat);
  return tex;
}

function paintedMetalTexture(base: string, accent: string, rust: string, seed: number): THREE.CanvasTexture {
  return imageTexture(256, seed, (ctx, rand) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1400; i += 1) {
      ctx.fillStyle = `rgba(255,255,255,${rand() * 0.05})`;
      ctx.fillRect(rand() * 256, rand() * 256, 1 + rand() * 3, 1 + rand() * 2);
    }
    // chipped paint along seams / random wear
    for (let i = 0; i < 90; i += 1) {
      ctx.fillStyle = rand() > 0.55 ? accent : rust;
      ctx.globalAlpha = 0.12 + rand() * 0.34;
      ctx.fillRect(rand() * 256, rand() * 256, 1 + rand() * 9, 1 + rand() * 3);
    }
    ctx.globalAlpha = 1;
    // rust runs
    ctx.strokeStyle = rust;
    ctx.lineWidth = 1;
    for (let i = 0; i < 18; i += 1) {
      const x = rand() * 256;
      const y = rand() * 190;
      ctx.globalAlpha = 0.12 + rand() * 0.22;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rand() - 0.5) * 5, y + 18 + rand() * 55);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }, 2);
}

function timberTexture(): THREE.CanvasTexture {
  return imageTexture(256, 7741, (ctx, rand) => {
    ctx.fillStyle = '#6b543f';
    ctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 32) {
      const shade = 42 + Math.floor(rand() * 28);
      ctx.fillStyle = `rgb(${shade + 42},${shade + 24},${shade + 8})`;
      ctx.fillRect(0, y, 256, 30);
      ctx.strokeStyle = 'rgba(28,20,12,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, y + 31); ctx.lineTo(256, y + 31); ctx.stroke();
      for (let i = 0; i < 18; i += 1) {
        ctx.strokeStyle = `rgba(${25 + rand() * 50},${18 + rand() * 35},${10 + rand() * 24},${0.12 + rand() * 0.22})`;
        ctx.lineWidth = 0.6 + rand();
        const yy = y + 3 + rand() * 25;
        ctx.beginPath(); ctx.moveTo(0, yy); ctx.bezierCurveTo(80, yy + rand() * 5, 170, yy - rand() * 5, 256, yy + (rand() - 0.5) * 4); ctx.stroke();
      }
    }
    for (let i = 0; i < 160; i += 1) {
      ctx.fillStyle = 'rgba(20,15,10,0.3)';
      ctx.fillRect(rand() * 256, rand() * 256, 1 + rand() * 4, 1);
    }
  }, 2);
}

function steelTexture(): THREE.CanvasTexture {
  return imageTexture(256, 9911, (ctx, rand) => {
    ctx.fillStyle = '#586064';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i += 1) {
      const v = 40 + Math.floor(rand() * 55);
      ctx.fillStyle = `rgba(${v},${v + 5},${v + 7},${0.08 + rand() * 0.14})`;
      ctx.fillRect(rand() * 256, rand() * 256, 1 + rand() * 2, 1 + rand() * 6);
    }
    for (let i = 0; i < 28; i += 1) {
      ctx.strokeStyle = `rgba(122,74,40,${0.08 + rand() * 0.18})`;
      ctx.lineWidth = 1 + rand() * 2;
      const x = rand() * 256;
      const y = rand() * 200;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rand() - 0.5) * 9, y + 16 + rand() * 50); ctx.stroke();
    }
  }, 3);
}

function basaltTexture(): THREE.CanvasTexture {
  return imageTexture(256, 3211, (ctx, rand) => {
    ctx.fillStyle = '#4c463d';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 80; i += 1) {
      const x = rand() * 256;
      const y = rand() * 256;
      const r = 3 + rand() * 22;
      const g = ctx.createRadialGradient(x, y, 1, x, y, r);
      const v = 42 + Math.floor(rand() * 48);
      g.addColorStop(0, `rgba(${v},${v - 4},${v - 9},0.45)`);
      g.addColorStop(1, 'rgba(40,36,30,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 650; i += 1) {
      const v = 36 + Math.floor(rand() * 70);
      ctx.fillStyle = `rgba(${v},${v - 5},${v - 10},0.5)`;
      ctx.fillRect(rand() * 256, rand() * 256, 1 + rand() * 2, 1 + rand() * 2);
    }
    // fractured planes
    ctx.strokeStyle = 'rgba(25,23,20,0.5)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 28; i += 1) {
      let x = rand() * 256;
      let y = rand() * 256;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let k = 0; k < 4; k += 1) { x += (rand() - 0.5) * 34; y += (rand() - 0.5) * 26; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }, 3);
}

function paverTexture(): THREE.CanvasTexture {
  return imageTexture(512, 5511, (ctx, rand) => {
    ctx.fillStyle = '#8b8275';
    ctx.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y += 64) {
      for (let x = 0; x < 512; x += 64) {
        const v = 122 + Math.floor(rand() * 26);
        ctx.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
        ctx.fillRect(x + 1, y + 1, 62, 62);
      }
    }
    ctx.strokeStyle = 'rgba(45,41,35,0.5)';
    ctx.lineWidth = 2;
    for (let p = 0; p <= 512; p += 64) {
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, 512); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(512, p); ctx.stroke();
    }
    for (let i = 0; i < 700; i += 1) {
      ctx.fillStyle = `rgba(60,52,42,${rand() * 0.06})`;
      ctx.fillRect(rand() * 512, rand() * 512, 1 + rand() * 3, 1 + rand() * 3);
    }
  }, 4);
}

function apronConcreteTexture(): THREE.CanvasTexture {
  const tex = imageTexture(1024, 2171, (ctx, rand) => {
    ctx.fillStyle = '#a29b8e';
    ctx.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 7000; i += 1) {
      const v = 112 + Math.floor(rand() * 55);
      ctx.fillStyle = `rgba(${v},${v - 3},${v - 8},${0.04 + rand() * 0.1})`;
      ctx.fillRect(rand() * 1024, rand() * 1024, 1 + rand() * 5, 1 + rand() * 5);
    }
    // Large apron pours / expansion joints, deliberately varied.
    for (let y = 0; y < 1024; y += 256) {
      for (let x = 0; x < 1024; x += 256) {
        if (rand() > 0.55) {
          const v = 132 + Math.floor(rand() * 32);
          ctx.fillStyle = `rgba(${v},${v - 4},${v - 10},0.12)`;
          ctx.fillRect(x + 4, y + 4, 248, 248);
        }
      }
    }
    ctx.strokeStyle = 'rgba(62,57,51,0.24)';
    ctx.lineWidth = 2.5;
    for (let p = 0; p <= 1024; p += 256) {
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, 1024); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(1024, p); ctx.stroke();
    }
    // faded tyre arcs and broad oil staining
    for (let i = 0; i < 16; i += 1) {
      ctx.strokeStyle = `rgba(34,33,30,${0.025 + rand() * 0.055})`;
      ctx.lineWidth = 10 + rand() * 24;
      ctx.beginPath();
      ctx.arc(rand() * 1024, rand() * 1024, 90 + rand() * 470, rand() * 6.28, rand() * 6.28 + 1.2);
      ctx.stroke();
    }
  }, 4);
  return tex;
}

function concreteBlockSurface(seed: number, base = '#817b71'): THREE.CanvasTexture {
  return imageTexture(256, seed, (ctx, rand) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1200; i += 1) {
      const v = 96 + Math.floor(rand() * 46);
      ctx.fillStyle = `rgba(${v},${v - 2},${v - 6},${0.06 + rand() * 0.12})`;
      ctx.fillRect(rand() * 256, rand() * 256, 1 + rand() * 3, 1 + rand() * 3);
    }
    ctx.strokeStyle = 'rgba(40,37,33,0.45)';
    ctx.lineWidth = 1.5;
    for (let p = 0; p <= 256; p += 64) {
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, 256); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(256, p); ctx.stroke();
    }
  }, 3);
}

function scrubMaterial(): THREE.MeshStandardMaterial {
  const texture = canvasTexture(256, 256, (ctx) => {
    ctx.clearRect(0, 0, 256, 256);
    const rand = rng(5501);
    for (let i = 0; i < 90; i += 1) {
      const x = 20 + rand() * 216;
      const y = 240 - rand() * 130;
      const len = 25 + rand() * 105;
      const lean = (rand() - 0.5) * 55;
      ctx.strokeStyle = `rgba(${90 + Math.floor(rand() * 35)},${75 + Math.floor(rand() * 30)},${42 + Math.floor(rand() * 18)},${0.6 + rand() * 0.4})`;
      ctx.lineWidth = 1 + rand() * 2.1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + lean * 0.4, y - len * 0.55, x + lean, y - len);
      ctx.stroke();
    }
  });
  return new THREE.MeshStandardMaterial({
    map: texture,
    color: 0x8c8259,
    alphaTest: 0.35,
    side: THREE.DoubleSide,
    roughness: 1,
    metalness: 0,
  });
}

function padOverlayTexture(): THREE.CanvasTexture {
  return canvasTexture(2048, 2048, (ctx) => {
    ctx.clearRect(0, 0, 2048, 2048);
    const rand = rng(7721);
    // slab joints, tuned to a 160 m overlay
    ctx.strokeStyle = 'rgba(20,21,20,0.28)';
    ctx.lineWidth = 4;
    for (let p = 0; p <= 2048; p += 128) {
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, 2048); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(2048, p); ctx.stroke();
    }
    // cracks
    ctx.strokeStyle = 'rgba(24,22,20,0.3)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 42; i += 1) {
      let x = rand() * 2048;
      let y = rand() * 2048;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let k = 0; k < 5; k += 1) {
        x += (rand() - 0.5) * 160;
        y += (rand() - 0.5) * 140;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // oil / hydraulic stains
    for (let i = 0; i < 24; i += 1) {
      const x = 300 + rand() * 1448;
      const y = 300 + rand() * 1448;
      const r = 12 + rand() * 55;
      const g = ctx.createRadialGradient(x, y, 2, x, y, r);
      g.addColorStop(0, `rgba(12,12,11,${0.18 + rand() * 0.22})`);
      g.addColorStop(1, 'rgba(12,12,11,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    // engine scorch under the A-30
    for (const [x, y] of [[850, 1060], [1190, 1060]]) {
      const g = ctx.createRadialGradient(x, y, 4, x, y, 175);
      g.addColorStop(0, 'rgba(16,14,12,0.52)');
      g.addColorStop(0.4, 'rgba(35,24,17,0.3)');
      g.addColorStop(1, 'rgba(35,24,17,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, 175, 0, Math.PI * 2); ctx.fill();
    }
    // tyre tracks toward the ramp/departure line
    ctx.strokeStyle = 'rgba(20,20,18,0.25)';
    ctx.lineWidth = 12;
    for (const off of [-46, 46]) {
      ctx.beginPath();
      ctx.moveTo(1024 + off, 1024);
      ctx.bezierCurveTo(1100 + off, 1180, 1220 + off, 1390, 1220 + off, 2048);
      ctx.stroke();
    }
    // markings: A-30 identity / nose box / arrows / tie-down squares
    ctx.strokeStyle = 'rgba(231,221,193,0.62)';
    ctx.fillStyle = 'rgba(231,221,193,0.62)';
    ctx.lineWidth = 7;
    for (const [x, y] of [[600, 780], [1448, 780], [600, 1268], [1448, 1268]]) {
      ctx.strokeRect(x - 42, y - 42, 84, 84);
    }
    ctx.font = '700 108px "Avenir Next Condensed", sans-serif';
    ctx.fillText('A-30', 840, 1630);
    ctx.font = '600 48px ui-monospace, monospace';
    ctx.fillText('AP-03  ·  NO STEP', 820, 1710);
    ctx.strokeStyle = 'rgba(212,174,100,0.55)';
    ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(1018, 360); ctx.lineTo(1070, 440); ctx.lineTo(1040, 440); ctx.lineTo(1040, 620); ctx.lineTo(996, 620); ctx.lineTo(996, 440); ctx.lineTo(966, 440); ctx.closePath(); ctx.stroke();
  });
}

function signTexture(title: string, subtitle: string, width = 1024, height = 192): THREE.CanvasTexture {
  return canvasTexture(width, height, (ctx) => {
    ctx.fillStyle = '#161411';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#c8a15f';
    ctx.lineWidth = 6;
    ctx.strokeRect(5, 5, width - 10, height - 10);
    ctx.fillStyle = '#f1e7d2';
    ctx.font = `600 ${Math.round(height * 0.31)}px "Avenir Next Condensed", sans-serif`;
    ctx.fillText(title, 32, Math.round(height * 0.46));
    ctx.fillStyle = '#8ac9c7';
    ctx.font = `500 ${Math.round(height * 0.16)}px ui-monospace, monospace`;
    ctx.fillText(subtitle, 34, Math.round(height * 0.74));
    ctx.fillStyle = '#c8a15f';
    ctx.fillRect(34, Math.round(height * 0.83), width - 68, 3);
  });
}

function interiorGlowTexture(): THREE.CanvasTexture {
  return canvasTexture(1024, 256, (ctx) => {
    // Opaque warm interior so the glow reads at foot level instead of acting
    // like a faint transparent decal over a black wall.
    ctx.fillStyle = 'rgba(38,28,19,0.96)';
    ctx.fillRect(0, 0, 1024, 256);
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgba(78,58,40,0.95)');
    g.addColorStop(0.45, 'rgba(188,132,72,0.95)');
    g.addColorStop(1, 'rgba(255,205,136,0.98)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1024, 256);
    // warm ceiling strips
    for (let x = 36; x < 1024; x += 118) {
      ctx.fillStyle = 'rgba(255,244,210,0.95)';
      ctx.fillRect(x, 32, 78, 7);
      ctx.fillStyle = 'rgba(255,207,138,0.25)';
      ctx.fillRect(x - 8, 39, 94, 30);
    }
    // interior silhouettes / shelving / people
    const rand = rng(8821);
    for (let i = 0; i < 24; i += 1) {
      const x = 18 + rand() * 980;
      const w = 16 + rand() * 46;
      const h = 60 + rand() * 95;
      ctx.fillStyle = `rgba(15,15,13,${0.35 + rand() * 0.35})`;
      ctx.fillRect(x, 84 + rand() * 40, w, h);
    }
    for (let x = 0; x < 1024; x += 256) {
      ctx.fillStyle = 'rgba(30,35,35,0.5)';
      ctx.fillRect(x, 0, 6, 256);
    }
    // warm floor reflection at the bottom of the glass
    const floor = ctx.createLinearGradient(0, 205, 0, 256);
    floor.addColorStop(0, 'rgba(255,223,164,0)');
    floor.addColorStop(1, 'rgba(255,223,164,0.55)');
    ctx.fillStyle = floor;
    ctx.fillRect(0, 205, 1024, 51);
  });
}

function interiorSpillTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 256, (ctx) => {
    ctx.clearRect(0, 0, 256, 256);
    const g = ctx.createRadialGradient(128, 128, 4, 128, 128, 126);
    g.addColorStop(0, 'rgba(255,207,142,0.55)');
    g.addColorStop(0.45, 'rgba(236,170,98,0.22)');
    g.addColorStop(1, 'rgba(236,170,98,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  });
}

function dustTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
    g.addColorStop(0, 'rgba(255,219,170,0.52)');
    g.addColorStop(0.45, 'rgba(198,160,116,0.18)');
    g.addColorStop(1, 'rgba(198,160,116,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
}

function sanitizeNonFinite(g: THREE.BufferGeometry): THREE.BufferGeometry | null {
  const pos = g.getAttribute('position');
  if (!pos) return g;
  let bad = false;
  for (let i = 0; i < pos.array.length; i += 1) {
    if (!Number.isFinite(pos.array[i])) { bad = true; break; }
  }
  if (!bad) return g;
  const keep: number[] = [];
  for (let i = 0; i < pos.count; i += 3) {
    let finite = true;
    for (let k = 0; k < 3 && finite; k += 1) {
      const vi = i + k;
      for (let c = 0; c < pos.itemSize; c += 1) {
        if (!Number.isFinite(pos.getComponent(vi, c))) { finite = false; break; }
      }
    }
    if (finite) keep.push(i, i + 1, i + 2);
  }
  if (keep.length === 0) return null;
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv'] as const) {
    const attr = g.getAttribute(name);
    if (!attr) continue;
    const item = attr.itemSize;
    const arr = new Float32Array(keep.length * item);
    keep.forEach((vi, j) => {
      for (let c = 0; c < item; c += 1) arr[j * item + c] = attr.getComponent(vi, c);
    });
    out.setAttribute(name, new THREE.Float32BufferAttribute(arr, item));
  }
  return out;
}

class DetailBuilder {
  private readonly buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private readonly group = new THREE.Group();

  constructor(name: string) {
    this.group.name = name;
  }

  add(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1): void {
    let g = geo.index ? geo.toNonIndexed() : geo;
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
      new THREE.Vector3(s, s, s),
    );
    g = g.clone().applyMatrix4(m);
    const position = g.getAttribute('position');
    if (!g.getAttribute('uv')) {
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(position.count * 2), 2));
    }
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    // Merging requires identical attribute arrays. Source kitbash geometry can
    // carry extra colour/tangent layers or Float64 UVs; normalise to the three
    // attributes every built-in geometry shares.
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    }
    for (const name of ['position', 'normal', 'uv'] as const) {
      const attr = g.getAttribute(name);
      if (!attr) continue;
      if (!(attr.array instanceof Float32Array)) {
        g.setAttribute(name, new THREE.Float32BufferAttribute(Array.from(attr.array), attr.itemSize, attr.normalized));
      }
    }
    const clean = sanitizeNonFinite(g);
    if (!clean) return;
    if (!this.buckets.has(mat)) this.buckets.set(mat, []);
    this.buckets.get(mat)!.push(clean);
  }

  box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void {
    this.add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, rx, ry, rz);
  }

  cylinder(rt: number, rb: number, h: number, seg: number, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void {
    this.add(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z, rx, ry, rz);
  }

  cone(r: number, h: number, seg: number, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void {
    this.add(new THREE.ConeGeometry(r, h, seg), mat, x, y, z, rx, ry, rz);
  }

  plane(w: number, h: number, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void {
    this.add(new THREE.PlaneGeometry(w, h), mat, x, y, z, rx, ry, rz);
  }

  build(receiveShadow = true): THREE.Group {
    for (const [mat, geos] of this.buckets) {
      const merged = mergeGeometries(geos);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = `Env_${mat.name || 'detail'}`;
      mesh.castShadow = false;
      mesh.receiveShadow = receiveShadow;
      this.group.add(mesh);
    }
    return this.group;
  }
}

function wallSegments(): Array<{ x: number; z: number; len: number; yaw: number; gap?: boolean }> {
  return [
    { x: 0, z: -1200, len: 1060, yaw: 0 }, // north
    { x: -760, z: -420, len: 1100, yaw: Math.PI / 2 }, // west
    { x: 760, z: -420, len: 1100, yaw: Math.PI / 2 }, // east
    { x: (-530 + 238) / 2, z: 360, len: 238 + 530, yaw: 0 }, // south west of gate
    { x: (262 + 530) / 2, z: 360, len: 530 - 262, yaw: 0 }, // south east of gate
  ];
}

function addCornerWall(b: DetailBuilder, cx: number, cz: number, start: number, mat: THREE.Material, hazard: THREE.Material, plateauH = 36.8): void {
  // Six chord boxes around a quarter circle at radius 230.
  const steps = 7;
  for (let i = 0; i < steps; i += 1) {
    const a0 = start + (i / steps) * (Math.PI / 2);
    const a1 = start + ((i + 1) / steps) * (Math.PI / 2);
    const mx = cx + Math.cos((a0 + a1) / 2) * TERRACE_R;
    const mz = cz + Math.sin((a0 + a1) / 2) * TERRACE_R;
    const len = Math.abs(a1 - a0) * TERRACE_R + 1.4;
    const yaw = (a0 + a1) / 2 + Math.PI / 2;
    b.box(len, 1.1, 0.7, mat, mx, plateauH + 0.55, mz, 0, yaw, 0);
    b.box(len, 0.12, 0.76, hazard, mx, plateauH + 1.16, mz, 0, yaw, 0);
  }
}

function addWall(
  b: DetailBuilder,
  mat: THREE.Material,
  hazard: THREE.Material,
  colliders: Collider[],
  plateauH: number,
): void {
  const wallY = plateauH + 0.55;
  for (const seg of wallSegments()) {
    const len = seg.gap ? seg.len - ROAD_GAP_HALF * 2 : seg.len;
    b.box(len, 1.1, 0.7, mat, seg.x, wallY, seg.z, 0, seg.yaw, 0);
    b.box(len, 0.12, 0.76, hazard, seg.x, plateauH + 1.16, seg.z, 0, seg.yaw, 0);
    const half = len / 2;
    if (seg.yaw === 0) {
      colliders.push({
        id: `terrace-wall-${seg.z}-${seg.x}`,
        minX: seg.x - half, maxX: seg.x + half,
        minY: plateauH, maxY: plateauH + 1.3,
        minZ: seg.z - 0.5, maxZ: seg.z + 0.5,
      });
    } else {
      colliders.push({
        id: `terrace-wall-${seg.x}-${seg.z}`,
        minX: seg.x - 0.5, maxX: seg.x + 0.5,
        minY: plateauH, maxY: plateauH + 1.3,
        minZ: seg.z - half, maxZ: seg.z + half,
      });
    }
  }
  // Rounded corners.
  addCornerWall(b, 530, -970, Math.PI, mat, hazard);
  addCornerWall(b, -530, -970, -Math.PI / 2, mat, hazard);
  addCornerWall(b, 530, 130, 0, mat, hazard);
  addCornerWall(b, -530, 130, Math.PI / 2, mat, hazard);
  // Coarse corner colliders.
  for (const [x, z] of [[530, -970], [-530, -970], [530, 130], [-530, 130]]) {
    colliders.push({ id: `terrace-corner-${x}-${z}`, minX: x - 170, maxX: x + 170, minY: plateauH, maxY: plateauH + 1.3, minZ: z - 170, maxZ: z + 170 });
  }
}

function addApron(b: DetailBuilder, matSlab: THREE.Material, matWall: THREE.Material, matHazard: THREE.Material, padY: number): void {
  const apronY = padY - 0.29;
  // 50 m concrete ring around the 1.2 km deck.
  b.box(682 - 630, 0.25, 1102 - 1050, matSlab, (682 + 630) / 2, apronY - 0.12, 0, 0, 0, 0);
  b.box(682 - 630, 0.25, 1102 - 1050, matSlab, -(682 + 630) / 2, apronY - 0.12, 0, 0, 0, 0);
  b.box(630 * 2 + 4, 0.25, 262 - 210, matSlab, 0, apronY - 0.12, (262 + 210) / 2, 0, 0, 0);
  b.box(630 * 2 + 4, 0.25, 262 - 210, matSlab, 0, apronY - 0.12, -(262 + 210) / 2, 0, 0, 0);
  // deck curb / edge trim
  b.box(630 * 2 + 0.8, 0.34, 0.7, matWall, 0, padY + 0.03, 210.2, 0, 0, 0);
  b.box(630 * 2 + 0.8, 0.34, 0.7, matWall, 0, padY + 0.03, -1050.2, 0, 0, 0);
  b.box(0.7, 0.34, 1050 * 2, matWall, 630.2, padY + 0.03, -420, 0, 0, 0);
  b.box(0.7, 0.34, 1050 * 2, matWall, -630.2, padY + 0.03, -420, 0, 0, 0);
  b.box(630 * 2 + 0.8, 0.08, 0.76, matHazard, 0, padY + 0.24, 210.2, 0, 0, 0);
  b.box(630 * 2 + 0.8, 0.08, 0.76, matHazard, 0, padY + 0.24, -1050.2, 0, 0, 0);
  b.box(0.76, 0.08, 1050 * 2, matHazard, 630.2, padY + 0.24, -420, 0, 0, 0);
  b.box(0.76, 0.08, 1050 * 2, matHazard, -630.2, padY + 0.24, -420, 0, 0, 0);
}

function addApronWall(
  b: DetailBuilder,
  mats: Record<string, THREE.Material>,
  padY: number,
  plateauH: number,
  colliders: Collider[],
): void {
  const apronY = padY - 0.29;
  const base = plateauH;
  const wallH = apronY - base + 0.04;
  const capH = 0.9;
  const cx = 682;
  const cz = 262;
  const nz = -1102;

  const side = (
    id: string,
    x0: number, x1: number, z0: number, z1: number,
    alongX: boolean,
  ): void => {
    const len = alongX ? x1 - x0 : z1 - z0;
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    const w = alongX ? len : 1.1;
    const d = alongX ? 1.1 : len;
    b.box(w, wallH, d, mats.wall, mx, base + wallH / 2, mz);
    b.box(w + 0.15, capH, d + 0.15, mats.wall, mx, apronY + capH / 2, mz);
    b.box(w + 0.2, 0.12, d + 0.2, mats.hazard, mx, apronY + capH + 0.02, mz);
    // Buttresses on the basin face every 36 m.
    const step = 36;
    if (alongX) {
      for (let x = x0 + 18; x < x1 - 8; x += step) {
        b.box(1.4, wallH + 0.35, 1.8, mats.wall, x, base + (wallH + 0.35) / 2, z0 < -500 ? z0 - 0.9 : z0 + 0.9);
      }
    } else {
      for (let z = z0 + 18; z < z1 - 8; z += step) {
        b.box(1.8, wallH + 0.35, 1.4, mats.wall, x0 < 0 ? x0 - 0.9 : x0 + 0.9, base + (wallH + 0.35) / 2, z);
      }
    }
    colliders.push({
      id,
      minX: alongX ? x0 : mx - 0.8,
      maxX: alongX ? x1 : mx + 0.8,
      minY: base,
      maxY: apronY + capH + 0.08,
      minZ: alongX ? mz - 0.8 : z0,
      maxZ: alongX ? mz + 0.8 : z1,
    });
  };

  side('apron-wall-n', -cx, cx, nz, nz, true);
  side('apron-wall-w', -cx, -cx, nz, cz, false);
  side('apron-wall-e', cx, cx, nz, cz, false);
  side('apron-wall-s1', -cx, 242, cz, cz, true);
  side('apron-wall-s2', 258, cx, cz, cz, true);

  // Painted edge line and drainage grates on the apron side.
  b.box(cx * 2 - 8, 0.02, 0.34, mats.paint, 0, apronY + 0.015, cz - 2.3);
  b.box(cx * 2 - 8, 0.02, 0.34, mats.paint, 0, apronY + 0.015, nz + 2.3);
  b.box(0.34, 0.02, cz - nz - 8, mats.paint, -cx + 2.3, apronY + 0.015, (cz + nz) / 2);
  b.box(0.34, 0.02, cz - nz - 8, mats.paint, cx - 2.3, apronY + 0.015, (cz + nz) / 2);
  for (let x = -620; x <= 620; x += 62) {
    b.box(1.2, 0.03, 0.55, mats.dark, x, apronY + 0.02, cz - 2.0);
  }
  // Chevron warning panels flanking the service ramp.
  for (const x of [230, 270]) {
    b.box(5.6, 0.6, 0.16, mats.hazard, x, apronY + 0.5, cz - 1.0);
  }

  // Foundation plinth, drainage channel and grates along the base of the
  // retaining wall. This is what visually ties the raised apron to the cut
  // terrace rather than letting the wall terminate in a raw edge.
  const baseY = plateauH + 0.07;
  b.box(cx * 2 + 10, 0.18, 4.2, mats.slab, 0, baseY, cz + 2.7);
  b.box(cx * 2 + 10, 0.18, 4.2, mats.slab, 0, baseY, nz - 2.7);
  b.box(4.2, 0.18, cz - nz + 5, mats.slab, cx + 2.7, baseY, (cz + nz) / 2);
  b.box(4.2, 0.18, cz - nz + 5, mats.slab, -cx - 2.7, baseY, (cz + nz) / 2);
  b.box(cx * 2 - 12, 0.06, 0.75, mats.dark, 0, baseY + 0.11, cz + 5.1);
  b.box(0.75, 0.06, cz - nz - 12, mats.dark, cx + 5.1, baseY + 0.11, (cz + nz) / 2);
  b.box(0.75, 0.06, cz - nz - 12, mats.dark, -cx - 5.1, baseY + 0.11, (cz + nz) / 2);
  for (let x = -640; x <= 640; x += 18) {
    b.box(0.85, 0.08, 0.55, mats.metal, x, baseY + 0.14, cz + 5.1);
  }
}

function addDeckStructures(
  padY: number,
  b: DetailBuilder,
  mats: Record<string, THREE.Material>,
  colliders: Collider[],
): void {
  const hangar = (x: number, z: number, w: number, d: number, h: number, label: string): void => {
    b.box(w, h, d, mats.wall, x, padY + h / 2, z);
    b.box(w + 5, 0.9, d + 5, mats.metal, x, padY + h + 0.45, z);
    for (let i = -1; i <= 1; i += 1) {
      b.box(w + 1, 0.3, d + 1, mats.dark, x, padY + h + 0.95 + i * 0.0, z);
    }
    // south roller doors + frames
    for (const dx of [-w * 0.3, 0, w * 0.3]) {
      b.box(w * 0.22, h * 0.72, 0.4, mats.dark, x + dx, padY + h * 0.36, z + d / 2 + 0.2);
      b.box(w * 0.24, 0.35, 0.5, mats.yellow, x + dx, padY + h * 0.74, z + d / 2 + 0.25);
      for (let k = -3; k <= 3; k += 1) {
        b.box(w * 0.2, 0.05, 0.46, mats.metal, x + dx, padY + h * 0.36 + k * h * 0.08, z + d / 2 + 0.26);
      }
    }
    // roof vents / skylights
    for (let i = -2; i <= 2; i += 1) {
      b.box(4.0, 1.2, 3.0, mats.metal, x + i * (w / 6), padY + h + 1.2, z - d * 0.18);
    }
    // hazard band and corner pilasters
    b.box(w + 0.4, 0.5, 0.3, mats.hazard, x, padY + 0.7, z + d / 2 + 0.05);
    for (const sx of [-w / 2, w / 2]) {
      for (const sz of [-d / 2, d / 2]) {
        b.box(1.1, h, 1.1, mats.metal, x + sx, padY + h / 2, z + sz);
      }
    }
    // roof identification panel
    b.box(w * 0.18, 2.2, 0.4, mats.dark, x + w * 0.34, padY + h * 0.8, z + d / 2 + 0.3);
    colliders.push({ id: `hangar-${label}`, minX: x - w / 2, maxX: x + w / 2, minY: padY, maxY: padY + h, minZ: z - d / 2, maxZ: z + d / 2 });
  };

  hangar(-420, -650, 210, 120, 24, 'A');
  hangar(390, -540, 180, 100, 20, 'B');

  // Container stacks along the east service edge.
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      const x = 520 - row * 3.2;
      const z = -90 - col * 3.6;
      b.box(12.0, 2.9, 2.9, mats.container, x, padY + 1.6 + row * 3.0, z, 0, Math.PI / 2, 0);
      for (const off of [-4.8, -2.4, 0, 2.4, 4.8]) {
        b.box(0.1, 2.6, 0.1, mats.metal, x, padY + 1.6 + row * 3.0, z + off, 0, Math.PI / 2, 0);
      }
    }
  }
  colliders.push({ id: 'east-container-stack', minX: 494, maxX: 536, minY: padY, maxY: padY + 12, minZ: -114, maxZ: -76 });

  // Tank farm on the north-west hardstand.
  for (let i = 0; i < 4; i += 1) {
    const tx = -500 + (i % 2) * 26;
    const tz = -820 + Math.floor(i / 2) * 30;
    b.cylinder(8.0, 8.6, 24, 18, mats.paint, tx, padY + 12, tz);
    b.cylinder(8.2, 8.2, 1.6, 18, mats.metal, tx, padY + 24.8, tz);
    b.box(3.0, 0.5, 3.0, mats.dark, tx, padY + 25.8, tz);
  }
  colliders.push({ id: 'tank-farm', minX: -516, maxX: -464, minY: padY, maxY: padY + 26, minZ: -836, maxZ: -776 });

  // Perimeter floodlight masts, spaced so the deck does not read empty.
  for (const [x, z] of [[-590, -960], [590, -960], [-590, 150], [590, 150], [-200, -960], [200, -960]] as const) {
    b.cylinder(0.2, 0.34, 18, 7, mats.metal, x, padY + 9, z);
    b.box(3.2, 0.6, 1.4, mats.warm, x, padY + 18.1, z);
    b.box(4.0, 0.4, 1.8, mats.dark, x, padY + 17.6, z);
  }
}

function addTerraceYard(
  field: TerrainField,
  b: DetailBuilder,
  mats: Record<string, THREE.Material>,
  colliders: Collider[],
): void {
  const cx = 492;
  const cz = 306;
  const y = field.heightAt(cx, cz);
  b.box(148, 0.16, 78, mats.slab, cx, y + 0.1, cz);
  b.box(140, 0.03, 1.1, mats.hazard, cx, y + 0.2, cz - 30);
  b.box(140, 0.03, 1.1, mats.hazard, cx, y + 0.2, cz + 30);
  for (let i = 0; i < 6; i += 1) {
    const x = cx - 58 + (i % 3) * 20;
    const z = cz - 24 + Math.floor(i / 3) * 26;
    b.box(12.2, 2.9, 3.0, mats.container, x, y + 1.65, z, 0, i % 2 ? Math.PI / 2 : 0, 0);
    for (const r of [-5.2, -3.2, -1.2, 0.8, 2.8, 4.8]) {
      b.box(0.12, 2.6, 0.1, mats.metal, x + r, y + 1.65, z - 1.55, 0, i % 2 ? Math.PI / 2 : 0, 0);
    }
    colliders.push({ id: `yard2-container-${i}`, minX: x - 6.4, maxX: x + 6.4, minY: y, maxY: y + 3.2, minZ: z - 1.8, maxZ: z + 1.8 });
  }
  for (const tx of [cx + 48, cx + 62]) {
    b.cylinder(4.1, 4.4, 15, 16, mats.paint, tx, y + 7.7, cz + 18);
    b.cylinder(4.25, 4.25, 1.0, 16, mats.metal, tx, y + 15.7, cz + 18);
    b.cylinder(1.4, 1.8, 0.5, 12, mats.dark, tx, y + 15.9, cz + 18);
  }
  // A flatbed service truck and a tug.
  b.box(6.6, 0.8, 2.5, mats.dark, cx - 34, y + 0.85, cz + 30);
  b.box(2.4, 2.0, 2.3, mats.paint, cx - 37.5, y + 1.85, cz + 30);
  b.box(2.0, 1.1, 2.1, mats.glass, cx - 38.0, y + 2.5, cz + 30);
  for (const [wx, wz] of [[cx - 37, cz + 29], [cx - 37, cz + 31], [cx - 32.6, cz + 29], [cx - 32.6, cz + 31]]) {
    b.cylinder(0.58, 0.58, 0.34, 10, mats.rubber, wx, y + 0.48, wz, Math.PI / 2, 0, 0);
  }
  b.box(3.4, 0.8, 1.8, mats.yellow, cx + 34, y + 0.65, cz + 32);
  b.box(1.8, 1.3, 1.6, mats.paint, cx + 32.8, y + 1.45, cz + 32);
  for (const [wx, wz] of [[cx + 33, cz + 31.1], [cx + 33, cz + 32.9], [cx + 35, cz + 31.1], [cx + 35, cz + 32.9]]) {
    b.cylinder(0.34, 0.34, 0.24, 10, mats.dark, wx, y + 0.36, wz, Math.PI / 2, 0, 0);
  }
  // Floodlight masts.
  for (const [lx, lz] of [[cx - 66, cz - 32], [cx + 66, cz - 32], [cx - 66, cz + 32], [cx + 66, cz + 32]] as const) {
    const ly = field.heightAt(lx, lz);
    b.cylinder(0.13, 0.2, 12, 7, mats.metal, lx, ly + 6, lz);
    b.box(1.6, 0.35, 0.8, mats.warm, lx, ly + 12.05, lz);
  }
  // Coarse colliders for the container rows / tanks.
  colliders.push({ id: 'terrace-yard-tanks', minX: cx + 42, maxX: cx + 68, minY: y, maxY: y + 16, minZ: cz + 12, maxZ: cz + 24 });
}

function addGateRamp(
  b: DetailBuilder,
  mats: Record<string, THREE.Material>,
  padY: number,
  plateauH: number,
  colliders: Collider[],
): void {
  const x0 = 243.5;
  const x1 = 256.5;
  const z0 = 262;
  const z1 = 330;
  const y0 = padY - 0.29;
  const y1 = plateauH;
  const positions: number[] = [];
  const uvs: number[] = [];
  for (let i = 0; i <= 8; i += 1) {
    const t = i / 8;
    const z = z0 + (z1 - z0) * t;
    const y = y0 + (y1 - y0) * t + 0.03;
    positions.push(x0, y, z, x1, y, z);
    uvs.push(0, t * 7, 1, t * 7);
  }
  const indices: number[] = [];
  for (let i = 0; i < 8; i += 1) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  b.add(geo, mats.asphalt);

  // Side kerbs, guard posts and lamp bollards.
  for (let i = 0; i <= 12; i += 1) {
    const t = i / 12;
    const z = z0 + (z1 - z0) * t;
    const y = y0 + (y1 - y0) * t;
    for (const x of [x0 - 0.45, x1 + 0.45]) {
      b.box(0.6, 0.56, 3.3, mats.wall, x, y + 0.12, z);
    }
    if (i % 2 === 0) {
      for (const x of [x0 - 0.9, x1 + 0.9]) {
        b.box(0.12, 0.95, 0.12, mats.metal, x, y + 0.65, z);
      }
    }
    if (i % 4 === 2) {
      b.box(0.26, 0.18, 0.34, mats.warm, x0 - 0.9, y + 1.15, z);
      b.box(0.26, 0.18, 0.34, mats.warm, x1 + 0.9, y + 1.15, z);
    }
  }
  // Side rail runs.
  for (const x of [x0 - 0.9, x1 + 0.9]) {
    b.box(0.1, 0.1, z1 - z0, mats.metal, x, y0 + 1.02, (z0 + z1) / 2, -Math.atan2(y0 - y1, z1 - z0), 0, 0);
  }
  // Transverse expansion joints.
  for (let i = 1; i < 6; i += 1) {
    const t = i / 6;
    const z = z0 + (z1 - z0) * t;
    const y = y0 + (y1 - y0) * t + 0.045;
    b.box(x1 - x0, 0.018, 0.18, mats.dark, (x0 + x1) / 2, y, z);
  }
  colliders.push({
    id: 'gate-ramp-west',
    minX: x0 - 1.3, maxX: x0 + 0.1, minY: y1 - 0.4, maxY: y0 + 1.1,
    minZ: z0, maxZ: z1,
  });
  colliders.push({
    id: 'gate-ramp-east',
    minX: x1 - 0.1, maxX: x1 + 1.3, minY: y1 - 0.4, maxY: y0 + 1.1,
    minZ: z0, maxZ: z1,
  });
}

function addRoad(
  field: TerrainField,
  meta: TerrainMeta,
  padY: number,
  mats: {
    asphalt: THREE.Material;
    paint: THREE.Material;
    metal: THREE.Material;
    light: THREE.Material;
    concrete: THREE.Material;
    hazard: THREE.Material;
  },
  b: DetailBuilder,
  colliders: Collider[],
): void {
  if (!meta.road) return;
  const pts = meta.road.points;
  const width = meta.road.width_m;
  const samples: Array<{ x: number; z: number; nx: number; nz: number; y: number; d: number }> = [];
  let distance = 0;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[i + 1];
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(len / 3));
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps;
      const x = x0 + dx * t;
      const z = z0 + dz * t;
      const nx = dz / len;
      const nz = -dx / len;
      const y = field.heightAt(x, z) + 0.19;
      samples.push({ x, z, nx, nz, y, d: distance + len * t });
    }
    distance += len;
  }
  const [lx, lz] = pts[pts.length - 1];
  samples.push({ x: lx, z: lz, nx: 0, nz: -1, y: field.heightAt(lx, lz) + 0.19, d: distance });

  // A wide compacted shoulder under the asphalt ribbon keeps the road legible
  // from the overview and hides any terrain interpenetration.
  const shoulderWidth = width + 8.0;
  const sPositions: number[] = [];
  const sIndices: number[] = [];
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i];
    const sy = s.y - 0.1;
    const left = { x: s.x + s.nx * shoulderWidth * 0.5, z: s.z + s.nz * shoulderWidth * 0.5 };
    const right = { x: s.x - s.nx * shoulderWidth * 0.5, z: s.z - s.nz * shoulderWidth * 0.5 };
    sPositions.push(left.x, sy, left.z, right.x, sy, right.z);
    if (i < samples.length - 1) {
      const a = i * 2;
      sIndices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
  }
  const shoulderGeo = new THREE.BufferGeometry();
  shoulderGeo.setAttribute('position', new THREE.Float32BufferAttribute(sPositions, 3));
  shoulderGeo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(sPositions.length / 3 * 2), 2));
  shoulderGeo.setIndex(sIndices);
  shoulderGeo.computeVertexNormals();
  b.add(shoulderGeo, mats.concrete);

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i];
    const left = { x: s.x + s.nx * width * 0.5, z: s.z + s.nz * width * 0.5 };
    const right = { x: s.x - s.nx * width * 0.5, z: s.z - s.nz * width * 0.5 };
    positions.push(left.x, s.y, left.z, right.x, s.y, right.z);
    uvs.push(0, s.d / 10, 1, s.d / 10);
    if (i < samples.length - 1) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  b.add(geo, mats.asphalt);

  // Dashes + edge lines.
  for (let d = 18; d < distance - 10; d += 18) {
    let i = 1;
    while (i < samples.length && samples[i].d < d) i += 1;
    if (i >= samples.length) break;
    const a = samples[i - 1];
    const c = samples[i];
    const t = (d - a.d) / Math.max(1e-4, c.d - a.d);
    const x = a.x + (c.x - a.x) * t;
    const z = a.z + (c.z - a.z) * t;
    const y = a.y + (c.y - a.y) * t + 0.012;
    b.box(0.36, 0.02, 3.0, mats.paint, x, y, z, 0, Math.atan2(a.nx, a.nz), 0);
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < samples.length - 1; i += 1) {
      const a = samples[i];
      const c = samples[i + 1];
      const ax = a.x + a.nx * side * (width * 0.5 - 0.35);
      const az = a.z + a.nz * side * (width * 0.5 - 0.35);
      const cx = c.x + c.nx * side * (width * 0.5 - 0.35);
      const cz = c.z + c.nz * side * (width * 0.5 - 0.35);
      b.box(Math.hypot(cx - ax, cz - az) + 0.1, 0.02, 0.18, mats.paint, (ax + cx) / 2, (a.y + c.y) / 2 + 0.012, (az + cz) / 2, 0, Math.atan2(cx - ax, cz - az), 0);
    }
  }

  // Guardrail on the downhill side, road lamps and low retaining kerbs.
  const rand = rng(331);
  for (let i = 2; i < samples.length - 2; i += 2) {
    const s = samples[i];
    const hL = field.heightAt(s.x + s.nx * 10, s.z + s.nz * 10);
    const hR = field.heightAt(s.x - s.nx * 10, s.z - s.nz * 10);
    const side = hL < hR ? 1 : -1;
    const ox = s.x + s.nx * side * (width * 0.5 + 1.2);
    const oz = s.z + s.nz * side * (width * 0.5 + 1.2);
    const ground = field.heightAt(ox, oz);
    b.box(0.12, 0.95, 0.12, mats.metal, ox, ground + 0.48, oz);
    if (i % 4 === 2) {
      const prev = samples[Math.max(0, i - 3)];
      b.box(0.12, 0.13, Math.max(2, Math.hypot(s.x - prev.x, s.z - prev.z) * 1.4), mats.metal, (ox + prev.x) / 2, ground + 0.92, (oz + prev.z) / 2, 0, Math.atan2(s.x - prev.x, s.z - prev.z), 0);
    }
    if (i % 4 === 0) {
      // service kerb on the uphill side
      const kx = s.x - s.nx * side * (width * 0.5 + 0.5);
      const kz = s.z - s.nz * side * (width * 0.5 + 0.5);
      b.box(0.45, 0.28, 4.0, mats.concrete, kx, field.heightAt(kx, kz) + 0.12, kz, 0, Math.atan2(s.nx, s.nz), 0);
    }
  }
  for (let d = 55; d < distance - 20; d += 72) {
    let i = 1;
    while (i < samples.length && samples[i].d < d) i += 1;
    const s = samples[Math.min(i, samples.length - 1)];
    const x = s.x + s.nx * (width * 0.5 + 2.5);
    const z = s.z + s.nz * (width * 0.5 + 2.5);
    const y = field.heightAt(x, z);
    b.cylinder(0.10, 0.14, 6.2, 7, mats.metal, x, y + 3.1, z);
    b.box(1.6, 0.1, 0.1, mats.metal, x - 0.65, y + 6.2, z, 0, Math.atan2(s.nx, s.nz) + Math.PI / 2, 0);
    b.box(0.52, 0.14, 0.28, mats.light, x - 1.25, y + 6.12, z);
  }

  // Gate/checkpoint at the wall gap.
  const gateZ = 348;
  for (const x of [ROAD_GAP_X - 15, ROAD_GAP_X + 15]) {
    b.box(2.4, 5.2, 2.4, mats.concrete, x, field.heightAt(x, gateZ) + 2.6, gateZ);
    b.box(2.6, 0.8, 2.6, mats.hazard, x, field.heightAt(x, gateZ) + 4.7, gateZ);
    colliders.push({ id: `road-gate-${x}`, minX: x - 1.2, maxX: x + 1.2, minY: field.heightAt(x, gateZ), maxY: field.heightAt(x, gateZ) + 5.2, minZ: gateZ - 1.2, maxZ: gateZ + 1.2 });
  }
  b.box(32, 0.6, 0.6, mats.metal, ROAD_GAP_X, field.heightAt(ROAD_GAP_X, gateZ) + 5.2, gateZ);
  b.box(8, 1.0, 0.2, mats.hazard, ROAD_GAP_X, field.heightAt(ROAD_GAP_X, gateZ) + 4.5, gateZ);
  void rand;
}

function addPadDetail(padY: number, b: DetailBuilder, mats: Record<string, THREE.Material>): void {
  const overlay = new THREE.MeshStandardMaterial({
    map: padOverlayTexture(),
    transparent: true,
    depthWrite: false,
    roughness: 0.95,
    metalness: 0.02,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    envMapIntensity: 0.2,
  });
  overlay.name = 'EnvPadOverlay';
  b.plane(160, 160, overlay, 0, padY + 0.014, 0, -Math.PI / 2, 0, 0);

  // TLOF edge lights and apron corner beacons.
  for (let i = 0; i < 24; i += 1) {
    const a = (i / 24) * Math.PI * 2;
    const x = Math.cos(a) * 28.5;
    const z = Math.sin(a) * 28.5;
    b.box(0.32, 0.1, 0.16, mats.cyan, x, padY + 0.09, z, 0, -a, 0);
  }
  for (const [x, z] of [[-78, -38], [78, -38], [-78, 38], [78, 38]]) {
    b.box(0.55, 0.16, 0.55, mats.warm, x, padY + 0.1, z);
  }
  // Tie-downs
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    b.cylinder(0.38, 0.42, 0.08, 10, mats.dark, Math.cos(a) * 16, padY + 0.045, Math.sin(a) * 16);
    b.box(1.0, 0.06, 0.18, mats.yellow, Math.cos(a) * 16, padY + 0.08, Math.sin(a) * 16, 0, -a, 0);
  }
  // Cones + a wheel chock near the ramp.
  for (const [x, z] of [[-9, 23], [9, 23], [-22, 12], [22, 12], [-31, -10], [31, -10], [14, -24], [-14, -24]]) {
    b.cylinder(0.03, 0.29, 0.72, 8, mats.yellow, x, padY + 0.36, z);
    b.cylinder(0.30, 0.30, 0.06, 8, mats.dark, x, padY + 0.03, z);
    b.cylinder(0.12, 0.18, 0.12, 8, mats.paint, x, padY + 0.22, z);
  }
  // Fuel cabinet + hose to the A-30 starboard service point.
  b.box(2.4, 1.5, 1.8, mats.metal, 24, padY + 0.75, 30);
  b.box(2.45, 0.2, 1.85, mats.yellow, 24, padY + 1.45, 30);
  b.box(1.8, 0.3, 0.2, mats.dark, 24, padY + 0.7, 29);
  const hose = new THREE.CatmullRomCurve3([
    new THREE.Vector3(24, padY + 0.7, 29),
    new THREE.Vector3(20, padY + 0.35, 22),
    new THREE.Vector3(13, padY + 0.35, 13),
    new THREE.Vector3(10, padY + 0.85, 8),
  ]);
  const hoseGeo = new THREE.TubeGeometry(hose, 28, 0.085, 6, false);
  b.add(hoseGeo, mats.rubber);

  // Windsock at the western pad edge, clear of the A-30 silhouette.
  b.cylinder(0.10, 0.16, 6.5, 7, mats.metal, -58, padY + 3.25, -6);
  b.box(2.2, 0.1, 0.1, mats.metal, -57, padY + 6.35, -6);
  b.cone(0.38, 1.9, 8, mats.yellow, -55.5, padY + 6.35, -6, 0, 0, Math.PI / 2);
  b.cylinder(0.39, 0.23, 0.35, 8, mats.paint, -54.6, padY + 6.35, -6, 0, 0, Math.PI / 2);

  // Approach light masts to the north.
  for (const [x, z, i] of [[-18, -72, 0], [0, -128, 1], [18, -184, 2]] as const) {
    b.cylinder(0.10, 0.16, 5.5, 7, mats.metal, x, padY + 2.75, z);
    b.box(0.7, 0.25, 0.4, i === 1 ? mats.warm : mats.cyan, x, padY + 5.55, z);
  }

  // Cargo is staged on the outer hardstand, keeping the A-30 pad clear.
  for (const [x, z, rot] of [[168, 82, 0], [168, 94, 0], [184, 88, Math.PI / 2]] as const) {
    b.box(12, 2.9, 3.0, mats.container, x, padY + 1.45, z, 0, rot, 0);
    for (let r = -5; r <= 5; r += 1) {
      b.box(0.16, 2.7, 0.1, mats.metal, x + r, padY + 1.45, z - 1.55, 0, rot, 0);
    }
  }
  b.box(2.0, 1.4, 1.8, mats.wood, 150, padY + 0.7, 78);
  b.box(1.5, 1.1, 1.5, mats.wood, 152.4, padY + 0.55, 79.4);
  b.box(1.2, 0.8, 1.1, mats.wood, 149.4, padY + 1.55, 78.2);

  // Small service tug, parked west of the pad.
  b.box(3.2, 0.8, 1.7, mats.yellow, -78, padY + 0.65, 34);
  b.box(1.7, 1.25, 1.55, mats.paint, -79.2, padY + 1.45, 34);
  b.box(0.8, 0.55, 0.5, mats.dark, -78.2, padY + 2.0, 34);
  for (const [x, z] of [[-79, 33.1], [-79, 34.9], [-77, 33.1], [-77, 34.9]]) {
    b.cylinder(0.32, 0.32, 0.22, 10, mats.dark, x, padY + 0.36, z, Math.PI / 2, 0, 0);
  }
  b.box(0.9, 0.45, 0.4, mats.metal, -77.7, padY + 0.95, 34);
}

function addContainerShop(padY: number, b: DetailBuilder, mats: Record<string, THREE.Material>, colliders: Collider[]): void {
  const x = -70;
  const z = 112;
  const frontZ = z + 1.55;
  const backZ = z - 1.55;
  // shell: back, sides, roof, floor, header/jambs leave a 9.4 m opening
  b.box(12.2, 3.1, 0.18, mats.container, x, padY + 1.55, backZ);
  b.box(0.18, 3.1, 3.0, mats.container, x - 6.0, padY + 1.55, z);
  b.box(0.18, 3.1, 3.0, mats.container, x + 6.0, padY + 1.55, z);
  b.box(12.2, 0.2, 3.2, mats.container, x, padY + 3.15, z);
  b.box(12.2, 0.16, 3.2, mats.dark, x, padY + 0.08, z);
  b.box(0.55, 3.1, 0.18, mats.container, x - 5.82, padY + 1.55, frontZ);
  b.box(0.55, 3.1, 0.18, mats.container, x + 5.82, padY + 1.55, frontZ);
  b.box(10.1, 0.7, 0.18, mats.container, x, padY + 2.75, frontZ);
  // corrugated ribs
  for (let r = -5.7; r <= 5.7; r += 0.55) {
    b.box(0.1, 2.9, 0.12, mats.metal, x + r, padY + 1.6, backZ + 0.15);
    b.box(0.1, 2.9, 0.12, mats.metal, x + r, padY + 1.6, frontZ - 0.15);
  }
  // corner castings, lock bars, door on the west side
  for (const cx of [x - 6.0, x + 6.0]) {
    for (const cz of [z - 1.5, z + 1.5]) {
      b.box(0.28, 0.3, 0.28, mats.dark, cx, padY + 3.1, cz);
      b.box(0.28, 0.3, 0.28, mats.dark, cx, padY + 0.2, cz);
    }
  }
  for (let i = 0; i < 4; i += 1) {
    b.cylinder(0.04, 0.04, 2.6, 6, mats.metal, x - 6.13, padY + 1.4, z - 1.3 + i * 0.85);
  }
  // lit interior back wall, shelves, counter, goods
  b.plane(11.4, 2.7, mats.interior, x, padY + 1.5, backZ + 0.11, 0, 0, 0);
  for (const yy of [0.65, 1.25, 1.85]) {
    b.box(10.6, 0.12, 0.45, mats.wood, x, padY + yy, backZ + 0.45);
  }
  const rand = rng(631);
  for (let i = 0; i < 22; i += 1) {
    const gx = -4.8 + (i % 8) * 1.35;
    const gy = 0.75 + Math.floor(i / 8) * 0.58;
    b.box(0.55 + rand() * 0.5, 0.34 + rand() * 0.28, 0.38, i % 3 === 0 ? mats.yellow : i % 3 === 1 ? mats.wood : mats.paint, x + gx, padY + gy, backZ + 0.72);
  }
  b.box(6.8, 1.1, 1.0, mats.wood, x, padY + 0.63, frontZ - 0.8);
  b.box(7.0, 0.12, 1.15, mats.metal, x, padY + 1.18, frontZ - 0.8);
  // awning / sign frame
  b.box(12.4, 0.16, 1.4, mats.metal, x, padY + 3.35, frontZ + 0.55);
  b.box(0.14, 3.2, 0.14, mats.metal, x - 6.1, padY + 1.65, frontZ + 1.2);
  b.box(0.14, 3.2, 0.14, mats.metal, x + 6.1, padY + 1.65, frontZ + 1.2);
  b.plane(11.8, 1.35, mats.signShop, x, padY + 3.15, frontZ + 1.24, 0, 0, 0);
  // four queue stanchions + belt
  for (let i = 0; i < 4; i += 1) {
    const sx = x - 4.8 + i * 3.2;
    b.cylinder(0.06, 0.06, 1.0, 6, mats.metal, sx, padY + 0.5, frontZ + 3.4);
    b.box(2.8, 0.05, 0.04, mats.fabric, sx + 1.6, padY + 0.82, frontZ + 3.4);
  }
  // vertical outfitter banners
  for (const bx of [x - 7.4, x + 7.4]) {
    b.cylinder(0.07, 0.09, 4.6, 6, mats.metal, bx, padY + 2.3, frontZ + 1.4);
    b.box(1.0, 2.4, 0.06, mats.yellow, bx + 0.55, padY + 3.35, frontZ + 1.4);
    b.box(0.7, 0.5, 0.08, mats.dark, bx + 0.7, padY + 2.9, frontZ + 1.45);
  }
  // crates / barrels outside
  b.box(1.7, 1.2, 1.4, mats.wood, x + 7.6, padY + 0.6, frontZ + 1.8);
  b.box(1.2, 0.95, 1.1, mats.wood, x + 8.1, padY + 1.72, frontZ + 1.8);
  b.cylinder(0.35, 0.38, 1.0, 10, mats.dark, x + 7.4, padY + 0.5, frontZ + 3.6);
  colliders.push({ id: 'container-shop', minX: x - 6.4, maxX: x + 6.4, minY: padY, maxY: padY + 3.4, minZ: z - 1.7, maxZ: z + 1.7 });
  colliders.push({ id: 'shop-counter', minX: x - 3.6, maxX: x + 3.6, minY: padY, maxY: padY + 1.25, minZ: frontZ - 1.4, maxZ: frontZ - 0.2 });
}

function addAmbientPeople(
  padY: number,
  b: DetailBuilder,
  mats: Record<string, THREE.Material>,
): void {
  const people: Array<[number, number, number, boolean, number]> = [
    [-126, 124, 0.25, true, 0],
    [-98, 132, -0.4, false, 1],
    [-118, 146, 1.7, true, 0],
    [-95, 152, -1.1, false, 1],
    [-64, 120, -0.2, false, 0],
    [-108, 150, 0.9, true, 1],
    [-84, 128, 2.1, false, 0],
    [-104, 116, 2.8, true, 1],
    [-156, 137, -0.7, false, 0],
    [-134, 151, 0.4, true, 1],
    [-78, 142, 1.2, false, 0],
    [-116, 164, 2.4, true, 1],
    [-72, 106, 0.9, true, 1],
    [0, 21, 1.6, false, 2],
  ];
  for (const [x, z, yaw, vest, variant] of people) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const at = (ox: number, oz: number): [number, number] => [x + c * ox + s * oz, z - s * ox + c * oz];
    const dark = variant === 0 ? mats.personDark : mats.personLight;
    // legs
    for (const ox of [-0.12, 0.12]) {
      const [px, pz] = at(ox, 0);
      b.box(0.17, 0.8, 0.2, dark, px, padY + 0.42, pz, 0, yaw, 0);
      const [bx, bz] = at(ox, 0.08);
      b.box(0.18, 0.12, 0.32, mats.dark, bx, padY + 0.06, bz, 0, yaw, 0);
    }
    // torso / jacket
    const [tx, tz] = at(0, 0);
    b.box(0.5, 0.62, 0.3, dark, tx, padY + 1.14, tz, 0, yaw, 0);
    if (vest) {
      b.box(0.48, 0.28, 0.32, mats.personVest, tx, padY + 1.22, tz, 0, yaw, 0);
      const [sx1, sz1] = at(0, 0.165);
      b.box(0.46, 0.05, 0.03, mats.paint, sx1, padY + 1.3, sz1, 0, yaw, 0);
    }
    // arms
    for (const ox of [-0.31, 0.31]) {
      const [ax, az] = at(ox, 0);
      b.box(0.14, 0.58, 0.18, dark, ax, padY + 1.1, az, 0, yaw, 0);
    }
    // neck + head + hard hat
    const [hx, hz] = at(0, 0);
    b.cylinder(0.07, 0.07, 0.1, 6, mats.personSkin, hx, padY + 1.53, hz);
    b.add(new THREE.SphereGeometry(0.14, 8, 6), mats.personSkin, hx, padY + 1.68, hz);
    if (variant !== 2) {
      b.add(new THREE.SphereGeometry(0.16, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55), variant === 0 ? mats.personVest : mats.personDark, hx, padY + 1.72, hz);
    }
    // a small bag on some variants
    if (variant === 1) {
      const [gx, gz] = at(0.26, 0.16);
      b.box(0.26, 0.34, 0.16, mats.dark, gx, padY + 0.95, gz, 0, yaw, 0);
    }
  }
}

function addTerminalForecourt(
  padY: number,
  b: DetailBuilder,
  mats: Record<string, THREE.Material>,
  colliders: Collider[],
): void {
  // Light concrete forecourt and the paver promenade that runs from the T2
  // doors to the taxi apron.
  b.box(168, 0.12, 76, mats.slab, -136, padY + 0.03, 132, 0, 0, 0);
  b.box(34, 0.08, 86, mats.paver, -108, padY + 0.085, 136, 0, 0, 0);
  b.box(1.1, 0.1, 86, mats.paint, -125.2, padY + 0.09, 136, 0, 0, 0);
  b.box(1.1, 0.1, 86, mats.paint, -90.8, padY + 0.09, 136, 0, 0, 0);
  // Drainage channel along the terminal.
  b.box(150, 0.06, 0.7, mats.dark, -136, padY + 0.085, 108.6, 0, 0, 0);
  for (let x = -206; x <= -66; x += 14) {
    b.box(0.9, 0.08, 0.5, mats.metal, x, padY + 0.11, 108.6);
  }

  // Warm interior light behind each of the three arrival doors, plus framing.
  for (const dx of [-21, 0, 21]) {
    const x = -145 + dx;
    b.plane(5.2, 4.7, mats.interior, x, padY + 2.45, 94.72, 0, 0, 0);
    b.box(5.9, 0.2, 0.24, mats.metal, x, padY + 4.92, 94.78);
    b.box(5.9, 0.16, 0.24, mats.metal, x, padY + 0.18, 94.78);
    b.box(0.16, 4.9, 0.24, mats.metal, x - 2.95, padY + 2.5, 94.78);
    b.box(0.16, 4.9, 0.24, mats.metal, x + 2.95, padY + 2.5, 94.78);
    b.box(2.4, 0.08, 0.08, mats.dark, x, padY + 1.5, 94.92);
    b.box(0.08, 0.8, 0.08, mats.dark, x + 1.4, padY + 1.9, 94.92);
  }
  // Recessed vertical facade panels between / around the doors.
  for (const x of [-193, -185, -175.5, -164.5, -154, -143, -132, -121.5, -110.5, -101]) {
    b.box(0.26, 7.6, 0.38, mats.metal, x, padY + 3.85, 94.55);
  }
  // Light cladding band + warm accent ties the black arrival box to the
  // red/white/blue terminal behind it.
  b.box(104, 1.1, 0.36, mats.paint, -145, padY + 6.95, 94.58);
  b.box(104, 0.16, 0.42, mats.fabric, -145, padY + 6.35, 94.6);
  b.box(104, 0.2, 0.4, mats.metal, -145, padY + 7.56, 94.55);
  b.box(104, 0.12, 0.4, mats.hazard, -145, padY + 7.78, 94.55);
  // Folding information panels either side of the doors.
  for (const x of [-182, -108]) {
    b.box(3.2, 1.7, 0.12, mats.glass, x, padY + 2.2, 95.2);
    b.box(3.5, 0.12, 0.2, mats.metal, x, padY + 3.1, 95.22);
  }

  // Canopy: a deep structural fascia with columns and warm downlights.
  b.box(54, 0.24, 9.4, mats.metal, -145, padY + 8.06, 99.4);
  b.box(54, 0.38, 0.55, mats.dark, -145, padY + 8.02, 103.9);
  b.box(54, 0.08, 0.16, mats.hazard, -145, padY + 8.12, 104.1);
  for (const x of [-169, -157, -145, -133, -121]) {
    b.box(0.36, 8.0, 0.36, mats.metal, x, padY + 4.0, 103.5);
    b.box(0.52, 0.18, 0.52, mats.dark, x, padY + 0.09, 103.5);
    colliders.push({ id: `canopy-column-${x}`, minX: x - 0.3, maxX: x + 0.3, minY: padY, maxY: padY + 8.2, minZ: 103.2, maxZ: 103.8 });
  }
  for (let x = -169; x <= -121; x += 6.8) {
    b.box(3.8, 0.06, 0.2, mats.warm, x, padY + 7.9, 101.6);
    b.box(3.8, 0.06, 0.2, mats.warm, x, padY + 7.9, 96.8);
  }
  b.plane(13.5, 2.4, mats.signT2, -145, padY + 9.22, 104.38, 0, 0, 0);
  b.box(14.2, 2.9, 0.16, mats.dark, -145, padY + 9.2, 104.28);
  b.plane(34, 9, mats.interiorSpill, -145, padY + 0.12, 99.5, -Math.PI / 2, 0, 0);
  b.box(14.2, 0.12, 0.5, mats.warm, -145, padY + 7.98, 104.02);

  // Benches along the promenade.
  const bench = (x: number, z: number, yaw: number): void => {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    b.box(3.6, 0.13, 0.6, mats.wood, x, padY + 0.55, z, 0, yaw, 0);
    b.box(3.6, 0.75, 0.12, mats.wood, x - s * 0.3, padY + 0.93, z - c * 0.3, -0.12, yaw, 0);
    for (const off of [-1.4, 1.4]) {
      b.box(0.12, 0.48, 0.5, mats.dark, x + c * off, padY + 0.27, z - s * off, 0, yaw, 0);
    }
    colliders.push({ id: `bench-${x}-${z}`, minX: x - 2.0, maxX: x + 2.0, minY: padY, maxY: padY + 1.0, minZ: z - 0.5, maxZ: z + 0.5 });
  };
  for (const z of [120, 138, 156]) {
    bench(-125.5, z, Math.PI / 2);
    bench(-90.5, z, -Math.PI / 2);
  }

  // Queue barriers approaching the doors.
  for (const [x0, x1, z] of [[-172, -151, 105.5], [-139, -118, 105.5], [-166, -124, 98.5]] as const) {
    const count = Math.round((x1 - x0) / 4.6);
    for (let i = 0; i <= count; i += 1) {
      const sx = x0 + i * 4.6;
      b.cylinder(0.07, 0.07, 1.08, 7, mats.metal, sx, padY + 0.54, z);
      b.cylinder(0.18, 0.2, 0.06, 8, mats.dark, sx, padY + 0.05, z);
      if (i < count) b.box(4.3, 0.06, 0.05, mats.fabric, sx + 2.25, padY + 0.84, z);
    }
  }
  // Baggage carts parked along the curb.
  for (const cx of [-117, -113]) {
    b.box(2.6, 0.22, 1.2, mats.metal, cx, padY + 0.55, 116);
    b.box(1.0, 0.8, 1.0, mats.wood, cx - 0.5, padY + 0.95, 116);
    b.box(0.9, 0.7, 0.9, mats.paint, cx + 0.6, padY + 0.9, 116);
    for (const [ox, oz] of [[-0.9, -0.5], [-0.9, 0.5], [0.9, -0.5], [0.9, 0.5]]) {
      b.cylinder(0.18, 0.18, 0.12, 8, mats.rubber, cx + ox, padY + 0.3, 116 + oz, Math.PI / 2, 0, 0);
    }
  }
  // Planters and information totems at the pad end of the walkway.
  for (const [px, pz] of [[-126, 172], [-90, 172], [-126, 103], [-90, 103]] as const) {
    b.box(2.4, 0.62, 1.1, mats.slab, px, padY + 0.31, pz);
    b.box(2.1, 0.08, 0.85, mats.scrub, px, padY + 0.66, pz);
    b.box(0.25, 0.45, 0.25, mats.scrub, px - 0.6, padY + 0.88, pz);
    b.box(0.25, 0.55, 0.25, mats.scrub, px + 0.65, padY + 0.9, pz);
    colliders.push({ id: `planter-${px}-${pz}`, minX: px - 1.3, maxX: px + 1.3, minY: padY, maxY: padY + 0.7, minZ: pz - 0.7, maxZ: pz + 0.7 });
  }
  // Bollard lights along the promenade edges.
  for (let z = 102; z <= 174; z += 8) {
    for (const x of [-127, -89]) {
      b.cylinder(0.1, 0.14, 1.0, 7, mats.metal, x, padY + 0.5, z);
      b.box(0.26, 0.16, 0.26, mats.warm, x, padY + 1.02, z);
    }
  }
  // A couple of benches under the canopy too.
  bench(-157, 112, 0);
  bench(-133, 112, Math.PI);
  // Foreground furniture at the pad end of the promenade.
  bench(-118, 158, Math.PI / 2);
  b.box(2.6, 0.22, 1.2, mats.metal, -116, padY + 0.55, 138);
  b.box(1.0, 0.8, 1.0, mats.wood, -116.5, padY + 0.95, 138);
  for (const [ox, oz] of [[-0.9, -0.5], [-0.9, 0.5], [0.9, -0.5], [0.9, 0.5]]) {
    b.cylinder(0.18, 0.18, 0.12, 8, mats.rubber, -116 + ox, padY + 0.3, 138 + oz, Math.PI / 2, 0, 0);
  }
  b.box(0.4, 2.6, 0.4, mats.metal, -88, padY + 1.3, 140);
  b.plane(1.7, 1.0, mats.signT2, -88, padY + 2.15, 140.22, 0, 0, 0);
  b.box(2.0, 1.25, 0.16, mats.dark, -88, padY + 2.15, 140.1);
  // Low planters frame the near end of the promenade.
  for (const [px, pz] of [[-122, 132], [-90, 132], [-112, 134]] as const) {
    b.box(2.2, 0.5, 1.0, mats.slab, px, padY + 0.27, pz);
    b.box(1.9, 0.07, 0.8, mats.scrub, px, padY + 0.56, pz);
    b.box(0.24, 0.4, 0.24, mats.scrub, px - 0.5, padY + 0.78, pz);
    b.box(0.24, 0.5, 0.24, mats.scrub, px + 0.55, padY + 0.82, pz);
  }
  bench(-100, 134, Math.PI / 2);

  // Bin outside the arrivals curb.
  b.cylinder(0.34, 0.38, 1.0, 9, mats.dark, -188, padY + 0.5, 111);
  b.box(2.4, 0.6, 1.1, mats.slab, -196, padY + 0.3, 111);
  colliders.push({ id: 'promenade-bin', minX: -197.4, maxX: -193.6, minY: padY, maxY: padY + 0.8, minZ: 110.3, maxZ: 111.7 });
}
function addCargoYard(
  field: TerrainField,
  padY: number,
  b: DetailBuilder,
  mats: Record<string, THREE.Material>,
  colliders: Collider[],
): void {
  const cx = -410;
  const cz = 300;
  const y = field.heightAt(cx, cz);
  b.box(150, 0.12, 96, mats.slab, cx, y + 0.06, cz);
  for (let i = 0; i < 4; i += 1) {
    const x = cx - 48 + (i % 2) * 26;
    const z = cz - 18 + Math.floor(i / 2) * 24;
    b.box(12.2, 2.9, 3.0, mats.container, x, y + 1.6, z, 0, i % 2 ? Math.PI / 2 : 0, 0);
    for (let r = -5; r <= 5; r += 1) b.box(0.1, 2.7, 0.12, mats.metal, x + r, y + 1.6, z - 1.55);
    colliders.push({ id: `yard-container-${i}`, minX: x - 6.2, maxX: x + 6.2, minY: y, maxY: y + 3.2, minZ: z - 1.7, maxZ: z + 1.7 });
  }
  for (let i = 0; i < 8; i += 1) {
    b.box(1.4, 1.1, 1.3, mats.wood, cx + 34 + (i % 4) * 1.8, y + 0.6, cz + 20 + Math.floor(i / 4) * 2);
  }
  b.cylinder(0.10, 0.14, 7.2, 7, mats.metal, cx + 58, y + 3.6, cz + 30);
  b.box(0.8, 0.25, 0.4, mats.warm, cx + 58, y + 7.15, cz + 30);
  b.box(0.8, 0.25, 0.4, mats.warm, cx - 58, y + 7.15, cz + 30);
  b.cylinder(0.10, 0.14, 7.2, 7, mats.metal, cx - 58, y + 3.6, cz + 30);
}

function addBasinDepot(
  field: TerrainField,
  b: DetailBuilder,
  mats: Record<string, THREE.Material>,
): void {
  const cx = 430;
  const cz = 1240;
  const y = field.heightAt(cx, cz);
  b.box(130, 0.14, 94, mats.slab, cx, y + 0.08, cz);
  for (let i = 0; i < 4; i += 1) {
    const x = cx - 42 + (i % 2) * 28;
    const z = cz - 18 + Math.floor(i / 2) * 24;
    b.box(12.2, 2.9, 3.0, mats.container, x, y + 1.65, z, 0, i % 2 ? Math.PI / 2 : 0, 0);
    for (let r = -5; r <= 5; r += 1) b.box(0.1, 2.7, 0.12, mats.metal, x + r, y + 1.65, z - 1.55);
  }
  for (const tx of [cx + 38, cx + 48]) {
    b.cylinder(4.0, 4.3, 14, 16, mats.paint, tx, y + 7.2, cz + 8);
    b.cylinder(4.1, 4.1, 1.2, 16, mats.metal, tx, y + 14.8, cz + 8);
  }
  b.cylinder(0.10, 0.14, 7.2, 7, mats.metal, cx + 55, y + 3.6, cz + 30);
  b.box(0.8, 0.25, 0.4, mats.warm, cx + 55, y + 7.15, cz + 30);
  b.box(12, 3.2, 8, mats.container, cx - 52, y + 1.7, cz + 24);
  // A few approach beacons toward the pad.
  for (const [x, z] of [[160, 760], [120, 930], [280, 1080]] as const) {
    const yy = field.heightAt(x, z);
    b.cylinder(0.09, 0.13, 4.5, 6, mats.metal, x, yy + 2.25, z);
    b.box(0.5, 0.2, 0.3, mats.cyan, x, yy + 4.55, z);
  }
  void cz;
}

function decodeQuantized(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const name of Object.keys(geo.attributes)) {
    const attr = geo.getAttribute(name);
    if (!attr || !attr.normalized || attr.array instanceof Float32Array) continue;
    let scale = 1;
    if (attr.array instanceof Int8Array) scale = 1 / 127;
    else if (attr.array instanceof Uint8Array) scale = 1 / 255;
    else if (attr.array instanceof Int16Array) scale = 1 / 32767;
    else if (attr.array instanceof Uint16Array) scale = 1 / 65535;
    const out = new Float32Array(attr.array.length);
    for (let i = 0; i < attr.array.length; i += 1) out[i] = (attr.array[i] as number) * scale;
    geo.setAttribute(name, new THREE.Float32BufferAttribute(out, attr.itemSize));
  }
  return geo;
}

function addRocks(
  field: TerrainField,
  port: PortWorld,
  b: DetailBuilder,
  mat: THREE.Material,
): void {
  const placements: Array<[number, number, number, number, number]> = [
    [845, -515, 0.34, 1.2, -0.1],
    [-838, 322, 0.30, 2.1, 0.2],
    [610, 795, 0.38, 0.6, -0.2],
    [-690, 902, 0.27, 3.1, 0.1],
    [1180, 760, 0.29, 2.7, -0.2],
  ];
  const sourceGeos: THREE.BufferGeometry[] = [];
  for (const root of port.rockSources) {
    root.updateWorldMatrix(true, true);
    root.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return;
      const mesh = o as THREE.Mesh;
      let g = decodeQuantized(mesh.geometry.clone()).applyMatrix4(mesh.matrixWorld);
      if (g.index) g = g.toNonIndexed();
      const clean = sanitizeNonFinite(g);
      if (!clean) return;
      g = clean;
      g.computeBoundingBox();
      const bb = g.boundingBox;
      if (!bb || !Number.isFinite(bb.min.y)) return;
      const c = bb.getCenter(new THREE.Vector3());
      g.translate(-c.x, -bb.min.y, -c.z);
      sourceGeos.push(g);
    });
  }
  let i = 0;
  for (const [x, z, s, ry, rz] of placements) {
    const geo = sourceGeos[i % Math.max(1, sourceGeos.length)];
    if (!geo) break;
    const y = field.heightAt(x, z);
    b.add(geo, mat, x, y - 5, z, 0.05, ry, rz, s);
    i += 1;
  }
  // Scattered low-poly boulders around the cut slope and basin. Using simple
  // icosahedra keeps the horizon broken without spending 20k tris per rock.
  const rand = rng(7331);
  const boulder = new THREE.IcosahedronGeometry(1, 1);
  for (let n = 0; n < 34; n += 1) {
    const a = rand() * Math.PI * 2;
    const r = 900 + rand() * 1500;
    const x = Math.cos(a) * r;
    const z = -420 + Math.sin(a) * r * 0.8;
    if (Math.abs(x) < 830 && z > -1260 && z < 430) continue;
    const y = field.heightAt(x, z);
    const scale = 2.5 + rand() * 7.5;
    b.add(boulder, mat, x, y - scale * 0.35, z, (rand() - 0.5) * 0.4, rand() * 6.28, (rand() - 0.5) * 0.4, scale);
  }
  boulder.dispose();
  for (const g of sourceGeos) g.dispose();
}

function addScrub(field: TerrainField, b: DetailBuilder, mat: THREE.Material): void {
  const rand = rng(4421);
  const plane = new THREE.PlaneGeometry(1.6, 1.2);
  const positions: Array<[number, number, number, number]> = [];
  for (let i = 0; i < 340; i += 1) {
    const a = rand() * Math.PI * 2;
    const r = 300 + rand() * 2500;
    const x = Math.cos(a) * r;
    const z = -420 + Math.sin(a) * r * 0.85;
    const d = Math.abs(x) < TERRACE_HX + 30 && z > -TERRACE_HZ + TERRACE_CZ - 30 && z < TERRACE_HZ + TERRACE_CZ + 30;
    if (d || (Math.abs(x) < 700 && z > -1100 && z < 300)) continue;
    const y = field.heightAt(x, z);
    if (y < 12) continue;
    positions.push([x, y, z, rand() * Math.PI]);
  }
  for (const [x, y, z, yaw] of positions) {
    b.add(plane, mat, x, y + 0.55, z, 0, yaw, 0);
    b.add(plane, mat, x, y + 0.55, z, 0, yaw + Math.PI / 2, 0);
  }
}

function addRoadDecals(
  field: TerrainField,
  meta: TerrainMeta,
  b: DetailBuilder,
  mat: THREE.Material,
): void {
  if (!meta.road) return;
  const pts = meta.road.points;
  for (const off of [-1.8, 1.8]) {
    for (let i = 0; i < pts.length - 1; i += 1) {
      const [x0, z0] = pts[i];
      const [x1, z1] = pts[i + 1];
      const dx = x1 - x0;
      const dz = z1 - z0;
      const len = Math.hypot(dx, dz);
      const nx = -dz / len;
      const nz = dx / len;
      const steps = Math.max(1, Math.ceil(len / 6));
      for (let s = 0; s < steps; s += 1) {
        const t = (s + 0.5) / steps;
        const x = x0 + dx * t + nx * off;
        const z = z0 + dz * t + nz * off;
        const y = field.heightAt(x, z);
        b.box(0.38, 0.015, Math.min(5.8, len / steps + 0.4), mat, x, y + 0.092, z, 0, Math.atan2(dx, dz), 0);
      }
    }
  }
}

export async function buildEnvironmentArt(
  scene: THREE.Scene,
  field: TerrainField,
  meta: TerrainMeta,
  port: PortWorld,
  padY: number,
): Promise<EnvironmentArt> {
  const root = new THREE.Group();
  root.name = 'IAC_EnvironmentArt';
  root.position.y = 0;
  scene.add(root);
  const colliders: Collider[] = [];

  const mats: Record<string, THREE.Material> = {
    slab: (() => { const m = concreteMaterial(); m.name = 'EnvConcreteSlab'; return m; })(),
    wall: cloneMat(port, 'V2_Retaining_Wall', { color: 0x8f897f, roughness: 0.92 }),
    asphalt: cloneMat(port, 'V2_Asphalt', { color: 0x7a7b78, roughness: 0.95 }),
    metal: cloneMat(port, 'KB46_KB3D_HEM_MetalA', { color: 0x6f7779, roughness: 0.48, metalness: 0.72 }),
    dark: new THREE.MeshStandardMaterial({
      name: 'EnvDarkSteel',
      map: steelTexture(),
      color: 0x9aa0a2,
      roughness: 0.56,
      metalness: 0.62,
      envMapIntensity: 0.5,
    }),
    paint: new THREE.MeshStandardMaterial({
      name: 'EnvPaintWhite',
      map: paintedMetalTexture('#b8b1a3', '#5d5a52', '#6d4a31', 2213),
      color: 0xc9c2b4,
      roughness: 0.84,
      metalness: 0.18,
      envMapIntensity: 0.35,
    }),
    yellow: new THREE.MeshStandardMaterial({
      name: 'EnvPaintYellow',
      map: paintedMetalTexture('#b08b3f', '#4d463b', '#69462b', 3371),
      color: 0xd0a85c,
      roughness: 0.8,
      metalness: 0.2,
      envMapIntensity: 0.35,
    }),
    hazard: cloneMat(port, 'V2_Hazard_Stripes', { color: 0xd0a75d, roughness: 0.8 }),
    warm: cloneMat(port, 'V2_Port_Light_Warm', { emissiveIntensity: 2.6, color: 0xffd49a }),
    cyan: cloneMat(port, 'V2_Port_Edge_Cyan', { emissiveIntensity: 2.4, color: 0x9fe6df }),
    glass: cloneMat(port, 'V2_Port_Glass', { color: 0x8ca9aa, roughness: 0.18, metalness: 0.7 }),
    wood: new THREE.MeshStandardMaterial({
      name: 'EnvTimber',
      map: timberTexture(),
      color: 0xa8967c,
      roughness: 0.9,
      metalness: 0.02,
      envMapIntensity: 0.25,
    }),
    fabric: cloneMat(port, 'V2_Fabric_Red', { color: 0xb26b54, roughness: 0.9 }),
    rubber: new THREE.MeshStandardMaterial({ name: 'EnvRubber', color: 0x1b1c1b, roughness: 0.95, metalness: 0.02 }),
    container: containerMaterial(),
    scrub: scrubMaterial(),
    paver: new THREE.MeshStandardMaterial({
      name: 'EnvPaver',
      map: paverTexture(),
      color: 0xc9c1b3,
      roughness: 0.92,
      metalness: 0.02,
      envMapIntensity: 0.28,
    }),
    personDark: new THREE.MeshStandardMaterial({ name: 'EnvPersonDark', color: 0x343a40, roughness: 0.92 }),
    personLight: new THREE.MeshStandardMaterial({ name: 'EnvPersonLight', color: 0x4a5560, roughness: 0.94 }),
    personSkin: new THREE.MeshStandardMaterial({ name: 'EnvPersonSkin', color: 0x9a7659, roughness: 0.86 }),
    personVest: new THREE.MeshStandardMaterial({ name: 'EnvPersonVest', color: 0xc9822f, roughness: 0.82 }),
    rock: new THREE.MeshStandardMaterial({
      name: 'EnvBasalt',
      map: basaltTexture(),
      color: 0x948a7c,
      roughness: 0.98,
      metalness: 0.02,
      flatShading: true,
      envMapIntensity: 0.18,
    }),
    interior: new THREE.MeshBasicMaterial({
      map: interiorGlowTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 1,
      side: THREE.DoubleSide,
    }),
    interiorSpill: new THREE.MeshBasicMaterial({
      map: interiorSpillTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
    signShop: (() => {
      const tex = signTexture('GUILD ROW OUTFITTER', '公会街补给 · TRADER 索恩·哈珀');
      return new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.1, roughness: 0.55, side: THREE.DoubleSide });
    })(),
    signT2: (() => {
      const tex = signTexture('T2 // ARRIVALS', 'ANVIL LANDING · 砧炉着陆场');
      return new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.85, roughness: 0.55, side: THREE.DoubleSide });
    })(),
    signGate: (() => {
      const tex = signTexture('SERVICE ROAD 04', 'ANVIL CARGO · 后勤通道');
      return new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.9, roughness: 0.55, side: THREE.DoubleSide });
    })(),
  };

  // The kitbash GLB uses untextured flat paint/timber materials for its cargo
  // and service props. They read as placeholder blocks at foot level; dress
  // the shared source materials once so every authored prop gains wear,
  // grime and timber/steel structure without extra draw calls.
  const sourceTextures = {
    white: paintedMetalTexture('#b7b1a4', '#5b5850', '#6d4a31', 913),
    yellow: paintedMetalTexture('#a98745', '#4b4439', '#65452c', 917),
    steel: steelTexture(),
    timber: timberTexture(),
    paver: paverTexture(),
    deck: apronConcreteTexture(),
  };
  const dress = (
    name: string,
    map: THREE.Texture,
    color: number,
    roughness: number,
    metalness = 0.08,
  ): void => {
    const mat = port.materials.get(name);
    if (!(mat instanceof THREE.MeshStandardMaterial)) return;
    mat.map = map;
    mat.color.set(color);
    mat.roughness = roughness;
    mat.metalness = metalness;
    mat.envMapIntensity = 0.4;
    mat.needsUpdate = true;
  };
  dress('V2_Paint_White', sourceTextures.white, 0xcfc7b9, 0.84, 0.12);
  dress('V2_Paint_Yellow', sourceTextures.yellow, 0xc49f58, 0.8, 0.16);
  dress('V2_Safety_Orange', sourceTextures.yellow, 0xd08b4f, 0.78, 0.14);
  dress('V2_Dark_Steel', sourceTextures.steel, 0x9aa0a2, 0.58, 0.58);
  dress('V2_Paint_Dark', sourceTextures.steel, 0x7f8586, 0.7, 0.32);
  dress('V2_Timber', sourceTextures.timber, 0xaa987c, 0.92, 0.02);
  // The deck is an engineered concrete apron, not a black asphalt sheet.
  dress('V2_Asphalt', sourceTextures.deck, 0xd8d0c1, 0.94, 0.02);
  // The deck top is authored from the concrete retaining-wall material; lift
  // it out of near-black at the low sun angle.
  const deckWall = port.materials.get('V2_Retaining_Wall');
  if (deckWall instanceof THREE.MeshStandardMaterial) {
    deckWall.color.set(0xd8d0c2);
    deckWall.roughness = 0.93;
    deckWall.metalness = 0.02;
    deckWall.envMapIntensity = 0.45;
    deckWall.needsUpdate = true;
  }

  // ---- all static detail merges by material in one pass ------------------
  const detail = new DetailBuilder('EnvDetails');
  addApron(detail, mats.slab, mats.wall, mats.hazard, padY);
  addApronWall(detail, mats, padY, meta.plateau.height_m, colliders);
  addGateRamp(detail, mats, padY, meta.plateau.height_m, colliders);
  addTerminalForecourt(padY, detail, mats, colliders);
  addAmbientPeople(padY, detail, mats);
  addContainerShop(padY, detail, mats, colliders);
  addCargoYard(field, padY, detail, mats, colliders);
  addDeckStructures(padY, detail, mats, colliders);
  addTerraceYard(field, detail, mats, colliders);
  addBasinDepot(field, detail, mats);
  addPadDetail(padY, detail, mats);
  addRoad(field, meta, padY, {
    asphalt: mats.asphalt,
    paint: mats.paint,
    metal: mats.metal,
    light: mats.warm,
    concrete: mats.wall,
    hazard: mats.hazard,
  }, detail, colliders);
  addRoadDecals(field, meta, detail, mats.dark);
  // T2 landside + east walkway signs (the south sign cabinet is part of the
  // same dark-metal merge).
  detail.plane(12.0, 2.2, mats.signT2, -145, padY + 12.55, 94.2, 0, 0, 0);
  detail.plane(8.0, 1.5, mats.signT2, -82, padY + 9.8, 12, 0, Math.PI / 2, 0);
  detail.plane(7.0, 1.7, mats.signGate, ROAD_GAP_X, field.heightAt(ROAD_GAP_X, 348) + 6.0, 348, 0, Math.PI, 0);
  detail.box(15.4, 4.2, 0.25, mats.dark, -145, padY + 11.3, 94.0);
  addRocks(field, port, detail, mats.rock);
  addScrub(field, detail, mats.scrub);
  const detailGroup = detail.build(true);
  root.add(detailGroup);

  // ---- dust points -------------------------------------------------------
  const dustTex = dustTexture();
  const dustCount = 900;
  const dustPos = new Float32Array(dustCount * 3);
  const rand = rng(9817);
  for (let i = 0; i < dustCount; i += 1) {
    dustPos[i * 3] = -300 + rand() * 900;
    dustPos[i * 3 + 1] = padY + 0.8 + rand() * 22;
    dustPos[i * 3 + 2] = -700 + rand() * 1700;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({
    map: dustTex,
    color: 0xd8b98e,
    size: 0.35,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.name = 'EnvDust';
  root.add(dust);

  // Casters for the one-draw shadow proxy: platform, shop/terminal, road
  // fixtures and rocks. Mid-ground props outside the shadow frustum are not
  // included; the sun shadow camera is local to the port.
  const casters = new THREE.Group();
  casters.name = 'IAC_ShadowCasters';

  return {
    root,
    casters,
    road: null,
    colliders,
    update: (elapsed: number) => {
      const pos = dustGeo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < dustCount; i += 1) {
        pos.setX(i, pos.getX(i) + Math.sin(elapsed * 0.08 + i) * 0.006);
        pos.setY(i, pos.getY(i) + Math.sin(elapsed * 0.21 + i * 1.7) * 0.003);
        pos.setZ(i, pos.getZ(i) + Math.cos(elapsed * 0.06 + i * 0.7) * 0.005);
      }
      pos.needsUpdate = true;
    },
  };
}
