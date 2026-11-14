import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { attachHangarDoors, createWorld, type CelestialBody, type World } from './world';
import { createShip, loadShipModel, type Ship } from './ship';
import { FlightController } from './flight';
import { EngineAudio } from './audio';
import { SpeedLines } from './speedlines';
import { LocalPlume } from './trails';
import { DamageVisuals } from './damage';
import { Combat } from './combat';
import { SHIPS, getShip, manualWeaponTypes, WEAPON_LABELS, type ShipSpec, type WeaponType } from './ships';
import type { SystemData } from './data';

interface WeaponState {
  selected: WeaponType | 'all';
  cooldowns: Map<string, number>;
  firing: boolean;
}

const FIRE_SHAKE: Record<WeaponType, number> = {
  laser: 0.02, cannon: 0.07, torpedo: 0.14, railgun: 0.6, plasma: 0.16, ion: 0.05,
};
const IMPACT_SHAKE: Record<WeaponType, number> = {
  laser: 0.04, cannon: 0.12, torpedo: 0.4, railgun: 0.75, plasma: 0.24, ion: 0.08,
};

interface GameContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  composer: EffectComposer;
  world: World;
  flight: FlightController;
  ship: Ship;
  audio: EngineAudio;
  motionBlur: ShaderPass;
  combat: Combat;
  weapons: WeaponState;
  player: { alive: boolean };
  spec: { current: ShipSpec };
  autoCooldowns: Map<string, number>;
  speedLines: SpeedLines;
  trail: { current: LocalPlume | null };
  damage: { current: DamageVisuals | null };
  switchShip: (id: string) => Promise<boolean>;
}

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const BASE = import.meta.env.BASE_URL.replace(/\/+$/, '');
const withBase = (path: string): string => `${BASE}/${path.replace(/^\/+/, '')}`;

function formatNumber(value: number): string {
  return value > 0 ? value.toLocaleString('zh-CN') : '—';
}

function distanceLabel(value: number): string {
  if (value > 1000) return `${(value / 1000).toFixed(2)} km`;
  return `${Math.round(value)} m`;
}

