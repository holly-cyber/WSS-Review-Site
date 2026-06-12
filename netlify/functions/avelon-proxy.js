// Proxies Avelon affiliate API calls so the browser doesn't hit CORS.
// The browser sends { action, auth, payload }; we forward to the fixed
// Avelon endpoints only (no arbitrary URLs — avoids an open proxy).
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BASE = 'https://app.avelonetwork.com/api/affiliate';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: 'Method not allowed' };
  }

  try {
    const { action, auth: reqAuth, payload } = JSON.parse(event.body || '{}');
    // Prefer the shared admin credentials from the environment so invited
    // reviewers don't need their own Avelon login; fall back to any provided.
    const auth = (process.env.AVELON_EMAIL && process.env.AVELON_PASS)
      ? 'Basic ' + Buffer.from(`${process.env.AVELON_EMAIL}:${process.env.AVELON_PASS}`).toString('base64')
      : reqAuth;
    if (!auth) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Avelon is not configured — add AVELON_EMAIL and AVELON_PASS in the Netlify environment variables.' }) };
    }

    let url, method, body;
    if (action === 'retailers') {
      url = `${BASE}/retailers`;
      method = 'GET';
    } else if (action === 'create') {
      url = `${BASE}/link/create`;
      method = 'POST';
      body = JSON.stringify(payload || {});
    } else {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Unknown action' }) };
    }

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body,
    });

    const text = await res.text();
    return {
      statusCode: res.status,
      headers: { ...CORS, 'Content-Type': res.headers.get('content-type') || 'application/json' },
      body: text,
    };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
