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
| Amex Cobalt | streaming 5.0, travel 2.0 | streaming 3.0, no travel | 000061 | princeoftravel |
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

## Status

- **6 migrations** (000059–000064), **~42 cards** cited-verified, every confirmed
  error fixed + reversible + round-trip tested. Catalog-wide duplicate scan: 0.
- Data fixes are **live on the DB** (no app redeploy needed for data).
- **Remaining ~62 cards** need the same per-card cited verification to call the
  catalog fully ratified. The "Higher-risk" list above is the priority queue.
