-- Reverse: re-activate the four cards deactivated by this migration.
UPDATE cards SET is_active = true
WHERE is_active = false
  AND name IN (
    'TD First Class Travel Visa Infinite Privilege',
    'HSBC +Rewards Mastercard',
    'HSBC Cashback Mastercard',
    'HSBC World Elite Mastercard'
  );
