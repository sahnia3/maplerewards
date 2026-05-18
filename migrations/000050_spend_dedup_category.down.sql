-- Revert 000050: restore the category-agnostic dedup key.
DROP INDEX IF EXISTS idx_spend_entries_dedup;

CREATE UNIQUE INDEX idx_spend_entries_dedup
  ON spend_entries (user_id, card_id, spent_at, amount, (COALESCE(note, '')));
