-- Remove mis-entered "Worldwide Companion Pass spend" rows from card_credit_defs.
-- These captured the $25,000 ANNUAL SPEND THRESHOLD required to earn the
-- Worldwide Companion Pass on the TD / CIBC Aeroplan Visa Infinite Privilege —
-- they were stored with value_cad = 25000 as if they were redeemable statement
-- credits. The renewal optimizer (and any credit-value sum) therefore overstated
-- those cards' credit value by $25,000. A spend hurdle to unlock a benefit is not
-- a statement credit, so the rows are removed.
DELETE FROM card_credit_defs WHERE name = 'Worldwide Companion Pass spend';
