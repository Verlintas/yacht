import * as THREE from 'three';

/**
 * Runtime heightfield + terrain mesh for the IAC 16 km slice.
 *
 * The heightfield is authored offline by tools/terrain/generate_iac_16km.py.
 * The visual mesh and the collision sampler read the same R16 grid, so the
 * player never walks on a different surface from the one that is drawn.
 */

export interface TerrainMeta {
  schema: number;
  name: string;
  generator: string;
  seed: number;
  grid: { width: number; height: number; spacing_m: number };
  extent_m: number;
  heightmap: {
    file: string;
    format: string;
    min_h: number;
    max_h: number;
    row_order: string;
    origin: string;
    decode: string;
  };
  backdrop: {
    file: string;
    grid: number;
    extent_m: number;
    min_h: number;
    max_h: number;
  };
  plateau: {
    height_m: number;
    size_m: [number, number];
    corner_radius_m: number;
    port_flat_m: [number, number];
  };
  maps: {
    splat: string;
    splat_channels: string[];
    macro: string;
  };
  features: Record<string, string>;
}

export interface TerrainAssets {
  meta: TerrainMeta;
  field: TerrainField;
  mesh: THREE.Mesh;
  backdrop: THREE.Mesh;
  road: THREE.Group | null;
  material: THREE.MeshStandardMaterial;
}

const HALF = 8192;
const DETAIL_UV = 0.13;

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

function decode(data: Uint16Array, i: number, min: number, max: number): number {
  return min + (data[i] / 65535) * (max - min);
}

export class TerrainField {
  readonly grid: number;
  readonly spacing: number;
  readonly half: number;
  readonly minH: number;
  readonly maxH: number;
  readonly padY: number;
  readonly data: Uint16Array;

  constructor(data: Uint16Array, meta: TerrainMeta, padY: number) {
    this.data = data;
    this.grid = meta.grid.width;
    this.spacing = meta.grid.spacing_m;
    this.half = meta.extent_m / 2;
    this.minH = meta.heightmap.min_h;
    this.maxH = meta.heightmap.max_h;
    this.padY = padY;
  }

  raw(x: number, z: number): number {
    const gx = clamp((x + this.half) / this.spacing, 0, this.grid - 1.000001);
    const gz = clamp((z + this.half) / this.spacing, 0, this.grid - 1.000001);
    const x0 = Math.floor(gx);
    const z0 = Math.floor(gz);
    const x1 = Math.min(x0 + 1, this.grid - 1);
    const z1 = Math.min(z0 + 1, this.grid - 1);
    const tx = gx - x0;
    const tz = gz - z0;
    const a = decode(this.data, z0 * this.grid + x0, this.minH, this.maxH);
    const b = decode(this.data, z0 * this.grid + x1, this.minH, this.maxH);
    const c = decode(this.data, z1 * this.grid + x0, this.minH, this.maxH);
    const d = decode(this.data, z1 * this.grid + x1, this.minH, this.maxH);
    return (
      a * (1 - tx) * (1 - tz) +
      b * tx * (1 - tz) +
      c * (1 - tx) * tz +
      d * tx * tz
    );
  }

  /** Visible terrain surface height (no pad override). */
  heightAt(x: number, z: number): number {
    if (x < -this.half || x > this.half || z < -this.half || z > this.half) {
      return this.raw(clamp(x, -this.half + 1, this.half - 1), clamp(z, -this.half + 1, this.half - 1));
    }
    return this.raw(x, z);
  }

  /**
   * Walkable surface height. The authored port deck sits 2 cm above the
   * flat plateau; keep the player on that deck without a visible step.
   */
  groundAt(x: number, z: number): number {
    const h = this.heightAt(x, z);
    // The authored deck is a 1200 m square: x ±630, z -1050..210. It sits
    // 32 cm above the flat plateau, so treat the deck footprint as a raised
    // walkable surface and let the player step down at its edge.
    const onDeck = Math.abs(x) < 635 && z > -1055 && z < 215;
    const onApron = Math.abs(x) < 770 && Math.abs(z) < 670;
    if (onDeck || onApron) return Math.max(h, this.padY);
    return h;
  }

  normalAt(x: number, z: number, target = new THREE.Vector3()): THREE.Vector3 {
    const e = this.spacing;
    const hl = this.heightAt(x - e, z);
    const hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e);
    const hu = this.heightAt(x, z + e);
    return target.set(hl - hr, 2 * e, hd - hu).normalize();
  }
}

