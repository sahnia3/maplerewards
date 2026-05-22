# Design Spec — "Your Rewards Move": Maple's Proactive Brief

**Date:** 2026-05-22
**Status:** Design complete, awaiting user review (brainstorming output; not yet planned/implemented)
**Author:** brainstorming session (Claude + founder)

---

## 1. Thesis & motivation

**Maple as your rewards chief of staff.** The moat is the *fusion* of three knowledge
bases into cited, personal decisions:

- **Knows you** — cards, balances, real spend, which credits you've used.
- **Knows the market** — devaluations, transfer-bonus timing, sweet spots, program changes.
- **Drives the tools** — optimizer, award search, promos, applications, award watch.

Competitors each hold one leg and can't easily grow the others (Prince of Travel = market
as a blog; AwardWallet = balances; Ratehub = card specs). None fuse all three into a
reasoning engine that makes a *cited, personal, time-sensitive* decision.

**Evidence it's reachable now:** during the 2026-05-22 QA sweep, the chat and `/insights`
pages already exhibit the behavior — they computed "you're $123.12 exposed to the June 1
Aeroplan devaluation" from the real balance + a real `devaluation_events` row, and Maple
chat pulled `GET_DEVALUATION_HISTORY` to advise booking before the chart change. The Brief
productizes and proactively surfaces this.

**Decisions locked (founder, this session):**
- North star: **moat / differentiation** (not generic comparison-site features).
- Moat type: **all three legs fused** (not one).
- First delivery surface: **Proactive Brief** ("Your Rewards Move").
- Gating: **free teaser, Pro depth** (top move + locked count free; all moves + reasoning +
  urgent alerts Pro). The Brief is simultaneously the retention hook and the conversion surface.

## 2. Goals / non-goals

**Goals (v1):**
- A periodic + event-triggered, personalized, cited decision brief.
- Deterministic, honest, testable; no hallucinated financial figures.
- Reuse existing infra (worker cron, RESEND mailer, VAPID push, Redis cache).

**Non-goals (v1 — YAGNI):**
- No bank-transaction sync (Plaid/Flinks). Moves use existing wallet/balances/CSV spend.
- No new market timing-history store. v1 reasons over *current* promos/devaluations; the
  "happens ~2×/yr" historical reasoning is a fast-follow once promo history accrues.
- No `briefs` persistence table (compute-on-read + Redis).
- Moves #7–10 below are deferred.

## 3. The moves (v1)

Each move is a structured **decision card** with a verifiable citation. v1 ships the five
"ready now" generators (existing data) + the sweet-spot generator:

1. **Transfer-bonus timing** — active promo × balance × CPP → "$X value, ends in Nd."
   Source: `transfer_bonus_events` (Promo Sentinel) + wallet balances.
2. **Unused-credit sweep** — "$200 NEXUS credit unused; statement resets in 6d." Source:
   credits/renewals tracker.
3. **Renewal keep/cancel** — "Cobalt fee in 11d; earned $312 + used $156 → keep." Source:
   credits/renewal dates + card-value scorecard.
4. **Award-watch seat opened** — "a seat opened on your watched YYZ→CDG." Source:
   `award_watch` worker (already fires).
5. **Application timing window** — "Amex cooldown clears in 14d; the 100k offer ends in 20."
   Source: applications cooldown rules + welcome offers.
6. **Personalized redemption sweet-spot** — "your 120k Aeroplan unlocks YYZ→NRT business at
   75k now." Source: balances + award search + home airport. (Higher build; biggest "wow".)

Deferred (fast-follow): merchant-promo card routing; devaluation burn-warning (needs
forward-dated `devaluation_events`); points-expiry warning (needs last-activity tracking);
welcome-bonus MSR progress (needs spend-toward-MSR tracking).

## 4. Architecture — the Fusion Engine

