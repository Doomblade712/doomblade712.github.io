// @ts-check
import { defineConfig } from 'astro/config';

// site: used for canonical URLs and sitemaps.
export default defineConfig({
  site: 'https://malikdanab.com',
  redirects: {
    // the old Adobe Portfolio home URL, kept so existing links don't break
    '/malik-danab': '/',
  },
});
