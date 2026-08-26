// Instant, persistent image host for email (and other) uploads. The console
// POSTs a (client-resized) base64 image; we store it in Netlify Blobs and hand
// back a public /api/email-image?id=… URL that works immediately — no repo
// commit, no deploy wait. GET serves the stored image. Unlike the social image
// host these blobs are NOT deleted, because an email may be scheduled to send
// days later.
const { getStore } = require('@netlify/blobs');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const SITE = 'https://reviews.womenssportsstore.com';
const MAX_BYTES = 5 * 1024 * 1024; // stored image cap (post client-resize this is generous)
const json = (obj, status = 200) => ({ statusCode: status, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

// Netlify Blobs auto-config isn't injected in this runtime; configure manually
// with the token when present (same as social-publish / social-image).
function emailStore() {
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  const siteID = process.env.BLOBS_SITE_ID || process.env.SITE_ID || '66c21efb-4d43-4271-b164-37081de5da02';
  return token ? getStore({ name: 'email-images', siteID, token }) : getStore('email-images');
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  // Serve a stored image.
  if (event.httpMethod === 'GET') {
    const id = (event.queryStringParameters && event.queryStringParameters.id) || '';
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(id)) return { statusCode: 400, body: 'bad id' };
    try {
      const store = emailStore();
      const res = await store.getWithMetadata(id, { type: 'arrayBuffer' });
      if (!res || !res.data) return { statusCode: 404, body: 'not found' };
      const ct = (res.metadata && res.metadata.ct) || 'image/jpeg';
      return {
        statusCode: 200,
        headers: { 'Content-Type': ct, 'Cache-Control': 'public, max-age=31536000, immutable' },
        body: Buffer.from(res.data).toString('base64'),
        isBase64Encoded: true,
      };
    } catch (e) { return { statusCode: 500, body: 'error: ' + e.message }; }
  }

  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method not allowed' };

  try {
    const body = JSON.parse(event.body || '{}');
    let b64 = String(body.base64 || '');
    let ct = 'image/jpeg';
    const m = b64.match(/^data:([^;]+);base64,(.*)$/);
    if (m) { ct = m[1]; b64 = m[2]; }
    else if (body.ext) { const e = String(body.ext).toLowerCase(); ct = e === 'png' ? 'image/png' : e === 'webp' ? 'image/webp' : 'image/jpeg'; }
    if (!b64) return json({ ok: false, error: 'No image data.' });
    const buffer = Buffer.from(b64, 'base64');
    if (!buffer.length) return json({ ok: false, error: 'Could not decode the image.' });
    if (buffer.length > MAX_BYTES) return json({ ok: false, error: 'Image too large after processing — please use a smaller file.' });
    if (!/^image\//i.test(ct)) return json({ ok: false, error: 'Not an image.' });

    const store = emailStore();
    const ext = ct === 'image/png' ? 'png' : ct === 'image/webp' ? 'webp' : 'jpg';
    // No Math.random in this file's constraints? This is a normal function (not a
    // workflow), so Date.now()/Math.random are fine here.
    const id = 'em-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
    await store.set(id, buffer, { metadata: { ct } });
    return json({ ok: true, id, url: `${SITE}/api/email-image?id=${encodeURIComponent(id)}` });
  } catch (err) {
    let msg = err.message || String(err);
    if (/not been configured to use Netlify Blobs/i.test(msg)) msg = 'Image hosting isn’t set up — add a NETLIFY_BLOBS_TOKEN env var in Netlify and redeploy.';
    return json({ ok: false, error: msg }, 500);
  }
};
