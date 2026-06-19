"use client";

/* "Where your rewards come from" coverage card (Home data row, right column).
 *
 * Wired to getPortfolioAnalysis(sessionId).utilization.gaps. Each gap names the
 * best card in the wallet for a category and its wallet return rate. We surface
 * a fixed editorial set of categories (Dining / Groceries / Travel / Gas /
 * Everything) in that order, matching each to its gap by name, and render the
 * return rate as a CoverageBars row with a "Best card · rate" caption.
 *
 * Bar widths are the wallet return normalized to the strongest covered category
 * (so the best category reads as a near-full bar, the rest relative to it). An
 * uncovered / unknown category renders a faint, captioned "no card" row.
 */

import type { CategoryGap } from "@/lib/types";
import { CoverageBars, type CoverageRow } from "@/components/editorial/dataviz";

const PALETTE = ["var(--accent)", "var(--gold)", "var(--primary)", "var(--lime)", "var(--info)"];

// Editorial category order + the display label / gap-name aliases to match on.
const DISPLAY: { label: string; match: string[] }[] = [
  { label: "Dining", match: ["dining", "restaurants", "food"] },
  { label: "Groceries", match: ["groceries", "grocery"] },
  { label: "Travel", match: ["travel"] },
  { label: "Gas", match: ["gas", "fuel"] },
  { label: "Everything", match: ["everything", "other", "general", "all other"] },
];

function findGap(gaps: CategoryGap[], aliases: string[]): CategoryGap | undefined {
  const norm = (s: string) => s.toLowerCase().trim();
  return gaps.find((g) => {
    const n = norm(g.category_name);
    return aliases.some((a) => n === a || n.includes(a));
  });
}

export function CoverageCard({ gaps }: { gaps: CategoryGap[] }) {
  // Normalize bar widths to the strongest covered return so the chart has a
  // confident leader instead of five same-length bars. Returns are in percent
  // units (8.25 = 8.25%); the floor just avoids divide-by-zero.
  const maxReturn = Math.max(
    0.0001,
    ...gaps.filter((g) => g.is_covered).map((g) => g.wallet_return),
  );

  const rows: CoverageRow[] = DISPLAY.map((d, i) => {
    const gap = findGap(gaps, d.match);
    const color = PALETTE[i % PALETTE.length];

    if (!gap || !gap.is_covered) {
      return {
        label: d.label,
        pct: gap && gap.wallet_return > 0 ? (gap.wallet_return / maxReturn) * 100 : 6,
        color: "var(--rule-strong)",
        caption: (
          <span style={{ color: "var(--ink-4)" }}>No card</span>
        ),
      };
    }

    // wallet_return is already in percent units (e.g. 8.25 = 8.25%), per the
    // backend CategoryGap contract — do not scale by 100.
    const ratePct = gap.wallet_return.toFixed(1);
    return {
      label: d.label,
      pct: Math.max(8, (gap.wallet_return / maxReturn) * 100),
      color,
      caption: (
        <>
          {gap.best_card_in_wallet} · <span style={{ color: "var(--ink)" }}>{ratePct}%</span>
        </>
      ),
    };
  });

  return (
    <div
      data-tour-id="home-coverage"
      className="lift"
      style={{
        border: "1px solid var(--rule)",
        borderRadius: 16,
        background: "var(--card-fill)",
        padding: "20px 22px",
        boxShadow: "var(--shadow-1)",
      }}
    >
      <div
        style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}
      >
        <div className="eyebrow">Where your rewards come from</div>
        <span className="mono" style={{ fontSize: 11, color: "var(--accent)", letterSpacing: "0.08em" }}>
          BEST CARD PER CATEGORY
        </span>
      </div>
      <div
        className="serif"
        style={{ fontSize: 13, fontStyle: "italic", color: "var(--ink-3)", marginBottom: 16 }}
      >
        Return rate routed to your top card in each category.
      </div>
      <CoverageBars rows={rows} />
    </div>
  );
}
