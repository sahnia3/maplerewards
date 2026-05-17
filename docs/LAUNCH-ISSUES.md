# MapleRewards — Launch-Blocking Issues & Plan Input

**Date:** 2026-05-17
**Source:** Founder hands-on QA pass of the full app (logged-in, Lifetime test account `sahni.aditya5097@gmail.com`, Stripe sandbox).
**Purpose:** Single source of truth for `/ultraplan`. Every item below is a real, reproduced observation from using the product, not a code review.

## How to read this

Each item is tagged:

- **[BUG]** — behaves incorrectly or doesn't work. The planner should investigate root cause and fix.
- **[DECISION]** — founder questions the feature's value. Needs a keep / cut / rethink decision *before* any code.
- **[FEATURE]** — net-new capability the founder wants.
- **[UX]** — works technically but the experience is wrong/confusing.

Severity: **P0** = trust-breaking, blocks launch. **P1** = approved billing scope. **P2** = exists but broken. **P3** = product decisions. **P4** = new features.

The recurring theme across P0: **the core product produces untrustworthy numbers and data.** A rewards optimizer that recommends a capped card, values points at 120¢ each, won't save a wallet balance, and lists expired/duplicate/dead-link promos is not launch-ready regardless of billing/security polish.

---

## P0 — Trust-breaking core bugs

### P0.1 [BUG] Optimizer ignores card monthly caps
- **Where:** Optimizer page → enter spend → "Rank cards".
- **Repro:** Entered **$10,000** spend → optimizer recommended **Amex Cobalt**.
- **Why wrong:** Amex Cobalt's 5x earn is **capped at $2,500/month**. Recommending it for $10K spend is materially wrong advice — the core function of the product.
- **Expected:** Ranking must apply each card's category/monthly caps and earn-rate tiers before ranking. A capped card should rank on its *effective* (post-cap) return for the entered spend, not its headline rate.
- **Scope note:** This likely affects every card with a cap (Cobalt, SimplyCash, category-limited cards). Treat as an algorithm-correctness bug in the optimizer/ranking service, not a one-card data patch.

### P0.2 [BUG] Wallet point balances don't persist
- **Where:** Wallet page → "tap a balance to edit".
- **Repro:** Set Amex Cobalt balance to 10,000 pts → Save → view refreshes → balance shows **0** again.
- **Impact:** Core data does not save for a logged-in account. Founder's open questions to answer: is there a persistence backend for authenticated users' point balances at all? Where is this data supposed to go? Why does the save round-trip fail silently?
- **Expected:** Editing a point balance persists server-side for the logged-in user and survives refresh.

### P0.3 [BUG] Loyalty program valuations are absurd (units bug)
- **Where:** Loyalty page → e.g., Air France KLM Flying Blue.
- **Observed:** "base ~120 cents per point", "premium ~180 cents per point".
- **Why wrong:** A single loyalty point is worth roughly **1–3 cents**, never 120–180 cents. Almost certainly a units error (cents vs dollars, or a ×100 somewhere) in the valuation surface or its formatter.
- **Impact:** Every dollar figure derived from valuations is suspect. Likely the same root cause feeds P0.4.
- **Founder question to answer in the plan:** how is CPP actually calculated and where do these per-point values come from.

### P0.4 [BUG] Portfolio / valuation shows "$0–$0" everywhere
- **Where:** Card-value / portfolio valuation page.
- **Observed:** "Estimated annual value $0 – $0", every one of 8 cards shows "$0–$0" in the per-card breakdown. Copy says "modeled on insurance + lounge + multipliers + credits, net of annual fees."
- **Expected:** Real modeled ranges per card. The valuation engine is not feeding the portfolio at all (possibly related to P0.2 zero balances and/or P0.3 valuation bug).
- **Note:** Founder says Insights and Portfolio pages themselves are "fine" — the specific failure is the estimated-value page reading all zeros.

