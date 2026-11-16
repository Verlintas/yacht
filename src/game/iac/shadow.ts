import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PortWorld } from './port';

/**
 * One-draw shadow proxy.
 *
 * The authored port GLB and the merged environment detail are visually rich
 * but have dozens of casters. Rendering all of them into the sun depth map
 * costs almost as much as the visible pass. Instead, the visible meshes keep
 * receiveShadow and we cast from one merged blockout on layer 1 only.
 *
 * The sun shadow camera is restricted to layer 1, so Three.js still renders
 * the proxy into the shadow map while the main camera (layer 0) never sees it.
 */

function box(
  w: number, h: number, d: number,
  x: number, y: number, z: number,
  yaw = 0,
): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.rotateY(yaw);
  geo.translate(x, y, z);
  return geo;
}

export interface ShadowProxyResult {
  mesh: THREE.Mesh;
  count: number;
}

export function installShadowProxy(
  scene: THREE.Scene,
  sun: THREE.DirectionalLight,
  port: PortWorld,
  padY: number,
): ShadowProxyResult {
  // The proxy replaces every authored caster. Keeping receiveShadow on the
  // visible meshes is what makes the single shadow map still land on them.
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mesh !== port.npcBlobs) mesh.castShadow = false;
  });

  const parts: THREE.BufferGeometry[] = [];
  const y = padY;

  // Terminal shell + landside hall + canopy; the objects that anchor the
  // long late-afternoon shadow across the walkway.
  parts.push(box(118, 21, 102, -145, y + 10.5, 25));
  parts.push(box(118, 7, 18, -145, y + 3.5, 85));
  parts.push(box(50, 1.0, 8, -145, y + 8.3, 97));
  // T2 sign cabinet
  parts.push(box(15.4, 4.2, 0.5, -145, y + 11.3, 94.0));

  // Gantry towers + beam over the A-30.
  parts.push(box(8, 36, 8, -40, y + 18, 0));
  parts.push(box(8, 36, 8, 40, y + 18, 0));
  parts.push(box(80, 2.2, 3.0, 0, y + 34, 0));

  // A-30 hull + fin + boarding ramp.
  parts.push(box(25, 8.5, 29, 0, y + 5.2, 0));
  parts.push(box(10, 7.0, 12, 0, y + 10.0, -4));
  parts.push(box(3.0, 0.8, 8.4, 0, y + 1.05, 17.5, 0.13));
  // Landing gear shadow contacts.
  parts.push(box(1.1, 2.2, 1.1, -7, y + 1.1, 8));
  parts.push(box(1.1, 2.2, 1.1, 7, y + 1.1, 8));
  parts.push(box(1.1, 2.2, 1.1, 0, y + 1.1, -9));

  // Container outfitter and the two pad cargo boxes.
  parts.push(box(12.6, 3.4, 3.4, -112, y + 1.7, 100));
  parts.push(box(12.4, 3.2, 1.8, -112, y + 1.6, 103.0));
  parts.push(box(12, 2.9, 3.0, 58, y + 1.45, 26));
  parts.push(box(12, 2.9, 3.0, 66, y + 1.45, 36));
  parts.push(box(3.2, 2.0, 1.7, -42, y + 1.0, 35));

  // Fuel tanks / farm, enough to ground the west silhouette.
  parts.push(box(15, 18, 14, -342.5, y + 9, 60));
  parts.push(box(10, 18, 10, -340, y + 9, 38));

  // Raised-apron retaining wall: the actual silhouette that grounds the
  // platform. The old flat-terrace perimeter wall was removed from the art,
  // so it must not keep casting a phantom shadow line across the basin.
  const wallBase = 36.8;
  const wallTop = 41.1;
  parts.push(box(1364, wallTop - wallBase, 1.2, 0, (wallBase + wallTop) / 2, -1102));
  parts.push(box(1.2, wallTop - wallBase, 1364, -682, (wallBase + wallTop) / 2, -420));
  parts.push(box(1.2, wallTop - wallBase, 1364, 682, (wallBase + wallTop) / 2, -420));
  parts.push(box(924, wallTop - wallBase, 1.2, -220, (wallBase + wallTop) / 2, 262));
  parts.push(box(424, wallTop - wallBase, 1.2, 470, (wallBase + wallTop) / 2, 262));

  // Deck hangars, tank farm and container stacks.
  parts.push(box(210, 24, 120, -420, y + 12, -650));
  parts.push(box(180, 20, 100, 390, y + 10, -540));
  parts.push(box(42, 26, 60, -490, y + 13, -798));
  parts.push(box(16, 12, 38, 515, y + 6, -95));

  // Terrace service yard below the south wall: tank pair + container row.
  parts.push(box(20, 16, 8, 540, 44, 324));
  parts.push(box(48, 3.2, 20, 480, 38.5, 282));

  const merged = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('shadow proxy merge failed');

  const material = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const mesh = new THREE.Mesh(merged, material);
  mesh.name = 'IAC_ShadowProxy';
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.layers.set(1);
  scene.add(mesh);

  // Restrict the sun's depth pass to the proxy layer only. This is the switch
  // that turns ~40 shadow draws into one.
  sun.shadow.camera.layers.set(1);
  sun.shadow.needsUpdate = true;

  return { mesh, count: parts.length };
}
