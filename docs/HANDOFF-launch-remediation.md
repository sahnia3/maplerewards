# HANDOFF — launch-remediation milestone

**Branch:** `launch-remediation` (off `main`, NOT pushed). **Plan:**
`~/.claude/plans/image-1-image-2-okay-calm-puddle.md` (anchored to
`docs/LAUNCH-ISSUES.md`). **Decisions locked:** wire live data later/honest
now → superseded by "wire fully live"; Applications→eligibility advisor;
trust-first sequencing; AI name = "Maple"; security audit = P0 in this
milestone; cap-only commit infeasible (work intermixed) → whole-tree baseline.

## Commits so far
- `79aa2bf` — Phase 0 baseline: verified cap-remediation (migrations
  000048/000049, period-aware accumulation, cap tests/scripts) **+** bundled
  unreviewed cloud-session work (P0.2/security/feature). Cap layer clean-verified
  (migrate v47→49 round-trip, build/vet/`test -race`, optimizer-cap-sweep PASS:
  Scotia Gold $100k→300,000). New migrations start at **000050**.
- `4a8f3b7` — **P0.2 DONE & verified**: synchronous wallet cache invalidation,
  nil-user guards, negative/empty-body balance validation, `wallet_test.go`
  (3 tests, `-race` green). Google path verified already-correct (no change).

## Security audit status (docs/SECURITY-BUG-AUDIT-2026-05-18.md) — verified at HEAD
| # | Issue | Status |
|---|---|---|
| P0-1 | refresh-token reuse-detection | **FIXED** (repo/auth.go:242-258, service/auth.go:219-226) — repo SQL only mock-tested |
| P0-2 | free Pro via promo/unpaid | **FIXED** (billing.go:342-349/370-378 fail-closed); residual: plan from metadata not Stripe line-items |
| P0-3 | optimizer unbounded projection | **FIXED** (cap-remediation; optimizer.go:262-300 unconditional guardrail) |
| P0-4 | live secrets in plaintext `.env` | **EXTERNAL — USER ACTION**: rotate `ANTHROPIC_API_KEY`+`APIFY_TOKEN`, move to secret manager, set Anthropic spend cap. Cannot be done in code. |
| P0-5 | security perimeter untested | **PARTIAL** — auth/billing tests added; STILL ZERO: CSRF, IDOR (RequireSessionOwner/requireBodySessionOwner), RequirePro, ADMIN_EMAILS, per-user UserRateLimiter, Stripe HMAC/skew/replay; repo-layer integration (P0-1 SQL); no CI coverage floor |

No regressions from the cloud changes; several bonus P1/P2 fixes also landed.

## Phase 1 — remaining (next session, in order)
1. **P0-5 security tests** (highest residual security risk): add tests for
   Stripe `verifyStripeSignature` HMAC+5min skew+replay; `middleware/csrf.go`
   double-submit; `middleware/ownership.go` IDOR; `RequirePro`; `ADMIN_EMAILS`
   fail-closed; per-user `UserRateLimiter`; ephemeral-Postgres integration test
   for the P0-1 query (`repo/auth.go:242`); add a CI coverage floor.
2. **P0.3 valuation units (120¢/pt)**: audit `loyalty_programs.base_cpp` seed
   vs `internal/service/recommender.go` (`cpp/100` at ~126/129/156) and
   `frontend/app/loyalty/page.tsx:361`. Pick canonical cents-per-point; fix
   data (**migration 000050_valuation_units_fix**) + any ×100 double-scale.
3. **P0.4 portfolio $0**: likely downstream of P0.3 (+ now-fixed P0.2). Verify
   `frontend/app/portfolio/page.tsx:175-185` + WalletSummary builder reads real
   balances×corrected CPP **after** P0.3 lands; only add code if independent gap.
4. **P0.5 promo pipeline**: `internal/service/promo_sentinel.go`
   (`RunSweep:72`, `validatePromo:271`, `credibleSource:312`, `parsePromoDate:338`)
   + `feed_aggregator.go`. Fix pipeline: dedupe, expiry-parse (no "ONGOING" on
   expired), HEAD/GET link-validate at scrape + worker recheck, **geo-filter to
   Canada**. Backfill/clean rows in **migration 000051**. Gate:
   `scripts/check-source-links.sh STRICT=1`.
5. **P0.6 error JSON + rate limit**: route all caught errors through
   `frontend/lib/api.ts errorFromResponse` + `components/error-boundary.tsx`
   (pages bypassing it: feed, promos, pro-tools, tools — no raw
   `{"code":...}`). Re-tune per-user limit so ordinary navigation never trips
   (`internal/middleware/ratelimit.go`; clientIP port-strip already fixed).
6. **RecordSpend edge bug (Medium)**: `repo/spend.go` ON CONFLICT arbiter
   (~:117) vs fallback SELECT (~:126-132) omits `category_id` → same
   amount/date/note under 2 categories silently deduped (lost spend). Verify
   vs the migration's unique index; align.

## Phases 2–5 — not started
2: homepage de-dup/redesign (`frontend/app/page.tsx` — delete FintechCommand
466-496 + duplicate BriefCards 507-540 + fake "Award price"/"Bonus runway"
533-540/515-532 + "Rewards desk" kicker 340-346; one framer-motion hero;
rename "Recoverable"); "Maple" rename (sidebar/bottom-nav/chat-fab + ai.go) +
`remark-gfm` + chat overflow clamp; honest Trip Planner `SourceBadge`.
3: P1 billing (Lifetime no-cancel; before-you-go; post-cancel; one win-back).
4: Applications→advisor; tools rationalization; India/arbitrage removal; P2
fixes; P4 stack suggester (reuse `OptimizerService.GetBestCard`) + expiry
alerts. 5: full QA gate.

## Verify / test commands
- `set -a; . ./.env; set +a`
- DB round-trip: `migrate -path ./migrations -database "$DATABASE_URL" down 1` (×2 to 47) then `up`
- `go build ./... && go vet ./... && go test -count=1 -race ./...`
- `bash scripts/optimizer-cap-sweep.sh` (must stay PASS — cap regression gate)
- `bash scripts/check-source-links.sh` (`STRICT=1` for P0.5 gate)
- frontend: `cd frontend && npm run lint && npx tsc --noEmit && npm test && npm run build && npx playwright test`
- API on :8080, frontend :3000, host Postgres (NOT the stale docker container) — see `known-issues/optimizer-cap-integrity.md`.

## Caveats
- Foundation commit bundles ~30 unreviewed cloud files; review file-by-file as
  each P0 area is touched (security reviewer's table above is the map).
- Heavy design binaries (mockups/*.png, testing/assets, *.pdf) intentionally
  left untracked.
- `docs/CAP-REMEDIATION-ULTRAPLAN.md` premise ("Scotia Gold has no cap") is
  factually WRONG — disregard; $50K/yr cap is verified (scotiabank.com,
  Rewards Canada, NerdWallet).
