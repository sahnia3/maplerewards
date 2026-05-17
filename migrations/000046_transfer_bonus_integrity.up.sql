-- ── Transfer-bonus feed integrity ───────────────────────────────────────────
-- The Promo Sentinel persisted untrustworthy rows: NULL-expiry promos shown
-- "ONGOING" forever (an April promo still live in May), social-media source
-- URLs (threads.com), and duplicates — the old UNIQUE(from,to,expires_at)
-- lets NULL-expiry rows duplicate because Postgres treats NULLs as distinct
-- in a unique constraint (3 identical amex-mr-ca→flying-blue 25% rows).
--
-- Ingest is now hardened (validatePromo requires a parsable in-window
-- expiry; credibleSource blocks social/aggregator hosts). This migration
-- purges the rows that violate the new policy and replaces the unique key.

-- 1. Drop rows the hardened ingest would now reject.
DELETE FROM transfer_bonus_events
WHERE expires_at IS NULL
   OR expires_at < CURRENT_DATE
   OR source_url !~* '^https://'
   OR source_url ~* '://(www\.)?(threads\.(com|net)|x\.com|twitter\.com|facebook\.com|instagram\.com|reddit\.com|tiktok\.com|t\.co|youtube\.com|medium\.com)(/|$)';

-- 2. Collapse any remaining duplicates on the new natural key, keeping the
--    most recently detected row.
DELETE FROM transfer_bonus_events a
USING transfer_bonus_events b
WHERE a.from_program  = b.from_program
  AND a.to_program    = b.to_program
  AND a.bonus_percent = b.bonus_percent
  AND a.expires_at    = b.expires_at
  AND a.detected_at   < b.detected_at;

-- 3. Replace the NULL-permitting unique constraint. bonus_percent is now
--    part of the key (a 25% and a 40% promo on the same route on the same
--    end date are genuinely different promos), and expires_at is always
--    non-NULL under the new ingest policy so NULL-distinctness can't recur.
ALTER TABLE transfer_bonus_events
    DROP CONSTRAINT IF EXISTS transfer_bonus_events_from_program_to_program_expires_at_key;

ALTER TABLE transfer_bonus_events
    ADD CONSTRAINT transfer_bonus_events_natural_key
    UNIQUE (from_program, to_program, bonus_percent, expires_at);
