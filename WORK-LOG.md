# MapleRewards — Session Work Log

**Session date**: 2026-05-14 → 2026-05-15
**Starting point**: You ran `/goal` asking for production-ready MapleRewards with live flight pricing, better AI chat, fixed trip planner, better Pro Tools, expanded knowledge base, and a more inviting brand. Plus competitor research and security review.

This log records what actually shipped, in chronological order. Each section is a single phase with a one-line "what broke" and a "what shipped" list.

---

## Phase 0 — Reconnaissance (8 parallel audit agents)

**What broke**: I had no idea what the codebase actually looked like or where the real gaps were.

**What shipped**: 8 audit reports across these axes, run in parallel as background agents:

| Audit | Finding headline |
|---|---|
| Codebase architecture | 32 migrations, 3 files >1000 LOC, ~24% backend test coverage, no frontend tests, well-organized routes |
| OWASP security | 1 Critical (CORS), 8 High (RealIP trust, Stripe params, webhook race, JWT fallback, CSRF rotation, body-size limits, IDOR variadic, error leakage), 10 Medium, 5 Low |
| Feature audit (AI / Trip / Pro Tools) | AI is sophisticated (streaming, tools, caching); trip planner is one-way only with hidden segments + no taxes + no booking links; Pro Tools is 1759-LOC monolith |
| Live flight pricing pipeline | `point_valuations` 2-month-stale manual seed; only 6 award programs; taxes hard-coded to 0; no Redis cache; no SerpAPI quota tracking; no retry/backoff; frontend doesn't distinguish live vs estimated |
| Brand / UX | No logo chosen (6 exploration rounds, zero selection); 47 em-dashes + 62 italics across 4 marketing files (AI prose tells); pricing free tier framed as punishment; Pro Tools = feature dump |
| Competitor intel — Canadian rewards | Pricing sweet spot $9.99-14.99 CAD/mo; differentiators: AI on CA KB + Pro Tools suite + native CAD; closest threats: Milesopedia + Prince of Travel; long-term: US apps (MaxRewards/WalletFlo) entering Canada |
| Knowledge base content | 27 programs / 20 cards in YAML (DB has 92, so ~70 cards untouched in narrative); no devaluation history; no transfer-bonus history; prompt is full-dumped (6-9K tokens) every call; wallet-filter param exists but called with nil |
| Observability + CI/CD | P0 chat.go:92 leaks AI errors to client; no security scans in CI; no Docker build verification; mixed log.Printf/slog; 46 handler sites leak raw errors; no retries; container runs as root |

---

## Phase 1 — Wave 1 backend execution (3 parallel coding agents + direct edits)

### Agent A: Pricing trust layer

**What broke**: CPP numbers came from a 2-month-old manual seed; only 6 award programs; taxes silent-zero; no live/estimated distinction.

**What shipped** (`internal/quota/`, `internal/handler/admin_valuation.go`, `internal/middleware/admin.go`, `cmd/refresh-valuations/`, `internal/cache/redis.go`, `internal/service/serpapi.go`, `internal/service/seatsaero.go`, `internal/service/award_search.go`):

| Item | Detail |
|---|---|
| Migration 33 | `point_valuation_history` table + `recorded_at` column on `point_valuations` |
| Quota tracker | Monthly INCR Redis counter for SerpAPI (250), Apify (∞), Tavily (1000). Returns `ErrQuotaExhausted` instead of silent fallback |
| Redis cache for award search | 45-min TTL by route + cabin + pax; `GetAwardSearch` / `SetAwardSearch` |
| Taxes honest | `TaxesCash *float64` (nullable), `TaxesIncluded bool` — no more silent `$0`. Apify-source rows populate; Seats.aero leaves nil |
| `FetchedAt` + `SourceLabel` | Every result row carries the timestamp + which upstream produced it (`Apify` / `Seats.aero` / `Google Flights` / `estimate`) |
| SerpAPI round-trip | Hard-coded one-way replaced with `type=1` when `return_date` is supplied |
| Admin endpoints | `POST /admin/valuations` (push fresh CPP), `GET /admin/quota` (remaining budget per provider) — gated by JWT + email allow-list + CSRF |
| `cmd/refresh-valuations` | Standalone CLI binary; re-anchors `recorded_at` and writes one history row per valuation; designed for weekly cron |

