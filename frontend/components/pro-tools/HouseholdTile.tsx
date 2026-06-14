"use client";

import { useEffect, useMemo, useState } from "react";
import { Users } from "lucide-react";
import { getHouseholdReport, getWallet, listCards } from "@/lib/api";
import type { Card, HouseholdReport, UserCard } from "@/lib/types";
import { PaperTile } from "@/components/editorial/PaperTile";
import { EmptyState } from "@/components/editorial/EmptyState";
import { ExportButton, FieldLabel, Stat, ctaStyle, fmtCAD, fmtCAD2, sectionStyle } from "./_shared";

interface Props {
  sessionId: string | null;
  isReady: boolean;
}

const MAX_PARTNER_CARDS = 12;

// Owner badge: "you" in accent, "partner" in a warm secondary tone, so the user
// can tell at a glance whose card wins a category or should be cut.
function OwnerBadge({ owner }: { owner: "you" | "partner" }) {
  const isYou = owner === "you";
  const tone = isYou ? "var(--accent)" : "#b8860b";
  return (
    <span
      className="mono"
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 9px",
        border: `1px solid ${tone}`,
        color: tone,
        fontSize: 9.5,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        fontWeight: 600,
        borderRadius: 999,
      }}
    >
      {isYou ? "You" : "Partner"}
    </span>
  );
}

