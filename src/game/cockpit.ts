import * as THREE from 'three';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export type CockpitArchetype = 'light' | 'heavy' | 'capital';

export interface CockpitTelemetry {
  fov: number;
  aspect: number;
  speed: number;
  throttle: number;
  boost: number;
  boostMode: 'none' | 'shift' | 'warp';
  shiftMultiplier: number;
  hullRatio: number;
  shieldRatio: number;
  shieldDelay: number;
  parts: { engine: number; weapon: number; cockpit: number };
  warpPhase: 'idle' | 'align' | 'charge' | 'jump';
  warpChargeRatio: number;
  shipCode: string;
  shipClass: string;
  headingDeg: number;
  pitchDeg: number;
  rollDeg: number;
  altitude: number | null;
  altitudeLabel: string;
  bodyName: string;
  vs: number | null;
  targetName: string | null;
  targetDistance: number | null;
  targetBearing: number | null;
  enemyName: string | null;
  enemyDistance: number | null;
  enemyBearing: number | null;
  localVelocity: THREE.Vector3;
}

export function cockpitArchetype(shipClass: string): CockpitArchetype {
  if (shipClass === 'capital' || shipClass === 'flagship' || shipClass === 'dreadnought') return 'capital';
  if (shipClass === 'heavy' || shipClass === 'large') return 'heavy';
  return 'light';
}

/** 座舱单独 pass：在 readBuffer 上清深度后绘制，世界 near=0.5 不会裁掉近景内饰。 */
export class CockpitPass extends Pass {
  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly isVisible: () => boolean,
  ) {
    super();
    this.needsSwap = false;
  }

  render(renderer: THREE.WebGLRenderer, _writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    if (!this.isVisible()) return;
    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(readBuffer);
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = oldAutoClear;
  }
}

interface MfdScreen {
  role: 'flight' | 'systems' | 'nav';
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  material: THREE.MeshBasicMaterial;
  glitch: THREE.Mesh;
  glitchMaterial: THREE.MeshBasicMaterial;
  glitchLife: number;
}

interface WarningLamp {
  material: THREE.MeshBasicMaterial;
  base: THREE.Color;
  hot: THREE.Color;
  channel: 'hull' | 'shield' | 'warp';
}

interface CockpitVariant {
  root: THREE.Group;
  screens: MfdScreen[];
  lamps: WarningLamp[];
  cracks: THREE.Mesh[];
  glint: THREE.Mesh;
  backdrop: THREE.Mesh;
  triangles: number;
  parts: number;
}

interface Dims {
  scale: number;
  bridge: boolean;
}

const DIMS: Record<CockpitArchetype, Dims> = {
  light: { scale: 1, bridge: false },
  heavy: { scale: 1.14, bridge: false },
  capital: { scale: 1.42, bridge: true },
};

const DECAL_LABELS = [
  ['VX-9', '#d8b36c'],
  ['NIGHT FERRY', '#c9d9d4'],
  ['VERLINTAS SHIPYARD', '#d8b36c'],
  ['SER. 2291', '#9ff5e3'],
  ['MFD · FLIGHT', '#9ff5e3'],
  ['MFD · SYSTEMS', '#9ff5e3'],
  ['MFD · NAV', '#9ff5e3'],
  ['CAUTION', '#ffb45f'],
  ['NO STEP', '#ffb45f'],
  ['EJECT', '#ff5f45'],
  ['LIFE SUPPORT', '#9ff5e3'],
  ['G-LIMIT 12', '#9ff5e3'],
  ['PWR', '#ffb45f'],
  ['NAV', '#9ff5e3'],
  ['COMMS', '#9ff5e3'],
  ['ENG', '#ffb45f'],
  ['A-30 THUNDERBOLT', '#c9d9d4'],
  ['CHECKLIST', '#c9d9d4'],
  ['BOGIE', '#ffb45f'],
  ['THR', '#9ff5e3'],
  ['SHLD', '#9ff5e3'],
  ['HULL', '#ffb45f'],
  ['GRAV', '#9ff5e3'],
  ['O2', '#9ff5e3'],
  ['MASTER ARM', '#ffb45f'],
  ['ECM', '#9ff5e3'],
  ['LIGHTS', '#9ff5e3'],
  ['GEAR', '#9ff5e3'],
  ['FUEL', '#ffb45f'],
  ['AUX', '#d8b36c'],
  ['SYS', '#9ff5e3'],
  ['PANEL A', '#c9d9d4'],
  ['POWER', '#9ff5e3'],
  ['BRAKE', '#ffb45f'],
  ['TRIM', '#d8b36c'],
  ['RCS', '#9ff5e3'],
  ['DATA', '#9ff5e3'],
  ['ENGINE', '#ffb45f'],
  ['CANOPY', '#9ff5e3'],
] as const;

