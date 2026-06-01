# Structural-data correction migrations 000089–000092

Generated 2026-06-01 from the structural-data research specs (groups: `missing-categories`,
`cashback-loyalty`, `rates-precision-scope`, `simple-and-ambiguous`, `other-data`) layered on
the 124-agent data-accuracy audit. These migrations apply the **structural** findings the prior
pass (000088) intentionally deferred: new spend categories, new cash-back / proprietary loyalty
programs, loyalty reassignments, category-scope splits, tier caps, sub-cent precision, network
fixes, and loyalty-program valuation corrections.

Every id/slug/multiplier referenced below was re-verified against the live DB (104 cards,
`schema_migrations = 87`) before authoring. The whole chain was dry-run inside a single
`BEGIN … ROLLBACK` (ups → verify → downs → verify), every statement succeeded, every down
reversed cleanly, and the DB was left at version 87 unchanged. **No `make migrate-up` was run;
nothing was committed.**

## Apply order (numeric = dependency = apply order)

| File | What it does |
|------|--------------|
| `000089_schema_and_reference` | (A) widen `card_multipliers.earn_rate`/`fallback_earn_rate` `numeric(5,2)→(6,4)`; (B) create 4 categories; (C) create 12 cash-back/proprietary loyalty programs + matching `point_valuations` base rows; (D) correct existing loyalty-program valuations (other-data group). |
| `000090_missing_category_multipliers` | Insert 5 accelerated-earn rows that were absent, using only pre-existing categories. |
| `000091_loyalty_reassignments` | Repoint 27 cards' `loyalty_program_id` to the correct program; flip 1 multiplier `earn_type`. |
| `000092_rate_scope_network_fixes` | 2 network fixes; sub-cent precision; BMO WE travel-tier cap; Aeroplan→Air-Canada scope splits; Gas/Transit scope splits (+2 cap-group migrations); portal demotions; Triangle CT-Money approximation; insert 11 new rows. |

Each migration has a matching `.down.sql` that fully reverses it (prior values pinned in `WHERE`;
new rows deleted by `(card_id, category_id, effective_from = 2026-06-01)`; column narrowing guarded
against silent precision loss). golang-migrate runs each file in its own transaction (matching 80–88).

## Counts by type

| Change | Count | Where |
|--------|------:|-------|
| Categories created | **4** | 089 — `air-canada` (…011), `gas` (…012), `transit` (…014), `air-miles-partners` (…016) |
| Loyalty programs created | **12** | 089 — `cashback`, `neo-cashback`, `rogers-cashback`, `tangerine-money-back`, `simplii-cashback`, `scotia-cashback`, `rbc-cash-back`, `bmo-cashback`, `amex-simplycash`, `cibc-costco-cashback`, `tim-cash`, `td-cash-back` (+12 matching `point_valuations` base rows) |
| Loyalty-program valuations corrected (other-data) | **7 `point_valuations` + 5 `loyalty_programs`** | 089 — Air Miles base/business/economy; MBNA/Home-Trust/Capital-One/Hilton base_cpp+pv; Home-Trust `program_type` |
| New `card_multipliers` rows inserted | **16** | 090 (5) + 092 (11) |
| Cards reassigned (`loyalty_program_id`) | **27** | 091 |
| Multiplier `earn_type` flips | **1** | 091 — Scotiabank No-Fee Visa everything-else `cashback_pct→points` |
| Rate / scope / repoint `card_multipliers` UPDATEs | **31** | 092 — precision (3), BMO WE tier+fallbacks (4), Aeroplan demotes/repoints (8), portal demotes (4), gas/transit repoints (9), CIBC/BMO split repoints (2), Triangle repoints (2) (some rows touched by >1 column in one statement) |
| Network fixes | **2** | 092 — Desjardins Cash Back WE Visa (…054)→mastercard; Wealthsimple Cash Card (…103)→mastercard |
| `cap_group_categories` migrations | **2** | 092 — Scotia Passport (…048002) gas-transit→transit; MBNA Smart Cash (…048006) gas-transit→gas |

## Key modeling decisions

- **Air Miles valuation was the highest-impact fix.** `point_valuations` for `air-miles` were on a
  ~70× too-low scale (base 0.15 / business 0.21 / economy 0.12) while `base_cpp` was correctly 10.5.
  Because the optimizer reads `point_valuations` first (`internal/service/optimizer.go:410` →
  `internal/repo/valuations.go:20`), the two BMO Air Miles cards were valued at ~0.012 % return.
  Corrected to base 10.5 / business 13 / economy 12 (in-store fixed ~10.5¢; travel 12–15¢).
- **`earn_rate` widened to `numeric(6,4)`** so `1 Mile / $12 = 0.0833` survives (was rounding to 0.08).
  Go reads these as `float64`, so no code change. The down narrows back and **aborts** if any
  sub-cent value still exists (guards against data loss; 092-down clears them first in teardown order).
