import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  ParticleField,
  basisForDirection,
  getSmokeTexture,
  getSoftTexture,
} from './vfx-common';

/**
 * 鱼雷/导弹视觉系统。
 *
 * 性能约束：
 * - 所有鱼雷共用 4 份材质、2 份舰体几何；重型/轻型各一批 InstancedMesh。
 * - 单批：舰体 + 发光件 + 外层尾焰 + 内核尾焰 + 引擎辉光 = 5 个 draw call。
 * - 所有尾迹粒子共用 2 个 Points；所有尾迹丝带共用 1 个 Mesh。
 * - 不在每帧创建 Vector3/Color/Material。
 */

export type TorpedoGrade = 'heavy' | 'light';

interface GradeSpec {
  scale: number;
  exhaustZ: number;
  plumeWidth: number;
  plumeLength: number;
  glowSize: number;
  wobble: number;
  trailWidth: number;
  hullMaterial: THREE.MeshStandardMaterial;
  emissiveMaterial: THREE.MeshBasicMaterial;
  plumeOuterMaterial: THREE.ShaderMaterial;
  plumeCoreMaterial: THREE.ShaderMaterial;
  glowMaterial: THREE.ShaderMaterial;
}

interface TorpedoBatch {
  spec: GradeSpec;
  hull: THREE.InstancedMesh;
  emissive: THREE.InstancedMesh;
  plumeOuter: THREE.InstancedMesh;
  plumeCore: THREE.InstancedMesh;
  glow: THREE.InstancedMesh;
}

const MAX_INSTANCES = 260;
const TRAIL_SEGMENTS = 20;
const TRAIL_SLOTS = 260;
/** 几何体在归一化坐标下的长度（合并后中心化到 z=0） */
const BODY_HALF = 5.3;

let hullTexture: THREE.CanvasTexture | null = null;

function getHullTexture(): THREE.CanvasTexture {
  if (hullTexture) return hullTexture;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const base = ctx.createLinearGradient(0, 0, size, size);
  base.addColorStop(0, '#8b96a1');
  base.addColorStop(0.5, '#6d7781');
  base.addColorStop(1, '#4f5962');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // 面板分割线
  ctx.strokeStyle = 'rgba(28, 35, 41, 0.55)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i += 1) {
    const y = 12 + i * 42 + Math.random() * 8;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y + (Math.random() - 0.5) * 5);
    ctx.stroke();
  }
  for (let i = 0; i < 4; i += 1) {
    const x = 18 + i * 64 + Math.random() * 8;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + (Math.random() - 0.5) * 5, size);
    ctx.stroke();
  }

  // 铆钉/检修口
  ctx.fillStyle = 'rgba(30, 36, 42, 0.5)';
  for (let i = 0; i < 90; i += 1) {
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.2, 1.2);
  }
  ctx.fillStyle = 'rgba(215, 225, 235, 0.16)';
  for (let i = 0; i < 16; i += 1) {
    ctx.fillRect(Math.random() * size, Math.random() * size, 14 + Math.random() * 26, 1);
  }
  // 橙色警示条，让弹体在旋转时有可读的参照
  ctx.save();
  ctx.translate(size * 0.18, 0);
  ctx.rotate(0.35);
  ctx.fillStyle = 'rgba(226, 120, 46, 0.4)';
  ctx.fillRect(0, 0, 30, size * 1.4);
  ctx.restore();

  hullTexture = new THREE.CanvasTexture(canvas);
  hullTexture.colorSpace = THREE.SRGBColorSpace;
  hullTexture.wrapS = THREE.RepeatWrapping;
  hullTexture.wrapT = THREE.RepeatWrapping;
  hullTexture.anisotropy = 4;
  return hullTexture;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const normalized = parts.map((part) => {
    const geometry = part.index ? part.toNonIndexed() : part;
    for (const key of Object.keys(geometry.attributes)) {
      if (key !== 'position' && key !== 'normal' && key !== 'uv') geometry.deleteAttribute(key);
    }
    return geometry;
  });
  const merged = mergeGeometries(normalized, false);
  if (!merged) throw new Error('鱼雷几何合并失败');
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  for (const geometry of normalized) geometry.dispose();
  return merged;
}

function finGeometry(radial: number, length: number, thickness: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(radial * 0.62, length * 0.1);
  shape.lineTo(radial, length * 0.72);
  shape.lineTo(radial * 0.56, length);
  shape.lineTo(0, length * 0.92);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    steps: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -thickness * 0.5, 0);
  return geometry;
}

