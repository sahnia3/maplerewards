-- Transfer-partner data fix (2026-05-27 deeper-dive finding; migration 000058
-- flagged this conflict and deferred it).
-- Amex MR Canada -> Hilton Honors had TWO active rows: 1:2 (effective 2026-03-09)
-- and 1:1 (effective 2026-04-05), so the optimizer/loyalty page showed two
-- contradictory Hilton transfer values. The Canadian MR program transfers to
-- Hilton at 1:1; the 1:2 ratio is the US program's. Prince of Travel's Canadian
-- MR guide confirms Marriott (1:1.2) is the "more favourable" hotel rate vs
-- Hilton — i.e. Hilton's ratio is below 1.2, so 1:1 is correct. Remove the bogus
-- 1:2 row; the correct 1:1 row (effective 2026-04-05) remains.
--   src: princeoftravel.com/points-programs/american-express-membership-rewards/ (verified 2026-05-27)

DELETE FROM transfer_partners
WHERE from_program_id = (SELECT id FROM loyalty_programs WHERE slug = 'amex-mr-ca')
  AND to_program_id = (SELECT id FROM loyalty_programs WHERE slug = 'hilton-honors')
  AND transfer_ratio = 2.0000
  AND effective_from = '2026-03-09';
