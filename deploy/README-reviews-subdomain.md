# Serving the reviews site at `reviews.womenssportsstore.com`

The reviews site is hosted on Netlify and served at its own subdomain,
**`reviews.womenssportsstore.com`**. It sits at the root of that subdomain
(no base path), so URLs are clean:

- Hub: `https://reviews.womenssportsstore.com/`
- A review: `https://reviews.womenssportsstore.com/<category>/<slug>/`
- News: `https://reviews.womenssportsstore.com/news/`

The Shopify store keeps the apex `womenssportsstore.com`. Nothing proxies through
Shopify — the subdomain points straight at Netlify — so there is **no Cloudflare
Worker** and none of the orange-to-orange problems a `/reviews` subpath hit.

## Setup

### 1. Add the custom domain in Netlify
Netlify → the site (`wss-review-site-tool`) → **Domain management → Add a domain**
→ `reviews.womenssportsstore.com`. Netlify will ask you to add a DNS record and
will provision an SSL certificate automatically once the record resolves.

### 2. Add one DNS record in Cloudflare
Cloudflare → `womenssportsstore.com` → **DNS → Records → Add record**:

| Type  | Name      | Target                             | Proxy status        |
| ----- | --------- | ---------------------------------- | ------------------- |
| CNAME | `reviews` | `wss-review-site-tool.netlify.app` | **DNS only** (grey) |

Use **DNS only (grey cloud)** — that lets Netlify see the real hostname and
issue the SSL cert. (Do not orange-cloud it; that reintroduces the Cloudflare
layer we don't need and can block Netlify's cert.)

Give it a few minutes, then Netlify's domain panel shows the cert as issued and
`https://reviews.womenssportsstore.com/` goes live.

## Verify

- [ ] `https://reviews.womenssportsstore.com/` loads the styled hub.
- [ ] A review, e.g. `…/swim/best-swim-goggles-zoggs-predator-clear/`, loads with
      hero image + reviewer avatar.
- [ ] `<link rel="canonical">` is `https://reviews.womenssportsstore.com/…` (no
      `/reviews` segment).
- [ ] `…/sitemap-index.xml` resolves.
- [ ] The admin tools work: `…/console` and `…/pipeline` (auth-gated).
- [ ] Newsletter signup on the hub succeeds (`/api/subscribe`).

## Cleanup (from the abandoned subpath attempt)

If you set these up while trying the `/reviews` subpath, they're no longer used
and can be removed:

- The Cloudflare **Worker** `wss-site-review-worker` and its two Workers Routes
  (`womenssportsstore.com/reviews*`, `www.womenssportsstore.com/reviews*`).

## Notes / follow-ups

- **Search Console:** add `reviews.womenssportsstore.com` as a property and
  submit `https://reviews.womenssportsstore.com/sitemap-index.xml`.
- **Legacy WordPress URLs:** the old root-level permalinks (e.g.
  `womenssportsstore.com/runderwear-power-running-bra/`) live on the Shopify
  apex, which Netlify never sees. To preserve that SEO you'd add redirects on
  Shopify pointing at the new `reviews.` URLs. (`netlify.toml` also keeps the
  same mappings for anything that hits the Netlify origin directly.)
