# MapleRewards — Launch Plan (local, executable)

**Date:** 2026-05-18
**Input:** `docs/LAUNCH-ISSUES.md` (founder QA pass).

## Execution log

- **#127 review + QA**: fresh-context `security-reviewer` + `code-reviewer`
  subagents audited the full session diff. Every HIGH/MEDIUM finding fixed
  and re-verified (commit batch "fix(review)…"): tolerant `parsePromoDate`
  (a feed-starvation regression I'd introduced in P0.5), same-day-expiry
  calendar-date comparison (+ real IST timezone bug caught by the test),
  domain-separated email-unsub key (no JWT-secret reuse), 90-day token
  expiry, Referer/history token scrub, `/goodbye` stale-isPro race removed.
  Reviewer non-issues (webhook idempotency, no SSRF/redirect, parameterized
  SQL, no XSS) confirmed sound. Headless-browser smoke (chrome-devtools):
  `/loyalty` shows correct CPP for all 28 programs (Flying Blue **1.20¢**,
  not 120 — P0.3 proven in the live UI), `/tools` no longer shows the
  embeds/CPP-badge card with corrected lede (P3 proven), `/unsubscribe`
  renders its graceful no-token error state, zero console errors across
  sampled pages. Full Go `-race` suite green, frontend production build
  green, tsc 0 source errors.

- **P0.1–P0.6**: shipped + tested (commits d174ee7 → 2421d37).
- **P1** (billing finish): shipped + tested (45673e9 save-screen/post-cancel/lifetime; 02a4499 win-back + CASL unsubscribe infra — also closed the discovered digest-opt-out compliance gap).
- **P2 triage outcome**: the Pro-Tools tiles the founder reported as "don't work"
  (Welcome-Bonus Mission Control, Credits calendar, SQC, etc.) are **data-driven
  components with empty states**, not dead buttons — `report.items.length > 0`
  renders real data; the empty state routes to `/wallet`. The "doesn't work"
  perception traced upstream to **P0.2** (wallet balances silently not
  persisting — now fixed) plus empty wallets/spend. Forensics "what changed"
  is **cron-dependent** (works in prod when `cmd/worker` runs; honest empty
  state otherwise — an ops/deploy concern, not a code bug). "Track what you
  clipped" needs proactive expiry alerts = **P4.2** (new feature, not a P2
  bug). Live-CPP iframe and India arbitrage roll into **P3 cuts**. No
  fabricated fixes were made for non-broken data-driven components
  (don't-change-working-code).
- **P3 cuts**: India arbitrage **fully removed** — backend stack deleted
  (handler/service/repo), route unmounted in main.go, frontend tile + api
  fn + type + all pro-tools/profile/tools references gone. Live-CPP iframe
  **removed** — `/embed/cpp/[program]` and `/tools/embeds` route dirs
  deleted, tools-page entry + lede corrected. **Applications page KEPT** —
  per the plan's own rule (cut only if it feeds nothing): `card_applications`
  feeds the cooldown-notify worker (`cmd/worker/notify.go`) and the DSAR
  export, so deleting it would break those. Remaining `/tools` entries are
  functional utilities (compare, points-to-cad, promos, weekly digest,
  catalog) — retained; the founder's objection there was value-perception,
  not breakage, and over-deleting working tools isn't warranted.
  Loblaws/Empire **parked** (revisit later, per plan). Residual: orphaned
  India DTOs in model/types.go are dead but harmless (Go allows unused
  exported types) — flagged for the #127 dead-code sweep.
**Principle:** Data trust before everything. A user who sees the optimizer recommend a capped card, points valued at 120¢, or a wallet that won't save never comes back — that's the launch blocker, not billing polish.

## Sequencing logic

```
PHASE 0  Decisions ......... lock cut/keep so we don't build doomed work
   │
PHASE 1  P0 data trust ..... optimizer caps → wallet persistence → valuation units → portfolio → promo feed → rate-limit/error UX
   │        (1a blocks nothing; 1b is likely an architecture gap — do first to size it)
PHASE 2  P1 billing ........ save screen → post-cancel page → win-back email → lifetime UX
   │
PHASE 3  P2 triage ......... fix the cheap ones, formally kill the rest
   │
PHASE 4  P4 features ....... stack-suggester, expiry notifications (only after trust is restored)
```

Rationale: Phase 1 is the product. Phase 2 is already scoped/approved and is mostly additive (low regression risk) so it slots after. Phase 3/4 only matter if a user trusts the numbers enough to stay.

---

## PHASE 0 — Decisions to lock now (blocks Phase 3/4 scope)

These are **product calls, not bugs.** My recommendation in bold; override any of them.

| Item | Recommendation | Why |
|---|---|---|
| Applications page | **CUT** unless it feeds cooldown/eligibility logic | Founder sees no user value; manual status logging is dead data unless something consumes it. Check if `card_applications` is read by the application-tracker cooldown logic before deleting. |
| India arbitrage + Indian-card content | **REMOVE** | Irrelevant to a Canadian product; pure scope bloat. |
| Live CPP iframe badge | **CUT** | Doesn't work + no clear user; embeddable-widget play is post-launch at best. |
| All-Tools page | **RATIONALIZE** — keep optimizer/insights/portfolio-grade tools, cut the rest | "What are your points worth" (static CPP) and catalog-as-tool add noise. |
| Loblaws/Empire mini-economy | **PARK** (revisit reminder) | Founder doesn't understand it yet; not launch-critical. |

Confirm/override these before Phase 3 starts. Phase 1/2 don't depend on them, so execution can begin immediately while these are decided.

---

## PHASE 1 — P0 data trust (the launch blocker)

### 1a. Optimizer ignores card caps  `[BUG]`
- **Investigate first:** `internal/service/optimizer.go` (ranking), the card/multiplier model, and how caps are (or aren't) represented in the schema. Determine whether monthly/category caps exist in the data at all or only the headline rate.
- **Fix shape:** ranking must compute *effective* return for the entered spend = min(spend, cap) × bonus rate + max(0, spend − cap) × base rate, per category, per card. If cap data is missing from the schema, that's a data-model task (add cap fields + seed), not just an algorithm tweak — size it during investigation.
- **Verify:** $10,000 grocery spend must NOT rank Amex Cobalt #1 (5x caps at $2,500/mo); a no-cap card with a lower headline rate should overtake it past the cap. Add a table-driven test in `optimizer_test.go` with a capped vs uncapped card at spend above the cap.

### 1b. Wallet point balances don't persist  `[BUG — likely architecture gap]`
- **Investigate first (do this early — it may be big):** is there a backend endpoint + table for authenticated users' per-card point balances? Trace: frontend wallet edit → API call → handler → repo → table. If the persistence path doesn't exist, this is a schema + endpoint + wiring task, not a bug fix.
- **Fix shape:** ensure edit → PUT/PATCH → persisted row keyed by (user_id, card_id) → reflected on reload. Handle the anonymous-session vs authenticated-account distinction explicitly.
- **Verify:** set Amex Cobalt = 10,000 pts, save, hard-refresh → still 10,000. Confirm row in DB (native host Postgres: `PGPASSWORD=password psql -h localhost -p 5432 -U postgres -d maplerewards`).

### 1c. Valuation units bug (120–180¢/point)  `[BUG]`
- **Investigate:** the loyalty/CPP valuation source + the formatter on the Loyalty page. Almost certainly a cents↔dollars or ×100 error in one layer (display, service, or seed data).
- **Fix shape:** correct the unit at the single source of truth; do not patch the formatter to hide a bad value. Confirm CPP lands in the realistic 1–3¢ band for known programs (Aeroplan ≈ 2¢, etc.).
- **Verify:** Flying Blue shows ~1.x–2.x ¢/pt, not 120. Spot-check 3 programs against `knowledge/rewards.yaml` expected values.

### 1d. Portfolio "$0–$0" everywhere  `[BUG]`
- **Likely downstream of 1b + 1c.** Re-test after those land before separately debugging.
- **Investigate (if still broken):** the estimated-annual-value model — does it require non-zero balances (gated by 1b) and correct CPP (gated by 1c)? Trace the per-card range calc.
- **Verify:** with balances entered, per-card ranges are non-zero and plausibly bounded; total ≠ $0–$0.

### 1e. Promo/feed pipeline integrity  `[BUG]`
- **Root cause, not row patching.** Investigate the ingest path (`internal/service/feed_aggregator.go` and the scraper/AI ingest + the promo store).
- **Four pipeline fixes:** (a) dedupe on a stable key (issuer+transfer-partner+rate+window); (b) parse/store an explicit expiry and derive status from `now` vs window (no more "ONGOING" on a Mar–Apr promo); (c) validate source URL resolves (HEAD/GET 2xx) at ingest, drop or flag dead links; (d) geo-filter to Canada — reject US-only sources/content.
- **Verify:** no duplicate cards; an expired-window promo shows "EXPIRED"/hidden; every visible "SOURCE" link 2xx; no Citi/Chase-US items.

### 1f. Raw error JSON in UI + over-aggressive rate limit  `[BUG/UX]`
- **Two parts:** (1) one shared frontend error boundary that maps `{code,message}` → friendly UI, applied to feed, tools, billing — kill the raw-JSON leak class-wide (we already saw it 3×). (2) Re-tune the per-user rate limit: normal page navigation must not trip `USER_RATE_LIMITED`. Investigate what counts against the limiter (per-request vs per-page-with-N-calls) in `internal/middleware/ratelimit.go`.
- **Verify:** browse feed/tools normally → no rate-limit; force a real limit → friendly UI, never raw JSON.

---

## PHASE 2 — P1 billing finish (approved, additive)

- **2a.** "Before you go" save screen: interstitial before the Stripe portal redirect with a real offer (pause / % off / downgrade). Cancel reachable in one click if declined. (Stripe-ToS + click-to-cancel compliant — no obstruction.)
- **2b.** Post-cancel page: tasteful "sorry to see you go", data-kept-30-days, one comeback offer.
- **2c.** One CASL-compliant win-back email (single, not recurring), working unsubscribe, respects consent state. Reuses existing mailer (`internal/service/mailer.go`).
- **2d.** Lifetime "nothing to cancel" state: detect `plan == lifetime` in the billing UI and show an explicit owned-for-life message instead of routing to an empty Stripe portal.

---

## PHASE 3 — P2 triage (after Phase 0 decisions)

Fix the cheap, keep-worthy ones; formally delete the rest (no half-features at launch):
- Welcome-bonus "activate from wallet", credit-calendar "add cards", forensics cron, save-itinerary, SQC data feed — for each: 1-line "fix scope" or "DELETE". Decide per item using Phase 0 outcomes.

## PHASE 4 — P4 features (only after trust restored)

- **4a.** Stack-suggester from real logged spend/profile (Pro Tools or AI Assistant).
- **4b.** Expiry notifications for clipped/Amex offers (email/push) — makes the tracker actually useful.

---

## Verification discipline (every phase)

`go build ./... && go vet ./... && go test ./internal/... -race`, frontend `tsc --noEmit` + `npm run build`, then the per-item manual check above. One logical commit per coherent fix. Restart backend (`go run` doesn't hot-reload) before manual re-test; DB checks use the native host Postgres, not the stale docker container.

## First action

Phase 1a (optimizer caps) — no product decision attached, highest user-trust impact, self-contained. Start there unless you want 1b (wallet persistence) first to size the possible architecture gap early.
