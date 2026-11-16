import * as THREE from 'three';
import {
  ParticleField,
  getFireTexture,
  getSmokeTexture,
  getSoftTexture,
  getSparkTexture,
} from './vfx-common';

/**
 * 全局爆炸特效。
 *
 * 组成：
 * - 火球：GPU 点粒子（白热核 → 橙色火焰 → 冷等离子），颜色随寿命冷却。
 * - 冲击波：真正的球壳 Shader（菲涅尔边缘），不是面向相机的平面圆环。
 * - 等离子环：3D 环面 + 频谱噪声。
 * - 残骸：6 个 InstancedMesh（3 种形状 × 冷/热），所有残骸共享几何/材质。
 * - 灯光：场景中预置 6 盏 PointLight，避免动态增删导致 shader 重编译。
 * - 屏幕闪光/音效：通过 onExplosion / onSecondary 回调交给 main。
 */

export type ExplosionKind = 'normal' | 'impact' | 'final';

interface ExplosionPalette {
  core: THREE.Color;
  plasma: THREE.Color;
  fire: THREE.Color;
  smoke: THREE.Color;
  light: THREE.Color;
  shock: THREE.Color;
}

function palette(core: number, plasma: number, fire: number, smoke: number, light: number, shock: number): ExplosionPalette {
  return {
    core: new THREE.Color(core),
    plasma: new THREE.Color(plasma),
    fire: new THREE.Color(fire),
    smoke: new THREE.Color(smoke),
    light: new THREE.Color(light),
    shock: new THREE.Color(shock),
  };
}

const PALETTES = {
  small: palette(0xfff4d8, 0xffcf8a, 0xff7a24, 0x2c211c, 0xffa060, 0xffe0b0),
  medium: palette(0xfff6e2, 0x9fe8ff, 0xff6a20, 0x30241e, 0xff8a42, 0xffd7a0),
  capital: palette(0xfff8e8, 0x7fd8ff, 0xff6a20, 0x252a30, 0xff7440, 0xbfefff),
  dreadnought: palette(0xfff8e8, 0xa8c8ff, 0xff5a18, 0x1e2530, 0xff6a3a, 0x9fd8ff),
  final: palette(0xfff6d8, 0xcfe8ff, 0xff7a20, 0x1a2028, 0xff8050, 0xdff4ff),
};

function paletteFor(tier: number, final: boolean): ExplosionPalette {
  if (final || tier >= 10) return PALETTES.final;
  if (tier >= 7) return PALETTES.dreadnought;
  if (tier >= 5) return PALETTES.capital;
  if (tier >= 3) return PALETTES.medium;
  return PALETTES.small;
}

function randomUnit(): [number, number, number] {
  let x = Math.random() * 2 - 1;
  let y = Math.random() * 2 - 1;
  let z = Math.random() * 2 - 1;
  const length = Math.hypot(x, y, z) || 1;
  x /= length;
  y /= length;
  z /= length;
  return [x, y, z];
}

function easeOutCubic(value: number): number {
  const t = 1 - value;
  return 1 - t * t * t;
}

let debrisTexture: THREE.CanvasTexture | null = null;

function getDebrisTexture(): THREE.CanvasTexture {
  if (debrisTexture) return debrisTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const base = ctx.createLinearGradient(0, 0, size, size);
  base.addColorStop(0, '#5d6670');
  base.addColorStop(0.55, '#3c444d');
  base.addColorStop(1, '#252b32');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(8, 12, 16, 0.7)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i += 1) {
    const y = 8 + i * 24 + Math.random() * 4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y + (Math.random() - 0.5) * 6);
    ctx.stroke();
  }
  for (let i = 0; i < 4; i += 1) {
    const x = 8 + i * 30 + Math.random() * 4;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + (Math.random() - 0.5) * 5, size);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(18, 22, 26, 0.8)';
  for (let i = 0; i < 70; i += 1) {
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.4, 1.4);
  }
  ctx.save();
  ctx.translate(size * 0.66, size * 0.75);
  ctx.rotate(-0.35);
  ctx.fillStyle = 'rgba(190, 150, 52, 0.5)';
  for (let i = 0; i < 5; i += 1) ctx.fillRect(i * 14, 0, 7, 18);
  ctx.restore();
  debrisTexture = new THREE.CanvasTexture(canvas);
  debrisTexture.colorSpace = THREE.SRGBColorSpace;
  return debrisTexture;
}

interface FlashSlot {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  age: number;
  life: number;
  delay: number;
  size: number;
  grow: number;
  power: number;
  peak: number;
  active: boolean;
}

class FlashPool {
  private readonly slots: FlashSlot[] = [];
  private readonly scene: THREE.Scene;
  private cursor = 0;

  constructor(
    scene: THREE.Scene,
    capacity = 44,
    texture: THREE.Texture = getSoftTexture(),
    blending: THREE.Blending = THREE.AdditiveBlending,
    renderOrder = 6,
  ) {
    this.scene = scene;
    for (let i = 0; i < capacity; i += 1) {
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        blending,
        depthWrite: false,
        depthTest: true,
      });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      sprite.renderOrder = renderOrder;
      scene.add(sprite);
      this.slots.push({
        sprite,
        material,
        age: 0,
        life: 1,
        delay: 0,
        size: 1,
        grow: 1.5,
        power: 1,
        peak: 1,
        active: false,
      });
    }
  }

  spawn(position: THREE.Vector3, color: number, size: number, life: number, delay = 0, grow = 1.6, power = 1.2, peak = 1): void {
    let slot = this.slots.find((item) => !item.active);
    if (!slot) {
      slot = this.slots[this.cursor];
      this.cursor = (this.cursor + 1) % this.slots.length;
    }
    slot.active = true;
    slot.age = 0;
    slot.life = Math.max(0.02, life);
    slot.delay = delay;
    slot.size = size;
    slot.grow = grow;
    slot.power = power;
    slot.peak = peak;
    slot.sprite.position.copy(position);
    slot.material.color.setHex(color);
    slot.material.opacity = 0;
    slot.sprite.scale.setScalar(size * 0.4);
    slot.sprite.visible = true;
  }

  update(dt: number): void {
    for (const slot of this.slots) {
      if (!slot.active) continue;
      if (slot.delay > 0) {
        slot.delay -= dt;
        continue;
      }
      slot.age += dt;
      const k = Math.min(1, slot.age / slot.life);
      slot.sprite.scale.setScalar(slot.size * (0.4 + slot.grow * k));
      slot.material.opacity = Math.max(0, slot.peak * Math.pow(1 - k, slot.power));
      if (slot.age >= slot.life) {
        slot.active = false;
        slot.sprite.visible = false;
      }
    }
  }

  get activeCount(): number {
    return this.slots.filter((slot) => slot.active).length;
  }

  dispose(): void {
    for (const slot of this.slots) {
      this.scene.remove(slot.sprite);
      slot.material.dispose();
    }
  }
}

