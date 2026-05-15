-- Per-user stamp for the weekly missed-rewards email digest. Mirrors the
-- last_issuer_digest_at column from migration 35 — same cadence (7d) but
-- tracked independently so the two digests don't suppress each other when
-- only one has content for a given week.
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_missed_rewards_digest_at TIMESTAMPTZ;
