-- Remove the RBC Avion transfer row that renders AAdvantage data under Aeroplan
-- (QA 2026-06-12, P2-19). Migration 000006 seeded "RBC Avion -> American
-- Airlines AAdvantage (10:7)" — a real partnership — but pointed to_program_id
-- at Aeroplan's id ('…0001'); AAdvantage has never been added to
-- loyalty_programs. /loyalty/aeroplan therefore showed "RBC Avion -> AAdvantage
-- 10:7" as an Aeroplan inbound transfer. RBC Avion has no Aeroplan partnership
-- (its airline partners are BA Avios, AAdvantage, Asia Miles, WestJet), and the
-- intended destination program does not exist in the catalog, so the row is
-- deleted rather than repointed. Guarded on the 0.7 ratio so the legitimate
-- future addition of an Aeroplan row (if one ever existed) would not be touched.

DELETE FROM transfer_partners
 WHERE from_program_id = '10000000-0000-0000-0000-000000000003' -- rbc-avion
   AND to_program_id = '10000000-0000-0000-0000-000000000001'   -- aeroplan
   AND transfer_ratio = 0.7000;
