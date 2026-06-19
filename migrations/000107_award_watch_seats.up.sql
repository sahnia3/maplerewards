-- ── Award-watch live seat counts ────────────────────────────────────────────
-- The cmd/worker award sweep already finds the cheapest available award per
-- watch (probeOne). It records last_min_points but discards the seat count the
-- same AwardSearchResult carries (SeatsAvailable). These columns persist that
-- count so the Status workspace can surface "N seats left" per active watch.
--
-- Both are NULL when the watch has never been probed. seats_checked_at is
-- stamped on every probe (even a no-availability one), while seats_available is
-- NULL when the latest probe found no seats — keeping "unchecked", "checked, no
-- seats", and "checked, N seats" distinguishable. The poller never invents a
-- value: seats_available mirrors the upstream source's seat count verbatim.

ALTER TABLE award_watch
    ADD COLUMN IF NOT EXISTS seats_available  INT,
    ADD COLUMN IF NOT EXISTS seats_checked_at TIMESTAMPTZ;
