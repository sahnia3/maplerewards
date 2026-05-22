#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# check-source-links.sh — source_url / affiliate link-integrity sweep (P7)
#
# Aggregates every distinct external http(s) URL the app surfaces to users
# (buy_promo_pricing, network_offers, cards.affiliate_url + welcome-bonus
# source, devaluation_events, portal_rates, transfer_bonus_events,
# issuer_pages, merchants) and probes each. Dead links are REPORTED, never
# auto-deleted (data integrity is a human decision).
#
# Exit 0 by default (informational — external link rot must not block the
# build). Set STRICT=1 to exit non-zero ONLY on genuinely-dead links
# (404/410/5xx, or 000 from a non-allowlisted host). Anti-bot responses
# (401/403/429, or 000 from a known Akamai-walled host) are classified
# separately and never fail STRICT — the page is live, only the checker
# UA is blocked. Use STRICT in a dedicated, non-blocking CI job.
#
# Usage:  ./scripts/check-source-links.sh            # report only
#         STRICT=1 ./scripts/check-source-links.sh   # fail on dead links
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env 2>/dev/null; set +a
: "${DATABASE_URL:?DATABASE_URL not set}"
STRICT="${STRICT:-0}"
URLS="$(mktemp)"; trap 'rm -f "$URLS"' EXIT

psql "$DATABASE_URL" -t -A <<'SQL' | grep -E '^https?://' | sort -u > "$URLS"
SELECT source_url FROM buy_promo_pricing WHERE source_url ~ '^https?://'
UNION SELECT source_url FROM network_offers WHERE source_url ~ '^https?://'
UNION SELECT affiliate_url FROM cards WHERE affiliate_url ~ '^https?://'
UNION SELECT welcome_bonus_offer_source FROM cards WHERE welcome_bonus_offer_source ~ '^https?://'
UNION SELECT source_url FROM devaluation_events WHERE source_url ~ '^https?://'
UNION SELECT source_url FROM portal_rates WHERE source_url ~ '^https?://'
UNION SELECT source_url FROM transfer_bonus_events WHERE source_url ~ '^https?://' AND source_dead_at IS NULL
UNION SELECT url FROM issuer_pages WHERE url ~ '^https?://'
UNION SELECT primary_url FROM merchants WHERE primary_url ~ '^https?://';
SQL

TOTAL=$(wc -l < "$URLS" | tr -d ' ')
echo "Probing $TOTAL distinct source/affiliate URLs…"
DEAD=0; LIVE=0; ANTIBOT=0
# Hosts verified-live during the link audit but which hard-reset the TLS
# connection (curl reports 000) for every non-browser client behind an
# Akamai/Imperva bot-wall — confirmed this audit that even a full Chrome
# UA gets 000. A 000 from these is anti-bot, not link rot, so it is not a
# STRICT failure. Keep this list tight; re-verify in a real browser before
# adding a host.
ANTIBOT_000_HOSTS=' www.bmo.com bmo.com www.thebay.com thebay.com '
while IFS= read -r url; do
  [ -z "$url" ] && continue
  host=$(printf '%s' "$url" | awk -F/ '{print $3}')
  # HEAD first; many sites 405/403 HEAD → retry GET (range-limited).
  code=$(curl -s -o /dev/null -A 'Mozilla/5.0 MapleRewardsLinkCheck' \
        -m 15 -L -w '%{http_code}' -I "$url" 2>/dev/null || echo 000)
  if ! echo "$code" | grep -qE '^(2|3)'; then
    code=$(curl -s -o /dev/null -A 'Mozilla/5.0 MapleRewardsLinkCheck' \
          -m 20 -L -r 0-0 -w '%{http_code}' "$url" 2>/dev/null || echo 000)
  fi
  if echo "$code" | grep -qE '^(2|3)'; then
    LIVE=$((LIVE+1))
  elif echo "$code" | grep -qE '^(401|403|429)$'; then
    # Anti-bot challenge (Cloudflare/Akamai/PerimeterX). The page is live
    # for real browsers; only the checker UA is being blocked. Acceptable.
    ANTIBOT=$((ANTIBOT+1))
    echo "  ANTIBOT [$code]  $url"
  elif echo "$code" | grep -qE '^0+$' && echo "$ANTIBOT_000_HOSTS" | grep -q " $host "; then
    # curl concatenates per-hop status when -L follows redirects, so a
    # connection-reset bot-wall yields 000 or 000000 — match any 0-run.
    ANTIBOT=$((ANTIBOT+1))
    echo "  ANTIBOT [$code reset]  $url"
  else
    DEAD=$((DEAD+1))
    echo "  DEAD [$code]  $url"
  fi
done < "$URLS"

echo "────────────────────────────────────────"
echo "Live: $LIVE   Anti-bot: $ANTIBOT   Dead: $DEAD   Total: $TOTAL"
echo "(anti-bot = live page behind a bot-wall; acceptable, not link rot)"
if [ "$DEAD" -gt 0 ] && [ "$STRICT" = "1" ]; then
  echo "STRICT mode: failing on $DEAD genuinely-dead link(s)."
  exit 1
fi
echo "(informational — dead links are reported, not deleted)"
exit 0
