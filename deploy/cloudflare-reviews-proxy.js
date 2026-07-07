/**
 * Cloudflare Worker — mount the WSS reviews site at womenssportsstore.com/reviews
 *
 * Context: the Shopify store owns the apex domain (womenssportsstore.com).
 * Shopify cannot reverse-proxy a subpath to an external origin, so this Worker
 * sits at the edge in front of the domain and forwards ONLY the /reviews subtree
 * to the Netlify build. Every other path falls through to Shopify untouched.
 *
 * The Astro site is built with base:'/reviews', and netlify.toml rewrites
 * /reviews/* back to the dist root on the origin. So this Worker is a simple
 * pass-through: it forwards the /reviews-prefixed request as-is; the origin
 * handles the prefix. No path rewriting is needed here.
 *
 * Deploy on the route:  womenssportsstore.com/reviews*
 * (If you instead deploy on womenssportsstore.com/* the non-/reviews passthrough
 *  branch below sends everything else straight to Shopify.)
 */

// The Netlify build that serves the reviews site. Override in wrangler.toml with
// a [vars] entry ORIGIN = "https://<your-site>.netlify.app" if it ever changes.
const DEFAULT_ORIGIN = 'https://wss-review-site-tool.netlify.app';

// Admin tools are auth-gated internal surfaces. Keep them OFF the public store
// domain — operators use them on the Netlify origin directly
// (e.g. https://wss-review-site-tool.netlify.app/reviews/console).
const BLOCKED = [/^\/reviews\/console(\/|$)/, /^\/reviews\/pipeline(\/|$)/];

export default {
  async fetch(request, env) {
    const origin = (env && env.ORIGIN) || DEFAULT_ORIGIN;
    const url = new URL(request.url);
    const path = url.pathname;

    // Anything outside /reviews belongs to Shopify — pass straight through.
    // (No-op when the Worker route is already scoped to /reviews*.)
    if (path !== '/reviews' && !path.startsWith('/reviews/')) {
      return fetch(request);
    }

    // Normalise the bare hub path so it always ends in a slash.
    if (path === '/reviews') {
      return Response.redirect(url.origin + '/reviews/', 301);
    }

    // Don't expose the admin tools on the public domain.
    if (BLOCKED.some((re) => re.test(path))) {
      return new Response('Not found', { status: 404 });
    }

    // Forward to Netlify, preserving the /reviews-prefixed path + query. The
    // origin's netlify.toml (`/reviews/* -> /:splat`) maps it to the built file.
    const upstream = new URL(path + url.search, origin);
    const req = new Request(upstream.toString(), request);
    req.headers.set('X-Forwarded-Host', url.host);
    req.headers.set('X-Forwarded-Proto', 'https');

    const res = await fetch(req);

    // Pass the response through unchanged. (Netlify already sets caching +
    // security headers; see netlify.toml.)
    return new Response(res.body, res);
  },
};