function closestPointOnSegment(point: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3 {
  const ab = b.clone().sub(a);
  const lengthSq = ab.lengthSq();
  const t = lengthSq > 1e-8 ? THREE.MathUtils.clamp(point.clone().sub(a).dot(ab) / lengthSq, 0, 1) : 0;
  return a.clone().addScaledVector(ab, t);
}

function updateWeaponCooldowns(ctx: GameContext, dt: number): void {
  for (const [key, value] of ctx.weapons.cooldowns) {
    const next = value - dt;
    if (next <= 0) ctx.weapons.cooldowns.delete(key);
    else ctx.weapons.cooldowns.set(key, next);
  }
}

function fireSelectedWeapons(ctx: GameContext): void {
  if (!ctx.weapons.firing || !ctx.player.alive) return;
  const spec = ctx.spec.current;
  const selected = ctx.weapons.selected;
  const firedTypes = new Map<WeaponType, number>();
  let shake = 0;

  for (const weapon of spec.weapons) {
    if (weapon.turret) continue;
    if (selected !== 'all' && weapon.type !== selected) continue;
    const key = `${spec.id}:${weapon.id}`;
    if ((ctx.weapons.cooldowns.get(key) ?? 0) > 0) continue;

    const local = new THREE.Vector3(...weapon.pos);
    const origin = local.clone().applyQuaternion(ctx.flight.quaternion).add(ctx.flight.position);
    ctx.combat.fire(origin, ctx.flight.forwardVector, weapon, ctx.flight.quaternion);
    ctx.weapons.cooldowns.set(key, 1 / Math.max(0.05, weapon.rate));
    firedTypes.set(weapon.type, Math.max(firedTypes.get(weapon.type) ?? 0, Math.min(1.1, 0.25 + weapon.damage / 120)));
    shake = Math.max(shake, FIRE_SHAKE[weapon.type]);
  }

  for (const [type, volume] of firedTypes) ctx.audio.weapon(type, volume);
  if (shake > 0) ctx.flight.addShake(shake);
}

export async function startGame(system: SystemData): Promise<void> {
  const canvas = $('flight-canvas') as unknown as HTMLCanvasElement;
  const boot = $('boot');
  const bootBar = $('boot-bar');
  const bootStatus = $('boot-status');

  const step = async (label: string, ratio: number): Promise<void> => {
    bootStatus.textContent = label;
    bootBar.style.width = `${ratio * 100}%`;
    await new Promise((resolve) => setTimeout(resolve, 60));
  };

  await step('校准星图', 0.08);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    alpha: false,
    logarithmicDepthBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 12_000_000);
  // 高速时的屏幕空间流线
  const speedLines = new SpeedLines(camera);
  // 挂在相机上的补光，避免飞船暗面全黑
  const fillLight = new THREE.PointLight(0xa8dcff, 1100, 500, 1.6);
  fillLight.position.set(0, 6, 4);
  camera.add(fillLight);

  // 从镜头方向补一条冷色边缘光，避免舰体背光时完全变黑
  const rimLight = new THREE.DirectionalLight(0xa8c8e8, 0.55);
  rimLight.position.set(0, 4, 2);
  rimLight.target.position.set(0, 0, -2);
  camera.add(rimLight);
  camera.add(rimLight.target);
  scene.add(camera);

  await step('生成恒星', 0.2);

  const world = createWorld(system, scene, renderer);

  await step('投射行星', 0.45);

  // Blender 导出的机库门（异步，不阻塞进场）
  void attachHangarDoors(world, `${BASE}/models/hangar_door.glb`);

  let ship = createShip();
  const trailRef: { current: LocalPlume | null } = { current: null };
  const damageRef: { current: DamageVisuals | null } = { current: null };
  scene.add(ship.group);

  const audio = new EngineAudio();
  const flight = new FlightController(camera);
  flight.attach(canvas);
  canvas.addEventListener('pointerdown', () => audio.start(), { once: true });

  // 优先用 Blender 导出的高模舰，失败则回退到程序化几何
  try {
    const loaded = await loadShipModel(
      `${BASE}/models/${getShip('thunderbolt').model}`,
      getShip("thunderbolt").length,
      getShip("thunderbolt").nozzles,
      getShip("thunderbolt").cockpits[0],
      getShip("thunderbolt").exhaust,
    );
    scene.remove(ship.group);
    ship = loaded;
    scene.add(ship.group);
  } catch {
    /* 保留程序化舰 */
  }

  flight.setCockpitOffset(new THREE.Vector3(...getShip("thunderbolt").cockpits[0]).add(new THREE.Vector3(0, 0.1, 0.2)));
  flight.bindShip(ship.group);

  await step('装载飞船', 0.62);

  // NPC 模板：全部先按各自的舰长缩放好，战斗时直接 clone
  const npcTemplates = new Map<string, { group: THREE.Group; spec: ShipSpec }>();
  await step('集结舰队', 0.7);
  await Promise.all(
    ['thunderbolt', 'f008', 'bomber', 'freighter', 'commander', 'battleship'].map(async (id) => {
      const spec = getShip(id);
      const template = await loadShipModel(
        `${BASE}/models/${spec.model}`,
        spec.length,
        spec.nozzles,
        spec.cockpits[0],
        spec.exhaust,
      );
      npcTemplates.set(id, { group: template.group, spec });
    }),
  );

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.34, 0.55, 0.86);
  composer.addPass(bloom);

  const motionBlur = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uStrength: { value: 0 },
      uCenter: { value: new THREE.Vector2(0.5, 0.5) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float uStrength;
      uniform vec2 uCenter;
      varying vec2 vUv;
      void main() {
        vec2 dir = vUv - uCenter;
        float dist = length(dir);
        vec3 sum = vec3(0.0);
        const int SAMPLES = 10;
        for (int i = 0; i < SAMPLES; i++) {
          float t = float(i) / float(SAMPLES - 1);
          float scale = 1.0 - uStrength * t * dist * 1.8;
          sum += texture2D(tDiffuse, uCenter + dir * scale).rgb;
        }
        gl_FragColor = vec4(sum / float(SAMPLES), 1.0);
      }
    `,
  });
  composer.addPass(motionBlur);
  composer.addPass(new OutputPass());

  await step('编译着色器', 0.82);

  renderer.compile(scene, camera);
  world.update(0.016, 0, camera);
  composer.render();

  await step('就绪', 1);
  boot.classList.add('is-done');
  window.setTimeout(() => boot.remove(), 900);

  const weapons: WeaponState = { selected: 'all', cooldowns: new Map(), firing: false };
  const autoCooldowns = new Map<string, number>();
  let shipSpec: ShipSpec = getShip('thunderbolt');
  const specRef = { current: shipSpec };
  const playerState = {
    hull: shipSpec.hull,
    shield: shipSpec.shield,
    parts: { ...shipSpec.parts },
    alive: true,
  };

  const combat = new Combat(scene, {
    onPlayerDamage: (damage: number, position?: THREE.Vector3) => {
      if (!playerState.alive) return;
      const absorbed = Math.min(playerState.shield, damage);
      if (position) {
        const local = position.clone().sub(flight.position).applyQuaternion(flight.quaternion.clone().invert());
        if (absorbed > 0) damageRef.current?.shieldHit(local);
        else damageRef.current?.hullHit(local);
      }
      if (absorbed > 0 && playerState.shield - absorbed <= 0) damageRef.current?.shieldBreak();
      if (specRef.current.tier < 5) hud?.hit();
      playerState.shield -= absorbed;
      const rest = damage - absorbed;
      if (rest > 0) {
        playerState.hull -= rest;
        const partKeys = ['engine', 'weapon', 'cockpit'] as const;
        const key = partKeys[Math.floor(Math.random() * partKeys.length)];
        playerState.parts[key] = Math.max(0, playerState.parts[key] - rest * 0.25);
        if (playerState.hull <= 0) {
          playerState.alive = false;
        }
      }
    },
    onNpcKilled: () => {
      hud?.toast('敌舰击毁');
    },
    onExplosion: (position, size) => {
      const distance = position.distanceTo(flight.position);
      const force = Math.max(0, 1 - distance / 5200) * Math.min(1.4, size / 90);
      flight.addShake(force);
      const volume = THREE.MathUtils.clamp(1 - distance / 7000, 0.05, 1) * THREE.MathUtils.clamp(size / 180, 0.15, 1);
      audio.explosion(volume);
      hud?.explosionFlash(THREE.MathUtils.clamp((size / 260) * (1 - distance / 9000), 0, 0.8));
    },
    onImpact: (type, position, owner) => {
      const distance = position.distanceTo(flight.position);
      const volume = THREE.MathUtils.clamp(1 - distance / 5200, 0.04, 1) * (owner === 'player' ? 0.35 : 1);
      audio.impact(type, volume);
      if (owner === 'npc') {
        flight.addShake(IMPACT_SHAKE[type] * THREE.MathUtils.clamp(1 - distance / 3000, 0, 1));
      }
    },
  });

  combat.setTemplates(npcTemplates);
  const ctx: GameContext = { renderer, scene, camera, composer, world, flight, ship, audio, motionBlur, combat, weapons, player: playerState, spec: specRef, autoCooldowns, speedLines, trail: trailRef, damage: damageRef, switchShip: async () => false };

  const dock = world.bodies.find((body) => body.id === 'station-dock');
  if (dock) {
    // 从侧面接近，避免太阳正好在空港背后
    const radial = dock.position.clone().normalize();
    const tangent = new THREE.Vector3(-radial.z, 0, radial.x).normalize();
    flight.position
      .copy(dock.position)
      .addScaledVector(tangent, 42000)
      .add(new THREE.Vector3(0, 12000, 0));
    const look = dock.position.clone().sub(flight.position).normalize();
    flight.setLookDirection(look);
    camera.position.copy(flight.position).addScaledVector(look, -34).add(new THREE.Vector3(0, 12, 0));
  }

  const params = new URLSearchParams(window.location.search);
  const at = params.get('at');
  if (at) {
    const body = ctx.world.bodies.find((item) => item.id === at);
    if (body) {
      const dist = Number(params.get('dist') ?? 3.2) * body.radius;
      const dir = new THREE.Vector3(0.4, 0.28, 1).normalize();
      ctx.flight.position.copy(body.position).addScaledVector(dir, dist);
      const look = body.position.clone().sub(ctx.flight.position).normalize();
      ctx.flight.setLookDirection(look);
      ctx.flight.halt();
      ctx.camera.position.copy(ctx.flight.position).addScaledVector(look, -34).add(new THREE.Vector3(0, 10, 0));
    }
  }

  const applyShip = (spec: ShipSpec): void => {
    trailRef.current?.dispose();
    if (ship.group) {
      const mainNozzles = spec.nozzles.filter((nozzle) => nozzle.role === 'main');
      const nozzles = mainNozzles.length > 0 ? mainNozzles : spec.nozzles.slice(0, 2);
      trailRef.current = new LocalPlume(ship.group, nozzles, spec.length, spec.exhaust);
      damageRef.current?.dispose();
      damageRef.current = new DamageVisuals(ship.group, spec.length, spec);
    }
    shipSpec = spec;
    specRef.current = spec;
    ctx.flight.configure({
      maxSpeed: spec.maxSpeed,
      boostSpeed: spec.boostSpeed,
      accel: spec.accel,
      turnRate: spec.turnRate,
      length: spec.length,
      chargeTime: spec.chargeTime,
      warpCombo: spec.warpCombo,
    });
    ship.group.scale.setScalar(1);
    playerState.hull = spec.hull;
    playerState.shield = spec.shield;
    playerState.parts = { ...spec.parts };
    playerState.alive = true;
    weapons.cooldowns.clear();
    weapons.selected = 'all';
    weapons.firing = false;
  };
  applyShip(shipSpec);

  const switchShip = async (id: string): Promise<boolean> => {
    if (!id || id === shipSpec.id) return true;
    const spec = getShip(id);
    try {
      const loaded = await loadShipModel(
        `${BASE}/models/${spec.model}`,
        spec.length,
        spec.nozzles,
        spec.cockpits[0],
        spec.exhaust,
      );
      scene.remove(ship.group);
      ship = loaded;
      ctx.ship = ship;
      scene.add(ship.group);
      flight.bindShip(ship.group);
      flight.setCockpitOffset(new THREE.Vector3(...spec.cockpits[0]).add(new THREE.Vector3(0, 0.1, 0.2)));
      applyShip(spec);
      ship.group.position.copy(flight.position);
      ship.group.quaternion.copy(flight.quaternion);
      return true;
    } catch {
      return false;
    }
  };

  ctx.switchShip = switchShip;

  // 数字键选择武器组（主键盘 + 小键盘）
  window.addEventListener('keydown', (event) => {
    const match = /^(?:Digit|Numpad)([0-9])$/.exec(event.code);
    if (!match) return;
    const types = manualWeaponTypes(ctx.spec.current);
    const index = Number(match[1]);
    if (index === 0) ctx.weapons.selected = 'all';
    else if (types[index - 1]) ctx.weapons.selected = types[index - 1];
  });
  // 开局舰队：敌对舰队会扫描并主动上门，中立舰队全图游荡
  const fleetPlan: Array<{ faction: 'hostile' | 'neutral'; angle: number; distance: number }> = [
    { faction: 'hostile', angle: 0.5, distance: 95000 },
    { faction: 'neutral', angle: 1.9, distance: 32000 },
    { faction: 'hostile', angle: 3.4, distance: 150000 },
    { faction: 'neutral', angle: 4.7, distance: 58000 },
    { faction: 'neutral', angle: 5.7, distance: 92000 },
  ];
  for (const plan of fleetPlan) {
    const offset = new THREE.Vector3(
      Math.cos(plan.angle) * plan.distance,
      (Math.random() - 0.5) * 12000,
      Math.sin(plan.angle) * plan.distance,
    );
    ctx.combat.spawnFleet(plan.faction, ctx.flight.position.clone().add(offset));
  }

  const hud = setupHud(ctx, system, playerState, specRef);

  const openParam = params.get('open');
  if (openParam) {
    window.setTimeout(() => hud.openById(openParam), 600);
  }

  loop(ctx, hud);
}

interface Hud {
  update: (dt: number) => void;
  openById: (id: string) => void;
  toast: (message: string) => void;
  hit: () => void;
  explosionFlash: (strength: number) => void;
}

function loop(ctx: GameContext, hud: Hud): void {
  const clock = new THREE.Clock();
  const maxPixelRatio = Math.min(window.devicePixelRatio, 1.5);
  let pixelRatio = ctx.renderer.getPixelRatio();
  const fade = document.getElementById('fade') as HTMLElement;
  const heat = document.getElementById('heat-warning') as HTMLElement;
  const motionBlur = ctx.motionBlur;
  let elapsed = 0;

  let perfAccum = 0;
  let perfFrames = 0;
  const tick = (): void => {
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;
    perfAccum += dt;
    perfFrames += 1;
    if (perfAccum > 2) {
      const fps = perfFrames / perfAccum;
      if (fps < 46 && pixelRatio > 0.8) {
        pixelRatio = Math.max(0.8, pixelRatio - 0.15);
        ctx.renderer.setPixelRatio(pixelRatio);
        ctx.composer.setPixelRatio?.(pixelRatio);
        ctx.composer.setSize(window.innerWidth, window.innerHeight);
      } else if (fps > 58 && pixelRatio < maxPixelRatio) {
        pixelRatio = Math.min(maxPixelRatio, pixelRatio + 0.1);
        ctx.renderer.setPixelRatio(pixelRatio);
        ctx.composer.setPixelRatio?.(pixelRatio);
        ctx.composer.setSize(window.innerWidth, window.innerHeight);
      }
      perfAccum = 0;
      perfFrames = 0;
    }
    const prevPosition = ctx.flight.position.clone();

    ctx.flight.update(dt);
    updateWeaponCooldowns(ctx, dt);
    fireSelectedWeapons(ctx);

    // 实体碰撞：撞上天体就被推开并卸掉法向速度
    for (const body of ctx.world.bodies) {
      const min = body.radius * (body.type === 'station' ? 0.34 : 1.03);
      const closest = closestPointOnSegment(body.position, prevPosition, ctx.flight.position);
      const delta = closest.clone().sub(body.position);
      const distance = delta.length();
      if (distance < min) {
        const normal = distance > 0.001 ? delta.normalize() : ctx.flight.position.clone().sub(body.position).normalize();
        ctx.flight.position.copy(body.position).addScaledVector(normal, min);
        const vn = ctx.flight.velocity.dot(normal);
        if (vn < 0) ctx.flight.velocity.addScaledVector(normal, -vn * 1.8);
      }
    }

    // 恒星熔毁
    if (ctx.flight.position.length() < ctx.world.sunRadius * 1.35) {
      heat.classList.add('is-melting');
    } else {
      heat.classList.remove('is-melting');
    }

    if (ctx.flight.position.length() < ctx.world.sunRadius * 1.15) {
      fade.classList.add('is-black');
      window.setTimeout(() => {
        const dock = ctx.world.bodies.find((b) => b.id === 'station-dock');
        if (dock) {
          const radial = dock.position.clone().normalize();
          const tangent = new THREE.Vector3(-radial.z, 0, radial.x).normalize();
          ctx.flight.position.copy(dock.position).addScaledVector(tangent, 42000).add(new THREE.Vector3(0, 12000, 0));
        }
        ctx.flight.halt();
        fade.classList.remove('is-black');
        hud.toast('船体熔毁 · 已在母港重新装配');
      }, 700);
    }

    // 动态模糊：速度越快越明显，加速时再叠一点
    const comfort = THREE.MathUtils.clamp(ctx.spec.current.length / 1200, 0.25, 1);
    const speedNorm = Math.min(1, ctx.flight.speed / 9000);
    motionBlur.uniforms.uStrength.value = (speedNorm * 0.18 + ctx.flight.boost * 0.18) * (0.4 + 0.6 * comfort);

    ctx.combat.update(dt, ctx.flight.position, ctx.flight.velocity, ctx.flight.quaternion, ctx.camera);

    // 自动炮：只打「已攻击我方」的目标
    for (const weapon of ctx.spec.current.weapons) {
      if (!weapon.turret) continue;
      const key = `${ctx.spec.current.id}:${weapon.id}`;
      const cd = ctx.autoCooldowns.get(key) ?? 0;
      if (cd > 0) {
        ctx.autoCooldowns.set(key, cd - dt);
        continue;
      }
      const mount = new THREE.Vector3(...weapon.pos);
      const origin = mount.clone().applyQuaternion(ctx.flight.quaternion).add(ctx.flight.position);
      const target = ctx.combat.nearestHostile(origin, weapon.range);
      if (!target) continue;
      const aim = ctx.combat.leadPoint(origin, target.position, target.velocity, weapon.speed);
      const dir = aim.sub(origin).normalize();
      ctx.combat.fire(origin, dir, weapon, ctx.flight.quaternion);
      ctx.audio.weapon(weapon.type, Math.min(0.34, 0.07 + weapon.damage / 1100));
      ctx.autoCooldowns.set(key, 1 / weapon.rate);
    }

    // 引力吸附
    for (const body of ctx.world.bodies) {
      const delta = body.position.clone().sub(ctx.flight.position);
      const distance = Math.max(delta.length(), body.radius * 1.15);
      const pull = (9e5 * body.radius) / (distance * distance);
      ctx.flight.velocity.addScaledVector(delta.normalize(), Math.min(pull, 220) * dt);
    }

    ctx.ship.group.position.copy(ctx.flight.position);
    ctx.ship.group.quaternion.copy(ctx.flight.quaternion);
    ctx.ship.update(dt, ctx.flight.throttle, ctx.flight.boost, ctx.flight.brake > 0.05 || ctx.flight.isReversing);

    // 引擎尾迹：从主喷口持续喷出粒子
    ctx.trail.current?.update(dt, 0.2 + ctx.flight.throttle * 0.9 + ctx.flight.boost * 1.8);

    ctx.flight.updateCamera(dt);
    if (ctx.ship.model) ctx.ship.model.visible = ctx.flight.cameraMode !== 'first';
    if (ctx.ship.cockpitGroup) ctx.ship.cockpitGroup.visible = ctx.flight.cameraMode === 'first';

    ctx.world.update(dt, elapsed, ctx.camera);
    for (const mixer of ctx.world.mixers) mixer.update(dt);
    ctx.world.sun.position.set(0, 0, 0);

    // 恒星热屏障：太近会被推开
    const sunDistance = ctx.flight.position.length();
    if (sunDistance < 2800) {
      const push = (2800 - sunDistance) / 2800;
      const dir = ctx.flight.position.clone().normalize();
      ctx.flight.velocity.addScaledVector(dir, push * 900 * dt);
      hud.toast('警告：恒星辐射过强，自动脱离');
    }

    hud.update(dt);
    ctx.audio.update(ctx.flight.speed, ctx.flight.throttle, ctx.flight.boost);
    ctx.speedLines.update(dt, ctx.flight.boost * (0.4 + 0.6 * comfort), ctx.flight.speed * (0.45 + 0.55 * comfort));
    ctx.composer.render();
    requestAnimationFrame(tick);
  };

  tick();
}

interface PlayerState {
  hull: number;
  shield: number;
  parts: { engine: number; weapon: number; cockpit: number };
  alive: boolean;
}

function setupHud(
  ctx: GameContext,
  system: SystemData,
  playerState: PlayerState,
  specRef: { current: ShipSpec },
): Hud {
  const speedValue = $('hud-speed');
  const speedBar = $('hud-speed-bar');
  const targetName = $('hud-target');
  const targetDist = $('hud-target-dist');
  const prompt = $('hud-prompt');
  const coords = $('hud-coords');
  const modeLabel = $('hud-mode');
  const shipLabel = $('hud-ship');
  const fpsLabel = $('hud-fps');
  const throttleBar = $('hud-throttle-bar');
  const assistLabel = $('hud-assist');
  const marker = $('nav-marker');
  const cockpit = $('cockpit');
  const cockpitSpeed = $('cockpit-speed');
  const cockpitTarget = $('cockpit-target');
  const cockpitDist = $('cockpit-dist');
  const hullFill = $('hull-fill');
  const shieldFill = $('shield-fill');
  const hullText = $('hull-text');
  const shieldText = $('shield-text');
  const enemyBox = $('enemy-box');
  const enemyHp = $('enemy-hp');
  const enemyDist = $('enemy-dist');
  const enemyCount = $('enemy-count');
  const fleetBox = $('fleet-box');
  const fleetStatus = $('fleet-status');
  const fleetName = $('fleet-name');
  const fleetCount = $('fleet-count');
  const fleetDist = $('fleet-dist');
  const fleetComp = $('fleet-comp');
  const dashHull = $('dash-hull');
  const dashShield = $('dash-shield');
  const dashThrottle = $('dash-throttle');
  const boostUi = $('boost-ui');
  const boostRing = $('boost-ring');
  const boostLabel = $('boost-label');
  const boostKey = $('boost-key');
  const boostSub = $('boost-sub');
  const hudRoot = $('hud');
  const helpPanel = $('help-panel');
  const weaponList = $('weapon-list');
  const hullGhost = $('hull-ghost');
  const shieldGhost = $('shield-ghost');
  const hullVital = $('hull-vital');
  const shieldVital = $('shield-vital');
  const bearingHeading = $('bearing-heading');
  const bearingTarget = $('bearing-target');
  const bearingEnemy = $('bearing-enemy');
  const bossBar = $('boss-bar');
  const bossName = $('boss-name');
  const bossLevel = $('boss-level');
  const bossShieldFill = $('boss-shield-fill');
  const bossHullFill = $('boss-hull-fill');
  const bossHpText = $('boss-hp-text');
  const bossDist = $('boss-dist');
  const hitAlert = $('hit-alert');
  const impactFlash = $('impact-flash');
  const ladder = $('cockpit-ladder');
  const tapeSpeed = $('tape-speed');
  const heat = $('heat-warning');
  const fade = $('fade');

  let fpsAccum = 0;
  let fpsFrames = 0;
  let target: CelestialBody | null = null;
  let nearest: CelestialBody | null = null;
  let panelOpen = false;
  let docking: { body: CelestialBody; t: number; from: THREE.Vector3; to: THREE.Vector3; landing: boolean } | null = null;
  let toastTimer = 0;
  let playerDeath: { time: number; duration: number; next: number; index: number; anchors: THREE.Vector3[] } | null = null;
  let respawning = false;
  let weaponSignature = '';
  const weaponRows = new Map<string, { row: HTMLButtonElement; fill: HTMLElement | null }>();

  const toast = (message: string): void => {
    const el = $('toast');
    el.textContent = message;
    el.classList.add('is-on');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => el.classList.remove('is-on'), 2400);
  };

  const showHit = (): void => {
    hitAlert.classList.remove('is-on');
    void hitAlert.offsetWidth;
    hitAlert.classList.add('is-on');
  };

  const showExplosionFlash = (strength: number): void => {
    const value = THREE.MathUtils.clamp(strength, 0, 0.85);
    impactFlash.style.transition = 'none';
    impactFlash.style.opacity = String(value);
    requestAnimationFrame(() => {
      impactFlash.style.transition = 'opacity 0.4s ease-out';
      impactFlash.style.opacity = '0';
    });
  };

  /* ── 星图 ── */
  const map = $('map');
  const mapList = $('map-list');
  const mapCanvas = $('map-canvas') as unknown as HTMLCanvasElement;

  const drawMap = (): void => {
    const c = mapCanvas.getContext('2d');
    if (!c) return;
    const w = mapCanvas.width;
    const h = mapCanvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const range = 3_000_000;

    c.clearRect(0, 0, w, h);
    c.fillStyle = '#04080d';
    c.fillRect(0, 0, w, h);

    const forward = ctx.flight.forwardVector;
    const yaw = Math.atan2(forward.x, forward.z);
    const sunRel = ctx.flight.position.clone().multiplyScalar(-1);
    const sunDist = sunRel.length();
    if (sunDist < range) {
      const sunAngle = Math.atan2(sunRel.x, sunRel.z) - yaw;
      const sunRadius = (sunDist / range) * (Math.min(w, h) / 2 - 14);
      const sunX = cx - Math.sin(sunAngle) * sunRadius;
      const sunY = cy - Math.cos(sunAngle) * sunRadius;
      c.fillStyle = 'rgba(255,200,120,0.9)';
      c.beginPath();
      c.arc(sunX, sunY, 5, 0, Math.PI * 2);
      c.fill();
    }

    c.strokeStyle = 'rgba(120,180,200,0.16)';
    c.lineWidth = 1;
    for (const r of [0.25, 0.5, 0.75, 1]) {
      c.beginPath();
      c.arc(cx, cy, (Math.min(w, h) / 2 - 10) * r, 0, Math.PI * 2);
      c.stroke();
    }

    for (const body of ctx.world.bodies) {
      const rel = body.position.clone().sub(ctx.flight.position);
      const distance = rel.length();
      if (distance > range) continue;

      const angle = Math.atan2(rel.x, rel.z) - yaw;
      const radius = (distance / range) * (Math.min(w, h) / 2 - 14);
      const x = cx - Math.sin(angle) * radius;
      const y = cy - Math.cos(angle) * radius;

      const isStation = body.type === 'station';
      const isTarget = target?.id === body.id;

      c.fillStyle = isStation ? 'rgba(201,165,92,0.95)' : 'rgba(126,220,205,0.9)';
      c.beginPath();
      c.arc(x, y, isStation ? 4 : 2.6, 0, Math.PI * 2);
      c.fill();

      if (isTarget) {
        c.strokeStyle = '#fff';
        c.lineWidth = 1.4;
        c.beginPath();
        c.arc(x, y, 8, 0, Math.PI * 2);
        c.stroke();
        c.beginPath();
        c.moveTo(cx, cy);
        c.lineTo(x, y);
        c.strokeStyle = 'rgba(255,255,255,0.25)';
        c.lineWidth = 1;
        c.stroke();
      }
    }

    // 附近飞船（敌红 / 中立灰蓝）
    for (const contact of ctx.combat.contacts) {
      const rel = contact.position.clone().sub(ctx.flight.position);
      const distance = rel.length();
      if (distance > range || distance > ctx.spec.current.sensorRange) continue;

      const angle = Math.atan2(rel.x, rel.z) - yaw;
      const radius = (distance / range) * (Math.min(w, h) / 2 - 14);
      const x = cx - Math.sin(angle) * radius;
      const y = cy - Math.cos(angle) * radius;
      const big = contact.radius > 120;

      c.fillStyle = contact.hostile ? 'rgba(255, 106, 84, 0.95)' : 'rgba(150, 192, 208, 0.78)';
      c.beginPath();
      c.arc(x, y, big ? 3.4 : 2.2, 0, Math.PI * 2);
      c.fill();

      if (contact.hostile) {
        c.strokeStyle = 'rgba(255, 106, 84, 0.5)';
        c.lineWidth = 1;
        c.beginPath();
        c.arc(x, y, big ? 6 : 4.2, 0, Math.PI * 2);
        c.stroke();
      }
    }

    // 本舰：固定在中心，外圈 + 十字 + 空心箭头，避免被附近天体盖住
    c.strokeStyle = 'rgba(89,224,200,0.65)';
    c.lineWidth = 1.4;
    c.beginPath();
    c.arc(cx, cy, 13, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.moveTo(cx - 20, cy); c.lineTo(cx - 9, cy);
    c.moveTo(cx + 9, cy); c.lineTo(cx + 20, cy);
    c.moveTo(cx, cy - 20); c.lineTo(cx, cy - 9);
    c.moveTo(cx, cy + 9); c.lineTo(cx, cy + 20);
    c.stroke();
    c.fillStyle = '#bff8ed';
    c.strokeStyle = '#061012';
    c.lineWidth = 2.2;
    c.beginPath();
    c.moveTo(cx, cy - 8);
    c.lineTo(cx - 5, cy + 5);
    c.lineTo(cx + 5, cy + 5);
    c.closePath();
    c.stroke();
    c.fill();
  };

  const renderMap = (): void => {
    mapList.innerHTML = '';
    const sorted = ctx.world.bodies
      .slice()
      .sort((a, b) => a.position.distanceTo(ctx.flight.position) - b.position.distanceTo(ctx.flight.position));

    for (const body of sorted) {
      const distance = body.position.distanceTo(ctx.flight.position);
      const row = document.createElement('button');
      row.className = 'map-row';
      row.type = 'button';
      row.innerHTML = `
        <span class="map-row-main">
          <span class="map-row-title">${body.planet?.title ?? body.station?.title ?? ''}</span>
          <span class="map-row-sub">${body.planet ? body.planet.subtitle : '空港'}</span>
        </span>
        <span class="map-row-dist">${distanceLabel(distance)}</span>
      `;
      row.addEventListener('click', () => {
        target = body;
        map.classList.remove('is-open');
        toast(`目标：${body.planet?.title ?? body.station?.title ?? ''}`);
      });
      mapList.append(row);
    }
    drawMap();
  };

  const toggleMap = (): void => {
    const open = !map.classList.contains('is-open');
    map.classList.toggle('is-open', open);
    hudRoot.classList.toggle('is-map-open', open);
    if (open) {
      renderMap();
      if (document.pointerLockElement) document.exitPointerLock();
    }
  };

  $('map-toggle')?.addEventListener('click', toggleMap);

  /* ── 面板 ── */
  const panel = $('panel');
  const panelTitle = $('panel-title');
  const panelSub = $('panel-sub');
  const panelBody = $('panel-body');

  const closePanel = (): void => {
    panel.classList.remove('is-open');
    panelOpen = false;
    if (document.pointerLockElement) document.exitPointerLock();
  };
  $('panel-close')?.addEventListener('click', closePanel);
  $('map-close')?.addEventListener('click', () => map.classList.remove('is-open'));
  map?.addEventListener('click', (event) => {
    if (event.target === map) map.classList.remove('is-open');
  });
  panel?.addEventListener('click', (event) => {
    if (event.target === panel) closePanel();
  });


  const rebuildWeaponPanel = (): void => {
    const spec = ctx.spec.current;
    const types = manualWeaponTypes(spec);
    const autoCount = spec.weapons.filter((weapon) => weapon.turret).length;
    const signature = `${spec.id}:${types.join(',')}:${autoCount}`;
    if (signature === weaponSignature) return;
    weaponSignature = signature;
    weaponRows.clear();
    weaponList.innerHTML = '';

    if (ctx.weapons.selected !== 'all' && !types.includes(ctx.weapons.selected)) {
      ctx.weapons.selected = types.length > 1 ? 'all' : (types[0] ?? 'all');
    }

    const addRow = (
      key: string,
      type: string,
      label: string,
      count: number,
      auto = false,
    ): void => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `weapon-row${auto ? ' is-auto' : ''}`;
      row.dataset.weaponType = type;
      row.innerHTML = `
        <span class="weapon-key">${key}</span>
        <span class="weapon-name">${label}</span>
        <span class="weapon-count">${count}</span>
        <span class="weapon-bar"><i></i></span>
      `;
      row.addEventListener('click', (event) => {
        event.stopPropagation();
        if (auto) return;
        ctx.weapons.selected = type === 'all' ? 'all' : (type as WeaponType);
        updateWeaponPanel();
      });
      weaponList.append(row);
      const fill = row.querySelector('.weapon-bar i') as HTMLElement | null;
      weaponRows.set(type, { row, fill });
    };

    if (types.length > 1) {
      addRow('0', 'all', '全部', spec.weapons.filter((weapon) => !weapon.turret).length);
    }
    types.forEach((type, index) => {
      const count = spec.weapons.filter((weapon) => !weapon.turret && weapon.type === type).length;
      addRow(String(index + 1), type, WEAPON_LABELS[type], count);
    });
    if (autoCount > 0) addRow('A', 'auto', '自动炮', autoCount, true);
  };

  const updateWeaponPanel = (): void => {
    rebuildWeaponPanel();
    const spec = ctx.spec.current;

    for (const [type, entry] of weaponRows) {
      const selected = type === ctx.weapons.selected;
      entry.row.classList.toggle('is-on', selected);
      if (type === 'auto' || !entry.fill) continue;

      const weapons = spec.weapons.filter((weapon) =>
        !weapon.turret && (type === 'all' || weapon.type === type),
      );
      let readiness = 0;
      for (const weapon of weapons) {
        const key = `${spec.id}:${weapon.id}`;
        const cd = ctx.weapons.cooldowns.get(key) ?? 0;
        const max = 1 / Math.max(0.05, weapon.rate);
        readiness = Math.max(readiness, 1 - Math.min(1, cd / max));
      }
      entry.fill.style.width = `${Math.round(readiness * 100)}%`;
    }
  };

  const openBody = (body: CelestialBody): void => {
      panelOpen = true;
    panel.classList.add('is-open');
    if (document.pointerLockElement) document.exitPointerLock();

    if (body.planet) {
      const def = body.planet;
      panelTitle.textContent = def.title;
      panelSub.textContent = def.subtitle;
      panelBody.innerHTML = `
        <p class="panel-desc">${def.summary || ''}</p>
        <div class="panel-stats">
          <div><span>代码行</span><b>${formatNumber(def.loc)}</b></div>
          <div><span>测试</span><b>${formatNumber(def.tests)}</b></div>
          <div><span>提交</span><b>${formatNumber(def.commits)}</b></div>
          <div><span>版本</span><b>${formatNumber(def.versions)}</b></div>
          <div><span>建仓</span><b>${def.createdAt ?? '—'}</b></div>
        </div>
        <a class="panel-action" href="${def.url}">进入项目 →</a>
      `;
    } else if (body.station) {
      const def = body.station;
      panelTitle.textContent = def.title;
      panelSub.textContent = def.subtitle;
      const picker = `
        <section class="ship-picker">
          <div class="ship-picker-head"><span>舰船整备</span><small>空间站 · 免费</small></div>
          <div class="ship-grid">
            ${SHIPS.map(
              (item) => `
              <button type="button" class="ship-card ${item.id === ctx.spec.current.id ? 'is-current' : ''}" data-ship="${item.id}">
                <span class="ship-card-code">${item.code}</span>
                <span class="ship-card-name">${item.name}</span>
                <span class="ship-card-meta">T${item.tier} · ${item.length} m · ${item.role}</span>
              </button>`,
            ).join('')}
          </div>
        </section>`;
      panelBody.innerHTML = `${picker}<div id="station-slot"></div>`;
      panelBody.querySelectorAll<HTMLButtonElement>('[data-ship]').forEach((button) => {
        button.addEventListener('click', () => {
          const id = button.dataset.ship ?? '';
          void ctx.switchShip(id).then((ok) => {
            if (!ok) {
              toast('换装失败：模型加载错误');
              return;
            }
            toast(`已换装 ${getShip(id).name}`);
            panelBody.querySelectorAll<HTMLElement>('.ship-card').forEach((card) => {
              card.classList.toggle('is-current', card.dataset.ship === ctx.spec.current.id);
            });
          });
        });
      });
      const slot = panelBody.querySelector('#station-slot') as HTMLElement;
      if (def.to === '#board') {
        void renderBoard(slot);
      } else {
        slot.innerHTML = `
          <p class="panel-desc">${def.description}</p>
          <div class="panel-frame">
            <iframe src="${withBase(def.to)}" title="${def.title}" loading="lazy"></iframe>
          </div>
          <a class="panel-action" href="${withBase(def.to)}">在新标签打开 →</a>
        `;
      }
    }
  };

  async function renderBoard(container: HTMLElement): Promise<void> {
    container.innerHTML = `
      <p class="panel-desc">公共频道。留言会以 GitHub issue 的形式提交，需要 GitHub 账号。</p>
      <div class="board-list" id="board-list"><p class="board-empty">读取中…</p></div>
      <a class="panel-action" id="board-new" href="#" target="_blank" rel="noreferrer noopener">写一条留言 →</a>
    `;
    const list = container.querySelector('#board-list') as HTMLElement;
    const newLink = container.querySelector('#board-new') as HTMLAnchorElement;
    newLink.href = `https://github.com/Verlintas/yacht/issues/new?labels=board&title=${encodeURIComponent('[留言板] ')}&body=${encodeURIComponent('写下你想说的话：\n\n')}`;

    try {
      const response = await fetch(
        'https://api.github.com/repos/Verlintas/yacht/issues?labels=board&state=open&per_page=12&sort=created&direction=desc',
      );
      if (!response.ok) throw new Error(String(response.status));
      const issues = (await response.json()) as Array<{
        title: string;
        html_url: string;
        created_at: string;
        user: { login: string };
        comments: number;
      }>;
      if (issues.length === 0) {
        list.innerHTML = '<p class="board-empty">还没有留言。写下第一条航迹。</p>';
        return;
      }
      list.innerHTML = issues
        .map(
          (issue) => `
          <a class="board-item" href="${issue.html_url}" target="_blank" rel="noreferrer noopener">
            <span class="board-item-title">${issue.title.replace(/^\[留言板\]\s*/, '')}</span>
            <span class="board-item-meta">${issue.user.login} · ${issue.created_at.slice(0, 10)} · ${issue.comments} 回复</span>
          </a>`,
        )
        .join('');
    } catch {
      list.innerHTML = '<p class="board-empty">读取失败。可以直接点下面的按钮去 GitHub 留言。</p>';
    }
  }

  /* ── 停靠 / 着陆 ── */
  const startDock = (body: CelestialBody): void => {
    const landing = body.type === 'planet';
    const dir = body.position.clone().sub(ctx.flight.position).normalize();
    const stop = body.position
      .clone()
      .addScaledVector(dir, -body.radius * (landing ? 1.12 : 1.6))
      .add(new THREE.Vector3(0, landing ? 0 : body.radius * 0.1, 0));

    docking = {
      body,
      t: 0,
      from: ctx.flight.position.clone(),
      to: stop,
      landing,
    };
    ctx.flight.halt();
    ctx.flight.boost = 0;
    ctx.flight.throttle = 0;
    if (landing) fade.classList.add('is-black');
  };

  const finishDock = (body: CelestialBody, landing: boolean): void => {
    openBody(body);
    if (landing) {
      window.setTimeout(() => {
        const dir = ctx.flight.position.clone().normalize();
        ctx.flight.position.copy(body.position).addScaledVector(dir, body.radius * 2.4);
        ctx.flight.halt();
        fade.classList.remove('is-black');
      }, 700);
    }
  };

  /* ── 键盘 ── */
  document.addEventListener('keydown', (event) => {
    if (event.code === 'KeyM') toggleMap();
    if (event.code === 'KeyF') {
      if (panelOpen) {
        closePanel();
        return;
      }
      if (docking) return;
      if (!nearest) return;
      if (nearest.type === 'station') {
        if (nearest.position.distanceTo(ctx.flight.position) < nearest.radius * 1.9) startDock(nearest);
      } else if (nearest.position.distanceTo(ctx.flight.position) < nearest.radius * 1.25) {
        startDock(nearest);
      }
    }
    if (event.code === 'F1') {
      event.preventDefault();
      helpPanel.classList.toggle('is-open');
      return;
    }
    if (event.code === 'Escape' && helpPanel.classList.contains('is-open')) {
      helpPanel.classList.remove('is-open');
      return;
    }
    if (event.code === 'Escape') {
      if (map.classList.contains('is-open')) map.classList.remove('is-open');
      else closePanel();
    }
  });

  /* ── 每帧 ── */
  const projected = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  const update = (dt: number): void => {
    fpsAccum += dt;
    fpsFrames += 1;
    if (fpsAccum > 0.5) {
      fpsLabel.textContent = `${Math.round(fpsFrames / fpsAccum)} fps`;
      fpsAccum = 0;
      fpsFrames = 0;
    }

    // 停靠动画
    if (docking) {
      docking.t = Math.min(1, docking.t + dt / 1.6);
      const eased = docking.t * docking.t * (3 - 2 * docking.t);
      ctx.flight.position.lerpVectors(docking.from, docking.to, eased);
      if (docking.t >= 1) {
        const done = docking;
        docking = null;
        finishDock(done.body, done.landing);
      }
    }

    const speed = ctx.flight.speed;
    speedValue.textContent = Math.round(speed).toString();
    speedBar.style.width = `${Math.min(100, (speed / 1500) * 100)}%`;
    throttleBar.style.width = `${Math.round(ctx.flight.throttle * 100)}%`;
    assistLabel.textContent = ctx.flight.assist ? '辅助 开' : '辅助 关';
    assistLabel.classList.toggle('is-off', !ctx.flight.assist);

    coords.textContent = `X ${Math.round(ctx.flight.position.x)}  Y ${Math.round(ctx.flight.position.y)}  Z ${Math.round(ctx.flight.position.z)}`;
    modeLabel.textContent = ctx.flight.cameraMode === 'first' ? '第一人称' : ctx.flight.cameraMode === 'free' ? '自由视角' : '第三人称';
    cockpit.classList.toggle('is-on', ctx.flight.cameraMode === 'first');

    // 最近天体
    let best: CelestialBody | null = null;
    let bestDist = Infinity;
    for (const body of ctx.world.bodies) {
      const d = body.position.distanceTo(ctx.flight.position);
      if (d < bestDist) {
        bestDist = d;
        best = body;
      }
    }
    nearest = best;

    const canDock =
      best &&
      !docking &&
      ((best.type === 'station' && bestDist < best.radius * 1.9) ||
        (best.type === 'planet' && bestDist < best.radius * 1.25));

    if (best && canDock && !panelOpen) {
      prompt.classList.add('is-on');
      prompt.innerHTML = `<b>F</b> ${best.type === 'station' ? '停靠' : '进入'} ${best.planet?.title ?? best.station?.title ?? ''}`;
    } else {
      prompt.classList.remove('is-on');
    }

    updateWeaponPanel();

    // 目标
    if (target) {
      const dist = target.position.distanceTo(ctx.flight.position);
      targetName.textContent = target.planet?.title ?? target.station?.title ?? '';
      targetDist.textContent = distanceLabel(dist);
      cockpitTarget.textContent = target.planet?.title ?? target.station?.title ?? '';
      cockpitDist.textContent = distanceLabel(dist);

      projected.copy(target.position).project(ctx.camera);
      const onScreen = projected.z < 1;
      if (onScreen) {
        marker.style.transform = `translate(-50%, -50%) translate(${(projected.x * 0.5 + 0.5) * window.innerWidth}px, ${(-projected.y * 0.5 + 0.5) * window.innerHeight}px)`;
        marker.classList.add('is-on');
      } else {
        marker.classList.remove('is-on');
      }
    } else {
      targetName.textContent = '未设定';
      targetDist.textContent = '按 M 选择';
      cockpitTarget.textContent = '—';
      cockpitDist.textContent = '—';
      marker.classList.remove('is-on');
    }

    cockpitSpeed.textContent = Math.round(speed).toString();
    shipLabel.textContent = `${ctx.spec.current.code} · T${ctx.spec.current.tier}`;

    // 跃迁充能环 / Shift 次级加速
    const chargeTime = Math.max(0.1, ctx.spec.current.chargeTime);
    const chargeRatio = Math.min(1, ctx.flight.charge / chargeTime);
    const circ = 2 * Math.PI * 46;
    const shifting = ctx.flight.boostMode === 'shift';
    const charged = ctx.flight.boostMode === 'charged';
    const warping = ctx.flight.boost > 0.4;
    const remaining = Math.max(0, chargeTime - ctx.flight.charge);

    if (shifting) {
      boostRing.style.strokeDashoffset = String(circ * (1 - 0.12 * Math.max(ctx.flight.boost, 0.2)));
    } else if (charged || warping) {
      boostRing.style.strokeDashoffset = '0';
    } else {
      boostRing.style.strokeDashoffset = String(circ * (1 - chargeRatio));
    }

    boostKey.textContent = ctx.spec.current.warpCombo ? 'G+H+B' : 'B';
    if (warping) {
      boostLabel.textContent = '跃迁中';
      boostSub.textContent = `${Math.round(speed)} m/s`;
    } else if (shifting) {
      boostLabel.textContent = 'SHIFT';
      boostSub.textContent = '次级加速';
    } else if (charged) {
      boostLabel.textContent = '跃迁就绪';
      boostSub.textContent = '全速释放';
    } else if (chargeRatio > 0.01) {
      boostLabel.textContent = `${Math.round(chargeRatio * 100)}%`;
      boostSub.textContent = `${remaining.toFixed(1)} s`;
    } else {
      boostLabel.textContent = '待机';
      boostSub.textContent = ctx.spec.current.warpCombo ? 'G+H+B 充能' : '按住 B 充能';
    }

    boostUi.classList.toggle('is-on', chargeRatio > 0.01 || ctx.flight.boost > 0.05 || shifting);
    boostUi.classList.toggle('is-ready', charged);
    boostUi.classList.toggle('is-shift', shifting);
    boostUi.classList.toggle('is-charging', chargeRatio > 0.01 && !charged);
    boostUi.classList.toggle('is-warping', warping);
    hudRoot.classList.toggle('is-warp-ready', charged);
    hudRoot.classList.toggle('is-warping', warping);

    // 结构值
    const hullRatio = Math.max(0, playerState.hull / specRef.current.hull);
    const shieldRatio = Math.max(0, playerState.shield / specRef.current.shield);
    hullFill.style.width = `${hullRatio * 100}%`;
    shieldFill.style.width = `${shieldRatio * 100}%`;
    hullGhost.style.width = `${hullRatio * 100}%`;
    shieldGhost.style.width = `${shieldRatio * 100}%`;
    hullVital.classList.toggle('is-critical', hullRatio < 0.3);
    shieldVital.classList.toggle('is-critical', shieldRatio < 0.18);
    dashHull.style.width = `${hullRatio * 100}%`;
    dashShield.style.width = `${shieldRatio * 100}%`;
    dashThrottle.style.width = `${Math.round(ctx.flight.throttle * 100)}%`;
    hullText.textContent = `${Math.max(0, Math.round(playerState.hull))} / ${specRef.current.hull}`;
    shieldText.textContent = `${Math.max(0, Math.round(playerState.shield))} / ${specRef.current.shield}`;

    ctx.damage.current?.setBubbleVisible(playerState.alive && ctx.flight.cameraMode !== 'first');
    ctx.damage.current?.update(dt, hullRatio, shieldRatio, {
      engine: playerState.parts.engine / Math.max(1, specRef.current.parts.engine),
      weapon: playerState.parts.weapon / Math.max(1, specRef.current.parts.weapon),
      cockpit: playerState.parts.cockpit / Math.max(1, specRef.current.parts.cockpit),
    });

    // 敌机提示
    const sensorRange = ctx.spec.current.sensorRange;
    const enemy = ctx.combat.nearestNpc(ctx.flight.position, sensorRange);
    if (enemy) {
      enemyBox.classList.add('is-on');
      enemyHp.style.width = `${Math.max(0, (enemy.hp / enemy.maxHp) * 100)}%`;
      enemyDist.textContent = distanceLabel(enemy.distance);
      enemyCount.textContent = `敌机 ${ctx.combat.npcCount}`;
    } else {
      enemyBox.classList.remove('is-on');
      enemyCount.textContent = '';
    }

    // 顶部长舰 BOSS 血条
    const capital = ctx.combat.nearestCapital(ctx.flight.position, Math.min(sensorRange, 30000));
    bossBar.classList.toggle('is-on', Boolean(capital));
    if (capital) {
      bossName.textContent = capital.name;
      bossLevel.textContent = `T${capital.tier} · ${capital.code}`;
      bossHullFill.style.width = `${Math.max(0, (capital.hull / capital.maxHull) * 100)}%`;
      bossShieldFill.style.width = `${Math.max(0, (capital.shield / capital.maxShield) * 100)}%`;
      bossHpText.textContent = `${Math.round(capital.hull)} / ${capital.maxHull}`;
      bossDist.textContent = distanceLabel(capital.distance);
    }

    // 顶部航向/威胁带
    const bearingForward = ctx.flight.forwardVector;
    const bearingYaw = Math.atan2(bearingForward.x, bearingForward.z);
    bearingHeading.textContent = `${String(Math.round(((bearingYaw * 180) / Math.PI + 360) % 360)).padStart(3, '0')}°`;
    const placeBearing = (el: HTMLElement, world: THREE.Vector3 | null): void => {
      if (!world) {
        el.style.opacity = '0';
        return;
      }
      const rel = world.clone().sub(ctx.flight.position);
      const distance = rel.length();
      if (distance < 1) {
        el.style.opacity = '0';
        return;
      }
      const angle = Math.atan2(rel.x, rel.z) - bearingYaw;
      const pct = THREE.MathUtils.clamp(50 + (angle / Math.PI) * 50, 3, 97);
      el.style.left = `${pct}%`;
      el.style.opacity = '1';
    };
    placeBearing(bearingTarget, target ? target.position : null);
    placeBearing(bearingEnemy, enemy ? enemy.position : null);

    // 敌方舰队情报
    const intel = ctx.combat.getFleetIntel(ctx.flight.position, sensorRange);
    fleetBox.classList.toggle('is-on', Boolean(intel));
    if (intel) {
      fleetStatus.textContent = intel.status;
      fleetStatus.dataset.status = intel.status;
      fleetName.textContent = `${intel.flagship} · ${intel.code}`;
      fleetCount.textContent = `护卫 ${intel.escorts}`;
      fleetComp.textContent = intel.status === '超主力' ? `T4+ ${intel.heavyEscorts}` : `T${intel.tier}`;
      fleetDist.textContent = distanceLabel(intel.distance);
    }

    // 护盾再生
    if (playerState.alive && playerState.shield < specRef.current.shield) {
      playerState.shield = Math.min(specRef.current.shield, playerState.shield + specRef.current.shieldRegen * dt);
    }

    if (!playerState.alive && !playerDeath && !respawning) {
      const spec = ctx.spec.current;
      const duration = spec.tier >= 5 ? Math.min(18, 4 + spec.length / 180) : 1.6;
      const anchors = [
        ...spec.nozzles.filter((nozzle) => nozzle.role !== 'retro').map((nozzle) => new THREE.Vector3(...nozzle.pos)),
        ...spec.weapons.map((weapon) => new THREE.Vector3(...weapon.pos)),
        new THREE.Vector3(...(spec.cockpits[0] ?? [0, 0, 0])),
      ];
      playerDeath = { time: 0, duration, next: 0.15, index: 0, anchors };
      ctx.flight.halt();
      ctx.flight.throttle = 0;
      ctx.damage.current?.setBubbleVisible(false);
      toast('舰体解体 · 逃生程序启动');
    }

    if (playerDeath) {
      playerDeath.time += dt;
      ctx.flight.velocity.set(0, 0, 0);
      ctx.flight.throttle = 0;
      const spec = ctx.spec.current;
      while (
        playerDeath.time >= playerDeath.next &&
        playerDeath.next < playerDeath.duration - 1 &&
        playerDeath.anchors.length > 0
      ) {
        const anchor = playerDeath.anchors[playerDeath.index % playerDeath.anchors.length];
        const world = anchor.clone().applyQuaternion(ctx.flight.quaternion).add(ctx.flight.position);
        ctx.combat.burstAt(world, Math.max(10, spec.length * 0.02));
        playerDeath.index += 1;
        playerDeath.next += 0.38;
      }
      if (playerDeath.time >= playerDeath.duration) {
        ctx.combat.finaleAt(ctx.flight.position.clone(), spec.length, spec.tier);
        ctx.ship.group.visible = false;
        playerDeath = null;
        respawning = true;
        window.setTimeout(() => {
          const dock = ctx.world.bodies.find((body) => body.id === 'station-dock');
          if (dock) ctx.flight.position.copy(dock.position).add(new THREE.Vector3(4200, 2200, 9000));
          ctx.flight.halt();
          ctx.flight.throttle = 0;
          playerState.hull = ctx.spec.current.hull;
          playerState.shield = ctx.spec.current.shield;
          playerState.parts = { ...ctx.spec.current.parts };
          playerState.alive = true;
          respawning = false;
          ctx.ship.group.visible = true;
          ctx.damage.current?.setBubbleVisible(playerState.alive && ctx.flight.cameraMode !== 'first');
          toast('舰体损毁 · 已在母港重新装配');
        }, 1100);
      }
    }
    tapeSpeed.textContent = Math.round(speed).toString();

    // 俯仰梯与滚转
    const forward = ctx.flight.forwardVector;
    const pitch = Math.asin(THREE.MathUtils.clamp(forward.y, -1, 1));
    const pitchDeg = (pitch * 180) / Math.PI;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(ctx.flight.quaternion);
    const upVec = new THREE.Vector3(0, 1, 0).applyQuaternion(ctx.flight.quaternion);
    const roll = Math.atan2(right.y, upVec.y);
    if (ladder) {
      ladder.style.transform = `translate(-50%, -50%) translateY(${pitchDeg * 9}px) rotate(${(-roll * 180) / Math.PI}deg)`;
    }

    // 恒星警告
    const sunDist = ctx.flight.position.length();
    heat.classList.toggle('is-on', sunDist < ctx.world.sunRadius * 2.2);

    // 雷达
    drawRadar();
    if (radarLabel) radarLabel.textContent = `${Math.round(Math.max(50000, ctx.spec.current.sensorRange * 2) / 1000)} km`;
  };

  const radar = $('radar') as unknown as HTMLCanvasElement;
  const radarLabel = document.querySelector('.hud-radar-label') as HTMLElement | null;
  const rctx = radar.getContext('2d')!;
  const drawRadar = (): void => {
    const radarRange = Math.max(50000, ctx.spec.current.sensorRange * 2);
    const size = radar.width;
    const half = size / 2;
    rctx.clearRect(0, 0, size, size);

    rctx.strokeStyle = 'rgba(120, 180, 200, 0.18)';
    rctx.lineWidth = 1;
    for (const r of [0.33, 0.66, 1]) {
      rctx.beginPath();
      rctx.arc(half, half, half * r - 2, 0, Math.PI * 2);
      rctx.stroke();
    }
    rctx.beginPath();
    rctx.moveTo(half, 2);
    rctx.lineTo(half, size - 2);
    rctx.moveTo(2, half);
    rctx.lineTo(size - 2, half);
    rctx.stroke();

    const forward = ctx.flight.forwardVector;
    const yaw = Math.atan2(forward.x, forward.z);

    for (const body of ctx.world.bodies) {
      const rel = body.position.clone().sub(ctx.flight.position);
      const distance = rel.length();
      if (distance > radarRange) continue;

      const angle = Math.atan2(rel.x, rel.z) - yaw;
      const radius = (distance / radarRange) * (half - 8);
      const x = half - Math.sin(angle) * radius;
      const y = half - Math.cos(angle) * radius;

      const isStation = body.type === 'station';
      rctx.fillStyle = isStation ? 'rgba(201, 165, 92, 0.95)' : 'rgba(126, 210, 200, 0.85)';
      rctx.beginPath();
      rctx.arc(x, y, isStation ? 2.8 : 2.1, 0, Math.PI * 2);
      rctx.fill();

      if (target?.id === body.id) {
        rctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        rctx.beginPath();
        rctx.arc(x, y, 5.5, 0, Math.PI * 2);
        rctx.stroke();
      }
    }

    // 附近飞船
    for (const contact of ctx.combat.contacts) {
      const rel = contact.position.clone().sub(ctx.flight.position);
      const distance = rel.length();
      if (distance > radarRange || distance > ctx.spec.current.sensorRange) continue;

      const angle = Math.atan2(rel.x, rel.z) - yaw;
      const radius = (distance / radarRange) * (half - 8);
      const x = half - Math.sin(angle) * radius;
      const y = half - Math.cos(angle) * radius;
      const big = contact.radius > 120;

      rctx.fillStyle = contact.hostile ? 'rgba(255, 106, 84, 0.95)' : 'rgba(150, 192, 208, 0.8)';
      rctx.beginPath();
      rctx.arc(x, y, big ? 2.8 : 1.8, 0, Math.PI * 2);
      rctx.fill();
    }

    rctx.strokeStyle = 'rgba(89, 224, 200, 0.65)';
    rctx.lineWidth = 1.2;
    rctx.beginPath();
    rctx.arc(half, half, 9, 0, Math.PI * 2);
    rctx.stroke();
    rctx.beginPath();
    rctx.moveTo(half - 13, half); rctx.lineTo(half - 8, half);
    rctx.moveTo(half + 8, half); rctx.lineTo(half + 13, half);
    rctx.moveTo(half, half - 13); rctx.lineTo(half, half - 8);
    rctx.moveTo(half, half + 8); rctx.lineTo(half, half + 13);
    rctx.stroke();
    rctx.fillStyle = 'rgba(191, 248, 237, 0.98)';
    rctx.beginPath();
    rctx.moveTo(half, half - 5);
    rctx.lineTo(half - 3.4, half + 4);
    rctx.lineTo(half + 3.4, half + 4);
    rctx.closePath();
    rctx.fill();
  };

  return {
    update,
    toast,
    hit: showHit,
    explosionFlash: showExplosionFlash,
    openById: (id: string) => {
      const body = ctx.world.bodies.find((item) => item.id === id);
      if (body) openBody(body);
    },
  };
}
