#!/usr/bin/env node
/**
 * 采集船坞项目的工程指标，写入 src/data/project-metrics.json。
 *
 * 设计原则：
 *   - 人工只负责「这个项目要不要展示、算不算旗舰」；
 *   - 数字全部由本脚本测量，不由人填，避免过时和口径漂移。
 *
 * 用法：
 *   node scripts/collect-metrics.mjs            # 全部
 *   node scripts/collect-metrics.mjs --only NOIR
 *   node scripts/collect-metrics.mjs --skip-clone   # 只更新提交/版本数
 *
 * 依赖：git、gh（已登录）或 GITHUB_TOKEN。
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PROJECTS_DIR = path.join(ROOT, 'src', 'content', 'projects');
const OUT_FILE = path.join(ROOT, 'src', 'data', 'project-metrics.json');

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const skipClone = args.includes('--skip-clone');

const CODE_EXT = new Set([
  '.kt', '.kts', '.java', '.xml', '.py', '.js', '.jsx', '.ts', '.tsx',
  '.css', '.html', '.sh', '.swift', '.rs', '.c', '.h', '.go', '.astro',
]);
const SKIP_DIRS = new Set([
  'build', '.git', '.gradle', '.idea', 'node_modules', 'dist', 'out',
  'Pods', 'target', 'venv', '.venv', 'vendor', '.next', 'third_party', 'DerivedData',
]);
const SKIP_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg', '.ttf', '.otf',
  '.woff', '.woff2', '.jar', '.so', '.dylib', '.dll', '.a', '.zip', '.mp3',
  '.mp4', '.pdf', '.lock', '.map',
]);

/** 从项目 Markdown 的 frontmatter 里读出 repo 全名。 */
function readProjects() {
  const out = [];
  for (const file of readdirSync(PROJECTS_DIR)) {
    if (!file.endsWith('.md')) continue;
    const text = readFileSync(path.join(PROJECTS_DIR, file), 'utf8');
    const end = text.indexOf('\n---', 3);
    const fm = end > 0 ? text.slice(0, end) : text;
    const repo = fm.match(/^repo:\s*https:\/\/github\.com\/([^\s]+)\s*$/m)?.[1];
    if (!repo) continue;
    const slug = file.replace(/\.md$/, '');
    out.push({ slug, repo: repo.replace(/\/+$/, '') });
  }
  return out;
}

