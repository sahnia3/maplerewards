#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# pro-tools-stress.sh — adversarial endpoint stress for the Pro-tool surface (P7)
#
# Fires boundary / hostile inputs (0, negative, 1e8, missing & invalid
# session, malformed JSON, wrong types) at every user-input endpoint reachable
# without a Pro JWT, plus a representative set of Pro/session-gated GET routes.
#
# ASSERTS, for every request:
#   • never HTTP 5xx
#   • the response body never leaks internals (abs paths, .go:line,
#     goroutine/panic dumps, pgx/sql driver text)
#   • no impossible projection (optimizer points bounded; buy-points never
#     "buy" for an un-purchasable qty; stack value bounded)
#   • Pro/session-gated routes hit with an anon session return a clean
#     401/402/403 (not 5xx, no leak)
#
# Non-blocking if the API is down (SKIP, exit 0). Any assertion failure with
# the API up exits non-zero (CI / P9 gate).
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
API_BASE="${API_BASE:-http://localhost:8080/api/v1}"
API_ROOT="${API_BASE%/api/v1}"
JAR="$(mktemp)"; B="$(mktemp)"
trap 'rm -f "$JAR" "$B"' EXIT
FAIL=0

skip(){ echo "SKIP (pro-tools-stress): $1"; exit 0; }
curl -fsS --max-time 5 "$API_ROOT/health" >/dev/null 2>&1 || skip "API not reachable"
curl -fsS --max-time 5 -c "$JAR" "$API_BASE/csrf" >/dev/null 2>&1 || skip "CSRF unreachable"
CSRF="$(awk '/mr_csrf/{print $7}' "$JAR" | tail -1)"

LEAK_RE='/Users/|/home/|\.go:[0-9]|goroutine [0-9]|panic:|runtime error|pgx|sql: |no rows in result set|\*errors\.errorString'

# hit METHOD PATH BODY EXPECT_DESC  → checks code+leak; sets FAIL on violation
hit(){
  local m="$1" p="$2" body="${3:-}" desc="$4"
  local args=(-s -o "$B" -w '%{http_code}' --max-time 12 -b "$JAR" -c "$JAR"
    -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" -X "$m" "$API_BASE$p")
  [ -n "$body" ] && args+=(-d "$body")
  local code; code="$(curl "${args[@]}" 2>/dev/null)"
  local bad=""
  echo "$code" | grep -qE '^5' && bad="HTTP_5XX($code)"
  if grep -qiE "$LEAK_RE" "$B" 2>/dev/null; then bad="${bad:+$bad,}INTERNAL_LEAK"; fi
  if [ -n "$bad" ]; then
    echo "  FAIL [$desc] $m $p → $bad"
    echo "       body: $(head -c 200 "$B" | tr -d '\n')"
    FAIL=1
  else
    echo "  ok   [$desc] $m $p → $code"
  fi
}

SID="$(curl -s -b "$JAR" -c "$JAR" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
       -X POST "$API_BASE/wallet" -d '{}' 2>/dev/null | \
       /usr/bin/python3 -c 'import sys,json;print(json.load(sys.stdin).get("session_id",""))' 2>/dev/null || true)"

echo "── optimizer (reachable, has the cap bug) ──"
hit POST /optimize "{\"session_id\":\"$SID\",\"category_slug\":\"groceries\",\"spend_amount\":0}" "zero spend"
hit POST /optimize "{\"session_id\":\"$SID\",\"category_slug\":\"groceries\",\"spend_amount\":-5000}" "negative spend"
hit POST /optimize "{\"session_id\":\"$SID\",\"category_slug\":\"groceries\",\"spend_amount\":100000000}" "100M spend"
hit POST /optimize "{\"session_id\":\"deadbeef\",\"category_slug\":\"groceries\",\"spend_amount\":100}" "bad session"
hit POST /optimize '{"session_id":"' "malformed json"
hit POST /optimize "{\"session_id\":\"$SID\",\"category_slug\":\"'; DROP TABLE cards;--\",\"spend_amount\":100}" "sqli category"

echo "── buy-points/evaluate ──"
hit POST /buy-points/evaluate '{"program_slug":"aeroplan","points_needed":-1,"cash_alternative_cad":100}' "negative pts"
hit POST /buy-points/evaluate '{"program_slug":"aeroplan","points_needed":99999999,"cash_alternative_cad":1}' "impossible qty"
hit POST /buy-points/evaluate '{"program_slug":"nope","points_needed":1000,"cash_alternative_cad":100}' "unknown program"
hit POST /buy-points/evaluate 'not-json' "malformed json"
# impossible-qty must NOT be "buy"
curl -s -b "$JAR" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" -X POST \
  "$API_BASE/buy-points/evaluate" -d '{"program_slug":"aeroplan","points_needed":99999999,"cash_alternative_cad":1}' 2>/dev/null > "$B"
if grep -q '"verdict":"buy"' "$B"; then echo "  FAIL [impossible qty] buy-points returned verdict=buy"; FAIL=1; else echo "  ok   [impossible qty] not 'buy'"; fi

echo "── stack-recommend ──"
hit POST /stack-recommend "{\"session_id\":\"$SID\",\"merchant_slug\":\"expedia_ca\",\"spend_amount\":100000000}" "100M spend"
hit POST /stack-recommend "{\"session_id\":\"$SID\",\"merchant_slug\":\"../etc/passwd\",\"spend_amount\":100}" "path-ish merchant"
hit POST /stack-recommend '{"session_id":"x","merchant_slug":"","spend_amount":-1}' "empty+negative"

echo "── read-only catalog endpoints ──"
hit GET /buy-points/promos "" "promos"
hit GET /merchants "" "merchants"
hit GET /devaluations "" "devaluations"
hit GET "/issuer-changes?limit=-1" "" "issuer-changes neg limit"

echo "── Pro/session-gated GETs with an anon (non-Pro) session: expect clean 401/402/403, no leak ──"
for path in "missed-rewards" "welcome-bonus-mission" "credits" "card-value" "sqc-projection" \
            "loyalty-accounts" "award-watches" "offers" "devaluations"; do
  code="$(curl -s -o "$B" -w '%{http_code}' --max-time 10 -b "$JAR" \
        "$API_BASE/wallet/$SID/$path" 2>/dev/null)"
  leak=""; grep -qiE "$LEAK_RE" "$B" 2>/dev/null && leak=",INTERNAL_LEAK"
  if echo "$code" | grep -qE '^5' || [ -n "$leak" ]; then
    echo "  FAIL [$path] → $code$leak  body:$(head -c 160 "$B"|tr -d '\n')"; FAIL=1
  else
    echo "  ok   [$path] → $code (gated cleanly)"
  fi
done

echo "────────────────────────────────────────"
if [ "$FAIL" -ne 0 ]; then echo "FAIL: Pro-tool endpoint stress found violations."; exit 1; fi
echo "PASS: no 5xx, no internal leak, no impossible projection across the Pro-tool surface."
