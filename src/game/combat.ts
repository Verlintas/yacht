import * as THREE from 'three';
import { getShip, type ShipSpec, type WeaponMount } from './ships';

interface Projectile {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  damage: number;
  life: number;
  owner: 'player' | 'npc';
  color: THREE.Color;
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
  orbitPhase: number;
  bank: number;
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
  onPlayerDamage: (damage: number) => void;
  onNpcKilled: (position: THREE.Vector3) => void;
}

const MAX_PROJECTILES = 260;
const SCAN_RANGE = 60000;

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
  private laserGeo: THREE.SphereGeometry;
  private laserMat: THREE.MeshBasicMaterial;
  private npcGeo: THREE.BufferGeometry;
  private npcSeq = 0;
  private fleetSeq = 0;
  private time = 0;

  constructor(scene: THREE.Scene, events: CombatEvents) {
    this.scene = scene;
    this.events = events;
    this.laserGeo = new THREE.SphereGeometry(1, 8, 6);
    this.laserMat = new THREE.MeshBasicMaterial({ color: 0x9fe8ff });

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
        if (obj instanceof THREE.Mesh) obj.frustumCulled = true;
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

    const npc: Npc = {
      id: ++this.npcSeq,
      group,
      spec,
      fleetId,
      role,
      faction,
      hp: spec.hull * 0.3,
      maxHp: spec.hull * 0.3,
      velocity: new THREE.Vector3(),
      cooldown: Math.random() * 2,
      scanCooldown: 1 + Math.random() * 2,
      radius: Math.max(12, spec.length * 0.42),
      alive: true,
      hostile: faction === 'hostile',
      alerted: false,
      formation,
      orbitPhase: Math.random() * Math.PI * 2,
      bank: 0,
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
  fire(origin: THREE.Vector3, direction: THREE.Vector3, weapon: WeaponMount, quaternion: THREE.Quaternion): void {
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

    const mesh = this.acquire(weapon.color);
    mesh.position.copy(origin);
    mesh.scale.setScalar(weapon.type === 'cannon' ? 1.5 : 1);
    mesh.quaternion.copy(quaternion);

    this.projectiles.push({
      mesh,
      velocity: dir.multiplyScalar(weapon.speed),
      damage: weapon.damage,
      life: weapon.range / weapon.speed,
      owner: 'player',
      color: new THREE.Color(weapon.color),
    });
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

  update(dt: number, playerPos: THREE.Vector3, playerQuat: THREE.Quaternion): void {
    this.time += dt;

    // 弹丸
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const p = this.projectiles[i];
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.life -= dt;

      let dead = p.life <= 0;

      if (!dead && p.owner === 'player') {
        for (const npc of this.npcs) {
          if (!npc.alive) continue;
          if (p.mesh.position.distanceTo(npc.group.position) < npc.radius) {
            npc.hp -= p.damage;
            this.angerFleet(npc);
            this.burst(p.mesh.position, p.color, 14);
            if (npc.hp <= 0) {
              npc.alive = false;
              this.burst(npc.group.position, new THREE.Color(0xffb066), 60);
              this.scene.remove(npc.group);
              this.events.onNpcKilled(npc.group.position.clone());
            }
            dead = true;
            break;
          }
        }
      } else if (!dead && p.owner === 'npc') {
        if (p.mesh.position.distanceTo(playerPos) < 18) {
          this.events.onPlayerDamage(p.damage);
          this.burst(p.mesh.position, p.color, 10);
          dead = true;
        }
      }

      if (dead) {
        this.release(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }

    // 舰队
    for (const fleet of this.fleets) this.updateFleet(fleet, dt, playerPos);
    // 没有舰队的散兵
    for (const npc of this.npcs) {
      if (!npc.alive || npc.fleetId !== -1) continue;
      this.updateNpc(npc, dt, playerPos, playerPos, 0);
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

  private updateFleet(fleet: Fleet, dt: number, playerPos: THREE.Vector3): void {
    const flagship = fleet.ships.find((ship) => ship.alive);
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

    const target = fleet.alerted ? playerPos : fleet.waypoint;
    const formationTime = this.time * 0.06 + fleet.id;

    for (const npc of fleet.ships) {
      if (!npc.alive) continue;
      const toPlayer = playerPos.clone().sub(npc.group.position);
      const playerDistance = toPlayer.length();

      if (npc.role === 'flagship') {
        // 主力舰保持距离，不贴脸
        let moveTarget = target;
        if (fleet.alerted && playerDistance < 4200) {
          moveTarget = npc.group.position.clone().addScaledVector(toPlayer.normalize(), -2600);
        }
        this.updateNpc(npc, dt, moveTarget, playerPos, fleet.alerted ? 1 : 0.72);
      } else if (fleet.alerted) {
        // 护卫：绕玩家侧向机动，避免站桩
        npc.orbitPhase += dt * (0.45 + (npc.id % 5) * 0.06);
        const radius = 2100 + (npc.id % 4) * 280;
        const orbit = new THREE.Vector3(
          Math.cos(npc.orbitPhase) * radius,
          Math.sin(npc.orbitPhase * 0.7 + fleet.id) * 620,
          Math.sin(npc.orbitPhase) * radius,
        );
        const targetPos = playerPos.clone().add(orbit);
        this.updateNpc(npc, dt, targetPos, playerPos, 1);
      } else {
        // 编队：围绕旗舰，带轻微摆动
        const drift = new THREE.Vector3(
          Math.sin(formationTime + npc.id) * 90,
          Math.cos(formationTime * 0.8 + npc.id) * 60,
          Math.cos(formationTime + npc.id) * 90,
        );
        const targetPos = flagship.group.position.clone().add(npc.formation).add(drift);
        this.updateNpc(npc, dt, targetPos, playerPos, 0.72);
      }
    }
  }

  private updateNpc(
    npc: Npc,
    dt: number,
    moveTarget: THREE.Vector3,
    playerPos: THREE.Vector3,
    throttle: number,
  ): void {
    const toTarget = moveTarget.clone().sub(npc.group.position);
    const distance = toTarget.length();
    if (distance > 0.001) toTarget.multiplyScalar(1 / distance);

    const fleet = this.fleets.find((item) => item.id === npc.fleetId);
    const travel = fleet ? fleet.cruise : 2200;
    const combatSpeed = Math.min(npc.spec.maxSpeed * 1.6, 5200);
    const desiredSpeed = npc.alerted ? Math.min(combatSpeed, Math.max(900, distance * 0.55)) : Math.min(travel, Math.max(120, distance * 0.8));
    const desiredVelocity = toTarget.multiplyScalar(desiredSpeed * throttle);
    npc.velocity.lerp(desiredVelocity, Math.min(1, dt * (npc.role === 'flagship' ? 0.5 : 1.2)));
    npc.group.position.addScaledVector(npc.velocity, dt);

    // 朝向 + 转向压弯
    if (npc.velocity.lengthSq() > 1) {
      const dir = npc.velocity.clone().normalize();
      const m = new THREE.Matrix4().lookAt(npc.group.position, npc.group.position.clone().add(dir), new THREE.Vector3(0, 1, 0));
      const q = new THREE.Quaternion().setFromRotationMatrix(m);
      const turn = npc.role === 'flagship' ? 0.35 : 1.6;
      npc.group.quaternion.slerp(q, Math.min(1, dt * turn));

      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(npc.group.quaternion);
      const cross = forward.clone().cross(dir);
      npc.bank = THREE.MathUtils.lerp(npc.bank, THREE.MathUtils.clamp(cross.y * 2.2, -0.55, 0.55), Math.min(1, dt * 2));
      npc.group.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), npc.bank));
    }

    // 开火：护卫更频繁，主力用主炮
    npc.cooldown -= dt;
    const distToPlayer = npc.group.position.distanceTo(playerPos);
    const range = npc.role === 'flagship' ? 4800 : 2600;
    if (npc.hostile && npc.cooldown <= 0 && distToPlayer < range) {
      npc.cooldown = npc.role === 'flagship' ? 2.2 : 1.1 + Math.random() * 0.8;
      npc.alerted = true;
      const dir = playerPos.clone().sub(npc.group.position).normalize();
      const mesh = this.acquire(npc.faction === 'hostile' ? 0xff6a4a : 0x9fe8ff);
      mesh.position.copy(npc.group.position).addScaledVector(dir, npc.radius);
      mesh.scale.setScalar(npc.role === 'flagship' ? 2.2 : 1.2);
      this.projectiles.push({
        mesh,
        velocity: dir.clone().multiplyScalar(2600 + (npc.role === 'flagship' ? 900 : 0)),
        damage: npc.role === 'flagship' ? 22 : 9,
        life: 3,
        owner: 'npc',
        color: new THREE.Color(npc.faction === 'hostile' ? 0xff6a4a : 0x9fe8ff),
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
  nearestNpc(position: THREE.Vector3): { distance: number; hp: number; maxHp: number } | null {
    let best: Npc | null = null;
    let bestDist = Infinity;
    for (const npc of this.npcs) {
      if (!npc.alive) continue;
      const d = npc.group.position.distanceTo(position);
      if (d < bestDist) {
        bestDist = d;
        best = npc;
      }
    }
    return best ? { distance: bestDist, hp: best.hp, maxHp: best.maxHp } : null;
  }

  /** 最近的一个「已攻击我方」的目标 */
  nearestHostile(position: THREE.Vector3, range: number): { position: THREE.Vector3; distance: number } | null {
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
    return best ? { position: best.group.position.clone(), distance: bestDist } : null;
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
