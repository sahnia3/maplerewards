-- Fresh-deploy data-integrity fix (found via a full fresh-DB migration-chain
-- ratification, 2026-05-27).
--
-- Migration 000058 deduped transfer_partners by HARDCODED id, but those rows
-- were seeded with gen_random_uuid() (migrations 006/007). So on any FRESH DB
-- the generated ids differ from 058's hardcoded ones and 058's deletes don't
-- match — leaving duplicates. The live DB is clean only because 058's hardcoded
-- ids happen to match the ids generated there originally.
--
-- For 4 of the 5 pairs 058 targets, the duplicate collides with the original on
-- the (from,to,effective_from) unique constraint, so only one survives anyway.
-- The Amex MR Canada -> Marriott Bonvoy pair is the exception: migration 006
-- seeds the "5:6 periodic" row at CURRENT_DATE and migration 007 seeds the
-- "1:1.2" row at 2026-03-09 — different effective_from, so BOTH survive on a
-- fresh DB and the loyalty page shows Marriott twice. Both are 1.2x (same value),
-- so this is a cosmetic duplicate, not a wrong ratio.
--
-- Dedupe id-independently: delete the 007-seeded "1:1.2" row (effective
-- 2026-03-09), keeping the "5:6 periodic" row that 058 intended to keep. No-op on
-- the live DB (058 already removed the 2026-03-09 row there).
DELETE FROM transfer_partners
WHERE from_program_id = (SELECT id FROM loyalty_programs WHERE slug = 'amex-mr-ca')
  AND to_program_id   = (SELECT id FROM loyalty_programs WHERE slug = 'marriott-bonvoy')
  AND transfer_ratio = 1.2000
  AND effective_from = '2026-03-09';
