// Fetches and parses RSS / Atom feeds server-side for the News generator in the
// console. Browsers can't fetch third-party feeds directly (CORS), so this thin
// proxy does it and returns clean JSON. Dependency-free: a forgiving regex
// parser that handles both RSS <item> and Atom <entry> shapes.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function decodeEntities(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#8217;/g, '’').replace(/&#8216;/g, '‘')
    .replace(/&#8220;/g, '“').replace(/&#8221;/g, '”')
    .replace(/&#8211;/g, '–').replace(/&#8212;/g, '—')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&amp;/g, '&');
}
const stripTags = (s) => decodeEntities(
  String(s || '').replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').replace(/<[^>]+>/g, ' '),
).replace(/\s+/g, ' ').trim();
// First captured group of <tag ...>...</tag> within a block.
function tag(block, name) {
  const m = block.match(new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + name + '>', 'i'));
  return m ? m[1].trim() : '';
}
// Atom links: prefer rel="alternate" (or no rel), fall back to the first href.
function atomLink(block) {
  const links = [...block.matchAll(/<link\b([^>]*)\/?>/gi)].map((m) => m[1]);
  const href = (attrs) => (attrs.match(/href\s*=\s*"([^"]+)"/i) || [])[1] || '';
  const alt = links.find((a) => /rel\s*=\s*"alternate"/i.test(a)) || links.find((a) => !/rel\s*=/i.test(a)) || links[0] || '';
  return href(alt);
}

function parseFeed(xml) {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  return blocks.map((b) => {
    const title = stripTags(tag(b, 'title'));
    let link = tag(b, 'link').trim();        // RSS: <link>url</link>
    if (!link) link = atomLink(b);           // Atom: <link href="url"/>
    const date = tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date');
    const raw = tag(b, 'description') || tag(b, 'summary') || tag(b, 'content') || tag(b, 'content:encoded');
    const summary = stripTags(raw).slice(0, 400);
    const ts = date ? Date.parse(date) : NaN;
    return { title, link, date: date.trim(), ts: isNaN(ts) ? 0 : ts, summary };
  }).filter((it) => it.title || it.link);
}

async function fetchOne(source) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(source.url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'wss-news-bot/1.0 (+https://womenssportsstore.com)', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
    });
    clearTimeout(timer);
    if (!r.ok) return { ...source, ok: false, error: 'HTTP ' + r.status, items: [] };
    const xml = await r.text();
    const items = parseFeed(xml).sort((a, b) => b.ts - a.ts).slice(0, 15);
    return { ...source, ok: true, items };
  } catch (e) {
    clearTimeout(timer);
    return { ...source, ok: false, error: e.name === 'AbortError' ? 'Timed out after 12s' : e.message, items: [] };
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method not allowed' };
  try {
    const body = JSON.parse(event.body || '{}');
    let sources = Array.isArray(body.sources) ? body.sources : (body.url ? [{ name: body.name || body.url, url: body.url }] : []);
    sources = sources.filter((s) => s && /^https?:\/\//i.test(s.url)).slice(0, 20);
    if (!sources.length) return { statusCode: 400, headers: CORS, body: JSON.stringify({ message: 'No valid feed URLs provided.' }) };
    const results = await Promise.all(sources.map(fetchOne));
    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ results }) };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ message: 'RSS proxy error: ' + e.message }) };
  }
};
