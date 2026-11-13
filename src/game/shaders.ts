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

export const PLANET_VERT = /* glsl */ `
  uniform float uSeed;
  uniform float uAmp;
  uniform float uTime;

  varying vec3 vLocal;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vHeight;

  ${NOISE}

  float terrain(vec3 n) {
    float base = fbm(n * 2.35 + uSeed * 11.0);
    float ridge = ridged(n * 5.4 + uSeed * 3.0);
    float detail = fbm(n * 13.0 + uSeed * 21.0);
    return base * 0.62 + ridge * 0.28 + detail * 0.1;
  }

  void main() {
    vec3 n = normalize(position);
    float h = terrain(n);
    vHeight = h;

    vec3 displaced = position + n * (h - 0.5) * uAmp;

    // 用邻域采样估算扰动后的法线
    vec3 tangent = normalize(cross(n, vec3(0.0, 1.0, 0.0) + vec3(0.001)));
    vec3 bitangent = normalize(cross(n, tangent));
    float h1 = terrain(normalize(n + tangent * 0.02));
    float h2 = terrain(normalize(n + bitangent * 0.02));
    vec3 bumped = normalize(n - tangent * (h1 - h) * 28.0 - bitangent * (h2 - h) * 28.0);

    vLocal = n;
    vec4 world = modelMatrix * vec4(displaced, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * bumped);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export const PLANET_FRAG = /* glsl */ `
  precision highp float;

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

  varying vec3 vLocal;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vHeight;

  ${NOISE}

  void main() {
    vec3 n = normalize(vLocal);
    float seed = uSeed * 7.31;

    float height = vHeight;
    float fine = fbm(n * 42.0 + seed * 3.1);

    float sea = mix(0.62, 0.40, uOcean);
    float isLand = smoothstep(sea, sea + 0.012, height);

    // 地表：低处沙/岩，高处亮
    vec3 rock = mix(uDeep, uMid, smoothstep(sea - 0.02, sea + 0.18, height));
    rock = mix(rock, uHigh, smoothstep(0.55, 0.82, height) * 0.75);
    rock *= 0.85 + fine * 0.3;

    // 海面
    vec3 water = mix(uDeep * 0.6, uMid * 0.8, 0.3);

    vec3 albedo = mix(water, rock, isLand);

    // 云
    float cloudNoise = fbm(n * 3.6 + vec3(uTime * 0.008, seed, 0.0));
    float cloud = smoothstep(0.52, 0.72, cloudNoise) * uClouds;

    // 光照
    vec3 N = normalize(vNormalW);
    vec3 L = normalize(uLight);
    vec3 V = normalize(uCamera - vWorld);

    float ndl = dot(N, L);
    float day = smoothstep(-0.18, 0.35, ndl);
    float diffuse = max(ndl, 0.0);
    float wrap = 0.5 + 0.5 * ndl;

    vec3 color = albedo * (0.05 + diffuse * 1.1);

    // 海面高光
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 42.0) * (1.0 - isLand) * (1.0 - cloud) * (1.0 - uRough * 0.5);
    color += uHigh * spec * 0.28;

    // 云
    color = mix(color, vec3(0.86, 0.92, 1.0) * (0.1 + day * 0.95), cloud * 0.85);

    // 城市灯光
    float cityNoise = fbm(n * 26.0 + seed);
    float city = smoothstep(0.62, 0.8, cityNoise) * isLand * (1.0 - smoothstep(-0.1, 0.15, ndl));
    color += vec3(1.0, 0.72, 0.38) * city * uLights * 0.55;

    // 大气边缘
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.2);
    color += mix(uMid, uHigh, 0.5) * fres * uAtmo * (0.25 + wrap * 0.75) * 0.35;

    // 暗面
    color *= mix(0.82, 1.0, day);

    gl_FragColor = vec4(color, 1.0);
  }
`;

export const ATMO_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export const ATMO_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform vec3 uLight;
  uniform vec3 uCamera;
  uniform float uPower;
  varying vec3 vNormal;
  varying vec3 vWorld;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(uCamera - vWorld);
    vec3 L = normalize(uLight);

    float fres = pow(1.0 - abs(dot(N, V)), uPower);
    float lit = smoothstep(-0.45, 0.5, dot(normalize(-N), L));

    gl_FragColor = vec4(uColor, 1.0) * fres * lit * 0.42;
  }
`;

export const RING_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uSeed;
  varying vec2 vUv;
  varying vec3 vWorld;

  ${NOISE}

  void main() {
    float r = vUv.x;
    float bands = vnoise(vec3(r * 34.0 + uSeed, uSeed, 0.0));
    float fine = vnoise(vec3(r * 180.0 + uSeed * 2.0, 0.0, 0.0));
    float density = smoothstep(0.18, 0.45, bands) * (0.55 + fine * 0.45);

    float inner = smoothstep(0.02, 0.12, r);
    float outer = 1.0 - smoothstep(0.82, 1.0, r);
    float alpha = density * inner * outer * 0.75;

    vec3 color = mix(uColorA, uColorB, bands);
    gl_FragColor = vec4(color, alpha);
  }
`;

export const SUN_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  varying vec3 vLocal;
  varying vec3 vWorld;
  varying vec3 vNormalW;

  ${NOISE}

  void main() {
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
  uniform float uTime;
  varying vec3 vWorld;

  ${NOISE}

  void main() {
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
