-- Seed cards.affiliate_url with OFFICIAL ISSUER APPLICATION PAGES.
-- These are NOT affiliate/commission links — they are the issuers' own product
-- pages, seeded 2026-06-13. Every URL was verified live (HTTP 200 + page title
-- matched against the card name) on official issuer domains.
-- Only high-confidence matches are seeded; discontinued/renamed cards
-- (e.g. BMO Air Miles*, Rogers Platinum, CIBC Tim Hortons Visa) are left NULL.
-- Replace with real affiliate links when partnerships land.

-- American Express
UPDATE cards SET affiliate_url = 'https://www.americanexpress.com/en-ca/credit-cards/gold-rewards-card/' WHERE name = 'Amex Gold Rewards';
UPDATE cards SET affiliate_url = 'https://www.americanexpress.com/en-ca/charge-cards/the-platinum-card/' WHERE name = 'Amex Platinum';
UPDATE cards SET affiliate_url = 'https://www.americanexpress.com/en-ca/credit-cards/cobalt-card/' WHERE name = 'Amex Cobalt';
UPDATE cards SET affiliate_url = 'https://www.americanexpress.com/en-ca/credit-cards/simply-cash/' WHERE name = 'SimplyCash Card from American Express';
UPDATE cards SET affiliate_url = 'https://www.americanexpress.com/en-ca/credit-cards/simply-cash-preferred/' WHERE name = 'SimplyCash Preferred Card from American Express';
UPDATE cards SET affiliate_url = 'https://www.americanexpress.com/ca/en/credit-cards/aeroplan-cards/aeroplan-card/' WHERE name = 'American Express Aeroplan Card';
UPDATE cards SET affiliate_url = 'https://www.americanexpress.com/en-ca/charge-cards/small-business-platinum-card/' WHERE name = 'American Express Platinum Business';
UPDATE cards SET affiliate_url = 'https://www.americanexpress.com/en-ca/credit-cards/marriott-bonvoy-card/' WHERE name = 'Marriott Bonvoy American Express Card';
UPDATE cards SET affiliate_url = 'https://www.americanexpress.com/en-ca/credit-cards/green-card/' WHERE name = 'American Express Green Card';
UPDATE cards SET affiliate_url = 'https://www.americanexpress.com/en-ca/credit-cards/aeroplan-reserve/' WHERE name = 'American Express Aeroplan Reserve';
UPDATE cards SET affiliate_url = 'https://www.americanexpress.com/en-ca/business/credit-cards/aeroplan-business-reserve-card/' WHERE name = 'Amex Aeroplan Business Reserve Card';

-- RBC
UPDATE cards SET affiliate_url = 'https://www.rbcroyalbank.com/credit-cards/travel/rbc-avion-visa-infinite.html' WHERE name = 'RBC Avion Visa Infinite';
UPDATE cards SET affiliate_url = 'https://www.rbcroyalbank.com/credit-cards/travel/westjet-rbc-world-elite-mastercard.html' WHERE name = 'RBC WestJet World Elite Mastercard';
UPDATE cards SET affiliate_url = 'https://www.rbcroyalbank.com/credit-cards/travel/rbc-avion-visa-infinite-privilege.html' WHERE name = 'RBC Avion Visa Infinite Privilege';
UPDATE cards SET affiliate_url = 'https://www.rbcroyalbank.com/credit-cards/travel/rbc-british-airways-visa-infinite.html' WHERE name = 'RBC British Airways Visa Infinite';
UPDATE cards SET affiliate_url = 'https://www.rbcroyalbank.com/credit-cards/rewards/rbc-ion-plus-visa.html' WHERE name = 'RBC ION+ Visa';
UPDATE cards SET affiliate_url = 'https://www.rbcroyalbank.com/credit-cards/cash-back/rbc-preferred-world-elite-mastercard.html' WHERE name = 'RBC Cash Back Preferred World Elite Mastercard';
UPDATE cards SET affiliate_url = 'https://www.rbcroyalbank.com/credit-cards/travel/rbc-visa-platinum-avion.html' WHERE name = 'RBC Avion Visa Platinum';
UPDATE cards SET affiliate_url = 'https://www.rbcroyalbank.com/credit-cards/travel/westjet-rbc-mastercard.html' WHERE name = 'RBC WestJet Mastercard';
UPDATE cards SET affiliate_url = 'https://www.rbcroyalbank.com/credit-cards/cash-back/rbc-cashback-mastercard.html' WHERE name = 'RBC Cash Back Mastercard';

