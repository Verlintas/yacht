import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export interface MergeResult {
  group: THREE.Group;
  triangles: number;
  drawCalls: number;
  materials: Map<string, THREE.Material>;
}

function materialKey(name: string): string {
  return name.replace(/\.\d+$/, '').replace(/^LOD1_/, '').trim();
}

function toFloatAttribute(src: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, itemSize: number): THREE.BufferAttribute {
  const arr = new Float32Array(src.count * itemSize);
  const v = new THREE.Vector3();
  const uv = new THREE.Vector2();
  for (let i = 0; i < src.count; i += 1) {
    if (itemSize === 2) {
      uv.fromBufferAttribute(src as THREE.BufferAttribute, i);
      arr[i * 2] = uv.x;
      arr[i * 2 + 1] = uv.y;
    } else {
      v.fromBufferAttribute(src as THREE.BufferAttribute, i);
      arr[i * 3] = v.x;
      arr[i * 3 + 1] = v.y;
      arr[i * 3 + 2] = v.z;
    }
  }
  return new THREE.BufferAttribute(arr, itemSize);
}

/** Copy position/normal/uv into plain float attributes (handles KHR_mesh_quantization). */
function floatGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const pos = source.getAttribute('position');
  if (pos) g.setAttribute('position', toFloatAttribute(pos, 3));
  const normal = source.getAttribute('normal');
  if (normal) g.setAttribute('normal', toFloatAttribute(normal, 3));
  const uv = source.getAttribute('uv');
  if (uv) g.setAttribute('uv', toFloatAttribute(uv, 2));
  if (source.index) g.setIndex(source.index.clone());
  return g;
}

/**
 * Bake a loaded glTF hierarchy into one mesh per material.
 * Used to keep the authored tower kit at ~20 draw calls instead of 60+.
 */
export function mergeByMaterial(
  root: THREE.Object3D,
  opts: {
    materialMap?: Map<string, THREE.Material>;
    materialTransform?: (mat: THREE.Material, key: string) => THREE.Material;
    batchKey?: (sourceKey: string) => string;
    skip?: (mesh: THREE.Mesh) => boolean;
  } = {},
): MergeResult {
  root.updateMatrixWorld(true);
  const buckets = new Map<string, { material: THREE.Material; geometries: THREE.BufferGeometry[] }>();
  let triangles = 0;

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (opts.skip?.(mesh)) return;
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!mat) return;
    const sourceKey = materialKey(mat.name);
    const key = opts.batchKey ? opts.batchKey(sourceKey) : sourceKey;
    let bucket = buckets.get(key);
    if (!bucket) {
      const source = opts.materialMap?.get(key) ?? opts.materialMap?.get(sourceKey) ?? mat;
      const material = opts.materialTransform ? opts.materialTransform(source, key) : source;
      bucket = { material, geometries: [] };
      buckets.set(key, bucket);
    }

    const g = floatGeometry(mesh.geometry);
    g.applyMatrix4(mesh.matrixWorld);
    g.clearGroups();
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) {
      const count = g.attributes.position.count;
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
    }
    if (!g.index) {
      const count = g.attributes.position.count;
      const indices = new Uint32Array(count);
      for (let i = 0; i < count; i += 1) indices[i] = i;
      g.setIndex(new THREE.BufferAttribute(indices, 1));
    }
    g.morphAttributes = {};
    bucket.geometries.push(g);
    triangles += (g.index?.count ?? 0) / 3;
  });

  const group = new THREE.Group();
  group.name = 'merged';
  const materials = new Map<string, THREE.Material>();
  let drawCalls = 0;
  for (const [key, bucket] of buckets) {
    if (!bucket.geometries.length) continue;
    const merged = mergeGeometries(bucket.geometries, false);
    for (const g of bucket.geometries) g.dispose();
    if (!merged) {
      console.warn('merge failed for material', key);
      continue;
    }
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    const mesh = new THREE.Mesh(merged, bucket.material);
    mesh.name = `merged_${key}`;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
    materials.set(key, bucket.material);
    drawCalls += 1;
  }
  return { group, triangles, drawCalls, materials };
}

/** Merge a list of prop instance clones (already positioned) by material. */
export function mergeInstances(
  root: THREE.Object3D,
  opts: Parameters<typeof mergeByMaterial>[1] = {},
): MergeResult {
  return mergeByMaterial(root, opts);
}
