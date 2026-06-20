"use client";

import { useEffect, useMemo, useState } from "react";
import { ensureSession, listLoyaltyAccounts, createLoyaltyAccount } from "@/lib/api";
import { ProgressBar } from "@/components/editorial/dataviz";

/* ─────────────────────────────────────────────────────────────────────────────
 * PCOptimumModule — persisted PC Optimum balance + the Loblaws-empire economy.
 *
 * PRIMARY (new): a real, persisted PC Optimum balance. The balance is stored as
 * a loyalty_accounts row (program_slug 'pc-optimum', no account_label) via the
 * existing upsert CRUD and read back via listLoyaltyAccounts. From it we derive
 * CAD value (balance / 1000 — 1000 pts = $1) and a synthetic milestone-tier
 * ladder [10k, 50k, 100k, 200k] for the "% to next tier" bar. Curated loaded
 * offers are static (no offers table exists).
 *
 * SECONDARY: the original Loblaws-empire calculator — PC Mastercard + PC Mobile
 * + Shoppers personalised offers — kept below the persisted tracker.
 * ───────────────────────────────────────────────────────────────────────── */

// Synthetic milestone ladder — PC Optimum has no official tier program. Above
// the top rung we step by 100k. Documented so the bar % is intentional.
const TIER_LADDER = [10_000, 50_000, 100_000, 200_000];

interface OfferExample {
  title: string;
  detail: string;
  tag: string;
  tone: string;
}

// ILLUSTRATIVE, not real. PC Optimum has no public offers API and we don't read a
// user's personalised loaded offers — these are typical *kinds* of promo to watch
// for, shown as examples so the section is honest. They are NOT live offers
// loaded to anyone's account. The UI labels them "Illustrative" accordingly.
const OFFER_EXAMPLES: OfferExample[] = [
  { title: "Multiplier point events", detail: "e.g. 15–20× the points weekends at Shoppers Drug Mart on a minimum spend", tag: "Shoppers", tone: "var(--gain)" },
  { title: "Bonus-point grocery offers", detail: "e.g. earn thousands of bonus points for hitting a weekly Loblaws-empire grocery spend", tag: "Grocery", tone: "var(--gold)" },
  { title: "Card stacking", detail: "Pay with a card that also rewards drugstores/grocery to double-dip on top of the base earn", tag: "Stack", tone: "var(--accent)" },
];

type ShoppersTier = 0 | 5 | 10;

const PC_MASTERCARD_GROCERY_RATE = 30; // pts per $1 (3% effective)
const PC_MOBILE_BONUS_RATE_PCT = 10;    // 10% Optimum back on autopay PC Mobile plan
const PC_OPTIMUM_CPP = 0.001;            // $0.001 per point (0.10¢) — fixed value at all stores

const STORES = [
  "Loblaws", "No Frills", "Real Canadian Superstore", "Shoppers Drug Mart",
  "T&T Supermarket", "Wholesale Club", "Independent grocers (Loblaws)", "Joe Fresh",
];