### P0.5 [BUG] Promo / feed pipeline is unreliable (data integrity)
- **Where:** Feed / Promos page (transfer-bonus cards) and the curated newsroom.
- **Observed problems (all on one screen):**
  - **Duplicates:** Two near-identical "Amex MR (CA) → Flying Blue 25%" cards.
  - **Expired shown as live:** A promo dated Mar 18–Apr 17 (NerdWallet "pulse points", Amex boost → Flying Blue, 25%) displays status **"ONGOING"**. The ingester is not parsing/respecting promo end dates or fine print.
  - **Broken / wrong source links:**
    - Milesopedia pages → **404**
    - "Amex MR → Flying Blue 40%" source → page does not load/render
    - "Amex MR → Aeroplan" → Prince of Travel → **404**
    - "RBC Avion → British Airways Avios" → **404**
    - "Rove → Aeroplan 25%" source → **Threads.com** (not a rewards news source)
    - "CIBC Aventura → British Airways Avios" → not a valid rewards page
  - **Non-Canadian content in a Canadian product:** newsroom shows "Citi AAdvantage Globe", "Chase Business Total Checking" (US).
- **Founder's core concern:** *they cannot tell whether any promo on the page is real or live.* This is a trust killer.
- **Root cause to investigate:** the scrape/AI ingest pipeline does not (a) dedupe, (b) validate/parse expiry dates, (c) verify source URLs resolve, (d) geo-filter to Canada. Fix the pipeline, not the 7 individual rows.

### P0.6 [BUG/UX] Raw rate-limit JSON leaking into the UI + over-aggressive limit
- **Where:** Feed/Promos page and All Tools page during normal browsing.
- **Observed:** Literal `{"code":"USER_RATE_LIMITED","message":"too many requests for your account, please slow down"}` rendered as page content.
- **Two problems:** (1) same raw-JSON-error-display bug pattern we already hit on billing — error bodies must render as friendly UI, never raw JSON; (2) the per-user rate limit is tripping during *ordinary navigation*, so the limit/threshold or what counts against it is mis-tuned.

---

## P1 — Billing finish (approved scope)

### P1.1 [FEATURE] "Before you go" save screen
- When a subscriber clicks cancel, show **one** screen *before* redirecting to Stripe, with a real retention offer: pause subscription (e.g., 3 months), discount (e.g., % off for N months), or downgrade to a cheaper tier.
- **Constraint (non-negotiable):** cancel must remain reachable in one click if they decline the offer. This keeps it Stripe-ToS and click-to-cancel-law compliant. No obstruction/dark patterns.

### P1.2 [FEATURE] Post-cancel page
- Tasteful "sorry to see you go" landing after cancellation completes. Mentions data retained 30 days + one comeback offer. Not guilt-trippy, not spammy.

### P1.3 [FEATURE] One CASL-compliant win-back email
- Exactly **one** win-back email after cancellation (not a recurring weekly loop — recurring would violate CASL and the published Privacy Policy). Must include a working unsubscribe and respect existing email-consent state.

### P1.4 [UX] Lifetime "nothing to cancel" state
- **Repro:** Lifetime account clicks "Billing & invoices" → Stripe portal shows "No payment method / No invoice history" → dead end, looks broken.
- **Reality:** correct — Lifetime is a one-time payment with no subscription; there is nothing to cancel.
- **Fix:** detect Lifetime in the app and show an explicit "You own MapleRewards for life — there's no subscription to cancel" state instead of dumping the user into an empty Stripe portal. (Pro/Pro Plus continue to the real portal with a Cancel button.)

---

## P2 — Features that exist but don't function (fix or cut, per item)

