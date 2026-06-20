"use client";

import { useEffect, useState } from "react";
import { evaluateBuyPoints, listBuyPromos } from "@/lib/api";
import type { BuyPointsVerdict, BuyPromo } from "@/lib/types";
import { PaperTile } from "@/components/editorial/PaperTile";
import { FieldLabel, Stat, VerdictPill, ctaStyle, fieldStyle, fmtCAD, progLabel, sectionStyle } from "./_shared";

// Honest two-value comparison bar — both numbers come straight from the
// break-even API verdict; nothing is synthesised.
function Bar({ label, value, pct, color }: { label: string; value: number; pct: number; color: string }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <span className="mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
          {label}
        </span>
        <span className="mono" style={{ fontSize: 12, color: "var(--ink)", fontWeight: 600 }}>
          {value.toFixed(2)}¢
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.max(2, Math.min(100, pct))}%`, background: color, borderRadius: 999 }} />
      </div>
    </div>
  );
}

export function BuyPointsTile() {
  const [promos, setPromos] = useState<BuyPromo[]>([]);
  const [program, setProgram] = useState("");
  const [points, setPoints] = useState("60000");
  const [cash, setCash] = useState("1500");
  const [verdict, setVerdict] = useState<BuyPointsVerdict | null>(null);
  const [loading, setLoading] = useState(false);
  // Surfaced (not swallowed) so a failed break-even evaluation tells the user
  // instead of silently leaving the last verdict on screen — this is the math
  // they decide a real cash purchase on.
  const [err, setErr] = useState<string | null>(null);
  const [promosErr, setPromosErr] = useState<string | null>(null);

  useEffect(() => {
    listBuyPromos().then((p) => {
      setPromos(p);
      if (p.length > 0) setProgram(p[0].program_slug);
    }).catch((e) => {
      setPromosErr(e instanceof Error ? e.message : "Couldn't load promo pricing.");
    });
  }, []);

  async function evalIt() {
    setLoading(true);
    setErr(null);
    try {
      const v = await evaluateBuyPoints({
        program_slug: program,
        points_needed: parseInt(points) || 0,
        cash_alternative_cad: parseFloat(cash) || 0,
      });
      setVerdict(v);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't evaluate this buy. Try again.");
    } finally { setLoading(false); }
  }

  return (
    <section style={sectionStyle}>
      <PaperTile
        motif="gauge"
        eyebrow="Buy-points break-even"
        title={<>Should you <span style={{ fontStyle: "italic" }}>buy</span> or earn?</>}
      >
        <p
          className="serif"
          style={{ marginTop: -4, marginBottom: 16, fontSize: 14, fontStyle: "italic", color: "var(--ink-2)", lineHeight: 1.5 }}
        >
          Live promo pricing across five programs. Break-even math against the cash alternative, no spreadsheet needed.
        </p>

        <div className="protool-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 12, alignItems: "end" }}>
          <div>
            <FieldLabel>Program</FieldLabel>
            <select value={program} onChange={(e) => setProgram(e.target.value)} style={fieldStyle}>
              {promos.map(p => <option key={p.program_slug} value={p.program_slug}>{progLabel(p.program_slug)}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>Points needed</FieldLabel>
            <input type="number" value={points} onChange={e => setPoints(e.target.value)} style={fieldStyle} />
          </div>
          <div>
            <FieldLabel>Cash alternative (CAD)</FieldLabel>
            <input type="number" value={cash} onChange={e => setCash(e.target.value)} style={fieldStyle} />
          </div>
          <button onClick={evalIt} disabled={loading || !program} style={{ ...ctaStyle, opacity: loading || !program ? 0.6 : 1 }}>
            {loading ? "Evaluating…" : "Evaluate →"}
          </button>
        </div>

        {(err || promosErr) && (
          <p
            role="alert"
            className="mono"
            style={{ marginTop: 12, fontSize: 12, color: "var(--loss)" }}
          >
            {err ?? promosErr}
          </p>
        )}

        {verdict && (
          <div
            style={{
              marginTop: 18,
              borderTop: "1px solid var(--rule)",
              paddingTop: 18,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span className="eyebrow">Verdict</span>
              <VerdictPill verdict={verdict.verdict} />
            </div>
            <p className="serif" style={{ color: "var(--ink-2)", fontSize: 15, lineHeight: 1.5, marginBottom: 14 }}>
              {verdict.rationale}
            </p>
            <div
              className="protool-stat-row"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                border: "1px solid var(--rule)",
                borderRadius: 10,
                overflow: "hidden",
                background: "var(--card-fill)",
              }}
            >
              <Stat label="Buy cost" value={fmtCAD(verdict.buy_cost_cad)} />
              <Stat label="Promo CPP" value={`${verdict.current_promo_cents_per_point.toFixed(2)}¢`} />
              <Stat label="Break-even" value={`${verdict.break_even_cents_per_point.toFixed(2)}¢`} last />
            </div>

            {/* Break-even comparison — TWO real numbers only. We previously drew a
                4-point "curve" across invented order sizes (promo × 1.18 / 1.05 /
                0.96); buy-points pricing here doesn't vary with order size, so that
                ramp was decorative, not data. This shows exactly what the API gives
                us: the promo price per point vs the redemption break-even. Promo at
                or below break-even (green) means buying beats the cash alternative. */}
            {(() => {
              const promo = verdict.current_promo_cents_per_point;
              const be = verdict.break_even_cents_per_point;
              const max = Math.max(promo, be) || 1;
              const promoPct = (promo / max) * 100;
              const bePct = (be / max) * 100;
              const buying = promo <= be;
              const barColor = buying ? "var(--gain)" : "var(--loss)";
              return (
                <div style={{ marginTop: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <span className="eyebrow">Promo price vs break-even (¢ / point)</span>
                    <span className="mono" style={{ fontSize: 10, color: barColor, letterSpacing: "0.04em" }}>
                      {buying ? "buying wins" : "earn instead"}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <Bar label="You'd pay (promo)" value={promo} pct={promoPct} color={barColor} />
                    <Bar label="Break-even ceiling" value={be} pct={bePct} color="var(--ink-3)" />
                  </div>
                </div>
              );
            })()}
            {verdict.promo_label && (
              <p className="mono" style={{ fontSize: 11, marginTop: 10, color: "var(--ink-3)", letterSpacing: "0.04em" }}>
                {verdict.promo_label}
                {verdict.source_url && <> · <a href={verdict.source_url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>source</a></>}
              </p>
            )}
          </div>
        )}
      </PaperTile>
    </section>
  );
}
