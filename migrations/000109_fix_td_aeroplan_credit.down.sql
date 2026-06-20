-- ─────────────────────────────────────────────────────────────────────────────
-- 000109_fix_td_aeroplan_credit (down) — restore the pre-109 values
-- ─────────────────────────────────────────────────────────────────────────────
-- Reverts the value/description changes made by the up migration, restoring the
-- exact magnitudes that 000010 seeded:
--   - 'Worldwide Companion Pass spend' -> value_cad = 25000.00 (the $25k spend
--      threshold, mis-stored as a credit — this is the broken state by design).
--   - 'Annual Travel Credit'           -> value_cad = 100.00  (duplicate NEXUS).
--
-- Scoped to the same TD Aeroplan Visa Infinite Privilege rows by stable
-- card+credit name. These UPDATEs only affect rows that still exist; on a DB
-- where 000087/000097 already deleted them, the down is a safe no-op.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE card_credit_defs d
   SET value_cad   = 25000.00,
       description = 'Spend $25,000 in a calendar year to unlock a Worldwide Companion Pass.'
  FROM cards c
 WHERE c.id = d.card_id
   AND c.name = 'TD Aeroplan Visa Infinite Privilege'
   AND d.name = 'Worldwide Companion Pass spend'
   AND d.value_cad <> 25000.00;

UPDATE card_credit_defs d
   SET value_cad   = 100.00,
       description = '$100 NEXUS application credit (every 4 years).'
  FROM cards c
 WHERE c.id = d.card_id
   AND c.name = 'TD Aeroplan Visa Infinite Privilege'
   AND d.name = 'Annual Travel Credit'
   AND d.value_cad <> 100.00;
