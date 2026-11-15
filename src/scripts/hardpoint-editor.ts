/**
 * 三维舰船硬点设置器。
 *
 * 独立页面 /setup/ 使用，不参与游戏主循环。
 * 模型变换与 src/game/ship.ts 的 loadShipModel 保持一致：
 *   glTF 机首 +Z -> 绕 Y 旋转 180° -> 最长轴缩放到舰长 -> 包围盒居中。
 * 因此视口里的世界坐标就是 ships.ts 的 pos: [x, y, z]。
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EDITOR_SHIPS, type EditorShip } from './hardpoint-data';

type MarkerKind = 'weapon' | 'nozzle' | 'cockpit';
type EditorMode = MarkerKind | 'move';
type NozzleRole = 'main' | 'secondary' | 'retro';
type StatusTone = 'info' | 'warn' | 'bad';

interface Marker {
  uid: string;
  kind: MarkerKind;
  label: string;
  x: number;
  y: number;
  z: number;
}

interface MarkerVisual {
  mesh: THREE.Mesh;
  label: HTMLButtonElement;
  tag: HTMLSpanElement;
}

interface StoredMarker {
  kind: MarkerKind;
  label: string;
  x: number;
  y: number;
  z: number;
}

interface StoredPayload {
  version: number;
  markers: StoredMarker[];
}

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/+$/, '');
const STORAGE_PREFIX = 'yacht:hardpoints:v1:';
const LAST_SHIP_KEY = 'yacht:hardpoints:last';
const CLICK_SLOP_MOUSE = 5;
const CLICK_SLOP_TOUCH = 8;

const KIND_META: Record<MarkerKind, { label: string; color: string; prefix: string }> = {
  weapon: { label: '武器', color: '#ff5a62', prefix: 'W' },
  nozzle: { label: '喷口', color: '#5b9cff', prefix: 'N' },
  cockpit: { label: '驾驶舱', color: '#4ff0e0', prefix: 'C' },
};

const ROLE_LABEL: Record<NozzleRole, string> = {
  main: '主推',
  secondary: '副推',
  retro: '反推',
};

const ROLE_RANK: Record<NozzleRole, number> = {
  main: 0,
  secondary: 1,
  retro: 2,
};

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`[hardpoint] 缺少页面元素 #${id}`);
  return element as T;
}

function withBase(path: string): string {
  return `${BASE_PATH}/${path.replace(/^\/+/, '')}`;
}

function roundCoord(value: number): number {
  return Math.round(value * 10) / 10;
}

function fmt(value: number): string {
  const normalized = Math.abs(value) < 0.05 ? 0 : value;
  return normalized.toFixed(1);
}

function roundJson(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function roleOfNozzle(label: string): NozzleRole {
  const code = label.replace(/^N\d+/, '');
  if (code.includes('F')) return 'retro';
  if (code.includes('S')) return 'secondary';
  return 'main';
}

function nextTag(label: string): string | null {
  const match = label.match(/^([WNC])(\d+)(.*)$/);
  if (!match) return null;
  return `${match[1]}${Number(match[2]) + 1}${match[3]}`;
}

function quoteTag(label: string): string {
  return `'${label.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isMarkerKind(value: unknown): value is MarkerKind {
  return value === 'weapon' || value === 'nozzle' || value === 'cockpit';
}

function disposeObject(root: THREE.Object3D): void {
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    const record = object as unknown as {
      geometry?: THREE.BufferGeometry;
      material?: THREE.Material | THREE.Material[];
    };
    record.geometry?.dispose();
    if (!record.material) return;
    const list = Array.isArray(record.material) ? record.material : [record.material];
    for (const material of list) materials.add(material);
  });

  for (const material of materials) {
    for (const key of Object.keys(material)) {
      const value = (material as unknown as Record<string, unknown>)[key];
      if (value instanceof THREE.Texture) value.dispose();
    }
    material.dispose();
  }
}

export function initHardpointEditor(): void {
  const dom = {
    viewport: byId<HTMLDivElement>('hpViewport'),
    labels: byId<HTMLDivElement>('hpLabels'),
    stageInfo: byId<HTMLSpanElement>('hpStageInfo'),
    selected: byId<HTMLSpanElement>('hpSelected'),
    status: byId<HTMLParagraphElement>('hpStatus'),
    loading: byId<HTMLDivElement>('hpLoading'),
    loadingText: byId<HTMLParagraphElement>('hpLoadingText'),
    error: byId<HTMLDivElement>('hpError'),
    errorText: byId<HTMLParagraphElement>('hpErrorText'),
    retry: byId<HTMLButtonElement>('hpRetry'),
    shipTabs: byId<HTMLDivElement>('hpShips'),
    modes: byId<HTMLDivElement>('hpModes'),
    labelInput: byId<HTMLInputElement>('hpLabelInput'),
    roleHint: byId<HTMLParagraphElement>('hpRoleHint'),
    markerList: byId<HTMLDivElement>('hpMarkerList'),
    markerCount: byId<HTMLSpanElement>('hpMarkerCount'),
    exportText: byId<HTMLTextAreaElement>('hpExport'),
    copy: byId<HTMLButtonElement>('hpCopy'),
    download: byId<HTMLButtonElement>('hpDownload'),
    restore: byId<HTMLButtonElement>('hpRestore'),
    wireframe: byId<HTMLButtonElement>('hpWireframe'),
    hideHull: byId<HTMLButtonElement>('hpHideHull'),
  };

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
  } catch (error) {
    dom.loading.hidden = true;
    dom.error.hidden = false;
    dom.errorText.textContent = `WebGL 初始化失败：${error instanceof Error ? error.message : String(error)}`;
    dom.retry.onclick = () => window.location.reload();
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x060b10, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.domElement.className = 'hp-canvas';
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', '三维舰船硬点视口');
  dom.viewport.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060b10);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100_000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = true;
  controls.rotateSpeed = 0.8;
  controls.panSpeed = 1.0;
  controls.zoomSpeed = 1.1;

  const shipRoot = new THREE.Group();
  const markerGroup = new THREE.Group();
  scene.add(shipRoot, markerGroup);

  scene.add(new THREE.HemisphereLight(0xbfe7ff, 0x0b1218, 2.2));

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.6);
  keyLight.position.set(1.4, 2.0, -1.6);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x7fb8ff, 1.2);
  fillLight.position.set(-1.7, -0.4, 1.4);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xc9a55c, 0.7);
  rimLight.position.set(0.5, -1.0, 2.2);
  scene.add(rimLight);

  scene.add(new THREE.AmbientLight(0xffffff, 0.25));

  let currentShip: EditorShip = EDITOR_SHIPS[0];
  let activeShipId: string | null = null;
  let markers: Marker[] = [];
  let selectedUid: string | null = null;
  let mode: EditorMode = 'weapon';
  let nextUid = 1;
  let wireframeOn = false;
  let hullVisible = true;
  let modelLoading = false;
  let loadToken = 0;
  let viewWidth = 1;
  let viewHeight = 1;
  let markerGeometry: THREE.SphereGeometry | null = null;
  let modelMeshes: THREE.Mesh[] = [];
  let modelMaterials: THREE.Material[] = [];
  let grid: THREE.GridHelper | null = null;
  let axes: THREE.AxesHelper | null = null;
  let pointerStart: { x: number; y: number; pointerId: number } | null = null;
  let storageWarned = false;

  const markerVisuals = new Map<string, MarkerVisual>();
  const markerRows = new Map<string, HTMLDivElement>();

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const tmpPoint = new THREE.Vector3();
  const tmpProjected = new THREE.Vector3();
  const cameraDirection = new THREE.Vector3();

  function setStatus(text: string, tone: StatusTone = 'info'): void {
    dom.status.textContent = text;
    dom.status.dataset.tone = tone;
  }

  function setLoading(visible: boolean, text?: string): void {
    if (text) dom.loadingText.textContent = text;
    dom.loading.hidden = !visible;
  }

  function setError(message: string | null): void {
    dom.error.hidden = message === null;
    if (message) dom.errorText.textContent = message;
  }

  function findMarker(uid: string | null): Marker | null {
    if (!uid) return null;
    return markers.find((marker) => marker.uid === uid) ?? null;
  }

  function makeMarker(kind: MarkerKind, label: string, x: number, y: number, z: number): Marker {
    return { uid: `hp-${nextUid++}`, kind, label, x, y, z };
  }

  function seedMarkers(ship: EditorShip): Marker[] {
    const result: Marker[] = [];
    for (const [label, x, y, z] of ship.weapons) {
      result.push(makeMarker('weapon', label, x, y, z));
    }
    for (const [label, x, y, z] of ship.nozzles) {
      result.push(makeMarker('nozzle', label, x, y, z));
    }
    ship.cockpits.forEach(([x, y, z], index) => {
      result.push(makeMarker('cockpit', `C${index + 1}`, x, y, z));
    });
    return result;
  }

  function storageKey(shipId: string): string {
    return `${STORAGE_PREFIX}${shipId}`;
  }

  function readStoredMarkers(ship: EditorShip): Marker[] {
    try {
      const raw = localStorage.getItem(storageKey(ship.id));
      if (!raw) return seedMarkers(ship);

      const parsed: unknown = JSON.parse(raw);
      if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.markers)) {
        return seedMarkers(ship);
      }

      const result: Marker[] = [];
      for (const entry of parsed.markers) {
        if (!isRecord(entry)) continue;
        if (!isMarkerKind(entry.kind)) continue;
        if (typeof entry.label !== 'string') continue;
        const x = Number(entry.x);
        const y = Number(entry.y);
        const z = Number(entry.z);
        if (![x, y, z].every(Number.isFinite)) continue;
        result.push(makeMarker(entry.kind, entry.label, x, y, z));
      }
      return result;
    } catch {
      return seedMarkers(ship);
    }
  }

  function persistMarkers(): void {
    if (!activeShipId) return;
    const payload: StoredPayload = {
      version: 1,
      markers: markers.map((marker) => ({
        kind: marker.kind,
        label: marker.label,
        x: marker.x,
        y: marker.y,
        z: marker.z,
      })),
    };
    try {
      localStorage.setItem(storageKey(activeShipId), JSON.stringify(payload));
    } catch {
      if (!storageWarned) {
        storageWarned = true;
        setStatus('浏览器阻止了本地存储，刷新后修改可能丢失。', 'warn');
      }
    }
  }

  function saveLastShip(shipId: string): void {
    try {
      localStorage.setItem(LAST_SHIP_KEY, shipId);
    } catch {
      /* 忽略 */
    }
  }

  function initialShip(): EditorShip {
    try {
      const id = localStorage.getItem(LAST_SHIP_KEY);
      const found = EDITOR_SHIPS.find((ship) => ship.id === id);
      if (found) return found;
    } catch {
      /* 忽略 */
    }
    return EDITOR_SHIPS[0];
  }

  function suggestNextLabel(kind: MarkerKind): string {
    const prefix = KIND_META[kind].prefix;
    let maximum = 0;
    for (const marker of markers) {
      if (marker.kind !== kind) continue;
      if (!marker.label.startsWith(prefix)) continue;
      const match = marker.label.slice(prefix.length).match(/^(\d+)/);
      if (match) maximum = Math.max(maximum, Number(match[1]));
    }
    return `${prefix}${maximum + 1}`;
  }

  function sortMarkers(list: Marker[], kind: MarkerKind): Marker[] {
    return [...list].sort((a, b) => {
      if (kind === 'nozzle') {
        const difference = ROLE_RANK[roleOfNozzle(a.label)] - ROLE_RANK[roleOfNozzle(b.label)];
        if (difference !== 0) return difference;
      }
      return collator.compare(a.label, b.label);
    });
  }

  function buildExportText(all: Marker[]): string {
    const cockpits = sortMarkers(all.filter((marker) => marker.kind === 'cockpit'), 'cockpit');
    const nozzles = sortMarkers(all.filter((marker) => marker.kind === 'nozzle'), 'nozzle');
    const weapons = sortMarkers(all.filter((marker) => marker.kind === 'weapon'), 'weapon');

    const cockpitText = cockpits
      .map((marker) => `[${fmt(marker.x)}, ${fmt(marker.y)}, ${fmt(marker.z)}]`)
      .join(', ');

    const lines: string[] = [`cockpits: [${cockpitText}],`];

    if (nozzles.length === 0) {
      lines.push('nozzles: [],');
    } else {
      lines.push('nozzles: [');
      for (const marker of nozzles) {
        lines.push(`  [${quoteTag(marker.label)}, ${fmt(marker.x)}, ${fmt(marker.y)}, ${fmt(marker.z)}],`);
      }
      lines.push('],');
    }

    if (weapons.length === 0) {
      lines.push('weapons: [],');
    } else {
      lines.push('weapons: [');
      for (const marker of weapons) {
        lines.push(`  [${quoteTag(marker.label)}, ${fmt(marker.x)}, ${fmt(marker.y)}, ${fmt(marker.z)}],`);
      }
      lines.push('],');
    }

    return lines.join('\n');
  }

  function buildJsonPayload(ship: EditorShip, all: Marker[]): Record<string, unknown> {
    const cockpits = sortMarkers(all.filter((marker) => marker.kind === 'cockpit'), 'cockpit');
    const nozzles = sortMarkers(all.filter((marker) => marker.kind === 'nozzle'), 'nozzle');
    const weapons = sortMarkers(all.filter((marker) => marker.kind === 'weapon'), 'weapon');

    return {
      id: ship.id,
      name: ship.name,
      code: ship.code,
      model: ship.model,
      length: ship.length,
      cockpits: cockpits.map((marker) => [roundJson(marker.x), roundJson(marker.y), roundJson(marker.z)]),
      nozzles: nozzles.map((marker) => ({
        id: marker.label,
        pos: [roundJson(marker.x), roundJson(marker.y), roundJson(marker.z)],
        role: roleOfNozzle(marker.label),
      })),
      weapons: weapons.map((marker) => ({
        id: marker.label,
        pos: [roundJson(marker.x), roundJson(marker.y), roundJson(marker.z)],
      })),
    };
  }

  function updateExport(): void {
    dom.exportText.value = buildExportText(markers);
  }

  function updateCounts(): void {
    dom.markerCount.textContent = String(markers.length);
    dom.stageInfo.textContent = `${currentShip.code} · ${currentShip.role} · ${currentShip.length} m · ${markers.length} 标记`;
  }

  function updateSelectedReadout(): void {
    const marker = findMarker(selectedUid);
    if (!marker) {
      dom.selected.textContent = '未选中标记';
      return;
    }
    dom.selected.textContent = `选中 ${marker.label} · (${fmt(marker.x)}, ${fmt(marker.y)}, ${fmt(marker.z)})`;
  }

  function updateRoleHint(): void {
    if (mode === 'move') {
      dom.roleHint.textContent = selectedUid
        ? '移动模式：点击舰体表面放置选中标记。'
        : '移动模式：先点击标记球，再点击舰体表面。';
      return;
    }
    if (mode === 'weapon') {
      dom.roleHint.textContent = '武器标签原样保留并导出，例如 W1su-、W3ca+++Auto。';
      return;
    }
    if (mode === 'cockpit') {
      dom.roleHint.textContent = '驾驶舱标签只用于列表排序，导出时只保留坐标。';
      return;
    }
    const role = roleOfNozzle(dom.labelInput.value.trim() || 'N1');
    dom.roleHint.textContent = `喷口 role：${ROLE_LABEL[role]}（${role}）· 含 F=反推，含 S=副推。`;
  }

  function updateModeButtons(): void {
    dom.modes.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => {
      const active = button.dataset.mode === mode;
      button.classList.toggle('is-on', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function updateShipTabs(): void {
    dom.shipTabs.querySelectorAll<HTMLButtonElement>('[data-ship]').forEach((button) => {
      const active = button.dataset.ship === currentShip.id;
      button.classList.toggle('is-on', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function setMode(next: EditorMode, announce = true): void {
    mode = next;
    updateModeButtons();
    dom.labelInput.disabled = next === 'move';
    if (next !== 'move') {
      dom.labelInput.value = suggestNextLabel(next);
    }
    updateRoleHint();
    if (announce) {
      if (next === 'move') {
        setStatus(
          selectedUid ? '移动模式：点击舰体表面移动选中标记。' : '移动模式：先点击一个标记，再点击舰体表面。',
          'info',
        );
      } else {
        setStatus(`已切换到${KIND_META[next].label}模式。`, 'info');
      }
    }
  }

  function clearMarkerVisuals(): void {
    for (const visual of markerVisuals.values()) {
      const material = visual.mesh.material as THREE.Material;
      material.dispose();
      markerGroup.remove(visual.mesh);
      visual.label.remove();
    }
    markerVisuals.clear();
  }

  function markerRadius(): number {
    return Math.max(0.14, currentShip.length * 0.0065);
  }

  function updateSelectionVisuals(): void {
    for (const [uid, visual] of markerVisuals) {
      const selected = uid === selectedUid;
      visual.mesh.scale.setScalar(selected ? 1.45 : 1);
      visual.mesh.renderOrder = selected ? 9 : 6;
      const material = visual.mesh.material as THREE.MeshBasicMaterial;
      material.depthTest = !selected;
      material.opacity = selected ? 1 : 0.94;
      visual.label.classList.toggle('is-selected', selected);
      visual.label.style.zIndex = selected ? '2' : '1';
    }

    for (const [uid, row] of markerRows) {
      row.classList.toggle('is-selected', uid === selectedUid);
    }
  }

  function updateMarkerTag(marker: Marker): void {
    const visual = markerVisuals.get(marker.uid);
    if (!visual) return;
    visual.tag.textContent = marker.label;
    visual.label.title = `${KIND_META[marker.kind].label} · ${marker.label}`;
  }

  function syncMarkerMesh(marker: Marker): void {
    const visual = markerVisuals.get(marker.uid);
    if (!visual) return;
    visual.mesh.position.set(marker.x, marker.y, marker.z);
  }

  function rebuildMarkerScene(): void {
    clearMarkerVisuals();
    if (!markerGeometry) {
      markerGeometry = new THREE.SphereGeometry(markerRadius(), 18, 12);
    }

    for (const marker of markers) {
      const meta = KIND_META[marker.kind];
      const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color(meta.color),
        transparent: true,
        opacity: 0.94,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(markerGeometry, material);
      mesh.position.set(marker.x, marker.y, marker.z);
      mesh.renderOrder = 6;
      mesh.userData.uid = marker.uid;
      markerGroup.add(mesh);

      const label = document.createElement('button');
      label.type = 'button';
      label.className = 'hp-label';
      label.dataset.kind = marker.kind;
      label.style.setProperty('--marker-color', meta.color);
      label.style.display = 'none';
      label.title = `${meta.label} · ${marker.label}`;

      const dot = document.createElement('span');
      dot.className = 'hp-label-dot';
      dot.setAttribute('aria-hidden', 'true');

      const tag = document.createElement('span');
      tag.className = 'hp-label-tag';
      tag.textContent = marker.label;

      label.append(dot, tag);
      label.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        selectMarker(marker.uid, true);
      });
      dom.labels.append(label);

      markerVisuals.set(marker.uid, { mesh, label, tag });
    }

    updateSelectionVisuals();
  }

  function syncRowCoords(marker: Marker): void {
    const row = markerRows.get(marker.uid);
    if (!row) return;
    for (const axis of ['x', 'y', 'z'] as const) {
      const input = row.querySelector<HTMLInputElement>(`input[data-axis="${axis}"]`);
      if (input && document.activeElement !== input) {
        input.value = fmt(marker[axis]);
      }
    }
  }

  function updateRowType(marker: Marker): void {
    const row = markerRows.get(marker.uid);
    if (!row) return;
    const type = row.querySelector<HTMLSpanElement>('.hp-type');
    if (!type) return;
    type.textContent =
      marker.kind === 'nozzle'
        ? `喷口·${ROLE_LABEL[roleOfNozzle(marker.label)]}`
        : KIND_META[marker.kind].label;
  }

  function updateRowLabel(marker: Marker): void {
    updateMarkerTag(marker);
    updateRowType(marker);
    updateExport();
    updateSelectedReadout();
    persistMarkers();
  }

  function createMarkerRow(marker: Marker): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'hp-row';
    row.dataset.uid = marker.uid;
    row.classList.toggle('is-selected', marker.uid === selectedUid);

    const top = document.createElement('div');
    top.className = 'hp-row-top';

    const type = document.createElement('span');
    type.className = `hp-type hp-type-${marker.kind}`;
    type.textContent =
      marker.kind === 'nozzle'
        ? `喷口·${ROLE_LABEL[roleOfNozzle(marker.label)]}`
        : KIND_META[marker.kind].label;

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'hp-row-label';
    labelInput.value = marker.label;
    labelInput.spellcheck = false;
    labelInput.autocomplete = 'off';
    labelInput.setAttribute('aria-label', '标记标签');
    labelInput.addEventListener('input', () => {
      marker.label = labelInput.value;
      updateRowLabel(marker);
    });
    labelInput.addEventListener('blur', () => {
      const trimmed = labelInput.value.trim();
      if (!trimmed) {
        labelInput.value = suggestNextLabel(marker.kind);
        marker.label = labelInput.value;
      } else if (trimmed !== labelInput.value) {
        labelInput.value = trimmed;
        marker.label = trimmed;
      }
      updateRowLabel(marker);
      updateRoleHint();
    });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'hp-del';
    remove.title = '删除标记';
    remove.setAttribute('aria-label', `删除 ${marker.label}`);
    remove.textContent = '×';
    remove.addEventListener('pointerdown', (event) => event.stopPropagation());
    remove.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      deleteMarker(marker.uid);
    });

    top.append(type, labelInput, remove);

    const coords = document.createElement('div');
    coords.className = 'hp-coords';

    for (const axis of ['x', 'y', 'z'] as const) {
      const wrap = document.createElement('label');
      wrap.className = 'hp-coord';

      const prefix = document.createElement('span');
      prefix.textContent = axis.toUpperCase();

      const input = document.createElement('input');
      input.type = 'number';
      input.step = '0.1';
      input.value = fmt(marker[axis]);
      input.dataset.axis = axis;
      input.setAttribute('aria-label', `${axis.toUpperCase()} 坐标`);
      input.addEventListener('input', () => {
        const value = input.valueAsNumber;
        if (!Number.isFinite(value)) return;
        marker[axis] = value;
        syncMarkerMesh(marker);
        updateExport();
        updateSelectedReadout();
        persistMarkers();
      });

      wrap.append(prefix, input);
      coords.append(wrap);
    }

    row.addEventListener('pointerdown', (event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.hp-del')) return;
      selectMarker(marker.uid, true);
    });
    row.addEventListener('focusin', () => {
      if (selectedUid !== marker.uid) selectMarker(marker.uid, true);
    });

    row.append(top, coords);
    return row;
  }

  function renderList(): void {
    dom.markerList.replaceChildren();
    markerRows.clear();
    const kinds: MarkerKind[] = ['weapon', 'nozzle', 'cockpit'];

    for (const kind of kinds) {
      const items = sortMarkers(
        markers.filter((marker) => marker.kind === kind),
        kind,
      );

      const header = document.createElement('div');
      header.className = 'hp-group';
      header.textContent = `${KIND_META[kind].label} · ${items.length}`;
      dom.markerList.append(header);

      for (const marker of items) {
        const row = createMarkerRow(marker);
        markerRows.set(marker.uid, row);
        dom.markerList.append(row);
      }
    }

    updateCounts();
    updateSelectionVisuals();
  }

  function selectMarker(uid: string | null, enterMoveMode = false): void {
    selectedUid = uid;
    if (uid && enterMoveMode && mode !== 'move') {
      setMode('move', false);
    }
    updateSelectionVisuals();
    updateSelectedReadout();

    const marker = findMarker(uid);
    if (marker) {
      setStatus(
        `已选中 ${marker.label} · (${fmt(marker.x)}, ${fmt(marker.y)}, ${fmt(marker.z)})`,
        'info',
      );
      markerRows.get(marker.uid)?.scrollIntoView({ block: 'nearest' });
    }
  }

  function addMarker(kind: MarkerKind, label: string, point: THREE.Vector3): void {
    const marker = makeMarker(
      kind,
      label,
      roundCoord(point.x),
      roundCoord(point.y),
      roundCoord(point.z),
    );
    markers.push(marker);
    selectedUid = marker.uid;
    rebuildMarkerScene();
    renderList();
    updateExport();
    updateSelectedReadout();
    updateCounts();
    persistMarkers();

    dom.labelInput.value = nextTag(label) ?? suggestNextLabel(kind);
    updateRoleHint();
    setStatus(
      `已添加 ${label} · (${fmt(marker.x)}, ${fmt(marker.y)}, ${fmt(marker.z)})`,
      'info',
    );
    markerRows.get(marker.uid)?.scrollIntoView({ block: 'nearest' });
  }

  function moveMarker(marker: Marker, point: THREE.Vector3): void {
    marker.x = roundCoord(point.x);
    marker.y = roundCoord(point.y);
    marker.z = roundCoord(point.z);
    syncMarkerMesh(marker);
    syncRowCoords(marker);
    updateExport();
    updateSelectedReadout();
    persistMarkers();
    setStatus(
      `已移动 ${marker.label} 到 (${fmt(marker.x)}, ${fmt(marker.y)}, ${fmt(marker.z)})`,
      'info',
    );
  }

  function deleteMarker(uid: string): void {
    const index = markers.findIndex((marker) => marker.uid === uid);
    if (index === -1) return;
    const [removed] = markers.splice(index, 1);
    if (selectedUid === uid) selectedUid = null;
    rebuildMarkerScene();
    renderList();
    updateExport();
    updateSelectedReadout();
    persistMarkers();
    if (removed) setStatus(`已删除 ${removed.label}`, 'info');
  }

  function applyCamera(length: number): void {
    camera.near = Math.max(0.05, length * 0.001);
    camera.far = Math.max(500, length * 24);
    camera.position.set(length * 0.88, length * 0.5, -length * 1.25);
    camera.updateProjectionMatrix();

    controls.target.set(0, 0, 0);
    controls.minDistance = Math.max(0.5, length * 0.08);
    controls.maxDistance = Math.max(10, length * 8);
    controls.update();
  }

  function clearGridAndAxes(): void {
    if (grid) {
      scene.remove(grid);
      disposeObject(grid);
      grid = null;
    }
    if (axes) {
      scene.remove(axes);
      disposeObject(axes);
      axes = null;
    }
  }

  function rebuildHelpers(length: number, bottomY: number): void {
    clearGridAndAxes();

    grid = new THREE.GridHelper(length * 2.4, 24, 0x35657a, 0x1b2f3a);
    const gridMaterial = grid.material as THREE.LineBasicMaterial;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.45;
    gridMaterial.depthWrite = false;
    grid.position.y = bottomY;
    scene.add(grid);

    axes = new THREE.AxesHelper(length * 0.45);
    axes.traverse((object) => {
      if (!(object instanceof THREE.LineSegments)) return;
      const material = object.material as THREE.LineBasicMaterial;
      material.depthTest = false;
      material.transparent = true;
      material.opacity = 0.9;
    });
    axes.renderOrder = 4;
    scene.add(axes);
  }

  function clearShipModel(): void {
    for (const child of [...shipRoot.children]) {
      shipRoot.remove(child);
      disposeObject(child);
    }
    modelMeshes = [];
    modelMaterials = [];
  }

  function tuneMaterial(material: THREE.Material): void {
    if (material instanceof THREE.MeshStandardMaterial) {
      // 候选舰存在镜像/单面面板；双面渲染避免从一侧看整块消失
      material.side = THREE.DoubleSide;
      material.metalness = Math.min(material.metalness, 0.55);
      material.roughness = Math.max(material.roughness, 0.35);
      material.emissiveIntensity = Math.min(material.emissiveIntensity, 0.75);
      material.envMapIntensity = 1.1;
    }
    material.needsUpdate = true;
  }

  function applyWireframe(on: boolean): void {
    wireframeOn = on;
    for (const material of modelMaterials) {
      if ('wireframe' in material) {
        (material as THREE.MeshStandardMaterial).wireframe = on;
      }
      material.needsUpdate = true;
    }
    dom.wireframe.classList.toggle('is-on', on);
    dom.wireframe.setAttribute('aria-pressed', String(on));
  }

  async function loadModel(ship: EditorShip): Promise<void> {
    const token = ++loadToken;
    modelLoading = true;
    setError(null);
    setLoading(true, `正在加载 ${ship.model}…`);
    clearShipModel();

    try {
      const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
        import('three/examples/jsm/loaders/GLTFLoader.js'),
        import('three/examples/jsm/libs/meshopt_decoder.module.js'),
      ]);
      await MeshoptDecoder.ready;
      if (token !== loadToken) return;

      const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
      const modelUrl = withBase(`models/${ship.model}`);
      const gltf = await loader.loadAsync(`${modelUrl}?v=20261116c`);
      if (token !== loadToken) {
        disposeObject(gltf.scene);
        return;
      }

      const model = gltf.scene;
      // 与 src/game/ship.ts 完全相同的朝向、缩放与居中流程。
      model.rotation.set(0, Math.PI, 0);
      model.scale.setScalar(1);
      model.updateMatrixWorld(true);

      const rawBox = new THREE.Box3().setFromObject(model);
      const rawSize = rawBox.getSize(new THREE.Vector3());
      // 舰长轴是 Z；max(x,y,z) 会把宽翼展舰按翼展缩放
      const rawLength = rawSize.z;
      if (!Number.isFinite(rawLength) || rawLength <= 0) {
        throw new Error('无法测量模型长度轴');
      }

      model.scale.setScalar(ship.length / rawLength);
      model.updateMatrixWorld(true);

      const materials = new Set<THREE.Material>();
      model.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        modelMeshes.push(object);
        const list = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of list) {
          tuneMaterial(material);
          materials.add(material);
        }
      });

      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      model.position.sub(center);
      model.updateMatrixWorld(true);

      shipRoot.add(model);
      shipRoot.visible = hullVisible;
      modelMaterials = [...materials];
      applyWireframe(wireframeOn);
      rebuildHelpers(ship.length, -size.y / 2 - ship.length * 0.006);

      modelLoading = false;
      setLoading(false);
      setStatus(`已加载 ${ship.model} · 全长 ${ship.length} m`, 'info');
    } catch (error) {
      if (token !== loadToken) return;
      modelLoading = false;
      clearShipModel();
      setLoading(false);
      const message = error instanceof Error ? error.message : String(error);
      setError(`无法加载 ${ship.model}：${message}`);
      setStatus(`模型加载失败：${ship.model}`, 'bad');
    }
  }

  function activateShip(ship: EditorShip): void {
    if (activeShipId === ship.id) return;
    if (activeShipId) persistMarkers();

    activeShipId = ship.id;
    currentShip = ship;
    saveLastShip(ship.id);
    updateShipTabs();

    markers = readStoredMarkers(ship);
    selectedUid = null;
    markerGeometry?.dispose();
    markerGeometry = null;
    rebuildMarkerScene();
    renderList();
    updateExport();
    updateSelectedReadout();
    updateModeButtons();
    if (mode !== 'move') {
      dom.labelInput.value = suggestNextLabel(mode);
    }
    updateRoleHint();

    applyCamera(ship.length);
    rebuildHelpers(ship.length, -ship.length * 0.06);
    void loadModel(ship);
  }

  function resizeViewport(): void {
    const width = dom.viewport.clientWidth;
    const height = dom.viewport.clientHeight;
    if (width <= 0 || height <= 0) return;
    viewWidth = width;
    viewHeight = height;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function updateLabels(): void {
    camera.updateMatrixWorld();
    camera.getWorldDirection(cameraDirection);

    for (const marker of markers) {
      const visual = markerVisuals.get(marker.uid);
      if (!visual) continue;

      tmpPoint.set(marker.x, marker.y, marker.z);
      const inFront = tmpPoint.clone().sub(camera.position).dot(cameraDirection) > 0;
      if (!inFront) {
        visual.label.style.display = 'none';
        continue;
      }

      tmpProjected.copy(tmpPoint).project(camera);
      const x = (tmpProjected.x * 0.5 + 0.5) * viewWidth;
      const y = (-tmpProjected.y * 0.5 + 0.5) * viewHeight;

      if (x < -120 || x > viewWidth + 120 || y < -80 || y > viewHeight + 80) {
        visual.label.style.display = 'none';
        continue;
      }

      visual.label.style.display = '';
      visual.label.style.transform = `translate3d(${x}px, ${y - 9}px, 0) translate(-50%, -100%)`;
    }
  }

  function viewportClick(clientX: number, clientY: number): void {
    const rect = renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    pointerNdc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    camera.updateMatrixWorld();
    shipRoot.updateMatrixWorld(true);
    markerGroup.updateMatrixWorld(true);
    raycaster.setFromCamera(pointerNdc, camera);

    const markerMeshes = [...markerVisuals.values()].map((visual) => visual.mesh);
    const markerHits = raycaster.intersectObjects(markerMeshes, false);
    if (markerHits.length > 0) {
      const uid = markerHits[0].object.userData.uid as string | undefined;
      if (uid) {
        selectMarker(uid, true);
        return;
      }
    }

    if (!hullVisible) {
      setStatus('舰体已隐藏。先点“显示舰体”再取表面点。', 'warn');
      return;
    }

    if (modelMeshes.length === 0) {
      setStatus(modelLoading ? '模型还在加载，请稍候…' : '模型尚未加载，无法取表面点。', 'warn');
      return;
    }

    const hits = raycaster.intersectObjects(modelMeshes, true);
    if (hits.length === 0) {
      setStatus('没有命中舰体表面，换个位置试试。', 'warn');
      return;
    }

    const localPoint = shipRoot.worldToLocal(hits[0].point.clone());

    if (mode === 'move') {
      const marker = findMarker(selectedUid);
      if (!marker) {
        setStatus('移动模式：先点击一个标记球，或在右侧列表里选中标记。', 'warn');
        return;
      }
      moveMarker(marker, localPoint);
      return;
    }

    const label = dom.labelInput.value.trim();
    if (!label) {
      setStatus('请先在右侧填写标签，例如 W1su- / N1S / C1。', 'warn');
      dom.labelInput.focus();
      return;
    }
    if (markers.some((marker) => marker.kind === mode && marker.label === label)) {
      setStatus(`标签 ${label} 已存在，请换一个编号。`, 'warn');
      dom.labelInput.select();
      return;
    }

    addMarker(mode, label, localPoint);
  }

  function updateHullToggle(): void {
    shipRoot.visible = hullVisible;
    dom.hideHull.classList.toggle('is-on', !hullVisible);
    dom.hideHull.setAttribute('aria-pressed', String(!hullVisible));
    dom.hideHull.textContent = hullVisible ? '隐藏舰体' : '显示舰体';
  }

  async function copyText(text: string): Promise<boolean> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      /* 回退到 execCommand */
    }
    try {
      dom.exportText.focus();
      dom.exportText.select();
      return document.execCommand('copy');
    } catch {
      return false;
    }
  }

  /* ── 界面事件 ───────────────────────────── */

  dom.shipTabs.querySelectorAll<HTMLButtonElement>('[data-ship]').forEach((button) => {
    button.addEventListener('click', () => {
      const ship = EDITOR_SHIPS.find((item) => item.id === button.dataset.ship);
      if (ship) activateShip(ship);
    });
  });

  dom.modes.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      const next = button.dataset.mode as EditorMode | undefined;
      if (next) setMode(next);
    });
  });

  dom.labelInput.addEventListener('input', updateRoleHint);

  dom.wireframe.addEventListener('click', () => {
    applyWireframe(!wireframeOn);
    setStatus(wireframeOn ? '线框显示已开启。' : '线框显示已关闭。', 'info');
  });

  dom.hideHull.addEventListener('click', () => {
    hullVisible = !hullVisible;
    updateHullToggle();
    setStatus(hullVisible ? '舰体已显示。' : '舰体已隐藏，标记与标签仍可见。', 'info');
  });

  dom.restore.addEventListener('click', () => {
    if (!window.confirm(`恢复 ${currentShip.code} 的 ships.ts 初始硬点？当前修改会被覆盖。`)) return;
    markers = seedMarkers(currentShip);
    selectedUid = null;
    rebuildMarkerScene();
    renderList();
    updateExport();
    updateSelectedReadout();
    persistMarkers();
    if (mode !== 'move') dom.labelInput.value = suggestNextLabel(mode);
    updateRoleHint();
    setStatus(`已恢复 ${currentShip.code} 的 ships.ts 数据。`, 'info');
  });

  dom.copy.addEventListener('click', () => {
    void copyText(dom.exportText.value).then((ok) => {
      setStatus(ok ? '导出文本已复制。' : '复制失败，请手动选中文本框复制。', ok ? 'info' : 'bad');
    });
  });

  dom.download.addEventListener('click', () => {
    const payload = buildJsonPayload(currentShip, markers);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${currentShip.id}-hardpoints.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus('JSON 已下载。', 'info');
  });

  dom.retry.addEventListener('click', () => {
    void loadModel(currentShip);
  });

  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    pointerStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
  });

  canvas.addEventListener('pointerup', (event) => {
    if (!pointerStart || event.button !== 0 || pointerStart.pointerId !== event.pointerId) {
      pointerStart = null;
      return;
    }
    const distance = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
    pointerStart = null;
    const slop = event.pointerType === 'touch' ? CLICK_SLOP_TOUCH : CLICK_SLOP_MOUSE;
    if (distance > slop) return;
    viewportClick(event.clientX, event.clientY);
  });

  canvas.addEventListener('pointercancel', () => {
    pointerStart = null;
  });

  canvas.addEventListener('pointerleave', () => {
    pointerStart = null;
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
      active.blur();
      return;
    }
    if (selectedUid) {
      selectedUid = null;
      updateSelectionVisuals();
      updateSelectedReadout();
      setStatus('已取消选中。', 'info');
    }
  });

  new ResizeObserver(resizeViewport).observe(dom.viewport);
  window.addEventListener('resize', resizeViewport);

  function frame(): void {
    controls.update();
    updateLabels();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  resizeViewport();
  updateHullToggle();
  updateModeButtons();
  const firstShip = initialShip();
  currentShip = firstShip;
  activateShip(firstShip);
  requestAnimationFrame(frame);
}
