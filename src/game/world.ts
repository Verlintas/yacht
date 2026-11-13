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

/** 画一张径向渐变贴图，给光晕用。 */
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
  bodies: CelestialBody[];
  planetMaterials: Array<{ material: THREE.ShaderMaterial; def: PlanetDef }>;
  stationGroups: Array<{ group: THREE.Group; def: StationDef }>;
  update: (dt: number, elapsed: number, camera: THREE.Camera) => void;
}

export function createWorld(
  system: SystemData,
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
): World {
  const sunPosition = new THREE.Vector3(0, 0, 0);
  const bodies: CelestialBody[] = [];
  const planetMaterials: Array<{ material: THREE.ShaderMaterial; def: PlanetDef }> = [];
  const stationGroups: Array<{ group: THREE.Group; def: StationDef }> = [];

  /* ── 星空 ─────────────────────────────────── */
  const starCount = 14000;
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
    const distance = 24000 + rand() * 22000;
    positions[i * 3] = Math.cos(theta) * r * distance;
    positions[i * 3 + 1] = u * distance;
    positions[i * 3 + 2] = Math.sin(theta) * r * distance;

    const color = palette[Math.floor(rand() * palette.length)];
    const brightness = 0.35 + rand() * 0.65;
    colors[i * 3] = color.r * brightness;
    colors[i * 3 + 1] = color.g * brightness;
    colors[i * 3 + 2] = color.b * brightness;
    sizes[i] = 18 + rand() * 90;
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
        gl_PointSize = size * uPixelRatio / max(-mv.z, 1.0) * 60.0;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d);
        float core = smoothstep(0.5, 0.0, r);
        float halo = smoothstep(0.5, 0.15, r) * 0.35;
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

  /* ── 星云穹顶 ─────────────────────────────── */
  const nebula = new THREE.Mesh(
    new THREE.SphereGeometry(52000, 48, 32),
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
  const sun = new THREE.Mesh(new THREE.SphereGeometry(900, 64, 48), sunMaterial);
  sunGroup.add(sun);

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture('rgba(255,255,255,1)', 'rgba(255,170,80,0.42)'),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.22,
    }),
  );
  glow.scale.setScalar(2600);
  sunGroup.add(glow);

  const corona = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture('rgba(255,235,200,0.85)', 'rgba(255,120,40,0.22)'),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.1,
    }),
  );
  corona.scale.setScalar(5200);
  sunGroup.add(corona);

  scene.add(sunGroup);

  /* ── 环境反射：程序化天空盒，金属材质才有东西可反射 ── */
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
  scene.environmentIntensity = 0.85;
  pmrem.dispose();

  // 平行光：不随距离衰减，避免远距离精度问题导致的闪烁
  const sunKey = new THREE.DirectionalLight(0xfff0dd, 2.6);
  sunKey.position.set(0, 0, 0);
  sunKey.target.position.set(0, 0, -1);
  scene.add(sunKey);
  scene.add(sunKey.target);

  const ambient = new THREE.AmbientLight(0x22334f, 0.9);
  scene.add(ambient);

  /* ── 行星 ─────────────────────────────────── */
  const orbitMaterial = new THREE.LineBasicMaterial({
    color: 0x2a4a63,
    transparent: true,
    opacity: 0.05,
  });

  for (const def of system.planets) {
    const group = new THREE.Group();
    group.rotation.z = def.inclination;
    scene.add(group);

    const orbitCurve = new THREE.EllipseCurve(0, 0, def.orbit, def.orbit, 0, Math.PI * 2);
    const orbitPoints = orbitCurve.getPoints(256).map((p) => new THREE.Vector3(p.x, 0, p.y));
    const orbitLine = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(orbitPoints), orbitMaterial);
    group.add(orbitLine);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uDeep: { value: new THREE.Color(def.palette[0]) },
        uMid: { value: new THREE.Color(def.palette[1]) },
        uHigh: { value: new THREE.Color(def.palette[2]) },
        uLight: { value: new THREE.Vector3(1, 0, 0) },
        uCamera: { value: new THREE.Vector3() },
        uTime: { value: 0 },
        uSeed: { value: def.seed },
        uOcean: { value: def.surface === 'ocean' || def.surface === 'verdigris' ? 0.85 : def.surface === 'ice' ? 0.55 : 0.15 },
        uClouds: { value: def.clouds ? 0.85 : 0.1 },
        uLights: { value: def.lights ? 1 : 0 },
        uAtmo: { value: def.atmosphere },
      },
      vertexShader: PLANET_VERT,
      fragmentShader: PLANET_FRAG,
    });

    const planet = new THREE.Mesh(new THREE.SphereGeometry(def.radius, 96, 64), material);
    group.add(planet);
    planetMaterials.push({ material, def });

    // 大气
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(def.radius * 1.035, 64, 48),
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(def.palette[2]) },
          uLight: { value: new THREE.Vector3(1, 0, 0) },
          uCamera: { value: new THREE.Vector3() },
          uPower: { value: 3.1 },
        },
        vertexShader: ATMO_VERT,
        fragmentShader: ATMO_FRAG,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    );
    group.add(atmosphere);

    // 行星环
    if (def.ring) {
      const inner = def.radius * 1.45;
      const outer = def.radius * 2.5;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(inner, outer, 160, 1),
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
      ring.rotation.x = Math.PI / 2 - 0.28;
      ring.rotation.z = 0.15;
      group.add(ring);
    }

    // 卫星
    if (def.moon) {
      const moonOrbit = new THREE.Group();
      const moon = new THREE.Mesh(
        new THREE.SphereGeometry(def.radius * 0.13, 24, 18),
        new THREE.MeshStandardMaterial({ color: 0x9aa3b5, roughness: 0.95, metalness: 0.05 }),
      );
      moon.position.set(def.radius * 3.4, def.radius * 0.4, 0);
      moonOrbit.add(moon);
      moonOrbit.rotation.x = 0.4;
      group.add(moonOrbit);
    }

    bodies.push({
      id: def.id,
      type: 'planet',
      object: group,
      position: new THREE.Vector3(),
      radius: def.radius,
      planet: def,
      materials: [material],
    });
  }

  /* ── 空间站 ────────────────────────────────── */
  for (const def of system.stations) {
    const group = new THREE.Group();
    group.rotation.z = def.inclination;
    scene.add(group);

    const station = buildStation(def);
    group.add(station);

    const beacon = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture('rgba(255,255,255,0.9)', 'rgba(120,220,255,0.25)'),
        color: new THREE.Color(def.accent),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.22,
      }),
    );
    beacon.scale.setScalar(def.radius * 3.4);
    station.add(beacon);

    bodies.push({
      id: def.id,
      type: 'station',
      object: group,
      position: new THREE.Vector3(),
      radius: def.radius * 2.2,
      station: def,
    });
    stationGroups.push({ group: station, def });
  }

  /* ── 每帧更新 ──────────────────────────────── */
  const tmpSun = new THREE.Vector3();
  const tmpPos = new THREE.Vector3();

  const update = (dt: number, elapsed: number, camera: THREE.Camera) => {
    const toSun = camera.position.clone().negate().normalize();
    sunKey.position.copy(camera.position).addScaledVector(toSun, 9000);
    sunKey.target.position.copy(camera.position);
    sunKey.target.updateMatrixWorld();
    sunMaterial.uniforms.uTime.value = elapsed;
    (nebula.material as THREE.ShaderMaterial).uniforms.uTime.value = elapsed;
    starMaterial.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2);

    for (const body of bodies) {
      if (body.type === 'planet' && body.planet) {
        const def = body.planet;
        body.object.rotation.y += dt * 0.02;

        const angle = def.phase + elapsed * (0.0035 / Math.sqrt(def.orbit / 1000));
        tmpPos.set(
          Math.cos(angle) * def.orbit,
          Math.sin(angle) * def.orbit * Math.sin(def.inclination),
          Math.sin(angle) * def.orbit,
        );
        body.position.copy(tmpPos);

        const mesh = body.object.children.find((child) => child instanceof THREE.Mesh && !(child instanceof THREE.Line)) as
          | THREE.Mesh
          | undefined;

        if (mesh) {
          mesh.position.copy(tmpPos);
          (mesh.material as THREE.ShaderMaterial).uniforms.uLight.value
            .copy(tmpSun.set(0, 0, 0).sub(tmpPos).normalize());
          (mesh.material as THREE.ShaderMaterial).uniforms.uCamera.value.copy(camera.position);

          const atmo = body.object.children.find(
            (child) => child instanceof THREE.Mesh && child !== mesh && child.geometry.type === 'SphereGeometry',
          ) as THREE.Mesh | undefined;
          if (atmo) {
            atmo.position.copy(tmpPos);
            const mat = atmo.material as THREE.ShaderMaterial;
            mat.uniforms.uLight.value.copy(tmpSun.set(0, 0, 0).sub(tmpPos).normalize());
            mat.uniforms.uCamera.value.copy(camera.position);
          }

          body.object.rotation.y += dt * def.spin * 0.05;
        }
      } else if (body.type === 'station' && body.station) {
        const def = body.station;
        const angle = def.phase + elapsed * (0.012 / Math.sqrt(def.orbit / 800));
        tmpPos.set(
          Math.cos(angle) * def.orbit,
          Math.sin(angle) * def.orbit * Math.sin(def.inclination),
          Math.sin(angle) * def.orbit,
        );
        body.position.copy(tmpPos);
        const stationMesh = body.object.children.find((child) => child instanceof THREE.Group) as THREE.Group | undefined;
        if (stationMesh) stationMesh.position.copy(tmpPos);
      }
    }

    for (const { group: stationGroup } of stationGroups) {
      stationGroup.rotation.y += dt * 0.05;
    }

    for (const { material } of planetMaterials) {
      material.uniforms.uTime.value = elapsed;
    }
  };

  return { scene, sun: sunGroup, bodies, planetMaterials, stationGroups, update };
}

