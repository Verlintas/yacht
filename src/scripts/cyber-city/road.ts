import * as THREE from 'three';

/**
 * Controlled planar reflection for the main street.
 *
 * The reflection pass only renders layer 2, which contains low-detail
 * tone-mapping-disabled proxies of the towers, shops, props and neon signs.
 * That keeps the extra pass around ~0.6 M tris instead of re-rendering the
 * 2 M-tri main view. The result is sampled by a MeshStandardMaterial road
 * shader with normal distortion, fresnel and a puddle mask.
 */
export class PlanarReflection {
  readonly rt: THREE.WebGLRenderTarget;
  readonly textureMatrix = new THREE.Matrix4();
  readonly camera = new THREE.PerspectiveCamera();
  readonly texture: THREE.Texture;
  frames = 0;
  interval = 2;
  readonly size: [number, number];

  private readonly rotationMatrix = new THREE.Matrix4();
  private readonly lookAtPosition = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly view = new THREE.Vector3();

  constructor(width = 896, height = 448) {
    this.size = [width, height];
    this.rt = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: true,
      depthBuffer: true,
      stencilBuffer: false,
    });
    this.rt.texture.name = 'street-reflection';
    this.texture = this.rt.texture;
    this.camera.layers.set(2);
  }

  update(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    this.frames += 1;
    if (this.frames % this.interval !== 0) return;

    const camPos = camera.getWorldPosition(new THREE.Vector3());

    // mirror across y=0
    this.view.set(camPos.x, -camPos.y, camPos.z);

    // mirrored look direction
    this.rotationMatrix.extractRotation(camera.matrixWorld);
    this.lookAtPosition.set(0, 0, -1).applyMatrix4(this.rotationMatrix).add(camPos);
    this.target.set(this.lookAtPosition.x, -this.lookAtPosition.y, this.lookAtPosition.z);

    this.camera.position.copy(this.view);
    this.camera.up.set(0, -1, 0);
    this.camera.lookAt(this.target);

    this.camera.near = camera.near;
    this.camera.far = camera.far;
    this.camera.projectionMatrix.copy(camera.projectionMatrix);
    this.camera.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    this.camera.updateMatrixWorld(true);
    this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();

    // project world → reflection texture uv
    this.textureMatrix.set(
      0.5, 0.0, 0.0, 0.5,
      0.0, 0.5, 0.0, 0.5,
      0.0, 0.0, 0.5, 0.5,
      0.0, 0.0, 0.0, 1.0,
    );
    this.textureMatrix.multiply(this.camera.projectionMatrix);
    this.textureMatrix.multiply(this.camera.matrixWorldInverse);

    const prevTarget = renderer.getRenderTarget();
    const prevXR = renderer.xr.enabled;
    renderer.xr.enabled = false;
    renderer.setRenderTarget(this.rt);
    renderer.state.buffers.depth.setMask(true);
    renderer.clear();
    renderer.render(scene, this.camera);
    renderer.setRenderTarget(prevTarget);
    renderer.xr.enabled = prevXR;
  }

  setSize(width: number, height: number): void {
    this.rt.setSize(width, height);
  }
}

export interface WetRoadResult {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  reflection: PlanarReflection;
  setTime: (t: number) => void;
}

