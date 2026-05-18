# MapleRewards — Full Codebase Review & Competitive Feature Strategy

_Date: 2026-05-18. Read-only audit. No code changed. Compiled from 5 parallel deep-dive agents: backend inventory, frontend inventory, AI-assistant + travel-planner internals, Canadian competitor research, US/international competitor research._

Companion file: `docs/COMPETITOR-RESEARCH-CANADA.md` (full per-competitor Canadian breakdown).

---

## 0. Executive Summary

**What you have:** a genuinely deep, Canada-native rewards engine. ~94 seeded cards, ~17 loyalty programs, 80+ endpoints, a 15-tool Claude assistant with streaming + tool-status pills, a multi-source award engine (Seats.aero + Apify + SerpAPI), a forensic missed-rewards engine, SQC/buy-points/stacking/portfolio Pro tools, devaluation + transfer-promo sentinels, full auth/billing/CASL/PIPEDA plumbing. This is far past MVP.

**The strategic finding (from competitor research):** the Canadian market splits three ways and **you own the empty slot**. Milesopedia and Prince of Travel — the two biggest Canadian players — are content/affiliate media businesses with toy tools and no real personalized optimizer. The serious software (CardPointers, MaxRewards, point.me, AwardWallet, Seats.aero, PointsYeah, Roame) is **not Canada-card-aware** — none model Cobalt, Aeroplan SQC, Costco-Mastercard routing, or Canadian issuer cooldowns. No Canadian-native personalized optimizer of any depth exists. That is your moat.

**The three priority pages, one-line diagnosis each:**
- **Pro Tools** — breadth over depth. 14 tiles, but 5 are re-export shims, most are read-only report dumps, no drill-down/export/action-chaining, and the personalized strip silently vanishes on any single endpoint failure.
- **AI Assistant** — strong engine, weak product shell. No conversation persistence in the UI, no token-by-token text streaming, no personalized prompts, broken `/chat?q=` deep-link, free-tier copy contradicts config, tool evidence dropped between turns, hotel tool is a stub, no proactive nudges.
- **Travel Planner** — strong data engine, high-friction UX. No airport autocomplete, no sort/filter, no aggregate verdict, no date-flexibility calendar, no round-trip/multi-city, hotels are YAML-only, transfer-bonus data ignored by the planner math, single-hop transfers only.

**Highest-leverage moves (detail in §5):**
1. Plumb real Anthropic token usage into budget accounting (correctness + cost; lowest effort, highest correctness payoff).
2. Transfer-bonus-aware award pricing (you uniquely own the Canadian promo data — nobody else can do this).
3. AI assistant that searches *and* creates alerts from natural language + proactive nudges.
4. Conversation persistence + token-streaming in the chat UI (the engine already supports it server-side).
5. Date-flexibility price calendar + airport autocomplete + results sort/filter in the trip planner.
6. Fix the cross-page integration debt (broken `/chat?q=`, saved-trip → award-watch disconnect, free-tier copy mismatch).
7. Cashback-on-application affiliate rebate — the #1 strategic monetization gap vs every Canadian competitor.

---

## 1. What MapleRewards Offers Today (Feature Inventory)

### 1.1 Backend (Go / Chi / Postgres / Redis)

**Core engines** (`internal/service/`):
- `optimizer.go` — best card per purchase, cap-aware (cap remediation WIP, migrations 48/49).
- `recommender.go` — ranks cards from a monthly-spend profile (no-wallet users).
- `missed_rewards.go` — forensic "what you left on the table" vs optimal card.
- `stack.go` — triple-stack (portal × card × network offer).
- `buy_points.go` — buy-vs-earn break-even verdict + live promo pricing.
- `sqc.go` — 2026 Aeroplan Status Qualifying Credits projection.
- `trip.go` (1153L) — wallet-relative redemption ranking (points vs cash, transfer routing).
- `award_search.go` (984L) — live multi-source award availability orchestrator.
- `welcome_bonus_mission.go`, `devaluation.go`, `aeroplan_lockin.go` — Pro forensic/status tools.

