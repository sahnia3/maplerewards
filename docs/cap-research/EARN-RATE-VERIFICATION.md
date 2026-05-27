# Card Earn-Rate Verification Registry

**Started:** 2026-05-27 (gated card-data correction, gate lifted by founder)
**Method:** each card's `card_multipliers` rows compared against published issuer
terms. Primary cited source: Prince of Travel structured earn tables (updated
2026-02) + issuer sites (td.com, rbcroyalbank.com, amex.ca) as second source.
Corrections shipped as reversible migrations with idempotent pre-value guards
and exact `.down.sql`; each applied + down/up round-trip verified.

**Key finding:** the seed catalog had a high error rate (~50% of category-bonus
cards verified so far carried at least one wrong/missing/mis-categorised rate).
The errors are data-entry mistakes (wrong category, swapped rates, copy-paste
from a sibling card, missing bonus tiers, mis-modelled flat cards), NOT a code
bug — `GetMultiplierForCard` resolves correctly. The earlier "2x groceries"
optimizer display was a stale-binary artifact, not wrong data.

---

## A. Corrected (cited + migrated)

| Card | Was | Now | Migration | Source |
|---|---|---|---|---|
| TD Aeroplan Visa Infinite | travel 3.0 | travel 1.5 | 000059 | td.com |
| Amex Aeroplan Business Reserve | travel 2.0, dining 3.0 | travel 3.0, no dining | 000059 | princeoftravel |
| Amex Aeroplan Card | (no dining) | +dining 1.5 | 000060 | amex.ca |
| Amex Cobalt | streaming 5.0 | streaming 3.0 (travel 2x kept) | 000061/000065 | princeoftravel |
| CIBC Aventura VIP | travel 2.0, 6-cat 1.5 | travel 3.0, 6-cat 2.0 +entertainment | 000065 | princeoftravel |
| TD Cash Back VI | (no recurring-bills) | +3% recurring-bills | 000065 | princeoftravel |
| Scotia Momentum VI | dining 2% | no dining, +4% recurring-bills | 000065 | princeoftravel |
| Amex Platinum | dining 3.0, travel 3.0 | dining 2.0, travel 2.0 | 000061 | princeoftravel |
| Amex Gold Rewards | dining 2.0 | no dining | 000061 | princeoftravel |
| Scotiabank Platinum Amex | 5x dining/ent, 3x travel, 1x base | flat 2x | 000061 | princeoftravel |
| Amex Business Edge | dup everything-else | deduped | 000061 | (structural) |
| Amex Platinum Business | dup everything-else (1.5/2.0) | deduped (2.0) | 000061 | (structural) |
| MBNA Rewards WE | dup dining; cap $50k | deduped; cap $5k | 000061 | (structural) |
| Scotiabank Passport VI | groceries 3.0, travel 2.0 | groceries 2.0, no travel | 000062 | princeoftravel |
| CIBC Dividend VI | pharmacy 2% (mislabelled), travel 2% | recurring-bills 2%, no travel | 000062 | princeoftravel |
| TD First Class Travel VI | only 8x travel + 2x base | +6x grocery/dining/transit, +4x streaming/bills | 000062 | princeoftravel |
| RBC Avion VI | 1.25x dining/gas/streaming/grocery | 1.25x travel only | 000063 | rbcroyalbank.com |
| BMO eclipse VI | gas/transit 3%, no dining | gas/transit 5%, +5% dining | 000064 | princeoftravel |
| CIBC Aventura VI | dining 1.5 | no dining | 000064 | princeoftravel |
| Marriott Bonvoy Amex | base 1x, dining 2x | base 2x, no dining | 000064 | princeoftravel |
| National Bank WE | base 2x, no 2x tier | base 1x, +2x gas/bills/travel | 000064 | princeoftravel |

## B. Verified correct (cited — no change needed)

