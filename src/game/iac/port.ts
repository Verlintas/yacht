import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Collider } from './player';

export interface NpcVisual {
  id: string;
  name: string;
  role: string;
  group: THREE.Group;
  baseYaw: number;
  baseY: number;
  phase: number;
  position: THREE.Vector3;
}

export interface PortWorld {
  root: THREE.Group;
  ground: THREE.Object3D;
  staticPort: THREE.Object3D;
  ship: THREE.Object3D;
  asphalt: THREE.Material | null;
  metal: THREE.Material | null;
  colliders: Collider[];
  npcs: NpcVisual[];
  npcBlobs: THREE.InstancedMesh;
  ramp: THREE.Group;
  shipEntry: THREE.Vector3;
}

const PAD_Z = -420;
// The authored city-hero deck surface is 0.2 m above the GLB origin. The
// Ground node's bounding box also includes 10.5 m lamp heads, so it cannot be
// used to align the root.
const PORT_DECK_TOP = 0.2;

function makeCanvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function makeShadowTexture(): THREE.CanvasTexture {
  return makeCanvasTexture(128, 128, (ctx) => {
    const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    gradient.addColorStop(0, 'rgba(0,0,0,0.72)');
    gradient.addColorStop(0.45, 'rgba(0,0,0,0.32)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
  });
}

function makeRampSign(): THREE.Mesh {
  const texture = makeCanvasTexture(384, 160, (ctx) => {
    ctx.fillStyle = '#0c1114';
    ctx.fillRect(0, 0, 384, 160);
    ctx.strokeStyle = '#c8a15f';
    ctx.lineWidth = 5;
    ctx.strokeRect(4, 4, 376, 152);
    ctx.fillStyle = '#e7d3aa';
    ctx.font = '600 46px "Avenir Next Condensed", sans-serif';
    ctx.fillText('A-30 // 雷霆', 26, 68);
    ctx.fillStyle = '#8fb9be';
    ctx.font = '500 22px ui-monospace, monospace';
    ctx.fillText('BOARDING RAMP · 登舰舷梯', 26, 112);
    ctx.fillStyle = '#c8a15f';
    ctx.fillRect(26, 126, 332, 3);
  });
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.62,
    metalness: 0.2,
    emissive: new THREE.Color(0x101010),
    emissiveIntensity: 0.3,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.92), material);
  mesh.name = 'RampSign';
  return mesh;
}

function makeShopSign(): THREE.Mesh {
  const texture = makeCanvasTexture(512, 160, (ctx) => {
    ctx.fillStyle = '#0a1113';
    ctx.fillRect(0, 0, 512, 160);
    ctx.strokeStyle = '#d5ad72';
    ctx.lineWidth = 5;
    ctx.strokeRect(4, 4, 504, 152);
    ctx.fillStyle = '#f1e5cc';
    ctx.font = '600 38px "Avenir Next Condensed", sans-serif';
    ctx.fillText('GUILD ROW OUTFITTER', 24, 66);
    ctx.fillStyle = '#8ac9c7';
    ctx.font = '500 21px ui-monospace, monospace';
    ctx.fillText('公会街补给 · TRADER 索恩·哈珀', 24, 108);
    ctx.fillStyle = '#d5ad72';
    ctx.fillRect(24, 126, 464, 3);
  });
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    emissive: new THREE.Color(0xffffff),
    emissiveMap: texture,
    emissiveIntensity: 0.9,
    roughness: 0.55,
    metalness: 0.15,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), material);
  mesh.name = 'ShopSign';
  mesh.position.set(-108, 42.98, -9.55);
  return mesh;
}

