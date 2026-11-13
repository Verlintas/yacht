import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { createWorld, type CelestialBody, type World } from './world';
import { createShip, type Ship } from './ship';
import { FlightController } from './flight';
import { EngineAudio } from './audio';
import type { SystemData } from './data';

interface GameContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  composer: EffectComposer;
  world: World;
  flight: FlightController;
  ship: Ship;
  audio: EngineAudio;
}

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

/** 站点部署在 /yacht/ 下，站内链接要补 base。 */
const BASE = import.meta.env.BASE_URL.replace(/\/+$/, '');
const withBase = (path: string): string => `${BASE}/${path.replace(/^\/+/, '')}`;

function formatNumber(value: number): string {
  return value > 0 ? value.toLocaleString('zh-CN') : '—';
}

function distanceLabel(value: number): string {
  if (value > 10000) return `${(value / 1000).toFixed(1)} km`;
  if (value > 1000) return `${(value / 1000).toFixed(2)} km`;
  return `${Math.round(value)} m`;
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
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 120000);
  camera.position.set(0, 240, 1500);

  await step('生成恒星', 0.2);

  const world = createWorld(system, scene, renderer);

  await step('投射行星', 0.45);

  const ship = createShip();
  scene.add(ship.group);

  const audio = new EngineAudio();

  const flight = new FlightController(camera);
  flight.attach(canvas);

  canvas.addEventListener('pointerdown', () => audio.start(), { once: true });

  await step('装载飞船', 0.62);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.3,
    0.5,
    0.86,
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  await step('编译着色器', 0.82);

  // 预编译，避免进场卡顿
  renderer.compile(scene, camera);
  world.update(0.016, 0, camera);
  composer.render();

  await step('就绪', 1);
  boot.classList.add('is-done');
  window.setTimeout(() => boot.remove(), 900);

  const ctx: GameContext = { renderer, scene, camera, composer, world, flight, ship, audio };

  // 起始位置：面向母港
  const dock = world.bodies.find((body) => body.id === 'station-dock');
  if (dock) {
    flight.position.copy(dock.position).add(new THREE.Vector3(190, 130, 400));
    const look = dock.position.clone().sub(flight.position).normalize();
    (flight as unknown as { yaw: number }).yaw = Math.atan2(-look.x, -look.z);
    (flight as unknown as { pitch: number }).pitch = -Math.asin(look.y);
    camera.position
      .copy(flight.position)
      .addScaledVector(look, -30)
      .add(new THREE.Vector3(0, 8, 0));
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
      (ctx.flight as unknown as { yaw: number }).yaw = Math.atan2(-look.x, -look.z);
      (ctx.flight as unknown as { pitch: number }).pitch = Math.asin(look.y);
      ctx.flight.velocity.set(0, 0, 0);
      ctx.camera.position.copy(ctx.flight.position).add(new THREE.Vector3(0, 8, 24));
    }
  }

  setupHud(ctx, system);

  const openParam = params.get('open');
  if (openParam) {
    window.setTimeout(() => {
      (window as unknown as { __openById?: (id: string) => void }).__openById?.(openParam);
    }, 500);
  }

  loop(ctx);
}

function loop(ctx: GameContext): void {
  const clock = new THREE.Clock();
  let elapsed = 0;

  const tick = (): void => {
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;

    ctx.flight.update(dt);
    ctx.ship.group.position.copy(ctx.flight.position);
    ctx.ship.group.quaternion.copy(ctx.flight.quaternion);
    ctx.ship.group.position.add(new THREE.Vector3(0, -1.4, 0));
    ctx.ship.update(dt, ctx.flight.throttle, ctx.flight.boost);

    ctx.world.update(dt, elapsed, ctx.camera);
    ctx.world.sun.position.set(0, 0, 0);

    updateHud(ctx, dt);
    ctx.audio.update(ctx.flight.speed, ctx.flight.throttle, ctx.flight.boost);
    ctx.composer.render();
    requestAnimationFrame(tick);
  };

  tick();
}

/* ── HUD ───────────────────────────────────── */

interface HudState {
  target: CelestialBody | null;
  nearest: CelestialBody | null;
  panelOpen: boolean;
  locked: boolean;
}

