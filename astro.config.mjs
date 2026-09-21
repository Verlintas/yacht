import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';

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
      rehypePlugins: [rehypeBaseLinks],
    }),
  },
});