let plasmaRingTexture: THREE.CanvasTexture | null = null;

function getPlasmaRingTexture(): THREE.CanvasTexture {
  if (plasmaRingTexture) return plasmaRingTexture;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  // 软而薄的环形，带一点不规则亮度，面向相机时不会变成两条边线
  const gradient = ctx.createRadialGradient(size / 2, size / 2, size * 0.32, size / 2, size / 2, size * 0.5);
  gradient.addColorStop(0, 'rgba(255,255,255,0)');
  gradient.addColorStop(0.58, 'rgba(255,255,255,0)');
  gradient.addColorStop(0.72, 'rgba(255,255,255,0.12)');
  gradient.addColorStop(0.82, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.88, 'rgba(255,255,255,0.45)');
  gradient.addColorStop(0.96, 'rgba(255,255,255,0)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 42; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = size * (0.34 + Math.random() * 0.12);
    const x = size / 2 + Math.cos(angle) * radius;
    const y = size / 2 + Math.sin(angle) * radius;
    const r = 1 + Math.random() * 5;
    const hole = ctx.createRadialGradient(x, y, 0, x, y, r);
    hole.addColorStop(0, `rgba(0,0,0,${0.15 + Math.random() * 0.35})`);
    hole.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = hole;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  plasmaRingTexture = new THREE.CanvasTexture(canvas);
  plasmaRingTexture.needsUpdate = true;
  return plasmaRingTexture;
}

interface RingSlot {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  age: number;
  life: number;
  delay: number;
  radius: number;
  opacity: number;
  spin: number;
  squashY: number;
  active: boolean;
}

class RingPool {
  private readonly slots: RingSlot[] = [];
  private readonly scene: THREE.Scene;
  private cursor = 0;

  constructor(scene: THREE.Scene, capacity = 18) {
    this.scene = scene;
    const texture = getPlasmaRingTexture();
    for (let i = 0; i < capacity; i += 1) {
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true,
        opacity: 0,
      });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      sprite.renderOrder = 5;
      scene.add(sprite);
      this.slots.push({
        sprite,
        material,
        age: 0,
        life: 1,
        delay: 0,
        radius: 1,
        opacity: 0.6,
        spin: 0,
        squashY: 1,
        active: false,
      });
    }
  }

  spawn(position: THREE.Vector3, radius: number, color: number, life: number, delay: number, opacity: number, spin: number): void {
    let slot = this.slots.find((item) => !item.active);
    if (!slot) {
      slot = this.slots[this.cursor];
      this.cursor = (this.cursor + 1) % this.slots.length;
    }
    slot.active = true;
    slot.age = 0;
    slot.life = Math.max(0.1, life);
    slot.delay = delay;
    slot.radius = radius;
    slot.opacity = opacity;
    slot.spin = spin;
    slot.squashY = 0.54 + Math.random() * 0.06;
    slot.sprite.position.copy(position);
    slot.sprite.scale.set(radius * 0.1, radius * 0.1 * slot.squashY, 1);
    slot.material.color.setHex(color);
    slot.material.opacity = 0;
    slot.material.rotation = (Math.random() - 0.5) * 0.1;
    slot.sprite.visible = true;
  }

  update(dt: number): void {
    for (const slot of this.slots) {
      if (!slot.active) continue;
      if (slot.delay > 0) {
        slot.delay -= dt;
        continue;
      }
      slot.age += dt;
      const k = Math.min(1, slot.age / slot.life);
      const scale = slot.radius * (0.1 + 0.95 * easeOutCubic(k));
      slot.sprite.scale.set(scale, scale * slot.squashY, 1);
      slot.material.rotation += slot.spin * dt;
      slot.material.opacity = slot.opacity * Math.pow(1 - k, 1.35);
      if (slot.age >= slot.life) {
        slot.active = false;
        slot.sprite.visible = false;
      }
    }
  }

  get activeCount(): number {
    return this.slots.filter((slot) => slot.active).length;
  }

  dispose(): void {
    for (const slot of this.slots) {
      this.scene.remove(slot.sprite);
      slot.material.dispose();
    }
  }
}

interface DebrisPiece {
  variant: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  rotation: THREE.Euler;
  spin: THREE.Vector3;
  scale: THREE.Vector3;
  life: number;
  maxLife: number;
  active: boolean;
}

interface DebrisVariant {
  mesh: THREE.InstancedMesh;
  pieces: DebrisPiece[];
}

