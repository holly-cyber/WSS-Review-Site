import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://womenssportsstore.com',
  base: '/reviews',
  integrations: [
    // Keep the auth-gated admin tools out of the public sitemap.
    sitemap({ filter: (page) => !/\/(console|pipeline)\/?$/.test(page) }),
  ],
});
