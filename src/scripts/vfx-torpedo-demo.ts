import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Combat } from '../game/combat';
import { getShip, type WeaponMount } from '../game/ships';
import { loadShipModel } from '../game/ship';

/**
 * 鱼雷/爆炸 VFX 截图与性能测试页。
 *
 * 不跑完整游戏循环，只跑 Combat.update + 后处理，便于 CDP 逐帧步进：
 *   ?scene=volley|torpedo|impact|death|finale|bench
 *   ?hud=0 隐藏测试信息
 *
 * 页面暴露 window.__vfxDemo：
 *   ready / advanceTo(t) / captureAt(t) / findImpactTime() / bench() / info()
 */

const BASE = import.meta.env.BASE_URL.replace(/\/+$/, '');
const params = new URLSearchParams(window.location.search);
const sceneName = params.get('scene') ?? 'volley';
const showHud = params.get('hud') !== '0';

interface DemoApi {
  ready: boolean;
  scene: string;
  advanceTo: (time: number) => void;
  captureAt: (time: number) => Promise<{ time: number; info: Record<string, unknown> }>;
  findImpactTime: () => number;
  bench: (heavy?: number, light?: number, frames?: number) => Record<string, unknown>;
  info: () => Record<string, unknown>;
  debugState: () => Record<string, unknown>;
}

declare global {
  interface Window {
    __vfxDemo?: DemoApi;
  }
}

const canvas = document.getElementById('vfx-canvas') as HTMLCanvasElement;
const hud = document.getElementById('vfx-hud') as HTMLElement;
if (!showHud) hud.style.display = 'none';

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
  logarithmicDepthBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.86;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.info.autoReset = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02040a);

const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 1, 5e7);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.44, 0.58, 0.88);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* ── 星空 / 环境光 ─────────────────────────────────────────── */

function addStars(): void {
  const count = 5200;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < count; i += 1) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const radius = 1.2e6 + Math.random() * 1.5e6;
    positions[i * 3] = Math.sin(phi) * Math.cos(theta) * radius;
    positions[i * 3 + 1] = Math.cos(phi) * radius * 0.65;
    positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;
    const warmth = Math.random();
    color.setHSL(0.56 + warmth * 0.08, 0.25 + warmth * 0.3, 0.55 + Math.random() * 0.4);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 1.4,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const stars = new THREE.Points(geometry, material);
  stars.frustumCulled = false;
  scene.add(stars);
}

addStars();

const sun = new THREE.DirectionalLight(0xfff0dd, 4.2);
sun.position.set(0.7, 0.6, 0.4).multiplyScalar(1000);
scene.add(sun);
scene.add(new THREE.AmbientLight(0x2a3d5c, 0.65));

const rim = new THREE.DirectionalLight(0x7fb8ff, 1.8);
rim.position.set(-0.5, -0.2, -0.8).multiplyScalar(1000);
scene.add(rim);

// 相机侧补光：让 8 km 大舰和鱼雷弹体在背光时仍能看清
const fill = new THREE.DirectionalLight(0xb8d4ea, 2.3);
fill.position.set(0.15, 0.4, 1).multiplyScalar(1000);
scene.add(fill);

const sideFill = new THREE.DirectionalLight(0x9fc4e4, 1.7);
sideFill.position.set(1, 0.3, 0.5).multiplyScalar(1000);
scene.add(sideFill);

/* ── Combat / 目标舰 ──────────────────────────────────────── */

const spec = getShip('rta_archon');
const heavyWeapon = spec.weapons.find((weapon) => weapon.type === 'torpedo');
const identity = new THREE.Quaternion();
const playerVelocity = new THREE.Vector3();
const playerPos = new THREE.Vector3();
let combat: Combat;
let simTime = 0;
let impactCount = 0;
let benchSpawned = false;
let capitalTemplate: { group: THREE.Group; collision?: any } | null = null;