function buildHullGeometry(heavy: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const body = new THREE.CylinderGeometry(1.05, 1.18, 4.4, 20, 1, true);
  body.rotateX(Math.PI / 2);
  parts.push(body);

  const profile = [
    new THREE.Vector2(1.05, 0),
    new THREE.Vector2(1.09, 0.62),
    new THREE.Vector2(1.0, 1.5),
    new THREE.Vector2(0.78, 2.45),
    new THREE.Vector2(0.5, 3.3),
    new THREE.Vector2(0.2, 4.05),
    new THREE.Vector2(0.015, 4.25),
  ];
  const nose = new THREE.LatheGeometry(profile, 24);
  nose.rotateX(Math.PI / 2);
  nose.translate(0, 0, 2.2);
  parts.push(nose);

  const tail = new THREE.CylinderGeometry(1.18, 0.95, 1.3, 20, 1, true);
  tail.rotateX(Math.PI / 2);
  tail.translate(0, 0, -2.85);
  parts.push(tail);

  const bell = new THREE.CylinderGeometry(0.56, 0.88, 0.78, 18, 1, true);
  bell.rotateX(Math.PI / 2);
  bell.translate(0, 0, -3.86);
  parts.push(bell);

  for (const z of [1.45, -1.55]) {
    const collar = new THREE.TorusGeometry(1.2, 0.07, 5, 22);
    collar.translate(0, 0, z);
    parts.push(collar);
  }

  const finAngles = heavy
    ? [0, Math.PI / 2, Math.PI, -Math.PI / 2]
    : [Math.PI / 4, (Math.PI * 3) / 4, (Math.PI * 5) / 4, (Math.PI * 7) / 4];
  for (const angle of finAngles) {
    const fin = finGeometry(heavy ? 1.95 : 1.55, heavy ? 1.7 : 1.35, heavy ? 0.14 : 0.1);
    fin.translate(0, 0, -1.95);
    fin.rotateZ(angle);
    parts.push(fin);
  }

  // 前部小舵面
  for (const angle of [Math.PI / 4, (Math.PI * 3) / 4, (Math.PI * 5) / 4, (Math.PI * 7) / 4]) {
    const canard = finGeometry(heavy ? 1.58 : 1.28, heavy ? 0.92 : 0.72, 0.08);
    canard.translate(0, 0, 2.55);
    canard.rotateZ(angle);
    parts.push(canard);
  }

  for (const x of [-1.08, 1.08]) {
    const strake = new THREE.BoxGeometry(0.11, heavy ? 0.3 : 0.2, 3.7);
    strake.translate(x, 0, 0.15);
    parts.push(strake);
  }

  if (heavy) {
    for (const x of [-1.38, 1.38]) {
      const booster = new THREE.CylinderGeometry(0.3, 0.42, 2.4, 12, 1, true);
      booster.rotateX(Math.PI / 2);
      booster.translate(x, -0.12, -0.95);
      parts.push(booster);
      const boosterNose = new THREE.ConeGeometry(0.3, 0.72, 12);
      boosterNose.rotateX(Math.PI / 2);
      boosterNose.translate(x, -0.12, 0.6);
      parts.push(boosterNose);
    }
    const spine = new THREE.BoxGeometry(0.42, 0.22, 3.5);
    spine.translate(0, 1.15, 0.15);
    parts.push(spine);
    const spine2 = new THREE.BoxGeometry(0.22, 0.16, 2.2);
    spine2.translate(0, -1.1, 0.2);
    parts.push(spine2);
  }

  const merged = merge(parts);
  // 让弹体中心与物理位置重合：原始几何 z 范围约 -4.25 → +6.45
  merged.translate(0, 0, -1.1);
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

function buildEmissiveGeometry(heavy: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const engine = new THREE.CylinderGeometry(0.48, 0.48, 0.06, 18);
  engine.rotateX(Math.PI / 2);
  engine.translate(0, 0, -4.25);
  parts.push(engine);

  if (heavy) {
    for (const x of [-1.38, 1.38]) {
      const booster = new THREE.CylinderGeometry(0.26, 0.26, 0.05, 12);
      booster.rotateX(Math.PI / 2);
      booster.translate(x, -0.12, -2.15);
      parts.push(booster);
    }
  }

  const stripLength = heavy ? 3.2 : 2.4;
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const strip = new THREE.BoxGeometry(0.035, 0.08, stripLength);
    strip.translate(1.145, 0, 0.2);
    strip.rotateZ(angle);
    parts.push(strip);
  }
  const collar = new THREE.TorusGeometry(1.2, 0.025, 4, 24);
  collar.translate(0, 0, 1.45);
  parts.push(collar);

  const sensor = new THREE.SphereGeometry(0.085, 8, 6);
  sensor.translate(0, 0, 6.33);
  parts.push(sensor);

  const merged = merge(parts);
  // 与舰体保持同一个中心偏移
  merged.translate(0, 0, -1.1);
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

function plumeGeometry(): THREE.BufferGeometry {
  const cone = new THREE.ConeGeometry(0.72, 3.2, 14, 1, true);
  cone.rotateX(-Math.PI / 2);
  cone.translate(0, 0, -1.6);
  return cone;
}

function createPlumeMaterial(core: boolean, color: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: core ? 0.95 : 0.52 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float along = clamp(vUv.y, 0.0, 1.0);
        // 喷口处最亮，向后方指数衰减
        float alpha = pow(1.0 - along, 2.4) * uOpacity;
        if (alpha < 0.004) discard;
        vec3 color = uColor * (1.0 + (1.0 - along) * 0.7);
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function createGlowMaterial(color: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: getSoftTexture() },
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: 0.72 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 center = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec2 scale = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
        center.xy += position.xy * scale;
        gl_Position = projectionMatrix * center;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float alpha = texture2D(uMap, vUv).a * uOpacity;
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function createBatch(
  scene: THREE.Scene,
  grade: TorpedoGrade,
  hullGeometry: THREE.BufferGeometry,
  emissiveGeometry: THREE.BufferGeometry,
  plume: THREE.BufferGeometry,
): TorpedoBatch {
  const heavy = grade === 'heavy';
  const spec: GradeSpec = {
    scale: heavy ? 13.0 : 1.6,
    exhaustZ: -BODY_HALF,
    plumeWidth: heavy ? 1.05 : 0.95,
    plumeLength: heavy ? 4.2 : 4.6,
    glowSize: heavy ? 14 : 2.8,
    wobble: heavy ? 32 : 1.0,
    trailWidth: heavy ? 23 : 2.4,
    hullMaterial: new THREE.MeshStandardMaterial({
      map: getHullTexture(),
      color: heavy ? 0xc4d0dc : 0xa8b4c0,
      metalness: 0.66,
      roughness: 0.46,
      emissive: new THREE.Color(0x0a121a),
      emissiveIntensity: 0.7,
      envMapIntensity: 1.1,
    }),
    emissiveMaterial: new THREE.MeshBasicMaterial({
      color: heavy ? 0x9fd8ff : 0xffc07a,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    plumeOuterMaterial: createPlumeMaterial(false, heavy ? 0xff7a3a : 0xff9a50),
    plumeCoreMaterial: createPlumeMaterial(true, heavy ? 0xbfeaff : 0xfff0d0),
    glowMaterial: createGlowMaterial(heavy ? 0x9fd8ff : 0xffb066),
  };

  const hull = new THREE.InstancedMesh(hullGeometry, spec.hullMaterial, MAX_INSTANCES);
  hull.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  hull.frustumCulled = false;
  hull.castShadow = false;
  hull.receiveShadow = false;
  hull.count = 0;
  hull.visible = false;
  scene.add(hull);

  const emissive = new THREE.InstancedMesh(emissiveGeometry, spec.emissiveMaterial, MAX_INSTANCES);
  emissive.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  emissive.frustumCulled = false;
  emissive.count = 0;
  emissive.visible = false;
  scene.add(emissive);

  const plumeOuter = new THREE.InstancedMesh(plume, spec.plumeOuterMaterial, MAX_INSTANCES);
  plumeOuter.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  plumeOuter.frustumCulled = false;
  plumeOuter.count = 0;
  plumeOuter.visible = false;
  scene.add(plumeOuter);

  const plumeCore = new THREE.InstancedMesh(plume, spec.plumeCoreMaterial, MAX_INSTANCES);
  plumeCore.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  plumeCore.frustumCulled = false;
  plumeCore.count = 0;
  plumeCore.visible = false;
  scene.add(plumeCore);

  const glowGeo = new THREE.PlaneGeometry(1, 1);
  const glow = new THREE.InstancedMesh(glowGeo, spec.glowMaterial, MAX_INSTANCES);
  glow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  glow.frustumCulled = false;
  glow.count = 0;
  glow.visible = false;
  scene.add(glow);

  return { spec, hull, emissive, plumeOuter, plumeCore, glow };
}

interface RibbonSlot {
  active: boolean;
  freed: boolean;
  fading: number;
  head: number;
  count: number;
  points: Float32Array;
  color: THREE.Color;
  width: number;
}

/**
 * 所有鱼雷共用的尾迹丝带。一个 Mesh，一次 draw call。
 * 片元里做「窄亮核 + 宽柔光」两层，保证近距离不是一根生硬圆柱。
 */
class TrailRibbon {
  readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly slots: RibbonSlot[] = [];
  private readonly free: number[] = [];
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly alphas: Float32Array;
  private readonly uvs: Float32Array;
  private readonly indices: Uint16Array;
  private readonly verticesPerSlot = TRAIL_SEGMENTS * 2;
  private readonly cameraPosition = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private readonly view = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly lastSide = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(scene: THREE.Scene) {
    const vertexCount = TRAIL_SLOTS * this.verticesPerSlot;
    this.positions = new Float32Array(vertexCount * 3);
    this.colors = new Float32Array(vertexCount * 3);
    this.alphas = new Float32Array(vertexCount);
    this.uvs = new Float32Array(vertexCount * 2);
    this.indices = new Uint16Array(TRAIL_SLOTS * (TRAIL_SEGMENTS - 1) * 6);

    for (let slot = 0; slot < TRAIL_SLOTS; slot += 1) {
      const base = slot * this.verticesPerSlot;
      for (let i = 0; i < TRAIL_SEGMENTS - 1; i += 1) {
        const a = base + i * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        const idx = (slot * (TRAIL_SEGMENTS - 1) + i) * 6;
        this.indices[idx] = a;
        this.indices[idx + 1] = b;
        this.indices[idx + 2] = c;
        this.indices[idx + 3] = b;
        this.indices[idx + 4] = d;
        this.indices[idx + 5] = c;
      }
      for (let i = 0; i < TRAIL_SEGMENTS; i += 1) {
        const v = base + i * 2;
        this.uvs[v * 2] = 0;
        this.uvs[v * 2 + 1] = i / (TRAIL_SEGMENTS - 1);
        this.uvs[(v + 1) * 2] = 1;
        this.uvs[(v + 1) * 2 + 1] = i / (TRAIL_SEGMENTS - 1);
      }
      this.slots.push({
        active: false,
        freed: true,
        fading: 0,
        head: 0,
        count: 0,
        points: new Float32Array(TRAIL_SEGMENTS * 3),
        color: new THREE.Color(0xffffff),
        width: 1,
      });
      this.free.push(slot);
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setIndex(new THREE.BufferAttribute(this.indices, 1));

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uOpacity: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aColor;
        attribute float aAlpha;
        varying vec3 vColor;
        varying float vAlpha;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vColor = aColor;
          vAlpha = aAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        varying vec3 vColor;
        varying float vAlpha;
        varying vec2 vUv;
        void main() {
          float d = abs(vUv.x - 0.5) * 2.0;
          float core = pow(max(0.0, 1.0 - d), 4.0);
          float glow = pow(max(0.0, 1.0 - d), 1.35) * 0.68;
          float alpha = vAlpha * (core + glow) * uOpacity;
          if (alpha < 0.004) discard;
          vec3 color = vColor * (0.75 + core * 1.35);
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  acquire(color: THREE.Color, width: number): number {
    const slot = this.free.pop();
    if (slot === undefined) return -1;
    const data = this.slots[slot];
    data.active = true;
    data.freed = false;
    data.fading = 0;
    data.head = 0;
    data.count = 0;
    data.color.copy(color);
    data.width = width;
    return slot;
  }

  release(slot: number): void {
    if (slot < 0 || slot >= TRAIL_SLOTS) return;
    const data = this.slots[slot];
    data.active = false;
    data.fading = 0;
  }

  push(slot: number, x: number, y: number, z: number): void {
    if (slot < 0 || slot >= TRAIL_SLOTS) return;
    const data = this.slots[slot];
    if (!data.active) return;
    if (data.count > 0) {
      const last = (data.head - 1 + TRAIL_SEGMENTS) % TRAIL_SEGMENTS;
      const p = last * 3;
      const dx = x - data.points[p];
      const dy = y - data.points[p + 1];
      const dz = z - data.points[p + 2];
      if (dx * dx + dy * dy + dz * dz < 0.09) return;
    }
    const p = data.head * 3;
    data.points[p] = x;
    data.points[p + 1] = y;
    data.points[p + 2] = z;
    data.head = (data.head + 1) % TRAIL_SEGMENTS;
    data.count = Math.min(TRAIL_SEGMENTS, data.count + 1);
  }

  update(dt: number, camera?: THREE.Camera | null): void {
    if (camera) camera.getWorldPosition(this.cameraPosition);
    else this.cameraPosition.set(0, 0, 0);
    let anyVisible = false;

    for (let slot = 0; slot < TRAIL_SLOTS; slot += 1) {
      const data = this.slots[slot];
      if (!data.active) {
        if (data.freed) continue;
        if (data.fading >= 0.45) {
          if (data.count > 0) {
            this.clearSlot(slot);
            data.count = 0;
          }
          data.freed = true;
          this.free.push(slot);
          continue;
        }
        data.fading += dt;
      }
      const fade = data.active ? 1 : Math.max(0, 1 - data.fading / 0.45);
      const count = data.count;
      const base = slot * this.verticesPerSlot;
      if (count < 2) {
        for (let i = 0; i < TRAIL_SEGMENTS; i += 1) {
          const v = base + i * 2;
          this.alphas[v] = 0;
          this.alphas[v + 1] = 0;
        }
        continue;
      }
      anyVisible = true;

      for (let i = 0; i < count; i += 1) {
        const idx = (data.head - count + i + TRAIL_SEGMENTS) % TRAIL_SEGMENTS;
        const prev = ((idx - 1 + TRAIL_SEGMENTS) % TRAIL_SEGMENTS) * 3;
        const next = ((idx + 1) % TRAIL_SEGMENTS) * 3;
        const p = idx * 3;
        const x = data.points[p];
        const y = data.points[p + 1];
        const z = data.points[p + 2];
        const hasPrev = i > 0;
        const hasNext = i < count - 1;
        const px = hasPrev ? data.points[prev] : x;
        const py = hasPrev ? data.points[prev + 1] : y;
        const pz = hasPrev ? data.points[prev + 2] : z;
        const nx = hasNext ? data.points[next] : x;
        const ny = hasNext ? data.points[next + 1] : y;
        const nz = hasNext ? data.points[next + 2] : z;
        this.tangent.set(nx - px, ny - py, nz - pz);
        if (this.tangent.lengthSq() < 1e-6) this.tangent.set(0, 0, 1);
        else this.tangent.normalize();
        this.view.set(this.cameraPosition.x - x, this.cameraPosition.y - y, this.cameraPosition.z - z);
        const viewLength = this.view.length();
        if (viewLength > 1e-6) this.view.multiplyScalar(1 / viewLength);
        // 视线几乎与尾迹平行时，丝带会退化成交叉的两条边；此时淡出，交给粒子
        const parallel = Math.abs(this.tangent.dot(this.view));
        const parallelFade = 1 - THREE.MathUtils.smoothstep(parallel, 0.72, 0.96);
        this.side.crossVectors(this.tangent, this.view);
        if (this.side.lengthSq() < 1e-5) {
          // 视线几乎与尾迹平行时，叉积退化；用稳定轴/上一帧侧向避免丝带翻面
          if (Math.abs(this.tangent.y) < 0.9) this.side.crossVectors(this.tangent, this.up);
          else this.side.set(1, 0, 0).cross(this.tangent);
        }
        if (i > 0 && this.side.dot(this.lastSide) < 0) this.side.negate();
        if (this.side.lengthSq() < 1e-6) this.side.set(0, 1, 0);
        else this.side.normalize();
        this.lastSide.copy(this.side);

        const t = count > 1 ? i / (count - 1) : 0;
        // 弹头处最窄最亮，越靠后越宽、越暗（尾迹扩散）
        const width = data.width * (1.0 + (1 - t) * 1.15) * 0.5;
        const alpha = Math.pow(t, 1.65) * 0.9 * fade * parallelFade;
        const brightness = 0.55 + t * 0.85;
        const v = base + i * 2;
        const left = v * 3;
        const right = left + 3;
        this.positions[left] = x - this.side.x * width;
        this.positions[left + 1] = y - this.side.y * width;
        this.positions[left + 2] = z - this.side.z * width;
        this.positions[right] = x + this.side.x * width;
        this.positions[right + 1] = y + this.side.y * width;
        this.positions[right + 2] = z + this.side.z * width;
        this.colors[left] = data.color.r * brightness;
        this.colors[left + 1] = data.color.g * brightness;
        this.colors[left + 2] = data.color.b * brightness;
        this.colors[right] = data.color.r * brightness;
        this.colors[right + 1] = data.color.g * brightness;
        this.colors[right + 2] = data.color.b * brightness;
        this.alphas[v] = alpha;
        this.alphas[v + 1] = alpha;
      }
      for (let i = count; i < TRAIL_SEGMENTS; i += 1) {
        const v = base + i * 2;
        this.alphas[v] = 0;
        this.alphas[v + 1] = 0;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aColor.needsUpdate = true;
    this.geometry.attributes.aAlpha.needsUpdate = true;
    this.mesh.visible = anyVisible;
  }

  private clearSlot(slot: number): void {
    const base = slot * this.verticesPerSlot;
    for (let i = 0; i < TRAIL_SEGMENTS; i += 1) {
      const v = base + i * 2;
      this.alphas[v] = 0;
      this.alphas[v + 1] = 0;
    }
  }

  dispose(): void {
    this.mesh.parent?.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}

const FORWARD = new THREE.Vector3(0, 0, 1);

export class TorpedoHandle {
  grade: TorpedoGrade = 'light';
  color = new THREE.Color(0xffffff);
  position = new THREE.Vector3();
  direction = new THREE.Vector3(0, 0, 1);
  right = new THREE.Vector3(1, 0, 0);
  up = new THREE.Vector3(0, 1, 0);
  offset = new THREE.Vector3();
  age = 0;
  seed = Math.random() * 100;
  speed = 0;
  terminal = 0;
  wobbleX = 0;
  wobbleY = 0;
  roll = 0;
  trail = -1;
  active = false;
  emitterCore = 0;
  emitterGlow = 0;
  emitterSpark = 0;
  emitterSmoke = 0;
}

export interface TorpedoVfxStats {
  activeHeavy: number;
  activeLight: number;
  activeTrailSlots: number;
  trailParticles: number;
  trailSmoke: number;
  drawCalls: number;
}

export class TorpedoVfx {
  private readonly scene: THREE.Scene;
  private readonly heavy: TorpedoBatch;
  private readonly light: TorpedoBatch;
  private readonly activeHeavy: TorpedoHandle[] = [];
  private readonly activeLight: TorpedoHandle[] = [];
  private readonly pool: TorpedoHandle[] = [];
  private readonly ribbon: TrailRibbon;
  private readonly trailParticles: ParticleField;
  private readonly trailSmoke: ParticleField;
  private readonly dummy = new THREE.Object3D();
  private readonly dirQuat = new THREE.Quaternion();
  private readonly wobbleQuat = new THREE.Quaternion();
  private readonly bodyQuat = new THREE.Quaternion();
  private readonly wobbleEuler = new THREE.Euler();
  private readonly exhaust = new THREE.Vector3();
  private readonly plumePos = new THREE.Vector3();
  private readonly tmpColorA = new THREE.Color();
  private readonly tmpColorB = new THREE.Color();
  private readonly white = new THREE.Color(0xffffff);
  private readonly ember = new THREE.Color(0xff4a12);
  private time = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    const hullHeavy = buildHullGeometry(true);
    const hullLight = buildHullGeometry(false);
    const emissiveHeavy = buildEmissiveGeometry(true);
    const emissiveLight = buildEmissiveGeometry(false);
    const plume = plumeGeometry();
    this.heavy = createBatch(scene, 'heavy', hullHeavy, emissiveHeavy, plume);
    this.light = createBatch(scene, 'light', hullLight, emissiveLight, plume);
    this.ribbon = new TrailRibbon(scene);
    this.trailParticles = new ParticleField(scene, {
      capacity: 4800,
      texture: getSoftTexture(),
      blending: THREE.AdditiveBlending,
      renderOrder: 5,
      fadePower: 1.5,
      colorPower: 1.4,
      textureColor: 0.18,
    });
    this.trailSmoke = new ParticleField(scene, {
      capacity: 1600,
      texture: getSmokeTexture(),
      blending: THREE.NormalBlending,
      renderOrder: 2,
      fadePower: 1.9,
      colorPower: 1.2,
      textureColor: 0.2,
    });
  }

  acquire(grade: TorpedoGrade, color: THREE.Color | number): TorpedoHandle {
    const handle = this.pool.pop() ?? new TorpedoHandle();
    handle.grade = grade;
    if (color instanceof THREE.Color) handle.color.copy(color);
    else handle.color.setHex(color);
    handle.age = 0;
    handle.seed = Math.random() * 100;
    handle.speed = 0;
    handle.terminal = 0;
    handle.trail = this.ribbon.acquire(handle.color, grade === 'heavy' ? this.heavy.spec.trailWidth : this.light.spec.trailWidth);
    handle.emitterCore = Math.random();
    handle.emitterGlow = Math.random();
    handle.emitterSpark = Math.random();
    handle.emitterSmoke = Math.random();
    handle.active = true;
    if (grade === 'heavy') this.activeHeavy.push(handle);
    else this.activeLight.push(handle);
    return handle;
  }

  release(handle: TorpedoHandle): void {
    if (!handle.active) return;
    handle.active = false;
    this.ribbon.release(handle.trail);
    handle.trail = -1;
    const list = handle.grade === 'heavy' ? this.activeHeavy : this.activeLight;
    const index = list.indexOf(handle);
    if (index >= 0) {
      const last = list.pop()!;
      if (index < list.length) list[index] = last;
    }
    if (this.pool.length < MAX_INSTANCES * 2) this.pool.push(handle);
  }

  /**
   * 每帧由弹丸逻辑调用。只写数值，不生成节点。
   * velocity 传入的是未归一化的速度向量。
   */
  sample(
    handle: TorpedoHandle,
    dt: number,
    position: THREE.Vector3,
    velocity: THREE.Vector3,
    speed: number,
    terminal: boolean,
  ): void {
    if (!handle.active) return;
    handle.position.copy(position);
    if (speed > 0.001) handle.direction.copy(velocity).multiplyScalar(1 / speed);
    else handle.direction.set(0, 0, 1);
    handle.speed = speed;
    handle.age += dt;
    const target = terminal ? 1 : 0;
    handle.terminal += (target - handle.terminal) * Math.min(1, dt * 5);
    const mix = handle.terminal;
    const grade = handle.grade === 'heavy' ? this.heavy.spec : this.light.spec;

    basisForDirection(handle.direction, handle.right, handle.up);
    const wobble = grade.wobble * (1 - mix * 0.62);
    handle.wobbleX = Math.sin(handle.age * 6.0 + handle.seed) * wobble;
    handle.wobbleY = Math.cos(handle.age * 7.3 + handle.seed * 1.7) * wobble * 0.72;
    handle.roll = Math.sin(handle.age * 4.8 + handle.seed * 0.6) * 0.16;
    handle.offset
      .copy(handle.right)
      .multiplyScalar(handle.wobbleX)
      .addScaledVector(handle.up, handle.wobbleY);

    // 尾迹采样点：喷口位置
    this.exhaust
      .copy(handle.position)
      .addScaledVector(handle.direction, grade.exhaustZ * grade.scale);
    this.exhaust.add(handle.offset);
    this.ribbon.push(handle.trail, this.exhaust.x, this.exhaust.y, this.exhaust.z);

    const boost = 1 + mix * 0.85;
    const scale = Math.min(1, 105 / Math.max(1, this.activeHeavy.length + this.activeLight.length));
    const emission = Math.max(0.42, scale);

    handle.emitterCore += dt * (58 + mix * 62) * emission;
    while (handle.emitterCore >= 1) {
      handle.emitterCore -= 1;
      this.emitCore(handle, grade, boost);
    }
    handle.emitterGlow += dt * (24 + mix * 26) * emission;
    while (handle.emitterGlow >= 1) {
      handle.emitterGlow -= 1;
      this.emitGlow(handle, grade, boost);
    }
    handle.emitterSpark += dt * (22 + mix * 34) * emission;
    while (handle.emitterSpark >= 1) {
      handle.emitterSpark -= 1;
      this.emitSpark(handle, grade, boost);
    }
    handle.emitterSmoke += dt * (10 + mix * 6) * emission;
    while (handle.emitterSmoke >= 1) {
      handle.emitterSmoke -= 1;
      this.emitSmoke(handle, grade, mix);
    }
  }

  private emitCore(handle: TorpedoHandle, grade: GradeSpec, boost: number): void {
    const unit = grade.scale;
    const back = 55 + Math.random() * 110;
    const vx = -handle.direction.x * back + (Math.random() - 0.5) * 42;
    const vy = -handle.direction.y * back + (Math.random() - 0.5) * 42;
    const vz = -handle.direction.z * back + (Math.random() - 0.5) * 42;
    this.tmpColorA.copy(handle.color).lerp(this.white, 0.55 + Math.random() * 0.35);
    this.tmpColorB.copy(handle.color).multiplyScalar(0.55);
    const size = unit * (0.55 + Math.random() * 0.55) * boost;
    this.trailParticles.spawn(
      this.exhaust.x, this.exhaust.y, this.exhaust.z,
      vx, vy, vz,
      0.32 + Math.random() * 0.38,
      size, 0.45,
      this.tmpColorA, this.tmpColorB,
      0.85, 2.2,
      Math.random() * Math.PI * 2, (Math.random() - 0.5) * 2,
    );
  }

  private emitGlow(handle: TorpedoHandle, grade: GradeSpec, boost: number): void {
    const unit = grade.scale;
    const back = 30 + Math.random() * 60;
    this.tmpColorA.copy(handle.color).lerp(this.ember, 0.15 + Math.random() * 0.2);
    this.tmpColorB.copy(this.ember).multiplyScalar(0.25);
    this.trailParticles.spawn(
      this.exhaust.x + (Math.random() - 0.5) * unit * 1.5,
      this.exhaust.y + (Math.random() - 0.5) * unit * 1.5,
      this.exhaust.z + (Math.random() - 0.5) * unit * 1.5,
      -handle.direction.x * back + (Math.random() - 0.5) * 30,
      -handle.direction.y * back + (Math.random() - 0.5) * 30,
      -handle.direction.z * back + (Math.random() - 0.5) * 30,
      0.75 + Math.random() * 0.8,
      unit * (2.0 + Math.random() * 1.8) * boost,
      2.2,
      this.tmpColorA, this.tmpColorB,
      0.24, 1.3,
      Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.6,
    );
  }

  private emitSpark(handle: TorpedoHandle, grade: GradeSpec, boost: number): void {
    const unit = grade.scale;
    const spread = 170 + Math.random() * 260;
    const vx = -handle.direction.x * (240 + Math.random() * 280) + (Math.random() - 0.5) * spread;
    const vy = -handle.direction.y * (240 + Math.random() * 280) + (Math.random() - 0.5) * spread;
    const vz = -handle.direction.z * (240 + Math.random() * 280) + (Math.random() - 0.5) * spread;
    this.tmpColorA.copy(handle.color).lerp(this.white, 0.72);
    this.tmpColorB.copy(this.ember);
    this.trailParticles.spawn(
      this.exhaust.x, this.exhaust.y, this.exhaust.z,
      vx, vy, vz,
      0.22 + Math.random() * 0.55,
      unit * (0.35 + Math.random() * 0.55) * boost,
      -0.35,
      this.tmpColorA, this.tmpColorB,
      0.95, 0.55,
      Math.random() * Math.PI * 2, (Math.random() - 0.5) * 4,
    );
  }

  private emitSmoke(handle: TorpedoHandle, grade: GradeSpec, mix: number): void {
    const unit = grade.scale;
    const shade = 0.32 + Math.random() * 0.16;
    this.tmpColorA.setRGB(shade * 1.2, shade * 0.88, shade * 0.72);
    this.tmpColorB.setRGB(shade * 0.35, shade * 0.33, shade * 0.3);
    this.trailSmoke.spawn(
      this.exhaust.x + (Math.random() - 0.5) * unit * 2,
      this.exhaust.y + (Math.random() - 0.5) * unit * 2,
      this.exhaust.z + (Math.random() - 0.5) * unit * 2,
      -handle.direction.x * (18 + Math.random() * 40) + (Math.random() - 0.5) * 16,
      -handle.direction.y * (18 + Math.random() * 40) + (Math.random() - 0.5) * 16,
      -handle.direction.z * (18 + Math.random() * 40) + (Math.random() - 0.5) * 16,
      1.8 + Math.random() * 2.4,
      unit * (2.0 + Math.random() * 2.0) * (1 + mix * 0.35),
      3.4,
      this.tmpColorA, this.tmpColorB,
      0.3, 0.55,
      Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.4,
    );
  }

  update(dt: number, camera?: THREE.Camera | null): void {
    this.time += dt;
    this.renderBatch(this.heavy, this.activeHeavy);
    this.renderBatch(this.light, this.activeLight);
    this.ribbon.update(dt, camera);
    this.trailParticles.update(dt);
    this.trailSmoke.update(dt);
  }

  private renderBatch(batch: TorpedoBatch, handles: TorpedoHandle[]): void {
    const spec = batch.spec;
    let count = 0;
    for (const handle of handles) {
      if (!handle.active) continue;
      if (count >= MAX_INSTANCES) break;

      this.dirQuat.setFromUnitVectors(FORWARD, handle.direction);
      this.wobbleEuler.set(
        handle.wobbleY * 0.004,
        -handle.wobbleX * 0.004,
        handle.roll,
      );
      this.wobbleQuat.setFromEuler(this.wobbleEuler);
      this.bodyQuat.copy(this.dirQuat).multiply(this.wobbleQuat);

      this.dummy.position.copy(handle.position).add(handle.offset);
      this.dummy.quaternion.copy(this.bodyQuat);
      this.dummy.scale.setScalar(spec.scale);
      this.dummy.updateMatrix();
      batch.hull.setMatrixAt(count, this.dummy.matrix);
      batch.emissive.setMatrixAt(count, this.dummy.matrix);

      // 喷口位置：沿弹体轴向后
      this.plumePos
        .copy(this.dummy.position)
        .addScaledVector(handle.direction, spec.exhaustZ * spec.scale);
      const flicker = 0.92 + Math.sin(this.time * 78 + handle.seed * 13) * 0.06 + Math.random() * 0.03;
      const boost = 1 + handle.terminal * 0.9;
      const lengthScale = spec.plumeLength * boost * flicker;
      const widthScale = spec.plumeWidth * (1 + handle.terminal * 0.25);

      this.dummy.position.copy(this.plumePos);
      this.dummy.quaternion.copy(this.bodyQuat);
      this.dummy.scale.set(spec.scale * widthScale, spec.scale * widthScale, spec.scale * lengthScale);
      this.dummy.updateMatrix();
      batch.plumeOuter.setMatrixAt(count, this.dummy.matrix);

      this.dummy.scale.set(
        spec.scale * widthScale * 0.52,
        spec.scale * widthScale * 0.52,
        spec.scale * lengthScale * 0.68,
      );
      this.dummy.updateMatrix();
      batch.plumeCore.setMatrixAt(count, this.dummy.matrix);

      this.dummy.position.copy(this.plumePos).addScaledVector(handle.direction, -spec.scale * 0.4);
      this.dummy.quaternion.identity();
      this.dummy.scale.setScalar(spec.glowSize * (1 + handle.terminal * 0.55) * flicker);
      this.dummy.updateMatrix();
      batch.glow.setMatrixAt(count, this.dummy.matrix);
      count += 1;
    }

    batch.hull.count = count;
    batch.emissive.count = count;
    batch.plumeOuter.count = count;
    batch.plumeCore.count = count;
    batch.glow.count = count;
    const visible = count > 0;
    batch.hull.visible = visible;
    batch.emissive.visible = visible;
    batch.plumeOuter.visible = visible;
    batch.plumeCore.visible = visible;
    batch.glow.visible = visible;
    if (count > 0) {
      batch.hull.instanceMatrix.needsUpdate = true;
      batch.emissive.instanceMatrix.needsUpdate = true;
      batch.plumeOuter.instanceMatrix.needsUpdate = true;
      batch.plumeCore.instanceMatrix.needsUpdate = true;
      batch.glow.instanceMatrix.needsUpdate = true;
    }
  }

  get stats(): TorpedoVfxStats {
    return {
      activeHeavy: this.activeHeavy.length,
      activeLight: this.activeLight.length,
      activeTrailSlots: this.activeHeavy.length + this.activeLight.length,
      trailParticles: this.trailParticles.liveCount,
      trailSmoke: this.trailSmoke.liveCount,
      drawCalls: 10 + 1,
    };
  }

  dispose(): void {
    for (const handle of [...this.activeHeavy, ...this.activeLight]) this.release(handle);
    for (const batch of [this.heavy, this.light]) {
      for (const mesh of [batch.hull, batch.emissive, batch.plumeOuter, batch.plumeCore, batch.glow]) {
        this.scene.remove(mesh);
        mesh.dispose();
      }
      batch.spec.hullMaterial.dispose();
      batch.spec.emissiveMaterial.dispose();
      batch.spec.plumeOuterMaterial.dispose();
      batch.spec.plumeCoreMaterial.dispose();
      batch.spec.glowMaterial.dispose();
    }
    this.ribbon.dispose();
    this.trailParticles.dispose();
    this.trailSmoke.dispose();
  }
}
