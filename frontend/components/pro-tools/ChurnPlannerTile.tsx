"use client";

import { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";
import { getChurnPlan } from "@/lib/api";
import type { ChurnPlan, ChurnCandidate } from "@/lib/types";
import { PaperTile } from "@/components/editorial/PaperTile";
import { EmptyState } from "@/components/editorial/EmptyState";
import { ExportButton, Stat, fmtCAD, sectionStyle } from "./_shared";

interface Props {
  sessionId: string | null;
  isReady: boolean;
}

function RecRow({ c, rank }: { c: ChurnCandidate; rank: number }) {
  return (
    <div style={{ padding: "12px 0", borderBottom: "1px solid var(--rule)" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div className="display" style={{ fontSize: 16, color: "var(--ink)" }}>
          <span className="mono" style={{ fontSize: 12, color: "var(--ink-3)", marginRight: 8 }}>#{rank}</span>
          {c.card_name}
        </div>
        <span
          className="mono"
          style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--gain)" }}
        >
          {fmtCAD(c.net_first_year_value_cad)} net
        </span>
      </div>
      <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
        {c.issuer} · {c.program_name} · {c.welcome_bonus_points.toLocaleString("en-CA")} pts → {fmtCAD(c.welcome_bonus_value_cad)} bonus · {fmtCAD(c.annual_fee)} fee
      </div>
      <div className="mono" style={{ fontSize: 12, color: c.min_spend_feasible ? "var(--ink-2)" : "#b8860b", marginTop: 4 }}>
        {c.min_spend > 0 ? (
          <>
            {fmtCAD(c.min_spend)} in {c.min_spend_months} mo · {fmtCAD(c.monthly_spend_needed_cad)}/mo needed ·{" "}
            {c.min_spend_feasible ? "within your spend" : "above your typical spend"}
          </>
        ) : (
          <>No minimum spend</>
        )}
      </div>
    </div>
  );
}

function BlockedRow({ c }: { c: ChurnCandidate }) {
  return (
    <div style={{ padding: "12px 0", borderBottom: "1px solid var(--rule)" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div className="display" style={{ fontSize: 15, color: "var(--ink)" }}>{c.card_name}</div>
        <span
          className="mono"
          style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--loss)" }}
        >
          {c.earliest_eligible_date ? `Blocked until ${c.earliest_eligible_date}` : "Blocked"}
        </span>
      </div>
      <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
        {c.issuer} · {fmtCAD(c.welcome_bonus_value_cad)} bonus · {fmtCAD(c.net_first_year_value_cad)} net first year
      </div>
      {c.block_reason && (
        <p className="serif" style={{ fontSize: 13.5, color: "var(--ink-2)", margin: "6px 0 0", lineHeight: 1.5 }}>
          {c.block_reason}
        </p>
      )}
    </div>
  );
}

export function ChurnPlannerTile({ sessionId, isReady }: Props) {
  const [plan, setPlan] = useState<ChurnPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!isReady || !sessionId) return;
    setLoading(true);
    getChurnPlan(sessionId)
      .then(setPlan)
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load churn plan"))
      .finally(() => setLoading(false));
  }, [sessionId, isReady]);

  const hasResults = plan && (plan.recommendations.length > 0 || plan.blocked.length > 0);

  return (
    <section style={sectionStyle}>
      <PaperTile
        motif="stack"
        eyebrow="Welcome-bonus / churn planner"
        title={<>Your next <span style={{ fontStyle: "italic" }}>best</span> card.</>}
        accent
      >
        <p
          className="serif"
          style={{ marginTop: -4, marginBottom: 16, fontSize: 14, fontStyle: "italic", color: "var(--ink-2)", lineHeight: 1.5 }}
        >
          Maple ranks every card you don&apos;t hold by welcome-bonus value, nets out the annual fee, checks the issuer&apos;s cooldown rules, and flags whether your spending can actually clear the minimum.
        </p>

        {loading && <p className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>Scanning the catalog…</p>}
        {err && <p className="serif" style={{ fontStyle: "italic", color: "var(--loss)", fontSize: 14 }}>{err}</p>}

        {!loading && !err && plan && !hasResults && (
          <EmptyState
            icon={TrendingUp}
            title="No cards to recommend yet"
            body="Add the cards you already hold and log some spend — then Maple can find the highest-value bonus you're eligible for next."
            action={{ label: "Add cards", href: "/wallet" }}
          />
        )}

        {!loading && !err && plan && hasResults && (
          <>
            <div
              className="protool-stat-row"
              style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", border: "1px solid var(--rule)", borderRadius: 10, overflow: "hidden", background: "var(--card-fill)", marginBottom: 16 }}
            >
              <Stat label="Best next card" value={plan.best_next_card || "—"} />
              <Stat label="Bankable bonuses" value={fmtCAD(plan.total_potential_bonus_value_cad)} last />
            </div>

            {plan.recommendations.length > 0 && (
              <>
                <div className="eyebrow" style={{ marginBottom: 4 }}>Apply next</div>
                {plan.recommendations.map((c, i) => (
                  <RecRow key={c.card_id} c={c} rank={i + 1} />
                ))}
              </>
            )}

            {plan.blocked.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <div className="eyebrow" style={{ marginBottom: 4 }}>Worth waiting for · cooldown</div>
                {plan.blocked.map((c) => (
                  <BlockedRow key={c.card_id} c={c} />
                ))}
              </div>
            )}

            <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
              <ExportButton sessionId={sessionId} report="churn" label="Export plan" />
            </div>
          </>
        )}
      </PaperTile>
    </section>
  );
}