- Amex Aeroplan Reserve (3x travel, 2x dining, 1.25x base) — princeoftravel
- Scotiabank Gold Amex (5x grocery/dining/ent, 3x streaming/gas/transit) — princeoftravel
- TD Aeroplan VI Privilege (2x AC, 1.5x gas/grocery/dining/transit, 1.25x base) — td.com
- CIBC Aeroplan VI (1.5x gas/grocery/AC, 1x else) — consistent with TD AVI terms
- PC / PC World Elite (30–45x at 0.1¢/pt) — known PC Optimum structure

## C. Pending cited verification (assessed by inspection)

The remaining ~62 cards have NOT yet been verified against cited published
terms. Most are flat-rate / single-category cards with low error risk; a subset
carry category bonuses and — given the ~50% error rate found so far — should be
treated as **likely to contain errors until cited-verified**.

**Higher-risk (category bonuses, verify next):** BMO eclipse VIP, BMO Ascend WE
(streaming 3x suspect), BMO World Elite MC, BMO CashBack WE/MC, RBC ION+, RBC
WestJet WE, CIBC Aventura Gold/VIP, CIBC Costco MC, CIBC Dividend Platinum, CIBC
Tim Hortons, National Bank Allure/Platinum/Syncro, Capital One Costco, Desjardins
Odyssey WE/Gold + Cash Back WE, TD FCT VI Privilege (likely missing categories
like the VI did), TD Platinum Travel, TD Cash Back VI, Scotia Momentum VI, Neo WE,
MBNA Alaska/Smart Cash, Simplii Cash Back, RBC Avion VI Privilege (dining 1.5
suspect), Tangerine x2.

**Lower-risk (flat/simple, assessed plausible):** Amex Green/SimplyCash x2,
Wealthsimple x2, Brim x2, Home Trust, Manulife, Rogers x3, Capital One Aspire x2,
RBC British Airways/Avion Platinum/Rewards+/Cash Back, Scotia no-fee/Value/Scene+
/Momentum no-fee, MBNA True Line, Desjardins Cash Back/Remises, HSBC x3 (note:
HSBC Canada wound down post-RBC acquisition — keep-vs-deactivate is a separate
product decision), Triangle x2, Neo (non-WE) x2, BMO Air Miles x2, various 0.5%
cards.

---

## Batches 7–8 corrections (000066–000067)

| Card | Fix | Migration |
|---|---|---|
| BMO CashBack WE | "2% streaming" -> recurring-bills (mislabelled) | 000066 |
| CIBC Aventura Gold | removed bogus 2x dining; +1.5x gas/drugstore/grocery | 000066 |
| CIBC Dividend Platinum | gas/grocery 2% -> 3% | 000066 |
| RBC Avion VIP | removed bogus 1.5x travel/dining (flat 1.25x) | 000066 |
| BMO eclipse VIP | gas 4->5, dining 3->5, +5x travel/drugstore | 000067 |

Verified-correct batches 7–8: RBC Cash Back MC, Tangerine World, Simplii Cash
Back, RBC ION+. Neo WE left (variable/tiered rates; DB models reasonable averages).

## Systemic value-model issue — FIXED (000068)

**BMO Rewards points cards modelled as `cashback_pct`.** BMO eclipse VI/VIP earn
BMO *Rewards points* (5 pts/$; BMO Rewards CPP = 0.71¢, already set), but were
seeded `earn_type = cashback_pct`, so the optimizer valued "5 points" as "5%"
(≈5¢) instead of 5 × 0.71¢ ≈ 3.55¢ — **over-valuing ~40%**. Investigation showed
the sibling BMO Rewards points cards (Ascend WE, World Elite MC, Rewards MC)
already correctly use `earn_type = points`. **Migration 000068 aligns eclipse
VI/VIP to `points`**, so the program CPP is applied — resolved. The genuine BMO
*CashBack* series (CashBack WE/MC) is real cash back and correctly stays
`cashback_pct`. (BMO Preferred Rate, 0.5%, negligible impact — left as-is.)

## Status

- **9 migrations** (000059–000067), **~62 cards** cited-verified, ~20 cards' rates
  corrected, every fix reversible + round-trip tested. Catalog duplicate scan: 0.
  One self-correction (Cobalt travel 2x) — caught by re-verification.
