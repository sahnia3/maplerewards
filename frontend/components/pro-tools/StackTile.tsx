"use client";

import { useEffect, useState } from "react";
import { listMerchants, recommendStack } from "@/lib/api";
import type { Merchant, StackRecommendation } from "@/lib/types";
import { PaperTile } from "@/components/editorial/PaperTile";
import { FieldLabel, ctaStyle, fieldStyle, fmtCAD, fmtCAD2, sectionStyle } from "./_shared";

interface Props {
  sessionId: string | null;
  ensureSession: () => Promise<string>;
}

export function StackTile({ sessionId, ensureSession }: Props) {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [merchantSlug, setMerchantSlug] = useState("");
  const [spend, setSpend] = useState("200");
  const [rec, setRec] = useState<StackRecommendation | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    listMerchants().then(m => {
      setMerchants(m);
      if (m[0]) setMerchantSlug(m[0].slug);
    }).catch(() => {});
  }, []);

  async function recommend() {
    setLoading(true);
    try {
      const sid = await ensureSession();
      const r = await recommendStack({ session_id: sid, merchant_slug: merchantSlug, spend_amount: parseFloat(spend) || 0 });
      setRec(r);
    } finally { setLoading(false); }
  }

  return (
    <section style={sectionStyle}>
      <PaperTile
        motif="stack"
        eyebrow="Triple-stack calculator"
        title={<>Best <span style={{ fontStyle: "italic" }}>portal × card × offer</span>.</>}
      >
        <p
          className="serif"
          style={{ marginTop: -4, marginBottom: 16, fontSize: 14, fontStyle: "italic", color: "var(--ink-2)", lineHeight: 1.5 }}
        >
          Layer cashback portals over multipliers over network offers. The optimizer handles the order so nothing leaves money behind.
        </p>

        <div className="protool-grid" style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 12, alignItems: "end" }}>
          <div>
            <FieldLabel>Merchant</FieldLabel>
            <select value={merchantSlug} onChange={e => setMerchantSlug(e.target.value)} style={fieldStyle}>
              {merchants.map(m => <option key={m.slug} value={m.slug}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>Spend (CAD)</FieldLabel>
            <input type="number" value={spend} onChange={e => setSpend(e.target.value)} style={fieldStyle} />
          </div>
          <button onClick={recommend} disabled={loading || !sessionId} style={{ ...ctaStyle, opacity: loading || !sessionId ? 0.6 : 1 }}>
            {loading ? "Stacking…" : "Stack →"}
          </button>
        </div>

        {rec && (
          <div style={{ marginTop: 18, borderTop: "1px solid var(--rule)", paddingTop: 18 }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                marginBottom: 14,
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              <div>
                <span className="eyebrow">Stack total on {fmtCAD(rec.spend_amount)}</span>
                <div className="display" style={{ fontSize: 36, color: "var(--accent)", lineHeight: 1, marginTop: 4 }}>
                  {fmtCAD2(rec.total_value_cad)}
                </div>
              </div>
              <div className="mono" style={{ fontSize: 13, color: "var(--ink-2)", letterSpacing: "0.04em" }}>
                {rec.effective_return_pct.toFixed(2)}% effective return
              </div>
            </div>
            <div style={{ borderTop: "1px solid var(--rule)" }}>
              {rec.components.map((c, i) => (
                <div
                  key={i}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 16,
                    alignItems: "center",
                    padding: "12px 4px",
                    borderBottom: "1px solid var(--rule)",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div className="display" style={{ fontSize: 16, color: "var(--ink)" }}>{c.source}</div>
                    <div className="serif" style={{ fontSize: 12, fontStyle: "italic", color: "var(--ink-3)", marginTop: 2 }}>{c.detail}</div>
                  </div>
                  <div className="mono" style={{ fontSize: 14, color: "var(--gain)", fontWeight: 600 }}>+{fmtCAD2(c.value_cad)}</div>
                </div>
              ))}
            </div>
            {rec.warnings && rec.warnings.length > 0 && (
              <div style={{ marginTop: 12, padding: "10px 14px", borderLeft: "2px solid var(--accent)" }}>
                {rec.warnings.map((w, i) => (
                  <p key={i} className="serif" style={{ fontSize: 13, fontStyle: "italic", color: "var(--ink-2)", margin: 0 }}>
                    ⚠ {w}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </PaperTile>
    </section>
  );
}
