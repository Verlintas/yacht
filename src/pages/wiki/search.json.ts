import { getCollection } from 'astro:content';
import { aliasesFor } from '../../data/wiki';
import { countChars, extractHeadings, stripMarkdown } from '../../lib/wiki-text';

/**
 * 全文搜索索引。
 *
 * 正文可能很长（全站 50 万字），所以每条的正文只截取前 MAX_BODY 字，
 * 但标题、摘要、别名与全部小节标题都会完整收录——搜索时命中率更高，
 * 同时把索引体积压到可接受范围（按需加载）。
 */
const MAX_BODY = 2600;

export async function GET() {
  const entries = await getCollection('wiki');

  const index = entries
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((entry) => {
      const body = stripMarkdown(entry.body ?? '');
      const headings = extractHeadings(entry.body ?? '');
      const aliases = aliasesFor(entry.id);

      const parts = [
        entry.data.title,
        entry.data.summary ?? '',
        entry.data.tags.join(' '),
        aliases.join(' '),
        headings.join(' '),
        body.slice(0, MAX_BODY),
      ];

      return {
        id: entry.id,
        title: entry.data.title,
        summary: entry.data.summary ?? '',
        category: entry.data.category,
        tags: entry.data.tags,
        chars: countChars(body),
        haystack: parts.join(' \u0001 ').toLowerCase(),
      };
    });

  return new Response(JSON.stringify({ generatedAt: new Date().toISOString(), index }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
