#!/usr/bin/env node
/**
 * Attach packed ORM textures + material factors to Blender-exported GLBs.
 *
 * Usage:
 *   node scripts/cyber-city/postprocess-gltf.mjs towers public/cyber-city/models/towers.glb public/cyber-city/models/towers_pbr.glb
 *   node scripts/cyber-city/postprocess-gltf.mjs props  public/cyber-city/models/props.glb  public/cyber-city/models/props_pbr.glb
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const ROOT = resolve(new URL('../..', import.meta.url).pathname);
const PUBLIC = join(ROOT, 'public/cyber-city');
const manifestName = process.argv[2];
const input = process.argv[3];
const output = process.argv[4];
if (!manifestName || !input || !output) {
  console.error('usage: postprocess-gltf.mjs <k044|k003> <in.glb> <out.glb>');
  process.exit(1);
}

const manifest = JSON.parse(await readFile(join(ROOT, `scripts/cyber-city/manifest-${manifestName}.json`), 'utf8'));
const byName = new Map(manifest.map((entry) => [entry.name, entry]));

function baseName(name) {
  return name.replace(/\.\d+$/, '').replace(/^LOD1_/, '');
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
const root = doc.getRoot();

const textures = new Map();
async function ormTexture(entry) {
  if (!entry.orm) return null;
  if (textures.has(entry.orm)) return textures.get(entry.orm);
  const p = join(PUBLIC, entry.orm);
  if (!existsSync(p)) {
    console.warn('missing ORM', p);
    return null;
  }
  const bytes = await readFile(p);
  const tex = doc.createTexture(entry.name + '_orm')
    .setImage(bytes)
    .setMimeType('image/webp');
  textures.set(entry.orm, tex);
  return tex;
}

let touched = 0;
for (const mat of root.listMaterials()) {
  const key = baseName(mat.getName());
  const entry = byName.get(key);
  if (!entry) {
    console.warn('no manifest entry for material', mat.getName());
    continue;
  }
  touched += 1;

  const tex = await ormTexture(entry);
  if (tex) {
    mat.setMetallicRoughnessTexture(tex);
    mat.setOcclusionTexture(tex);
    mat.getMetallicRoughnessTextureInfo()?.setWrapS(10497).setWrapT(10497);
    mat.getOcclusionTextureInfo()?.setWrapS(10497).setWrapT(10497);
    mat.setOcclusionStrength(1.0);
    mat.setRoughnessFactor(1.0);
    mat.setMetallicFactor(1.0);
  } else {
    mat.setRoughnessFactor(entry.roughness ?? 0.7);
    mat.setMetallicFactor(entry.metalness ?? 0.0);
  }

  const col = entry.color ?? [1, 1, 1];
  if (!entry.base) {
    mat.setBaseColorFactor([col[0], col[1], col[2], 1]);
  }
  if (entry.emissive) {
    mat.setEmissiveFactor(entry.emissive);
    const ext = mat.getExtension('KHR_materials_emissive_strength');
    // Extension instances require the document's extension registry; Blender already
    // wrote KHR_materials_emissive_strength, so update the factor only.
    if (ext && typeof ext.setEmissiveStrength === 'function') {
      ext.setEmissiveStrength(entry.emissiveStrength ?? 1);
    }
  }

  // Hard alpha for lettering / grating; blended for cloth.
  if (entry.alpha) {
    if (key === 'Clothes') {
      mat.setAlphaMode('BLEND');
    } else {
      mat.setAlphaMode('MASK');
      mat.setAlphaCutoff(entry.alphaCutoff ?? 0.45);
    }
  }

  // Single-sided architecture saves fill rate. Planes and cloth stay two-sided.
  const twoSided = new Set(['Clothes', 'Characters', 'Pic_Banners', 'MetalGrating', 'Decals', 'Glass', 'GlsE', 'GlsF', 'GlassBlack', 'Window', 'Material #25']);
  mat.setDoubleSided(twoSided.has(key));
}

await io.write(output, doc);
console.log(`materials updated: ${touched}; wrote ${output}`);