const state: HudState = { target: null, nearest: null, panelOpen: false, locked: true };

function setupHud(ctx: GameContext, system: SystemData): void {
  const speedValue = $('hud-speed');
  const speedBar = $('hud-speed-bar');
  const targetName = $('hud-target');
  const targetDist = $('hud-target-dist');
  const prompt = $('hud-prompt');
  const coords = $('hud-coords');
  const modeLabel = $('hud-mode');
  const fpsLabel = $('hud-fps');

  let fpsAccum = 0;
  let fpsFrames = 0;

  const marker = $('nav-marker');

  // 星图
  const map = $('map');
  const mapList = $('map-list');
  const mapToggle = $('map-toggle');

  const entries: Array<{ body: CelestialBody; title: string; subtitle: string }> = ctx.world.bodies.map((body) => ({
    body,
    title: body.planet?.title ?? body.station?.title ?? '',
    subtitle: body.planet ? body.planet.subtitle : '空间站',
  }));

  const renderMap = (): void => {
    mapList.innerHTML = '';
    const sorted = entries
      .slice()
      .sort((a, b) => a.body.position.distanceTo(ctx.flight.position) - b.body.position.distanceTo(ctx.flight.position));

    for (const entry of sorted) {
      const distance = entry.body.position.distanceTo(ctx.flight.position);
      const row = document.createElement('button');
      row.className = 'map-row';
      row.type = 'button';
      row.innerHTML = `
        <span class="map-row-main">
          <span class="map-row-title">${entry.title}</span>
          <span class="map-row-sub">${entry.subtitle}</span>
        </span>
        <span class="map-row-dist">${distanceLabel(distance)}</span>
      `;
      row.addEventListener('click', () => {
        state.target = entry.body;
        map.classList.remove('is-open');
        toast(`目标已设为 ${entry.title}`);
      });
      mapList.append(row);
    }
  };

  mapToggle?.addEventListener('click', () => {
    map.classList.toggle('is-open');
    if (map.classList.contains('is-open')) renderMap();
  });

  document.addEventListener('keydown', (event) => {
    if (event.code === 'KeyM') {
      map.classList.toggle('is-open');
      if (map.classList.contains('is-open')) renderMap();
    }
    if (event.code === 'KeyE') interact();
    if (event.code === 'Escape') closePanel();
  });

  // 交互
  const panel = $('panel');
  const panelTitle = $('panel-title');
  const panelSub = $('panel-sub');
  const panelBody = $('panel-body');
  const panelClose = $('panel-close');

  panelClose?.addEventListener('click', closePanel);

  function closePanel(): void {
    panel.classList.remove('is-open');
    state.panelOpen = false;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  function interact(): void {
    if (state.panelOpen) {
      closePanel();
      return;
    }
    const body = state.nearest;
    if (!body) return;
    openBody(body);
  }

  (window as unknown as { __openBody?: (body: CelestialBody) => void }).__openBody = openBody;
  (window as unknown as { __openById?: (id: string) => void }).__openById = (id: string) => {
    const body = ctx.world.bodies.find((item) => item.id === id);
    if (body) openBody(body);
  };

  function openBody(body: CelestialBody): void {
    state.panelOpen = true;
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
      if (def.to === '#board') {
        renderBoard(panelBody);
      } else {
        panelBody.innerHTML = `
          <p class="panel-desc">${def.description}</p>
          <div class="panel-frame">
            <iframe src="${withBase(def.to)}" title="${def.title}" loading="lazy"></iframe>
          </div>
          <a class="panel-action" href="${withBase(def.to)}">在新标签打开 →</a>
        `;
      }
    }
  }

  // 留言板
  async function renderBoard(container: HTMLElement): Promise<void> {
    container.innerHTML = `
      <p class="panel-desc">公共频道。留言会以 GitHub issue 的形式提交，需要 GitHub 账号。</p>
      <div class="board-list" id="board-list"><p class="board-empty">读取中…</p></div>
      <a class="panel-action" id="board-new" href="#" target="_blank" rel="noreferrer noopener">写一条留言 →</a>
    `;

    const list = container.querySelector('#board-list') as HTMLElement;
    const newLink = container.querySelector('#board-new') as HTMLAnchorElement;

    const title = encodeURIComponent('[留言板] ');
    const body = encodeURIComponent('写下你想说的话：\n\n');
    newLink.href = `https://github.com/Verlintas/yacht/issues/new?labels=board&title=${title}&body=${body}`;

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
      list.innerHTML =
        '<p class="board-empty">读取失败。可以直接点下面的按钮去 GitHub 留言。</p>';
    }
  }

  // 提示
  let toastTimer = 0;
  function toast(message: string): void {
    const el = $('toast');
    el.textContent = message;
    el.classList.add('is-on');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => el.classList.remove('is-on'), 2400);
  }
  (window as unknown as { gameToast: typeof toast }).gameToast = toast;

  // 每帧更新
  const projected = new THREE.Vector3();

  (window as unknown as { gameUpdateHud: (dt: number) => void }).gameUpdateHud = (dt: number) => {
    fpsAccum += dt;
    fpsFrames += 1;
    if (fpsAccum > 0.5) {
      fpsLabel.textContent = `${Math.round(fpsFrames / fpsAccum)} fps`;
      fpsAccum = 0;
      fpsFrames = 0;
    }

    const speed = ctx.flight.speed;
    speedValue.textContent = Math.round(speed).toString();
    speedBar.style.width = `${Math.min(100, (speed / 1200) * 100)}%`;

    coords.textContent = `X ${Math.round(ctx.flight.position.x)}  Y ${Math.round(ctx.flight.position.y)}  Z ${Math.round(ctx.flight.position.z)}`;
    modeLabel.textContent = ctx.flight.cameraMode === 'third' ? '第三人称' : '第一人称';

    // 最近目标
    let nearest: CelestialBody | null = null;
    let nearestDist = Infinity;
    for (const body of ctx.world.bodies) {
      const d = body.position.distanceTo(ctx.flight.position);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = body;
      }
    }
    state.nearest = nearest;

    const interactRange = nearest ? nearest.radius * 4 + 260 : 0;
    if (nearest && nearestDist < interactRange && !state.panelOpen) {
      prompt.classList.add('is-on');
      prompt.innerHTML = `<b>E</b> 靠近 ${nearest.planet?.title ?? nearest.station?.title ?? ''}`;
    } else {
      prompt.classList.remove('is-on');
    }

    if (state.target) {
      const dist = state.target.position.distanceTo(ctx.flight.position);
      targetName.textContent = state.target.planet?.title ?? state.target.station?.title ?? '';
      targetDist.textContent = distanceLabel(dist);

      projected.copy(state.target.position).project(ctx.camera);
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
      marker.classList.remove('is-on');
    }
  };

  // 雷达
  const radar = $('radar') as unknown as HTMLCanvasElement;
  const rctx = radar.getContext('2d')!;
  const radarRange = 9000;

  (window as unknown as { gameDrawRadar: () => void }).gameDrawRadar = () => {
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
      const x = half + Math.sin(angle) * radius;
      const y = half - Math.cos(angle) * radius;

      const isStation = body.type === 'station';
      rctx.fillStyle = isStation ? 'rgba(201, 165, 92, 0.95)' : 'rgba(126, 210, 200, 0.85)';
      rctx.beginPath();
      rctx.arc(x, y, isStation ? 2.8 : 2.1, 0, Math.PI * 2);
      rctx.fill();

      if (state.target?.id === body.id) {
        rctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        rctx.beginPath();
        rctx.arc(x, y, 5.5, 0, Math.PI * 2);
        rctx.stroke();
      }
    }

    rctx.fillStyle = 'rgba(233, 239, 243, 0.95)';
    rctx.beginPath();
    rctx.moveTo(half, half - 5);
    rctx.lineTo(half - 3.4, half + 4);
    rctx.lineTo(half + 3.4, half + 4);
    rctx.closePath();
    rctx.fill();
  };
}

function updateHud(ctx: GameContext, dt: number): void {
  const fn = (window as unknown as { gameUpdateHud?: (d: number) => void }).gameUpdateHud;
  fn?.(dt);

  const radarFn = (window as unknown as { gameDrawRadar?: () => void }).gameDrawRadar;
  if (Math.random() < 0.35) radarFn?.();

  // 自适应画质
  const composite = ctx.renderer.info.render;
  void composite;
}
