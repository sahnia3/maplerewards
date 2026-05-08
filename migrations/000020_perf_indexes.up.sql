-- Performance indexes for the optimizer hot path. The audit flagged spend
-- entries and award_watch as missing indexes, but those already had coverage
-- (idx_spend_entries_user_date, idx_award_watch_user). What was actually
-- uncovered: the three lookup tables every optimizer call touches.

-- Optimizer: GetMultiplierForCard(cardID, categoryID) is called once per card
-- per request. Without this, every spend evaluation does a seq scan of
-- card_multipliers (~600 rows × wallet size).
CREATE INDEX IF NOT EXISTS idx_card_multipliers_lookup
    ON card_multipliers(card_id, category_id);

-- Transfer evaluation: every transfer_partners query is "from this program,
-- where active". Sorting by effective_from DESC lets us read the row with
-- LIMIT 1 instead of scanning.
CREATE INDEX IF NOT EXISTS idx_transfer_partners_from
    ON transfer_partners(from_program_id, effective_from DESC);

-- CPP cache miss path: point_valuations is read on every cache-miss CPP
-- lookup (program_slug + segment, latest effective_date).
CREATE INDEX IF NOT EXISTS idx_point_valuations_lookup
    ON point_valuations(loyalty_program_id, segment, effective_date DESC);
