import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import {
  CABLES,
  HOLOGRAMS,
  INTERACTIONS,
  PIPES,
  PROPS,
  SHOPS,
  SHOTS,
  SIGNS,
  STEAM,
  STREET,
  TOWERS,
  TOWER_LOD1_IDS,
  type PropPlacement,
  type Shot,
} from './layout';
import { mergeByMaterial } from './merge';
import {
  asset,
  configureLoadedMaterial,
  createNightSky,
  loadTexture,
  makeMoonTexture,
} from './materials';
import { PlanarReflection, createWetRoad, createWetConcrete } from './road';
import {
  buildSignAtlas,
  createHologram,
  createRain,
  createSteam,
  createTraffic,
  type HologramHandle,
} from './neon';

const params = new URLSearchParams(location.search);
const requestedShot = params.get('shot') ?? 'hero';
const hudParam = params.get('hud');
const startFree = params.get('free') === '1';

const canvas = document.querySelector<HTMLCanvasElement>('#scene-canvas')!;
const loadingEl = document.querySelector<HTMLElement>('#loading')!;
const loadingBar = document.querySelector<HTMLElement>('#loading-bar')!;
const loadingStatus = document.querySelector<HTMLElement>('#loading-status')!;
const locationEl = document.querySelector<HTMLElement>('#hud-location')!;
const objectiveEl = document.querySelector<HTMLElement>('#hud-objective')!;
const promptEl = document.querySelector<HTMLElement>('#hud-prompt')!;
const promptTextEl = document.querySelector<HTMLElement>('#hud-prompt-text')!;
const telemetryEl = document.querySelector<HTMLElement>('#hud-telemetry')!;
const toastEl = document.querySelector<HTMLElement>('#hud-toast')!;
const coordsEl = document.querySelector<HTMLElement>('#hud-coords')!;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  powerPreference: 'high-performance',
  stencil: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.26;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.info.autoReset = false;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0b1722, 0.0034);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(0.8, 1.68, -27);
camera.rotation.order = 'YXZ';

const sky = createNightSky(renderer);
scene.background = sky.background;
scene.backgroundIntensity = 1.0;
scene.environment = sky.environment;
scene.environmentIntensity = 1.05;

// ---------------------------------------------------------------------------
// lights
// ---------------------------------------------------------------------------

const sun = new THREE.DirectionalLight(0xa8c6ff, 0.72);
sun.position.set(-72, 108, -34);
sun.target.position.set(0, 0, 150);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.camera.left = -150;
sun.shadow.camera.right = 150;
sun.shadow.camera.top = 190;
sun.shadow.camera.bottom = -190;
sun.shadow.camera.near = 20;
sun.shadow.camera.far = 520;
sun.shadow.bias = -0.00018;
sun.shadow.normalBias = 0.12;
scene.add(sun, sun.target);

const hemi = new THREE.HemisphereLight(0x20344a, 0x050607, 0.36);
scene.add(hemi);

const rim = new THREE.DirectionalLight(0xff7a3a, 0.36);
rim.position.set(30, 30, 470);
rim.target.position.set(0, 22, 40);
scene.add(rim, rim.target);

const fill = new THREE.DirectionalLight(0x6e9dc0, 0.38);
fill.position.set(24, 80, -110);
fill.target.position.set(0, 30, 150);
scene.add(fill, fill.target);

const vistaFill = new THREE.DirectionalLight(0x6eaad0, 0.55);
vistaFill.position.set(-20, 55, 520);
vistaFill.target.position.set(0, 4, -30);
scene.add(vistaFill, vistaFill.target);

const pointDefs: { pos: [number, number, number]; color: number; intensity: number; distance: number }[] = [
  { pos: [-10.5, 8.5, 12], color: 0x35e8ff, intensity: 210, distance: 48 },
  { pos: [10.5, 9.0, 8], color: 0xff3e9a, intensity: 190, distance: 48 },
  { pos: [-11.0, 6.5, 44], color: 0xff9a5a, intensity: 150, distance: 36 },
  { pos: [11.0, 7.0, 34], color: 0x9ed8ff, intensity: 120, distance: 36 },
  { pos: [-10.0, 8.0, 110], color: 0xff3e9a, intensity: 170, distance: 48 },
  { pos: [10.0, 8.0, 170], color: 0xffb070, intensity: 150, distance: 42 },
  { pos: [10.0, 7.0, 250], color: 0x5ea8ff, intensity: 130, distance: 42 },
];
for (const d of pointDefs) {
  const light = new THREE.PointLight(d.color, d.intensity, d.distance, 2);
  light.position.set(...d.pos);
  light.castShadow = false;
  scene.add(light);
}
const lampLights: { pos: [number, number, number]; color: number; intensity: number; distance: number }[] = [
  { pos: [-12.4, 12.5, 62], color: 0xdcecff, intensity: 45, distance: 26 },
  { pos: [12.4, 12.5, 190], color: 0xdcecff, intensity: 38, distance: 24 },
];
for (const d of lampLights) {
  const light = new THREE.PointLight(d.color, d.intensity, d.distance, 2);
  light.position.set(...d.pos);
  scene.add(light);
}

const shopSpill: { pos: [number, number, number]; color: number; intensity: number; distance: number }[] = [
  { pos: [-13.8, 1.8, 44.0], color: 0xffa45c, intensity: 30, distance: 14 },
  { pos: [13.8, 1.8, 33.0], color: 0x9ed8ff, intensity: 22, distance: 12 },
  { pos: [13.8, 1.8, 171.0], color: 0xffb070, intensity: 22, distance: 12 },
];
for (const s of shopSpill) {
  const light = new THREE.PointLight(s.color, s.intensity, s.distance, 2);
  light.position.set(...s.pos);
  scene.add(light);
}
RectAreaLightUniformsLib.init();
const shopLights: { pos: [number, number, number]; color: number; intensity: number; width: number; height: number; look: [number, number, number] }[] = [
  { pos: [-14.2, 3.6, 44.0], color: 0xffa45c, intensity: 16, width: 8, height: 4, look: [-6, 3, 44] },
  { pos: [14.2, 3.2, 33.0], color: 0x9ed8ff, intensity: 12, width: 9, height: 4, look: [4, 3, 33] },
  { pos: [14.2, 3.4, 171.0], color: 0xffb070, intensity: 12, width: 8, height: 4.2, look: [4, 3, 171] },
];
for (const s of shopLights) {
  const light = new THREE.RectAreaLight(s.color, s.intensity, s.width, s.height);
  light.position.set(...s.pos);
  light.lookAt(new THREE.Vector3(...s.look));
  scene.add(light);
}

// ---------------------------------------------------------------------------
// street surfaces
// ---------------------------------------------------------------------------

const asphaltBase = loadTexture('tex/street/asphalt_base.webp');
const asphaltNormal = loadTexture('tex/street/asphalt_normal.webp', THREE.NoColorSpace);
const asphaltOrm = loadTexture('tex/street/asphalt_orm.webp', THREE.NoColorSpace);
const puddleMask = loadTexture('tex/street/puddle_mask.webp', THREE.NoColorSpace);
const sidewalkBase = loadTexture('tex/street/sidewalk_base.webp');
const sidewalkNormal = loadTexture('tex/street/sidewalk_normal.webp', THREE.NoColorSpace);
const sidewalkOrm = loadTexture('tex/street/sidewalk_orm.webp', THREE.NoColorSpace);

