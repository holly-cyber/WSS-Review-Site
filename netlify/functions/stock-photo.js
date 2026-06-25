// Rights-free stock photo search for News hero images. The browser sends
// { query }; we search a free-image provider server-side and return candidate
// images with a credit string.
//
// Provider is chosen by which API key is set in the Netlify environment:
//   PEXELS_API_KEY     -> Pexels        (no attribution required)
//   PIXABAY_API_KEY    -> Pixabay       (no attribution required)
//   UNSPLASH_ACCESS_KEY-> Unsplash      (credit appreciated)
// With none set it falls back to Openverse (no key needed), filtered to CC0 /
// public-domain works so no attribution is legally required.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (obj, status = 200) => ({ statusCode: status, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

async function getJSON(url, headers) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, { headers: headers || {}, signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch (e) { clearTimeout(timer); throw e; }
}

async function pexels(q) {
  const d = await getJSON(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=16&orientation=landscape`, { Authorization: process.env.PEXELS_API_KEY });
  return (d.photos || []).map((p) => ({ url: p.src && (p.src.large2x || p.src.large || p.src.original), thumb: p.src && (p.src.medium || p.src.small), credit: `Photo: ${p.photographer} / Pexels`, source: p.url }));
}
async function pixabay(q) {
  const d = await getJSON(`https://pixabay.com/api/?key=${process.env.PIXABAY_API_KEY}&q=${encodeURIComponent(q)}&image_type=photo&orientation=horizontal&per_page=16&safesearch=true`);
  return (d.hits || []).map((h) => ({ url: h.largeImageURL || h.webformatURL, thumb: h.webformatURL || h.previewURL, credit: `Image: ${h.user} / Pixabay`, source: h.pageURL }));
}
async function unsplash(q) {
  const d = await getJSON(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=16&orientation=landscape`, { Authorization: 'Client-ID ' + process.env.UNSPLASH_ACCESS_KEY });
  return (d.results || []).map((r) => ({ url: r.urls && (r.urls.regular || r.urls.full), thumb: r.urls && (r.urls.small || r.urls.thumb), credit: `Photo: ${r.user && r.user.name} / Unsplash`, source: r.links && r.links.html }));
}
async function openverse(q) {
  // CC0 + Public Domain Mark only -> commercial use, no attribution required.
  const d = await getJSON(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&license=cc0,pdm&page_size=16&mature=false`, { 'User-Agent': 'wss-news/1.0' });
  return (d.results || []).map((r) => ({ url: r.url, thumb: r.thumbnail || r.url, credit: `Image via Openverse (${String(r.license || 'cc0').toUpperCase()})${r.creator ? ' — ' + r.creator : ''}`, source: r.foreign_landing_url }));
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method not allowed' };
  try {
    const { query } = JSON.parse(event.body || '{}');
    const q = String(query || '').trim();
    if (!q) return json({ images: [], error: 'no query' }, 400);

    let provider, images;
    if (process.env.PEXELS_API_KEY) { provider = 'Pexels'; images = await pexels(q); }
    else if (process.env.PIXABAY_API_KEY) { provider = 'Pixabay'; images = await pixabay(q); }
    else if (process.env.UNSPLASH_ACCESS_KEY) { provider = 'Unsplash'; images = await unsplash(q); }
    else { provider = 'Openverse'; images = await openverse(q); }

    images = (images || []).filter((i) => i && /^https?:\/\//i.test(i.url || '')).slice(0, 16);
    return json({ provider, images });
  } catch (e) {
    return json({ images: [], error: e.message }, 200);
  }
};
