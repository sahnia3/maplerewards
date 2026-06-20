-- ─────────────────────────────────────────────────────────────────────────────
-- 000109_fix_td_aeroplan_credit — data-correctness fix (Renewal Optimizer)
-- ─────────────────────────────────────────────────────────────────────────────
-- Open-issue: the TD Aeroplan Visa Infinite Privilege showed ~$25,200 in
-- card_credit_defs, which made the Pro "Renewal Optimizer" wrongly tell users
-- to CANCEL the card. Root cause, traced to the original seed in
-- 000010_card_credits.up.sql:
--
--   (a) 'Worldwide Companion Pass spend'  value_cad = 25000.00, recurrence='annual'
--       — this is the $25,000 ANNUAL SPEND THRESHOLD to *unlock* a companion
--         pass, NOT a redeemable statement credit. annualizedCreditValue() returns
--         the full 25000 for an 'annual' row, so it dumped $25,000/yr of phantom
--         credit value into the renewal math. (internal/service/renewal.go:107,206)
--   (b) 'Annual Travel Credit'            value_cad = 100.00  (duplicate of NEXUS)
--   (c) 'NEXUS Credit'                    value_cad = 100.00  (the one REAL benefit)
--
--   25000 + 100 + 100 = ~$25,200 phantom total.
--
-- The documented, defensible benefit is exactly ONE $100 quadrennial NEXUS credit
-- (amortizes to $25/yr in the optimizer via recurrence='quadrennial'), already
-- present as the 'NEXUS Credit' row (value_cad=100.00, quadrennial), matching how
-- every other curated NEXUS row in this table is represented (000052).
--
-- value_cad is NUMERIC(10,2) in WHOLE CAD DOLLARS (e.g. 100.00, 200.00), not cents.
--
-- Prior migrations 000087 (deletes the companion-pass spend rows) and 000097
-- (deletes the duplicate 'Annual Travel Credit') already remediate a freshly
-- seeded global DB. This migration is the surgical, idempotent backstop: it
-- corrects the broken magnitude on the SPECIFIC offending rows by a STABLE key
-- (card name + credit name), covering any global OR user-private copy that an
-- environment may still hold (000087's delete was global-only by name; a stray
-- value would still poison the optimizer). It touches ONLY the broken rows.
-- A re-run is a safe no-op. golang-migrate wraps this in a transaction.
-- ─────────────────────────────────────────────────────────────────────────────

-- (a) Neutralize the mis-entered companion-pass SPEND THRESHOLD: it is a spend
--     hurdle, not redeemable value. Set value_cad to 0.00 so the renewal
--     optimizer stops counting it as ~$25,000 of credit. Scoped to the TD
--     Aeroplan Visa Infinite Privilege, by stable card+credit name. Covers any
--     global or user-private copy. WHERE value_cad <> 0 keeps it a no-op on re-run.
UPDATE card_credit_defs d
   SET value_cad   = 0.00,
       description = 'Spend $25,000/yr to UNLOCK the Worldwide Companion Pass. This is a spend threshold, not a redeemable statement credit, so it carries no standalone CAD value.'
  FROM cards c
 WHERE c.id = d.card_id
   AND c.name = 'TD Aeroplan Visa Infinite Privilege'
   AND d.name = 'Worldwide Companion Pass spend'
   AND d.value_cad <> 0.00;

-- (b) Collapse the duplicate 'Annual Travel Credit' (which is just the NEXUS
--     rebate re-entered, value_cad=100, quadrennial) to 0.00 value so it stops
--     double-counting the single real $100 NEXUS credit. The genuine benefit
--     lives in the 'NEXUS Credit' row, left untouched. Scoped by stable
--     card+credit name; no-op on re-run.
UPDATE card_credit_defs d
   SET value_cad   = 0.00,
       description = 'Duplicate of the NEXUS Credit (single $100 quadrennial NEXUS rebate); zeroed to avoid double-counting. See the NEXUS Credit row for the real benefit.'
  FROM cards c
 WHERE c.id = d.card_id
   AND c.name = 'TD Aeroplan Visa Infinite Privilege'
   AND d.name = 'Annual Travel Credit'
   AND d.value_cad <> 0.00;