export function PCOptimumModule() {
  // ── Persisted PC Optimum balance ───────────────────────────────────────────
  const [balance, setBalance] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Surfaced (not swallowed) so a failed balance save tells the user instead of
  // silently leaving the old saved balance behind the optimistic draft.
  const [saveErr, setSaveErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sid = await ensureSession();
        const accts = await listLoyaltyAccounts(sid);
        const pc = accts.find((a) => a.program_slug === "pc-optimum");
        if (alive) {
          setBalance(pc ? Number(pc.balance) : 0);
          setDraft(pc ? String(pc.balance) : "");
          setLoaded(true);
        }
      } catch {
        if (alive) {
          setBalance(0);
          setLoaded(true);
        }
      }
    })();
    return () => { alive = false; };
  }, []);

  async function saveBalance() {
    const n = Math.max(0, Math.round(parseFloat(draft) || 0));
    setSaving(true);
    setSaveErr(null);
    try {
      const sid = await ensureSession();
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      // Upsert: same program_slug + no account_label always targets one row.
      const acct = await createLoyaltyAccount(sid, {
        program_slug: "pc-optimum",
        balance: n,
        last_activity: today,
      });
      setBalance(Number(acct.balance));
    } catch (e) {
      // Surface it: the headline still reflects the last saved balance, so
      // without this the user thinks the new balance saved when it didn't.
      setSaveErr(e instanceof Error ? `Couldn't save balance: ${e.message}` : "Couldn't save balance. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const tier = useMemo(() => {
    const bal = balance ?? 0;
    const cadValue = bal / 1000; // 1000 pts = $1 CAD
    let next = TIER_LADDER.find((m) => m > bal);
    let prev = [...TIER_LADDER].reverse().find((m) => m <= bal) ?? 0;
    if (next === undefined) {
      next = Math.ceil((bal + 1) / 100_000) * 100_000;
      prev = Math.floor(bal / 100_000) * 100_000;
    }
    const span = next - prev || 1;
    const pct = Math.min(100, Math.max(0, ((bal - prev) / span) * 100));
    return { cadValue, next, prev, pct };
  }, [balance]);

  // ── Loblaws-empire calculator (secondary) ──────────────────────────────────
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
          {/* ── Persisted balance (primary) ─────────────────────────────── */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div>
                <span className="eyebrow">Your PC Optimum balance</span>
                <div className="display" style={{ fontSize: 30, marginTop: 6, lineHeight: 1 }}>
                  {loaded ? (balance ?? 0).toLocaleString() : "—"}
                  <span style={{ fontSize: 14, color: "var(--ink-3)" }}> pts · ${tier.cadValue.toFixed(0)}</span>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                <div>
                  <div className="eyebrow" style={{ fontSize: 9, marginBottom: 6 }}>Update balance</div>
                  <input
                    type="number"
                    min={0}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="142000"
                    style={{ ...inputStyle, width: 140 }}
                  />
                </div>
                <button
                  type="button"
                  onClick={saveBalance}
                  disabled={saving || !loaded}
                  className="mono"
                  style={{
                    height: 42,
                    padding: "0 18px",
                    borderRadius: 8,
                    border: "none",
                    background: saving ? "var(--surface-2)" : "var(--accent)",
                    color: saving ? "var(--ink-3)" : "#fff",
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.10em",
                    textTransform: "uppercase",
                    cursor: saving || !loaded ? "default" : "pointer",
                    boxShadow: saving ? "none" : "var(--shadow-accent-glow)",
                  }}
                >
                  {saving ? "Saving…" : "Save balance"}
                </button>
              </div>
            </div>
            {saveErr && (
              <p
                role="alert"
                className="mono"
                style={{ marginTop: 10, fontSize: 12, color: "var(--loss)" }}
              >
                {saveErr}
              </p>
            )}
            <ProgressBar
              pct={tier.pct}
              color="var(--gold)"
              height={9}
              style={{ marginTop: 14 }}
              label={`${Math.round(tier.pct)}% to the next ${tier.next.toLocaleString()}-pt milestone ($${(tier.next / 1000).toFixed(0)} redemption tier)`}
            />
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--rule)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div className="eyebrow">Offers to watch for</div>
                <span
                  className="mono"
                  style={{
                    fontSize: 8,
                    fontWeight: 600,
                    letterSpacing: "0.10em",
                    textTransform: "uppercase",
                    color: "var(--gold)",
                    background: "var(--gold-tint)",
                    border: "1px solid var(--gold-soft)",
                    borderRadius: 999,
                    padding: "1px 7px",
                  }}
                >
                  Illustrative
                </span>
              </div>
              <p className="serif" style={{ fontSize: 11, fontStyle: "italic", color: "var(--ink-3)", margin: "0 0 10px", lineHeight: 1.5 }}>
                Examples of the kinds of promo to look out for — not live offers loaded to your account. Check the PC Optimum app for your real personalised offers.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {OFFER_EXAMPLES.map((o) => (
                  <div key={o.title} style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                    <span style={{ color: o.tone, lineHeight: 1.5 }}>●</span>
                    <div style={{ minWidth: 0 }}>
                      <span className="serif" style={{ fontSize: 13, fontStyle: "italic", color: "var(--ink-2)" }}>
                        <strong style={{ color: "var(--ink)", fontStyle: "normal" }}>{o.title}</strong> — {o.detail}
                      </span>
                      <span className="mono" style={{ fontSize: 9, padding: "1px 7px", borderRadius: 999, border: "1px solid var(--rule-strong)", color: "var(--ink-3)", letterSpacing: "0.06em", textTransform: "uppercase", marginLeft: 8 }}>
                        {o.tag}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="eyebrow" style={{ margin: "4px 0 12px", paddingTop: 16, borderTop: "1px solid var(--rule)" }}>
            Estimate your monthly earn — Loblaws-empire calculator
          </div>
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
                Tip: multiplier point events at Shoppers (e.g. 15–20×) earn far more than the
                base rate — worth timing a planned purchase around one when you can.
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
