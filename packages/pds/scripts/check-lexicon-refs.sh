#!/bin/bash
#
# Check for missing lexicon references
# This script scans all lexicon JSON files and reports any external refs
# that don't have corresponding lexicon files.
#

set -e

LEXICONS_DIR="$(cd "$(dirname "$0")/../src/lexicons" && pwd)"

echo "Checking lexicon references in: $LEXICONS_DIR"
echo ""

# Extract all external refs (those with a namespace, not just #fragment)
# Format: "app.bsky.foo.bar#baz" -> we need "app.bsky.foo.bar"
refs=$(grep -roh '"ref": "[^#"]*#[^"]*"' "$LEXICONS_DIR"/*.json 2>/dev/null | \
  grep -v '^"ref": "#' | \
  sed 's/"ref": "\([^#]*\)#.*/\1/' | \
  sort -u)

missing=()

for ref in $refs; do
  file="$LEXICONS_DIR/${ref}.json"
  if [ ! -f "$file" ]; then
    missing+=("$ref")
  fi
done

if [ ${#missing[@]} -eq 0 ]; then
  echo "✓ All lexicon references are satisfied!"
  echo ""
  exit 0
else
  echo "✗ Missing lexicon files for the following refs:"
  echo ""
  for ref in "${missing[@]}"; do
    echo "  - $ref"
  done
  echo ""
  echo "Add these to scripts/update-lexicons.sh and run it to fetch them."
  exit 1
fi
