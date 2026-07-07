/**
 * Cloudflare Worker — mount the WSS reviews site at womenssportsstore.com/reviews
 *
 * Context: the Shopify store owns the apex domain (womenssportsstore.com).
 * Shopify cannot reverse-proxy a subpath to an external origin, so this Worker
 * forwards ONLY the apex /reviews subtree to the Netlify build. Everything else
 * — including the Shopify store and the shop.womenssportsstore.com subdomain —
 * must NOT touch this Worker.
 *
 * ── ROUTE (critical) ───────────────────────────────────────────────────────
 * Deploy on EXACTLY this route and nothing broader:
 *
 *     womenssportsstore.com/reviews*
 *
 * Do NOT use `*.womenssportsstore.com/*`, `*womenssportsstore.com/*`,
 * `womenssportsstore.com/*`, or a shop.womenssportsstore.com route — those pull
 * the whole Shopify store (product pages, /cdn/shop images) through the Worker,
 * which is wrong and shows up as errors. Also disable the workers.dev route if
 * you don't want direct hits to <name>.workers.dev.
 *
 * With the correct route the Worker only ever sees /reviews/* and the host guard
 * below is just defence-in-depth.
 */

// The Netlify build that serves the reviews site. Override in wrangler.toml with
// a [vars] entry ORIGIN = "https://<your-site>.netlify.app" if it ever changes.
const DEFAULT_ORIGIN = 'https://wss-review-site-tool.netlify.app';

// The public apex that hosts the reviews subpath.
const REVIEWS_HOST = 'womenssportsstore.com';

// Admin tools are auth-gated internal surfaces. Keep them OFF the public store
// domain — operators use them on the Netlify origin directly
// (e.g. https://wss-review-site-tool.netlify.app/reviews/console).
const BLOCKED = [/^\/reviews\/console(\/|$)/, /^\/reviews\/pipeline(\/|$)/];

export default {
  async fetch(request, env) {
    const origin = (env && env.ORIGIN) || DEFAULT_ORIGIN;
    const url = new URL(request.url);

    // Only ever handle the apex reviews subtree. Any other host (e.g. the
    // Shopify shop.* subdomain) or any non-/reviews path is NOT ours — hand it
    // straight back to the origin untouched. The header guard stops this
    // pass-through from re-entering the Worker if the route is broader than it
    // should be, so a mis-scoped route degrades to a harmless no-op instead of
    // erroring on Shopify traffic.
    const isReviews =
      url.hostname === REVIEWS_HOST &&
      (url.pathname === '/reviews' || url.pathname.startsWith('/reviews/'));

    if (!isReviews) {
      if (request.headers.get('x-wss-passthrough') === '1') return fetch(request);
      const pass = new Request(request);
      pass.headers.set('x-wss-passthrough', '1');
      return fetch(pass);
    }

    // Normalise the bare hub path so it always ends in a slash.
    if (url.pathname === '/reviews') {
      return Response.redirect(url.origin + '/reviews/', 301);
    }

    // Don't expose the admin tools on the public domain.
    if (BLOCKED.some((re) => re.test(url.pathname))) {
      return new Response('Not found', { status: 404 });
    }

    // Forward to Netlify, preserving the /reviews-prefixed path + query. The
    // origin's netlify.toml (`/reviews/* -> /:splat`) maps it to the built file.
    const upstream = new URL(url.pathname + url.search, origin);
    const req = new Request(upstream.toString(), request);
    req.headers.set('X-Forwarded-Host', url.host);
    req.headers.set('X-Forwarded-Proto', 'https');

    const res = await fetch(req);
    return new Response(res.body, res);
  },
};
