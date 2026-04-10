ALTER TABLE user_cards DROP COLUMN IF EXISTS nickname;
ALTER TABLE user_cards DROP COLUMN IF EXISTS points_expiry_date;
ALTER TABLE user_cards DROP COLUMN IF EXISTS date_opened;
ALTER TABLE user_cards DROP COLUMN IF EXISTS has_annual_fee;
ALTER TABLE user_cards DROP COLUMN IF EXISTS custom_annual_fee;
