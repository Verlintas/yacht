import * as THREE from 'three';
import {
  ATMO_FRAG,
  ATMO_VERT,
  NEBULA_FRAG,
  PLANET_FRAG,
  PLANET_VERT,
  RING_FRAG,
  SUN_FRAG,
} from './shaders';
import type { PlanetDef, StationDef, SystemData } from './data';
import { makeRandom } from './data';

const RING_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const EPOCH_MS = Date.UTC(2026, 0, 1);
const TIME_SCALE = 60;
const SIM_DAYS = ((Date.now() - EPOCH_MS) / 86_400_000) * TIME_SCALE;

function glowTexture(inner = 'rgba(255,255,255,1)', mid = 'rgba(255,180,90,0.35)') {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(0.25, mid);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export interface CelestialBody {
  id: string;
  type: 'planet' | 'station';
  object: THREE.Object3D;
  position: THREE.Vector3;
  radius: number;
  planet?: PlanetDef;
  station?: StationDef;
  materials?: THREE.ShaderMaterial[];
}

export interface World {
  scene: THREE.Scene;
  sun: THREE.Object3D;
  sunRadius: number;
  bodies: CelestialBody[];
  update: (dt: number, elapsed: number, camera: THREE.Camera) => void;
}

export function createWorld(
  system: SystemData,
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
): World {
  const sunPosition = new THREE.Vector3(0, 0, 0);
  const bodies: CelestialBody[] = [];
  const sunRadius = 9000;

  /* ── 星空 ─────────────────────────────────── */
  const starCount = 16000;
  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);
  const sizes = new Float32Array(starCount);
  const rand = makeRandom(987654321);

  const palette = [
    new THREE.Color('#ffffff'),
    new THREE.Color('#dfe9ff'),
    new THREE.Color('#b9cfff'),
    new THREE.Color('#ffe6c9'),
    new THREE.Color('#ffcf9e'),
    new THREE.Color('#c9e6ff'),
  ];

  for (let i = 0; i < starCount; i += 1) {
    const u = rand() * 2 - 1;
    const theta = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    const distance = 900000 + rand() * 400000;
    positions[i * 3] = Math.cos(theta) * r * distance;
    positions[i * 3 + 1] = u * distance;
    positions[i * 3 + 2] = Math.sin(theta) * r * distance;

    const color = palette[Math.floor(rand() * palette.length)];
    const brightness = 0.35 + rand() * 0.65;
    colors[i * 3] = color.r * brightness;
    colors[i * 3 + 1] = color.g * brightness;
    colors[i * 3 + 2] = color.b * brightness;
    sizes[i] = 900 + rand() * 3600;
  }

  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  starGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  starGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const starMaterial = new THREE.ShaderMaterial({
    uniforms: { uPixelRatio: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float size;
      varying vec3 vColor;
      uniform float uPixelRatio;
      void main() {
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * uPixelRatio / max(-mv.z, 1.0) * 30.0;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d);
        float core = smoothstep(0.5, 0.0, r);
        float halo = smoothstep(0.5, 0.12, r) * 0.3;
        gl_FragColor = vec4(vColor * (core + halo), core);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
  });

  const stars = new THREE.Points(starGeometry, starMaterial);
  stars.frustumCulled = false;
  scene.add(stars);

  /* ── 星云 ─────────────────────────────────── */
  const nebula = new THREE.Mesh(
    new THREE.SphereGeometry(1_600_000, 48, 32),
    new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: NEBULA_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      transparent: true,
    }),
  );
  nebula.frustumCulled = false;
  scene.add(nebula);

  /* ── 恒星 ─────────────────────────────────── */
  const sunGroup = new THREE.Group();
  const sunMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: PLANET_VERT,
    fragmentShader: SUN_FRAG,
  });
  const sun = new THREE.Mesh(new THREE.SphereGeometry(sunRadius, 64, 48), sunMaterial);
  sunGroup.add(sun);

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture('rgba(255,255,255,1)', 'rgba(255,170,80,0.42)'),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      transparent: true,
      opacity: 0.26,
    }),
  );
  glow.scale.setScalar(sunRadius * 2.6);
  sunGroup.add(glow);

  const corona = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture('rgba(255,235,200,0.85)', 'rgba(255,120,40,0.22)'),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      transparent: true,
      opacity: 0.28,
    }),
  );
  corona.scale.setScalar(sunRadius * 5);
  sunGroup.add(corona);

  scene.add(sunGroup);

  /* ── 环境反射 ─────────────────────────────── */
  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          float up = vDir.y * 0.5 + 0.5;
          vec3 col = mix(vec3(0.008, 0.015, 0.03), vec3(0.05, 0.075, 0.11), up);
          float sun = pow(max(dot(normalize(vDir), normalize(vec3(0.3, 0.35, 0.9))), 0.0), 48.0);
          col += vec3(1.0, 0.78, 0.45) * sun * 1.6;
          float band = pow(max(dot(normalize(vDir), normalize(vec3(-0.6, 0.1, -0.4))), 0.0), 6.0);
          col += vec3(0.18, 0.12, 0.28) * band * 0.35;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    }),
  );
  envScene.add(envSky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTexture = pmrem.fromScene(envScene, 0.04).texture;
  scene.environment = envTexture;
  scene.environmentIntensity = 0.9;
  pmrem.dispose();

  const sunKey = new THREE.DirectionalLight(0xfff0dd, 2.8);
  sunKey.position.set(0, 0, 0);
  sunKey.target.position.set(0, 0, -1);
  scene.add(sunKey);
  scene.add(sunKey.target);

  const ambient = new THREE.AmbientLight(0x2a3d5c, 1.15);
  scene.add(ambient);

  /* ── 行星 ─────────────────────────────────── */
  const orbitMaterial = new THREE.LineBasicMaterial({
    color: 0x1e3a4d,
    transparent: true,
    opacity: 0.14,
  });

  const orbitGroup = new THREE.Group();
  orbitGroup.rotation.x = Math.PI / 2;
  scene.add(orbitGroup);

  for (const def of system.planets) {
    const bodyGroup = new THREE.Group();
    scene.add(bodyGroup);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uDeep: { value: new THREE.Color(def.palette[0]) },
        uMid: { value: new THREE.Color(def.palette[1]) },
        uHigh: { value: new THREE.Color(def.palette[2]) },
        uLight: { value: new THREE.Vector3(1, 0, 0) },
        uCamera: { value: new THREE.Vector3() },
        uTime: { value: 0 },
        uSeed: { value: def.seed },
        uOcean: {
          value:
            def.surface === 'ocean' || def.surface === 'verdigris'
              ? 0.9
              : def.surface === 'ice'
                ? 0.55
                : def.surface === 'gas'
                  ? 0
                  : 0.12,
        },
        uClouds: { value: def.clouds },
        uLights: { value: def.lights ? 1 : 0 },
        uAtmo: { value: def.atmosphere },
        uRough: { value: def.roughness },
        uAmp: { value: def.radius * (def.surface === 'gas' ? 0.004 : 0.022) },
      },
      vertexShader: PLANET_VERT,
      fragmentShader: PLANET_FRAG,
    });

    const planet = new THREE.Mesh(new THREE.SphereGeometry(def.radius, 160, 110), material);
    planet.rotation.z = def.axialTilt;
    bodyGroup.add(planet);

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(def.radius * 1.02, 64, 48),
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(def.palette[2]) },
          uLight: { value: new THREE.Vector3(1, 0, 0) },
          uCamera: { value: new THREE.Vector3() },
          uPower: { value: 3.4 },
        },
        vertexShader: ATMO_VERT,
        fragmentShader: ATMO_FRAG,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    );
    bodyGroup.add(atmosphere);

    if (def.ring) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(def.radius * 1.4, def.radius * 2.4, 192, 1),
        new THREE.ShaderMaterial({
          uniforms: {
            uColorA: { value: new THREE.Color(def.palette[1]) },
            uColorB: { value: new THREE.Color(def.palette[2]) },
            uSeed: { value: def.seed },
          },
          vertexShader: RING_VERT,
          fragmentShader: RING_FRAG,
          side: THREE.DoubleSide,
          transparent: true,
          depthWrite: false,
        }),
      );
      ring.rotation.x = Math.PI / 2 - 0.24;
      bodyGroup.add(ring);
    }

    if (def.moon) {
      const moon = new THREE.Mesh(
        new THREE.SphereGeometry(def.radius * 0.11, 32, 24),
        new THREE.MeshStandardMaterial({ color: 0x8d949c, roughness: 0.95, metalness: 0.05 }),
      );
      moon.position.set(def.radius * 2.6, def.radius * 0.2, 0);
      bodyGroup.add(moon);
    }

    // 轨道线
    const curve = new THREE.EllipseCurve(0, 0, def.orbit, def.orbit, 0, Math.PI * 2);
    const points = curve.getPoints(360).map((p) => new THREE.Vector3(p.x, p.y, 0));
    orbitGroup.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), orbitMaterial));

    bodies.push({
      id: def.id,
      type: 'planet',
      object: bodyGroup,
      position: new THREE.Vector3(),
      radius: def.radius,
      planet: def,
      materials: [material],
    });
  }

  /* ── 空港 ─────────────────────────────────── */
  for (const def of system.stations) {
    const bodyGroup = new THREE.Group();
    scene.add(bodyGroup);

    bodyGroup.add(buildStation(def));

    const curve = new THREE.EllipseCurve(0, 0, def.orbit, def.orbit, 0, Math.PI * 2);
    const points = curve.getPoints(320).map((p) => new THREE.Vector3(p.x, p.y, 0));
    orbitGroup.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), orbitMaterial));

    bodies.push({
      id: def.id,
      type: 'station',
      object: bodyGroup,
      position: new THREE.Vector3(),
      radius: def.radius * 1.6,
      station: def,
    });
  }

  /* ── 每帧 ─────────────────────────────────── */
  const tmpSun = new THREE.Vector3();
  const tmpPos = new THREE.Vector3();

  const update = (dt: number, elapsed: number, camera: THREE.Camera) => {
    sunMaterial.uniforms.uTime.value = elapsed;
    (nebula.material as THREE.ShaderMaterial).uniforms.uTime.value = elapsed;
    starMaterial.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2);

    const simDays = SIM_DAYS + (elapsed * TIME_SCALE) / 86_400;

    const toSun = camera.position.clone().negate().normalize();
    sunKey.position.copy(camera.position).addScaledVector(toSun, 900000);
    sunKey.target.position.copy(camera.position);
    sunKey.target.updateMatrixWorld();

    for (const body of bodies) {
      if (body.type === 'planet' && body.planet) {
        const def = body.planet;
        const angle = def.phase + (simDays / def.periodDays) * Math.PI * 2;

        tmpPos.set(
          Math.cos(angle) * def.orbit,
          Math.sin(angle) * def.orbit * Math.sin(def.inclination),
          Math.sin(angle) * def.orbit,
        );
        body.position.copy(tmpPos);
        body.object.position.copy(tmpPos);

        // 自转
        const spin = (simDays * 24) / def.spinHours;
        body.object.rotation.y = spin * Math.PI * 2;

        const core = body.object.children[0] as THREE.Mesh;
        const mat = core.material as THREE.ShaderMaterial;
        mat.uniforms.uLight.value.copy(tmpSun.copy(sunPosition).sub(tmpPos).normalize());
        mat.uniforms.uCamera.value.copy(camera.position);
        mat.uniforms.uTime.value = elapsed;

        const atmo = body.object.children[1] as THREE.Mesh;
        const amat = atmo.material as THREE.ShaderMaterial;
        amat.uniforms.uLight.value.copy(mat.uniforms.uLight.value);
        amat.uniforms.uCamera.value.copy(camera.position);
      } else if (body.type === 'station' && body.station) {
        const def = body.station;
        const period = 6000 + def.orbit * 0.02;
        const angle = def.phase + (simDays / period) * Math.PI * 2;
        tmpPos.set(
          Math.cos(angle) * def.orbit,
          Math.sin(angle) * def.orbit * Math.sin(def.inclination),
          Math.sin(angle) * def.orbit,
        );
        body.position.copy(tmpPos);
        body.object.position.copy(tmpPos);
        body.object.rotation.y = elapsed * def.spin * 0.15;
      }
    }
  };

  return { scene, sun: sunGroup, sunRadius, bodies, update };
}

