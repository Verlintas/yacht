import * as THREE from 'three';
import type { CelestialBody } from './world';
import type { Surface } from './data';

const SEGMENTS = 96;
const TEXTURE_SIZE = 256;

function hash2(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
}

function fbm2(x: number, y: number, seed: number): number {
  let value = 0;
  let amplitude = 0.5;
  for (let i = 0; i < 4; i += 1) {
    value += valueNoise(x, y, seed + i * 17.13) * amplitude;
    x *= 2.03;
    y *= 2.03;
    amplitude *= 0.5;
  }
  return value;
}

function heightAt(x: number, y: number, seed: number): number {
  const base = fbm2(x * 3.2 + seed * 0.11, y * 3.2 - seed * 0.07, seed);
  const ridge = 1 - Math.abs(fbm2(x * 7.0 + 4.7, y * 7.0 - 2.3, seed + 9.1) * 2 - 1);
  return (base * 0.68 + ridge * 0.32 - 0.5);
}

interface TerrainPalette {
  low: [number, number, number];
  mid: [number, number, number];
  high: [number, number, number];
  accent: [number, number, number];
}

const PALETTES: Record<Surface, TerrainPalette> = {
  ocean: { low: [0.035, 0.10, 0.075], mid: [0.15, 0.22, 0.11], high: [0.42, 0.38, 0.29], accent: [0.18, 0.30, 0.24] },
  verdigris: { low: [0.035, 0.11, 0.09], mid: [0.14, 0.25, 0.19], high: [0.40, 0.42, 0.34], accent: [0.12, 0.32, 0.28] },
  desert: { low: [0.30, 0.19, 0.10], mid: [0.56, 0.40, 0.22], high: [0.76, 0.65, 0.46], accent: [0.44, 0.22, 0.10] },
  ice: { low: [0.42, 0.58, 0.72], mid: [0.74, 0.86, 0.94], high: [0.96, 0.99, 1.0], accent: [0.28, 0.52, 0.68] },
  lava: { low: [0.035, 0.022, 0.018], mid: [0.14, 0.065, 0.038], high: [0.34, 0.13, 0.065], accent: [1.0, 0.28, 0.035] },
  gas: { low: [0.18, 0.15, 0.11], mid: [0.45, 0.36, 0.23], high: [0.72, 0.64, 0.49], accent: [0.36, 0.28, 0.18] },
  barren: { low: [0.12, 0.12, 0.13], mid: [0.28, 0.28, 0.28], high: [0.52, 0.51, 0.48], accent: [0.18, 0.17, 0.16] },
};

function mixColor(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export class SurfacePatch {
  readonly group = new THREE.Group();
  private readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshStandardMaterial;
  private readonly geometry: THREE.PlaneGeometry;
  private texture?: THREE.CanvasTexture;
  private planetId = '';
  private center = new THREE.Vector3();
  private size = 0;
  private seed = 0;

  constructor() {
    this.geometry = new THREE.PlaneGeometry(1, 1, SEGMENTS, SEGMENTS);
    this.material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.94,
      metalness: 0.02,
      side: THREE.FrontSide,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.receiveShadow = true;
    this.group.add(this.mesh);
    this.group.visible = false;
  }

  update(planet: CelestialBody, shipPosition: THREE.Vector3, shipLength: number, altitude: number): void {
    const def = planet.planet;
    if (!def) {
      this.group.visible = false;
      return;
    }

    const visibleDistance = Math.max(3000, shipLength * 8);
    if (altitude > visibleDistance) {
      this.group.visible = false;
      return;
    }

    const up = shipPosition.clone().sub(planet.position).normalize();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), up);
    if (right.lengthSq() < 1e-5) right.set(1, 0, 0);
    right.normalize();
    const forward = new THREE.Vector3().crossVectors(up, right).normalize();
    const basis = new THREE.Matrix4().makeBasis(right, forward, up);
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(basis);

    const size = Math.max(600, shipLength * 18);
    const center = planet.position.clone().addScaledVector(up, planet.radius + Math.max(20, size * 0.01));
    const cellX = Math.round(center.x / size);
    const cellZ = Math.round(center.z / size);
    const seed = def.seed * 101 + cellX * 31 + cellZ * 17;

    if (planet.id !== this.planetId || center.distanceTo(this.center) > size * 0.55 || size !== this.size || seed !== this.seed) {
      this.planetId = planet.id;
      this.center.copy(center);
      this.size = size;
      this.seed = seed;
      this.build(def.surface, size, seed);
    }

    this.group.position.copy(center);
    this.group.quaternion.copy(quaternion);
    this.group.visible = true;
  }

  private build(surface: Surface, size: number, seed: number): void {
    const position = this.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const y = position.getY(i);
      // 0..1 的非负高度，避免局部地形向下穿进行星球体
      position.setZ(i, (heightAt(x + 0.5, y + 0.5, seed) + 0.5) * 0.008);
    }
    position.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.mesh.scale.setScalar(size);

    this.texture?.dispose();
    this.texture = this.makeTexture(surface, seed);
    this.material.map = this.texture;
    this.material.needsUpdate = true;
  }

  private makeTexture(surface: Surface, seed: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = TEXTURE_SIZE;
    canvas.height = TEXTURE_SIZE;
    const ctx = canvas.getContext('2d')!;
    const image = ctx.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
    const palette = PALETTES[surface] ?? PALETTES.barren;

    for (let y = 0; y < TEXTURE_SIZE; y += 1) {
      for (let x = 0; x < TEXTURE_SIZE; x += 1) {
        const u = x / (TEXTURE_SIZE - 1);
        const v = y / (TEXTURE_SIZE - 1);
        const h = heightAt(u, v, seed) + 0.5;
        const grain = valueNoise(u * 90, v * 90, seed + 5.3) - 0.5;
        let color = mixColor(palette.low, palette.mid, THREE.MathUtils.smoothstep(h, 0.18, 0.62));
        color = mixColor(color, palette.high, THREE.MathUtils.smoothstep(h, 0.66, 0.92) * 0.82);
        if (surface === 'lava') {
          const crack = 1 - Math.min(1, Math.abs(valueNoise(u * 18, v * 18, seed + 2.1) - 0.5) * 26);
          color = mixColor(color, palette.accent, Math.max(0, crack) ** 2 * 0.9);
        } else {
          color = mixColor(color, palette.accent, Math.max(0, grain) * 0.16);
        }
        const shade = 1 + grain * 0.20;
        const offset = (y * TEXTURE_SIZE + x) * 4;
        image.data[offset] = Math.max(0, Math.min(255, color[0] * shade * 255));
        image.data[offset + 1] = Math.max(0, Math.min(255, color[1] * shade * 255));
        image.data[offset + 2] = Math.max(0, Math.min(255, color[2] * shade * 255));
        image.data[offset + 3] = 255;
      }
    }

    ctx.putImageData(image, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  }

  dispose(): void {
    this.texture?.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}
