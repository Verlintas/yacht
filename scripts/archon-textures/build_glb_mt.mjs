#!/usr/bin/env node
/**
 * Rebuild rta_archon.glb with correct MikkTSpace tangents and authored maps.
 *
 * IMPORTANT: do NOT use @gltf-transform/functions `tangents()` on this asset.
 * Its `unweld()` step corrupts KHR_mesh_quantization here (normalized int16
 * POSITION + normalized int8 NORMAL; interleaved bufferView). The result has
 * scrambled triangles/normals and bright specular streaks. This script unwelds
 * manually from the index buffer, dequantizes to float32, runs mikktspace on
 * the exact triangles, and writes unindexed attributes. MikkTSpace requires
 * unindexed triangles; do not re-weld after generating tangents.
 *
 * Usage:
 *   node build_glb_mt.mjs [out.glb]
 * Env:
 *   ARCHON_WORK   work dir (default <repo>/work)
 *   PNG=1         keep all textures PNG (needed by gltf-transform uastc/etc1s)
 *   ALBEDO_PATH / NORMAL_PATH / ORM_PATH / EMISSIVE_PATH  texture overrides
 *
 * Then:
 *   npx @gltf-transform/cli meshopt out.glb out_opt.glb --level high
 *   python3 dedupe_occlusion.py out_opt.glb
 */
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import { generateTangents } from 'mikktspace';
import sharp from 'sharp';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const WORK = path.resolve(process.env.ARCHON_WORK ?? path.join(REPO, 'work'));
const outPath = process.argv[2] ?? path.join(WORK, 'glb/archon_optimized.glb');
const usePng = process.env.PNG === '1';
const albedoPath = process.env.ALBEDO_PATH ?? path.join(WORK, 'tex/final/albedo_final.png');
const normalPath = process.env.NORMAL_PATH ?? path.join(WORK, 'tex/final/normal_final.png');
const ormPath = process.env.ORM_PATH ?? path.join(WORK, 'tex/final/orm_final.png');
const emissivePath = process.env.EMISSIVE_PATH ?? path.join(WORK, 'tex/final/emissive_final.png');

const io = new NodeIO().registerExtensions([...KHRONOS_EXTENSIONS, EXTTextureWebP]);
const doc = await io.read(path.join(WORK, 'archon.gltf'));
const root = doc.getRoot();
const material = root.listMaterials().find((m) => m.getName() === 'rta_archon_hull') ?? root.listMaterials()[0];
const prim = root.listMeshes()[0].listPrimitives()[0];
const ormTexture = material.getMetallicRoughnessTexture();
const emissiveTexture = material.getEmissiveTexture();
if (!ormTexture || !emissiveTexture) throw new Error('missing expected texture slots');

// ---------- manual unweld + MikkTSpace tangents ----------
const posAcc = prim.getAttribute('POSITION');
const normAcc = prim.getAttribute('NORMAL');
const uvAcc = prim.getAttribute('TEXCOORD_0');
const idxAcc = prim.getIndices();
if (!posAcc || !normAcc || !uvAcc || !idxAcc) throw new Error('missing geometry attributes');

const posRaw = posAcc.getArray();
const normRaw = normAcc.getArray();
const uvRaw = uvAcc.getArray();
const idx = idxAcc.getArray();
const posScale = posAcc.getNormalized() && posRaw instanceof Int16Array ? 1 / 32767 : 1;
const normScale = normAcc.getNormalized() && normRaw instanceof Int8Array ? 1 / 127 : 1;

const triCount = idx.length / 3;
const vertCount = triCount * 3;
const P = new Float32Array(vertCount * 3);
const N = new Float32Array(vertCount * 3);
const U = new Float32Array(vertCount * 2);

for (let t = 0; t < triCount; t++) {
  for (let k = 0; k < 3; k++) {
    const src = idx[t * 3 + k];
    const dst = t * 3 + k;
    let nx = normRaw[src * 3] * normScale;
    let ny = normRaw[src * 3 + 1] * normScale;
    let nz = normRaw[src * 3 + 2] * normScale;
    const len = Math.hypot(nx, ny, nz) || 1;
    P[dst * 3] = posRaw[src * 3] * posScale;
    P[dst * 3 + 1] = posRaw[src * 3 + 1] * posScale;
    P[dst * 3 + 2] = posRaw[src * 3 + 2] * posScale;
    N[dst * 3] = nx / len;
    N[dst * 3 + 1] = ny / len;
    N[dst * 3 + 2] = nz / len;
    U[dst * 2] = uvRaw[src * 2];
    U[dst * 2 + 1] = uvRaw[src * 2 + 1];
  }
}

const T = generateTangents(P, N, U);
for (let i = 0; i < T.length; i += 4) T[i + 3] *= -1; // glTF convention

prim.setAttribute('POSITION', doc.createAccessor('POSITION').setType('VEC3').setArray(P));
prim.setAttribute('NORMAL', doc.createAccessor('NORMAL').setType('VEC3').setArray(N));
prim.setAttribute('TEXCOORD_0', doc.createAccessor('TEXCOORD_0').setType('VEC2').setArray(U));
prim.setAttribute('TANGENT', doc.createAccessor('TANGENT').setType('VEC4').setArray(T));
prim.setIndices(null);

// ---------- textures ----------
async function encode(texture, file, slot) {
  if (usePng) {
    texture.setImage(new Uint8Array(fs.readFileSync(file))).setMimeType('image/png');
    return;
  }
  let buf;
  if (slot === 'normal') {
    // Normal maps are data: lossless WebP. Kept only if NORMAL_PATH is set;
    // otherwise the original normal_1.webp bytes are left untouched.
    buf = await sharp(file).webp({ lossless: true, effort: 6 }).toBuffer();
  } else if (slot === 'orm') {
    buf = await sharp(file).webp({ lossless: true, effort: 6 }).toBuffer();
  } else {
    buf = await sharp(file).webp({ quality: slot === 'albedo' ? 95 : 92, effort: 6 }).toBuffer();
  }
  texture.setImage(new Uint8Array(buf)).setMimeType('image/webp');
}

await encode(material.getBaseColorTexture(), albedoPath, 'albedo');
if (usePng || process.env.NORMAL_PATH) await encode(material.getNormalTexture(), normalPath, 'normal');
await encode(ormTexture, ormPath, 'orm');
await encode(emissiveTexture, emissivePath, 'emissive');

material.setOcclusionTexture(ormTexture);
material.setOcclusionStrength(1.0);
material.getOcclusionTextureInfo().setTexCoord(0);
material.getMetallicRoughnessTextureInfo().setTexCoord(0);
material.setMetallicFactor(1.0);
material.setRoughnessFactor(1.0);
material.setEmissiveFactor([1, 1, 1]);

await doc.transform(prune());
const glb = await io.writeBinary(doc);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, glb);
console.log('wrote', outPath, glb.length, 'bytes');
console.log('vertices', vertCount, 'triangles', triCount, 'indices', !!prim.getIndices(),
  'tangent', !!prim.getAttribute('TANGENT'));
console.log('node', root.listNodes().map((n) => `${n.getName()}:${n.getScale().map((v) => v.toFixed(6)).join(',')}`).join(' | '));
