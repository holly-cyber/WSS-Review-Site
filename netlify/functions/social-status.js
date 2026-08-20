// Connection check for the Social studio. Reports which of the four Meta env
// vars are set, and — where a token is present — validates it against the Graph
// API and returns the connected Page name / IG username. Never returns the
// token values themselves.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};
const GRAPH = 'https://graph.facebook.com/v21.0';
const json = (obj, status = 200) => ({ statusCode: status, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const fbId = process.env.FB_PAGE_ID, fbTok = process.env.FB_PAGE_ACCESS_TOKEN;
  const igId = process.env.IG_USER_ID, igTok = process.env.IG_ACCESS_TOKEN;

  const out = {
    facebook: { hasPageId: !!fbId, hasToken: !!fbTok },
    instagram: { hasUserId: !!igId, hasToken: !!igTok },
  };

  if (fbId && fbTok) {
    try {
      const r = await fetch(`${GRAPH}/${fbId}?fields=name&access_token=${encodeURIComponent(fbTok)}`);
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.name) { out.facebook.ok = true; out.facebook.name = d.name; }
      else { out.facebook.ok = false; out.facebook.error = d.error?.message || `HTTP ${r.status}`; }
    } catch (e) { out.facebook.ok = false; out.facebook.error = e.message; }
  }

  if (igId && igTok) {
    try {
      const r = await fetch(`${GRAPH}/${igId}?fields=username&access_token=${encodeURIComponent(igTok)}`);
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.username) { out.instagram.ok = true; out.instagram.username = d.username; }
      else { out.instagram.ok = false; out.instagram.error = d.error?.message || `HTTP ${r.status}`; }
    } catch (e) { out.instagram.ok = false; out.instagram.error = e.message; }
  }

  return json(out);
};
