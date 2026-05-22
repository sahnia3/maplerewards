-- transfer_partners held 5 redundant duplicate rows: the same
-- (from_program, to_program, transfer_ratio) entered twice with only cosmetic
-- note differences (ASCII "->" vs unicode "→", "5k"/"60k" vs "+5K"/"60K").
-- They rendered as duplicate transfer partners on loyalty detail pages and
-- inflated the "TRANSFER FROM" source counts. Remove the redundant twin of
-- each pair, keeping the better-worded / more-informative row.
--
-- Deliberately NOT touched: amex-mr-ca → hilton-honors has two CONFLICTING
-- ratios (1:1 vs 1:2) — a genuine data conflict, not a cosmetic duplicate.
-- Resolving which ratio is correct is a data-owner decision, so both rows are
-- left in place and flagged in docs/HEADLESS-QA-2026-05-22.md rather than
-- guessing here.
DELETE FROM transfer_partners WHERE id IN (
  '17fee71f-f1b9-4c66-86e8-480df1933d39', -- Marriott → BA Avios (dup of 12b97c82)
  '18d04118-2e15-425e-8d7d-efe0bc3d7179', -- Marriott → Flying Blue (dup of 878817e5)
  '3b86f828-f819-4d15-b11d-a1c38b15a8a7', -- Marriott → Aeroplan (dup of 23ff2982)
  '56e75879-2c29-457c-8152-37e9a479b4b2', -- Marriott → Asia Miles (dup of bdab04fd)
  '81cda661-9bcf-45be-bc30-b7eade314766'  -- Amex MR → Marriott (dup of d406c865, which keeps the "5:6 periodic 30% bonuses" note)
);
