-- Reverse: re-activate the four cards deactivated by this migration.
UPDATE cards SET is_active = true
WHERE is_active = false
  AND name IN (
    'Capital One Costco Mastercard',
    'Capital One Aspire Travel World Elite Mastercard',
    'Capital One Aspire Travel Platinum Mastercard',
    'MBNA Alaska Airlines World Elite Mastercard'
  );