### Agent B: KB expansion + AI chat persistence

**What broke**: KB hadn't been updated since the initial seed; AI chat dumped the entire 53KB YAML into every prompt; free users got 1 message per month then nothing.

**What shipped** (`internal/knowledge/rewards.yaml`, `internal/knowledge/credit_card_strategies.yaml`, `internal/knowledge/loader.go`, `internal/repo/chat.go`, `internal/handler/chat.go`, `internal/service/ai.go`, `internal/service/ai_tools.go`):

| Item | Detail |
|---|---|
| Migration 34 | `chat_conversations` + `chat_messages` tables (server-side AI chat history) |
| `internal/repo/chat.go` | CRUD + tests for chat persistence |
| `rewards.yaml` | New `devaluation_log` section (5 entries) + new `transfer_bonus_log` (4 entries) |
| `credit_card_strategies.yaml` | 30 new card narratives + 10 step-by-step booking walkthroughs (~700 lines added) |
| Wallet-aware prompt | `FormatForPrompt(userPrograms)` now actually wired with the user's wallet — shrinks per-request token cost |
| New AI tool | `get_devaluation_history` — free-tier, reads `devaluation_log` |
| Free-tier cap | Bumped from 1/month to **5/month** — single bad question no longer burns the entire trial |
| Chat persistence | `NewChatHandlerWithRepo` constructor, `persistChat`, `ListConversations`, `GetMessages` methods; routes `GET /chat/conversations`, `GET /chat/conversations/{id}/messages` |

### Agent C: Brand baseline

**What broke**: No logo chosen, no voice doc; em-dashes and AI clichés everywhere; pricing's free tier read as a trap; two clashing empty-state systems (emoji + paper substrate).

**What shipped** (`BRAND.md`, `frontend/app/page.tsx`, `frontend/app/pricing/page.tsx`, `frontend/app/onboarding/page.tsx`, `frontend/components/editorial/EmptyState.tsx`):

| Item | Detail |
|---|---|
| `BRAND.md` (NEW, 613 words) | Voice (3 adjectives + 5 banned words), palette, type, logo clear-space, logo selection open question |
| Em-dash pass | Landing 4→0, pricing 4→0, onboarding 1→0 |
| Banned-word pass | Removed: "unlock", "wedge", "vibes", "leakage", "ruled bar", "register" (catalog sense) |
| Landing changes | Social-proof band (3 quote cards), founder/origin note, fixed card count 102→92, replaced "we don't speak American" with the concrete competitive line |
| Pricing changes | Beta-free banner surfaced above tier cards (was buried in FAQ); Free tier rewritten as a confident product; ROI anchor between tier table + FAQ; "Subscribe" → "Start Pro" |
| Onboarding | Jargon swapped to plain words; "~90 seconds · 4 steps" hint added |
| `EmptyState` | NEW editorial primitive; legacy emoji empty-state replaced with Lucide icons; adapter preserves existing imports |

### Direct edits I made (security/observability)

**What broke**: 13 handler sites returned raw `err.Error()` to clients (leaked DB schema names); H8 P0 in chat.go leaked Anthropic error bodies; Stripe email could smuggle params; rate-limit goroutines couldn't be stopped; no body-size limits; CORS wildcard would happily ship in prod.

**What shipped**:

