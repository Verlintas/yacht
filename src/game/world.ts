import * as THREE from 'three';
import {
  ATMO_FRAG,
  ATMO_VERT,
  PLANET_FRAG,
  PLANET_VERT,
  RING_FRAG,
  SKY_FRAG,
  SKY_VERT,
  SUN_FRAG,
} from './shaders';
import type { PlanetDef, StationDef, Surface, SystemData } from './data';
import { makeRandom } from './data';
import { greebles, mergeStatic, panel, truss } from './kit';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const RING_VERT = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
    #include <logdepthbuf_vertex>
  }
`;

const EPOCH_MS = Date.UTC(2026, 0, 1);
// 放慢整体公转/自转：原 60× 会让外圈行星切向速度超过大船 Shift 极速
const TIME_SCALE = 8;
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
  /** 低空天空穹顶（只在进入大气层时可见） */
  sky?: THREE.Mesh;
}

export interface World {
  scene: THREE.Scene;
  sun: THREE.Object3D;
  sunRadius: number;
  bodies: CelestialBody[];
  hangars: Array<{ group: THREE.Group; depth: number; width: number; height: number }>;
  mixers: THREE.AnimationMixer[];
  update: (dt: number, elapsed: number, camera: THREE.Camera) => void;

}

/** 白天天空：每种行星形态一套低饱和配色，进入大气层后压在地平线以下 */
const SKY_PALETTE: Record<Surface, { zenith: number; horizon: number; sunset: number }> = {
  ocean: { zenith: 0x82b8dc, horizon: 0xeaf5ff, sunset: 0xffb27a },
  desert: { zenith: 0xd8a88f, horizon: 0xffe7d4, sunset: 0xff995c },
  ice: { zenith: 0xa6c9e4, horizon: 0xf5fbff, sunset: 0xffc9b2 },
  gas: { zenith: 0xc7a7c9, horizon: 0xf4e7f1, sunset: 0xffb09e },
  lava: { zenith: 0x8d3a2b, horizon: 0xe9a184, sunset: 0xff5a2a },
  verdigris: { zenith: 0x8fc8b8, horizon: 0xe8f8ee, sunset: 0xffb080 },
  barren: { zenith: 0x9aa8b8, horizon: 0xdbe3eb, sunset: 0xffb080 },
};

export function createWorld(
  system: SystemData,
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
): World {
  const sunPosition = new THREE.Vector3(0, 0, 0);
  const bodies: CelestialBody[] = [];
  const hangars: Array<{ group: THREE.Group; depth: number; width: number; height: number }> = [];
  const sunRadius = 15_000_000;

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
    const distance = 800_000_000 + rand() * 220_000_000;
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
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute float size;
      varying vec3 vColor;
      uniform float uPixelRatio;
      void main() {
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * uPixelRatio / max(-mv.z, 1.0) * 30.0;
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      varying vec3 vColor;
      void main() {
        #include <logdepthbuf_fragment>
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
  // 星空跟随相机，保证飞到任何轨道都不会把星场甩到身后
  const starGroup = new THREE.Group();
  starGroup.add(stars);
  scene.add(starGroup);

  /* ── 星云背景 ─────────────────────────────── */
  // 用等距柱状贴图做背景，避免大球壳在高速运动时与深度/裁剪产生黑块闪烁
  {
    const w = 2048;
    const h = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#04070d');
    bg.addColorStop(0.35, '#05060c');
    bg.addColorStop(0.7, '#03050a');
    bg.addColorStop(1, '#020409');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const palette = [
      ['rgba(70, 38, 95, 0.22)', 'rgba(20, 8, 35, 0)'],
      ['rgba(30, 70, 80, 0.18)', 'rgba(4, 18, 24, 0)'],
      ['rgba(45, 35, 90, 0.16)', 'rgba(10, 8, 30, 0)'],
      ['rgba(90, 55, 50, 0.11)', 'rgba(25, 10, 8, 0)'],
    ];
    for (let i = 0; i < 80; i += 1) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const r = 60 + Math.random() * 360;
      const colors = palette[Math.floor(Math.random() * palette.length)];
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, colors[0]);
      g.addColorStop(1, colors[1]);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    scene.background = texture;
    scene.backgroundIntensity = 0.9;
  }

  /* ── 恒星 ─────────────────────────────────── */
  const sunGroup = new THREE.Group();
  const sunMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: PLANET_VERT,
    fragmentShader: SUN_FRAG,
  });
  const sun = new THREE.Mesh(new THREE.SphereGeometry(sunRadius, 96, 64), sunMaterial);
  sun.frustumCulled = false;
  sunGroup.add(sun);

  // 稳定亮核：即使极端角度下网格被深度裁剪，也不会出现「太阳突然没光」
  const core = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture('rgba(255,255,255,1)', 'rgba(255,210,140,0.5)'),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      transparent: true,
      opacity: 0.55,
    }),
  );
  core.scale.setScalar(sunRadius * 1.15);
  sunGroup.add(core);

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture('rgba(255,255,255,1)', 'rgba(255,170,80,0.42)'),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
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
      depthTest: true,
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

  const sunKey = new THREE.DirectionalLight(0xfff0dd, 3.4);
  sunKey.position.set(0, 0, 0);
  sunKey.target.position.set(0, 0, -1);
  sunKey.castShadow = true;
  sunKey.shadow.mapSize.set(1024, 1024);
  sunKey.shadow.camera.left = -5000;
  sunKey.shadow.camera.right = 5000;
  sunKey.shadow.camera.top = 5000;
  sunKey.shadow.camera.bottom = -5000;
  sunKey.shadow.camera.near = 1_000_000;
  sunKey.shadow.camera.far = 30_000_000;
  sunKey.shadow.bias = -0.0004;
  sunKey.shadow.normalBias = 0.03;
  sunKey.shadow.camera.updateProjectionMatrix();
  scene.add(sunKey);
  scene.add(sunKey.target);

  const ambient = new THREE.AmbientLight(0x2a3d5c, 0.5);
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
        uKind: { value: ({ ocean: 0, desert: 1, ice: 2, gas: 3, lava: 4, verdigris: 5, barren: 6 } as Record<string, number>)[def.surface] ?? 0 },
      },
      vertexShader: PLANET_VERT,
      fragmentShader: PLANET_FRAG,
    });

    const planet = new THREE.Mesh(new THREE.SphereGeometry(def.radius, 192, 128), material);
    planet.rotation.z = def.axialTilt;
    bodyGroup.add(planet);

    const atmosphere = new THREE.Mesh(
      // 视觉大气层固定在约 55 km 厚，不再按行星半径百分比放大
      new THREE.SphereGeometry(def.radius + def.atmosphereHeight * 0.55, 64, 48),
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

    // 低空天空穹顶：从外部看不见，进入大气层后才出现
    const skyPalette = SKY_PALETTE[def.surface] ?? SKY_PALETTE.ocean;
    const skyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uCamera: { value: new THREE.Vector3() },
        uPlanetCenter: { value: new THREE.Vector3() },
        uUp: { value: new THREE.Vector3(0, 1, 0) },
        uSunDir: { value: new THREE.Vector3(1, 0, 0) },
        uZenith: { value: new THREE.Color(skyPalette.zenith) },
        uHorizon: { value: new THREE.Color(skyPalette.horizon) },
        uSunset: { value: new THREE.Color(skyPalette.sunset) },
        uDay: { value: 1 },
        uOpacity: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(def.radius + def.atmosphereHeight * 1.05, 48, 32), skyMaterial);
    sky.frustumCulled = false;
    sky.visible = false;
    bodyGroup.add(sky);

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
      sky,
    });
  }

  /* ── 空港 ─────────────────────────────────── */
  for (const def of system.stations) {
    const bodyGroup = new THREE.Group();
    scene.add(bodyGroup);

    const built = buildStation(def);
    bodyGroup.add(built.group);
    hangars.push(...built.hangars);

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
    starMaterial.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2);
    starGroup.position.copy(camera.position);

    const simDays = SIM_DAYS + (elapsed * TIME_SCALE) / 86_400;

    const toSun = camera.position.clone().negate().normalize();
    sunKey.position.copy(camera.position).addScaledVector(toSun, 18_000_000);
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

        // 大气层：高度 0.16R 以下淡入空白天穹，离地越近越明显
        if (body.sky) {
          const skyMat = body.sky.material as THREE.ShaderMaterial;
          const altitude = camera.position.distanceTo(tmpPos) - def.radius;
          const skyTop = def.atmosphereHeight;
          const skyBottom = Math.max(2000, skyTop * 0.03);
          const opacity = 1 - THREE.MathUtils.smoothstep(altitude, skyBottom, skyTop);
          body.sky.visible = opacity > 0.001;
          if (body.sky.visible) {
            const up = camera.position.clone().sub(tmpPos).normalize();
            const sunDir = tmpPos.clone().negate().normalize();
            const day = THREE.MathUtils.smoothstep(up.dot(sunDir), -0.35, 0.15);
            skyMat.uniforms.uCamera.value.copy(camera.position);
            skyMat.uniforms.uPlanetCenter.value.copy(tmpPos);
            skyMat.uniforms.uUp.value.copy(up);
            skyMat.uniforms.uSunDir.value.copy(sunDir);
            skyMat.uniforms.uDay.value = day;
            skyMat.uniforms.uOpacity.value = opacity;
            skyMat.uniforms.uTime.value = elapsed;
          }
        }
      } else if (body.type === 'station' && body.station) {
        const def = body.station;
        const parent = bodies.find((item) => item.id === def.parent && item.planet);
        const base = parent ? parent.position : tmpSun.set(0, 0, 0);
        const period = 6000 + def.orbit * 0.02;
        const angle = def.phase + (simDays / period) * Math.PI * 2;
        tmpPos.set(
          Math.cos(angle) * def.orbit,
          Math.sin(angle) * def.orbit * Math.sin(def.inclination),
          Math.sin(angle) * def.orbit,
        ).add(base);
        body.position.copy(tmpPos);
        body.object.position.copy(tmpPos);
        body.object.rotation.y = elapsed * def.spin * 0.15;
      }
    }
  };

  return { scene, sun: sunGroup, sunRadius, bodies, hangars, mixers: [], update };
}

/** 空港：桁架主轴 + 三层环 + 四座机库 + 停泊臂 + 散热阵。 */
function buildStation(def: StationDef): {
  group: THREE.Group;
  hangars: Array<{ group: THREE.Group; depth: number; width: number; height: number }>;
} {
  const group = new THREE.Group();
  const body = new THREE.Group();
  const hangarList: Array<{ group: THREE.Group; depth: number; width: number; height: number }> = [];
  const R = def.radius;
  const rand = makeRandom(def.radius * 13 + 7);

  const hull = new THREE.MeshStandardMaterial({ color: 0x9aa6b3, roughness: 0.34, metalness: 0.92, envMapIntensity: 1.4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c242d, roughness: 0.46, metalness: 0.88, envMapIntensity: 1.0 });
  const plate = new THREE.MeshStandardMaterial({ color: 0x5a6673, roughness: 0.5, metalness: 0.85 });
  const glow = new THREE.MeshStandardMaterial({
    color: def.accent,
    emissive: new THREE.Color(def.accent),
    emissiveIntensity: 1.0,
    roughness: 0.3,
    metalness: 0.1,
  });
  const holo = new THREE.MeshBasicMaterial({
    color: new THREE.Color(def.accent),
    transparent: true,
    opacity: 0.08,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  /* 主轴桁架 */
  const spine = new THREE.Mesh(panel(R * 0.1, R * 3.4, R * 0.1, R * 0.02, 2), hull);
  body.add(spine);

  const spineTruss = truss(R * 3.0, R * 0.12, dark, 8);
  spineTruss.rotation.z = Math.PI / 2;
  body.add(spineTruss);

  /* 舱段：沿主轴分布 */
  for (let i = 0; i < 7; i += 1) {
    const y = -R * 1.35 + i * R * 0.45;
    const radius = R * (0.1 + (i % 3) * 0.02);
    const module = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, R * 0.3, 20), i % 2 ? plate : hull);
    module.position.y = y;
    body.add(module);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.06, R * 0.008, 6, 32), glow);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y + R * 0.15;
    body.add(ring);

    // 舷窗
    for (let k = 0; k < 10; k += 1) {
      const a = (k / 10) * Math.PI * 2;
      const win = new THREE.Mesh(new THREE.BoxGeometry(R * 0.012, R * 0.02, R * 0.006), glow);
      win.position.set(Math.cos(a) * radius * 1.02, y, Math.sin(a) * radius * 1.02);
      win.rotation.y = -a;
      body.add(win);
    }
  }

  /* 三层环 */
  const ringSpecs = [
    { radius: R * 1.05, tube: R * 0.05, tilt: [Math.PI / 2, 0, 0] as [number, number, number], y: 0 },
    { radius: R * 0.78, tube: R * 0.04, tilt: [Math.PI / 2.3, 0.3, 0.1] as [number, number, number], y: -R * 0.5 },
    { radius: R * 0.55, tube: R * 0.03, tilt: [Math.PI / 1.7, -0.35, -0.18] as [number, number, number], y: R * 0.6 },
  ];

  for (const spec of ringSpecs) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(spec.radius, spec.tube, 14, 160), hull);
    ring.rotation.set(...spec.tilt);
    ring.position.y = spec.y;
    body.add(ring);

    // 环上的舱段
    const count = Math.round(spec.radius / (R * 0.12));
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2;
      const pod = new THREE.Mesh(panel(R * 0.12, R * 0.1, R * 0.16, R * 0.02, 1), plate);
      pod.position.set(Math.cos(a) * spec.radius, spec.y + Math.sin(a) * 0, Math.sin(a) * spec.radius);
      pod.rotation.y = -a;
      body.add(pod);

      const lamp = new THREE.Mesh(new THREE.BoxGeometry(R * 0.06, R * 0.006, R * 0.006), glow);
      lamp.position.set(Math.cos(a) * spec.radius, spec.y + R * 0.055, Math.sin(a) * spec.radius);
      lamp.rotation.y = -a;
      body.add(lamp);
    }

    // 环与主轴之间的辐条
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(spec.radius, R * 0.02, R * 0.02), dark);
      spoke.position.set(Math.cos(a) * spec.radius * 0.5, spec.y, Math.sin(a) * spec.radius * 0.5);
      spoke.rotation.y = -a;
      body.add(spoke);
    }
  }

  /* 四座机库 */
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2;
    const hangar = buildHangar(R, hull, dark, plate, glow, holo);
    hangar.position.set(Math.cos(angle) * R * 0.95, -R * 0.15, Math.sin(angle) * R * 0.95);
    hangar.rotation.y = -angle;
    group.add(hangar);
    hangarList.push({ group: hangar, depth: R * 0.62, width: R * 0.66, height: R * 0.34 });

    // 连接臂
    const arm = new THREE.Mesh(new THREE.BoxGeometry(R * 0.5, R * 0.06, R * 0.1), plate);
    arm.position.set(Math.cos(angle) * R * 0.55, -R * 0.15, Math.sin(angle) * R * 0.55);
    arm.rotation.y = -angle;
    body.add(arm);
  }

  /* 控制塔 */
  const tower = new THREE.Mesh(panel(R * 0.16, R * 0.5, R * 0.16, R * 0.03, 2), hull);
  tower.position.set(R * 0.28, R * 1.55, -R * 0.3);
  body.add(tower);

  const towerTop = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.16, R * 0.13, R * 0.1, 16), dark);
  towerTop.position.set(R * 0.28, R * 1.82, -R * 0.3);
  body.add(towerTop);

  const towerGlass = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.15, R * 0.15, R * 0.05, 16), glow);
  towerGlass.position.set(R * 0.28, R * 1.84, -R * 0.3);
  body.add(towerGlass);

  /* 散热阵 */
  for (const side of [-1, 1]) {
    const boom = new THREE.Mesh(new THREE.BoxGeometry(R * 0.6, R * 0.02, R * 0.02), hull);
    boom.position.set(side * R * 0.5, -R * 1.1, R * 0.3);
    body.add(boom);

    for (let i = 0; i < 5; i += 1) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(R * 0.34, R * 0.02, R * 0.16), plate);
      fin.position.set(side * (R * 0.72 + i * R * 0.05), -R * 1.1, R * 0.3);
      fin.rotation.x = 0.2;
      body.add(fin);
    }
  }

  /* 太阳能帆 */
  for (const side of [-1, 1]) {
    const sail = new THREE.Mesh(
      new THREE.BoxGeometry(R * 1.1, R * 0.008, R * 0.5),
      new THREE.MeshStandardMaterial({
        color: 0x0d2b45,
        roughness: 0.16,
        metalness: 0.7,
        emissive: new THREE.Color(0x081a2e),
        emissiveIntensity: 1.2,
        envMapIntensity: 1.9,
      }),
    );
    sail.position.set(side * R * 1.4, R * 0.9, 0);
    sail.rotation.z = side * 0.06;
    body.add(sail);

    const frame = new THREE.Mesh(new THREE.BoxGeometry(R * 1.14, R * 0.012, R * 0.54), hull);
    frame.position.copy(sail.position);
    body.add(frame);
  }

  /* 天线阵 */
  for (let i = 0; i < 5; i += 1) {
    const length = R * (0.35 + i * 0.12);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.005, R * 0.008, length, 6), hull);
    const a = (i / 5) * Math.PI * 2;
    mast.position.set(Math.cos(a) * R * 0.2, R * 1.7 + length / 2, Math.sin(a) * R * 0.2);
    body.add(mast);

    const tip = new THREE.Mesh(new THREE.SphereGeometry(R * 0.01, 8, 6), glow);
    tip.position.set(Math.cos(a) * R * 0.2, R * 1.7 + length, Math.sin(a) * R * 0.2);
    body.add(tip);
  }

  /* 全息导航环 */
  for (const scale of [1.25, 1.45]) {
    const halo = new THREE.Mesh(new THREE.TorusGeometry(R * scale, R * 0.0028, 6, 200), holo);
    halo.rotation.x = Math.PI / 2;
    body.add(halo);
  }

  /* 表面杂项 */
  const g = greebles(140, { x: R * 1.9, y: R * 0.8, z: R * 1.9 }, dark, rand);
  body.add(g);

  group.add(mergeStatic(body));
  return { group, hangars: hangarList };
}

/** 单座机库：三面围合 + 开口朝 +X，内部有地板灯与内壁灯。 */
function buildHangar(
  R: number,
  hull: THREE.Material,
  dark: THREE.Material,
  plate: THREE.Material,
  glow: THREE.Material,
  holo: THREE.Material,
): THREE.Group {
  const hangar = new THREE.Group();
  const inner = new THREE.Group();
  const depth = R * 0.62;
  const width = R * 0.66;
  const height = R * 0.34;

  // 背板
  const back = new THREE.Mesh(new THREE.BoxGeometry(R * 0.06, height, width), plate);
  back.position.set(-depth / 2, 0, 0);
  inner.add(back);

  // 顶/底
  for (const y of [height / 2, -height / 2]) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(depth, R * 0.05, width), plate);
    slab.position.set(0, y, 0);
    inner.add(slab);
  }

  // 侧壁
  for (const z of [width / 2, -width / 2]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(depth, height, R * 0.05), plate);
    wall.position.set(0, 0, z);
    inner.add(wall);

    // 内壁灯带
    for (let i = 0; i < 6; i += 1) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(depth * 0.08, R * 0.008, R * 0.008), glow);
      lamp.position.set(-depth / 2 + (i + 0.5) * (depth / 6), height * 0.32, z * 0.94);
      inner.add(lamp);
    }
  }

  // 地板灯：引导线
  for (let i = 0; i < 8; i += 1) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(depth * 0.06, R * 0.006, width * 0.56), glow);
    line.position.set(-depth / 2 + (i + 0.5) * (depth / 8), -height / 2 + R * 0.03, 0);
    inner.add(line);
  }

  // 中央降落圆
  const pad = new THREE.Mesh(new THREE.RingGeometry(width * 0.16, width * 0.2, 40), glow);
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(0, -height / 2 + R * 0.02, 0);
  inner.add(pad);

  // 开口外框
  for (const [y, z] of [
    [height / 2, width / 2],
    [height / 2, -width / 2],
    [-height / 2, width / 2],
    [-height / 2, -width / 2],
  ]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(R * 0.05, R * 0.05, R * 0.05), hull);
    post.position.set(depth / 2 - R * 0.02, y, z);
    inner.add(post);
  }

  // 顶部标识
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.6, height * 0.4), holo);
  sign.position.set(depth / 2 + R * 0.005, height * 0.22, 0);
  sign.rotation.y = Math.PI / 2;
  inner.add(sign);

  // 外挂机械臂（装饰）
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.012, R * 0.012, height * 0.8, 6), dark);
    arm.position.set(depth * 0.34, height * 0.1, side * width * 0.44);
    arm.rotation.z = 0.5;
    inner.add(arm);
  }

  hangar.add(mergeStatic(inner));
  return hangar;
}


/** 异步加载 Blender 导出的机库门，按机库尺寸缩放并播放开合动画。 */
export async function attachHangarDoors(world: World, url: string): Promise<void> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);

  for (const hangar of world.hangars) {
    const clone = gltf.scene.clone(true);

    const scale = (hangar.width * 0.92) / 2.9;
    clone.scale.setScalar(scale);
    clone.rotation.y = Math.PI / 2;
    clone.position.set(hangar.depth / 2 - hangar.depth * 0.06, 0, 0);

    hangar.group.add(clone);

    if (gltf.animations.length > 0) {
      const mixer = new THREE.AnimationMixer(clone);
      const action = mixer.clipAction(gltf.animations[0]);
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.play();
      world.mixers.push(mixer);
    }
  }

  void world;
}