- **No `none` loyalty sentinel exists** (`cards.loyalty_program_id` is `NOT NULL`, no `none` in the
  `program_type` CHECK). The four "no rewards" cards (BMO Preferred Rate …097, CIBC Select …074,
  National Bank Syncro …057, Scotiabank Value …067) point at the generic `cashback` program
  (`base_cpp = 1.0`); their everything-else `earn_rate` is/should be 0 (earn-rate group / 000088), so
  projected rewards stay $0 regardless of program. `earn_type = 'none'` is likewise unrepresentable —
  left at `cashback_pct` with rate 0.
- **Aeroplan "Travel" rates are Air-Canada-only.** Demoted the broad Travel rows to base and added
  `air-canada` (…011) rows at the elevated rate on 8 cards (Amex …028/…095/…082, TD …004/…012/…063,
  CIBC …077/…023). For …082/…063 the existing Travel row *was* Air Canada, so it was repointed.
- **Gas/Transit splits.** The combined "Gas & Transit" bucket was split where only one half earns the
  bonus. Repointed to `gas` (…012) or `transit` (…014); the excluded half falls through to Everything
  Else. Where a cap group referenced the old combined category, the `cap_group_categories` row was
  migrated to follow the split (Scotia Passport, MBNA Smart Cash). CIBC Dividend (…024) and BMO
  CashBack (…021) earn *different* rates on each half, so they got a repoint **plus** a new row.
- **Portal-only travel bonuses demoted to base** (TD First Class/Platinum/Rewards Visa, CIBC Aventura
  VI). The headline rate applies only to the issuer's Expedia/Rewards-Centre portal, which the
  categorizer cannot detect from an MCC. Demoting is the conservative choice (avoids over-crediting
  direct travel). A `travel-portal` category was deliberately **not** created — it would rarely fire.
- **Scotiabank No-Fee Visa (…091) is the inverse of the cash-back theme:** it truly earns Scene+
  **points**. Reassigned to `scene-plus` and its base row's `earn_type` flipped to `points`, and the
  Groceries 2× / Cineplex(Entertainment) 2× rows (090) added as `points`.
- **Reconciliation of overlapping specs.** Cards 095/091/069/092 appeared in both the
  `missing-categories` and `rates-precision-scope` groups. To avoid double-inserts: existing-category
  rows (091 grocery+entertainment, 069 travel, 092 grocery, 022 recurring-bills) live in **090**; the
  new-category and scope-split work for those cards (095/082/092 Air-Canada & Air-Miles-Partners) lives
  in **092**. No row is inserted twice.

## Genuinely unrepresentable / approximated (with the choice made)

