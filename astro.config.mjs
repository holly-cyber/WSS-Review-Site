import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  // Served as a dedicated subdomain (reviews.womenssportsstore.com), so the
  // site sits at the root — no base path. Reviews resolve to /<category>/<slug>/.
  site: 'https://reviews.womenssportsstore.com',
  integrations: [
    // Keep the auth-gated admin tools out of the public sitemap.
    sitemap({ filter: (page) => !/\/(console|pipeline)\/?$/.test(page) }),
  ],
});
