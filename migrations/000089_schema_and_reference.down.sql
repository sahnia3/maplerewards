-- Reverts 000089_schema_and_reference.up.sql. Statements run in reverse dependency order.
-- Because golang-migrate tears down migrations newest-first, 092/091/090 have already been
-- reverted before this runs, so: no card still points at the new loyalty programs, and no
-- card_multiplier still references the new categories or carries a sub-cent earn_rate. Each
-- WHERE pins the corrected value so a revert is a safe no-op if data has drifted.

-- ============================== (D) revert other-data valuation corrections ==============================
-- Hilton 0.6 -> 0.5
UPDATE point_valuations SET cpp = 0.5000 WHERE loyalty_program_id = $$10000000-0000-0000-0000-000000000014$$ AND segment = $$base$$ AND cpp = 0.6000;
UPDATE loyalty_programs SET base_cpp = 0.5000 WHERE id = $$10000000-0000-0000-0000-000000000014$$ AND base_cpp = 0.6000;
-- Capital One 1.0 -> 0.5
UPDATE point_valuations SET cpp = 0.5000 WHERE loyalty_program_id = $$10000000-0000-0000-0000-000000000021$$ AND segment = $$base$$ AND cpp = 1.0000;
UPDATE loyalty_programs SET base_cpp = 0.5000 WHERE id = $$10000000-0000-0000-0000-000000000021$$ AND base_cpp = 1.0000;
-- Home Trust 1.0 -> 0.5 and program_type cashback -> bank
UPDATE point_valuations SET cpp = 0.5000 WHERE loyalty_program_id = $$10000000-0000-0000-0000-000000000025$$ AND segment = $$base$$ AND cpp = 1.0000;
UPDATE loyalty_programs SET program_type = $$bank$$ WHERE id = $$10000000-0000-0000-0000-000000000025$$ AND program_type = $$cashback$$;
UPDATE loyalty_programs SET base_cpp = 0.5000 WHERE id = $$10000000-0000-0000-0000-000000000025$$ AND base_cpp = 1.0000;
-- MBNA 1.0 -> 0.7
UPDATE point_valuations SET cpp = 0.7000 WHERE loyalty_program_id = $$10000000-0000-0000-0000-000000000022$$ AND segment = $$base$$ AND cpp = 1.0000;
UPDATE loyalty_programs SET base_cpp = 0.7000 WHERE id = $$10000000-0000-0000-0000-000000000022$$ AND base_cpp = 1.0000;
-- Air Miles valuations back to original (wrong-scale) values
UPDATE point_valuations SET cpp = 0.1200 WHERE loyalty_program_id = $$10000000-0000-0000-0000-000000000017$$ AND segment = $$economy$$  AND cpp = 12.0000;
UPDATE point_valuations SET cpp = 0.2100 WHERE loyalty_program_id = $$10000000-0000-0000-0000-000000000017$$ AND segment = $$business$$ AND cpp = 13.0000;
UPDATE point_valuations SET cpp = 0.1500 WHERE loyalty_program_id = $$10000000-0000-0000-0000-000000000017$$ AND segment = $$base$$     AND cpp = 10.5000;

-- ============================== (C) drop new loyalty programs + their valuations ==============================
-- Delete the base point_valuations rows first (FK), then the programs. Keyed by slug. Safe because
-- 091's down has already re-pointed every reassigned card back to its original program.
DELETE FROM point_valuations
WHERE loyalty_program_id IN (
  SELECT id FROM loyalty_programs WHERE slug IN (
    $$cashback$$,$$neo-cashback$$,$$rogers-cashback$$,$$tangerine-money-back$$,$$simplii-cashback$$,
    $$scotia-cashback$$,$$rbc-cash-back$$,$$bmo-cashback$$,$$amex-simplycash$$,$$cibc-costco-cashback$$,
    $$tim-cash$$,$$td-cash-back$$
  )
) AND segment = $$base$$ AND effective_date = DATE $$2026-06-01$$;

DELETE FROM loyalty_programs WHERE slug IN (
  $$cashback$$,$$neo-cashback$$,$$rogers-cashback$$,$$tangerine-money-back$$,$$simplii-cashback$$,
  $$scotia-cashback$$,$$rbc-cash-back$$,$$bmo-cashback$$,$$amex-simplycash$$,$$cibc-costco-cashback$$,
  $$tim-cash$$,$$td-cash-back$$
);

-- ============================== (B) drop new categories ==============================
-- Safe because 090/092 downs have already removed/repointed every multiplier referencing these.
DELETE FROM categories WHERE slug IN ($$air-canada$$, $$gas$$, $$transit$$, $$air-miles-partners$$);

-- ============================== (A) narrow earn_rate precision back ==============================
-- Guard against silent data loss: if any value still carries >2 decimal places (i.e. a sub-cent
-- rate from 092 was not reverted), abort the down instead of truncating.
DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM card_multipliers
    WHERE earn_rate <> round(earn_rate, 2) OR fallback_earn_rate <> round(fallback_earn_rate, 2)
  ) THEN
    RAISE EXCEPTION 'Cannot narrow earn_rate to numeric(5,2): sub-cent values present; revert migration 092 first';
  END IF;
END
$guard$;
ALTER TABLE card_multipliers ALTER COLUMN fallback_earn_rate TYPE numeric(5,2);
ALTER TABLE card_multipliers ALTER COLUMN earn_rate TYPE numeric(5,2);
