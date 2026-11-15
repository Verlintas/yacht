import * as THREE from 'three';
import type { ShipSpec } from './ships';
import type { ShipCollision } from './ship';

export interface DamageParts {
  engine: number;
  weapon: number;
  cockpit: number;
}

const shieldGeometry = new THREE.SphereGeometry(1, 32, 24);

let smokeTexture: THREE.CanvasTexture | null = null;
let fireTexture: THREE.CanvasTexture | null = null;
let sparkTexture: THREE.CanvasTexture | null = null;

function makeSmokeTexture(): THREE.CanvasTexture {
  if (smokeTexture) return smokeTexture;
  const s = 128;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d')!;
  for (let i = 0; i < 18; i += 1) {
    const x = s / 2 + (Math.random() - 0.5) * s * 0.5;
    const y = s / 2 + (Math.random() - 0.5) * s * 0.5;
    const r = s * (0.1 + Math.random() * 0.22);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.16)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  smokeTexture = new THREE.CanvasTexture(canvas);
  return smokeTexture;
}

function makeFireTexture(): THREE.CanvasTexture {
  if (fireTexture) return fireTexture;
  const s = 128;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,235,1)');
  g.addColorStop(0.2, 'rgba(255,190,90,0.85)');
  g.addColorStop(0.55, 'rgba(255,100,25,0.4)');
  g.addColorStop(1, 'rgba(120,20,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  fireTexture = new THREE.CanvasTexture(canvas);
  return fireTexture;
}

