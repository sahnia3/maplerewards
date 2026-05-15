DROP INDEX IF EXISTS idx_cards_welcome_expires;
ALTER TABLE cards
    DROP COLUMN IF EXISTS welcome_bonus_offer_source,
    DROP COLUMN IF EXISTS welcome_bonus_offer_expires_at;
