import * as THREE from 'three';
import { getShip, type ShipSpec, type WeaponMount, type WeaponType } from './ships';
import { LocalPlume } from './trails';
import { DamageVisuals } from './damage';

interface Projectile {
  mesh: THREE.Mesh;
  glow: THREE.Sprite;
  velocity: THREE.Vector3;
  damage: number;
  life: number;
  owner: 'player' | 'npc';
  color: THREE.Color;
  speed: number;
  weaponType: WeaponType;
  homing?: () => THREE.Vector3 | null;
}

interface FlashFx {
  sprite: THREE.Sprite;
  age: number;
  life: number;
}

interface DeathEvent {
  at: number;
  kind: 'engine' | 'weapon' | 'hull' | 'final';
  color: number;
  position: THREE.Vector3;
  local?: THREE.Vector3;
  size: number;
}

interface DeathSequence {
  npc: Npc;
  time: number;
  duration: number;
  events: DeathEvent[];
  index: number;
}

interface ShockwaveFx {
  sprite: THREE.Sprite;
  age: number;
  life: number;
  size: number;
}

export type Faction = 'neutral' | 'hostile';
type NpcRole = 'flagship' | 'escort';

interface Npc {
  id: number;
  group: THREE.Group;
  spec: ShipSpec;
  fleetId: number;
  role: NpcRole;
  faction: Faction;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  shieldRegen: number;
  lastHit: number;
  weapon: WeaponMount;
  attackPhase: 'approach' | 'extend';
  phaseTimer: number;
  breakOff: number;
  runDirection: THREE.Vector3;
  velocity: THREE.Vector3;
  cooldown: number;
  scanCooldown: number;
  radius: number;
  alive: boolean;
  /** 已经向玩家开火 / 舰队被激怒 */
  hostile: boolean;
  /** 正在追击玩家 */
  alerted: boolean;
  formation: THREE.Vector3;
  trail: LocalPlume;
  damage: DamageVisuals;
}

interface ExplosionFx {
  position: THREE.Vector3;
  age: number;
  life: number;
  size: number;
  core: THREE.Sprite;
  outer: THREE.Sprite;
  flash: THREE.Sprite;
  smoke: THREE.Sprite;
  light: THREE.PointLight;
  tier: number;
  secondaryTimer: number;
  secondaryCount: number;
  color: THREE.Color;
}

interface Debris {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  maxLife: number;
  hot: boolean;
}

interface Fleet {
  id: number;
  faction: Faction;
  ships: Npc[];
  flagship: Npc;
  waypoint: THREE.Vector3;
  waypointTimer: number;
  alerted: boolean;
  engaged: boolean;
  cruise: number;
  tier: number;
}

export interface NpcTemplate {
  group: THREE.Group;
  spec: ShipSpec;
}

export interface FleetIntel {
  faction: Faction;
  flagship: string;
  code: string;
  tier: number;
  status: '主力' | '准主力' | '超主力' | '编队';
  escorts: number;
  heavyEscorts: number;
  distance: number;
  engaged: boolean;
}

export interface CombatEvents {
  onPlayerDamage: (damage: number, position?: THREE.Vector3) => void;
  onNpcKilled: (position: THREE.Vector3) => void;
  onExplosion?: (position: THREE.Vector3, size: number) => void;
  onImpact?: (type: WeaponType, position: THREE.Vector3, owner: 'player' | 'npc') => void;
}

const MAX_PROJECTILES = 260;
const SCAN_RANGE = 35000;

const ENEMY_FLAGSHIPS = ['freighter', 'commander', 'commander', 'battleship'] as const;
const NEUTRAL_FLAGSHIPS = ['freighter', 'commander', 'freighter'] as const;

export class Combat {
  private projectiles: Projectile[] = [];
  private pool: THREE.Mesh[] = [];
  private npcs: Npc[] = [];
  private fleets: Fleet[] = [];
  private templates = new Map<string, NpcTemplate>();
  private sparks: THREE.Points | null = null;
  private sparkLife = 0;
  private sparkVelocity: Float32Array | null = null;
  private scene: THREE.Scene;
  private events: CombatEvents;
  private laserGeo: THREE.CylinderGeometry;
  private laserMat: THREE.MeshBasicMaterial;
  private glowTexture: THREE.CanvasTexture;
  private ringTexture!: THREE.CanvasTexture;
  private fireTexture!: THREE.CanvasTexture;
  private smokeTexture!: THREE.CanvasTexture;
  private debrisTexture!: THREE.CanvasTexture;
  private glowPool: THREE.Sprite[] = [];
  private explosions: ExplosionFx[] = [];
  private debris: Debris[] = [];
  private flashes: FlashFx[] = [];
  private deaths: DeathSequence[] = [];
  private shockwaves: ShockwaveFx[] = [];
  private npcGeo: THREE.BufferGeometry;
  private npcSeq = 0;
  private fleetSeq = 0;
  private time = 0;

