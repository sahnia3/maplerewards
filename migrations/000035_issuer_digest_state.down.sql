DROP INDEX IF EXISTS idx_users_pro_digest_due;
ALTER TABLE users DROP COLUMN IF EXISTS last_issuer_digest_at;