function loadU16(url: string): Promise<Uint16Array> {
  return fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`);
      return response.arrayBuffer();
    })
    .then((buffer) => new Uint16Array(buffer));
}

function texture(
  loader: THREE.TextureLoader,
  url: string,
  colorSpace: THREE.ColorSpace,
  wrap: THREE.Wrapping,
  flipY = true,
): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = colorSpace;
        tex.wrapS = wrap;
        tex.wrapT = wrap;
        tex.flipY = flipY;
        tex.anisotropy = 8;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        resolve(tex);
      },
      undefined,
      reject,
    );
  });
}

function buildGridMesh(
  field: TerrainField,
  meta: TerrainMeta,
  material: THREE.Material,
): THREE.Mesh {
  const n = field.grid;
  const count = n * n;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const data = field.data;
  const minH = meta.heightmap.min_h;
  const maxH = meta.heightmap.max_h;

  const heightAt = (ix: number, iz: number): number => {
    const x = Math.max(0, Math.min(n - 1, ix));
    const z = Math.max(0, Math.min(n - 1, iz));
    return decode(data, z * n + x, minH, maxH);
  };

  for (let z = 0; z < n; z += 1) {
    for (let x = 0; x < n; x += 1) {
      const i = z * n + x;
      const px = -HALF + x * field.spacing;
      const pz = -HALF + z * field.spacing;
      const h = heightAt(x, z);
      positions[i * 3 + 0] = px;
      positions[i * 3 + 1] = h;
      positions[i * 3 + 2] = pz;
      uvs[i * 2 + 0] = x / (n - 1);
      uvs[i * 2 + 1] = z / (n - 1);

      const hl = heightAt(x - 1, z);
      const hr = heightAt(x + 1, z);
      const hd = heightAt(x, z - 1);
      const hu = heightAt(x, z + 1);
      const nx = hl - hr;
      const ny = 2 * field.spacing;
      const nz = hd - hu;
      const inv = 1 / Math.hypot(nx, ny, nz);
      normals[i * 3 + 0] = nx * inv;
      normals[i * 3 + 1] = ny * inv;
      normals[i * 3 + 2] = nz * inv;
    }
  }

  const indices = new Uint32Array((n - 1) * (n - 1) * 6);
  let p = 0;
  for (let z = 0; z < n - 1; z += 1) {
    for (let x = 0; x < n - 1; x += 1) {
      const a = z * n + x;
      const b = (z + 1) * n + x;
      const c = z * n + x + 1;
      const d = (z + 1) * n + x + 1;
      indices[p++] = a;
      indices[p++] = b;
      indices[p++] = c;
      indices[p++] = c;
      indices[p++] = b;
      indices[p++] = d;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Terrain16k';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.frustumCulled = false;
  return mesh;
}

function buildBackdrop(
  data: Uint16Array,
  meta: TerrainMeta,
): THREE.Mesh {
  const n = meta.backdrop.grid;
  const extent = meta.backdrop.extent_m;
  const spacing = extent / (n - 1);
  const positions = new Float32Array(n * n * 3);
  const indices = new Uint32Array((n - 1) * (n - 1) * 6);
  const minH = meta.backdrop.min_h;
  const maxH = meta.backdrop.max_h;
  for (let z = 0; z < n; z += 1) {
    for (let x = 0; x < n; x += 1) {
      const i = z * n + x;
      positions[i * 3 + 0] = -extent / 2 + x * spacing;
      positions[i * 3 + 1] = minH + (data[i] / 65535) * (maxH - minH);
      positions[i * 3 + 2] = -extent / 2 + z * spacing;
    }
  }
  let p = 0;
  for (let z = 0; z < n - 1; z += 1) {
    for (let x = 0; x < n - 1; x += 1) {
      const a = z * n + x;
      const b = (z + 1) * n + x;
      const c = z * n + x + 1;
      const d = (z + 1) * n + x + 1;
      indices[p++] = a;
      indices[p++] = b;
      indices[p++] = c;
      indices[p++] = c;
      indices[p++] = b;
      indices[p++] = d;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({
    color: 0x6a5947,
    roughness: 1,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'TerrainBackdrop';
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  mesh.frustumCulled = false;
  return mesh;
}

function buildRoad(field: TerrainField, asphalt: THREE.Material | null): THREE.Group {
  const group = new THREE.Group();
  group.name = 'CargoRoad';
  const points: Array<[number, number]> = [
    [252, 45],
    [252, 130],
    [240, 230],
    [222, 340],
    [212, 460],
    [220, 570],
    [226, 700],
  ];
  const samples: Array<{ x: number; z: number; nx: number; nz: number; d: number }> = [];
  let distance = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x0, z0] = points[i];
    const [x1, z1] = points[i + 1];
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(len / 5));
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps;
      const x = x0 + dx * t;
      const z = z0 + dz * t;
      const nx = dz / len;
      const nz = -dx / len;
      samples.push({ x, z, nx, nz, d: distance + len * t });
    }
    distance += len;
  }
  const [lx, lz] = points[points.length - 1];
  samples.push({ x: lx, z: lz, nx: 0, nz: -1, d: distance });

  const width = 14;
  const y = field.padY + 0.025;
  const positions = new Float32Array(samples.length * 2 * 3);
  const uvs = new Float32Array(samples.length * 2 * 2);
  const indices = new Uint32Array((samples.length - 1) * 6);
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i];
    const left = { x: s.x + s.nx * width * 0.5, z: s.z + s.nz * width * 0.5 };
    const right = { x: s.x - s.nx * width * 0.5, z: s.z - s.nz * width * 0.5 };
    const k = i * 6;
    positions[k + 0] = left.x;
    positions[k + 1] = y;
    positions[k + 2] = left.z;
    positions[k + 3] = right.x;
    positions[k + 4] = y;
    positions[k + 5] = right.z;
    uvs[i * 4 + 0] = 0;
    uvs[i * 4 + 1] = s.d / 10;
    uvs[i * 4 + 2] = 1;
    uvs[i * 4 + 3] = s.d / 10;
  }
  let p = 0;
  for (let i = 0; i < samples.length - 1; i += 1) {
    const a = i * 2;
    const b = i * 2 + 1;
    const c = (i + 1) * 2;
    const d = (i + 1) * 2 + 1;
    indices[p++] = a;
    indices[p++] = c;
    indices[p++] = b;
    indices[p++] = b;
    indices[p++] = c;
    indices[p++] = d;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeVertexNormals();
  const mat =
    asphalt ??
    new THREE.MeshStandardMaterial({ color: 0x222324, roughness: 0.94, metalness: 0.02 });
  const road = new THREE.Mesh(geo, mat);
  road.name = 'CargoRoadSurface';
  road.receiveShadow = true;
  road.castShadow = false;
  group.add(road);

  // dashed center line, merged into one geometry
  const dashPositions: number[] = [];
  const dashIndices: number[] = [];
  let vertex = 0;
  for (let d = 16; d < distance - 10; d += 16) {
    let i = 1;
    while (i < samples.length && samples[i].d < d) i += 1;
    if (i >= samples.length) break;
    const a = samples[i - 1];
    const b = samples[i];
    const t = (d - a.d) / Math.max(1e-5, b.d - a.d);
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    const nx = a.nx;
    const nz = a.nz;
    const half = 0.18;
    const len = 3.4;
    const dx = -nz;
    const dz = nx;
    const x0 = x + nx * half;
    const z0 = z + nz * half;
    const x1 = x - nx * half;
    const z1 = z - nz * half;
    const x2 = x0 + dx * len;
    const z2 = z0 + dz * len;
    const x3 = x1 + dx * len;
    const z3 = z1 + dz * len;
    const yy = y + 0.012;
    dashPositions.push(
      x0, yy, z0,
      x1, yy, z1,
      x2, yy, z2,
      x3, yy, z3,
    );
    dashIndices.push(vertex, vertex + 2, vertex + 1, vertex + 1, vertex + 2, vertex + 3);
    vertex += 4;
  }
  if (dashPositions.length > 0) {
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.Float32BufferAttribute(dashPositions, 3));
    dg.setIndex(dashIndices);
    const dm = new THREE.MeshBasicMaterial({ color: 0xd8c18a, toneMapped: false });
    const dashes = new THREE.Mesh(dg, dm);
    dashes.name = 'CargoRoadDashes';
    group.add(dashes);
  }

  // lamp posts along the east shoulder
  const poleParts: THREE.BufferGeometry[] = [];
  const pole = new THREE.CylinderGeometry(0.12, 0.17, 8, 8);
  pole.translate(0, 4, 0);
  poleParts.push(pole);
  const base = new THREE.BoxGeometry(0.7, 0.35, 0.7);
  base.translate(0, 0.175, 0);
  poleParts.push(base);
  const arm = new THREE.BoxGeometry(1.5, 0.14, 0.14);
  arm.translate(0.65, 7.8, 0);
  poleParts.push(arm);
  const poleGeo = mergeGeometries(poleParts);
  const headGeo = new THREE.BoxGeometry(0.75, 0.12, 0.3);
  const metal = new THREE.MeshStandardMaterial({ color: 0x3b4146, roughness: 0.55, metalness: 0.75 });
  const glow = new THREE.MeshStandardMaterial({
    color: 0xffe2b0,
    emissive: 0xffc06a,
    emissiveIntensity: 2.2,
    roughness: 0.35,
  });
  const lampCount = 8;
  const poles = new THREE.InstancedMesh(poleGeo, metal, lampCount);
  const heads = new THREE.InstancedMesh(headGeo, glow, lampCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < lampCount; i += 1) {
    const d = 80 + i * 82;
    let idx = 1;
    while (idx < samples.length && samples[idx].d < d) idx += 1;
    const s = samples[Math.min(idx, samples.length - 1)];
    const side = 1;
    const x = s.x + s.nx * side * 10.5;
    const z = s.z + s.nz * side * 10.5;
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, Math.atan2(s.nx, s.nz) + Math.PI / 2, 0);
    dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x - s.nx * 1.1, y + 7.75, z - s.nz * 1.1);
    dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
  }
  poles.castShadow = false;
  heads.castShadow = false;
  group.add(poles, heads);
  return group;
}

function mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const index: number[] = [];
  let offset = 0;
  for (const g of geometries) {
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const idx = g.getIndex();
    for (let i = 0; i < p.count; i += 1) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      if (n) nor.push(n.getX(i), n.getY(i), n.getZ(i));
    }
    if (idx) {
      for (let i = 0; i < idx.count; i += 1) index.push(idx.getX(i) + offset);
    } else {
      for (let i = 0; i < p.count; i += 1) index.push(i + offset);
    }
    offset += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (nor.length) out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setIndex(index);
  return out;
}

export async function loadTerrain(
  base: string,
  padY: number,
  asphalt: THREE.Material | null = null,
): Promise<TerrainAssets> {
  const root = `${base}/iac-landing/terrain`;
  const response = await fetch(`${root}/meta.json`);
  if (!response.ok) throw new Error(`terrain meta → HTTP ${response.status}`);
  const meta = (await response.json()) as TerrainMeta;
  const [heightData, backdropData] = await Promise.all([
    loadU16(`${root}/${meta.heightmap.file}`),
    loadU16(`${root}/${meta.backdrop.file}`),
  ]);
  const field = new TerrainField(heightData, meta, padY);

  const texLoader = new THREE.TextureLoader();
  const [splat, macro, rock, dirt, grass, sand] = await Promise.all([
    texture(texLoader, `${root}/${meta.maps.splat}`, THREE.NoColorSpace, THREE.ClampToEdgeWrapping, false),
    texture(texLoader, `${root}/${meta.maps.macro}`, THREE.SRGBColorSpace, THREE.ClampToEdgeWrapping, false),
    texture(texLoader, `${root}/textures/rock_color.jpg`, THREE.SRGBColorSpace, THREE.RepeatWrapping),
    texture(texLoader, `${root}/textures/dirt_color.jpg`, THREE.SRGBColorSpace, THREE.RepeatWrapping),
    texture(texLoader, `${root}/textures/grass_color.jpg`, THREE.SRGBColorSpace, THREE.RepeatWrapping),
    texture(texLoader, `${root}/textures/sand_color.jpg`, THREE.SRGBColorSpace, THREE.RepeatWrapping),
  ]);

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.93,
    metalness: 0.0,
    side: THREE.FrontSide,
    dithering: true,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSplat = { value: splat };
    shader.uniforms.uMacro = { value: macro };
    shader.uniforms.uRock = { value: rock };
    shader.uniforms.uDirt = { value: dirt };
    shader.uniforms.uGrass = { value: grass };
    shader.uniforms.uSand = { value: sand };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vIacWorld;\nvarying vec3 vIacNormal;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\n  vIacWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\n  vIacNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vIacWorld;
        varying vec3 vIacNormal;
        uniform sampler2D uSplat;
        uniform sampler2D uMacro;
        uniform sampler2D uRock;
        uniform sampler2D uDirt;
        uniform sampler2D uGrass;
        uniform sampler2D uSand;`,
      )
      .replace(
        '#include <map_fragment>',
        `
        vec2 iacUv = (vIacWorld.xz + 8192.0) / 16384.0;
        vec4 iacW = texture2D(uSplat, iacUv);
        iacW /= max(dot(iacW, vec4(1.0)), 0.0001);
        vec2 iacDetailUv = vIacWorld.xz * ${DETAIL_UV.toFixed(3)};
        vec3 iacCol = texture2D(uRock, iacDetailUv).rgb * iacW.r
                    + texture2D(uDirt, iacDetailUv).rgb * iacW.g
                    + texture2D(uGrass, iacDetailUv).rgb * iacW.b
                    + texture2D(uSand, iacDetailUv).rgb * iacW.a;
        vec3 iacMacro = texture2D(uMacro, iacUv).rgb;
        iacCol *= 0.86 + 0.42 * iacMacro;
        float iacDist = length(vIacWorld - cameraPosition);
        vec3 iacFar = iacMacro * 0.78 + vec3(0.015, 0.014, 0.012);
        diffuseColor.rgb = mix(iacCol * 1.32, iacFar, smoothstep(420.0, 3600.0, iacDist));
        `,
      );
  };
  material.customProgramCacheKey = () => 'iac-terrain-v1';

  const mesh = buildGridMesh(field, meta, material);
  const backdrop = buildBackdrop(backdropData, meta);
  backdrop.position.y = -1;
  const road = buildRoad(field, asphalt as THREE.MeshStandardMaterial | null);

  return { meta, field, mesh, backdrop, road, material };
}
