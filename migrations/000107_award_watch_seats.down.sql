-- Drop the seat columns added by 000107. No data loss beyond the (NULL/last-
-- probe) seat snapshot.

ALTER TABLE award_watch
    DROP COLUMN IF EXISTS seats_checked_at,
    DROP COLUMN IF EXISTS seats_available;
