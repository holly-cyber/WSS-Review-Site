// Shared client-side logic for the WSS review admin surfaces (the new console
// at /console). Pure string helpers plus thin clients over the existing Netlify
// function proxies. No top-level DOM access so it can be imported anywhere.

import { taxonomy } from '../data/taxonomy.js';

export const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Reviews live at src/pages/<category>/<slug>.md (flattened for the /reviews base
// path). A path is a review only if its folder is a real taxonomy category — this
// keeps sibling content like src/pages/news/*.md out of the review list.
const REVIEW_CATEGORY_SLUGS = new Set(taxonomy.map((t) => t.slug));
export function isReviewPath(p) {
  const m = /^src\/pages\/([^/]+)\/[^/]+\.md$/.exec(p || '');
  return !!m && REVIEW_CATEGORY_SLUGS.has(m[1]);
}
export const b64 = (str) => btoa(unescape(encodeURIComponent(str)));
export const b64decode = (b) => {
  const clean = (b || '').replace(/\n/g, '');
  try { return decodeURIComponent(escape(atob(clean))); } catch { return atob(clean); }
};

// --- Server proxies -------------------------------------------------------
export async function ghApi(action, params) {
  // Hard timeout so a non-responding proxy surfaces as a visible error
  // instead of an indefinite "Loading…".
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  let r;
  try {
    r = await fetch('/api/github-proxy', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...params }), signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') throw new Error('Request timed out after 25s — the GitHub proxy did not respond. Check that GITHUB_TOKEN is set in the Netlify environment.');
    throw new Error('Network error reaching the GitHub proxy: ' + e.message);
  }
  clearTimeout(timer);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.message || ('HTTP ' + r.status));
  return data;
}

// Stream a completion from the ai-proxy (Anthropic Messages API). Calls
// onText(fullTextSoFar) as tokens arrive and resolves with the final text.
export async function aiStream({ system, messages, model = 'claude-sonnet-4-6', max_tokens = 2000, onText } = {}) {
  const res = await fetch('/.netlify/functions/ai-proxy', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, max_tokens, stream: true, system, messages }),
  });
  const ct = res.headers.get('content-type') || '';
  if (!res.ok || ct.includes('application/json')) {
    const t = await res.text(); let msg = t;
    try { const j = JSON.parse(t); msg = (j.error && (j.error.message || j.error)) || j.message || t; } catch {}
    throw new Error('AI proxy ' + res.status + ': ' + msg + (res.status === 500 || /api[_-]?key/i.test(msg) ? ' (check ANTHROPIC_API_KEY is set in Netlify)' : ''));
  }
  const reader = res.body.getReader(); const dec = new TextDecoder();
  let buf = '', text = '', streamErr = '';
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n'); buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      let j; try { j = JSON.parse(line.slice(6)); } catch { continue; }
      if (j.type === 'error') streamErr = j.error?.message || 'stream error';
      else if (j.type === 'content_block_delta' && j.delta?.text) { text += j.delta.text; if (onText) onText(text); }
    }
  }
  if (streamErr && !text) throw new Error(streamErr);
  return text;
}

// --- News generation: originality + legal rules (single editable source) -----
// These govern every article the News tab generates. Edit here to change them.
export const NEWS_SYSTEM = `You are a senior news editor for Women's Sports Store (WSS), writing original women's-sport journalism for an audience of active women. Your copy MUST be legally safe and original:
- Treat every source as REFERENCE ONLY. Report the underlying facts entirely in your own words, structure and voice. Never reproduce a source's sentences, distinctive phrasing or headline — not even reworded ("spun") versions.
- Copyright protects expression, not facts: you may state the facts, but the wording and structure must be wholly your own.
- Never invent quotes, statistics, names, dates or events. If something isn't in the brief, keep it general or leave it out.
- Attribute claims to the outlet by name (e.g. "according to Triathlete"). Avoid direct quotes; if one is genuinely necessary, keep it under ~20 words, in quotation marks, with attribution.
- Add genuine original value — WSS analysis, context and practical takeaways for active women — so the piece is transformative commentary, not a summary.
- British English. Warm, knowledgeable, lightly editorial. No clickbait, no fabrication, no closing call-to-action.`;

