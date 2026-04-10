ALTER TABLE user_cards DROP COLUMN IF EXISTS fee_renewal_date;
ALTER TABLE user_cards DROP COLUMN IF EXISTS annual_fee_paid_at;
DROP TABLE IF EXISTS user_card_bonuses;
DROP INDEX IF EXISTS idx_loyalty_programs_country;
DROP INDEX IF EXISTS idx_cards_country;
ALTER TABLE categories DROP COLUMN IF EXISTS country;
ALTER TABLE loyalty_programs DROP COLUMN IF EXISTS country;
ALTER TABLE cards DROP COLUMN IF EXISTS country;
