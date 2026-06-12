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
    return {
      statusCode: res.ok ? 200 : res.status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: text || JSON.stringify({ ok: res.ok }),
    };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ message: err.message }) };
  }
};
