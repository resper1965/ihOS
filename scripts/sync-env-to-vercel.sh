#!/usr/bin/env bash
# sync-env-to-vercel.sh
# Syncs all env vars from .env.local to Vercel production
set -euo pipefail

ENV_FILE=".env.local"
ENVIRONMENTS="production preview development"

echo "🔄 Syncing environment variables to Vercel..."

while IFS= read -r line; do
  # Skip blank lines and comments
  [[ -z "$line" || "$line" == \#* ]] && continue

  # Split on first '='
  key="${line%%=*}"
  value="${line#*=}"

  [[ -z "$key" || -z "$value" ]] && continue

  echo "  → Setting $key..."

  for env in $ENVIRONMENTS; do
    # Remove existing (ignore error if not exists)
    npx vercel env rm "$key" "$env" --yes 2>/dev/null || true
    # Add new value
    printf '%s' "$value" | npx vercel env add "$key" "$env" 2>&1 | grep -v "^$" || true
  done

done < "$ENV_FILE"

echo ""
echo "✅ Done! Triggering a new production deploy to apply env vars..."
npx vercel --prod
