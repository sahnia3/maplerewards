-- Catalog integrity (2026-05-27 sweep): deactivate cards that should never be
-- offered to new users. is_active=false removes them from the browse/add catalog
-- (internal/repo/cards.go filters WHERE c.is_active=true) WITHOUT affecting
-- existing wallets — GetUserCards does not filter card.is_active, so any
-- grandfathered holder keeps the card in-wallet.
--
--  * TD First Class Travel Visa Infinite *Privilege*: a fabricated SKU — TD has
--    no "Privilege" tier of the First Class Travel card (verified 2026-05-27 vs
--    td.com). A non-existent product must not appear in the catalog. (No holders.)
--  * HSBC +Rewards / Cashback / World Elite: HSBC Canada was acquired by RBC and
--    its consumer-card business retired (closed 2024); these are no longer
--    issued to new customers.
UPDATE cards SET is_active = false
WHERE is_active = true
  AND name IN (
    'TD First Class Travel Visa Infinite Privilege',
    'HSBC +Rewards Mastercard',
    'HSBC Cashback Mastercard',
    'HSBC World Elite Mastercard'
  );