/** 空港：核心塔 + 三环 + 停泊臂 + 机库 + 太阳能帆。 */
function buildStation(def: StationDef): THREE.Group {
  const group = new THREE.Group();
  const R = def.radius;

  const hull = new THREE.MeshStandardMaterial({ color: 0x8e9aa8, roughness: 0.32, metalness: 0.94, envMapIntensity: 1.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b232c, roughness: 0.42, metalness: 0.9, envMapIntensity: 1.1 });
  const glow = new THREE.MeshStandardMaterial({
    color: def.accent,
    emissive: new THREE.Color(def.accent),
    emissiveIntensity: 1.1,
    roughness: 0.3,
    metalness: 0.1,
  });
  const holo = new THREE.MeshBasicMaterial({
    color: new THREE.Color(def.accent),
    transparent: true,
    opacity: 0.1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  /* 核心塔 */
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.075, R * 0.11, R * 2.6, 18), hull);
  group.add(tower);

  for (let i = 0; i < 5; i += 1) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(R * 0.105, R * 0.012, 8, 32), glow);
    band.rotation.x = Math.PI / 2;
    band.position.y = -R * 0.9 + i * R * 0.45;
    group.add(band);
  }

  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(R * 0.16, 2), glow);
  core.position.y = R * 0.2;
  group.add(core);

  /* 三层环 */
  const rings: Array<{ radius: number; tube: number; tilt: [number, number, number]; y: number }> = [
    { radius: R * 1.1, tube: R * 0.045, tilt: [Math.PI / 2, 0, 0], y: 0 },
    { radius: R * 0.82, tube: R * 0.035, tilt: [Math.PI / 2.3, 0.3, 0.1], y: -R * 0.42 },
    { radius: R * 0.6, tube: R * 0.028, tilt: [Math.PI / 1.7, -0.35, -0.18], y: R * 0.5 },
  ];

  for (const ring of rings) {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(ring.radius, ring.tube, 12, 144), hull);
    mesh.rotation.set(...ring.tilt);
    mesh.position.y = ring.y;
    group.add(mesh);

    const trim = new THREE.Mesh(new THREE.TorusGeometry(ring.radius, ring.tube * 0.3, 8, 144), glow);
    trim.rotation.copy(mesh.rotation);
    trim.position.copy(mesh.position);
    trim.scale.setScalar(1.01);
    group.add(trim);
  }

  /* 放射停泊臂 */
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    const length = R * 1.1;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(length, R * 0.035, R * 0.09), hull);
    arm.position.set(Math.cos(angle) * length * 0.55, 0, Math.sin(angle) * length * 0.55);
    arm.rotation.y = -angle;
    group.add(arm);
  }

  /* 机库：开口朝外的大盒子 */
  const hangar = new THREE.Group();
  hangar.position.set(R * 1.0, -R * 0.1, 0);
  hangar.rotation.y = 0;

  const bayW = R * 0.5;
  const bayH = R * 0.26;
  const bayD = R * 0.6;

  const shellMat = new THREE.MeshStandardMaterial({ color: 0x2b333d, roughness: 0.5, metalness: 0.8 });

  const back = new THREE.Mesh(new THREE.BoxGeometry(R * 0.06, bayH, bayW), shellMat);
  back.position.set(-bayD / 2, 0, 0);
  hangar.add(back);

  const top = new THREE.Mesh(new THREE.BoxGeometry(bayD, R * 0.05, bayW), shellMat);
  top.position.set(0, bayH / 2, 0);
  hangar.add(top);

  const bottom = new THREE.Mesh(new THREE.BoxGeometry(bayD, R * 0.05, bayW), shellMat);
  bottom.position.set(0, -bayH / 2, 0);
  hangar.add(bottom);

  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(bayD, bayH, R * 0.05), shellMat);
    wall.position.set(0, 0, (side * bayW) / 2);
    hangar.add(wall);
  }

  // 机库地板灯带
  for (let i = 0; i < 7; i += 1) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(bayD * 0.08, R * 0.006, bayW * 0.7), glow);
    strip.position.set(-bayD / 2 + (i + 0.5) * (bayD / 7), -bayH / 2 + R * 0.03, 0);
    hangar.add(strip);
  }

  // 机库内壁灯
  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(bayD * 0.9, R * 0.01, R * 0.02), glow);
    lamp.position.set(0, bayH * 0.36, (side * bayW) / 2.2);
    hangar.add(lamp);
  }

  // 机库外框
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x9aa6b2, roughness: 0.3, metalness: 0.95 });
  for (const [y, z] of [
    [bayH / 2, bayW / 2],
    [bayH / 2, -bayW / 2],
    [-bayH / 2, bayW / 2],
    [-bayH / 2, -bayW / 2],
  ]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(R * 0.06, R * 0.05, R * 0.05), frameMat);
    post.position.set(bayD / 2 - R * 0.03, y, z);
    hangar.add(post);
  }

  // 机库顶标
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(bayW * 0.8, bayH * 0.4), holo);
  sign.position.set(bayD / 2 + R * 0.01, bayH * 0.34, 0);
  sign.rotation.y = Math.PI / 2;
  hangar.add(sign);

  group.add(hangar);

  // 控制塔
  const towerBase = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.05, R * 0.07, R * 0.4, 12), hull);
  towerBase.position.set(R * 0.9, R * 0.55, -R * 0.55);
  group.add(towerBase);

  const towerTop = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.12, R * 0.1, R * 0.12, 12), dark);
  towerTop.position.set(R * 0.9, R * 0.78, -R * 0.55);
  group.add(towerTop);

  const towerGlass = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.115, R * 0.115, R * 0.05, 12), glow);
  towerGlass.position.set(R * 0.9, R * 0.79, -R * 0.55);
  group.add(towerGlass);

  /* 全息导航环 */
  for (const scale of [1.3, 1.5, 1.7]) {
    const halo = new THREE.Mesh(new THREE.TorusGeometry(R * scale, R * 0.0035, 6, 180), holo);
    halo.rotation.x = Math.PI / 2;
    group.add(halo);
  }

  /* 太阳能帆 */
  for (const side of [-1, 1]) {
    const boom = new THREE.Mesh(new THREE.BoxGeometry(R * 0.5, R * 0.015, R * 0.015), hull);
    boom.position.set(side * R * 0.55, -R * 1.0, 0);
    group.add(boom);

    const sail = new THREE.Mesh(
      new THREE.BoxGeometry(R * 0.9, R * 0.006, R * 0.45),
      new THREE.MeshStandardMaterial({
        color: 0x0d2b45,
        roughness: 0.18,
        metalness: 0.7,
        emissive: new THREE.Color(0x081a2e),
        emissiveIntensity: 1.1,
        envMapIntensity: 1.8,
      }),
    );
    sail.position.set(side * R * 1.25, -R * 1.0, 0);
    group.add(sail);
  }

  /* 天线 */
  for (let i = 0; i < 3; i += 1) {
    const length = R * (0.5 + i * 0.2);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.006, R * 0.01, length, 6), hull);
    mast.position.set((i - 1) * R * 0.1, R * 1.3 + length / 2, 0);
    group.add(mast);

    const tip = new THREE.Mesh(new THREE.SphereGeometry(R * 0.012, 8, 6), glow);
    tip.position.set((i - 1) * R * 0.1, R * 1.3 + length, 0);
    group.add(tip);
  }

  return group;
}
