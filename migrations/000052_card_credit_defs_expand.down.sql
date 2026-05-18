-- Revert 000052. Self-logged (user-scoped) defs are user-private feature data:
-- on rollback of the self-log feature they're removed (also lets us safely
-- restore the global UNIQUE(card_id,name) constraint). The curated global
-- rows seeded here are additive reference data and are left in place (mirrors
-- the 000010 seed-migration convention; removing risks deleting pre-existing
-- curated rows). No inline BEGIN/COMMIT (golang-migrate wraps).

DELETE FROM card_credit_defs WHERE user_id IS NOT NULL;

DROP INDEX IF EXISTS idx_card_credit_defs_userid;
DROP INDEX IF EXISTS uq_card_credit_defs_user;
DROP INDEX IF EXISTS uq_card_credit_defs_global;

ALTER TABLE card_credit_defs DROP COLUMN IF EXISTS user_id;
ALTER TABLE card_credit_defs
  ADD CONSTRAINT card_credit_defs_card_id_name_key UNIQUE (card_id, name);
