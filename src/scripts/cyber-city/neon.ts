import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { HologramSpec, NeonSign, SteamVent } from './layout';

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

function glowText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  blur = 26,
  weight = 700,
  family = '"Helvetica Neue", "PingFang SC", "Hiragino Sans", sans-serif',
): void {
  ctx.save();
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = blur * 0.35;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.55;
  ctx.fillText(text, x, y);
  ctx.restore();
}

export function makeSignCanvas(spec: NeonSign): HTMLCanvasElement {
  const vertical = !!spec.vertical;
  const [c, ctx] = makeCanvas(vertical ? 384 : 1024, vertical ? 1024 : 256);
  ctx.clearRect(0, 0, c.width, c.height);

  if (vertical) {
    const grad = ctx.createLinearGradient(0, 0, c.width, 0);
    grad.addColorStop(0, 'rgba(4,6,9,0.0)');
    grad.addColorStop(0.5, 'rgba(4,6,9,0.18)');
    grad.addColorStop(1, 'rgba(4,6,9,0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = spec.color;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 3;
    ctx.strokeRect(18, 18, c.width - 36, c.height - 36);
    ctx.globalAlpha = 1;
    const n = spec.lines.length;
    spec.lines.forEach((line, i) => {
      const size = i === 0 ? 86 : i === 1 ? 72 : 44;
      const y = c.height * ((i + 0.8) / (n + 0.6));
      glowText(ctx, line, c.width / 2, y, size, spec.color, 28);
    });
  } else {
    const grad = ctx.createLinearGradient(0, 0, 0, c.height);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(0.5, 'rgba(4,7,10,0.2)');
    grad.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = spec.color;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, c.width - 16, c.height - 16);
    ctx.globalAlpha = 1;
    const main = spec.lines[0];
    const sub = spec.lines[1];
    glowText(ctx, main, c.width / 2, c.height * 0.42, 108, spec.color, 30);
    if (sub) glowText(ctx, sub, c.width / 2, c.height * 0.78, 46, '#e8f6ff', 18, 500);
  }
  return c;
}

export function makeSignTexture(spec: NeonSign): THREE.Texture {
  const tex = new THREE.CanvasTexture(makeSignCanvas(spec));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Pack every neon sign into a single atlas + merged geometry.
 * Reduces ~15 sign draw calls to one and keeps all typography crisp.
 */
export function buildSignAtlas(specs: NeonSign[]): { mesh: THREE.Mesh; texture: THREE.Texture } | null {
  const AW = 4096;
  const AH = 2560;
  const canvas = document.createElement('canvas');
  canvas.width = AW;
  canvas.height = AH;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, AW, AH);

  const pad = 8;
  const order = [...specs.filter((s) => s.vertical), ...specs.filter((s) => !s.vertical)];
  const rects = new Map<string, { x: number; y: number; w: number; h: number }>();
  let x = pad;
  let y = pad;
  let rowH = 0;
  for (const spec of order) {
    const c = makeSignCanvas(spec);
    if (x + c.width + pad > AW) {
      x = pad;
      y += rowH + pad;
      rowH = 0;
    }
    if (y + c.height + pad > AH) {
      console.warn('sign atlas overflow', spec.id);
      continue;
    }
    ctx.drawImage(c, x, y);
    rects.set(spec.id, { x, y, w: c.width, h: c.height });
    x += c.width + pad;
    rowH = Math.max(rowH, c.height);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  material.color.setScalar(2.15);

  const geos: THREE.BufferGeometry[] = [];
  for (const spec of specs) {
    const r = rects.get(spec.id);
    if (!r) continue;
    const g = new THREE.PlaneGeometry(spec.width, spec.height);
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i += 1) {
      const u = uv.getX(i);
      const v = uv.getY(i);
      uv.setXY(i, (r.x + u * r.w) / AW, 1 - (r.y + (1 - v) * r.h) / AH);
    }
    uv.needsUpdate = true;
    g.rotateY(spec.yaw);
    g.translate(...spec.pos);
    geos.push(g);
  }
  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  if (!merged) return null;
  const mesh = new THREE.Mesh(merged, material);
  mesh.name = 'neon-atlas';
  mesh.renderOrder = 4;
  mesh.frustumCulled = false;
  return { mesh, texture };
}

