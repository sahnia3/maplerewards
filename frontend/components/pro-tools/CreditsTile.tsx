"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { getCardCredits, recordCreditRedemption } from "@/lib/api";
import type { CardCreditStatus } from "@/lib/types";
import { PaperTile } from "@/components/editorial/PaperTile";
import { EmptyState } from "@/components/editorial/EmptyState";
import { fmtCAD, sectionStyle } from "./_shared";

interface Props {
  sessionId: string | null;
  isReady: boolean;
}

export function CreditsTile({ sessionId, isReady }: Props) {
  const [credits, setCredits] = useState<CardCreditStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!isReady || !sessionId) return;
    setLoading(true);
    setErr(null);
    getCardCredits(sessionId)
      .then(setCredits)
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load credits"))
      .finally(() => setLoading(false));
  }, [sessionId, isReady]);

  useEffect(() => { load(); }, [load]);

  async function markRedeemed(c: CardCreditStatus) {
    if (!sessionId) return;
    try {
      await recordCreditRedemption(sessionId, c.credit_def_id, { redeemed_amount: c.value_cad });
      load();
    } catch {
      /* swallow */
    }
  }

  const totalUnused = credits.reduce((s, c) => s + (c.status === "unused" ? c.value_cad : c.remaining), 0);
  const upcoming = credits.filter((c) => c.days_to_renewal != null && c.days_to_renewal <= 60);

  return (
    <section style={sectionStyle}>
      <PaperTile
        motif="alarm"
        eyebrow="Credits & renewals"
        title={<>The loss-prevention calendar.</>}
      >
        <p
          className="serif"
          style={{ marginTop: -4, marginBottom: 16, fontSize: 14, fontStyle: "italic", color: "var(--ink-2)", lineHeight: 1.5 }}
        >
          Annual credits expire quietly. Renewals drop without warning. Maple lists every credit window and fee date, with one tap to mark redeemed.
        </p>

        {loading && <p className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>Loading credit calendar…</p>}
        {err && <p className="serif" style={{ fontStyle: "italic", color: "var(--loss)", fontSize: 14 }}>{err}</p>}
        {!loading && !err && credits.length === 0 && (
          <EmptyState
            icon={CalendarClock}
            title="No tracked credits"
            body="Add cards with annual credits so we can track redemption windows for you."
            action={{ label: "Add cards", href: "/wallet" }}
          />
        )}

        {!loading && !err && credits.length > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
              <div>
                <span className="eyebrow">Unused credit value</span>
                <div className="display" style={{ fontSize: 36, color: "var(--gain)", lineHeight: 1, marginTop: 4 }}>
                  {fmtCAD(totalUnused)}
                </div>
              </div>
              {upcoming.length > 0 && (
                <div className="mono" style={{ fontSize: 12, color: "var(--accent)", letterSpacing: "0.04em" }}>
                  {upcoming.length} renewal{upcoming.length === 1 ? "" : "s"} in next 60 days
                </div>
              )}
            </div>

            <div style={{ borderTop: "1px solid var(--rule)" }}>
              {credits.map((c) => {
                const tone = c.status === "redeemed" ? "var(--ink-3)" : c.status === "partial" ? "var(--accent)" : "var(--gain)";
                return (
                  <div
                    key={c.credit_def_id + ":" + c.anniversary_year}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto auto",
                      gap: 16,
                      padding: "12px 4px",
                      borderBottom: "1px solid var(--rule)",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div className="display" style={{ fontSize: 15, color: "var(--ink)" }}>{c.name}</div>
                      <div className="serif" style={{ fontSize: 12, fontStyle: "italic", color: "var(--ink-3)", marginTop: 2 }}>
                        {c.card_name}
                        {c.fee_renewal_date && c.days_to_renewal != null && (
                          <> · renews in {c.days_to_renewal}d</>
                        )}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="mono" style={{ fontSize: 13, color: tone, fontWeight: 600 }}>
                        {c.status === "redeemed" ? "✓" : ""} {fmtCAD(c.remaining)} of {fmtCAD(c.value_cad)}
                      </div>
                      <div className="mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 2 }}>
                        {c.status}
                      </div>
                    </div>
                    <button
                      onClick={() => markRedeemed(c)}
                      disabled={c.status === "redeemed"}
                      className="mono"
                      style={{
                        padding: "6px 10px",
                        fontSize: 10,
                        letterSpacing: "0.10em",
                        textTransform: "uppercase",
                        background: c.status === "redeemed" ? "transparent" : "var(--accent)",
                        color: c.status === "redeemed" ? "var(--ink-3)" : "#fff",
                        border: c.status === "redeemed" ? "1px solid var(--rule)" : "none",
                        borderRadius: 6,
                        cursor: c.status === "redeemed" ? "default" : "pointer",
                        opacity: c.status === "redeemed" ? 0.6 : 1,
                      }}
                    >
                      {c.status === "redeemed" ? "Done" : "Mark used"}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </PaperTile>
    </section>
  );
}
