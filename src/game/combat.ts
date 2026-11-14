import * as THREE from 'three';
import type { WeaponMount } from './ships';

interface Projectile {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  damage: number;
  life: number;
  owner: 'player' | 'npc';
  color: THREE.Color;
}

interface Npc {
  group: THREE.Group;
  hp: number;
  maxHp: number;
  velocity: THREE.Vector3;
  cooldown: number;
  radius: number;
  alive: boolean;
}

export interface CombatEvents {
  onPlayerDamage: (damage: number) => void;
  onNpcKilled: (position: THREE.Vector3) => void;
}

const MAX_PROJECTILES = 260;

export class Combat {
  private projectiles: Projectile[] = [];
  private pool: THREE.Mesh[] = [];
  private npcs: Npc[] = [];
  private sparks: THREE.Points | null = null;
  private sparkLife = 0;
  private sparkVelocity: Float32Array | null = null;
  private scene: THREE.Scene;
  private events: CombatEvents;
  private laserGeo: THREE.SphereGeometry;
  private laserMat: THREE.MeshBasicMaterial;
  private npcGeo: THREE.BufferGeometry;

  constructor(scene: THREE.Scene, events: CombatEvents) {
    this.scene = scene;
    this.events = events;
    this.laserGeo = new THREE.SphereGeometry(1, 8, 6);
    this.laserMat = new THREE.MeshBasicMaterial({ color: 0x9fe8ff });

    // NPC 用一个低模楔形代替，等模型就绪再换
    this.npcGeo = new THREE.ConeGeometry(6, 18, 6);
    this.npcGeo.rotateX(-Math.PI / 2);
  }

  /** 生成一架敌机 */
  spawnNpc(origin: THREE.Vector3, scale = 1): void {
    const group = new THREE.Group();
    const hull = new THREE.Mesh(
      this.npcGeo,
      new THREE.MeshStandardMaterial({
        color: 0x5a2028,
        emissive: new THREE.Color(0x3a0a10),
        emissiveIntensity: 0.8,
        roughness: 0.5,
        metalness: 0.7,
      }),
    );
    hull.scale.setScalar(scale);
    group.add(hull);

    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(2.2 * scale, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff6a4a }),
    );
    glow.position.z = 9 * scale;
    group.add(glow);

    group.position.copy(origin);
    this.scene.add(group);

    this.npcs.push({
      group,
      hp: 420 * scale,
      maxHp: 420 * scale,
      velocity: new THREE.Vector3(),
      cooldown: Math.random() * 1.5,
      radius: 14 * scale,
      alive: true,
    });
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

    // NPC
    for (const npc of this.npcs) {
      if (!npc.alive) continue;

      const toPlayer = playerPos.clone().sub(npc.group.position);
      const distance = toPlayer.length();
      const dir = toPlayer.normalize();

      // 朝玩家靠近并保持距离
      const targetSpeed = distance > 2400 ? 600 : distance < 1400 ? -400 : 0;
      npc.velocity.lerp(dir.clone().multiplyScalar(targetSpeed), Math.min(1, dt * 0.8));
      npc.group.position.addScaledVector(npc.velocity, dt);

      const look = npc.group.position.clone().add(dir);
      npc.group.lookAt(look);

      // 射击
      npc.cooldown -= dt;
      if (npc.cooldown <= 0 && distance < 2200) {
        npc.cooldown = 1.6 + Math.random() * 1.4;
        const mesh = this.acquire(0xff6a4a);
        mesh.position.copy(npc.group.position).addScaledVector(dir, npc.radius);
        mesh.scale.setScalar(1.2);
        this.projectiles.push({
          mesh,
          velocity: dir.clone().multiplyScalar(2600),
          damage: 14,
          life: 2.4,
          owner: 'npc',
          color: new THREE.Color(0xff6a4a),
        });
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

  get npcCount(): number {
    return this.npcs.filter((npc) => npc.alive).length;
  }
}
