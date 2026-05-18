# Cap-Remediation Checklist (P0/P1 — authoritative, real DB)

**Generated:** 2026-05-18 from the **live application database** (host Postgres
`::1:5432`, `schema_migrations`=48, 104 cards, 299 active multipliers) after
migration `000048_cap_remediation`.

## Environment note (important)

A stale Docker Postgres container (`maplerewards-main-postgres-1`, 102 cards,
`schema_migrations`=9) exists alongside the host Postgres the app + `migrate`
actually use (`DATABASE_URL` → `localhost:5432`). **The host DB is
authoritative.** Early P0 numbers taken from the container (422/176/70) were
discarded; all numbers below are from the host DB and reconcile with the
original `docs/OPTIMIZER-CAP-AUDIT.md` (181 uncapped / 31 capped / 1 cap_group
baseline).

## Scope reconciliation

| Metric | Audit baseline | After 000048 |
|---|---|---|
| Distinct active bonus (rate>1) (card,category) pairs | 211 | 211 |
| Per-multiplier `cap_amount` set (active rows) | 31 | **44** |
| `cap_groups` | 1 (Cobalt) | **9** (8 new + Cobalt), 0 dupes |
| Pairs resolved by a real cap (CAP or SHARED, excl. Cobalt) | — | **65** |
| Pairs still on the conservative guardrail | 181 | **146** |

## Resolution legend

- **SHARED** — combined cap across categories → `cap_groups` + `cap_group_categories` (migration `000048` Part A, fixed UUIDs `…-0000000480NN`).
- **CAP** — per-category cap → `card_multipliers.cap_amount/cap_period/fallback_earn_rate` (Part B, or pre-existing catalog caps).
- **GUARDRAIL** — no DB cap; bounded by the shipped conservative
  `defaultUnverifiedAnnualCap` ($20k/yr, optimizer.go). Per the P1 web
  research every guardrail pair is one of:
  - **NOCAP-legit** — issuer publishes no cap (PC Optimum, Tangerine
    2%-chosen, most Amex MR / Aeroplan multipliers, CIBC "no limit"
    Dividend/Aventura/Costco, RBC Avion/ION+, Rogers, Triangle,
    Wealthsimple). Valid uncapped earn — guardrail only trims implausible
    extrapolation, never under-promises a real published cap.
  - **UNVERIFIED-discontinued** — product retired, no current authoritative
    terms (HSBC, MBNA Alaska, Capital One Costco, BMO World Elite). Guardrail
    retained deliberately.

Zero pairs are unresolved: 65 carry a verified cap; 146 are explicitly
classified NOCAP-legit or UNVERIFIED-discontinued with the guardrail as the
disclosed conservative bound.

## Verified caps applied by 000048 (the founder-grade fixes)

### SHARED cap groups (Part A)

| Card | Cap | Categories | source_url |
|---|---|---|---|
| **Scotiabank Gold American Express** | **$50,000 / yr → 1x** | Dining 5x, Entertainment 5x, Groceries 5x, Gas&Transit 3x, Streaming 3x | scotiabank.com official Gold Amex terms ("first $50,000 … Jan 1–Dec 31"); rewardscanada corroborates |
| Scotiabank Passport Visa Infinite | $50,000 / yr → 1x | Groceries 3x, Travel 2x, Dining 2x, Entertainment 2x, Gas&Transit 2x | princeoftravel.com Passport earning data |
| Scotia Momentum Visa Infinite | $25,000 / yr → 1% | Dining 2x, Gas&Transit 2x (Groceries 4x / Streaming 4x already per-mult capped) | scotiabank.com Momentum VI terms |
| American Express Business Edge | $25,000 / yr → 1x | Gas&Transit 3x, Dining 2x (75k-pt combined 3x cap) | princeoftravel.com Business Edge |
| BMO eclipse Visa Infinite Privilege | $25,000 / yr → 1x | Dining 3x, Gas&Transit 4x (Groceries 5x = separate $15k cap) | bmo.com eclipse VIP benefit guide PDF |
| MBNA Smart Cash Platinum Plus | $500 / mo → 0.5% | Gas&Transit 2%, Groceries 2% | mbna.ca Smart Cash terms |
| National Bank Syncro | $25,000 / yr → 1% | Groceries 2%, Gas&Transit 2% | nbc.ca Syncro terms |
| National Bank Platinum | $1,000 / mo → 1.5x | Dining 2x (gross monthly spend cap) | nbc.ca Platinum terms |

