// Pulls headline analytics from the Umami Cloud API for the console dashboard.
// Needs UMAMI_API_KEY (create one in Umami Cloud → Settings → API keys) and the
// website id (PUBLIC_UMAMI_WEBSITE_ID, already set). Returns period totals, a
// DAU (24h) + MAU (30d) pair, and top page views — the console buckets the
// pages into Home / Blog / News / Reviews and builds the top-10.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};
const BASE = 'https://api.umami.is/v1';
const json = (obj, status = 200) => ({ statusCode: status, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const key = process.env.UMAMI_API_KEY;
  const site = process.env.PUBLIC_UMAMI_WEBSITE_ID || process.env.UMAMI_WEBSITE_ID;
  if (!key || !site) {
    const missing = [!key && 'UMAMI_API_KEY', !site && 'PUBLIC_UMAMI_WEBSITE_ID'].filter(Boolean).join(' and ');
    return json({ ok: false, error: `Umami API not configured — set ${missing} in Netlify (create an API key in Umami Cloud → Settings → API keys), then redeploy.` });
  }

  const days = Math.min(365, Math.max(1, parseInt((event.queryStringParameters && event.queryStringParameters.days) || '30', 10) || 30));
  const now = Date.now();
  const DAY = 86400000;
  const headers = { 'x-umami-api-key': key, Accept: 'application/json' };

  async function api(path) {
    const res = await fetch(`${BASE}${path}`, { headers });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    if (!res.ok) throw new Error((data && data.message) || `HTTP ${res.status}`);
    return data;
  }
  const statsUrl = (start, end) => `/websites/${site}/stats?startAt=${start}&endAt=${end}`;
  const num = (v) => (v && typeof v === 'object' ? (v.value || 0) : (v || 0));

  try {
    const [range, d1, d30, metrics] = await Promise.all([
      api(statsUrl(now - days * DAY, now)),
      api(statsUrl(now - DAY, now)),
      api(statsUrl(now - 30 * DAY, now)),
      api(`/websites/${site}/metrics?startAt=${now - days * DAY}&endAt=${now}&type=url&limit=200`),
    ]);
    const urls = Array.isArray(metrics) ? metrics.map((m) => ({ path: m.x, views: m.y })).filter((u) => u.path) : [];
    return json({
      ok: true,
      days,
      pageviews: num(range.pageviews),
      visitors: num(range.visitors),
      visits: num(range.visits),
      dau: num(d1.visitors),
      mau: num(d30.visitors),
      urls,
    });
  } catch (e) {
    return json({ ok: false, error: 'Umami API error: ' + e.message });
  }
};
