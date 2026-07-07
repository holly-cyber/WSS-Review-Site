# Serving the reviews site at `womenssportsstore.com/reviews`

This site is the WSS reviews hub. In production it is mounted as the **`/reviews`
subpath** of the Shopify store domain (`womenssportsstore.com`). Because Shopify
owns the apex and can't reverse-proxy a subpath to an external origin, an **edge
proxy (Cloudflare Worker)** forwards `/reviews/*` to the Netlify build, and
everything else stays on Shopify.

```
                    ┌───────────────────────────────┐
  visitor  ─────►   │  womenssportsstore.com (edge)  │
                    │  Cloudflare Worker             │
                    └───────────────────────────────┘
                       │                        │
             /reviews/*│                        │ everything else
                       ▼                        ▼
        Netlify build (this repo)          Shopify store
        wss-review-site-tool.netlify.app
```

## What the repo already does

- **`astro.config.mjs`** — `site: 'https://womenssportsstore.com'`,
  `base: '/reviews'`. Every page, asset, canonical and sitemap URL is emitted
  under `/reviews/…`.
- **Flattened content** — reviews live at `src/pages/<category>/<slug>.md`
  (not `src/pages/reviews/…`), so with the base the public URL is a clean
  `…/reviews/<category>/<slug>/` — **no doubled `/reviews/reviews/`**.
- **`netlify.toml`**
  - `/reviews/* → /:splat` (200) makes the Netlify origin serve the whole site
    under `/reviews` (the built files sit at the dist root; this strips the
    prefix). This is why the Worker can be a plain pass-through.
  - `/reviews/api/* → /.netlify/functions/:splat` (200) — public API calls (the
    newsletter signup posts to `/reviews/api/subscribe`).
  - `X-Frame-Options: SAMEORIGIN` on `/reviews/pipeline*` so the console can
    embed the pipeline in an iframe; the rest of the site stays `DENY`.

You don't need to change any of the above — it's already committed.

## 1. Deploy the Cloudflare Worker

The Worker is in [`deploy/cloudflare-reviews-proxy.js`](./cloudflare-reviews-proxy.js).

**Prerequisite:** `womenssportsstore.com` must be on Cloudflare (its nameservers
point at Cloudflare) so Workers can run on the zone. The Shopify store stays the
origin for every non-`/reviews` path.

Using Wrangler:

```toml
# wrangler.toml
name = "wss-reviews-proxy"
main = "deploy/cloudflare-reviews-proxy.js"
compatibility_date = "2024-11-01"

[vars]
ORIGIN = "https://wss-review-site-tool.netlify.app"

# Scope the Worker to the /reviews subtree only. Everything else is served by
# Shopify without touching the Worker.
[[routes]]
pattern = "womenssportsstore.com/reviews*"
zone_name = "womenssportsstore.com"
```

```bash
npx wrangler deploy
```

(Or paste `cloudflare-reviews-proxy.js` into a Worker in the Cloudflare dashboard
and add the route `womenssportsstore.com/reviews*` under **Workers Routes**.)

> The Worker blocks `/reviews/console` and `/reviews/pipeline` on the public
> domain. Operators use those admin tools directly on the Netlify origin:
> `https://wss-review-site-tool.netlify.app/reviews/console`.

## 2. Legacy WordPress URLs → Shopify redirects

The old WordPress permalinks were root-level (e.g.
`womenssportsstore.com/runderwear-power-running-bra/`). Those hit the **apex**,
which is Shopify — Netlify never sees them — so the redirects must live on
Shopify (or the edge). Import them into Shopify's URL redirect tool:

- File: [`deploy/shopify-legacy-redirects.csv`](./shopify-legacy-redirects.csv)
  (columns `Redirect from,Redirect to`).
- Shopify admin → **Online Store → Navigation → URL Redirects → Import**.

Each row 301s an old permalink to its new `/reviews/<category>/<slug>/` home, so
existing inbound links and SEO ranking carry over. (The same pairs also exist in
`netlify.toml` for origin-direct access, but Shopify is what serves the apex.)

## 3. Verify after deploy

Run against the **live** domain once the Worker + Netlify deploy are up:

- [ ] `https://womenssportsstore.com/reviews/` → the reviews hub renders (styled).
- [ ] A review page, e.g. `…/reviews/swim/best-swim-goggles-zoggs-predator-clear/`,
      loads with CSS, hero image, and the byline avatar.
- [ ] View source: `<link rel="canonical">` is a single
      `https://womenssportsstore.com/reviews/…` (no doubled `/reviews/reviews/`).
- [ ] `…/reviews/sitemap-0.xml` (and `sitemap-index.xml`) resolve.
- [ ] Nav links (News, About, categories) and the logo stay inside `/reviews`.
- [ ] A legacy URL, e.g. `…/runderwear-power-running-bra/`, 301s to
      `…/reviews/run/runderwear-power-running-bra/` (after the Shopify import).
- [ ] `…/reviews/console` on the store domain returns 404; the console works on
      the Netlify origin.
- [ ] Newsletter signup on the hub succeeds (posts to `/reviews/api/subscribe`).

## Notes

- **Search Console:** add/confirm `womenssportsstore.com`, submit
  `https://womenssportsstore.com/reviews/sitemap-index.xml`.
- **`robots.txt`** lives at the apex (Shopify). Make sure it doesn't block
  `/reviews/` and add `Sitemap: https://womenssportsstore.com/reviews/sitemap-index.xml`.
- **Caching:** Netlify sets `no-cache` on the admin HTML; the Worker passes
  Netlify's headers through unchanged. If you add Cloudflare caching, exclude
  `/reviews/console*` and `/reviews/pipeline*`.
