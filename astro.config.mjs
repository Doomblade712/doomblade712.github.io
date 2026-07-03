// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// site: used for canonical URLs and sitemaps.
export default defineConfig({
  site: 'https://malikdanab.com',
  integrations: [sitemap()],
  redirects: {
    // the old Adobe Portfolio home URL, kept so existing links don't break
    '/malik-danab': '/',
  },
});
