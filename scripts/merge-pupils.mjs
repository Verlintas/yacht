#!/usr/bin/env node
/**
 * Merge the tiny Pupils primitives into the Gloves material to remove three
 * draw calls from the NPC asset. Run from the repository root after exporting
 * npcs.glb and before final glTF optimization.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { joinPrimitives } from '@gltf-transform/functions';

const input = process.argv[2] ?? '/private/tmp/npcs-base.glb';
const output = process.argv[3] ?? '/private/tmp/npcs-merged.glb';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
const root = doc.getRoot();
const mats = root.listMaterials();
const pupil = mats.find((m) => m.getName() === 'Pupils');
if (!pupil) throw new Error('Pupils material not found');
let count = 0;
let gloveName = '';
for (const mesh of root.listMeshes()) {
  const prims = mesh.listPrimitives();
  const glove =
    prims.map((p) => p.getMaterial()).find((m) => m?.getName() === 'Gloves_Black') ??
    prims.map((p) => p.getMaterial()).find((m) => m?.getName() === 'Gloves');
  if (!glove) continue;
  gloveName = glove.getName();
  for (const prim of prims) {
    if (prim.getMaterial() === pupil) {
      prim.setMaterial(glove);
      count += 1;
    }
  }
}
pupil.dispose();
// Merge primitives that now share a material (pupils + gloves) into one draw call.
for (const mesh of root.listMeshes()) {
  const groups = new Map();
  for (const prim of mesh.listPrimitives()) {
    const key = prim.getMaterial()?.getName() ?? 'none';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(prim);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    try {
      const merged = joinPrimitives(group);
      for (const prim of group) prim.dispose();
      mesh.addPrimitive(merged);
    } catch (err) {
      console.warn('primitive join skipped', err.message);
    }
  }
}
console.log(`merged ${count} pupil primitives into ${gloveName}`);
await io.write(output, doc);