const reflection = new PlanarReflection(896, 448);
const road = createWetRoad({
  width: STREET.roadHalfWidth * 2,
  length: 340,
  position: [0, 0.006, 130],
  asphaltMap: asphaltBase,
  asphaltNormal,
  asphaltOrm,
  puddleMask,
  reflection,
});
scene.add(road.mesh);

const blockGroundMat = new THREE.MeshStandardMaterial({
  map: sidewalkBase.clone(),
  color: 0x24282c,
  roughness: 0.85,
  metalness: 0.0,
});
blockGroundMat.map!.wrapS = blockGroundMat.map!.wrapT = THREE.RepeatWrapping;
blockGroundMat.map!.repeat.set(50, 64);
blockGroundMat.map!.anisotropy = 8;
const blockGround = new THREE.Mesh(new THREE.PlaneGeometry(420, 520), blockGroundMat);
blockGround.rotation.x = -Math.PI / 2;
blockGround.position.set(0, 0.14, 120);
blockGround.receiveShadow = true;
scene.add(blockGround);

const sidewalkTopMat = new THREE.MeshStandardMaterial({
  map: sidewalkBase.clone(),
  normalMap: sidewalkNormal,
  roughnessMap: sidewalkOrm,
  color: 0xb8b4a8,
  roughness: 0.58,
  metalness: 0.0,
  envMapIntensity: 1.0,
});
sidewalkTopMat.map!.wrapS = sidewalkTopMat.map!.wrapT = THREE.RepeatWrapping;
sidewalkTopMat.map!.repeat.set(2, 90);
sidewalkTopMat.map!.anisotropy = 8;
sidewalkTopMat.normalMap!.wrapS = sidewalkTopMat.normalMap!.wrapT = THREE.RepeatWrapping;
sidewalkTopMat.normalMap!.repeat.set(2, 90);
if (sidewalkTopMat.roughnessMap) {
  sidewalkTopMat.roughnessMap.wrapS = sidewalkTopMat.roughnessMap.wrapT = THREE.RepeatWrapping;
  sidewalkTopMat.roughnessMap.repeat.set(2, 90);
}
const sidewalkSolidMat = new THREE.MeshStandardMaterial({ color: 0x3a3b38, roughness: 0.82, metalness: 0.0 });
{
  const topGeos: THREE.BufferGeometry[] = [];
  const solidGeos: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1] as const) {
    const top = new THREE.PlaneGeometry(STREET.sidewalkWidth, 340);
    top.rotateX(-Math.PI / 2);
    top.translate(side * 13.0, STREET.curbHeight + 0.002, 130);
    topGeos.push(top);
    const body = new THREE.BoxGeometry(STREET.sidewalkWidth, STREET.curbHeight, 340);
    body.translate(side * 13.0, STREET.curbHeight / 2, 130);
    solidGeos.push(body);
    const curb = new THREE.BoxGeometry(0.26, STREET.curbHeight + 0.02, 340);
    curb.translate(side * (STREET.roadHalfWidth + 0.13), (STREET.curbHeight + 0.02) / 2, 130);
    solidGeos.push(curb);
  }
  const topMesh = new THREE.Mesh(mergeGeometries(topGeos, false)!, sidewalkTopMat);
  const solidMesh = new THREE.Mesh(mergeGeometries(solidGeos, false)!, sidewalkSolidMat);
  topMesh.receiveShadow = true;
  solidMesh.receiveShadow = true;
  scene.add(topMesh, solidMesh);
  topGeos.forEach((g) => g.dispose());
  solidGeos.forEach((g) => g.dispose());
}

// wet service-yard / alley floor
const alleyFloor = createWetConcrete({
  map: asphaltBase,
  normal: asphaltNormal,
  orm: asphaltOrm,
  color: 0x3c4145,
  roughness: 0.5,
  repeat: [3, 3],
  position: [-23.5, 0.162, 60],
  size: [18, 20],
});
scene.add(alleyFloor);

// ---------------------------------------------------------------------------
// small street details
// ---------------------------------------------------------------------------

function manholeTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#292b2d';
  ctx.beginPath();
  ctx.arc(128, 128, 122, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#4a4d50';
  ctx.lineWidth = 5;
  for (let r = 26; r <= 112; r += 18) {
    ctx.beginPath();
    ctx.arc(128, 128, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.lineWidth = 3;
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(128 + Math.cos(a) * 20, 128 + Math.sin(a) * 20);
    ctx.lineTo(128 + Math.cos(a) * 112, 128 + Math.sin(a) * 112);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const metalDark = new THREE.MeshStandardMaterial({ color: 0x1d2023, roughness: 0.42, metalness: 0.8 });
const paintWhite = new THREE.MeshStandardMaterial({ color: 0xcfd2c8, roughness: 0.45, metalness: 0.0 });
const paintAmber = new THREE.MeshStandardMaterial({ color: 0xd9a63c, roughness: 0.5, metalness: 0.0 });

const manholeMat = new THREE.MeshStandardMaterial({
  map: manholeTexture(),
  roughness: 0.42,
  metalness: 0.75,
});
const manholeGeo = new THREE.CircleGeometry(0.62, 32);
manholeGeo.rotateX(-Math.PI / 2);
const manholes = new THREE.InstancedMesh(manholeGeo, manholeMat, 6);
{
  const m = new THREE.Matrix4();
  const spots: [number, number][] = [[3.4, 18], [-4.1, 88], [2.4, 132], [-3.2, 188], [4.6, 238], [-2.8, 286]];
  spots.forEach(([x, z], i) => {
    m.makeTranslation(x, 0.018, z);
    manholes.setMatrixAt(i, m);
  });
  manholes.instanceMatrix.needsUpdate = true;
}
manholes.receiveShadow = true;
scene.add(manholes);

const drainGeo = new THREE.BoxGeometry(0.9, 0.02, 0.46);
const drains = new THREE.InstancedMesh(drainGeo, metalDark, 20);
{
  const m = new THREE.Matrix4();
  for (let i = 0; i < 20; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = 4 + Math.floor(i / 2) * 30;
    m.makeTranslation(side * 10.55, 0.012, z);
    drains.setMatrixAt(i, m);
  }
  drains.instanceMatrix.needsUpdate = true;
}
drains.receiveShadow = true;
scene.add(drains);

const crosswalk = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.2, 3.8), paintWhite, 9);
crosswalk.geometry.rotateX(-Math.PI / 2);
{
  const m = new THREE.Matrix4();
  for (let i = 0; i < 9; i += 1) {
    m.makeTranslation(-8.4 + i * 2.1, 0.012, 116);
    crosswalk.setMatrixAt(i, m);
  }
  crosswalk.instanceMatrix.needsUpdate = true;
}
crosswalk.receiveShadow = true;
scene.add(crosswalk);

const laneDashes = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.14, 5.0), paintAmber, 30);
laneDashes.geometry.rotateX(-Math.PI / 2);
{
  const m = new THREE.Matrix4();
  for (let i = 0; i < 30; i += 1) {
    m.makeTranslation(0, 0.011, -20 + i * 10.5);
    laneDashes.setMatrixAt(i, m);
  }
  laneDashes.instanceMatrix.needsUpdate = true;
}
laneDashes.receiveShadow = true;
scene.add(laneDashes);

