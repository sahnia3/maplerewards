# Migration 000088 — Card-Data Accuracy Corrections (Report)

Generated from the 124-agent data-accuracy audit (`high_severity`: 113 items). This migration applies **only** concrete, self-validated, reversible column writes. Every applied UPDATE was gated against the live DB: the row's *current* value had to match the audit's stated `our_value` before a correction was emitted, and each statement was dry-run inside a `BEGIN … ROLLBACK` transaction (all reported `UPDATE 1`).

## Summary

| Outcome | Count |
|---|---|
| **Applied** (concrete UPDATEs in 000088) | **31** corrections (30 emitted statements; 1 same-row change folded into another) |
| Deferred — structural / prose / not column-writable | 70 |
| Skipped — audit premise stale (DB already at corrected value) | 9 |
| Skipped — card not found / ambiguous name | 2 |
| Skipped — DB disagreed with audit `our_value` | 0 |
| **Total high-severity items** | **113** |

Emitted SQL statements in `000088_*.up.sql`: **31** (15 `annual_fee`, 1 `loyalty_program`, 15 `card_multipliers` rate/type — one of which is a merged rate+type write).

Schema touched: `cards.annual_fee`, `cards.loyalty_program_id`, `card_multipliers.earn_rate`, `card_multipliers.earn_type`. Multiplier rows are keyed by their immutable `id` (resolved from card name + category slug at generation time); card rows by `name`. Each `UPDATE` includes the prior value in its `WHERE` clause, so it is a no-op if the data has already drifted (safe to re-run / safe if state changed).

## Applied corrections

### American Express

| Card | Field | Old | New | Source |
|---|---|---|---|---|
| American Express Business Edge | multiplier[dining] | rate 2 | rate 3 | americanexpress.com |
| American Express Business Edge | multiplier[everything-else] | type cashback_pct | type points | americanexpress.com |
| American Express Platinum Business | annual_fee | $499 | $799 | frugalflyer.ca |
| American Express Platinum Business | multiplier[everything-else] (rate+type) | rate 2 / type cashback_pct | rate 1.25 / type points | frugalflyer.ca |
| American Express Platinum Business | multiplier[travel] | rate 2 | rate 1.25 | frugalflyer.ca |
| Amex Cobalt | annual_fee | $155.88 | $191.88 | ratehub.ca |
| Amex Cobalt | multiplier[travel] | rate 2 | rate 1 | milesopedia.com |

### BMO

| Card | Field | Old | New | Source |
|---|---|---|---|---|
| BMO World Elite Mastercard | multiplier[everything-else] | rate 2 | rate 1 | finlywealth.com |
| BMO eclipse Visa Infinite Privilege | annual_fee | $180 | $599 | bmo.com |

### Brim

| Card | Field | Old | New | Source |
|---|---|---|---|---|
| Brim World Elite Mastercard | annual_fee | $199 | $89 | brimfinancial.com |

### CIBC

| Card | Field | Old | New | Source |
|---|---|---|---|---|
| CIBC Aventura Gold Visa | annual_fee | $79 | $139 | cibc.com |
| CIBC Dividend Platinum Visa | multiplier[dining] | rate 1 | rate 2 | princeoftravel.com |
| CIBC Dividend Platinum Visa | annual_fee | $30 | $99 | cibc.com |

### Desjardins

| Card | Field | Old | New | Source |
|---|---|---|---|---|
| Desjardins Cash Back World Elite Visa | annual_fee | $85 | $100 | desjardins.com |
| Desjardins Odyssey World Elite Mastercard | multiplier[dining] | rate 2 | rate 3 | desjardins.com |

### MBNA

| Card | Field | Old | New | Source |
|---|---|---|---|---|
| MBNA Rewards World Elite Mastercard | annual_fee | $89 | $120 | mbna.ca |
| MBNA Rewards World Elite Mastercard | multiplier[travel] | rate 2 | rate 1 | mbna.ca |

### National Bank

| Card | Field | Old | New | Source |
|---|---|---|---|---|
| National Bank Allure Mastercard | annual_fee | $79 | $0 | nbc.ca |
| National Bank Platinum Mastercard | annual_fee | $65 | $70 | milesopedia.com |

### Neo

| Card | Field | Old | New | Source |
|---|---|---|---|---|
| Neo Secured Mastercard | annual_fee | $0 | $96 | milesopedia.com |

