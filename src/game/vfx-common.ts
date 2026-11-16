import * as THREE from 'three';

/**
 * 共用的程序化贴图与 GPU 粒子场。
 *
 * 弹丸/爆炸特效全部走同一套「浏览器内生成贴图 + 一次性分配缓冲区」，
 * 避免每帧 new Vector3 / new Material，也避免每颗鱼雷一个 draw call。
 */

let softTex: THREE.CanvasTexture | null = null;
let fireTex: THREE.CanvasTexture | null = null;
let smokeTex: THREE.CanvasTexture | null = null;
let sparkTex: THREE.CanvasTexture | null = null;

function canvasTexture(size: number, paint: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  paint(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / Math.max(1e-6, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** 柔和圆形辉光，用于引擎光、冲击波和通用粒子 */
export function getSoftTexture(): THREE.CanvasTexture {
  if (softTex) return softTex;
  softTex = canvasTexture(128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.18, 'rgba(255,255,255,0.92)');
    g.addColorStop(0.48, 'rgba(255,255,255,0.32)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
  return softTex;
}

/** 爆炸火球：不规则火焰条纹 + 湍流边缘遮罩，避免每个粒子都是圆点 */
export function getFireTexture(): THREE.CanvasTexture {
  if (fireTex) return fireTex;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  const center = size / 2;
  const palette = [
    ['rgba(255,255,255,1)', 'rgba(255,225,170,0)'],
    ['rgba(255,245,215,0.98)', 'rgba(255,150,55,0)'],
    ['rgba(255,205,120,0.95)', 'rgba(255,90,25,0)'],
    ['rgba(255,140,45,0.9)', 'rgba(180,40,10,0)'],
  ] as const;
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 90; i += 1) {
    const x = center + (Math.random() - 0.5) * size * 0.52;
    const y = center + (Math.random() - 0.5) * size * 0.52;
    const r = 8 + Math.random() * 38;
    const angle = Math.random() * Math.PI * 2;
    const stretch = 0.25 + Math.random() * 0.55;
    const [inner, outer] = palette[Math.floor(Math.random() * palette.length)];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(1, stretch);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, inner);
    g.addColorStop(0.5, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // 用角度噪声咬出不规则边缘，取代完美的圆形 alpha mask
  const image = ctx.getImageData(0, 0, size, size);
  const data = image.data;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const dx = x - center;
      const dy = y - center;
      const r = Math.min(1, Math.hypot(dx, dy) / (size * 0.5));
      const angle = Math.atan2(dy, dx);
      const turbulence = 0.72 + 0.28 * Math.sin(angle * 7.0 + r * 14.0) * Math.cos(angle * 3.0 - r * 9.0);
      const fade = Math.pow(Math.max(0, 1 - r), 1.5) * turbulence;
      data[i + 3] *= Math.max(0, Math.min(1, fade));
    }
  }
  ctx.putImageData(image, 0, 0);
  fireTex = new THREE.CanvasTexture(canvas);
  return fireTex;
}

/** 烟雾团：正常混合，带絮状边缘 */
export function getSmokeTexture(): THREE.CanvasTexture {
  if (smokeTex) return smokeTex;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(size, size);
  const data = image.data;
  const center = size / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x - center) / center;
      const ny = (y - center) / center;
      const r = Math.hypot(nx, ny);
      if (r > 1.02) continue;
      const angle = Math.atan2(ny, nx);
      let n = 0;
      n += 0.5 * Math.sin(nx * 7.1 + 1.3) * Math.cos(ny * 6.3 - 0.7);
      n += 0.25 * Math.sin(nx * 21.7 - 2.1) * Math.cos(ny * 18.2 + 1.4);
      n += 0.125 * Math.sin(nx * 53.3 + 3.2) * Math.cos(ny * 47.7 - 2.4);
      n = n * 0.5 + 0.5;
      const edge = 1 - smoothstep(0.18, 0.98, r);
      const lobed = 0.62 + 0.38 * Math.sin(angle * 5 + r * 9);
      let alpha = Math.pow(n, 2.0) * edge * lobed * 0.95;
      // 细丝/破洞：让烟团边缘不闭合
      alpha *= 0.72 + 0.28 * Math.sin(nx * 39 + ny * 31 + 2.2);
      if (alpha <= 0.002) continue;
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.max(0, Math.min(255, alpha * 255));
    }
  }
  ctx.putImageData(image, 0, 0);
  smokeTex = new THREE.CanvasTexture(canvas);
  return smokeTex;
}

