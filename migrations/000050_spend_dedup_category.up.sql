-- ─────────────────────────────────────────────────────────────────────────────
-- 000050_spend_dedup_category — include category_id in the spend dedup key
-- ─────────────────────────────────────────────────────────────────────────────
-- Bug (data-trust, same family as the P0s): idx_spend_entries_dedup is UNIQUE
-- on (user_id, card_id, spent_at, amount, COALESCE(note,'')) — it omits
-- category_id. RecordSpend's ON CONFLICT uses the same arbiter, so two
-- LEGITIMATE distinct entries with the same card/date/amount/note but
-- DIFFERENT categories (e.g. a $50 Costco split across "groceries" and
-- "gas") collide: the 2nd insert is swallowed as a dedup, its monthly
-- aggregate + welcome-bonus progress are never recorded, and real spend is
-- silently lost. Widening the key with category_id is strictly more
-- permissive (every set unique under the old key is still unique under the
-- new one), so no existing row can violate the new index.
--
-- No inline BEGIN/COMMIT (golang-migrate wraps the migration); no
-- CONCURRENTLY (cannot run inside migrate's transaction).
-- ─────────────────────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS idx_spend_entries_dedup;

CREATE UNIQUE INDEX idx_spend_entries_dedup
  ON spend_entries (user_id, card_id, category_id, spent_at, amount, (COALESCE(note, '')));
