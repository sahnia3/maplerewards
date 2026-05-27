-- Card-data correction (2026-05-27): two NO-REWARDS low-interest cards were seeded with
-- fabricated earn rates, making the optimizer project rewards they do not pay (a
-- money-facing error — telling a user "2% groceries" on a card that earns nothing).
--   * National Bank Syncro Mastercard — a low-interest (8.90%) card that earns NO
--     rewards; the DB carried fabricated 2% grocery/gas/recurring + 0.5% base. Standard
--     annual fee $35 (refunded year 1). src: nbc.ca/.../syncro.html, milesopedia.
--   * CIBC Select Visa Card — low-interest card with no rewards program; the DB carried
--     a 0.5% base. Standard annual fee $29 (refunded first 2 yrs). src: cibc.com.
-- Both stay active (currently-issued products) but their rewards are zeroed so the
-- optimizer ranks them at $0 earn. Annual fees corrected to the published standard.
-- Reversible.

-- National Bank Syncro: remove the three fabricated bonus categories.
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'National Bank Syncro Mastercard')
  AND category_id IN (SELECT id FROM categories WHERE slug IN ('groceries','gas-transit','recurring-bills'))
  AND earn_rate = 2.00 AND earn_type = 'cashback_pct';

-- National Bank Syncro: base 0.5% -> 0% (no rewards).
UPDATE card_multipliers SET earn_rate = 0.00, notes = 'no rewards — low-interest card (nbc.ca 2026-05-27)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'National Bank Syncro Mastercard')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND earn_rate = 0.50 AND earn_type = 'cashback_pct';

-- National Bank Syncro: annual fee 0 -> 35.
UPDATE cards SET annual_fee = 35.00
WHERE name = 'National Bank Syncro Mastercard' AND annual_fee = 0.00;

-- CIBC Select Visa: base 0.5% -> 0% (no rewards).
UPDATE card_multipliers SET earn_rate = 0.00, notes = 'no rewards — low-interest card (cibc.com 2026-05-27)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'CIBC Select Visa Card')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND earn_rate = 0.50 AND earn_type = 'cashback_pct';

-- CIBC Select Visa: annual fee 0 -> 29.
UPDATE cards SET annual_fee = 29.00
WHERE name = 'CIBC Select Visa Card' AND annual_fee = 0.00;
