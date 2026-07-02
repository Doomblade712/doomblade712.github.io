// @ts-check
import { defineConfig } from 'astro/config';

// site: used for canonical URLs and sitemaps.
// Once the custom domain is connected, change this to that domain.
export default defineConfig({
  site: 'https://doomblade712.github.io',
  redirects: {
    // the old Adobe Portfolio home URL, kept so existing links don't break
    '/malik-danab': '/',
  },
});
