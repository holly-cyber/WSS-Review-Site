// Publish a composed social graphic + caption to Facebook and/or Instagram.
// The console (Social studio) sends { targets:['facebook','instagram'],
// imageBase64, caption }. Each channel is gated on its own credentials, so an
// unconfigured channel returns a clear message instead of failing obscurely.
//
//   Facebook  — uploads the image BYTES directly to the Page's /photos edge
//               (no public URL needed). Needs FB_PAGE_ID + FB_PAGE_ACCESS_TOKEN.
//   Instagram — the Graph API needs a PUBLIC image_url, so we stash the bytes in
//               Netlify Blobs and hand IG a /api/social-image?id=… URL, then run
//               the standard container→publish flow. Needs IG_USER_ID +
//               IG_ACCESS_TOKEN (the same Page token works for both).
const { getStore } = require('@netlify/blobs');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const GRAPH = 'https://graph.facebook.com/v21.0';
const SITE = 'https://reviews.womenssportsstore.com';
const json = (obj, status = 200) => ({ statusCode: status, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

// Strip an optional data: URI prefix and return { buffer, contentType }.
function decodeImage(imageBase64) {
  let ct = 'image/png';
  let b64 = String(imageBase64 || '');
  const m = b64.match(/^data:([^;]+);base64,(.*)$/);
  if (m) { ct = m[1]; b64 = m[2]; }
  return { buffer: Buffer.from(b64, 'base64'), contentType: ct };
}

async function publishFacebook(buffer, contentType, caption) {
  const pageId = process.env.FB_PAGE_ID, token = process.env.FB_PAGE_ACCESS_TOKEN;
  if (!pageId || !token) {
    const missing = [!pageId && 'FB_PAGE_ID', !token && 'FB_PAGE_ACCESS_TOKEN'].filter(Boolean).join(' and ');
    return { ok: false, error: `Facebook is not configured — set ${missing} in Netlify, then redeploy.` };
  }
  try {
    const fd = new FormData();
    fd.append('source', new Blob([buffer], { type: contentType }), 'social.png');
    if (caption) fd.append('caption', caption);
    fd.append('access_token', token);
    const res = await fetch(`${GRAPH}/${pageId}/photos`, { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !(data.id || data.post_id)) return { ok: false, error: data.error?.message || `Facebook post failed (HTTP ${res.status}).` };
    const postId = data.post_id || data.id;
    return { ok: true, id: postId, permalink: `https://facebook.com/${postId}` };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function publishInstagram(buffer, contentType, caption) {
  const igUser = process.env.IG_USER_ID, token = process.env.IG_ACCESS_TOKEN;
  if (!igUser || !token) {
    const missing = [!igUser && 'IG_USER_ID', !token && 'IG_ACCESS_TOKEN'].filter(Boolean).join(' and ');
    return { ok: false, error: `Instagram is not configured — set ${missing} in Netlify, then redeploy.` };
  }
  let store, id;
  try {
    // 1) Stash the image in Netlify Blobs and expose it via /api/social-image.
    store = getStore('social-images');
    id = 'ig-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    await store.set(id, buffer, { metadata: { ct: contentType } });
    const imageUrl = `${SITE}/api/social-image?id=${encodeURIComponent(id)}`;

    // 2) Create the media container.
    const createRes = await fetch(`${GRAPH}/${igUser}/media`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl, caption: caption || '', access_token: token }),
    });
    const created = await createRes.json().catch(() => ({}));
    if (!createRes.ok || !created.id) return { ok: false, error: created.error?.message || `IG container creation failed (HTTP ${createRes.status}).` };

    // 3) Publish the container.
    const pubRes = await fetch(`${GRAPH}/${igUser}/media_publish`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: created.id, access_token: token }),
    });
    const published = await pubRes.json().catch(() => ({}));
    if (!pubRes.ok || !published.id) return { ok: false, error: published.error?.message || `IG publish failed (HTTP ${pubRes.status}).` };

    // 4) Best-effort permalink.
    let permalink = '';
    try { const pl = await fetch(`${GRAPH}/${published.id}?fields=permalink&access_token=${encodeURIComponent(token)}`); permalink = (await pl.json()).permalink || ''; } catch {}
    return { ok: true, id: published.id, permalink };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    // The image was fetched during container creation, so it's safe to clean up.
    if (store && id) { try { await store.delete(id); } catch {} }
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method not allowed' };
  try {
    const { targets, imageBase64, caption, captions } = JSON.parse(event.body || '{}');
    const want = Array.isArray(targets) ? targets : [];
    if (!want.length) return json({ ok: false, error: 'Pick at least one channel (Instagram or Facebook).' });
    if (!imageBase64) return json({ ok: false, error: 'No image to publish — compose the graphic first.' });
    const { buffer, contentType } = decodeImage(imageBase64);
    if (!buffer.length) return json({ ok: false, error: 'Could not read the image data.' });

    // Per-channel captions when provided (Instagram can't use clickable links,
    // so the console sends a link-stripped Instagram variant); else a single one.
    const capFor = (t) => (captions && typeof captions === 'object' && captions[t] != null) ? captions[t] : (caption || '');
    const results = {};
    if (want.includes('facebook')) results.facebook = await publishFacebook(buffer, contentType, capFor('facebook'));
    if (want.includes('instagram')) results.instagram = await publishInstagram(buffer, contentType, capFor('instagram'));
    const anyOk = Object.values(results).some((r) => r && r.ok);
    return json({ ok: anyOk, results });
  } catch (err) {
    return json({ ok: false, error: err.message }, 500);
  }
};
