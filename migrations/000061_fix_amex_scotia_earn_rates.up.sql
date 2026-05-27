-- Card-data correction batch 2 (2026-05-27 sweep; follows 000059/000060).
-- Amex Membership Rewards + Scotiabank Amex earn-rate seed errors, plus three
-- structural duplicate-row bugs. Every rate verified against Prince of Travel
-- (independently-published Canadian card earn tables, updated 2026-02). Each
-- statement guards on the known pre-value so a re-run / drifted catalog no-ops.
--
-- Verified-correct, deliberately untouched: Scotiabank Gold Amex (5x grocery/
-- dining/entertainment, 3x streaming/gas/transit — matches PoT exactly).

-- ── Amex Cobalt ──  src: princeoftravel.com/credit-cards/american-express-cobalt-card
-- streaming is 3x, not 5x; general travel (flights/hotels) is 1x — the 2x is
-- transit/gas only, already modelled under gas-transit. Drop the spurious 2x travel.
UPDATE card_multipliers SET earn_rate = 3.00, notes = '3x eligible streaming (verified princeoftravel.com 2026-02)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'Amex Cobalt')
  AND category_id = (SELECT id FROM categories WHERE slug = 'streaming-digital')
  AND earn_rate = 5.00;

DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'Amex Cobalt')
  AND category_id = (SELECT id FROM categories WHERE slug = 'travel')
  AND earn_rate = 2.00;

-- ── Amex Platinum ──  src: princeoftravel.com/credit-cards/american-express-platinum-card
-- 2x travel AND dining (not 3x).
UPDATE card_multipliers SET earn_rate = 2.00, notes = '2x dining (verified princeoftravel.com 2026-02)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'Amex Platinum')
  AND category_id = (SELECT id FROM categories WHERE slug = 'dining')
  AND earn_rate = 3.00;

UPDATE card_multipliers SET earn_rate = 2.00, notes = '2x travel (verified princeoftravel.com 2026-02)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'Amex Platinum')
  AND category_id = (SELECT id FROM categories WHERE slug = 'travel')
  AND earn_rate = 3.00;

-- ── Amex Gold Rewards ──  src: princeoftravel.com/credit-cards/american-express-gold-rewards-card
-- 2x is gas/drugstore/travel/grocery only — NO dining bonus. Drop the 2x dining row.
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'Amex Gold Rewards')
  AND category_id = (SELECT id FROM categories WHERE slug = 'dining')
  AND earn_rate = 2.00;

-- ── Scotiabank Platinum Amex ──  src: princeoftravel.com/credit-cards/scotiabank-platinum-american-express-card
-- Earns a FLAT 2x on all purchases (4x only via the Scene+ travel portal). It was
-- mis-seeded like the Gold card (5x dining/entertainment, 3x travel). Set base to
-- 2x and drop the bogus category accelerators so all spend earns the flat 2x.
UPDATE card_multipliers SET earn_rate = 2.00, notes = 'flat 2x on all purchases (verified princeoftravel.com 2026-02)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'Scotiabank Platinum American Express')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND earn_rate = 1.00;

DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'Scotiabank Platinum American Express')
  AND category_id IN (SELECT id FROM categories WHERE slug IN ('dining', 'entertainment', 'travel'))
  AND earn_rate IN (5.00, 3.00);

-- ── Structural: drop superseded duplicate rows left by the 2026-05-15 reseed.
-- GetMultiplierForCard takes the latest effective_from, but card-detail pages
-- list ALL active rows, so the stale 2026-04-05 twin renders as a visible
-- duplicate. Keep the 2026-05-15 row, delete the 2026-04-05 one. ──
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'American Express Business Edge')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND effective_from = '2026-04-05' AND earn_rate = 1.00;

DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'American Express Platinum Business')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND effective_from = '2026-04-05' AND earn_rate = 1.50;

DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'MBNA Rewards World Elite Mastercard')
  AND category_id = (SELECT id FROM categories WHERE slug = 'dining')
  AND effective_from = '2026-04-05' AND earn_rate = 2.00;

-- ── MBNA Rewards WE: the surviving 5x dining row caps at $50,000 but its own
-- note (and the parallel 5x grocery row) say "first $5K/yr". Correct to $5,000.
-- (The real structure shares one $5K/yr cap across grocery+dining; a proper
-- shared cap_group is a follow-up — this at least stops the 10x over-cap.) ──
UPDATE card_multipliers SET cap_amount = 5000.00
WHERE card_id = (SELECT id FROM cards WHERE name = 'MBNA Rewards World Elite Mastercard')
  AND category_id = (SELECT id FROM categories WHERE slug = 'dining')
  AND earn_rate = 5.00 AND cap_amount = 50000.00;
