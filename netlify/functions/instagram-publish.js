// Publish a review's hero image + caption to a connected Instagram Business
// account via the Instagram Graph API. The console sends { imageUrl, caption };
// we run the standard two-step container→publish flow. Gated on credentials —
// until IG_USER_ID and IG_ACCESS_TOKEN are set in the Netlify environment it
// returns a clear "not configured" message rather than failing obscurely.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const GRAPH = 'https://graph.facebook.com/v21.0';

const json = (obj, status = 200) => ({
  statusCode: status,
  headers: { ...CORS, 'Content-Type': 'application/json' },
  body: JSON.stringify(obj),
});

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method not allowed' };

  const igUser = process.env.IG_USER_ID;
  const token = process.env.IG_ACCESS_TOKEN;
  if (!igUser || !token) {
    const missing = [!igUser && 'IG_USER_ID', !token && 'IG_ACCESS_TOKEN'].filter(Boolean).join(' and ');
    return json({ ok: false, error: `Instagram is not configured — set ${missing} in the Netlify environment variables (a Facebook app with an Instagram Business account connected to a Facebook Page is required), then redeploy.` });
  }

  try {
    const { imageUrl, caption } = JSON.parse(event.body || '{}');
    if (!/^https?:\/\//i.test(imageUrl || '')) {
      return json({ ok: false, error: 'No public hero image URL to publish — add a hero image to the review first.' });
    }

    // 1) Create a media container for the image + caption.
    const createRes = await fetch(`${GRAPH}/${igUser}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl, caption: caption || '', access_token: token }),
    });
    const created = await createRes.json().catch(() => ({}));
    if (!createRes.ok || !created.id) {
      return json({ ok: false, error: created.error?.message || `Container creation failed (HTTP ${createRes.status}).` });
    }

    // 2) Publish the container.
    const pubRes = await fetch(`${GRAPH}/${igUser}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: created.id, access_token: token }),
    });
    const published = await pubRes.json().catch(() => ({}));
    if (!pubRes.ok || !published.id) {
      return json({ ok: false, error: published.error?.message || `Publish failed (HTTP ${pubRes.status}).` });
    }

    // 3) Best-effort fetch of the post permalink.
    let permalink = '';
    try {
      const pl = await fetch(`${GRAPH}/${published.id}?fields=permalink&access_token=${encodeURIComponent(token)}`);
      const pld = await pl.json().catch(() => ({}));
      permalink = pld.permalink || '';
    } catch {}

    return json({ ok: true, id: published.id, permalink });
  } catch (err) {
    return json({ ok: false, error: err.message }, 500);
  }
};
