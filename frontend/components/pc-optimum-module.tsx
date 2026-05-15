"use client";

import { useMemo, useState } from "react";

/* ─────────────────────────────────────────────────────────────────────────────
 * PCOptimumModule — Loblaws-empire mini economy.
 *
 * PC Optimum has a 0.10¢ CPP, which is why most rewards apps dismiss it. But
 * if you live in Canada you almost certainly shop at one of the Loblaws-owned
 * stores (Loblaws / No Frills / Superstore / Shoppers / T&T / Wholesale Club),
 * and Amex doesn't work there. PC Mastercard + PC Mobile + Shoppers
 * personalised offers stack into a parallel rewards economy that can match
 * 5-7% effective return on monthly necessities.
 *
 * This is a calculator, not a tracker — there's no per-user data behind it.
 * Inputs: monthly Loblaws-empire grocery + monthly PC Mobile spend + Shoppers
 * personalised-offer rate (0% / 5% / 10% per stacking guide). Output: monthly
 * PC Optimum points earned, redemption value, and effective return.
 * ───────────────────────────────────────────────────────────────────────── */

type ShoppersTier = 0 | 5 | 10;

const PC_MASTERCARD_GROCERY_RATE = 30; // pts per $1 (3% effective)
const PC_MOBILE_BONUS_RATE_PCT = 10;    // 10% Optimum back on autopay PC Mobile plan
const PC_OPTIMUM_CPP = 0.001;            // $0.001 per point (0.10¢) — fixed value at all stores

const STORES = [
  "Loblaws", "No Frills", "Real Canadian Superstore", "Shoppers Drug Mart",
  "T&T Supermarket", "Wholesale Club", "Independent grocers (Loblaws)", "Joe Fresh",
];

