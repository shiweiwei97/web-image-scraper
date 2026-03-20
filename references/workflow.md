# Web Image Scraper Workflow Notes

## Best source order

1. Official site detail page
2. Official gallery/menu page
3. Search result detail page
4. Review/listing page image gallery

## Practical sequence

1. Prefer the official site when identifiable.
2. If the landing page is sparse, look for Gallery / Photos / Menu / Dishes.
3. If the site uses cards/modals, click through to the detail page before extracting.
4. If the page lazy-loads, scroll, wait, and extract again.
5. Compare top candidates and keep only a small shortlist.

## Useful agent-browser commands

```bash
agent-browser open "<url>"
agent-browser wait --load networkidle
agent-browser snapshot -i --json
agent-browser click @e2
agent-browser get html body --json
agent-browser get url --json
agent-browser scroll down 1200
agent-browser screenshot --full /tmp/page.png
```

## Notes

- Prefer detail pages over search result pages; result pages often contain thumbnails only.
- If many thumbnails dominate, click into a gallery modal or dedicated photos page first.
- Screenshot only when you need visual confirmation; HTML extraction is cheaper.
