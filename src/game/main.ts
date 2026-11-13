import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
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
  motionBlur: ShaderPass;
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 1, 2_400_000);
  // 挂在相机上的补光，避免飞船暗面全黑
  const fillLight = new THREE.PointLight(0xa8dcff, 5200, 900, 1.5);
  fillLight.position.set(0, 6, 4);
  camera.add(fillLight);
  scene.add(camera);

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

  const ctx: GameContext = { renderer, scene, camera, composer, world, flight, ship, audio, motionBlur };

  const dock = world.bodies.find((body) => body.id === 'station-dock');
  if (dock) {
    // 从侧面接近，避免太阳正好在空港背后
    const radial = dock.position.clone().normalize();
    const tangent = new THREE.Vector3(-radial.z, 0, radial.x).normalize();
    flight.position
      .copy(dock.position)
      .addScaledVector(tangent, 15000)
      .add(new THREE.Vector3(0, 4500, 0));
    const look = dock.position.clone().sub(flight.position).normalize();
    (flight as unknown as { yaw: number }).yaw = Math.atan2(-look.x, -look.z);
    (flight as unknown as { pitch: number }).pitch = -Math.asin(look.y);
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
      (ctx.flight as unknown as { yaw: number }).yaw = Math.atan2(-look.x, -look.z);
      (ctx.flight as unknown as { pitch: number }).pitch = -Math.asin(look.y);
      ctx.flight.halt();
      ctx.camera.position.copy(ctx.flight.position).addScaledVector(look, -34).add(new THREE.Vector3(0, 10, 0));
    }
  }

  const hud = setupHud(ctx, system);

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
}

function loop(ctx: GameContext, hud: Hud): void {
  const clock = new THREE.Clock();
  const fade = document.getElementById('fade') as HTMLElement;
  const motionBlur = ctx.motionBlur;
  let elapsed = 0;

  const tick = (): void => {
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;

    ctx.flight.update(dt);

    // 实体碰撞：撞上天体就被推开并卸掉法向速度
    for (const body of ctx.world.bodies) {
      const min = body.radius * (body.type === 'station' ? 1.05 : 1.02);
      const delta = ctx.flight.position.clone().sub(body.position);
      const distance = delta.length();
      if (distance < min && distance > 0.001) {
        const normal = delta.normalize();
        ctx.flight.position.copy(body.position).addScaledVector(normal, min);
        const vn = ctx.flight.velocity.dot(normal);
        if (vn < 0) ctx.flight.velocity.addScaledVector(normal, -vn * 1.8);
      }
    }

    // 恒星熔毁
    if (ctx.flight.position.length() < ctx.world.sunRadius * 1.25) {
      fade.classList.add('is-black');
      window.setTimeout(() => {
        const dock = ctx.world.bodies.find((b) => b.id === 'station-dock');
        if (dock) {
          const radial = dock.position.clone().normalize();
          const tangent = new THREE.Vector3(-radial.z, 0, radial.x).normalize();
          ctx.flight.position.copy(dock.position).addScaledVector(tangent, 15000).add(new THREE.Vector3(0, 4500, 0));
        }
        ctx.flight.halt();
        fade.classList.remove('is-black');
        hud.toast('船体熔毁 · 已在母港重新装配');
      }, 700);
    }

    // 动态模糊：速度越快越明显，加速时再叠一点
    const speedNorm = Math.min(1, ctx.flight.speed / 9000);
    motionBlur.uniforms.uStrength.value = speedNorm * 0.035 + ctx.flight.boost * 0.045;

    ctx.ship.group.position.copy(ctx.flight.position);
    ctx.ship.group.quaternion.copy(ctx.flight.quaternion);
    ctx.ship.group.position.add(new THREE.Vector3(0, -2.2, 0));
    ctx.ship.update(dt, ctx.flight.throttle, ctx.flight.boost);
    ctx.ship.group.visible = ctx.flight.cameraMode === 'third';

    ctx.world.update(dt, elapsed, ctx.camera);
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
    ctx.composer.render();
    requestAnimationFrame(tick);
  };

  tick();
}