// puddles on the sidewalks (env-map sheen, cheap)
const puddleMat = new THREE.MeshStandardMaterial({
  color: 0x05090d,
  roughness: 0.04,
  metalness: 0.75,
  transparent: true,
  opacity: 0.75,
  envMapIntensity: 2.2,
  alphaMap: puddleMask,
  depthWrite: false,
});
const puddleSpots: [number, number, number, number][] = [
  [-12.6, 22, 3.4, 1.7], [12.4, 76, 4.2, 2.1], [-12.8, 150, 3.0, 1.5],
  [12.8, 214, 4.6, 2.4], [-12.2, 262, 3.8, 2.0],
];
const puddleGeos: THREE.BufferGeometry[] = [];
for (const [x, z, w, h] of puddleSpots) {
  const g = new THREE.PlaneGeometry(w, h);
  g.rotateX(-Math.PI / 2);
  g.translate(x, STREET.curbHeight + 0.006, z);
  puddleGeos.push(g);
}
{
  const merged = mergeGeometries(puddleGeos, false);
  if (merged) {
    const puddleMesh = new THREE.Mesh(merged, puddleMat);
    puddleMesh.receiveShadow = true;
    scene.add(puddleMesh);
  }
  puddleGeos.forEach((g) => g.dispose());
}

// ---------------------------------------------------------------------------
// load authored assets
// ---------------------------------------------------------------------------

const gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const progress = new Map<string, { loaded: number; total: number }>();
let loadedFiles = 0;

function loadGLB(path: string, label: string): Promise<GLTF> {
  return new Promise((resolve, reject) => {
    gltfLoader.load(
      asset(path),
      (gltf) => {
        loadedFiles += 1;
        updateLoading();
        resolve(gltf);
      },
      (ev) => {
        progress.set(label, {
          loaded: ev.loaded || 0,
          total: ev.total || 0,
        });
        updateLoading();
      },
      (err) => reject(err),
    );
  });
}

function updateLoading(): void {
  let loaded = 0;
  let total = 0;
  for (const p of progress.values()) {
    loaded += p.loaded;
    total += p.total;
  }
  const pct = total > 0 ? Math.min(0.96, loaded / total) : Math.min(0.8, loadedFiles / 3);
  loadingBar.style.width = `${Math.round(pct * 100)}%`;
  loadingStatus.textContent = loadedFiles >= 3 ? 'LINK READY' : 'STREAMING CITY GRID';
}

function materialKeyFromName(name: string): string {
  return name.replace(/\.\d+$/, '').replace(/^LOD1_/, '').trim();
}

function collectMaterials(root: THREE.Object3D): Map<string, THREE.Material> {
  const map = new Map<string, THREE.Material>();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (!m) continue;
      const key = materialKeyFromName(m.name);
      if (!map.has(key)) map.set(key, m);
    }
  });
  return map;
}

const TOWER_TARGET: Record<string, string> = {
  MetalOxidized: 'GalvanizedSteel',
  MetalRed: 'PaintedMetal',
  MetalAccent: 'SatinSteel',
  Railing: 'SatinSteel',
  DoorSingle: 'PaintedMetal',
  RoofCorrugated: 'MetalPitted_Grey',
  Mullions: 'MetalPitted_Grey',
  MetalPitted_Brown: 'MetalPitted_Grey',
  ConcGeneral: 'ConcreteBlocks',
  ConcGeneralBrown: 'ConcreteBlocks',
  ConcHorizontal: 'ConcreteBlocks',
  ConcLongBlock: 'ConcreteBlocks',
  ConcGrime: 'ConcreteBlocks',
  Concrete: 'ConcreteBlocks',
  ConcreteMix: 'ConcreteBlocks',
  ConcFloorTiles: 'ConcretePattern',
  StoneFloor: 'ConcretePattern',
  SpeedwayTiles: 'ConcretePattern',
  AsphaltHexagonRoof: 'ConcretePattern',
  ConcFormNoHoles: 'ConcFormHoles',
  ConcreteMix_White: 'WhitePlastic_Dirty',
  FacadeI: 'FacadeF',
  FacadeD: 'FacadeE',
  FacadeJ: 'FacadeE',
  GlsBlack: 'Glass',
  GlsE: 'Glass',
  GlsF: 'Glass',
  Window: 'Glass',
  'Material #25': 'Glass',
  'Material #26': 'AC',
  EmissiveLightMTL: 'Signs_Lights',
};

const PROP_TARGET: Record<string, string> = {
  GlassBottle: 'GlassBlack',
  Rubber: 'PlasticBlack',
  PlasticFoil: 'PlasticWhite',
  Brass: 'SteelRaw',
  AluminiumBrushed: 'SteelRaw',
  Mirror: 'SteelRaw',
  Speaker: 'PlasticBlack',
  ScreensDim: 'Screens',
  ConcreteGrey: 'Concrete',
  ConcretePlastered: 'Concrete',
  ConcreteTiles: 'Concrete',
  PaperWhite: 'Cardboard',
  WoodLacquered: 'Wood',
  PlasticYellow: 'PlasticWhite',
  PaintGreen: 'PaintBlack',
  GlassTransparent: 'GlassBlack',
};

