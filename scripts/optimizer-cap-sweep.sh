#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# optimizer-cap-sweep.sh — headless end-to-end cap-invariant sweep (P5)
#
# Drives the LIVE /api/v1/optimize endpoint with a spend matrix on a
# known-capped card (Scotiabank Gold American Express, $50k/yr shared cap) and
# asserts projected points never exceed cap×bonus + max(0,spend−cap)×fallback —
# i.e. the founder bug ($100k → 500,000 pts) can never recur.
#
# Non-blocking: if the API/session flow is unavailable it prints SKIP and
# exits 0 (the authoritative proof is optimizer_cap_invariant_test.go). When
# the API is up, an invariant violation exits non-zero (CI / P9 gate).
#
# Usage:  API_BASE=http://localhost:8080/api/v1 ./scripts/optimizer-cap-sweep.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

API_BASE="${API_BASE:-http://localhost:8080/api/v1}"
API_ROOT="${API_BASE%/api/v1}"
PY="$(command -v python3 || echo /opt/homebrew/bin/python3.12)"
JAR="$(mktemp)"; RESP="$(mktemp)"
trap 'rm -f "$JAR" "$RESP"' EXIT

skip() { echo "SKIP (optimizer-cap-sweep): $1 — relying on Go invariant suite."; exit 0; }

curl -fsS --max-time 5 "$API_ROOT/health" >/dev/null 2>&1 || skip "API not reachable"
curl -fsS --max-time 5 -c "$JAR" "$API_BASE/csrf" >/dev/null 2>&1 || skip "CSRF issuer unreachable"
CSRF="$(awk '/mr_csrf/{print $7}' "$JAR" | tail -1)"
[ -n "$CSRF" ] || skip "no CSRF cookie"

req() { # METHOD PATH [BODY] -> writes body to $RESP, echoes http code
  local args=(-s -o "$RESP" -w '%{http_code}' --max-time 12 -b "$JAR" -c "$JAR"
    -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF"
    -X "$1" "$API_BASE$2")
  [ -n "${3:-}" ] && args+=(-d "$3")
  curl "${args[@]}" 2>/dev/null
}

WC="$(req POST /wallet '{}')"
[ "$WC" = "200" ] || [ "$WC" = "201" ] || skip "wallet create http $WC"
SID="$("$PY" -c 'import json,sys;print(json.load(open(sys.argv[1])).get("session_id",""))' "$RESP")"
[ -n "$SID" ] || skip "no session_id"

CARD_ID="$(curl -fsS --max-time 8 "$API_BASE/cards" 2>/dev/null | "$PY" -c '
import sys,json
d=json.load(sys.stdin); rows=d if isinstance(d,list) else d.get("data") or []
print(next((c["id"] for c in rows if c.get("name")=="Scotiabank Gold American Express"),""))')"
[ -n "$CARD_ID" ] || skip "Scotia Gold not in catalog"

AC="$(req POST "/wallet/$SID/cards" "{\"card_id\":\"$CARD_ID\"}")"
[ "$AC" = "200" ] || [ "$AC" = "204" ] || [ "$AC" = "201" ] || skip "add-card http $AC"

FAIL=0
for SPEND in 1000 25000 49999 50000 50001 100000 250000 1000000; do
  CODE="$(req POST /optimize "{\"session_id\":\"$SID\",\"category_slug\":\"groceries\",\"spend_amount\":$SPEND}")"
  if [ "$CODE" != "200" ]; then echo "  spend $SPEND: http $CODE"; FAIL=1; continue; fi
  OUT="$("$PY" - "$RESP" "$SPEND" <<'PYEOF'
import json,sys
resp,spend=sys.argv[1],float(sys.argv[2])
cap,bonus,fb=50000.0,5.0,1.0
bound = spend*bonus if spend<=cap else cap*bonus+(spend-cap)*fb
d=json.load(open(resp)); recs=d if isinstance(d,list) else d.get("data") or []
r=next((x for x in recs if x.get("card_name")=="Scotiabank Gold American Express"),None)
if r is None:
    print(f"OK spend={spend:.0f} (not ranked — bounded by definition)"); sys.exit()
pts=float(r.get("points_earned",0) or 0); hit=r.get("is_cap_hit")
ok = pts <= bound+0.5 and (hit is True or spend<=cap)
print(("OK" if ok else "VIOLATION")+f" spend={spend:.0f} pts={pts:.0f} bound={bound:.0f} capHit={hit}")
PYEOF
)"
  echo "  $OUT"
  case "$OUT" in VIOLATION*|"") FAIL=1;; esac
done

[ "$FAIL" -eq 0 ] || { echo "FAIL: optimizer cap invariant violated end-to-end."; exit 1; }
echo "PASS: optimizer cap invariant holds across the spend matrix."
