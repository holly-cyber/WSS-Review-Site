// Forwards approved pipeline content to a Google Apps Script web app (which
// appends a row to the spreadsheet). Same-origin from the pipeline, so no
// browser CORS issues. The target is taken from GSHEET_WEBHOOK_URL (preferred)
// or the request body, and is restricted to script.google.com to avoid SSRF.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const allowed = (u) => /^https:\/\/script\.google\.com\//.test(u || '');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method not allowed' };

  try {
    const { url, payload } = JSON.parse(event.body || '{}');
    const target = process.env.GSHEET_WEBHOOK_URL || url;
    if (!target) {
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ message: 'No Google Sheet endpoint configured — paste your Apps Script /exec URL in the approve step (or set GSHEET_WEBHOOK_URL).' }) };
    }
    if (!allowed(target)) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ message: 'The Google Sheet URL must be a https://script.google.com/macros/s/.../exec address.' }) };
    }

    const res = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
      redirect: 'follow',
    });
    const text = await res.text();
    const ct = res.headers.get('content-type') || '';
    // A restricted (Workspace-only) deployment rejects anonymous calls with a
    // 401/403, or silently redirects to a Google login HTML page. Either way the
    // append never happens — surface a clear, actionable message.
    const looksLikeLogin = /text\/html/i.test(ct) || /<html|accounts\.google\.com|ServiceLogin|Sign in/i.test(text.slice(0, 600));
    if (!res.ok || looksLikeLogin) {
      return {
        statusCode: 502,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Google rejected the request${res.status ? ` (HTTP ${res.status})` : ''}. The Apps Script web app must be deployed with "Who has access: Anyone" — a Google Workspace-restricted deployment (URL containing /a/macros/yourdomain.com/) blocks server calls. Re-deploy with Anyone access and update the /exec URL.`,
        }),
      };
    }
    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: text || JSON.stringify({ ok: true }),
    };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ message: err.message }) };
  }
};
