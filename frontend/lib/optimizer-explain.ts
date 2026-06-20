import type { CardRecommendation } from "@/lib/types";

/**
 * Pure, natural-language "why this card" explanation for an optimizer
 * recommendation. Lifted verbatim (logic-preserving) from the now-deleted
 * RecommendationCard component so the reasoning ships to users in the editorial
 * optimizer. Operates only on a CardRecommendation-shaped object plus the
 * category/amount context the engine already has.
 */
function fmtCAD(v: number): string {
  return `$${v.toFixed(2)}`;
}

export function generateExplanation(
  rec: CardRecommendation,
  rank: number,
  category?: string,
  amount?: number,
): string {
  const parts: string[] = [];

  if (rank === 1) {
    parts.push(`Best choice for ${category ?? "this purchase"}`);
  }

  if (rec.transfer_partner) {
    parts.push(
      `Transfer to ${rec.transfer_partner} for ${rec.transfer_cpp?.toFixed(1)}¢/pt (vs ${rec.program_cpp.toFixed(1)}¢ native)`,
    );
  } else if (rec.program_cpp > 1.5) {
    parts.push(`Strong point value at ${rec.program_cpp.toFixed(1)}¢/pt`);
  }

  if (rec.earn_rate >= 5) {
    parts.push(`Exceptional ${rec.earn_rate}x earn rate in this category`);
  } else if (rec.earn_rate >= 3) {
    parts.push(`Good ${rec.earn_rate}x multiplier here`);
  }

  if (rec.is_cap_hit && rec.note?.includes("fully spent")) {
    parts.push("Spending cap reached — earning at fallback rate");
  } else if (rec.is_cap_hit) {
    parts.push("Partially capped — blended bonus and fallback rates");
  }

  if (amount && rec.dollar_value > 0) {
    const returnRate = (rec.dollar_value / amount) * 100;
    if (returnRate >= 5) {
      parts.push(`Earning ${fmtCAD(rec.dollar_value)} back on ${fmtCAD(amount)} is excellent`);
    }
  }

  if (parts.length === 0) {
    parts.push(`Earns ${rec.earn_rate}x points at ${rec.program_cpp.toFixed(1)}¢/pt`);
  }

  return parts.join(". ") + ".";
}
