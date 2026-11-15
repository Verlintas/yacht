/** 全部程序化生成的着色器。没有外部贴图。 */

export const NOISE = /* glsl */ `
  float hash31(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float vnoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash31(i + vec3(0,0,0)), hash31(i + vec3(1,0,0)), f.x),
          mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
          mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y),
      f.z);
  }

  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * vnoise(p);
      p *= 2.02;
      a *= 0.5;
    }
    return v;
  }

  float ridged(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * (1.0 - abs(vnoise(p) * 2.0 - 1.0));
      p *= 2.1;
      a *= 0.5;
    }
    return v;
  }
`;

export const PLANET_VERT = /* glsl */ `#include <common>
  #include <logdepthbuf_pars_vertex>

  varying vec3 vLocal;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vHeight;

  void main() {
    vec3 n = normalize(position);
    vLocal = n;
    vHeight = 0.5;

    // 保持球体轮廓绝对平滑；地表细节全部在片元里完成，
    // 避免低模球体在高空看起来像「迷彩多面体」。
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
    #include <logdepthbuf_vertex>
  }
`;

export const PLANET_FRAG = /* glsl */ `
  precision highp float;
  #include <common>
  #include <logdepthbuf_pars_fragment>

  uniform vec3 uDeep;
  uniform vec3 uMid;
  uniform vec3 uHigh;
  uniform vec3 uLight;
  uniform vec3 uCamera;
  uniform float uTime;
  uniform float uSeed;
  uniform float uOcean;
  uniform float uClouds;
  uniform float uLights;
  uniform float uAtmo;
  uniform float uRough;
  /** 0 海洋 / 1 沙漠 / 2 冰 / 3 气态 / 4 熔岩 / 5 铜绿 / 6 荒芜 */
  uniform float uKind;

  varying vec3 vLocal;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vHeight;

  ${NOISE}

  float fbm3(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 3; i++) {
      v += a * vnoise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }

  float ridged3(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 3; i++) {
      v += a * (1.0 - abs(vnoise(p) * 2.0 - 1.0));
      p *= 2.08;
      a *= 0.5;
    }
    return v;
  }

  // 域扭曲的连续地形：低频大陆、山脊、细节，颜色在片元里平滑混合，
  // 不再把顶点高度直接映射成高对比色块。
  float terrain(vec3 n) {
    vec3 q = n * 2.35 + vec3(uSeed * 3.71, uSeed * 1.37, uSeed * 7.19);
    vec3 warp = vec3(
      vnoise(q * 1.17 + 1.7),
      vnoise(q * 1.17 + 5.3),
      vnoise(q * 1.17 + 9.1)
    ) - 0.5;
    float base = fbm3(q + warp * 1.15);
    float ridge = ridged3(q * 2.25 + warp * 0.9);
    float detail = fbm3(q * 8.0 + 3.1);
    return base * 0.62 + ridge * 0.24 + detail * 0.14;
  }

  void main() {
    #include <logdepthbuf_fragment>
    vec3 n = normalize(vLocal);
    vec3 N = normalize(vNormalW);
    vec3 L = normalize(uLight);
    vec3 V = normalize(uCamera - vWorld);
    float seed = uSeed * 17.13;

    float ndl = dot(N, L);
    float day = smoothstep(-0.12, 0.24, ndl);
    float diffuse = max(ndl, 0.0);
    float wrap = 0.5 + 0.5 * ndl;

    float h = terrain(n);
    float detail = fbm3(n * 21.0 + seed * 0.37);
    float fine = vnoise(n * 92.0 + seed * 1.7);

    vec3 albedo = vec3(0.1);
    float specMask = 0.0;
    float landMask = 0.0;

    if (uKind > 2.5 && uKind < 3.5) {
      /* ── 气态巨行星：多频纬向带 + 缓慢涡流，避免大块「斑马纹」 ── */
      float lat = n.y;
      vec3 q = vec3(n.x * 1.7, lat * 7.5, n.z * 1.7) + seed * 0.11;
      float flow = fbm3(q + vec3(0.0, uTime * 0.004, 0.0));
      float flow2 = ridged3(q * 2.1 + vec3(0.0, uTime * 0.002, seed));
      float b1 = 0.5 + 0.5 * sin(lat * 52.0 + flow * 10.0 + flow2 * 3.0 + seed);
      float b2 = 0.5 + 0.5 * sin(lat * 118.0 - flow * 18.0 + 1.7);
      float bands = smoothstep(0.16, 0.84, b1 * 0.70 + b2 * 0.30);
      vec3 gas = mix(uDeep, uMid, bands);
      gas = mix(gas, uHigh, smoothstep(0.70, 0.96, b2) * 0.22);
      gas *= 0.90 + detail * 0.20;
      float storm = exp(-pow((lat - 0.22) * 8.0, 2.0)) * smoothstep(0.52, 0.76, fbm3(n * 4.0 + seed));
      gas = mix(gas, uHigh * 0.88, storm * 0.32);
      albedo = gas;
    } else if (uKind > 3.5 && uKind < 4.5) {
      /* ── 熔岩世界：暗色结壳，只有细窄裂缝发光 ── */
      float crust = fbm3(n * 8.0 + seed * 0.7);
      float fissure = 1.0 - smoothstep(0.0, 0.018, abs(crust - 0.50));
      fissure *= smoothstep(0.38, 0.72, vnoise(n * 34.0 + seed * 2.0));
      float ember = smoothstep(0.62, 0.82, fbm3(n * 19.0 + seed * 4.0));
      vec3 lava = mix(vec3(0.018, 0.009, 0.007), vec3(0.075, 0.028, 0.018), detail);
      lava += vec3(1.0, 0.26, 0.04) * pow(fissure, 2.2) * 1.05;
      lava += vec3(0.75, 0.14, 0.02) * ember * 0.06;
      albedo = lava;
    } else if (uKind > 1.5 && uKind < 2.5) {
      /* ── 冰封世界：蓝白冰盖与暗色裂谷 ── */
      float cracks = ridged3(n * 9.0 + seed);
      vec3 ice = mix(vec3(0.52, 0.68, 0.80), vec3(0.90, 0.96, 1.0), detail);
      ice = mix(ice, vec3(0.22, 0.40, 0.56), smoothstep(0.62, 0.92, cracks) * 0.42);
      ice *= 0.94 + fine * 0.12;
      albedo = ice;
    } else if (uKind > 5.5 && uKind < 6.5) {
      /* ── 荒芜世界：灰褐岩壳、陨击坑与月海 ── */
      float crater = ridged3(n * 14.0 + seed);
      vec3 barren = mix(uDeep * 0.55, uMid, detail);
      barren = mix(barren, uHigh, smoothstep(0.70, 0.95, detail) * 0.35);
      barren *= 0.86 + crater * 0.24;
      albedo = barren;
      landMask = 1.0;
    } else {
      /* ── 有海/无海的岩石行星 ── */
      bool wetWorld = uKind < 0.5 || uKind > 4.5;
      float sea = wetWorld ? mix(0.43, 0.58, uOcean) : 0.0;
      float land = wetWorld ? smoothstep(sea - 0.004, sea + 0.026, h) : 1.0;
      landMask = land;

      float depth = clamp((sea - h) / 0.30, 0.0, 1.0);
      vec3 deepWater = mix(uDeep * 0.24, vec3(0.004, 0.016, 0.038), 0.5);
      vec3 shallowWater = mix(uMid * 0.72, uHigh * 0.46, 0.35);
      vec3 water = mix(deepWater, shallowWater, 1.0 - depth);
      water *= 0.94 + fine * 0.08;

      float moisture = fbm3(n * 3.7 + seed * 2.3);
      float equator = 1.0 - smoothstep(0.08, 0.68, abs(n.y));
      float dry = 1.0 - smoothstep(0.34, 0.58, moisture);
      float desertMix = dry * equator;
      float rockMix = smoothstep(0.10, 0.34, h - sea);
      float snow = smoothstep(0.64, 0.90, abs(n.y) + (detail - 0.5) * 0.20);

      vec3 forest = mix(vec3(0.030, 0.078, 0.045), vec3(0.10, 0.17, 0.065), detail);
      vec3 wetLand = mix(forest, vec3(0.08, 0.13, 0.07), moisture * 0.55);
      vec3 desert = mix(vec3(0.31, 0.22, 0.11), vec3(0.52, 0.38, 0.21), detail);
      vec3 rock = mix(vec3(0.16, 0.15, 0.14), vec3(0.31, 0.29, 0.26), detail);
      vec3 landCol = mix(wetLand, desert, desertMix * 0.86);
      landCol = mix(landCol, rock, rockMix * 0.72);
      landCol = mix(landCol, vec3(0.82, 0.86, 0.90), snow);

      if (uKind > 0.5 && uKind < 1.5) {
        /* 沙漠行星：用调色板做沙丘，但保持低频、低对比 */
        vec3 dune = mix(uDeep * 0.82, uMid, smoothstep(0.08, 0.72, detail));
        dune = mix(dune, uHigh, smoothstep(0.66, 0.94, detail) * 0.42);
        landCol = mix(landCol, dune, 0.72);
        water = uMid * 0.16;
        land = 1.0;
      } else if (uKind > 4.5) {
        /* 铜绿世界：暗青海洋 + 灰绿陆地 */
        water = mix(uDeep * 0.45, uMid * 0.50, 1.0 - depth);
        landCol = mix(landCol, vec3(0.10, 0.20, 0.17), 0.38);
      }

      albedo = mix(water, landCol, land);
      specMask = (1.0 - land) * 0.85;
    }

    /* ── 云层：大尺度云团 + 丝状高空云，避免均匀「噪点壳」 ── */
    float cloudField = fbm(n * 3.4 + vec3(uTime * 0.0022, seed * 0.13, 0.0)) * 0.66;
    cloudField += ridged3(n * 9.0 - vec3(0.0, uTime * 0.0011, seed)) * 0.34;
    float cloud = smoothstep(0.57, 0.76, cloudField) * uClouds;
    cloud *= smoothstep(0.015, 0.12, abs(n.y)); // 赤道云带稀疏一点
    if (uKind > 2.5 && uKind < 3.5) cloud = 0.0; // 气态行星的云已在条带里

    /* ── 光照与材质 ── */
    vec3 color = albedo * (0.008 + diffuse * 1.42);
    color += albedo * 0.006;

    // 云影
    color *= 1.0 - cloud * 0.16 * day;

    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 86.0) * specMask * (1.0 - cloud);
    color += uHigh * spec * 0.46;

    vec3 cloudColor = vec3(0.80, 0.86, 0.93) * (0.012 + day * 1.18);
    color = mix(color, cloudColor, cloud * 0.78);

    // 晨昏线附近的暖色散射
    float term = smoothstep(-0.22, 0.0, ndl) * (1.0 - smoothstep(0.0, 0.30, ndl));
    color += vec3(0.92, 0.34, 0.11) * term * 0.035;

    // 大气边缘
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.6);
    color += mix(uMid, uHigh, 0.45) * fres * uAtmo * (0.012 + wrap * 0.99) * 0.30;

    // 夜面：保留星光/行星反照，不能纯黑；否则贴近夜面时会像整屏闪黑
    vec3 nightColor = albedo * 0.060 + vec3(0.012, 0.020, 0.036);
    // 夜侧边缘的微弱大气辉光，避免行星临边完全消失
    float nightRim = pow(1.0 - max(dot(N, V), 0.0), 4.0) * (1.0 - day);
    nightColor += vec3(0.030, 0.060, 0.110) * uAtmo * nightRim;
    color = mix(nightColor, color, day);

    // 城市灯光：只出现在陆地和夜面，云层会遮挡
    float cityNoise = fbm3(n * 32.0 + seed * 4.0);
    float city = smoothstep(0.66, 0.81, cityNoise) * landMask * (1.0 - cloud);
    city *= 1.0 - smoothstep(0.02, 0.20, ndl);
    color += vec3(1.0, 0.66, 0.28) * city * uLights * 1.25;

    gl_FragColor = vec4(color, 1.0);
  }
`;