**AI assistant:** `ai_tools.go` (1540L, live tool-loop path), `ai.go` (1142L, **dead legacy path**), `ai_budget.go` (per-user daily token cap).

**Data integrations:** Anthropic, Apify (flight-award scraper), Stripe, Seats.aero, SerpAPI (Google Flights), Tavily (web search), Resend (email). All gated by `IsAvailable()` for graceful degradation.

**Background workers:** promo sentinel (AI-classified transfer bonuses), issuer-page diff-watch, weekly issuer + missed-rewards digests, feed aggregator, valuation refresh.

**Endpoints:** 80+ across public catalog, anonymous-friendly compute (optimize/recommend/trip/chat), auth/billing, wallet-owner CRUD, Pro-gated tools (missed-rewards, credits, SQC, award-watches, card-value, loyalty-accounts, offers, buy-points, stack), chat history, admin.

**Data:** ~94 seeded cards (docs claim 104 — discrepancy), ~17 loyalty programs, **only ~7 transfer-partner routes** (thin — Marriott→airline + per-tier bonuses missing), knowledge YAML = `credit_card_strategies.yaml` (1397L, 46 card blocks) + `rewards.yaml` (860L, 15 airline programs).

### 1.2 Frontend (Next.js 16 / React 19 / Tailwind 4)

33 pages, 71 API client functions, 4 React contexts (auth, session, wallet, sidebar), ~80 components. Editorial design language (inline-styled CSS custom-property tokens). Free/Pro $39.99/yr / Pro Plus $69.99/yr / Lifetime $199 tiering. Transparent refresh-on-401, CSRF double-submit, in-memory access token + httpOnly refresh cookie (XSS-hardened).

---

## 2. Priority Page Deep Dive — Current State & Gaps

### 2.1 Pro Tools (`app/pro-tools/page.tsx` + `components/pro-tools/*`)

**Current:** 230-line coordinator → 4 tabs (Forensics / Status / Stacking / Knowledge), 14 tiles. Richest: `MissedRewardsTile` (271L). Interactive: only `StackTile`, `BuyPointsTile`, `AwardWatchTile`. The rest are read-only dumps.

**Gaps:**
- 5 of 14 tiles are 5-7 line re-export shims of older flat files — the "14 tools" headline is partly indirection, not depth.
- Tab metadata wrong (Knowledge labeled "3" renders 2).
- `WalletStatsStrip` is fully static/cosmetic ("Tools live: 14", "Currency: CAD") — wasted prime real estate.
- `PersonalStrip` is all-or-nothing: one slow Pro endpoint hides the entire above-the-fold personalized band.
- No drill-down, no export (except MissedRewards `sinceDays`), no cross-tile action-chaining ("you missed $X → fix it" never links to the optimizer/wallet), no global refresh, no last-updated timestamps.
- Empty states all point to the same `/wallet` CTA — repetitive, no progressive guidance.

### 2.2 AI Assistant (`app/chat/page.tsx` ~560L + `ai_tools.go`)

**Engine (strong):** Anthropic tool-use loop, model `claude-sonnet-4-6` (free 1500 / Pro 4096 max_tokens), `maxRounds=5` (tools withheld round 5), 15-tool registry with Pro filtering so free tier can't hallucinate Pro tools, slug-alias normalization, prompt caching (2 blocks: static + per-user wallet), parallel tool dispatch with panic recovery, SSE streaming with tool-status pill events, server-side conversation persistence for authed users.

**Gaps (engine):**
1. **Token budget under-counts massively.** Real Anthropic `Usage` is parsed and logged (`ai_tools.go:96`, `:1372`) but never returned to the handler — handler re-estimates via `3000 + msgLen/3.5` (`chat.go:563`), ignoring tool round-trip input, cache tokens, multi-round output. A 5-round Apify-heavy Pro query burns 50K+ real tokens, billed ~3K. **The 25K free cap is bypassable.** Highest-value, lowest-effort fix.
2. No cross-session memory/personalization beyond the freshly-injected wallet (no home airport, cabin preference, risk tolerance, trip history).
3. Tool evidence dropped between turns — history replay is text-only; "what about February?" forces a full re-search.
4. `search_hotels` is a hardcoded `beta_stub` — hotels unanswerable with live data.
5. No proactive suggestions despite owning `project_aeroplan_devaluation` / `evaluate_missed_rewards` / `list_my_award_watches`.
6. Flexible-currency detection is a hardcoded program-name string match (`ai.go:262`) — wrong for Scotia/HSBC/Brim/MBNA.
7. Dead legacy `ai.go Chat` path (~600L incl. regex parser + static KB dump) — maintenance footgun.

