import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { loadTerrain, type TerrainAssets } from '../game/iac/terrain';
import { FootPlayer, sampleSurface } from '../game/iac/player';
import { animateNpcs, loadPort, type PortWorld } from '../game/iac/port';

const BASE = import.meta.env.BASE_URL.replace(/\/+$/, '');
const PAD_Y = 40.32;

type Mode = 'parked' | 'foot';
type UiPanel = 'dialog' | 'shop';

interface Interactable {
  id: string;
  kind: 'npc' | 'shop' | 'ship';
  x: number;
  z: number;
  radius: number;
  key: 'E' | 'F';
  label: string;
  npcId?: string;
}

interface DialogDef {
  name: string;
  role: string;
  lines: string[];
}

const DIALOGS: Record<string, DialogDef> = {
  dockmaster: {
    name: '凯拉·沃斯',
    role: '码头长 / DOCKMASTER',
    lines: [
      'A-30 的泊位已经锁定。Anvil Landing 欢迎你，飞行员。',
      'T2 到港厅在西侧。补给柜台在泊位北面，索恩会给你一个好价钱。',
      '别走到平台边缘外面——峡谷里没有回收队。',
    ],
  },
  mechanic: {
    name: '鲁克·萨姆',
    role: '机械师 / MECHANIC',
    lines: [
      '你的 A-30 起落架液压有点渗漏，但还能撑一次短途。',
      '要下峡谷的话，先去公会街补给。还有，别把船开进货运门。',
    ],
  },
};

const SHOP_ITEMS = [
  { id: 'fc9', name: 'FC-9 燃料电池单元', desc: '推进器备用电池，适配 A-30。', price: 180 },
  { id: 'patch', name: 'MK-II 船体修补套件', desc: '临时补板 + 密封胶。', price: 240 },
  { id: 'chart', name: 'Anvil 航图芯片', desc: '本地峡谷与货运道路离线图。', price: 120 },
];

const SETTINGS = {
  exposure: 1.0,
  sunIntensity: 4.2,
  envIntensity: 0.38,
  fogDensity: 0.00017,
  shadowRadius: 150,
};

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
}

function formatCredits(value: number): string {
  return value.toLocaleString('en-US');
}

function clampCamera(camera: THREE.PerspectiveCamera, aspect: number): void {
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
}