### Per-multiplier caps (Part B)

| Card · Category | Cap → fallback | source_url |
|---|---|---|
| SimplyCash Preferred Amex · Groceries | $30,000/yr → 2% | americanexpress.com/en-ca SimplyCash Preferred |
| TD First Class Travel VI · Dining, Groceries | $25,000/yr → 2x | td.com First Class Travel VI footnote 20 |
| RBC Cash Back Preferred WE · Everything Else | $25,000/yr → 1% | rbcroyalbank.com Cash Back Preferred WE |
| BMO Cash Back Mastercard · Groceries | $500/mo → 0.5% | bmo.com CashBack MC footnote 2C |
| BMO CashBack World Elite · Groceries | $500/mo → 1% | bmo.com CashBack WE FAQ / footnote 75 |
| BMO eclipse VIP · Groceries | $15,000/yr → 1x | bmo.com eclipse VIP PDF |
| BMO eclipse VI · Groceries $6k/yr; Gas $20k/yr | → 1x | princeoftravel.com eclipse VI |
| Desjardins Cash Back WE · Groceries | $10,000/yr → 1% | blog.rewardscanada.ca Desjardins caps |
| Desjardins Odyssey Visa Gold · Dining | $6,000/yr → 1x | blog.rewardscanada.ca Desjardins caps |
| MBNA Rewards WE · Dining | $50,000/yr → 1pt/$ | princeoftravel.com MBNA Rewards WE |
| Neo World Elite · Groceries $1k/mo; Streaming $500/mo; Gas $1k/mo | → 1% | neofinancial.com Neo World Elite |

> Pre-existing catalog caps (BMO Ascend WE, Brim WE, RBC Cash Back MC, Simplii
> Cash Back, TD Cash Back VI, TD Platinum Travel, National Bank WE, Desjardins
> Odyssey WE, CIBC Costco gas, Scotia Momentum groceries/streaming) were
> already correct and were left intact.

## Guardrail-classified pairs (146) — NOCAP-legit vs UNVERIFIED

Full per-pair source justifications: see the 6 P1 research-agent tables in the
session record. Summary:

- **NOCAP-legit (no DB change is correct):** all PC Financial (PC Optimum
  25/45/30x — audit §"Not a rate bug"), Tangerine Money-Back/World (unlimited
  2% chosen), Amex Gold/Platinum/Cobalt-addons/Marriott/Aeroplan-MR,
  Aeroplan multipliers (Amex/CIBC/TD), CIBC Dividend/Aventura/Costco
  ("no limit" per official CIBC pages), RBC Avion/ION+/British Airways/WestJet,
  Rogers Red/WE, Triangle (CT Money), Wealthsimple, SimplyCash base.
- **UNVERIFIED-discontinued (guardrail retained intentionally):** HSBC
  +Rewards / World Elite, MBNA Alaska Airlines WE, Capital One Costco,
  BMO World Elite, Scotiabank Platinum Amex (flat 2x — brief's 5x outdated).

## Founder bug — closed

`Scotiabank Gold American Express` is now a member of the
`Scotia Gold Amex $50K Annual Accelerated Cap` group across all 5 accelerated
categories. A `$100,000` grocery spend now blends `50,000@5x + 50,000@1x` via
`calculateBlendedRate` instead of the previous flat `500,000 pts`. Verified
end-to-end in P5.
