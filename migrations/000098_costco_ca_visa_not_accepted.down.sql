-- Revert the Costco Canada accepts_visa correction (false → true). Guarded so
-- it only reverts the exact value this migration set.

UPDATE merchants
   SET accepts_visa = true
 WHERE slug = 'costco_ca' AND accepts_visa = false;