export const NEWS_RULES = `ORIGINALITY & LEGAL RULES — follow every one:
1. Write 100% original prose. Do NOT copy or lightly paraphrase any run of 6+ consecutive words from the source material.
2. Use your own headline, angle, structure and subheadings — never mirror the source's wording or ordering.
3. Report only facts present in the brief below; never add invented quotes, figures, names or dates.
4. Attribute key facts to the outlet by name. Prefer zero direct quotes; any quote must be under 20 words, quoted and attributed.
5. Add a clear WSS perspective and a "why it matters for women in sport" angle, so the article stands alone as original commentary even without the source.
6. British English throughout.`;

// Build the user prompt for a news article (single story) or round-up (many).
export function buildNewsPrompt(items, angle) {
  const src = (items || []).map((it, n) => {
    let ref = it.fulltext || it.summary || '(none provided)';
    if (ref.length > 4000) ref = ref.slice(0, 4000) + '…';
    const label = it.fulltext ? 'Source article (reference only — do NOT copy any wording)' : 'Key points (reference only — do NOT copy any wording)';
    return `[${n + 1}] ${it.title}\nOutlet: ${it.source}\nLink: ${it.link}\n${label}: ${ref}`;
  }).join('\n\n');
  const angleLine = angle ? `\nEditor's angle: ${angle}\n` : '';
  const shape = (items && items.length > 1)
    ? `Write an ORIGINAL WSS news round-up that synthesises the ${items.length} stories below into one cohesive article with a fresh throughline. 450–700 words, with 2–4 "## " subheadings.`
    : `Write an ORIGINAL WSS news article based on the single story below. 350–550 words, with 1–3 "## " subheadings.`;
  return `${shape}\n${angleLine}\nThe first line MUST be the headline as "# <headline>" — your own wording, not the source's.\n\n${NEWS_RULES}\n\nSOURCE MATERIAL (reference only — rewrite everything in your own words and structure):\n${src}`;
}

// Originality guard: return the distinct runs of n+ consecutive words that the
// generated text shares verbatim with any source's full text (or title/summary
// when full text wasn't fetched). Empty = clean.
export function sourceOverlap(text, items, n = 6) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const out = norm(text).split(' ').filter(Boolean);
  const hits = new Set();
  for (const it of (items || [])) {
    const sw = norm(`${it.title || ''} ${it.fulltext || it.summary || ''}`).split(' ').filter(Boolean);
    const grams = new Set();
    for (let i = 0; i + n <= sw.length; i++) grams.add(sw.slice(i, i + n).join(' '));
    for (let i = 0; i + n <= out.length; i++) { const g = out.slice(i, i + n).join(' '); if (grams.has(g)) hits.add(g); }
  }
  return [...hits];
}

// Relevance filter: does this text look like women's / girls' sport? Used to keep
// only on-topic stories from general feeds. Edit WOMENS_RE to tune the terms.
export const WOMENS_RE = /\b(wom[ae]n|female|girl|lad(?:y|ies)|lioness|netball|wsl|wnba|w-?league)/i;
export function isWomensContent(text) { return WOMENS_RE.test(String(text || '')); }
// A feed counts as already women-focused if its name/tag says so → all its items pass.
export function isWomensFeed(nameOrTag) { return /\b(wom[ae]n|female|girl|lad(?:y|ies))/i.test(String(nameOrTag || '')); }

