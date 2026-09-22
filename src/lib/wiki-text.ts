/** 把 Markdown 正文压成纯文本，用于统计与全文搜索索引。 */
export function stripMarkdown(body: string): string {
  return body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    .replace(/^\s{0,3}\d+\.\s+/gm, '')
    .replace(/^\s*\|?[\s:|-]+\|[\s:|-]*$/gm, ' ')
    .replace(/\|/g, ' ')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 非空白字符数，与站内统计口径一致。 */
export function countChars(text: string): number {
  return text.replace(/\s/g, '').length;
}

/** 正文里所有 Markdown 标题的纯文本。 */
export function extractHeadings(body: string): string[] {
  return Array.from(body.matchAll(/^\s{0,3}#{1,6}\s+(.+)$/gm)).map((match) =>
    match[1].replace(/[*_`]/g, '').trim(),
  );
}

export function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

/** 距今天数。 */
export function daysSince(date: Date, now = new Date()): number {
  return Math.floor((now.getTime() - date.getTime()) / 86_400_000);
}

export interface Staleness {
  days: number;
  level: 'fresh' | 'aging' | 'stale';
  label: string;
}

/** 按最后核对日期给出时效提示。 */
export function staleness(date: Date, now = new Date()): Staleness {
  const days = daysSince(date, now);
  if (days > 365) return { days, level: 'stale', label: '超过一年未核对' };
  if (days > 180) return { days, level: 'aging', label: '超过半年未核对' };
  return { days, level: 'fresh', label: '近期核对过' };
}