| Fix | Severity | File(s) |
|---|---|---|
| `log.Printf` → `slog` + new `jsonMaskedError` helper | P1 | `handler/helpers.go` |
| H2: Stripe checkout params via `url.Values{}` (email injection closed) | High | `service/billing.go` |
| M1: refresh-token reuse detection — revoke-all on replay | Medium | `service/auth.go` |
| `fmt.Printf` → `slog` for warn logs | Info | `service/auth.go` |
| Error-leak masks via `jsonMaskedError` — 13 sites across 9 handler files (missed_rewards, credits, sqc, buy_points, stack, loyalty_account, card_offer, devaluation, csv_import) | P1 | various |
| Ratelimit cleanup goroutines made ctx-cancellable via `.Stop()` | P2 | `middleware/ratelimit.go` |
| New `BodyLimit(maxBytes)` middleware + size constants | High (H6) | `middleware/bodylimit.go` (NEW) |
| `RotateCSRFCookie(w)` for post-login fixation defense | Medium (H5) | `middleware/csrf.go` |
| P0: AI chat errors masked with timeout-class hint — raw `err.Error()` no longer leaks | **P0** | `handler/chat.go` |
| `decodeGoogleIDToken` renamed to `decodeGoogleIDTokenTestOnlyUnsafe` | Medium (M7) | `handler/auth.go` |
| New `SlogContext` wrapper + `HTTPRequestLogger` middleware (threads request_id + user_id + is_pro) | P1 | `middleware/contextlog.go` (NEW) |
| Dockerfile: `USER 10001:10001`, knowledge YAML copy | P1 | `Dockerfile` |
| `.dockerignore` (NEW) | P2 | `.dockerignore` |
| CI: golangci-lint + govulncheck + Docker build verification (non-root check) + npm audit + frontend production build | P1 | `.github/workflows/ci.yml` |

### main.go integration

After the agents finished, I wired everything into `cmd/api/main.go`:

- Quota client wired, passed into SerpAPI
- `KB_DIR` env → `filepath.Join` (container-safe)
- ChatRepo + `NewChatHandlerWithRepo`
- Admin handlers + `splitCSV(ADMIN_EMAILS)` + admin route group
- Chat conversation history routes (JWT-gated)
- `HTTPRequestLogger` replaces `middleware.Logger` (structured JSON request log)
- `rl.Stop()` / `userRL.Stop()` on shutdown
- `init()` startup guard: production refuses `CORS_ORIGIN=*`, empty, or non-https
- `BodyLimit(BodyLimitJSON)` on /api/v1; `BodyLimit(BodyLimitCSV)` for CSV import group
- `RotateCSRFCookie(w)` applied in Register, Login, GoogleAuth, Refresh, Logout, ChangePassword

---

## Phase 2 — Wave 2 frontend redesign (2 parallel agents)

### Agent D: Pro Tools refactor

**What broke**: `frontend/app/pro-tools/page.tsx` was a 1759-LOC monolith with inline tile components, no personalization, generic "Add cards at /wallet to unlock X" empty states 5 times over.

**What shipped**:

| Item | Detail |
|---|---|
| Page LOC | **1759 → 218** (-1541, -87.6%) |
| New `frontend/components/editorial/PaperTile.tsx` | Shared cream-paper substrate primitive (reusable on pricing too) |
| 14 tiles extracted to `frontend/components/pro-tools/` | MissedRewardsTile, CreditsTile, CardValueTile, SQCTile, AwardWatchTile, StackTile, BuyPointsTile, DevaluationTile, IndiaArbTile + re-export shims for StackTemplates, IssuerChangesTile, LoyaltyAccountsTile, CardOffersTile, PCOptimumModule |
| `PersonalStrip.tsx` | Top-of-page personalized strip: "$X recoverable this month / N expiring credits / M% to SQC next tier" — parallel API calls, auto-hides if any fails |
| `WalletStatsStrip.tsx` | Coarse wallet stats extracted |
| `UpsellWall.tsx` | Free-user upsell extracted |
| Banned-word count | 4 → 0 in pro-tools |
| Em-dash count | ~80% reduction in user-visible copy |
| 5 inline empty states | Replaced with the new `EmptyState` primitive |