// Editor pass: prompt the model to rewrite an article so the flagged phrases (and
// any other close phrasing) no longer match the source, keeping facts & structure.
export function buildRewritePrompt(article, phrases) {
  const list = (phrases || []).slice(0, 25).map((p) => `- "${p}"`).join('\n');
  return `The WSS news article below still reuses wording from its source too closely. Rewrite it so that NONE of the flagged phrases below — and no run of 6+ consecutive words — match the source, while keeping every fact accurate, the same overall structure and subheadings, and British English. Return the FULL article in the same format: the first line is "# <headline>", then the body with "## " subheadings. Output only the article, no commentary.\n\nFLAGGED PHRASES (these must be reworded):\n${list}\n\nARTICLE TO REWRITE:\n${article}`;
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
// Set the review's `tested_by` to a named reviewer and clear any per-article
// Upsert a single quoted frontmatter field (key: "value"); leaves the body
// untouched. Used by the editor's Buy-link field to set affiliate_link.
export function setFrontmatterField(src, key, value) {
  src = src || '';
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return src;
  let fm = m[1];
  const line = `${key}: "${String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  const re = new RegExp('^\\s*' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:.*$', 'im');
  if (re.test(fm)) fm = fm.replace(re, line);
  else fm = fm.replace(/\s*$/, '') + '\n' + line;
  return src.replace(m[0], '---\n' + fm + '\n---');
}

// Turn the first bold product mention in the body into an in-content link (the
// Overview outlink the pipeline adds). Avelon converts it live where eligible.
export function linkFirstProductMention(src, url) {
  if (!url) return src;
  const m = src.match(/^(---\r?\n[\s\S]*?\r?\n---\r?\n)([\s\S]*)$/);
  if (!m) return src;
  const head = m[1]; let body = m[2];
  const re = /\*\*(?!\[)([^*\n]+?)\*\*/;   // first **bold** that isn't already a link
  if (!re.test(body)) return src;
  return head + body.replace(re, (mm, txt) => `**[${txt}](${url})**`);
}

// --- Pillar scores -----------------------------------------------------------
// Parse the pillar_scores: YAML block into { key: number }, preserving order.
export function parsePillarScores(fm) {
  const out = {}; let inBlock = false;
  for (const ln of String(fm || '').split('\n')) {
    if (/^pillar_scores:\s*$/.test(ln)) { inBlock = true; continue; }
    if (!inBlock) continue;
    const m = ln.match(/^\s+([A-Za-z0-9_]+):\s*"?([0-9]+(?:\.[0-9]+)?)"?\s*$/);
    if (m) { out[m[1]] = Number(m[2]); continue; }
    if (/^\s*$/.test(ln)) continue;   // blank line inside the block
    if (/^\S/.test(ln)) break;        // dedent → end of block
    break;
  }
  return out;
}
// Set one value inside the pillar_scores block (leaves everything else intact).
export function setPillarScore(src, key, val) {
  const re = new RegExp('^(\\s+' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':\\s*)"?[0-9.]*"?(\\s*)$', 'm');
  return re.test(src) ? src.replace(re, '$1' + val + '$2') : src;
}
// Set the (unquoted) overall_score frontmatter field.
export function setOverallScore(src, val) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/); if (!m) return src;
  let fm = m[1];
  if (/^overall_score:.*$/m.test(fm)) fm = fm.replace(/^overall_score:.*$/m, 'overall_score: ' + val);
  else fm = fm.replace(/\s*$/, '') + '\noverall_score: ' + val;
  return src.replace(m[0], '---\n' + fm + '\n---');
}
// Rewrite the in-content scores/stars in the body to match the pillar values +
// overall: the "### Label — N/5 ★★★★☆" headings, the "## Scores" list lines, and
// the "**Overall: X.X / 5 ★★★★☆**" line. Per-criterion updates are matched by
// order and only applied when the count matches (safe no-op otherwise).
function starRun(n) { n = Math.max(0, Math.min(5, Math.round(Number(n) || 0))); return '★'.repeat(n) + '☆'.repeat(5 - n); }
export function syncBodyScores(src, scores, overall) {
  const vals = Object.values(scores || {}).map(Number).filter((v) => !isNaN(v));
  if (!vals.length) return src;
  let out = src;

  // 1) Per-criterion H3 headings: "### <label> — N/5 ★★★★☆"
  const h3re = /^(###[^\n]*?—[ \t]*)\d+(?:\.\d+)?([ \t]*\/[ \t]*5)(?:[ \t]*[★☆]+)?[ \t]*$/gm;
  if ((out.match(h3re) || []).length === vals.length) {
    let i = 0;
    out = out.replace(h3re, (m, pre, slash) => { const v = vals[i++]; return `${pre}${v}${slash} ${starRun(v)}`; });
  }

  // 2) "## Scores" block per-criterion lines: "<label> (25%): N/5" (not the Overall line)
  const sm = out.match(/^##[ \t]*Scores[ \t]*$[\s\S]*?(?=^##[ \t]|$(?![\s\S]))/m);
  if (sm) {
    let block = sm[0];
    const lineRe = /^([^\n]*?:[ \t]*)\d+(?:\.\d+)?([ \t]*\/[ \t]*5)[ \t]*$/gm;
    const matches = (block.match(lineRe) || []).filter((l) => !/overall/i.test(l));
    if (matches.length === vals.length) {
      let j = 0;
      block = block.replace(lineRe, (m, pre, slash) => { if (/overall/i.test(pre)) return m; const v = vals[j++]; return `${pre}${v}${slash}`; });
      out = out.slice(0, sm.index) + block + out.slice(sm.index + sm[0].length);
    }
  }

  // 3) Overall line: "**Overall: X.X / 5 ★★★★☆**"
  if (overall != null) {
    out = out.replace(/(\*\*Overall:[ \t]*)\d+(?:\.\d+)?([ \t]*\/[ \t]*5)(?:[ \t]*[★☆]+)?([ \t]*\*\*)/i,
      (m, pre, slash, post) => `${pre}${Number(overall).toFixed(1)}${slash} ${starRun(overall)}${post}`);
  }
  return out;
}

// Weighted (or equal, when weights is null) average of the scores → one decimal.
export function recalcOverall(scores, weights) {
  const keys = Object.keys(scores || {}); if (!keys.length) return null;
  let sum = 0, wsum = 0;
  for (const k of keys) { const v = Number(scores[k]); if (isNaN(v)) continue; const w = weights ? (weights[k] || 0) : 1; sum += v * w; wsum += w; }
  return wsum ? Math.round((sum / wsum) * 10) / 10 : null;
}

// reviewer_bio / reviewer_avatar overrides, so the shared team profile drives
// the byline name, photo and bio. The body is left untouched.
export function setReviewer(src, name) {
  src = src || '';
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return src;
  let fm = m[1]
    .replace(/^\s*reviewer_bio\s*:.*$/gim, '')
    .replace(/^\s*reviewer_avatar\s*:.*$/gim, '');
  const line = 'tested_by: "' + String(name || '').replace(/"/g, '') + '"';
  if (/^\s*tested_by\s*:.*$/im.test(fm)) {
    fm = fm.replace(/^\s*tested_by\s*:.*$/im, line);
  } else if (/^\s*date\s*:.*$/im.test(fm)) {
    fm = fm.replace(/^(\s*date\s*:.*)$/im, '$1\n' + line);
  } else {
    fm = fm.replace(/\s*$/, '') + '\n' + line;
  }
  fm = fm.replace(/\n{2,}/g, '\n').replace(/^\n+|\n+$/g, '');
  return src.replace(m[0], '---\n' + fm + '\n---');
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
export function reviewPreviewHtml(md, team = []) {
  const { fm, body } = splitFrontmatter(md);
  const f = (n) => fmField(fm, n);
  const title = f('title') || 'Untitled review', brand = f('brand'), price = f('price');
  const category = (f('category') || '').replace(/-/g, ' '), overall = f('overall_score');
  const tested = f('tested_by'), hero = f('hero_image');
  // The live byline pulls photo + bio from the shared team profile when the
  // article carries no explicit overrides — mirror that here so the preview
  // matches the published page after a reviewer change.
  let avatar = f('reviewer_avatar'), bio = f('reviewer_bio');
  if (tested && (!avatar || !bio)) {
    const tm = (team || []).find((m) => m.name.toLowerCase() === tested.toLowerCase());
    if (tm) { avatar = avatar || tm.image; bio = bio || tm.bio; }
  }
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

// Parse a review path into useful bits: src/pages/<cat>/<slug>.md
export function reviewMeta(path) {
  const parts = path.split('/');
  const slug = parts.pop().replace(/\.md$/, '');
  const category = parts.pop();
  return { slug, category, liveUrl: `/${category}/${slug}/` };
}
