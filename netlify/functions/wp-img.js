// Same-origin image proxy for legacy WordPress media on womenssportsstore.com.
// Loading those images cross-origin from reviews.womenssportsstore.com fails
// (WordPress hotlink/referrer protection). A plain Netlify proxy can't set a
// Referer; this function fetches server-side WITH a browser User-Agent and a
// womenssportsstore.com Referer (which passes hotlink protection) and streams
// the image back same-origin, cached hard at the CDN.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

exports.handler = async (event) => {
  const path = (event.queryStringParameters && event.queryStringParameters.path) || '';
  if (!path) return { statusCode: 400, body: 'missing path' };
  // Only proxy the WordPress uploads directory — never an open proxy.
  const url = 'https://womenssportsstore.com/wp-content/uploads/' + path.replace(/^\/+/, '');
  try { const h = new URL(url).hostname; if (h !== 'womenssportsstore.com') return { statusCode: 403, body: 'forbidden' }; }
  catch { return { statusCode: 400, body: 'bad path' }; }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  let res;
  try {
    res = await fetch(url, {
      redirect: 'follow', signal: ctrl.signal,
      headers: {
        'User-Agent': UA,
        Referer: 'https://womenssportsstore.com/',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*',
      },
    });
  } catch (e) {
    clearTimeout(timer);
    return { statusCode: 502, body: 'upstream fetch failed: ' + (e.name === 'AbortError' ? 'timeout' : e.message) };
  }
  clearTimeout(timer);
  if (!res.ok) return { statusCode: res.status, body: 'upstream ' + res.status };

  const ct = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
  if (!/^image\//i.test(ct)) return { statusCode: 415, body: 'not an image (' + ct + ')' };
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    statusCode: 200,
    headers: { 'Content-Type': ct, 'Cache-Control': 'public, max-age=31536000, immutable' },
    body: buf.toString('base64'),
    isBase64Encoded: true,
  };
};
