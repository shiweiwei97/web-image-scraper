---
name: web-image-scraper
description: Extract likely content images from websites using a headless browser workflow built on agent-browser. Use when the user wants webpage images, restaurant photos, menu photos, hotel/gallery images, product images, article hero images, or a visual shortlist from live sites/search pages. Best for pages that require JavaScript rendering, lazy loading, or interaction before image URLs appear.
---

# Web Image Scraper

Use `agent-browser` to render the page, then use the bundled extractor to collect, download, and present likely image results as a local gallery.

## Overview

This skill is for image gathering from live websites, especially when static fetches miss JavaScript-rendered or lazy-loaded images. It works well for restaurant pages, hotel pages, gallery/search pages, and map/listing sites where the goal is to surface likely real photos instead of logos or tiny icons.

## Core Workflow

1. Open the target page with `agent-browser`.
2. Wait for the page to settle.
3. If needed, click into the relevant listing or open an Images/gallery tab.
4. Capture page HTML.
5. Run `scripts/extract_image_candidates.mjs` with the page URL as the base URL.
6. Review the JSON results and prefer high-score candidates with realistic dimensions, photo-like paths, and useful context text.
7. If the user wants something directly viewable, run `download_candidates.mjs` and then `render_gallery.mjs` to produce local image files plus HTML/Markdown gallery output.
8. If needed, interact more (scroll, open modal, open next page) and repeat.

## Quick Start

### One-shot from a URL

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

If the page is a results page, first click the most relevant item, then extract from the detail page.

### Search first, then open a likely detail page

```bash
# Safer two-step mode: search + shortlist first
node skills/web-image-scraper/scripts/search_then_open_detail.mjs \
  --query "晓波烧烤 锦州" --site "dianping.com" --no-open > /tmp/candidates.json

# Then inspect the best candidate URL
node -e 'const fs=require("fs");const j=JSON.parse(fs.readFileSync("/tmp/candidates.json","utf8"));console.log(j.candidates[0]?.url||"")'
```

```bash
# One-shot mode still exists when the environment is stable
bash skills/web-image-scraper/scripts/search_then_open_detail.sh "晓波烧烤 锦州" "dianping.com"
```

### Download shortlisted images and build a local gallery

```bash
bash skills/web-image-scraper/scripts/scrape_page_images.sh "https://example.com" 20 > /tmp/candidates.json
node skills/web-image-scraper/scripts/download_candidates.mjs \
  --file /tmp/candidates.json --out-dir ./downloads/example --top 8 --min-score 2
node skills/web-image-scraper/scripts/render_gallery.mjs \
  --file ./downloads/example/manifest.json --title "Example gallery"
```

This produces:
- local image files in `./downloads/example/`
- `manifest.json` with metadata
- `gallery.html` for direct viewing in a browser
- `gallery.md` for mixed text + image output in markdown-friendly surfaces

## Browser Workflow Patterns

### 1. Single detail page

For a known restaurant/hotel/article page:

```bash
agent-browser open "<detail-url>"
agent-browser wait --load networkidle
agent-browser get html body --json
```

Then pipe HTML into the extractor.

### 2. Search or listing page

For a search page or local directory:

```bash
agent-browser open "<search-url>"
agent-browser wait --load networkidle
agent-browser snapshot -i --json
```

Use the refs to click the best matching result, then re-run the extraction on the detail page.

### 3. Lazy-loaded galleries

For pages that load more images while scrolling:

```bash
agent-browser scroll down 1200
agent-browser wait 1000
agent-browser scroll down 1200
agent-browser wait --load networkidle
agent-browser get html body --json
```

Repeat until image candidates stop changing meaningfully.

## Heuristics

The extractor scores likely images higher when URLs, attributes, or nearby text suggest:
- gallery/photo/image/menu/dish/food/hero/content semantics
- larger dimensions
- non-logo, non-icon, non-avatar paths
- modern lazy-load attributes (`data-src`, `data-original`, `srcset`)
- CSS background images
- relevant nearby text like dish names, menu hints, storefront/environment labels

It scores lower or filters when URLs or labels suggest:
- logo, icon, sprite, avatar, emoji, badge, thumb, placeholder, QR code
- tiny dimensions
- data URIs
- SVGs that are likely UI assets

Treat scores as hints, not truth. Always sanity-check top results.

## Recommended Output Style

When returning results to the user, prefer a mixed presentation:
- short summary of what the images appear to show
- embedded/local image references when possible
- source page URL
- note like `likely menu photo`, `likely storefront`, `likely dining room`, `likely dish close-up`

If the user wants files, download only a shortlisted set instead of bulk-downloading everything.

## Resources

### scripts/
- `extract_image_candidates.mjs`: Parse rendered HTML and emit ranked image candidates as JSON, including alt/title/context where available.
- `download_candidates.mjs`: Download top-ranked candidates to a local directory and save a `manifest.json`.
- `render_gallery.mjs`: Turn a download manifest into `gallery.html` and `gallery.md` with local image paths.
- `scrape_page_images.sh`: One-shot wrapper around `agent-browser` + extractor for a single URL.
- `search_then_open_detail.mjs`: Search the web, rank likely detail pages, and optionally open the best match in `agent-browser`.
- `search_then_open_detail.sh`: Thin shell wrapper for the detail-page search flow.
- `resolve_detail_url.mjs`: Open a candidate redirect/detail link and classify the resulting page.

### references/
- `workflow.md`: Minimal operating notes for choosing pages and repeating extraction after interactions.
