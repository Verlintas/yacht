#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { load } from 'js-yaml';

const WIKI_DIR = 'src/content/wiki';
const checkLinks = process.argv.includes('--links');

function parseFrontmatter(raw) {
  if (!raw.startsWith('---')) return null;
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return null;
  try {
    return load(raw.slice(3, end));
  } catch (error) {
    throw new Error(`frontmatter 解析失败：${error.message}`);
  }
}

let files = [];
try {
  files = (await readdir(WIKI_DIR)).filter((name) => name.endsWith('.md'));
} catch {
  console.log(`未找到 ${WIKI_DIR}，跳过来源检查。`);
  process.exit(0);
}

const problems = [];
const entries = [];

for (const file of files.sort()) {
  const raw = await readFile(join(WIKI_DIR, file), 'utf8');
  let data;
  try {
    data = parseFrontmatter(raw);
  } catch (error) {
    problems.push(`${file}: ${error.message}`);
    continue;
  }
  if (!data) {
    problems.push(`${file}: 缺少 frontmatter`);
    continue;
  }

  const sources = data.sources;
  if (!Array.isArray(sources) || sources.length === 0) {
    problems.push(`${file}: sources 缺失或为空（每个条目至少一条来源）`);
  } else {
    for (const source of sources) {
      if (!source || typeof source.title !== 'string' || typeof source.url !== 'string') {
        problems.push(`${file}: 来源缺少 title 或 url`);
      } else if (!/^https?:\/\//.test(source.url)) {
        problems.push(`${file}: 来源 url 非法 -> ${source.url}`);
      }
    }
  }

  for (const item of data.upstream ?? []) {
    if (!item || typeof item.title !== 'string' || typeof item.url !== 'string') {
      problems.push(`${file}: upstream 缺少 title 或 url`);
    }
  }

  if (!data.status) problems.push(`${file}: 缺少 status`);

  entries.push({ file, sources: sources ?? [], upstream: data.upstream ?? [] });
}

if (problems.length > 0) {
  console.error('来源检查未通过：');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

const sourceCount = entries.reduce((sum, entry) => sum + entry.sources.length, 0);
console.log(`来源检查通过：${entries.length} 个条目，${sourceCount} 条来源。`);

if (checkLinks) {
  const urls = new Set();
  for (const entry of entries) {
    for (const source of entry.sources) urls.add(source.url);
    for (const item of entry.upstream) if (item?.url) urls.add(item.url);
  }

  const list = [...urls];
  console.log(`开始检查 ${list.length} 个外链…`);

  const dead = [];
  await Promise.all(
    list.map(async (url) => {
      try {
        const response = await fetch(url, {
          redirect: 'follow',
          signal: AbortSignal.timeout(20000),
          headers: { 'user-agent': 'Mozilla/5.0 (compatible; link-check/1.0)' },
        });
        if (!response.ok) dead.push(`${response.status} ${url}`);
      } catch (error) {
        dead.push(`ERR ${url} (${error.message})`);
      }
    }),
  );

  if (dead.length > 0) {
    console.warn(`\n有 ${dead.length} 个外链不可用（不阻塞部署，需要人工判断）：`);
    for (const item of dead.sort()) console.warn(`  - ${item}`);
    console.warn('注意：403 / 412 常见于反爬站点，链接本身可能是好的。');
  } else {
    console.log('所有外链可用。');
  }
}
