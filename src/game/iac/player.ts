import * as THREE from 'three';

export interface FootInput {
  forward: number;
  right: number;
  sprint: boolean;
  jump: boolean;
}

export interface Collider {
  id: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export const PLAYER = {
  radius: 0.35,
  height: 1.8,
  eye: 1.7,
  walk: 4.6,
  sprint: 7.2,
  gravity: 11.28,
  jump: 4.8,
  step: 0.42,
  groundSnap: 0.4,
  fixedDt: 1 / 60,
};

const SPAWN = new THREE.Vector3(0, 40.06, 23.5);

export class FootPlayer {
  readonly position = SPAWN.clone();
  readonly spawn = SPAWN.clone();
  readonly velocity = new THREE.Vector3();
  yaw = Math.PI / 2;
  pitch = 0;
  grounded = true;
  bob = 0;

  private accumulator = 0;
  private bobPhase = 0;
  private respawns = 0;

  constructor(private readonly groundAt: (x: number, z: number, feetY: number, colliders: Collider[]) => number) {}

  setSpawn(x: number, y: number, z: number, yaw = Math.PI / 2): void {
    this.spawn.set(x, y, z);
    this.position.copy(this.spawn);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.grounded = true;
    this.accumulator = 0;
  }

  look(dx: number, dy: number, sensitivity = 0.0022): void {
    this.yaw -= dx * sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * sensitivity, -1.35, 1.35);
  }

  update(dt: number, input: FootInput, colliders: Collider[]): boolean {
    this.accumulator += Math.min(dt, 0.1);
    let steps = 0;
    while (this.accumulator >= PLAYER.fixedDt && steps < 5) {
      this.step(PLAYER.fixedDt, input, colliders);
      this.accumulator -= PLAYER.fixedDt;
      steps += 1;
    }
    if (steps === 5) this.accumulator = 0;
    return this.respawns > 0;
  }

  private step(dt: number, input: FootInput, colliders: Collider[]): void {
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const fx = -sin;
    const fz = -cos;
    const rx = cos;
    const rz = -sin;
    let wishX = fx * input.forward + rx * input.right;
    let wishZ = fz * input.forward + rz * input.right;
    const wishLen = Math.hypot(wishX, wishZ);
    if (wishLen > 1e-4) {
      wishX /= wishLen;
      wishZ /= wishLen;
    } else {
      wishX = 0;
      wishZ = 0;
    }
    const speed = input.sprint ? PLAYER.sprint : PLAYER.walk;
    const accel = this.grounded ? 24 : 5.5;
    const targetX = wishX * speed;
    const targetZ = wishZ * speed;
    const blend = 1 - Math.exp(-accel * dt);
    this.velocity.x += (targetX - this.velocity.x) * blend;
    this.velocity.z += (targetZ - this.velocity.z) * blend;
    if (wishLen < 1e-4 && this.grounded) {
      const friction = 1 - Math.exp(-18 * dt);
      this.velocity.x -= this.velocity.x * friction;
      this.velocity.z -= this.velocity.z * friction;
    }

    this.moveAxis(this.velocity.x * dt, 0, colliders);
    this.moveAxis(0, this.velocity.z * dt, colliders);

    const ground = this.groundAt(this.position.x, this.position.z, this.position.y, colliders);
    if (this.grounded) {
      if (input.jump) {
        this.velocity.y = PLAYER.jump;
        this.grounded = false;
      } else if (ground < this.position.y - PLAYER.groundSnap) {
        this.grounded = false;
      } else {
        this.position.y = ground;
        this.velocity.y = 0;
      }
    }
    if (!this.grounded) {
      this.velocity.y -= PLAYER.gravity * dt;
      this.position.y += this.velocity.y * dt;
      const floor = this.groundAt(this.position.x, this.position.z, this.position.y, colliders);
      if (this.position.y <= floor && this.velocity.y <= 0) {
        this.position.y = floor;
        this.velocity.y = 0;
        this.grounded = true;
      }
    }

    const horizontal = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.grounded && horizontal > 0.2) {
      this.bobPhase += dt * (5.5 + horizontal * 1.1);
      this.bob = Math.sin(this.bobPhase) * 0.014 * Math.min(1, horizontal / PLAYER.walk);
    } else {
      this.bob *= 0.9;
    }

    if (
      Math.abs(this.position.x) > 8150 ||
      Math.abs(this.position.z) > 8150 ||
      this.position.y < -160
    ) {
      this.position.copy(this.spawn);
      this.velocity.set(0, 0, 0);
      this.grounded = true;
      this.respawns += 1;
    }
  }

  private moveAxis(dx: number, dz: number, colliders: Collider[]): void {
    if (dx === 0 && dz === 0) return;
    const nx = this.position.x + dx;
    const nz = this.position.z + dz;
    const feet = this.position.y;
    if (!this.blocked(nx, nz, feet, colliders)) {
      const ground = this.groundAt(nx, nz, feet, colliders);
      if (ground - feet <= PLAYER.step || this.grounded === false) {
        this.position.x = nx;
        this.position.z = nz;
        if (this.grounded && ground > feet) this.position.y = ground;
        return;
      }
    }
    if (dx !== 0) this.velocity.x = 0;
    if (dz !== 0) this.velocity.z = 0;
  }

  private blocked(x: number, z: number, feet: number, colliders: Collider[]): boolean {
    const r = PLAYER.radius;
    const top = feet + PLAYER.height;
    for (const box of colliders) {
      if (box.maxY <= feet + 0.2 || box.minY >= top) continue;
      if (
        x + r > box.minX &&
        x - r < box.maxX &&
        z + r > box.minZ &&
        z - r < box.maxZ
      ) {
        return true;
      }
    }
    return false;
  }

  eyePosition(target = new THREE.Vector3()): THREE.Vector3 {
    return target.set(this.position.x, this.position.y + PLAYER.eye + this.bob, this.position.z);
  }

  applyCamera(camera: THREE.PerspectiveCamera): void {
    this.eyePosition(camera.position);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(this.pitch, this.yaw, 0);
    const targetFov = 72;
    if (Math.abs(camera.fov - targetFov) > 0.01) {
      camera.fov = targetFov;
      camera.updateProjectionMatrix();
    }
  }
}

/** Highest walkable surface at a point: terrain, deck, or a collider top. */
export function sampleSurface(
  terrainGround: (x: number, z: number) => number,
  x: number,
  z: number,
  feetY: number,
  colliders: Collider[],
): number {
  let best = terrainGround(x, z);
  const r = PLAYER.radius;
  for (const box of colliders) {
    if (box.maxY > feetY + 0.55) continue;
    if (x + r > box.minX && x - r < box.maxX && z + r > box.minZ && z - r < box.maxZ) {
      if (box.maxY > best) best = box.maxY;
    }
  }
  return best;
}
