# Headless-Browser QA Sweep — 2026-05-22

Driven as the QA Pro user (`qa.stress.1779181@maplerewards.test`, is_pro=true, 4 cards
— all Aeroplan variants, 0 point balances). Backend :8080, frontend :3000, both 200.
Method: navigate every page, snapshot a11y tree, click interactive elements, watch
console + network, then **edit elements** that are wrong or under-deliver.

Legend: ✅ verified good · 🔧 fixed this sweep · ⚠️ noted (low priority / product) · 🐞 open

---

## Home (`/`)

- 🔧 **"4 programs" → "1 program"** (`app/page.tsx:110`). `programsCount` counted
  `cards.length`; the 4 cards are all Aeroplan = one distinct program. Now counts
  distinct non-empty `program_name`. Verified renders "1 program".
- ✅ `$0 / 0 points` is **honest** — QA user has zero balances entered; not a bug.
  (Product note: the hero leads with "$0", a weak first impression for a fresh wallet —
  candidate for an empty-state nudge, but not a defect.)
- ✅ "BEST MOVE TODAY +$10.75 → route dining to Amex Aeroplan Business Reserve" renders
  from the real missed-rewards report; links to `/optimizer`. (This is the embryo of the
  Brief feature under design.)
- ✅ Recent-activity ledger renders real May-19 spend; nav says "Maple" (rename shipped).
- ⚠️ Redundant fetches on load: `/bonuses` ×4, `/spend/stats` ×4, `/summary` ×2. Partly
  React-19 StrictMode double-invoke (dev only), but ≥2 components fetch the same endpoints
  independently → wasteful in prod too. Low priority; candidate for a shared query/memo.

---

## Optimizer (`/optimizer`)

- 🔧 **Footer stats "102 / 27 / 8" → "104 / 28 / 10"** (`app/optimizer/page.tsx:98-100`).
  All three were stale hardcoded values; the DB has 104 cards, 28 loyalty_programs, and
  10 categories (the 10 category buttons rendered right above the "8" contradicted it).
  Homepage already used 104/28 correctly — optimizer was the only stale instance. Verified.
- ✅ Ranking works: $100 groceries → ranked all 4 cards, best = Amex Aeroplan Reserve
  ($1.88, 125 pts, 1.50¢ CPP, 1.25× base), runners-up with per-card LOG buttons.
- ✅ **Amex blackout warning** fires correctly ("doesn't work at Costco, Loblaws, No Frills,
  Superstore, Shoppers, T&T…") — strong Canada-specific value.
- ✅ APPLY NOW → `/api/v1/affiliate/click/{id}` returns an opaque **redirect** (not 404);
  revenue link intact.
- ⚠️ Multiplier label rounds 1.25× → "1.3×" (the $ value $1.88 is exact). Cosmetic; the
  points figure (125) is correct. Not fixed — clean multipliers (1/2/4/5×) are unaffected.

---

## Wallet (`/wallet`)

- ✅ PROGRAMS reads "1" (this page already counted distinct programs correctly; the
  homepage fix now agrees with it).
- ✅ Inline balance edit works: set Aeroplan Reserve = 120,000 → persisted, EST. VALUE
  $2,400 (120k × 2.0¢ Aeroplan CPP), header + sidebar updated live across pages.
- ✅ Nice touch: "↗ FIND MY NUMBER ON THE PROGRAM SITE" deep-links to the program's
  account page (aircanada.com/aeroplan/account).
- ✅ Correct annual fees ($120 / Free / $599 / $599); REMOVE buttons present; CSV import
  dropzone (RBC/TD/Scotia/BMO/Amex/Tangerine). `valuemax="0"` on the input is an a11y
  artifact, not a real cap (fill of 120000 succeeded).

## Loyalty (`/loyalty`)

- 🔧 **Air Miles CPP 0.15¢ → 10.5¢** (migration `000056_fix_air_miles_cpp`).
  `loyalty_programs.base_cpp` for `air-miles` was 0.1500 — a ~70× undervaluation that
  *contradicted the app's own knowledge base* (rewards.yaml: cpp_range 10.0–15.0,
  in-store cash floor 10.53¢). Impact: undervalued any Air Miles balance ~70× **and**
  mis-ranked every Air Miles-earning card in the optimizer. Corrected to the conservative
  always-achievable cash floor 10.5¢. Applied + verified in UI (now "10.50¢/pt").
- ✅ 28 programs, filters sum correctly (Airlines 5 + Banks 15 + Hotels 3 + Cashback 5 = 28).
  Other CPPs sane (Aeroplan 2.00, Amex MR 1.65, Hyatt 1.80, PC Optimum 0.10 ✓).