/** Build a lit-window emissive map from a facade base-colour map. */
function makeWindowLightMap(source: THREE.Texture, threshold = 0.48): THREE.CanvasTexture | null {
  const img = source.image as (HTMLImageElement | ImageBitmap | undefined);
  if (!img) return null;
  const iw = (img as { width?: number }).width ?? 1024;
  const ih = (img as { height?: number }).height ?? 1024;
  const w = Math.min(1024, iw);
  const h = Math.min(1024, ih);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  try {
    ctx.drawImage(img as CanvasImageSource, 0, 0, w, h);
  } catch {
    return null;
  }
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  const hash = (x: number, y: number) => {
    let n = (x * 374761393 + y * 668265263) | 0;
    n = (n ^ (n >> 13)) * 1274126177;
    return ((n ^ (n >> 16)) >>> 0) / 0xffffffff;
  };
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const lum = (d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722) / 255;
      const lit = hash(x >> 2, y >> 2) > 0.34;
      if (lum > threshold && lit) {
        const k = 0.45 + lum * 0.9;
        const warm = hash(x >> 5, y >> 5) > 0.38;
        d[i] = Math.min(255, (warm ? 1.0 : 0.55) * 255 * k);
        d[i + 1] = Math.min(255, (warm ? 0.68 : 0.78) * 255 * k);
        d[i + 2] = Math.min(255, (warm ? 0.34 : 1.0) * 255 * k);
        d[i + 3] = 255;
      } else {
        d[i] = 0;
        d[i + 1] = 0;
        d[i + 2] = 0;
        d[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = source.wrapS;
  tex.wrapT = source.wrapT;
  tex.repeat.copy(source.repeat);
  tex.offset.copy(source.offset);
  tex.needsUpdate = true;
  return tex;
}

function addWindowEmissive(mat: THREE.MeshStandardMaterial): void {
  if (!mat.map || !mat.map.image) return;
  const tex = makeWindowLightMap(mat.map);
  if (!tex) return;
  mat.emissiveMap = tex;
  mat.emissive = new THREE.Color(0xffffff);
  mat.emissiveIntensity = 1.05;
  mat.needsUpdate = true;
}

function buildTargetMaterials(
  source: Map<string, THREE.Material>,
  remap: Record<string, string>,
): { map: Map<string, THREE.Material>; batchKey: (key: string) => string } {
  const map = new Map<string, THREE.Material>();
  // prefer the target's own material when it exists
  for (const [key, mat] of source) {
    const target = remap[key] ?? key;
    if (target === key) map.set(target, mat);
  }
  for (const [key, mat] of source) {
    const target = remap[key] ?? key;
    if (!map.has(target)) map.set(target, mat);
  }
  return { map, batchKey: (key: string) => remap[key] ?? key };
}

function placeInstance(source: THREE.Object3D, p: PropPlacement): THREE.Object3D {
  const wrapper = new THREE.Group();
  wrapper.position.set(p.pos[0], p.pos[1], p.pos[2]);
  wrapper.rotation.y = p.yaw ?? 0;
  if (p.scale) wrapper.scale.setScalar(p.scale);
  wrapper.add(source.clone(true));
  return wrapper;
}

function disposeGeometry(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) mesh.geometry.dispose();
  });
}

interface TowerBox {
  id: string;
  box: THREE.Box3;
}

const colliders: { minX: number; maxX: number; minZ: number; maxZ: number }[] = [];

/** Build a merged, tonally-flat reflection proxy from the LOD1 group. */
function buildReflectionProxies(lod1: THREE.Group): THREE.Group {
  const group = new THREE.Group();
  group.name = 'reflection-proxies';
  group.layers.set(2);

  // 1) towers, one vertex-coloured mesh
  const geos: THREE.BufferGeometry[] = [];
  lod1.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!mat) return;
    const matStd = mat as THREE.MeshStandardMaterial;
    const g = mesh.geometry.clone();
    g.applyMatrix4(mesh.matrixWorld);
    g.clearGroups();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position') g.deleteAttribute(name);
    }
    const count = g.attributes.position.count;
    const colors = new Float32Array(count * 3);
    let r = 0.055;
    let gg = 0.062;
    let b = 0.075;
    const hasEmissiveMap = !!(matStd as THREE.MeshStandardMaterial).emissiveMap;
    if (!hasEmissiveMap && matStd.emissive && (matStd.emissive.r + matStd.emissive.g + matStd.emissive.b) > 0.01 && matStd.emissiveIntensity > 0) {
      const k = Math.min(2.2, matStd.emissiveIntensity);
      r = matStd.emissive.r * k;
      gg = matStd.emissive.g * k;
      b = matStd.emissive.b * k;
    } else if (matStd.color) {
      r = matStd.color.r * 0.09 + 0.012;
      gg = matStd.color.g * 0.10 + 0.016;
      b = matStd.color.b * 0.13 + 0.028;
    }
    for (let i = 0; i < count; i += 1) {
      colors[i * 3] = r;
      colors[i * 3 + 1] = gg;
      colors[i * 3 + 2] = b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (!g.index) {
      const seq = new Uint32Array(count);
      for (let i = 0; i < count; i += 1) seq[i] = i;
      g.setIndex(new THREE.BufferAttribute(seq, 1));
    }
    geos.push(g);
  });
  if (geos.length) {
    const merged = geos.length === 1 ? geos[0] : (requireMerge(geos) as THREE.BufferGeometry);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(merged, mat);
    mesh.layers.set(2);
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  // 2) neon sign / hologram quads, one additive mesh
  const neonGeos: THREE.BufferGeometry[] = [];
  const addQuad = (pos: [number, number, number], yaw: number, w: number, h: number, color: THREE.Color) => {
    const g = new THREE.PlaneGeometry(w, h);
    g.rotateY(yaw);
    g.translate(pos[0], pos[1], pos[2]);
    const count = g.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    neonGeos.push(g);
  };
  for (const spec of SIGNS) {
    const c = new THREE.Color(spec.color).multiplyScalar(2.6);
    addQuad(spec.pos, spec.yaw, spec.width * 1.1, spec.height * 1.1, c);
  }
  for (const spec of HOLOGRAMS) {
    const c = new THREE.Color(spec.tint).multiplyScalar(0.65);
    addQuad(spec.pos, spec.yaw, spec.width, spec.height, c);
  }
  if (neonGeos.length) {
    const merged = neonGeos.length === 1 ? neonGeos[0] : (requireMerge(neonGeos) as THREE.BufferGeometry);
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    const mesh = new THREE.Mesh(merged, mat);
    mesh.layers.set(2);
    mesh.frustumCulled = false;
    mesh.renderOrder = 6;
    group.add(mesh);
  }
  return group;
}

function requireMerge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeGeometries(geos, false) as THREE.BufferGeometry;
}

let lod0Group: THREE.Group | null = null;
let lod1Group: THREE.Group | null = null;
let worldStats = { towers: 0, props: 0, calls: 0, tris: 0 };

