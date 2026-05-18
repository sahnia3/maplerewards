-- 000053 — Replace genuine-404 source URLs with verified-live Canadian pages.
--
-- The check-source-links.sh STRICT sweep flagged 4 source URLs returning a
-- true 404 (the page genuinely moved, not an anti-bot block). Each replacement
-- below was verified to return HTTP 200 using the link-checker's exact probe
-- method (HEAD then range-GET, MapleRewardsLinkCheck UA). All replacements are
-- official Canadian (.ca / en-ca) issuer/network/portal pages.
--
--   network_offers : Visa CA "offers and perks" page was retired; the live
--                    equivalent now lives under /pay-with-visa.html
--   portal_rates   : Rakuten CA restructured store pages from
--                    /sephora-coupons.html to the clean /sephora slug
--   issuer_pages   : Amex CA reclassified Platinum from credit-cards to
--                    charge-cards; Air Canada folded the standalone Aeroplan
--                    elite-status page into the Aeroplan landing page
--
-- Keyed by the exact old URL so this is idempotent and a no-op once applied.

UPDATE network_offers
   SET source_url = 'https://www.visa.ca/en_CA/pay-with-visa.html'
 WHERE source_url = 'https://www.visa.ca/en_CA/visa-offers-and-perks.html';

UPDATE portal_rates
   SET source_url = 'https://www.rakuten.ca/sephora'
 WHERE source_url = 'https://www.rakuten.ca/sephora-coupons.html';

UPDATE issuer_pages
   SET url = 'https://www.americanexpress.com/en-ca/charge-cards/the-platinum-card/'
 WHERE url = 'https://www.americanexpress.com/en-ca/credit-cards/platinum-card/';

UPDATE issuer_pages
   SET url = 'https://www.aircanada.com/ca/en/aco/home/aeroplan.html'
 WHERE url = 'https://www.aircanada.com/ca/en/aco/home/aeroplan/elite-status.html';
