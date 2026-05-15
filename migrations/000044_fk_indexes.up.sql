-- ── FK index hardening ─────────────────────────────────────────────────────
-- Audit (2026-05-15) found two FK columns without explicit indexes. Both
-- are on the hot wallet-JOIN path: `cards.loyalty_program_id` (joined every
-- time we render a card with its program) and `user_cards.card_id` (joined
-- every time we render a user's wallet). Without indexes Postgres falls
-- back to seq scans on the parent tables — fine at 100 rows, painful at
-- 100K.
--
-- CONCURRENTLY can't run inside a transaction block, so this file is split
-- and applied via the standard migrate-up flow which runs each statement
-- in its own implicit transaction. If your migrate tool wraps the whole
-- file in a tx, run these statements manually first then `migrate force 44`.

CREATE INDEX IF NOT EXISTS idx_cards_loyalty_program_id
    ON cards(loyalty_program_id);

CREATE INDEX IF NOT EXISTS idx_user_cards_card_id
    ON user_cards(card_id);

-- While we're here: applications and welcome bonuses also join through
-- user_id; the existing user_cards index covers the wallet path but these
-- newer tables (added in migrations 042 and pre-existing) don't have
-- their own user-side indexes.
CREATE INDEX IF NOT EXISTS idx_card_applications_user_id_alone
    ON card_applications(user_id);