export function createWetRoad(opts: {
  width: number;
  length: number;
  position: [number, number, number];
  yaw?: number;
  asphaltMap: THREE.Texture;
  asphaltNormal: THREE.Texture;
  asphaltOrm: THREE.Texture;
  asphaltMacro: THREE.Texture;
  puddleMask: THREE.Texture;
  reflection: PlanarReflection;
}): WetRoadResult {
  const {
    width, length, position, yaw = 0,
    asphaltMap, asphaltNormal, asphaltOrm, asphaltMacro, puddleMask, reflection,
  } = opts;

  asphaltMap.wrapS = asphaltMap.wrapT = THREE.RepeatWrapping;
  asphaltNormal.wrapS = asphaltNormal.wrapT = THREE.RepeatWrapping;
  asphaltOrm.wrapS = asphaltOrm.wrapT = THREE.RepeatWrapping;
  puddleMask.wrapS = puddleMask.wrapT = THREE.RepeatWrapping;
  asphaltMap.repeat.set(width / 4.5, length / 4.5);
  asphaltNormal.repeat.set(width / 4.5, length / 4.5);
  asphaltOrm.repeat.set(width / 4.5, length / 4.5);
  asphaltMacro.wrapS = asphaltMacro.wrapT = THREE.RepeatWrapping;
  puddleMask.repeat.set(1, 1);
  asphaltMap.anisotropy = 16;
  asphaltNormal.anisotropy = 16;
  asphaltOrm.anisotropy = 16;

  const material = new THREE.MeshStandardMaterial({
    map: asphaltMap,
    normalMap: asphaltNormal,
    roughnessMap: asphaltOrm,
    metalnessMap: asphaltOrm,
    roughness: 1.0,
    metalness: 0.0,
    color: new THREE.Color(0xffffff),
    envMapIntensity: 0.7,
  });
  material.normalScale.set(0.9, 0.9);

  const uniforms = {
    uReflection: { value: reflection.texture },
    uTextureMatrix: { value: reflection.textureMatrix },
    uPuddle: { value: puddleMask },
    uMacro: { value: asphaltMacro },
    uTime: { value: 0 },
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
       uniform mat4 uTextureMatrix;
       varying vec4 vReflectCoord;
       varying vec3 vWorldPos;`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vec4 ccWorld = modelMatrix * vec4(transformed, 1.0);
       vWorldPos = ccWorld.xyz;
       vReflectCoord = uTextureMatrix * ccWorld;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
       uniform sampler2D uReflection;
       uniform sampler2D uPuddle;
       uniform sampler2D uMacro;
       uniform float uTime;
       varying vec4 vReflectCoord;
       varying vec3 vWorldPos;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>
       float ccPuddleRaw = texture2D(uPuddle, vWorldPos.xz * 0.023 + vec2(0.31, 0.17)).r;
       float ccPuddleDetail = texture2D(uPuddle, vWorldPos.xz * 0.081 + vec2(0.71, 0.53)).r;
       // break large blobs into irregular sheets so the aerial shot does not
       // read as a handful of pale amoebas on the asphalt
       float ccPuddle = smoothstep(0.76, 0.99, ccPuddleRaw * (0.58 + 0.62 * ccPuddleDetail));
       float ccGutter = smoothstep(0.72, 0.98, abs(vWorldPos.x) / 11.0);
       float ccMacro = texture2D(uMacro, vWorldPos.xz * 0.011 + vec2(0.17, 0.41)).r;
       float ccWetBase = 0.025;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       diffuseColor.rgb *= mix(0.62, 1.28, ccMacro);
       diffuseColor.rgb *= mix(0.96, 0.48, max(ccPuddle, ccGutter * 0.42));`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
       roughnessFactor = clamp(roughnessFactor * mix(0.82, 1.15, ccMacro), 0.04, 0.98);
       roughnessFactor = mix(roughnessFactor, 0.105, max(ccPuddle, ccGutter * 0.55));`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `{
         vec3 ccN = texture2D(normalMap, vWorldPos.xz * 0.11).xyz * 2.0 - 1.0;
         vec2 ccUv = vReflectCoord.xy / max(vReflectCoord.w, 0.0001);
         float ccRipple = sin(vWorldPos.z * 8.0 + uTime * 4.2 + vWorldPos.x * 6.0) * 0.0042 * ccPuddle;
         ccUv += ccN.xy * mix(0.012, 0.07, ccPuddle) + vec2(ccRipple, ccRipple * 0.45);
         vec3 ccRefl = texture2D(uReflection, ccUv).rgb * 0.46;
         ccRefl += texture2D(uReflection, ccUv + vec2(0.0, 0.018)).rgb * 0.28;
         ccRefl += texture2D(uReflection, ccUv - vec2(0.0, 0.022)).rgb * 0.22;
         ccRefl += texture2D(uReflection, ccUv + vec2(0.0, 0.045)).rgb * 0.16;
         ccRefl += texture2D(uReflection, ccUv - vec2(0.0, 0.052)).rgb * 0.12;
         float ccFres = pow(1.0 - clamp(dot(normalize(cameraPosition - vWorldPos), normalize((vec4(normal, 0.0) * viewMatrix).xyz)), 0.0, 1.0), 3.0);
         float ccWet = mix(ccWetBase, 0.5, max(ccPuddle, ccGutter * 0.34)) * (0.22 + 0.78 * ccFres);
         outgoingLight += ccRefl * ccWet * vec3(0.75, 0.86, 1.0) * 0.7;
         outgoingLight += ccRefl * ccPuddle * 0.05;
       }
       #include <opaque_fragment>`,
    );
  };

  const geo = new THREE.PlaneGeometry(width, length, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(...position);
  mesh.rotation.y = yaw;
  mesh.receiveShadow = true;
  mesh.name = 'wet-street';
  mesh.renderOrder = 1;

  return {
    mesh,
    material,
    reflection,
    setTime: (t: number) => {
      uniforms.uTime.value = t;
    },
  };
}

/** Dark wet concrete used for alleys and the cross street, without a planar probe. */
export function createWetConcrete(opts: {
  map: THREE.Texture;
  normal?: THREE.Texture;
  orm?: THREE.Texture;
  color?: THREE.ColorRepresentation;
  roughness?: number;
  repeat?: [number, number];
  position: [number, number, number];
  size: [number, number];
  yaw?: number;
}): THREE.Mesh {
  const { map, normal, orm, color = 0x2a2d30, roughness = 0.55, repeat = [2, 2], position, size, yaw = 0 } = opts;
  const tiledMap = map.clone();
  tiledMap.wrapS = tiledMap.wrapT = THREE.RepeatWrapping;
  tiledMap.repeat.set(...repeat);
  tiledMap.anisotropy = 8;
  tiledMap.needsUpdate = true;
  const mat = new THREE.MeshStandardMaterial({
    map: tiledMap,
    normalMap: normal ?? null,
    roughnessMap: orm ?? null,
    metalnessMap: orm ?? null,
    color,
    roughness,
    metalness: 0.0,
    envMapIntensity: 0.7,
  });
  const geo = new THREE.PlaneGeometry(size[0], size[1]);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(...position);
  mesh.rotation.y = yaw;
  mesh.receiveShadow = true;
  return mesh;
}