  constructor(scene: THREE.Scene, events: CombatEvents) {
    this.scene = scene;
    this.events = events;
    this.laserGeo = new THREE.CylinderGeometry(0.16, 0.7, 1, 6, 1, true);
    this.laserGeo.translate(0, -0.5, 0);
    this.laserGeo.rotateX(Math.PI / 2);
    this.laserMat = new THREE.MeshBasicMaterial({
      color: 0x9fe8ff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.glowTexture = (() => {
      const s = 128;
      const canvas = document.createElement('canvas');
      canvas.width = s;
      canvas.height = s;
      const ctx = canvas.getContext('2d')!;
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.28, 'rgba(255,255,255,0.72)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
      return new THREE.CanvasTexture(canvas);
    })();

    this.ringTexture = (() => {
      const s = 256;
      const canvas = document.createElement('canvas');
      canvas.width = s;
      canvas.height = s;
      const ctx = canvas.getContext('2d')!;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 3.5;
      ctx.shadowColor = 'rgba(255,255,255,0.7)';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s * 0.34, 0, Math.PI * 2);
      ctx.stroke();
      return new THREE.CanvasTexture(canvas);
    })();

    this.fireTexture = (() => {
      const s = 256;
      const canvas = document.createElement('canvas');
      canvas.width = s;
      canvas.height = s;
      const ctx = canvas.getContext('2d')!;
      for (let i = 0; i < 34; i += 1) {
        const x = s / 2 + (Math.random() - 0.5) * s * 0.52;
        const y = s / 2 + (Math.random() - 0.5) * s * 0.52;
        const r = s * (0.07 + Math.random() * 0.18);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        const palette = [
          ['rgba(255,255,245,0.98)', 'rgba(255,210,120,0)'],
          ['rgba(255,220,140,0.95)', 'rgba(255,120,30,0)'],
          ['rgba(255,160,60,0.9)', 'rgba(255,70,10,0)'],
          ['rgba(255,110,30,0.8)', 'rgba(180,40,8,0)'],
        ][Math.floor(Math.random() * 4)];
        g.addColorStop(0, palette[0]);
        g.addColorStop(1, palette[1]);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'destination-in';
      const mask = ctx.createRadialGradient(s / 2, s / 2, s * 0.05, s / 2, s / 2, s * 0.5);
      mask.addColorStop(0, 'rgba(255,255,255,1)');
      mask.addColorStop(0.55, 'rgba(255,255,255,0.85)');
      mask.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = mask;
      ctx.fillRect(0, 0, s, s);
      return new THREE.CanvasTexture(canvas);
    })();

    this.smokeTexture = (() => {
      const s = 128;
      const canvas = document.createElement('canvas');
      canvas.width = s;
      canvas.height = s;
      const ctx = canvas.getContext('2d')!;
      for (let i = 0; i < 16; i += 1) {
        const x = s / 2 + (Math.random() - 0.5) * s * 0.4;
        const y = s / 2 + (Math.random() - 0.5) * s * 0.4;
        const r = s * (0.12 + Math.random() * 0.22);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(255,255,255,0.18)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      return new THREE.CanvasTexture(canvas);
    })();

    this.debrisTexture = (() => {
      const s = 128;
      const canvas = document.createElement('canvas');
      canvas.width = s;
      canvas.height = s;
      const ctx = canvas.getContext('2d')!;
      const base = ctx.createLinearGradient(0, 0, s, s);
      base.addColorStop(0, '#5d6670');
      base.addColorStop(0.55, '#3c444d');
      base.addColorStop(1, '#252b32');
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = 'rgba(8, 12, 16, 0.7)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i += 1) {
        const y = 8 + i * 24 + Math.random() * 4;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(s, y + (Math.random() - 0.5) * 6);
        ctx.stroke();
      }
      for (let i = 0; i < 4; i += 1) {
        const x = 8 + i * 30 + Math.random() * 4;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + (Math.random() - 0.5) * 5, s);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(18, 22, 26, 0.8)';
      for (let i = 0; i < 70; i += 1) {
        ctx.fillRect(Math.random() * s, Math.random() * s, 1.4, 1.4);
      }
      ctx.save();
      ctx.translate(s * 0.66, s * 0.75);
      ctx.rotate(-0.35);
      ctx.fillStyle = 'rgba(190, 150, 52, 0.55)';
      for (let i = 0; i < 5; i += 1) ctx.fillRect(i * 14, 0, 7, 18);
      ctx.restore();
      return new THREE.CanvasTexture(canvas);
    })();

    // 没有模板时的低模替身
    this.npcGeo = new THREE.ConeGeometry(6, 18, 6);
    this.npcGeo.rotateX(-Math.PI / 2);
  }

  setTemplates(templates: Map<string, NpcTemplate>): void {
    this.templates = templates;
  }

  private flagshipFor(faction: Faction): ShipSpec {
    const pool = faction === 'hostile' ? ENEMY_FLAGSHIPS : NEUTRAL_FLAGSHIPS;
    return getShip(pool[Math.floor(Math.random() * pool.length)]);
  }

  private escortPlan(tier: number): string[] {
    if (tier >= 7) return ['bomber', 'bomber', 'bomber', 'thunderbolt', 'f008', 'thunderbolt'];
    if (tier >= 6) return ['bomber', 'bomber', 'thunderbolt', 'f008', 'thunderbolt'];
    if (tier >= 5) return ['bomber', 'thunderbolt', 'f008'];
    return ['thunderbolt', 'f008'];
  }

  /** 生成一支舰队：主力居中，护卫围绕 */
  spawnFleet(faction: Faction, origin: THREE.Vector3): number {
    const fleetId = ++this.fleetSeq;
    const flagshipSpec = this.flagshipFor(faction);
    const flagship = this.createNpc(flagshipSpec, origin, faction, 'flagship', fleetId, new THREE.Vector3());

    const plan = this.escortPlan(flagshipSpec.tier);
    const ring = flagshipSpec.length * 0.55 + 220;
    const ships: Npc[] = [flagship];
    plan.forEach((specId, index) => {
      const angle = (index / plan.length) * Math.PI * 2 + Math.random() * 0.2;
      const radius = ring * (0.75 + (index % 3) * 0.16);
      const offset = new THREE.Vector3(
        Math.cos(angle) * radius,
        (index % 2 === 0 ? 1 : -1) * radius * (0.12 + Math.random() * 0.16),
        Math.sin(angle) * radius,
      );
      const escort = this.createNpc(
        getShip(specId),
        origin.clone().add(offset),
        faction,
        'escort',
        fleetId,
        offset,
      );
      ships.push(escort);
    });

    const cruise = flagshipSpec.tier >= 6 ? 1600 : flagshipSpec.tier >= 5 ? 1900 : 2400;
    this.fleets.push({
      id: fleetId,
      faction,
      ships,
      flagship,
      waypoint: this.pickWaypoint(origin),
      waypointTimer: 45 + Math.random() * 60,
      alerted: false,
      engaged: false,
      cruise,
      tier: flagshipSpec.tier,
    });

    return fleetId;
  }

  /** 兼容旧接口：在附近生成一架敌对战斗机 */
  spawnNpc(origin: THREE.Vector3, scale = 1): void {
    const spec = getShip('thunderbolt');
    const npc = this.createNpc(spec, origin, 'hostile', 'escort', -1, new THREE.Vector3());
    npc.hostile = true;
    npc.alerted = true;
    npc.group.scale.setScalar(scale);
  }

  private createNpc(
    spec: ShipSpec,
    position: THREE.Vector3,
    faction: Faction,
    role: NpcRole,
    fleetId: number,
    formation: THREE.Vector3,
  ): Npc {
    const template = this.templates.get(spec.id);
    let group: THREE.Group;

    if (template) {
      group = template.group.clone(true);
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.frustumCulled = true;
        }
        if (obj instanceof THREE.Sprite) {
          if (obj.userData.role === 'retro') obj.visible = false;
        }
      });
    } else {
      group = new THREE.Group();
      const scale = Math.max(0.5, spec.length / 25);
      const hull = new THREE.Mesh(
        this.npcGeo,
        new THREE.MeshStandardMaterial({
          color: faction === 'hostile' ? 0x5a2028 : 0x2c4b58,
          emissive: new THREE.Color(faction === 'hostile' ? 0x3a0a10 : 0x0e2530),
          emissiveIntensity: 0.6,
          roughness: 0.5,
          metalness: 0.7,
        }),
      );
      hull.scale.setScalar(scale);
      group.add(hull);
    }

