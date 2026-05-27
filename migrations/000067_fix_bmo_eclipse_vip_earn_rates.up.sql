-- Card-data correction batch 8 (2026-05-27; follows 000059-000066).
-- BMO eclipse Visa Infinite Privilege earns 5x on travel/dining/groceries/gas/
-- drugstore, 1x else. Seed had gas at 4%, dining at 3%, and was MISSING travel +
-- drugstore. Bring all five bonus categories to 5x (per-category $15k/yr cap, to
-- match the seeded grocery cap). earn_type left as the seed's cashback_pct for
-- consistency with eclipse VI — see EARN-RATE-VERIFICATION.md "systemic" note re
-- BMO Rewards points being modelled as cash back (a separate value-model fix).
--   src: princeoftravel.com/credit-cards/bmo-eclipse-visa-infinite-privilege-card

UPDATE card_multipliers SET earn_rate = 5.00, cap_amount = 15000.00, cap_period = 'annual', notes = '5x gas (verified princeoftravel.com 2026-02)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'BMO eclipse Visa Infinite Privilege')
  AND category_id = (SELECT id FROM categories WHERE slug = 'gas-transit') AND earn_rate = 4.00;

UPDATE card_multipliers SET earn_rate = 5.00, cap_amount = 15000.00, cap_period = 'annual', notes = '5x dining (verified princeoftravel.com 2026-02)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'BMO eclipse Visa Infinite Privilege')
  AND category_id = (SELECT id FROM categories WHERE slug = 'dining') AND earn_rate = 3.00;

INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, cap_amount, cap_period, fallback_earn_rate, effective_from, notes)
SELECT (SELECT id FROM cards WHERE name = 'BMO eclipse Visa Infinite Privilege'), c.id, 5.00, 'cashback_pct', 15000.00, 'annual', 1.00, CURRENT_DATE, v.note
FROM (VALUES
    ('travel', '5x travel (verified princeoftravel.com 2026-02)'),
    ('pharmacy', '5x drugstore (verified princeoftravel.com 2026-02)')
) AS v(slug, note)
JOIN categories c ON c.slug = v.slug
WHERE NOT EXISTS (SELECT 1 FROM card_multipliers m WHERE m.card_id = (SELECT id FROM cards WHERE name = 'BMO eclipse Visa Infinite Privilege') AND m.category_id = c.id);
