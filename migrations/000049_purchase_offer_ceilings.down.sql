-- Revert 000049_purchase_offer_ceilings. No inline BEGIN/COMMIT (migrate wraps).
ALTER TABLE network_offers     DROP COLUMN IF EXISTS max_credit_cad;
ALTER TABLE buy_promo_pricing  DROP COLUMN IF EXISTS max_purchasable_per_year;
