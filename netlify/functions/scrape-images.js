// Server-side image scraper for the pipeline's image stage. The browser sends
// { url } (a product page or affiliate link); we fetch it server-side — no CORS
// limits — following redirects to the real product page, and return candidate
// product image URLs (og:image + JSON-LD + <img> src/srcset). This lets the
// Manage editor and the main pipeline pull product images even when the retailer
// blocks a direct browser (cross-origin) fetch.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// A realistic desktop browser UA gets past more bot filters than a custom one.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function abs(u, base) {
  if (!u) return null;
  u = String(u).trim().replace(/&amp;/g, '&');
  if (u.startsWith('//')) u = 'https:' + u;
  // Upgrade to https so images don't get blocked as mixed content on the site.
  try { return new URL(u, base).href.replace(/^http:\/\//i, 'https://'); } catch { return null; }
}

const json = (obj, status = 200) => ({
  statusCode: status,
  headers: { ...CORS, 'Content-Type': 'application/json' },
  body: JSON.stringify(obj),
});

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method not allowed' };

  try {
    const { url } = JSON.parse(event.body || '{}');
    if (!/^https?:\/\//i.test(url || '')) return json({ images: [], error: 'not a url' });

    let res;
    try {
      res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*' },
      });
    } catch (e) {
      return json({ images: [], error: 'unreachable' });
    }
    const base = res.url || url;
    // JSON blobs (Shopify product media, etc.) escape slashes as https:\/\/cdn…
    // — unescape so the embedded gallery URLs become matchable.
    const html = (await res.text()).replace(/\\\//g, '/');

    // Junk we never want offered as a product image.
    const JUNK = /sprite|favicon|\bicons?\b|logo|placeholder|loading|spinner|\.svg|\/assets\/|\/cdn\/shop\/t\/|payment|visa|mastercard|maestro|\bamex\b|paypal|klarna|clearpay|apple-?pay|google-?pay|shopify-?pay|gpay|badge|trust|judge\.me|yotpo|stamped|okendo|review|\bstars?\b|rating|social|facebook|instagram|tiktok|twitter|youtube|pinterest|linkedin|avatar|cookie|gift-?card|pixel|tracking|1x1|spacer|blank|chart|graph|infographic|diagram|comparison|\bbanner\b|hero-banner|slideshow/i;

    // Shopify serves the full-size original when the _WxH (or named) size suffix
    // is removed; collapse variants of the same shot to one full-size URL.
    const fullSize = (u) => {
      // Shopify, whether on cdn.shopify.com or a custom domain's /cdn/shop/ path.
      if (!/cdn\.shopify\.com|\/cdn\/shop\//i.test(u)) return u;
      const q = u.indexOf('?');
      const path = q >= 0 ? u.slice(0, q) : u;
      const query = q >= 0 ? u.slice(q) : '';
      return path.replace(/_(\d+x\d*|\d*x\d+|pico|icon|thumb|small|compact|medium|large|grande|original|master)(?=\.[a-z]+$)/i, '') + query;
    };

    const cand = [];          // { url, pri } — lower pri sorts first
    const seen = new Set();
    const push = (u, pri) => {
      let a = abs(u, base);
      if (!a) return;
      if (!/\.(jpe?g|png|webp|avif)(\?|$)/i.test(a)) return;
      if (JUNK.test(a)) return;
      a = fullSize(a);
      const k = a.split('?')[0].toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      cand.push({ url: a, pri });
    };

    // 1) og:image / twitter:image — reliable hero when it isn't just the logo.
    [...html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image)["'][^>]*>/gi)]
      .forEach((m) => { const c = m[0].match(/content=["']([^"']+)["']/i); if (c) push(c[1], 0); });

    // 2) The genuine product gallery, from JSON-LD / Shopify product media
    //    ("image":[…], "src":"…", "featured_image":"…"). These are the actual
    //    product photos, so they rank above the page-wide sweep below — which
    //    keeps marketing graphics (charts, lifestyle banners) out of the top picks.
    [...html.matchAll(/"(?:image|src|featured_image|preview_image)"\s*:\s*("(?:[^"\\]|\\.)*"|\[[^\]]*\])/gi)]
      .forEach((m) => {
        const v = m[1];
        if (v[0] === '"') push(v.slice(1, -1), 1);
        else [...v.matchAll(/"((?:[^"\\]|\\.)*)"/g)].forEach((x) => push(x[1], 1));
      });

    // 3) Every other image URL anywhere in the page (catches galleries not in a
    //    recognised JSON shape). Product-path assets outrank generic ones.
    [...html.matchAll(/https?:\/\/[^"'()\s\\<>]+?\.(?:jpe?g|png|webp|avif)(?:\?[^"'()\s\\<>]*)?/gi)]
      .forEach((m) => {
        const u = m[0];
        const isProduct = /cdn\.shopify\.com\/s\/files|\/products\/|\/files\//i.test(u);
        push(u, isProduct ? 2 : 4);
      });

    // 4) <img> src/data-src/srcset — fallback for non-Shopify shops.
    [...html.matchAll(/<img\b[^>]*>/gi)].forEach((tag) => {
      const t = tag[0];
      const s = t.match(/\b(?:data-)?src=["']([^"']+)["']/i); if (s) push(s[1], 3);
      [...t.matchAll(/\b(?:data-)?srcset=["']([^"']+)["']/gi)].forEach((ss) => {
        ss[1].split(',').forEach((part) => push(part.trim().split(/\s+/)[0], 3));
      });
    });

    cand.sort((a, b) => a.pri - b.pri);
    return json({ images: cand.slice(0, 16).map((c) => c.url), finalUrl: base });
  } catch (err) {
    return json({ images: [], error: err.message }, 500);
  }
};
