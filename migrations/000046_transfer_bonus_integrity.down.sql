-- Restore the original (NULL-permitting) unique key. Deleted rows are not
-- recoverable — the worker re-populates on its next sweep.
ALTER TABLE transfer_bonus_events
    DROP CONSTRAINT IF EXISTS transfer_bonus_events_natural_key;

ALTER TABLE transfer_bonus_events
    ADD CONSTRAINT transfer_bonus_events_from_program_to_program_expires_at_key
    UNIQUE (from_program, to_program, expires_at);
