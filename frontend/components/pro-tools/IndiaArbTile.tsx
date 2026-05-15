"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Mountain } from "lucide-react";
import { getIndiaArbitrage } from "@/lib/api";
import type { IndiaArbitrageProperty } from "@/lib/types";
import { PaperTile } from "@/components/editorial/PaperTile";
import { EmptyState } from "@/components/editorial/EmptyState";
import { fmtCAD, progLabel, sectionStyle } from "./_shared";

interface Props {
  sessionId: string | null;
  isReady: boolean;
}

export function IndiaArbTile({ sessionId, isReady }: Props) {
  const [props, setProps] = useState<IndiaArbitrageProperty[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isReady || !sessionId) return;
    setLoading(true);
    getIndiaArbitrage(sessionId).then(setProps).catch(() => {}).finally(() => setLoading(false));
  }, [isReady, sessionId]);

  return (
    <section style={sectionStyle}>
      <PaperTile
        motif="mountain"
        eyebrow="India arbitrage"
        title={<>Canadian points, <span style={{ fontStyle: "italic" }}>Indian rates</span>.</>}
      >
        <p
          className="serif"
          style={{ marginTop: -4, marginBottom: 16, fontSize: 14, fontStyle: "italic", color: "var(--ink-2)", lineHeight: 1.5 }}
        >
          Marriott, Hilton, and Hyatt fixed-night charts make Indian properties some of the highest-CPP redemptions on earth.
        </p>

        {loading ? (
          <div className="serif" style={{ fontStyle: "italic", color: "var(--ink-3)" }}>Loading properties…</div>
        ) : props.length === 0 ? (
          <EmptyState
            icon={Mountain}
            title="No hotel-program balances yet"
            body="Seed a Marriott, Hilton, or Hyatt balance to see your personalised nights-affordable math."
            action={{ label: "Add cards", href: "/wallet" }}
          />
        ) : (
          <div style={{ borderTop: "1px solid var(--rule)" }}>
            {props.slice(0, 8).map((p, i) => (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 14,
                  alignItems: "center",
                  padding: "14px 4px",
                  borderBottom: "1px solid var(--rule)",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div className="display" style={{ fontSize: 18, lineHeight: 1.1 }}>{p.property_name}</div>
                  <div className="serif" style={{ fontSize: 13, fontStyle: "italic", color: "var(--ink-3)", marginTop: 2 }}>
                    {p.city} · {progLabel(p.program_slug)} · {p.points_per_night.toLocaleString()} pts/night
                    <span className="mono" style={{ marginLeft: 8, fontSize: 11, color: "var(--gain)" }}>
                      {(p.value_cad_per_point * 100).toFixed(2)}¢/pt
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="display" style={{ fontSize: 22, fontStyle: p.nights_affordable > 0 ? "italic" : "normal", color: p.nights_affordable > 0 ? "var(--gain)" : "var(--ink-3)" }}>
                    {p.nights_affordable > 0 ? `${p.nights_affordable} nights` : fmtCAD(p.cash_rate_cad)}
                  </div>
                  {p.total_savings_cad > 0 && (
                    <div className="mono" style={{ fontSize: 11, color: "var(--gain)", marginTop: 2 }}>
                      save {fmtCAD(p.total_savings_cad)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {props.length > 0 && (
          <p className="mono" style={{ fontSize: 10, marginTop: 14, color: "var(--ink-3)", letterSpacing: "0.06em" }}>
            Cash rates sampled at booking time. Set point balances at{" "}
            <Link href="/wallet" style={{ color: "var(--accent)", textDecoration: "underline" }}>/wallet</Link> for personalised savings math.
          </p>
        )}
      </PaperTile>
    </section>
  );
}
