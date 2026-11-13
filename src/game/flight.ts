import * as THREE from 'three';

export type CameraMode = 'third' | 'first';

export class FlightController {
  readonly position = new THREE.Vector3(0, 240, 1400);
  readonly quaternion = new THREE.Quaternion();
  readonly velocity = new THREE.Vector3();

  throttle = 0;
  boost = 0;
  cameraMode: CameraMode = 'third';

  private yaw = 0;
  private pitch = 0;
  private roll = 0;
  private keys = new Set<string>();
  private shake = 0;
  private smoothedOffset = new THREE.Vector3(0, 0, 0);
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly tmp = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly forward = new THREE.Vector3();
  private ready = false;

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    this.camera.position.copy(this.position).add(new THREE.Vector3(0, 12, 40));
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
      const sensitivity = 0.0022;
      this.yaw -= event.movementX * sensitivity;
      this.pitch -= event.movementY * sensitivity;
      this.pitch = Math.max(-Math.PI / 2 + 0.08, Math.min(Math.PI / 2 - 0.08, this.pitch));
    });

    window.addEventListener('keydown', (event) => {
      this.keys.add(event.code);
      if (event.code === 'KeyV') {
        this.cameraMode = this.cameraMode === 'third' ? 'first' : 'third';
      }
    });

    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
    });
  }

  get speed(): number {
    return this.velocity.length();
  }

  get forwardVector(): THREE.Vector3 {
    return this.forward.copy(new THREE.Vector3(0, 0, -1)).applyQuaternion(this.quaternion);
  }

  update(dt: number): void {
    const has = (code: string) => this.keys.has(code);

    // 姿态
    const attitude = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'),
    );

    const rollRate = (has('KeyQ') ? 1 : 0) - (has('KeyE') ? 1 : 0);
    const rollTarget = rollRate * 2.4;
    this.roll = THREE.MathUtils.lerp(this.roll, rollTarget, Math.min(1, dt * 6));
    this.tmpQ.setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.roll);
    attitude.multiply(this.tmpQ);

    if (!this.ready) {
      this.quaternion.copy(attitude);
      this.ready = true;
    } else {
      this.quaternion.slerp(attitude, Math.min(1, dt * 7.5));
    }

    // 推进
    const thrusting = has('KeyW') || has('ArrowUp');
    const braking = has('Space');
    const boosting = has('ShiftLeft') || has('ShiftRight');

    const targetThrottle = thrusting ? 1 : 0;
    this.throttle = THREE.MathUtils.lerp(this.throttle, targetThrottle, Math.min(1, dt * 3.4));
    this.boost = THREE.MathUtils.lerp(this.boost, boosting && thrusting ? 1 : 0, Math.min(1, dt * 2.6));

    const forward = this.forwardVector;
    const accel = 260 + this.boost * 1500;

    if (this.throttle > 0.01) {
      this.velocity.addScaledVector(forward, accel * this.throttle * dt);
    }

    // 侧移
    const strafe = (has('KeyD') ? 1 : 0) - (has('KeyA') ? 1 : 0);
    if (strafe !== 0) {
      this.tmp.set(1, 0, 0).applyQuaternion(this.quaternion);
      this.velocity.addScaledVector(this.tmp, strafe * 150 * dt);
    }

    // 垂直
    const lift = (has('KeyR') ? 1 : 0) - (has('KeyF') ? 1 : 0);
    if (lift !== 0) {
      this.velocity.addScaledVector(this.up, lift * 150 * dt);
    }

    if (braking) {
      this.velocity.multiplyScalar(Math.pow(0.02, dt));
    } else {
      this.velocity.multiplyScalar(Math.pow(0.86, dt));
    }

    const maxSpeed = 320 + this.boost * 1500;
    if (this.velocity.lengthSq() > maxSpeed * maxSpeed) {
      this.velocity.setLength(maxSpeed);
    }

    this.position.addScaledVector(this.velocity, dt);

    this.shake = THREE.MathUtils.lerp(this.shake, this.boost * 0.9 + this.throttle * 0.15, Math.min(1, dt * 4));
    this.updateCamera(dt);
  }

  private updateCamera(dt: number): void {
    const forward = this.forwardVector;
    const right = this.tmp.set(1, 0, 0).applyQuaternion(this.quaternion).clone();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.quaternion);

    if (this.cameraMode === 'first') {
      const eye = this.position.clone().addScaledVector(up, 1.35).addScaledVector(forward, 1.6);
      this.camera.position.lerp(eye, Math.min(1, dt * 14));
      const look = eye.clone().addScaledVector(forward, 40);
      this.camera.up.copy(up);
      this.camera.lookAt(look);
    } else {
      const offset = new THREE.Vector3(0, 4.6, 17.5)
        .addScaledVector(right, 0)
        .addScaledVector(up, 1)
        .addScaledVector(forward, -1);
      const desired = this.position
        .clone()
        .addScaledVector(forward, -30)
        .addScaledVector(up, 8.6);
      if (this.smoothedOffset.lengthSq() === 0) this.smoothedOffset.copy(desired);
      this.smoothedOffset.lerp(desired, Math.min(1, dt * 5.5));
      this.camera.position.copy(this.smoothedOffset);
      this.camera.up.copy(up).lerp(new THREE.Vector3(0, 1, 0), 0.25).normalize();
      this.camera.lookAt(this.position.clone().addScaledVector(forward, 26));

      if (this.shake > 0.01) {
        this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.35;
        this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.35;
      }
    }
  }
}