/** 火花/余烬：小亮核 + 细微星芒 */
export function getSparkTexture(): THREE.CanvasTexture {
  if (sparkTex) return sparkTex;
  sparkTex = canvasTexture(64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.16, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(9, 32); ctx.lineTo(55, 32);
    ctx.moveTo(32, 9); ctx.lineTo(32, 55);
    ctx.stroke();
  });
  return sparkTex;
}

export interface ParticleFieldOptions {
  capacity: number;
  texture: THREE.Texture;
  blending: THREE.Blending;
  renderOrder?: number;
  /** 透明度衰减指数：越大越快消失 */
  fadePower?: number;
  /** 颜色随寿命向结束色插值的指数 */
  colorPower?: number;
  /** 贴图 RGB 对粒子颜色的调制强度（火焰贴图有内部颜色纹理） */
  textureColor?: number;
}

/**
 * 固定容量的 GPU 点粒子场。
 *
 * 所有粒子共用一个 BufferGeometry / 一个 ShaderMaterial / 一个 draw call。
 * 粒子位置、颜色、尺寸、透明度都在 CPU 端更新，但缓冲区只分配一次。
 */
export class ParticleField {
  readonly points: THREE.Points;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly capacity: number;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly sizes: Float32Array;
  private readonly alphas: Float32Array;
  private readonly rotations: Float32Array;
  private readonly velocities: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly baseSize: Float32Array;
  private readonly growth: Float32Array;
  private readonly drag: Float32Array;
  private readonly spin: Float32Array;
  private readonly baseAlpha: Float32Array;
  private readonly colorStart: Float32Array;
  private readonly colorEnd: Float32Array;
  private readonly fadePower: number;
  private readonly colorPower: number;
  private cursor = 0;
  private live = 0;
  private dirty = false;
  private pixelScale = 500;

