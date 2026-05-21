-- 000055 — Distinguish a RESERVED Stripe event from a COMPLETED one.
--
-- Bug (code review): stripe_events.processed_at was stamped at INSERT (reserve)
-- time, so a row reserved by one delivery looked "processed" to a concurrent
-- duplicate delivery. If the first delivery then FAILED and rolled back, the
-- duplicate had already returned 200 — Stripe stops retrying and the paid
-- event is silently lost (user pays, never gets Pro).
--
-- completed_at is set ONLY after HandleWebhookEvent succeeds. The dedup
-- short-circuit now keys on completed_at IS NOT NULL (truly done), while a
-- merely-reserved row makes the handler ask Stripe to retry instead of 200.
--
-- Existing rows were inserted by the OLD code path only after success, so they
-- are genuinely complete — backfill completed_at = processed_at so retries of
-- pre-migration events still dedup correctly.

ALTER TABLE stripe_events ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

UPDATE stripe_events SET completed_at = processed_at WHERE completed_at IS NULL;

-- The read-side dedup filters on completed_at; index it.
CREATE INDEX IF NOT EXISTS idx_stripe_events_completed_at
    ON stripe_events (completed_at)
    WHERE completed_at IS NOT NULL;