export const SKY_VERT = /* glsl */ `#include <common>
  #include <logdepthbuf_pars_vertex>

  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
    #include <logdepthbuf_vertex>
  }
`;

/**
 * 行星低空天空穹顶。
 * 从外侧看 BackSide 会被剔除，所以只在进入大气层后出现；
 * 白天按行星类型显示白/淡蓝/淡粉/淡绿/淡红，夜面保留少量透明让星空透出。
 */
export const SKY_FRAG = /* glsl */ `
  precision highp float;
  #include <common>
  #include <logdepthbuf_pars_fragment>

  uniform vec3 uCamera;
  uniform vec3 uPlanetCenter;
  uniform vec3 uUp;
  uniform vec3 uSunDir;
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uSunset;
  uniform float uDay;
  uniform float uOpacity;
  uniform float uTime;

  varying vec3 vWorld;

  ${NOISE}

  void main() {
    #include <logdepthbuf_fragment>
    vec3 viewDir = normalize(vWorld - uCamera);

    // 相对当地地平线的仰角：0 为地平线，1 为天顶
    float altitude = dot(viewDir, uUp);
    float horizon = 1.0 - smoothstep(-0.04, 0.58, altitude);

    vec3 color = mix(uZenith, uHorizon, horizon);

    // 太阳附近的亮斑与地平线暖色
    float sunDot = max(dot(viewDir, uSunDir), 0.0);
    color += vec3(1.0, 0.90, 0.76) * pow(sunDot, 110.0) * 0.42;
    color += uSunset * pow(sunDot, 5.0) * 0.10 * (1.0 - uDay * 0.55);

    vec2 viewAzimuth = normalize(viewDir.xz + vec2(1e-4));
    vec2 sunAzimuth = normalize(uSunDir.xz + vec2(1e-4));
    float sunsetBand = pow(max(dot(viewAzimuth, sunAzimuth), 0.0), 5.0);
    float terminator = 1.0 - abs(uDay * 2.0 - 1.0);
    color = mix(color, uSunset, horizon * sunsetBand * terminator * 0.26);

    // 地平线附近很淡的雾/云带，避免天空纯渐变
    float haze = smoothstep(0.42, 0.82, vnoise(viewDir * 7.0 + vec3(uTime * 0.003, 0.0, 0.0)));
    color = mix(color, vec3(1.0), haze * horizon * 0.055);

    // 夜面保留一点蓝色星辉；alpha 较低，让星空和远舰仍然可见
    color *= mix(0.16, 1.0, uDay);

    float alpha = uOpacity * mix(0.14, 0.92, uDay);
    gl_FragColor = vec4(color, alpha);
  }
`;

