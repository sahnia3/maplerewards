# MapleRewards — Deep Audit & Feature Strategy

**Date:** 2026-06-01 · **Branch:** `fix/production-hardening` · **HEAD:** `e8f7ee3`
**Method:** 29-agent multi-agent workflow (~4.1M tokens) — 8 codebase mappers · 10 competitor researchers (web + headless) · 6 auditors (optimizer correctness, security, backend quality, data integrity, stress/scale, frontend) · 4 per-target synthesizers · 1 adversarial critic.
**Scope:** Go 1.25 / Chi / Postgres 16 / Redis backend (~43k LOC, 217 files) + Next.js 16 / React 19 frontend (~38k LOC, 35 pages). 104 cards · 28 loyalty programs · 92 migrations.

> Raw structured output (every agent's findings, all competitor data, full digests): `tasks/ws1rzm2tv.output` (JSON, 488KB). This document is the curated layer.

---

## 1. Executive Summary

MapleRewards is a Canada-native card optimizer with a **deep, largely-correct backend** (capped optimizer, churn/eligibility engine, missed-rewards forensics, welcome-bonus mission, expiry, devaluation, promo sentinel, award-watch cron, VAPID push, 15-tool Claude agent) but a **thin activation / retention / monetization layer**.

The defensible moat is **uniquely-Canadian data + a stateful wallet** — Cobalt, Aeroplan dynamic pricing, Costco-Mastercard routing, Aeroplan SQC, issuer cooldowns, transfer bonuses — that **no US incumbent and no Canadian media site (stateless calculators) can replicate.**

The repo audit was unusually well-grounded: nearly every file/line claim verified true. Current weaknesses are **self-inflicted and cheap to fix**:
- a guaranteed SQC nil-pointer panic (ship-blocker),
- a hostile 2-message free tier,
- an uncapped add-card recommender that reintroduces a remediated bug class,
- fake round-trip / flex-days in the Trip Planner,
- and several **already-built engines** (missed-rewards, award-watch, merchant-routing network rules, transfer partners) that simply **aren't wired to the surfaces users touch.**

**Strategic direction:** ship correctness/honesty quick wins first, then convert existing-but-disconnected engines into the three category-defining loops — **outbound weekly recap, cashback-on-application rebate (MapleCash), and card-aware Canadian expiry** — before any greenfield build.

---

## 2. Current State — Feature & Usability Map

**Usability tally across 97 catalogued features:** `polished: 35` · `functional: 37` · `rough: 12` · `broken: 1`.

| Area | Verdict | Strongest | Weakest / dead-ends |
|---|---|---|---|
| **Core / Onboarding / Auth / Pricing** | Auth+billing production-grade; first-run experience rough | Stripe pipeline (HMAC, idempotency, refund revocation), JWT+refresh rotation, CSRF, recommendation engine | Onboarding Step 3 prefs collected but **never sent** (decorative); anonymous "Try it free" **loses card selections** on signup redirect; free "3-card" limit **unenforced**; no self-serve password reset (mailto link); free home "best move" always empty (Pro-gated) |
| **Cards / Compare / Loyalty** | Solid data spine, hollow detail | Catalog, card-detail tabs, 2-card head-to-head diff, loyalty index | Loyalty "sweet spots"/CPP tiles **hardcoded boilerplate**; card detail surfaces **no perks/credits/insurance/FX** despite `card_credit_defs` holding the data; no catalog search/sort for 104 cards; `/compare/[a]/[b]` not statically generated (SEO miss) |
| **Optimizer / Portfolio / Wallet / Insights / Milestones** | **Strongest area; genuinely production-ready** | Cap-integrity remediation is real (shared cap-groups, per-multiplier caps, blended rate, guardrail); wallet + spend logging polished | "Cards to add" runs on **hardcoded `TYPICAL_SPEND`** not the user's real spend; `recommender.go` applies **no caps + no estimate disclosure** (reintroduces remediated over-projection); **no DROP/cancel** recs; rich WelcomeBonusMission data under-surfaced |
| **AI / Chat** | **Genuinely strong, not a wrapper** | Anthropic tool-use loop grounded in live wallet + 28-program Canadian KB; Haiku/Sonnet routing; quota/budget guardrails | **Dead code:** `AIService.Chat()` (ai.go:122-242); **no tests** on `ChatWithToolsStream`; no programmatic prompt-injection defense; masthead hardcodes "Sonnet 4.6" while most turns route to Haiku |
| **Trip Planner** | Real & sound core, broken edges | Seats.aero + Apify defensive scraper, SerpAPI cash compare, CPP/value/trust-gate reasoning | **Round-trip is fake end-to-end** (UI sends/render return leg; request type lacks it); **flex_days ±14 rejected by handler** (cap 7); "Boost via partner" CTA **dead** (`best_transfer_partner` never set); CPP computed against cash that **excludes the award's own taxes**; zone classifier **ignores origin** |
| **Pro Tools + public tools** | Substantially real, not Potemkin | Missed-rewards forensics, simulator, churn planner, SQC, transfer sweet-spots wired to real engines; public lead-magnets polished; quota/RequirePro enforcement | `/tools/aeroplan-june-1` **time-expired today**; Knowledge tab tiles call **public** endpoints (thin as Pro value); issuer-changes feed **ships empty** (no seed rows + worker not started); some "Pro" stacking tiles are static hardcoded calculators |
| **Backend platform** | **More mature than "near production-ready" implies** | Refresh-token reuse detection, timing-safe login, full IDOR closure, Redis caching, denial-of-wallet quota, Stripe idempotency, migration discipline | Rate limiting **in-memory per-instance** (bypassable at >1 replica); worker has **no leader election** (double-fires at scale); admin metrics **~80% dead counters**; "valuation refresh" only **re-stamps timestamps**, computes nothing; AI budget **fails OPEN** on Redis outage |
| **Growth: feed/promos/applications/admin/extension** | Mostly real, under-wired | Feed = real multi-source RSS w/ XSS hardening; promos = Tavily+Claude extraction w/ anti-garbage guards; application tracker polished | **Worker never starts** in default Docker CMD → promo sentinel + all sweeps dormant; weekly digest is an SEO dead-end; extension popup reads **dead `mr_session` cookie** (signed-in user sees empty popup); `/applications` advertised "Pro" but **not gated**; admin is read-only |

---

## 3. Audit Findings — Ship-Blockers & Risks

### Correctness (optimizer money-path — otherwise GOOD)
- **[HIGH · ship-blocker] SQC nil-session panic** — `internal/service/sqc.go:39-44` derefs `user.ID` with no nil guard; guaranteed crash on any deleted/unknown session hitting `/wallet/{sid}/sqc-projection`. Fix: add the standard guard mirroring `optimizer.go:88` / `missed_rewards.go:73`. **~4 lines + 1 test.**
- **[HIGH] Uncapped add-card recommender** — `recommender.go scoreCard (~148-156)` projects `monthly × earnRate × 12` with no caps and no disclosure — the exact bug class `known-issues/optimizer-cap-integrity.md` remediated in the optimizer. Reuse `calculateBlendedRate`.

> Money-path math is otherwise **robust under stress** — cap invariants hold at spend = cap-1/cap/cap+1/5k/10k/100k for points and cashback (per-cap + shared-group + guardrail).

### Security (posture strong; two real holes)
- **[HIGH] Authenticated SSRF via Web Push endpoint** — `internal/handler/push.go:45-72` persists an unvalidated subscription endpoint. Fix: require `https`, parse + allowlist host, block private/loopback ranges.
- **[HIGH] DSAR/GDPR export silently omits data** — `internal/service/data_export.go:105-126` uses wrong SQL column names, so whole categories drop from the user's export (compliance + trust risk). Fix: correct the SELECT lists to the real schema.

> JWT pins HS256 + exp + issuer; login is constant-time w/ throttle; IDOR fully closed via session ownership; `go vet` + `go build` pass clean.

### Data integrity (8/12 card facts, 9/11 valuations correct)
- **[HIGH] Scene+ CPP 0.80 → should be fixed 1.0¢** — paired `UPDATE base_cpp + point_valuations`.
- **[HIGH] Neo Secured annual fee $96 → should be $0** — revert.
- Migrations 089-092 verified **fully reversible, no destructive gaps.** (Committed, not yet applied to live DB.)

### Stress / scale (conditionally production-resilient)
- **[HIGH] No cache-stampede protection on award search** — `award_search.go` cold cache lets concurrent identical requests each trigger the full paid fan-out. Fix: `golang.org/x/sync/singleflight` keyed on `cacheKey`.
- **[HIGH] Worker + refresh-valuations open uncapped pgxpools** — only `cmd/api` caps `MaxConns`; a worker burst can exhaust Postgres. Fix: mirror the api pool sizing.

> The crash/abuse surface the harnesses target (adversarial Apify/SerpAPI payloads, paid-API quota under burst, malformed/large CSV) is genuinely well-covered — among the better-tested external-integration code reviewed.

### Frontend
- **[HIGH] Portfolio fetch failures render as EMPTY, not error** — `frontend/app/portfolio/page.tsx:65-98` — a user with cards sees "No cards" on a backend blip. Fix: per-section error+retry state.

---

## 4. Competitive Position

- **US optimizers** (MaxRewards, CardPointers, Kudos) own the **in-person, point-of-sale moment** via mobile apps + push. MapleRewards' web + extension structurally cedes this → the PWA/push recommendations exist to bridge it.
- **Canadian media** (Prince of Travel, Milesopedia, RedFlagDeals, Ratehub) are **stateless calculators + affiliate content** — they cannot do a stateful, wallet-aware optimizer. This is MapleRewards' opening.
- **Cashback-on-application** (GeniusCash, FlyerFunds) is the proven Canadian acquisition mechanic; **GeniusCash's #1 complaint is payout delay** → a transparent `pending→confirmed→paid` ledger is itself the wedge.
- **The Points Calculator** ships custom point valuations; **Ratehub CardFinder** (Feb 2026) does a TransUnion soft-pull match — both directly answered in the "new ideas" below.
- **Retention precedent:** Plotline / Monarch validate the **weekly recap** as the day-30+ retention play.

---

## 5. Prioritized Top-10 Roadmap

Sequenced for a near-production launch — correctness/honesty first, then the loops that compound.

| # | Item | Effort | Why it's here |
|---|---|---|---|
| 1 | **Fix SQC nil-session panic** | S | A guaranteed crash must not ship. |
| 2 | **Widen free tier to ~10 msgs / 5 cards** + align copy + enforce card limit | S | Biggest funnel unlock; do it before any acquisition spend. |
| 3 | **Make `recommender.go` cap-aware + estimate disclosure** | M | Close the reintroduced over-projection before users trust add-card advice. |
| 4 | **Trip-planner trust bundle:** net taxes from CPP, surcharges→CAD, fix flex_days ±14, fix-or-remove round-trip | S+M | Stop the booking page erroring and overstating value. |
| 5 | **Register `createAwardWatch` in the AI tool registry** | S | One tool definition turns chat agentic on infra already deployed — best impact/effort in the set. |
| 6 | **Persistent "you left $X" free-tier banner** + wallet-seeded starter prompts + `/chat?q=` fix | S | Cheap grounding + proven upsell teaser, reusing finished engines. |
| 7 | **Populate `best_transfer_partner` on award rows** | M | Lights up the dead Boost CTA + the corpus's biggest moat; backend logic already exists in `summary.go`. |
| 8 | **Weekly "Maple Recap"** over the existing digest + VAPID rails (free-tier teaser) | M | The #1 retention loop — extend, don't build. |
| 9 | **Card-aware Canadian expiry engine** + extended `issuer_rules` churn rules | M each | The two deepest uniquely-Canadian wedges, both on engines already wired. |
| 10 | **Cashback-on-application "MapleCash"** with `pending→confirmed→paid` ledger | L | The #1 monetization gap and the flywheel that funds the widened free tier. |

---

## 6. Feature Recommendations by Target

All recommendations are grounded against verified code; `[grounded:true]` items reference real files/services. Impact/Effort/Confidence as rated by the adversarial critic.

### 6.1 MapleRewards — Overall Product

**Quick wins**
- Fix the SQC nil-session panic (`sqc.go:39`) — `if user == nil { return ErrSessionNotFound }`.
- Portfolio "cards to add" must use the user's **real logged spend** (already server-side via insights/missed-rewards), not the hardcoded `TYPICAL_SPEND` in `portfolio/page.tsx:20,74`.
- Pass `merchant.slug` from the extension's `/optimize` call so `merchant_routing.go` network rules (Costco=Mastercard-only, Loblaws=no-Amex) actually fire at checkout.
- Fix the extension popup's dead `mr_session` cookie path; align the README that mislabels the working storage path as "legacy."
- Correct Scene+ base_cpp (0.80→1.0) and Neo Secured fee ($96→$0) via a new migration.

**Big bets**
- **Cashback-on-application "MapleCash"** — share part of affiliate CPA back as a rebate with a transparent payout ledger. The flywheel + revenue engine; reliability/payout-speed is the wedge vs GeniusCash.
- **Installable PWA + push orchestration** — the bridge to the ambient point-of-sale moment web+extension cedes to CardPointers/MaxRewards.

**Recommendations**
| Title | Impact | Effort | Conf | How |
|---|---|---|---|---|
| Fix SQC nil-session panic (ship-blocker) | high | S | high | Guard after `GetUserBySession` in `sqc.go:39`, mirror `optimizer.go:88`; +1 table test. |
| Make `recommender.go` cap-aware + estimate disclosure | high | M | high | Apply optimizer's `calculateBlendedRate`/cap logic per multiplier; surface the "capped, estimated" note. |
| **Weekly "Maple Recap"** (push + email + in-app card) | high | M | high | Reframe `MissedRewardsDigestService` into a dollar-headline ritual: add earned-$ via optimizer scoring, run for free users (gate detail not headline), fan out over `pusher.go` VAPID, deep-link one-tap fix into `/optimizer`. Reuse worker's 7-day cadence. |
| **Cashback-on-application "MapleCash"** + payout ledger | high | L | high | New `payout_ledger` table + state machine on the existing affiliate layer (`repo/affiliate.go` is only click-log + 302 today); "You get $X back" badge in optimizer/catalog; realistic ~60-90 day messaging. ~CA$80-150/approved card subsidizes the free tier. |
| Drop / downgrade / cancel recs + Card Action Center | medium | M | high | Per-card KEEP/PRODUCT-CHANGE/CANCEL verdict from real usage vs annual fee (Fee-ROI + `RenewalService` exist) + re-bonus date from churn engine. |
| Wire merchant slug from the extension | medium | S | high | Add `merchant: merchant.slug` + real spend to `content.js` `/optimize` body; server network filter applies automatically. |
| Notification preference center + lifecycle orchestration | medium | M | medium | On the VAPID rail: opt-in priming, per-category prefs, global 2-5/week frequency cap, 3-touch win-back. Shared by recap + expiry alerts. |
| Installable PWA (home-screen + push) | medium | L | medium | Manifest + service worker + install prompt + push. Lower priority than data/loop fixes; enables the ambient surface later. |

### 6.2 Pro Tools

The "make them pay" surface. The core insight: **gate on depth/quantity, not basic access** — the current 2-message free tier is hostile and kills the funnel.

| Title | Impact | Effort | Conf | How |
|---|---|---|---|---|
| **Widen free tier; gate Pro on depth** | high | S | high | `frontend/lib/pro-features.ts`: chat 2→~10/mo, cards 3→5; align all copy to one value; keep Pro on itemized missed-rewards fix / live award context / eligibility depth. Also **enforce** the card limit (unenforced in `WalletService.AddCard`). |
| **Persistent "you left $X on the table" banner** (free users) | high | S | high | Expose the single total CAD figure `missed_rewards.go` already computes via a free-tier teaser endpoint; keep itemized breakdown + fix behind Pro. |
| **Card-aware Canadian expiry engine** | high | M | high | In `expiry.go effectiveExpiry()` (currently line 139 uses only inactivity), join wallet holdings + suppress expiry when a card exempts it (Aeroplan w/ any TD/Amex/CIBC Aeroplan card; Scene+ w/ a Scotia card; Amex MR until last MR card closed). Emit Safe / At-risk-in-N / Exempt chip. |
| **Extend `issuer_rules` beyond cooldown** | high | M | high | Relax the `000042` CHECK to add `lifetime_per_product` (Amex once-in-a-lifetime), `rebonus_after_months` (Scotia 24mo), `product_family_cooldown` (Amex Biz Plat/Gold 90d). Teach `churn.go CheckEligibilityBatch` to evaluate vs `card_applications` + wallet. |
| Card-aware "Keep It Alive" reset actions + 90/60/30/daily-7 alert ladder (.ics + push) | high | M | medium | Convert `expiry.go` static `resetSuggestion` into program-specific prescriptions + tiered ladder over VAPID + subscribable `.ics` feed. **Sequence after the expiry engine.** |
| Retention / downgrade-offer tracker + crowd-sourced Canadian offer DB | high | L | medium | Near each fee date, `RenewalService` emits a retention play (issuer script — Amex CA requires a call — + community data points + verdict) + one-tap "log the offer I got" → new data-points table. **The crowd-sourced dataset is the durable moat.** |

### 6.3 AI Page (`/chat`)

Already genuinely strong (grounded tool-use loop). The gap is **agentic action + proactivity**, not the engine.

| Title | Impact | Effort | Conf | How |
|---|---|---|---|---|
| **Register a `createAwardWatch` tool** | high | S | high | Add the tool definition in `ai_tools.go registerTools()` next to `list_my_award_watches` (:1288), wrapping `AwardWatchService.Create`. Cron + email/web-push fan-out already live. **Highest impact/effort ratio in the whole audit.** |
| **Maple Insights** — background agent surfacing 2-4 confidence-tagged action cards | high | M | medium | On `/chat` + dashboard open, run deterministic engines (`missed_rewards`, `devaluation`, `welcome_bonus_mission`) over the wallet → structured cards w/ High/Med/Low tag + "value recovered" counter + one-tap deep-link. Sequence after recap. |
| **Cross-session memory** + editable "What Maple remembers" panel (PIPEDA-friendly) | high | L | medium | Extract structured facts per turn (home_airport, preferred_cabin, target_programs, household_size) → `user_memory` table; inject into the cached system block; settings panel to view/edit/delete. Greenfield; sequence late. |
| Wallet-personalized starter prompts + fix dead `/chat?q=` handoff | medium | S | high | Read `?q=` on mount + auto-send; replace 6 static starters with prompts built from the user's actual cards. |
| Guardrail post-processor: confidence tags + "verify before you transfer/apply" caveat | medium | S | high | Post-gen pass keyed off `complexChatSignals`; tag award/devaluation claims live-tool vs KB-estimate (`award_search.go` already labels this); append a persistent "information, not licensed financial advice" caveat. |

### 6.4 Trip Planner

Real, sound core — but several **trust-breaking honesty bugs** must close before it's shippable.

| Title | Impact | Effort | Conf | How |
|---|---|---|---|---|
| **Subtract award taxes from cash before CPP + surcharges→CAD** | high | S | high | In `award_search.go` CPP path, subtract the award's `taxes_cash` from the cash fare before dividing by points; display one all-in CAD figure. The tax field exists but is unused in the math. |
| **Fix flex_days ±14 mismatch + fake round-trip UI** | high | M | high | Either raise `handler/award_search.go:70` cap 7→14 or drop the ±14 option; either add `return_date`/`ReturnLeg` end-to-end or remove the round-trip button + RT-CPP UI. |
| **Populate `best_transfer_partner` on award rows** (light up dead Boost CTA) | high | M | high | Reuse the best-partner logic in `handler/summary.go:81`; fold live transfer-bonus % from the promo sentinel into effective points. Field + consumer already exist — only the producer path is missing. |
| Fix cash-benchmark zone classifier (use origin) + expand airport map | medium | M | high | `trip.go:208` discards origin (`_ = orig`); classify on both origin+dest region + expand beyond ~91 airports so off-list routes stop defaulting to transatlantic pricing. |
| Aeroplan dynamic-pricing + devaluation lock-in awareness in results | medium | M | medium | Flag static YAML chart rows as unreliable (Aeroplan fully dynamic since Mar 2025); on rows whose chart cost rises 2026-06-01, surface "redeem before June 1 to lock pricing." Ties into the devaluation engine. |

---

## 7. New Ideas the Critic Added (not in the synthesizers' output)

1. **Per-user custom point valuations + benefit overrides** that persist across optimizer/recommender/missed-rewards/trip-planner (set your own CPP; toggle whether you actually use the $300 travel credit). Counters The Points Calculator; makes every downstream number trustworthy. *M effort — `point_valuations` + `base_cpp` already exist.*
2. **Versioned, effective-DATED card/program DB + public "Canadian Rewards Changelog"** (old→new + effective date). The deepest data-architecture moat: Canada is mid-devaluation-wave (Cobalt fee +23% Nov 2025, Aeroplan June-1-2026 chart hike, Amex Plat 2027 lounge cuts) and **no competitor maintains change history as queryable data.** The migration chain already encodes dated corrections (`000088`/`000091`).
3. **Card-level currency-transferability flag** — RBC Avion points transfer from Avion cards but **NOT** from ION/ION+ (same currency name, different transferability), with a "product-switch to unlock transfers" path. A precise Canadian correctness gap the optimizer can't currently express.
4. **FX-netting engine** — rank foreign/USD purchases on TRUE net cost = FX fee minus category cashback / no-FX benefit (Rogers 3% USD − 2.5% FX ≈ 0.5% net; Scotia/Wealthsimple 0% FX). Buildable Canada-specific data rule the optimizer omits today.
5. **Approval-likelihood pre-check fused with bonus-eligibility** (no hard pull, no SIN), positioned on privacy ("no credit-file sharing") — a direct counter to Ratehub's Feb-2026 TransUnion CardFinder. The eligibility engine exists; the net-new piece is an approval-odds heuristic. *Larger bet, lower data-sourcing confidence.*

---

## 8. Deliberately Cut (anti-over-engineering)

The critic rejected these as ungrounded, premature, or off-strategy:
- Worker leader-election / distributed lock — premature for single-replica launch; in-process ticker is fine until horizontal scale-out.
- Region-to-region "where can my points take me" exploratory search — XL, depends on transfer-reasoning + cache hardening; paid-API denial-of-wallet risk.
- Real Player-2 / household second-member — L multi-user/auth surface most users won't touch pre-PMF; `HouseholdService` already covers the catalog-card case.
- Configurable assistant tone + "Rewards IQ" quiz — engagement gimmick; risks bleeding tone into guarded numeric verdicts.
- Loyalty Net Worth hero + streaks/badges — overlaps recap/dashboard; second-order, wait until the recap loop proves engagement.
- Productized AI concierge / done-for-you booking upsell — needs human ops + refund/dispute infra MapleRewards lacks; monetization belongs in MapleCash.
- White-label / embeddable calculator widget for media partners — B2B distribution play, orthogonal to the consumer product, premature pre-launch.
- Deposit-account cross-sell affiliate — dilutes the card-optimizer focus; adds compliance surface for marginal revenue.
- Embeddings/retrieval-RAG migration — YAML-injection KB works at current catalog size; architecture rewrite with no user-visible payoff.
- Cold-start cache warmer — real but a cost/UX optimization, not a launch differentiator; defer until paid-search volume justifies it.

---

## 9. Suggested Execution Order

1. **Correctness & honesty sprint (all S, ~days):** SQC panic · widen free tier + enforce card limit · trip-planner tax/CPP + flex_days · `createAwardWatch` tool · "$X left" banner + starter prompts + `/chat?q=` · Scene+/Neo data fix · extension merchant slug + cookie fix · push-endpoint SSRF guard · DSAR export columns · Portfolio error states.
2. **Trust & moat (M):** cap-aware recommender · `best_transfer_partner` producer · card-aware expiry engine · extended `issuer_rules` · cache-stampede singleflight · worker pgxpool caps.
3. **The loops (M→L):** Weekly Maple Recap → notification preference center → Maple Insights cards → retention/downgrade tracker.
4. **The flywheel (L):** MapleCash cashback ledger → versioned dated card DB + public Changelog → PWA → cross-session memory.

---

*Generated by the `maplerewards-deep-audit` multi-agent workflow. Per-finding evidence and full competitor data in `tasks/ws1rzm2tv.output`.*