- Data fixes are **live on the DB** (no app redeploy needed for data).
- **Remaining ~42 cards** are mostly flat / single-category / low-traffic
  (lower error risk) plus a few category cards (BMO Ascend streaming, BMO World
  Elite MC, RBC WestJet WE, NBC Allure/Platinum/Syncro, Capital One Costco,
  Desjardins Odyssey x2, TD Platinum Travel, TD FCT VIP, TD Aeroplan Platinum,
  MBNA Alaska/Smart Cash, CIBC Tim Hortons, HSBC x3 [defunct issuer]) + the BMO
  value-model fix above. All highest- and medium-traffic cards are done.

---

## Batches 10–15 (000069–000074) — gated sweep of the remaining ~67 cards (2026-05-27)

Method unchanged: each card's `card_multipliers` compared against published terms
(Prince of Travel earn tables fetched 2026-05-27 + issuer/aggregator sites where the
PoT slug 404'd). Every fix is a reversible migration with pre-value guards keyed by
card NAME + category SLUG; each applied + down/up round-tripped; catalog duplicate
scan = 0 after every migration.

### A. Corrected (cited + migrated)

| Card | Was | Now | Migration | Source |
|---|---|---|---|---|
| BMO Ascend WE | +3x streaming-digital | removed (only 5x travel + 3x dining/ent) | 000069 | princeoftravel |
| BMO Cash Back MC | 1% gas-transit | 1% recurring-bills (re-pointed) | 000069 | princeoftravel |
| CIBC Costco MC | gas elevated cap $8k | cap $5k (Costco.ca $8k unchanged) | 000069 | princeoftravel |
| CIBC Dividend Visa (no-fee) | grocery 1%, no 1% tier | grocery 2% +1% gas/dining/recurring | 000069 | princeoftravel |
| SimplyCash Amex | only 1.25% base | +2% gas +2% groceries | 000069 | princeoftravel |
| TD Rewards Visa | flat 2x everywhere | 4x travel/3x grocery-dining-transit/2x bills-streaming/1x base | 000070 | princeoftravel |
| TD Aeroplan Platinum | bogus 1.5x travel, 1x base | 1x gas/grocery/AC, 0.67x base | 000070 | td.com via milesopedia |
| Neo World Elite | 4% streaming-digital | 4% recurring-bills (re-pointed) | 000070 | princeoftravel |
| RBC Rewards+ Visa | flat 1x | 1x gas/grocery/pharmacy, 0.5x base | 000070 | rbcroyalbank.com |
| Brim Mastercard | 1x | 0.5x | 000071 | princeoftravel |
| Brim World Elite | 2x / $25k cap | 1x, no cap | 000071 | princeoftravel |
| RBC Cash Back Pref WE | 2% | 1.5% ($25k cap, 1% after) | 000071 | princeoftravel |
| MBNA Smart Cash Plat Plus | base 1%, no caps | base 0.5%, +$500/mo cap on 2% gas/grocery | 000071 | mbna.ca via milesopedia |
| Manulife Visa Platinum | flat 1.5% | 2% groceries ($15k), 0.5% base | 000071 | manulifebank.ca via money.ca |
| Wealthsimple Cash Card | 1% | 0% (cashback ended Oct 2025) | 000071 | wealthsimple.com |
| RBC British Airways VI | flat 2x | 3x BA/2x dining/1x base | 000072 | princeoftravel |
| RBC WestJet WE | missing dining/streaming | +2x dining +2x streaming | 000072 | rbcroyalbank.com |
| Desjardins Cash Back WE | grocery 3%, bogus 3% recurring | grocery 4%, +3% dining/ent/transit, removed recurring | 000072 | desjardins.com via milesopedia |
| Desjardins Odyssey WE | bogus 2% travel | removed (base 1.5%) | 000072 | princeoftravel |
| Desjardins Cash Back Visa | flat 1% | 2% dining/ent/transit/pre-auth, 0.5% base | 000072 | desjardins.com |
| National Bank Allure | bogus 3x grocery/2x dining/2x gas | flat 0.5x | 000073 | nbc.ca |
| National Bank Mastercard | 1x | 0.5x | 000073 | nbc.ca |
| National Bank Platinum | dining 2x + bogus ent 2x, 1.5x base | 2x grocery/dining ($1k/mo), 1.5x gas/recurring/travel, 0.67x base | 000073 | nbc.ca via milesopedia |
| Scotiabank Scene+ Visa | flat 1x only | +2x groceries +2x entertainment | 000073 | scotiabank.com |
| Scotia Momentum No-Fee Visa | gas+grocery 1% only | +1% pharmacy +1% recurring | 000073 | scotiabank.com |
| Scotia Momentum MC No Fee | gas+grocery 1% only | +1% pharmacy +1% recurring | 000073 | scotiabank.com |
| Rogers Red World Elite | bogus 3% travel (USD rate mis-mapped) | removed (1.5% CAD base) | 000074 | rogersbank.com |

### B. Verified correct (cited — no change)

- American Express Green Card — flat 1x MR (princeoftravel)
- SimplyCash Preferred Amex — 4% gas/grocery, 2% base (princeoftravel; $30k cap on grocery is a reasonable approximation of the $1,200 annual cashback ceiling)
- BMO Air Miles MC (no-fee) — 0.04 mi/$ base = 1 mi/$25 (bmo.com)
- BMO Air Miles WE — base 1 mi/$12 (0.08), grocery 2 mi/$12 (0.17), partner 3 mi/$12 (0.25, modelled as dining/entertainment proxy) (bmo.com). NOTE: BMO migrating Air Miles → "Blue Rewards" through 2026.
- Capital One Aspire Travel WE — flat 2x (rewardscardscanada)
- CIBC Aeroplan VIP — 2x AC(travel proxy)/1.5x grocery-gas-dining/1.25x base (cibc.com via princeoftravel)
- RBC Avion Visa Platinum — flat 1 Avion/$ (princeoftravel)
- TD Platinum Travel — 6x Expedia/4.5x grocery-dining-transit/3x bills-streaming/1.5x base (princeoftravel)
- Home Trust Preferred Visa — flat 1% (hometrust.ca)
- Tangerine World Mastercard — 2% on 3 chosen categories, 0.5% else (princeoftravel)
- Wealthsimple Visa Infinite — flat 2% (wealthsimple.com)
- RBC WestJet MC, Rogers Platinum, Rogers WE (1.75% blend of the 1.5/2% conditional), Scotiabank No-Fee/Value/Scene+ base, Capital One Costco rate structure, Capital One Aspire Platinum (see flags), Neo MC/Secured — assessed plausible / cited.

### C. FLAGGED — product decisions, NOT data fixes (left unchanged)

- **TD First Class Travel Visa Infinite Privilege** — *this product does not exist.*
  TD's only "Infinite Privilege" travel card is the Aeroplan one. The DB card ($599
  fee, 9x/6x/6x/3x) is a fabricated SKU. **Recommend deleting the card entirely** —
  did not "correct rates" on a non-existent product. (The real TD First Class Travel
  Visa Infinite — non-Privilege — is already verified correct at 8x/6x/4x/2x.)
