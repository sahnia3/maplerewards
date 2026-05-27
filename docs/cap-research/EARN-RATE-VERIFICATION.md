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

## Systemic issue discovered (separate value-model fix, NOT rate-data)

**BMO Rewards points cards modelled as `cashback_pct`.** BMO eclipse VI/VIP (and
likely BMO Ascend / BMO Rewards MC) earn BMO *Rewards points* (~0.67¢/pt via
travel), but are seeded `earn_type = cashback_pct` with the points count as the
percent — so the optimizer values "5 points" as "5%" (≈3.3% real), **over-valuing
~50%**. Rate-data is now correct; the fix here is `earn_type` -> `points` + a
verified BMO Rewards CPP in `program_valuations`. Deferred as a value-model
decision (affects several BMO cards + the optimizer's $ output). The real BMO
*CashBack* series (e.g. BMO CashBack WE/MC) IS genuine cash back — correctly
`cashback_pct`, no change.

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
