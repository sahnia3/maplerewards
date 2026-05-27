-- Card-data correction (2026-05-27 production-readiness sweep).
-- Two Aeroplan co-brand cards carried earn-rate seed errors that over-projected
-- travel/dining value in the optimizer, comparison, and Pro scorecard. Verified
-- against published issuer terms before correcting (founder-gated work):
--
--   * TD Aeroplan Visa Infinite — TD.com card page: earns 1.5 Aeroplan pts/$ on
--     gas / EV charging / grocery / direct Air Canada (NOT 3x), 1x everything
--     else. The seed row put Air Canada (the "travel" category) at 3.0x. Correct
--     to 1.5x.
--       src: https://www.td.com/ca/en/personal-banking/products/credit-cards/aeroplan/aeroplan-visa-infinite-card  (verified 2026-05-27)
--
--   * Amex Aeroplan Business Reserve — Prince of Travel (updated 2026-02-12) and
--     Amex Canada: earns 3x Travel and 1.25x Everything Else, with NO dining
--     bonus. The seed had travel at 2.0x (should be 3.0x) and a spurious "3x
--     dining" row — the *consumer* Aeroplan Reserve has 2x dining; the seed data
--     conflated the two cards. Fix travel to 3.0x (and its post-cap fallback to
--     the card's real 1.25x base), and drop the dining row so dining correctly
--     resolves to everything-else (1.25x).
--       src: https://princeoftravel.com/credit-cards/american-express-aeroplan-business-reserve-card/  (verified 2026-05-27)
--
-- Each statement guards on the known-wrong pre-value, so a re-run or a catalog
-- that has already drifted is a no-op rather than a silent corruption.

-- TD Aeroplan Visa Infinite: Air Canada/travel 3.0x -> 1.5x
UPDATE card_multipliers SET
    earn_rate = 1.50,
    notes = '1.5x on Air Canada / gas / grocery (TD AVI; verified td.com 2026-05-27)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'TD Aeroplan Visa Infinite')
  AND category_id = (SELECT id FROM categories WHERE slug = 'travel')
  AND earn_rate = 3.00;

-- Amex Aeroplan Business Reserve: travel 2.0x -> 3.0x (fallback to true 1.25x base)
UPDATE card_multipliers SET
    earn_rate = 3.00,
    fallback_earn_rate = 1.25,
    notes = '3x travel incl. Air Canada (Business Reserve; verified princeoftravel.com 2026-02-12)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'Amex Aeroplan Business Reserve Card')
  AND category_id = (SELECT id FROM categories WHERE slug = 'travel')
  AND earn_rate = 2.00;

-- Amex Aeroplan Business Reserve: remove the spurious 3x dining row (no dining bonus)
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'Amex Aeroplan Business Reserve Card')
  AND category_id = (SELECT id FROM categories WHERE slug = 'dining')
  AND earn_rate = 3.00;
