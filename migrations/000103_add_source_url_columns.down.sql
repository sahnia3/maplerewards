-- Drop the source_url columns added by 000103. Reverts the schema to its
-- pre-000103 state. No data loss beyond the (NULL) source_url values.

ALTER TABLE point_valuations  DROP COLUMN IF EXISTS source_url;
ALTER TABLE transfer_partners DROP COLUMN IF EXISTS source_url;