    // 阵营识别灯
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(1.4, spec.length * 0.018), 8, 6),
      new THREE.MeshBasicMaterial({
        color: faction === 'hostile' ? 0xff5c45 : 0x6fc8d8,
        transparent: true,
        opacity: 0.85,
      }),
    );
    beacon.position.set(0, spec.length * 0.08, 0);
    group.add(beacon);

    group.position.copy(position);
    this.scene.add(group);
    const mainNozzles = spec.nozzles.filter((nozzle) => nozzle.role === 'main');
    const trail = new LocalPlume(
      group,
      mainNozzles.length > 0 ? mainNozzles : spec.nozzles.slice(0, 2),
      spec.length,
      spec.exhaust,
    );
    const damage = new DamageVisuals(group, spec.length, spec);

    const fallbackWeapon: WeaponMount = {
      id: 'fallback',
      type: 'cannon',
      pos: [0, 0, 0],
      damage: 20,
      rate: 1,
      speed: 3200,
      range: 2600,
      spread: 0.004,
      color: 0xffaa66,
    };
    const weapon = spec.weapons.length > 0
      ? spec.weapons.reduce((best, item) => (item.damage * item.rate > best.damage * best.rate ? item : best))
      : fallbackWeapon;

    const npc: Npc = {
      id: ++this.npcSeq,
      group,
      spec,
      fleetId,
      role,
      faction,
      hp: spec.hull,
      maxHp: spec.hull,
      shield: spec.shield,
      maxShield: spec.shield,
      shieldRegen: spec.shieldRegen,
      lastHit: -99,
      weapon,
      attackPhase: 'approach',
      phaseTimer: 0,
      breakOff: spec.tier >= 4 ? 1500 : 850 + (this.npcSeq % 3) * 220,
      runDirection: new THREE.Vector3(0, 0, 1),
      velocity: new THREE.Vector3(),
      cooldown: Math.random() * 2,
      scanCooldown: 1 + Math.random() * 2,
      radius: Math.max(12, spec.length * 0.42),
      alive: true,
      hostile: faction === 'hostile',
      alerted: false,
      formation,
      trail,
      damage,
    };
    this.npcs.push(npc);
    return npc;
  }

  private pickWaypoint(from: THREE.Vector3): THREE.Vector3 {
    const angle = Math.random() * Math.PI * 2;
    const radius = 35000 + Math.random() * 120000;
    return new THREE.Vector3(
      Math.cos(angle) * radius,
      (Math.random() - 0.5) * 40000,
      Math.sin(angle) * radius,
    );
  }

  /** 玩家开火 */
  fire(origin: THREE.Vector3, direction: THREE.Vector3, weapon: WeaponMount, _quaternion: THREE.Quaternion): void {
    const spread = weapon.spread;
    const dir = direction
      .clone()
      .add(
        new THREE.Vector3(
          (Math.random() - 0.5) * spread,
          (Math.random() - 0.5) * spread,
          (Math.random() - 0.5) * spread,
        ),
      )
      .normalize();

    const torpedoTarget =
      weapon.type === 'torpedo' ? this.findTorpedoTarget(origin, dir, weapon.range) : null;

    this.spawnProjectile(
      origin,
      dir,
      weapon.speed,
      weapon.damage,
      weapon.range / weapon.speed,
      weapon.color,
      weapon.type === 'cannon' ? 1.5 : weapon.type === 'torpedo' ? 2.4 : 1,
      'player',
      weapon.type,
      torpedoTarget ? () => torpedoTarget.group.position : undefined,
    );
  }

  private findTorpedoTarget(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    range: number,
  ): Npc | null {
    let best: Npc | null = null;
    let bestScore = Infinity;
    for (const npc of this.npcs) {
      if (!npc.alive) continue;
      const to = npc.group.position.clone().sub(origin);
      const distance = to.length();
      if (distance > range) continue;
      const dot = to.normalize().dot(direction);
      if (dot < 0.55) continue;
      const score = distance * (1.25 - dot);
      if (score < bestScore) {
        bestScore = score;
        best = npc;
      }
    }
    return best;
  }

  private spawnProjectile(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    speed: number,
    damage: number,
    life: number,
    color: number,
    scale: number,
    owner: 'player' | 'npc',
    weaponType: WeaponType,
    homing?: () => THREE.Vector3 | null,
  ): void {
    const dir = direction.clone().normalize();
    const mesh = this.acquire(color);
    mesh.position.copy(origin);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    const rail = weaponType === 'railgun';
    const trailLength = rail ? 260 : 26 + 10 * scale;
    const trailWidth = rail ? 1.15 : 0.7 + 0.55 * scale;
    mesh.scale.set(trailWidth, trailWidth, rail ? trailLength * 0.5 : trailLength);

    const glow = this.acquireGlow(color);
    glow.position.copy(origin);
    glow.scale.setScalar(rail ? 12 : 2.2 + 2.2 * scale);

    // 炮口焰：轨道炮尤其明显
    this.spawnFlash(origin, rail ? 0xffffff : color, rail ? 46 : 3 + 2 * scale, rail ? 0.22 : 0.08);

    this.projectiles.push({
      mesh,
      glow,
      velocity: dir.multiplyScalar(speed),
      damage,
      life,
      owner,
      color: new THREE.Color(color),
      speed,
      weaponType,
      homing,
    });
  }

  private acquireGlow(color: number): THREE.Sprite {
    const sprite =
      this.glowPool.pop() ??
      new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glowTexture,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
    const material = sprite.material as THREE.SpriteMaterial;
    material.color.setHex(color);
    material.opacity = 0.9;
    material.rotation = 0;
    sprite.visible = true;
    this.scene.add(sprite);
    return sprite;
  }

  private acquire(color: number): THREE.Mesh {
    const mesh = this.pool.pop() ?? new THREE.Mesh(this.laserGeo, this.laserMat.clone());
    (mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    mesh.visible = true;
    this.scene.add(mesh);
    return mesh;
  }

  private release(mesh: THREE.Mesh): void {
    mesh.visible = false;
    this.scene.remove(mesh);
    if (this.pool.length < MAX_PROJECTILES) this.pool.push(mesh);
  }

  private releaseProjectile(p: Projectile): void {
    this.release(p.mesh);
    p.glow.visible = false;
    this.scene.remove(p.glow);
    if (this.glowPool.length < MAX_PROJECTILES) this.glowPool.push(p.glow);
  }

  /** 线段到点的最近距离，用于高速弹丸的连续碰撞检测 */
  private segmentHit(target: THREE.Vector3, from: THREE.Vector3, to: THREE.Vector3, radius: number): boolean {
    const ab = to.clone().sub(from);
    const lengthSq = ab.lengthSq();
    const t = lengthSq > 1e-8 ? THREE.MathUtils.clamp(target.clone().sub(from).dot(ab) / lengthSq, 0, 1) : 0;
    return target.distanceTo(from.clone().addScaledVector(ab, t)) < radius;
  }

  update(dt: number, playerPos: THREE.Vector3, playerVelocity: THREE.Vector3, _playerQuat: THREE.Quaternion, _camera?: THREE.Camera): void {
    this.time += dt;

    // 弹丸
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const p = this.projectiles[i];
      const prev = p.mesh.position.clone();
      if (p.homing) {
        const target = p.homing();
        if (target) {
          const desired = target.clone().sub(p.mesh.position).normalize();
          const current = p.velocity.clone().normalize();
          const angle = current.angleTo(desired);
          const step = Math.min(angle, 1.9 * dt);
          if (step > 1e-5) {
            const axis = new THREE.Vector3().crossVectors(current, desired);
            if (axis.lengthSq() > 1e-8) {
              axis.normalize();
              current.applyAxisAngle(axis, step);
              p.velocity.copy(current).multiplyScalar(p.speed);
              p.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), current);
            }
          }
        }
      }
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.glow.position.copy(p.mesh.position);
      p.life -= dt;

      let dead = p.life <= 0;

      if (!dead && p.owner === 'player') {
        for (const npc of this.npcs) {
          if (!npc.alive) continue;
          if (this.segmentHit(npc.group.position, prev, p.mesh.position, npc.radius)) {
            const absorbed = Math.min(npc.shield, p.damage);
            npc.shield -= absorbed;
            npc.hp -= p.damage - absorbed;
            npc.lastHit = this.time;
            if (absorbed > 0 && npc.shield <= 0) npc.damage.shieldBreak();
            const localHit = p.mesh.position.clone().sub(npc.group.position).applyQuaternion(npc.group.quaternion.clone().invert());
            if (absorbed > 0) npc.damage.shieldHit(localHit);
            else npc.damage.hullHit(localHit);
            this.angerFleet(npc);
            this.burst(p.mesh.position, p.color, p.weaponType === 'railgun' ? 42 : 14);
            this.events.onImpact?.(p.weaponType, p.mesh.position.clone(), 'player');
            if (p.weaponType === 'railgun') {
              this.spawnFlash(p.mesh.position, 0xffffff, 34, 0.2);
            }
            if (npc.hp <= 0) {
              npc.alive = false;
              this.beginNpcDeath(npc);
            }
            dead = true;
            break;
          }
        }
      } else if (!dead && p.owner === 'npc') {
        if (this.segmentHit(playerPos, prev, p.mesh.position, 18)) {
          this.events.onPlayerDamage(p.damage, p.mesh.position.clone());
          this.events.onImpact?.(p.weaponType, p.mesh.position.clone(), 'npc');
          this.burst(p.mesh.position, p.color, p.weaponType === 'railgun' ? 30 : 10);
          if (p.weaponType === 'railgun') this.spawnFlash(p.mesh.position, 0xffffff, 26, 0.18);
          dead = true;
        }
      }

      if (dead) {
        this.releaseProjectile(p);
        this.projectiles.splice(i, 1);
      }
    }

    // 舰队
    for (const fleet of this.fleets) this.updateFleet(fleet, dt, playerPos, playerVelocity);
    // 没有舰队的散兵
    for (const npc of this.npcs) {
      if (!npc.alive || npc.fleetId !== -1) continue;
      this.updateNpc(npc, dt, playerPos, playerPos, playerVelocity, 0.9);
    }

    // 舰船解体序列：引擎→武器→船体→燃料大爆炸
    for (let i = this.deaths.length - 1; i >= 0; i -= 1) {
      const death = this.deaths[i];
      death.time += dt;
      death.npc.group.position.addScaledVector(death.npc.velocity, dt);
      death.npc.group.rotateZ(dt * 0.03);
      death.npc.trail.update(dt, 0.2);
      death.npc.damage.update(dt, 0, 0);

      while (death.index < death.events.length && death.events[death.index].at <= death.time) {
        const event = death.events[death.index];
        death.index += 1;
        const world = event.local
          ? event.local.clone().applyQuaternion(death.npc.group.quaternion).add(death.npc.group.position)
          : death.npc.group.position.clone();
        if (event.kind === 'final') {
          this.explodeAt(world, death.npc.spec.length, death.npc.spec.tier);
          this.spawnShockwave(world, death.npc.spec.length * 0.9);
          for (let k = 0; k < 3; k += 1) {
            const offset = new THREE.Vector3(
              (Math.random() - 0.5) * death.npc.spec.length * 0.35,
              (Math.random() - 0.5) * death.npc.spec.length * 0.12,
              (Math.random() - 0.5) * death.npc.spec.length * 0.35,
            );
            this.spawnDebris(world.clone().add(offset), death.npc.spec.length * 0.9, death.npc.spec.tier);
          }
          death.npc.trail.dispose();
          death.npc.damage.dispose();
          this.scene.remove(death.npc.group);
          this.events.onNpcKilled(world);
          this.deaths.splice(i, 1);
          break;
        }
        this.spawnFireball(world, event.size, new THREE.Color(event.color), 0.7, false);
        this.burst(world, new THREE.Color(0xffb066), event.kind === 'hull' ? 8 : 14);
        this.events.onExplosion?.(world, event.size);
      }
    }

    // 冲击波
    for (let i = this.shockwaves.length - 1; i >= 0; i -= 1) {
      const wave = this.shockwaves[i];
      wave.age += dt;
      const k = Math.min(1, wave.age / wave.life);
      wave.sprite.scale.setScalar(wave.size * (0.3 + k * 2.8));
      (wave.sprite.material as THREE.SpriteMaterial).opacity = 0.5 * Math.pow(1 - k, 1.6);
      if (wave.age >= wave.life) {
        this.scene.remove(wave.sprite);
        this.shockwaves.splice(i, 1);
      }
    }

    // 炮口焰
    for (let i = this.flashes.length - 1; i >= 0; i -= 1) {
      const fx = this.flashes[i];
      fx.age += dt;
      const k = Math.min(1, fx.age / fx.life);
      (fx.sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - k);
      fx.sprite.scale.multiplyScalar(1 + dt * 5);
      if (fx.age >= fx.life) {
        this.scene.remove(fx.sprite);
        this.flashes.splice(i, 1);
      }
    }

    // 爆炸与残骸
    for (let i = this.explosions.length - 1; i >= 0; i -= 1) {
      const fx = this.explosions[i];
      fx.age += dt;
      const k = Math.min(1, fx.age / fx.life);
      const coreMat = fx.core.material as THREE.SpriteMaterial;
      const outerMat = fx.outer.material as THREE.SpriteMaterial;
      const flashMat = fx.flash.material as THREE.SpriteMaterial;
      const smokeMat = fx.smoke.material as THREE.SpriteMaterial;

      fx.core.scale.setScalar(fx.size * (0.55 + k * 2.0));
      coreMat.opacity = Math.max(0, Math.pow(1 - k, 1.2));
      fx.outer.scale.setScalar(fx.size * (0.95 + k * 3.4));
      outerMat.opacity = Math.max(0, 0.7 * Math.pow(1 - k, 1.5));

      const flashK = Math.min(1, fx.age / 0.2);
      fx.flash.scale.setScalar(fx.size * (0.4 + flashK * 1.4));
      flashMat.opacity = Math.max(0, 1 - flashK) * 0.95;

      fx.smoke.scale.setScalar(fx.size * (0.7 + k * 2.9));
      fx.smoke.position.y += dt * fx.size * 0.06;
      smokeMat.opacity = Math.max(0, 0.3 * (1 - k));
      fx.smoke.material.rotation += dt * 0.08;

      fx.light.intensity = Math.min(1.5e6, fx.size * fx.size * 4) * Math.pow(1 - k, 2);

      fx.secondaryTimer -= dt;
      if (fx.tier >= 4 && fx.age < 1.4 && fx.secondaryCount > 0 && fx.secondaryTimer <= 0) {
        fx.secondaryCount -= 1;
        fx.secondaryTimer = 0.22 + Math.random() * 0.3;
        const offset = new THREE.Vector3(
          (Math.random() - 0.5) * fx.size * 0.9,
          (Math.random() - 0.5) * fx.size * 0.6,
          (Math.random() - 0.5) * fx.size * 0.9,
        );
        this.spawnFireball(fx.position.clone().add(offset), fx.size * 0.35, fx.color, 0.75);
      }

      if (fx.age >= fx.life) {
        this.scene.remove(fx.core);
        this.scene.remove(fx.outer);
        this.scene.remove(fx.flash);
        this.scene.remove(fx.smoke);
        this.scene.remove(fx.light);
        this.explosions.splice(i, 1);
      }
    }

    for (let i = this.debris.length - 1; i >= 0; i -= 1) {
      const d = this.debris[i];
      d.life -= dt;
      d.mesh.position.addScaledVector(d.velocity, dt);
      d.velocity.multiplyScalar(1 - 0.06 * dt);
      d.mesh.rotation.x += d.spin.x * dt;
      d.mesh.rotation.y += d.spin.y * dt;
      d.mesh.rotation.z += d.spin.z * dt;
      const material = d.mesh.material as THREE.MeshStandardMaterial;
      if (material.transparent) {
        material.opacity = Math.min(1, Math.max(0, d.life / 4));
      }
      if (d.hot && material.emissiveIntensity > 0) {
        material.emissiveIntensity = Math.max(0, material.emissiveIntensity - dt * 0.55);
      }
      if (d.life <= 0) {
        this.scene.remove(d.mesh);
        d.mesh.geometry.dispose();
        material.dispose();
        this.debris.splice(i, 1);
      }
    }

    // 火花
    if (this.sparks && this.sparkLife > 0) {
      this.sparkLife -= dt;
      const positions = this.sparks.geometry.attributes.position as THREE.BufferAttribute;
      const v = this.sparkVelocity!;
      for (let i = 0; i < positions.count; i += 1) {
        positions.array[i * 3] += v[i * 3] * dt;
        positions.array[i * 3 + 1] += v[i * 3 + 1] * dt;
        positions.array[i * 3 + 2] += v[i * 3 + 2] * dt;
        v[i * 3] *= 0.97;
        v[i * 3 + 1] *= 0.97;
        v[i * 3 + 2] *= 0.97;
      }
      positions.needsUpdate = true;
      (this.sparks.material as THREE.PointsMaterial).opacity = Math.max(0, this.sparkLife / 0.7);
      if (this.sparkLife <= 0) {
        this.scene.remove(this.sparks);
        this.sparks = null;
      }
    }
  }

  private angerFleet(npc: Npc): void {
    if (npc.faction === 'hostile' && npc.hostile) return;
    npc.hostile = true;
    npc.alerted = true;
    const fleet = this.fleets.find((item) => item.id === npc.fleetId);
    if (!fleet) return;
    fleet.faction = 'hostile';
    fleet.alerted = true;
    fleet.engaged = true;
    for (const ship of fleet.ships) {
      ship.faction = 'hostile';
      ship.hostile = true;
      ship.alerted = true;
    }
  }

  private updateFleet(
    fleet: Fleet,
    dt: number,
    playerPos: THREE.Vector3,
    playerVelocity: THREE.Vector3,
  ): void {
    const flagship = fleet.ships.find((ship) => ship.alive && ship.role === 'flagship') ?? fleet.ships.find((ship) => ship.alive);
    if (!flagship) return;

    // 敌对舰队主动扫描
    if (fleet.faction === 'hostile' && !fleet.alerted) {
      const distance = flagship.group.position.distanceTo(playerPos);
      if (distance < SCAN_RANGE) {
        fleet.alerted = true;
        fleet.engaged = true;
        for (const ship of fleet.ships) {
          ship.alerted = true;
          ship.hostile = true;
        }
      }
    }

    // 巡航空域
    fleet.waypointTimer -= dt;
    if (fleet.waypointTimer <= 0 || flagship.group.position.distanceTo(fleet.waypoint) < 4000) {
      fleet.waypoint = this.pickWaypoint(playerPos);
      fleet.waypointTimer = 45 + Math.random() * 75;
    }

    const formationTime = this.time * 0.06 + fleet.id;

    for (const npc of fleet.ships) {
      if (!npc.alive) continue;
      const toPlayer = playerPos.clone().sub(npc.group.position);
      const playerDistance = toPlayer.length();

      if (npc.role === 'flagship') {
        // 主力舰占位：接近到主炮射程内，然后保持距离并转向目标
        const standoff = npc.spec.tier >= 6 ? 5200 : 3600;
        let moveTarget = fleet.alerted ? playerPos : fleet.waypoint;
        if (fleet.alerted) {
          if (playerDistance < standoff * 0.8) {
            moveTarget = npc.group.position.clone().addScaledVector(toPlayer.clone().normalize(), -3200);
          } else if (playerDistance > standoff) {
            moveTarget = playerPos.clone().addScaledVector(toPlayer.clone().normalize(), -standoff);
          } else {
            moveTarget = npc.group.position.clone();
          }
        }
        this.updateNpc(npc, dt, moveTarget, playerPos, playerVelocity, fleet.alerted ? 0.9 : 0.72);
      } else if (fleet.alerted) {
        // 护卫：一次过攻击（approach）→ 脱离（extend）→ 再进入
        if (npc.attackPhase === 'approach') {
          if (playerDistance < npc.breakOff) {
            npc.attackPhase = 'extend';
            npc.phaseTimer = 1.6 + Math.random() * 1.9;
            const away = toPlayer.clone().normalize().negate();
            const side = new THREE.Vector3(
              Math.random() - 0.5,
              (Math.random() - 0.5) * 0.7,
              Math.random() - 0.5,
            ).normalize().multiplyScalar(0.8);
            npc.runDirection.copy(away.add(side).normalize());
          }
          this.updateNpc(npc, dt, playerPos, playerPos, playerVelocity, 1);
        } else {
          npc.phaseTimer -= dt;
          const extendTarget = npc.group.position.clone().addScaledVector(npc.runDirection, 9000);
          this.updateNpc(npc, dt, extendTarget, playerPos, playerVelocity, 1.15);
          if (npc.phaseTimer <= 0) npc.attackPhase = 'approach';
        }
      } else {
        // 编队：围绕旗舰，带轻微摆动
        const drift = new THREE.Vector3(
          Math.sin(formationTime + npc.id) * 90,
          Math.cos(formationTime * 0.8 + npc.id) * 60,
          Math.cos(formationTime + npc.id) * 90,
        );
        const targetPos = flagship.group.position.clone().add(npc.formation).add(drift);
        this.updateNpc(npc, dt, targetPos, playerPos, playerVelocity, 0.72);
      }
    }
  }

  private updateNpc(
    npc: Npc,
    dt: number,
    moveTarget: THREE.Vector3,
    playerPos: THREE.Vector3,
    playerVelocity: THREE.Vector3,
    throttle: number,
  ): void {
    const toTarget = moveTarget.clone().sub(npc.group.position);
    const distance = toTarget.length();
    if (distance > 0.001) toTarget.multiplyScalar(1 / distance);

    const distToPlayer = npc.group.position.distanceTo(playerPos);
    npc.group.visible = distToPlayer < 180000;
    const fleet = this.fleets.find((item) => item.id === npc.fleetId);
    const travel = fleet ? fleet.cruise : 2200;
    const combatSpeed = Math.min(npc.spec.maxSpeed * 1.6, 5200);
    const desiredSpeed = npc.alerted ? Math.min(combatSpeed, Math.max(900, distance * 0.55)) : Math.min(travel, Math.max(120, distance * 0.8));
    const desiredVelocity = toTarget.multiplyScalar(desiredSpeed * throttle);
    npc.velocity.lerp(desiredVelocity, Math.min(1, dt * (npc.role === 'flagship' ? 0.5 : 1.2)));
    npc.group.position.addScaledVector(npc.velocity, dt);

    // 朝向
    if (npc.velocity.lengthSq() > 1) {
      const dir = npc.velocity.clone().normalize();
      const m = new THREE.Matrix4().lookAt(npc.group.position, npc.group.position.clone().add(dir), new THREE.Vector3(0, 1, 0));
      const q = new THREE.Quaternion().setFromRotationMatrix(m);
      const turn = npc.role === 'flagship' ? 0.35 : 1.5;
      npc.group.quaternion.slerp(q, Math.min(1, dt * turn));
    }

    // 护盾再生
    if (this.time - npc.lastHit > 3) {
      npc.shield = Math.min(npc.maxShield, npc.shield + npc.shieldRegen * dt);
    }
    npc.damage.setEnabled(distToPlayer < 30000);
    npc.damage.update(dt, npc.hp / npc.maxHp, npc.shield / npc.maxShield);

    // 引擎粒子尾焰（舰体局部坐标）
    const thrust = Math.min(1, npc.velocity.length() / 2600);
    npc.trail.object.visible = distToPlayer < 35000;
    if (npc.trail.object.visible) npc.trail.update(dt, 0.2 + thrust * 1.4);

    // 开火：必须把舰首对准预测点，不能 360° 侧射
    npc.cooldown -= dt;
    const weapon = npc.weapon;
    const range = Math.min(weapon.range, 7000);
    if (npc.hostile && npc.cooldown <= 0 && distToPlayer < range) {
      const aim = this.leadPoint(npc.group.position, playerPos, playerVelocity, weapon.speed);
      const aimDir = aim.clone().sub(npc.group.position).normalize();
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(npc.group.quaternion);
      const arc = npc.role === 'flagship' ? Math.cos(0.5) : Math.cos(0.3);
      if (forward.dot(aimDir) > arc) {
        npc.cooldown = (1 / Math.max(weapon.rate, 0.08)) * (npc.role === 'flagship' ? 1.3 : 1);
        npc.alerted = true;
        const origin = npc.group.position.clone().addScaledVector(aimDir, npc.radius);
        const homing = weapon.type === 'torpedo' ? () => playerPos : undefined;
        this.spawnProjectile(
          origin,
          aimDir,
          weapon.speed,
          weapon.damage,
          Math.min(6, weapon.range / weapon.speed),
          weapon.color,
          weapon.type === 'cannon' ? 1.4 : weapon.type === 'torpedo' ? 2.2 : 1,
          'npc',
          weapon.type,
          homing,
        );
      } else {
        npc.cooldown = 0.12;
      }
    }
  }

  private beginNpcDeath(npc: Npc): void {
    npc.damage.setEnabled(true);
    const spec = npc.spec;
    const events: DeathEvent[] = [];
    const isCapital = spec.tier >= 5;
    const duration = isCapital
      ? Math.min(18, 4 + spec.length / 180)
      : 1.3 + spec.tier * 0.3;

    let t = isCapital ? 0.25 : 0.1;
    const engines = spec.nozzles.filter((nozzle) => nozzle.role !== 'retro');
    for (const nozzle of engines) {
      events.push({
        at: t,
        kind: 'engine',
        position: new THREE.Vector3(...nozzle.pos),
        local: new THREE.Vector3(...nozzle.pos),
        color: spec.exhaust,
        size: Math.max(10, spec.length * 0.025 + nozzle.size * 2.4),
      });
      t += isCapital ? 0.26 + Math.random() * 0.12 : 0.15;
    }

    t += isCapital ? 0.3 : 0.12;
    for (const weapon of spec.weapons) {
      events.push({
        at: t,
        kind: 'weapon',
        position: new THREE.Vector3(...weapon.pos),
        local: new THREE.Vector3(...weapon.pos),
        color: weapon.color,
        size: Math.max(8, spec.length * 0.02),
      });
      t += isCapital ? 0.14 + Math.random() * 0.08 : 0.1;
    }

    const hullStart = Math.max(t, isCapital ? 1.5 : 0.55);
    const hullEnd = duration - (isCapital ? 1.5 : 0.35);
    for (let at = hullStart; at < hullEnd; at += isCapital ? 0.34 : 0.22) {
      events.push({
        at,
        kind: 'hull',
        position: new THREE.Vector3(
          (Math.random() - 0.5) * spec.length * 0.5,
          (Math.random() - 0.5) * spec.length * 0.12,
          (Math.random() - 0.5) * spec.length * 0.7,
        ),
        local: new THREE.Vector3(
          (Math.random() - 0.5) * spec.length * 0.5,
          (Math.random() - 0.5) * spec.length * 0.12,
          (Math.random() - 0.5) * spec.length * 0.7,
        ),
        color: 0xff9a4a,
        size: Math.max(6, spec.length * 0.014 + Math.random() * spec.length * 0.012),
      });
    }

    events.push({ at: duration, kind: 'final', color: 0xfff2c8, position: new THREE.Vector3(), size: spec.length });
    events.sort((a, b) => a.at - b.at);
    this.deaths.push({ npc, time: 0, duration, events, index: 0 });
  }

  private spawnShockwave(position: THREE.Vector3, size: number): void {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.ringTexture,
        color: 0xffe0b0,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    sprite.position.copy(position);
    sprite.scale.setScalar(size * 0.35);
    this.scene.add(sprite);
    this.shockwaves.push({ sprite, age: 0, life: 1.6, size });
  }

  /** 玩家舰体解体时的局部爆炸 */
  burstAt(position: THREE.Vector3, size: number): void {
    this.spawnFireball(position, size, new THREE.Color(0xffb066), 0.8, false);
    this.burst(position, new THREE.Color(0xffb066), 12);
    this.events.onExplosion?.(position, size);
  }

  /** 玩家舰体终末大爆炸 + 冲击波 */
  finaleAt(position: THREE.Vector3, length: number, tier: number): void {
    this.explodeAt(position, length, tier);
    this.spawnShockwave(position, length * 0.9);
    this.spawnShockwave(position, length * 1.45);
    this.spawnFlash(position, 0xfff5dd, Math.max(30, length * 0.35), 0.35);
  }

  /** 在指定位置制造爆炸；length 决定火球/残骸尺度 */
  explodeAt(position: THREE.Vector3, length = 25, tier = 2): void {
    const size = Math.max(8, length * (tier >= 5 ? 0.55 : 0.42));
    this.events.onExplosion?.(position, size);
    this.spawnFireball(position, size, new THREE.Color(0xffb066), 2.2);
    this.burst(position, new THREE.Color(0xffb066), Math.min(90, 22 + tier * 8));
    this.spawnDebris(position, length, tier);
  }

  private spawnFlash(position: THREE.Vector3, color: number, size: number, life: number): void {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTexture,
        color,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    sprite.position.copy(position);
    sprite.scale.setScalar(size);
    this.scene.add(sprite);
    this.flashes.push({ sprite, age: 0, life });
  }

  private spawnFireball(position: THREE.Vector3, size: number, color: THREE.Color, life: number, allowSecondary = true): void {
    const core = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.fireTexture,
        color: 0xffffff,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    core.position.copy(position);
    core.scale.setScalar(size * 0.55);
    this.scene.add(core);

    const outer = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.fireTexture,
        color: 0xff5a18,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    outer.position.copy(position);
    outer.scale.setScalar(size * 0.95);
    this.scene.add(outer);

    const flash = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTexture,
        color: 0xfff6e0,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    flash.position.copy(position);
    flash.scale.setScalar(size * 0.45);
    this.scene.add(flash);

    const smoke = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.smokeTexture,
        color: 0x2e2622,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
      }),
    );
    smoke.position.copy(position);
    smoke.scale.setScalar(size * 0.75);
    this.scene.add(smoke);

    const light = new THREE.PointLight(0xff8a4a, Math.min(1.5e6, size * size * 4), size * 12, 2);
    light.position.copy(position);
    this.scene.add(light);

    this.explosions.push({
      position: position.clone(),
      age: 0,
      life: Math.max(life, 2.4),
      size,
      core,
      outer,
      flash,
      smoke,
      light,
      tier: Math.max(0, Math.round(size / 120)),
      secondaryTimer: 0.2,
      secondaryCount: allowSecondary ? (size > 120 ? 4 : size > 45 ? 2 : 0) : 0,
      color,
    });
  }

  private spawnDebris(position: THREE.Vector3, length: number, tier: number): void {
    const count = Math.min(30, 8 + Math.floor(length / 60));
    const panel = Math.random() < 0.35;
    for (let i = 0; i < count; i += 1) {
      const hot = Math.random() < 0.12;
      const big = tier >= 5 && i < 2;
      const chunkSize = (big ? length * (0.035 + Math.random() * 0.025) : length * (0.006 + Math.random() * 0.014)) + 0.25;
      const geometry = panel
        ? new THREE.BoxGeometry(chunkSize * (1.4 + Math.random()), chunkSize * 0.18, chunkSize * (0.6 + Math.random() * 0.8))
        : Math.random() > 0.4
          ? new THREE.TetrahedronGeometry(chunkSize, 0)
          : new THREE.BoxGeometry(chunkSize, chunkSize * 0.55, chunkSize * (0.6 + Math.random()));
      const material = new THREE.MeshStandardMaterial({
        map: this.debrisTexture,
        color: hot ? 0x8a4a32 : 0x929aa2,
        emissive: hot ? new THREE.Color(0xc04a18) : new THREE.Color(0x000000),
        emissiveIntensity: hot ? 0.8 : 0,
        roughness: 0.76,
        metalness: 0.45,
        flatShading: true,
        transparent: true,
        opacity: 1,
      });
      const mesh = new THREE.Mesh(geometry, material);
      const spread = length * 0.16;
      mesh.position.set(
        position.x + (Math.random() - 0.5) * spread,
        position.y + (Math.random() - 0.5) * spread,
        position.z + (Math.random() - 0.5) * spread,
      );
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      this.scene.add(mesh);

      const dir = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5,
      ).normalize();
      const speed = 12 + Math.random() * (28 + tier * 6);
      this.debris.push({
        mesh,
        velocity: dir.multiplyScalar(speed),
        spin: new THREE.Vector3(
          (Math.random() - 0.5) * 0.8,
          (Math.random() - 0.5) * 0.8,
          (Math.random() - 0.5) * 0.8,
        ),
        life: 24 + Math.random() * 22,
        maxLife: 46,
        hot,
      });
    }
  }

  private burst(position: THREE.Vector3, color: THREE.Color, count: number): void {
    if (this.sparks) {
      this.scene.remove(this.sparks);
      this.sparks = null;
    }

    const positions = new Float32Array(count * 3);
    const velocity = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = position.x;
      positions[i * 3 + 1] = position.y;
      positions[i * 3 + 2] = position.z;
      const dir = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5,
      ).normalize();
      const speed = 20 + Math.random() * 90;
      velocity[i * 3] = dir.x * speed;
      velocity[i * 3 + 1] = dir.y * speed;
      velocity[i * 3 + 2] = dir.z * speed;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color,
        size: 2.6,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    points.frustumCulled = false;
    this.scene.add(points);
    this.sparks = points;
    this.sparkVelocity = velocity;
    this.sparkLife = 0.7;
  }

  /** 最近的可攻击目标（HUD 用） */
  nearestNpc(position: THREE.Vector3, range = Infinity): {
    distance: number;
    hp: number;
    maxHp: number;
    hull: number;
    maxHull: number;
    shield: number;
    maxShield: number;
    tier: number;
    name: string;
    code: string;
    position: THREE.Vector3;
  } | null {
    let best: Npc | null = null;
    let bestDist = range;
    for (const npc of this.npcs) {
      if (!npc.alive) continue;
      const d = npc.group.position.distanceTo(position);
      if (d < bestDist) {
        bestDist = d;
        best = npc;
      }
    }
    return best ? {
      distance: bestDist,
      hp: best.hp + best.shield,
      maxHp: best.maxHp + best.maxShield,
      hull: best.hp,
      maxHull: best.maxHp,
      shield: best.shield,
      maxShield: best.maxShield,
      tier: best.spec.tier,
      name: best.spec.name,
      code: best.spec.code,
      position: best.group.position,
    } : null;
  }

  /** 最近的主力舰（用于 BOSS 血条） */
  nearestCapital(position: THREE.Vector3, range = 120000): {
    distance: number;
    hull: number;
    maxHull: number;
    shield: number;
    maxShield: number;
    tier: number;
    name: string;
    code: string;
  } | null {
    let best: Npc | null = null;
    let bestDist = range;
    for (const npc of this.npcs) {
      if (!npc.alive || !npc.hostile || !npc.alerted || npc.spec.tier < 5) continue;
      const d = npc.group.position.distanceTo(position);
      if (d < bestDist) {
        bestDist = d;
        best = npc;
      }
    }
    return best ? {
      distance: bestDist,
      hull: best.hp,
      maxHull: best.maxHp,
      shield: best.shield,
      maxShield: best.maxShield,
      tier: best.spec.tier,
      name: best.spec.name,
      code: best.spec.code,
    } : null;
  }

  /** 最近的一个「已攻击我方」的目标 */
  nearestHostile(position: THREE.Vector3, range: number): { position: THREE.Vector3; velocity: THREE.Vector3; distance: number } | null {
    let best: Npc | null = null;
    let bestDist = range;
    for (const npc of this.npcs) {
      if (!npc.alive || !npc.hostile) continue;
      const d = npc.group.position.distanceTo(position);
      if (d < bestDist) {
        bestDist = d;
        best = npc;
      }
    }
    return best ? { position: best.group.position.clone(), velocity: best.velocity.clone(), distance: bestDist } : null;
  }

  /** 弹道预测：给定炮口、目标位置/速度、弹速，返回提前量瞄准点 */
  leadPoint(
    origin: THREE.Vector3,
    targetPos: THREE.Vector3,
    targetVelocity: THREE.Vector3,
    projectileSpeed: number,
  ): THREE.Vector3 {
    const toTarget = targetPos.clone().sub(origin);
    const a = targetVelocity.lengthSq() - projectileSpeed * projectileSpeed;
    const b = 2 * toTarget.dot(targetVelocity);
    const c = toTarget.lengthSq();
    let t = 0;
    if (Math.abs(a) < 1e-4) {
      if (Math.abs(b) > 1e-4) t = -c / b;
    } else {
      const disc = b * b - 4 * a * c;
      if (disc >= 0) {
        const root = Math.sqrt(disc);
        const t1 = (-b - root) / (2 * a);
        const t2 = (-b + root) / (2 * a);
        const positive = [t1, t2].filter((value) => value > 0);
        if (positive.length > 0) t = Math.min(...positive);
      }
    }
    return targetPos.clone().addScaledVector(targetVelocity, Math.max(0, Math.min(t, 8)));
  }

  get npcCount(): number {
    return this.npcs.filter((npc) => npc.alive).length;
  }

  /** 雷达/星图用的接触列表 */
  get contacts(): Array<{ position: THREE.Vector3; hostile: boolean; radius: number }> {
    return this.npcs
      .filter((npc) => npc.alive)
      .map((npc) => ({
        position: npc.group.position,
        hostile: npc.hostile,
        radius: npc.radius,
      }));
  }

  /** 交火中的敌方舰队信息 */
  getFleetIntel(playerPos: THREE.Vector3, range = 120000): FleetIntel | null {
    let bestFleet: Fleet | null = null;
    let bestDistance = range;

    for (const fleet of this.fleets) {
      if (!fleet.alerted && !fleet.engaged) continue;
      if (fleet.faction !== 'hostile') continue;
      const flagship = fleet.ships.find((ship) => ship.alive);
      if (!flagship) continue;
      const distance = flagship.group.position.distanceTo(playerPos);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestFleet = fleet;
      }
    }

    if (!bestFleet) return null;
    const ships = bestFleet.ships.filter((ship) => ship.alive);
    const flagship = ships.find((ship) => ship.role === 'flagship') ?? ships[0];
    if (!flagship) return null;
    const escorts = ships.filter((ship) => ship.role === 'escort');
    const tier = flagship.spec.tier;
    const status: FleetIntel['status'] =
      tier >= 7 ? '超主力' : tier >= 6 ? '准主力' : tier >= 5 ? '主力' : '编队';

    return {
      faction: bestFleet.faction,
      flagship: flagship.spec.name,
      code: flagship.spec.code,
      tier,
      status,
      escorts: escorts.length,
      heavyEscorts: escorts.filter((ship) => ship.spec.tier >= 4).length,
      distance: bestDistance,
      engaged: bestFleet.engaged,
    };
  }
}
