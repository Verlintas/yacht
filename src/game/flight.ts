import * as THREE from 'three';

export type CameraMode = 'third' | 'first';

export class FlightController {
  readonly position = new THREE.Vector3(0, 260, 1600);
  readonly quaternion = new THREE.Quaternion();
  readonly velocity = new THREE.Vector3();

  throttle = 0;
  boost = 0;
  brake = 0;
  assist = true;
  cameraMode: CameraMode = 'third';

  private yaw = 0;
  private pitch = 0;
  private roll = 0;
  private keys = new Set<string>();
  private shake = 0;
  private smoothedOffset = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly tmp = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly forward = new THREE.Vector3();
  private ready = false;
  private cockpitOffset = new THREE.Vector3(0, 2.2, -2.2);
  private spec = { maxSpeed: 4200, boostSpeed: 52000, accel: 2600, turnRate: 1 };

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
      const sensitivity = 0.0019;
      this.yaw -= event.movementX * sensitivity;
      this.pitch -= event.movementY * sensitivity;
      this.pitch = Math.max(-Math.PI / 2 + 0.08, Math.min(Math.PI / 2 - 0.08, this.pitch));
    });

    window.addEventListener('keydown', (event) => {
      if (event.code === 'KeyV') {
        this.cameraMode = this.cameraMode === 'third' ? 'first' : 'third';
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

  get speed(): number {
    return this.velocity.length();
  }

  get forwardVector(): THREE.Vector3 {
    return this.forward.copy(new THREE.Vector3(0, 0, -1)).applyQuaternion(this.quaternion);
  }

  configure(spec: { maxSpeed: number; boostSpeed: number; accel: number; turnRate: number }): void {
    this.spec = spec;
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

    /* ── 姿态 ── */
    const attitude = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'),
    );

    const rollRate = (has('KeyQ') ? 1 : 0) - (has('KeyE') ? 1 : 0);
    this.roll = THREE.MathUtils.lerp(this.roll, rollRate * 2.2, Math.min(1, dt * 6));
    this.tmpQ.setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.roll);
    attitude.multiply(this.tmpQ);

    if (!this.ready) {
      this.quaternion.copy(attitude);
      this.ready = true;
    } else {
      this.quaternion.slerp(attitude, Math.min(1, dt * 8 * this.spec.turnRate));
    }

    /* ── 推进 ── */
    const forwardInput = (has('KeyW') || has('ArrowUp') ? 1 : 0) - (has('KeyS') || has('ArrowDown') ? 1 : 0);
    const boosting = (has('ShiftLeft') || has('ShiftRight')) && forwardInput > 0;
    const braking = has('KeyX') || has('Space');

    this.throttle = THREE.MathUtils.lerp(this.throttle, Math.max(0, forwardInput), Math.min(1, dt * 4));
    this.boost = THREE.MathUtils.lerp(this.boost, boosting ? 1 : 0, Math.min(1, dt * 3));
    this.brake = THREE.MathUtils.lerp(this.brake, braking ? 1 : 0, Math.min(1, dt * 6));

    const forward = this.forwardVector;
    const right = this.tmp.set(1, 0, 0).applyQuaternion(this.quaternion).clone();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.quaternion);

    // 前向 / 反推：反推只有 45% 推力
    if (forwardInput > 0) {
      const accel = this.spec.accel + this.boost * this.spec.accel * 16;
      this.velocity.addScaledVector(forward, accel * forwardInput * dt);
    } else if (forwardInput < 0) {
      // forwardInput 是负数，乘上去才是真正的反推
      this.velocity.addScaledVector(forward, 1500 * forwardInput * dt);
    }

    // 侧移
    const strafe = (has('KeyD') ? 1 : 0) - (has('KeyA') ? 1 : 0);
    if (strafe !== 0) this.velocity.addScaledVector(right, strafe * 1800 * dt);

    // 垂直
    const lift = (has('KeyR') ? 1 : 0) - (has('KeyF') ? 1 : 0);
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
    this.updateCamera(dt);
  }

  private updateCamera(dt: number): void {
    const forward = this.forwardVector;
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.quaternion);

    if (this.cameraMode === 'first') {
      const eye = this.position
        .clone()
        .addScaledVector(up, 1.9)
        .addScaledVector(forward, 1.2);
      this.camera.position.lerp(eye, Math.min(1, dt * 16));
      this.camera.up.copy(up);
      this.camera.lookAt(eye.clone().addScaledVector(forward, 40));
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, 74, Math.min(1, dt * 4));
      this.camera.updateProjectionMatrix();
    } else {
      const desired = this.position
        .clone()
        .addScaledVector(forward, -34)
        .addScaledVector(up, 7.2);
      if (this.smoothedOffset.lengthSq() === 0) this.smoothedOffset.copy(desired);
      this.smoothedOffset.lerp(desired, Math.min(1, dt * 5));
      this.camera.position.copy(this.smoothedOffset);
      this.camera.up.copy(up).lerp(new THREE.Vector3(0, 1, 0), 0.12).normalize();
      this.camera.lookAt(this.position.clone().addScaledVector(forward, 30));

      if (this.shake > 0.01) {
        this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.3;
        this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.3;
      }

      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, 62 + this.boost * 8, Math.min(1, dt * 4));
      this.camera.updateProjectionMatrix();
    }
  }
}