export function PCOptimumModule() {
  const [groceriesCAD, setGroceriesCAD] = useState("400");
  const [mobileCAD, setMobileCAD] = useState("35");
  const [shoppersTier, setShoppersTier] = useState<ShoppersTier>(5);

  const numbers = useMemo(() => {
    const groc = Math.max(0, parseFloat(groceriesCAD) || 0);
    const mob = Math.max(0, parseFloat(mobileCAD) || 0);

    // PC Mastercard at Loblaws-empire stores: 30 pts/$1 (3% effective).
    const grocPoints = groc * PC_MASTERCARD_GROCERY_RATE;
    // PC Mobile autopay bonus: 10% of plan in PC Optimum points.
    // 10% of $35 = $3.50 = 3,500 PC Optimum points.
    const mobilePoints = (mob * PC_MOBILE_BONUS_RATE_PCT) / 100 / PC_OPTIMUM_CPP;
    // Shoppers personalised offer multiplier — adds shoppersTier% to the
    // grocery-on-Shoppers slice. We assume 30% of stated grocery spend is
    // at Shoppers (most users diversify).
    const shoppersAddPoints = (groc * 0.3) * (shoppersTier / 100) / PC_OPTIMUM_CPP;

    const totalMonthly = grocPoints + mobilePoints + shoppersAddPoints;
    const totalAnnual = totalMonthly * 12;

    const monthlyValueCAD = totalMonthly * PC_OPTIMUM_CPP;
    const annualValueCAD = monthlyValueCAD * 12;

    const totalSpendMonthly = groc + mob;
    const effectiveReturnPct = totalSpendMonthly > 0
      ? (monthlyValueCAD / totalSpendMonthly) * 100
      : 0;

    return {
      grocPoints,
      mobilePoints,
      shoppersAddPoints,
      totalMonthly,
      totalAnnual,
      monthlyValueCAD,
      annualValueCAD,
      effectiveReturnPct,
    };
  }, [groceriesCAD, mobileCAD, shoppersTier]);

  return (
    <section style={{ marginBottom: 22 }}>
      <header style={{ marginBottom: 18, display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="mr-hero-kicker" style={{ marginBottom: 10 }}>
            <span className="eyebrow" style={{ color: "var(--accent)" }}>PC Optimum economy</span>
            <span className="mr-kicker-line" style={{ maxWidth: 60 }} />
          </div>
          <h2
            className="display"
            style={{ fontSize: "clamp(28px, 3vw, 36px)", margin: 0, lineHeight: 1.05, letterSpacing: "-0.01em" }}
          >
            The <span style={{ fontStyle: "italic" }}>Loblaws-empire</span> mini-economy.
          </h2>
          <p
            className="serif"
            style={{ marginTop: 8, fontSize: 15, fontStyle: "italic", color: "var(--ink-2)", maxWidth: 680, lineHeight: 1.45 }}
          >
            PC Optimum has a 0.10¢ CPP &mdash; but most Canadians shop at Loblaws-owned stores
            where Amex is rejected. Stack PC Mastercard + PC Mobile + Shoppers personalised
            offers and the parallel economy can match a 5-7% effective return on monthly
            necessities. Maple is the only optimizer that models it.
          </p>
        </div>
      </header>

      <div
        style={{
          border: "1px solid var(--rule)",
          background: "var(--card-fill-strong)",
          borderRadius: 14,
          padding: "22px 24px",
          boxShadow: "var(--shadow-1)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse 50% 40% at 100% 0%, var(--accent-soft), transparent 70%)",
            pointerEvents: "none",
          }}
        />
        <div style={{ position: "relative" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 14,
              marginBottom: 18,
            }}
            className="pc-optimum-inputs"
          >
            <Field label="Loblaws-empire monthly $">
              <input
                type="number"
                value={groceriesCAD}
                onChange={(e) => setGroceriesCAD(e.target.value)}
                min={0}
                style={inputStyle}
              />
            </Field>
            <Field label="PC Mobile plan $/mo">
              <input
                type="number"
                value={mobileCAD}
                onChange={(e) => setMobileCAD(e.target.value)}
                min={0}
                style={inputStyle}
              />
            </Field>
            <Field label="Shoppers personalised-offer rate">
              <select
                value={shoppersTier}
                onChange={(e) => setShoppersTier(Number(e.target.value) as ShoppersTier)}
                style={inputStyle}
              >
                <option value={0}>0% (no offers)</option>
                <option value={5}>5% (typical)</option>
                <option value={10}>10% (good week)</option>
              </select>
            </Field>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              border: "1px solid var(--rule)",
              borderRadius: 10,
              overflow: "hidden",
              background: "var(--card-fill)",
              marginBottom: 18,
            }}
          >
            <Stat label="Annual PC Optimum pts" value={Math.round(numbers.totalAnnual).toLocaleString()} />
            <Stat label="Annual cash value" value={`$${numbers.annualValueCAD.toFixed(0)}`} accent />
            <Stat label="Effective return" value={`${numbers.effectiveReturnPct.toFixed(2)}%`} last />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }} className="pc-optimum-cols">
            <div>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Monthly point sources</div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                <Source label={`PC Mastercard at Loblaws-empire (${PC_MASTERCARD_GROCERY_RATE}× pts/$)`} value={numbers.grocPoints} />
                <Source label={`PC Mobile autopay bonus (${PC_MOBILE_BONUS_RATE_PCT}% of plan)`} value={numbers.mobilePoints} />
                <Source label={`Shoppers personalised offer add-on (${shoppersTier}% on 30% of grocery)`} value={numbers.shoppersAddPoints} />
              </ul>
            </div>
            <div>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Where the points work</div>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: "4px 14px",
                }}
              >
                {STORES.map((s) => (
                  <li
                    key={s}
                    className="serif"
                    style={{ fontSize: 13, fontStyle: "italic", color: "var(--ink-2)", lineHeight: 1.6 }}
                  >
                    · {s}
                  </li>
                ))}
              </ul>
              <p
                className="mono"
                style={{ marginTop: 12, fontSize: 10, letterSpacing: "0.06em", color: "var(--ink-3)" }}
              >
                Redemption sweet spot: 20× weekend events at Shoppers (~30% return on top of the
                PC MC base earn). Avoid base-rate redemption if a 20× event is approaching.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 42,
  padding: "0 12px",
  background: "var(--surface)",
  border: "1px solid var(--rule)",
  borderRadius: 8,
  fontSize: 14,
  fontFamily: "var(--font-mono)",
  color: "var(--ink)",
  outline: "none",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="eyebrow" style={{ fontSize: 9, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

function Stat({ label, value, accent = false, last = false }: { label: string; value: string; accent?: boolean; last?: boolean }) {
  return (
    <div style={{ padding: "12px 14px", borderRight: last ? "none" : "1px solid var(--rule)" }}>
      <div className="eyebrow" style={{ fontSize: 9, marginBottom: 4 }}>{label}</div>
      <div
        className="mono"
        style={{
          fontSize: 16,
          color: accent ? "var(--accent)" : "var(--ink)",
          fontWeight: 600,
          letterSpacing: "0.02em",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Source({ label, value }: { label: string; value: number }) {
  return (
    <li
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "8px 0",
        borderBottom: "1px solid var(--rule)",
      }}
    >
      <span className="serif" style={{ fontSize: 13, color: "var(--ink-2)", fontStyle: "italic", lineHeight: 1.4 }}>
        {label}
      </span>
      <span className="mono" style={{ fontSize: 13, color: "var(--ink)", whiteSpace: "nowrap" }}>
        {Math.round(value).toLocaleString()} pts
      </span>
    </li>
  );
}