- **[BUG] Welcome Bonus Mission Control → "Activate from wallet":** no working path; clicking does nothing actionable.
- **[BUG] Credits & Renewals Calendar → "Add cards":** no input to enter the actual card/credit/expiry data, so the calendar can't do anything.
- **[BUG] Forensics "What changed on issuer pages":** always "no detected changes / worker runs daily." Verify the cron worker actually runs and the diff detection works end-to-end; if it doesn't run in this environment, the feature is vapor.
- **[BUG] Save the Itinerary (Trip Planner):** doesn't fetch real values for a date/trip the user actually wants; not functional. (Founder: Trip Planner "has issues, revisit.")
- **[BUG] "Track what you clipped" (Amex/RBC/Scene+ offers):** user can log an offer (e.g., Lululemon Amex, $100 back on $500 min, expiry 18th) but there is no expiry notification — they'd only find out by manually logging in and scrolling to the bottom of Pro Tools. Useless without alerts (see P4.2).
- **[BUG/DECISION] Live CPP iframe badge:** founder doesn't see the point *and* it doesn't work.
- **[DECISION] SQC Tracker data feed:** founder wants to understand how a logged spend (e.g., $10K on Amex Aeroplan Reserve) is supposed to feed the status-qualifying-credit projection. (Status tracker *without* a card works.) Clarify the intended data flow; fix or document.

---

## P3 — Product decisions (founder questions value; decide before coding)

- **[DECISION] Applications page:** founder sees no point — "people know which cards they applied for; nobody applies for 500 cards; logging approved/denied/pending serves no purpose." Strong lean toward **cut**. Decide: cut, or define a real purpose (e.g., feeding cooldown/eligibility logic).
- **[DECISION] All Tools page rationalization:** founder questions the value of the page and several entries — "What are your points worth" (static CPP, unclear purpose), the catalog-as-a-tool, Promo Sentinel (broken), live CPP badge. Decide which "tools" are real and cut the rest. ("This week in Canadian rewards" → editorial digest is fine but isn't a tool.)
- **[DECISION] India arbitrage + Indian-card content:** "Canadian points, Indian rates" arbitrage and Indian-card coverage in the Knowledge/Devaluation Desk are not relevant to a Canadian product. Lean: **remove**.
- **[DECISION] Loblaws / Empire "mini-economy":** founder doesn't understand the feature. Parked — revisit later (explicit reminder requested).

---

## P4 — New features requested

### P4.1 [FEATURE] Stack suggester from real spend/profile
- Today Stacking & Math shows 4 pre-built static stacks with no personalization.
- Want: user describes their situation (e.g., "business with heavy business expenses") or it reads their actual logged spend, and the app **recommends the card stack they should run**, with reasoning.
- Placement: Pro Tools or AI Assistant — open.

### P4.2 [FEATURE] Expiry notifications for clipped/Amex offers
- For "Track what you clipped" and Amex/RBC/Scene+ offers: proactively notify the user before an offer expires (email/push), rather than requiring them to log in and check. This is what makes the tracking feature actually useful.

---

## Cross-cutting themes for the planner

1. **Raw error JSON in the UI is systemic** (billing, feed, tools). There should be one shared client error boundary that renders friendly copy and never the raw `{"code":...}` body.
2. **Data trust is the launch blocker.** P0.1/P0.3/P0.4/P0.5 all reduce to "the numbers and content are wrong." Sequence these first.
3. **"Doesn't work" vs "no point" are different.** Several P2/P3 items the founder labels broken are actually features whose value is unclear — those need a product decision, not a bug fix. Do not auto-"fix" anything in P3 without the keep/cut decision.
4. **Canadian-only scope.** US content and India arbitrage both signal the ingest/knowledge layer isn't geo-scoped to the product's market.
5. **Persistence question (P0.2):** confirm whether authenticated wallet/point data has a working backend at all — this may be a bigger architectural gap than a single broken save.

## Out of scope for this plan (parked)

- Trip Planner deep issues (beyond Save Itinerary not working) — revisit later.
- Loblaws/Empire mini-economy — revisit later.
- "Best Portal × Card × Offer" / triple-stack calculator — founder hasn't evaluated yet.