/** 未来空港：发光核心 + 三层环 + 放射状停泊臂 + 全息导航环。 */
function buildStation(def: StationDef): THREE.Group {
  const group = new THREE.Group();
  const R = def.radius;

  const hull = new THREE.MeshStandardMaterial({
    color: 0x8e9aa8,
    roughness: 0.32,
    metalness: 0.94,
    envMapIntensity: 1.5,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x1b232c,
    roughness: 0.42,
    metalness: 0.9,
    envMapIntensity: 1.1,
  });
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
    opacity: 0.09,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  /* 中央核心 */
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(R * 0.2, 2), dark);
  group.add(core);

  const coreGlow = new THREE.Mesh(new THREE.IcosahedronGeometry(R * 0.215, 2), glow);
  coreGlow.scale.setScalar(1.02);
  group.add(coreGlow);

  /* 主轴 */
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.045, R * 0.06, R * 3.2, 14), hull);
  group.add(spine);

  /* 三层环 */
  const rings: Array<{ radius: number; tube: number; tilt: [number, number, number]; y: number }> = [
    { radius: R * 1.12, tube: R * 0.05, tilt: [Math.PI / 2, 0, 0], y: 0 },
    { radius: R * 0.86, tube: R * 0.04, tilt: [Math.PI / 2.3, 0.32, 0.12], y: -R * 0.42 },
    { radius: R * 0.62, tube: R * 0.032, tilt: [Math.PI / 1.7, -0.4, -0.2], y: R * 0.52 },
  ];

  for (const ring of rings) {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(ring.radius, ring.tube, 12, 128), hull);
    mesh.rotation.set(...ring.tilt);
    mesh.position.y = ring.y;
    group.add(mesh);

    const trim = new THREE.Mesh(new THREE.TorusGeometry(ring.radius, ring.tube * 0.35, 8, 128), glow);
    trim.rotation.copy(mesh.rotation);
    trim.position.copy(mesh.position);
    trim.scale.setScalar(1.008);
    group.add(trim);
  }

  /* 放射状停泊臂 */
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    const length = R * 1.12;

    const arm = new THREE.Mesh(new THREE.BoxGeometry(length, R * 0.03, R * 0.075), hull);
    arm.position.set(Math.cos(angle) * length * 0.55, 0, Math.sin(angle) * length * 0.55);
    arm.rotation.y = -angle;
    group.add(arm);

    // 停泊位
    const pad = new THREE.Mesh(new THREE.BoxGeometry(R * 0.16, R * 0.02, R * 0.2), dark);
    pad.position.set(Math.cos(angle) * length, -R * 0.02, Math.sin(angle) * length);
    pad.rotation.y = -angle;
    group.add(pad);

    const padGlow = new THREE.Mesh(new THREE.PlaneGeometry(R * 0.14, R * 0.18), holo);
    padGlow.position.set(Math.cos(angle) * length, R * 0.01, Math.sin(angle) * length);
    padGlow.rotation.set(-Math.PI / 2, 0, -angle);
    group.add(padGlow);

    const beacon = new THREE.Mesh(new THREE.SphereGeometry(R * 0.012, 8, 6), glow);
    beacon.position.set(Math.cos(angle) * length, R * 0.04, Math.sin(angle) * length);
    group.add(beacon);
  }

  /* 全息导航环 */
  for (const scale of [1.35, 1.55, 1.78]) {
    const halo = new THREE.Mesh(new THREE.TorusGeometry(R * scale, R * 0.004, 6, 160), holo);
    halo.rotation.x = Math.PI / 2;
    group.add(halo);
  }

  /* 散热/太阳能巨板 */
  for (const side of [-1, 1]) {
    const boom = new THREE.Mesh(new THREE.BoxGeometry(R * 0.5, R * 0.018, R * 0.018), hull);
    boom.position.set(side * R * 0.55, -R * 1.05, 0);
    group.add(boom);

    const sail = new THREE.Mesh(
      new THREE.BoxGeometry(R * 0.85, R * 0.008, R * 0.42),
      new THREE.MeshStandardMaterial({
        color: 0x0d2b45,
        roughness: 0.18,
        metalness: 0.7,
        emissive: new THREE.Color(0x081a2e),
        emissiveIntensity: 1.1,
        envMapIntensity: 1.8,
      }),
    );
    sail.position.set(side * R * 1.2, -R * 1.05, 0);
    sail.rotation.z = side * 0.05;
    group.add(sail);
  }

  /* 顶部天线群 */
  for (let i = 0; i < 3; i += 1) {
    const length = R * (0.5 + i * 0.18);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.008, R * 0.012, length, 6), hull);
    mast.position.set((i - 1) * R * 0.12, R * 1.5 + length / 2, 0);
    mast.rotation.z = (i - 1) * 0.12;
    group.add(mast);

    const tip = new THREE.Mesh(new THREE.SphereGeometry(R * 0.014, 8, 6), glow);
    tip.position.set((i - 1) * R * 0.12 + (i - 1) * length * 0.12, R * 1.5 + length, 0);
    group.add(tip);
  }

  /* 环上的窗灯 */
  for (let i = 0; i < 72; i += 1) {
    const angle = (i / 72) * Math.PI * 2;
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(R * 0.008, R * 0.005, R * 0.014), glow);
    lamp.position.set(Math.cos(angle) * R * 1.12, R * 0.028, Math.sin(angle) * R * 1.12);
    lamp.rotation.y = -angle;
    group.add(lamp);
  }

  return group;
}
