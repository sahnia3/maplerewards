-- Revert 000053 — restore the original (now-404) source URLs. Keyed by the
-- replacement URL so the rollback is idempotent and reversible.

UPDATE network_offers
   SET source_url = 'https://www.visa.ca/en_CA/visa-offers-and-perks.html'
 WHERE source_url = 'https://www.visa.ca/en_CA/pay-with-visa.html';

UPDATE portal_rates
   SET source_url = 'https://www.rakuten.ca/sephora-coupons.html'
 WHERE source_url = 'https://www.rakuten.ca/sephora';

UPDATE issuer_pages
   SET url = 'https://www.americanexpress.com/en-ca/credit-cards/platinum-card/'
 WHERE url = 'https://www.americanexpress.com/en-ca/charge-cards/the-platinum-card/';

UPDATE issuer_pages
   SET url = 'https://www.aircanada.com/ca/en/aco/home/aeroplan/elite-status.html'
 WHERE url = 'https://www.aircanada.com/ca/en/aco/home/aeroplan.html';
