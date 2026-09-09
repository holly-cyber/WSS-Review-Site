// Machine-readable list of every live review, built at deploy. The daily social
// scheduler reads this to pick a review to post. Kept lean: just what the post
// needs.
export const prerender = true;
import { taxonomy } from '../data/taxonomy.js';

const CAT_SLUGS = new Set(taxonomy.map((t) => t.slug));
const SITE = 'https://reviews.womenssportsstore.com';

export function GET() {
  const mods = import.meta.glob('./*/*.md', { eager: true });
  const reviews = Object.entries(mods)
    .map(([path, mod]) => {
      const parts = path.split('/');
      const category = parts[parts.length - 2];
      const slug = parts[parts.length - 1].replace('.md', '');
      const fm = mod.frontmatter || {};
      let hero = fm.hero_image || '';
      if (hero && !/^https?:\/\//i.test(hero)) hero = SITE + (hero.charAt(0) === '/' ? hero : '/' + hero);
      return {
        title: fm.title || slug,
        brand: fm.brand || '',
        category,
        slug,
        url: `${SITE}/${category}/${slug}/`,
        hero,
        excerpt: (fm.excerpt || fm.meta_description || '').trim(),
        score: fm.overall_score || '',
        date: fm.date || '',
        draft: fm.draft === true,
      };
    })
    .filter((r) => CAT_SLUGS.has(r.category) && !r.draft && r.hero);

  return new Response(JSON.stringify({ count: reviews.length, reviews }), {
    headers: { 'content-type': 'application/json' },
  });
}