- **HSBC +Rewards / Cashback / World Elite** — HSBC Canada wound down; all cards
  migrated to RBC, transition closed 2024-03-28. Recommend deactivation.
- **Capital One Aspire Travel Platinum + Capital One Costco** — both discontinued in
  Canada (Aspire line closed to new customers; Costco moved to CIBC 2022-03). Aspire
  Platinum DB rate (flat 2x) is also wrong for a Platinum tier (should be 1x) but the
  card is defunct — flagged rather than churned. Recommend deactivation.
- **MBNA Alaska Airlines World Elite** — Alaska card discontinued in Canada (PoT slug
  now redirects to MBNA Rewards WE). DB rates match no current product. Recommend
  deactivation.
- **PC Money Account** — this is a chequing/debit account, not a credit card. It earns
  PC Optimum points (~0.1¢ each); the DB models it as `cashback_pct` 2.5%/1%/0.5%
  which materially over-values a 0.1¢ currency. Recommend deactivation or re-model.
- **Desjardins Remises Visa** — "Remises" is the French name of the Cash Back Visa;
  this looks like a duplicate SKU of "Desjardins Cash Back Visa" (which was corrected
  in 000072). Recommend dedup. Left at flat 0.5% pending product decision.
- **Tangerine Money-Back Credit Card (non-World)** — only earns 2% on TWO chosen
  categories (World gets three); DB carries three (grocery/dining/gas). Per-category
  the 2% rate is correct, so the optimizer is correct per-transaction; the 2-vs-3 cap
  only over-rewards a user spending heavily across 3+ of these. Left as-is, flagged.