- ⚠️ WestJet Rewards shows 1.00¢/WestJet Dollar — ambiguous (1 WSD = $1 CAD, so could be
  modelled as 100¢). Left as-is: no YAML contradiction found and it may be a deliberate
  unit choice; flagging for a data-owner decision rather than guessing.

---

## Pro Tools (`/pro-tools`) — Pro user, all 4 tabs

- ✅ **FORENSICS**: missed-rewards ($11/30d, 2 of 6 sub-optimal, per-transaction re-route
  advice, internally consistent math), Welcome-Bonus Mission Control (clean empty state +
  card picker + disabled-until-valid CTA), Credits & Renewals ($200 unused NEXUS, MARK USED),
  Card-Value Scorecard ($4,238 net annual).
- ✅ **STATUS & BALANCES**: 2026 Aeroplan SQC projection (174 YTD, honest spend-to-tier —
  the impractical $248k figure correctly conveys elite-by-spend-alone is unrealistic),
  Loyalty Accounts (standalone-balance tracker w/ inactivity warnings — *this* is where
  Flying Blue etc. get added, not the /loyalty directory), Aeroplan Watcher. Functional CTAs.
- ✅ **STACKING & MATH**: stack templates include the **"everyday Canadian stack"**
  (Cobalt+Tangerine+Rogers, solves the Amex grocery blackout) — the previously-missing
  Canadian stack — and it's **personalized**: "★ RECOMMENDED FOR YOUR SPEND — 49% of your
  spend is groceries + dining." Honest caveats per stack.
- ✅ Tab counts honest: 4+3+4+3 = 14 = "14 tools live".
- ⚠️ **Card-Value Scorecard shows "1 component" for the 4 Aeroplan cards** — they're among
  the 98 *uncurated* cards with no `card_value_components` rows, so only the always-added
  earning component shows. Premium perks (Reserve's lounge/insurance/NEXUS) aren't valued,
  so premium cards are **understated** (conservative, not fake; NEXUS is surfaced separately
  in Credits). Root cause documented in `card_value.go:131-148`. **Recommendation (not done —
  large data effort):** seed `card_value_components` perks for premium cards, or add an
  "earning estimate only — perks not yet valued" label when a card has no curated perks.

---

## Maple chat (`/chat`) — live Claude Sonnet 4.6, real API

Sent: "I have 120,000 Aeroplan + 60,000 Flying Blue. In a markdown table, show CAD value + a
redemption idea for each."

- ✅ **GFM table renders** — bordered 3-row table, no overflow (table 780px = wrapper 780px,
  `overflow-x: auto` wrapper present for narrow viewports). remark-gfm + scroll-wrap fix good.
- ✅ **Stated-balance override works** — wallet has 0 Flying Blue; Maple accepted the stated
  60,000 and valued it ~$1,080. The founder's prior "AI rejected my balance" complaint is fixed.
- ✅ **Factually accurate + market-aware** — 120k Aeroplan × 2.5¢ (business sweet-spot) ≈ $3,000;
  60k FB × 1.8¢ ≈ $1,080. Live tool calls visible (LOOKING UP CPP, GET_DEVALUATION_HISTORY).
- ✅ **Proactive market decision** — pulled the real June-1-2026 Aeroplan devaluation from the
  log and advised booking before then; offered to chain into live award search. This is the
  fusion-Brief behavior already working in chat form.
- ⚠️ Minor: model said "9 days" in one line and "10 days" in another (June 1 is 10 days out).
  LLM phrasing wobble, covered by the "VERIFY ALL FINANCIAL DECISIONS" disclaimer. Not a defect.
- Note: the message echo looked doubled — that was a **test-harness artifact** (native-set value
  + retype), not an app bug; the composer submitted exactly what was in the box.

---

## Insights (`/insights`)

- ✅ Leads with a **personalized devaluation alert**: "You're $123.12 exposed to the June 1
  chart hike — 9 days to redeem" (computed from the 120k balance + real devaluation event,
  links to `/tools/aeroplan-june-1` which returns 200). Rich per-category / per-card brief,
  time filters (7D/30D/90D/All), dismiss. No errors.
- ⚠️ Cross-page rounding: Insights "RECOVERABLE $10.75" vs Pro Tools "$11" (same underlying
  $10.75). Cosmetic; pick one rounding convention.

## Portfolio (`/portfolio`)

- ✅ Annual ledger $4,238 net (matches Pro Tools scorecard); held points correctly attributed
  to the Reserve ($2,400); honestly separates "value you already have" from annual earning.
