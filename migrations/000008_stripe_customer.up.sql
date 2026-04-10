-- Add stripe_customer_id to users table for Stripe billing integration
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON users (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
