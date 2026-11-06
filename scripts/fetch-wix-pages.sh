#!/bin/bash
# Downloads every Cardiac MRI Hub post page and its images from Wix into one folder,
# using only curl. Run on any Mac or Linux computer with internet access:
#   bash scripts/fetch-wix-pages.sh ~/Desktop/wix-export
# Then, on the computer that has this project:
#   python3 scripts/import_wix.py --html-dir ~/Desktop/wix-export
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-wix-export}"
SITE="https://cardiacmrihub.wixsite.com/cardiac-mri-hub"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
mkdir -p "$OUT/images"

slugs=$(grep -o '"wix": *"[^"]*"' "$HERE/content/import/wix-posts.json" | sed 's/.*"wix": *"\([^"]*\)"/\1/')
n=0; fail=0
for s in $slugs; do
  if curl -fsSL -A "$UA" --max-time 40 -o "$OUT/$s.html" "$SITE/post/$s"; then
    n=$((n+1)); echo "page  ok   $s"
  else
    fail=$((fail+1)); rm -f "$OUT/$s.html"; echo "page  FAIL $s"
  fi
done

ids=$(cat "$OUT"/*.html 2>/dev/null | grep -oE '[0-9a-f]{6}_[0-9a-f]{32}~mv2\.(png|jpg|jpeg|gif|webp)' | sort -u)
m=0
for id in $ids; do
  [ -s "$OUT/images/$id" ] && { m=$((m+1)); continue; }
  if curl -fsSL -A "$UA" --max-time 60 -o "$OUT/images/$id" "https://static.wixstatic.com/media/$id"; then
    m=$((m+1))
  else
    rm -f "$OUT/images/$id"; echo "image FAIL $id"
  fi
done
echo "Saved $n page(s) ($fail failed) and $m image(s) to $OUT"
