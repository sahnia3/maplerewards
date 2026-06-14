"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { getRenewalReport } from "@/lib/api";
import type { RenewalReport } from "@/lib/types";
import { PaperTile } from "@/components/editorial/PaperTile";
import { EmptyState } from "@/components/editorial/EmptyState";
import { Stat, fmtCAD, sectionStyle } from "./_shared";

interface Props {
  sessionId: string | null;
  isReady: boolean;
}

const VERDICT_META: Record<string, { label: string; color: string }> = {
  keep: { label: "Keep", color: "var(--gain)" },
  keep_no_fee: { label: "Keep · no fee", color: "var(--ink-2)" },
  use_credits: { label: "Use credits", color: "#b8860b" },
  downgrade_or_cancel: { label: "Downgrade / cancel", color: "var(--loss)" },
  insufficient_history: { label: "Not enough history yet", color: "var(--ink-3)" },
};

export function RenewalTile({ sessionId, isReady }: Props) {
  const [report, setReport] = useState<RenewalReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!isReady || !sessionId) return;
    setLoading(true);
    getRenewalReport(sessionId)
      .then(setReport)
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load renewal report"))
      .finally(() => setLoading(false));
  }, [sessionId, isReady]);

  return (
    <section style={sectionStyle}>
      <PaperTile
        motif="alarm"
        eyebrow="Renewal optimizer"
        title={<>Keep it, or <span style={{ fontStyle: "italic" }}>cut it</span>?</>}
        accent
      >
        <p
          className="serif"
          style={{ marginTop: -4, marginBottom: 16, fontSize: 14, fontStyle: "italic", color: "var(--ink-2)", lineHeight: 1.5 }}
        >
          For every card you hold, Maple weighs your real reward value and statement credits against the annual fee — so you renew what pays for itself and drop what doesn&apos;t.
        </p>

        {loading && <p className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>Crunching your wallet…</p>}
        {err && <p className="serif" style={{ fontStyle: "italic", color: "var(--loss)", fontSize: 14 }}>{err}</p>}

        {!loading && !err && report && report.assessments.length === 0 && (
          <EmptyState
            icon={RefreshCw}
            title="No cards to assess yet"
            body="Add the cards you carry and log some spend — then Maple can tell you what's worth renewing."
            action={{ label: "Add cards", href: "/wallet" }}
          />
        )}

        {!loading && !err && report && report.assessments.length > 0 && (
          <>
            <div
              className="protool-stat-row"
              style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", border: "1px solid var(--rule)", borderRadius: 10, overflow: "hidden", background: "var(--card-fill)", marginBottom: 16 }}
            >
              <Stat label="Annual fees" value={fmtCAD(report.total_annual_fees)} />
              <Stat label="Net value" value={fmtCAD(report.total_net_value)} />
              <Stat label="Recoverable" value={fmtCAD(report.potential_savings)} last />
            </div>

            {report.assessments.map((a) => {
              const meta = VERDICT_META[a.verdict] ?? { label: a.verdict, color: "var(--ink-2)" };
              return (
                <div key={a.card_id} style={{ padding: "12px 0", borderBottom: "1px solid var(--rule)" }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div className="display" style={{ fontSize: 16, color: "var(--ink)" }}>{a.card_name}</div>
                    <span
                      className="mono"
                      style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: meta.color }}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
                    {fmtCAD(a.spend_value)} rewards · {fmtCAD(a.credits_value)} credits · {fmtCAD(a.annual_fee)} fee
                    {a.days_to_renewal != null && <> · renews in {a.days_to_renewal}d</>}
                  </div>
                  <p className="serif" style={{ fontSize: 13.5, color: "var(--ink-2)", margin: "6px 0 0", lineHeight: 1.5 }}>
                    {a.rationale}
                  </p>
                  {a.downgrade_options && a.downgrade_options.length > 0 && (
                    <div className="mono" style={{ marginTop: 6, fontSize: 12.5, color: "var(--ink-2)" }}>
                      ↓ {a.downgrade_options.map((d) => `${d.card_name} ($${d.annual_fee.toFixed(0)} fee, save $${d.fee_saved.toFixed(0)})`).join("  ·  ")}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </PaperTile>
    </section>
  );
}
