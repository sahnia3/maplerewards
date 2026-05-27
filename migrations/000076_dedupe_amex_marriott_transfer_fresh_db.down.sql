-- Reverse: re-add the 007-seeded "1:1.2 @ 2026-03-09" Amex MR -> Marriott row
-- (NOT EXISTS guard so it round-trips on a fresh DB without colliding with the
-- 5:6 row). Mirrors how migration 007 seeded it (random id is fine).
INSERT INTO transfer_partners (from_program_id, to_program_id, transfer_ratio, minimum_transfer, transfer_increment, processing_days, is_active, effective_from, notes)
SELECT (SELECT id FROM loyalty_programs WHERE slug = 'amex-mr-ca'),
       (SELECT id FROM loyalty_programs WHERE slug = 'marriott-bonvoy'),
       1.2, 1000, 1000, 2, true, '2026-03-09', 'Amex MR → Marriott Bonvoy 1:1.2'
WHERE NOT EXISTS (
  SELECT 1 FROM transfer_partners
  WHERE from_program_id = (SELECT id FROM loyalty_programs WHERE slug = 'amex-mr-ca')
    AND to_program_id   = (SELECT id FROM loyalty_programs WHERE slug = 'marriott-bonvoy')
    AND effective_from  = '2026-03-09');