export function HouseholdTile({ sessionId, isReady }: Props) {
  const [catalog, setCatalog] = useState<Card[]>([]);
  const [held, setHeld] = useState<UserCard[]>([]);
  const [partnerIds, setPartnerIds] = useState<string[]>([]);
  const [report, setReport] = useState<HouseholdReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!isReady || !sessionId) return;
    Promise.all([listCards(), getWallet(sessionId)])
      .then(([cards, wallet]) => {
        setCatalog(cards);
        setHeld(wallet);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load cards"));
  }, [sessionId, isReady]);

  const heldIds = useMemo(() => new Set(held.map((uc) => uc.card_id)), [held]);
  // Partner-card options: the catalog minus the cards the user already holds
  // (those are automatically "you"; a partner picking the same card is a no-op).
  const partnerOptions = useMemo(
    () => catalog.filter((c) => !heldIds.has(c.id)).sort((a, b) => a.name.localeCompare(b.name)),
    [catalog, heldIds],
  );

  function togglePartner(id: string) {
    setPartnerIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_PARTNER_CARDS) return prev; // respect the server bound
      return [...prev, id];
    });
  }

  async function run() {
    if (!sessionId) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await getHouseholdReport(sessionId, partnerIds);
      setReport(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not build household report");
    } finally {
      setLoading(false);
    }
  }

  const canRun = Boolean(sessionId) && !loading;

  return (
    <section style={sectionStyle}>
      <PaperTile
        motif="stack"
        eyebrow="Household optimizer"
        title={<>One wallet for <span style={{ fontStyle: "italic" }}>two</span>.</>}
        accent
      >
        <p
          className="serif"
          style={{ marginTop: -4, marginBottom: 16, fontSize: 14, fontStyle: "italic", color: "var(--ink-2)", lineHeight: 1.5 }}
        >
          Add a partner&apos;s cards alongside yours and Maple shows who should tap which card in every category — and which fee-carrying cards your household could cut without losing a dollar of value.
        </p>

        {held.length === 0 && !err ? (
          <EmptyState
            icon={Users}
            title="Add your cards to optimize the household"
            body="Add the cards you carry and log some spend — then pick a partner's cards to see who should use which card and what you could cancel."
            action={{ label: "Add cards", href: "/wallet" }}
          />
        ) : (
          <>
            <FieldLabel>Partner&apos;s cards</FieldLabel>
            <div
              className="protool-partner-picker"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 8,
                maxHeight: 188,
                overflowY: "auto",
                padding: 10,
                border: "1px solid var(--rule)",
                borderRadius: 10,
                background: "var(--card-fill)",
              }}
            >
              {partnerOptions.map((c) => {
                const checked = partnerIds.includes(c.id);
                const atCap = !checked && partnerIds.length >= MAX_PARTNER_CARDS;
                return (
                  <label
                    key={c.id}
                    className="mono"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 12.5,
                      color: atCap ? "var(--ink-3)" : "var(--ink-2)",
                      cursor: atCap ? "not-allowed" : "pointer",
                      lineHeight: 1.35,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={atCap}
                      onChange={() => togglePartner(c.id)}
                      style={{ accentColor: "var(--accent)", flexShrink: 0 }}
                    />
                    <span>{c.name}</span>
                  </label>
                );
              })}
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
              <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                {partnerIds.length} of {MAX_PARTNER_CARDS} partner cards selected
              </span>
              <button onClick={run} disabled={!canRun} style={{ ...ctaStyle, opacity: canRun ? 1 : 0.6 }}>
                {loading ? "Analyzing…" : "Optimize household →"}
              </button>
            </div>

            {err && <p className="serif" style={{ fontStyle: "italic", color: "var(--loss)", fontSize: 14, marginTop: 14 }}>{err}</p>}

            {report && (
              <div style={{ marginTop: 18, borderTop: "1px solid var(--rule)", paddingTop: 18 }}>
                <div
                  className="protool-stat-row"
                  style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", border: "1px solid var(--rule)", borderRadius: 10, overflow: "hidden", background: "var(--card-fill)", marginBottom: 14 }}
                >
                  <Stat label="Your cards" value={String(report.you_card_count)} />
                  <Stat label="Partner cards" value={String(report.partner_card_count)} />
                  <Stat label="Categories covered" value={String(report.category_coverage.length)} last />
                </div>

                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
                  <span className="eyebrow">Fee you could cut</span>
                  <div className="display" style={{ fontSize: 34, lineHeight: 1, color: report.total_fee_savings_opportunity_cad > 0.005 ? "var(--gain)" : "var(--ink-2)" }}>
                    {fmtCAD(report.total_fee_savings_opportunity_cad)}
                    <span className="mono" style={{ fontSize: 12, color: "var(--ink-3)", marginLeft: 8 }}>/ yr</span>
                  </div>
                </div>

                {report.category_coverage.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div className="eyebrow" style={{ marginBottom: 4 }}>Who taps what</div>
                    {report.category_coverage.map((cov) => (
                      <div key={cov.category_name} style={{ padding: "10px 0", borderBottom: "1px solid var(--rule)" }}>
                        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                          <div className="display" style={{ fontSize: 15, color: "var(--ink)" }}>{cov.category_name}</div>
                          <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: "var(--gain)" }}>
                            {fmtCAD2(cov.effective_value)}/yr
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                          <OwnerBadge owner={cov.owner} />
                          <span className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>{cov.best_card_name}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {report.cancel_candidates.length > 0 && (
                  <div style={{ marginTop: 18 }}>
                    <div className="eyebrow" style={{ marginBottom: 4 }}>Redundant — consider cutting</div>
                    {report.cancel_candidates.map((cc) => (
                      <div key={cc.card_id} style={{ padding: "10px 0", borderBottom: "1px solid var(--rule)" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <OwnerBadge owner={cc.owner} />
                            <span className="display" style={{ fontSize: 15, color: "var(--ink)" }}>{cc.card_name}</span>
                          </div>
                          <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: "var(--loss)" }}>
                            save {fmtCAD(cc.annual_fee)}/yr
                          </span>
                        </div>
                        <p className="serif" style={{ fontSize: 12.5, fontStyle: "italic", color: "var(--ink-3)", margin: "4px 0 0", lineHeight: 1.45 }}>
                          {cc.reason}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {report.category_coverage.length === 0 && report.cancel_candidates.length === 0 && (
                  <p className="serif" style={{ fontStyle: "italic", color: "var(--ink-2)", fontSize: 14, marginTop: 12 }}>
                    Log some spend so Maple has categories to optimize across your household.
                  </p>
                )}

                <p className="serif" style={{ fontSize: 12, fontStyle: "italic", color: "var(--ink-3)", margin: "14px 0 0", lineHeight: 1.5 }}>
                  {report.note}
                </p>

                <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
                  <ExportButton
                    sessionId={sessionId}
                    report="household"
                    params={{ partner: partnerIds }}
                    label="Export household"
                  />
                </div>
              </div>
            )}
          </>
        )}
      </PaperTile>
    </section>
  );
}
