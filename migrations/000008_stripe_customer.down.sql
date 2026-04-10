-- Remove stripe_customer_id from users table
DROP INDEX IF EXISTS idx_users_stripe_customer_id;
ALTER TABLE users DROP COLUMN IF EXISTS stripe_customer_id;