async function build(): Promise<void> {
  const [towersGltf, lod1Gltf, propsGltf] = await Promise.all([
    loadGLB('models/towers.opt.glb', 'towers'),
    loadGLB('models/towers_lod1.glb', 'lod1'),
    loadGLB('models/props.opt.glb', 'props'),
  ]);

  // materials
  const towerSourceMats = collectMaterials(towersGltf.scene);
  for (const mat of towerSourceMats.values()) configureLoadedMaterial(mat, materialKeyFromName(mat.name));
  const towerMaterials = buildTargetMaterials(towerSourceMats, TOWER_TARGET);
  for (const key of ['FacadeE', 'FacadeF']) {
    const mat = towerMaterials.map.get(key);
    if (mat) addWindowEmissive(mat as THREE.MeshStandardMaterial);
  }

  const propSourceMats = collectMaterials(propsGltf.scene);
  for (const mat of propSourceMats.values()) {
    configureLoadedMaterial(mat, materialKeyFromName(mat.name));
  }
  const propMaterials = buildTargetMaterials(propSourceMats, PROP_TARGET);

  // ---- towers ----
  const towerTemplates = new Map<string, THREE.Object3D>();
  towersGltf.scene.children.forEach((child) => towerTemplates.set(child.name, child));
  const placedTowers = new THREE.Group();
  const towerBoxes: TowerBox[] = [];
  for (const spec of TOWERS) {
    const template = towerTemplates.get(spec.template ?? spec.id);
    if (!template) {
      console.warn('missing tower', spec.id);
      continue;
    }
    const inst = new THREE.Group();
    inst.position.set(...spec.pos);
    inst.rotation.y = spec.yaw;
    inst.add(template.clone(true));
    placedTowers.add(inst);
    inst.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(inst);
    towerBoxes.push({ id: spec.id, box });
    colliders.push({
      minX: box.min.x + 0.2,
      maxX: box.max.x - 0.2,
      minZ: box.min.z + 0.2,
      maxZ: box.max.z - 0.2,
    });
    const ground = box.min.y;
    if (Math.abs(ground) > 0.05) console.warn(`tower ${spec.id} ground y=${ground.toFixed(3)}`);
  }
  // overlap check
  for (let i = 0; i < towerBoxes.length; i += 1) {
    for (let j = i + 1; j < towerBoxes.length; j += 1) {
      const a = towerBoxes[i].box;
      const b = towerBoxes[j].box;
      const ox = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);
      const oz = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z);
      if (ox > 0.3 && oz > 0.3) {
        console.warn(`tower overlap ${towerBoxes[i].id} / ${towerBoxes[j].id}: ${ox.toFixed(1)} × ${oz.toFixed(1)} m`);
      }
    }
  }

  const towerMerge = mergeByMaterial(placedTowers, {
    materialMap: towerMaterials.map,
    batchKey: towerMaterials.batchKey,
  });
  lod0Group = towerMerge.group;
  lod0Group.name = 'towers-lod0';
  lod0Group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  scene.add(lod0Group);
  worldStats.towers = towerMerge.triangles;
  console.log(`towers: ${towerMerge.triangles.toLocaleString()} tris / ${towerMerge.drawCalls} draws`);

  // ---- LOD1 ----
  const lod1Templates = new Map<string, THREE.Object3D>();
  lod1Gltf.scene.children.forEach((child) => lod1Templates.set(child.name, child));
  const placedLod1 = new THREE.Group();
  for (const spec of TOWERS) {
    const key = spec.template ?? spec.id;
    if (!TOWER_LOD1_IDS.includes(key)) continue;
    const template = lod1Templates.get('LOD1_' + key);
    if (!template) continue;
    const inst = new THREE.Group();
    inst.position.set(...spec.pos);
    inst.rotation.y = spec.yaw;
    inst.add(template.clone(true));
    placedLod1.add(inst);
  }
  const lod1Merge = mergeByMaterial(placedLod1, {
    materialMap: towerMaterials.map,
    batchKey: towerMaterials.batchKey,
  });
  lod1Group = lod1Merge.group;
  lod1Group.name = 'towers-lod1';
  lod1Group.visible = false;
  lod1Group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = false;
      mesh.receiveShadow = true;
    }
  });
  scene.add(lod1Group);
  console.log(`lod1: ${lod1Merge.triangles.toLocaleString()} tris / ${lod1Merge.drawCalls} draws`);

  // ---- shops + props ----
  const propTemplates = new Map<string, THREE.Object3D>();
  propsGltf.scene.children.forEach((child) => propTemplates.set(child.name, child));
  const placedProps = new THREE.Group();
  for (const shop of SHOPS) {
    const template = propTemplates.get(shop.type);
    if (!template) {
      console.warn('missing shop', shop.type);
      continue;
    }
    const inst = placeInstance(template, { ...shop, pos: [shop.pos[0], STREET.curbHeight + 0.001, shop.pos[2]] });
    placedProps.add(inst);
    inst.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(inst);
    colliders.push({
      minX: box.min.x + 0.2,
      maxX: box.max.x - 0.2,
      minZ: box.min.z + 0.2,
      maxZ: box.max.z - 0.2,
    });
  }
  for (const p of PROPS) {
    const template = propTemplates.get(p.type);
    if (!template) {
      console.warn('missing prop', p.type);
      continue;
    }
    const onSidewalk = Math.abs(p.pos[0]) > STREET.roadHalfWidth + 0.2 && p.pos[1] < 1;
    placedProps.add(placeInstance(template, {
      ...p,
      pos: [p.pos[0], p.pos[1] + (onSidewalk ? STREET.curbHeight : 0), p.pos[2]],
    }));
  }
  for (const c of CABLES) {
    const template = propTemplates.get('CyberAcc_ElectricWires');
    if (!template) break;
    placedProps.add(placeInstance(template, { type: 'CyberAcc_ElectricWires', pos: c.pos, yaw: c.yaw, scale: c.scale }));
  }
  for (const p of PIPES) {
    const template = propTemplates.get('CyberAcc_Pipe');
    if (!template) break;
    placedProps.add(placeInstance(template, { type: 'CyberAcc_Pipe', pos: p.pos, yaw: p.yaw, scale: p.scale }));
  }
  const propMerge = mergeByMaterial(placedProps, {
    materialMap: propMaterials.map,
    batchKey: propMaterials.batchKey,
  });
  const propsGroup = propMerge.group;
  propsGroup.name = 'props';
  propsGroup.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = false;
      mesh.receiveShadow = true;
    }
  });
  scene.add(propsGroup);
  worldStats.props = propMerge.triangles;
  console.log(`props + shops: ${propMerge.triangles.toLocaleString()} tris / ${propMerge.drawCalls} draws`);

  // ---- signs & holograms ----
  const signAtlas = buildSignAtlas(SIGNS);
  if (signAtlas) scene.add(signAtlas.mesh);

  // physical frames for the blade signs, merged into one draw
  {
    const frameGeos: THREE.BufferGeometry[] = [];
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x121418, roughness: 0.5, metalness: 0.65 });
    for (const spec of SIGNS) {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(spec.width + 0.22, spec.height + 0.22, 0.12), frameMat);
      frame.position.set(...spec.pos);
      frame.rotation.y = spec.yaw;
      frame.translateZ(-0.09);
      frame.updateMatrixWorld(true);
      const g = frame.geometry.clone();
      g.applyMatrix4(frame.matrixWorld);
      g.clearGroups();
      frameGeos.push(g);
      frame.geometry.dispose();
    }
    const mergedFrames = mergeGeometries(frameGeos, false);
    if (mergedFrames) {
      const frameMesh = new THREE.Mesh(mergedFrames, frameMat);
      frameMesh.name = 'sign-frames';
      frameMesh.castShadow = false;
      frameMesh.receiveShadow = false;
      scene.add(frameMesh);
    }
    frameGeos.forEach((g) => g.dispose());
  }

  // authored neon strips along the block edges (vertex-coloured, one draw call)
  {
    const strips: { pos: [number, number, number]; size: [number, number, number]; color: string }[] = [
      { pos: [-15.95, 9.0, 12], size: [0.14, 16, 0.14], color: '#35e8ff' },
      { pos: [-21.85, 6.5, 58], size: [0.14, 12, 0.14], color: '#ff3e9a' },
      { pos: [15.02, 7.0, 18], size: [0.14, 14, 0.14], color: '#ff4a7a' },
      { pos: [27.9, 12.0, 70], size: [0.16, 20, 0.16], color: '#35e8ff' },
      { pos: [27.9, 12.0, 140], size: [0.16, 20, 0.16], color: '#ff9a5a' },
      { pos: [15.62, 5.5, 195], size: [0.14, 9, 0.14], color: '#c77dff' },
      { pos: [6.0, 70.0, 308.25], size: [0.2, 120, 0.2], color: '#35e8ff' },
    ];
    const geos: THREE.BufferGeometry[] = [];
    for (const strip of strips) {
      const g = new THREE.BoxGeometry(...strip.size);
      g.translate(...strip.pos);
      const c = new THREE.Color(strip.color).multiplyScalar(1.5);
      const count = g.attributes.position.count;
      const colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i += 1) {
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geos.push(g);
    }
    const merged = mergeGeometries(geos, false);
    if (merged) {
      const mesh = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ vertexColors: true }));
      mesh.name = 'neon-strips';
      mesh.frustumCulled = false;
      scene.add(mesh);
    }
    geos.forEach((g) => g.dispose());
  }

  // soft neon streaks on the wet road (complements the planar reflection)
  {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 512;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, 128, 512);
    const grad = g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, 'rgba(255,255,255,0.0)');
    grad.addColorStop(0.22, 'rgba(255,255,255,0.65)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.28)');
    grad.addColorStop(1, 'rgba(255,255,255,0.0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 512);
    const side = g.createLinearGradient(0, 0, 128, 0);
    side.addColorStop(0, 'rgba(0,0,0,0)');
    side.addColorStop(0.5, 'rgba(255,255,255,1)');
    side.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-in';
    g.fillStyle = side;
    g.fillRect(0, 0, 128, 512);
    // broken vertical streaks
    g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 24; i += 1) {
      g.fillStyle = `rgba(0,0,0,${0.15 + Math.random() * 0.35})`;
      g.fillRect(Math.random() * 128, Math.random() * 512, 2 + Math.random() * 8, 8 + Math.random() * 90);
    }
    const streakTex = new THREE.CanvasTexture(c);
    streakTex.colorSpace = THREE.SRGBColorSpace;
    streakTex.anisotropy = 4;

    const items = [
      { x: 14.6, z: 9.0, w: 7.5, l: 22, color: '#ff3e9a' },
      { x: 14.9, z: -2.0, w: 3.0, l: 14, color: '#35e8ff' },
      { x: -14.6, z: 44.0, w: 3.4, l: 20, color: '#ff7a36' },
      { x: -14.4, z: 36.0, w: 3.0, l: 14, color: '#ffb070' },
      { x: -15.1, z: 6.0, w: 2.6, l: 14, color: '#ff4a7a' },
      { x: -14.5, z: 110.0, w: 3.0, l: 16, color: '#ff3e9a' },
      { x: -9.8, z: 30.0, w: 4.0, l: 22, color: '#35e8ff' },
      { x: 9.8, z: 28.0, w: 4.0, l: 20, color: '#ff3e9a' },
      { x: 14.5, z: 128.0, w: 3.0, l: 16, color: '#35e8ff' },
    ];
    const geos: THREE.BufferGeometry[] = [];
    for (const it of items) {
      const geo = new THREE.PlaneGeometry(it.w, it.l);
      geo.rotateX(-Math.PI / 2);
      geo.translate(it.x, 0.026, it.z - it.l * 0.5);
      const col = new THREE.Color(it.color).multiplyScalar(1.6);
      const count = geo.attributes.position.count;
      const colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i += 1) {
        colors[i * 3] = col.r;
        colors[i * 3 + 1] = col.g;
        colors[i * 3 + 2] = col.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geos.push(geo);
    }
    const merged = mergeGeometries(geos, false);
    if (merged) {
      const mat = new THREE.MeshBasicMaterial({
        map: streakTex,
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = 'neon-road-streaks';
      mesh.renderOrder = 3;
      scene.add(mesh);
    }
    geos.forEach((geo) => geo.dispose());
  }

  // lit window grids on the plain concrete facades
  {
    const gridCanvas = document.createElement('canvas');
    gridCanvas.width = gridCanvas.height = 1024;
    const g = gridCanvas.getContext('2d')!;
    g.clearRect(0, 0, 1024, 1024);
    let seed = 6611;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };
    const cols = 10;
    const rows = 8;
    const cw = 1024 / cols;
    const ch = 1024 / rows;
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        if (rnd() < 0.52) continue;
        g.fillStyle = `rgba(255,${155 + Math.floor(rnd() * 55)},${85 + Math.floor(rnd() * 45)},${0.3 + rnd() * 0.35})`;
        g.fillRect(x * cw + cw * 0.22, y * ch + ch * 0.24, cw * 0.56, ch * 0.42);
        g.fillStyle = 'rgba(2,6,10,0.35)';
        g.fillRect(x * cw + cw * 0.22, y * ch + ch * 0.56, cw * 0.56, ch * 0.1);
      }
    }
    const gridTex = new THREE.CanvasTexture(gridCanvas);
    gridTex.colorSpace = THREE.SRGBColorSpace;
    gridTex.anisotropy = 8;
    const gridMat = new THREE.MeshBasicMaterial({
      map: gridTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      opacity: 0.52,
    });
    const planes: { pos: [number, number, number]; yaw: number; w: number; h: number }[] = [
      { pos: [15.05, 14.0, 10.0], yaw: -Math.PI / 2, w: 20, h: 14 },
      { pos: [-21.9, 15.0, 44.0], yaw: Math.PI / 2, w: 20, h: 14 },
      { pos: [27.95, 38.0, 100.0], yaw: -Math.PI / 2, w: 58, h: 48 },
    ];
    const geos: THREE.BufferGeometry[] = [];
    for (const p of planes) {
      const geo = new THREE.PlaneGeometry(p.w, p.h);
      geo.rotateY(p.yaw);
      geo.translate(...p.pos);
      geos.push(geo);
    }
    const merged = mergeGeometries(geos, false);
    if (merged) {
      const mesh = new THREE.Mesh(merged, gridMat);
      mesh.name = 'window-grids';
      mesh.frustumCulled = false;
      scene.add(mesh);
    }
    geos.forEach((geo) => geo.dispose());
  }

  // moon glow behind the vista tower
  {
    const moonGlow = makeMoonTexture();
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({
      map: moonGlow,
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    }));
    moon.position.set(-55, 120, 590);
    moon.scale.set(24, 24, 1);
    scene.add(moon);
  }

  const holograms: HologramHandle[] = [];
  for (const spec of HOLOGRAMS) {
    const handle = createHologram(spec);
    scene.add(handle.mesh);
    holograms.push(handle);
  }

  // ---- flat reflection proxies ----
  if (lod1Group) {
    const proxies = buildReflectionProxies(lod1Group);
    scene.add(proxies);
  }

  // ---- effects ----
  const rain = createRain();
  scene.add(rain.mesh);
  const steam = createSteam(STEAM);
  scene.add(steam.points);
  const traffic = createTraffic();
  scene.add(traffic.points);

  // ---- dispose source geometry (merged copies are live) ----
  disposeGeometry(towersGltf.scene);
  disposeGeometry(lod1Gltf.scene);
  disposeGeometry(propsGltf.scene);

  // ---- camera / shot ----
  applyShot(SHOTS[requestedShot] ? requestedShot : 'hero', true);
  if (startFree) {
    enterFreeMode();
  }

  // ---- one-time shadow map ----
  renderer.shadowMap.needsUpdate = true;

  // ---- interaction markers in the HUD ----
  updateHudStatic();

  // ---- loop ----
  let lastTime = performance.now();
  let elapsed = 0;
  let lastTelemetry = 0;
  let frames = 0;
  let fpsAccum = 0;
  let fpsFrames = 0;
  let lastFps = 60;
  let renderMs = 0;
  let reflectionMs = 0;
  let currentPrompt: string | null = null;

  const tick = () => {
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    elapsed += dt;
    const t = elapsed;
    frames += 1;

    if (!freeMode) {
      // deterministic shots stay still; free mode is driven by the controller
    } else {
      walk.update(dt);
      camera.position.copy(walk.position);
      camera.quaternion.copy(walk.quaternion);
    }

    // LOD: authored LOD0 close up, textured LOD1 for the wider view
    const blockCenter = new THREE.Vector3(0, 0, 130);
    const dist = camera.position.distanceTo(blockCenter);
    const forceLod = shotMode ? SHOTS[activeShot]?.lod : undefined;
    const useLod1 = forceLod === 1 || (forceLod !== 0 && dist > 172);
    if (lod0Group && lod1Group) {
      lod0Group.visible = !useLod1;
      lod1Group.visible = useLod1;
    }

    rain.update(t, camera);
    steam.update(t);
    traffic.update(t);
    for (const h of holograms) h.material.uniforms.uTime.value = t;
    road.setTime(t);

    // interaction prompt
    let best: { label: string; sub: string; d: number } | null = null;
    for (const it of INTERACTIONS) {
      const d = camera.position.distanceTo(new THREE.Vector3(...it.point));
      if (d < it.radius && (!best || d < best.d)) best = { label: it.label, sub: it.sub, d };
    }
    if (best && best.label !== currentPrompt) {
      currentPrompt = best.label;
      promptTextEl.textContent = best.label;
      promptEl.classList.add('is-visible');
      promptEl.dataset.sub = best.sub;
    } else if (!best && currentPrompt) {
      currentPrompt = null;
      promptEl.classList.remove('is-visible');
    }

    // FPS
    fpsAccum += dt;
    fpsFrames += 1;
    if (fpsAccum > 0.5) {
      const fps = fpsFrames / fpsAccum;
      lastFps = fps;
      fpsAccum = 0;
      fpsFrames = 0;
      if (performance.now() - lastTelemetry > 600) {
        lastTelemetry = performance.now();
        telemetryEl.innerHTML = `<span>${fps.toFixed(0).padStart(2, '0')}</span> FPS <i></i> <span>${(renderer.info.render.triangles / 1e6).toFixed(2)}</span> M TRIS <i></i> <span>${renderer.info.render.calls}</span> CALLS`;
      }
    }
    coordsEl.textContent = `${camera.position.x.toFixed(0).padStart(3, ' ')} / ${camera.position.z.toFixed(0).padStart(3, ' ')}`;

    // reflection needs the camera matrices
    camera.updateMatrixWorld(true);
    const reflectStart = performance.now();
    reflection.update(renderer, scene, camera);
    reflectionMs = reflectionMs * 0.9 + (performance.now() - reflectStart) * 0.1;

    renderer.info.reset();
    const renderStart = performance.now();
    composer.render();
    renderMs = renderMs * 0.9 + (performance.now() - renderStart) * 0.1;
    window.__lastStats = {
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      fps: lastFps,
      renderMs,
      reflectionMs,
      frames,
      lod: useLod1 ? 1 : 0,
      position: [camera.position.x, camera.position.y, camera.position.z],
    };
  };

  renderer.setAnimationLoop(tick);

  // precompile + first frame while the loading screen is still up
  await renderer.compileAsync(scene, camera);
  renderer.shadowMap.needsUpdate = true;
  composer.render();
  window.__lastStats = {
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    fps: 60,
    frames: 0,
    lod: 0,
    position: [camera.position.x, camera.position.y, camera.position.z],
  };
  loadingBar.style.width = '100%';
  loadingStatus.textContent = 'SECTOR READY';
  loadingEl.classList.add('is-ready');
  window.setTimeout(() => {
    loadingEl.classList.add('is-hidden');
  }, 650);
  window.__cyber.ready = true;
  document.body.dataset.ready = 'true';
}

