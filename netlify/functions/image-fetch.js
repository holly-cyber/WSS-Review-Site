// Fetches an image server-side and returns it base64-encoded, so the News
// console can self-host a chosen hero image into the repo (image CDNs usually
// don't send CORS headers, so the browser can't read the bytes directly).
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB cap
const json = (obj, status = 200) => ({ statusCode: status, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

const EXT = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif' };

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method not allowed' };
  try {
    const { url } = JSON.parse(event.body || '{}');
    if (!/^https?:\/\//i.test(url || '')) return json({ ok: false, error: 'not a url' }, 400);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    let res;
    try {
      res = await fetch(url, { redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': UA, Accept: 'image/avif,image/webp,image/*,*/*' } });
    } catch (e) {
      clearTimeout(timer);
      return json({ ok: false, error: e.name === 'AbortError' ? 'timed out' : e.message });
    }
    clearTimeout(timer);
    if (!res.ok) return json({ ok: false, error: 'HTTP ' + res.status });

    const ct = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (ct && !ct.startsWith('image/')) return json({ ok: false, error: 'not an image (' + ct + ')' });

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) return json({ ok: false, error: 'image too large (' + Math.round(buf.length / 1e6) + ' MB)' });

    // Extension from content-type, else from the URL path, else jpg.
    let ext = EXT[ct];
    if (!ext) { const m = String(url).split('?')[0].match(/\.(jpe?g|png|webp|avif|gif)$/i); ext = m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg'; }

    return json({ ok: true, base64: buf.toString('base64'), contentType: ct || 'image/jpeg', ext, bytes: buf.length });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
};
