"use client";

import { useEffect, useState } from "react";
import { AlarmClock } from "lucide-react";
import { getExpiryGuardian } from "@/lib/api";
import type { ExpiryReport } from "@/lib/types";
import { PaperTile } from "@/components/editorial/PaperTile";
import { EmptyState } from "@/components/editorial/EmptyState";
import { Stat, fmtCAD, sectionStyle } from "./_shared";

interface Props {
  sessionId: string | null;
  isReady: boolean;
}

const RISK_META: Record<string, { label: string; color: string }> = {
  critical: { label: "Critical", color: "var(--loss)" },
  warning: { label: "Warning", color: "#b8860b" },
  watch: { label: "Watch", color: "var(--accent)" },
  ok: { label: "OK", color: "var(--gain)" },
  none: { label: "Never expires", color: "var(--ink-3)" },
};

export function ExpiryGuardianTile({ sessionId, isReady }: Props) {
  const [report, setReport] = useState<ExpiryReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!isReady || !sessionId) return;
    setLoading(true);
    getExpiryGuardian(sessionId)
      .then(setReport)
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load expiry report"))
      .finally(() => setLoading(false));
  }, [sessionId, isReady]);

  return (
    <section style={sectionStyle}>
      <PaperTile
        motif="alarm"
        eyebrow="Points-expiry guardian"
        title={<>Before your points <span style={{ fontStyle: "italic" }}>vanish</span>.</>}
        accent
      >
        <p
          className="serif"
          style={{ marginTop: -4, marginBottom: 16, fontSize: 14, fontStyle: "italic", color: "var(--ink-2)", lineHeight: 1.5 }}
        >
          Maple watches every loyalty balance you track, flags the ones whose clock is running down, and tells you the cheapest way to reset it.
        </p>

        {loading && <p className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>Checking your balances…</p>}
        {err && <p className="serif" style={{ fontStyle: "italic", color: "var(--loss)", fontSize: 14 }}>{err}</p>}

        {!loading && !err && report && report.accounts.length === 0 && (
          <EmptyState
            icon={AlarmClock}
            title="No loyalty balances tracked yet"
            body="Add the programs you hold without a co-branded card — then Maple can warn you before any points lapse."
            action={{ label: "Add a balance", href: "/pro-tools" }}
          />
        )}

        {!loading && !err && report && report.accounts.length > 0 && (
          <>
            <div
              className="protool-stat-row"
              style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", border: "1px solid var(--rule)", borderRadius: 10, overflow: "hidden", background: "var(--card-fill)", marginBottom: 16 }}
            >
              <Stat label="At risk" value={fmtCAD(report.total_points_at_risk_cad)} />
              <Stat label="Expiring soon" value={String(report.accounts_expiring_soon)} last />
            </div>

            {report.accounts.map((a) => {
              const meta = RISK_META[a.risk] ?? { label: a.risk, color: "var(--ink-2)" };
              return (
                <div key={`${a.program_slug}-${a.account_label ?? ""}`} style={{ padding: "12px 0", borderBottom: "1px solid var(--rule)" }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div className="display" style={{ fontSize: 16, color: "var(--ink)" }}>
                      {a.program_name}
                      {a.account_label && <span className="mono" style={{ fontSize: 12, color: "var(--ink-3)", marginLeft: 8 }}>{a.account_label}</span>}
                    </div>
                    <span
                      className="mono"
                      style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: meta.color }}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
                    {a.balance.toLocaleString("en-CA")} pts · {fmtCAD(a.points_at_risk_cad)} at risk
                    {a.effective_expiry && <> · expires {a.effective_expiry}</>}
                    {a.days_to_expiry != null && <> · {a.days_to_expiry}d left</>}
                  </div>
                  <p className="serif" style={{ fontSize: 13.5, color: "var(--ink-2)", margin: "6px 0 0", lineHeight: 1.5 }}>
                    {a.reset_suggestion}
                  </p>
                </div>
              );
            })}
          </>
        )}
      </PaperTile>
    </section>
  );
}
