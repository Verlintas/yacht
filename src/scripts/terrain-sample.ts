/**
 * Anvil Landing authored-terrain sample.
 *
 * Loads the committed R16 heightmap from /terrain-sample/, builds the terrain
 * mesh and a low-poly port, then drives an orbit camera with an optional
 * first-person walk mode. No terrain noise is generated at runtime.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

interface TerrainMeta {
  name: string;
  seed: number;
  grid: { width: number; height: number; spacing_m: number };
  tile_size_m: number;
  heightmap: { file: string; height_scale_m: number; sha256: string };
  elevation: { min_m: number; max_m: number; ridge_peak_m: number; canyon_floor_m: number; pad_m: number };
  apron: { size_m: [number, number]; elevation_m: number };
  pad: { size_m: [number, number]; elevation_m: number };
}

const BASE = import.meta.env.BASE_URL.replace(/\/+$/, '');

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Tiny deterministic PRNG for cosmetic detail only. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvasTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // Keep anisotropy at 1: SwiftShader produces banding with anisotropic
  // filtering on the large canvas textures used by the apron.
  texture.anisotropy = 1;
  return texture;
}

function makeTextTexture(
  text: string,
  color = '#f1ead9',
  background = 'rgba(0,0,0,0)',
  width = 1024,
  height = 256,
): THREE.CanvasTexture {
  return makeCanvasTexture(width, height, (ctx) => {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.floor(height * 0.44)}px "SF Mono", "JetBrains Mono", Menlo, monospace`;
    ctx.fillText(text, width / 2, height / 2 + height * 0.015);
  });
}

function makeGlowTexture(): THREE.CanvasTexture {
  return makeCanvasTexture(128, 128, (ctx) => {
    const gradient = ctx.createRadialGradient(64, 64, 1, 64, 64, 62);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.16, 'rgba(255,248,210,0.92)');
    gradient.addColorStop(0.46, 'rgba(255,224,160,0.26)');
    gradient.addColorStop(1, 'rgba(255,210,120,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
  });
}

function makeApronTexture(): THREE.CanvasTexture {
  const width = 2048;
  const height = 1268;
  return makeCanvasTexture(width, height, (ctx) => {
    const rng = mulberry32(87_331);
    const pxX = width / 420;
    const pxZ = height / 260;

    ctx.fillStyle = '#62635b';
    ctx.fillRect(0, 0, width, height);

    // Aggregate speckle and worn patches.
    for (let i = 0; i < 12000; i += 1) {
      const shade = 60 + Math.floor(rng() * 45);
      ctx.fillStyle = `rgba(${shade},${shade + 1},${shade - 2},${0.05 + rng() * 0.16})`;
      const x = rng() * width;
      const y = rng() * height;
      const r = 0.5 + rng() * 2.2;
      ctx.fillRect(x, y, r, r);
    }
    for (let i = 0; i < 36; i += 1) {
      const x = rng() * width;
      const y = rng() * height;
      const rx = 18 + rng() * 90;
      const ry = 12 + rng() * 55;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
      gradient.addColorStop(0, `rgba(25,25,23,${0.05 + rng() * 0.09})`);
      gradient.addColorStop(1, 'rgba(25,25,23,0)');
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(rx, ry), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Expansion joints every 20 m.
    ctx.strokeStyle = 'rgba(15,18,18,0.28)';
    ctx.lineWidth = 2;
    for (let m = 20; m < 420; m += 20) {
      const x = m * pxX;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let m = 20; m < 260; m += 20) {
      const y = m * pxZ;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // White apron perimeter, 4 m inset.
    ctx.strokeStyle = 'rgba(230,228,215,0.7)';
    ctx.lineWidth = 0.55 * pxX;
    ctx.strokeRect(4 * pxX, 4 * pxZ, width - 8 * pxX, height - 8 * pxZ);

    // Yellow taxi lead-in lines to the pad, stopping at the 60 m box.
    const cy = height / 2;
    ctx.strokeStyle = 'rgba(214,174,60,0.88)';
    ctx.lineWidth = 0.55 * pxZ;
    ctx.beginPath();
    ctx.moveTo(8 * pxX, cy);
    ctx.lineTo(width / 2 - 31 * pxX, cy);
    ctx.moveTo(width / 2 + 31 * pxX, cy);
    ctx.lineTo(width - 8 * pxX, cy);
    ctx.stroke();

    // Faint service lane and parking boxes near the terminal (north-west).
    ctx.strokeStyle = 'rgba(225,223,210,0.36)';
    ctx.lineWidth = 0.18 * pxX;
    for (let i = 0; i < 5; i += 1) {
      const x = 24 * pxX + i * 8 * pxX;
      const y = 12 * pxZ;
      ctx.strokeRect(x, y, 7 * pxX, 14 * pxZ);
    }

    // Drain covers.
    ctx.fillStyle = 'rgba(30,32,30,0.75)';
    for (let i = 0; i < 10; i += 1) {
      const x = (25 + rng() * 370) * pxX;
      const y = (15 + rng() * 230) * pxZ;
      ctx.fillRect(x, y, 0.7 * pxX, 0.7 * pxZ);
    }
  });
}

function makePadTexture(): THREE.CanvasTexture {
  const size = 1024;
  return makeCanvasTexture(size, size, (ctx) => {
    const rng = mulberry32(88_411);
    const m = size / 60;
    const c = size / 2;

    ctx.fillStyle = '#4c4f4b';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 6000; i += 1) {
      const shade = 58 + Math.floor(rng() * 38);
      ctx.fillStyle = `rgba(${shade},${shade},${shade - 3},${0.06 + rng() * 0.14})`;
      ctx.fillRect(rng() * size, rng() * size, 1 + rng() * 2, 1 + rng() * 2);
    }

    // Worn tyre arcs around the aiming circle.
    ctx.strokeStyle = 'rgba(20,22,22,0.12)';
    ctx.lineWidth = 1.3 * m;
    for (let i = 0; i < 5; i += 1) {
      ctx.beginPath();
      ctx.arc(c, c, (10 + i * 2.1) * m, 0.25 * Math.PI, 1.75 * Math.PI);
      ctx.stroke();
    }

    // Outer border, inset 2 m.
    ctx.strokeStyle = '#eee9d9';
    ctx.lineWidth = 0.85 * m;
    ctx.strokeRect(2 * m, 2 * m, size - 4 * m, size - 4 * m);

    // Touchdown circle, 44 m diameter.
    ctx.strokeStyle = '#f1ecdc';
    ctx.lineWidth = 0.9 * m;
    ctx.beginPath();
    ctx.arc(c, c, 22 * m, 0, Math.PI * 2);
    ctx.stroke();

    // Painted H, 17 m tall, 13 m wide.
    ctx.fillStyle = '#f4efe0';
    ctx.fillRect(c - 8.5 * m, c - 8.5 * m, 2.8 * m, 17 * m);
    ctx.fillRect(c + 5.7 * m, c - 8.5 * m, 2.8 * m, 17 * m);
    ctx.fillRect(c - 5.9 * m, c - 1.4 * m, 11.8 * m, 2.8 * m);

    // Corner brackets.
    ctx.lineWidth = 0.75 * m;
    ctx.strokeStyle = '#e9e4d4';
    const inset = 5 * m;
    const arm = 4.4 * m;
    const corners: Array<[number, number, number, number]> = [
      [inset, inset, 1, 1],
      [size - inset, inset, -1, 1],
      [inset, size - inset, 1, -1],
      [size - inset, size - inset, -1, -1],
    ];
    for (const [x, y, dx, dy] of corners) {
      ctx.beginPath();
      ctx.moveTo(x + dx * arm, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + dy * arm);
      ctx.stroke();
    }

    // Threshold bars on the approach side (west).
    ctx.fillStyle = 'rgba(240,235,221,0.75)';
    for (let i = 0; i < 4; i += 1) {
      ctx.fillRect(5.2 * m, (21 + i * 4.4) * m, 3.2 * m, 2.1 * m);
    }

    // Small TLOF / 60 m captions.
    ctx.fillStyle = 'rgba(240,235,221,0.78)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${Math.floor(2.0 * m)}px "SF Mono", "JetBrains Mono", Menlo, monospace`;
    ctx.save();
    ctx.translate(c, 9.2 * m);
    ctx.fillText('TLOF', 0, 0);
    ctx.restore();
    ctx.save();
    ctx.translate(c, size - 9.2 * m);
    ctx.fillText('60 × 60 m', 0, 0);
    ctx.restore();
  });
}

function makeAwningTexture(): THREE.CanvasTexture {
  return makeCanvasTexture(512, 128, (ctx) => {
    ctx.fillStyle = '#d8cfa9';
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#2f7770';
    for (let x = 0; x < 512; x += 64) {
      ctx.fillRect(x, 0, 32, 128);
    }
  });
}

function makeWindowTexture(): THREE.CanvasTexture {
  return makeCanvasTexture(512, 128, (ctx) => {
    ctx.fillStyle = '#1d2f34';
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = 'rgba(121,186,196,0.28)';
    for (let x = 2; x < 512; x += 38) {
      ctx.fillRect(x, 4, 30, 120);
    }
    ctx.strokeStyle = '#0a1418';
    ctx.lineWidth = 3;
    for (let x = 0; x < 512; x += 38) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 128);
      ctx.stroke();
    }
  });
}

function addBox(
  parent: THREE.Object3D,
  size: [number, number, number],
  material: THREE.Material,
  position: [number, number, number],
  rotation?: [number, number, number],
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addCylinder(
  parent: THREE.Object3D,
  radiusTop: number,
  radiusBottom: number,
  height: number,
  segments: number,
  material: THREE.Material,
  position: [number, number, number],
  rotation?: [number, number, number],
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), material);
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export async function initTerrainSample(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#terrain-canvas');
  const stage = document.querySelector<HTMLElement>('#terrain-stage');
  const loading = document.querySelector<HTMLElement>('#terrain-loading');
  const errorBox = document.querySelector<HTMLElement>('#terrain-error');
  if (!canvas || !stage) return;

  try {
    const metaResponse = await fetch(`${BASE}/terrain-sample/meta.json`);
    if (!metaResponse.ok) throw new Error(`meta.json → HTTP ${metaResponse.status}`);
    const meta = (await metaResponse.json()) as TerrainMeta;

    const mapResponse = await fetch(`${BASE}/terrain-sample/${meta.heightmap.file}`);
    if (!mapResponse.ok) throw new Error(`${meta.heightmap.file} → HTTP ${mapResponse.status}`);
    const buffer = await mapResponse.arrayBuffer();

    const expected = meta.grid.width * meta.grid.height * 2;
    if (buffer.byteLength !== expected) {
      throw new Error(`heightmap is ${buffer.byteLength} B, expected ${expected} B`);
    }

    boot(canvas, stage, meta, buffer, loading, errorBox);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (loading) loading.textContent = 'HEIGHTMAP LOAD FAILED';
    if (errorBox) {
      errorBox.hidden = false;
      errorBox.textContent = `地形加载失败：${message}`;
    }
    console.error('[terrain-sample]', error);
  }
}

function boot(
  canvas: HTMLCanvasElement,
  stage: HTMLElement,
  meta: TerrainMeta,
  buffer: ArrayBuffer,
  loading: HTMLElement | null,
  errorBox: HTMLElement | null,
): void {
  const gridWidth = meta.grid.width;
  const gridHeight = meta.grid.height;
  const spacing = meta.grid.spacing_m;
  const tile = meta.tile_size_m;
  const half = tile / 2;
  const scale = meta.heightmap.height_scale_m;
  const padElevation = meta.apron.elevation_m;
  const apronW = meta.apron.size_m[0];
  const apronD = meta.apron.size_m[1];
  const padW = meta.pad.size_m[0];
  const padD = meta.pad.size_m[1];

  const view = new DataView(buffer);
  const heights = new Float32Array(gridWidth * gridHeight);
  for (let i = 0; i < heights.length; i += 1) {
    heights[i] = (view.getUint16(i * 2, true) / 65535) * scale;
  }

  // Locate a representative ridge summit for the floating feature label.
  let ridgePeakX = -390;
  let ridgePeakZ = 40;
  let ridgePeakH = -Infinity;
  for (let row = 0; row < gridHeight; row += 1) {
    const z = -half + row * spacing;
    if (Math.abs(z) > 330) continue;
    for (let col = 0; col < gridWidth; col += 1) {
      const x = -half + col * spacing;
      if (x > -250) continue;
      const h = heights[row * gridWidth + col];
      if (h > ridgePeakH) {
        ridgePeakH = h;
        ridgePeakX = x;
        ridgePeakZ = z;
      }
    }
  }

  const heightAt = (x: number, z: number): number => {
    const gx = clamp((x + half) / spacing, 0, gridWidth - 1.000001);
    const gz = clamp((z + half) / spacing, 0, gridHeight - 1.000001);
    const x0 = Math.floor(gx);
    const z0 = Math.floor(gz);
    const x1 = Math.min(x0 + 1, gridWidth - 1);
    const z1 = Math.min(z0 + 1, gridHeight - 1);
    const tx = gx - x0;
    const tz = gz - z0;
    const h00 = heights[z0 * gridWidth + x0];
    const h10 = heights[z0 * gridWidth + x1];
    const h01 = heights[z1 * gridWidth + x0];
    const h11 = heights[z1 * gridWidth + x1];
    return (
      h00 * (1 - tx) * (1 - tz) +
      h10 * tx * (1 - tz) +
      h01 * (1 - tx) * tz +
      h11 * tx * tz
    );
  };

  const apronTop = padElevation + 0.18;
  const padTop = padElevation + 0.25;

  const groundAt = (x: number, z: number): number => {
    let ground = heightAt(x, z);
    if (Math.abs(x) <= apronW / 2 && Math.abs(z) <= apronD / 2) ground = Math.max(ground, apronTop);
    if (Math.abs(x) <= padW / 2 && Math.abs(z) <= padD / 2) ground = Math.max(ground, padTop);
    return ground;
  };

  // -------------------------------------------------------------------------
  // Renderer / scene / camera
  // -------------------------------------------------------------------------

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.03;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xaec4cc, 0.00016);

  const camera = new THREE.PerspectiveCamera(46, 1, 0.8, 26000);
  camera.position.set(100, 100, 135);

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, padElevation + 4, -10);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.minDistance = 8;
  controls.maxDistance = 2800;
  controls.maxPolarAngle = Math.PI * 0.492;
  controls.screenSpacePanning = false;
  controls.update();

  const sunDirection = new THREE.Vector3(0.55, 0.5, 0.34).normalize();

  // -------------------------------------------------------------------------
  // Sky
  // -------------------------------------------------------------------------

  const skyMaterial = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color('#4a83b9') },
      horizonColor: { value: new THREE.Color('#c7d9de') },
      lowColor: { value: new THREE.Color('#9fb9c0') },
      sunColor: { value: new THREE.Color('#ffe3b1') },
      sunDirection: { value: sunDirection.clone() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 lowColor;
      uniform vec3 sunColor;
      uniform vec3 sunDirection;
      varying vec3 vWorld;
      void main() {
        vec3 dir = normalize(vWorld);
        float height = clamp(dir.y, -0.2, 1.0);
        vec3 sky = mix(horizonColor, topColor, pow(clamp(height, 0.0, 1.0), 0.52));
        sky = mix(lowColor, sky, smoothstep(-0.16, 0.05, height));
        float sun = max(dot(dir, normalize(sunDirection)), 0.0);
        sky += sunColor * pow(sun, 900.0) * 4.0;
        sky += sunColor * pow(sun, 14.0) * 0.18;
        gl_FragColor = vec4(sky, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(15000, 32, 20), skyMaterial);
  scene.add(sky);

  // -------------------------------------------------------------------------
  // Lights
  // -------------------------------------------------------------------------

  const sun = new THREE.DirectionalLight(0xfff0d4, 2.9);
  sun.position.copy(sunDirection).multiplyScalar(1200);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -300;
  sun.shadow.camera.right = 300;
  sun.shadow.camera.top = 300;
  sun.shadow.camera.bottom = -300;
  sun.shadow.camera.near = 450;
  sun.shadow.camera.far = 2100;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.65;
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(0xd9ecff, 0x5c5748, 0.62);
  scene.add(hemi);

  // -------------------------------------------------------------------------
  // Sea and tile skirt (makes the 1 km tile read as an authored block)
  // -------------------------------------------------------------------------

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(16000, 16000),
    new THREE.MeshPhongMaterial({
      color: 0x235761,
      specular: 0xa8ccd4,
      shininess: 58,
      emissive: 0x06161b,
      emissiveIntensity: 0.4,
    }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = 0;
  sea.receiveShadow = false;
  scene.add(sea);

  const skirtPositions: number[] = [];
  const skirtColors: number[] = [];
  const bottomColor = new THREE.Color('#393a35');
  const topColor = new THREE.Color('#807966');
  const pushSkirt = (ax: number, az: number, ah: number, bx: number, bz: number, bh: number): void => {
    const bottom = 0;
    skirtPositions.push(ax, ah, az, ax, bottom, az, bx, bh, bz);
    skirtPositions.push(ax, bottom, az, bx, bottom, bz, bx, bh, bz);
    const topShade = topColor.clone().multiplyScalar(0.82 + (ah / 200) * 0.35);
    const topB = topColor.clone().multiplyScalar(0.82 + (bh / 200) * 0.35);
    skirtColors.push(topShade.r, topShade.g, topShade.b);
    skirtColors.push(bottomColor.r, bottomColor.g, bottomColor.b);
    skirtColors.push(topB.r, topB.g, topB.b);
    skirtColors.push(bottomColor.r, bottomColor.g, bottomColor.b);
    skirtColors.push(bottomColor.r, bottomColor.g, bottomColor.b);
    skirtColors.push(topB.r, topB.g, topB.b);
  };

  for (let i = 0; i < gridWidth - 1; i += 1) {
    const x0 = -half + i * spacing;
    const x1 = x0 + spacing;
    pushSkirt(x0, -half, heights[i], x1, -half, heights[i + 1]);
    const south0 = heights[(gridHeight - 1) * gridWidth + i];
    const south1 = heights[(gridHeight - 1) * gridWidth + i + 1];
    pushSkirt(x0, half, south0, x1, half, south1);
    const west0 = heights[i * gridWidth];
    const west1 = heights[(i + 1) * gridWidth];
    pushSkirt(-half, -half + i * spacing, west0, -half, -half + (i + 1) * spacing, west1);
    const east0 = heights[i * gridWidth + gridWidth - 1];
    const east1 = heights[(i + 1) * gridWidth + gridWidth - 1];
    pushSkirt(half, -half + i * spacing, east0, half, -half + (i + 1) * spacing, east1);
  }
  const skirtGeometry = new THREE.BufferGeometry();
  skirtGeometry.setAttribute('position', new THREE.Float32BufferAttribute(skirtPositions, 3));
  skirtGeometry.setAttribute('color', new THREE.Float32BufferAttribute(skirtColors, 3));
  skirtGeometry.computeVertexNormals();
  const skirt = new THREE.Mesh(
    skirtGeometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      metalness: 0,
      side: THREE.DoubleSide,
      flatShading: true,
    }),
  );
  skirt.receiveShadow = true;
  scene.add(skirt);

  // -------------------------------------------------------------------------
  // Terrain mesh + vertex colours
  // -------------------------------------------------------------------------

  const terrainGeometry = new THREE.PlaneGeometry(tile, tile, gridWidth - 1, gridHeight - 1);
  terrainGeometry.rotateX(-Math.PI / 2);
  const position = terrainGeometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < heights.length; i += 1) {
    position.setY(i, heights[i]);
  }
  position.needsUpdate = true;
  terrainGeometry.computeVertexNormals();
  const normals = terrainGeometry.attributes.normal as THREE.BufferAttribute;

  const lowColor = new THREE.Color('#7c7a52');
  const midColor = new THREE.Color('#50683f');
  const highColor = new THREE.Color('#8b8d76');
  const rockColor = new THREE.Color('#545247');
  const snowColor = new THREE.Color('#e4e9e2');
  const vertexColors = new Float32Array(heights.length * 3);
  const color = new THREE.Color();
  for (let i = 0; i < heights.length; i += 1) {
    const h = heights[i];
    const t = clamp((h - 12) / 140, 0, 1);
    color.copy(lowColor).lerp(midColor, smoothstep(0.04, 0.34, t));
    color.lerp(highColor, smoothstep(0.5, 0.82, t));
    const slope = clamp((1 - normals.getY(i) - 0.015) / 0.22, 0, 1);
    color.lerp(rockColor, slope * 0.88);
    const snow = smoothstep(128, 150, h) * (1 - slope * 0.6);
    color.lerp(snowColor, snow);
    // Subtle large-scale mottling so the mesh does not look like a gradient.
    const x = position.getX(i);
    const z = position.getZ(i);
    const mottle = Math.sin(x * 0.031 + z * 0.017) * Math.cos(z * 0.043 - x * 0.012);
    const lum = 0.93 + mottle * 0.055 + Math.sin(x * 0.24 + z * 0.19) * 0.018;
    color.multiplyScalar(lum);
    vertexColors[i * 3] = color.r;
    vertexColors[i * 3 + 1] = color.g;
    vertexColors[i * 3 + 2] = color.b;
  }
  terrainGeometry.setAttribute('color', new THREE.BufferAttribute(vertexColors, 3));

  const terrain = new THREE.Mesh(
    terrainGeometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.97,
      metalness: 0,
    }),
  );
  terrain.receiveShadow = true;
  scene.add(terrain);

  // -------------------------------------------------------------------------
  // Materials
  // -------------------------------------------------------------------------

  const mat = {
    concrete: new THREE.MeshStandardMaterial({ color: 0xb8b5aa, roughness: 0.88 }),
    concreteDark: new THREE.MeshStandardMaterial({ color: 0x73736c, roughness: 0.92 }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x18353d,
      metalness: 0.65,
      roughness: 0.16,
      emissive: 0x0d262c,
      emissiveIntensity: 0.55,
    }),
    hull: new THREE.MeshStandardMaterial({
      color: 0xc3c8c9,
      metalness: 0.4,
      roughness: 0.48,
      side: THREE.DoubleSide,
    }),
    hullDark: new THREE.MeshStandardMaterial({ color: 0x596166, metalness: 0.65, roughness: 0.4 }),
    teal: new THREE.MeshStandardMaterial({ color: 0x2f8f88, metalness: 0.45, roughness: 0.42 }),
    orange: new THREE.MeshStandardMaterial({ color: 0xd8622c, roughness: 0.55 }),
    black: new THREE.MeshStandardMaterial({ color: 0x171b1c, roughness: 0.7 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x8b9194, metalness: 0.8, roughness: 0.32 }),
    crate: new THREE.MeshStandardMaterial({ color: 0x8b7c59, roughness: 0.85 }),
    crateDark: new THREE.MeshStandardMaterial({ color: 0x4a4434, roughness: 0.9 }),
    rock: new THREE.MeshStandardMaterial({ color: 0x6e6a5f, roughness: 1, flatShading: true }),
    white: new THREE.MeshStandardMaterial({ color: 0xf0ede2, roughness: 0.55 }),
  };

  // -------------------------------------------------------------------------
  // Apron and TLOF
  // -------------------------------------------------------------------------

  const apronGroup = new THREE.Group();
  const apronBase = addBox(apronGroup, [apronW, 1.9, apronD], mat.concreteDark, [0, apronTop - 1.02, 0]);
  apronBase.castShadow = false;
  const apronSurface = new THREE.Mesh(
    new THREE.PlaneGeometry(apronW, apronD),
    new THREE.MeshStandardMaterial({
      map: makeApronTexture(),
      roughness: 0.92,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
    }),
  );
  apronSurface.rotation.x = -Math.PI / 2;
  apronSurface.position.y = apronTop + 0.02;
  apronSurface.receiveShadow = true;
  apronGroup.add(apronSurface);

  const padSurface = new THREE.Mesh(
    new THREE.PlaneGeometry(padW, padD),
    new THREE.MeshStandardMaterial({
      map: makePadTexture(),
      roughness: 0.9,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -3,
    }),
  );
  padSurface.rotation.x = -Math.PI / 2;
  padSurface.position.y = padTop + 0.02;
  padSurface.receiveShadow = true;
  apronGroup.add(padSurface);
  scene.add(apronGroup);

  // Pad edge lights and approach lights.
  const glowTexture = makeGlowTexture();
  const lightGeo = new THREE.SphereGeometry(0.24, 10, 8);
  const approachMat = new THREE.MeshStandardMaterial({
    color: 0xfff7df,
    emissive: 0xffe9b5,
    emissiveIntensity: 4.2,
    toneMapped: false,
  });
  const greenMat = new THREE.MeshStandardMaterial({
    color: 0x8fffb0,
    emissive: 0x38ff78,
    emissiveIntensity: 3.2,
    toneMapped: false,
  });
  const lensSpriteMaterial = new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xffeec4,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const greenSpriteMaterial = lensSpriteMaterial.clone();
  greenSpriteMaterial.color.set(0x64ff9c);
  greenSpriteMaterial.opacity = 0.48;

  const addLight = (x: number, z: number, height: number, green: boolean): void => {
    const material = green ? greenMat : approachMat;
    addCylinder(apronGroup, 0.06, 0.08, height, 6, mat.steel, [x, apronTop + height / 2, z]);
    const bulb = new THREE.Mesh(lightGeo, material);
    bulb.position.set(x, apronTop + height + 0.12, z);
    apronGroup.add(bulb);
    const sprite = new THREE.Sprite(green ? greenSpriteMaterial : lensSpriteMaterial);
    sprite.position.copy(bulb.position);
    sprite.scale.setScalar(green ? 2.4 : 3.1);
    apronGroup.add(sprite);
  };

  for (let i = 0; i < 6; i += 1) {
    addLight(-155 + i * 21, 0, 0.8, false);
  }
  for (const x of [-27, 27]) {
    for (const z of [-27, 27]) addLight(x, z, 0.45, true);
  }
  addLight(0, -27, 0.45, false);
  addLight(0, 27, 0.45, false);

  // -------------------------------------------------------------------------
  // Terminal, kiosk, crates, rocks
  // -------------------------------------------------------------------------

  function buildTerminal(): THREE.Group {
    const group = new THREE.Group();
    const windows = makeWindowTexture();

    addBox(group, [30, 5.2, 18], mat.concrete, [0, 2.6, 0]);
    addBox(group, [25, 4.1, 15], mat.concrete, [-1, 7.1, -1.2]);
    addBox(group, [31, 0.45, 19], mat.concreteDark, [0, 5.35, 0]);
    addBox(group, [26, 0.4, 16], mat.concreteDark, [-1, 9.35, -1.2]);
    addBox(group, [3.4, 3.0, 0.22], mat.glass, [-8, 1.55, 9.02]);

    // Window band, south facade.
    const lowerWindows = new THREE.Mesh(
      new THREE.PlaneGeometry(23, 1.9),
      new THREE.MeshStandardMaterial({ map: windows, roughness: 0.35, metalness: 0.2 }),
    );
    lowerWindows.position.set(0, 3.9, 9.04);
    group.add(lowerWindows);

    const upperWindows = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 1.7),
      new THREE.MeshStandardMaterial({ map: windows, roughness: 0.35, metalness: 0.2 }),
    );
    upperWindows.position.set(-1, 7.2, 6.34);
    group.add(upperWindows);

    // Entrance canopy.
    addBox(group, [9, 0.28, 4.2], mat.concreteDark, [-8, 3.25, 10.8]);
    addBox(group, [0.22, 3.0, 0.22], mat.steel, [-12.2, 1.6, 11.8]);
    addBox(group, [0.22, 3.0, 0.22], mat.steel, [-3.8, 1.6, 11.8]);

    // Control tower.
    addCylinder(group, 2.15, 2.4, 8.2, 10, mat.concrete, [10.2, 13.2, -4.6]);
    addBox(group, [5.4, 2.7, 5.4], mat.glass, [10.2, 18.1, -4.6]);
    addBox(group, [6.0, 0.3, 6.0], mat.concreteDark, [10.2, 19.6, -4.6]);
    addCylinder(group, 0.07, 0.11, 4.2, 6, mat.steel, [10.2, 21.8, -4.6]);

    // Rooftop plant.
    addBox(group, [3.0, 1.1, 2.4], mat.concreteDark, [-6, 10.1, -3]);
    addBox(group, [2.6, 0.9, 2.0], mat.steel, [-1, 10.0, -4.5]);
    addBox(group, [1.8, 0.8, 1.8], mat.concreteDark, [4, 9.95, -2.8]);

    // Sign.
    const signTexture = makeTextTexture('ANVIL PORT', '#f4ecdb', 'rgba(0,0,0,0)', 1024, 224);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(13, 2.85),
      new THREE.MeshBasicMaterial({ map: signTexture, transparent: true, toneMapped: false }),
    );
    sign.position.set(-3, 6.8, 6.55);
    group.add(sign);

    // Service door and lamps.
    addBox(group, [2.4, 2.6, 0.16], mat.hullDark, [8, 1.3, 9.03]);
    for (const x of [-14, -10, -6, 8, 12]) {
      addBox(group, [0.4, 0.16, 0.3], mat.black, [x, 5.55, 9.1]);
    }

    group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    group.position.set(-146, apronTop, -96);
    return group;
  }

  function buildKiosk(): THREE.Group {
    const group = new THREE.Group();
    addBox(group, [12, 3.1, 6], mat.concrete, [0, 1.55, 0]);
    addBox(group, [12.8, 0.28, 6.8], mat.concreteDark, [0, 3.24, 0]);
    const counter = addBox(group, [7.4, 1.35, 0.3], mat.glass, [0.6, 1.55, 3.08]);
    counter.castShadow = false;
    addBox(group, [5.5, 0.75, 0.18], mat.hullDark, [-2.4, 2.55, 3.07]);
    addBox(group, [0.1, 2.0, 0.1], mat.steel, [4.4, 1.0, 3.45]);
    addBox(group, [0.1, 2.0, 0.1], mat.steel, [-4.4, 2.0, 3.45]);

    const awning = new THREE.Mesh(
      new THREE.PlaneGeometry(12.6, 2.1),
      new THREE.MeshStandardMaterial({ map: makeAwningTexture(), roughness: 0.8, side: THREE.DoubleSide }),
    );
    awning.rotation.x = -Math.PI / 2 + 0.16;
    awning.position.set(0, 3.15, 4.0);
    awning.castShadow = true;
    group.add(awning);

    const signTexture = makeTextTexture('PORT SHOP', '#f4ecdb', 'rgba(0,0,0,0)', 1024, 224);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 0.96),
      new THREE.MeshBasicMaterial({ map: signTexture, transparent: true, toneMapped: false }),
    );
    sign.position.set(2.7, 3.12, 3.55);
    group.add(sign);

    group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    group.position.set(90, apronTop, -108);
    return group;
  }

  function buildCrate(size: number): THREE.Group {
    const group = new THREE.Group();
    addBox(group, [size, size, size], mat.crate, [0, size / 2, 0]);
    addBox(group, [size * 1.02, 0.1, size * 0.15], mat.crateDark, [0, size * 0.82, 0]);
    addBox(group, [size * 0.15, size * 1.02, 0.1], mat.crateDark, [size * 0.32, size / 2, size / 2 + 0.02]);
    group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    return group;
  }

  const terminal = buildTerminal();
  scene.add(terminal);

  const kiosk = buildKiosk();
  scene.add(kiosk);

  const crates = new THREE.Group();
  const crateLayout: Array<[number, number, number, number]> = [
    [-124, -111, 1.3, 0.2],
    [-122.2, -109.4, 1.3, -0.15],
    [-124.1, -108.8, 1.3, 0.55],
    [-97, -112, 1.1, 0.35],
    [82, -111, 1.2, -0.2],
    [83.4, -110.2, 1.2, 0.4],
  ];
  for (const [x, z, size, angle] of crateLayout) {
    const crate = buildCrate(size);
    crate.position.set(x, apronTop, z);
    crate.rotation.y = angle;
    crates.add(crate);
  }
  scene.add(crates);

  // Low-poly rocks on the terrain around the apron and in the canyon.
  const rockGroup = new THREE.Group();
  const rockRng = mulberry32(51_919);
  const rockSpots: Array<[number, number, number]> = [
    [-246, -44, 4.8],
    [-260, 50, 6.2],
    [-238, 126, 3.4],
    [246, -96, 5.2],
    [272, 124, 7.4],
    [-366, 148, 4.1],
    [212, 214, 3.1],
    [-290, -170, 5.8],
    [320, -210, 4.4],
    [180, -250, 2.7],
  ];
  for (const [x, z, radius] of rockSpots) {
    const geometry = new THREE.IcosahedronGeometry(radius, 1);
    const positions = geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < positions.count; i += 1) {
      const factor = 0.72 + rockRng() * 0.5;
      positions.setXYZ(
        i,
        positions.getX(i) * factor,
        positions.getY(i) * factor * 0.7,
        positions.getZ(i) * factor,
      );
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    const rock = new THREE.Mesh(geometry, mat.rock);
    rock.position.set(x, heightAt(x, z) + radius * 0.26, z);
    rock.rotation.set(rockRng() * 0.5, rockRng() * Math.PI * 2, rockRng() * 0.3);
    rock.castShadow = true;
    rock.receiveShadow = true;
    rockGroup.add(rock);
  }
  scene.add(rockGroup);

  // -------------------------------------------------------------------------
  // A-30 ship silhouette (25 m)
  // -------------------------------------------------------------------------

  function buildShip(): THREE.Group {
    const ship = new THREE.Group();

    const profile: Array<[number, number]> = [
      [0.03, -12.35],
      [0.52, -11.9],
      [0.88, -10.8],
      [1.18, -8.6],
      [1.42, -5.2],
      [1.52, -1.0],
      [1.44, 2.8],
      [1.2, 5.9],
      [0.84, 8.5],
      [0.44, 10.8],
      [0.03, 12.25],
    ];
    const fuselageGeometry = new THREE.LatheGeometry(
      profile.map(([radius, y]) => new THREE.Vector2(radius, y)),
      16,
    );
    fuselageGeometry.scale(0.8, 1, 1.11);
    fuselageGeometry.rotateZ(-Math.PI / 2);
    const fuselage = new THREE.Mesh(fuselageGeometry, mat.hull);
    fuselage.position.y = 2.15;
    ship.add(fuselage);

    // Cockpit canopy.
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 9), mat.glass);
    canopy.scale.set(2.35, 0.64, 0.9);
    canopy.position.set(6.9, 2.92, 0);
    ship.add(canopy);
    addBox(ship, [1.3, 0.28, 1.7], mat.hullDark, [8.7, 2.62, 0], [0, 0, -0.08]);

    // Dorsal spine and belly panels.
    addBox(ship, [8.5, 0.38, 1.05], mat.hullDark, [-2.8, 3.3, 0]);
    addBox(ship, [11.5, 0.32, 1.3], mat.hullDark, [0.8, 1.02, 0], [0, 0, -0.015]);

    // Swept wings, mirrored.
    const wingShape = new THREE.Shape();
    wingShape.moveTo(2.9, 0.82);
    wingShape.lineTo(-3.5, 10.35);
    wingShape.lineTo(-5.85, 10.35);
    wingShape.lineTo(-5.6, 0.82);
    wingShape.closePath();
    const wingGeometry = new THREE.ExtrudeGeometry(wingShape, {
      depth: 0.3,
      bevelEnabled: false,
      curveSegments: 1,
    });
    wingGeometry.rotateX(-Math.PI / 2);
    const wingRight = new THREE.Mesh(wingGeometry, mat.hull);
    wingRight.position.y = 1.92;
    ship.add(wingRight);
    const wingLeft = wingRight.clone();
    wingLeft.scale.z = -1;
    ship.add(wingLeft);

    // Wingtip stripes and navigation lights.
    for (const side of [-1, 1]) {
      addBox(ship, [2.0, 0.18, 0.42], mat.teal, [-4.7, 1.95, side * 10.0]);
      const navMat = new THREE.MeshStandardMaterial({
        color: side < 0 ? 0xff5544 : 0x66ff99,
        emissive: side < 0 ? 0xff2200 : 0x22ff66,
        emissiveIntensity: 2.5,
        toneMapped: false,
      });
      const nav = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), navMat);
      nav.position.set(-5.1, 1.98, side * 10.3);
      ship.add(nav);
    }

    // Twin engine nacelles.
    for (const side of [-1, 1]) {
      const engineGeometry = new THREE.CylinderGeometry(0.82, 0.98, 6.2, 12);
      engineGeometry.rotateZ(Math.PI / 2);
      const engine = new THREE.Mesh(engineGeometry, mat.hullDark);
      engine.position.set(-8.8, 2.02, side * 3.15);
      ship.add(engine);

      const intake = new THREE.Mesh(new THREE.CircleGeometry(0.78, 12), mat.black);
      intake.rotation.y = Math.PI / 2;
      intake.position.set(-5.68, 2.02, side * 3.15);
      ship.add(intake);

      const nozzleRing = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.13, 8, 16), mat.teal);
      nozzleRing.rotation.y = Math.PI / 2;
      nozzleRing.position.set(-11.92, 2.02, side * 3.15);
      ship.add(nozzleRing);

      const nozzleGlow = new THREE.Mesh(new THREE.CircleGeometry(0.58, 12), new THREE.MeshBasicMaterial({
        color: 0x4ed9c8,
        transparent: true,
        opacity: 0.6,
        toneMapped: false,
      }));
      nozzleGlow.rotation.y = -Math.PI / 2;
      nozzleGlow.position.set(-11.99, 2.02, side * 3.15);
      ship.add(nozzleGlow);

      addBox(ship, [4.0, 0.3, 0.9], mat.hullDark, [-6.3, 2.0, side * 2.35]);
    }

    // Tail surfaces.
    for (const side of [-1, 1]) {
      addBox(
        ship,
        [4.1, 2.9, 0.18],
        mat.hull,
        [-9.15, 3.75, side * 2.05],
        [side * -0.16, 0, 0.3],
      );
      addBox(ship, [1.2, 0.38, 0.22], mat.teal, [-10.7, 4.92, side * 2.28], [side * -0.16, 0, 0.3]);
    }
    addBox(ship, [4.6, 0.2, 7.1], mat.hull, [-10.9, 2.1, 0]);

    // Landing gear.
    const gear: Array<[number, number]> = [
      [5.15, 0],
      [-2.3, 2.5],
      [-2.3, -2.5],
    ];
    for (const [x, z] of gear) {
      addCylinder(ship, 0.1, 0.12, 1.38, 6, mat.steel, [x, 0.92, z]);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.26, 10), mat.black);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x, 0.34, z);
      wheel.castShadow = true;
      ship.add(wheel);
      addBox(ship, [0.65, 0.5, 0.25], mat.hullDark, [x, 1.62, z]);
    }

    // Number / accent blocks.
    for (const side of [-1, 1]) {
      addBox(ship, [2.8, 0.32, 0.06], mat.teal, [2.5, 2.25, side * 1.47]);
      addBox(ship, [1.14, 0.55, 0.045], mat.hullDark, [-3.8, 2.2, side * 1.43]);
    }

    ship.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    ship.position.set(0, padTop + 0.02, 0);
    return ship;
  }

  const ship = buildShip();
  scene.add(ship);

  // Player capsule: 1.8 m tall, total capsule height = 2r + length.
  const player = new THREE.Group();
  const capsule = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 1.12, 5, 10), mat.orange);
  capsule.position.y = 0.9;
  capsule.castShadow = true;
  player.add(capsule);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.34), mat.hullDark);
  visor.position.set(0, 1.46, 0.18);
  player.add(visor);
  const playerRing = new THREE.Mesh(
    new THREE.RingGeometry(0.95, 1.14, 32),
    new THREE.MeshBasicMaterial({
      color: 0xf07a3c,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  playerRing.rotation.x = -Math.PI / 2;
  playerRing.position.y = 0.02;
  player.add(playerRing);
  player.position.set(12, padTop + 0.02, 20);
  scene.add(player);

  // Wind sock near the pad adds another human-scale cue.
  const windsock = new THREE.Group();
  addCylinder(windsock, 0.08, 0.1, 4.2, 6, mat.steel, [0, 2.1, 0]);
  const sock = new THREE.Mesh(
    new THREE.ConeGeometry(0.48, 2.4, 8, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xd2662e, roughness: 0.8, side: THREE.DoubleSide }),
  );
  sock.rotation.z = Math.PI / 2;
  sock.position.set(1.3, 4.0, 0);
  windsock.add(sock);
  windsock.position.set(-70, apronTop, -42);
  scene.add(windsock);

  // -------------------------------------------------------------------------
  // Scale labels (HTML overlay projected from world space)
  // -------------------------------------------------------------------------

  interface WorldLabel {
    element: HTMLElement;
    position: THREE.Vector3;
  }
  const labels: WorldLabel[] = [];
  const labelLayer = document.querySelector<HTMLElement>('#terrain-labels');

  const addLabel = (title: string, subtitle: string, position: THREE.Vector3, tone = ''): void => {
    if (!labelLayer) return;
    const element = document.createElement('div');
    element.className = `world-label${tone ? ` world-label--${tone}` : ''}`;
    const strong = document.createElement('strong');
    strong.textContent = title;
    const span = document.createElement('span');
    span.textContent = subtitle;
    element.append(strong, span);
    labelLayer.append(element);
    labels.push({ element, position });
  };

  addLabel('PLAYER', '1.8 m capsule', new THREE.Vector3(12, padTop + 2.5, 20), 'warm');
  addLabel('A-30', '25 m · on pad', new THREE.Vector3(0, padTop + 9.0, 0), 'accent');
  addLabel('TLOF', '60 × 60 m · pad 54 m', new THREE.Vector3(-25, padTop + 1.0, 25));
  addLabel('TERMINAL', '30 × 18 m', new THREE.Vector3(-146, apronTop + 14, -84));
  addLabel('SHOP', '12 m kiosk', new THREE.Vector3(90, apronTop + 5.2, -102));
  addLabel('APRON', '420 × 260 m', new THREE.Vector3(-190, apronTop + 1.2, 112));
  addLabel('RIDGE', `${ridgePeakH.toFixed(0)} m crest`, new THREE.Vector3(ridgePeakX, ridgePeakH + 12, ridgePeakZ));
  addLabel('CANYON', `${meta.elevation.canyon_floor_m.toFixed(0)} m floor`, new THREE.Vector3(-365, meta.elevation.canyon_floor_m + 18, 165));
  addLabel('PLATEAU', 'eastern scarp', new THREE.Vector3(370, heightAt(370, 90) + 12, 90));

  let labelsVisible = true;
  const setLabelsVisible = (visible: boolean): void => {
    labelsVisible = visible;
    if (labelLayer) labelLayer.hidden = !visible;
    const button = document.querySelector<HTMLButtonElement>('#label-toggle');
    button?.classList.toggle('is-active', visible);
    if (button) button.setAttribute('aria-pressed', String(visible));
  };

  // -------------------------------------------------------------------------
  // Camera presets / walk mode
  // -------------------------------------------------------------------------

  interface Pose {
    position: [number, number, number];
    target: [number, number, number];
  }
  const poses: Record<string, Pose> = {
    port: { position: [100, 100, 135], target: [0, padElevation + 4, -10] },
    tile: { position: [760, 760, 900], target: [0, 20, 0] },
    pad: { position: [32, 65, 48], target: [0, padElevation + 2, 0] },
  };

  let tween: {
    fromPosition: THREE.Vector3;
    toPosition: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
    t: number;
  } | null = null;

  const flyTo = (pose: Pose): void => {
    if (walk.active) exitWalk();
    tween = {
      fromPosition: camera.position.clone(),
      toPosition: new THREE.Vector3(...pose.position),
      fromTarget: controls.target.clone(),
      toTarget: new THREE.Vector3(...pose.target),
      t: 0,
    };
  };

  const setPresetActive = (name: string): void => {
    for (const button of presetButtons) {
      button.classList.toggle('is-active', button.dataset.terrainPreset === name);
    }
  };

  const flyToPreset = (name: string): void => {
    const pose = poses[name];
    if (!pose) return;
    flyTo(pose);
    setPresetActive(name);
  };

  controls.addEventListener('start', () => {
    tween = null;
  });

  const presetButtons = document.querySelectorAll<HTMLButtonElement>('[data-terrain-preset]');
  for (const button of presetButtons) {
    button.addEventListener('click', () => {
      flyToPreset(button.dataset.terrainPreset ?? 'port');
    });
  }

  const walkToggle = document.querySelector<HTMLButtonElement>('#walk-toggle');
  const labelToggle = document.querySelector<HTMLButtonElement>('#label-toggle');
  const modeReadout = document.querySelector<HTMLElement>('#terrain-mode');
  const walkHint = document.querySelector<HTMLElement>('#walk-hint');
  const crosshair = document.querySelector<HTMLElement>('#walk-crosshair');
  const coordsReadout = document.querySelector<HTMLElement>('#walk-coords');
  labelToggle?.addEventListener('click', () => setLabelsVisible(!labelsVisible));
  if (labelToggle) labelToggle.setAttribute('aria-pressed', 'true');

  const walk = {
    active: false,
    yaw: 0,
    pitch: -0.02,
    x: 0,
    z: 86,
    eye: 1.68,
  };
  const keys = new Set<string>();

  const setWalkUi = (): void => {
    stage.classList.toggle('is-walking', walk.active);
    if (modeReadout) modeReadout.textContent = walk.active ? '步行 / ON FOOT' : '轨道 / ORBIT';
    if (walkToggle) {
      walkToggle.classList.toggle('is-active', walk.active);
      walkToggle.setAttribute('aria-pressed', String(walk.active));
    }
    if (crosshair) crosshair.hidden = !walk.active;
    if (walkHint) walkHint.hidden = !walk.active;
    if (!walk.active && coordsReadout) coordsReadout.textContent = '拖动旋转 · 滚轮缩放 · 右键平移';
  };

  const updateWalkHint = (): void => {
    if (!walkHint) return;
    const locked = document.pointerLockElement === canvas;
    walkHint.textContent = locked
      ? 'WASD 移动 · Shift 加速 · 鼠标观察 · Esc 释放鼠标'
      : '点击画面锁定鼠标 · WASD 移动 · Shift 加速 · Esc 退出';
  };

  const enterWalk = (): void => {
    walk.active = true;
    walk.x = 0;
    walk.z = 86;
    walk.yaw = 0;
    walk.pitch = -0.03;
    controls.enabled = false;
    tween = null;
    camera.position.set(walk.x, groundAt(walk.x, walk.z) + walk.eye, walk.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(walk.pitch, walk.yaw, 0);
    setWalkUi();
    updateWalkHint();
    try {
      void canvas.requestPointerLock();
    } catch {
      /* pointer lock can be blocked by browser policy */
    }
  };

  const exitWalk = (): void => {
    if (!walk.active) return;
    walk.active = false;
    controls.enabled = true;
    document.exitPointerLock?.();
    controls.target.set(0, padElevation + 4, -10);
    camera.position.set(100, 100, 135);
    controls.update();
    canvas.blur();
    keys.clear();
    setPresetActive('port');
    setWalkUi();
  };

  const toggleWalk = (): void => {
    if (walk.active) exitWalk();
    else enterWalk();
  };

  walkToggle?.addEventListener('click', toggleWalk);

  canvas.addEventListener('click', () => {
    if (!walk.active || document.pointerLockElement === canvas) return;
    try {
      void canvas.requestPointerLock();
    } catch {
      /* ignore */
    }
  });

  document.addEventListener('pointerlockchange', updateWalkHint);

  document.addEventListener('mousemove', (event) => {
    if (!walk.active || document.pointerLockElement !== canvas) return;
    walk.yaw -= event.movementX * 0.0022;
    walk.pitch = clamp(walk.pitch - event.movementY * 0.0021, -1.35, 1.35);
  });

  const moveKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight']);
  document.addEventListener('keydown', (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;

    if (walk.active && moveKeys.has(event.code)) {
      keys.add(event.code);
      event.preventDefault();
    }

    if (event.code === 'KeyV') {
      event.preventDefault();
      toggleWalk();
    } else if (event.code === 'KeyL') {
      event.preventDefault();
      setLabelsVisible(!labelsVisible);
    } else if (event.code === 'KeyR') {
      event.preventDefault();
      flyToPreset('port');
    } else if (event.code === 'Escape' && walk.active && document.pointerLockElement === null) {
      exitWalk();
    }
  });

  document.addEventListener('keyup', (event) => {
    keys.delete(event.code);
  });

  window.addEventListener('blur', () => keys.clear());

  // -------------------------------------------------------------------------
  // Resize / HUD / labels
  // -------------------------------------------------------------------------

  const resize = (): void => {
    const width = Math.max(stage.clientWidth, 1);
    const height = Math.max(stage.clientHeight, 1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(stage);

  const stats = document.querySelector<HTMLElement>('#terrain-stats');
  if (stats) {
    stats.textContent = `${gridWidth} × ${gridHeight} R16 · ${meta.elevation.min_m.toFixed(0)}–${meta.elevation.max_m.toFixed(0)} m · pad ${padElevation.toFixed(0)} m`;
  }
  const minHeight = document.querySelector<HTMLElement>('#terrain-min-height');
  const maxHeight = document.querySelector<HTMLElement>('#terrain-max-height');
  if (minHeight) minHeight.textContent = `${meta.elevation.min_m.toFixed(0)} m`;
  if (maxHeight) maxHeight.textContent = `${meta.elevation.max_m.toFixed(0)} m`;

  const tempVector = new THREE.Vector3();
  const placedLabels: Array<{ left: number; right: number; top: number; bottom: number }> = [];
  const updateLabels = (): void => {
    if (!labelLayer || !labelsVisible) return;
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    placedLabels.length = 0;
    for (const label of labels) {
      tempVector.copy(label.position).project(camera);
      const visible =
        tempVector.z < 1 &&
        tempVector.z > -1 &&
        Math.abs(tempVector.x) < 1.15 &&
        Math.abs(tempVector.y) < 1.15 &&
        (!walk.active || label.position.distanceToSquared(camera.position) < 250 * 250);
      if (!visible) {
        label.element.hidden = true;
        continue;
      }
      // Measure only visible labels; hidden rows are not laid out.
      label.element.hidden = false;
      const labelWidth = label.element.offsetWidth || 76;
      const labelHeight = label.element.offsetHeight || 28;
      const anchorX = (tempVector.x * 0.5 + 0.5) * width;
      const anchorY = (-tempVector.y * 0.5 + 0.5) * height;
      const left = anchorX - labelWidth / 2;
      let top = anchorY - labelHeight;
      const overlaps = (): boolean =>
        placedLabels.some(
          (rect) =>
            left < rect.right + 6 &&
            left + labelWidth > rect.left - 6 &&
            top < rect.bottom + 6 &&
            top + labelHeight > rect.top - 6,
        );
      let attempts = 0;
      while (attempts < 3 && overlaps()) {
        top -= labelHeight + 8;
        attempts += 1;
      }
      if (attempts >= 3) {
        label.element.hidden = true;
        continue;
      }
      placedLabels.push({ left, right: left + labelWidth, top, bottom: top + labelHeight });
      label.element.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px)`;
    }
  };

  // -------------------------------------------------------------------------
  // Animation
  // -------------------------------------------------------------------------

  let lastFrame = performance.now();
  const walkVelocity = new THREE.Vector3();

  const animate = (time: number): void => {
    const delta = Math.min((time - lastFrame) / 1000, 0.05);
    lastFrame = time;

    if (tween && !walk.active) {
      tween.t = Math.min(1, tween.t + delta / 1.15);
      const ease = 1 - Math.pow(1 - tween.t, 3);
      camera.position.lerpVectors(tween.fromPosition, tween.toPosition, ease);
      controls.target.lerpVectors(tween.fromTarget, tween.toTarget, ease);
      if (tween.t >= 1) tween = null;
      controls.update();
    } else if (!walk.active) {
      controls.update();
    }

    if (walk.active) {
      const forward = new THREE.Vector3(-Math.sin(walk.yaw), 0, -Math.cos(walk.yaw));
      const right = new THREE.Vector3(Math.cos(walk.yaw), 0, -Math.sin(walk.yaw));
      walkVelocity.set(0, 0, 0);
      if (keys.has('KeyW')) walkVelocity.add(forward);
      if (keys.has('KeyS')) walkVelocity.sub(forward);
      if (keys.has('KeyD')) walkVelocity.add(right);
      if (keys.has('KeyA')) walkVelocity.sub(right);
      if (walkVelocity.lengthSq() > 0) {
        walkVelocity.normalize();
        const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 26 : 8.5;
        walk.x = clamp(walk.x + walkVelocity.x * speed * delta, -half + 4, half - 4);
        walk.z = clamp(walk.z + walkVelocity.z * speed * delta, -half + 4, half - 4);
      }
      camera.position.set(walk.x, groundAt(walk.x, walk.z) + walk.eye, walk.z);
      camera.rotation.set(walk.pitch, walk.yaw, 0);
      if (coordsReadout) {
        coordsReadout.textContent = `X ${walk.x.toFixed(0)} m · Z ${walk.z.toFixed(0)} m · ${groundAt(walk.x, walk.z).toFixed(1)} m`;
      }
    }

    updateLabels();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  };

  setWalkUi();
  setLabelsVisible(true);
  requestAnimationFrame(animate);

  window.setTimeout(() => {
    loading?.classList.add('is-done');
    window.setTimeout(() => loading?.remove(), 700);
  }, 160);

  if (errorBox) errorBox.hidden = true;

  // Useful for headless screenshots / smoke tests.
  (window as unknown as { __terrainSample?: unknown }).__terrainSample = {
    scene,
    camera,
    renderer,
    controls,
    flyToPreset,
    toggleWalk,
    meta,
  };
}
