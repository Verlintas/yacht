/**
 * 星系数据：项目 → 行星，站点 → 空港。
 *
 * 尺度约定：1 单位 ≈ 1 米。行星半径约等于真实行星的 1/10
 * （地球 6371 km → 约 637 km → 637000 单位），但为了可玩性，
 * 实际取 2000–6000 单位，靠表面细节和接近感来撑体量。
 */

export interface ProjectInput {
  id: string;
  title: string;
  summary: string;
  url: string;
  stack: string[];
  loc: number;
  chars: number;
  tests: number;
  commits: number;
  versions: number;
  createdAt: string | null;
  pushedAt: string | null;
}

export type Surface = 'ocean' | 'desert' | 'ice' | 'gas' | 'lava' | 'verdigris' | 'barren';

export interface PlanetDef {
  id: string;
  kind: 'planet';
  title: string;
  subtitle: string;
  url: string;
  summary: string;
  loc: number;
  tests: number;
  commits: number;
  versions: number;
  createdAt: string | null;
  radius: number;
  orbit: number;
  /** 初始相位（弧度） */
  phase: number;
  /** 公转周期（天，真实时间） */
  periodDays: number;
  inclination: number;
  spinHours: number;
  surface: Surface;
  palette: [number, number, number];
  atmosphere: number;
  ring: boolean;
  moon: boolean;
  clouds: number;
  lights: boolean;
  axialTilt: number;
  seed: number;
  roughness: number;
}

export interface StationDef {
  id: string;
  kind: 'station';
  title: string;
  subtitle: string;
  description: string;
  to: string;
  radius: number;
  orbit: number;
  phase: number;
  inclination: number;
  spin: number;
  accent: number;
}

export interface SystemData {
  planets: PlanetDef[];
  stations: StationDef[];
  counts: { projects: number; wiki: number; berths: number };
}

const LANG: Array<{ match: RegExp; surfaces: Surface[] }> = [
  { match: /kotlin/i, surfaces: ['verdigris', 'ocean'] },
  { match: /rust/i, surfaces: ['desert', 'lava'] },
  { match: /swift/i, surfaces: ['ice', 'ocean'] },
  { match: /typescript|javascript/i, surfaces: ['ocean', 'barren'] },
  { match: /astro|html|css/i, surfaces: ['lava', 'desert'] },
  { match: /python|markdown|shell/i, surfaces: ['ocean', 'gas'] },
];

const PALETTE: Record<Surface, [number, number, number]> = {
  ocean: [0x081826, 0x1b5d86, 0xa9dcf2],
  desert: [0x2a1608, 0x9a5a28, 0xf2c48a],
  ice: [0x101d2b, 0x6f9ab8, 0xeaf6ff],
  gas: [0x1a1430, 0x7a5796, 0xe0cbf5],
  lava: [0x140705, 0x8f2f14, 0xffa05e],
  verdigris: [0x091a18, 0x226e62, 0xa8ead6],
  barren: [0x14161a, 0x5c6168, 0xb8bcc2],
};

export function makeRandom(seed: number): () => number {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

const hashString = (text: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
};

export function buildSystem(input: {
  projects: ProjectInput[];
  counts: { projects: number; wiki: number; berths: number };
}): SystemData {
  const sorted = input.projects.slice().sort((a, b) => b.loc - a.loc);
  const maxLoc = Math.max(...sorted.map((p) => p.loc), 1);

  const planets: PlanetDef[] = sorted.map((project, index) => {
    const seed = hashString(project.id);
    const rand = makeRandom(seed);
    const lang = LANG.find((entry) => entry.match.test(project.stack[0] ?? '')) ?? LANG[5];
    const surface = lang.surfaces[seed % lang.surfaces.length];
    const ratio = Math.log10(project.loc + 1) / Math.log10(maxLoc + 1);

    const radius = 3400 + ratio * 4600 + rand() * 900;
    const orbit = 95000 + index * 52000 + rand() * 9000;

    return {
      id: project.id,
      kind: 'planet',
      title: project.title,
      subtitle: project.stack.slice(0, 2).join(' · ') || '项目',
      url: project.url,
      summary: project.summary,
      loc: project.loc,
      tests: project.tests,
      commits: project.commits,
      versions: project.versions,
      createdAt: project.createdAt,
      radius,
      orbit,
      phase: rand() * Math.PI * 2,
      periodDays: 240 + index * 55 + rand() * 60,
      inclination: (rand() - 0.5) * 0.08,
      spinHours: 14 + rand() * 40,
      surface,
      palette: PALETTE[surface],
      atmosphere: 0.55 + rand() * 0.7,
      ring: ratio > 0.55 && rand() > 0.45,
      moon: rand() > 0.5,
      clouds: surface === 'gas' ? 1.1 : surface === 'barren' ? 0.05 : 0.4 + rand() * 0.5,
      lights: surface === 'ocean' || surface === 'verdigris' ? rand() > 0.35 : false,
      axialTilt: (rand() - 0.5) * 0.5,
      seed: seed % 1000,
      roughness: 0.55 + rand() * 0.4,
    };
  });

  const stations: StationDef[] = [
    {
      id: 'station-weather',
      kind: 'station',
      title: '气象站',
      subtitle: '五处泊位',
      description: '实时天况、空气质量、海况与未来几天预报。',
      to: '/berths/',
      radius: 3200,
      orbit: 78000,
      phase: Math.PI * 0.35,
      inclination: 0.03,
      spin: 0.1,
      accent: 0x7fe0d0,
    },
    {
      id: 'station-archive',
      kind: 'station',
      title: '档案馆',
      subtitle: `${input.counts.wiki} 条资料`,
      description: '百科、阅读路径、标签与全文搜索。',
      to: '/wiki/',
      radius: 3800,
      orbit: 210000,
      phase: Math.PI * 1.15,
      inclination: -0.05,
      spin: -0.08,
      accent: 0xc9a55c,
    },
    {
      id: 'station-board',
      kind: 'station',
      title: '留言板',
      subtitle: '公共频道',
      description: '在这里留下航迹。',
      to: '#board',
      radius: 3000,
      orbit: 420000,
      phase: Math.PI * 1.72,
      inclination: 0.07,
      spin: 0.14,
      accent: 0xff9d7a,
    },
    {
      id: 'station-dock',
      kind: 'station',
      title: '母港',
      subtitle: '船坞',
      description: '项目清单、工程指标与体量统计。',
      to: '/projects/',
      radius: 3600,
      orbit: 120000,
      phase: Math.PI * 0.92,
      inclination: 0.02,
      spin: 0.07,
      accent: 0x8cc2f0,
    },
  ];

  return { planets, stations, counts: input.counts };
}
