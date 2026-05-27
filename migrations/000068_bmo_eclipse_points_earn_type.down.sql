-- Reverse batch 9: restore earn_type=cashback_pct on BMO eclipse VI/VIP.
UPDATE card_multipliers SET earn_type = 'cashback_pct'
WHERE card_id IN (SELECT id FROM cards WHERE name IN ('BMO eclipse Visa Infinite', 'BMO eclipse Visa Infinite Privilege'))
  AND earn_type = 'points';
