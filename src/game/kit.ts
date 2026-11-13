import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** 倒角盒：白模细节的基本单元。 */
export function panel(
  w: number,
  h: number,
  d: number,
  radius = 0.06,
  segments = 2,
): THREE.BufferGeometry {
  return new RoundedBoxGeometry(w, h, d, segments, Math.min(radius, Math.min(w, h, d) * 0.45));
}

/** 一块带缝隙的装甲板：外板 + 内衬（深色），制造叠层感。 */
export function armorPlate(
  w: number,
  h: number,
  d: number,
  shellMat: THREE.Material,
  gapMat: THREE.Material,
  gap = 0.05,
): THREE.Group {
  const group = new THREE.Group();
  const backing = new THREE.Mesh(panel(w, h, d * 0.6, 0.02, 1), gapMat);
  group.add(backing);

  const skin = new THREE.Mesh(panel(w - gap * 2, h - gap * 2, d, 0.04, 2), shellMat);
  skin.position.z = d * 0.18;
  group.add(skin);

  return group;
}

/** 桁架：一组斜撑 + 纵梁，远看就是空间站骨架。 */
export function truss(
  length: number,
  width: number,
  mat: THREE.Material,
  segments = 6,
): THREE.Group {
  const group = new THREE.Group();
  const beam = new THREE.BoxGeometry(length / segments, width * 0.06, width * 0.06);
  const diagLen = Math.hypot(length / segments, width);
  const diag = new THREE.BoxGeometry(diagLen, width * 0.045, width * 0.045);

  for (let i = 0; i < segments; i += 1) {
    const x = -length / 2 + (i + 0.5) * (length / segments);

    for (const [y, z] of [
      [width / 2, width / 2],
      [width / 2, -width / 2],
      [-width / 2, width / 2],
      [-width / 2, -width / 2],
    ]) {
      const rail = new THREE.Mesh(beam, mat);
      rail.position.set(x, y, z);
      group.add(rail);
    }

    for (const y of [width / 2, -width / 2]) {
      for (const z of [width / 2, -width / 2]) {
        const strut = new THREE.Mesh(diag, mat);
        strut.position.set(x, y * 0.2, z);
        strut.rotation.y = (i % 2 ? 1 : -1) * Math.PI * 0.28;
        strut.rotation.z = y > 0 ? 0.5 : -0.5;
        group.add(strut);
      }
    }
  }

  return group;
}

/** 随机小方块群：不需要逻辑，只要视觉密度。 */
export function greebles(
  count: number,
  area: { x: number; y: number; z: number },
  mat: THREE.Material,
  rand: () => number,
): THREE.Group {
  const group = new THREE.Group();
  const geometries = [
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
    new THREE.BoxGeometry(1, 0.4, 1),
  ];

  for (let i = 0; i < count; i += 1) {
    const scale = 0.15 + rand() * 0.55;
    const mesh = new THREE.Mesh(geometries[Math.floor(rand() * geometries.length)], mat);
    mesh.position.set(
      (rand() - 0.5) * area.x,
      (rand() - 0.5) * area.y,
      (rand() - 0.5) * area.z,
    );
    mesh.scale.set(
      scale * (0.6 + rand()),
      scale * (0.4 + rand() * 0.8),
      scale * (0.6 + rand()),
    );
    mesh.rotation.set(rand() * 0.4, rand() * Math.PI, rand() * 0.4);
    group.add(mesh);
  }

  return group;
}

/** 灯带：细长发光条。 */
export function lightStrip(
  length: number,
  thickness: number,
  mat: THREE.Material,
): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(length, thickness, thickness * 0.6), mat);
}
