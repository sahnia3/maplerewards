-- ── Email unsubscribe (CASL) ────────────────────────────────────────────────
-- The privacy policy promises users can opt out of digest emails "from any
-- digest footer", but no opt-out mechanism existed — the weekly issuer and
-- missed-rewards digests had no way to be turned off, and CASL requires a
-- functional, low-friction unsubscribe on every commercial email.
--
-- NULL = subscribed (default). A non-NULL timestamp records when the user
-- opted out (auditable). Digest recipient queries filter on this; the
-- win-back email checks it too.

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_unsubscribed_at TIMESTAMPTZ;
