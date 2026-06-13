"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditCard } from "lucide-react";
import { getMissedRewards } from "@/lib/api";
import type { MissedRewardsReport } from "@/lib/types";
import { PaperTile } from "@/components/editorial/PaperTile";
import { EmptyState } from "@/components/editorial/EmptyState";
import { ExportButton, Stat, fmtCAD, fmtCAD2, sectionStyle } from "./_shared";

interface Props {
  sessionId: string | null;
  isReady: boolean;
}

export function MissedRewardsTile({ sessionId, isReady }: Props) {
  const [report, setReport] = useState<MissedRewardsReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sinceDays, setSinceDays] = useState(30);

  const load = useCallback(() => {
    if (!isReady || !sessionId) return;
    setLoading(true);
    setErr(null);
    getMissedRewards(sessionId, { sinceDays, top: 5 })
      .then(setReport)
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load report"))
      .finally(() => setLoading(false));
  }, [sessionId, isReady, sinceDays]);

  useEffect(() => { load(); }, [load]);

  return (
    <section style={sectionStyle}>
      <PaperTile
        motif="alarm"
        eyebrow="Missed-rewards forensics"
        title={<>What you left on the table.</>}
      >
        <p
          className="serif"
          style={{ marginTop: -4, marginBottom: 16, fontSize: 14, fontStyle: "italic", color: "var(--ink-2)", lineHeight: 1.5 }}
        >
          Maple re-ranks every spend against your current wallet. The gap is the
          dollars an optimal card would have earned.
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          {[7, 30, 90, 365].map((d) => (
            <button
              key={d}
              onClick={() => setSinceDays(d)}
              className="mono"
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                fontSize: 11,
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                background: sinceDays === d ? "var(--accent-soft)" : "transparent",
                color: sinceDays === d ? "var(--accent)" : "var(--ink-3)",
                border: `1px solid ${sinceDays === d ? "var(--accent)" : "var(--rule)"}`,
                cursor: "pointer",
              }}
            >
              {d === 365 ? "1 yr" : `${d} d`}
            </button>
          ))}
        </div>

        {loading && <p className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>Re-ranking your spend…</p>}
        {err && <p className="serif" style={{ fontStyle: "italic", color: "var(--loss)", fontSize: 14 }}>{err}</p>}

        {!loading && !err && report && report.entry_count === 0 && (
          <EmptyState
            icon={CreditCard}
            title="No spend in this window"
            body={`Log transactions to see what you missed in the last ${sinceDays} days.`}
            action={{ label: "Add cards", href: "/wallet" }}
          />
        )}

        {!loading && !err && report && report.entry_count > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
              <div>
                <span className="eyebrow">Lost in last {sinceDays} days</span>
                <div className="display" style={{ fontSize: 40, color: report.total_gap > 0 ? "var(--loss)" : "var(--gain)", lineHeight: 1, marginTop: 4 }}>
                  {fmtCAD2(report.total_gap)}
                </div>
              </div>
              <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)", letterSpacing: "0.04em" }}>
                {report.missed_count} of {report.entry_count} purchases sub-optimal
              </div>
            </div>

            <div className="protool-stat-row" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", border: "1px solid var(--rule)", borderRadius: 10, overflow: "hidden", background: "var(--card-fill)" }}>
              <Stat label="Total spend" value={fmtCAD(report.total_spend)} />
              <Stat label="Earned" value={fmtCAD(report.total_actual_value)} />
              <Stat label="Optimal" value={fmtCAD(report.total_optimal_value)} last />
            </div>

            <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
              <ExportButton
                sessionId={sessionId}
                report="missed-rewards"
                params={{ since_days: String(sinceDays) }}
                label="Export forensics"
              />
            </div>

            {report.by_category && report.by_category.filter((c) => c.gap > 0.5).length > 0 && (
              <div style={{ marginTop: 18, borderTop: "1px solid var(--rule)", paddingTop: 14 }}>
                <div className="eyebrow" style={{ marginBottom: 10 }}>Categories where you missed value</div>
                {report.by_category
                  .filter((c) => c.gap > 0.5)
                  .slice(0, 6)
                  .map((c, i) => (
                    <div
                      key={i}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr auto",
                        gap: 16,
                        padding: "10px 0",
                        borderBottom: "1px solid var(--rule)",
                        alignItems: "baseline",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div className="display" style={{ fontSize: 15, color: "var(--ink)" }}>
                          {c.category_name}
                        </div>
                        <div
                          className="serif"
                          style={{ fontSize: 12, fontStyle: "italic", color: "var(--ink-3)", marginTop: 2 }}
                        >
                          {c.entry_count} purchase{c.entry_count === 1 ? "" : "s"}, {fmtCAD(c.total_spend)} spend. Best card here is <strong style={{ color: "var(--ink)", fontStyle: "normal" }}>{c.optimal_card_name}</strong>.
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div className="mono" style={{ fontSize: 14, color: "var(--loss)", fontWeight: 600 }}>
                          −{fmtCAD2(c.gap)}
                        </div>
                        <div className="mono" style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 2 }}>
                          earned {fmtCAD(c.actual_value)} of {fmtCAD(c.optimal_value)}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {report.top_missed && report.top_missed.length > 0 && (
              <div style={{ marginTop: 18, borderTop: "1px solid var(--rule)", paddingTop: 14 }}>
                <div className="eyebrow" style={{ marginBottom: 10 }}>
                  Top transactions to re-route next time
                </div>
                {report.top_missed.map((m, i) => {
                  const merchant = m.description || m.category_name;
                  const date = new Date(m.spent_at + "T12:00:00");
                  const dateLabel = isNaN(date.getTime())
                    ? m.spent_at
                    : date.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
                  return (
                    <div
                      key={i}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr auto",
                        gap: 16,
                        padding: "12px 0",
                        borderBottom: "1px solid var(--rule)",
                        alignItems: "flex-start",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "baseline",
                            gap: 10,
                            flexWrap: "wrap",
                            marginBottom: 4,
                          }}
                        >
                          <span
                            className="mono"
                            style={{
                              fontSize: 10,
                              color: "var(--ink-3)",
                              letterSpacing: "0.06em",
                              textTransform: "uppercase",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {dateLabel}
                          </span>
                          <span
                            className="display"
                            style={{
                              fontSize: 14,
                              color: "var(--ink)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {merchant}
                          </span>
                          <span
                            className="mono"
                            style={{
                              fontSize: 9,
                              padding: "2px 7px",
                              borderRadius: 999,
                              border: "1px solid var(--rule-strong)",
                              color: "var(--ink-3)",
                              letterSpacing: "0.06em",
                              textTransform: "uppercase",
                            }}
                          >
                            {m.category_name}
                          </span>
                        </div>
                        <div
                          className="serif"
                          style={{
                            fontSize: 13,
                            color: "var(--ink-2)",
                            lineHeight: 1.45,
                          }}
                        >
                          {fmtCAD(m.amount)} on{" "}
                          <strong style={{ color: "var(--ink)" }}>{m.actual_card_name}</strong>{" "}
                          earned {fmtCAD(m.actual_value)}. Using{" "}
                          <strong style={{ color: "var(--accent)" }}>{m.optimal_card_name}</strong>{" "}
                          would have earned {fmtCAD(m.optimal_value)}.
                        </div>
                      </div>
                      <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <div className="mono" style={{ fontSize: 14, color: "var(--loss)", fontWeight: 600 }}>
                          −{fmtCAD2(m.gap)}
                        </div>
                        <div className="mono" style={{ fontSize: 9, color: "var(--ink-3)", marginTop: 2, letterSpacing: "0.06em" }}>
                          missed
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {report.entry_count > 0 && report.missed_count === 0 && (
              <p
                className="serif"
                style={{
                  marginTop: 18,
                  fontSize: 14,
                  fontStyle: "italic",
                  color: "var(--gain)",
                  borderLeft: "2px solid var(--gain)",
                  paddingLeft: 10,
                }}
              >
                Every transaction was already on its optimal card.
              </p>
            )}

            <p className="mono" style={{ fontSize: 10, marginTop: 14, color: "var(--ink-3)", letterSpacing: "0.06em" }}>
              Snapshot: {report.wallet_snapshot}. Re-rank uses your current wallet against historical spend. Re-importing the same statement is safe; duplicates are skipped.
            </p>
          </>
        )}
      </PaperTile>
    </section>
  );
}