function makeSparkTexture(): THREE.CanvasTexture {
  if (sparkTexture) return sparkTexture;
  const s = 64;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(180,240,255,0.7)');
  g.addColorStop(1, 'rgba(80,180,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  sparkTexture = new THREE.CanvasTexture(canvas);
  return sparkTexture;
}

interface SmokePuff {
  sprite: THREE.Sprite;
  origin: THREE.Vector3;
  drift: THREE.Vector3;
  age: number;
  life: number;
  scale: number;
  part: keyof DamageParts | 'hull';
}

interface FireSpot {
  sprite: THREE.Sprite;
  origin: THREE.Vector3;
  phase: number;
  scale: number;
  part: keyof DamageParts | 'hull';
}

/**
 * 舰体损伤可视化：
 *  - 护盾泡 + 命中涟漪
 *  - 低结构时从引擎/武器/驾驶舱冒烟、起火
 *  - 结构/护盾耗尽时逐渐消失
 */
export class DamageVisuals {
  private bubble: THREE.Mesh;
  private bubbleMat: THREE.ShaderMaterial;
  private hitFlash = 0;
  private hits: Array<{ sprite: THREE.Sprite; age: number; life: number }> = [];
  private smoke: SmokePuff[] = [];
  private fires: FireSpot[] = [];
  private anchors: {
    engines: THREE.Vector3[];
    weapons: THREE.Vector3[];
    cockpit: THREE.Vector3;
  };
  private time = 0;
  private bubbleVisible = false;
  private enabled = true;
  private capital: boolean;
  private breakTimer = 0;
  private bubbleBaseScale = new THREE.Vector3(1, 1, 1);

  constructor(
    private group: THREE.Group,
    private length: number,
    spec: ShipSpec,
    collision?: ShipCollision,
  ) {
    this.capital = spec.tier >= 5 || length > 240;
    this.anchors = {
      engines: spec.nozzles.filter((nozzle) => nozzle.role === 'main').map((nozzle) => new THREE.Vector3(...nozzle.pos)),
      weapons: spec.weapons.map((weapon) => new THREE.Vector3(...weapon.pos)),
      cockpit: new THREE.Vector3(...(spec.cockpits[0] ?? [0, 0, 0])),
    };
    if (this.anchors.engines.length === 0) this.anchors.engines.push(new THREE.Vector3(0, 0, length * 0.4));

    this.bubbleMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0x66d8ff) },
        uOpacity: { value: 0.35 },
        uHit: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vNormalW;
        varying vec3 vWorld;
        void main() {
          vNormalW = normalize(mat3(modelMatrix) * normal);
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uHit;
        uniform float uTime;
        varying vec3 vNormalW;
        varying vec3 vWorld;
        void main() {
          vec3 V = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - abs(dot(normalize(vNormalW), V)), 2.4);
          float scan = 0.5 + 0.5 * sin(vWorld.y * 0.06 + uTime * 2.2);
          float alpha = (fres * 0.38 + 0.035 + uHit * 0.55 + scan * 0.015) * uOpacity;
          vec3 color = uColor * (fres * 1.35 + uHit * 2.4 + 0.15);
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    if (collision) {
      // 护盾壳直接由舰体三角面生成：沿顶点法线向外偏移，而不是套一个球/椭球
      const shieldGeo = collision.geometry.clone();
      shieldGeo.computeVertexNormals();
      const position = shieldGeo.attributes.position as THREE.BufferAttribute;
      const normal = shieldGeo.attributes.normal as THREE.BufferAttribute;
      const offset = Math.max(0.05, length * 0.0015);
      for (let i = 0; i < position.count; i += 1) {
        position.setXYZ(
          i,
          position.getX(i) + normal.getX(i) * offset,
          position.getY(i) + normal.getY(i) * offset,
          position.getZ(i) + normal.getZ(i) * offset,
        );
      }
      position.needsUpdate = true;
      shieldGeo.computeBoundingSphere();
      this.bubble = new THREE.Mesh(shieldGeo, this.bubbleMat);
      this.bubbleBaseScale.setScalar(1);
      this.bubble.position.set(0, 0, 0);
    } else {
      // 程序化/无碰撞体时的回退：椭球护盾
      this.bubble = new THREE.Mesh(shieldGeometry, this.bubbleMat);
      const hullBox = new THREE.Box3();
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.userData.shipHull) hullBox.expandByObject(obj);
      });
      if (hullBox.isEmpty()) hullBox.setFromObject(group);
      const hullSize = hullBox.getSize(new THREE.Vector3());
      const hullCenter = hullBox.getCenter(new THREE.Vector3());
      this.bubbleBaseScale.set(
        Math.max(2, hullSize.x * 0.54),
        Math.max(2, hullSize.y * 0.58),
        Math.max(2, hullSize.z * 0.52),
      );
      this.bubble.position.copy(hullCenter);
    }
    this.bubble.scale.copy(this.bubbleBaseScale);
    this.bubble.renderOrder = 2;
    this.bubble.frustumCulled = false;
    this.bubble.visible = false;
    group.add(this.bubble);

    const smokeTex = makeSmokeTexture();
    const fireTex = makeFireTexture();
    const parts: Array<keyof DamageParts | 'hull'> = ['engine', 'engine', 'engine', 'weapon', 'weapon', 'cockpit', 'hull'];

    for (let i = 0; i < 12; i += 1) {
      const part = parts[i % parts.length];
      const origin = this.pickAnchor(part);
      const material = new THREE.SpriteMaterial({
        map: smokeTex,
        color: 0x5b5f63,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.position.copy(origin);
      sprite.scale.setScalar(length * 0.075);
      sprite.visible = false;
      group.add(sprite);
      this.smoke.push({
        sprite,
        origin,
        drift: new THREE.Vector3((Math.random() - 0.5) * length * 0.02, length * 0.012, (Math.random() - 0.5) * length * 0.02),
        age: Math.random() * 3,
        life: 2.2 + Math.random() * 1.8,
        scale: length * (0.045 + Math.random() * 0.05),
        part,
      });
    }

    for (let i = 0; i < 8; i += 1) {
      const part = parts[i % parts.length];
      const origin = this.pickAnchor(part);
      const material = new THREE.SpriteMaterial({
        map: fireTex,
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.position.copy(origin);
      sprite.scale.setScalar(length * 0.035);
      sprite.visible = false;
      group.add(sprite);
      this.fires.push({
        sprite,
        origin,
        phase: Math.random() * Math.PI * 2,
        scale: length * (0.022 + Math.random() * 0.025),
        part,
      });
    }
  }

  private pickAnchor(part: keyof DamageParts | 'hull'): THREE.Vector3 {
    if (part === 'engine' && this.anchors.engines.length > 0) {
      const base = this.anchors.engines[Math.floor(Math.random() * this.anchors.engines.length)];
      return base.clone().add(new THREE.Vector3((Math.random() - 0.5) * this.length * 0.03, (Math.random() - 0.5) * this.length * 0.02, (Math.random() - 0.5) * this.length * 0.05));
    }
    if (part === 'weapon' && this.anchors.weapons.length > 0) {
      const base = this.anchors.weapons[Math.floor(Math.random() * this.anchors.weapons.length)];
      return base.clone().add(new THREE.Vector3((Math.random() - 0.5) * this.length * 0.04, (Math.random() - 0.5) * this.length * 0.02, (Math.random() - 0.5) * this.length * 0.04));
    }
    if (part === 'cockpit') {
      return this.anchors.cockpit.clone().add(new THREE.Vector3((Math.random() - 0.5) * this.length * 0.03, 0, (Math.random() - 0.5) * this.length * 0.03));
    }
    return this.anchors.weapons[Math.floor(Math.random() * Math.max(1, this.anchors.weapons.length))]?.clone()
      ?? new THREE.Vector3((Math.random() - 0.5) * this.length * 0.25, (Math.random() - 0.5) * this.length * 0.08, (Math.random() - 0.5) * this.length * 0.35);
  }

  /** 护盾被打破：只在大舰上短暂显示护盾泡，然后消失 */
  shieldBreak(): void {
    this.breakTimer = 1.1;
    this.bubble.visible = true;
  }

  /** 护盾命中：单次命中闪光；小飞船不显示护盾泡 */
  shieldHit(localPoint: THREE.Vector3): void {
    this.hitFlash = 1;
    this.breakTimer = Math.max(this.breakTimer, this.capital ? 0.55 : 0.28);
    this.bubble.visible = true;
    const material = new THREE.SpriteMaterial({
      map: makeSparkTexture(),
      color: 0x8fe8ff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(localPoint);
    sprite.scale.setScalar(this.length * 0.05);
    this.group.add(sprite);
    this.hits.push({ sprite, age: 0, life: 0.45 });
  }

  /** 结构命中：火花和舰体火光 */
  hullHit(localPoint: THREE.Vector3): void {
    const material = new THREE.SpriteMaterial({
      map: makeFireTexture(),
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(localPoint);
    sprite.scale.setScalar(this.length * 0.04);
    this.group.add(sprite);
    this.hits.push({ sprite, age: 0, life: 0.3 });
    this.hitFlash = Math.max(this.hitFlash, 0.55);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.bubble.visible = false;
      for (const puff of this.smoke) puff.sprite.visible = false;
      for (const fire of this.fires) fire.sprite.visible = false;
      for (const hit of this.hits) hit.sprite.visible = false;
    }
  }

  setBubbleVisible(visible: boolean): void {
    this.bubbleVisible = visible;
    this.bubble.visible = visible;
  }

  update(dt: number, hullRatio: number, shieldRatio: number, parts?: DamageParts): void {
    if (!this.enabled) return;
    this.time += dt;
    const hullDamage = THREE.MathUtils.clamp(1 - hullRatio, 0, 1);
    const shieldDamage = THREE.MathUtils.clamp(1 - shieldRatio, 0, 1);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 3.5);
    this.bubbleMat.uniforms.uHit.value = this.hitFlash;
    this.bubbleMat.uniforms.uTime.value = this.time;
    if (this.breakTimer > 0) {
      this.breakTimer = Math.max(0, this.breakTimer - dt);
      const k = this.breakTimer / 1.1;
      this.bubbleMat.uniforms.uOpacity.value = 0.6 * k;
      this.bubble.scale.copy(this.bubbleBaseScale).multiplyScalar(1 + (1 - k) * 0.16);
      this.bubble.visible = true;
    } else {
      this.bubbleMat.uniforms.uOpacity.value = 0;
      this.bubble.visible = false;
    }
    void shieldDamage;

    const partDamage = (part: keyof DamageParts | 'hull'): number => {
      if (part === 'hull' || !parts) return hullDamage;
      return THREE.MathUtils.clamp(1 - parts[part], 0, 1);
    };

    for (const puff of this.smoke) {
      if (!this.capital) {
        puff.sprite.visible = false;
        continue;
      }
      const damage = partDamage(puff.part);
      puff.age += dt;
      if (puff.age > puff.life) {
        puff.age = 0;
        puff.origin.copy(this.pickAnchor(puff.part));
      }
      const fade = Math.sin((puff.age / puff.life) * Math.PI);
      const active = damage > 0.18;
      puff.sprite.visible = active;
      puff.sprite.position.copy(puff.origin).addScaledVector(puff.drift, puff.age);
      puff.sprite.position.y += puff.age * this.length * 0.018;
      puff.sprite.scale.setScalar(puff.scale * (0.7 + puff.age * 0.5));
      (puff.sprite.material as THREE.SpriteMaterial).opacity = active ? damage * fade * 0.32 : 0;
    }

    for (const fire of this.fires) {
      if (!this.capital) {
        fire.sprite.visible = false;
        continue;
      }
      const damage = partDamage(fire.part);
      const flicker = 0.72 + Math.sin(this.time * 17 + fire.phase) * 0.16 + Math.random() * 0.12;
      const active = damage > 0.42;
      fire.sprite.visible = active;
      fire.sprite.position.copy(fire.origin);
      fire.sprite.position.y += Math.sin(this.time * 2 + fire.phase) * this.length * 0.006;
      fire.sprite.scale.setScalar(fire.scale * (0.8 + damage * 0.7) * flicker);
      (fire.sprite.material as THREE.SpriteMaterial).opacity = active ? damage * 0.75 * flicker : 0;
    }

    for (let i = this.hits.length - 1; i >= 0; i -= 1) {
      const hit = this.hits[i];
      hit.age += dt;
      const k = hit.age / hit.life;
      hit.sprite.scale.multiplyScalar(1 + dt * 5);
      (hit.sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - k);
      if (hit.age >= hit.life) {
        this.group.remove(hit.sprite);
        this.hits.splice(i, 1);
      }
    }
  }

  dispose(): void {
    this.group.remove(this.bubble);
    this.bubbleMat.dispose();
    for (const puff of this.smoke) {
      this.group.remove(puff.sprite);
      (puff.sprite.material as THREE.Material).dispose();
    }
    for (const fire of this.fires) {
      this.group.remove(fire.sprite);
      (fire.sprite.material as THREE.Material).dispose();
    }
    for (const hit of this.hits) {
      this.group.remove(hit.sprite);
      (hit.sprite.material as THREE.Material).dispose();
    }
    this.smoke = [];
    this.fires = [];
    this.hits = [];
  }
}
