/**
 * Anvil Landing — authored port sample, v2.
 *
 * The ground truth is a Blender scene assembled from the owned Kitbash3D
 * Sci-Fi Industrial kit and the A-30 thunderbolt GLB. This runtime loads:
 *   - the deterministic 1025 x 1025 R16 heightfield and terrain maps,
 *   - the optimized anvil-port.glb (buildings, apron, pad, props, ship,
 *     vegetation) exported from that Blender scene,
 *   - a Poly Haven CC0 sunset sky.
 *
 * The page is a scale/quality sample, not the flight runtime. Terrain noise is
 * never generated in the browser.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

interface TerrainMeta {
  name: string;
  seed: number;
  grid: { width: number; height: number; spacing_m: number };
  tile_size_m: number;
  heightmap: { file: string; height_scale_m: number; sha256: string };
  elevation: {
    min_m: number;
    max_m: number;
    ridge_peak_m: number;
    canyon_floor_m: number;
    pad_m: number;
  };
  apron: { size_m: [number, number]; elevation_m: number };
  pad: { size_m: [number, number]; elevation_m: number };
}

interface TerrainStats {
  triangles: number;
  calls: number;
  plants: number;
  modules: number;
  glbMB: number;
}

const BASE = import.meta.env.BASE_URL.replace(/\/+$/, '');
const APRON_Z = 28.0;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function makeRadialTexture(inner = 'rgba(0,0,0,0.72)', outer = 'rgba(0,0,0,0)'): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  const g = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.55, 'rgba(0,0,0,0.32)');
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export async function initTerrainSample(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#terrain-canvas');
  const stage = document.querySelector<HTMLElement>('#terrain-stage');
  const loading = document.querySelector<HTMLElement>('#terrain-loading');
  const errorBox = document.querySelector<HTMLElement>('#terrain-error');
  if (!canvas || !stage) return;

  const setLoading = (text: string): void => {
    const label = loading?.querySelector<HTMLElement>('[data-loading-label]');
    if (label) label.textContent = text;
  };

  try {
    setLoading('READING 1025² HEIGHTFIELD');
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

    await boot(canvas, stage, meta, buffer, setLoading, loading, errorBox);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (loading) loading.textContent = 'WORLD LOAD FAILED';
    if (errorBox) {
      errorBox.hidden = false;
      errorBox.textContent = `场景加载失败：${message}`;
    }
    console.error('[terrain-sample]', error);
  }
}

async function boot(
  canvas: HTMLCanvasElement,
  stage: HTMLElement,
  meta: TerrainMeta,
  buffer: ArrayBuffer,
  setLoading: (text: string) => void,
  loading: HTMLElement | null,
  errorBox: HTMLElement | null,
): Promise<void> {
  const gridWidth = meta.grid.width;
  const gridHeight = meta.grid.height;
  const spacing = meta.grid.spacing_m;
  const tile = meta.tile_size_m;
  const half = tile / 2;
  const scale = meta.heightmap.height_scale_m;
  const apronW = meta.apron.size_m[0];
  const apronD = meta.apron.size_m[1];

  const view = new DataView(buffer);
  const heights = new Float32Array(gridWidth * gridHeight);
  for (let i = 0; i < heights.length; i += 1) {
    heights[i] = (view.getUint16(i * 2, true) / 65535) * scale;
  }

  const heightAt = (x: number, z: number): number => {
    const gx = clamp((x + half) / spacing, 0, gridWidth - 1.000001);
    // Blender's +Y (south) maps to Three's -Z, and the R16 row 0 is north.
    const gz = clamp((half - z) / spacing, 0, gridHeight - 1.000001);
    const x0 = Math.floor(gx);
    const z0 = Math.floor(gz);
    const x1 = Math.min(x0 + 1, gridWidth - 1);
    const z1 = Math.min(z0 + 1, gridHeight - 1);
    const tx = gx - x0;
    const tz = gz - z0;
    return (
      heights[z0 * gridWidth + x0] * (1 - tx) * (1 - tz) +
      heights[z0 * gridWidth + x1] * tx * (1 - tz) +
      heights[z1 * gridWidth + x0] * (1 - tx) * tz +
      heights[z1 * gridWidth + x1] * tx * tz
    );
  };

  const groundAt = (x: number, z: number): number => {
    let ground = heightAt(x, z);
    if (Math.abs(x) <= apronW / 2 && Math.abs(z) <= apronD / 2) ground = Math.max(ground, APRON_Z);
    return ground;
  };

  // -------------------------------------------------------------------------
  // Renderer / scene
  // -------------------------------------------------------------------------

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.70;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const gl = renderer.getContext();
  const debugExt = gl.getExtension('WEBGL_debug_renderer_info');
  const gpuName = debugExt ? String(gl.getParameter(debugExt.UNMASKED_RENDERER_WEBGL)) : '';
  const softwareRenderer = /swiftshader|software/i.test(gpuName);
  const lowQuality = new URLSearchParams(window.location.search).get('quality') === 'low';

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x647c8c, 0.00045);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 26000);
  camera.position.set(20, APRON_Z + 4.4, -48);
  camera.rotation.order = 'YXZ';

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(-2, APRON_Z + 5.4, 16);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.minDistance = 6;
  controls.maxDistance = 1400;
  controls.maxPolarAngle = Math.PI * 0.492;
  controls.screenSpacePanning = false;
  controls.update();

  // -------------------------------------------------------------------------
  // Sky / environment
  // -------------------------------------------------------------------------

  let hdr: THREE.DataTexture | null = null;
  try {
    setLoading('LOADING CC0 SUNSET SKY');
    hdr = await new RGBELoader().loadAsync(`${BASE}/terrain-sample/sky.hdr`);
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const env = pmrem.fromEquirectangular(hdr).texture;
    scene.environment = env;
    scene.background = hdr;
    scene.backgroundIntensity = 0.40;
    scene.backgroundBlurriness = 0.02;
    scene.backgroundRotation.y = Math.PI * 0.55;
    scene.environmentRotation.y = Math.PI * 0.55;
    scene.environmentIntensity = 0.30;
  } catch (error) {
    console.warn('[terrain-sample] HDR sky unavailable, using fallback', error);
    scene.background = new THREE.Color(0x8aa4b8);
    scene.environment = null;
  }

  // -------------------------------------------------------------------------
  // Lights
  // -------------------------------------------------------------------------

  const sun = new THREE.DirectionalLight(0xffc28a, 2.0);
  sun.position.set(-260, 120, -340);
  sun.target.position.set(0, APRON_Z, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.camera.left = -280;
  sun.shadow.camera.right = 280;
  sun.shadow.camera.top = 280;
  sun.shadow.camera.bottom = -280;
  sun.shadow.camera.near = 60;
  sun.shadow.camera.far = 900;
  sun.shadow.bias = -0.00012;
  sun.shadow.normalBias = 0.55;
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(0x92b2d4, 0x4b3f33, 0.30);
  scene.add(hemi);

  const shipFill = new THREE.PointLight(0xffa768, 1000, 150, 2);
  shipFill.position.set(24, APRON_Z + 12, -22);
  scene.add(shipFill);

  const rimLight = new THREE.PointLight(0x76a6ff, 500, 100, 2);
  rimLight.position.set(-24, APRON_Z + 15, 30);
  scene.add(rimLight);

  const skyFill = new THREE.DirectionalLight(0x8fb2dd, 0.32);
  skyFill.position.set(220, 110, -260);
  skyFill.target.position.set(0, APRON_Z, 0);
  scene.add(skyFill);
  scene.add(skyFill.target);

  // -------------------------------------------------------------------------
  // Terrain
  // -------------------------------------------------------------------------

  setLoading('BUILDING 1 KM TERRAIN');
  const nearStep = 2; // 513 x 513, 2 m spacing
  const n = Math.floor((gridWidth - 1) / nearStep) + 1;
  const positions = new Float32Array(n * n * 3);
  const uvs = new Float32Array(n * n * 2);
  const indices: number[] = [];
  const coords = new Float32Array(n);
  for (let i = 0; i < n; i += 1) coords[i] = -half + i * nearStep * spacing;

  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      const idx = row * n + col;
      const x = coords[col];
      const z = half - row * nearStep * spacing;
      positions[idx * 3] = x;
      positions[idx * 3 + 1] = heights[row * nearStep * gridWidth + col * nearStep];
      positions[idx * 3 + 2] = z;
      uvs[idx * 2] = (x + half) / tile;
      uvs[idx * 2 + 1] = (half - z) / tile;
    }
  }
  for (let row = 0; row < n - 1; row += 1) {
    for (let col = 0; col < n - 1; col += 1) {
      const a = row * n + col;
      const b = a + 1;
      const c = a + n + 1;
      const d = a + n;
      indices.push(a, b, d, b, c, d);
    }
  }
  const terrainGeometry = new THREE.BufferGeometry();
  terrainGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  terrainGeometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  terrainGeometry.setAttribute('uv1', new THREE.BufferAttribute(uvs, 2));
  terrainGeometry.setIndex(indices);
  terrainGeometry.computeVertexNormals();
  terrainGeometry.computeBoundingSphere();

  const loadTexture = (path: string, color: boolean): Promise<THREE.Texture> =>
    new Promise((resolve, reject) => {
      new THREE.TextureLoader().load(
        path,
        (texture) => {
          texture.flipY = false;
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
          resolve(texture);
        },
        undefined,
        reject,
      );
    });

  const [grassTex, dirtTex, rockTex, sandTex, splatTex, normalTex, aoTex, shoreTex] = await Promise.all([
    loadTexture(`${BASE}/terrain-sample/textures/grass_color.jpg`, true),
    loadTexture(`${BASE}/terrain-sample/textures/dirt_color.jpg`, true),
    loadTexture(`${BASE}/terrain-sample/textures/rock_color.jpg`, true),
    loadTexture(`${BASE}/terrain-sample/textures/sand_color.jpg`, true),
    loadTexture(`${BASE}/terrain-sample/splat.png`, false),
    loadTexture(`${BASE}/terrain-sample/normal.png`, false),
    loadTexture(`${BASE}/terrain-sample/ao.png`, false),
    loadTexture(`${BASE}/terrain-sample/shore.png`, false),
  ]);
  splatTex.wrapS = THREE.ClampToEdgeWrapping;
  splatTex.wrapT = THREE.ClampToEdgeWrapping;
  normalTex.wrapS = THREE.ClampToEdgeWrapping;
  normalTex.wrapT = THREE.ClampToEdgeWrapping;
  aoTex.wrapS = THREE.ClampToEdgeWrapping;
  aoTex.wrapT = THREE.ClampToEdgeWrapping;
  shoreTex.wrapS = THREE.ClampToEdgeWrapping;
  shoreTex.wrapT = THREE.ClampToEdgeWrapping;

  const terrainMaterial = new THREE.MeshStandardMaterial({
    map: grassTex,
    normalMap: normalTex,
    normalScale: new THREE.Vector2(0.7, -0.7),
    aoMap: aoTex,
    aoMapIntensity: 0.9,
    roughness: 0.94,
    metalness: 0.0,
    color: 0xffffff,
  });
  terrainMaterial.map!.colorSpace = THREE.SRGBColorSpace;

  terrainMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.splatMap = { value: splatTex };
    shader.uniforms.grassMap = { value: grassTex };
    shader.uniforms.dirtMap = { value: dirtTex };
    shader.uniforms.rockMap = { value: rockTex };
    shader.uniforms.sandMap = { value: sandTex };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D splatMap;
        uniform sampler2D grassMap;
        uniform sampler2D dirtMap;
        uniform sampler2D rockMap;
        uniform sampler2D sandMap;`,
      )
      .replace(
        '#include <map_fragment>',
        `
        vec4 splat = texture2D( splatMap, vMapUv );
        float wsum = max( splat.r + splat.g + splat.b + splat.a, 0.0001 );
        vec3 terrainAlbedo =
          texture2D( grassMap, vMapUv * 165.0 ).rgb * ( splat.r / wsum ) +
          texture2D( dirtMap, vMapUv * 145.0 ).rgb * ( splat.g / wsum ) +
          texture2D( rockMap, vMapUv * 118.0 ).rgb * ( splat.b / wsum ) +
          texture2D( sandMap, vMapUv * 185.0 ).rgb * ( splat.a / wsum );
        diffuseColor.rgb *= terrainAlbedo * 1.03;
        `,
      );
  };
  terrainMaterial.customProgramCacheKey = () => 'anvil-terrain-splat-v1';

  const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
  terrain.receiveShadow = true;
  terrain.castShadow = false;
  terrain.name = 'AnvilTerrain';
  scene.add(terrain);

  // -------------------------------------------------------------------------
  // Sea
  // -------------------------------------------------------------------------

  const waterUniforms = {
    uTime: { value: 0 },
    uDeep: { value: new THREE.Color(0x071a21) },
    uShallow: { value: new THREE.Color(0x174b56) },
    uSky: { value: new THREE.Color(0x9fb9cd) },
    uFog: { value: new THREE.Color(0x8ca6b8) },
    uFogDensity: { value: 0.00042 },
    uSunDir: { value: new THREE.Vector3(-0.56, 0.14, -0.81).normalize() },
    uShore: { value: shoreTex },
  };
  const waterMaterial = new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uSky;
      uniform vec3 uFog;
      uniform float uFogDensity;
      uniform vec3 uSunDir;
      uniform sampler2D uShore;
      varying vec3 vWorld;
      void main() {
        vec3 V = normalize(cameraPosition - vWorld);
        vec2 p = vWorld.xz;
        float ripple = sin(p.x * 0.31 + uTime * 0.42) * 0.045
                     + sin(p.y * 0.47 - uTime * 0.33) * 0.035
                     + sin((p.x + p.y) * 0.19 + uTime * 0.21) * 0.03;
        vec3 N = normalize(vec3(
          sin(p.y * 0.38 + uTime * 0.27) * 0.055,
          1.0,
          cos(p.x * 0.33 - uTime * 0.24) * 0.055
        ));
        float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
        vec3 col = mix(uDeep, uShallow, clamp(fres * 1.1 + 0.10 + ripple, 0.0, 1.0));
        col = mix(col, uSky, fres * 0.55);
        vec3 R = reflect(-V, N);
        float spec = pow(max(dot(R, normalize(uSunDir)), 0.0), 260.0);
        col += vec3(1.0, 0.72, 0.42) * spec * 5.0;
        float glint = pow(max(dot(R, normalize(uSunDir)), 0.0), 28.0);
        col += vec3(1.0, 0.60, 0.28) * glint * 0.22;

        vec2 suv = (p + 512.0) / 1024.0;
        float foam = 0.0;
        if (suv.x > 0.0 && suv.x < 1.0 && suv.y > 0.0 && suv.y < 1.0) {
          foam = texture2D(uShore, suv).g;
          float bands = 0.5 + 0.5 * sin(p.x * 0.8 + p.y * 0.43 + uTime * 0.9);
          foam *= smoothstep(0.35, 0.75, foam * (0.7 + bands * 0.5));
        }
        col = mix(col, vec3(0.72, 0.79, 0.78), clamp(foam * 0.6, 0.0, 0.55));

        float dist = length(cameraPosition - vWorld);
        float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
        col = mix(col, uFog, clamp(fogFactor, 0.0, 0.9));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    side: THREE.FrontSide,
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(20000, 20000), waterMaterial);
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = 0.12;
  sea.name = 'AnvilSea';
  scene.add(sea);

  // -------------------------------------------------------------------------
  // Contact shadow + astronaut stand-in
  // -------------------------------------------------------------------------

  const contactTexture = makeRadialTexture();
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(34, 22),
    new THREE.MeshBasicMaterial({
      map: contactTexture,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      color: 0x000000,
    }),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.set(0, APRON_Z + 0.19, 0);
  contact.renderOrder = 2;
  scene.add(contact);

  const addAstronaut = (x: number, z: number, rotation: number): THREE.Group => {
    const group = new THREE.Group();
    group.position.set(x, APRON_Z + 0.08, z);
    group.rotation.y = rotation;
    const suit = new THREE.MeshStandardMaterial({ color: 0xd9d7cd, roughness: 0.62, metalness: 0.12 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1d262b, roughness: 0.28, metalness: 0.55 });
    const orange = new THREE.MeshStandardMaterial({ color: 0xd56525, roughness: 0.5, metalness: 0.15 });
    const glow = new THREE.MeshStandardMaterial({ color: 0x8ff3ff, emissive: 0x3fd8ee, emissiveIntensity: 3 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.43, 4, 10), suit);
    torso.position.y = 1.03;
    group.add(torso);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.42, 0.16), orange);
    chest.position.set(0, 1.13, 0.21);
    group.add(chest);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.27, 18, 12), suit);
    helmet.position.y = 1.58;
    group.add(helmet);
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.225, 18, 12, 0, Math.PI * 2, 0.5, 1.1), dark);
    visor.position.set(0, 1.58, 0.045);
    group.add(visor);
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.55, 0.23), dark);
    pack.position.set(0, 1.04, -0.27);
    group.add(pack);
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.48, 4, 8), suit);
      arm.position.set(side * 0.34, 1.02, 0.03);
      arm.rotation.z = side * 0.12;
      group.add(arm);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.115, 0.58, 4, 8), suit);
      leg.position.set(side * 0.15, 0.38, 0);
      group.add(leg);
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.12, 0.34), dark);
      boot.position.set(side * 0.15, 0.06, 0.06);
      group.add(boot);
    }
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.05), glow);
    lamp.position.set(0.28, 1.35, 0.23);
    group.add(lamp);
    group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    scene.add(group);
    return group;
  };
  addAstronaut(-9, -34, Math.PI * 0.82);
  addAstronaut(17, -14, Math.PI * 1.18);

  // -------------------------------------------------------------------------
  // Port GLB (the authored Blender scene)
  // -------------------------------------------------------------------------

  setLoading('LOADING ANVIL PORT · KITBASH3D');
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(`${BASE}/terrain-sample/models/anvil-port.glb`);
  const port = gltf.scene;
  port.name = 'AnvilPortDistrict';
  let meshCount = 0;
  let triCount = 0;
  port.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    meshCount += 1;
    object.castShadow = true;
    object.receiveShadow = true;
    const geometry = object.geometry;
    if (geometry.index) triCount += geometry.index.count / 3;
    else if (geometry.attributes.position) triCount += geometry.attributes.position.count / 3;
    const mats = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of mats) {
      if (material instanceof THREE.MeshStandardMaterial) {
        material.envMapIntensity = 0.62;
        if (material.transparent) {
          material.depthWrite = false;
          object.castShadow = false;
        }
      }
    }
  });
  scene.add(port);

  // -------------------------------------------------------------------------
  // Camera presets
  // -------------------------------------------------------------------------

  interface Pose {
    position: [number, number, number];
    target: [number, number, number];
    fov: number;
  }
  const poses: Record<string, Pose> = {
    port: { position: [20, APRON_Z + 3.4, -48], target: [-2, APRON_Z + 5.4, 16], fov: 32 },
    pad: { position: [30, APRON_Z + 2.4, -38], target: [-2, APRON_Z + 4.2, 2], fov: 25 },
    vista: { position: [-405, 78, -390], target: [0, APRON_Z + 12, 30], fov: 36 },
  };

  let tween: {
    fromPosition: THREE.Vector3;
    toPosition: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
    fromFov: number;
    toFov: number;
    t: number;
  } | null = null;

  const setPresetActive = (name: string): void => {
    for (const button of presetButtons) {
      button.classList.toggle('is-active', button.dataset.terrainPreset === name);
    }
  };

  const applyPose = (pose: Pose): void => {
    camera.position.set(...pose.position);
    controls.target.set(...pose.target);
    camera.fov = pose.fov;
    camera.updateProjectionMatrix();
    controls.update();
  };

  const flyTo = (pose: Pose): void => {
    if (walk.active) exitWalk();
    tween = {
      fromPosition: camera.position.clone(),
      toPosition: new THREE.Vector3(...pose.position),
      fromTarget: controls.target.clone(),
      toTarget: new THREE.Vector3(...pose.target),
      fromFov: camera.fov,
      toFov: pose.fov,
      t: 0,
    };
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
    button.addEventListener('click', () => flyToPreset(button.dataset.terrainPreset ?? 'port'));
  }

  // -------------------------------------------------------------------------
  // Walk mode
  // -------------------------------------------------------------------------

  const walkToggle = document.querySelector<HTMLButtonElement>('#walk-toggle');
  const labelToggle = document.querySelector<HTMLButtonElement>('#label-toggle');
  const modeReadout = document.querySelector<HTMLElement>('#terrain-mode');
  const walkHint = document.querySelector<HTMLElement>('#walk-hint');
  const crosshair = document.querySelector<HTMLElement>('#walk-crosshair');
  const coordsReadout = document.querySelector<HTMLElement>('#walk-coords');

  const walk = {
    active: false,
    yaw: 0,
    pitch: 0.02,
    x: 0,
    z: -72,
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
    walk.z = -62;
    walk.yaw = Math.PI;
    walk.pitch = 0.02;
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
      /* pointer lock can be blocked */
    }
  };

  const exitWalk = (): void => {
    if (!walk.active) return;
    walk.active = false;
    controls.enabled = true;
    document.exitPointerLock?.();
    applyPose(poses.port);
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
    walk.pitch = clamp(walk.pitch - event.movementY * 0.0021, -1.3, 1.3);
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
    } else if (event.code === 'KeyEscape' && walk.active && document.pointerLockElement === null) {
      exitWalk();
    }
  });
  document.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());

  // -------------------------------------------------------------------------
  // Labels
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

  addLabel('A-30', '25 m · landed on TLOF', new THREE.Vector3(0, APRON_Z + 10.0, 0), 'accent');
  addLabel('TLOF', '60 × 60 m · pad 28 m', new THREE.Vector3(-26, APRON_Z + 1.4, 26));
  addLabel('CONTROLLER', '1.8 m human scale', new THREE.Vector3(-9, APRON_Z + 2.4, -34), 'warm');
  addLabel('TERMINAL', 'Kitbash3D K039', new THREE.Vector3(25, APRON_Z + 17, 44));
  addLabel('RADAR', 'terminal roof', new THREE.Vector3(-45, APRON_Z + 24, 44));
  addLabel('FUEL FARM', 'bulk storage', new THREE.Vector3(82, APRON_Z + 16, 8));
  addLabel('PORT DISTRICT', '12 modules + 550 plants', new THREE.Vector3(-10, APRON_Z + 4, 56));
  addLabel('RIDGE', `${meta.elevation.ridge_peak_m.toFixed(0)} m crest`, new THREE.Vector3(320, 145, -20));
  addLabel('COAST', 'south-west bay', new THREE.Vector3(-360, 14, 250));

  let labelsVisible = true;
  const setLabelsVisible = (visible: boolean): void => {
    labelsVisible = visible;
    if (labelLayer) labelLayer.hidden = !visible;
    if (labelToggle) {
      labelToggle.classList.toggle('is-active', visible);
      labelToggle.setAttribute('aria-pressed', String(visible));
    }
  };
  labelToggle?.addEventListener('click', () => setLabelsVisible(!labelsVisible));
  if (labelToggle) labelToggle.setAttribute('aria-pressed', 'false');

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
        Math.abs(tempVector.x) < 1.12 &&
        Math.abs(tempVector.y) < 1.12 &&
        (!walk.active || label.position.distanceToSquared(camera.position) < 240 * 240);
      if (!visible) {
        label.element.hidden = true;
        continue;
      }
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
  // Post / resize / HUD
  // -------------------------------------------------------------------------

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(stage.clientWidth, stage.clientHeight), lowQuality || softwareRenderer ? 0.0 : 0.20, 0.42, 1.1);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const resize = (): void => {
    const width = Math.max(stage.clientWidth, 1);
    const height = Math.max(stage.clientHeight, 1);
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(stage);

  const statsEl = document.querySelector<HTMLElement>('#terrain-stats');
  const stats: TerrainStats = {
    triangles: triCount + 524288,
    calls: 0,
    plants: 550,
    modules: 12,
    glbMB: 17.6,
  };
  if (statsEl) {
    statsEl.textContent = `1025 × 1025 R16 · ${(stats.triangles / 1_000_000).toFixed(2)}M tris · ${meta.elevation.max_m.toFixed(0)} m ridge`;
  }
  const minHeight = document.querySelector<HTMLElement>('#terrain-min-height');
  const maxHeight = document.querySelector<HTMLElement>('#terrain-max-height');
  if (minHeight) minHeight.textContent = `${meta.elevation.min_m.toFixed(0)} m`;
  if (maxHeight) maxHeight.textContent = `${meta.elevation.max_m.toFixed(0)} m`;

  // -------------------------------------------------------------------------
  // Animation
  // -------------------------------------------------------------------------

  let lastFrame = performance.now();
  const clockStart = performance.now();
  const walkVelocity = new THREE.Vector3();

  const animate = (time: number): void => {
    const delta = Math.min((time - lastFrame) / 1000, 0.05);
    lastFrame = time;
    waterUniforms.uTime.value = (time - clockStart) / 1000;

    if (tween && !walk.active) {
      tween.t = Math.min(1, tween.t + delta / 1.15);
      const ease = 1 - Math.pow(1 - tween.t, 3);
      camera.position.lerpVectors(tween.fromPosition, tween.toPosition, ease);
      controls.target.lerpVectors(tween.fromTarget, tween.toTarget, ease);
      camera.fov = tween.fromFov + (tween.toFov - tween.fromFov) * ease;
      camera.updateProjectionMatrix();
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
        const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 22 : 7.5;
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
    if (softwareRenderer || lowQuality) {
      renderer.render(scene, camera);
    } else {
      composer.render();
    }
    requestAnimationFrame(animate);
  };

  applyPose(poses.port);
  setWalkUi();
  setLabelsVisible(false);
  requestAnimationFrame(animate);

  window.setTimeout(() => {
    loading?.classList.add('is-done');
    window.setTimeout(() => loading?.remove(), 900);
  }, 250);

  if (errorBox) errorBox.hidden = true;

  renderer.render(scene, camera);
  stats.calls = renderer.info.render.calls;
  stats.triangles = renderer.info.render.triangles;
  if (statsEl) {
    statsEl.textContent = `1025² R16 · ${(stats.triangles / 1_000_000).toFixed(2)}M tris · ${stats.calls} draw calls · ${stats.glbMB.toFixed(0)} MB GLB`;
  }

  (window as unknown as { __terrainSample?: unknown }).__terrainSample = {
    scene,
    camera,
    renderer,
    controls,
    flyToPreset,
    toggleWalk,
    meta,
    stats,
    gpu: gpuName,
    softwareRenderer,
    ready: true,
  };
  (window as unknown as { __terrainSampleReady?: boolean }).__terrainSampleReady = true;
}
