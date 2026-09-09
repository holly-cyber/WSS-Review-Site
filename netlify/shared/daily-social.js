// Core of the automated daily social post. Picks a live review (rotating through
// the whole set so none repeats until all have posted), renders a branded
// graphic (hero + gradient + headline + verdict), and publishes it to Instagram
// and Facebook. Used by the scheduled function (daily-social) and the manual
// test endpoint (daily-social-run).
const { getStore } = require('@netlify/blobs');

const SITE = 'https://reviews.womenssportsstore.com';
const GRAPH = 'https://graph.facebook.com/v21.0';

function store(name) {
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  const siteID = process.env.BLOBS_SITE_ID || process.env.SITE_ID || '66c21efb-4d43-4271-b164-37081de5da02';
  return token ? getStore({ name, siteID, token }) : getStore(name);
}

// ---- graphic ----
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function wrap(ctx, text, maxW) {
  const words = String(text || '').split(/\s+/).filter(Boolean); const lines = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line); return lines;
}
let fontsTried = false, fontsOk = false;
async function ensureFonts() {
  if (fontsTried) return fontsOk;
  fontsTried = true;
  try {
    const { GlobalFonts } = require('@napi-rs/canvas');
    const files = [
      'https://cdn.jsdelivr.net/npm/@expo-google-fonts/poppins@0.2.3/Poppins_700Bold.ttf',
      'https://cdn.jsdelivr.net/npm/@expo-google-fonts/poppins@0.2.3/Poppins_400Regular.ttf',
    ];
    for (const u of files) {
      const r = await fetch(u);
      if (r.ok) { GlobalFonts.register(Buffer.from(await r.arrayBuffer())); fontsOk = true; }
    }
  } catch (_) { /* fall back to the built-in sans-serif */ }
  return fontsOk;
}
async function compose(review) {
  const { createCanvas, loadImage } = require('@napi-rs/canvas');
  const ok = await ensureFonts();
  const FONT = ok ? 'Poppins' : 'sans-serif';
  const W = 1080, H = 1350; const canvas = createCanvas(W, H); const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0b1f3a'; ctx.fillRect(0, 0, W, H);
  try { const r = await fetch(review.hero); if (r.ok) { const img = await loadImage(Buffer.from(await r.arrayBuffer())); const s = Math.max(W / img.width, H / img.height); const dw = img.width * s, dh = img.height * s; ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh); } } catch (_) {}
  const g = ctx.createLinearGradient(0, H * 0.30, 0, H); g.addColorStop(0, 'rgba(0,0,54,0)'); g.addColorStop(0.55, 'rgba(0,0,54,0.45)'); g.addColorStop(1, 'rgba(0,0,54,0.94)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const pad = Math.round(W * 0.075);
  const eb = 'WSS™ REVIEW'; ctx.font = `700 ${Math.round(W * 0.026)}px ${FONT}`; const tw = ctx.measureText(eb).width; const ph = Math.round(W * 0.058), pw = tw + Math.round(W * 0.05);
  ctx.fillStyle = '#FF5E84'; roundRect(ctx, pad, pad, pw, ph, ph / 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(eb, pad + Math.round(W * 0.025), pad + ph / 2 + 1); ctx.textBaseline = 'alphabetic';
  const headline = String(review.title || '').split('|')[0].trim();
  const desc = String(review.excerpt || '').slice(0, 130);
  const maxW = W - pad * 2, hlSize = Math.round(W * 0.072), hlLH = Math.round(hlSize * 1.12), dSize = Math.round(W * 0.036), dLH = Math.round(dSize * 1.35), gap = Math.round(W * 0.022);
  ctx.font = `700 ${hlSize}px ${FONT}`; const hlLines = wrap(ctx, headline, maxW).slice(0, 4);
  ctx.font = `400 ${dSize}px ${FONT}`; const dLines = desc ? wrap(ctx, desc, maxW).slice(0, 3) : [];
  const blockH = hlLines.length * hlLH + (dLines.length ? gap + dLines.length * dLH : 0);
  let ty = H - pad - blockH; ctx.textBaseline = 'top';
  ctx.fillStyle = '#fff'; ctx.font = `700 ${hlSize}px ${FONT}`;
  for (const ln of hlLines) { ctx.fillText(ln, pad, ty); ty += hlLH; }
  if (dLines.length) { ty += gap; ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.font = `400 ${dSize}px ${FONT}`; for (const ln of dLines) { ctx.fillText(ln, pad, ty); ty += dLH; } }
  return canvas.toBuffer('image/jpeg', 90);
}

// ---- captions ----
function hashtagsFor(review) {
  const cat = { run: 'Running', swim: 'Swimming', cycle: 'Cycling', tri: 'Triathlon', nutrition: 'SportsNutrition', 'sports-bras': 'SportsBra' }[review.category] || 'WomensSport';
  const brand = (review.brand || '').replace(/[^A-Za-z0-9]/g, '');
  return ['#WomensSportsStore', '#WomensSport', '#' + cat, brand ? '#' + brand : '', '#TestedByWomen'].filter(Boolean).slice(0, 5).join(' ');
}
function captions(review) {
  const title = String(review.title || '').split('|')[0].trim();
  const verdict = review.excerpt ? review.excerpt + '\n\n' : '';
  const tags = hashtagsFor(review);
  const ig = `${title}\n\n${verdict}Independent, tested-by-women review.\n\n🔗 Full review — link in bio\n\n${tags}`;
  const fb = `${title}\n\n${verdict}Read our full independent review: ${review.url}\n\n${tags}`;
  return { instagram: ig, facebook: fb };
}

// ---- publish ----
async function publishFacebook(buffer, caption) {
  const pageId = process.env.FB_PAGE_ID, token = process.env.FB_PAGE_ACCESS_TOKEN;
  if (!pageId || !token) return { ok: false, error: 'Facebook not configured' };
  try {
    const fd = new FormData();
    fd.append('source', new Blob([buffer], { type: 'image/jpeg' }), 'daily.jpg');
    if (caption) fd.append('caption', caption);
    fd.append('access_token', token);
    const res = await fetch(`${GRAPH}/${pageId}/photos`, { method: 'POST', body: fd });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !(d.id || d.post_id)) return { ok: false, error: d.error?.message || `HTTP ${res.status}` };
    const id = d.post_id || d.id;
    return { ok: true, id, permalink: `https://facebook.com/${id}` };
  } catch (e) { return { ok: false, error: e.message }; }
}
async function publishInstagram(buffer, caption) {
  const igUser = process.env.IG_USER_ID, token = process.env.IG_ACCESS_TOKEN;
  if (!igUser || !token) return { ok: false, error: 'Instagram not configured' };
  const imgStore = store('email-images');
  const id = 'daily-' + Date.now() + '.jpg';
  try {
    await imgStore.set(id, buffer, { metadata: { ct: 'image/jpeg' } });
    const imageUrl = `${SITE}/api/email-image?id=${encodeURIComponent(id)}`;
    const create = await fetch(`${GRAPH}/${igUser}/media`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_url: imageUrl, caption: caption || '', access_token: token }) });
    const cd = await create.json().catch(() => ({}));
    if (!create.ok || !cd.id) return { ok: false, error: cd.error?.message || `container HTTP ${create.status}` };
    for (let i = 0; i < 8; i++) {
      const st = await (await fetch(`${GRAPH}/${cd.id}?fields=status_code&access_token=${encodeURIComponent(token)}`)).json().catch(() => ({}));
      if (st.status_code === 'FINISHED') break;
      if (st.status_code === 'ERROR' || st.status_code === 'EXPIRED') return { ok: false, error: 'IG could not process the image' };
      if (i === 7) return { ok: false, error: 'IG processing timed out' };
      await new Promise((r) => setTimeout(r, 1500));
    }
    const pub = await fetch(`${GRAPH}/${igUser}/media_publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ creation_id: cd.id, access_token: token }) });
    const pd = await pub.json().catch(() => ({}));
    if (!pub.ok || !pd.id) return { ok: false, error: pd.error?.message || `publish HTTP ${pub.status}` };
    let permalink = ''; try { permalink = (await (await fetch(`${GRAPH}/${pd.id}?fields=permalink&access_token=${encodeURIComponent(token)}`)).json()).permalink || ''; } catch (_) {}
    return { ok: true, id: pd.id, permalink };
  } catch (e) { return { ok: false, error: e.message }; }
  finally { try { await imgStore.delete(id); } catch (_) {} }
}

// ---- orchestrator ----
async function runDailySocial(source, opts = {}) {
  const enabled = process.env.DAILY_SOCIAL_ENABLED === 'true';
  if (!enabled && !opts.force) return { ok: false, skipped: 'disabled', hint: 'Set DAILY_SOCIAL_ENABLED=true in Netlify to turn on the daily post.' };

  let reviews;
  try {
    const r = await fetch(`${SITE}/reviews.json`);
    reviews = (await r.json()).reviews || [];
  } catch (e) { return { ok: false, error: 'Could not load reviews.json: ' + e.message }; }
  reviews = reviews.filter((r) => r.hero && r.url);
  if (!reviews.length) return { ok: false, error: 'No live reviews with a hero image to post.' };

  const state = store('social-daily');
  let posted = {};
  try { posted = (await state.get('posted', { type: 'json' })) || {}; } catch (_) {}
  let pool = reviews.filter((r) => !posted[r.url]);
  if (!pool.length) { posted = {}; pool = reviews; }              // everyone's had a turn → start the rotation over
  const pick = pool[Math.floor(Math.random() * pool.length)];

  let buffer;
  try { buffer = await compose(pick); } catch (e) { return { ok: false, error: 'Graphic render failed: ' + e.message, review: pick.url }; }

  const caps = captions(pick);
  const results = {};
  results.instagram = await publishInstagram(buffer, caps.instagram);
  results.facebook = await publishFacebook(buffer, caps.facebook);
  const anyOk = Object.values(results).some((r) => r && r.ok);

  if (anyOk) { posted[pick.url] = Date.now(); try { await state.set('posted', JSON.stringify(posted)); } catch (_) {} }

  return { ok: anyOk, source: source || 'manual', review: { title: pick.title, url: pick.url }, remaining_in_rotation: pool.length - 1, results };
}

module.exports = { runDailySocial, compose, captions };
