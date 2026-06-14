-- Add a structured source_url column to the two most-scrutinized data tables
-- (revamp 2026-06-12, AU-4). Caps already reference source URLs at the doc
-- level, but transfer ratios and program CPPs carry only free-text `notes` —
-- the data a churner challenges first is the least structurally sourced.
--
-- Schema-only: the columns are nullable and left NULL. Populating real source
-- URLs is a separate, founder-sourced task (no values invented here).

ALTER TABLE transfer_partners ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE point_valuations  ADD COLUMN IF NOT EXISTS source_url TEXT;
