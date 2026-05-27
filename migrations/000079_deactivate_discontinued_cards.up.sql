-- Catalog integrity (2026-05-27): deactivate cards confirmed discontinued in
-- Canada (cited verification). is_active=false removes them from the browse/add
-- catalog while legacy holders keep them in-wallet (GetUserCards does not filter
-- card.is_active).
--   * Capital One Costco Mastercard — Costco Canada switched to the CIBC Costco
--     Mastercard on 2022-03-04; the Capital One Costco card is no longer issued
--     (accounts moved to CIBC).  src: rewardscanada / support.capitalone.ca
--   * Capital One Aspire Travel World Elite + Aspire Travel Platinum — wound down
--     to new applicants (World Elite since 2017; line discontinued).  src: rewardscanada
--   * MBNA Alaska Airlines World Elite — officially discontinued 2023-09-01;
--     legacy holders transitioned to MBNA Rewards WE.  src: princeoftravel / rewardscanada
UPDATE cards SET is_active = false
WHERE is_active = true
  AND name IN (
    'Capital One Costco Mastercard',
    'Capital One Aspire Travel World Elite Mastercard',
    'Capital One Aspire Travel Platinum Mastercard',
    'MBNA Alaska Airlines World Elite Mastercard'
  );
