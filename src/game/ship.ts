import * as THREE from 'three';
import { armorPlate, greebles, lightStrip, panel, truss } from './kit';
import { makeRandom } from './data';

export interface Ship {
  group: THREE.Group;
  engineGlow: THREE.Sprite[];
  engineCore: THREE.Mesh[];
  /** 驾驶舱在模型局部坐标里的位置（第一人称相机用） */
  cockpit: THREE.Vector3;
  update: (dt: number, throttle: number, boost: number) => void;
}

export function createShip(): Ship {
  const group = new THREE.Group();
  const rand = makeRandom(20261114);

  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x8d98a4,
    roughness: 0.36,
    metalness: 0.88,
    envMapIntensity: 1.25,
  });
  const plateMat = new THREE.MeshStandardMaterial({
    color: 0x39424c,
    roughness: 0.5,
    metalness: 0.86,
    envMapIntensity: 0.95,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xb6c0ca,
    roughness: 0.24,
    metalness: 0.95,
    envMapIntensity: 1.5,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x121820,
    roughness: 0.62,
    metalness: 0.7,
  });
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0x59e0c8,
    emissive: new THREE.Color(0x3fd6bd),
    emissiveIntensity: 2.4,
    roughness: 0.3,
    metalness: 0.1,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x04121a,
    roughness: 0.04,
    metalness: 1,
    envMapIntensity: 2.4,
    emissive: new THREE.Color(0x0d3a4a),
    emissiveIntensity: 0.7,
  });

  /* ── 主龙骨 ─────────────────────────────── */
  const spine = new THREE.Mesh(panel(2.0, 1.5, 15.5, 0.18, 3), plateMat);
  group.add(spine);

  // 上层装甲：分三段，带缝隙
  const deckSpecs = [
    { w: 2.6, h: 0.5, d: 3.6, y: 0.95, z: -3.4 },
    { w: 3.0, h: 0.55, d: 3.2, y: 1.0, z: 0.1 },
    { w: 2.4, h: 0.45, d: 2.6, y: 0.92, z: 3.0 },
  ];
  for (const spec of deckSpecs) {
    const plate = armorPlate(spec.w, spec.h, spec.d, hullMat, darkMat, 0.06);
    plate.position.set(0, spec.y, spec.z);
    plate.rotation.x = Math.PI / 2;
    group.add(plate);
  }

  // 腹部装甲
  const belly = armorPlate(3.2, 0.5, 6.4, plateMat, darkMat, 0.07);
  belly.position.set(0, -0.95, 0.6);
  belly.rotation.x = Math.PI / 2;
  group.add(belly);

  /* ── 舰首 ───────────────────────────────── */
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.05, 5.2, 12), hullMat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0, -8.6);
  group.add(nose);

  const noseTip = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), trimMat);
  noseTip.position.set(0, 0, -11.1);
  group.add(noseTip);

  const noseRing = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.08, 8, 24), trimMat);
  noseRing.position.set(0, 0, -6.6);
  group.add(noseRing);

  // 舰首传感器阵列
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    const sensor = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), glassMat);
    sensor.position.set(Math.cos(angle) * 0.72, Math.sin(angle) * 0.72, -6.9);
    group.add(sensor);
  }

  /* ── 座舱 ───────────────────────────────── */
  const cockpitBase = new THREE.Mesh(panel(2.2, 0.7, 3.6, 0.12, 2), trimMat);
  cockpitBase.position.set(0, 1.1, -2.4);
  group.add(cockpitBase);

  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(1.0, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.6),
    glassMat,
  );
  canopy.scale.set(0.9, 0.72, 1.85);
  canopy.position.set(0, 1.32, -2.6);
  group.add(canopy);

  // 座舱框：三根肋
  for (let i = 0; i < 3; i += 1) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.045, 6, 20, Math.PI), trimMat);
    rib.rotation.set(Math.PI / 2, 0, 0);
    rib.scale.set(0.9, 1.6, 1);
    rib.position.set(0, 1.3, -3.6 + i * 0.85);
    group.add(rib);
  }

  // 座舱内部：座椅与全息屏（透过玻璃能看到）
  const seat = new THREE.Mesh(panel(0.55, 0.5, 0.6, 0.06, 1), darkMat);
  seat.position.set(0, 1.05, -2.5);
  group.add(seat);

  const holo = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.36),
    new THREE.MeshBasicMaterial({
      color: 0x59e0c8,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  holo.position.set(0, 1.35, -3.9);
  holo.rotation.x = -0.35;
  group.add(holo);

  /* ── 侧舱 ───────────────────────────────── */
  for (const side of [-1, 1]) {
    const pod = new THREE.Mesh(panel(1.55, 1.25, 7.2, 0.16, 2), plateMat);
    pod.position.set(side * 3.3, -0.1, 0.6);
    group.add(pod);

    const podArmor = armorPlate(1.2, 0.4, 5.4, hullMat, darkMat, 0.05);
    podArmor.position.set(side * 3.3, 0.62, 0.6);
    podArmor.rotation.x = Math.PI / 2;
    group.add(podArmor);

    // 侧舱散热片
    for (let i = 0; i < 5; i += 1) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.9), trimMat);
      fin.position.set(side * 4.05, -0.1, -1.6 + i * 1.0);
      group.add(fin);
    }

    // 侧灯
    const strip = lightStrip(5.2, 0.05, glowMat);
    strip.position.set(side * 4.08, 0.05, 0.6);
    strip.rotation.y = Math.PI / 2;
    group.add(strip);

    // 连接桁架
    const link = truss(1.4, 0.5, darkMat, 2);
    link.rotation.z = Math.PI / 2;
    link.position.set(side * 2.2, -0.1, 1.4);
    group.add(link);
  }

  /* ── 机翼状稳定面（短、后掠，不是飞机翼） ── */
  for (const side of [-1, 1]) {
    const stabilizer = new THREE.Mesh(panel(2.6, 0.16, 2.2, 0.06, 2), hullMat);
    stabilizer.position.set(side * 4.5, 0.1, 2.9);
    stabilizer.rotation.z = side * 0.16;
    stabilizer.rotation.y = side * -0.22;
    group.add(stabilizer);

    const edge = lightStrip(2.4, 0.045, glowMat);
    edge.position.set(side * 4.5, 0.22, 2.9);
    edge.rotation.y = side * -0.22;
    group.add(edge);
  }

  /* ── 垂尾 ───────────────────────────────── */
  const fin = new THREE.Mesh(panel(0.22, 3.6, 3.2, 0.08, 2), plateMat);
  fin.position.set(0, 2.4, 4.0);
  fin.rotation.x = -0.2;
  group.add(fin);

  const finEdge = lightStrip(3.0, 0.05, glowMat);
  finEdge.position.set(0, 4.2, 3.7);
  finEdge.rotation.x = -0.2;
  finEdge.rotation.z = Math.PI / 2;
  group.add(finEdge);

  for (const side of [-1, 1]) {
    const vfin = new THREE.Mesh(panel(0.12, 1.7, 2.2, 0.05, 2), plateMat);
    vfin.position.set(side * 2.4, -1.0, 3.4);
    vfin.rotation.x = -0.32;
    vfin.rotation.z = side * 0.2;
    group.add(vfin);
  }

  /* ── 引擎 ───────────────────────────────── */
  const engineGlow: THREE.Sprite[] = [];
  const engineCore: THREE.Mesh[] = [];

  const glowTexture = (() => {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(235,255,252,1)');
    g.addColorStop(0.22, 'rgba(89,224,200,0.75)');
    g.addColorStop(1, 'rgba(8,40,50,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
  })();

  const engineBlock = new THREE.Mesh(panel(4.6, 2.1, 3.0, 0.14, 2), plateMat);
  engineBlock.position.set(0, 0.2, 6.4);
  group.add(engineBlock);

  const nozzles: Array<[number, number, number]> = [
    [0, 0.2, 7.9],
    [-3.3, -0.1, 4.1],
    [3.3, -0.1, 4.1],
  ];

  for (const [x, y, z] of nozzles) {
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 1.08, 2.0, 24), trimMat);
    housing.rotation.x = Math.PI / 2;
    housing.position.set(x, y, z);
    group.add(housing);

    // 喷口环
    for (let i = 0; i < 3; i += 1) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.86 - i * 0.05, 0.05, 8, 28), darkMat);
      ring.position.set(x, y, z + 0.6 + i * 0.18);
      group.add(ring);
    }

    const throat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.78, 0.6, 24),
      new THREE.MeshStandardMaterial({ color: 0x05080b, roughness: 0.95, metalness: 0.3 }),
    );
    throat.rotation.x = Math.PI / 2;
    throat.position.set(x, y, z + 0.95);
    group.add(throat);

    const core = new THREE.Mesh(
      new THREE.CircleGeometry(0.52, 28),
      new THREE.MeshBasicMaterial({ color: 0xd6fff7, transparent: true, opacity: 0.95 }),
    );
    core.position.set(x, y, z + 1.28);
    group.add(core);
    engineCore.push(core);

    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    sprite.position.set(x, y, z + 1.55);
    sprite.scale.setScalar(1.0);
    group.add(sprite);
    engineGlow.push(sprite);

    // 燃料管
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.2, 8), trimMat);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(x * 0.7, y - 0.75, z - 1.9);
    group.add(pipe);
  }

  /* ── 表面细节 ───────────────────────────── */
  const deckGreebles = greebles(90, { x: 5.2, y: 0.3, z: 13 }, darkMat, rand);
  deckGreebles.position.set(0, 1.28, 0.5);
  group.add(deckGreebles);

  const podGreeblesL = greebles(40, { x: 0.6, y: 0.9, z: 5.6 }, darkMat, rand);
  podGreeblesL.position.set(-4.05, -0.1, 0.6);
  group.add(podGreeblesL);

  const podGreeblesR = greebles(40, { x: 0.6, y: 0.9, z: 5.6 }, darkMat, rand);
  podGreeblesR.position.set(4.05, -0.1, 0.6);
  group.add(podGreeblesR);

  // 面板缝
  for (let i = 0; i < 14; i += 1) {
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.8 + rand() * 1.6), darkMat);
    seam.position.set(-2.4 + rand() * 4.8, 1.3, -5 + rand() * 10);
    seam.rotation.y = (rand() - 0.5) * 0.4;
    group.add(seam);
  }

  // 舷号
  const decal = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 0.5),
    new THREE.MeshBasicMaterial({ color: 0xc9a55c, transparent: true, opacity: 0.5, depthWrite: false }),
  );
  decal.position.set(-3.3, 0.66, -0.8);
  decal.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
  group.add(decal);

  group.scale.setScalar(0.9);

  const update = (_dt: number, throttle: number, boost: number): void => {
    const power = 0.25 + throttle * 1.5 + boost * 2.2;
    for (const sprite of engineGlow) {
      sprite.scale.setScalar(0.8 + power * 0.62);
      (sprite.material as THREE.SpriteMaterial).opacity = 0.3 + Math.min(power * 0.16, 0.5);
    }
    for (const core of engineCore) {
      (core.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.min(power * 0.09, 0.35);
    }
  };

  return { group, engineGlow, engineCore, cockpit: new THREE.Vector3(0, 2.2, -2.2), update };
}

