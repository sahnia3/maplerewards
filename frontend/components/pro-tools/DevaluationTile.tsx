"use client";

import { useCallback, useEffect, useState } from "react";
import { listDevaluations } from "@/lib/api";
import type { DevaluationEvent } from "@/lib/types";
import { PaperTile } from "@/components/editorial/PaperTile";
import { progLabel, sectionStyle } from "./_shared";

interface Props {
  sessionId: string | null;
  isReady: boolean;
}

export function DevaluationTile({ sessionId, isReady }: Props) {
  const [events, setEvents] = useState<DevaluationEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const e = await listDevaluations(sessionId ?? undefined);
      setEvents(e);
    } finally { setLoading(false); }
  }, [sessionId]);

  useEffect(() => { if (isReady) load(); }, [isReady, load]);

  return (
    <section style={sectionStyle}>
      <PaperTile
        motif="alarm"
        eyebrow="Devaluation watch"
        title={<>Dispatches from the <span style={{ fontStyle: "italic" }}>devaluation desk</span>.</>}
      >
        <p
          className="serif"
          style={{ marginTop: -4, marginBottom: 16, fontSize: 14, fontStyle: "italic", color: "var(--ink-2)", lineHeight: 1.5 }}
        >
          Every announced and rumoured program change in the past 12 months. Items that touch balances in your wallet are flagged.
        </p>

        {loading ? (
          <div className="serif" style={{ fontStyle: "italic", color: "var(--ink-3)" }}>Loading the desk…</div>
        ) : events.length === 0 ? (
          <div className="serif" style={{ fontStyle: "italic", color: "var(--ink-3)" }}>No active alerts. The desk is quiet.</div>
        ) : (
          <div style={{ borderTop: "1px solid var(--rule)" }}>
            {events.map(e => {
              const urgent = e.user_holds_balance && e.days_until >= 0 && e.days_until <= 60;
              const dayCopy = e.days_until >= 0 ? `in ${e.days_until} days` : `${-e.days_until} days ago`;
              return (
                <div
                  key={e.id}
                  style={{
                    padding: "16px 4px",
                    borderBottom: "1px solid var(--rule)",
                    borderLeft: urgent ? "2px solid var(--accent)" : "2px solid transparent",
                    paddingLeft: urgent ? 14 : 4,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                    <span
                      className="mono"
                      style={{
                        fontSize: 10,
                        padding: "3px 8px",
                        border: "1px solid var(--rule-strong)",
                        color: e.severity === "major" ? "var(--accent)" : "var(--ink-2)",
                        letterSpacing: "0.10em",
                        textTransform: "uppercase",
                        fontWeight: 600,
                      }}
                    >
                      {e.severity}
                    </span>
                    <span className="eyebrow">{progLabel(e.program_slug)}</span>
                    {e.user_holds_balance && (
                      <span className="eyebrow" style={{ color: "var(--accent)" }}>★ Your wallet</span>
                    )}
                    <span
                      className="mono"
                      style={{ marginLeft: "auto", fontSize: 11, color: urgent ? "var(--accent)" : "var(--ink-3)" }}
                    >
                      {dayCopy}
                    </span>
                  </div>
                  <h3 className="display" style={{ fontSize: 20, margin: 0, lineHeight: 1.15 }}>{e.title}</h3>
                  {e.description && (
                    <p className="serif" style={{ fontSize: 14, color: "var(--ink-2)", marginTop: 6, lineHeight: 1.45 }}>
                      {e.description}
                    </p>
                  )}
                  {e.source_url && (
                    <a href={e.source_url} target="_blank" rel="noreferrer" className="mono" style={{ fontSize: 11, color: "var(--accent)", letterSpacing: "0.06em", textTransform: "uppercase", textDecoration: "underline" }}>
                      Source →
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </PaperTile>
    </section>
  );
}
