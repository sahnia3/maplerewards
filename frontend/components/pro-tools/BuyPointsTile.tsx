"use client";

import { useEffect, useState } from "react";
import { evaluateBuyPoints, listBuyPromos } from "@/lib/api";
import type { BuyPointsVerdict, BuyPromo } from "@/lib/types";
import { PaperTile } from "@/components/editorial/PaperTile";
import { FieldLabel, Stat, VerdictPill, ctaStyle, fieldStyle, fmtCAD, progLabel, sectionStyle } from "./_shared";

export function BuyPointsTile() {
  const [promos, setPromos] = useState<BuyPromo[]>([]);
  const [program, setProgram] = useState("aeroplan");
  const [points, setPoints] = useState("60000");
  const [cash, setCash] = useState("1500");
  const [verdict, setVerdict] = useState<BuyPointsVerdict | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { listBuyPromos().then(setPromos).catch(() => {}); }, []);

  async function evalIt() {
    setLoading(true);
    try {
      const v = await evaluateBuyPoints({
        program_slug: program,
        points_needed: parseInt(points) || 0,
        cash_alternative_cad: parseFloat(cash) || 0,
      });
      setVerdict(v);
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
          <button onClick={evalIt} disabled={loading} style={{ ...ctaStyle, opacity: loading ? 0.6 : 1 }}>
            {loading ? "Evaluating…" : "Evaluate →"}
          </button>
        </div>

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
