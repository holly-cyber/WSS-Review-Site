// Proxies MailerLite campaign calls for the pipeline so the API key stays
// server-side (MAILERLITE_API_KEY) and never reaches the browser. The pipeline
// sends { action, payload }; we forward to fixed MailerLite endpoints only.
//   action: 'groups' -> list groups (for the recipient picker)
//   action: 'create' -> create a draft campaign with the given payload
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BASE = 'https://connect.mailerlite.com/api';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method not allowed' };
  if (!process.env.MAILERLITE_API_KEY) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ message: 'MailerLite is not configured — add MAILERLITE_API_KEY in the Netlify environment variables.' }) };
  }

  try {
    const { action, payload } = JSON.parse(event.body || '{}');
    let url, method, body;
    if (action === 'groups') {
      url = `${BASE}/groups?limit=100&sort=name`;
      method = 'GET';
    } else if (action === 'create') {
      url = `${BASE}/campaigns`;
      method = 'POST';
      // Build the exact shape MailerLite expects (subject/from_name/from/content
      // only inside each email — no reply_to/preheader, which the API rejects).
      const p = payload || {};
      const ml = {
        name: p.name,
        type: 'regular',
        emails: [{ subject: p.subject, from_name: p.from_name, from: p.from, content: p.content }],
      };
      if (p.group) ml.groups = [String(p.group)];
      body = JSON.stringify(ml);
    } else {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ message: 'Unknown action' }) };
    }

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${process.env.MAILERLITE_API_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body,
    });

    const text = await res.text();
    return { statusCode: res.status, headers: { ...CORS, 'Content-Type': res.headers.get('content-type') || 'application/json' }, body: text };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ message: err.message }) };
  }
};
