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

- **Worker shares the API's Apify/SerpAPI monthly quota** (HIGH, audit-2 #6).
  Worker award sweeps debit the same counter as user-facing searches, so a
  large `award_watch` table can exhaust the cap paying users need. Fix options
  are a tradeoff: a separate worker quota namespace (users never starved, but up
  to ~2× total paid spend) vs. a worker sub-budget (caps cost, may still starve).
  Needs a cost decision. Not changed.
- **Worker crons run sequentially on one goroutine** (MED, audit-2 #10). A slow
  daily sweep stalls the award/promo tickers. Recommend per-cron goroutine +
  panic isolation; deferred (concurrency redesign, overlap-guard needed).
- **Quota/budget gates fail OPEN on a Redis error** (LOW, audit-2 #12). By
  design (availability > strict enforcement); a Redis outage removes all
  denial-of-wallet backstops at once. Flagged as an accepted tradeoff.

## Deferred — needs a new migration / non-trivial change

- **`affiliate_clicks` uses `ON DELETE SET NULL`** (LOW, audit-2 #14): click
  metadata (referrer/UA/timestamp) survives a user hard-delete. Needs a forward
  migration to CASCADE for full PIPEDA purge.
- **AI daily token budget undercounts tool-loop spend** (MED, audit-2 #8):
  estimate excludes the growing multi-round Claude round-trips. Recommend
  summing `resp.Usage` across rounds.
- **N+1 query in `card_value.SummaryForUserCards`** (LOW perf, audit-2 #15):
  per-card queries, uncached. Optimization, not correctness.
- **Apify token in URL query string** (LOW, audit-1 critic): move to an
  Authorization header to avoid credential leakage into logs.

## Cannot fix — edit-protected

- **Migration `000040`/`000058` down-chain hazards** (HIGH, audit-1 data):
  non-idempotent/over-deleting down migrations. Shipped migrations must not be
  edited (project rule). The FORWARD data state is already correct (058/076
  cleaned the dups); these are rollback-only hazards past v40/v58.

## Unverified

- The second audit's **csv-import** and **general-correctness** dimensions
  failed to return structured output (agent error), so the first audit's
  flagged **CSV import memory amplification** (ReadAll before the row cap) and a
  general correctness sweep remain unverified. Re-run recommended.
