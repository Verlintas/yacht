#!/usr/bin/env node
/**
 * Verify the optimized GLB preserves node transform, triangle positions, and
 * normals. Uses Accessor.getElement(), which respects interleaved bufferViews
 * and KHR_mesh_quantization normalized attributes.
 *
 * Usage: node verify_geometry.mjs [final.glb]
 */
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const WORK = path.resolve(process.env.ARCHON_WORK ?? path.join(REPO, 'work'));
const io = new NodeIO().registerExtensions([...KHRONOS_EXTENSIONS, EXTTextureWebP]);

async function load(file) {
  return io.read(path.isAbsolute(file) ? file : path.join(WORK, file));
}

function readPrim(doc) {
  const node = doc.getRoot().listNodes()[0];
  const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
  const pa = prim.getAttribute('POSITION');
  const na = prim.getAttribute('NORMAL');
  const n = pa.getCount();
  const verts = [];
  const norms = [];
  for (let i = 0; i < n; i++) {
    verts.push(pa.getElement(i, []));
    norms.push(na.getElement(i, []));
  }
  const idx = prim.getIndices();
  const indices = idx ? Array.from(idx.getArray()) : verts.map((_, i) => i);
  return { node, prim, verts, norms, indices };
}

const key = (v) => v.map((x) => Math.round(x * 1e4)).join(',');

function triSet(verts, indices) {
  const set = new Set();
  for (let i = 0; i < indices.length; i += 3) {
    const t = [key(verts[indices[i]]), key(verts[indices[i + 1]]), key(verts[indices[i + 2]])].sort();
    set.add(t.join('|'));
  }
  return set;
}

const before = await load('archon.gltf');
const after = await load(process.argv[2] ?? 'glb/archon_optimized.glb');
const A = readPrim(before);
const B = readPrim(after);

const ta = A.node.getTranslation(), tb = B.node.getTranslation();
const sa = A.node.getScale(), sb = B.node.getScale();
console.log('node', A.node.getName(), B.node.getName());
console.log('translation equal', ta.every((v, i) => v === tb[i]), ta);
console.log('scale equal', sa.every((v, i) => v === sb[i]), sa);
console.log('triangles', A.indices.length / 3, B.indices.length / 3);
console.log('vertices', A.verts.length, B.verts.length);
console.log('TANGENT', !!A.prim.getAttribute('TANGENT'), '->', !!B.prim.getAttribute('TANGENT'));
console.log('indices', !!A.prim.getIndices(), '->', !!B.prim.getIndices());

const posA = new Set(A.verts.map(key));
const posB = new Set(B.verts.map(key));
let missingPos = 0;
for (const p of posA) if (!posB.has(p)) missingPos++;
console.log('unique positions preserved', posA.size - missingPos, '/', posA.size, 'missing', missingPos);

const triA = triSet(A.verts, A.indices);
const triB = triSet(B.verts, B.indices);
let missingTri = 0;
for (const t of triA) if (!triB.has(t)) missingTri++;
console.log('triangle keys preserved', triA.size - missingTri, '/', triA.size, 'missing', missingTri,
  '(1e-4 local precision ≈ 0.02 world units; bbox is exact)');

const groups = new Map();
for (let i = 0; i < B.verts.length; i++) {
  const k = key(B.verts[i]);
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(B.norms[i]);
}
let worst = 1, sum = 0, count = 0;
for (let i = 0; i < A.verts.length; i++) {
  const g = groups.get(key(A.verts[i]));
  if (!g) continue;
  let best = -1;
  for (const n of g) {
    const d = A.norms[i][0] * n[0] + A.norms[i][1] * n[1] + A.norms[i][2] * n[2];
    if (d > best) best = d;
  }
  worst = Math.min(worst, best);
  sum += best;
  count++;
}
console.log('normal dot to source: worst', worst.toFixed(5), 'mean', (sum / count).toFixed(5), 'samples', count);

const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
for (const v of B.verts) for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], v[i]); mx[i] = Math.max(mx[i], v[i]); }
console.log('local bbox', mn, mx, 'world size', mx.map((v, i) => (v - mn[i]) * sb[i]));
