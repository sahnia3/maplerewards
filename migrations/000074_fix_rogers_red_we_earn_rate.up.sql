-- Card-data correction batch 15 (2026-05-27; follows 000073).
-- Verified 2026-05-27 against Rogers Bank issuer terms + Prince of Travel.
-- Source: rogersbank.com/en/World-Elite-Annual-Value/ ;
--         princeoftravel.com/news/rogers-red-mastercard-annual-spending-caps/
--
-- Rogers Red World Elite earns 3% cash back on USD purchases and 1.5% (or 2% with a
-- qualifying Rogers/Fido/Shaw service) on all other CAD purchases. The seeded "3%
-- travel" row mis-models the USD rate as a *travel* category bonus, which wrongly
-- pays 3% on domestic CAD travel (e.g. a Canadian-dollar flight). The 3% USD benefit
-- is a currency-based rebate with no clean category mapping, so it is removed; the
-- card correctly earns its 1.5% CAD base. (USD-spend modelling is out of scope for
-- the per-category optimizer — flagged in the verification doc.)

DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'Rogers Red World Elite Mastercard')
  AND category_id = (SELECT id FROM categories WHERE slug = 'travel')
  AND effective_to IS NULL AND earn_rate = 3.00 AND earn_type = 'cashback_pct';
