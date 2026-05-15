-- Doesn't undo the seed inserts; merchants table may have user-relevant
-- rows by now. Just drops the columns.
ALTER TABLE merchants
    DROP COLUMN IF EXISTS notes,
    DROP COLUMN IF EXISTS accepts_mastercard,
    DROP COLUMN IF EXISTS accepts_visa,
    DROP COLUMN IF EXISTS accepts_amex;
