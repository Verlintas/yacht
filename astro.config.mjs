import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import path from 'node:path';
import { glossaryTerms } from './src/data/glossary.mjs';

const base = '/yacht';

/** Markdown 里的站内绝对链接（以 / 开头）自动补上 base 前缀。 */
function rehypeBaseLinks() {
  const prefix = base.replace(/\/+$/, '');
  return (tree) => {
    const walk = (node) => {
      if (node.type === 'element' && (node.tagName === 'a' || node.tagName === 'img')) {
        const key = node.tagName === 'a' ? 'href' : 'src';
        const value = node.properties?.[key];
        if (typeof value === 'string' && value.startsWith('/') && !value.startsWith(`${prefix}/`)) {
          node.properties[key] = `${prefix}${value}`;
        }
      }
      for (const child of node.children ?? []) walk(child);
    };
    walk(tree);
  };
}

/** 这些元素内部不做术语链接，避免污染标题、代码和已有链接。 */
const GLOSSARY_SKIP = new Set([
  'a', 'code', 'pre', 'script', 'style', 'kbd',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
]);

/**
 * 正文里每个术语只链接第一次出现的位置，链到对应的百科条目。
 * 只处理文本节点，且不进入链接／代码／标题内部；页面自己不链自己。
 */
function rehypeGlossaryLinks() {
  return (tree, file) => {
    const selfSlug = file?.path ? path.basename(String(file.path), '.md') : null;
    const used = new Set();
    let budget = glossaryTerms.length;

    const linkify = (value) => {
      const out = [];
      let rest = value;

      while (budget > 0) {
        let best = null;
        for (const item of glossaryTerms) {
          if (used.has(item.term) || item.slug === selfSlug) continue;
          const index = rest.indexOf(item.term);
          if (index === -1) continue;
          if (!best || index < best.index || (index === best.index && item.term.length > best.item.term.length)) {
            best = { index, item };
          }
        }
        if (!best) break;

        used.add(best.item.term);
        budget -= 1;
        if (best.index > 0) out.push({ type: 'text', value: rest.slice(0, best.index) });
        out.push({
          type: 'element',
          tagName: 'a',
          properties: {
            href: `/wiki/${best.item.slug}/`,
            className: ['glossary-link'],
            title: `${best.item.term} · 百科条目`,
          },
          children: [{ type: 'text', value: best.item.term }],
        });
        rest = rest.slice(best.index + best.item.term.length);
      }

      if (rest) out.push({ type: 'text', value: rest });
      return out;
    };

    const walk = (node) => {
      if (!node.children || budget === 0) return;
      const next = [];
      for (const child of node.children) {
        if (child.type === 'text') {
          next.push(...linkify(child.value));
        } else {
          if (child.type === 'element' && !GLOSSARY_SKIP.has(child.tagName)) walk(child);
          next.push(child);
        }
      }
      node.children = next;
    };

    walk(tree);
  };
}

export default defineConfig({
  site: 'https://verlintas.github.io',
  base,
  build: {
    format: 'directory',
  },
  devToolbar: {
    enabled: false,
  },
  markdown: {
    processor: unified({
      rehypePlugins: [rehypeGlossaryLinks, rehypeBaseLinks],
    }),
  },
});