**Gaps (UI):**
- **No conversation persistence in the UI** — history is in-memory only; refresh wipes it. Server persists for authed users but no list/sidebar/resume.
- No token-by-token text streaming — only pills animate; final answer lands as one block on `done`.
- Pills cleared on `done` — user loses the trail of what the AI searched.
- **Suggested prompts are static**, not personalized to the user's wallet (contradicts the "wired to your wallet" promise).
- **Broken `/chat?q=` deep-link** — trip-planner links prefilled questions to chat; chat never reads `q`. Dead handoff between two priority pages.
- **Free-tier copy says "5 messages/month"; `FREE_LIMITS.maxChatMessagesPerMonth = 1`.** Trust erosion at the conversion moment.
- No copy/regenerate/edit-resend/stop-generation/feedback affordances, no citation panel even in research mode.

### 2.3 Travel Planner (`app/trip-planner/page.tsx` ~640L + `trip.go` + `award_search.go`)

**Engine (strong):** two subsystems — `EvaluateTrip` (wallet-relative ranking, transfer graph, KB-seeded so never empty) and `AwardSearch.Search` (4 parallel sources, Apify-overrides-Seats.aero merge, economy-baseline RealisticCPP anti-inflation signal, 45-min route-keyed cache with wallet re-overlay). UI persists form state to URL (shareable).

**Gaps:**
- **No airport autocomplete** — raw 3-letter IATA only. High friction, error-prone.
- **No results sort/filter** — order fixed by backend CPP; can't sort by points/cash/stops/program or filter to transfer-partner-only.
- **No aggregate verdict** — points-vs-cash is per-row across 12 rows; the user computes the decision the page exists to make.
- **No date-flexibility calendar** — `EvaluateTrip` is single-date; `AwardSearch` has `flex_days` but returns a flat list, no cheapest-date grid.
- **No round-trip / multi-city / open-jaw** — `TripRequest` is single origin→dest, one date.
- **Hotels are YAML-only** (`trip.go:779`); award-search has no hotel path; chat's hotel tool is a stub — hotels unserviceable end-to-end.
- **Single-hop transfers only** (`trip.go:377`) — no chained card→Amex MR→Aeroplan routing.
- **Transfer-bonus data ignored by planner math** — `TransferBonusLog`/`SweetSpots` exist in KB and are exposed to chat, but `EvaluateTrip`/`Search` ignore active bonuses; a 30% Amex→Aeroplan bonus changes no planner number.
- Circular CPP fallback (`trip.go:475/559`) makes `SavingsRating` meaningless when no cash price.
- Only 6 `seatsAeroSources` programs (no AA/Delta/Alaska/Singapore/Emirates/Qatar live availability).
- No saved trips / no booking handoff; saved trips disconnected from the Pro Tools `AwardWatchTile`.

---

## 3. Competitor Landscape (condensed — full detail in companion file)

**Canada:**
- **Milesopedia / Prince of Travel** — content + affiliate media; toy tools; PoT now paid ($335/yr membership, "Ask Prince of Travel" AI as primary CTA). No real personalized optimizer.
- **CreditCardGenius** — card-comparison scoring engine + **GeniusCash cashback-on-application rebate** (shares affiliate commission back to users — documented payout-delay complaints).
- **Frugal Flyer** — beloved niche tools (transfer-path explorer, rebate meta-comparison) + FlyerFunds rebate.
- **Rewards Canada** — "Ultimate Portfolio" concept: prescribe a card *stack*, not just optimize the existing wallet.

