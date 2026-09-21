import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';

const base = '/yacht';

/** Markdown 里的站内绝对链接（以 / 开头）自动补上 base 前缀。 */
function rehypeBaseLinks() {
  const prefix = base.replace(/\/+$/, '');
  return (tree) => {
    const walk = (node) => {
      if (node.type === 'element' && node.tagName === 'a') {
        const href = node.properties?.href;
        if (typeof href === 'string' && href.startsWith('/') && !href.startsWith(`${prefix}/`)) {
          node.properties.href = `${prefix}${href}`;
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