function makeDecalAtlas(): { texture: THREE.CanvasTexture; uv: Map<string, [number, number, number, number]> } {
  const cellW = 512;
  const cellH = 64;
  const cols = 2;
  const rows = Math.ceil(DECAL_LABELS.length / cols);
  const canvas = document.createElement('canvas');
  canvas.width = cellW * cols;
  canvas.height = cellH * rows;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const uv = new Map<string, [number, number, number, number]>();
  DECAL_LABELS.forEach(([label, color], index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = col * cellW;
    const y = row * cellH;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = color;
    ctx.font = '600 28px ui-monospace, "SF Mono", Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cellW / 2, cellH / 2 + 1, cellW - 22);
    // 下面一条极细的刻线，让标签像真的贴在金属上
    ctx.globalAlpha = 0.24;
    ctx.fillRect(24, cellH - 7, cellW - 48, 1);
    ctx.restore();
    uv.set(label, [
      x / canvas.width,
      1 - (y + cellH) / canvas.height,
      (x + cellW) / canvas.width,
      1 - y / canvas.height,
    ]);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return { texture, uv };
}

function makeGlowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.2, 'rgba(210,250,255,0.45)');
  g.addColorStop(0.55, 'rgba(120,220,255,0.12)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeSmudgeTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  // 指纹/雾面：极低对比，只在掠射角可见
  for (let i = 0; i < 18; i += 1) {
    const x = size * (0.25 + Math.random() * 0.5);
    const y = size * (0.25 + Math.random() * 0.5);
    const r = 26 + Math.random() * 42;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(225,248,255,${0.018 + Math.random() * 0.028})`);
    g.addColorStop(1, 'rgba(225,248,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.strokeStyle = 'rgba(210,248,255,0.14)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 7; i += 1) {
    const x = 90 + Math.random() * 330;
    const y = 80 + Math.random() * 350;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 20 + Math.random() * 40, y + 10, x + 40 + Math.random() * 70, y - 8 + Math.random() * 30);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeCrackTexture(seed: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  ctx.lineCap = 'round';
  let state = seed * 9301 + 49297;
  const rand = (): number => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
  const branch = (x: number, y: number, angle: number, len: number, depth: number): void => {
    if (depth <= 0 || len < 8) return;
    const ex = x + Math.cos(angle) * len;
    const ey = y + Math.sin(angle) * len;
    ctx.strokeStyle = `rgba(214,248,255,${0.18 + depth * 0.06})`;
    ctx.lineWidth = Math.max(0.8, depth * 0.8);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.24)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    branch(ex, ey, angle + (rand() - 0.5) * 0.8, len * (0.55 + rand() * 0.22), depth - 1);
    if (rand() > 0.45) branch(ex, ey, angle + (rand() - 0.5) * 1.4, len * (0.4 + rand() * 0.25), depth - 1);
  };
  branch(256, 260, -Math.PI / 2 + 0.3, 120, 5);
  branch(256, 260, -Math.PI / 2 - 0.4, 96, 4);
  branch(256, 260, Math.PI / 2 + 0.2, 80, 4);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

function panelLines(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(89,224,200,0.08)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= w; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  ratio: number,
  color: string,
): void {
  ctx.fillStyle = 'rgba(120,220,210,0.12)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * THREE.MathUtils.clamp(ratio, 0, 1), h);
  ctx.strokeStyle = 'rgba(180,245,235,0.2)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function drawMfd(
  screen: MfdScreen,
  t: CockpitTelemetry,
  boot: number,
): void {
  const { ctx, canvas } = screen;
  const w = canvas.width;
  const h = canvas.height;
  const pad = 22;
  ctx.clearRect(0, 0, w, h);
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#07191b');
  bg.addColorStop(0.55, '#041012');
  bg.addColorStop(1, '#02090a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  panelLines(ctx, w, h);

  const dim = 0.28 + boot * 0.72;
  const muted = 'rgba(159,245,227,0.66)';
  const bright = '#e6f7f1';
  const brass = 'rgba(216,179,108,0.95)';
  const ice = 'rgba(143,216,255,0.95)';
  const amber = 'rgba(255,180,95,0.95)';
  const red = 'rgba(255,95,69,0.96)';
  const formatAlt = (alt: number | null): string => {
    if (alt == null) return '—';
    if (alt >= 100_000_000) return 'ORBIT';
    if (alt >= 100_000) return `${Math.round(alt / 1000)} km`;
    return `${Math.round(alt)} m`;
  };

  ctx.save();
  ctx.globalAlpha = dim;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.font = `600 28px ${MONO}`;
  ctx.fillStyle = bright;
  ctx.shadowColor = 'rgba(89,224,200,0.45)';
  ctx.shadowBlur = 6;

  if (screen.role === 'flight') {
    ctx.fillText('FLIGHT / ATTITUDE', pad, 14);
    ctx.shadowBlur = 0;
    ctx.textAlign = 'right';
    ctx.fillStyle = muted;
    ctx.font = `500 20px ${MONO}`;
    ctx.fillText(`${t.shipCode} · NAV`, w - pad, 18);

    // Left data: SPD / ALT / V/S
    ctx.textAlign = 'left';
    ctx.font = `600 22px ${MONO}`;
    ctx.fillStyle = muted;
    ctx.fillText('SPD', pad, 64);
    ctx.font = `600 54px ${MONO}`;
    ctx.fillStyle = bright;
    ctx.fillText(t.speed > 9999 ? (t.speed / 1000).toFixed(1) : String(Math.round(t.speed)), pad, 84);
    ctx.font = `500 20px ${MONO}`;
    ctx.fillStyle = muted;
    ctx.fillText(t.speed > 9999 ? 'km/s' : 'm/s', pad, 136);
    ctx.font = `600 22px ${MONO}`;
    ctx.fillStyle = muted;
    ctx.fillText('ALT', pad, 168);
    ctx.font = `600 46px ${MONO}`;
    ctx.fillStyle = bright;
    ctx.fillText(formatAlt(t.altitude), pad, 188);
    ctx.font = `500 20px ${MONO}`;
    ctx.fillStyle = muted;
    ctx.fillText(`V/S ${t.vs == null ? '—' : `${t.vs >= 0 ? '+' : ''}${Math.round(t.vs)} m/s`}`, pad, 234);

    // Attitude ball
    const cx = w * 0.57;
    const cy = h * 0.52;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = 'rgba(159,245,227,0.24)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, Math.min(w, h) * 0.34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.rotate(-THREE.MathUtils.degToRad(t.rollDeg));
    const pitchPx = THREE.MathUtils.clamp(t.pitchDeg * 6.2, -h * 0.52, h * 0.52);
    ctx.translate(0, pitchPx);
    ctx.strokeStyle = 'rgba(159,245,227,0.88)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-150, 0);
    ctx.lineTo(-38, 0);
    ctx.moveTo(38, 0);
    ctx.lineTo(150, 0);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(159,245,227,0.42)';
    ctx.lineWidth = 1.2;
    for (const deg of [-30, -20, -10, 10, 20, 30]) {
      const y = -deg * 6.2;
      const len = deg % 20 === 0 ? 88 : 54;
      ctx.beginPath();
      ctx.moveTo(-len, y);
      ctx.lineTo(-30, y);
      ctx.moveTo(30, y);
      ctx.lineTo(len, y);
      ctx.stroke();
      if (deg % 20 === 0) {
        ctx.font = `500 19px ${MONO}`;
        ctx.fillStyle = 'rgba(159,245,227,0.62)';
        ctx.textAlign = 'right';
        ctx.fillText(String(deg), -len - 8, y - 8);
      }
    }
    ctx.restore();
    // boresight
    ctx.strokeStyle = 'rgba(230,247,241,0.95)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.moveTo(cx - 28, cy);
    ctx.lineTo(cx - 20, cy);
    ctx.moveTo(cx + 20, cy);
    ctx.lineTo(cx + 28, cy);
    ctx.moveTo(cx, cy - 28);
    ctx.lineTo(cx, cy - 20);
    ctx.moveTo(cx, cy + 20);
    ctx.lineTo(cx, cy + 28);
    ctx.stroke();

    // Bottom: throttle / warp / heading
    ctx.textAlign = 'left';
    ctx.font = `600 22px ${MONO}`;
    ctx.fillStyle = muted;
    ctx.fillText('THR', pad, h - 54);
    drawBar(ctx, 76, h - 50, 150, 8, t.throttle, 'rgba(159,245,227,0.9)');
    ctx.fillStyle = bright;
    ctx.font = `600 22px ${MONO}`;
    ctx.fillText(`${Math.round(t.throttle * 100)}%`, 238, h - 56);
    ctx.fillStyle = ice;
    ctx.font = `600 17px ${MONO}`;
    ctx.fillText(t.warpPhase === 'idle' ? 'WARP STANDBY' : `WARP ${t.warpPhase.toUpperCase()}`, pad, h - 30);
    drawBar(ctx, 182, h - 26, 130, 6, t.warpPhase === 'idle' ? 0 : Math.max(0.02, t.warpChargeRatio), 'rgba(143,216,255,0.92)');
    ctx.textAlign = 'right';
    ctx.font = `600 22px ${MONO}`;
    ctx.fillStyle = muted;
    ctx.fillText('HDG', w - pad, h - 54);
    ctx.font = `600 32px ${MONO}`;
    ctx.fillStyle = bright;
    ctx.fillText(`${String(Math.round(t.headingDeg) % 360).padStart(3, '0')}°`, w - pad, h - 36);
  } else if (screen.role === 'systems') {
    ctx.fillText('SYSTEMS / DAMAGE', pad, 14);
    ctx.shadowBlur = 0;
    ctx.textAlign = 'right';
    ctx.fillStyle = muted;
    ctx.font = `500 20px ${MONO}`;
    ctx.fillText(`${t.shipCode} · ${t.shipClass.toUpperCase()}`, w - pad, 18);

    // Ship schematic
    const cx = w * 0.29;
    const cy = h * 0.42;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = 'rgba(159,245,227,0.82)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(0, -70);
    ctx.lineTo(24, -34);
    ctx.lineTo(72, -5);
    ctx.lineTo(42, 14);
    ctx.lineTo(24, 52);
    ctx.lineTo(0, 38);
    ctx.lineTo(-24, 52);
    ctx.lineTo(-42, 14);
    ctx.lineTo(-72, -5);
    ctx.lineTo(-24, -34);
    ctx.closePath();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(159,245,227,0.26)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -70);
    ctx.lineTo(0, 38);
    ctx.moveTo(-42, 14);
    ctx.lineTo(42, 14);
    ctx.moveTo(-24, -34);
    ctx.lineTo(24, -34);
    ctx.stroke();
    // engines / damage highlights
    ctx.fillStyle = t.parts.engine < 0.5 ? red : 'rgba(255,180,95,0.82)';
    ctx.fillRect(-42, 28, 12, 18);
    ctx.fillRect(30, 28, 12, 18);
    ctx.fillStyle = t.parts.weapon < 0.5 ? red : 'rgba(159,245,227,0.6)';
    ctx.fillRect(-72, -7, 16, 5);
    ctx.fillRect(56, -7, 16, 5);
    ctx.fillStyle = t.parts.cockpit < 0.5 ? red : 'rgba(143,216,255,0.7)';
    ctx.fillRect(-5, -58, 10, 20);
    ctx.restore();

    const items: Array<[string, number, string]> = [
      ['HULL', t.hullRatio, t.hullRatio < 0.3 ? red : 'rgba(159,245,227,0.92)'],
      ['SHIELD', t.shieldRatio, t.shieldRatio <= 0 ? red : 'rgba(143,216,255,0.95)'],
      ['ENGINE', t.parts.engine, t.parts.engine < 0.5 ? amber : 'rgba(159,245,227,0.9)'],
      ['WEAPON', t.parts.weapon, t.parts.weapon < 0.5 ? amber : 'rgba(159,245,227,0.9)'],
      ['CANOPY', t.parts.cockpit, t.parts.cockpit < 0.5 ? amber : 'rgba(159,245,227,0.9)'],
    ];
    let y = 70;
    for (const [label, ratio, color] of items) {
      ctx.textAlign = 'left';
      ctx.font = `600 22px ${MONO}`;
      ctx.fillStyle = muted;
      ctx.fillText(label, w * 0.53, y);
      drawBar(ctx, w * 0.53, y + 22, w * 0.34, 8, ratio, color);
      ctx.textAlign = 'right';
      ctx.fillStyle = bright;
      ctx.font = `600 22px ${MONO}`;
      ctx.fillText(`${Math.round(ratio * 100)}%`, w - pad, y);
      y += 36;
    }
    const caution = t.hullRatio < 0.3 || t.shieldRatio <= 0.001 || t.parts.engine < 0.5 || t.parts.cockpit < 0.5;
    ctx.textAlign = 'left';
    ctx.font = `600 22px ${MONO}`;
    ctx.fillStyle = caution ? amber : 'rgba(159,245,227,0.82)';
    ctx.fillText(caution ? 'CAUTION · CHECK SYSTEMS' : 'SYSTEMS NOMINAL', pad, h - 34);
    ctx.textAlign = 'right';
    ctx.fillStyle = muted;
    ctx.font = `500 20px ${MONO}`;
    ctx.fillText(`ENG ${Math.round(t.parts.engine * 100)} · WPN ${Math.round(t.parts.weapon * 100)} · CPT ${Math.round(t.parts.cockpit * 100)}`, w - pad, h - 32);
  } else {
    ctx.fillText('NAV / CONTACTS', pad, 14);
    ctx.shadowBlur = 0;
    ctx.textAlign = 'right';
    ctx.fillStyle = muted;
    ctx.font = `500 20px ${MONO}`;
    ctx.fillText(`HDG ${String(Math.round(t.headingDeg) % 360).padStart(3, '0')}°`, w - pad, 18);

    // Radar plot
    const cx = w * 0.34;
    const cy = h * 0.48;
    const r = Math.min(w * 0.3, h * 0.34);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = 'rgba(159,245,227,0.28)';
    ctx.lineWidth = 1.2;
    for (const p of [0.34, 0.67, 1]) {
      ctx.beginPath();
      ctx.arc(0, 0, r * p, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.lineTo(r, 0);
    ctx.moveTo(0, -r);
    ctx.lineTo(0, r);
    ctx.stroke();
    ctx.fillStyle = 'rgba(159,245,227,0.05)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, -Math.PI / 2 - 0.42, -Math.PI / 2 + 0.42);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(159,245,227,0.18)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.sin(0.7) * r, -Math.cos(0.7) * r);
    ctx.stroke();

    const place = (bearing: number | null, distance: number | null, kind: 'target' | 'enemy'): void => {
      if (bearing == null || distance == null) return;
      const a = THREE.MathUtils.degToRad(bearing);
      const rad = Math.min(1, distance / 60000) * r;
      const x = Math.sin(a) * rad;
      const y = -Math.cos(a) * rad;
      ctx.fillStyle = kind === 'enemy' ? red : brass;
      ctx.strokeStyle = kind === 'enemy' ? red : brass;
      ctx.lineWidth = 1.5;
      if (kind === 'enemy') {
        ctx.beginPath();
        ctx.moveTo(x, y - 6);
        ctx.lineTo(x + 6, y + 5);
        ctx.lineTo(x - 6, y + 5);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(x, y - 6);
        ctx.lineTo(x + 6, y);
        ctx.lineTo(x, y + 6);
        ctx.lineTo(x - 6, y);
        ctx.closePath();
        ctx.stroke();
      }
    };
    place(t.targetBearing, t.targetDistance, 'target');
    place(t.enemyBearing, t.enemyDistance, 'enemy');
    ctx.fillStyle = bright;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(-5, 7);
    ctx.lineTo(0, 4);
    ctx.lineTo(5, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Contact list
    const lx = w * 0.68;
    ctx.textAlign = 'left';
    ctx.font = `600 19px ${MONO}`;
    ctx.fillStyle = muted;
    ctx.fillText('RANGE 60 KM', lx, 66);
    ctx.font = `600 22px ${MONO}`;
    ctx.fillStyle = brass;
    ctx.fillText('◆ PRIMARY', lx, 102);
    ctx.font = `600 28px ${MONO}`;
    ctx.fillStyle = bright;
    ctx.fillText(t.targetName ?? 'NO TARGET', lx, 124, w - lx - pad);
    ctx.font = `500 20px ${MONO}`;
    ctx.fillStyle = brass;
    ctx.fillText(t.targetDistance == null ? '—' : `${(t.targetDistance / 1000).toFixed(1)} km · BRG ${String(Math.round(((t.targetBearing ?? 0) + 360) % 360) % 360).padStart(3, '0')}°`, lx, 154);
    ctx.font = `600 22px ${MONO}`;
    ctx.fillStyle = red;
    ctx.fillText('▲ HOSTILE', lx, 198);
    ctx.font = `600 24px ${MONO}`;
    ctx.fillStyle = 'rgba(255,154,130,0.95)';
    ctx.fillText(t.enemyName ?? '—', lx, 218, w - lx - pad);
    ctx.font = `500 20px ${MONO}`;
    ctx.fillStyle = red;
    ctx.fillText(t.enemyDistance == null ? '—' : `${(t.enemyDistance / 1000).toFixed(1)} km · BRG ${String(Math.round(((t.enemyBearing ?? 0) + 360) % 360) % 360).padStart(3, '0')}°`, lx, 246);
    ctx.fillStyle = 'rgba(159,245,227,0.55)';
    ctx.font = `500 19px ${MONO}`;
    ctx.fillText('SENSOR ACTIVE · 2.5D', pad, h - 30);
  }

  // scanlines + edge vignette（不盖住文字，只做玻璃屏质感）
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
  const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.7);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.34)');
  ctx.globalAlpha = 1;
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
  screen.texture.needsUpdate = true;
}

export class CockpitInterior {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(78, 1, 0.02, 20);

  private readonly variants = new Map<CockpitArchetype, CockpitVariant>();
  private active: CockpitVariant | null = null;
  private readonly materials = new Set<THREE.Material>();
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly decalTexture: THREE.CanvasTexture;
  private readonly decalUv: Map<string, [number, number, number, number]>;
  private readonly decalMaterial: THREE.MeshBasicMaterial;
  private readonly smudgeTexture: THREE.CanvasTexture;
  private readonly glowTexture: THREE.CanvasTexture;
  private envTexture!: THREE.Texture;
  private readonly crackTextures: THREE.CanvasTexture[];
  private readonly tealGlow: THREE.MeshBasicMaterial;
  private readonly tealDim: THREE.MeshBasicMaterial;
  private readonly amberGlow: THREE.MeshBasicMaterial;
  private readonly redGlow: THREE.MeshBasicMaterial;

  private time = 0;
  private mfdAccum = 0;
  private boot = 0;
  private wasVisible = false;
  private readonly eyeSmoothed = new THREE.Vector3();
  private readonly eyeTarget = new THREE.Vector3();
  private readonly joltOffset = new THREE.Vector3();

  visible = false;

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.camera.position.set(0, 0, 0);
    this.camera.quaternion.identity();
    this.scene.background = null;
    this.scene.fog = null;
    this.scene.matrixWorldAutoUpdate = true;

    const decal = makeDecalAtlas();
    this.decalTexture = decal.texture;
    this.decalUv = decal.uv;
    this.decalMaterial = new THREE.MeshBasicMaterial({
      map: this.decalTexture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      opacity: 0.9,
      side: THREE.DoubleSide,
    });
    this.smudgeTexture = makeSmudgeTexture();
    this.glowTexture = makeGlowTexture();
    this.crackTextures = [makeCrackTexture(2), makeCrackTexture(7), makeCrackTexture(11)];

    this.materials.add(this.decalMaterial);
    this.tealGlow = new THREE.MeshBasicMaterial({ color: 0x59e0c8, toneMapped: false });
    this.tealDim = new THREE.MeshBasicMaterial({ color: 0x1c5a53 });
    this.amberGlow = new THREE.MeshBasicMaterial({ color: 0xffb45f, toneMapped: false });
    this.redGlow = new THREE.MeshBasicMaterial({ color: 0xff5f45, toneMapped: false });
    this.materials.add(this.tealGlow);
    this.materials.add(this.tealDim);
    this.materials.add(this.amberGlow);
    this.materials.add(this.redGlow);

    this.buildEnvironment();
    this.buildLights();
    this.setArchetype('light');
  }

  private buildEnvironment(): void {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    const target = pmrem.fromScene(room, 0.04);
    this.envTexture = target.texture;
    this.scene.environment = this.envTexture;
    this.scene.environmentIntensity = 0.78;
    room.dispose();
    pmrem.dispose();
  }

  private buildLights(): void {
    const hemi = new THREE.HemisphereLight(0xb8e6f2, 0x3a2418, 1.15);
    const key = new THREE.DirectionalLight(0xc8ecff, 2.8);
    key.position.set(-1.5, 2.0, -1.0);
    const warm = new THREE.DirectionalLight(0xffb46a, 0.95);
    warm.position.set(1.4, -0.4, -0.6);
    const rim = new THREE.DirectionalLight(0x74d8ff, 1.05);
    rim.position.set(0.4, 1.2, 1.6);
    const bounce = new THREE.DirectionalLight(0x9ff5e3, 0.35);
    bounce.position.set(0, -1.2, -0.4);
    const ambient = new THREE.AmbientLight(0x34495c, 0.24);
    this.scene.add(hemi, key, warm, rim, bounce, ambient);
  }

  setArchetype(archetype: CockpitArchetype): void {
    let variant = this.variants.get(archetype);
    if (!variant) {
      variant = this.buildVariant(archetype);
      this.variants.set(archetype, variant);
      this.scene.add(variant.root);
    }
    for (const [key, entry] of this.variants) entry.root.visible = key === archetype;
    this.active = variant;
    this.boot = 0;
  }

  setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    if (visible) {
      this.boot = 0;
      this.wasVisible = false;
    }
  }

  resize(aspect: number): void {
    if (Math.abs(this.camera.aspect - aspect) > 0.0001) {
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }
  }

  jolt(localDirection: THREE.Vector3, strength = 0.01): void {
    const dir = localDirection.clone().normalize();
    this.joltOffset.addScaledVector(dir, Math.min(0.028, Math.max(0.003, strength)));
  }

  update(dt: number, t: CockpitTelemetry): void {
    this.time += dt;
    if (!this.visible) return;
    this.boot = Math.min(1, this.boot + dt * 2.4);

    if (!this.wasVisible) this.wasVisible = true;

    // eye motion：只做平移，不改变射击方向
    const breath = new THREE.Vector3(
      Math.sin(this.time * 1.08) * 0.0018,
      Math.sin(this.time * 1.63 + 0.6) * 0.0024,
      Math.sin(this.time * 0.72) * 0.0012,
    );
    const local = t.localVelocity;
    const swayX = THREE.MathUtils.clamp(local.x / 900, -1, 1) * 0.009;
    const swayY = THREE.MathUtils.clamp(local.y / 900, -1, 1) * 0.007;
    const warpVib = t.warpPhase === 'jump' ? 0.0022 : t.warpPhase === 'charge' ? 0.0008 : 0;
    const vib = new THREE.Vector3(
      Math.sin(this.time * 53.0) * warpVib,
      Math.sin(this.time * 61.0 + 1.2) * warpVib,
      0,
    );
    this.eyeTarget.copy(breath).add(vib).addScaledVector(new THREE.Vector3(1, 0, 0), swayX).addScaledVector(new THREE.Vector3(0, 1, 0), swayY);
    this.eyeSmoothed.lerp(this.eyeTarget, 1 - Math.exp(-9 * dt));
    this.joltOffset.multiplyScalar(Math.exp(-6.5 * dt));
    this.camera.position.copy(this.eyeSmoothed).add(this.joltOffset);
    this.camera.quaternion.identity();
    if (Math.abs(this.camera.fov - t.fov) > 0.02) {
      this.camera.fov = t.fov;
      this.camera.updateProjectionMatrix();
    }
    this.resize(t.aspect);

    this.mfdAccum += dt;
    if (this.mfdAccum >= 0.125) {
      this.mfdAccum = 0;
      this.redrawScreens(t);
    }

    const variant = this.active;
    if (!variant) return;
    this.updateDamage(variant, t);
    // 反光随头部微动轻微漂移，避免像贴纸
    variant.glint.position.x = 0.34 + Math.sin(this.time * 0.23) * 0.012;
    variant.glint.position.y = 0.29 + Math.cos(this.time * 0.17) * 0.009;
    (variant.glint.material as THREE.MeshBasicMaterial).opacity = 0.11 + Math.sin(this.time * 0.31) * 0.012;
  }

  private redrawScreens(t: CockpitTelemetry): void {
    const variant = this.active;
    if (!variant) return;
    for (const screen of variant.screens) {
      drawMfd(screen, t, this.boot);
      screen.material.color.setScalar(0.55 + 0.45 * this.boot);
      if (screen.glitchLife > 0) {
        screen.glitchLife = Math.max(0, screen.glitchLife - 0.125);
        screen.glitchMaterial.opacity = screen.glitchLife > 0 ? 0.12 + Math.random() * 0.28 : 0;
      } else {
        screen.glitchMaterial.opacity = 0;
      }
    }
  }

  private updateDamage(variant: CockpitVariant, t: CockpitTelemetry): void {
    for (const screen of variant.screens) {
      if (screen.role === 'systems' && t.parts.weapon < 0.55 && Math.random() < 0.035) {
        screen.glitchLife = 0.32;
      }
      if (screen.role === 'flight' && t.parts.cockpit < 0.45 && Math.random() < 0.02) {
        screen.glitchLife = 0.22;
      }
    }
    for (const lamp of variant.lamps) {
      let value = 0.16;
      if (lamp.channel === 'hull') {
        value = t.hullRatio < 0.3 ? 0.55 + 0.45 * Math.abs(Math.sin(this.time * 4.2)) : t.hullRatio < 0.6 ? 0.32 : 0.14;
      } else if (lamp.channel === 'shield') {
        value = t.shieldRatio <= 0.001 ? 0.5 + 0.5 * Math.abs(Math.sin(this.time * 3.4 + 0.7)) : 0.16;
      } else {
        value = t.warpPhase === 'idle' ? 0.14 : 0.45 + 0.55 * Math.abs(Math.sin(this.time * 5.0));
      }
      lamp.material.color.copy(lamp.base).lerp(lamp.hot, value);
      lamp.material.opacity = 0.5 + value * 0.5;
    }
    const cockpitDamage = 1 - t.parts.cockpit;
    const visibleCracks = cockpitDamage > 0.42 ? Math.min(2, Math.floor((cockpitDamage - 0.42) * 5) + 1) : 0;
    variant.cracks.forEach((crack, index) => {
      const material = crack.material as THREE.MeshBasicMaterial;
      const on = index < visibleCracks;
      material.opacity = on ? THREE.MathUtils.clamp((cockpitDamage - 0.35) * 0.8, 0, 0.42) : 0;
      crack.visible = on;
    });
    // 座舱受损时，底部一条红色应急灯呼吸
    const critical = t.hullRatio < 0.3 || t.parts.cockpit < 0.4;
    this.redGlow.color.setHex(critical ? 0xff5f45 : 0x3a1410);
    this.redGlow.opacity = critical ? 0.55 + 0.45 * Math.abs(Math.sin(this.time * 2.8)) : 0.2;
  }

  private buildVariant(archetype: CockpitArchetype): CockpitVariant {
    const dims = DIMS[archetype];
    const root = new THREE.Group();
    root.name = `CKP_${archetype.toUpperCase()}`;
    const screens: MfdScreen[] = [];
    const lamps: WarningLamp[] = [];
    const cracks: THREE.Mesh[] = [];
    let partCount = 0;

    const titanium = new THREE.MeshStandardMaterial({ color: 0x4e5e68, metalness: 0.64, roughness: 0.44, envMapIntensity: 0.9 });
    const titaniumDark = new THREE.MeshStandardMaterial({ color: 0x313d45, metalness: 0.58, roughness: 0.5, envMapIntensity: 0.75 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x222a30, metalness: 0.5, roughness: 0.56, envMapIntensity: 0.6 });
    const black = new THREE.MeshStandardMaterial({ color: 0x090d10, metalness: 0.3, roughness: 0.72, envMapIntensity: 0.4 });
    const cream = new THREE.MeshStandardMaterial({ color: 0xa39d8d, metalness: 0.26, roughness: 0.56, envMapIntensity: 0.55 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xd0ab62, metalness: 0.82, roughness: 0.34, envMapIntensity: 1.1 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x0d1215, metalness: 0.1, roughness: 0.9, envMapIntensity: 0.3 });
    const leather = new THREE.MeshStandardMaterial({ color: 0x2a2220, metalness: 0.05, roughness: 0.66, envMapIntensity: 0.35 });
    const M = [titanium, titaniumDark, dark, black, cream, brass, rubber, leather];
    M.forEach((m) => this.materials.add(m));

    const addGeo = (geo: THREE.BufferGeometry): THREE.BufferGeometry => {
      this.geometries.add(geo);
      return geo;
    };
    const addMesh = (
      geo: THREE.BufferGeometry,
      material: THREE.Material,
      x: number,
      y: number,
      z: number,
      parent: THREE.Object3D = root,
      rx = 0,
      ry = 0,
      rz = 0,
    ): THREE.Mesh => {
      const mesh = new THREE.Mesh(addGeo(geo), material);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, ry, rz);
      mesh.frustumCulled = false;
      parent.add(mesh);
      partCount += 1;
      return mesh;
    };
    const box = (
      w: number,
      h: number,
      d: number,
      material: THREE.Material,
      x: number,
      y: number,
      z: number,
      parent: THREE.Object3D = root,
      radius = Math.min(w, h, d) * 0.14,
      segments = 2,
      rx = 0,
      ry = 0,
      rz = 0,
    ): THREE.Mesh =>
      addMesh(new RoundedBoxGeometry(w, h, d, segments, Math.max(0.0004, radius)), material, x, y, z, parent, rx, ry, rz);
    const cyl = (
      rt: number,
      rb: number,
      h: number,
      material: THREE.Material,
      x: number,
      y: number,
      z: number,
      parent: THREE.Object3D = root,
      rx = 0,
      parentRy = 0,
      rz = 0,
      segments = 10,
    ): THREE.Mesh =>
      addMesh(new THREE.CylinderGeometry(rt, rb, h, segments), material, x, y, z, parent, rx, parentRy, rz);
    const sphere = (
      r: number,
      material: THREE.Material,
      x: number,
      y: number,
      z: number,
      parent: THREE.Object3D = root,
      segments = 8,
    ): THREE.Mesh => addMesh(new THREE.SphereGeometry(r, segments, Math.max(6, segments / 2)), material, x, y, z, parent);
    const tube = (
      points: THREE.Vector3[],
      radius: number,
      material: THREE.Material,
      parent: THREE.Object3D = root,
      radial = 6,
      tubular?: number,
    ): THREE.Mesh => {
      const curve = new THREE.CatmullRomCurve3(points);
      const geometry = new THREE.TubeGeometry(curve, tubular ?? Math.max(12, points.length * 10), radius, radial, false);
      return addMesh(geometry, material, 0, 0, 0, parent);
    };
    const decal = (
      label: string,
      height: number,
      x: number,
      y: number,
      z: number,
      parent: THREE.Object3D = root,
      rx = 0,
      ry = 0,
      rz = 0,
      widthScale = 8,
    ): THREE.Mesh | null => {
      const uv = this.decalUv.get(label);
      if (!uv) return null;
      const geometry = new THREE.PlaneGeometry(height * widthScale, height);
      const uvAttr = geometry.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uvAttr.count; i += 1) {
        const u = uvAttr.getX(i);
        const v = uvAttr.getY(i);
        uvAttr.setXY(i, uv[0] + u * (uv[2] - uv[0]), uv[1] + v * (uv[3] - uv[1]));
      }
      uvAttr.needsUpdate = true;
      return addMesh(geometry, this.decalMaterial, x, y, z, parent, rx, ry, rz);
    };
    const knob = (
      x: number,
      y: number,
      z: number,
      size: number,
      parent: THREE.Object3D = root,
      material: THREE.Material = dark,
    ): THREE.Mesh => {
      const points = [
        new THREE.Vector2(0.001, 0),
        new THREE.Vector2(size * 0.72, 0),
        new THREE.Vector2(size * 0.92, size * 0.18),
        new THREE.Vector2(size * 0.84, size * 0.5),
        new THREE.Vector2(size * 0.68, size * 0.74),
        new THREE.Vector2(size * 0.36, size * 0.86),
        new THREE.Vector2(0.001, size * 0.86),
      ];
      const geometry = new THREE.LatheGeometry(points, 14);
      return addMesh(geometry, material, x, y, z, parent, Math.PI / 2, 0, 0);
    };
    const barBetween = (
      a: THREE.Vector3,
      b: THREE.Vector3,
      width: number,
      depth: number,
      material: THREE.Material,
      parent: THREE.Object3D = root,
    ): THREE.Mesh | null => {
      const delta = b.clone().sub(a);
      const length = delta.length();
      if (length < 1e-6) return null;
      const geometry = new RoundedBoxGeometry(width, depth, length, 2, Math.min(width, depth) * 0.18);
      const mesh = addMesh(geometry, material, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, parent);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), delta.normalize());
      return mesh;
    };
    const controlKnob = (
      x: number,
      y: number,
      z: number,
      size: number,
      parent: THREE.Object3D = root,
    ): void => {
      // 黄铜底座 + 深色滚花旋钮 + 奶油色指示线，替代一排黑球
      cyl(size * 0.78, size * 0.82, 0.005, brass, x, y, z - 0.003, parent, Math.PI / 2, 0, 0, 14);
      cyl(size * 0.64, size * 0.64, 0.009, dark, x, y, z + 0.006, parent, Math.PI / 2, 0, 0, 14);
      const points = [
        new THREE.Vector2(0.001, 0),
        new THREE.Vector2(size * 0.6, 0),
        new THREE.Vector2(size * 0.68, size * 0.22),
        new THREE.Vector2(size * 0.62, size * 0.48),
        new THREE.Vector2(size * 0.48, size * 0.72),
        new THREE.Vector2(size * 0.22, size * 0.84),
        new THREE.Vector2(0.001, size * 0.84),
      ];
      addMesh(new THREE.LatheGeometry(points, 14), rubber, x, y, z + 0.012, parent, Math.PI / 2, 0, 0);
      box(size * 0.07, size * 0.5, 0.0015, cream, x, y + size * 0.18, z + 0.012 + size * 0.82, parent, 0.0004, 1);
    };

    /* ── 地板 / 膝部 ───────────────────────────────────── */
    box(1.62, 0.025, 1.65, black, 0, -0.82, -0.25, root, 0.008, 2);
    box(0.42, 0.16, 0.12, dark, 0, -0.7, -0.78, root, 0.012);
    for (const side of [-1, 1]) {
      box(0.34, 0.26, 0.1, dark, side * 0.46, -0.67, -0.73, root, 0.014, 2, 0, side * 0.42, 0);
      for (let i = 0; i < 4; i += 1) {
        box(0.004, 0.2, 0.006, brass, side * (0.33 + i * 0.085), -0.66, -0.678, root, 0.001, 1);
      }
    }

    /* ── 主仪表台 ─────────────────────────────────────── */
    box(0.98, 0.15, 0.34, titanium, 0, -0.375, -0.82, root, 0.022, 3);
    box(0.9, 0.32, 0.3, titaniumDark, 0, -0.55, -0.79, root, 0.026, 3);
    box(1.03, 0.05, 0.42, titaniumDark, 0, -0.255, -0.80, root, 0.016, 3, -0.105);
    // 前缘遮光板：压住顶部反光，形成深色仪表檐；放低避免切掉 MFD 顶部
    box(1.005, 0.014, 0.15, black, 0, -0.248, -0.645, root, 0.004, 2, -0.1);
    box(1.01, 0.004, 0.018, cream, 0, -0.218, -0.575, root, 0.0015, 1, -0.1);
    // 左右翼面 + 中央 binnacle：打破一整块平板
    for (const side of [-1, 1]) {
      box(0.34, 0.032, 0.33, dark, side * 0.33, -0.239, -0.79, root, 0.014, 3, -0.11, side * 0.012, side * 0.025);
      box(0.3, 0.006, 0.29, black, side * 0.33, -0.219, -0.79, root, 0.004, 2, -0.11, side * 0.012, side * 0.025);
      box(0.02, 0.004, 0.30, titanium, side * 0.16, -0.216, -0.79, root, 0.0015, 1, -0.11);
      box(0.3, 0.006, 0.016, this.tealDim, side * 0.33, -0.214, -0.64, root, 0.002, 1);
      box(0.29, 0.006, 0.012, brass, side * 0.33, -0.216, -0.665, root, 0.002, 1);
      // 翼面控制簇：2×4 键 + 两个旋钮
      for (let row = 0; row < 2; row += 1) {
        for (let col = 0; col < 4; col += 1) {
          const bx = side * 0.2 + side * col * 0.065;
          const bz = -0.84 + row * 0.055;
          box(0.024, 0.008, 0.018, black, bx, -0.213, bz, root, 0.003, 2, -0.11);
          box(0.017, 0.005, 0.011, col === 1 && row === 0 ? this.amberGlow : titanium, bx, -0.208, bz, root, 0.002, 1, -0.11);
        }
      }
      cyl(0.012, 0.015, 0.014, dark, side * 0.44, -0.209, -0.72, root, 0, 0, 0, 12);
      cyl(0.005, 0.005, 0.018, brass, side * 0.44, -0.202, -0.72, root, 0, 0, 0, 8);
      for (let i = 0; i < 5; i += 1) {
        box(0.07, 0.003, 0.012, black, side * (0.2 + i * 0.07), -0.212, -0.695, root, 0.001, 1);
      }
    }
    box(0.4, 0.035, 0.22, dark, 0, -0.226, -0.7, root, 0.014, 3, -0.1);
    box(1.045, 0.018, 0.09, titaniumDark, 0, -0.213, -0.69, root, 0.008, 3);
    box(1.045, 0.005, 0.02, cream, 0, -0.205, -0.72, root, 0.002, 1);
    box(1.055, 0.012, 0.022, rubber, 0, -0.199, -0.637, root, 0.005, 2);
    box(0.96, 0.075, 0.025, dark, 0, -0.36, -0.665, root, 0.008, 2);
    // 仪表台铭牌/黄铜条
    box(0.2, 0.032, 0.006, brass, 0.36, -0.43, -0.647, root, 0.003, 2);
    decal('VERLINTAS SHIPYARD', 0.009, 0.36, -0.43, -0.6435, root, 0, 0, 0, 8.6);
    decal('VX-9', 0.014, -0.4, -0.415, -0.6465, root, 0, 0, 0, 4.2);
    decal('NIGHT FERRY', 0.008, -0.4, -0.397, -0.6465, root, 0, 0, 0, 7.8);
    // 缝隙/灯带
    box(0.84, 0.004, 0.006, this.tealDim, 0, -0.505, -0.652, root, 0.0015, 1);
    box(0.55, 0.004, 0.006, this.amberGlow, 0, -0.475, -0.653, root, 0.001, 1);
    // 下沿通风口
    for (const side of [-1, 1]) {
      for (let i = 0; i < 6; i += 1) {
        box(0.11, 0.0045, 0.007, black, side * 0.34, -0.45 + i * 0.008, -0.648, root, 0.001, 1);
      }
      box(0.13, 0.055, 0.012, brass, side * 0.34, -0.427, -0.645, root, 0.002, 2);
      box(0.105, 0.04, 0.014, black, side * 0.34, -0.427, -0.641, root, 0.001, 2);
    }

    // 中央 16 键面板 + 6 个旋钮 + brow guarded toggle
    for (let row = 0; row < 2; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        box(0.0115, 0.007, 0.006, black, -0.077 + col * 0.022, -0.4 - row * 0.014, -0.646, root, 0.0015, 1);
        box(
          0.008,
          0.004,
          0.004,
          (row === 0 && col === 3) || (row === 1 && col === 6) ? this.amberGlow : titaniumDark,
          -0.077 + col * 0.022,
          -0.398 - row * 0.014,
          -0.642,
          root,
          0.001,
          1,
        );
      }
    }
    for (let i = 0; i < 4; i += 1) {
      controlKnob(-0.27 + i * 0.055, -0.445, -0.641, 0.021, root);
      controlKnob(0.15 + i * 0.055, -0.445, -0.641, 0.021, root);
    }
    // 旋钮下方的小标签
    for (let i = 0; i < 4; i += 1) {
      decal(i % 2 === 0 ? 'PWR' : 'SYS', 0.0045, -0.27 + i * 0.055, -0.472, -0.647, root, 0, 0, 0, 4.6);
      decal(i % 2 === 0 ? 'AUX' : 'ECM', 0.0045, 0.15 + i * 0.055, -0.472, -0.647, root, 0, 0, 0, 4.6);
    }
    for (let i = 0; i < 7; i += 1) {
      const x = -0.32 + i * 0.107;
      box(0.024, 0.009, 0.018, black, x, -0.226, -0.724, root, 0.002, 1);
      box(0.006, 0.026, 0.007, i === 1 || i === 5 ? this.amberGlow : cream, x, -0.212, -0.716, root, 0.001, 1, 0.42, 0, 0);
      box(0.032, 0.003, 0.023, brass, x, -0.221, -0.724, root, 0.001, 1, 0.08, 0, 0);
    }
    // 面板接缝 / 磨损边 / 铆钉
    for (const y of [-0.335, -0.49, -0.535]) {
      box(0.93, 0.0025, 0.005, black, 0, y, -0.652, root, 0.001, 1);
    }
    for (const x of [-0.49, -0.16, 0.16, 0.49]) {
      box(0.0025, 0.2, 0.005, black, x, -0.43, -0.652, root, 0.001, 1);
    }
    for (const [x, y, w] of [
      [-0.36, -0.315, 0.11],
      [0.27, -0.318, 0.09],
      [-0.12, -0.525, 0.14],
      [0.38, -0.525, 0.08],
    ] as const) {
      box(w, 0.003, 0.006, cream, x, y, -0.648, root, 0.001, 1);
    }
    for (let i = 0; i < 10; i += 1) {
      sphere(0.0026, i % 3 === 0 ? brass : titaniumDark, -0.44 + i * 0.098, -0.518, -0.649, root, 6);
    }
    // 左右 rocker switch banks
    for (const side of [-1, 1]) {
      const bankX = side * 0.43;
      box(0.09, 0.13, 0.012, black, bankX, -0.43, -0.649, root, 0.004, 2);
      for (let row = 0; row < 3; row += 1) {
        for (let i = 0; i < 2; i += 1) {
          const x = bankX + (i - 0.5) * 0.032;
          const y = -0.39 - row * 0.038;
          box(0.018, 0.012, 0.008, titaniumDark, x, y, -0.641, root, 0.002, 1);
          box(0.012, 0.007, 0.006, row === 1 ? this.amberGlow : cream, x, y + 0.004, -0.636, root, 0.0015, 1, 0.25, 0, 0);
        }
      }
      decal(side < 0 ? 'MASTER ARM' : 'LIGHTS', 0.0042, bankX, -0.512, -0.643, root, 0, 0, 0, 8.2);
      decal(side < 0 ? 'ECM' : 'GEAR', 0.0042, bankX, -0.352, -0.643, root, 0, 0, 0, 5.4);
    }
    // 侧台 breaker rows（顶面）
    for (const side of [-1, 1]) {
      const bankX = side * 0.595;
      box(0.2, 0.008, 0.1, black, bankX, 0.122, -0.13, root, 0.003, 2, 0, -side * 0.05, 0);
      for (let row = 0; row < 2; row += 1) {
        for (let i = 0; i < 5; i += 1) {
          const x = bankX + (i - 2) * 0.034;
          const z = -0.16 + row * 0.045;
          box(0.018, 0.01, 0.016, dark, x, 0.128, z, root, 0.002, 1);
          box(0.005, 0.014, 0.006, i % 2 === 0 ? cream : this.amberGlow, x, 0.136, z + 0.002, root, 0.001, 1, 0.3, 0, 0);
        }
      }
      decal('PANEL A', 0.004, bankX, 0.12, -0.19, root, -Math.PI / 2, 0, 0, 7.2);
    }
    // 小 stencil：throttle / stick / checklist
    decal('CHECKLIST', 0.0042, -0.43, -0.55, -0.643, root, 0, 0, 0, 7.4);
    decal('RCS', 0.0042, 0.43, -0.55, -0.643, root, 0, 0, 0, 4.8);
    decal('TRIM', 0.0042, 0.43, -0.315, -0.643, root, 0, 0, 0, 4.8);
    decal('DATA', 0.0042, -0.43, -0.315, -0.643, root, 0, 0, 0, 4.8);
    // dash 上沿螺栓 / 标签
    for (let i = 0; i < 19; i += 1) {
      sphere(0.0036, i % 5 === 0 ? brass : titaniumDark, -0.45 + i * 0.05, -0.228, -0.685, root, 8);
    }
    decal('PWR', 0.0045, -0.3, -0.249, -0.74, root, -Math.PI / 2, 0, 0, 4.8);
    decal('NAV', 0.0045, -0.15, -0.249, -0.74, root, -Math.PI / 2, 0, 0, 4.8);
    decal('COMMS', 0.0045, 0.0, -0.249, -0.74, root, -Math.PI / 2, 0, 0, 5.2);
    decal('ENG', 0.0045, 0.15, -0.249, -0.74, root, -Math.PI / 2, 0, 0, 4.8);
    decal('THR', 0.0045, 0.3, -0.249, -0.74, root, -Math.PI / 2, 0, 0, 4.8);
    decal('CHECKLIST', 0.0042, -0.43, -0.255, -0.72, root, -Math.PI / 2, 0, 0, 7.4);
    box(0.09, 0.006, 0.062, cream, 0.42, -0.258, -0.755, root, 0.002, 1, 0.02, 0, 0.1);

    /* ── 中央 MFD ─────────────────────────────────────── */
    const centerMfd = new THREE.Group();
    // 稍微向 pilot 前移，避免被 dash 前缘/遮光檐挡住屏幕顶部
    centerMfd.position.set(0, -0.302, -0.625);
    centerMfd.rotation.x = -0.06;
    root.add(centerMfd);
    box(0.37, 0.21, 0.078, dark, 0, 0, 0, centerMfd, 0.018, 3);
    box(0.346, 0.185, 0.03, black, 0, 0, 0.039, centerMfd, 0.01, 2);
    box(0.385, 0.02, 0.12, titaniumDark, 0, 0.112, 0.01, centerMfd, 0.007, 2, 0.18);
    box(0.35, 0.01, 0.012, this.tealGlow, 0, 0.071, 0.048, centerMfd, 0.002, 1);
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        cyl(0.0045, 0.0045, 0.006, brass, sx * 0.162, sy * 0.086, 0.048, centerMfd, Math.PI / 2, 0, 0, 8);
      }
    }
    decal('MFD · FLIGHT', 0.009, 0, -0.108, 0.047, centerMfd, 0, 0, 0, 7.8);
    const centerScreenMaterial = new THREE.MeshBasicMaterial({ toneMapped: false });
    const centerScreen = addMesh(new THREE.PlaneGeometry(0.31, 0.15), centerScreenMaterial, 0, 0.002, 0.068, centerMfd);
    centerScreen.userData.dynamic = true;
    this.materials.add(centerScreenMaterial);
    screens.push(this.createMfd('flight', 768, 384, centerScreen, centerMfd));
    addMesh(new THREE.PlaneGeometry(0.31, 0.15), this.mfdGlassMaterial(), 0, 0.002, 0.073, centerMfd).userData.dynamic = true;

    /* ── 左右 MFD + 侧台 ─────────────────────────────── */
    for (const side of [-1, 1]) {
      const mfd = new THREE.Group();
      mfd.position.set(side * 0.347, -0.322, -0.60);
      mfd.rotation.set(-0.03, side * 0.34, side * 0.015);
      root.add(mfd);
      box(0.235, 0.17, 0.062, dark, 0, 0, 0, mfd, 0.014, 3);
      box(0.215, 0.15, 0.024, black, 0, 0, 0.032, mfd, 0.008, 2);
      box(0.245, 0.014, 0.09, titaniumDark, 0, 0.09, 0.008, mfd, 0.005, 2, 0.18);
      box(0.21, 0.008, 0.008, side < 0 ? this.tealGlow : this.amberGlow, 0, 0.061, 0.039, mfd, 0.0015, 1);
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          cyl(0.0035, 0.0035, 0.005, brass, sx * 0.1, sy * 0.068, 0.039, mfd, Math.PI / 2, 0, 0, 8);
        }
      }
      const screenMaterial = new THREE.MeshBasicMaterial({ toneMapped: false });
      const screen = addMesh(new THREE.PlaneGeometry(0.19, 0.115), screenMaterial, 0, 0.001, 0.052, mfd);
      screen.userData.dynamic = true;
      this.materials.add(screenMaterial);
      screens.push(this.createMfd(side < 0 ? 'systems' : 'nav', 512, 320, screen, mfd));
      addMesh(new THREE.PlaneGeometry(0.19, 0.115), this.mfdGlassMaterial(), 0, 0.001, 0.056, mfd).userData.dynamic = true;
      decal(side < 0 ? 'MFD · SYSTEMS' : 'MFD · NAV', 0.0062, 0, -0.092, 0.044, mfd, 0, 0, 0, 8);

      // 侧台
      const consoleGroup = new THREE.Group();
      consoleGroup.position.set(side * 0.595, -0.49, -0.56);
      consoleGroup.rotation.y = -side * 0.05;
      root.add(consoleGroup);
      box(0.26, 0.16, 0.46, dark, 0, 0, 0, consoleGroup, 0.02, 3);
      box(0.24, 0.035, 0.44, dark, 0, 0.095, 0, consoleGroup, 0.012, 3, 0, 0, side * 0.015);
      box(0.23, 0.004, 0.05, cream, 0, 0.114, -0.2, consoleGroup, 0.002, 1);
      box(0.2, 0.012, 0.36, black, 0, 0.116, 0.01, consoleGroup, 0.005, 2, 0, 0, side * 0.015);
      box(0.12, 0.038, 0.28, leather, 0, 0.132, 0.08, consoleGroup, 0.012, 3);
      box(0.125, 0.006, 0.285, dark, 0, 0.153, 0.08, consoleGroup, 0.003, 2);
      box(0.235, 0.006, 0.005, this.tealDim, 0, 0.079, 0.225, consoleGroup, 0.0015, 1);
      // 8 个按钮 + 2 个旋钮（装在顶面）
      for (let row = 0; row < 2; row += 1) {
        for (let i = 0; i < 4; i += 1) {
          const bx = -0.078 + i * 0.052;
          const by = 0.121 + row * -0.028;
          box(0.026, 0.009, 0.02, black, bx, by, 0.19, consoleGroup, 0.003, 2);
          box(0.018, 0.006, 0.012, i === 3 && row === 0 ? this.amberGlow : titaniumDark, bx, by + 0.006, 0.198, consoleGroup, 0.002, 1);
        }
      }
      cyl(0.011, 0.014, 0.014, dark, -0.075, 0.125, 0.205, consoleGroup, 0, 0, 0, 12);
      cyl(0.011, 0.014, 0.014, dark, 0.075, 0.125, 0.205, consoleGroup, 0, 0, 0, 12);
      cyl(0.005, 0.005, 0.018, brass, -0.075, 0.133, 0.205, consoleGroup, 0, 0, 0, 8);
      cyl(0.005, 0.005, 0.018, brass, 0.075, 0.133, 0.205, consoleGroup, 0, 0, 0, 8);
      // 油门：底座 + 黄铜 collar + 深色橡胶/皮革 grip + trigger + cable
      if (side < 0) {
        box(0.06, 0.014, 0.18, black, 0, 0.072, 0.02, consoleGroup, 0.005, 2);
        cyl(0.022, 0.028, 0.018, dark, 0, 0.085, 0.02, consoleGroup, 0, 0, 0, 16);
        cyl(0.024, 0.024, 0.004, brass, 0, 0.096, 0.02, consoleGroup, 0, 0, 0, 16);
        cyl(0.011, 0.013, 0.07, titaniumDark, 0, 0.132, 0.02, consoleGroup, 0, 0, 0, 12);
        box(0.038, 0.095, 0.05, rubber, 0, 0.178, 0.03, consoleGroup, 0.012, 3, -0.22, 0, -0.06);
        for (const gx of [-1, 1]) {
          box(0.006, 0.072, 0.038, leather, gx * 0.018, 0.178, 0.03, consoleGroup, 0.003, 2, -0.22, 0, -0.06);
        }
        box(0.042, 0.012, 0.052, titaniumDark, 0, 0.226, 0.016, consoleGroup, 0.005, 2, -0.22, 0, -0.06);
        box(0.012, 0.014, 0.006, this.amberGlow, 0.012, 0.222, 0.047, consoleGroup, 0.002, 1, -0.22, 0, -0.06);
        box(0.014, 0.022, 0.005, this.redGlow, 0.004, 0.196, 0.061, consoleGroup, 0.002, 1, -0.22, 0, -0.06);
        box(0.006, 0.05, 0.008, brass, -0.024, 0.155, 0.052, consoleGroup, 0.002, 1, -0.22, 0, -0.06);
        tube(
          [
            new THREE.Vector3(0, 0.085, -0.07),
            new THREE.Vector3(0.01, 0.078, -0.13),
            new THREE.Vector3(0.02, 0.072, -0.2),
          ],
          0.0035,
          rubber,
          consoleGroup,
          5,
        );
        decal('THR', 0.0048, -0.09, 0.105, 0.12, consoleGroup, -Math.PI / 2, 0, 0, 4.6);
        decal('FUEL', 0.0048, 0.08, 0.105, 0.12, consoleGroup, -Math.PI / 2, 0, 0, 5.2);
      }
      // 侧台后部线束
      tube(
        [
          new THREE.Vector3(side * 0.48, -0.5, -0.26),
          new THREE.Vector3(side * 0.52, -0.44, -0.4),
          new THREE.Vector3(side * 0.4, -0.43, -0.6),
          new THREE.Vector3(side * 0.34, -0.48, -0.72),
        ],
        0.008,
        rubber,
        root,
        5,
      );
      tube(
        [
          new THREE.Vector3(side * 0.5, -0.52, -0.24),
          new THREE.Vector3(side * 0.55, -0.47, -0.43),
          new THREE.Vector3(side * 0.38, -0.46, -0.62),
          new THREE.Vector3(side * 0.31, -0.5, -0.73),
        ],
        0.006,
        cream,
        root,
        5,
      );
      for (const p of [new THREE.Vector3(side * 0.425, -0.45, -0.56), new THREE.Vector3(side * 0.34, -0.49, -0.71)]) {
        cyl(0.012, 0.012, 0.014, brass, p.x, p.y, p.z, root, Math.PI / 2, 0, 0, 9);
      }
      // 线束扎带
      box(0.016, 0.009, 0.012, black, side * 0.43, -0.455, -0.58, root, 0.002, 1, 0, 0, side * 0.3);
    }

    /* ── 中央操纵杆 / 脚踏 ─────────────────────────────── */
    cyl(0.032, 0.04, 0.045, rubber, 0, -0.715, -0.58, root, 0, 0, 0, 16);
    cyl(0.022, 0.026, 0.014, brass, 0, -0.688, -0.58, root, 0, 0, 0, 16);
    cyl(0.009, 0.011, 0.11, titaniumDark, 0, -0.625, -0.585, root, 0, 0, 0, 12);
    box(0.044, 0.10, 0.056, rubber, 0, -0.545, -0.605, root, 0.014, 3, 0.15, 0, 0);
    for (const side of [-1, 1]) {
      box(0.006, 0.078, 0.04, leather, side * 0.02, -0.545, -0.605, root, 0.0025, 2, 0.15, 0, 0);
      box(0.004, 0.05, 0.006, brass, side * 0.014, -0.59, -0.577, root, 0.001, 1, 0.15, 0, 0);
    }
    box(0.046, 0.014, 0.056, titaniumDark, 0, -0.49, -0.615, root, 0.006, 2, 0.15, 0, 0);
    box(0.008, 0.012, 0.008, this.amberGlow, -0.012, -0.485, -0.59, root, 0.002, 1, 0.15, 0, 0);
    box(0.008, 0.012, 0.008, this.tealGlow, 0.012, -0.485, -0.59, root, 0.002, 1, 0.15, 0, 0);
    // trigger guard + trigger
    box(0.006, 0.032, 0.006, dark, -0.018, -0.556, -0.635, root, 0.0015, 1, 0.15, 0, 0);
    box(0.006, 0.032, 0.006, dark, 0.018, -0.556, -0.635, root, 0.0015, 1, 0.15, 0, 0);
    box(0.03, 0.006, 0.006, dark, 0, -0.538, -0.635, root, 0.0015, 1, 0.15, 0, 0);
    box(0.009, 0.02, 0.007, this.redGlow, 0, -0.55, -0.628, root, 0.002, 1, 0.15, 0, 0);
    tube(
      [
        new THREE.Vector3(0, -0.71, -0.62),
        new THREE.Vector3(0.02, -0.7, -0.68),
        new THREE.Vector3(0.05, -0.69, -0.75),
      ],
      0.0035,
      rubber,
      root,
      5,
    );
    for (const side of [-1, 1]) {
      box(0.075, 0.018, 0.14, dark, side * 0.18, -0.765, -0.56, root, 0.006, 2, 0.12, side * 0.06, 0);
      box(0.065, 0.006, 0.1, brass, side * 0.18, -0.75, -0.55, root, 0.002, 1, 0.12, side * 0.06, 0);
    }

    /* ── 座椅边缘 / 安全带 ─────────────────────────────── */
    for (const side of [-1, 1]) {
      box(0.17, 0.24, 0.46, leather, side * 0.51, -0.62, 0.18, root, 0.045, 3, 0, side * 0.08, 0);
      box(0.12, 0.05, 0.28, leather, side * 0.55, -0.49, 0.14, root, 0.018, 2);
      box(0.01, 0.32, 0.028, cream, side * 0.16, -0.43, 0.02, root, 0.003, 1, -0.22, 0, side * 0.1);
    }
    box(0.28, 0.1, 0.36, black, 0, -0.83, 0.18, root, 0.018, 2);
    box(0.06, 0.035, 0.03, brass, 0, -0.53, -0.2, root, 0.006, 2);
    box(0.04, 0.026, 0.018, black, 0, -0.54, -0.18, root, 0.004, 1);

    /* ── 顶部 overhead：贴 canopy header 的窄条，默认在视野外 ── */
    const overhead = new THREE.Group();
    overhead.position.set(0, 0.55, -0.58);
    overhead.rotation.x = 0.2;
    root.add(overhead);
    // 只有一条浅窄的 breaker rail，不再是一整块深色板
    box(0.36, 0.03, 0.10, titaniumDark, 0, 0, 0, overhead, 0.008, 2);
    box(0.34, 0.012, 0.085, black, 0, -0.018, 0, overhead, 0.004, 2);
    box(0.365, 0.006, 0.008, this.tealDim, 0, -0.034, 0.036, overhead, 0.0015, 1);
    for (let row = 0; row < 2; row += 1) {
      for (let i = 0; i < 5; i += 1) {
        const x = -0.12 + i * 0.06;
        const z = -0.018 + row * 0.046;
        box(0.016, 0.012, 0.016, black, x, -0.024, z, overhead, 0.002, 1);
        box(0.005, 0.016, 0.006, i % 2 === 0 ? this.amberGlow : cream, x, -0.012, z + 0.002, overhead, 0.001, 1, 0.3, 0, 0);
      }
    }
    // 小号 dome light 与深色 grab rail
    sphere(0.012, this.amberGlow, 0, -0.034, 0.052, overhead, 10);
    tube(
      [
        new THREE.Vector3(-0.15, -0.042, 0.044),
        new THREE.Vector3(-0.075, -0.058, 0.05),
        new THREE.Vector3(0.075, -0.058, 0.05),
        new THREE.Vector3(0.15, -0.042, 0.044),
      ],
      0.004,
      rubber,
      overhead,
      6,
    );
    for (const x of [-0.15, 0.15]) {
      cyl(0.007, 0.007, 0.012, brass, x, -0.038, 0.044, overhead, Math.PI / 2, 0, 0, 8);
    }
    for (const side of [-1, 1]) {
      box(0.018, 0.08, 0.06, titaniumDark, side * 0.185, 0.015, 0.01, overhead, 0.005, 2, 0, 0, side * 0.12);
    }

    /* ── 遮光罩 / 顶部框架 ─────────────────────────────── */
    // 不再放横跨视野的深色 header slab；顶部结构由 canopy bow 自己承担
    box(0.07, 0.018, 0.05, titanium, 0, 0.438, -1.14, root, 0.004, 2);
    box(0.024, 0.012, 0.04, black, 0, 0.43, -1.17, root, 0.003, 1);
    for (const x of [-0.045, 0.045]) {
      sphere(0.0032, brass, x, 0.445, -1.12, root, 7);
    }
    for (const side of [-1, 1]) {
      // 细 A 柱：硬表面金属框 + 嵌板 + 接缝 + 螺栓，避免橡胶管感
      box(0.021, 0.33, 0.045, titanium, side * 0.79, 0.055, -0.92, root, 0.007, 2, 0, 0, side * 0.12);
      box(0.015, 0.30, 0.03, titaniumDark, side * 0.785, 0.055, -0.895, root, 0.004, 2, 0, 0, side * 0.12);
      box(0.004, 0.27, 0.004, this.tealDim, side * 0.772, 0.055, -0.878, root, 0.001, 1, 0, 0, side * 0.12);
      for (const y of [-0.065, 0.055, 0.175]) {
        box(0.023, 0.006, 0.047, black, side * 0.79, y, -0.92, root, 0.0015, 1, 0, 0, side * 0.12);
        sphere(0.0032, y > 0 ? brass : titaniumDark, side * 0.772, y, -0.943, root, 7);
      }
      box(0.026, 0.016, 0.06, brass, side * 0.79, 0.228, -0.915, root, 0.004, 2);
      box(0.016, 0.14, 0.026, titaniumDark, side * 0.83, -0.1, -0.87, root, 0.005, 2, 0, 0, side * 0.18);
    }

    /* ── canopy bow / 侧轨 / 玻璃 ─────────────────────── */
    const bowPoints: THREE.Vector3[] = [];
    const bowGasketPoints: THREE.Vector3[] = [];
    const bowTrimPoints: THREE.Vector3[] = [];
    for (let i = 0; i <= 48; i += 1) {
      const a = -Math.PI / 2 + (Math.PI * i) / 48;
      const x = 0.93 * Math.sin(a);
      const y = -0.25 + 0.69 * Math.cos(a);
      const z = -1.14 + 0.035 * Math.cos(a * 1.3);
      bowPoints.push(new THREE.Vector3(x, y, z));
      bowGasketPoints.push(new THREE.Vector3(x, y + 0.006, z + 0.016));
      bowTrimPoints.push(new THREE.Vector3(x * 0.995, y - 0.02, z + 0.012));
    }
    // bow 主结构：分段 beveled 金属框，而不是一整根圆管
    for (let i = 0; i < 48; i += 2) {
      const a = bowPoints[i];
      const b = bowPoints[i + 2];
      barBetween(a, b, 0.042, 0.022, i % 4 === 0 ? titanium : titaniumDark, root);
      if (i % 8 === 0) {
        const dir = b.clone().sub(a).normalize().multiplyScalar(0.0018);
        const mid = a.clone().lerp(b, 0.5);
        barBetween(mid.clone().sub(dir), mid.clone().add(dir), 0.045, 0.025, black, root);
      }
      if (i % 4 === 0) {
        const p = a.clone().lerp(b, 0.5);
        sphere(0.0034, i % 8 === 0 ? brass : titaniumDark, p.x, p.y + 0.013, p.z + 0.005, root, 7);
      }
    }
    // 内圈 gasket lip 与细 trim，半径比主框小
    tube(bowGasketPoints, 0.011, rubber, root, 6, 64);
    tube(bowTrimPoints, 0.0025, titanium, root, 5, 56);
    for (let i = 0; i < 13; i += 1) {
      const p = bowPoints[Math.round((i / 12) * 48)];
      sphere(0.0034, i % 4 === 0 ? brass : titaniumDark, p.x, p.y + 0.022, p.z + 0.004, root, 7);
    }
    for (const side of [-1, 1]) {
      const rail = [
        new THREE.Vector3(side * 0.93, -0.245, -1.09),
        new THREE.Vector3(side * 0.9, -0.26, -0.82),
        new THREE.Vector3(side * 0.82, -0.285, -0.38),
        new THREE.Vector3(side * 0.68, -0.31, 0.1),
        new THREE.Vector3(side * 0.6, -0.33, 0.38),
      ];
      for (let i = 0; i < rail.length - 1; i += 1) {
        const a = rail[i];
        const b = rail[i + 1];
        barBetween(a, b, 0.03, 0.017, i % 2 === 0 ? titaniumDark : titanium, root);
        const p = a.clone().lerp(b, 0.5);
        sphere(0.0032, i % 2 === 0 ? brass : titaniumDark, p.x, p.y + 0.011, p.z + 0.005, root, 7);
      }
      tube(rail.map((p) => p.clone().add(new THREE.Vector3(0, 0.005, 0.006))), 0.007, rubber, root, 5, 28);
      tube(rail.map((p) => p.clone().add(new THREE.Vector3(0, 0.012, 0.009))), 0.002, titanium, root, 4, 28);
      // 斜撑：细硬表面杆
      const braceA = [
        new THREE.Vector3(side * 0.93, -0.22, -1.04),
        new THREE.Vector3(side * 0.84, -0.08, -0.92),
        new THREE.Vector3(side * 0.72, 0.12, -0.83),
      ];
      barBetween(braceA[0], braceA[1], 0.012, 0.008, titanium, root);
      barBetween(braceA[1], braceA[2], 0.012, 0.008, titaniumDark, root);
      const braceB = [
        new THREE.Vector3(side * 0.9, -0.255, -0.84),
        new THREE.Vector3(side * 0.84, -0.15, -0.55),
        new THREE.Vector3(side * 0.78, -0.05, -0.4),
      ];
      barBetween(braceB[0], braceB[1], 0.009, 0.006, dark, root);
      barBetween(braceB[1], braceB[2], 0.009, 0.006, dark, root);
      // 侧窗锁扣
      box(0.045, 0.022, 0.035, brass, side * 0.69, -0.29, 0.25, root, 0.006, 2);
    }

    // 玻璃：低透明度 + 边缘 fresnel，不用 transmission
    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x0a2028,
      metalness: 0,
      roughness: 0.03,
      transparent: true,
      opacity: 0.035,
      depthWrite: false,
      side: THREE.BackSide,
      envMapIntensity: 1.3,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
    });
    this.materials.add(glassMaterial);
    const glass = new THREE.Mesh(new THREE.SphereGeometry(1.38, 40, 24), glassMaterial);
    glass.position.set(0, 0.02, 0.04);
    glass.scale.set(1, 0.92, 1.04);
    glass.renderOrder = 20;
    glass.frustumCulled = false;
    glass.userData.dynamic = true;
    root.add(glass);
    partCount += 1;

    const fresnelMaterial = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: /* glsl */ `
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          vN = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vV = -mv.xyz;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.0);
          vec3 tint = mix(vec3(0.015, 0.045, 0.05), vec3(0.24, 0.54, 0.58), f);
          gl_FragColor = vec4(tint, 0.008 + f * 0.06);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
    });
    this.materials.add(fresnelMaterial);
    const fresnel = new THREE.Mesh(new THREE.SphereGeometry(1.375, 40, 24), fresnelMaterial);
    fresnel.position.copy(glass.position);
    fresnel.scale.copy(glass.scale);
    fresnel.renderOrder = 21;
    fresnel.frustumCulled = false;
    fresnel.userData.dynamic = true;
    root.add(fresnel);
    partCount += 1;

    // 玻璃内侧污渍/划痕
    const smudgeMaterial = new THREE.MeshBasicMaterial({
      map: this.smudgeTexture,
      transparent: true,
      opacity: 0.055,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    this.materials.add(smudgeMaterial);
    for (const [x, y, z, s] of [
      [0.42, 0.28, -1.03, 0.55],
      [-0.3, -0.12, -1.08, 0.42],
    ] as const) {
      const smudge = addMesh(new THREE.PlaneGeometry(s, s * 0.62), smudgeMaterial, x, y, z, root, 0, 0, 0.18);
      smudge.renderOrder = 19;
    }

    // 反光 glint
    const glintMaterial = new THREE.MeshBasicMaterial({
      map: this.glowTexture,
      color: 0x9fe8ff,
      transparent: true,
      opacity: 0.13,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    this.materials.add(glintMaterial);
    const glint = addMesh(new THREE.PlaneGeometry(0.62, 0.3), glintMaterial, 0.34, 0.29, -1.02, root, 0, 0, 0.24);
    glint.renderOrder = 22;
    glint.userData.dynamic = true;

    // 裂纹
    for (let i = 0; i < 2; i += 1) {
      const crackMaterial = new THREE.MeshBasicMaterial({
        map: this.crackTextures[i],
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide,
      });
      this.materials.add(crackMaterial);
      const crack = addMesh(new THREE.PlaneGeometry(0.72, 0.6), crackMaterial, i === 0 ? 0.34 : -0.32, i === 0 ? 0.1 : 0.26, -1.0, root, 0, 0, i === 0 ? 0.22 : -0.35);
      crack.renderOrder = 18;
      crack.visible = false;
      crack.userData.dynamic = true;
      cracks.push(crack);
    }

    /* ── 警告灯（动态） ───────────────────────────────── */
    const lampDefs: Array<[number, number, number, number, 'hull' | 'shield' | 'warp']> = [
      [-0.25, -0.232, -0.66, 0xff5f45, 'hull'],
      [0, -0.226, -0.66, 0xffb45f, 'shield'],
      [0.25, -0.232, -0.66, 0x8fd8ff, 'warp'],
    ];
    for (const [x, y, z, color, channel] of lampDefs) {
      const base = new THREE.Color(color).multiplyScalar(0.18);
      const hot = new THREE.Color(color);
      const material = new THREE.MeshBasicMaterial({ color: base.clone(), toneMapped: false, transparent: true, opacity: 0.5 });
      this.materials.add(material);
      const lamp = addMesh(new THREE.CylinderGeometry(0.008, 0.008, 0.007, 12), material, x, y, z, root, Math.PI / 2, 0, 0);
      lamp.userData.dynamic = true;
      lamps.push({ material, base, hot, channel });
    }
    // 警告铭牌
    decal('CAUTION', 0.0065, -0.38, -0.292, -0.643, root, 0, 0, 0, 7.4);
    decal('EJECT', 0.007, 0.33, -0.29, -0.643, root, 0, 0, 0, 5.4);
    decal('NO STEP', 0.006, 0.42, -0.345, -0.643, root, 0, 0, 0, 6);
    decal('SER. 2291', 0.006, -0.44, -0.35, -0.643, root, 0, 0, 0, 7);
    decal('A-30 THUNDERBOLT', 0.0055, -0.1, -0.323, -0.647, root, 0, 0, 0, 8);
    decal('HULL', 0.006, -0.2, -0.44, -0.643, root, 0, 0, 0, 4.8);
    decal('SHLD', 0.006, 0.04, -0.44, -0.643, root, 0, 0, 0, 4.8);
    decal('THR', 0.006, 0.28, -0.44, -0.643, root, 0, 0, 0, 4.2);

    /* ── 大型舰桥附加 ───────────────────────────────── */
    if (dims.bridge) {
      for (const side of [-1, 1]) {
        const flank = new THREE.Group();
        flank.position.set(side * 0.94, -0.42, -0.82);
        flank.rotation.y = -side * 0.28;
        root.add(flank);
        box(0.32, 0.24, 0.34, titaniumDark, 0, 0, 0, flank, 0.02, 3);
        box(0.27, 0.16, 0.02, black, 0, 0.02, 0.18, flank, 0.008, 2);
        addMesh(new THREE.PlaneGeometry(0.23, 0.13), black, 0, 0.02, 0.194, flank);
        box(0.3, 0.012, 0.012, this.amberGlow, 0, 0.105, 0.19, flank, 0.002, 1);
        // 舰桥栏杆
        tube(
          [
            new THREE.Vector3(side * 0.68, -0.36, -0.98),
            new THREE.Vector3(side * 0.92, -0.31, -0.98),
            new THREE.Vector3(side * 1.12, -0.34, -0.9),
            new THREE.Vector3(side * 1.27, -0.45, -0.78),
          ],
          0.012,
          brass,
          root,
          6,
        );
        for (let i = 0; i < 4; i += 1) {
          box(0.055, 0.012, 0.18, dark, side * (0.72 + i * 0.08), -0.62, -0.54 + i * 0.02, root, 0.004, 2, 0, side * 0.16, 0);
        }
      }
      // 舰桥额外顶部仪表：暗色基座 + 内嵌灯条，不做过亮的色块
      box(0.8, 0.082, 0.13, titaniumDark, 0, 0.35, -0.89, root, 0.01, 2);
      box(0.76, 0.06, 0.018, black, 0, 0.35, -0.823, root, 0.004, 2);
      for (let i = 0; i < 6; i += 1) {
        const x = -0.3 + i * 0.12;
        box(0.062, 0.036, 0.012, dark, x, 0.35, -0.812, root, 0.003, 2);
        box(0.046, 0.008, 0.008, i < 2 ? this.amberGlow : this.tealDim, x, 0.35, -0.805, root, 0.002, 1);
        for (const sx of [-1, 1]) {
          cyl(0.0035, 0.0035, 0.004, brass, x + sx * 0.028, 0.35, -0.805, root, Math.PI / 2, 0, 0, 6);
        }
      }
    }

    /* ── 合并静态几何 ─────────────────────────────────── */
    root.updateMatrixWorld(true);
    const before = countTriangles(root);
    this.mergeStatic(root);
    root.scale.setScalar(dims.scale);
    const triangles = Math.max(before, countTriangles(root));
    const stats = { archetype, triangles, parts: partCount, drawCalls: countMeshes(root) };
    (window as unknown as { __cockpitStats?: Record<string, unknown> }).__cockpitStats = {
      ...((window as unknown as { __cockpitStats?: Record<string, unknown> }).__cockpitStats ?? {}),
      [archetype]: stats,
    };

    return { root, screens, lamps, cracks, glint, backdrop: glass, triangles, parts: partCount };
  }

  private createMfd(
    role: 'flight' | 'systems' | 'nav',
    width: number,
    height: number,
    screenMesh: THREE.Mesh,
    parent: THREE.Object3D,
  ): MfdScreen {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = 4;
    const material = screenMesh.material as THREE.MeshBasicMaterial;
    material.map = texture;
    material.needsUpdate = true;
    const glitchMaterial = new THREE.MeshBasicMaterial({ color: 0x020607, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    this.materials.add(glitchMaterial);
    const glitch = new THREE.Mesh(screenMesh.geometry.clone(), glitchMaterial);
    glitch.position.copy(screenMesh.position);
    glitch.position.z += 0.003;
    glitch.rotation.copy(screenMesh.rotation);
    glitch.scale.copy(screenMesh.scale);
    glitch.frustumCulled = false;
    glitch.renderOrder = 8;
    glitch.visible = true;
    glitch.userData.dynamic = true;
    parent.add(glitch);
    return { role, canvas, ctx, texture, material, glitch, glitchMaterial, glitchLife: 0 };
  }

  private mfdGlassMaterial(): THREE.MeshPhysicalMaterial {
    const material = new THREE.MeshPhysicalMaterial({
      color: 0x9fe8ff,
      metalness: 0,
      roughness: 0.05,
      transparent: true,
      opacity: 0.055,
      depthWrite: false,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      side: THREE.DoubleSide,
    });
    this.materials.add(material);
    return material;
  }

  private mergeStatic(root: THREE.Group): void {
    const buckets = new Map<THREE.Material, { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }[]>();
    const toRemove: THREE.Mesh[] = [];
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (object.userData.dynamic) return;
      if (object instanceof THREE.InstancedMesh) return;
      const material = (Array.isArray(object.material) ? object.material[0] : object.material) as THREE.Material;
      if (!material) return;
      const list = buckets.get(material) ?? [];
      list.push({ geometry: object.geometry.clone(), matrix: object.matrixWorld.clone() });
      buckets.set(material, list);
      toRemove.push(object);
    });
    for (const mesh of toRemove) {
      mesh.parent?.remove(mesh);
    }
    for (const [material, list] of buckets) {
      const geos = list.map((entry) => {
        let geo = entry.geometry;
        if (geo.index) {
          const nonIndexed = geo.toNonIndexed();
          geo.dispose();
          geo = nonIndexed;
        }
        geo.applyMatrix4(entry.matrix);
        for (const name of Object.keys(geo.attributes)) {
          if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name);
        }
        return geo;
      });
      const merged = mergeGeometries(geos, false);
      geos.forEach((geo) => geo.dispose());
      if (!merged) {
        console.warn('[cockpit] static merge failed', material.type, geos.length);
        continue;
      }
      const mesh = new THREE.Mesh(merged, material);
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
      if (material.transparent) mesh.renderOrder = material === this.decalMaterial ? 4 : 3;
      root.add(mesh);
    }
  }

  dispose(): void {
    for (const variant of this.variants.values()) {
      for (const screen of variant.screens) {
        screen.texture.dispose();
        screen.glitchMaterial.dispose();
      }
      variant.root.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      this.scene.remove(variant.root);
    }
    this.variants.clear();
    for (const geometry of this.geometries) geometry.dispose();
    for (const texture of [this.decalTexture, this.smudgeTexture, this.glowTexture, ...this.crackTextures]) texture.dispose();
    this.envTexture.dispose();
    for (const material of this.materials) material.dispose();
    this.scene.clear();
  }
}


function countTriangles(root: THREE.Object3D): number {
  let total = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (object instanceof THREE.InstancedMesh) {
      const index = object.geometry.index;
      const count = index ? index.count : object.geometry.attributes.position.count;
      total += (count / 3) * object.count;
      return;
    }
    const index = object.geometry.index;
    const count = index ? index.count : object.geometry.attributes.position.count;
    total += count / 3;
  });
  return Math.round(total);
}

function countMeshes(root: THREE.Object3D): number {
  let total = 0;
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) total += 1;
  });
  return total;
}