**US / International (the serious software, none Canada-aware):**
- **CardPointers** ($90/yr) — no-credential wallet (card name + approval date only), browser extension that client-side auto-enrolls Amex/Chase offers without storing logins, AutoPilot geofenced lock-screen card, per-store "pin a card", renewal-value-realized calculator.
- **MaxRewards** (~$108/yr) — auto-enrolls rotating quarterly 5% categories; **fatal flaw: stores bank credentials** (every competitor attacks this).
- **Kudos** ($49.99/yr) — at-checkout card picker, **Boost = 100% affiliate commission passed back as points**, MariaGPT card-discovery chatbot.
- **AwardWallet** ($49.99/yr) — tiered expiration ladder (90/60/30 + daily-final-7), calendar sync, email-forward itinerary parser → unified Timeline, "loyalty net worth" hero metric.
- **point.me** ($129–$260/yr) — step-by-step booking instructions per result, productized human concierge.
- **Seats.aero** ($99.99/yr) — 2026 AI assistant that searches AND auto-creates alerts from natural language.
- **Roame** ($109/yr) — SkyView region-to-region "where can my points take me" exploratory search; eSIM ancillary revenue.
- **PointsYeah** ($99.99/yr) — **transfer-bonus-aware result pricing** (effective cost after live promos); two alert triggers (price-drop + new-inventory).
- **Travel Freely** (free, affiliate-only) — proves a free SUB/5-24 churning tracker is viable on affiliate alone.
- **WalletFlo** — discrete **Eligibility Checker** (input target card → eligible/not + reason).
- **TPG** — monthly published points-valuation index (the citable industry benchmark).

---

## 4. Feature Recommendations — Ranked

Scored by **impact × fit with existing infra**. T1 = highest impact, infra mostly exists.

### TIER 1 — Do these first

| # | Feature | Page | Why it wins | Infra status |
|---|---------|------|-------------|--------------|
| 1 | **Real token-usage accounting** — plumb Anthropic `Usage` (input+output+cache) through `ChatResponse` → `budget.Consume` | AI | Correctness + real cost control; free cap currently bypassable | Usage already parsed & logged; ~1 plumbing change |
| 2 | **Transfer-bonus-aware award pricing** — show effective points cost after live promos, cash-vs-points side-by-side with auto-CPP verdict badge | Travel + AI | PointsYeah's killer mechanic; **you uniquely own Canadian promo data** — nobody else can do this for Canada | Promo sentinel + stacking engine + KB SweetSpots already exist; wire into `EvaluateTrip`/`Search` |
| 3 | **AI that searches AND manages alerts from natural language** + proactive nudges ("your Aeroplan loses $340 on June 1") | AI | Seats.aero 2026 pattern; you already have the Pro forensic tools the assistant never volunteers | Tool registry + award-watch repo exist; add `createAwardWatch` tool + activate the deferred award-watch cron worker |
| 4 | **Conversation persistence + token-streaming in chat UI** — sidebar list, resume, titles; stream final text token-by-token; keep tool pill trail | AI | Server already persists for authed users + SSE supports it; pure UI gap | Backend done; frontend only |
| 5 | **Trip planner UX core** — airport autocomplete, results sort/filter, single aggregate "best value" verdict, date-flexibility price calendar | Travel | Removes the highest-friction blockers; the page exists to make a decision it currently leaves to the user | Award engine has `flex_days`; needs UI + a calendar aggregation pass |
| 6 | **Fix cross-page integration debt** — chat reads `?q=`; saved-trip ↔ `AwardWatchTile` link; align free-tier copy to config | All 3 | Trust + closes dead handoffs between the exact 3 priority pages | Trivial |
| 7 | **Cashback-on-application affiliate rebate** (GeniusCash/FlyerFunds model) | Monetization | #1 strategic gap vs every Canadian competitor; acquisition + revenue flywheel | Affiliate click-log stub exists; needs payout ledger |

### TIER 2 — High impact, moderate build