function makeT2Sign(): THREE.Mesh {
  const texture = makeCanvasTexture(1024, 192, (ctx) => {
    ctx.fillStyle = '#181412';
    ctx.fillRect(0, 0, 1024, 192);
    ctx.strokeStyle = '#c8a15f';
    ctx.lineWidth = 6;
    ctx.strokeRect(5, 5, 1014, 182);
    ctx.fillStyle = '#f1e7d2';
    ctx.font = '600 62px "Avenir Next Condensed", sans-serif';
    ctx.fillText('T2 // ARRIVALS', 38, 86);
    ctx.fillStyle = '#8ac9c7';
    ctx.font = '500 30px ui-monospace, monospace';
    ctx.fillText('ANVIL LANDING · 砧炉着陆场', 40, 142);
    ctx.fillStyle = '#c8a15f';
    ctx.fillRect(40, 158, 944, 3);
  });
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    emissive: new THREE.Color(0xffffff),
    emissiveMap: texture,
    emissiveIntensity: 0.85,
    roughness: 0.55,
    metalness: 0.15,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(14.4, 2.7), material);
  mesh.name = 'T2SignOverlay';
  mesh.position.set(-145, 54.0, 94.2);
  return mesh;
}

function buildRamp(shipY: number, metal: THREE.Material | null): THREE.Group {
  const group = new THREE.Group();
  group.name = 'A30Ramp';
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(2.8, 0.14, 8.4),
    metal ?? new THREE.MeshStandardMaterial({ color: 0x3c4348, roughness: 0.5, metalness: 0.75 }),
  );
  deck.position.set(0, shipY + 0.55, 17.5);
  deck.rotation.x = Math.atan2(1.15, 8.4);
  deck.castShadow = true;
  deck.receiveShadow = true;
  group.add(deck);

  const railMat = new THREE.MeshStandardMaterial({ color: 0x8a6f45, roughness: 0.42, metalness: 0.72 });
  // Merge the rails + eight posts into one mesh: the ramp is a small prop, but
  // ten extra draw calls would be a large share of the slice budget.
  const railParts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const railGeo = new THREE.BoxGeometry(0.1, 0.85, 7.9);
    railGeo.rotateX(deck.rotation.x);
    railGeo.translate(side * 1.38, shipY + 0.9, 17.5);
    railParts.push(railGeo);
    for (let i = 0; i < 4; i += 1) {
      const postGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.85, 6);
      postGeo.translate(side * 1.38, shipY + 0.72 + (i % 2 === 0 ? 0.1 : 0), 14.4 + i * 2.05);
      railParts.push(postGeo);
    }
  }
  const railMesh = new THREE.Mesh(mergeGeometries(railParts), railMat);
  railMesh.name = 'RampRails';
  railMesh.castShadow = true;
  railMesh.receiveShadow = true;
  group.add(railMesh);

  const sign = makeRampSign();
  sign.position.set(3.15, shipY + 1.28, 19.4);
  sign.rotation.y = 0;
  sign.castShadow = false;
  group.add(sign);

  const light = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.16, 0.06),
    new THREE.MeshStandardMaterial({
      color: 0xffd7a1,
      emissive: 0xffb85e,
      emissiveIntensity: 2.4,
      roughness: 0.4,
    }),
  );
  light.position.set(1.05, shipY + 1.12, 21.6);
  group.add(light);

  return group;
}

function addPadLights(scene: THREE.Scene, padY: number): void {
  const warm = new THREE.Color(0xffc579);
  for (const [x, z, intensity] of [
    [-24, 18, 18],
    [24, 18, 18],
    [-26, -22, 12],
    [26, -22, 12],
  ] as const) {
    const light = new THREE.PointLight(warm, intensity, 38, 2);
    light.position.set(x, padY + 5.2, z);
    scene.add(light);
  }
  const signLight = new THREE.PointLight(new THREE.Color(0xa8d8e0), 14, 22, 2);
  signLight.position.set(-90, padY + 10.5, 10);
  scene.add(signLight);
}

function addTerminalGlow(scene: THREE.Scene, padY: number): void {
  const light = new THREE.PointLight(new THREE.Color(0xffd9a0), 20, 26, 2);
  light.position.set(-108, padY + 4.5, -12);
  scene.add(light);
}

function collider(
  id: string,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  minZ: number,
  maxZ: number,
): Collider {
  return { id, minX, maxX, minY, maxY, minZ, maxZ };
}

