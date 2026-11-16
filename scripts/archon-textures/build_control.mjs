#!/usr/bin/env node
/** Control build: re-encode the decompressed source GLB with no texture/material/geometry changes.
 * Used as the "before" model for renders after public/models/rta_archon.glb is replaced. */
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const WORK = path.resolve(process.env.ARCHON_WORK ?? path.join(REPO, 'work'));
const io = new NodeIO().registerExtensions([...KHRONOS_EXTENSIONS, EXTTextureWebP]);
const doc = await io.read(path.join(WORK, 'archon.gltf'));
const glb = await io.writeBinary(doc);
const out = process.argv[2] ?? path.join(WORK, 'glb/archon_control.glb');
const fs = await import('node:fs');
fs.writeFileSync(out, glb);
console.log('wrote', out, glb.length);