### Agent E: Trip planner UX

**What broke**: One-way only; segment details hidden; no wallet-afford pill; no "Save trip" CTA; no booking links; no source-distinction badge; trip-planner page on the legacy dark-token system.

**What shipped** (`frontend/app/trip-planner/page.tsx` + 4 new components):

| Item | Detail |
|---|---|
| `SourceBadge.tsx` | 3 explicit states — live (green dot + "Priced X min ago via {Apify\|Seats.aero\|Google Flights}"), estimated (amber badge + tooltip), live_search (gray badge). Auto-refreshes "N min ago" label every 60s. |
| `SegmentDetails.tsx` | Collapsible per-row flight table — flight code (mono), route, depart→arrive, aircraft (serif italic) |
| `WalletAffordPill.tsx` | Anonymous-hide; green "Covered" or amber "Short N pts" + "Boost via {partner}" Link to /wallet |
| `LoadingPills.tsx` | framer-motion progressive pills replacing the single 30-90s pulse dot |
| Taxes honest | "+ $XX taxes" only when `taxes_included` true; otherwise "taxes/fees not included". Never silent $0. |
| Return-date picker | Submit label flips to "Search round-trip" when set; round-trip CPP rendered if backend returns `return_leg` |
| URL state | Form parameters hydrate from `?origin=&dest=&date=&cabin=&pax=`; replaced via router.replace on every change → shareable searches |
| Save-trip CTA | Pro users get a working button hitting `createAwardWatch`; non-Pro see disabled "Save trip · Pro" hint |
| Em-dash + banned-word pass | 6 → 0 visible em-dashes |
| `EmptyState` used | Null / zero-results / error branches with "Try YYZ → LHR" sample CTA + assistant-link fallback |

---

## Phase 3 — Bring up the local stack + fix real bugs on the live app

**What broke**: Backend / frontend weren't running locally; once running, the user spot-checked trip-planner and surfaced several real bugs.

**What shipped**:

| Issue | Fix |
|---|---|
| Stale `api` process on :8080 | Killed, hard-restarted with fresh `go run ./cmd/api` |
| DB at migration 32, code expected 34 | `make migrate-up` applied 33 + 34 |
| Frontend not running on :3000 | `npm run dev` in background; Next.js Turbopack ready in 2.2s |
| User screenshot showed 9.96¢ CPP "EXCELLENT" with $8767 cash | Diagnosed: legit Apify data — same-day biz cash IS that high. Math is right, label is misleading. |
| No "Book →" link in result rows | Backend already generated `booking_url` server-side; frontend wasn't rendering. Added Book ↗ pill linking to the program's award search. |
| Rating thresholds cabin-blind | Made `rateValue(cpp, cabin)` cabin-aware. Bumped business floor: ≥10¢ excellent / ≥5¢ good (was 5/3). 9.96¢ now reads "good" not "excellent". |
| Cash baseline opaque | Added "vs business cash" caption under each `$cash` |
| User flagged "false values" intuition | Added a second SerpAPI probe for economy cash on premium-cabin searches; new `RealisticCPP` field renders as `1.25¢ vs economy` under the headline CPP — the "would I actually pay this?" figure |
| Same-day search showed inflated cash | Added a soft date-warning when departure is within 14 days: italic caption *"Last-minute departure. Cash fares jump 2-3× inside 14 days — try 3+ weeks out for typical redemption value."* |
| Apify out of credit | User supplied new token `apify_api_c2ESZ...`; `.env` updated via sed; backend hard-restarted |
| "Same nonsense" on repeat search | Diagnosed: 45-min Redis cache replay. Flushed 8 award-search keys + 9 valuation keys. Verified next search ran live (41.9s + new fetched_at) |
| User wanted a permanent way to force fresh | Added `refresh bool` to `AwardSearchRequest`; backend skips cache GET when true. New "↻ Refresh live data" pill below the results — verified end-to-end (cache hit 0.0s vs refresh 26.0s, fetched_at advanced) |