function buildColliders(padY: number): Collider[] {
  const y = padY;
  const list: Collider[] = [];
  // terminal shell + plinth + T2 landside hall
  list.push(collider('terminal', -204, -86, y, y + 30, -26, 76));
  list.push(collider('terminal-landside', -204, -86, y, y + 16, 76, 94));
  // shop stall (authored market stall placed by T2)
  list.push(collider('shop', -110.3, -105.7, y, y + 3.2, -13.8, -10.2));
  // gantry towers (the truss is high enough to walk under)
  list.push(collider('gantry-w', -44, -36, y, y + 36, -4, 4));
  list.push(collider('gantry-e', 36, 44, y, y + 36, -4, 4));
  // fuel tank farm
  list.push(collider('tank-a', -350, -335, y, y + 18, 53, 67));
  list.push(collider('tank-b', -345, -335, y, y + 18, 33, 43));
  // cargo near the pad
  list.push(collider('crates-a', 28.5, 34.1, y, y + 1.6, 58.8, 61.9));
  list.push(collider('crates-b', -23.6, -20.4, y, y + 1.6, 64.6, 67.4));
  list.push(collider('truck-a', 178.8, 181.2, y, y + 3.2, 46.5, 53.5));
  list.push(collider('truck-b', -258.5, -251.5, y, y + 3.2, 18.8, 21.2));
  // market stalls
  for (const [i, x, z] of [
    [0, -23, -170],
    [1, -23, -255],
    [2, -23, -335],
    [3, 23, -190],
    [4, 23, -270],
    [5, -220, 115],
    [6, -22, -48],
    [7, 22, -48],
  ] as const) {
    list.push(collider(`market-${i}`, x - 2.2, x + 2.2, y, y + 3.2, z - 1.8, z + 1.8));
  }
  // A-30 hull (the ramp is handled separately)
  list.push(collider('ship', -12.5, 12.5, y + 0.55, y + 10, -14.4, 14.4));
  // boarding ramp
  list.push(collider('ramp', -1.5, 1.5, y, y + 1.25, 13.4, 21.7));
  return list;
}

