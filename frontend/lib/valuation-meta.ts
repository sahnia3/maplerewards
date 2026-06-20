/* Valuation provenance helpers.
 *
 * Every CAD/CPP figure in the product rests on a base_cpp. To avoid showing
 * dollar figures with no sourcing, surfaces caption them with the date the
 * valuations were last reviewed.
 *
 * Two date sources:
 *   - Per-program: the loyalty detail page reads the live
 *     `valuation_as_of` (point_valuations.recorded_at) off the API response.
 *   - Catalog-level: surfaces that don't fetch a specific program (the wallet
 *     gauge, the optimizer winner stat) reuse CATALOG_VALUATION_AS_OF below.
 *
 * CATALOG_VALUATION_AS_OF is anchored to the 2026-06 data-integrity audit
 * (docs/DEEP-AUDIT-2026-06-01.md) that set the current point_valuations CPPs —
 * the same event the DB recorded_at column reflects. It is a real review date,
 * not a fabricated one; bump it when the catalog valuations are next refreshed.
 */

/** Catalog-level "valuations last reviewed" date (ISO yyyy-mm). */
export const CATALOG_VALUATION_AS_OF = "2026-06-01";

/** Format an ISO date/timestamp as "Mon YYYY" (e.g. "Jun 2026"). Returns null
 *  for missing/invalid input so callers can omit the caption gracefully rather
 *  than render a fabricated date. */
export function formatAsOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-CA", { month: "short", year: "numeric" });
}