export interface SignHandle {
  group: THREE.Group;
  light?: THREE.PointLight;
  reflectionClone: THREE.Object3D;
}

export function createNeonSign(spec: NeonSign): SignHandle {
  const tex = makeSignTexture(spec);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const geo = new THREE.PlaneGeometry(spec.width, spec.height);
  const panel = new THREE.Mesh(geo, mat);
  panel.name = `neon-${spec.id}`;
  panel.position.set(...spec.pos);
  panel.rotation.y = spec.yaw;
  panel.renderOrder = 4;
  const group = new THREE.Group();
  group.add(panel);

  // physical bracket / blade frame (dark, merged later)
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(spec.width + 0.16, spec.height + 0.16, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.55, metalness: 0.6 }),
  );
  frame.position.copy(panel.position);
  frame.rotation.y = spec.yaw;
  frame.translateZ(-0.09);
  frame.castShadow = false;
  frame.receiveShadow = false;
  frame.name = 'sign-frame';
  group.add(frame);

  let light: THREE.PointLight | undefined;
  if (spec.light) {
    light = new THREE.PointLight(new THREE.Color(spec.color), spec.light, 34, 2);
    light.position.copy(panel.position);
    light.position.x += Math.sin(spec.yaw) * 1.1;
    light.position.z += Math.cos(spec.yaw) * 1.1;
    light.position.y += 0.2;
    group.add(light);
  }

  const reflectionClone = new THREE.Mesh(geo, mat);
  reflectionClone.position.copy(panel.position);
  reflectionClone.rotation.copy(panel.rotation);
  reflectionClone.layers.set(2);

  return { group, light, reflectionClone };
}

export interface HologramHandle {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  reflectionClone: THREE.Mesh;
}