export const ATMO_VERT = /* glsl */ `#include <common>
  #include <logdepthbuf_pars_vertex>

  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
    #include <logdepthbuf_vertex>
  }
`;

export const ATMO_FRAG = /* glsl */ `
  precision highp float;
  #include <common>
  #include <logdepthbuf_pars_fragment>

  uniform vec3 uColor;
  uniform vec3 uLight;
  uniform vec3 uCamera;
  uniform float uPower;
  varying vec3 vNormal;
  varying vec3 vWorld;

  void main() {
    #include <logdepthbuf_fragment>
    vec3 N = normalize(vNormal);
    vec3 V = normalize(uCamera - vWorld);
    vec3 L = normalize(uLight);

    float fres = pow(1.0 - abs(dot(N, V)), uPower);
    float lit = smoothstep(-0.18, 0.32, dot(normalize(-N), L));
    // 夜侧保留一圈很淡的大气辉光，避免临边完全黑掉
    float lightAmount = lit * 0.3 + (1.0 - lit) * 0.045;

    gl_FragColor = vec4(uColor, 1.0) * fres * lightAmount;
  }
`;

export const RING_FRAG = /* glsl */ `
  precision highp float;
  #include <common>
  #include <logdepthbuf_pars_fragment>

  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uSeed;
  varying vec2 vUv;
  varying vec3 vWorld;

  ${NOISE}

  void main() {
    #include <logdepthbuf_fragment>
    float r = vUv.x;
    float bands = vnoise(vec3(r * 34.0 + uSeed, uSeed, 0.0));
    float fine = vnoise(vec3(r * 180.0 + uSeed * 2.0, 0.0, 0.0));
    float density = smoothstep(0.18, 0.45, bands) * (0.55 + fine * 0.45);

    float inner = smoothstep(0.02, 0.12, r);
    float outer = 1.0 - smoothstep(0.82, 1.0, r);
    float alpha = density * inner * outer * 0.46;

    vec3 color = mix(uColorA, uColorB, bands);
    gl_FragColor = vec4(color, alpha);
  }
`;