### RBC

| Card | Field | Old | New | Source |
|---|---|---|---|---|
| RBC Avion Visa Platinum | annual_fee | $50 | $120 | rbcroyalbank.com |
| RBC WestJet Mastercard | annual_fee | $0 | $39 | rbcroyalbank.com |
| RBC WestJet World Elite Mastercard | multiplier[dining] | rate 2 | rate 1.5 | rbcroyalbank.com |
| RBC WestJet World Elite Mastercard | multiplier[streaming-digital] | rate 2 | rate 1.5 | rbcroyalbank.com |

### Scotiabank

| Card | Field | Old | New | Source |
|---|---|---|---|---|
| Scotiabank No-Fee Visa Card | multiplier[everything-else] | type cashback_pct | type points | milesopedia.com |
| Scotiabank No-Fee Visa Card | loyalty_program | scotia-rewards | scene-plus | ratehub.ca |
| Scotiabank Value Visa Card | multiplier[everything-else] | rate 0.5 | rate 0 | nerdwallet.com |

### TD

| Card | Field | Old | New | Source |
|---|---|---|---|---|
| TD Cash Back Visa Card | multiplier[gas-transit] | rate 0.75 | rate 1 | td.com |
| TD Cash Back Visa Card | multiplier[recurring-bills] | rate 0.75 | rate 1 | td.com |
| TD First Class Travel Visa Infinite | annual_fee | $120 | $139 | ratehub.ca |

### Wealthsimple

| Card | Field | Old | New | Source |
|---|---|---|---|---|
| Wealthsimple Visa Infinite | annual_fee | $0 | $240 | wealthsimple.com |

### Notes on selected applied corrections

- **Scotiabank Value Visa Card — everything-else earn_rate 0.5 → 0**: audit states the card "earns no rewards, no cash back, and no points of any kind." Writing `earn_rate = 0` removes the phantom 0.5% the optimizer would otherwise project. The card's `loyalty_program` ("none") could not be cleanly reassigned and is deferred (see below).
- **National Bank Allure / RBC WestJet / Neo Secured / Wealthsimple — annual_fee**: leading dollar amount taken as the annual fee; trailing prose ("$7.99/month", "waived for ≥$100k", "first year rebated") is contextual and does not change the stored annual figure.
- **American Express Platinum Business — everything-else**: a rate change (2 → 1.25) and an earn_type change (cashback_pct → points) targeted the same multiplier row and were merged into one UPDATE.
- **Scotiabank No-Fee Visa Card — loyalty_program scotia-rewards → scene-plus**: the only loyalty reassignment that resolved cleanly to an existing `loyalty_programs` row (Scene+).

## DB disagreed with audit `our_value` (most important to surface)

**None.** For every item with a concrete, comparable `our_value`, the live DB's current value matched what the audit claimed we had. This confirms the audit read the same database. (The closest signal of audit drift is the "stale premise" group below, where the DB *already* holds the audit's corrected value.)

## Skipped — audit premise stale (DB already correct)

These were flagged HIGH by the audit, but the DB's current value already equals the audit's "correct" value (the discrepancy was about category *scope/labeling*, not the stored number). No write needed.

| Card | Field | Detail |
|---|---|---|
| BMO CashBack World Elite Mastercard | multipliers[Gas & Transit].earn_rate | DB earn_rate already 4 |
| CIBC Dividend Visa Infinite | multiplier: Gas & Transit (earn_rate) | DB earn_rate already 4 |
| RBC British Airways Visa Infinite | multipliers[Travel].earn_rate category label | DB earn_rate already 3 |
| RBC WestJet Mastercard | multipliers[Travel].earn_rate — category scope too narrow | DB earn_rate already 1.5 |
| TD First Class Travel Visa Infinite | multipliers[Travel] earn_rate label/scope | DB earn_rate already 8 |
| TD Platinum Travel Visa | Travel earn rate (category scope) | DB earn_rate already 6 |
| TD Platinum Travel Visa | Gas & Transit earn rate (Gas component) | DB earn_rate already 4.5 |
| TD Rewards Visa Card | multipliers[category=Gas & Transit].earn_rate | DB earn_rate already 3 |
| TD Rewards Visa Card | multipliers[category=Travel].earn_rate | DB earn_rate already 4 |

## Skipped — card not found / ambiguous