function setupHud(ctx: GameContext, system: SystemData): Hud {
  const speedValue = $('hud-speed');
  const speedBar = $('hud-speed-bar');
  const targetName = $('hud-target');
  const targetDist = $('hud-target-dist');
  const prompt = $('hud-prompt');
  const coords = $('hud-coords');
  const modeLabel = $('hud-mode');
  const fpsLabel = $('hud-fps');
  const throttleBar = $('hud-throttle-bar');
  const assistLabel = $('hud-assist');
  const marker = $('nav-marker');
  const cockpit = $('cockpit');
  const cockpitSpeed = $('cockpit-speed');
  const cockpitTarget = $('cockpit-target');
  const cockpitDist = $('cockpit-dist');
  const heat = $('heat-warning');
  const fade = $('fade');

  let fpsAccum = 0;
  let fpsFrames = 0;
  let target: CelestialBody | null = null;
  let nearest: CelestialBody | null = null;
  let panelOpen = false;
  let docking: { body: CelestialBody; t: number; from: THREE.Vector3; to: THREE.Vector3; landing: boolean } | null = null;
  let toastTimer = 0;

  const toast = (message: string): void => {
    const el = $('toast');
    el.textContent = message;
    el.classList.add('is-on');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => el.classList.remove('is-on'), 2400);
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
    const range = 700000;

    c.clearRect(0, 0, w, h);
    c.fillStyle = '#04080d';
    c.fillRect(0, 0, w, h);

    const forward = ctx.flight.forwardVector;
    const yaw = Math.atan2(forward.x, forward.z);

    c.strokeStyle = 'rgba(120,180,200,0.16)';
    c.lineWidth = 1;
    for (const r of [0.25, 0.5, 0.75, 1]) {
      c.beginPath();
      c.arc(cx, cy, (Math.min(w, h) / 2 - 10) * r, 0, Math.PI * 2);
      c.stroke();
    }

    // 太阳
    c.fillStyle = 'rgba(255,200,120,0.9)';
    c.beginPath();
    c.arc(cx, cy, 5, 0, Math.PI * 2);
    c.fill();

    for (const body of ctx.world.bodies) {
      const rel = body.position.clone().sub(ctx.flight.position);
      const distance = rel.length();
      if (distance > range) continue;

      const angle = Math.atan2(rel.x, rel.z) - yaw;
      const radius = (distance / range) * (Math.min(w, h) / 2 - 14);
      const x = cx + Math.sin(angle) * radius;
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

    // 本舰
    c.fillStyle = '#e9eff3';
    c.beginPath();
    c.moveTo(cx, cy - 7);
    c.lineTo(cx - 4.5, cy + 5);
    c.lineTo(cx + 4.5, cy + 5);
    c.closePath();
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
    map.classList.toggle('is-open');
    if (map.classList.contains('is-open')) renderMap();
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
      if (def.to === '#board') {
        void renderBoard(panelBody);
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
        if (nearest.position.distanceTo(ctx.flight.position) < nearest.radius * 2.4) startDock(nearest);
      } else if (nearest.position.distanceTo(ctx.flight.position) < nearest.radius * 1.8) {
        startDock(nearest);
      }
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
    modeLabel.textContent = ctx.flight.cameraMode === 'third' ? '第三人称' : '第一人称';
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
      ((best.type === 'station' && bestDist < best.radius * 2.4) ||
        (best.type === 'planet' && bestDist < best.radius * 1.8));

    if (best && canDock && !panelOpen) {
      prompt.classList.add('is-on');
      prompt.innerHTML = `<b>F</b> ${best.type === 'station' ? '停靠' : '进入'} ${best.planet?.title ?? best.station?.title ?? ''}`;
    } else {
      prompt.classList.remove('is-on');
    }

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

    // 恒星警告
    const sunDist = ctx.flight.position.length();
    heat.classList.toggle('is-on', sunDist < ctx.world.sunRadius * 2.2);

    // 雷达
    drawRadar();
  };

  const radar = $('radar') as unknown as HTMLCanvasElement;
  const rctx = radar.getContext('2d')!;
  const radarRange = 700000;

  const drawRadar = (): void => {
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

      if (target?.id === body.id) {
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

  return {
    update,
    toast,
    openById: (id: string) => {
      const body = ctx.world.bodies.find((item) => item.id === id);
      if (body) openBody(body);
    },
  };
}
