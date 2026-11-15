import * as THREE from 'three';

let sharedTexture: THREE.CanvasTexture | null = null;

function trailTexture(): THREE.CanvasTexture {
  if (sharedTexture) return sharedTexture;
  const s = 64;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  sharedTexture = new THREE.CanvasTexture(canvas);
  return sharedTexture;
}

/**
 * 引擎尾迹粒子：世界空间点云，粒子留在原地形成拖尾。
 * 用顶点色做亮度衰减，加法混合下的黑色即不可见。
 */
export class EngineTrail {
  readonly object: THREE.Points;
  private geometry: THREE.BufferGeometry;
  private material: THREE.PointsMaterial;
  private positions: Float32Array;
  private colors: Float32Array;
  private velocities: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private strength: Float32Array;
  private cursor = 0;
  private accumulator = 0;
  private base: THREE.Color;

  constructor(
    private scene: THREE.Scene,
    color: number,
    shipLength: number,
    private capacity = 140,
  ) {
    this.base = new THREE.Color(color);
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.velocities = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.strength = new Float32Array(capacity);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

    this.material = new THREE.PointsMaterial({
      size: Math.max(1.6, shipLength * 0.025),
      map: trailTexture(),
      transparent: true,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
      opacity: 0.72,
    });

    this.object = new THREE.Points(this.geometry, this.material);
    this.object.frustumCulled = false;
    this.object.renderOrder = 4;
    this.scene.add(this.object);
  }

  emit(
    origin: THREE.Vector3,
    backward: THREE.Vector3,
    strength: number,
    rate: number,
    dt: number,
    jitter = 1,
  ): void {
    this.accumulator += dt * rate;
    while (this.accumulator >= 1) {
      this.accumulator -= 1;
      const i = this.cursor % this.capacity;
      this.cursor += 1;
      const p = i * 3;

      this.positions[p] = origin.x + (Math.random() - 0.5) * jitter;
      this.positions[p + 1] = origin.y + (Math.random() - 0.5) * jitter;
      this.positions[p + 2] = origin.z + (Math.random() - 0.5) * jitter;

      const backSpeed = 22 + Math.random() * 45;
      this.velocities[p] = backward.x * backSpeed + (Math.random() - 0.5) * 26;
      this.velocities[p + 1] = backward.y * backSpeed + (Math.random() - 0.5) * 26 + 10;
      this.velocities[p + 2] = backward.z * backSpeed + (Math.random() - 0.5) * 26;

      this.life[i] = 0.5 + Math.random() * 0.6;
      this.maxLife[i] = this.life[i];
      this.strength[i] = strength;

      this.colors[p] = this.base.r;
      this.colors[p + 1] = this.base.g;
      this.colors[p + 2] = this.base.b;
    }
  }

  update(dt: number): void {
    for (let i = 0; i < this.capacity; i += 1) {
      if (this.life[i] <= 0) continue;
      const p = i * 3;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.colors[p] = 0;
        this.colors[p + 1] = 0;
        this.colors[p + 2] = 0;
        continue;
      }
      this.positions[p] += this.velocities[p] * dt;
      this.positions[p + 1] += this.velocities[p + 1] * dt;
      this.positions[p + 2] += this.velocities[p + 2] * dt;
      const fade = (this.life[i] / this.maxLife[i]) * this.strength[i];
      this.colors[p] = this.base.r * fade;
      this.colors[p + 1] = this.base.g * fade;
      this.colors[p + 2] = this.base.b * fade;
    }
    (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.scene.remove(this.object);
    this.geometry.dispose();
    this.material.dispose();
  }
}

interface PlumeEmitter {
  pos: THREE.Vector3;
  size: number;
}

/**
 * 舰体局部坐标的引擎粒子尾焰。
 * 作为舰体子节点，粒子沿 +Z 向后喷出，近距离也能看到成片的尾迹。
 */
let flameTex: THREE.CanvasTexture | null = null;
const flameGeo = new THREE.PlaneGeometry(1, 1);

