#!/usr/bin/env bash
set -euo pipefail

if [[ ${1:-} == "" || ${1:-} == "-h" || ${1:-} == "--help" ]]; then
  cat <<'EOF'
Usage: search_then_open_detail.sh <query> [site-domain]

Search with DuckDuckGo, score likely detail-page links, open the best match in
agent-browser, then print the selection JSON.
EOF
  exit 0
fi

QUERY="$1"
SITE="${2:-}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [[ -n "$SITE" ]]; then
  node "$SCRIPT_DIR/search_then_open_detail.mjs" --query "$QUERY" --site "$SITE"
else
  node "$SCRIPT_DIR/search_then_open_detail.mjs" --query "$QUERY"
fi
