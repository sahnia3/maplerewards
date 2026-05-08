-- ── 2026 Aeroplan SQC accrual rates per cobranded card ──────────────────────
-- Air Canada killed SQM/SQS/SQD in 2026 in favour of a single Status Qualifying
-- Credits (SQC) metric. Cobranded credit cards earn 1 SQC per $X spent.
--
-- aeroplan_status_thresholds (migration 000004) already holds tier requirements.

ALTER TABLE cards ADD COLUMN IF NOT EXISTS dollars_per_sqc INT;

-- Populate published rates for the 9 Aeroplan-cobranded cards.
-- Rates are 2026 program rules (rounded for cleanliness).
UPDATE cards SET dollars_per_sqc = 10 WHERE name = 'American Express Aeroplan Reserve';
UPDATE cards SET dollars_per_sqc = 10 WHERE name = 'Amex Aeroplan Business Reserve Card';
UPDATE cards SET dollars_per_sqc = 15 WHERE name = 'TD Aeroplan Visa Infinite Privilege';
UPDATE cards SET dollars_per_sqc = 15 WHERE name = 'CIBC Aeroplan Visa Infinite Privilege';
UPDATE cards SET dollars_per_sqc = 20 WHERE name = 'TD Aeroplan Visa Infinite';
UPDATE cards SET dollars_per_sqc = 20 WHERE name = 'CIBC Aeroplan Visa Infinite';
UPDATE cards SET dollars_per_sqc = 25 WHERE name = 'American Express Aeroplan Card';
UPDATE cards SET dollars_per_sqc = 25 WHERE name = 'TD Aeroplan Visa Platinum';
UPDATE cards SET dollars_per_sqc = 30 WHERE name = 'American Express Aeroplan No Fee Card';

CREATE INDEX IF NOT EXISTS idx_cards_dollars_per_sqc ON cards(dollars_per_sqc) WHERE dollars_per_sqc IS NOT NULL;
