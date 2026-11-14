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
export class LocalPlume {
  readonly object: THREE.Points;
  private geometry: THREE.BufferGeometry;
  private material: THREE.PointsMaterial;
  private positions: Float32Array;
  private colors: Float32Array;
  private velocities: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private emitters: PlumeEmitter[];
  private base: THREE.Color;
  private cursor = 0;
  private capacity: number;

  constructor(
    group: THREE.Group,
    nozzles: Array<{ pos: [number, number, number]; size: number }>,
    shipLength: number,
    color: number,
  ) {
    this.emitters = nozzles.map((item) => ({ pos: new THREE.Vector3(...item.pos), size: item.size }));
    const perEmitter = 48;
    this.capacity = Math.max(1, this.emitters.length) * perEmitter;
    this.positions = new Float32Array(this.capacity * 3);
    this.colors = new Float32Array(this.capacity * 3);
    this.velocities = new Float32Array(this.capacity * 3);
    this.life = new Float32Array(this.capacity);
    this.maxLife = new Float32Array(this.capacity);
    this.base = new THREE.Color(color);

    for (let i = 0; i < this.capacity; i += 1) this.reset(i, Math.random());

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.material = new THREE.PointsMaterial({
      size: Math.max(0.28, shipLength * 0.0045),
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
    this.object.renderOrder = 3;
    group.add(this.object);
  }

  private reset(index: number, lifeFactor = 0): void {
    if (this.emitters.length === 0) return;
    const emitter = this.emitters[index % this.emitters.length];
    const p = index * 3;
    const jitter = emitter.size * 0.55 + 0.2;
    this.positions[p] = emitter.pos.x + (Math.random() - 0.5) * jitter;
    this.positions[p + 1] = emitter.pos.y + (Math.random() - 0.5) * jitter;
    this.positions[p + 2] = emitter.pos.z + 0.3 + Math.random() * 2.0;
    const speed = 10 + Math.random() * 26;
    this.velocities[p] = (Math.random() - 0.5) * 9;
    this.velocities[p + 1] = (Math.random() - 0.5) * 9;
    this.velocities[p + 2] = speed;
    this.maxLife[index] = 0.34 + Math.random() * 0.34;
    this.life[index] = this.maxLife[index] * (1 - lifeFactor);
  }

  update(dt: number, power: number): void {
    const strength = 0.25 + Math.min(1.4, power) * 0.55;
    for (let i = 0; i < this.capacity; i += 1) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.reset(i);
        continue;
      }
      const p = i * 3;
      this.positions[p] += this.velocities[p] * dt;
      this.positions[p + 1] += this.velocities[p + 1] * dt;
      this.positions[p + 2] += this.velocities[p + 2] * dt;
      const fade = (this.life[i] / this.maxLife[i]) * strength;
      this.colors[p] = this.base.r * fade;
      this.colors[p + 1] = this.base.g * fade;
      this.colors[p + 2] = this.base.b * fade;
    }
    (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.object.parent?.remove(this.object);
    this.geometry.dispose();
    this.material.dispose();
  }
}