export async function loadPort(scene: THREE.Scene, base: string, padY: number): Promise<PortWorld> {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(`${base}/iac-landing/assets/anvil-landing.glb`);
  const root = new THREE.Group();
  root.name = 'AnvilLandingPort';
  root.add(gltf.scene);
  root.position.set(0, 0, PAD_Z);
  scene.add(root);
  root.updateMatrixWorld(true);

  const ground = gltf.scene.getObjectByName('Ground') ?? gltf.scene;
  const staticPort = gltf.scene.getObjectByName('StaticPort') ?? gltf.scene;
  const ship = gltf.scene.getObjectByName('Ship');
  if (!ship) throw new Error('A-30 ship node missing from port GLB');

  root.position.y = padY - PORT_DECK_TOP;
  root.updateMatrixWorld(true);

  const shipBox = new THREE.Box3().setFromObject(ship);
  const shipDelta = padY + 0.02 - shipBox.min.y;
  ship.position.y += shipDelta;
  root.updateMatrixWorld(true);

  let asphalt: THREE.Material | null = null;
  let metal: THREE.Material | null = null;
  const materialSeen = new Set<THREE.Material>();
  const configure = (mesh: THREE.Mesh, caster: boolean): void => {
    mesh.castShadow = caster;
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (!(m instanceof THREE.MeshStandardMaterial)) continue;
      if (materialSeen.has(m)) continue;
      materialSeen.add(m);
      const n = m.name.toLowerCase();
      if (n === 'v2_asphalt') asphalt = m;
      if (n === 'kb46_kb3d_hem_metala') metal = m;
      m.envMapIntensity = 0.72;
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'] as const) {
        const tex = m[key];
        if (tex) {
          tex.anisotropy = 8;
          tex.needsUpdate = true;
        }
      }
      // The source scene uses physical transmission glass. Three.js renders an
      // extra whole-scene transmission pass for it; for this realtime slice we
      // use a dark reflective standard glass instead, saving ~80 draw calls.
      const physical = m as THREE.MeshPhysicalMaterial;
      if (typeof physical.transmission === 'number' && physical.transmission > 0) {
        physical.transmission = 0;
        physical.thickness = 0;
      }
      if (n.includes('glass')) {
        m.roughness = 0.12;
        m.metalness = 0.82;
        m.envMapIntensity = 1.15;
        m.transparent = false;
      }
      if (
        n.includes('sign') ||
        n.includes('light') ||
        n.includes('glow') ||
        n.includes('emis') ||
        n.includes('beacon')
      ) {
        m.emissive = m.emissive?.clone() ?? new THREE.Color(0xffffff);
        if (m.emissive.getHex() === 0) {
          m.emissive.copy(m.color);
        }
        m.emissiveIntensity = Math.max(m.emissiveIntensity ?? 1, 1.65);
        m.side = THREE.DoubleSide;
      }
      if (n.includes('hazard') || n.includes('paint') || n.includes('steel')) {
        m.envMapIntensity = 0.65;
      }
    }
  };

  const groundMeshes = new Set<THREE.Object3D>();
  ground.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) groundMeshes.add(o);
  });
  gltf.scene.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    const mesh = o as THREE.Mesh;
    const inGround = groundMeshes.has(mesh);
    const isShip = ship === mesh || ship.getObjectById(mesh.id) !== undefined;
    configure(mesh, !inGround && (isShip || mesh.parent?.name !== 'Ground'));
  });

  // The source rock meshes are authored outcrops. Keep them near the plateau
  // edge, but make sure their bottoms are buried in the terrain rather than
  // floating above the deck.
  for (const name of ['Rock_B', 'Rock_C', 'Rock_D']) {
    const rock = gltf.scene.getObjectByName(name) ?? gltf.scene.getObjectByName(`${name}.001`);
    if (!rock) continue;
    const box = new THREE.Box3().setFromObject(rock);
    if (box.min.y < padY - 10) rock.position.y += padY - 10 - box.min.y;
    rock.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }

  addPadLights(scene, padY);
  addTerminalGlow(scene, padY);
  const shopSign = makeShopSign();
  shopSign.position.y = padY + 2.62;
  scene.add(shopSign);
  const t2Sign = makeT2Sign();
  t2Sign.position.y = padY + 12.55;
  scene.add(t2Sign);
  const signBack = new THREE.Mesh(
    new THREE.BoxGeometry(15.2, 4.0, 0.24),
    metal ?? new THREE.MeshStandardMaterial({ color: 0x2b3033, roughness: 0.55, metalness: 0.55 }),
  );
  signBack.position.set(-145, padY + 11.4, 94.0);
  signBack.castShadow = false;
  signBack.receiveShadow = true;
  scene.add(signBack);
  const dockLight = new THREE.PointLight(new THREE.Color(0xffd1a0), 26, 20, 2);
  dockLight.position.set(-82, padY + 3.4, 6.5);
  scene.add(dockLight);
  const landsideLight = new THREE.PointLight(new THREE.Color(0xffd2a4), 30, 24, 2);
  landsideLight.position.set(-140, padY + 3.2, 110);
  scene.add(landsideLight);

  const ramp = buildRamp(padY, metal);
  scene.add(ramp);

  // Keep the point-light count small: the ramp light is emissive only.

  const npcRoot = await loader.loadAsync(`${base}/iac-landing/assets/npcs.glb`);
  npcRoot.scene.updateMatrixWorld(true);
  const npcDefs = [
    { token: '10_Idle2_Radio', id: 'dockmaster', name: '凯拉·沃斯', role: '码头长 / DOCKMASTER', x: -145, z: 108, yaw: 0, phase: 0.2 },
    { token: '12_Idle4_Crossedhands', id: 'trader', name: '索恩·哈珀', role: '商人 / TRADER', x: -108, z: -14.2, yaw: 0, phase: 2.1 },
    { token: '14_Idle6_Device', id: 'mechanic', name: '鲁克·萨姆', role: '机械师 / MECHANIC', x: 18, z: 24, yaw: -Math.PI / 2.4, phase: 4.2 },
  ];
  const npcs: NpcVisual[] = [];
  for (const def of npcDefs) {
    let node: THREE.Object3D | null = null;
    npcRoot.scene.traverse((o) => {
      if (!node && o.name.includes(def.token) && o.parent && o.parent.name.includes(def.token)) {
        node = o.parent;
      } else if (!node && o.name.includes(def.token)) {
        node = o;
      }
    });
    if (!node) {
      console.warn('[iac] NPC not found', def.token);
      continue;
    }
    const obj = node as THREE.Object3D;
    if (obj.parent) obj.parent.remove(obj);
    // recenter feet at the wrapper origin
    obj.position.set(0, 0, 0);
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    obj.position.x -= (box.min.x + box.max.x) * 0.5;
    obj.position.z -= (box.min.z + box.max.z) * 0.5;
    obj.position.y -= box.min.y;
    obj.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = false;
        o.receiveShadow = true;
        o.frustumCulled = true;
        const mats = Array.isArray((o as THREE.Mesh).material)
          ? ((o as THREE.Mesh).material as THREE.Material[])
          : [((o as THREE.Mesh).material as THREE.Material)];
        for (const m of mats) {
          const physical = m as THREE.MeshPhysicalMaterial;
          if (typeof physical.transmission === 'number' && physical.transmission > 0) {
            physical.transmission = 0;
            physical.thickness = 0;
          }
        }
      }
    });
    const wrapper = new THREE.Group();
    wrapper.name = `NPC_${def.id}`;
    wrapper.add(obj);
    wrapper.position.set(def.x, padY + 0.02, def.z);
    wrapper.rotation.y = def.yaw;
    scene.add(wrapper);
    npcs.push({
      id: def.id,
      name: def.name,
      role: def.role,
      group: wrapper,
      baseYaw: def.yaw,
      baseY: padY + 0.02,
      phase: def.phase,
      position: new THREE.Vector3(def.x, padY + 0.02, def.z),
    });
  }

  // One instanced blob shadow for the three NPCs (1 draw call).
  const shadowGeo = new THREE.PlaneGeometry(1.8, 1.8);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: makeShadowTexture(),
    transparent: true,
    depthWrite: false,
    opacity: 0.62,
    toneMapped: false,
  });
  const npcBlobs = new THREE.InstancedMesh(shadowGeo, shadowMat, Math.max(1, npcs.length));
  const dummy = new THREE.Object3D();
  for (let i = 0; i < npcs.length; i += 1) {
    dummy.position.set(npcs[i].position.x, padY + 0.025, npcs[i].position.z);
    dummy.updateMatrix();
    npcBlobs.setMatrixAt(i, dummy.matrix);
  }
  npcBlobs.frustumCulled = false;
  scene.add(npcBlobs);

  const colliders = buildColliders(padY);
  return {
    root,
    ground,
    staticPort,
    ship,
    asphalt,
    metal,
    colliders,
    npcs,
    npcBlobs,
    ramp,
    shipEntry: new THREE.Vector3(0, padY, 17.2),
  };
}

export function animateNpcs(npcs: NpcVisual[], player: THREE.Vector3, time: number): void {
  for (const npc of npcs) {
    const dx = player.x - npc.position.x;
    const dz = player.z - npc.position.z;
    const dist = Math.hypot(dx, dz);
    let targetYaw = npc.baseYaw;
    if (dist < 7) {
      // Turn the posed character toward the player. The source models face
      // -Z after the wrapper rotation; the base yaw is the authored facing.
      const face = Math.atan2(dx, dz);
      targetYaw = face;
    }
    const sway = Math.sin(time * 0.35 + npc.phase) * 0.025;
    npc.group.rotation.y += (targetYaw + sway - npc.group.rotation.y) * 0.045;
    npc.group.position.y = npc.baseY + Math.sin(time * 1.15 + npc.phase) * 0.009;
  }
}
