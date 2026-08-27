#!/usr/bin/env bash
# Regenerate Standard GRC API types from the vendor's published OpenAPI spec.
#
# The output is COMMITTED deliberately. Two reasons:
#   1. the build must not depend on the vendor's endpoint being reachable —
#      that endpoint returned 403 for hours on 2026-08-26;
#   2. a vendor-side shape change then arrives as a reviewable diff in a pull
#      request instead of silently altering what our code compiles against.
#
# Never hand-edit the generated file. Re-run this instead.
set -euo pipefail

SPEC_URL="${SPEC_URL:-https://standard-api.bekaa.eu/docs/openapi.json}"
OUT="src/lib/standard-api/generated/schema.d.ts"

mkdir -p "$(dirname "$OUT")"

echo "Fetching $SPEC_URL"
TMP=$(mktemp)
curl -fsS --max-time 60 "$SPEC_URL" -o "$TMP"

# Fail loudly on a spec that is obviously wrong rather than generating from it.
PATHS=$(python3 -c "import json,sys; print(len(json.load(open('$TMP')).get('paths',{})))")
echo "spec reports $PATHS paths"
if [ "$PATHS" -lt 100 ]; then
  echo "ERROR: spec has only $PATHS paths. The published spec was 51 paths and badly" >&2
  echo "incomplete until 2026-08-26; a low count means we fetched a stale or wrong" >&2
  echo "document. Refusing to regenerate from it." >&2
  exit 1
fi

npx openapi-typescript "$TMP" -o "$OUT"
rm -f "$TMP"

echo "Wrote $OUT"
echo "Review the diff before committing — a change here is a change in what the"
echo "vendor says it returns."