-- Scotiabank
UPDATE cards SET affiliate_url = 'https://www.scotiabank.com/ca/en/personal/credit-cards/visa/passport-infinite-card.html' WHERE name = 'Scotiabank Passport Visa Infinite';
UPDATE cards SET affiliate_url = 'https://www.scotiabank.com/ca/en/personal/credit-cards/american-express/gold-card.html' WHERE name = 'Scotiabank Gold American Express';
UPDATE cards SET affiliate_url = 'https://www.scotiabank.com/ca/en/personal/credit-cards/visa/scene-card.html' WHERE name = 'Scotiabank Scene+ Visa';
UPDATE cards SET affiliate_url = 'https://www.scotiabank.com/ca/en/personal/credit-cards/american-express/platinum-card.html' WHERE name = 'Scotiabank Platinum American Express';
UPDATE cards SET affiliate_url = 'https://www.scotiabank.com/ca/en/personal/credit-cards/mastercard/momentum-card.html' WHERE name = 'Scotia Momentum Mastercard No Fee';
UPDATE cards SET affiliate_url = 'https://www.scotiabank.com/ca/en/personal/credit-cards/visa/momentum-no-fee-card.html' WHERE name = 'Scotiabank Momentum No-Fee Visa';
UPDATE cards SET affiliate_url = 'https://www.scotiabank.com/ca/en/personal/credit-cards/visa/momentum-infinite-card.html' WHERE name = 'Scotia Momentum Visa Infinite';
UPDATE cards SET affiliate_url = 'https://www.scotiabank.com/ca/en/personal/credit-cards/visa/value-card.html' WHERE name = 'Scotiabank Value Visa Card';

-- CIBC
UPDATE cards SET affiliate_url = 'https://www.cibc.com/en/personal-banking/credit-cards/all-credit-cards/aventura-visa-infinite-card.html' WHERE name = 'CIBC Aventura Visa Infinite';
UPDATE cards SET affiliate_url = 'https://www.cibc.com/en/personal-banking/credit-cards/all-credit-cards/aventura-visa-infinite-privilege-card.html' WHERE name = 'CIBC Aventura Visa Infinite Privilege';
UPDATE cards SET affiliate_url = 'https://www.cibc.com/en/personal-banking/credit-cards/all-credit-cards/aeroplan-visa-infinite-privilege-card.html' WHERE name = 'CIBC Aeroplan Visa Infinite Privilege';
UPDATE cards SET affiliate_url = 'https://www.cibc.com/en/personal-banking/credit-cards/all-credit-cards/costco-mastercard.html' WHERE name = 'CIBC Costco Mastercard';
UPDATE cards SET affiliate_url = 'https://www.cibc.com/en/personal-banking/credit-cards/all-credit-cards/dividend-visa-infinite-card.html' WHERE name = 'CIBC Dividend Visa Infinite';
UPDATE cards SET affiliate_url = 'https://www.cibc.com/en/personal-banking/credit-cards/all-credit-cards/aventura-gold-visa-card.html' WHERE name = 'CIBC Aventura Gold Visa';
UPDATE cards SET affiliate_url = 'https://www.cibc.com/en/personal-banking/credit-cards/all-credit-cards/dividend-visa-card.html' WHERE name = 'CIBC Dividend Visa Card';
UPDATE cards SET affiliate_url = 'https://www.cibc.com/en/personal-banking/credit-cards/all-credit-cards/aeroplan-visa-infinite-card.html' WHERE name = 'CIBC Aeroplan Visa Infinite';
UPDATE cards SET affiliate_url = 'https://www.cibc.com/en/personal-banking/credit-cards/all-credit-cards/select-visa-card.html' WHERE name = 'CIBC Select Visa Card';
UPDATE cards SET affiliate_url = 'https://www.cibc.com/en/personal-banking/credit-cards/all-credit-cards/dividend-visa-platinum-card.html' WHERE name = 'CIBC Dividend Platinum Visa';