---

## Phase 4 — Lead research (sales + media + capital)

**What broke**: You wanted leads to drive distribution, press, and capital. The skill triggered with the `/lead-research-assistant` command.

**What shipped**: One Markdown file (`LEADS.md` at repo root) containing 39 fit-scored leads + 5 paste-ready outreach drafts.

| Category | Count | Top picks |
|---|---|---|
| Affiliate / partnership | 13 | Neo Financial (10/10), Scotiabank (10/10), BMO (9/10) |
| Media / PR | 15 | Erica Alini at Globe (10/10), Jessica Gibson at MoneySense (10/10), Josh Scott at BetaKit (10/10) |
| Investor / fundraising | 11 | Golden Ventures (10/10), Maple VC (10/10), Luge Capital (8/10) |

**Process notes**:

- Plan reviewed via Ultraplan (cloud) — refined plan added repo-evidence anchoring (every outreach must cite a verifiable feature, not a marketing claim)
- 12 leads dropped with explicit rationale (CBC's Pittis, Hansen left in 2022; TPG has no Canada desk; Information VP went Series A; Real Ventures fundraising paused; etc.)
- 5 paste-ready outreach drafts written: Neo (Fintel Connect application), Scotia (same), Ameet Shah at Golden Ventures (cold investor email), Josh Scott at BetaKit (launch story pitch), Erica Alini (newcomers' angle pitch)
- CSV table at the end of each category — paste into a CRM / Notion

---

## Phase 5 — Final production hardening (deferred until outreach pause)

**What broke**: Audits flagged 4 remaining items: award-watch worker not scheduled, H7 IDOR variadic footgun, no metrics endpoint, no per-route timeouts.

**What shipped**:

| # | Item | Detail |
|---|---|---|
| 20 | Award-watch scanner | Confirmed `cmd/worker` already implements it. Added scheduling section to `SHIP.md` §6b (was missing). It's a long-running daemon — needs a separate Fly app or supervisord, not a one-shot cron. |
| 21 | H7 IDOR variadic footgun | 5 handler constructors (`NewOptimizerHandler`, `NewTripHandler`, `NewAwardSearchHandler`, `NewStackHandler`, `NewChatHandler`) changed from variadic to positional `sessionLookup mw.SessionOwnerLookup`. Tests updated to pass `nil` explicitly. A future caller can no longer silently drop the IDOR check. |
| 22 | `/metrics` endpoint | New `internal/metrics` package with 13 expvar counters (SerpAPI/Apify/Tavily/Anthropic calls + errors, cache hits/misses, chat free/pro counts) + uptime + memstats. New `handler/admin_metrics.go`. Wired at `GET /api/v1/admin/metrics` behind the admin guard. |
| 23 | Per-route Timeout middleware | `middleware.Timeout(30 * time.Second)` applied to auth, wallet-owner, Pro-tier, Pro-compute, chat-conversations, and admin route groups. Split the anonymous-compute group: fast subgroup (wallet/optimize/recommend) gets 30s; long routes (chat, /chat/stream, /trip/evaluate, /trip/award-search) keep server's 5-min default for Apify polling. |
| 24 | Browse-test | Skipped — chrome-devtools-mcp profile was locked by an existing browser; no API to force-reset. Manual verification at http://localhost:3000 is fine. |
| 25 | README refresh | Migration count 9→34. Architecture diagram redrawn with the full middleware stack. Tech stack updated (Stripe webhook details, quota tracker, expvar metrics). Data model section expanded from 12 to 20+ tables grouped semantically. Project structure includes `cmd/worker`, `cmd/refresh-valuations`, `quota/`, `metrics/`, the new component dirs. New "Production Operations" section links to SHIP.md / SECURITY.md / BRAND.md / DEPLOY.md. |
| — | `go vet` cleanup | Fixed `_ struct{}` xml-tag warning in `feed_aggregator.go` |

---

## Documents created or rewritten this session

| File | Purpose |
|---|---|
| `BRAND.md` (new) | Voice + banned-word list + palette + type + logo clear-space |
| `SECURITY.md` (new) | Threat model + every defense layer documented |
| `SHIP.md` (new) | Single-page production deployment checklist (10 ordered steps + worker scheduling) |
| `LEADS.md` (new) | 39 leads (affiliate / media / investor) + 5 outreach drafts + CSV tables |
| `WORK-LOG.md` (this file) | Chronological log of everything shipped this session |
| `.dockerignore` (new) | Lean Docker build context |
| `docs/DEPLOY.md` (updated) | Migration drift fixed (20 → 34); ADMIN_EMAILS + KB_DIR documented |
| `CLAUDE.md` (updated) | Architecture diagram + env vars + CI sections rewritten |
| `README.md` (updated) | Refreshed for current state — see Phase 5 row 25 |

## Code packages created this session

| Path | Purpose |
|---|---|
| `internal/quota/` | Monthly Redis INCR counter for SerpAPI / Apify / Tavily quotas |
| `internal/metrics/` | Process-level expvar counters surfaced at /admin/metrics |
| `internal/middleware/admin.go` | `RequireAdmin([]string)` — JWT email allow-list |
| `internal/middleware/bodylimit.go` | `BodyLimit(maxBytes)` — JSON / CSV / AI size constants |
| `internal/middleware/contextlog.go` | `SlogContext` wrapper + `HTTPRequestLogger` middleware |
| `internal/handler/admin_valuation.go` | `POST /admin/valuations` (push) + `GET /admin/quota` (dashboard) |
| `internal/handler/admin_metrics.go` | `GET /admin/metrics` (process snapshot) |
| `internal/repo/chat.go` | DB-backed AI chat history |
| `cmd/refresh-valuations/` | Weekly cron binary — re-anchors CPP freshness |
| `frontend/components/editorial/PaperTile.tsx` | Shared editorial tile primitive |
| `frontend/components/editorial/EmptyState.tsx` | Unified empty-state primitive (Lucide replaces emoji) |
| `frontend/components/pro-tools/*` | 14 extracted Pro Tools tiles + PersonalStrip + UpsellWall |
| `frontend/components/trip-planner/*` | SourceBadge, SegmentDetails, WalletAffordPill, LoadingPills |

## Database migrations added

- `000033_valuation_history` — `point_valuation_history` table + `recorded_at` on `point_valuations`
- `000034_chat_messages` — `chat_conversations` + `chat_messages` tables

---

## Verification gates (final state)

| Gate | Result |
|---|---|
| `go build ./...` | clean |
| `go vet ./...` | clean |
| `go test -count=1 ./internal/...` | all packages pass (handler, middleware, quota, repo, service) |
| `npx tsc --noEmit` (frontend) | clean |
| `npm run build` (frontend) | 22 routes prerender |
| Live backend | PID on :8080, `/ready` returns 200, Redis connected, structured slog JSON output working |
| Live frontend | :3000, Turbopack hot-reload, 22 routes |

---

## What's left — only you can do these

1. **Top up Apify credit** — your scraper had $1 left when I checked. Without credit, the trip-planner falls back to YAML estimates instead of live data. (https://console.apify.com/billing/subscription)
2. **Pick a logo** from `design/logo-explorations/` — six rounds, zero selection. BRAND.md is waiting on this.
3. **Set `ADMIN_EMAILS`** in production — admin routes deny every request until this is set.
4. **Deploy** — `SHIP.md` is the runbook. 10 steps end-to-end.
5. **Send the outreach** when you have a live URL + traction numbers — drafts in `LEADS.md`.

If any of those needs more help (e.g. you want me to walk through deploying to Fly step by step, or draft outreach follow-up bumps once you've sent the first wave), just ask.