// ---------------------------------------------------------------------------
// walk controller / camera
// ---------------------------------------------------------------------------

let freeMode = startFree;
let shotMode = !startFree;
let activeShot = SHOTS[requestedShot] ? requestedShot : 'hero';

class WalkController {
  position = new THREE.Vector3(0.8, 1.68, -27);
  yaw = Math.PI;
  pitch = 0;
  quaternion = new THREE.Quaternion();
  private keys = new Set<string>();
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private readonly onKeyDown: (e: KeyboardEvent) => void;
  private readonly onKeyUp: (e: KeyboardEvent) => void;
  private readonly onPointerDown: (e: PointerEvent) => void;
  private readonly onPointerMove: (e: PointerEvent) => void;
  private readonly onPointerUp: (e: PointerEvent) => void;

  constructor(target: HTMLCanvasElement) {
    this.onKeyDown = (e) => {
      if (!freeMode) enterFreeMode();
      this.keys.add(e.code);
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'].includes(e.code)) {
        e.preventDefault();
      }
    };
    this.onKeyUp = (e) => this.keys.delete(e.code);
    this.onPointerDown = (e) => {
      if (e.button !== 0) return;
      if (!freeMode) enterFreeMode();
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      target.setPointerCapture(e.pointerId);
      target.classList.add('is-dragging');
    };
    this.onPointerMove = (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.yaw -= dx * 0.0024;
      this.pitch -= dy * 0.0022;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -1.15, 1.15);
    };
    this.onPointerUp = (e) => {
      this.dragging = false;
      target.classList.remove('is-dragging');
      try {
        target.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('pointerdown', this.onPointerDown);
    target.addEventListener('pointermove', this.onPointerMove);
    target.addEventListener('pointerup', this.onPointerUp);
    target.addEventListener('pointercancel', this.onPointerUp);
  }

  syncFromCamera(cam: THREE.PerspectiveCamera): void {
    this.position.copy(cam.position);
    const euler = new THREE.Euler().setFromQuaternion(cam.quaternion, 'YXZ');
    this.yaw = euler.y;
    this.pitch = euler.x;
  }

  update(dt: number): void {
    const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    this.quaternion.setFromEuler(euler);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.quaternion);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    let mx = 0;
    let mz = 0;
    if (this.keys.has('KeyW')) mz += 1;
    if (this.keys.has('KeyS')) mz -= 1;
    if (this.keys.has('KeyD')) mx += 1;
    if (this.keys.has('KeyA')) mx -= 1;
    const run = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const speed = run ? 8.0 : 3.6;
    if (mx || mz) {
      const dir = new THREE.Vector3()
        .addScaledVector(forward, mz)
        .addScaledVector(right, mx)
        .normalize()
        .multiplyScalar(speed * dt);
      this.position.x += dir.x;
      this.position.z += dir.z;
    }
    this.position.y = 1.68;
    resolveCollision(this.position);
    this.position.x = THREE.MathUtils.clamp(this.position.x, -36, 36);
    this.position.z = THREE.MathUtils.clamp(this.position.z, -36, 303);
  }
}