-- BMO
UPDATE cards SET affiliate_url = 'https://www.bmo.com/en-ca/main/personal/credit-cards/bmo-eclipse-visa-infinite-privilege/' WHERE name = 'BMO eclipse Visa Infinite Privilege';
UPDATE cards SET affiliate_url = 'https://www.bmo.com/en-ca/main/personal/credit-cards/bmo-cashback-world-elite-mastercard/' WHERE name = 'BMO CashBack World Elite Mastercard';
UPDATE cards SET affiliate_url = 'https://www.bmo.com/en-ca/main/personal/credit-cards/bmo-ascend-world-elite-mastercard/' WHERE name = 'BMO Ascend World Elite Mastercard';
UPDATE cards SET affiliate_url = 'https://www.bmo.com/main/personal/credit-cards/bmo-cashback-mastercard/' WHERE name = 'BMO Cash Back Mastercard';
UPDATE cards SET affiliate_url = 'https://www.bmo.com/main/personal/credit-cards/bmo-eclipse-visa-infinite/' WHERE name = 'BMO eclipse Visa Infinite';
UPDATE cards SET affiliate_url = 'https://www.bmo.com/en-ca/main/personal/credit-cards/preferred-rate-mastercard/' WHERE name = 'BMO Preferred Rate Mastercard';

-- TD
UPDATE cards SET affiliate_url = 'https://www.td.com/ca/en/personal-banking/products/credit-cards/travel-rewards/platinum-travel-visa-card' WHERE name = 'TD Platinum Travel Visa';
UPDATE cards SET affiliate_url = 'https://www.td.com/ca/en/personal-banking/products/credit-cards/aeroplan/aeroplan-visa-infinite-privilege-card' WHERE name = 'TD Aeroplan Visa Infinite Privilege';
UPDATE cards SET affiliate_url = 'https://www.td.com/ca/en/personal-banking/products/credit-cards/aeroplan/aeroplan-visa-infinite-card' WHERE name = 'TD Aeroplan Visa Infinite';
UPDATE cards SET affiliate_url = 'https://www.td.com/ca/en/personal-banking/products/credit-cards/travel-rewards/rewards-visa-card' WHERE name = 'TD Rewards Visa Card';
UPDATE cards SET affiliate_url = 'https://www.td.com/ca/en/personal-banking/products/credit-cards/aeroplan/aeroplan-visa-platinum-card' WHERE name = 'TD Aeroplan Visa Platinum';
UPDATE cards SET affiliate_url = 'https://www.td.com/ca/en/personal-banking/products/credit-cards/cash-back/cash-back-visa-card' WHERE name = 'TD Cash Back Visa Card';
UPDATE cards SET affiliate_url = 'https://www.td.com/ca/en/personal-banking/products/credit-cards/travel-rewards/first-class-travel-visa-infinite-card' WHERE name = 'TD First Class Travel Visa Infinite';
UPDATE cards SET affiliate_url = 'https://www.td.com/ca/en/personal-banking/products/credit-cards/cash-back/cash-back-visa-infinite-card' WHERE name = 'TD Cash Back Visa Infinite';

-- National Bank
UPDATE cards SET affiliate_url = 'https://www.nbc.ca/personal/mastercard-credit-cards/world-elite.html' WHERE name = 'National Bank World Elite Mastercard';
UPDATE cards SET affiliate_url = 'https://www.nbc.ca/personal/mastercard-credit-cards/syncro.html' WHERE name = 'National Bank Syncro Mastercard';
UPDATE cards SET affiliate_url = 'https://www.nbc.ca/personal/mastercard-credit-cards/allure.html' WHERE name = 'National Bank Allure Mastercard';
UPDATE cards SET affiliate_url = 'https://www.nbc.ca/personal/mastercard-credit-cards/platinum.html' WHERE name = 'National Bank Platinum Mastercard';

