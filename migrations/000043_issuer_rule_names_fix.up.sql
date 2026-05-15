-- Fix issuer names in issuer_rules to match the canonical names used in the
-- cards.issuer column. Migration 42 used short forms ("RBC", "TD") that
-- don't join correctly when CheckEligibility looks up rules by card.issuer.

UPDATE issuer_rules SET issuer = 'Royal Bank' WHERE issuer = 'RBC';
UPDATE issuer_rules SET issuer = 'TD Bank'    WHERE issuer = 'TD';
