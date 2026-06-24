// Shared client-side logic for the WSS review admin surfaces (the new console
// at /console and, in time, the pipeline's Manage modal). Pure string helpers
// plus thin clients over the existing Netlify function proxies. No top-level
// DOM access so it can be imported anywhere.

export const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const b64 = (str) => btoa(unescape(encodeURIComponent(str)));
export const b64decode = (b) => {
  const clean = (b || '').replace(/\n/g, '');
  try { return decodeURIComponent(escape(atob(clean))); } catch { return atob(clean); }
};

// --- Server proxies -------------------------------------------------------
export async function ghApi(action, params) {
  const r = await fetch('/api/github-proxy', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...params }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.message || ('HTTP ' + r.status));
  return data;
}

export async function scrapeImages(url) {
  const r = await fetch('/api/scrape-images', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const data = await r.json().catch(() => ({}));
  return data.images || [];
}

// --- Frontmatter ----------------------------------------------------------
export function splitFrontmatter(md) {
  const m = (md || '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  return m ? { fm: m[1], body: m[2], hasFm: true } : { fm: '', body: md || '', hasFm: false };
}
export function fmField(fm, name) {
  const m = String(fm).match(new RegExp('^' + name + ':[ \\t]*"?([^"\\n]*?)"?[ \\t]*$', 'im'));
  return m ? m[1].trim() : '';
}
// Add or remove `draft: true` in the frontmatter, leaving the body untouched.
export function setDraftFlag(src, makeDraft) {
  src = src || '';
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return src;
  let fm = m[1].replace(/^\s*draft\s*:.*$/gim, '').replace(/\n{2,}/g, '\n').replace(/^\n+|\n+$/g, '');
  if (makeDraft) fm = fm + '\ndraft: true';
  return src.replace(m[0], '---\n' + fm + '\n---');
}
export function isDraft(md) {
  const { fm } = splitFrontmatter(md);
  return /^\s*draft\s*:\s*true\s*$/im.test(fm);
}

// --- Markdown → HTML (identical to the pipeline preview renderer) ----------
export function mdToHtml(md) {
  const escTxt = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function inline(t) {
    return String(t).split(/(<a\b[^>]*>[\s\S]*?<\/a>)/g).map((part, idx) => {
      if (idx % 2 === 1) return part;
      part = escTxt(part);
      part = part.replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (m, a, u) => `<img src="${u}" alt="${a}">`);
      part = part.replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (m, a, u) => `<a href="${u}" target="_blank" rel="noopener">${a}</a>`);
      part = part.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      part = part.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
      part = part.replace(/`([^`]+)`/g, '<code>$1</code>');
      return part;
    }).join('');
  }
  const lines = (md || '').replace(/\r/g, '').split('\n'); let html = '', i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (/^\s*<(?!a\b)/.test(line)) { html += line; i++; continue; }
    const hm = line.match(/^(#{2,6})\s+(.*)$/);
    if (hm) { const lvl = Math.min(hm[1].length, 6); html += `<h${lvl}>${inline(hm[2])}</h${lvl}>`; i++; continue; }
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /-/.test(lines[i + 1]) && /^\s*\|?[\s:|-]+$/.test(lines[i + 1])) {
      const splitRow = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((x) => x.trim());
      const head = splitRow(line); i += 2; const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(splitRow(lines[i])); i++; }
      html += '<table><thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' + rows.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table>'; continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) { const ordered = /^\s*\d+\./.test(line); const items = []; while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, '')); i++; } html += `<${ordered ? 'ol' : 'ul'}>` + items.map((it) => `<li>${inline(it)}</li>`).join('') + `</${ordered ? 'ol' : 'ul'}>`; continue; }
    if (/^\s*>/.test(line)) { const q = []; while (i < lines.length && /^\s*>/.test(lines[i])) { q.push(lines[i].replace(/^\s*>\s?/, '')); i++; } html += `<blockquote>${inline(q.join(' '))}</blockquote>`; continue; }
    const para = [line]; i++;
    while (i < lines.length && lines[i].trim() && !/^\s*(#{2,6}\s|[-*]\s|\d+\.\s|>|\||<(?!a\b))/.test(lines[i])) { para.push(lines[i]); i++; }
    html += `<p>${inline(para.join(' '))}</p>`;
  }
  return html;
}

// --- Live "what the live page looks like" preview from a review's markdown -
export function reviewPreviewHtml(md) {
  const { fm, body } = splitFrontmatter(md);
  const f = (n) => fmField(fm, n);
  const title = f('title') || 'Untitled review', brand = f('brand'), price = f('price');
  const category = (f('category') || '').replace(/-/g, ' '), overall = f('overall_score');
  const tested = f('tested_by'), avatar = f('reviewer_avatar'), bio = f('reviewer_bio'), hero = f('hero_image');
  const aff = f('affiliate_link'), shop = f('shopify_link');
  const pct = Math.max(0, Math.min(100, (parseFloat(overall || '0') / 5) * 100));
  const stars = `<span class="pv-stars-wrap"><span class="pv-stars-bg">★★★★★</span><span class="pv-stars-fg" style="width:${pct}%">★★★★★</span></span>`;
  const heroBg = hero ? ` style="background-image:linear-gradient(rgba(0,0,54,.82),rgba(0,0,54,.82)),url('${esc(hero)}');background-size:cover;background-position:center"` : '';
  let h = `<div class="pv-hero"${heroBg}>`;
  if (category) h += `<div class="pv-pill">${esc(category)}</div>`;
  h += `<div class="pv-title">${esc(title)}</div>`;
  if (brand || price) h += `<div class="pv-brand">${brand ? 'by <strong>' + esc(brand) + '</strong>' : ''}${price ? ' · £' + esc(price) : ''}</div>`;
  if (overall) h += `<div class="pv-score">${stars}<span class="overall-num">${esc(overall)}/5</span><span class="pv-badge">WSS™ Reviewed</span></div>`;
  if (tested) h += `<div class="pv-byline">${avatar ? `<img src="${esc(avatar)}" alt=""/>` : ''}<span>Reviewed by <strong>${esc(tested)}</strong></span></div>`;
  h += `</div>`;
  let c = `<div class="pv-content">${mdToHtml(body)}`;
  const buy = [];
  if (shop) buy.push(`<span class="pv-buy">Buy from WSS store${price ? ' — £' + esc(price) : ''} →</span>`);
  if (aff) buy.push(`<span class="pv-buy${shop ? ' alt' : ''}">Buy direct from ${esc(brand || 'brand')} →</span>`);
  if (buy.length) c += `<div class="pv-cta">${buy.join('')}</div>`;
  if (tested || bio) c += `<div class="pv-reviewer">${avatar ? `<img src="${esc(avatar)}" alt=""/>` : ''}<div><div class="lbl">About the reviewer</div>${tested ? `<div class="nm">${esc(tested)}</div>` : ''}${bio ? `<p class="bio">${esc(bio)}</p>` : ''}</div></div>`;
  c += `</div>`;
  return h + c;
}

// --- Insert hero + inline images into a review's markdown (re-runnable) ----
export function insertImages(src, imgs, name) {
  imgs = (imgs || []).slice(0, 4);
  const alt = String(name || 'Product image').replace(/[\[\]]/g, '').trim();
  const imgMd = (im, i) => `\n\n![${alt}${i ? ' — image ' + (i + 1) : ''}](${im.url || im})\n`;
  const fmM = src.match(/^(---\r?\n[\s\S]*?\r?\n---\r?\n)([\s\S]*)$/);
  let fm = fmM ? fmM[1] : ''; let body = fmM ? fmM[2] : src;
  const hero = imgs[0] ? (imgs[0].url || imgs[0]) : '';
  if (fm) {
    if (/^hero_image:.*$/im.test(fm)) fm = fm.replace(/^hero_image:.*$/im, 'hero_image: "' + hero + '"');
    else fm = fm.replace(/(\r?\n---\r?\n)$/, '\nhero_image: "' + hero + '"$1');
  }
  body = body.replace(/^[ \t]*!\[[^\]]*\]\([^)]*\)[ \t]*$/gm, '').replace(/\n{3,}/g, '\n\n').replace(/^\s+/, '');
  const am = body.match(/^##[ \t]*WSS[^\n]*Assessment[^\n]*$/im);
  if (!am) return fm + imgMd(imgs[0], 0).replace(/^\n+/, '') + '\n\n' + body;
  const before = body.slice(0, am.index).replace(/\s+$/, '');
  let restFromAsm = body.slice(am.index);
  const afterHeadRel = restFromAsm.slice(am[0].length).search(/\n##[ \t]/);
  const asmEnd = afterHeadRel >= 0 ? am[0].length + afterHeadRel : restFromAsm.length;
  let asm = restFromAsm.slice(0, asmEnd);
  const tail = restFromAsm.slice(asmEnd);
  const h3 = [...asm.matchAll(/\n###[ \t]/g)].map((m) => m.index);
  const inline = imgs.slice(1);
  for (let k = Math.min(inline.length, Math.max(0, h3.length - 1)); k >= 1; k--) {
    asm = asm.slice(0, h3[k]) + '\n' + imgMd(inline[k - 1], k) + asm.slice(h3[k]);
  }
  return fm + before + imgMd(imgs[0], 0) + '\n' + asm + tail;
}

// Parse a review path into useful bits: src/pages/reviews/<cat>/<slug>.md
export function reviewMeta(path) {
  const parts = path.split('/');
  const slug = parts.pop().replace(/\.md$/, '');
  const category = parts.pop();
  return { slug, category, liveUrl: `/reviews/${category}/${slug}/` };
}