- **National Bank Syncro Mastercard** — Syncro is a low-interest card that earns NO
  rewards. DB carries fabricated 2% grocery/gas/recurring + 0.5% base. Recommend
  zeroing rewards. Left unchanged pending confirmation it truly earns nothing.
- **MBNA True Line Mastercard** — low-interest card, earns no rewards; DB base is
  already 0.00 (accurate). PoT template shows a default "1×" but the product earns
  nothing — DB is correct. No change.
- **Simplii Financial Visa Card** — the basic no-rewards Simplii Visa (distinct from
  the Simplii *Cash Back* Visa). DB carries 0.5% which slightly over-models a card
  that earns nothing. Low stakes; left, flagged.
- **CIBC Select Visa Card** — balance-transfer card with no rewards program. DB 0.5%
  base over-models. Low stakes; left, flagged.
- **CIBC Tim Hortons Visa** — earns Tims Rewards points (15 pts/$ at Tims, 5 pts/$ on
  grocery/gas/transit), not cash back. DB models a 3% dining proxy + 0.5% base. Tims
  points don't map cleanly to the optimizer's value model; left as a proxy, flagged.
- **Desjardins Odyssey Visa Gold** — sources conflict (milesopedia: 2% dining /
  ~0.65% grocery; PoT only has the WE variant). DB grocery 2x and 1.5x base both look
  high but could not be cited cleanly. Left unchanged, flagged for manual review.
- **RBC Rewards+ Visa** (rate fixed in 000070) — additionally, this card's
  `loyalty_program` is "RBC Avion" (base_cpp 1.1¢) but it actually earns RBC *Rewards*
  points (~0.5¢). The shared-program cpp over-values it; changing cpp would affect
  sibling Avion cards, so NOT touched here — flagged for a program-mapping decision.

### D. Systemic notes

- **earn_type audit (the 000068 bug class):** swept all 67 cards. No further
  points-program-card-mislabelled-as-`cashback_pct` cases found. Points-program cards
  (Aeroplan, BMO Rewards, NBC Rewards, Scene+, RBC Avion, MBNA Rewards, Air Miles,
  WestJet, Brim, Capital One, Manulife, Home Trust) are all `points`/`miles`; genuine
  cash-back cards are `cashback_pct`. The Neo/Tangerine/Rogers/Simplii cosmetic
  "TD Rewards" program mapping is harmless for `cashback_pct` cards (optimizer uses
  the % directly) — noted, not churned.
- **Defunct-issuer cluster:** HSBC x3, Capital One Aspire/Costco, MBNA Alaska — five
  cards for products no longer issued in Canada. Bundled as a deactivation
  recommendation (product decision).
- **Fabricated SKU:** TD First Class Travel VI **Privilege** does not exist — the most
  serious integrity finding of this sweep.

### Status (post-sweep)

- **15 migrations** (000059–000074). Batches 10–15 corrected **26 cards**, verified
  **~16 more** correct, and flagged **~13** for product decisions (defunct issuers,
  fabricated SKU, debit account, French-name duplicate, no-rewards cards, points
  currencies that don't map cleanly). Every fix reversible + round-trip tested;
  duplicate scan = 0 after each. **Final migration version: 74.**
