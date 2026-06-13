-- Restore Amex Cobalt's 2x travel earn rate (QA 2026-06-12, P2-18).
-- History: 000061 wrongly removed Cobalt's 2x travel; 000065 restored it with a
-- documented self-correction (Amex terms: the 2x "Travel & Transit" category
-- includes flights/hotels; Prince of Travel's earn-table lists "Transit,
-- Rideshare, Gas & Travel"); the 000088 bulk audit then re-introduced the same
-- error (earn_rate 2 -> 1, milesopedia misread), leaving the row badged
-- "1× POINTS" directly under its own note "2x travel & transit (verified
-- princeoftravel.com 2026-02)". Keyed by card name + category slug (000088's
-- literal multiplier id is not portable across environments) and guarded on the
-- wrong value, so a re-run or an already-correct row is a safe no-op.

UPDATE card_multipliers
   SET earn_rate = 2.00
 WHERE card_id = (SELECT id FROM cards WHERE name = 'Amex Cobalt')
   AND category_id = (SELECT id FROM categories WHERE slug = 'travel')
   AND earn_rate = 1.00;
