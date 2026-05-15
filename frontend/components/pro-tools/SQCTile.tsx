"use client";

import { useEffect, useState } from "react";
import { Plane } from "lucide-react";
import { getSQCProjection } from "@/lib/api";
import type { SQCProjection } from "@/lib/types";
import { PaperTile } from "@/components/editorial/PaperTile";
import { EmptyState } from "@/components/editorial/EmptyState";
import { Stat, fmtCAD, sectionStyle } from "./_shared";

interface Props {
  sessionId: string | null;
  isReady: boolean;
}

export function SQCTile({ sessionId, isReady }: Props) {
  const [proj, setProj] = useState<SQCProjection | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!isReady || !sessionId) return;
    setLoading(true);
    getSQCProjection(sessionId)
      .then(setProj)
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load SQC projection"))
      .finally(() => setLoading(false));
  }, [sessionId, isReady]);

  const tierProgress = proj && proj.tiers.length > 0
    ? Math.min(100, (proj.total_sqc_earned / proj.tiers[proj.tiers.length - 1].sqc_required) * 100)
    : 0;

  return (
    <section style={sectionStyle}>
      <PaperTile
        motif="gauge"
        eyebrow="2026 Aeroplan SQC"
        title={<>Status qualifying credits, <span style={{ fontStyle: "italic" }}>projected</span>.</>}
        accent
      >
        <p
          className="serif"
          style={{ marginTop: -4, marginBottom: 16, fontSize: 14, fontStyle: "italic", color: "var(--ink-2)", lineHeight: 1.5 }}
        >
          The 2026 SQC framework collapsed three legacy metrics into one. Maple projects your year-end tier from current spend rate.
        </p>

        {loading && <p className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>Projecting…</p>}
        {err && <p className="serif" style={{ fontStyle: "italic", color: "var(--loss)", fontSize: 14 }}>{err}</p>}

        {!loading && !err && proj && proj.wallet_has_no_aeroplan_cards && (
          <EmptyState
            icon={Plane}
            title="No Aeroplan-earning cards yet"
            body="Add an Aeroplan cobranded card to project your SQC tier for the year."
            action={{ label: "Add cards", href: "/wallet" }}
          />
        )}

        {!loading && !err && proj && !proj.wallet_has_no_aeroplan_cards && (
          <>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
              <div>
                <span className="eyebrow">{proj.year} year-to-date</span>
                <div className="display" style={{ fontSize: 36, color: "var(--accent)", lineHeight: 1, marginTop: 4 }}>
                  {proj.total_sqc_earned.toLocaleString("en-CA")} SQC
                </div>
              </div>
              {proj.current_tier && (
                <div className="mono" style={{ fontSize: 13, color: "var(--ink-2)", letterSpacing: "0.04em" }}>
                  Current tier: <strong style={{ color: "var(--ink)" }}>{proj.current_tier}</strong>
                </div>
              )}
            </div>

            <div style={{ height: 6, background: "var(--rule)", borderRadius: 999, overflow: "hidden", marginBottom: 14 }}>
              <div style={{ width: `${tierProgress}%`, height: "100%", background: "var(--accent)", transition: "width 280ms" }} />
            </div>

            {proj.next_tier && proj.sqc_to_next_tier != null && (
              <div className="protool-stat-row" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", border: "1px solid var(--rule)", borderRadius: 10, overflow: "hidden", background: "var(--card-fill)" }}>
                <Stat label="Next tier" value={proj.next_tier} />
                <Stat label="SQC to go" value={proj.sqc_to_next_tier.toLocaleString("en-CA")} />
                <Stat label="Spend to go" value={proj.spend_to_next_tier != null ? fmtCAD(proj.spend_to_next_tier) : "—"} last />
              </div>
            )}

            {proj.best_card_for_gap && (
              <p className="serif" style={{ marginTop: 14, fontSize: 14, color: "var(--ink-2)" }}>
                Best card to close the gap: <strong style={{ color: "var(--ink)" }}>{proj.best_card_for_gap}</strong>
              </p>
            )}

            {proj.cards.length > 0 && (
              <div style={{ marginTop: 18, borderTop: "1px solid var(--rule)", paddingTop: 14 }}>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Card contributions</div>
                {proj.cards.map((c) => (
                  <div key={c.card_id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 16, padding: "10px 0", borderBottom: "1px solid var(--rule)", alignItems: "baseline" }}>
                    <div className="display" style={{ fontSize: 15, color: "var(--ink)" }}>{c.card_name}</div>
                    <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>{fmtCAD(c.ytd_spend)} spend</div>
                    <div className="mono" style={{ fontSize: 13, color: "var(--accent)", fontWeight: 600 }}>{c.sqc_earned.toLocaleString("en-CA")} SQC</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </PaperTile>
    </section>
  );
}
