#!/usr/bin/env bash
set -euo pipefail

if [[ ${1:-} == "" || ${1:-} == "-h" || ${1:-} == "--help" ]]; then
  cat <<'EOF'
Usage: scrape_page_images.sh <url> [limit]

Open a page with agent-browser, wait for network idle, dump rendered HTML,
and extract ranked image candidates as JSON.
EOF
  exit 0
fi

URL="$1"
LIMIT="${2:-20}"
WORKDIR="${TMPDIR:-/tmp}/web-image-scraper-$$"
mkdir -p "$WORKDIR"
HTML_JSON="$WORKDIR/page.json"
OUT_JSON="$WORKDIR/candidates.json"
TITLE_JSON="$WORKDIR/title.json"
FINAL_URL_JSON="$WORKDIR/final-url.json"

AB_ARGS=(--args '--no-sandbox')
agent-browser "${AB_ARGS[@]}" open "$URL" >/dev/null
agent-browser "${AB_ARGS[@]}" wait --load networkidle >/dev/null || agent-browser "${AB_ARGS[@]}" wait 3000 >/dev/null
agent-browser "${AB_ARGS[@]}" get html body --json > "$HTML_JSON"
agent-browser "${AB_ARGS[@]}" get title --json > "$TITLE_JSON" || true
agent-browser "${AB_ARGS[@]}" get url --json > "$FINAL_URL_JSON" || true

PAGE_TITLE="$(node -e 'const fs=require("fs");try{const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write((j.data&&(j.data.title||j.data.value))||"")}catch{}' "$TITLE_JSON")"
PAGE_URL="$(node -e 'const fs=require("fs");try{const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write((j.data&&(j.data.url||j.data.value))||"")}catch{}' "$FINAL_URL_JSON")"

node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write((j.data && (j.data.value || j.data.html)) || "");' "$HTML_JSON" \
  | node "$(dirname "$0")/extract_image_candidates.mjs" --base-url "$URL" --page-url "${PAGE_URL:-$URL}" --page-title "$PAGE_TITLE" --limit "$LIMIT" \
  > "$OUT_JSON"

cat "$OUT_JSON"
