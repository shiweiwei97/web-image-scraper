# web-image-scraper

OpenClaw skill for extracting likely **content images** from live websites using a headless browser workflow built on `agent-browser`.

It is designed for pages where static fetches miss the real images because they are:
- rendered with JavaScript
- lazy-loaded
- hidden behind gallery clicks or listing/detail flows
- mixed with logos, icons, avatars, and other UI assets

## What it does

This skill helps an agent:
- open a live page in a browser
- wait for the page to render
- extract likely image candidates from rendered HTML
- rank image candidates using practical heuristics
- optionally download the best candidates
- render a local HTML/Markdown gallery for review

## Good use cases

Use it for:
- restaurant photos
- menu photos
- hotel/gallery images
- product images
- article hero images
- visual shortlist gathering from search/detail pages

## Repository layout

```text
.
├── SKILL.md
├── references/
│   └── workflow.md
└── scripts/
    ├── download_candidates.mjs
    ├── extract_image_candidates.mjs
    ├── render_gallery.mjs
    ├── resolve_detail_url.mjs
    ├── scrape_page_images.sh
    ├── search_then_open_detail.mjs
    └── search_then_open_detail.sh
```

## Requirements

Runtime requirements depend on how you use the skill, but the main workflow expects:
- OpenClaw
- `agent-browser`
- Node.js
- a shell environment that can run the included scripts

## Quick start

### Scrape images from a known page

```bash
bash skills/web-image-scraper/scripts/scrape_page_images.sh "https://example.com" 20
```

### Search first, then open a likely detail page

```bash
node skills/web-image-scraper/scripts/search_then_open_detail.mjs \
  --query "晓波烧烤 锦州" \
  --site "dianping.com" \
  --no-open > /tmp/candidates.json
```

### Download top results and build a gallery

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

## How the ranking works

The extractor prefers images that look like real content photos rather than UI assets. It scores candidates higher when it sees signals like:
- larger dimensions
- gallery/photo/image semantics in URLs or attributes
- lazy-load attributes like `data-src` and `srcset`
- relevant nearby text
- CSS background images that appear content-like

It scores lower or filters images that look like:
- logos
- icons
- avatars
- sprites
- placeholders
- QR codes
- tiny images

## ClawHub publishing

This repository is already structured to map cleanly to a ClawHub/OpenClaw skill:
- `SKILL.md` at the root
- scripts under `scripts/`
- reference docs under `references/`

Before publishing to ClawHub, double-check:
- the `name` and `description` in `SKILL.md`
- that script paths are correct
- that no repo-only extras are required by the skill itself
- that the examples still match the current workflow

## License

MIT — see [LICENSE](./LICENSE).
