# Multi-agent audit (2026-05-28) — fixed + deferred

Two independent multi-agent audits (6-dimension correctness/security sweep +
6-gap-surface deep dive), every finding adversarially verified against the
source. 32 findings confirmed across both. This file records what was FIXED in
code and what is DEFERRED (with rationale), so nothing is silently dropped.

## Fixed (committed)

Money: portfolio dollar-gap routed through the cap-aware optimizer; card-value
EV cap-blended + math.Round. Billing: webhook MaxBytesReader (no silent
truncation), `charge.refunded` revocation for Lifetime, plan-switch failure now
retried. Security: chat SSE error masked, Google empty-email fail-closed +
NULLIF, SSRF dial-guard on promo_sentinel/issuer_watch, `RequireJSONContentType`
CSRF gate on the anonymous mutation routes, deletion-log email hashed (PIPEDA).
Denial-of-wallet: Tavily metered, AI tool fan-out capped (per-round +
per-request paid budget), flight/hotel tool args validated. Ops: seats.aero +
tavily capped reads, worker honors KB_DIR. Plus the chat-bounce keyframe and
ResearchMode Pro gate.

## Deferred — design / infra decisions (need founder input)

- ~~**Worker shares the API's Apify/SerpAPI monthly quota** (HIGH, audit-2 #6).~~
  **FIXED** with a no-cost default: the worker now *reserves headroom* —
  `awardSweepAllowed` skips the bulk award sweep when remaining Apify quota is
  ≤30% of the monthly cap (`workerApifyReservePct`), so interactive user-facing
  searches always have budget. No extra spend, no starvation; interactive >
  background. Fails open on a quota read error.
- **Worker crons sequential-dispatch latency** (MED, audit-2 #10). Panic
  isolation is ALREADY present (`safely()` wraps every sweep, so one panicking
  cron can't kill the process). What remains is bounded scheduling latency: the
  select loop runs the daily-slot sweeps sequentially, so a long daily batch can
  delay the next award/promo tick. Tickers are hours apart and each sweep is
  bounded, so this is a low-severity latency, not a safety bug. Concurrent
  per-ticker dispatch deferred (trades the bounded delay for DB/Redis contention
  + needs an overlap guard).
- **Quota/budget gates fail OPEN on a Redis error** (LOW, audit-2 #12). By
  design (availability > strict enforcement); a Redis outage removes all
  denial-of-wallet backstops at once. Flagged as an accepted tradeoff.
- **CSV Commit full single-tx batching** (audit-2-reaudit, HIGH — mitigated).
  Mitigated: maxCSVRows lowered 5000→1000 and imports serialized per session, so
  one user can't fan out concurrent pool-churning imports. The complete fix
  (resolve per-import invariants once + one batched tx / `CopyFrom` so an import
  holds a single connection) is a LogSpend/RecordSpend refactor, deferred.

## Deferred — genuine tradeoff / perf

- **`affiliate_clicks` uses `ON DELETE SET NULL`** (LOW, audit-2 #14): purge vs.
  revenue-attribution tradeoff — SET NULL already de-links the user; CASCADE
  would delete the click rows (losing deleted users' commission history). Left
  for a product call rather than unilaterally deleting revenue data.
- **N+1 query in `card_value.SummaryForUserCards`** (LOW perf, audit-2 #15):
  per-card queries, uncached. Optimization, not correctness.

## Cannot fix — edit-protected

- **Migration `000040`/`000058` down-chain hazards** (HIGH, audit-1 data):
  non-idempotent/over-deleting down migrations. Shipped migrations must not be
  edited (project rule). The FORWARD data state is already correct (058/076
  cleaned the dups); these are rollback-only hazards past v40/v58.

## Fixed since first draft (round 2 — re-audit + follow-ups)

- AI token budget now debits ACTUAL multi-round usage (audit-2 #8) — FIXED.
- CSV parse streams row-by-row (memory amplification) — FIXED.
- CSV Commit pool-exhaustion (HIGH) — MITIGATED (cap + per-session lock).
- Categorizer telecom→gas mislabel — FIXED (carrier rules added).
- Award-search median upward bias — FIXED (true median).
- Apify token moved to Authorization header (audit-1 critic) — FIXED.
- The two previously-unverified dimensions (csv-import, general) were re-run:
  3 confirmed (CSV-commit, categorizer, median — all addressed above), 2
  dismissed. No longer unverified.