- 🔧 **Air Miles card recommendations were 7×+ inflated → fixed** (migration
  `000057_fix_air_miles_card_earn_rates`). After the CPP fix (000056), "Cards we'd add"
  recommended **BMO Air Miles World Elite at ~$3,471/yr** and BMO Air Miles ~$1,827/yr —
  impossible (~10% blended return). Root cause: the two BMO Air Miles cards modeled earning
  at point-like rates (1–3 "miles"/$) when AIR MILES accrue ~12–25× slower (AMWE = 1 Mile/$12,
  no-fee = 1 Mile/$25). The old 0.15¢ CPP had masked it (inflated earn × tiny CPP ≈ plausible).
  Corrected earn rates to BMO's real published accrual. **Verified**: BMO Air Miles cards
  dropped out of the top recommendations; list is now sane (Amex Cobalt #1 ~$913/yr, NBC WE
  ~$522, Scotia Gold ~$432…). Empirically confirms valuation = earn_rate × program CPP.
  → 000056 + 000057 together fix Air Miles end-to-end (program value AND card earn).

## Applications (`/applications`)

- ✅ Issuer cooldown tracker. Record form (card/date/status/notes), History shows a recorded
  app ("Amex Cobalt · 2026-05-15 · APPROVED" + REMOVE). Cooldown windows documented
  (RBC 90d, TD 12mo, BMO 90d). No real defects — the "nan" my scan flagged is the substring
  in "fi**nan**cial" (Brim/Neo/PC/Simplii Financial), a false positive.

---

## Promos (`/promos`)
- ✅ 1 active promo: "Amex MR (CA) → Aeroplan +30%, ends May 31, 9D LEFT" (countdown correct).
  Source → Prince of Travel (among the 30 links the STRICT link-checker verified live this
  session). Renders cleanly.

## Feed (`/feed`)
- ✅ "The maple dispatch" — 80 live RSS articles (Prince of Travel, Milesopedia, Doctor of
  Credit, TPG, OMAAT, View From The Wing + subreddits), filter tabs (All/Devaluations/Bonuses/
  Offers/Guides/News), genuinely current (a "May 22, 2026" thread = today). All links → real
  domains. feed_aggregator http(s)-only hardening intact.

## Tools — points-to-CAD (`/tools/points-to-cad`)
- ✅ Calculator correct: Aeroplan 50,000 → $1,000 at 2.00¢. 28 programs in dropdown.
- ✅ **Air Miles fix flows through**: 50,000 Air Miles → $5,250 at 10.50¢ (was $75 at 0.15¢).
  Confirms 000056 is consistent across loyalty page, calculator, wallet, and valuations.

## Tools — compare (`/compare/[a]/[b]`)
- ✅ Head-to-head renders (Amex Cobalt $156/1.65¢ vs CIBC Aventura Gold $79/1.00¢), apply +
  detail links, spec table. No errors.

## Profile (`/profile`)
- ✅ Account info, Pro badge, display-name edit + Save, billing (Manage / Cancel), Sign out,
  Delete-account danger zone. No redirect loop (the render-time→useEffect fix holds). Did not
  click live Stripe billing/cancel actions on the QA user.

## Settings (`/settings`)
- ✅ Theme switcher (Light/Dark/System), reduce-motion toggle, password change, CSV export.
  Clean separation from profile. No errors.

## Trip Planner (`/trip-planner`) — re-check (deep-verified earlier w/ 12-program screenshot)
- ✅ Form intact: from/to, dates, flex (Exact/±7d/±14d), cabin (Economy/Business/First),
  passengers, popular routes (YYZ→LHR/NRT, YVR→HNL, YUL→CDG, YYZ→DXB). Honest source label
  ("Live award seats from Apify + Seats.aero, cash from Google Flights"). No regression.

---

## Summary of edits this sweep

| # | Fix | File / migration |
|---|-----|------------------|
| 1 | Homepage "4 programs" → distinct-program count ("1 program") | `frontend/app/page.tsx:110` |
| 2 | Optimizer footer stats 102/27/8 → 104/28/10 | `frontend/app/optimizer/page.tsx:98-100` |
| 3 | Air Miles program CPP 0.15¢ → 10.5¢ | `migrations/000056_fix_air_miles_cpp` |
| 4 | BMO Air Miles card earn rates ÷12–25 to real accrual | `migrations/000057_fix_air_miles_card_earn_rates` |

Open (flagged, not fixed — out of QA scope / need data-owner decision):
- Card-Value Scorecard understates premium cards (only earning component; perks not seeded for
  98 uncurated cards). Recommend seeding `card_value_components` or an "earning-only" label.
- Cross-page rounding: $10.75 (insights) vs $11 (pro-tools).
- WestJet Rewards CPP unit (1.00¢/WSD vs $1=100¢) — confirm intended modeling.
- Homepage redundant fetches (/bonuses, /spend/stats ×4) — shared-query candidate.