8. **"Loyalty net worth" hero metric** + retrospective "you used X, best was Y, +$Z" feed — re-skin existing portfolio valuation + missed-rewards (AwardWallet/TPG/Curve narrative). _Pro Tools._
9. **Tiered expiration + renewal alert ladder** (90/60/30 + daily-final-7) with `.ics` calendar sync + VAPID push. _Pro Tools._ (Push infra shipped.)
10. **SUB / min-spend progress tracker + Canadian Eligibility Checker** — input target card → engine evaluates Amex once-per-lifetime / RBC 1-per-90d / TD 12-mo cooldown → eligible + reason. Zero competitors do this for Canada; pairs with affiliate. _Pro Tools._ (`issuer_rules` table + applications repo exist.)
11. **Region-to-region exploratory award search** ("where can my Aeroplan points take me") — Roame SkyView pattern. _Travel._
12. **Step-by-step booking instructions per result** ("transfer N pts Amex MR → Aeroplan, book segment") — point.me mechanic, natural Claude output. _Travel + AI._
13. **Real hotel data source** shared by trip + award + chat (replaces the YAML-only / stub gap). _Travel + AI._
14. **Pro Tools depth pass** — collapse the 5 shim tiles into real components, kill the cosmetic `WalletStatsStrip`, make `PersonalStrip` degrade gracefully per-card, add drill-down + action-chaining (missed-reward → optimizer). _Pro Tools._

### TIER 3 — Differentiators / content moat

15. **Published monthly Canadian points-valuation index** (TPG model) — Aeroplan/Avion/Scene+ cents-per-point, methodology page. Owns the SEO term, becomes the citable benchmark, powers every internal CPP calc. (Aeroplan dynamic pricing since Mar 2025 broke every static Canadian chart — a *live* lookup is a genuine moat.)
16. **Per-store/category "pin a card"** override (CardPointers).
17. **No-credential at-checkout browser extension** (CardPointers model, never store credentials — market as the security differentiator vs MaxRewards).
18. **Household / multi-member wallet** (flagged in Canadian research as an untapped concept).
19. **Productized concierge** with small non-refundable initiation fee (point.me/10xTravel) — high-margin upsell, AI does 80% of prep.
20. **Round-trip / multi-city / chained-transfer routing** in the planner.

### Cross-cutting UX lessons from competitor complaints
- Never store bank credentials (MaxRewards' fatal flaw — make no-credential your headline trust message).
- Browser-extension pop-ups must be per-site configurable from day one (CardPointers' #1 complaint).
- Always show "cross-verify before transferring" on cached award data (phantom-availability hits Seats.aero/PointsYeah/Roame).
- Don't fully paywall the signature feature (Roame's crippled free tier → churn).

---

## 5. Suggested Sequencing

**Wave 1 (correctness + trust, low effort):** #1 token accounting, #6 integration debt + copy fix, #4 chat persistence/streaming UI.

**Wave 2 (the moat, medium effort):** #2 transfer-bonus-aware pricing, #3 NL-alerts + proactive nudges, #5 trip-planner UX core.

**Wave 3 (monetization + depth):** #7 affiliate rebate, #10 eligibility checker + SUB tracker, #14 Pro Tools depth pass, #8/#9 net-worth + alert ladder.

**Wave 4 (differentiation):** #15 valuation index, #11/#12/#13 exploratory search + booking instructions + hotels, #17 extension.

---

## 6. Notable Discrepancies / Cleanup Surfaced (not bugs to fix now, but flagged)

- Card count: docs say 104, ~94 distinct UUIDs actually seeded.
- Transfer-partner table is thin (~7 routes; Marriott + per-tier bonuses absent) — limits planner accuracy.
- Two AI chat paths coexist; `ai.go Chat` is dead code (~600L) — removal is a maintenance win (requires extracting shared helpers).
- Cap modeling under active remediation (migrations 48/49 + uncommitted optimizer changes per git status).
- Free-tier chat copy ("5/month") contradicts `FREE_LIMITS` config (1/month).
- `pro-tools` "14 tools" headline includes 5 shim re-exports.

---

_Sources: `docs/COMPETITOR-RESEARCH-CANADA.md` + inline competitor citations in the US/intl research (CardPointers, MaxRewards, Kudos, AwardWallet, point.me, Seats.aero, Roame, PointsYeah, Travel Freely, WalletFlo, Curve, TPG, 10xTravel, Frequent Miler). Codebase references are `file:line` against `internal/` and `frontend/`._
