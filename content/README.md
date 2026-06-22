# Content — exported reviews staging area

This folder is a **staging area** for review content exported from the current
live site (WomensSportsStore.com). Drop your exported files here so they're
versioned in the repo, ready to be converted into WSS™ review pages.

## What goes here

- Exported reviews in whatever format your current site produces — Markdown,
  HTML, CSV/JSON exports, or a WordPress export (WXR/XML).
- Any accompanying assets (images, notes) for those reviews.

Organising into subfolders (e.g. `content/run/`, `content/swim/`) is fine but
not required.

## Important: nothing here is published automatically

This folder sits **outside `src/`**, so Astro does **not** build or publish
anything in it — it won't appear on the live site. It's purely a holding place.

A review only goes live once it's turned into a Markdown page under
`src/pages/reviews/<category>/<slug>.md` with the proper frontmatter
(`layout`, `title`, `brand`, `category`, `overall_score`, etc.). That can be
done by hand, or by running the source through the pipeline tool.

Add `draft: true` to a converted review's frontmatter to keep it hidden from
listings/search until you're ready to publish it.
