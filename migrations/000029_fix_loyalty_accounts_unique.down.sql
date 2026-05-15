-- The corrective unique index lives in the parent migration (27); we don't
-- drop it on rollback because doing so would re-introduce the data-integrity
-- gap the index was added to close.
SELECT 1;