**Pattern: deterministic generators produce the truth; Maple (LLM) optionally narrates it.**
Rationale: (a) honesty — values come from real DB rows × the *existing* optimizer/CPP/
award-search code, never an LLM guess, and every move carries a clickable citation;
(b) testability — each generator is `(state) → moves`, a pure function with function-field
mock repos (the repo's established test pattern); (c) cost/latency — the batch runs for every
user, so it cannot make per-user LLM calls; generation is in-memory, and the LLM is used only
to phrase the final summary, on-demand for Pro, never in the batch path.

New isolated package **`internal/service/brief/`**:

- **`move.go`** — `Move{Type, Title, Detail, ValueCAD, Urgency, ExpiresAt, Citation{SourceTable,
  SourceID, URL}, CTA{Label, Route}, Pro bool}` + `MoveType` enum. A move with no verifiable
  `Citation` is dropped.
- **`generator.go`** — `MoveGenerator` interface: `Generate(ctx, UserState, MarketState)
  ([]Move, error)` + a registry.
- **One file per generator** — `gen_transfer_bonus.go`, `gen_credit_sweep.go`, `gen_renewal.go`,
  `gen_award_watch.go`, `gen_application_window.go`, `gen_sweet_spot.go`. Single-purpose,
  independently testable.
- **`engine.go`** — `BuildBrief(ctx, userID) (Brief, error)`: assembles `UserState` once and
  `MarketState` once, fans out to all generators in-memory, ranks, caps, returns
  `Brief{Moves, GeneratedAt}`. A failing generator is logged and skipped (partial brief beats
  none).
- **`rank.go`** — score = urgency (expiry proximity) × value (CAD) × actionability.

**`UserState`** = {Cards, Balances, Credits, Watches, Applications, HomeAirport} (loaded once
per user). **`MarketState`** = {ActivePromos, Devaluations} (loaded **once per batch run**,
shared across all users). Key efficiency: one MarketState fetch per sweep, one UserState fetch
per user, then six generators run with zero further DB or LLM calls.

## 5. Data flow

```
worker cron
  └─ fetch MarketState ONCE  (active promos, devaluation events)
       └─ for each user:
            load UserState ONCE → run 6 generators in-memory → rank → cap
              ├─ cache Brief in Redis      (in-app GET reads this)
              └─ for HIGH-urgency moves: send RESEND email + VAPID push,
                 deduped via brief_alerts_sent(user_id, move_fingerprint, sent_at)
```

`GET /api/v1/brief` computes-on-read (Redis-cached, ~6–12h TTL, invalidatable) so the in-app
brief is always fresh; the worker reuses the same `BuildBrief` for the digest + alerts.

## 6. Storage

No `briefs` table in v1. Only new persistent state: **`brief_alerts_sent`** (dedup) — migration
`000058`. `move_fingerprint = hash(type + citation_source_id + expiry_bucket)` so the same promo
doesn't re-alert daily.

## 7. Delivery surfaces (reuse existing infra)

- **In-app**: a `/brief` page + a homepage module (replaces/feeds the existing "BEST MOVE
  TODAY" card). `GET /api/v1/brief`, gated.
- **Email**: weekly digest via the worker's existing RESEND mailer (Pro: full; free: teaser).
  Cadence: Sunday evening ("plan your week").
- **Push**: urgent event-triggered moves via the existing VAPID pusher (Pro only). Sweep
  cadence reuses the award-watch worker loop (every 6–12h); only HIGH-urgency, un-alerted moves.

## 8. Gating

`BuildBrief` returns all moves with a per-move `Pro bool`. The handler applies gating in one
place (engine stays gating-agnostic): free → top-ranked move full + `{lockedCount,
lockedValueCAD}` aggregate of the rest ("3 more moves worth ~$340 — unlock with Pro"); Pro →
all moves + reasoning + urgent push. The locked-value aggregate is itself the conversion lever.

## 9. Error handling & honesty

- Failing generator → logged + skipped; never blanks the whole brief.
- Move with no verifiable `Citation` → dropped.
- `ValueCAD` only when computed from real balance × real CPP (or real optimizer/award-search
  output); award/sweet-spot moves reuse award_search's existing `Rated`-vs-`estimate` labeling;
  no move asserts "live" pricing it doesn't have.
- Empty state is honest: "No time-sensitive moves this week — your wallet's optimized."

## 10. Testing

- Per-generator unit tests (function-field mock repos): e.g., transfer-bonus generator given a
  25% MR→Aeroplan promo + 90k MR + CPP → asserts one move, correct `ValueCAD`, citation = that
  promo's source row.
- Ranker ordering test (urgency × value).
- Gating render test (free vs Pro from the same brief).
- Engine skip-on-failure test (one bad generator, others still return).
- Dedup test (same fingerprint not alerted twice).

## 11. Build sequence (for the eventual plan)

1. `brief` package skeleton: `Move`, `MoveGenerator`, `UserState`/`MarketState` assemblers,
   `engine.BuildBrief`, `rank`.
2. The 5 "ready now" generators + unit tests.
3. `GET /api/v1/brief` handler + gating + Redis cache.
4. `brief_alerts_sent` migration + worker wiring (RESEND digest + VAPID urgent, dedup).
5. Frontend `/brief` page + homepage module (replace the static "best move" card).
6. Sweet-spot generator (#6) + tests.
7. Fast-follows (#7–10) as data lands.

## 12. Open questions for review

- Weekly email cadence — Sunday evening assumed; confirm.
- Free teaser: show top **1** move or top **2**? (Spec assumes 1 + locked count.)
- Sweet-spot generator quota: live award search per user per sweep is quota-heavy — gate to Pro
  only, and/or only for users with a saved home airport + ≥1 sizeable balance? (Spec assumes
  Pro-only + balance threshold.)
