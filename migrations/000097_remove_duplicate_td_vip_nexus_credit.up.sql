-- Remove the duplicate NEXUS credit on the TD Aeroplan Visa Infinite Privilege
-- (QA 2026-06-12, P1-9). Migration 000010 seeded the card's single $100
-- quadrennial NEXUS rebate twice: once as 'NEXUS Credit' (kept) and once
-- mislabeled 'Annual Travel Credit' (description: "$100 NEXUS application
-- credit (every 4 years)."). The duplicate inflated the Forensics "UNUSED
-- CREDIT VALUE" headline and the Renewal Optimizer's credit total by $100.
-- Scoped to the seed row (user_id IS NULL); a re-run is a safe no-op.

DELETE FROM card_credit_defs
 WHERE card_id = (SELECT id FROM cards WHERE name = 'TD Aeroplan Visa Infinite Privilege')
   AND name = 'Annual Travel Credit'
   AND user_id IS NULL;
