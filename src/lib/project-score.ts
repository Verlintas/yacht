/**
 * 船坞的工程质量评分。
 *
 * 六项，共 100 分：
 *   规模 20 · 测试 20 · CI 与发布 20 · 文档 15 · 持续投入 15 · 成熟度 10
 *
 * 规模与测试用对数刻度，参考点是「满分线」：
 *   30 万行代码 = 20 分，4000 个测试用例 = 16 分（另有 4 分给 CI 与测试目录）。
 *
 * 这两个参考点需要随数据规模重新标定——指标封顶之后就分不出
 * 「6 万行」和「45 万行」了。改这里就够，不用动页面。
 */
export const SCORE_REFERENCE = {
  loc: 300_000,
  tests: 4_000,
};

export interface ProjectMetrics {
  repo: string;
  measuredAt: string;
  commits?: number;
  versions?: number;
  createdAt?: string | null;
  pushedAt?: string | null;
  stars?: number;
  loc?: number | null;
  chars?: number | null;
  files?: number | null;
  tests?: number;
  assertions?: number;
  ci?: number;
  ciRunsTests?: boolean;
  readme?: number;
  changelog?: boolean;
  contributing?: boolean;
  docs?: number;
  hasLicense?: boolean;
  largest?: { path: string; lines: number } | null;
  filesOver2k?: number;
  filesOver5k?: number;
  filesOver10k?: number;
}

export interface ScoreParts {
  total: number;
  scale: number;
  tests: number;
  ci: number;
  docs: number;
  sustain: number;
  maturity: number;
}

const log = (value: number): number => Math.log10(Math.max(value, 1));

const clamp = (value: number, max: number): number => Math.min(max, Math.max(0, value));

export function daysBetween(from?: string | null, to?: string | null): number {
  if (!from) return 0;
  const start = new Date(from).valueOf();
  const end = to ? new Date(to).valueOf() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

export function scoreProject(metrics: ProjectMetrics): ScoreParts {
  const loc = metrics.loc ?? 0;
  const tests = metrics.tests ?? 0;
  const ci = metrics.ci ?? 0;
  const versions = metrics.versions ?? 0;
  const commits = metrics.commits ?? 0;
  const span = daysBetween(metrics.createdAt, metrics.pushedAt);

  const scale = loc > 0 ? clamp((20 * log(loc + 1)) / log(SCORE_REFERENCE.loc), 20) : 0;
  const testsScore =
    tests > 0
      ? clamp((16 * log(tests + 1)) / log(SCORE_REFERENCE.tests), 16) +
        (metrics.ciRunsTests && tests > 10 ? 3 : 0) +
        1
      : 0;
  const ciScore = clamp(ci * 4, 12) + clamp(versions * 0.3, 8);
  const docsScore =
    clamp(((metrics.readme ?? 0) / 2500) * 6, 6) +
    (metrics.changelog ? 2 : 0) +
    (metrics.contributing ? 2 : 0) +
    clamp((metrics.docs ?? 0) / 4, 4) +
    (metrics.hasLicense ? 1 : 0);
  const sustain = clamp(commits / 16, 9) + clamp((span / 60) * 6, 6);
  const maturity =
    clamp((versions / 8) * 5, 5) +
    (loc > 8000 ? 2 : 0) +
    (metrics.hasLicense ? 2 : 0) +
    (span > 30 ? 1 : 0);

  const total = scale + testsScore + ciScore + docsScore + sustain + maturity;

  return {
    total: Math.round(total * 10) / 10,
    scale: Math.round(scale * 10) / 10,
    tests: Math.round(testsScore * 10) / 10,
    ci: Math.round(ciScore * 10) / 10,
    docs: Math.round(docsScore * 10) / 10,
    sustain: Math.round(sustain * 10) / 10,
    maturity: Math.round(maturity * 10) / 10,
  };
}

/** 人类尺度的换算常数（用于「体量」区块）。 */
export const HUMAN_SCALE = {
  /** 打印时每页按多少行代码 */
  linesPerPage: 55,
  /** 一包纸 500 张 */
  sheetsPerReam: 500,
  /** 一包纸的厚度（厘米） */
  reamThicknessCm: 5,
  /** 一本普通书按多少字符 */
  charsPerBook: 300_000,
  /** 打字速度：60 WPM ≈ 每分钟多少字符 */
  charsPerMinute: 300,
  /** 阅读速度（行/小时），给出三档 */
  readingSpeeds: [100, 300, 600],
};