function resolveCollision(pos: THREE.Vector3): void {
  const r = 0.38;
  for (let iter = 0; iter < 2; iter += 1) {
    for (const c of colliders) {
      if (pos.x > c.minX - r && pos.x < c.maxX + r && pos.z > c.minZ - r && pos.z < c.maxZ + r) {
        const dxl = Math.abs(pos.x - (c.minX - r));
        const dxr = Math.abs(pos.x - (c.maxX + r));
        const dzl = Math.abs(pos.z - (c.minZ - r));
        const dzr = Math.abs(pos.z - (c.maxZ + r));
        const m = Math.min(dxl, dxr, dzl, dzr);
        if (m === dxl) pos.x = c.minX - r;
        else if (m === dxr) pos.x = c.maxX + r;
        else if (m === dzl) pos.z = c.minZ - r;
        else pos.z = c.maxZ + r;
      }
    }
  }
}

const walk = new WalkController(canvas);

function enterFreeMode(): void {
  if (freeMode) return;
  freeMode = true;
  shotMode = false;
  walk.syncFromCamera(camera);
  document.body.classList.add('is-free');
  showToast('WALK MODE · WASD MOVE · SHIFT RUN · DRAG LOOK');
}

function applyShot(name: string, initial = false): void {
  const shot: Shot = SHOTS[name] ?? SHOTS.hero;
  activeShot = name;
  shotMode = true;
  freeMode = false;
  camera.fov = shot.fov;
  camera.updateProjectionMatrix();
  camera.position.set(...shot.position);
  camera.lookAt(new THREE.Vector3(...shot.target));
  const hud = shot.hud ?? (hudParam !== '0');
  document.body.classList.toggle('hud-off', !hud);
  if (initial) {
    document.body.classList.toggle('is-ui-shot', name === 'ui');
  } else {
    document.body.classList.toggle('is-ui-shot', name === 'ui');
  }
}