class DebrisField {
  private readonly scene: THREE.Scene;
  private readonly variants: DebrisVariant[] = [];
  private readonly pool: DebrisPiece[] = [];
  private readonly all: DebrisPiece[] = [];
  private readonly dummy = new THREE.Object3D();
  private maxPieces = 620;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    const shapes = [
      new THREE.BoxGeometry(1, 0.55, 0.72),
      new THREE.TetrahedronGeometry(0.72, 0),
      new THREE.BoxGeometry(1.85, 0.12, 1.08),
    ];
    const map = getDebrisTexture();
    const cold = new THREE.MeshStandardMaterial({
      map,
      color: 0x8a929a,
      metalness: 0.55,
      roughness: 0.72,
      flatShading: true,
    });
    const hot = new THREE.MeshStandardMaterial({
      map,
      color: 0x6f3024,
      metalness: 0.4,
      roughness: 0.62,
      emissive: new THREE.Color(0xb43a12),
      emissiveIntensity: 1.0,
      flatShading: true,
    });
    for (let shape = 0; shape < shapes.length; shape += 1) {
      for (let variant = 0; variant < 2; variant += 1) {
        const material = variant === 0 ? cold : hot;
        const mesh = new THREE.InstancedMesh(shapes[shape], material, 150);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.count = 0;
        mesh.visible = false;
        mesh.frustumCulled = false;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        scene.add(mesh);
        this.variants.push({ mesh, pieces: [] });
      }
    }
  }

  spawn(position: THREE.Vector3, length: number, tier: number, count: number, final: boolean): void {
    const total = Math.min(count, 90);
    for (let i = 0; i < total; i += 1) {
      if (this.all.length >= this.maxPieces) this.removeOldest();
      const hot = Math.random() < (final ? 0.22 : 0.13);
      const shape = Math.random() < 0.42 ? 2 : Math.random() < 0.55 ? 0 : 1;
      const variant = shape * 2 + (hot ? 1 : 0);
      const target = this.variants[variant];
      if (target.pieces.length >= 150) continue;
      const piece = this.pool.pop() ?? {
        variant,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        rotation: new THREE.Euler(),
        spin: new THREE.Vector3(),
        scale: new THREE.Vector3(),
        life: 0,
        maxLife: 0,
        active: false,
      };
      piece.variant = variant;
      piece.active = true;
      const spread = length * 0.18;
      piece.position.set(
        position.x + (Math.random() - 0.5) * spread,
        position.y + (Math.random() - 0.5) * spread,
        position.z + (Math.random() - 0.5) * spread,
      );
      const dir = randomUnit();
      const speed = 18 + Math.random() * (30 + tier * 7);
      piece.velocity.set(dir[0] * speed, dir[1] * speed, dir[2] * speed);
      piece.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      piece.spin.set(
        (Math.random() - 0.5) * 0.9,
        (Math.random() - 0.5) * 0.9,
        (Math.random() - 0.5) * 0.9,
      );
      const big = final && i < 10;
      const base = big
        ? length * (0.018 + Math.random() * 0.012)
        : length * (final ? (0.006 + Math.random() * 0.012) : (0.015 + Math.random() * 0.02)) + 0.25;
      piece.scale.set(
        base * (0.7 + Math.random() * 0.9),
        base * (0.35 + Math.random() * 0.45),
        base * (0.6 + Math.random() * 0.8),
      );
      piece.life = hot ? 5 + Math.random() * 8 : 18 + Math.random() * 22;
      piece.maxLife = piece.life;
      target.pieces.push(piece);
      this.all.push(piece);
    }
  }

  private removeOldest(): void {
    const piece = this.all.shift();
    if (!piece) return;
    const target = this.variants[piece.variant];
    const index = target.pieces.indexOf(piece);
    if (index >= 0) {
      const last = target.pieces.pop()!;
      if (index < target.pieces.length) target.pieces[index] = last;
    }
    piece.active = false;
    this.pool.push(piece);
  }

  update(dt: number): void {
    for (const variant of this.variants) {
      const pieces = variant.pieces;
      for (let i = pieces.length - 1; i >= 0; i -= 1) {
        const piece = pieces[i];
        piece.life -= dt;
        if (piece.life <= 0) {
          const last = pieces.pop()!;
          if (i < pieces.length) pieces[i] = last;
          const allIndex = this.all.indexOf(piece);
          if (allIndex >= 0) {
            const lastAll = this.all.pop()!;
            if (allIndex < this.all.length) this.all[allIndex] = lastAll;
          }
          piece.active = false;
          if (this.pool.length < 700) this.pool.push(piece);
          continue;
        }
        piece.position.addScaledVector(piece.velocity, dt);
        piece.velocity.multiplyScalar(1 - Math.min(0.4, 0.035 * dt));
        piece.rotation.x += piece.spin.x * dt;
        piece.rotation.y += piece.spin.y * dt;
        piece.rotation.z += piece.spin.z * dt;
      }
      for (let i = 0; i < pieces.length; i += 1) {
        const piece = pieces[i];
        this.dummy.position.copy(piece.position);
        this.dummy.rotation.copy(piece.rotation);
        this.dummy.scale.copy(piece.scale);
        this.dummy.updateMatrix();
        variant.mesh.setMatrixAt(i, this.dummy.matrix);
      }
      variant.mesh.count = pieces.length;
      variant.mesh.visible = pieces.length > 0;
      if (pieces.length > 0) variant.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  get count(): number {
    return this.all.length;
  }

  dispose(): void {
    for (const variant of this.variants) {
      this.scene.remove(variant.mesh);
      variant.mesh.geometry.dispose();
      const material = variant.mesh.material as THREE.Material;
      // 冷/热材质在 6 个 variant 里共享，按引用去重
      const shared = (material as THREE.Material & { userData?: { disposed?: boolean } });
      if (!shared.userData?.disposed) {
        shared.userData = { ...(shared.userData ?? {}), disposed: true };
        material.dispose();
      }
    }
  }
}

interface Blast {
  position: THREE.Vector3;
  age: number;
  life: number;
  size: number;
  tier: number;
  final: boolean;
  palette: ExplosionPalette;
  lightIndex: number;
  lightLife: number;
  seed: number;
  emitAcc: number;
  emitDuration: number;
  axis: THREE.Vector3;
  useAxis: boolean;
  active: boolean;
}

interface Pending {
  at: number;
  position: THREE.Vector3;
  length: number;
  tier: number;
  final: boolean;
  notify: boolean;
  active: boolean;
}

export interface ExplosionVfxStats {
  blasts: number;
  flashes: number;
  rings: number;
  debris: number;
  fireParticles: number;
  smokeParticles: number;
  sparkParticles: number;
}

export interface ExplosionVfxOptions {
  /** 二次爆炸回调；main 用它做音效/震屏，不要每颗子弹都全屏闪 */
  onSecondary?: (position: THREE.Vector3, size: number, tier: number) => void;
}

export class ExplosionVfx {
  private readonly scene: THREE.Scene;
  private readonly options: ExplosionVfxOptions;
  private readonly fire: ParticleField;
  private readonly smoke: ParticleField;
  private readonly sparks: ParticleField;
  private readonly flashPool: FlashPool;
  private readonly fireGlowPool: FlashPool;
  private readonly ringPool: RingPool;
  private readonly debrisField: DebrisField;
  private readonly blasts: Blast[] = [];
  private readonly pending: Pending[] = [];
  private readonly lights: THREE.PointLight[] = [];
  private readonly lightFree: boolean[] = [];
  private readonly pendingPool: Pending[] = [];
  private readonly tmpColorA = new THREE.Color();
  private readonly tmpColorB = new THREE.Color();
  private readonly tmpWhite = new THREE.Color(0xffffff);
  private readonly hotEnd = new THREE.Color(0x401008);
  private time = 0;

  constructor(scene: THREE.Scene, options: ExplosionVfxOptions = {}) {
    this.scene = scene;
    this.options = options;
    this.fire = new ParticleField(scene, {
      capacity: 5600,
      texture: getFireTexture(),
      blending: THREE.AdditiveBlending,
      renderOrder: 4,
      fadePower: 1.15,
      colorPower: 1.6,
      textureColor: 0.9,
    });
    this.smoke = new ParticleField(scene, {
      capacity: 1800,
      texture: getSmokeTexture(),
      blending: THREE.NormalBlending,
      renderOrder: 3,
      fadePower: 1.65,
      colorPower: 1.2,
      textureColor: 0.2,
    });
    this.sparks = new ParticleField(scene, {
      capacity: 2600,
      texture: getSparkTexture(),
      blending: THREE.AdditiveBlending,
      renderOrder: 6,
      fadePower: 1.1,
      colorPower: 1.1,
      textureColor: 0.4,
    });
    this.flashPool = new FlashPool(scene);
    this.fireGlowPool = new FlashPool(scene, 20, getFireTexture(), THREE.NormalBlending, 3);
    this.ringPool = new RingPool(scene);
    this.debrisField = new DebrisField(scene);
    for (let i = 0; i < 6; i += 1) {
      const light = new THREE.PointLight(0xff8a4a, 0, 12000, 2);
      light.position.set(0, 0, 0);
      scene.add(light);
      this.lights.push(light);
      this.lightFree.push(true);
    }
  }

  /** 普通爆炸/导弹命中/模块殉爆。length 是舰体尺度参考，size 是火球尺度 */
  spawn(
    position: THREE.Vector3,
    length: number,
    tier: number,
    kind: ExplosionKind = 'normal',
    axis?: THREE.Vector3,
  ): void {
    const final = kind === 'final';
    const impact = kind === 'impact';
    const size = Math.max(6, length * (final ? 1.35 : impact ? 0.75 : 0.58));
    const direction = final
      ? (axis ? axis.clone().normalize() : new THREE.Vector3(0, 0, 1))
      : undefined;
    this.detonate(position, length, tier, size, final, !impact, impact, direction);
    if (final) this.scheduleFinalStages(position, length, tier, direction);
  }

  /** 终末爆炸：主爆 + 沿舰体轴线的级联殉爆 + 球壳冲击波 + 等离子环 */
  finale(position: THREE.Vector3, length: number, tier: number, axis?: THREE.Vector3): void {
    const direction = axis ? axis.clone().normalize() : new THREE.Vector3(0, 0, 1);
    this.spawn(position, length, tier, 'final', direction);
    const size = length * 1.35;
    this.flash(position, 0xffffff, Math.max(60, size * 0.45), 0.16, 0, 2.2, 1.5, 0.85);
    this.flash(position, 0x9fd8ff, Math.max(45, size * 0.3), 0.55, 0.03, 1.8, 1.1, 0.38);
    this.flash(position, 0xff6a2a, Math.max(60, size * 0.55), 1.1, 0.06, 1.4, 1.2, 0.22);
    this.flash(position, 0xffe6b0, size * 0.22, 2.6, 0.05, 1.2, 1.0, 0.55);
    this.flash(position, 0xff8a30, size * 0.4, 3.4, 0.08, 1.2, 0.9, 0.3);
    this.ringPool.spawn(position, length * 1.3, 0xdff4ff, 1.0, 0, 0.5, 0.04);
    this.ringPool.spawn(position, length * 2.0, 0x9fd8ff, 1.6, 0.04, 0.3, -0.03);
    this.ringPool.spawn(position, length * 2.8, 0xff9a5a, 2.4, 0.1, 0.18, 0.02);
    this.ringPool.spawn(position, length * 3.6, 0x7fb8ff, 3.6, 0.18, 0.1, -0.01);
    this.debrisField.spawn(position, length, tier, 60, true);
    this.emitJet(position, size, PALETTES.final, direction, 1, 160);
    this.emitJet(position, size, PALETTES.final, direction, -1, 160);
    // 沿舰体轴线叠几个 normal-blend 火球底光，避免主火球亮度和体积不足
    for (let i = -2; i <= 2; i += 1) {
      const p = position.clone()
        .addScaledVector(direction, length * 0.22 * i + (Math.random() - 0.5) * length * 0.05);
      this.fireGlow(p, PALETTES.final.fire.getHex(), size * (0.3 + Math.random() * 0.12), 3.0 + Math.random() * 1.5, 0.05, 1.15, 0.85, 0.6);
      this.flash(p, PALETTES.final.fire.getHex(), size * (0.16 + Math.random() * 0.08), 2.2 + Math.random(), 0.05, 1.2, 0.9, 0.18);
    }
  }

  /** 死亡序列里的单个引擎/武器/船体爆炸：不产生残骸，光效规模更小 */
  moduleBurst(position: THREE.Vector3, size: number, color: number, tier: number): void {
    const palette = paletteFor(tier, false);
    this.flash(position, color, size * 0.9, 0.28, 0, 1.8, 1.1);
    this.emitFire(position, size, palette, 18 + tier * 5, false);
    this.emitSparks(position, size, palette, 8 + tier, color);
    this.emitSmoke(position, size, palette, 5 + tier, false);
    this.addLightOnly(position, size, tier, color);
  }

  /** 只提供照明的短寿命爆炸，用于死亡序列的模块殉爆 */
  private addLightOnly(position: THREE.Vector3, size: number, tier: number, color: number): void {
    const lightIndex = this.acquireLight();
    if (lightIndex < 0) return;
    const light = this.lights[lightIndex];
    light.position.copy(position);
    light.color.setHex(color);
    light.distance = Math.max(3500, size * 14);
    light.intensity = Math.min(2.2e6, size * size * 3.0);
    let blast = this.blasts.find((item) => !item.active);
    if (!blast) {
      blast = {
        position: new THREE.Vector3(),
        age: 0,
        life: 0.75,
        size,
        tier,
        final: false,
        palette: paletteFor(tier, false),
        lightIndex,
        lightLife: 0.5,
        seed: Math.random() * 100,
        emitAcc: 0,
        emitDuration: 0,
        axis: new THREE.Vector3(0, 0, 1),
        useAxis: false,
        active: true,
      };
      this.blasts.push(blast);
    }
    blast.position.copy(position);
    blast.age = 0;
    blast.life = 0.75;
    blast.size = size;
    blast.tier = tier;
    blast.final = false;
    blast.palette = paletteFor(tier, false);
    blast.lightIndex = lightIndex;
    blast.lightLife = 0.5;
    blast.seed = Math.random() * 100;
    blast.emitAcc = 0;
    blast.emitDuration = 0;
    blast.useAxis = false;
    blast.active = true;
  }

  /** 弹丸命中火花；colour 使用武器色 */
  impactBurst(position: THREE.Vector3, color: number, count: number, strength = 1): void {
    this.tmpColorA.setHex(color);
    this.tmpColorB.copy(this.tmpColorA).multiplyScalar(0.4);
    this.flash(position, color, 2.4 + count * 0.16 * strength, 0.16, 0, 2.0, 1.2);
    for (let i = 0; i < count; i += 1) {
      const dir = randomUnit();
      const speed = (45 + Math.random() * 260) * strength;
      this.sparks.spawn(
        position.x, position.y, position.z,
        dir[0] * speed, dir[1] * speed, dir[2] * speed,
        0.18 + Math.random() * 0.5,
        (0.25 + Math.random() * 0.9) * strength,
        -0.3,
        this.tmpColorA, this.tmpColorB,
        0.9, 0.9,
        Math.random() * Math.PI * 2, (Math.random() - 0.5) * 5,
      );
    }
    if (count > 20) {
      this.emitFire(position, 5 + count * 0.35, PALETTES.medium, Math.min(40, count >> 1), false);
    }
  }

  /** 鱼雷破甲后的定向喷流：火焰/等离子/碎片从船壳向外喷出 */
  impactJet(position: THREE.Vector3, direction: THREE.Vector3, length: number, tier: number): void {
    const palette = paletteFor(tier, false);
    const size = Math.max(12, length * 0.35);
    const axis = direction.clone().normalize();
    const helper = Math.abs(axis.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const right = new THREE.Vector3().crossVectors(axis, helper).normalize();
    const up = new THREE.Vector3().crossVectors(axis, right).normalize();
    const count = Math.min(300, 90 + tier * 14);
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const spread = Math.sqrt(Math.random()) * size * 0.45;
      const speed = size * (0.4 + Math.random() * 0.9);
      const sign = -1; // 朝船壳外侧（弹丸来向）喷
      const pick = Math.random();
      this.tmpColorA.copy(pick < 0.25 ? palette.plasma : palette.fire);
      this.tmpColorB.copy(palette.smoke);
      this.fire.spawn(
        position.x + right.x * Math.cos(angle) * spread + up.x * Math.sin(angle) * spread,
        position.y + right.y * Math.cos(angle) * spread + up.y * Math.sin(angle) * spread,
        position.z + right.z * Math.cos(angle) * spread + up.z * Math.sin(angle) * spread,
        axis.x * sign * speed + right.x * (Math.random() - 0.5) * size * 0.5,
        axis.y * sign * speed + right.y * (Math.random() - 0.5) * size * 0.5,
        axis.z * sign * speed + right.z * (Math.random() - 0.5) * size * 0.5,
        0.35 + Math.random() * 0.9,
        size * (0.05 + Math.random() * 0.09),
        2.2,
        this.tmpColorA, this.tmpColorB,
        0.2 + Math.random() * 0.14,
        0.8,
        Math.random() * Math.PI * 2,
        (Math.random() - 0.5) * 2,
      );
    }
    for (let i = 0; i < 40; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const spread = Math.sqrt(Math.random()) * size * 0.5;
      const speed = size * (1.2 + Math.random() * 1.8);
      this.tmpColorA.copy(palette.core).lerp(this.tmpWhite, Math.random() * 0.4);
      this.tmpColorB.copy(palette.fire);
      this.sparks.spawn(
        position.x + right.x * Math.cos(angle) * spread + up.x * Math.sin(angle) * spread,
        position.y + right.y * Math.cos(angle) * spread + up.y * Math.sin(angle) * spread,
        position.z + right.z * Math.cos(angle) * spread + up.z * Math.sin(angle) * spread,
        -axis.x * speed + right.x * (Math.random() - 0.5) * size,
        -axis.y * speed + right.y * (Math.random() - 0.5) * size,
        -axis.z * speed + right.z * (Math.random() - 0.5) * size,
        0.4 + Math.random() * 1.1,
        size * (0.004 + Math.random() * 0.01) + 0.3,
        -0.3,
        this.tmpColorA, this.tmpColorB,
        0.85,
        0.3,
        Math.random() * Math.PI * 2,
        (Math.random() - 0.5) * 4,
      );
    }
  }

  /** 通用炮口/碰撞闪光；peak 控制最大不透明度，避免最终爆炸全屏过曝 */
  flash(
    position: THREE.Vector3,
    color: number,
    size: number,
    life: number,
    delay = 0,
    grow = 1.8,
    power = 1.15,
    peak = 1,
  ): void {
    this.flashPool.spawn(position, color, size, life, delay, grow, power, peak);
  }

  /** 正常混合的火球底光：提供连续的橙色体积，避免只有散点粒子 */
  fireGlow(
    position: THREE.Vector3,
    color: number,
    size: number,
    life: number,
    delay = 0,
    grow = 1.3,
    power = 1.0,
    peak = 0.5,
  ): void {
    this.fireGlowPool.spawn(position, color, size, life, delay, grow, power, peak);
  }

  debris(position: THREE.Vector3, length: number, tier: number, count = 12, final = false): void {
    this.debrisField.spawn(position, length, tier, count, final);
  }

  private detonate(
    position: THREE.Vector3,
    length: number,
    tier: number,
    size: number,
    final: boolean,
    allowSecondary: boolean,
    impact: boolean,
    axis?: THREE.Vector3,
  ): void {
    const palette = paletteFor(tier, final);
    this.emitFire(position, size, palette, final ? 2600 : Math.min(220, 30 + tier * 12), final, axis);
    this.emitSparks(position, size, palette, final ? 160 : Math.min(80, 14 + tier * 6), 0xffffff);
    this.emitSmoke(position, size, palette, final ? 10 : Math.min(8, 2 + tier * 0.5), final);
    this.flash(position, palette.core.getHex(), size * (final ? 0.3 : 0.35), final ? 0.15 : 0.2, 0, 2.2, 1.5, final ? 0.55 : 0.75);
    this.flash(position, palette.fire.getHex(), size * (final ? 0.55 : 0.6), final ? 0.35 : 0.45, final ? 0.02 : 0, 1.8, 1.3, final ? 0.3 : 0.55);
    this.flash(position, palette.fire.getHex(), size * (final ? 0.8 : 0.75), final ? 2.2 : 1.0, 0.06, 1.3, 1.0, final ? 0.3 : 0.38);
    this.fireGlow(position, palette.fire.getHex(), size * (final ? 0.55 : 0.7), final ? 2.0 : 1.2, 0.03, 1.2, 1.0, final ? 0.38 : 0.55);
    if (impact && tier >= 4) {
      this.ringPool.spawn(position, size * 3.0, palette.shock.getHex(), 1.0, 0, 0.28, 0.04);
    }
    if (!impact && tier >= 7 && !final) {
      this.ringPool.spawn(position, size * 3.0, palette.plasma.getHex(), 1.2, 0.04, 0.2, -0.03);
    }
    if (tier >= 4 || final) {
      this.debrisField.spawn(position, length, tier, final ? 40 : impact ? 26 : Math.min(16, 3 + tier), final);
    }

    const lightIndex = this.acquireLight();
    if (lightIndex >= 0) {
      const light = this.lights[lightIndex];
      light.position.copy(position);
      light.color.copy(palette.light);
      light.distance = Math.max(4000, size * 16);
      light.intensity = Math.min(2.6e6, size * size * (final ? 4.2 : 3.0));
    }
    const life = final ? 3.0 : 1.6;
    let blast = this.blasts.find((item) => !item.active);
    if (!blast) {
      blast = {
        position: new THREE.Vector3(),
        age: 0,
        life,
        size,
        tier,
        final,
        palette,
        lightIndex,
        lightLife: final ? 2.4 : 1.1,
        seed: Math.random() * 100,
        emitAcc: 0,
        emitDuration: final ? 2.4 : 0.45,
        axis: new THREE.Vector3(0, 0, 1),
        useAxis: false,
        active: true,
      };
      this.blasts.push(blast);
    }
    blast.position.copy(position);
    blast.age = 0;
    blast.life = life;
    blast.size = size;
    blast.tier = tier;
    blast.final = final;
    blast.palette = palette;
    blast.lightIndex = lightIndex;
    blast.lightLife = final ? 2.4 : 1.1;
    blast.seed = Math.random() * 100;
    blast.emitAcc = 0;
    blast.emitDuration = final ? 2.4 : 0.45;
    blast.useAxis = !!axis;
    if (axis) blast.axis.copy(axis);
    blast.active = true;

    if (allowSecondary) {
      const secondaryCount = final ? 0 : tier >= 7 ? 2 : tier >= 4 ? 1 : 0;
      for (let i = 0; i < secondaryCount; i += 1) {
        const delay = 0.25 + i * 0.24 + Math.random() * 0.22;
        const offset = new THREE.Vector3(
          (Math.random() - 0.5) * size * 0.9,
          (Math.random() - 0.5) * size * 0.55,
          (Math.random() - 0.5) * size * 0.9,
        );
        this.schedule(position.clone().add(offset), length * 0.32, tier, delay, false, false);
      }
    }
  }

  private scheduleFinalStages(position: THREE.Vector3, length: number, tier: number, axis?: THREE.Vector3): void {
    const direction = axis ? axis.clone().normalize() : new THREE.Vector3(0, 0, 1);
    const helper = Math.abs(direction.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const right = new THREE.Vector3().crossVectors(direction, helper).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    const stages = [0.18, 0.34, 0.55, 0.82, 1.15, 1.55, 2.0];
    for (let i = 0; i < stages.length; i += 1) {
      const along = ((i / (stages.length - 1)) - 0.5) * length * 0.8;
      const offset = new THREE.Vector3()
        .addScaledVector(direction, along)
        .addScaledVector(right, (Math.random() - 0.5) * length * 0.1)
        .addScaledVector(up, (Math.random() - 0.5) * length * 0.08);
      this.schedule(
        position.clone().add(offset),
        length * (0.07 + Math.random() * 0.11),
        tier,
        stages[i],
        false,
        i < 3,
      );
    }
    // 最后补一轮残骸和冷等离子余烬
    this.schedule(position.clone(), length * 0.3, tier, 2.35, false, false);
  }

  /** 沿舰体轴线的高速等离子喷流，打破爆炸的完美球形 */
  private emitJet(
    position: THREE.Vector3,
    size: number,
    palette: ExplosionPalette,
    axis: THREE.Vector3,
    sign: number,
    count: number,
  ): void {
    const helper = Math.abs(axis.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const right = new THREE.Vector3().crossVectors(axis, helper).normalize();
    const up = new THREE.Vector3().crossVectors(axis, right).normalize();
    for (let i = 0; i < count; i += 1) {
      const lateral = (Math.random() - 0.5) * size * 0.12;
      const vertical = (Math.random() - 0.5) * size * 0.1;
      const start = Math.random() * size * 0.22;
      const speed = size * (0.08 + Math.random() * 0.28);
      const jitter = size * 0.03;
      const pick = Math.random();
      if (pick < 0.35) {
        this.tmpColorA.copy(palette.plasma);
        this.tmpColorB.copy(palette.fire);
      } else {
        this.tmpColorA.copy(palette.fire);
        this.tmpColorB.copy(palette.smoke);
      }
      this.fire.spawn(
        position.x + axis.x * sign * start + right.x * lateral + up.x * vertical,
        position.y + axis.y * sign * start + right.y * lateral + up.y * vertical,
        position.z + axis.z * sign * start + right.z * lateral + up.z * vertical,
        axis.x * sign * speed + right.x * jitter,
        axis.y * sign * speed + right.y * jitter,
        axis.z * sign * speed + right.z * jitter,
        0.9 + Math.random() * 1.8,
        size * (0.02 + Math.random() * 0.06),
        2.2,
        this.tmpColorA, this.tmpColorB,
        0.17 + Math.random() * 0.16,
        0.5,
        Math.random() * Math.PI * 2,
        (Math.random() - 0.5) * 1.2,
      );
    }
  }

  private schedule(position: THREE.Vector3, length: number, tier: number, delay: number, final: boolean, notify: boolean): void {
    const pending = this.pendingPool.pop() ?? {
      at: 0,
      position: new THREE.Vector3(),
      length: 0,
      tier: 0,
      final: false,
      notify: false,
      active: false,
    };
    pending.at = this.time + delay;
    pending.position.copy(position);
    pending.length = length;
    pending.tier = tier;
    pending.final = final;
    pending.notify = notify;
    pending.active = true;
    this.pending.push(pending);
  }

  private acquireLight(): number {
    for (let i = 0; i < this.lightFree.length; i += 1) {
      if (this.lightFree[i]) {
        this.lightFree[i] = false;
        return i;
      }
    }
    return -1;
  }

  private releaseLight(index: number): void {
    if (index < 0) return;
    this.lightFree[index] = true;
    this.lights[index].intensity = 0;
  }

  private emitFire(
    position: THREE.Vector3,
    size: number,
    palette: ExplosionPalette,
    count: number,
    final: boolean,
    axis?: THREE.Vector3,
  ): void {
    const capped = Math.min(count, 2700);
    let right: THREE.Vector3 | null = null;
    let up: THREE.Vector3 | null = null;
    if (axis && final) {
      const helper = Math.abs(axis.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      right = new THREE.Vector3().crossVectors(axis, helper).normalize();
      up = new THREE.Vector3().crossVectors(axis, right).normalize();
    }
    for (let i = 0; i < capped; i += 1) {
      const dir = randomUnit();
      const distance = Math.random() * size * 0.3;
      const speed = size * (0.03 + Math.random() * (final ? 0.15 : 0.1));
      // 终末爆炸沿舰体轴线拉长：初始位置使用椭球分布，速度叠加轴向分量
      let vx = dir[0] * speed;
      let vy = dir[1] * speed;
      let vz = dir[2] * speed;
      let ox: number;
      let oy: number;
      let oz: number;
      if (axis && final && right && up) {
        const along = (Math.random() * 2 - 1) * size * 0.5;
        const angle = Math.random() * Math.PI * 2;
        const radial = Math.sqrt(Math.random()) * size * 0.22;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        ox = position.x + axis.x * along + right.x * cos * radial + up.x * sin * radial;
        oy = position.y + axis.y * along + right.y * cos * radial + up.y * sin * radial;
        oz = position.z + axis.z * along + right.z * cos * radial + up.z * sin * radial;
        if (Math.random() < 0.55) {
          const sign = Math.random() < 0.5 ? -1 : 1;
          const axial = size * (0.03 + Math.random() * 0.14) * sign;
          vx += axis.x * axial;
          vy += axis.y * axial;
          vz += axis.z * axial;
        }
      } else {
        ox = position.x + dir[0] * distance;
        oy = position.y + dir[1] * distance;
        oz = position.z + dir[2] * distance;
      }
      const pick = Math.random();
      let start = this.tmpColorA;
      let end = this.tmpColorB;
      if (pick < 0.05) {
        start = palette.core;
        end = palette.fire;
      } else if (pick < 0.84) {
        start = palette.fire;
        end = this.hotEnd;
      } else {
        start = palette.plasma;
        end = this.hotEnd;
      }
      this.fire.spawn(
        ox, oy, oz,
        vx, vy, vz,
        0.9 + Math.random() * (final ? 2.5 : 1.4),
        size * (final ? (0.006 + Math.random() * 0.02) : (0.025 + Math.random() * 0.075)),
        final ? 1.6 : 2.0,
        start, end,
        final ? (0.08 + Math.random() * 0.1) : (0.16 + Math.random() * 0.16),
        1.1,
        Math.random() * Math.PI * 2,
        (Math.random() - 0.5) * 1.6,
      );
    }
    // 中心白热核：低速度、大尺寸、短寿命
    for (let i = 0; i < (final ? 2 : 2); i += 1) {
      this.tmpColorA.copy(palette.core);
      this.tmpColorB.copy(palette.plasma);
      this.fire.spawn(
        position.x, position.y, position.z,
        (Math.random() - 0.5) * size * 0.05,
        (Math.random() - 0.5) * size * 0.05,
        (Math.random() - 0.5) * size * 0.05,
        0.2 + Math.random() * 0.25,
        size * (0.04 + Math.random() * 0.05),
        2.4,
        this.tmpColorA, this.tmpColorB,
        0.22, 0.8,
        Math.random() * Math.PI * 2,
        0,
      );
    }
  }

  private emitSmoke(position: THREE.Vector3, size: number, palette: ExplosionPalette, count: number, final: boolean): void {
    const capped = Math.min(count, 20);
    for (let i = 0; i < capped; i += 1) {
      const dir = randomUnit();
      const distance = Math.random() * size * 0.32;
      const speed = size * (0.01 + Math.random() * 0.06);
      this.tmpColorA.copy(palette.smoke).multiplyScalar(0.9 + Math.random() * 0.7);
      this.tmpColorB.copy(palette.smoke).multiplyScalar(0.25);
      this.smoke.spawn(
        position.x + dir[0] * distance,
        position.y + dir[1] * distance,
        position.z + dir[2] * distance,
        dir[0] * speed,
        dir[1] * speed,
        dir[2] * speed,
        2.4 + Math.random() * (final ? 5.0 : 3.5),
        size * (0.04 + Math.random() * (final ? 0.08 : 0.08)),
        final ? 2.2 : 2.6,
        this.tmpColorA, this.tmpColorB,
        0.05 + Math.random() * 0.06,
        0.35,
        Math.random() * Math.PI * 2,
        (Math.random() - 0.5) * 0.25,
      );
    }
  }

  private emitSparks(position: THREE.Vector3, size: number, palette: ExplosionPalette, count: number, color: number): void {
    const capped = Math.min(count, 300);
    for (let i = 0; i < capped; i += 1) {
      const dir = randomUnit();
      const speed = size * (0.15 + Math.random() * 0.55);
      const pick = Math.random();
      this.tmpColorA.copy(pick < 0.5 ? palette.core : palette.plasma).lerp(this.tmpWhite, Math.random() * 0.4);
      this.tmpColorB.copy(palette.fire).multiplyScalar(0.35);
      this.sparks.spawn(
        position.x + (Math.random() - 0.5) * size * 0.12,
        position.y + (Math.random() - 0.5) * size * 0.12,
        position.z + (Math.random() - 0.5) * size * 0.12,
        dir[0] * speed,
        dir[1] * speed,
        dir[2] * speed,
        0.3 + Math.random() * 1.4,
        size * (0.003 + Math.random() * 0.012) + 0.3,
        -0.2,
        this.tmpColorA, this.tmpColorB,
        0.95,
        0.22,
        Math.random() * Math.PI * 2,
        (Math.random() - 0.5) * 6,
      );
    }
    if (color !== 0xffffff) {
      // 武器颜色余烬，让命中点和爆炸主色一致
      this.tmpColorA.setHex(color);
      this.tmpColorB.copy(this.tmpColorA).multiplyScalar(0.2);
      for (let i = 0; i < Math.min(24, count >> 2); i += 1) {
        const dir = randomUnit();
        const speed = size * (0.15 + Math.random() * 0.4);
        this.sparks.spawn(
          position.x, position.y, position.z,
          dir[0] * speed, dir[1] * speed, dir[2] * speed,
          0.4 + Math.random() * 0.8,
          size * 0.006 + 0.4,
          -0.2, this.tmpColorA, this.tmpColorB,
          0.8, 0.25,
          Math.random() * Math.PI * 2, 0,
        );
      }
    }
  }

  /** 持续补充火球内部的热斑，避免一次爆发后很快变暗 */
  private emitEmber(blast: Blast): void {
    const size = blast.size;
    const dir = randomUnit();
    const distance = Math.random() * size * 0.32;
    const speed = size * (0.02 + Math.random() * 0.12);
    let ox = blast.position.x + dir[0] * distance;
    let oy = blast.position.y + dir[1] * distance;
    let oz = blast.position.z + dir[2] * distance;
    if (blast.useAxis) {
      const along = (Math.random() * 2 - 1) * size * 0.38;
      ox += blast.axis.x * along;
      oy += blast.axis.y * along;
      oz += blast.axis.z * along;
    }
    this.tmpColorA.copy(blast.palette.fire).lerp(this.tmpWhite, Math.random() * 0.22);
    this.tmpColorB.copy(this.hotEnd);
    this.fire.spawn(
      ox, oy, oz,
      dir[0] * speed, dir[1] * speed, dir[2] * speed,
      0.9 + Math.random() * 1.8,
      size * (0.006 + Math.random() * 0.018),
      1.7,
      this.tmpColorA, this.tmpColorB,
      0.1 + Math.random() * 0.1,
      1.1,
      Math.random() * Math.PI * 2,
      (Math.random() - 0.5) * 1.2,
    );
  }

  update(dt: number): void {
    this.time += dt;
    for (let i = this.pending.length - 1; i >= 0; i -= 1) {
      const item = this.pending[i];
      if (!item.active) continue;
      if (item.at > this.time) continue;
      item.active = false;
      this.pending.splice(i, 1);
      this.detonate(
        item.position,
        item.length,
        item.tier,
        Math.max(5, item.length * (item.final ? 1.3 : 0.55)),
        item.final,
        false,
        false,
      );
      if (item.notify) {
        this.options.onSecondary?.(item.position, Math.max(5, item.length * 0.55), item.tier);
      }
      this.pendingPool.push(item);
    }

    for (const blast of this.blasts) {
      if (!blast.active) continue;
      blast.age += dt;
      if (blast.lightIndex >= 0) {
        const light = this.lights[blast.lightIndex];
        const k = Math.min(1, blast.age / blast.lightLife);
        const flicker = 0.82 + Math.sin(this.time * 57 + blast.seed) * 0.1 + Math.random() * 0.08;
        light.intensity = Math.max(0, Math.min(2.8e6, blast.size * blast.size * (blast.final ? 4.2 : 3.0)) * Math.pow(1 - k, 2.0) * flicker);
        if (blast.age >= blast.lightLife) {
          light.intensity = 0;
          this.releaseLight(blast.lightIndex);
          blast.lightIndex = -1;
        }
      }
      if (blast.age < blast.emitDuration) {
        const rate = blast.final ? 300 : 70;
        blast.emitAcc += dt * rate;
        let budget = 0;
        while (blast.emitAcc >= 1 && budget < 16) {
          blast.emitAcc -= 1;
          budget += 1;
          this.emitEmber(blast);
        }
      }
      if (blast.age >= blast.life) blast.active = false;
    }

    this.flashPool.update(dt);
    this.fireGlowPool.update(dt);
    this.ringPool.update(dt);
    this.debrisField.update(dt);
    this.fire.update(dt);
    this.smoke.update(dt);
    this.sparks.update(dt);
  }

  get stats(): ExplosionVfxStats {
    return {
      blasts: this.blasts.filter((blast) => blast.active).length,
      flashes: this.flashPool.activeCount,
      rings: this.ringPool.activeCount,
      debris: this.debrisField.count,
      fireParticles: this.fire.liveCount,
      smokeParticles: this.smoke.liveCount,
      sparkParticles: this.sparks.liveCount,
    };
  }

  dispose(): void {
    this.flashPool.dispose();
    this.fireGlowPool.dispose();
    this.ringPool.dispose();
    this.debrisField.dispose();
    this.fire.dispose();
    this.smoke.dispose();
    this.sparks.dispose();
    for (const light of this.lights) this.scene.remove(light);
    this.lights.length = 0;
    this.lightFree.length = 0;
    this.blasts.length = 0;
    this.pending.length = 0;
  }
}
