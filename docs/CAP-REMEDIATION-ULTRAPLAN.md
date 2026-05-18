# Optimizer Cap-Integrity Remediation — Refined Executable Plan

**Date**: 2026-05-18
**Supersedes**: the May-15 production-hardening plan (all its launch-blockers already shipped in the 32-commit batch + P0–P3). This plan is the *single remaining gated work item*: the precision cap layer from `docs/OPTIMIZER-CAP-AUDIT.md`.
**Ground truth (verified against live DB, PostgreSQL 17, migration v47)**: 104 cards, 299 multipliers, **exactly 181** uncapped bonus multipliers, 31 per-multiplier caps, 1 cap_group (Amex Cobalt). Next migration = `000048`.

---

## Reframe — the critical correction

The audit doc and the founder's trigger assumed "Scotiabank Gold Amex has a real ~$50K/yr cap the optimizer ignores." **That premise is false.** Scotia Gold Amex's 5x grocery / 5x dining-entertainment / 3x gas-transit-streaming tiers have **no published annual cap**. Its 500,000-pts-on-$100K projection is *arithmetically correct*.

Therefore the goal is **NOT** "add caps to 181 multipliers." Blindly capping a genuinely-uncapped card is itself a new money-facing bug (it would under-promise and mis-rank). The goal is:

> **Resolve each of the 181 multipliers to a verified state: either `{cap_amount, cap_period, fallback_earn_rate}` from published terms, or `verified-no-cap` with a cited source.** Zero rows left as "unknown / guardrail-estimated."

This is why the founder gated it: the rushed fix would have been wrong in the opposite direction.

---

## Phase 0 — Research harness (no code changes)

1. Export the 181 rows to `docs/cap-research/registry.csv` (card, category, rate, earn_type, card_id, category_id, multiplier_id) — the master checklist. Every row ends resolved.
2. Pre-seed the registry with high-confidence published caps from Canadian-card domain knowledge + the Obsidian `canadian-rewards-reddit-intel` file, each flagged `needs-citation` until a source URL is attached:
   - **Shared-pool (→ `cap_groups`)**: Scotia Momentum VI (4% grocery+recurring $25K/yr — already capped, verify period basis), CIBC Dividend VI (4% grocery+gas combined $80K/yr → 1%), BMO eclipse VI / VI Privilege (5x grocery+dining+gas+transit pool), SimplyCash Preferred Amex (4% gas+grocery, $1,200 cashback/yr cap → 1.25%), BMO CashBack WE (5% grocery / 4% recurring / 3% gas — separate **monthly** caps).
   - **Verified NO cap (whitelist)**: Amex Gold Rewards 2x, Scotiabank Gold Amex tiers, PC / PC World Elite (points have no spend cap — audit already flagged: do not touch rates), Tangerine Money-Back, Wealthsimple VI 2%, National Bank World Elite 2x, Capital One/CIBC Costco MC, Marriott Bonvoy Amex.
   - **Per-multiplier cap (→ `card_multipliers`)**: TD First Class Travel tiers (Expedia-routed), MBNA Smart Cash, National Bank Syncro, etc.
3. Every remaining row researched per-issuer (Amex, RBC, TD, CIBC, BMO, Scotia, National Bank, Desjardins, MBNA, HSBC, Manulife, Neo, Rogers, Triangle, Capital One, PC) via issuer published terms (`WebFetch`/`ctx_fetch_and_index`), cross-checked against the Reddit-intel file. Each resolution stores a `source_url` + `as_of_date` in the registry and the multiplier `notes` column.
4. HSBC cards flagged: HSBC Canada consumer cards were wound down post-RBC acquisition — surface as a keep-with-note vs deactivate decision, do not silently delete.

**Exit**: `registry.csv` has 181 rows, each tagged `cap` | `cap_group` | `no_cap`, each with a source. Zero `unknown`.

---

## Phase 1 — Data migration `000048_verified_caps`

`migrations/000048_verified_caps.up.sql` (+ matching `.down.sql`):