function showToast(text: string): void {
  toastEl.textContent = text;
  toastEl.classList.add('is-visible');
  window.clearTimeout((showToast as unknown as { timer?: number }).timer);
  (showToast as unknown as { timer?: number }).timer = window.setTimeout(() => {
    toastEl.classList.remove('is-visible');
  }, 2600);
}

function updateHudStatic(): void {
  locationEl.innerHTML = `
    <span class="hud-kicker">KOWLOON ARCOLOGY</span>
    <strong>LOWER MARKET / SECTOR 09</strong>
    <span class="hud-meta">23:47 &nbsp;·&nbsp; RAIN &nbsp;·&nbsp; 18°C &nbsp;·&nbsp; GRID ONLINE</span>
  `;
  objectiveEl.innerHTML = `
    <span class="hud-kicker">OBJECTIVE 01</span>
    <strong>FIND THE NIGHT MARKET</strong>
    <span class="hud-meta">Follow the noodle-bar neon north through the block.</span>
  `;
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyE') {
    const prompt = promptEl.classList.contains('is-visible');
    if (prompt) {
      showToast(`${promptEl.dataset.sub ?? 'STOREFRONT'} · INTERIOR LINK OFFLINE IN THIS SLICE`);
    }
  }
  if (e.code === 'KeyR') applyShot('hero');
});

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.setSize(w, h);
});

// ---------------------------------------------------------------------------
// composer
// ---------------------------------------------------------------------------

const pr = renderer.getPixelRatio();
const renderTarget = new THREE.WebGLRenderTarget(window.innerWidth * pr, window.innerHeight * pr, {
  type: THREE.HalfFloatType,
  samples: 4,
});
const composer = new EffectComposer(renderer, renderTarget);
composer.setPixelRatio(pr);
composer.setSize(window.innerWidth, window.innerHeight);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.34,
  0.56,
  1.15,
);
composer.addPass(bloom);
const gradePass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uSaturation: { value: 1.14 },
    uContrast: { value: 1.06 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uSaturation;
    uniform float uContrast;
    varying vec2 vUv;
    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 color = tex.rgb;
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luma), color, uSaturation);
      color = (color - 0.18) * uContrast + 0.18;
      color += vec3(-0.004, 0.002, 0.010) * (1.0 - smoothstep(0.0, 0.45, luma));
      color += vec3(0.012, 0.003, -0.005) * smoothstep(0.45, 1.0, luma);
      gl_FragColor = vec4(color, tex.a);
    }
  `,
});
composer.addPass(gradePass);
composer.addPass(new OutputPass());

// ---------------------------------------------------------------------------
// public hooks
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    __cyber: {
      ready: boolean;
      setShot: (name: string) => void;
      bench: (frames?: number) => Promise<unknown>;
      stats: () => unknown;
      scene: THREE.Scene;
      renderer: THREE.WebGLRenderer;
      camera: THREE.PerspectiveCamera;
    };
    __lastStats: unknown;
  }
}

window.__cyber = {
  ready: false,
  setShot: (name: string) => {
    if (SHOTS[name]) applyShot(name);
  },
  bench: async (frames = 180) => {
    const samples: number[] = [];
    let prev = performance.now();
    let count = 0;
    return new Promise((resolve) => {
      const tick = (t: number) => {
        if (count > 2) samples.push(t - prev);
        prev = t;
        count += 1;
        if (count <= frames) {
          requestAnimationFrame(tick);
          return;
        }
        samples.sort((a, b) => a - b);
        const avg = samples.reduce((a, b) => a + b, 0) / Math.max(1, samples.length);
        const p = (q: number) => samples[Math.min(samples.length - 1, Math.floor(samples.length * q))] ?? 0;
        const gl = renderer.getContext();
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        resolve({
          fps: 1000 / avg,
          avgMs: avg,
          p50Ms: p(0.5),
          p95Ms: p(0.95),
          minMs: samples[0],
          maxMs: samples[samples.length - 1],
          calls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          width: window.innerWidth,
          height: window.innerHeight,
          pixelRatio: renderer.getPixelRatio(),
          gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown',
          lod: window.__lastStats && (window.__lastStats as { lod: number }).lod,
          renderMs: window.__lastStats && (window.__lastStats as { renderMs: number }).renderMs,
          reflectionMs: window.__lastStats && (window.__lastStats as { reflectionMs: number }).reflectionMs,
        });
      };
      requestAnimationFrame(tick);
    });
  },
  stats: () => window.__lastStats,
  scene,
  renderer,
  camera,
};

// ---------------------------------------------------------------------------
// go
// ---------------------------------------------------------------------------

build().catch((err) => {
  console.error(err);
  loadingStatus.textContent = 'LINK FAILED — CHECK CONSOLE';
  loadingBar.style.background = '#ff4a3d';
});
