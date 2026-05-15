-- ── Fix-up for migration 27 ─────────────────────────────────────────────────
-- migration 000027_loyalty_accounts.up.sql contained an invalid table-level
-- UNIQUE clause:
--
--   UNIQUE (user_id, program_slug, COALESCE(account_label, ''))
--
-- Postgres rejects table-level UNIQUE constraints whose columns include
-- expressions like COALESCE() — that's why fresh deploys against an empty
-- DB fail at migration 27. The dev DB was patched manually via psql, but
-- the source file on disk is still broken. This corrective migration
-- guarantees the right constraint exists on any environment.
--
-- We intentionally do NOT edit the original migration 27 file. Once a
-- migration has been applied somewhere, the right discipline is always to
-- ship a forward fix-up rather than rewrite history.

-- 1. Drop the named table-level constraint if it somehow got created
--    (e.g. on a system that tolerated it, or via a stale schema dump).
ALTER TABLE loyalty_accounts
    DROP CONSTRAINT IF EXISTS loyalty_accounts_user_id_program_slug_coalesce_key;

-- 2. Make sure the proper unique index exists. CREATE UNIQUE INDEX IF NOT
--    EXISTS is idempotent — safe to apply against the manually-patched dev
--    DB (where this index already exists) or a fresh DB (where it doesn't).
CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_accounts_unique
    ON loyalty_accounts(user_id, program_slug, COALESCE(account_label, ''));
