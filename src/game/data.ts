/**
 * 星系数据：把船坞的项目变成行星，把站点变成空间站。
 * 这里只做纯数据变换，不碰 Three.js。
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

export type PlanetKind = 'ocean' | 'desert' | 'ice' | 'gas' | 'lava' | 'verdigris';

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
  surface: PlanetKind;
  radius: number;
  orbit: number;
  phase: number;
  inclination: number;
  spin: number;
  palette: [number, number, number];
  atmosphere: number;
  ring: boolean;
  moon: boolean;
  clouds: boolean;
  lights: boolean;
  seed: number;
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

const LANG: Array<{ match: RegExp; palettes: PlanetKind[]; color: number }> = [
  { match: /kotlin/i, palettes: ['verdigris', 'ocean'], color: 0xb49cff },
  { match: /rust/i, palettes: ['desert', 'lava'], color: 0xf09a63 },
  { match: /swift/i, palettes: ['ice', 'ocean'], color: 0xff8b8e },
  { match: /typescript|javascript/i, palettes: ['ocean', 'ice'], color: 0x8cc2f0 },
  { match: /astro|html|css/i, palettes: ['lava', 'desert'], color: 0xef8a63 },
  { match: /python|markdown|shell/i, palettes: ['ocean', 'gas'], color: 0x86b8e8 },
];

/** 每种星球的三段配色（深 / 中 / 高光）。 */
const PALETTE: Record<PlanetKind, [number, number, number]> = {
  ocean: [0x0a1d33, 0x1d5f8a, 0x9fd7f0],
  desert: [0x2a1608, 0x8a4f24, 0xf0c187],
  ice: [0x142436, 0x5f8ca8, 0xe6f4ff],
  gas: [0x1a1430, 0x6b4a8a, 0xd9c2f0],
  lava: [0x1b0a06, 0x8c2d12, 0xff9d5c],
  verdigris: [0x0d1f1d, 0x1f6b5f, 0x9fe6cf],
};

/** 稳定伪随机。 */
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
  const sorted = input.projects
    .slice()
    .sort((a, b) => b.loc - a.loc);

  const maxLoc = Math.max(...sorted.map((p) => p.loc), 1);

  const planets: PlanetDef[] = sorted.map((project, index) => {
    const seed = hashString(project.id);
    const rand = makeRandom(seed);
    const lang = LANG.find((entry) => entry.match.test(project.stack[0] ?? '')) ?? LANG[5];
    const kind = lang.palettes[seed % lang.palettes.length];
    const ratio = Math.log10(project.loc + 1) / Math.log10(maxLoc + 1);

    return {
      id: project.id,
      kind: 'planet',
      surface: kind,
      title: project.title,
      subtitle: project.stack.slice(0, 2).join(' · ') || '项目',
      url: project.url,
      summary: project.summary,
      loc: project.loc,
      tests: project.tests,
      commits: project.commits,
      versions: project.versions,
      createdAt: project.createdAt,
      radius: 78 + ratio * 132,
      orbit: 1350 + index * 430 + rand() * 120,
      phase: rand() * Math.PI * 2,
      inclination: (rand() - 0.5) * 0.16,
      spin: 0.02 + rand() * 0.05,
      palette: PALETTE[kind],
      atmosphere: 0.5 + rand() * 0.6,
      ring: ratio > 0.62 && rand() > 0.35,
      moon: rand() > 0.55,
      clouds: kind === 'ocean' || kind === 'ice' || kind === 'verdigris',
      lights: kind === 'ocean' || kind === 'verdigris' ? rand() > 0.4 : false,
      seed: seed % 1000,
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
      radius: 90,
      orbit: 900,
      phase: Math.PI * 0.35,
      inclination: 0.05,
      spin: 0.12,
      accent: 0x7fe0d0,
    },
    {
      id: 'station-archive',
      kind: 'station',
      title: '档案馆',
      subtitle: `${input.counts.wiki} 条资料`,
      description: '百科、阅读路径、标签与全文搜索。',
      to: '/wiki/',
      radius: 110,
      orbit: 2100,
      phase: Math.PI * 1.15,
      inclination: -0.08,
      spin: -0.09,
      accent: 0xc9a55c,
    },
    {
      id: 'station-board',
      kind: 'station',
      title: '留言板',
      subtitle: '公共频道',
      description: '在这里留下航迹。',
      to: '#board',
      radius: 74,
      orbit: 5800,
      phase: Math.PI * 1.72,
      inclination: 0.12,
      spin: 0.16,
      accent: 0xff9d7a,
    },
    {
      id: 'station-dock',
      kind: 'station',
      title: '母港',
      subtitle: '船坞',
      description: '项目清单、工程指标与体量统计。',
      to: '/projects/',
      radius: 96,
      orbit: 640,
      phase: Math.PI * 0.92,
      inclination: 0.02,
      spin: 0.08,
      accent: 0x8cc2f0,
    },
  ];

  return { planets, stations, counts: input.counts };
}
