import * as THREE from 'three';

export interface Ship {
  group: THREE.Group;
  engineGlow: THREE.Sprite[];
  engineCore: THREE.Mesh[];
  update: (dt: number, throttle: number, boost: number) => void;
}

/**
 * 用平面轮廓挤出舰体。轮廓定义在 XY 平面，挤出后旋转到 XZ，
 * 机头朝 -Z（Three.js 的「前方」约定）。
 */
function planform(
  points: Array<[number, number]>,
  thickness: number,
  bevel = 0.12,
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 6,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, thickness / 2, 0);
  geometry.computeVertexNormals();
  return geometry;
}

export function createShip(): Ship {
  const group = new THREE.Group();

  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x525d69,
    roughness: 0.36,
    metalness: 0.82,
    envMapIntensity: 1.25,
  });
  const plateMat = new THREE.MeshStandardMaterial({
    color: 0x1a2028,
    roughness: 0.5,
    metalness: 0.85,
    envMapIntensity: 0.9,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x9aa6b2,
    roughness: 0.26,
    metalness: 0.95,
    envMapIntensity: 1.4,
  });
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0x59e0c8,
    emissive: new THREE.Color(0x3fd6bd),
    emissiveIntensity: 2.6,
    roughness: 0.3,
    metalness: 0.1,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x04121a,
    roughness: 0.03,
    metalness: 1,
    envMapIntensity: 2.6,
    emissive: new THREE.Color(0x0d3a4a),
    emissiveIntensity: 0.8,
  });

  /* ── 主舰体：楔形，无翼 ───────────────── */
  const body = new THREE.Mesh(
    planform(
      [
        [0, -9.8],
        [1.1, -5.6],
        [2.8, -1.0],
        [4.0, 2.8],
        [2.5, 5.8],
        [1.0, 5.0],
        [0, 6.2],
        [-1.0, 5.0],
        [-2.5, 5.8],
        [-3.0, 2.8],
        [-2.2, -1.0],
        [-1.1, -5.6],
      ],
      1.7,
      0.16,
    ),
    hullMat,
  );
  group.add(body);

  // 上层装甲板（略小、抬起）
  const deck = new THREE.Mesh(
    planform(
      [
        [0, -6.4],
        [0.9, -3.2],
        [1.7, 0.8],
        [2.0, 3.0],
        [0.9, 2.8],
        [0, 3.6],
        [-0.9, 2.8],
        [-2.0, 3.0],
        [-1.7, 0.8],
        [-0.9, -3.2],
      ],
      0.6,
      0.1,
    ),
    plateMat,
  );
  deck.position.y = 0.86;
  group.add(deck);

  // 中脊
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.42, 7.2), trimMat);
  spine.position.set(0, 1.16, 0.6);
  group.add(spine);

  // 座舱（朝前）
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(1.15, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.55),
    glassMat,
  );
  canopy.scale.set(0.82, 0.62, 1.9);
  canopy.position.set(0, 1.05, -2.1);
  group.add(canopy);

  const canopyRim = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.055, 8, 32), trimMat);
  canopyRim.rotation.x = Math.PI / 2;
  canopyRim.scale.set(0.82, 1.9, 1);
  canopyRim.position.set(0, 1.06, -2.1);
  group.add(canopyRim);

  /* ── 侧舱 ─────────────────────────────── */
  for (const side of [-1, 1]) {
    const pod = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.25, 6.6), plateMat);
    pod.position.set(side * 4.1, -0.15, 1.2);
    pod.rotation.y = side * 0.04;
    group.add(pod);

    const podTop = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 5.4), trimMat);
    podTop.position.set(side * 4.1, 0.55, 1.0);
    group.add(podTop);

    const podGlow = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 4.2), glowMat);
    podGlow.position.set(side * 4.86, -0.1, 1.2);
    group.add(podGlow);
  }

  /* ── 垂尾 ─────────────────────────────── */
  const fin = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 3.4, 3.0),
    plateMat,
  );
  fin.position.set(0, 2.2, 3.9);
  fin.rotation.x = -0.24;
  group.add(fin);

  const finEdge = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 2.6), glowMat);
  finEdge.position.set(0, 3.85, 3.5);
  finEdge.rotation.x = -0.24;
  group.add(finEdge);

  for (const side of [-1, 1]) {
    const vfin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 2.0), plateMat);
    vfin.position.set(side * 2.6, -0.9, 3.4);
    vfin.rotation.x = -0.3;
    vfin.rotation.z = side * 0.18;
    group.add(vfin);
  }

  /* ── 引擎组 ───────────────────────────── */
  const engineGlow: THREE.Sprite[] = [];
  const engineCore: THREE.Mesh[] = [];

  const glowTexture = (() => {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(230,255,252,1)');
    g.addColorStop(0.2, 'rgba(89,224,200,0.8)');
    g.addColorStop(1, 'rgba(10,50,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
  })();

  const nozzles: Array<[number, number, number]> = [
    [0, 0.05, 7.1],
    [-4.1, -0.15, 4.4],
    [4.1, -0.15, 4.4],
  ];

  for (const [x, y, z] of nozzles) {
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.86, 1.02, 2.4, 20), plateMat);
    housing.rotation.x = Math.PI / 2;
    housing.position.set(x, y, z);
    group.add(housing);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.09, 8, 28), trimMat);
    ring.position.set(x, y, z + 1.2);
    group.add(ring);

    const throat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.66, 0.78, 0.5, 20),
      new THREE.MeshStandardMaterial({ color: 0x0a0f14, roughness: 0.9, metalness: 0.4 }),
    );
    throat.rotation.x = Math.PI / 2;
    throat.position.set(x, y, z + 1.15);
    group.add(throat);

    const core = new THREE.Mesh(
      new THREE.CircleGeometry(0.56, 28),
      new THREE.MeshBasicMaterial({ color: 0xd6fff7, transparent: true, opacity: 0.95 }),
    );
    core.position.set(x, y, z + 1.42);
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
    sprite.position.set(x, y, z + 1.7);
    sprite.scale.setScalar(1.1);
    group.add(sprite);
    engineGlow.push(sprite);
  }

  // 尾部引擎舱
  const aft = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.0, 2.6), plateMat);
  aft.position.set(0, 0.15, 5.4);
  group.add(aft);

  const aftTop = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.4, 2.0), trimMat);
  aftTop.position.set(0, 1.2, 5.5);
  group.add(aftTop);

  for (const side of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 2.2), trimMat);
    strut.position.set(side * 3.2, 0.5, 4.6);
    strut.rotation.z = side * 0.3;
    group.add(strut);
  }

  /* ── 舰体细节 ─────────────────────────── */
  // 进气道
  for (const side of [-1, 1]) {
    const intake = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 2.2), plateMat);
    intake.position.set(side * 2.6, 0.55, -0.4);
    intake.rotation.y = side * 0.12;
    group.add(intake);

    const lip = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.06, 0.12), glowMat);
    lip.position.set(side * 2.6, 0.55, -1.52);
    lip.rotation.y = side * 0.12;
    group.add(lip);
  }

  // 侧向推进器（用于姿态）
  for (const side of [-1, 1]) {
    const pod = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.8, 6, 12), plateMat);
    pod.rotation.z = Math.PI / 2;
    pod.position.set(side * 4.1, 0.1, 2.0);
    group.add(pod);

    const vent = new THREE.Mesh(new THREE.CircleGeometry(0.16, 12), glowMat);
    vent.position.set(side * 4.62, 0.1, 2.0);
    vent.rotation.y = side * Math.PI / 2;
    group.add(vent);
  }

  // 腹部散热片
  for (let i = 0; i < 4; i += 1) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 1.6), plateMat);
    fin.position.set(-1.8 + i * 1.2, -0.9, 1.2);
    group.add(fin);
  }

  // 面板线与铆钉
  for (let i = 0; i < 10; i += 1) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.02, 0.7 + (i % 3) * 0.4), trimMat);
    line.position.set(-2.6 + i * 0.58, 1.32, -0.4 + (i % 3) * 1.1);
    group.add(line);
  }

  for (let i = 0; i < 8; i += 1) {
    const stud = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), trimMat);
    stud.position.set(-2.2 + (i % 4) * 1.45, 1.36, -2.6 + Math.floor(i / 4) * 1.4);
    group.add(stud);
  }

  // 边缘灯条（左右各一条，拉出轮廓）
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 6.4), glowMat);
    rail.position.set(side * 2.05, 0.72, 0.2);
    rail.rotation.y = side * 0.03;
    group.add(rail);
  }

  // 舰首传感器
  const sensor = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), glassMat);
  sensor.position.set(0, 0.35, -9.1);
  group.add(sensor);

  const sensorRing = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.045, 6, 20), trimMat);
  sensorRing.position.set(0, 0.35, -8.95);
  group.add(sensorRing);

  // 顶部小天线
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), trimMat);
  mast.position.set(0, 1.95, 1.4);
  group.add(mast);

  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), glowMat);
  beacon.position.set(0, 2.4, 1.4);
  group.add(beacon);

  // 尾焰口
  for (const side of [-1, 1]) {
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.7), glowMat);
    vent.position.set(side * 1.3, 0.6, 4.6);
    group.add(vent);
  }

  group.scale.setScalar(0.86);

  const update = (_dt: number, throttle: number, boost: number): void => {
    const power = 0.25 + throttle * 1.5 + boost * 2.2;
    for (const sprite of engineGlow) {
      sprite.scale.setScalar(0.85 + power * 0.7);
      (sprite.material as THREE.SpriteMaterial).opacity = 0.3 + Math.min(power * 0.16, 0.5);
    }
    for (const core of engineCore) {
      (core.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.min(power * 0.09, 0.35);
    }
  };

  return { group, engineGlow, engineCore, update };
}
