#!/usr/bin/env bash
# Flush the MapleRewards caches that depend on card / multiplier / valuation
# data, so corrected card data shows IMMEDIATELY after a deploy + migrations
# (multipliers cache 24h, valuations 1h, wallet 30m otherwise).
#
# Safe: every key here is a CACHE — rebuilt on the next request. This does NOT
# touch sessions, auth, CSRF, or quota counters.
#
# Usage:
#   scripts/flush-prod-cache.sh "<redis-url>"
#   REDIS_URL=redis://... scripts/flush-prod-cache.sh
#   railway run --service Redis bash -c 'REDIS_URL=$REDIS_URL scripts/flush-prod-cache.sh'
set -euo pipefail

REDIS_URL="${1:-${REDIS_URL:-}}"
if [ -z "$REDIS_URL" ]; then
  echo "usage: $0 <redis-url>   (or set REDIS_URL)" >&2
  exit 1
fi

PATTERNS=("multipliers:card:*" "valuation:*" "wallet:*")
for pat in "${PATTERNS[@]}"; do
  keys=$(redis-cli -u "$REDIS_URL" --scan --pattern "$pat" || true)
  n=$(printf '%s\n' "$keys" | grep -c . || true)
  if [ "${n:-0}" -gt 0 ]; then
    printf '%s\n' "$keys" | xargs -r redis-cli -u "$REDIS_URL" del >/dev/null
  fi
  echo "flushed ${pat} (${n:-0} keys)"
done
echo "cache flush complete."