| Audit card name | Field | Reason |
|---|---|---|
| Rogers Platinum Mastercard (now Rogers Red Mastercard) | loyalty_program | card name ambiguous: Rogers Platinum Mastercard / Rogers Red World Elite Mastercard |
| Rogers Platinum Mastercard (now Rogers Red Mastercard) | multiplier: Everything Else earn_rate | card name ambiguous: Rogers Platinum Mastercard / Rogers Red World Elite Mastercard |

## Deferred — needs manual / schema work

Not written to the migration. Each requires new rows, category restructuring, a proprietary loyalty currency, a value the schema cannot store faithfully, or human judgment.

### American Express

| Card | Field | Audit correct_value | Reason deferred |
|---|---|---|---|
| American Express Aeroplan Card | multipliers — missing Air Canada / Air Canada… | 2x points per dollar on Air Canada and Air Canada Vacations (separate category from gener… | not a concrete writable column (missing-category/prose/structural) |
| American Express Aeroplan Card | multipliers[Travel].earn_rate | 1x points on general Travel; the 2x rate applies only to Air Canada and Air Canada Vacati… | earn_rate correct has conditional/unit/tier prose -> not a clean rate ('1x poin… |
| American Express Aeroplan No Fee Card | annual_fee | The Aeroplan No Fee Card is a supplementary card only, not a standalone product. The prim… | annual_fee correct_value prose/ambiguous |
| American Express Aeroplan No Fee Card | multipliers — missing Air Canada bonus catego… | 2x on eligible purchases made directly with Air Canada and Air Canada Vacations | not a concrete writable column (missing-category/prose/structural) |
| American Express Aeroplan No Fee Card | multipliers — missing dining bonus category | 1.5x on eligible dining and food delivery in Canada | not a concrete writable column (missing-category/prose/structural) |
| Amex Aeroplan Business Reserve Card | multipliers — missing Hotels & Car Rentals ti… | 2 Aeroplan points per $1 on hotels and car rentals (distinct third tier, confirmed by Ame… | not a concrete writable column (missing-category/prose/structural) |
| Amex Gold Rewards | multipliers[Gas & Transit].category | Gas earns 2x; local/commuter Transit is explicitly excluded from the 2x earn rate. Only i… | not a concrete writable column (missing-category/prose/structural) |
| Marriott Bonvoy American Express Card | multipliers[0].category | Marriott Bonvoy Hotels | not a concrete writable column (missing-category/prose/structural) |
| Scotiabank Platinum American Express | multipliers | [{"category":"Hotels, Car Rentals & Things To Do via Scene+ Travel (Expedia)","earn_rate"… | not a concrete writable column (missing-category/prose/structural) |
| SimplyCash Card from American Express | loyalty_program | cashback (no transferable points program — cash credited directly to statement annually i… | loyalty: 'cashback (no transferable points program — cash credited directly to … |
| SimplyCash Preferred Card from American Express | loyalty_program | cashback (direct statement credit — not Membership Rewards) | loyalty: 'cashback (direct statement credit — not Membership Rewards)' not reso… |

### BMO

| Card | Field | Audit correct_value | Reason deferred |
|---|---|---|---|
| BMO Air Miles Mastercard | multipliers — missing accelerated category: A… | 3 Air Miles per $25 spent at participating Air Miles Partners (= 0.12 miles per dollar) | not a concrete writable column (missing-category/prose/structural) |
| BMO Air Miles Mastercard | multipliers — missing accelerated category: G… | 2 Air Miles per $25 spent at eligible grocery stores (= 0.08 miles per dollar) | not a concrete writable column (missing-category/prose/structural) |
| BMO Air Miles World Elite Mastercard | multipliers[Dining].earn_rate | 0.0833 miles per dollar (1 mile per $12 — base rate applies to dining; no permanent eleva… | correct earn_rate 0.0833 cannot be stored faithfully in numeric(5,2) (rounds to… |
| BMO Air Miles World Elite Mastercard | multipliers[Entertainment].earn_rate | 0.0833 miles per dollar (1 mile per $12 — base rate applies to entertainment; no permanen… | correct earn_rate 0.0833 cannot be stored faithfully in numeric(5,2) (rounds to… |
| BMO Ascend World Elite Mastercard | multipliers — missing category: Recurring Bil… | 3 points per dollar on eligible recurring bill payments | not a concrete writable column (missing-category/prose/structural) |
| BMO Cash Back Mastercard | loyalty_program | cashback (direct cash back, not a points program — BMO Rewards points are a separate prog… | loyalty: not a real program (none/proprietary/cashback-bare) |
| BMO CashBack World Elite Mastercard | multipliers — missing Gas category | Gas and electric vehicle charging is a distinct category earning 3% cashback (capped at $… | not a concrete writable column (missing-category/prose/structural) |
| BMO Preferred Rate Mastercard | loyalty_program | None. The BMO Preferred Rate Mastercard does not participate in BMO Rewards or any loyalt… | loyalty: not a real program (none/proprietary/cashback-bare) |
| BMO Preferred Rate Mastercard | multipliers[0].earn_rate (cashback_pct on Eve… | No rewards or cashback earned on any purchases. This is a low-interest/balance-transfer c… | earn_rate correct has no concrete numeric ('No rewards or cashback earned on an… |
| BMO World Elite Mastercard | Travel earn_rate | 5 points per $1 (up to $15,000/year, then 1x) | earn_rate correct has conditional/unit/tier prose -> not a clean rate ('5 point… |

### CIBC

| Card | Field | Audit correct_value | Reason deferred |
|---|---|---|---|
| CIBC Aeroplan Visa Infinite Privilege | Travel earn_rate | 1.5 (general travel); 2.0 applies only to Air Canada and Air Canada Vacations direct purc… | earn_rate correct has conditional/unit/tier prose -> not a clean rate ('1.5 (ge… |
| CIBC Aeroplan Visa Infinite | multipliers[category=Gas & Transit] | Gas (and EV charging) earns 1.5x, but Transit is NOT an accelerated category. Transit pur… | not a concrete writable column (missing-category/prose/structural) |
| CIBC Aeroplan Visa Infinite | multipliers[category=Travel] | No general 'Travel' category at 1.5x. The 1.5x accelerated rate applies only to Air Canad… | not a concrete writable column (missing-category/prose/structural) |
| CIBC Aventura Visa Infinite | Travel category earn rate scope | 2x points applies ONLY to travel purchased through the CIBC Rewards Centre portal (powere… | earn_rate correct has conditional/unit/tier prose -> not a clean rate ('2x poin… |
| CIBC Costco Mastercard | loyalty_program | CIBC Costco Cash Back (Costco Cash Back Gift Certificate, NOT Aventura) | loyalty: 'CIBC Costco Cash Back (Costco Cash Back Gift Certificate, NOT Aventur… |
| CIBC Costco Mastercard | multipliers[category=Groceries].earn_rate | No generic Groceries category exists. Costco.ca online purchases earn 2% (capped at $8,00… | earn_rate correct has conditional/unit/tier prose -> not a clean rate ('No gene… |
| CIBC Dividend Visa Infinite | loyalty_program | cibc-dividend (standalone cash back program, not Aventura) | loyalty: 'cibc-dividend (standalone cash back program, not Aventura)' not resol… |
| CIBC Select Visa Card | loyalty_program | none — this card has no rewards or cashback program; it is a low-interest balance transfe… | loyalty: not a real program (none/proprietary/cashback-bare) |
| CIBC Select Visa Card | multipliers[0].earn_type | none — the card earns no cashback and is not part of any cashback program | cannot resolve category from field label |
| CIBC Tim Hortons Visa | loyalty_program | Tim Cash (Tim Hortons loyalty currency, redeemable only at Tim Hortons — not a CIBC Divid… | loyalty: not a real program (none/proprietary/cashback-bare) |
| CIBC Tim Hortons Visa | multipliers[Dining].earn_rate | 1% Tim Cash on all purchases (flat rate, no dining category bonus) | earn_rate correct has conditional/unit/tier prose -> not a clean rate ('1% Tim … |
| CIBC Tim Hortons Visa | multipliers[Everything Else].earn_rate | 1% Tim Cash on all purchases (same flat rate as all other categories) | earn_rate correct has conditional/unit/tier prose -> not a clean rate ('1% Tim … |
| Simplii Cash Back Visa | loyalty_program | none (pure cash back card; Simplii Financial is a CIBC division — no TD affiliation) | loyalty: not a real program (none/proprietary/cashback-bare) |
| Simplii Cash Back Visa | loyalty_program | direct cash back — no named loyalty program. Simplii Financial is a CIBC brand; TD Reward… | loyalty: not a real program (none/proprietary/cashback-bare) |
| Simplii Cash Back Visa | multipliers — missing category: Gas / Groceri… | 1.5% cashback on eligible gas, groceries, drugstore purchases, and pre-authorized payment… | not a concrete writable column (missing-category/prose/structural) |
| Simplii Cash Back Visa | multipliers — missing category: Restaurants/B… | 4% cashback on eligible restaurant, bar, and coffee shop purchases (up to $5,000/year cap) | not a concrete writable column (missing-category/prose/structural) |

### Desjardins

| Card | Field | Audit correct_value | Reason deferred |
|---|---|---|---|
| Desjardins Cash Back Visa | multipliers[Gas & Transit].category | Alternative transportation (public transit / rideshare only — gas/fuel stations are NOT i… | not a concrete writable column (missing-category/prose/structural) |
| Desjardins Cash Back World Elite Visa | network | mastercard | network change outside loyalty/fee/earn scope |
| Desjardins Odyssey World Elite Mastercard | multipliers[Gas & Transit].category | Transit / Public Transportation only — gas stations have no bonus category and earn the b… | not a concrete writable column (missing-category/prose/structural) |
| Desjardins Odyssey World Elite Mastercard | multipliers[Gas & Transit].earn_rate for gas … | 1.5 (base rate — no dedicated gas category exists) | earn_rate correct has conditional/unit/tier prose -> not a clean rate ('1.5 (ba… |

### MBNA

| Card | Field | Audit correct_value | Reason deferred |
|---|---|---|---|
| MBNA Smart Cash Platinum Plus Mastercard | multipliers[Gas & Transit].category | Gas only (transit is NOT a bonus category — earns base 0.5%) | not a concrete writable column (missing-category/prose/structural) |

### National Bank

| Card | Field | Audit correct_value | Reason deferred |
|---|---|---|---|
| National Bank Syncro Mastercard | loyalty_program | none — the Syncro Mastercard has no rewards program; it is a low-interest card with Rewar… | loyalty: not a real program (none/proprietary/cashback-bare) |

### Neo

| Card | Field | Audit correct_value | Reason deferred |
|---|---|---|---|
| Neo Mastercard | loyalty_program | Neo cashback (proprietary — no points program, no TD Rewards affiliation) | loyalty: not a real program (none/proprietary/cashback-bare) |
| Neo Mastercard | multipliers[Dining].earn_rate | No dedicated Dining category exists on the base Neo Mastercard. Dining earns the base 1% … | earn_rate correct has conditional/unit/tier prose -> not a clean rate ('No dedi… |
| Neo Secured Mastercard | loyalty_program | Neo Financial's own proprietary cashback program (no TD Bank affiliation) | loyalty: not a real program (none/proprietary/cashback-bare) |
| Neo World Elite Mastercard | loyalty_program | neo-rewards (proprietary cashback program operated by Neo Financial; no affiliation with … | loyalty: not a real program (none/proprietary/cashback-bare) |

### RBC

| Card | Field | Audit correct_value | Reason deferred |
|---|---|---|---|
| RBC Cash Back Mastercard | loyalty_program | rbc-cash-back (direct cash back credited to account — not an Avion points program) | loyalty: not a real program (none/proprietary/cashback-bare) |
| RBC Cash Back Preferred World Elite Mastercard | loyalty_program | rbc-cash-back (direct cash back, not Avion points) | loyalty: not a real program (none/proprietary/cashback-bare) |

### Rogers

| Card | Field | Audit correct_value | Reason deferred |
|---|---|---|---|
| Rogers Red World Elite Mastercard | loyalty_program | Rogers Bank cash back (no points program — direct cash back credited to statement/Rogers … | loyalty: not a real program (none/proprietary/cashback-bare) |
| Rogers World Elite Mastercard | loyalty_program | Rogers Red Cash Back (proprietary Rogers Bank cashback program — no connection to TD Bank… | loyalty: not a real program (none/proprietary/cashback-bare) |
| Rogers World Elite Mastercard | multipliers[0].earn_rate (Everything Else) | 2% cashback (with at least 1 qualifying Rogers/Fido/Shaw service) or 1.5% cashback (witho… | earn_rate correct has conditional/unit/tier prose -> not a clean rate ('2% cash… |

### Scotiabank

| Card | Field | Audit correct_value | Reason deferred |
|---|---|---|---|
| Scotia Momentum Mastercard No Fee | loyalty_program | cashback | loyalty: not a real program (none/proprietary/cashback-bare) |
| Scotia Momentum Visa Infinite | loyalty_program | cashback (no points program — cash back deposited directly; Scene+ only appears as an opt… | loyalty: not a real program (none/proprietary/cashback-bare) |
| Scotiabank Momentum No-Fee Visa | loyalty_program | cash_back | loyalty: 'cash_back' not resolvable to existing loyalty_programs row |
| Scotiabank No-Fee Visa Card | missing_categories | 2x Scene+ points at Sobeys/IGA/Safeway/Foodland/FreshCo/Co-ops, 2x at Home Hardware, 2x a… | not a concrete writable column (missing-category/prose/structural) |
| Scotiabank Passport Visa Infinite | multipliers[Gas & Transit].category | Transit earns 2x; Gas is NOT an accelerated category and earns the base 1x rate. The card… | not a concrete writable column (missing-category/prose/structural) |
| Scotiabank Value Visa Card | loyalty_program | none — this is a low-interest card with no rewards program | loyalty: not a real program (none/proprietary/cashback-bare) |

### Tangerine

| Card | Field | Audit correct_value | Reason deferred |
|---|---|---|---|
| Tangerine Money-Back Credit Card | loyalty_program | Tangerine Money-Back Rewards (proprietary cashback — no points currency; cash deposited m… | loyalty: not a real program (none/proprietary/cashback-bare) |
| Tangerine World Mastercard | loyalty_program | tangerine-money-back-rewards | loyalty: 'tangerine-money-back-rewards' not resolvable to existing loyalty_prog… |

### TD

| Card | Field | Audit correct_value | Reason deferred |
|---|---|---|---|
| TD Aeroplan Visa Infinite Privilege | Travel category earn rate | 1.5x points on travel & transit (general travel); 2x points applies only to Air Canada di… | earn_rate correct has conditional/unit/tier prose -> not a clean rate ('1.5x po… |
| TD Aeroplan Visa Infinite | Category: Travel (earn_rate 1.5) | Only direct Air Canada purchases (including Air Canada Vacations) earn 1.5 points per dol… | earn_rate correct has conditional/unit/tier prose -> not a clean rate ('Only di… |
| TD Aeroplan Visa Platinum | multipliers[Travel].earn_rate category scope | Only direct Air Canada purchases (aircanada.com, airport counter, onboard, Air Canada Vac… | earn_rate correct has conditional/unit/tier prose -> not a clean rate ('Only di… |
| TD Cash Back Visa Infinite | loyalty_program | cash-back-dollars | loyalty: 'cash-back-dollars' not resolvable to existing loyalty_programs row |
| TD First Class Travel Visa Infinite | multipliers[Gas & Transit] category — Gas com… | Public Transit earns 6x points; Gas/petrol purchases are NOT in any accelerated category … | not a concrete writable column (missing-category/prose/structural) |

### Wealthsimple

| Card | Field | Audit correct_value | Reason deferred |
|---|---|---|---|
| Wealthsimple Cash Card | network | mastercard | network change outside loyalty/fee/earn scope |

### Other

| Card | Field | Audit correct_value | Reason deferred |
|---|---|---|---|
| PC Money Account | multipliers[*].earn_type | points (PC Optimum points — 10,000 pts = $10; not a cashback product) | cannot resolve category from field label |
| Triangle Mastercard | multipliers[0] — Gas & Transit earn_rate | 5¢ per litre in CT Money at Gas+/Petro-Canada locations — not a percentage; no 'Transit' … | earn_rate correct has conditional/unit/tier prose -> not a clean rate ('5¢ per … |
| Triangle World Elite Mastercard | multipliers[Gas & Transit].earn_rate and earn… | 5¢/litre (regular) or 7¢/litre (premium) in CT Money at Gas+ stations only; no transit bo… | earn_rate correct has conditional/unit/tier prose -> not a clean rate ('5¢/litr… |
| Triangle World Elite Mastercard | multipliers[Groceries].earn_rate | 3% CT Money (on first $12,000/yr; excludes Costco and Walmart) | earn_rate correct has conditional/unit/tier prose -> not a clean rate ('3% CT M… |

---
_Down-migration restores every prior value (reversibility verified by a BEGIN → up → down → ROLLBACK dry-run: all statements reported `UPDATE 1`). Migration not applied to any database._
