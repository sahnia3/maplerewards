-- Revert the 2026 Aeroplan SQC tier correction.
UPDATE aeroplan_status_thresholds
   SET sqc_required = 100000, min_revenue_cad = 12000.00
 WHERE status_level = 'Super Elite' AND effective_year = 2026;

UPDATE aeroplan_status_thresholds
   SET min_revenue_cad = 3000.00
 WHERE status_level = '50K' AND effective_year = 2026;

UPDATE aeroplan_status_thresholds
   SET min_revenue_cad = NULL
 WHERE status_level = '75K' AND effective_year = 2026;
