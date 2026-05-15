"use client";

import { useEffect, useState } from "react";
import { Scale } from "lucide-react";
import { getCardValueSummary } from "@/lib/api";
import type { CardValueSummary } from "@/lib/types";
import { PaperTile } from "@/components/editorial/PaperTile";
import { EmptyState } from "@/components/editorial/EmptyState";
import { fmtCAD, sectionStyle } from "./_shared";

interface Props {
  sessionId: string | null;
  isReady: boolean;
}

export function CardValueTile({ sessionId, isReady }: Props) {
  const [rows, setRows] = useState<CardValueSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!isReady || !sessionId) return;
    setLoading(true);
    getCardValueSummary(sessionId)
      .then(setRows)
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load card-value summary"))
      .finally(() => setLoading(false));
  }, [sessionId, isReady]);

  const totalNet = rows.reduce((s, r) => s + r.net_ev_cad, 0);
  const sorted = [...rows].sort((a, b) => b.net_ev_cad - a.net_ev_cad);

  return (
    <section style={sectionStyle}>
      <PaperTile
        motif="mountain"
        eyebrow="Card-value scorecard"
        title={<>Every card's <span style={{ fontStyle: "italic" }}>net</span> annual value.</>}
      >
        <p
          className="serif"
          style={{ marginTop: -4, marginBottom: 16, fontSize: 14, fontStyle: "italic", color: "var(--ink-2)", lineHeight: 1.5 }}
        >
          Insurance, lounge, concierge, FX savings, multipliers, credit bundles. All priced and netted against the annual fee. The honest answer to which cards earn their keep.
        </p>

        {loading && <p className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>Scoring your cards…</p>}
        {err && <p className="serif" style={{ fontStyle: "italic", color: "var(--loss)", fontSize: 14 }}>{err}</p>}
        {!loading && !err && rows.length === 0 && (
          <EmptyState
            icon={Scale}
            title="No cards to score yet"
            body="Add cards to your wallet so we can price every perk and net it against the fee."
            action={{ label: "Add cards", href: "/wallet" }}
          />
        )}

        {!loading && !err && rows.length > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
              <div>
                <span className="eyebrow">Wallet net value (annual)</span>
                <div className="display" style={{ fontSize: 36, color: totalNet >= 0 ? "var(--gain)" : "var(--loss)", lineHeight: 1, marginTop: 4 }}>
                  {fmtCAD(totalNet)}
                </div>
              </div>
              <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)", letterSpacing: "0.04em" }}>
                {rows.filter((r) => r.is_positive).length} of {rows.length} cards earn their fee
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--rule)" }}>
              {sorted.map((r) => (
                <div
                  key={r.card_id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 16,
                    padding: "12px 4px",
                    borderBottom: "1px solid var(--rule)",
                    alignItems: "baseline",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div className="display" style={{ fontSize: 15, color: "var(--ink)" }}>{r.card_name}</div>
                    <div className="serif" style={{ fontSize: 12, fontStyle: "italic", color: "var(--ink-3)", marginTop: 2 }}>
                      {fmtCAD(r.total_ev_cad)} value · {fmtCAD(r.annual_fee)} fee
                      {r.components.length > 0 && (
                        <> · {r.components.length} component{r.components.length === 1 ? "" : "s"}</>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="mono" style={{ fontSize: 14, color: r.is_positive ? "var(--gain)" : "var(--loss)", fontWeight: 600 }}>
                      {r.net_ev_cad >= 0 ? "+" : ""}{fmtCAD(r.net_ev_cad)}
                    </div>
                    <div className="mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 2 }}>
                      net annual
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </PaperTile>
    </section>
  );
}
