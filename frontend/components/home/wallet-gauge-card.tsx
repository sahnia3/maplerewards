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
import { Term } from "@/components/ui/term";
import { CATALOG_VALUATION_AS_OF, formatAsOf } from "@/lib/valuation-meta";

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
  // Provenance: these CAD figures rest on catalog point valuations — caption
  // them with the catalog review date so they aren't shown unsourced.
  const valuationAsOf = formatAsOf(CATALOG_VALUATION_AS_OF);

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
        style={{ fontSize: 14, fontStyle: "italic", color: "var(--ink-2)", marginBottom: 6, lineHeight: 1.4 }}
      >
        Here&rsquo;s what your wallet is worth &mdash; and where you&rsquo;re leaving points behind.
      </div>
      <div
        className="serif"
        style={{ fontSize: 13, fontStyle: "italic", color: "var(--ink-3)", marginBottom: 10 }}
      >
        <Term term="base cpp">Base CPP</Term> vs.{" "}
        <Term term="sweet spot">sweet-spot</Term> ceiling
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
      {valuationAsOf && (
        <div
          className="mono"
          style={{
            marginTop: 12,
            fontSize: 9,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
            fontWeight: 500,
            textAlign: "center",
          }}
        >
          Valuations as of {valuationAsOf}
        </div>
      )}
    </div>
  );
}
