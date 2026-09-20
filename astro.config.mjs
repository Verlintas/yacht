import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://verlintas.github.io',
  base: '/yacht',
  build: {
    format: 'directory',
  },
  devToolbar: {
    enabled: false,
  },
});
