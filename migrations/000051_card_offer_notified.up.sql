-- ─────────────────────────────────────────────────────────────────────────────
-- 000051_card_offer_notified — expiry-reminder bookkeeping for card_offers
-- ─────────────────────────────────────────────────────────────────────────────
-- LAUNCH-ISSUES.md P4.2: "track what you clipped" is useless without alerts —
-- the founder logs an Amex/RBC/Scene+ offer (card_offers, migration 000028,
-- whose own comment promised "Maple flags expiry") but never gets reminded.
-- The worker now sends a pre-expiry email; this column makes that send
-- exactly-once per offer (NULL = not yet reminded; set on successful send).
-- No inline BEGIN/COMMIT (golang-migrate wraps the migration).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE card_offers
  ADD COLUMN IF NOT EXISTS expiry_notified_at TIMESTAMPTZ;

-- Partial index: the reminder sweep only scans unused, not-yet-notified,
-- dated offers — keeps it cheap as the table grows.
CREATE INDEX IF NOT EXISTS idx_card_offers_expiry_due
  ON card_offers (expires_at)
  WHERE is_used = false AND expiry_notified_at IS NULL AND expires_at IS NOT NULL;
