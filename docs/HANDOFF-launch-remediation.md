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
- `a025514` — **P0.3 + P0.4 DONE**: P0.3 (120¢/pt) verified NOT a bug
  (data/API correct, NUMERIC(6,4), API serves 1.20) — defensive Avg-CPP
  clamp at frontend/app/page.tsx. P0.4 ($0–$0) root-caused to
  card_value_components covering only 6/104 cards; repo/card_value.go now
  adds a computed baseline earn component (multiplier×CPP over $24k std
  spend) for uncovered cards (Aeroplan $480 etc.) + nil-user guard.
- `bc2b396` — **RecordSpend dedup fixed**: migration 000050 widens
  idx_spend_entries_dedup to include category_id; both ON CONFLICT + fallback
  SELECTs aligned (RecordSpend & CreateSpendEntry). Round-trip + `-race` green.
  **Next new migration starts at 000051.**

## PROGRESS (commits on launch-remediation, ahead of main)
- **Phase 0 ✓** baseline. **Phase 1 ✓** (P0.2 cache, P0.3 clamp, P0.4 baseline, dedup mig 000050, P0.5 link+geo, P0.6 ratelimit, P0-5 45 sec-tests, CI floor). **Phase 2 ✓** (2A homepage redesign — e2e green; 2B Maple+remark-gfm; 2C verified). **Phase 3 ✓** P1 billing — VERIFIED ALREADY DONE by bundle (19 billing tests pass, one-click cancel + CASL one-shot + Lifetime state confirmed; no code). **P3.1 ✓** Applications→eligibility advisor (api.ts getCardEligibility + page verdict).
- **Recurring pattern:** the cloud bundle pre-implemented much of LAUNCH-ISSUES; verify-don't-reimplement. DONE-by-bundle: P0-1/2/3, P0.3, P0.6, 2C, all Phase 3, P3.4 Loblaws, P3.2 tools (clean), Forensics P2.7, India ~gone.

## MILESTONE STATUS: Phase 0–5 ALL ✓ COMPLETE. 21 commits ahead of `main` on `launch-remediation`, full gate green, NOT pushed (awaiting user). Outstanding USER-ACTION only: P0-4 secret rotation (external) + supply live keys (SEATSAERO/APIFY/RESEND/VAPID) for the key-ready live-data paths.

## Phase 4 — status
- **P2.8 ✓** Save-the-Itinerary: was NOT a no-op (audit imprecise) — already persists via createAwardWatch. Fixed the real bug: false "Saved" on failure → saving/Watching✓/Retry honest states (commit bc… range).
- **P4.2 ✓** offer-expiry notifications: card_offers existed; built mig 000051 (expiry_notified_at) + repo DueForExpiryReminder/MarkExpiryNotified + OfferExpiryService.RunSweep (CASL, exactly-once) + worker daily wiring + tests.
- **P2.5 ✓** Welcome-Bonus activate: backend endpoint + api-lib existed; wired the dead-end empty-state into an in-place card-picker → activateBonus → reload.
- **P2.6 ✓ DONE ("Both" — user decision).** Migration 000052: `card_credit_defs.user_id` nullable (NULL=curated/global, set=private) + two partial unique indexes (global vs per-user) + seeded 16 researched real Canadian card credits via idempotent INSERT…SELECT JOIN VALUES. Repo `ListUserCardCredits` filters `(user_id IS NULL OR = uc.user_id)`; new `CreateUserCredit`. Service `AddUserCredit` w/ recurrence validation + nil-user guard. `POST /wallet/{sessionID}/credits` handler. CreditsTile: always-available "Log a credit" form (held-card picker + name + value + recurrence). `credits_test.go`: validation + empty-session tests. tsc/build/`-race` green.
- **P4.1 ✓ DONE (pure frontend, no migration).** `StackTemplates` accepts `sessionId`, fetches `getSpendStats`; transparent `recommendStack()` heuristic over real by-category spend shares picks best-fit template (travel→premium/aeroplan, grocery+dining→everyday, low-spend→no-fee-rookie) with a one-line reason citing the actual % mix; recommended template sorts first + "★ Recommended for your spend" badge. No fabricated data (no logged spend → no rec); backwards-compatible. Wired `sessionId` from pro-tools page. tsc clean, next build green.
- **P2.9 SQC** — no bug; document the logged-spend→SQC flow only. **P3.3** — 1 informational India route label in `aeroplan_lockin.go` (legit award zone, not arbitrage; optional).
- **Next new migration = 000052.**
- **P2.9 SQC** no bug — document the logged-spend→SQC data flow only. **P3.3** one informational India route label in `aeroplan_lockin.go` (legit award zone, not arbitrage — optional).
## Phase 5 ✓ DONE — full production QA gate (all green, 21 commits ahead of main)
- **Go:** `build` / `vet` / `test -race` → PASS.
- **Migration round-trip:** 52→47→52 reversible; 000053 down/up verified (down restores old URL row, up re-applies — both =1).
- **optimizer-cap-sweep:** PASS (no cap-remediation regression — invariant holds across spend matrix).
- **pro-tools-stress:** PASS (no 5xx, no internal leak, no impossible projection).
- **check-source-links STRICT=1:** CLEAN — Live 30 / Anti-bot 12 / Dead 0. Migration **000053** fixed 4 genuine-404 source URLs with browser-verified-200 official Canadian pages (Visa→/pay-with-visa.html, Rakuten→/sephora, Amex Platinum→/charge-cards/the-platinum-card/, AC→/aeroplan.html); checker now classifies anti-bot (401/403/429 + 000 from tight Akamai allowlist bmo.com/thebay.com) vs genuinely-dead so STRICT only fails on real link rot.
- **Frontend gate:** ESLint 0 errors (43 pre-existing non-blocking warnings), `tsc --noEmit` clean (app), vitest 4/4, `next build` green.
- **Headless browser sweep (chrome-devtools):** Homepage = ONE hero, 0 repeated money figures (no dup metrics), no "Rewards desk · test" kicker, no old "Recoverable (90d)", plain "left on the table", "Maple" in nav, no white screen/error overlay, console clean (only expected no-session 401s). All 16 real nav routes → HTTP 200 (the 4 probed non-routes have zero nav refs → not defects). Chat = 3× "Maple", no old assistant name, textarea constrained. Trip-planner = renders, no preemptive fake-live claim (1C honesty intact). Pro-tools = correctly Pro-gated without session. Promos = 55 links, 0 broken internal. No ErrorBoundary/5xx/white-screen anywhere; no-session degradation graceful.
- **P2.9** SQC = no bug (logged-spend→SQC flow documented as correct). **P3.3** = legit award-zone label left intentionally (not Indian-card content).

### Original Phase 5 scope (all satisfied): headless sweep, check-source-links STRICT=1, optimizer-cap-sweep, full go/frontend gate, migration round-trip.

### Phase 1 status: P0.2 ✓ · P0.3 ✓ · P0.4 ✓ · RecordSpend-dedup ✓ · P0-1/2/3 (security) ✓
### Phase 1 REMAINING: P0.5 promo pipeline · P0.6 error-JSON+rate-limit · P0-5 security perimeter tests

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