export function makeHologramTexture(spec: HologramSpec): THREE.Texture {
  const [c, ctx] = makeCanvas(512, 768);
  ctx.clearRect(0, 0, 512, 768);
  const col = spec.tint;

  // faint grid
  ctx.strokeStyle = col;
  ctx.globalAlpha = 0.09;
  ctx.lineWidth = 1;
  for (let y = 0; y < 768; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }
  for (let x = 0; x < 512; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 768);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.save();
  ctx.strokeStyle = col;
  ctx.shadowColor = col;
  ctx.shadowBlur = 18;
  ctx.lineWidth = 3;
  // abstract head / bust outline
  ctx.beginPath();
  ctx.ellipse(256, 200, 66, 82, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(256, 284);
  ctx.bezierCurveTo(168, 300, 138, 380, 128, 510);
  ctx.lineTo(384, 510);
  ctx.bezierCurveTo(374, 380, 344, 300, 256, 284);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(210, 185);
  ctx.lineTo(240, 185);
  ctx.moveTo(272, 185);
  ctx.lineTo(302, 185);
  ctx.stroke();
  // signal rings
  for (let i = 0; i < 3; i += 1) {
    ctx.globalAlpha = 0.45 - i * 0.1;
    ctx.beginPath();
    ctx.ellipse(256, 200, 110 + i * 32, 128 + i * 34, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  glowText(ctx, spec.text, 256, 590, 92, col, 26);
  glowText(ctx, spec.sub, 256, 660, 24, '#eaffff', 12, 500);
  glowText(ctx, 'SIGNAL // 09', 256, 710, 18, col, 10, 500);
  // horizontal scan slices
  ctx.fillStyle = col;
  for (let i = 0; i < 22; i += 1) {
    ctx.globalAlpha = 0.04 + Math.random() * 0.08;
    ctx.fillRect(0, Math.random() * 768, 512, 1 + Math.random() * 2);
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function createHologram(spec: HologramSpec): HologramHandle {
  const tex = makeHologramTexture(spec);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: tex },
      uTime: { value: 0 },
      uTint: { value: new THREE.Color(spec.tint) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform float uTime;
      uniform vec3 uTint;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(uMap, vUv);
        vec3 rgb = pow(c.rgb, vec3(2.2)) * uTint * 1.8;
        float scan = 0.82 + 0.18 * sin(vUv.y * 620.0 - uTime * 9.0);
        float flicker = 0.92 + 0.08 * sin(uTime * 31.0 + sin(uTime * 2.7) * 4.0);
        float edgeX = smoothstep(0.0, 0.045, vUv.x) * smoothstep(0.0, 0.045, 1.0 - vUv.x);
        float edgeY = smoothstep(0.0, 0.02, vUv.y) * smoothstep(0.0, 0.02, 1.0 - vUv.y);
        float alpha = c.a * 0.55 * scan * flicker * edgeX * edgeY;
        gl_FragColor = vec4(rgb * scan * flicker, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const geo = new THREE.PlaneGeometry(spec.width, spec.height);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(...spec.pos);
  mesh.rotation.y = spec.yaw;
  mesh.renderOrder = 5;
  mesh.name = `hologram-${spec.id}`;

  const reflectionClone = new THREE.Mesh(geo, material);
  reflectionClone.position.copy(mesh.position);
  reflectionClone.rotation.copy(mesh.rotation);
  reflectionClone.layers.set(2);
  reflectionClone.renderOrder = 5;

  return { mesh, material, reflectionClone };
}

export interface RainHandle {
  mesh: THREE.LineSegments;
  update: (time: number, camera: THREE.Camera) => void;
}

export function createRain(): RainHandle {
  const drops = 1800;
  const positions = new Float32Array(drops * 2 * 3);
  const tails = new Float32Array(drops * 2);
  const seeds = new Float32Array(drops * 2);
  let seed = 8821;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  for (let i = 0; i < drops; i += 1) {
    const x = (rand() - 0.5) * 64;
    const y = rand() * 28;
    const z = (rand() - 0.5) * 64;
    const s = rand();
    for (let k = 0; k < 2; k += 1) {
      const idx = (i * 2 + k) * 3;
      positions[idx] = x;
      positions[idx + 1] = y;
      positions[idx + 2] = z;
      tails[i * 2 + k] = k;
      seeds[i * 2 + k] = s;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aTail', new THREE.BufferAttribute(tails, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uCam: { value: new THREE.Vector3() },
    },
    vertexShader: `
      uniform float uTime;
      uniform vec3 uCam;
      attribute float aTail;
      attribute float aSeed;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        p.x += uCam.x;
        p.z += uCam.z;
        float speed = 17.0 + aSeed * 15.0;
        p.y = mod(p.y - uTime * speed, 28.0);
        p.y += aTail * (0.25 + aSeed * 0.45);
        p.x += aTail * 0.06;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        vAlpha = (1.0 - clamp(length(mv.xyz) / 40.0, 0.0, 1.0)) * 0.14;
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      void main() {
        gl_FragColor = vec4(0.62, 0.78, 0.9, vAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.LineSegments(geo, mat);
  mesh.frustumCulled = false;
  mesh.name = 'rain';
  mesh.renderOrder = 8;
  return {
    mesh,
    update: (time: number, camera: THREE.Camera) => {
      mat.uniforms.uTime.value = time;
      mat.uniforms.uCam.value.copy(camera.position);
    },
  };
}

export interface SteamHandle {
  points: THREE.Points;
  update: (time: number) => void;
}

export function createSteam(vents: SteamVent[]): SteamHandle {
  const perVent = 14;
  const count = vents.length * perVent;
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 3);
  let i = 0;
  let seed = 1187;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  for (const vent of vents) {
    for (let k = 0; k < perVent; k += 1) {
      positions[i * 3] = vent.pos[0] + (rand() - 0.5) * 0.7;
      positions[i * 3 + 1] = vent.pos[1] + rand() * 0.4;
      positions[i * 3 + 2] = vent.pos[2] + (rand() - 0.5) * 0.7;
      seeds[i * 3] = vent.scale * (0.6 + rand() * 0.7);
      seeds[i * 3 + 1] = rand();
      seeds[i * 3 + 2] = rand();
      i += 1;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));

  const tex = new THREE.TextureLoader().load(new URL('tex/misc/steam.png', document.baseURI).href);
  tex.colorSpace = THREE.SRGBColorSpace;

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uMap: { value: tex },
    },
    vertexShader: `
      uniform float uTime;
      attribute vec3 aSeed;
      varying float vAlpha;
      varying float vRot;
      void main() {
        float life = fract(aSeed.y + uTime * (0.055 + aSeed.z * 0.04));
        vec3 p = position;
        p.y += life * aSeed.x * 2.8;
        p.x += sin(life * 6.0 + aSeed.z * 6.0) * 0.35 * life;
        p.z += cos(life * 5.0 + aSeed.y * 6.0) * 0.3 * life;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSeed.x * (520.0 / max(1.0, -mv.z));
        vAlpha = sin(life * 3.14159) * 0.12;
        vRot = life * 2.0;
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      varying float vAlpha;
      varying float vRot;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float c = cos(vRot);
        float s = sin(vRot);
        uv = mat2(c, -s, s, c) * uv + 0.5;
        vec4 tex = texture2D(uMap, uv);
        gl_FragColor = vec4(tex.rgb * vec3(0.72, 0.8, 0.88), tex.a * vAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.name = 'steam';
  points.renderOrder = 7;
  return {
    points,
    update: (time: number) => {
      mat.uniforms.uTime.value = time;
    },
  };
}

export interface TrafficHandle {
  points: THREE.Points;
  update: (time: number) => void;
}

export function createTraffic(): TrafficHandle {
  const count = 90;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const roads = new Float32Array(count);
  let seed = 3361;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  const palette = [
    new THREE.Color(0xff4a1f),
    new THREE.Color(0xfff0c8),
    new THREE.Color(0x56d8ff),
    new THREE.Color(0xffc45a),
  ];
  for (let i = 0; i < count; i += 1) {
    const sky = i > 54;
    positions[i * 3] = (rand() - 0.5) * (sky ? 220 : 150);
    positions[i * 3 + 1] = sky ? 26 + rand() * 42 : 0.4 + rand() * 1.1;
    positions[i * 3 + 2] = sky ? 200 + rand() * 180 : 324 + rand() * 7;
    const c = palette[Math.floor(rand() * palette.length)];
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
    seeds[i] = rand();
    roads[i] = sky ? 0.7 + rand() * 0.5 : 2.0 + rand() * 2.4;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geo.setAttribute('aSpeed', new THREE.BufferAttribute(roads, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      uniform float uTime;
      attribute vec3 color;
      attribute float aSeed;
      attribute float aSpeed;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = color;
        vec3 p = position;
        float span = 150.0;
        p.x = mod(p.x + uTime * aSpeed * (aSeed > 0.5 ? 1.0 : -1.0) + span * 0.5, span) - span * 0.5;
        p.y += sin(uTime * 0.4 + aSeed * 6.28) * 0.12;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(180.0 / max(1.0, -mv.z), 1.0, 5.0);
        vAlpha = 0.55 + 0.45 * sin(uTime * 2.0 + aSeed * 12.0);
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.05, length(d)) * vAlpha;
        gl_FragColor = vec4(vColor, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.name = 'distant-traffic';
  points.renderOrder = 6;
  return {
    points,
    update: (time: number) => {
      mat.uniforms.uTime.value = time;
    },
  };
}