1. **AIR MILES Partners (BMO Air Miles …092)** and **Marriott Bonvoy Hotels (Marriott Amex …078)** are
   *merchant-network* concepts, not MCC-derivable spend categories — they will essentially never be
   selected by the optimizer.
   - *AIR MILES Partners*: modeled anyway on the new `air-miles-partners` (…016) category at 0.12
     miles/$ (the spec's preferred representation) — surfaced as an opt-in bonus, accepted that it
     won't match generic spend.
   - *Marriott Bonvoy 5×*: **left on the broad `travel` category, no SQL.** Repointing to a
     hotel-brand category would make the 5× unreachable in optimization. Labeling nuance only.
2. **Amex Aeroplan Business Reserve hotels/car-rentals 2× (…082).** No hotels/car-rental subcategory
   exists, and Travel is occupied by the 3× Air-Canada row. **Approximation:** the 3× row was
   repointed to `air-canada` and a *new* Travel row added at 2× (the hotels/car tier), which slightly
   over-credits third-party flights at 2×. Accepted as the closest representation.
3. **Home Hardware 2× (Scotiabank No-Fee Visa …091).** No home-improvement/hardware category exists.
   **Omitted** (matches the sibling Scene+ Visa convention). A precise fix needs a `home-improvement`
   category with hardware MCCs — low value, applies only to Scene+ co-brands.
4. **Triangle CT-Money per-litre gas (Triangle …051, Triangle WE …052).** Reward is *cents per litre*
   in CT Money, not a % of spend — the schema has no per-unit concept. **Approximation:** repointed to
   `gas`-only (no transit bonus exists), kept as a `cashback_pct` estimate (~2 % regular on …051; …052
   set to ~3.3 % regular-grade at $1.50/L, premium-grade uplift unrepresentable), with a documenting
   note. Transit falls through to base.
5. **Restricted-redemption cash currencies (Tim Cash, CIBC Costco Cash Back certificate)** are valued
   at `cpp = 1.0` like unrestricted cash, slightly overstating real value (Tim Cash spends only at Tim
   Hortons; Costco cert only in-warehouse). The audit gave no discounted figure, so 1.0 matches the
   existing direct-cash convention. Flagged in case a lower `base_cpp` is later desired.
6. **`earn_type = 'none'` / true "no loyalty program"** — not representable (see Key Decisions). Cards
   point at generic `cashback` with rate 0; value-faithful ($0) but the semantic label is imperfect.
7. **CIBC Costco Mastercard (…025) Costco-specific tiers** (Costco.ca 2 % capped $8k then 1 %,
   in-warehouse 1 %). "Costco" is one merchant, not a category. **No multiplier change** in this pass
   (the program reassignment to `cibc-costco-cashback` *is* applied). Note: the live DB *does* already
   carry a Groceries 2 % row for this card (the rates-spec's claim that none exists was incorrect) —
   that row is an earn-rate-group concern and was left untouched.

## Audit recommendations explicitly rejected (down-scoped)

The `other-data` audit's `program_issues` `consensus_cpp` figures are transfer-partner *aspirational
ceilings*, but `base_cpp` is architecturally the conservative `valueLow` **floor**
(`internal/handler/summary.go:50`; transfer ceilings are derived separately via `transfer_partners`).
Applying them verbatim would double-count and inflate every floor. Verified against the DB that the
following programs have **zero** `transfer_partners` rows (so they are fixed-value, floor == value):
`mbna-rewards`, `home-trust-rewards`, `capital-one-rewards`, `rbc-rewards`, `flying-blue`, `hilton-honors`.

- **rbc-avion**: keep `base_cpp = 1.1` (audit wanted 1.8). It *has* transfer partners; the uplift is
  already system-derived. **No change.**
- **rbc-rewards**: keep `0.5` (audit wanted 1.8 — that note was mis-attributed RBC-Avion text;
  rbc-rewards is non-transferable, fixed ~0.5¢). **No change.**
- **flying-blue**: keep `1.2` (audit wanted 1.8; 1.8 is aspirational, matches YAML `cpp_range.high`).
  **No change.**
- **capital-one-rewards**: applied **1.0** (audit wanted 2.3 = US transfer aspirational; CA cards are
  fixed 1 mile = 1¢, no partners).
- **mbna-rewards / home-trust-rewards**: applied **1.0** (both fixed-value; current 0.7/0.5 understated).
- **hilton-honors**: applied a mild **0.6** (audit wanted 0.65; 0.6 is the YAML/weighted midpoint under
  the 0.7¢ hotel-night ceiling).

Every `base_cpp` change is paired with the matching `point_valuations` base-segment update, because
the optimizer reads `point_valuations` while the wallet-summary/compare/card-detail/portfolio handlers
read `loyalty_programs.base_cpp` directly — both stores must stay consistent.

## Knowledge YAMLs

`internal/knowledge/rewards.yaml` and `credit_card_strategies.yaml` were reviewed and **left
unchanged**. Every figure the `other-data` group examined is already accurate there — indeed the YAMLs
are the authority the group cited to *reject* the audit's inflated numbers:
- `rewards.yaml` `air_miles.cpp_range` = 10.0–15.0 with in-store 10.53¢ / travel 12–15¢ (matches the
  DB valuation fix);
- `flying_blue` 1.2–2.5, `rbc_avion` 1.0–2.0, `hilton_honors` 0.4–0.7 — all consistent with keeping the
  conservative floors;
- `credit_card_strategies.yaml` already states MBNA "redeem at 1 cpp", Capital One "1 mile = 1¢ … no
  transfer partners", Home Trust "1 % cashback".

No stale concrete figure was found, so no YAML edit was warranted (avoiding invented changes).

## Out-of-scope items noted for other groups

- **TD Cash Back Visa Card (…062)** shares the `td-rewards` mislabel of its sibling TD Cash Back Visa
  Infinite (…011, reassigned to `td-cash-back` here). Reassign …062 to the same target for
  consistency — left out because it was not in the in-scope finding list; flagged here.
- **Simplii Cash Back Visa (…034) shared-cap refinement** (1.5 % gas/groceries/drugstore/pre-auth share
  one $15k/yr pool, but the DB models three separate $15k caps → over-counts to $45k). A `cap_group`
  fix is available but is a cap-precision refinement, not a missing category — **deferred**.
- **CIBC Aeroplan VI (…077) missing Groceries 1.5×** — a missing-category item, not a scope split;
  flagged to the categories group.
- Various **earn-rate** corrections referenced in the specs (e.g. Scotiabank Value 0.5→0, Triangle
  Groceries CT-Money, Desjardins Odyssey Dining) belong to the earn-rate group / 000088 and were not
  re-emitted here.

## Verification

Full `BEGIN … ROLLBACK` dry-run transcript (ups → 20 verification queries → downs → 17 verification
queries → ROLLBACK) executed against the live DB with `ON_ERROR_STOP=1`, exit code 0. Post-rollback
the DB is confirmed unchanged: `schema_migrations = 87` (not dirty), 29 loyalty programs, 0 new
categories, 0 rows dated 2026-06-01, Air Miles valuations still at the original 0.15/0.21/0.12.