---

## Verification gate (post-edits)

- ✅ Frontend `tsc --noEmit` clean. (Cleared stale macOS-sync build-cache duplicates in `.next`
  — `routes.d 2.ts` etc. — which had caused a phantom "Duplicate identifier" error; no source
  files affected. Both edited pages hot-reloaded and rendered the corrected values.)
- ✅ Backend `go build ./...` + `go vet ./...` clean (no Go code changed this sweep).
- ✅ Migrations 000056 + 000057: applied, and **round-trip verified** (`migrate down 2` reverted
  to 0.15 / 1.00, `migrate up` restored 10.5 / 0.08; final version 57).
- ✅ No `*_test.go` asserts the changed Air Miles data → existing `go test -race` suite unaffected.
- ⛔ Not committed — awaiting explicit go-ahead (working tree also still holds pre-session
  changes to auth.go / ratelimit.go / ai_tools.go / trip.go from prior work).

## Overall verdict

Every page driven button-by-button as a Pro user. The app is in strong shape: optimizer,
wallet, loyalty, all 4 Pro-tool tabs, Maple chat (tables + stated-balance override + live
devaluation awareness), insights, portfolio, applications, promos, feed, public tools, profile,
settings, and the trip-planner form all work and present honest numbers. 4 real defects found
and fixed (1 display-count, 1 stale-stats, 2 data-integrity), all verified in-browser. Remaining
items are low-priority/data-curation, flagged above for a data-owner decision.

---

## Extended sweep (previously light-checked surfaces)

### Cards catalog (`/cards`)
- ✅ **"96 cards" vs 104 is intentional, not a bug.** The API returns all 104; `listCards()`
  (`frontend/lib/api.ts:225`) filters a documented `RETIRED_CARD_NAMES` set (HSBC Canada→RBC
  2024, Capital One's Canadian exit, NBC Syncro, + a few excluded for image quality). Retired
  cards stay `is_active=true` so existing *holders'* valuations work, but are hidden from the
  *acquisition* catalog. 96 (browsable) vs 104 (modeled, matches homepage claim) is correct.
- ✅ Filters (network/issuer/fee-tier), head-to-head picker, in-wallet markers, "+ Add" present.

### Pricing / upgrade (`/pricing`)
- ✅ Conversion route is `/pricing` (the whole app links there consistently). Three tiers
  (Pro $39.99/yr ≈ $3.33/mo, Pro Plus, Lifetime); prices match signup copy.
- ✅ **Already-Pro edge handled**: shows "✓ Pro is active" instead of a broken checkout.
- ✅ `/upgrade` returns 404 but **nothing links to it** — harmless (the route just doesn't exist).
- 🔧 Fixed in the *plan* (not the app): the Brief plan's `/brief` unlock CTA linked to `/upgrade`;
  corrected to `/pricing` in `docs/superpowers/plans/2026-05-22-proactive-brief.md`.

### Loyalty detail pages (`/loyalty/[slug]`)
- ✅ Rich + correct (Flying Blue: tiered CPP 1.20/1.80/2.64¢, sweet spots, transfer partners).
- 🔧 **Duplicate transfer partners → deduped** (migration `000058_dedupe_transfer_partners`).
  `transfer_partners` had 5 redundant rows — the same (from→to, ratio) entered twice with only
  cosmetic note differences (`->` vs `→`). They rendered partners twice and inflated the
  "TRANSFER FROM" count (Flying Blue showed Marriott twice → "·3"). Removed the 5 dupes
  (Marriott→{Aeroplan,Asia Miles,BA Avios,Flying Blue}, Amex MR→Marriott), keeping the better
  row each. **Verified**: 22→17 rows, round-trip reversible, Flying Blue now "TRANSFER FROM ·2",
  Marriott once.
- 🐞 **OPEN — data conflict, flagged not fixed**: `amex-mr-ca → hilton-honors` has two
  *contradictory* ratios (1:1 vs 1:2), not a cosmetic dup. Left both rows in place; a data owner
  must decide the correct ratio (and then a unique index on (from,to) can be added to prevent
  future dupes).

### Create-flows
- ✅ **Aeroplan Watcher create** works end-to-end: NEW WATCH → filled YYZ→NRT / 2026-09-15 →
  Save enabled → watch persists, list shows the route, "0 → 1 ACTIVE WATCH". (The user's
  specifically-named feature — verified functional.)
- Not individually driven (same small-form pattern as the watcher; lower priority): loyalty
  "TRACK NEW" account, "+ LOG A CREDIT", onboarding wizard. Empty states + CTAs confirmed
  present earlier; full submit paths not exercised this pass.








