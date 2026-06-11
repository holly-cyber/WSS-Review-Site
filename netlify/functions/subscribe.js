// Adds an email address to MailerLite from the review-page capture form.
// The API key stays server-side (MAILERLITE_API_KEY in Netlify env); the
// browser only ever sees this function. Defaults to the "News, Reviews,
// Deals" group but accepts an optional groupId override.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// "WomensSportsStore - News, Reviews, Deals"
const DEFAULT_GROUP = '164702976966919967';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: 'Method not allowed' };
  }
  if (!process.env.MAILERLITE_API_KEY) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Email sign-up is not configured yet.' }) };
  }

  try {
    const { email, groupId, source } = JSON.parse(event.body || '{}');
    if (!email || !EMAIL_RE.test(String(email).trim())) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Please enter a valid email address.' }) };
    }

    const res = await fetch('https://connect.mailerlite.com/api/subscribers', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.MAILERLITE_API_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        email: String(email).trim().toLowerCase(),
        groups: [groupId || DEFAULT_GROUP],
        ...(source ? { fields: { source: String(source).slice(0, 191) } } : {}),
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.message || 'Sorry, something went wrong. Please try again.';
      return { statusCode: res.status, headers: CORS, body: JSON.stringify({ error: msg }) };
    }
    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