export const SUN_FRAG = /* glsl */ `
  precision highp float;
  #include <common>
  #include <logdepthbuf_pars_fragment>

  uniform float uTime;
  varying vec3 vLocal;
  varying vec3 vWorld;
  varying vec3 vNormalW;

  ${NOISE}

  void main() {
    #include <logdepthbuf_fragment>
    vec3 n = normalize(vLocal);
    float t = uTime * 0.045;
    float a = fbm(n * 4.0 + vec3(t, 0.0, t * 0.7));
    float b = fbm(n * 11.0 - vec3(0.0, t * 1.4, 0.0));
    float heat = a * 0.7 + b * 0.3;

    vec3 core = vec3(1.0, 0.96, 0.86);
    vec3 mid = vec3(1.0, 0.72, 0.34);
    vec3 edge = vec3(1.0, 0.38, 0.09);

    vec3 color = mix(edge, mid, smoothstep(0.25, 0.6, heat));
    color = mix(color, core, smoothstep(0.55, 0.9, heat));

    float rim = pow(1.0 - abs(dot(normalize(vNormalW), normalize(cameraPosition - vWorld))), 2.2);
    color += mid * rim * 0.9;

    gl_FragColor = vec4(color * 2.4, 1.0);
  }
`;

export const NEBULA_FRAG = /* glsl */ `
  precision highp float;
  #include <common>
  #include <logdepthbuf_pars_fragment>

  uniform float uTime;
  varying vec3 vWorld;

  ${NOISE}

  void main() {
    #include <logdepthbuf_fragment>
    vec3 dir = normalize(vWorld);
    float n1 = fbm(dir * 2.2 + 4.0);
    float n2 = fbm(dir * 5.5 - 2.0);
    float cloud = smoothstep(0.42, 0.78, n1 * 0.7 + n2 * 0.3);

    vec3 violet = vec3(0.16, 0.1, 0.3);
    vec3 teal = vec3(0.05, 0.16, 0.2);
    vec3 color = mix(teal, violet, smoothstep(0.2, 0.8, n2));

    gl_FragColor = vec4(color * cloud * 0.55, cloud * 0.5);
  }
`;