-- PC Financial
UPDATE cards SET affiliate_url = 'https://www.pcfinancial.ca/en/credit-cards/pc-mastercard/' WHERE name = 'PC Mastercard';
UPDATE cards SET affiliate_url = 'https://www.pcfinancial.ca/en/credit-cards/world-elite/' WHERE name = 'PC World Elite Mastercard';
UPDATE cards SET affiliate_url = 'https://www.pcfinancial.ca/en/pc-money-account/' WHERE name = 'PC Money Account';

-- Desjardins
UPDATE cards SET affiliate_url = 'https://www.desjardins.com/en/credit-cards/odyssey-world-elite-mastercard.html' WHERE name = 'Desjardins Odyssey World Elite Mastercard';
UPDATE cards SET affiliate_url = 'https://www.desjardins.com/en/credit-cards/cash-back-visa.html' WHERE name = 'Desjardins Cash Back Visa';
UPDATE cards SET affiliate_url = 'https://www.desjardins.com/en/credit-cards/odyssey-gold-visa.html' WHERE name = 'Desjardins Odyssey Visa Gold';

-- Brim Financial (single product page for both cards; no per-card deep pages)
UPDATE cards SET affiliate_url = 'https://brimfinancial.com/credit-cards' WHERE name = 'Brim World Elite Mastercard';
UPDATE cards SET affiliate_url = 'https://brimfinancial.com/credit-cards' WHERE name = 'Brim Mastercard';

-- MBNA
UPDATE cards SET affiliate_url = 'https://www.mbna.ca/en/credit-cards/low-interest/true-line-mastercard' WHERE name = 'MBNA True Line Mastercard';
UPDATE cards SET affiliate_url = 'https://www.mbna.ca/en/credit-cards/cash-back/smart-cash-mastercard' WHERE name = 'MBNA Smart Cash Platinum Plus Mastercard';
UPDATE cards SET affiliate_url = 'https://www.mbna.ca/en/credit-cards/rewards/mbna-rewards-world-elite-mastercard' WHERE name = 'MBNA Rewards World Elite Mastercard';

-- Canadian Tire (Triangle)
UPDATE cards SET affiliate_url = 'https://triangle.canadiantire.ca/en/credit-cards/triangle-mastercard.html' WHERE name = 'Triangle Mastercard';
UPDATE cards SET affiliate_url = 'https://triangle.canadiantire.ca/en/credit-cards/triangle-world-elite-mastercard.html' WHERE name = 'Triangle World Elite Mastercard';

-- Neo Financial
UPDATE cards SET affiliate_url = 'https://www.neofinancial.com/credit-cards/neo-mastercard' WHERE name = 'Neo Mastercard';
UPDATE cards SET affiliate_url = 'https://www.neofinancial.com/credit-cards/neo-world-elite-mastercard' WHERE name = 'Neo World Elite Mastercard';

-- Home Trust
UPDATE cards SET affiliate_url = 'https://www.hometrust.ca/credit-cards/preferred-visa-card/' WHERE name = 'Home Trust Preferred Visa';

-- Wealthsimple
UPDATE cards SET affiliate_url = 'https://www.wealthsimple.com/en-ca/credit-card' WHERE name = 'Wealthsimple Visa Infinite';

-- Rogers Bank
UPDATE cards SET affiliate_url = 'https://www.rogersbank.com/en/rogers_red_worldelite_mastercard_details/' WHERE name = 'Rogers Red World Elite Mastercard';

-- Simplii Financial (one credit card product; both DB entries point to it)
UPDATE cards SET affiliate_url = 'https://www.simplii.com/en/credit-cards/cash-back-visa.html' WHERE name = 'Simplii Cash Back Visa';
UPDATE cards SET affiliate_url = 'https://www.simplii.com/en/credit-cards/cash-back-visa.html' WHERE name = 'Simplii Financial Visa Card';

-- Tangerine
UPDATE cards SET affiliate_url = 'https://www.tangerine.ca/en/personal/spend/credit-cards/money-back-credit-card' WHERE name = 'Tangerine Money-Back Credit Card';
UPDATE cards SET affiliate_url = 'https://www.tangerine.ca/en/personal/spend/credit-cards/world-credit-card' WHERE name = 'Tangerine World Mastercard';
