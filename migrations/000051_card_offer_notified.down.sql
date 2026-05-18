-- Revert 000051_card_offer_notified.
DROP INDEX IF EXISTS idx_card_offers_expiry_due;
ALTER TABLE card_offers DROP COLUMN IF EXISTS expiry_notified_at;