export async function initIacLanding(): Promise<void> {
  const canvas = el<HTMLCanvasElement>('iac-canvas');
  const loading = el<HTMLElement>('iac-loading');
  const loadingLabel = el<HTMLElement>('iac-loading-label');
  const fade = el<HTMLElement>('iac-fade');
  const hud = el<HTMLElement>('iac-hud');
  const parkedPanel = el<HTMLElement>('iac-parked');
  const footPanel = el<HTMLElement>('iac-foot');
  const prompt = el<HTMLElement>('iac-prompt');
  const promptKey = el<HTMLElement>('iac-prompt-key');
  const promptText = el<HTMLElement>('iac-prompt-text');
  const near = el<HTMLElement>('iac-near');
  const hint = el<HTMLElement>('iac-hint');
  const crosshair = el<HTMLElement>('iac-crosshair');
  const dialog = el<HTMLElement>('iac-dialog');
  const dialogName = el<HTMLElement>('iac-dialog-name');
  const dialogRole = el<HTMLElement>('iac-dialog-role');
  const dialogText = el<HTMLElement>('iac-dialog-text');
  const dialogFoot = el<HTMLElement>('iac-dialog-foot');
  const shop = el<HTMLElement>('iac-shop');
  const shopCredits = el<HTMLElement>('iac-shop-credits');
  const shopItems = el<HTMLElement>('iac-shop-items');
  const shopClose = el<HTMLElement>('iac-shop-close');
  const statsEl = el<HTMLElement>('iac-stats');
  const toastEl = el<HTMLElement>('iac-toast');
  const modeEls = document.querySelectorAll<HTMLElement>('[data-mode-label]');

  const setLoading = (text: string): void => {
    loadingLabel.textContent = text;
  };

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    logarithmicDepthBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = SETTINGS.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const gl = renderer.getContext();
  const debugExt = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = debugExt ? String(gl.getParameter(debugExt.UNMASKED_RENDERER_WEBGL)) : '';
  const softwareRenderer = /swiftshader|software/i.test(gpu);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xc0b3a2, SETTINGS.fogDensity);

  const camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.1, 60000);
  camera.position.set(-32, PAD_Y + 8.7, 52);
  camera.rotation.order = 'YXZ';

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, PAD_Y + 3.7, 2);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.enablePan = false;
  controls.minDistance = 18;
  controls.maxDistance = 120;
  controls.maxPolarAngle = Math.PI * 0.485;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.1;
  controls.update();

  // Sky / environment ------------------------------------------------------
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const hdr = await new HDRLoader().loadAsync(`${BASE}/terrain-sample/sky.hdr`);
    const envTexture = pmrem.fromEquirectangular(hdr).texture;
    scene.environment = envTexture;
    scene.background = envTexture;
    scene.backgroundBlurriness = 0.14;
    scene.environmentIntensity = SETTINGS.envIntensity;
    hdr.dispose();
    pmrem.dispose();
  } catch (error) {
    console.warn('[iac] HDR sky unavailable, using fallback', error);
    scene.background = new THREE.Color(0x9e8f7d);
    scene.environment = null;
  }

  // Lights -----------------------------------------------------------------
  const sun = new THREE.DirectionalLight(0xffc58f, SETTINGS.sunIntensity);
  sun.position.set(-260, 300, 190);
  sun.target.position.set(0, PAD_Y, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -SETTINGS.shadowRadius;
  sun.shadow.camera.right = SETTINGS.shadowRadius;
  sun.shadow.camera.top = SETTINGS.shadowRadius;
  sun.shadow.camera.bottom = -SETTINGS.shadowRadius;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 650;
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.055;
  scene.add(sun, sun.target);

  const fill = new THREE.DirectionalLight(0x93b8d2, 0.35);
  fill.position.set(200, 160, -180);
  scene.add(fill);

  const hemi = new THREE.HemisphereLight(0xb6c6d3, 0x3b2d21, 0.2);
  scene.add(hemi);

  // A very light sun disc / glow for the exposed sky, matching the directional
  // light. It is only a sky element, not a bloom substitute.
  const sunCanvas = document.createElement('canvas');
  sunCanvas.width = 256;
  sunCanvas.height = 256;
  const sunCtx = sunCanvas.getContext('2d');
  if (sunCtx) {
    const g = sunCtx.createRadialGradient(128, 128, 2, 128, 128, 126);
    g.addColorStop(0, 'rgba(255,249,235,1)');
    g.addColorStop(0.08, 'rgba(255,232,190,0.95)');
    g.addColorStop(0.28, 'rgba(255,196,125,0.38)');
    g.addColorStop(1, 'rgba(255,180,100,0)');
    sunCtx.fillStyle = g;
    sunCtx.fillRect(0, 0, 256, 256);
  }
  const sunTexture = new THREE.CanvasTexture(sunCanvas);
  sunTexture.colorSpace = THREE.SRGBColorSpace;
  const sunGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: sunTexture,
      color: 0xffd2a0,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      fog: false,
    }),
  );
  sunGlow.position.set(-11700, 13500, 8550);
  sunGlow.scale.setScalar(5400);
  scene.add(sunGlow);
  const sunCore = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: sunTexture,
      color: 0xfff4da,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      fog: false,
    }),
  );
  sunCore.position.copy(sunGlow.position);
  sunCore.scale.setScalar(1200);
  scene.add(sunCore);

  // World ------------------------------------------------------------------
  setLoading('AUTHORING ANVIL LANDING');
  let port: PortWorld;
  let terrain: TerrainAssets;
  try {
    port = await loadPort(scene, BASE, PAD_Y);
    setLoading('STREAMING 16 KM HEIGHTFIELD');
    terrain = await loadTerrain(BASE, PAD_Y, port.asphalt);
    scene.add(terrain.mesh, terrain.backdrop);
    if (terrain.road) scene.add(terrain.road);
  } catch (error) {
    console.error('[iac] world load failed', error);
    loadingLabel.textContent = 'WORLD LOAD FAILED — CHECK CONSOLE';
    throw error;
  }

  const player = new FootPlayer((x, z, feetY, colliders) =>
    sampleSurface((xx, zz) => terrain.field.groundAt(xx, zz), x, z, feetY, colliders),
  );
  const spawnX = 0;
  const spawnZ = 23.5;
  player.setSpawn(spawnX, terrain.field.groundAt(spawnX, spawnZ) + 0.02, spawnZ, Math.PI / 2);

  // Interactions -----------------------------------------------------------
  const interactables: Interactable[] = [
    { id: 'ship', kind: 'ship', x: 0, z: 17.2, radius: 7.0, key: 'F', label: 'F 登船 · A-30 雷霆' },
    {
      id: 'dockmaster',
      kind: 'npc',
      x: -145,
      z: 108,
      radius: 3.2,
      key: 'E',
      label: 'E 交谈 · 凯拉·沃斯 / 码头长',
      npcId: 'dockmaster',
    },
    {
      id: 'mechanic',
      kind: 'npc',
      x: 18,
      z: 24,
      radius: 3.0,
      key: 'E',
      label: 'E 交谈 · 鲁克·萨姆 / 机械师',
      npcId: 'mechanic',
    },
    {
      id: 'shop',
      kind: 'shop',
      x: -108,
      z: -5.5,
      radius: 3.8,
      key: 'E',
      label: 'E 交易 · 公会街补给',
    },
  ];

  // UI state ---------------------------------------------------------------
  let mode: Mode = 'parked';
  let ui: UiPanel | null = null;
  let selected: Interactable | null = null;
  let dialogId: string | null = null;
  let dialogLine = 0;
  let credits = 1250;
  const purchased = new Set<string>();
  let transitioning = false;
  let parkedFrozen = false;
  let shipPromptCooldown = 0;
  let jumpQueued = false;
  let toastTimer = 0;
  let statsVisible = new URLSearchParams(window.location.search).get('stats') === '1';
  let fps = 0;
  let frames = 0;
  let fpsAccum = 0;
  let lastCalls = 0;
  let lastTris = 0;

  const setModeUi = (): void => {
    const label = mode === 'foot' ? 'ON FOOT // 步行' : 'A-30 // LANDED';
    for (const node of modeEls) {
      node.textContent = label;
    }
    parkedPanel.classList.toggle('is-active', mode === 'parked');
    footPanel.classList.toggle('is-active', mode === 'foot');
    crosshair.classList.toggle('is-active', mode === 'foot' && ui === null);
    hud.classList.toggle('is-foot', mode === 'foot');
  };

  const setPromptVisible = (visible: boolean): void => {
    prompt.classList.toggle('is-active', visible);
    if (!visible) near.classList.remove('is-active');
  };

  const showToast = (text: string): void => {
    toastEl.textContent = text;
    toastEl.classList.add('is-active');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove('is-active'), 2200);
  };

  const updateHudHint = (): void => {
    if (mode === 'parked') {
      hint.textContent = 'F 下船 · E 交互 · 鼠标拖动环视';
      return;
    }
    if (ui) {
      hint.textContent = ui === 'dialog' ? 'E 继续 · ESC 关闭' : 'ESC 关闭 · 点击商品购买';
      return;
    }
    const locked = document.pointerLockElement === canvas;
    const base = 'WASD 移动 · Shift 冲刺 · Space 跳跃 · F 登船 · E 交互';
    hint.textContent = locked ? base : `${base} · 点击画面锁定鼠标`;
  };

  const renderDialog = (): void => {
    if (!dialogId) return;
    const def = DIALOGS[dialogId];
    dialogName.textContent = def.name;
    dialogRole.textContent = def.role;
    dialogText.textContent = def.lines[dialogLine] ?? '';
    dialogFoot.textContent =
      dialogLine >= def.lines.length - 1 ? 'E 结束 · ESC 关闭' : 'E 继续 · ESC 关闭';
  };

  const openDialog = (id: string): void => {
    if (!DIALOGS[id]) return;
    ui = 'dialog';
    dialogId = id;
    dialogLine = 0;
    dialog.classList.add('is-open');
    shop.classList.remove('is-open');
    renderDialog();
    document.exitPointerLock?.();
    setModeUi();
    updateHudHint();
    setPromptVisible(false);
  };

  const advanceDialog = (): void => {
    if (ui !== 'dialog' || !dialogId) return;
    const def = DIALOGS[dialogId];
    if (dialogLine < def.lines.length - 1) {
      dialogLine += 1;
      renderDialog();
    } else {
      closeUi();
    }
  };

  const renderShop = (): void => {
    shopCredits.textContent = `${formatCredits(credits)} CR`;
    shopItems.innerHTML = '';
    for (const item of SHOP_ITEMS) {
      const row = document.createElement('div');
      row.className = 'iac-shop-item';
      const owned = purchased.has(item.id);
      const affordable = credits >= item.price;
      row.innerHTML = `
        <div class="iac-shop-item-head">
          <span class="iac-shop-item-name">${item.name}</span>
          <span class="iac-shop-item-price">${formatCredits(item.price)} CR</span>
        </div>
        <p class="iac-shop-item-desc">${item.desc}</p>
        <button class="iac-shop-buy" data-buy="${item.id}" ${owned || !affordable ? 'disabled' : ''}>
          ${owned ? '已购买 / OWNED' : affordable ? '购买 / BUY' : '余额不足'}
        </button>
      `;
      shopItems.appendChild(row);
    }
  };

  const openShop = (): void => {
    ui = 'shop';
    renderShop();
    shop.classList.add('is-open');
    dialog.classList.remove('is-open');
    document.exitPointerLock?.();
    setModeUi();
    updateHudHint();
    setPromptVisible(false);
  };

  function closeUi(): void {
    if (!ui) return;
    ui = null;
    dialogId = null;
    dialog.classList.remove('is-open');
    shop.classList.remove('is-open');
    setModeUi();
    updateHudHint();
    showToast('点击画面继续 / CLICK TO LOOK');
  }

  shopItems.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const id = target.closest<HTMLElement>('[data-buy]')?.dataset.buy;
    if (!id) return;
    const item = SHOP_ITEMS.find((entry) => entry.id === id);
    if (!item || purchased.has(id) || credits < item.price) return;
    credits -= item.price;
    purchased.add(id);
    renderShop();
    showToast(`已购买：${item.name}`);
  });
  shopClose.addEventListener('click', closeUi);

  // Mode transitions -------------------------------------------------------
  const finishDisembark = (): void => {
    mode = 'foot';
    ui = null;
    dialog.classList.remove('is-open');
    shop.classList.remove('is-open');
    controls.enabled = false;
    parkedFrozen = false;
    const x = spawnX;
    const z = spawnZ;
    player.position.set(x, terrain.field.groundAt(x, z) + 0.03, z);
    player.velocity.set(0, 0, 0);
    player.yaw = Math.PI / 2;
    player.pitch = -0.02;
    player.grounded = true;
    player.applyCamera(camera);
    camera.fov = 72;
    camera.updateProjectionMatrix();
    shipPromptCooldown = 1.4;
    keys.clear();
    jumpQueued = false;
    setModeUi();
    updateHudHint();
    near.classList.remove('is-active');
  };

  const finishBoard = (): void => {
    mode = 'parked';
    ui = null;
    dialog.classList.remove('is-open');
    shop.classList.remove('is-open');
    controls.enabled = true;
    controls.target.set(0, PAD_Y + 3.7, 2);
    camera.position.set(48, PAD_Y + 13, 72);
    camera.fov = 54;
    camera.updateProjectionMatrix();
    parkedFrozen = false;
    keys.clear();
    jumpQueued = false;
    controls.update();
    setModeUi();
    updateHudHint();
    setPromptVisible(false);
    document.exitPointerLock?.();
  };

  const transitionTo = (action: () => void): void => {
    if (transitioning) return;
    transitioning = true;
    fade.classList.add('is-black');
    window.setTimeout(() => {
      action();
      window.setTimeout(() => {
        fade.classList.remove('is-black');
        transitioning = false;
      }, 80);
    }, 300);
  };

  const disembark = (instant = false): void => {
    if (mode !== 'parked' || transitioning) return;
    if (instant) {
      finishDisembark();
      return;
    }
    // F is a user gesture; request the lock before the fade timeout so Chrome
    // accepts it. If it is refused, the click prompt still works.
    void canvas.requestPointerLock?.();
    transitionTo(finishDisembark);
  };

  const board = (instant = false): void => {
    if (mode !== 'foot' || ui || transitioning) return;
    if (instant) {
      finishBoard();
      return;
    }
    transitionTo(finishBoard);
  };

  const findClosest = (): Interactable | null => {
    if (mode !== 'foot' || ui) return null;
    let best: Interactable | null = null;
    let bestScore = Infinity;
    for (const item of interactables) {
      if (item.kind === 'ship' && shipPromptCooldown > 0) continue;
      const dx = player.position.x - item.x;
      const dz = player.position.z - item.z;
      const dist = Math.hypot(dx, dz);
      if (dist > item.radius) continue;
      if (Math.abs(player.position.y - PAD_Y) > 4) continue;
      const score = dist / item.radius;
      if (score < bestScore) {
        bestScore = score;
        best = item;
      }
    }
    return best;
  };

  const interact = (): void => {
    if (!selected || ui) return;
    if (selected.kind === 'ship') {
      board();
    } else if (selected.kind === 'shop') {
      openShop();
    } else if (selected.npcId) {
      openDialog(selected.npcId);
    }
  };

  const updatePrompt = (): void => {
    if (mode !== 'foot' || ui) {
      setPromptVisible(false);
      return;
    }
    if (shipPromptCooldown > 0) shipPromptCooldown = Math.max(0, shipPromptCooldown - 0.016);
    selected = findClosest();
    if (!selected) {
      setPromptVisible(false);
      return;
    }
    promptKey.textContent = selected.key;
    promptText.textContent = selected.label.replace(/^[EF] /, '');
    prompt.classList.add('is-active');
    near.classList.add('is-active');
    if (selected.kind === 'ship') {
      near.textContent = 'A-30 雷霆 · 登舰舷梯';
    } else if (selected.kind === 'shop') {
      near.textContent = '公会街补给 · 索恩·哈珀 / 商人';
    } else {
      const npc = port.npcs.find((entry) => entry.id === selected?.npcId);
      near.textContent = npc ? `${npc.name} · ${npc.role}` : '';
    }
  };

  // Input ------------------------------------------------------------------
  const keys = new Set<string>();
  const movementCodes = new Set([
    'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'Space',
  ]);

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'KeyP' && !event.repeat) {
      statsVisible = !statsVisible;
      statsEl.classList.toggle('is-active', statsVisible);
      return;
    }
    if (event.code === 'Escape') {
      if (ui) {
        closeUi();
        event.preventDefault();
        return;
      }
      if (mode === 'foot' && document.pointerLockElement === canvas) {
        document.exitPointerLock();
      }
      return;
    }
    if (movementCodes.has(event.code)) {
      keys.add(event.code);
      if (event.code === 'Space') {
        if (!event.repeat) jumpQueued = true;
        event.preventDefault();
      }
    }
    if (mode === 'parked') {
      if (event.code === 'KeyF' && !event.repeat) {
        disembark();
        event.preventDefault();
      }
      return;
    }
    if (ui) {
      if (event.code === 'KeyE' && !event.repeat && ui === 'dialog') {
        advanceDialog();
        event.preventDefault();
      }
      return;
    }
    if (event.code === 'KeyF' && !event.repeat) {
      if (selected?.kind === 'ship' || player.position.distanceTo(port.shipEntry) < 7.5) {
        board();
      }
      return;
    }
    if (event.code === 'KeyE' && !event.repeat) {
      interact();
      return;
    }
    if (event.code === 'KeyR' && !event.repeat) {
      player.position.copy(player.spawn);
      player.velocity.set(0, 0, 0);
      player.grounded = true;
      showToast('已回到登舰舷梯');
    }
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    keys.delete(event.code);
  };
  window.addEventListener('keydown', onKeyDown, { passive: false });
  window.addEventListener('keyup', onKeyUp);

  window.addEventListener('mousemove', (event) => {
    if (mode !== 'foot' || ui || document.pointerLockElement !== canvas) return;
    player.look(event.movementX, event.movementY);
  });

  canvas.addEventListener('pointerdown', () => {
    if (mode === 'foot' && !ui && document.pointerLockElement !== canvas) {
      void canvas.requestPointerLock?.();
    }
  });
  document.addEventListener('pointerlockchange', updateHudHint);

  // Debug / capture API ----------------------------------------------------
  const api = {
    ready: false,
    version: 'iac-landing-slice-1',
    gpu,
    softwareRenderer,
    mode: () => mode,
    ui: () => ui,
    credits: () => credits,
    stats: () => ({
      fps,
      calls: lastCalls,
      triangles: lastTris,
      pixelRatio: renderer.getPixelRatio(),
      size: [renderer.domElement.clientWidth, renderer.domElement.clientHeight],
      gpu,
      softwareRenderer,
    }),
    setStats: (visible: boolean) => {
      statsVisible = visible;
      statsEl.classList.toggle('is-active', statsVisible);
    },
    disembark: (instant = true) => disembark(instant),
    board: (instant = true) => board(instant),
    teleport: (x: number, z: number, yaw = Math.PI / 2, pitch = 0) => {
      if (mode !== 'foot') {
        mode = 'foot';
        controls.enabled = false;
      }
      ui = null;
      dialog.classList.remove('is-open');
      shop.classList.remove('is-open');
      player.position.set(x, terrain.field.groundAt(x, z) + 0.03, z);
      player.velocity.set(0, 0, 0);
      player.yaw = yaw;
      player.pitch = pitch;
      player.grounded = true;
      player.applyCamera(camera);
      camera.fov = 72;
      camera.updateProjectionMatrix();
      setModeUi();
      updateHudHint();
    },
    lookAt: (x: number, z: number, pitch = 0) => {
      const dx = x - player.position.x;
      const dz = z - player.position.z;
      player.yaw = Math.atan2(-dx, -dz);
      player.pitch = pitch;
      player.applyCamera(camera);
    },
    openDialog: (id: string) => openDialog(id),
    openShop: () => openShop(),
    closeUi: () => closeUi(),
    parkedView: (position: [number, number, number], target: [number, number, number], fov = 54) => {
      mode = 'parked';
      ui = null;
      dialog.classList.remove('is-open');
      shop.classList.remove('is-open');
      controls.enabled = false;
      parkedFrozen = true;
      camera.position.set(...position);
      controls.target.set(...target);
      camera.fov = fov;
      camera.updateProjectionMatrix();
      camera.lookAt(new THREE.Vector3(...target));
      setModeUi();
      updateHudHint();
      setPromptVisible(false);
      toastEl.classList.remove('is-active');
    },
    resumeParkedOrbit: () => {
      parkedFrozen = false;
      controls.enabled = true;
      controls.autoRotate = true;
      controls.update();
    },
    player,
    camera,
    scene,
    renderer,
    terrain,
    port,
  };
  (window as unknown as { __iac: typeof api & { ready: boolean } }).__iac = api;

  // Resize -----------------------------------------------------------------
  const onResize = (): void => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    clampCamera(camera, window.innerWidth / window.innerHeight);
  };
  window.addEventListener('resize', onResize);

  // Loop -------------------------------------------------------------------
  let elapsed = 0;
  let lastFrame = performance.now();
  let firstFrame = true;

  const updateStats = (dt: number): void => {
    frames += 1;
    fpsAccum += dt;
    if (fpsAccum >= 0.5) {
      fps = Math.round(frames / fpsAccum);
      frames = 0;
      fpsAccum = 0;
    }
    lastCalls = renderer.info.render.calls;
    lastTris = renderer.info.render.triangles;
    if (statsVisible) {
      const stats = api.stats();
      statsEl.textContent = [
        `FPS ${stats.fps}`,
        `CALLS ${stats.calls}`,
        `TRIS ${(stats.triangles / 1_000_000).toFixed(2)}M`,
        `${stats.size[0]}×${stats.size[1]} @${stats.pixelRatio.toFixed(1)}`,
        stats.softwareRenderer ? 'SOFTWARE GPU' : 'GPU',
      ].join('  ·  ');
    }
  };

  const animate = (now: number): void => {
    requestAnimationFrame(animate);
    const dt = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;
    elapsed += dt;

    if (mode === 'parked') {
      if (!parkedFrozen) controls.update();
    } else {
      const input = {
        forward: (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0),
        right: (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0),
        sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'),
        jump: jumpQueued,
      };
      if (!ui) {
        const respawned = player.update(dt, input, port.colliders);
        jumpQueued = false;
        if (respawned) showToast('已回到安全区');
      }
      player.applyCamera(camera);
      updatePrompt();
    }
    animateNpcs(port.npcs, player.position, elapsed);

    if (mode === 'foot') {
      // Keep the eye just above the local surface if the player is standing
      // still at the edge of the deck.
      camera.position.y = Math.max(camera.position.y, terrain.field.groundAt(camera.position.x, camera.position.z) + 0.25);
    }

    renderer.render(scene, camera);
    updateStats(dt);

    if (firstFrame) {
      firstFrame = false;
      loading.classList.add('is-done');
      window.setTimeout(() => loading.remove(), 900);
      api.ready = true;
    }
  };

  setModeUi();
  updateHudHint();
  updatePrompt();
  statsEl.classList.toggle('is-active', statsVisible);
  requestAnimationFrame(animate);
  window.setTimeout(() => {
    if (loading.isConnected) {
      loading.classList.add('is-done');
      window.setTimeout(() => loading.remove(), 900);
    }
    api.ready = true;
  }, 1400);

  // Expose the loading completion for the capture script even if the first
  // frame is delayed by shader compile.
  window.setTimeout(() => {
    api.ready = true;
  }, 4000);
}
