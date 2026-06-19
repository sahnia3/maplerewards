"use client";

/* "Points earned (6 mo)" area chart (Home points/best-move row, left column).
 *
 * Wired to getPointsSeries(sessionId, 6). The header shows the window total and
 * the period-over-period delta; the AreaChart draws the per-month points_earned
 * series with JAN..JUN style mono month labels under it. The chart primitive
 * handles the gradient fill + stroke-dashoffset draw-in and is reduced-motion
 * gated by globals.
 */

import type { PointsSeries } from "@/lib/types";
import { AreaChart } from "@/components/editorial/dataviz";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function monthLabel(ym: string): string {
  // ym is "YYYY-MM"; map to a short uppercase month label.
  const m = Number(ym.slice(5, 7));
  return MONTHS[Math.max(0, Math.min(11, m - 1))] ?? ym;
}

function compactPoints(n: number): string {
  const sign = n < 0 ? "−" : "+";
  const abs = Math.abs(n);
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1)}K`;
  return `${sign}${abs.toLocaleString("en-CA")}`;
}

export function PointsChartCard({ series }: { series: PointsSeries }) {
  const points = series.months.map((m) => m.points_earned);
  const labels = series.months.map((m) => monthLabel(m.month));
  const deltaPositive = series.delta_pct >= 0;

  return (
    <div
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
        style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}
      >
        <div>
          <div className="eyebrow" style={{ marginBottom: 3 }}>
            Points earned
          </div>
          <div className="serif" style={{ fontSize: 13, fontStyle: "italic", color: "var(--ink-3)" }}>
            Last 6 months, all programs
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="display" style={{ fontSize: 24, color: "var(--ink)" }}>
            {compactPoints(series.window_total)}
          </div>
          <div
            className="mono"
            style={{ fontSize: 11, color: deltaPositive ? "var(--gain)" : "var(--loss)" }}
          >
            {deltaPositive ? "▲" : "▼"} {Math.abs(Math.round(series.delta_pct))}% vs. prior
          </div>
        </div>
      </div>
      <AreaChart points={points} labels={labels} color="var(--accent)" height={170} />
    </div>
  );
}
