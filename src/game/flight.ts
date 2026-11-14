import * as THREE from 'three';

export type CameraMode = 'third' | 'first' | 'free';

export class FlightController {
  readonly position = new THREE.Vector3(0, 260, 1600);
  readonly quaternion = new THREE.Quaternion();
  readonly velocity = new THREE.Vector3();

  throttle = 0;
  boost = 0;
  brake = 0;
  assist = true;
  cameraMode: CameraMode = 'third';

  private target = new THREE.Quaternion();
  private mouseYaw = 0;
  private mousePitch = 0;
  private orbitYaw = Math.PI;
  private orbitPitch = 0.25;
  private orbitDistance = 60;
  private keys = new Set<string>();
  private shake = 0;
  private readonly tmp = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly forward = new THREE.Vector3();
  private ready = false;
  private cockpitOffset = new THREE.Vector3(0, 2.2, -2.2);
  private spec = { maxSpeed: 4200, boostSpeed: 52000, accel: 2600, turnRate: 1, length: 25, chargeTime: 3, warpCombo: false };
  charge = 0;
  /** none / shift（次级加速） / charged（B 充满） */
  boostMode: 'none' | 'shift' | 'charged' = 'none';
  get isReversing(): boolean {
    return this.keys.has('KeyS') || this.keys.has('ArrowDown');
  }

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    this.camera.position.copy(this.position).add(new THREE.Vector3(0, 14, 42));
  }

  attach(dom: HTMLElement): void {
    dom.addEventListener('pointerdown', () => {
      if (document.pointerLockElement !== dom) void dom.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== dom) this.keys.clear();
    });

    document.addEventListener('mousemove', (event) => {
      if (document.pointerLockElement !== dom) return;
      if (this.cameraMode === 'free') {
        this.orbitYaw -= event.movementX * 0.0026;
        this.orbitPitch = THREE.MathUtils.clamp(
          this.orbitPitch - event.movementY * 0.0022,
          -1.25,
          1.25,
        );
        return;
      }
      const sensitivity = 0.0019;
      this.mouseYaw -= event.movementX * sensitivity;
      this.mousePitch -= event.movementY * sensitivity;
    });

    dom.addEventListener('wheel', (event) => {
      if (this.cameraMode !== 'free') return;
      event.preventDefault();
      const L = this.spec.length ?? 25;
      this.orbitDistance = THREE.MathUtils.clamp(
        this.orbitDistance * Math.exp(event.deltaY * 0.0012),
        L * 1.2 + 8,
        L * 12 + 6000,
      );
    }, { passive: false });

    window.addEventListener('keydown', (event) => {
      if (event.code === 'KeyV') {
        this.cycleCamera();
      }
      if (event.code === 'KeyZ') {
        this.assist = !this.assist;
      }
      this.keys.add(event.code);
    });

    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
    });

    window.addEventListener('blur', () => this.keys.clear());
  }

  addShake(amount: number): void {
    this.shake = Math.min(1.6, this.shake + amount);
  }

  /** 从当前朝向设置目标姿态（停靠/传送后使用） */
  setLookDirection(direction: THREE.Vector3): void {
    const dir = direction.clone().normalize();
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), dir, new THREE.Vector3(0, 1, 0));
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    this.target.copy(q);
    this.quaternion.copy(q);
    this.mouseYaw = 0;
    this.mousePitch = 0;
    this.ready = true;
  }

  /** 第一人称 → 第三人称 → 自由视角 → 第一人称 */
  cycleCamera(): void {
    if (this.cameraMode === 'first') this.cameraMode = 'third';
    else if (this.cameraMode === 'third') {
      this.camera.getWorldPosition(this.tmp);
      const offset = this.tmp.clone().sub(this.position);
      const L = this.spec.length ?? 25;
      if (offset.length() > L * 0.8) {
        this.orbitDistance = THREE.MathUtils.clamp(offset.length(), L * 1.2 + 8, L * 12 + 6000);
        this.orbitYaw = Math.atan2(offset.x, offset.z);
        this.orbitPitch = THREE.MathUtils.clamp(Math.asin(offset.y / offset.length()), -1.25, 1.25);
      } else {
        this.orbitDistance = L * 3 + 40;
        this.orbitYaw = Math.PI;
        this.orbitPitch = 0.28;
      }
      this.cameraMode = 'free';
    } else {
      this.cameraMode = 'first';
    }
  }

  get speed(): number {
    return this.velocity.length();
  }

  get forwardVector(): THREE.Vector3 {
    return this.forward.copy(new THREE.Vector3(0, 0, -1)).applyQuaternion(this.quaternion);
  }

  configure(spec: { maxSpeed: number; boostSpeed: number; accel: number; turnRate: number; length?: number; chargeTime?: number; warpCombo?: boolean }): void {
    this.spec = { ...this.spec, ...spec };
  }

  setCockpitOffset(offset: THREE.Vector3): void {
    this.cockpitOffset.copy(offset);
  }

  /** 外部（停靠动画）用：清空速度。 */
  halt(): void {
    this.velocity.set(0, 0, 0);
  }

  update(dt: number): void {
    const has = (code: string) => this.keys.has(code);

    /* ── 姿态：鼠标偏航/俯仰作用在舰体局部轴上，滚转后不会反 ── */
    if (Math.abs(this.mouseYaw) > 1e-7 || Math.abs(this.mousePitch) > 1e-7) {
      this.tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.mouseYaw);
      this.target.multiply(this.tmpQ);
      this.tmpQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.mousePitch);
      this.target.multiply(this.tmpQ);
      this.target.normalize();
      this.mouseYaw = 0;
      this.mousePitch = 0;
    }

    const rollRate = (has('KeyQ') ? 1 : 0) - (has('KeyE') ? 1 : 0);
    if (rollRate !== 0) {
      this.tmpQ.setFromAxisAngle(new THREE.Vector3(0, 0, 1), rollRate * 2.2 * dt);
      this.target.multiply(this.tmpQ);
      this.target.normalize();
    }

    if (!this.ready) {
      this.quaternion.copy(this.target);
      this.ready = true;
    } else {
      this.quaternion.slerp(this.target, Math.min(1, dt * 9 * this.spec.turnRate));
    }

    /* ── 推进 ── */
    const forwardInput = (has('KeyW') || has('ArrowUp') ? 1 : 0) - (has('KeyS') || has('ArrowDown') ? 1 : 0);
    const braking = has('KeyX') || has('Space');

    // B：按住充能 3 秒后进入全速推进
    const charging = this.spec.warpCombo
      ? has('KeyG') && has('KeyH') && has('KeyB')
      : has('KeyB');
    if (charging) {
      this.charge = Math.min(this.spec.chargeTime, this.charge + dt);
    } else {
      this.charge = 0;
    }
    const charged = charging && this.charge >= this.spec.chargeTime;

    // Shift：次级加速，约 55% 的推进档位，比 B 慢但比基础速度快
    const shifting = (has('ShiftLeft') || has('ShiftRight')) && forwardInput >= 0 && !braking;
    const targetBoost = charged ? 1 : shifting ? 0.12 : 0;
    this.boostMode = charged ? 'charged' : shifting ? 'shift' : 'none';

    const autoWarp = charged && forwardInput >= 0;
    this.throttle = THREE.MathUtils.lerp(
      this.throttle,
      Math.max(0, forwardInput, autoWarp ? 1 : shifting ? 0.55 : 0),
      Math.min(1, dt * 4),
    );
    this.boost = THREE.MathUtils.lerp(this.boost, targetBoost, Math.min(1, dt * 1.5));
    this.brake = THREE.MathUtils.lerp(this.brake, braking ? 1 : 0, Math.min(1, dt * 6));

    const forward = this.forwardVector;
    const right = this.tmp.set(1, 0, 0).applyQuaternion(this.quaternion).clone();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.quaternion);

    // 前向 / 反推：反推只有 45% 推力
    if (forwardInput > 0 || autoWarp) {
      const accel = this.spec.accel + this.boost * this.spec.accel * 36;
      const thrust = forwardInput > 0 ? forwardInput : 1;
      this.velocity.addScaledVector(forward, accel * thrust * dt);
    } else if (forwardInput < 0) {
      // forwardInput 是负数，乘上去才是真正的反推
      this.velocity.addScaledVector(forward, 1500 * forwardInput * dt);
    } else if (shifting) {
      // 只按 Shift 也能推进，但比 W 弱
      const accel = (this.spec.accel + this.boost * this.spec.accel * 16) * 0.55;
      this.velocity.addScaledVector(forward, accel * dt);
    }

    // 侧移
    const strafe = (has('KeyD') ? 1 : 0) - (has('KeyA') ? 1 : 0);
    if (strafe !== 0) this.velocity.addScaledVector(right, strafe * 1800 * dt);

    // 垂直
    const lift = (has('KeyR') ? 1 : 0) - (has('KeyC') ? 1 : 0);
    if (lift !== 0) this.velocity.addScaledVector(up, lift * 1800 * dt);

    /* ── 阻尼：assist 开时像有推进器的飞行器，关时接近纯惯性 ── */
    const damping = this.assist ? 1.9 : 0.06;
    this.velocity.multiplyScalar(Math.exp(-damping * dt));

    // 主动刹车
    if (this.brake > 0.01) {
      this.velocity.multiplyScalar(Math.exp(-9 * this.brake * dt));
    }

    // 飞行辅助：把侧向速度慢慢并到前向
    if (this.assist && this.velocity.lengthSq() > 1) {
      const vForward = this.velocity.dot(forward);
      const vRight = this.velocity.dot(right);
      const vUp = this.velocity.dot(up);
      const blend = 1 - Math.exp(-1.6 * dt);
      const nRight = vRight * (1 - blend);
      const nUp = vUp * (1 - blend);
      this.velocity.copy(forward).multiplyScalar(vForward).addScaledVector(right, nRight).addScaledVector(up, nUp);
    }

    const maxSpeed = this.spec.maxSpeed + this.boost * (this.spec.boostSpeed - this.spec.maxSpeed);
    if (this.velocity.lengthSq() > maxSpeed * maxSpeed) this.velocity.setLength(maxSpeed);

    this.position.addScaledVector(this.velocity, dt);

    this.shake = THREE.MathUtils.lerp(
      this.shake,
      this.boost * 0.7 + this.throttle * 0.1,
      Math.min(1, dt * 4),
    );
  }

  private shipRef: THREE.Object3D | null = null;

  /** 绑定舰体：第一人称直接从舰体世界矩阵取位置，物理再抖也不会甩开 */
  bindShip(ship: THREE.Object3D): void {
    this.shipRef = ship;
  }

  updateCamera(dt: number): void {
    const forward = this.forwardVector;
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.quaternion);

    if (this.cameraMode === 'first') {
      if (this.shipRef) {
        // 直接把相机挂到舰体上：物理怎么动都不可能漂移
        if (this.camera.parent !== this.shipRef) this.shipRef.add(this.camera);
        this.camera.position.copy(this.cockpitOffset);
        this.camera.quaternion.identity();
        this.camera.fov = 78;
        this.camera.updateProjectionMatrix();
      }
    } else if (this.cameraMode === 'free') {
      const shipParent = this.shipRef?.parent ?? null;
      if (shipParent && this.camera.parent !== shipParent) {
        if (this.camera.parent) this.camera.parent.remove(this.camera);
        shipParent.add(this.camera);
      }
      const L = this.spec.length ?? 25;
      const min = L * 1.2 + 8;
      const max = L * 12 + 6000;
      this.orbitDistance = THREE.MathUtils.clamp(this.orbitDistance || L * 3 + 40, min, max);
      const cp = Math.cos(this.orbitPitch);
      const offset = new THREE.Vector3(
        Math.sin(this.orbitYaw) * cp,
        Math.sin(this.orbitPitch),
        Math.cos(this.orbitYaw) * cp,
      ).multiplyScalar(this.orbitDistance);
      this.camera.position.copy(this.position).add(offset);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(this.position);
      if (this.shake > 0.01) {
        this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.3;
        this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.3;
      }
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, 62, Math.min(1, dt * 4));
      this.camera.updateProjectionMatrix();
    } else {
      const shipParent = this.shipRef?.parent ?? null;
      if (shipParent && this.camera.parent !== shipParent) {
        if (this.camera.parent) this.camera.parent.remove(this.camera);
        shipParent.add(this.camera);
      }
      const L = this.spec.length ?? 25;
      const back = L * 1.25 + 8;
      const height = L * 0.26 + 2.5;
      // 直接跟随，避免高速跃迁时相机被速度前馈甩到舰体前面
      const desired = this.position
        .clone()
        .addScaledVector(forward, -back)
        .addScaledVector(up, height);
      this.camera.position.copy(desired);
      this.camera.up.copy(up).lerp(new THREE.Vector3(0, 1, 0), 0.12).normalize();
      this.camera.lookAt(this.position.clone().addScaledVector(forward, L * 0.7 + 6));

      if (this.shake > 0.01) {
        this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.3;
        this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.3;
      }

      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, 62 + this.boost * 8, Math.min(1, dt * 4));
      this.camera.updateProjectionMatrix();
    }
  }
}
