// Lightweight URL reachability check for the pipeline. The browser sends
// { url }; we fetch it server-side (no CORS limits) and report whether it
// resolves to a real page. Used to verify AI-suggested competitor product URLs
// before they're linked in a review.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const UA = 'Mozilla/5.0 (compatible; WSS-LinkCheck/1.0; +https://womenssportsstore.com)';
// Many shops block bots but still prove the URL exists (the server answered).
// Treat these as "reachable"; only 404/410 (and DNS/connection failure) mean dead.
const SOFT_OK = [401, 403, 405, 406, 429, 999];

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method not allowed' };

  try {
    const { url } = JSON.parse(event.body || '{}');
    if (!/^https?:\/\//i.test(url || '')) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: false, status: 0, reason: 'not a url' }) };
    }

    const fetchWith = (method) => fetch(url, {
      method,
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
    });

    let res = null;
    try { res = await fetchWith('HEAD'); } catch (e) { res = null; }
    // Retry with GET when HEAD is unsupported or failed outright.
    if (!res || res.status === 405 || res.status === 501) {
      try { res = await fetchWith('GET'); } catch (e) { res = null; }
    }
    if (!res) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: false, status: 0, reason: 'unreachable' }) };
    }

    const status = res.status;
    const ok = (status >= 200 && status < 400) || SOFT_OK.includes(status);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok, status, finalUrl: res.url || url }) };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