function createCombat(): Combat {
  impactCount = 0;
  return new Combat(scene, {
    onPlayerDamage: () => {},
    onNpcKilled: () => {},
    onExplosion: () => {},
    onImpact: () => {
      impactCount += 1;
    },
  });
}

async function loadCapitalTemplate(): Promise<void> {
  if (!combat) return;
  try {
    const template = await loadShipModel(
      `${BASE}/models/${spec.model}`,
      spec.length,
      spec.nozzles,
      spec.cockpits[0],
      spec.exhaust,
    );
    combat.setTemplates(new Map([[spec.id, {
      group: template.group,
      spec,
      collision: template.collision,
    }]]));
    capitalTemplate = { group: template.group, collision: template.collision };
  } catch (error) {
    console.error('Archon 模板加载失败', error);
  }
}

function spawnCapital(position = new THREE.Vector3()): any {
  const anyCombat = combat as any;
  const npc = anyCombat.createNpc(spec, position, 'neutral', 'flagship', 9999, new THREE.Vector3());
  npc.hostile = false;
  npc.alerted = false;
  npc.velocity.set(0, 0, 0);
  npc.collisionCooldown = 0;
  // 测试用：让鱼雷打到船壳而不是护盾气泡
  npc.shield = 0;
  npc.maxShield = 0;
  return npc;
}

function torpedoWeapon(heavy: boolean): WeaponMount {
  if (heavy && heavyWeapon) return { ...heavyWeapon, spread: 0 };
  return {
    id: 'bench-su',
    type: 'torpedo',
    pos: [0, 0, 0],
    damage: 320,
    rate: 0.4,
    speed: 900,
    range: 8000,
    spread: 0,
    color: 0xff7a5c,
  };
}

function launch(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  heavy: boolean,
  homing?: () => THREE.Vector3 | null,
): void {
  const weapon = torpedoWeapon(heavy);
  combat.fire(origin, direction, weapon, identity, homing);
}

function setupVolley(): void {
  // 静态展示舰：不加入 combat.npcs，避免鱼雷从硬点发射时立刻打到自己
  if (capitalTemplate) {
    const display = capitalTemplate.group.clone(true);
    display.position.set(0, 0, 0);
    scene.add(display);
  }
  const launchers = spec.weapons.filter((weapon) => weapon.type === 'torpedo');
  const left = launchers.filter((weapon) => weapon.side === 'left').slice(0, 7);
  const right = launchers.filter((weapon) => weapon.side === 'right').slice(0, 7);
  // 一次真正的齐射：左/右各 7 发，扇形离舰
  for (const weapon of left) {
    const origin = new THREE.Vector3(...weapon.pos);
    const dir = new THREE.Vector3(-0.32 - Math.random() * 0.06, 0.025, -1).normalize();
    launch(origin, dir, true);
  }
  for (const weapon of right) {
    const origin = new THREE.Vector3(...weapon.pos);
    const dir = new THREE.Vector3(0.32 + Math.random() * 0.06, 0.025, -1).normalize();
    launch(origin, dir, true);
  }
  camera.position.set(4200, 1700, 3200);
  camera.lookAt(0, 200, -2000);
}

function setupTorpedo(): void {
  const anyCombat = combat as any;
  const target = anyCombat.createNpc(
    getShip('thunderbolt'),
    new THREE.Vector3(4200, 120, 0),
    'hostile',
    'escort',
    9999,
    new THREE.Vector3(),
  );
  target.hostile = true;
  target.alerted = true;
  target.shield = 0;
  target.maxShield = 0;
  target.velocity.set(0, 0, 0);
  const origin = new THREE.Vector3(-3200, 120, 0);
  launch(origin, new THREE.Vector3(1, 0, 0), true, () => (target.alive ? target.group.position : null));
  camera.position.set(0, 160, 820);
  camera.lookAt(0, 160, 0);
}

