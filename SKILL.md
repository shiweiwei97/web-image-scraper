---
name: web-image-scraper
description: Extract likely content images from live websites using a browser-rendered workflow built on agent-browser. Use when the user wants webpage photos, restaurant photos, menu photos, hotel/gallery images, product images, article hero images, or a visual shortlist from search/listing/detail pages, especially when static fetches miss JavaScript-rendered or lazy-loaded images.
---

# Web Image Scraper

Use `agent-browser` to render a page, then run the bundled extractor scripts to rank likely content images, optionally download the best matches, and build a local gallery.

## Use This Skill For

- restaurant, café, and menu photos
- hotel, venue, and gallery images
- product images from live pages
- article hero images
- image gathering from search results, listings, and detail pages
- pages where JavaScript rendering, lazy loading, or clicks are required before image URLs appear

## Core Workflow

1. Open the target page with `agent-browser`.
2. Wait for the page to settle.
3. If needed, click into the relevant listing or open a gallery/images tab.
4. Capture page HTML.
5. Run `scripts/extract_image_candidates.mjs` with the page URL as the base URL.
6. Review the ranked results and prefer high-score candidates with realistic dimensions, photo-like paths, and useful context text.
7. If the user wants viewable outputs or files, run `download_candidates.mjs` and then `render_gallery.mjs`.
8. If needed, scroll, paginate, or open another detail page and repeat.

## Quick Start

### One-shot from a known URL

```bash
bash skills/web-image-scraper/scripts/scrape_page_images.sh "https://example.com" 20
```

### Manual browser + extraction flow

```bash
agent-browser open "https://example.com"
agent-browser wait --load networkidle
agent-browser get html body --json > /tmp/page.json
node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync("/tmp/page.json","utf8")); process.stdout.write((j.data && (j.data.value || j.data.html)) || "");' \
  | node skills/web-image-scraper/scripts/extract_image_candidates.mjs \
    --base-url "https://example.com" --limit 20
```

If the page is a results page, click the best candidate first, then extract from the detail page.

### Search first, then open a likely detail page

```bash
node skills/web-image-scraper/scripts/search_then_open_detail.mjs \
  --query "晓波烧烤 锦州" \
  --site "dianping.com" \
  --no-open > /tmp/candidates.json

node -e 'const fs=require("fs");const j=JSON.parse(fs.readFileSync("/tmp/candidates.json","utf8"));console.log(j.candidates[0]?.url||"")'
```

One-shot helper when the environment is stable:

```bash
bash skills/web-image-scraper/scripts/search_then_open_detail.sh "晓波烧烤 锦州" "dianping.com"
```

### Download shortlisted images and build a local gallery

```bash
bash skills/web-image-scraper/scripts/scrape_page_images.sh "https://example.com" 20 > /tmp/candidates.json
node skills/web-image-scraper/scripts/download_candidates.mjs \
  --file /tmp/candidates.json \
  --out-dir ./downloads/example \
  --top 8 \
  --min-score 2
node skills/web-image-scraper/scripts/render_gallery.mjs \
  --file ./downloads/example/manifest.json \
  --title "Example gallery"
```

This produces:
- local image files in `./downloads/example/`
- `manifest.json` with metadata
- `gallery.html` for browser viewing
- `gallery.md` for markdown-friendly output

## Browser Patterns

### Single detail page

```bash
agent-browser open "<detail-url>"
agent-browser wait --load networkidle
agent-browser get html body --json
```

Then pipe the HTML into the extractor.

### Search or listing page

```bash
agent-browser open "<search-url>"
agent-browser wait --load networkidle
agent-browser snapshot -i --json
```

Use the refs to click the best match, then re-run extraction on the detail page.

### Lazy-loaded galleries

```bash
agent-browser scroll down 1200
agent-browser wait 1000
agent-browser scroll down 1200
agent-browser wait --load networkidle
agent-browser get html body --json
```

Repeat until the image candidates stop changing meaningfully.

## Heuristics

The extractor scores candidates higher when URLs, attributes, or nearby text suggest:
- gallery/photo/image/menu/dish/food/hero/content semantics
- larger dimensions
- non-logo, non-icon, non-avatar paths
- lazy-load attributes like `data-src`, `data-original`, and `srcset`
- CSS background images
- nearby context like dish names, menu hints, storefront labels, or environment labels

It scores lower or filters candidates that look like:
- logos, icons, sprites, avatars, badges, placeholders, QR codes
- tiny images
- data URIs
- SVGs that are likely UI assets

Treat scores as hints, not truth. Sanity-check the top results.

## Output Style

When returning results to the user, prefer:
- a short summary of what the images appear to show
- embedded/local image references when possible
- the source page URL
- light labels like `likely menu photo`, `likely storefront`, `likely dining room`, or `likely dish close-up`

If the user wants files, download only a shortlisted set instead of bulk-downloading everything.

## Resources

### scripts/
- `extract_image_candidates.mjs` — Parse rendered HTML and emit ranked image candidates as JSON.
- `download_candidates.mjs` — Download top-ranked candidates and write `manifest.json`.
- `render_gallery.mjs` — Build `gallery.html` and `gallery.md` from a manifest.
- `scrape_page_images.sh` — One-shot wrapper around `agent-browser` and the extractor for a single URL.
- `search_then_open_detail.mjs` — Search the web, rank likely detail pages, and optionally open the best match in `agent-browser`.
- `search_then_open_detail.sh` — Shell wrapper for the detail-page search flow.
- `resolve_detail_url.mjs` — Open a candidate redirect/detail link and classify the resulting page.

### references/
- `workflow.md` — Minimal operating notes for choosing pages and repeating extraction after interactions.