- **Single-category caps** → `UPDATE card_multipliers SET cap_amount, cap_period, fallback_earn_rate, notes` keyed by `(card_id, category_id)` (never by ordinal — use the IDs from the registry).
- **Shared pools** → `INSERT INTO cap_groups` + `cap_group_categories` (the Cobalt pattern; one pool per shared-cap card such as CIBC Dividend VI grocery+gas). Grouped multipliers keep `cap_amount` NULL by design.
- **Verified-no-cap** → no row change; `notes` set to `'no published cap (src: …, as of …)'` so the state is self-documenting and auditable.
- `.down.sql` reverses every UPDATE/INSERT exactly (capture prior values in the up file's comment header for the reversal).
- Idempotent + guarded: each UPDATE includes the expected pre-value in its `WHERE` so a re-run or drifted catalog is a no-op, not a silent corruption.

**Exit**: `make migrate-up` clean; `migrate-down`/`up` round-trips; the 181-query now returns only verified-no-cap rows, matching the whitelist exactly (asserted in Phase 4).

---

## Phase 2 — Period-aware accumulation code fix (`scoreCard`)

The real secondary bug: `scoreCard` calls `GetMonthlySpend` for the cap basis **regardless of `cap_period`**, so annual caps under-accumulate for users with logged history (and the missed-rewards replay path).

- Add `SpendRepo.GetSpendSince(ctx, userID, cardID string, since time.Time) (map[categoryID]float64, error)` — sums `user_monthly_spend.total_spend` where `month >= since`.
- In `scoreCard`, when `!perPurchase`, derive the window from the resolved `cap_period`:
  - `"monthly"` → `beginningOfMonth(now)`
  - `"annual"` → `beginningOfYear(now)` (calendar-year basis — the safe, common default; document the assumption in code + audit doc; statement-year is a known accepted approximation).
- Thread the period-correct accumulated spend into **both** the `cap_group` branch and the per-multiplier branch (currently both hardcode `GetMonthlySpend`).
- `perPurchase` path unchanged (prior=0 is correct and deterministic for "which card for THIS purchase").

**Exit**: `go build ./...` clean; existing optimizer/missed-rewards tests green; new period tests (Phase 4) green.

---

## Phase 3 — Retire the guardrails, replace with data-backed bounds

The `defaultUnverifiedAnnualCap` / `defaultMaxAnnualPointsPurchase` / `defaultMaxOfferCreditCAD` guardrails were interim. After Phase 1:

- **Optimizer**: the `default:` branch in `scoreCard` no longer estimates. A multiplier reaching `default:` with `EarnRate > FallbackEarnRate` now means "verified no cap" → project full rate (correct, e.g. Scotia Gold Amex). Keep a *hard* assertion: any such multiplier MUST be in the no-cap whitelist; if not, fail the regression test (zero-tolerance — catches future catalog additions that skip the cap question).
- **buy_points.go**: replace `defaultMaxAnnualPointsPurchase` with a real per-program `max_purchasable_per_year` (new column on the buy-promo data; Aeroplan/Marriott/Avios real ceilings). Clamp + flag against the real number.
- **stack.go**: replace `defaultMaxOfferCreditCAD` with a real per-offer `max_credit_cad` (new column on `network_offers`; populate from the active offer set). Flat `statement_credit` already correct.

**Exit**: no `default*` magic-number guardrail remains in the projection path; every bound is data-backed; same `-race` suite still green.

---

## Phase 4 — Exhaustive QA matrix (the verification gate)

Table-driven Go test `optimizer_cap_matrix_test.go`:

- Cartesian over **every** (card, category) in all 299 multipliers × spend `{$1k, cap−$1, cap, cap+$1, $5k, $10k, $100k}` × segment `{base, sweet-spot}` × `perPurchase {true,false}` × merchant-routing `{none, Costco-MC}`.
- **Invariant asserted every cell**: `pointsEarned ≤ capAmount*bonus + max(0, spend−capAmount)*fallback` for capped/grouped; `pointsEarned == spend*bonus` for whitelisted-no-cap (the expected result, not a failure).
- Second test cross-checks the migration result set against the no-cap whitelist (Phase 3 zero-tolerance assertion).
- Period test: logged spend history pushing an annual cap; assert `GetSpendSince` window selection matches `cap_period`.
- Sibling-surface tests refreshed with real data: buy-points real per-program ceiling, stack real per-offer max.
- **Headless** (`chrome-devtools` MCP): `/optimizer` for (a) the founder's exact Scotia Gold $100K scenario — must show the correct verified number, (b) Amex Cobalt $10K (group cap binds), (c) CIBC Dividend VI $100K (shared pool), (d) 7 more representative cards. Screenshots → `docs/cap-research/qa/`.

**Exit**: full `make test` `-race` green; zero matrix-invariant violations; headless screenshots captured; `registry.csv` 100% resolved.

---

## Phase 5 — Continued stress-test sweep (founder's standing ask)

After caps land, re-run the unbounded/impossible-projection class hunt + a fresh whole-app pass:

- SQC `NextTier`/`SQCToNextTier` tier-ordering lead (verify `GetUserSQCContext` returns ascending tiers). **[RESOLVED 2026-05-18: `repo/sqc.go:68` orders `sqc_required ASC`; logic sound.]**
- Missed-rewards replay now exercises period-aware accumulation — re-verify totals.
- Portfolio / summary / trip-planner / award-search re-probed for any spend×rate projection without a bound.
- One more headless walk of every route + every interactive widget; log + fix anything found (in scope per the standing goal).

**Exit**: no remaining unbounded-projection surface; stress-sweep notes appended to `docs/OPTIMIZER-CAP-AUDIT.md`; audit doc status flipped to RESOLVED.

---

## Critical files

- `migrations/000048_verified_caps.{up,down}.sql` (new)
- `internal/repo/spend.go` — add `GetSpendSince`
- `internal/service/optimizer.go` — period-aware window in `scoreCard`; retire `defaultUnverifiedAnnualCap` branch → whitelist invariant
- `internal/service/buy_points.go`, `internal/service/stack.go` — real ceilings replace magic defaults (+ supporting repo/data columns)
- `internal/service/optimizer_cap_matrix_test.go` (new), refreshed `buy_points_test.go` / `stack_test.go`
- `docs/cap-research/registry.csv` (new — the 181 checklist), `docs/cap-research/qa/*` (screenshots)
- `docs/OPTIMIZER-CAP-AUDIT.md` — status → RESOLVED

## Verification gate (binding)

A card may not be projected above its **verified** cap for any tested amount, AND may not be projected below full rate when it is verified-uncapped. Every one of the 181 rows resolves to a cited cap or a cited no-cap. Zero guardrail estimates remain. Full `-race` suite + headless sweep green. New migration round-trips.

## Phase 6 — Verified bug-hunt findings (parallel fresh-context review, 2026-05-18)

Two fresh-context agents (code-review on money/projection surface, security-review on auth/billing) ran the non-gated stress-test the founder mandated. Findings below are **source-verified**. Severities: CRITICAL = wrong money figure shown to user / account-takeover; HIGH = exploitable or wrong number under realistic input; MED/LOW as noted.

### 6A. Optimizer guardrail is INCOMPLETE — the 500K-points class can still fire (folds into Phases 1–3)

- **#1 Period mismatch (CRITICAL)** — `calculateBlendedRate` subtracts one *month* of spend (`GetMonthlySpend`) from an *annual* cap (`optimizer.go:227-261`, `:345`). Already the Phase-2 fix; **confirmed real**, severity raised.
- **#2 Guardrail trusts unreliable data (CRITICAL)** — `optimizer.go:251` treats a card as unlimited when `EarnRate == FallbackEarnRate`. A bad import seeding both to `5` re-creates the exact 500K bug. Fix: gate "unlimited" on an explicit verified no-cap flag (the Phase-3 whitelist), never on rate-equality. **Must be folded into Phase 3.**
- **#3 Zero-fallback floor (CRITICAL)** — `optimizer.go:347-350`: if `FallbackEarnRate==0` (missing data) and cap exhausted, projects **$0 value** → card ranks last instead of at true base (~1x). Fix: floor fallback at the program's real base (≥1.0) when 0. **Fold into Phase 2/3.**

### 6B. New unbounded/wrong-number projections (NOT previously known — new Phase 6 scope)

- **#7 `ai_tools.go:1061` `simulate_transfer_with_bonus` (HIGH)** — no bound on LLM-supplied `bonus_percent`; `100000` → six-figure fake CAD valuation; negative → negative points. Clamp `[0,200]`, reject negatives. Also `#8` `int(transferredFloat)` overflow on unbounded `Amount` — bound `Amount` (≤10M), use int64+round. **[FIXED 2026-05-18 — commit pending]**
- **#6 `trip.go` CPP no ceiling (HIGH)** — `PtsPerNight=1` bad row → `cpp=50000¢/pt` rated "good". Clamp cpp to a sane ceiling (~25¢/pt), flag suspect rows instead of ranking #1. Same for tiny flight pts. **[FIXED 2026-05-18 — commit pending]**
- **#10 SerpAPI double-pax (MED→HIGH)** — `award_search.go:714` & `trip.go:1052` multiply `prices[mid] * passengers`, but SerpAPI returns pax-total when `adults>1` set (`serpapi.go:180`). Every multi-pax CPP inflated. Fix: query `adults=1` consistently or don't re-multiply. **[deferred — needs serpapi adults-param semantics verification; ultraplan]**
- **#9 `trip.go:274` 75th-pctile cash price** can pick a $49k outlier with sparse results → inflated "good" rating. Add per-cabin sanity ceiling. (MED)
- **#11 `apify_awards.go:352` taxes `/100` unconditional** ("often in cents") — drift makes $450→$4.50, hides fees. Add range heuristic. (MED)
- **#13 `missed_rewards.go:238 round2`** truncates negatives wrong (`int(v*100+0.5)`); `TotalGap` can be negative. **[FIXED 2026-05-18 — commit pending]**
- **#15 `devaluation.go:131` exposure** uses `hikePercent` not `hike/(1+hike)` for a points-cost hike — overstates ~17%. Disclosed/directional. (LOW)
- **#4 optimizer transfer-note double-attribution (HIGH)** — `optimizer.go:303-333` loop appends a second "Best via X" without resetting; two-route programs show contradictory notes. Track best separately, build note once. **[FIXED 2026-05-18 — commit pending]**
- **#5 `missed_rewards.go:95-108`** applies `maxEntries` cap *before* `sinceDays` floor → silently empty/wrong "$ left on table" for bulk-import histories. Apply date floor first. (HIGH) **[deferred — touches report semantics; ultraplan]**

### 6C. Security findings (NOT part of gated cap work — independent production fixes)

- **CRITICAL/HIGH — stale Pro claim**: `RequirePro` (`ownership.go:85`) trusts JWT `is_pro` for up to 15 min after cancel/refund. Fix: cached DB plan re-check in `RequirePro`, or shorten access TTL. **[deferred — auth design + perf tradeoff; ultraplan]**
- **HIGH — refresh reuse detection is DEAD CODE** (`repo/auth.go:230` `revoked_at IS NULL` → branch at `auth.go:197` unreachable). **Regression trap**: naive fix mass-logs-out users on benign SPA double-refresh (the `!claimed` path). Correct fix needs a rotation-successor/generation column to distinguish benign concurrent refresh from malicious replay. **Design decision for ultraplan — do NOT one-line this.**
- **HIGH — anon-merge wallet theft**: `auth.go:379-402` accepts body `session_id`; knowing a victim's anon session ≤30 days absorbs their wallet. Bind merge to the session cookie, not a body param; rate-limit+log. **[deferred — auth design; ultraplan]**
- **MED — rate-limiter bypass**: `ratelimit.go:89` keys on `RemoteAddr` (host:port). Strip port via `net.SplitHostPort`, prefer trusted real-IP. **[FIXED 2026-05-18 — commit pending]**
- **MED — `ChangePassword` error leak**: `handler/auth.go:202` passes `err.Error()`; `service.ChangePassword` wraps DB errors. Switch on sentinel validation messages like Login/Register; generic 500 for the rest. **[FIXED 2026-05-18 — commit pending]**
- **MED — cross-origin cookie/SameSite mismatch** (`auth_cookies.go:33`): frontend is a distinct origin (CORS, no BFF) but cookies are `SameSite=Lax` → not sent cross-origin, silently falls back to JWT-in-JS. Use `SameSite=None; Secure` in prod + strict CORS allow-list. **[deferred — deployment-coupled; ultraplan]**
- **LOW**: `generateCSRFToken` ignores rand error → zero token (panic instead); `decodeGoogleIDTokenTestOnlyUnsafe` in prod binary (move to `_test.go`).

**Verified-safe (no action)**: all SQL parameterized; JWT rejects non-HMAC alg; HMAC compares constant-time; login timing-equalized; Stripe skew two-directional + fails-closed on empty secret + boot-gated; token-bucket has no boundary spike; `RequireSessionOwner` IDOR guard correct.

### Phase 6 sequencing within the plan
6C security fixes are **independent of cap research** → executable immediately on the formal goal, in parallel with Phase 0 research. 6A folds into Phases 1–3 (raises their severity, adds the whitelist-flag requirement). 6B is new optimizer/trip/ai_tools scope, slotted after Phase 2, same QA-matrix gate (Phase 4) extended to cover trip CPP ceiling, `simulate_transfer_with_bonus` bounds, SerpAPI pax. The H4 refresh-token design is the one item explicitly flagged for ultraplan decision (regression risk on the naive fix).

**Execution status note (2026-05-18):** The 6 independent, low-regression, testable fixes (`#4`, `#6`, `#7/#8`, `#13`, rate-limiter, ChangePassword) are being executed now under the founder's standing non-gated "fix everything you discover" mandate, each with a Go test. The cap-data track (Phases 0–4), the H4 refresh-token redesign, RequirePro, anon-merge, SameSite, SerpAPI-pax, and missed-rewards-ordering remain gated for the formal goal + ultraplan.

## Sequencing

Phase 0 → 1 → 2 → 3 → 4 → 5, with **6C runnable in parallel from the start** (no cap-data dependency), **6A merged into 1–3**, **6B after 2**. Sequential within the cap track, no pause. Commit atomically per phase/fix. No `--no-verify`. New commits only. Every code change ships with a Go test (table-driven where it's a matrix) + `-race` green; frontend-affecting changes get a headless `chrome-devtools` verification.
