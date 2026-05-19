-- 000054 — Source-link health for transfer-bonus promos.
--
-- promo_sentinel verifies a promo's source URL ONCE at scrape time. Feed
-- articles rot (deleted, expired, or newly Cloudflare-walled), so a promo
-- persisted weeks ago can point at a now-404/challenge page — the founder-
-- reported "every Source link 404s" defect. There was no re-verification and
-- no read-time filter, so dead citations reached paying users.
--
-- source_dead_at: set by the periodic worker re-check when the source no
-- longer resolves; cleared if it recovers. ListActive filters these out so a
-- promo we can't currently back with a working citation is never shown.

ALTER TABLE transfer_bonus_events
    ADD COLUMN IF NOT EXISTS source_dead_at TIMESTAMPTZ;

-- Partial index: the read path filters on source_dead_at IS NULL constantly.
CREATE INDEX IF NOT EXISTS idx_tbe_source_alive
    ON transfer_bonus_events (detected_at DESC)
    WHERE source_dead_at IS NULL;