function setupImpact(): void {
  spawnCapital(new THREE.Vector3(0, 0, 0));
  const origin = new THREE.Vector3(9000, 500, 8000);
  const aim = new THREE.Vector3(0, 0, -2000);
  launch(origin, aim.sub(origin).normalize(), true);
  camera.position.set(3000, 1100, 4000);
  camera.lookAt(1200, 0, -300);
}

function setupDeath(): void {
  const npc = spawnCapital(new THREE.Vector3(0, 0, 0));
  (combat as any).beginNpcDeath(npc);
  camera.position.set(8000, 3000, 4500);
  camera.lookAt(0, 0, 0);
}

function setupFinale(): void {
  const axis = new THREE.Vector3(1, 0.22, 0.35).normalize();
  const orientation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
  combat.finaleAt(new THREE.Vector3(0, 0, 0), 8000, 10, orientation);
  camera.position.set(8000, 3400, 13000);
  camera.lookAt(0, 0, 0);
}

function setupBench(): void {
  // 不加载 8 km 模型，只测纯 VFX 更新/绘制成本
  if (benchSpawned) return;
  benchSpawned = true;
  const total = 220;
  for (let i = 0; i < total; i += 1) {
    const heavy = i < 140;
    const angle = (i / total) * Math.PI * 2;
    const radius = 2500 + (i % 17) * 900;
    const origin = new THREE.Vector3(
      Math.cos(angle) * radius,
      (Math.sin(i * 1.7) * 0.5) * radius * 0.5,
      Math.sin(angle) * radius,
    );
    const dir = new THREE.Vector3(
      Math.cos(angle + Math.PI),
      (Math.sin(i * 0.9) * 0.5),
      Math.sin(angle + Math.PI),
    ).normalize();
    launch(origin, dir, heavy);
  }
  camera.position.set(6500, 3200, 9000);
  camera.lookAt(0, 0, 0);
}

function render(): void {
  renderer.info.reset();
  composer.render();
}

function step(dt: number): void {
  simTime += dt;
  playerPos.copy(camera.position);
  combat.update(dt, playerPos, playerVelocity, camera.quaternion, camera, 25);
}

function advanceTo(time: number): void {
  const fixed = 1 / 60;
  const maxSteps = 6000;
  let steps = 0;
  while (simTime + fixed <= time && steps < maxSteps) {
    step(fixed);
    steps += 1;
  }
  if (time > simTime) step(time - simTime);
  render();
  updateHud();
}

function info(): Record<string, unknown> {
  const stats = combat?.vfxStats;
  return {
    scene: sceneName,
    time: Number(simTime.toFixed(3)),
    projectiles: stats?.projectiles ?? 0,
    torpedoes: stats?.torpedoes ?? null,
    explosions: stats?.explosions ?? null,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    programs: renderer.info.programs?.length ?? 0,
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
  };
}

function debugState(): Record<string, unknown> {
  const anyCombat = combat as any;
  const npcs = (anyCombat?.npcs ?? []).map((npc: any) => {
    const box = new THREE.Box3().setFromObject(npc.group);
    return {
      position: npc.group.position.toArray(),
      alive: npc.alive,
      radius: npc.radius,
      collision: npc.collision ? {
        bounds: {
          min: npc.collision.bounds.min.toArray(),
          max: npc.collision.bounds.max.toArray(),
        },
        triangles: npc.collision.triangles,
      } : null,
      box: { min: box.min.toArray(), max: box.max.toArray() },
    };
  });
  const projectiles = (anyCombat?.projectiles ?? []).slice(0, 4).map((p: any) => ({
    position: p.position.toArray(),
    life: p.life,
    owner: p.owner,
    type: p.weaponType,
    torpedo: !!p.torpedo,
  }));
  const p0 = anyCombat?.projectiles?.[0];
  const t0 = p0?.torpedo;
  const torpedo = t0 ? {
    age: t0.age,
    wobbleX: t0.wobbleX,
    wobbleY: t0.wobbleY,
    offset: t0.offset.toArray(),
    trail: t0.trail,
    ribbon: t0.trail >= 0 ? Array.from((anyCombat.torpedoVfx as any).ribbon.slots[t0.trail].points) : null,
  } : null;
  return { time: simTime, npcs, projectiles, torpedo, impactCount };
}