  constructor(scene: THREE.Scene, options: ParticleFieldOptions) {
    this.capacity = options.capacity;
    this.fadePower = options.fadePower ?? 1.25;
    this.colorPower = options.colorPower ?? 1;
    this.positions = new Float32Array(options.capacity * 3);
    this.colors = new Float32Array(options.capacity * 3);
    this.sizes = new Float32Array(options.capacity);
    this.alphas = new Float32Array(options.capacity);
    this.rotations = new Float32Array(options.capacity);
    this.velocities = new Float32Array(options.capacity * 3);
    this.life = new Float32Array(options.capacity);
    this.maxLife = new Float32Array(options.capacity);
    this.baseSize = new Float32Array(options.capacity);
    this.growth = new Float32Array(options.capacity);
    this.drag = new Float32Array(options.capacity);
    this.spin = new Float32Array(options.capacity);
    this.baseAlpha = new Float32Array(options.capacity);
    this.colorStart = new Float32Array(options.capacity * 3);
    this.colorEnd = new Float32Array(options.capacity * 3);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aRot', new THREE.BufferAttribute(this.rotations, 1).setUsage(THREE.DynamicDrawUsage));

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: options.texture },
        uPixelScale: { value: this.pixelScale },
        uTextureColor: { value: options.textureColor ?? 0 },
      },
      vertexShader: /* glsl */ `
        uniform float uPixelScale;
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        attribute float aRot;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vRot;
        void main() {
          vColor = aColor;
          vAlpha = aAlpha;
          vRot = aRot;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(aSize * uPixelScale / max(1.0, -mv.z), 1.0, 1200.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        uniform float uTextureColor;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vRot;
        void main() {
          float c = cos(vRot);
          float s = sin(vRot);
          vec2 uv = gl_PointCoord - 0.5;
          uv = mat2(c, -s, s, c) * uv + 0.5;
          if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
          vec4 tex = texture2D(uMap, uv);
          float alpha = tex.a * vAlpha;
          if (alpha < 0.003) discard;
          vec3 tint = mix(vec3(1.0), tex.rgb, uTextureColor);
          gl_FragColor = vec4(vColor * tint, alpha);
        }
      `,
      transparent: true,
      blending: options.blending,
      depthWrite: false,
      depthTest: true,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = options.renderOrder ?? 4;
    this.points.visible = false;
    scene.add(this.points);
  }

  private advanceViewport(): void {
    // 点的 gl_PointSize 是像素单位；按当前窗口高度换算世界尺寸
    const height = (typeof window !== 'undefined' ? window.innerHeight : 900) * (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
    const next = Math.max(120, height * 0.5);
    if (Math.abs(next - this.pixelScale) > 1) {
      this.pixelScale = next;
      this.material.uniforms.uPixelScale.value = next;
    }
  }

  spawn(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    life: number,
    size: number,
    growth: number,
    start: THREE.Color,
    end: THREE.Color,
    alpha: number,
    drag: number,
    rotation = Math.random() * Math.PI * 2,
    spin = 0,
  ): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;

    if (this.life[i] <= 0) this.live += 1;
    this.points.visible = true;
    const p = i * 3;
    this.positions[p] = x;
    this.positions[p + 1] = y;
    this.positions[p + 2] = z;
    this.velocities[p] = vx;
    this.velocities[p + 1] = vy;
    this.velocities[p + 2] = vz;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.baseSize[i] = size;
    this.sizes[i] = size;
    this.growth[i] = growth;
    this.drag[i] = drag;
    this.rotations[i] = rotation;
    this.spin[i] = spin;
    this.baseAlpha[i] = alpha;
    this.alphas[i] = 0;
    this.colors[p] = start.r;
    this.colors[p + 1] = start.g;
    this.colors[p + 2] = start.b;
    this.colorStart[p] = start.r;
    this.colorStart[p + 1] = start.g;
    this.colorStart[p + 2] = start.b;
    this.colorEnd[p] = end.r;
    this.colorEnd[p + 1] = end.g;
    this.colorEnd[p + 2] = end.b;
    this.dirty = true;
  }

  update(dt: number): void {
    this.advanceViewport();
    if (this.live <= 0) {
      this.points.visible = false;
      return;
    }
    let live = 0;
    for (let i = 0; i < this.capacity; i += 1) {
      const remaining = this.life[i];
      if (remaining <= 0) continue;
      const next = remaining - dt;
      const p = i * 3;
      if (next <= 0) {
        this.life[i] = 0;
        this.alphas[i] = 0;
        this.sizes[i] = 0;
        continue;
      }
      live += 1;
      this.life[i] = next;
      const t = 1 - next / this.maxLife[i];
      const damp = Math.max(0, 1 - this.drag[i] * dt);
      this.velocities[p] *= damp;
      this.velocities[p + 1] *= damp;
      this.velocities[p + 2] *= damp;
      this.positions[p] += this.velocities[p] * dt;
      this.positions[p + 1] += this.velocities[p + 1] * dt;
      this.positions[p + 2] += this.velocities[p + 2] * dt;

      const sizeT = 1 + this.growth[i] * t;
      this.sizes[i] = this.baseSize[i] * sizeT;
      const fadeIn = t < 0.06 ? t / 0.06 : 1;
      this.alphas[i] = this.baseAlpha[i] * fadeIn * Math.pow(1 - t, this.fadePower);
      this.rotations[i] += this.spin[i] * dt;

      const k = Math.pow(t, this.colorPower);
      this.colors[p] = this.colorStart[p] + (this.colorEnd[p] - this.colorStart[p]) * k;
      this.colors[p + 1] = this.colorStart[p + 1] + (this.colorEnd[p + 1] - this.colorStart[p + 1]) * k;
      this.colors[p + 2] = this.colorStart[p + 2] + (this.colorEnd[p + 2] - this.colorStart[p + 2]) * k;
    }
    this.live = live;
    this.dirty = true;
    if (this.dirty) {
      this.geometry.attributes.position.needsUpdate = true;
      this.geometry.attributes.aColor.needsUpdate = true;
      this.geometry.attributes.aSize.needsUpdate = true;
      this.geometry.attributes.aAlpha.needsUpdate = true;
      this.geometry.attributes.aRot.needsUpdate = true;
      this.dirty = false;
    }
  }

  get liveCount(): number {
    return this.live;
  }

  get maxCount(): number {
    return this.capacity;
  }

  dispose(): void {
    this.points.parent?.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
  }
}

/** 线性插值工具，避免热路径创建颜色对象 */
export function mixColor(out: THREE.Color, a: THREE.Color, b: THREE.Color, t: number): THREE.Color {
  out.setRGB(
    a.r + (b.r - a.r) * t,
    a.g + (b.g - a.g) * t,
    a.b + (b.b - a.b) * t,
  );
  return out;
}

/** 世界空间中的正交基，用于抖动/螺旋偏移 */
export function basisForDirection(
  direction: THREE.Vector3,
  right: THREE.Vector3,
  up: THREE.Vector3,
): void {
  // 尽量选一个不与方向平行的参考轴，避免叉积退化
  if (Math.abs(direction.y) < 0.9) {
    right.set(0, 1, 0).cross(direction).normalize();
  } else {
    right.set(1, 0, 0).cross(direction).normalize();
  }
  up.crossVectors(direction, right).normalize();
}