function getFlameTexture(): THREE.CanvasTexture {
  if (flameTex) return flameTex;
  const w = 128;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);

  const drawFlame = (halfWidth: number, alpha: number, inner: boolean) => {
    const grad = ctx.createLinearGradient(0, h, 0, 0);
    grad.addColorStop(0, `rgba(255,255,255,${alpha})`);
    grad.addColorStop(0.18, `rgba(255,255,255,${alpha * 0.95})`);
    grad.addColorStop(0.52, `rgba(255,255,255,${alpha * 0.45})`);
    grad.addColorStop(0.82, `rgba(255,255,255,${alpha * 0.12})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(w / 2 - halfWidth, h);
    ctx.quadraticCurveTo(w / 2 - halfWidth * 1.15, h * 0.62, w / 2 - halfWidth * 0.44, h * 0.34);
    ctx.quadraticCurveTo(w / 2 - halfWidth * 0.18, h * 0.16, w / 2, 0);
    ctx.quadraticCurveTo(w / 2 + halfWidth * 0.18, h * 0.16, w / 2 + halfWidth * 0.44, h * 0.34);
    ctx.quadraticCurveTo(w / 2 + halfWidth * 1.15, h * 0.62, w / 2 + halfWidth, h);
    ctx.closePath();
    ctx.fill();
  };

  // 外层焰体 + 内层更亮的核心；配合加色混合形成白心彩色火焰
  drawFlame(w * 0.34, 0.82, false);
  drawFlame(w * 0.18, 0.9, true);

  // 少量不规则缺口，避免像一块平板
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 14; i += 1) {
    const x = w / 2 + (Math.random() - 0.5) * w * 0.4;
    const y = h * (0.08 + Math.random() * 0.55);
    const r = 3 + Math.random() * 10;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,0.28)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  flameTex = new THREE.CanvasTexture(canvas);
  flameTex.colorSpace = THREE.SRGBColorSpace;
  return flameTex;
}

interface FlameNozzle {
  x: number;
  y: number;
  z: number;
  baseLength: number;
  baseWidth: number;
}

/**
 * 舰体局部坐标的交叉片火焰尾焰。
 * 两个交叉面片 + 内部白热核心，沿 +Z 向后喷；从侧面看是火焰，从正后方看由喷口辉光补足。
 */
export class LocalPlume {
  readonly object: THREE.Group;
  private flames: Array<{
    mesh: THREE.Mesh;
    inner: boolean;
    nozzle: FlameNozzle;
    baseLength: number;
    baseWidth: number;
  }> = [];
  private materials: THREE.MeshBasicMaterial[] = [];
  private time = 0;

  constructor(
    group: THREE.Group,
    nozzles: Array<{ pos: [number, number, number]; size: number; role?: string }>,
    shipLength: number,
    color: number,
    plumeScale = 1,
  ) {
    this.object = new THREE.Group();
    group.add(this.object);

    const tex = getFlameTexture();
    const qa = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    const qb = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2).multiply(qa);

    const outerMat = new THREE.MeshBasicMaterial({
      map: tex,
      color: new THREE.Color(color),
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const innerMat = new THREE.MeshBasicMaterial({
      map: tex,
      color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.72),
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.materials.push(outerMat, innerMat);

    for (const nozzle of nozzles) {
      const secondary = nozzle.role === 'secondary';
      // 副推进器只留一点光：长度按舰长的小比例，宽度直接按喷口尺寸
      const baseLength = secondary
        ? Math.max(2.2, shipLength * 0.015)
        : Math.max(3.5, shipLength * 0.32 * plumeScale);
      const baseWidth = secondary
        ? Math.max(0.6, nozzle.size * 0.9)
        : Math.max(1.2, nozzle.size * 2.4 * plumeScale);
      const pos = new THREE.Vector3(...nozzle.pos);
      const data: FlameNozzle = {
        x: pos.x,
        y: pos.y,
        z: pos.z,
        baseLength,
        baseWidth,
      };

      for (const [quat, inner] of [
        [qa, false],
        [qb, false],
        [qa, true],
      ] as Array<[THREE.Quaternion, boolean]>) {
        // 副推进器不需要白热核心，只保留外层的小光斑
        if (secondary && inner) continue;
        const mesh = new THREE.Mesh(flameGeo, inner ? innerMat : outerMat);
        mesh.quaternion.copy(quat);
        mesh.position.set(data.x, data.y, data.z + baseLength * 0.5);
        mesh.scale.set(baseWidth * (inner ? 0.5 : 1), baseLength * (inner ? 0.78 : 1), 1);
        mesh.frustumCulled = false;
        mesh.renderOrder = 4;
        this.object.add(mesh);
        this.flames.push({
          mesh,
          inner,
          nozzle: data,
          baseLength: baseLength * (inner ? 0.78 : 1),
          baseWidth: baseWidth * (inner ? 0.5 : 1),
        });
      }
    }
  }

  update(dt: number, power: number): void {
    this.time += dt;
    const p = Math.min(4, Math.max(0, power));
    for (let i = 0; i < this.flames.length; i += 1) {
      const flame = this.flames[i];
      const flicker = 0.9 + Math.sin(this.time * 19 + i * 1.7) * 0.06 + Math.random() * 0.04;
      const length = flame.baseLength * (0.38 + p * 0.95) * flicker;
      const width = flame.baseWidth * (0.78 + p * 0.16);
      flame.mesh.scale.set(width, length, 1);
      flame.mesh.position.z = flame.nozzle.z + length * (flame.inner ? 0.44 : 0.5);
    }
    const outerMat = this.materials[0];
    const innerMat = this.materials[1];
    if (outerMat) outerMat.opacity = 0.28 + Math.min(p, 3) * 0.12;
    if (innerMat) innerMat.opacity = 0.5 + Math.min(p, 3) * 0.13;
  }

  dispose(): void {
    this.object.parent?.remove(this.object);
    for (const material of this.materials) material.dispose();
    this.materials = [];
    this.object.clear();
  }
}
