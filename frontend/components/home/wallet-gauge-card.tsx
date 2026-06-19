"use client";

/* Wallet-value radial gauge (Home data row, left column).
 *
 * Wired to the 3-tier wallet valuation from getWalletSummary:
 *   - value arc      = base (value_range_low), center figure + "BASE CPP"
 *   - ceiling arc    = sweet-spot (value_sweet_spot), shown as the gold footer
 *   - max (full ring)= upside (value_range_high)
 *   - footer right   = UPSIDE delta (high − base) in --gain
 *
 * Numerically consistent with the hero stat ribbon (whose headline is the
 * sweet-spot) and with /wallet's base-CPP value. The RadialGauge primitive
 * draws the arcs via stroke-dashoffset and is reduced-motion-gated by globals.
 */

import { RadialGauge } from "@/components/editorial/dataviz";

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-CA")}`;
}

export function WalletGaugeCard({
  base,
  sweetSpot,
  upside,
}: {
  base: number;
  sweetSpot: number;
  upside: number;
}) {
  // The ring scale is the upside ceiling so the value/sweet-spot arcs read as
  // a fraction of the wallet's full potential. Guard against a zero/degenerate
  // ceiling (new wallet) by falling back to the largest known figure.
  const max = Math.max(upside, sweetSpot, base, 1);
  const upsideDelta = Math.max(0, upside - base);

  return (
    <div
      data-tour-id="home-wallet-gauge"
      className="lift"
      style={{
        border: "1px solid var(--rule)",
        borderRadius: 16,
        background: "var(--card-fill)",
        padding: 20,
        boxShadow: "var(--shadow-1)",
      }}
    >
      <div className="eyebrow" style={{ marginBottom: 4 }}>
        Wallet value
      </div>
      <div
        className="serif"
        style={{ fontSize: 13, fontStyle: "italic", color: "var(--ink-3)", marginBottom: 10 }}
      >
        Base CPP vs. sweet-spot ceiling
      </div>
      <RadialGauge
        value={base}
        ceiling={sweetSpot}
        max={max}
        size={180}
        centerValue={money(base)}
        centerLabel="BASE CPP"
        color="var(--accent)"
        ceilingColor="var(--gold)"
        footer={[
          { label: "SWEET-SPOT", value: money(sweetSpot), color: "var(--gold)", align: "left" },
          { label: "UPSIDE", value: `+${money(upsideDelta)}`, color: "var(--gain)", align: "right" },
        ]}
      />
    </div>
  );
}
