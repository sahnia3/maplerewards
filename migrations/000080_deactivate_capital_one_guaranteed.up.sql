-- Catalog integrity (2026-05-27): deactivate the Capital One Guaranteed
-- Mastercard — the last remaining active Capital One card. The founder confirmed
-- (2026-05-27) Capital One's Canadian consumer cards are discontinued (Costco
-- moved to CIBC, the Aspire line wound down); Capital One has exited the Canadian
-- consumer-card market, so the Guaranteed (secured) card is no longer issued
-- either. is_active=false removes it from the add-catalog; any legacy holder
-- keeps it in-wallet (GetUserCards does not filter card.is_active). Reversible.
UPDATE cards SET is_active = false
WHERE is_active = true
  AND name = 'Capital One Guaranteed Mastercard';
