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
  if (u.startsWith('//')) return 'https:' + u;
  try { return new URL(u, base).href; } catch { return null; }
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
    const html = await res.text();

    const found = [];
    const seen = new Set();
    const add = (u) => {
      const a = abs(u, base);
      if (!a) return;
      if (!/\.(jpe?g|png|webp|avif)(\?|$)/i.test(a)) return;
      if (/sprite|favicon|\bicon\b|logo|placeholder|loading|spinner|\.svg/i.test(a)) return;
      if (seen.has(a)) return;
      seen.add(a);
      found.push(a);
    };

    // og:image / twitter:image — the most reliable hero, listed first.
    [...html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image)["'][^>]*>/gi)]
      .forEach((m) => { const c = m[0].match(/content=["']([^"']+)["']/i); if (c) add(c[1]); });

    // JSON-LD / product JSON: "image": "..." or "image": ["...","..."].
    [...html.matchAll(/"image"\s*:\s*("(?:[^"\\]|\\.)*"|\[[^\]]*\])/gi)].forEach((m) => {
      const v = m[1];
      if (v[0] === '"') add(v.slice(1, -1));
      else [...v.matchAll(/"((?:[^"\\]|\\.)*)"/g)].forEach((x) => add(x[1]));
    });

    // <img> src / data-src / srcset / data-srcset (product gallery).
    [...html.matchAll(/<img\b[^>]*>/gi)].forEach((tag) => {
      const t = tag[0];
      const s = t.match(/\bsrc=["']([^"']+)["']/i); if (s) add(s[1]);
      const ds = t.match(/\bdata-src=["']([^"']+)["']/i); if (ds) add(ds[1]);
      [...t.matchAll(/\b(?:data-)?srcset=["']([^"']+)["']/gi)].forEach((ss) => {
        ss[1].split(',').forEach((part) => add(part.trim().split(/\s+/)[0]));
      });
    });

    return json({ images: found.slice(0, 16), finalUrl: base });
  } catch (err) {
    return json({ images: [], error: err.message }, 500);
  }
};