/** 从 Blender 导出的 GLB 加载舰体，并补上引擎光。 */
export async function loadShipModel(url: string): Promise<Ship> {
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/libs/meshopt_decoder.module.js'),
  ]);
  await MeshoptDecoder.ready;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);

  const model = gltf.scene;
  // glTF 导出已经是 Y-up；机首在 +Z，绕 Y 转 180° 让它朝 -Z
  model.rotation.set(0, Math.PI, 0);
  model.scale.setScalar(0.66);
  model.updateMatrixWorld(true);

  // 收敛材质：关掉双面、压掉过强的自发光
  model.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const material = obj.material as THREE.MeshStandardMaterial;
    if (!material) return;
    material.side = THREE.FrontSide;
    if ('emissiveIntensity' in material) material.emissiveIntensity = 0.06;
    if ('metalness' in material) material.metalness = Math.min(material.metalness ?? 1, 0.7);
    if ('roughness' in material) material.roughness = Math.max(material.roughness ?? 0.5, 0.45);
    material.envMapIntensity = 1.1;
    obj.frustumCulled = true;
  });

  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  model.position.sub(center);

  const group = new THREE.Group();
  group.add(model);

  // 自动补引擎光：放在包围盒尾端
  const glowTexture = (() => {
    const s = 128;
    const canvas = document.createElement('canvas');
    canvas.width = s;
    canvas.height = s;
    const ctx = canvas.getContext('2d')!;
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(235,255,252,1)');
    g.addColorStop(0.24, 'rgba(89,224,200,0.7)');
    g.addColorStop(1, 'rgba(8,40,50,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    return new THREE.CanvasTexture(canvas);
  })();

  const engineGlow: THREE.Sprite[] = [];
  const engineCore: THREE.Mesh[] = [];
  const rear = size.z / 2;

  for (const offset of [-size.x * 0.18, 0, size.x * 0.18]) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    sprite.position.set(offset, 0, rear * 0.98);
    sprite.scale.setScalar(size.z * 0.16);
    group.add(sprite);
    engineGlow.push(sprite);
  }

  const update = (_dt: number, throttle: number, boost: number): void => {
    const power = 0.25 + throttle * 1.5 + boost * 2.2;
    for (const sprite of engineGlow) {
      sprite.scale.setScalar(size.z * (0.1 + power * 0.12));
      (sprite.material as THREE.SpriteMaterial).opacity = 0.3 + Math.min(power * 0.16, 0.5);
    }
  };

  // 驾驶舱：机首在 -Z，取前段偏上的位置
  const cockpit = new THREE.Vector3(0, size.y * 0.52, -size.z * 0.3);

  return { group, engineGlow, engineCore, cockpit, update };
}
