# Website drafts, backup only

This directory and `site-pages/` are unfinished source drafts. They are not
wired into the production build or published routes. No sitemap is generated
by the current draft build. Route names and tool choices remain provisional.

- `site-pages/catalog.mjs` has a Features page draft.
- `scripts/build-site-pages.mjs` renders it to `SITE_OUT` (default `dist`).
  Run with a separate temporary output directory during development.
- The Features framing demo is local illustrative browser composition, not
  automatically generated product output. It references existing sample media.
- `tools-site/catalog.mjs` lists a tools hub and three provisional utilities.
- `tools-site/core.mjs` contains plain subtitle conversion, ratio calculation
  and custom margin validation. A complete tool UI and tool-page builder are
  not present. These are not verified platform-specific safe-zone presets.
- Features OG image metadata currently depends on a separately generated card.
  A source-only build is not a complete share-preview asset pipeline.

Before release: verify reference flows and intended tools, create and test UI,
review desktop/mobile pixels, validate generated downloads, complete metadata
and assets, verify actual hosting routes, then add sitemap/robots/canonical
consistency. Do not claim sitemap, indexing, tool completion or automatic video
quality from these drafts. Backing up drafts does not authorize release.
