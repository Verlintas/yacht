import * as THREE from 'three';

export interface Ship {
  group: THREE.Group;
  engineGlow: THREE.Sprite[];
  engineCore: THREE.Mesh[];
  update: (dt: number, throttle: number, boost: number) => void;
}

/** 用一组截面环生成机身，截面半径沿 Z 轴变化。 */
function hullGeometry(rings: Array<{ z: number; r: number; flat?: number }>): THREE.BufferGeometry {
  const radial = 32;
  const positions: number[] = [];
  const indices: number[] = [];

  for (const ring of rings) {
    for (let i = 0; i < radial; i += 1) {
      const a = (i / radial) * Math.PI * 2;
      positions.push(
        Math.cos(a) * ring.r,
        Math.sin(a) * ring.r * (ring.flat ?? 0.78),
        ring.z,
      );
    }
  }

  for (let s = 0; s < rings.length - 1; s += 1) {
    for (let i = 0; i < radial; i += 1) {
      const a = s * radial + i;
      const b = s * radial + ((i + 1) % radial);
      const c = (s + 1) * radial + i;
      const d = (s + 1) * radial + ((i + 1) % radial);
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** 机翼：带后掠与收窄的薄板。 */
function wingGeometry(span: number, rootChord: number, tipChord: number, sweep: number, thickness: number): THREE.BufferGeometry {
  const half = thickness / 2;
  const verts = [
    // root 上/下
    0, half, rootChord * 0.5, 0, half, -rootChord * 0.5,
    // tip 上/下
    span, half * 0.45, tipChord * 0.5 - sweep, span, half * 0.45, -tipChord * 0.5 - sweep,
    // 底面
    0, -half, rootChord * 0.5, span, -half * 0.45, tipChord * 0.5 - sweep,
    0, -half, -rootChord * 0.5, span, -half * 0.45, -tipChord * 0.5 - sweep,
  ];

  const idx = [
    0, 1, 2, 1, 3, 2, // 顶
    4, 5, 6, 5, 7, 6, // 底
    0, 2, 4, 2, 6, 4, // 前缘
    1, 5, 3, 3, 5, 7, // 后缘
    2, 3, 6, 3, 7, 6, // 尖端
    0, 4, 1, 1, 4, 5, // 根部
  ];

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geometry.setIndex(idx);
  geometry.computeVertexNormals();
  return geometry;
}

export function createShip(): Ship {
  const group = new THREE.Group();

  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x7d8a99,
    roughness: 0.46,
    metalness: 0.7,
    envMapIntensity: 0.75,
  });
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0x1c2530,
    roughness: 0.5,
    metalness: 0.85,
    envMapIntensity: 0.9,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0x4fd0bd,
    emissive: new THREE.Color(0x2fa898),
    emissiveIntensity: 1.1,
    roughness: 0.4,
    metalness: 0.2,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x08131b,
    roughness: 0.05,
    metalness: 1,
    envMapIntensity: 2.2,
    emissive: new THREE.Color(0x123845),
    emissiveIntensity: 0.45,
  });

  // 机身
  const hull = new THREE.Mesh(
    hullGeometry([
      { z: -8.4, r: 0.55 },
      { z: -6.6, r: 1.25 },
      { z: -4.2, r: 1.85 },
      { z: -1.2, r: 2.05 },
      { z: 1.8, r: 1.9 },
      { z: 4.2, r: 1.55 },
      { z: 6.4, r: 1.05 },
      { z: 8.2, r: 0.42 },
      { z: 9.1, r: 0.06 },
    ]),
    hullMat,
  );
  group.add(hull);

  // 背脊
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.34, 6.2), panelMat);
  spine.position.set(0, 1.5, 0.6);
  group.add(spine);

  // 机腹
  const belly = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.42, 5.6), panelMat);
  belly.position.set(0, -1.5, 0.2);
  group.add(belly);

  // 座舱
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(1.05, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.58),
    glassMat,
  );
  canopy.scale.set(0.92, 0.68, 2.3);
  canopy.position.set(0, 1.42, 1.7);
  group.add(canopy);

  // 座舱框
  const canopyFrame = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.05, 6, 24, Math.PI), panelMat);
  canopyFrame.rotation.set(Math.PI / 2, 0, 0);
  canopyFrame.scale.set(1, 2.1, 1);
  canopyFrame.position.set(0, 1.42, 1.7);
  group.add(canopyFrame);

  // 机翼（带上反角）
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(wingGeometry(5.6, 4.4, 1.8, 2.1, 0.24), hullMat);
    wing.position.set(side * 1.35, -0.15, 0.2);
    wing.scale.x = side;
    wing.rotation.z = side * 0.1;
    group.add(wing);

    // 前缘灯条
    const edge = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.07, 0.16), accentMat);
    edge.position.set(side * 3.7, 0.02, 1.55);
    edge.rotation.z = side * 0.1;
    edge.rotation.y = side * 0.2;
    group.add(edge);

    // 翼尖
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.3, 2.2, 6), panelMat);
    tip.rotation.z = side * Math.PI * 0.5;
    tip.position.set(side * 6.9, 0.05, 0.9);
    group.add(tip);

    const tipLight = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), accentMat);
    tipLight.position.set(side * 7.0, 0.05, 1.9);
    group.add(tipLight);
  }

  // 鸭翼
  for (const side of [-1, 1]) {
    const canard = new THREE.Mesh(wingGeometry(1.5, 1.4, 0.7, 0.5, 0.12), panelMat);
    canard.position.set(side * 1.1, 0.14, 4.3);
    canard.scale.x = side;
    canard.rotation.z = side * 0.16;
    group.add(canard);
  }

  // 垂尾
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.9, 2.2), panelMat);
    fin.position.set(side * 0.85, 1.55, -4.1);
    fin.rotation.x = -0.22;
    fin.rotation.z = side * 0.22;
    group.add(fin);
  }

  // 引擎
  const engineGlow: THREE.Sprite[] = [];
  const engineCore: THREE.Mesh[] = [];

  const glowTexture = (() => {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(220,255,250,1)');
    g.addColorStop(0.22, 'rgba(94,200,184,0.75)');
    g.addColorStop(1, 'rgba(20,60,70,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
  })();

  for (const side of [-1, 1]) {
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 2.4), panelMat);
    pylon.position.set(side * 2.1, -0.55, -1.6);
    group.add(pylon);

    const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.78, 3.6, 20), panelMat);
    nacelle.rotation.x = Math.PI / 2;
    nacelle.position.set(side * 2.6, -0.6, -3.1);
    group.add(nacelle);

    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.52, 0.7, 20), hullMat);
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.set(side * 2.6, -0.6, -5.0);
    group.add(nozzle);

    const core = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 24),
      new THREE.MeshBasicMaterial({ color: 0xd8fff8, transparent: true, opacity: 0.95 }),
    );
    core.position.set(side * 2.6, -0.6, -5.36);
    core.rotation.y = Math.PI;
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
    sprite.position.set(side * 2.6, -0.6, -5.7);
    sprite.scale.setScalar(1.15);
    group.add(sprite);
    engineGlow.push(sprite);
  }

  // 机头
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), accentMat);
  nose.position.set(0, 0, 9.0);
  group.add(nose);

  // 机身细节：面板线与小方块
  for (let i = 0; i < 6; i += 1) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.9), panelMat);
    line.position.set(-1.2 + i * 0.48, 0.95, 2.4 + (i % 2) * 0.5);
    group.add(line);
  }

  for (let i = 0; i < 5; i += 1) {
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.3), panelMat);
    block.position.set(-0.8 + i * 0.4, 1.15, -2.2 - (i % 3) * 0.5);
    group.add(block);
  }

  const update = (_dt: number, throttle: number, boost: number): void => {
    const power = 1 + throttle * 1.8 + boost * 2.6;
    for (const sprite of engineGlow) {
      sprite.scale.setScalar(1.0 + power * 0.55);
      (sprite.material as THREE.SpriteMaterial).opacity = 0.32 + Math.min(power * 0.1, 0.3);
    }
    for (const core of engineCore) {
      (core.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.min(power * 0.05, 0.2);
    }
  };

  return { group, engineGlow, engineCore, update };
}
