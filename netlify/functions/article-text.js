// Server-side article text fetcher for the News generator's originality tooling.
// The browser sends { urls: [...] } (source article links); we fetch each one
// (no CORS limits), extract the main readable text, and return it so the client
// can (a) give the model the real article as reference and (b) check the draft
// for verbatim overlap against the full text rather than just the RSS summary.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const MAX = 9000; // cap text per article (chars)

function decodeEntities(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

function extractText(html) {
  let h = String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|head|nav|header|footer|aside|form)\b[\s\S]*?<\/\1>/gi, ' ');
  // Prefer the <article> (or <main>) region when present — drops chrome/boilerplate.
  const art = h.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i) || h.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (art) h = art[1];
  const text = decodeEntities(
    h.replace(/<(p|br|div|li|h[1-6]|tr)\b[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ')
  ).replace(/[ \t\f\v]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').replace(/^\s+|\s+$/g, '');
  return text.slice(0, MAX);
}

async function fetchOne(url) {
  if (!/^https?:\/\//i.test(url || '')) return { url, ok: false, error: 'not a url', text: '' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*' } });
    clearTimeout(timer);
    if (!res.ok) return { url, ok: false, error: 'HTTP ' + res.status, text: '' };
    const text = extractText(await res.text());
    return { url, ok: true, text };
  } catch (e) {
    clearTimeout(timer);
    return { url, ok: false, error: e.name === 'AbortError' ? 'timed out' : e.message, text: '' };
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method not allowed' };
  try {
    const body = JSON.parse(event.body || '{}');
    let urls = Array.isArray(body.urls) ? body.urls : (body.url ? [body.url] : []);
    urls = urls.filter((u) => /^https?:\/\//i.test(u)).slice(0, 8);
    if (!urls.length) return { statusCode: 400, headers: CORS, body: JSON.stringify({ message: 'No valid URLs provided.' }) };
    const results = await Promise.all(urls.map(fetchOne));
    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ results }) };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ message: 'article-text error: ' + e.message }) };
  }
};