function sh(cmd, cmdArgs, opts = {}) {
  return execFileSync(cmd, cmdArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
}

/** 用 gh 或 curl 调 GitHub API。 */
function api(endpoint, headers = false) {
  const token = process.env.GITHUB_TOKEN;
  try {
    if (headers) {
      return sh('gh', ['api', '-i', endpoint]);
    }
    return sh('gh', ['api', endpoint]);
  } catch {
    const url = `https://api.github.com/${endpoint}`;
    const curlArgs = ['-sSL', '--max-time', '60', url];
    if (token) curlArgs.push('-H', `Authorization: Bearer ${token}`);
    return sh('curl', curlArgs);
  }
}

function repoMeta(repo) {
  const raw = JSON.parse(api(`repos/${repo}`));
  const commitsRaw = api(`repos/${repo}/commits?per_page=1`, true);
  const lastPage = commitsRaw.match(/page=(\d+)>;\s*rel="last"/)?.[1];
  let versions = 0;
  try {
    const tags = JSON.parse(api(`repos/${repo}/tags?per_page=100`));
    versions = Array.isArray(tags) ? tags.length : 0;
  } catch {
    versions = 0;
  }
  return {
    commits: lastPage ? Number(lastPage) : 1,
    versions,
    createdAt: raw.created_at?.slice(0, 10) ?? null,
    pushedAt: raw.pushed_at?.slice(0, 10) ?? null,
    stars: raw.stargazers_count ?? 0,
    license: Boolean(raw.license),
  };
}

function countTests(ext, text, filePath) {
  switch (ext) {
    case '.rs':
      return (text.match(/#\[(?:tokio::)?test\]/g) ?? []).length;
    case '.kt':
    case '.java':
      return (text.match(/@Test\b/g) ?? []).length;
    case '.swift':
      return (text.match(/func\s+test\w*\s*\(/g) ?? []).length;
    case '.ts':
    case '.tsx':
    case '.js':
    case '.jsx':
      return /(test|spec)/i.test(filePath) ? (text.match(/\b(?:it|test)\s*\(/g) ?? []).length : 0;
    case '.py':
      return (text.match(/^\s*def\s+test_\w+/gm) ?? []).length;
    default:
      return 0;
  }
}

function scanTree(dir) {
  const result = {
    loc: 0, chars: 0, files: 0, tests: 0, assertions: 0, ci: 0, ciRunsTests: false,
    readme: 0, changelog: false, contributing: false, docs: 0, hasLicense: false,
    largest: null, filesOver2k: 0, filesOver5k: 0, filesOver10k: 0,
  };
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full);
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (SKIP_EXT.has(ext) || !CODE_EXT.has(ext)) continue;
      let text;
      try {
        text = readFileSync(full, 'utf8');
      } catch {
        continue;
      }
      const lines = text.split('\n').length;
      result.files += 1;
      result.loc += lines;
      result.chars += text.length;
      result.tests += countTests(ext, text, full);
      if (['.rs', '.kt', '.swift', '.java', '.py'].includes(ext)) {
        result.assertions += (text.match(/\bassert\w*\s*[!(]/g) ?? []).length;
      }
      if (lines > 2000) result.filesOver2k += 1;
      if (lines > 5000) result.filesOver5k += 1;
      if (lines > 10000) result.filesOver10k += 1;
      if (!result.largest || lines > result.largest.lines) {
        result.largest = { path: path.relative(dir, full), lines };
      }
    }
  };
  walk(dir);

  const readIf = (name) => {
    try {
      return readFileSync(path.join(dir, name), 'utf8');
    } catch {
      return null;
    }
  };

  for (const name of ['README.md', 'readme.md', 'README.rst', 'README']) {
    const text = readIf(name);
    if (text) {
      result.readme = text.length;
      break;
    }
  }
  result.changelog = Boolean(readIf('CHANGELOG.md') ?? readIf('CHANGELOG'));
  result.contributing = Boolean(readIf('CONTRIBUTING.md'));
  result.hasLicense = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENSE-APACHE'].some((n) => readIf(n));

  const docsDir = path.join(dir, 'docs');
  try {
    const countDocs = (d) =>
      readdirSync(d, { withFileTypes: true }).reduce((sum, e) => {
        if (e.isDirectory()) return sum + countDocs(path.join(d, e.name));
        return sum + (e.name.endsWith('.md') ? 1 : 0);
      }, 0);
    result.docs = countDocs(docsDir);
  } catch {
    result.docs = 0;
  }

  const wfDir = path.join(dir, '.github', 'workflows');
  try {
    const files = readdirSync(wfDir).filter((n) => /\.ya?ml$/.test(n));
    result.ci = files.length;
    result.ciRunsTests = files.some((n) => {
      const text = readFileSync(path.join(wfDir, n), 'utf8');
      return /run:.*\b(test|Test|pytest|gradlew.*[Tt]est|xcodebuild.*test)/m.test(text);
    });
  } catch {
    result.ci = 0;
  }

  return result;
}

function measure(project) {
  const meta = repoMeta(project.repo);
  let scan = null;
  if (!skipClone) {
    const tmp = mkdtempSync(path.join(tmpdir(), 'metrics-'));
    try {
      sh('git', ['clone', '--quiet', '--depth', '1', `https://github.com/${project.repo}.git`, tmp]);
      scan = scanTree(tmp);
    } catch (error) {
      console.error(`  ! clone 失败 ${project.repo}: ${error.message.split('\n')[0]}`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
  return {
    repo: project.repo,
    measuredAt: new Date().toISOString().slice(0, 10),
    ...meta,
    ...(scan ?? {}),
  };
}

const projects = readProjects().filter((p) => !only || p.repo.endsWith(`/${only}`));
console.log(`采集 ${projects.length} 个仓库…`);

const previous = (() => {
  try {
    return JSON.parse(readFileSync(OUT_FILE, 'utf8'));
  } catch {
    return {};
  }
})();

const output = { generatedAt: new Date().toISOString(), projects: { ...previous.projects } };

for (const project of projects) {
  process.stdout.write(`- ${project.repo} … `);
  try {
    const metrics = measure(project);
    output.projects[project.repo] = metrics;
    console.log(`${metrics.loc ?? '?'} 行 / ${metrics.commits} 提交`);
  } catch (error) {
    console.log(`失败：${error.message.split('\n')[0]}`);
  }
}

mkdirSync(path.dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(`\n已写入 ${path.relative(ROOT, OUT_FILE)}`);
