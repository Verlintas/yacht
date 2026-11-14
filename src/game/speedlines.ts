import * as THREE from 'three';

/**
 * 高速拖尾：挂在相机上的屏幕空间流线。
 * 只在加速时出现，中心留空，避免挡住准星。
 */
const COUNT = 120;

interface Streak {
  angle: number;
  radius: number;
  depth: number;
  speed: number;
  length: number;
}

export class SpeedLines {
  readonly object: THREE.LineSegments;
  private geometry: THREE.BufferGeometry;
  private material: THREE.LineBasicMaterial;
  private streaks: Streak[] = [];
  private positions = new Float32Array(COUNT * 6);
  private colors = new Float32Array(COUNT * 6);
  private intensity = 0;

  constructor(private camera: THREE.PerspectiveCamera) {
    for (let i = 0; i < COUNT; i += 1) this.streaks.push(this.spawn(0.25 + Math.random() * 0.7));

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

    this.material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });

    this.object = new THREE.LineSegments(this.geometry, this.material);
    this.object.frustumCulled = false;
    this.object.renderOrder = 20;
    this.camera.add(this.object);
  }

  private spawn(radius = 0.2): Streak {
    return {
      angle: Math.random() * Math.PI * 2,
      radius,
      depth: 14 + Math.random() * 70,
      speed: 0.55 + Math.random() * 0.9,
      length: 0.1 + Math.random() * 0.22,
    };
  }

  update(dt: number, boost: number, speed: number): void {
    const speedFactor = THREE.MathUtils.clamp((speed - 700) / 2200, 0, 1);
    const target = Math.min(1, boost * 1.25 + speedFactor * 0.5);
    this.intensity += (target - this.intensity) * Math.min(1, dt * 4);
    this.material.opacity = this.intensity * 0.72;
    this.object.visible = this.intensity > 0.015;
    if (!this.object.visible) return;

    const aspect = this.camera.aspect || 1;
    const halfH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));

    for (let i = 0; i < COUNT; i += 1) {
      const s = this.streaks[i];
      s.radius += dt * (0.16 + this.intensity * 1.35) * s.speed;
      if (s.radius > 1.2) Object.assign(s, this.spawn(0.18 + Math.random() * 0.22));

      const z = -s.depth;
      const hh = halfH * s.depth;
      const hw = hh * aspect;
      const cos = Math.cos(s.angle);
      const sin = Math.sin(s.angle);
      const x = cos * s.radius * hw;
      const y = sin * s.radius * hh;
      const tail = s.radius + s.length * (0.5 + this.intensity * 1.6);
      const x2 = cos * tail * hw;
      const y2 = sin * tail * hh;
      const z2 = z - s.depth * 0.1 * this.intensity;

      const p = i * 6;
      this.positions[p] = x;
      this.positions[p + 1] = y;
      this.positions[p + 2] = z;
      this.positions[p + 3] = x2;
      this.positions[p + 4] = y2;
      this.positions[p + 5] = z2;

      // 中心暗、外侧亮；顶点色配合加法混合就是透明度
      const fade = THREE.MathUtils.clamp((s.radius - 0.2) / 0.32, 0, 1);
      const bright = this.intensity * fade;
      this.colors[p] = 0;
      this.colors[p + 1] = 0;
      this.colors[p + 2] = 0;
      this.colors[p + 3] = bright * 0.72;
      this.colors[p + 4] = bright * 0.9;
      this.colors[p + 5] = bright;
    }

    (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }
}
