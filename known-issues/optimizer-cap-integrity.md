# Optimizer / buy-points / stack unbounded projection (cap-integrity)

## Symptoms — what fails
- `/optimizer` projected Scotiabank Gold Amex at a flat 5x for $100,000 spend
  (500,000 pts), ignoring its real $50k/yr accelerated cap — a
  credibility-destroying number a founder hit in QA.
- Same class on two siblings: `buy_points.go` would return a confident "buy"
  for an un-purchasable quantity (e.g. 2,000,000 pts); `stack.go` projected
  an impossible credit (e.g. $20,000 off $100k for a "20% back" offer).

## Root Cause — why
Not broken math — **missing cap data**. 181 bonus multipliers across 72/104
cards had no `cap_amount` and no `cap_group`, so the optimizer extrapolated
accelerated earn with no ceiling. `buy_promo_pricing` had no per-program
annual purchase ceiling; `network_offers` had no per-offer max-credit. A
secondary code bug: `scoreCard` accumulated cap spend with
`GetMonthlySpend` even for `annual` caps (should be year-to-date).

## Fix — how it was resolved
- **Conservative guardrails shipped first** (commits `08aa4d9`/`9c3bd81`):
  $20k/yr optimizer cap, 200k/yr buy ceiling, $50 offer credit — err low,
  disclosed as estimates.
- **Verified data** (gated remediation): migration `000048_cap_remediation`
  (8 source-cited shared cap_groups incl. Scotia Gold $50k/yr + 15
  per-multiplier caps) and `000049_purchase_offer_ceilings` (real per-program
  buy ceilings + per-offer max-credit). Values + `source_url` per row in
  `docs/cap-remediation-checklist.md`.
- **Code**: `buy_points.go`/`stack.go` consume the verified ceilings
  (guardrail = documented fallback); period-aware accumulation via
  `GetSpendSince` + `capPeriodStart` in `scoreCard`.
- **Verification**: table-driven cap-invariant matrix
  (`internal/service/optimizer_cap_invariant_test.go`), buy-points/stack
  verified-ceiling tests, headless `scripts/optimizer-cap-sweep.sh`, Pro-tool
  endpoint stress (`scripts/pro-tools-stress.sh`), link integrity
  (`scripts/check-source-links.sh`), Playwright E2E
  (`frontend/e2e/pro-tools.spec.ts`). SQC tier-ordering hardened;
  missed-rewards cap-bounded. Full `-race` suite + migration round-trip green.
- Founder scenario now: Scotia Gold @ $100k → 300,000 pts
  ("$50000 at 5.0x + $50000 at 1.0x"), `is_cap_hit=true`.

## Gotcha — environment
The repo's app + `migrate` use the **host Postgres** (`localhost:5432`,
`schema_migrations`=49). A stale Docker container
(`maplerewards-main-postgres-1`) is a *separate* DB — querying it via
`docker exec psql` shows wrong/old data. Always verify via
`psql "$DATABASE_URL"`.

`make migrate-down` rolls *all* migrations and refuses non-interactively —
use `migrate -path ./migrations -database "$DATABASE_URL" down 1`. Migration
files must NOT contain inline `BEGIN;/COMMIT;` (golang-migrate wraps each in
its own txn; an inline one double-applied cap_groups). Follow the
fixed-UUID `INSERT … SELECT` pattern, not data-modifying CTEs.

## Date — when
2026-05-18 (remediation complete; audit `docs/OPTIMIZER-CAP-AUDIT.md`
status → REMEDIATED).