async function captureAt(time: number): Promise<{ time: number; info: Record<string, unknown> }> {
  advanceTo(time);
  render();
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
  render();
  updateHud();
  return { time: simTime, info: info() };
}

function findImpactTime(): number {
  const fixed = 1 / 60;
  for (let i = 0; i < 1200; i += 1) {
    if (impactCount > 0) return simTime;
    step(fixed);
  }
  return simTime;
}

function bench(heavyCount = 140, lightCount = 80, frames = 240): Record<string, unknown> {
  // 当前页面必须已是 bench 场景
  const frameTime = 1 / 60;
  const start = performance.now();
  for (let i = 0; i < frames; i += 1) step(frameTime);
  const updateMs = (performance.now() - start) / frames;

  const gl = renderer.getContext();
  // 场景本身的 draw call / 三角形（不含 bloom/后处理）
  renderer.info.reset();
  renderer.render(scene, camera);
  const sceneDrawCalls = renderer.info.render.calls;
  const sceneTriangles = renderer.info.render.triangles;

  const renderStart = performance.now();
  for (let i = 0; i < 8; i += 1) {
    renderer.info.reset();
    renderer.render(scene, camera);
  }
  gl.finish();
  const sceneRenderMs = (performance.now() - renderStart) / 8;

  const composerStart = performance.now();
  for (let i = 0; i < 6; i += 1) render();
  gl.finish();
  const composerRenderMs = (performance.now() - composerStart) / 6;

  render();
  updateHud();
  return {
    requested: { heavyCount, lightCount, frames },
    updateMs: Number(updateMs.toFixed(3)),
    sceneRenderMs: Number(sceneRenderMs.toFixed(3)),
    composerRenderMs: Number(composerRenderMs.toFixed(3)),
    sceneDrawCalls,
    sceneTriangles,
    time: Number(simTime.toFixed(3)),
    ...info(),
  };
}

function updateHud(): void {
  if (!showHud) return;
  const stats = combat?.vfxStats;
  hud.innerHTML = [
    `<strong>${sceneName}</strong>`,
    `t = ${simTime.toFixed(2)}s`,
    `torpedoes = ${(stats?.torpedoes.activeHeavy ?? 0) + (stats?.torpedoes.activeLight ?? 0)}`,
    `flash = ${stats?.explosions.flashes ?? 0} · ring = ${stats?.explosions.rings ?? 0}`,
    `debris = ${stats?.explosions.debris ?? 0} · fire = ${stats?.explosions.fireParticles ?? 0}`,
    `draw = ${renderer.info.render.calls} · tris = ${renderer.info.render.triangles}`,
  ].join('<br>');
}

async function start(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  combat = createCombat();
  if (sceneName !== 'bench') {
    await loadCapitalTemplate();
  }
  if (sceneName === 'volley') setupVolley();
  else if (sceneName === 'torpedo') setupTorpedo();
  else if (sceneName === 'impact') setupImpact();
  else if (sceneName === 'death') setupDeath();
  else if (sceneName === 'finale') setupFinale();
  else setupBench();

  advanceTo(0);
  updateHud();

  const api: DemoApi = {
    ready: true,
    scene: sceneName,
    advanceTo,
    captureAt,
    findImpactTime,
    bench,
    info,
    debugState,
  };
  window.__vfxDemo = api;
  // 给自动化脚本一个稳定的完成信号
  window.dispatchEvent(new CustomEvent('vfx-demo-ready'));
}

window.addEventListener('resize', () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  composer.setSize(width, height);
});

void start();
