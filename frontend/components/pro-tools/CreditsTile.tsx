"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { getCardCredits, recordCreditRedemption, getWallet, createCardCredit } from "@/lib/api";
import type { CardCreditStatus, UserCard } from "@/lib/types";
import { PaperTile } from "@/components/editorial/PaperTile";
import { EmptyState } from "@/components/editorial/EmptyState";
import { Donut } from "@/components/editorial/dataviz";
import { fmtCAD, sectionStyle } from "./_shared";

interface Props {
  sessionId: string | null;
  isReady: boolean;
}

export function CreditsTile({ sessionId, isReady }: Props) {
  const [credits, setCredits] = useState<CardCreditStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // P2.6 self-log: a held-card picker + fields so users can add a credit
  // their card carries that we haven't curated yet.
  const [cards, setCards] = useState<UserCard[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [fCard, setFCard] = useState("");
  const [fName, setFName] = useState("");
  const [fValue, setFValue] = useState("");
  const [fRec, setFRec] = useState("annual");
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  // Surfaced (not swallowed) when "Mark used" fails — this is a money action,
  // so a silent no-op would leave the user thinking a credit was redeemed.
  const [redeemErr, setRedeemErr] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!isReady || !sessionId) return;
    setLoading(true);
    setErr(null);
    Promise.all([
      getCardCredits(sessionId),
      getWallet(sessionId).catch(() => [] as UserCard[]),
    ])
      .then(([cr, held]) => { setCredits(cr); setCards(held); })
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load credits"))
      .finally(() => setLoading(false));
  }, [sessionId, isReady]);

  useEffect(() => { load(); }, [load]);

  async function handleAddCredit() {
    if (!sessionId || !fCard || !fName.trim() || !(Number(fValue) > 0)) {
      setFormErr("Pick a card, a name, and a value > 0.");
      return;
    }
    setSaving(true);
    setFormErr(null);
    try {
      const next = await createCardCredit(sessionId, {
        card_id: fCard,
        name: fName.trim(),
        value_cad: Number(fValue),
        recurrence: fRec,
      });
      setCredits(next);
      setFName(""); setFValue(""); setFCard(""); setFRec("annual");
      setShowForm(false);
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : "Could not add credit");
    } finally {
      setSaving(false);
    }
  }

  async function markRedeemed(c: CardCreditStatus) {
    if (!sessionId) return;
    setRedeemErr(null);
    try {
      await recordCreditRedemption(sessionId, c.credit_def_id, { redeemed_amount: c.value_cad });
      load();
    } catch (e) {
      setRedeemErr(
        e instanceof Error
          ? `Couldn't mark "${c.name}" redeemed: ${e.message}`
          : `Couldn't mark "${c.name}" redeemed. Try again.`,
      );
    }
  }

  const totalUnused = credits.reduce((s, c) => s + (c.status === "unused" ? c.value_cad : c.remaining), 0);
  const totalIssued = credits.reduce((s, c) => s + c.value_cad, 0);
  const unclaimedPct = totalIssued > 0 ? Math.min(100, (totalUnused / totalIssued) * 100) : 0;
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

        {/* P2.6 self-log: always-available "log a credit" for anything we
            haven't curated for this card yet. */}
        <div style={{ marginBottom: 16 }}>
          {!showForm ? (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="mono"
              style={{
                fontSize: 11, padding: "7px 13px", borderRadius: 8,
                border: "1px solid var(--rule)", background: "transparent",
                color: "var(--ink-2)", letterSpacing: "0.1em",
                textTransform: "uppercase", cursor: "pointer",
              }}
            >
              + Log a credit
            </button>
          ) : (
            <div style={{ border: "1px solid var(--rule)", borderRadius: 10, padding: "14px 16px", background: "var(--surface)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <select value={fCard} onChange={(e) => setFCard(e.target.value)} className="mono"
                  style={{ padding: "9px 11px", borderRadius: 8, border: "1px solid var(--rule)", background: "var(--paper)", color: "var(--ink)", fontSize: 12, gridColumn: "1 / -1" }}>
                  <option value="">{cards.length ? "Pick a held card…" : "No cards in wallet — add one first"}</option>
                  {cards.map((uc) => (
                    <option key={uc.card_id} value={uc.card_id}>{uc.nickname || uc.card?.name || uc.card_id}</option>
                  ))}
                </select>
                <input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="Credit name (e.g. Travel Credit)"
                  style={{ padding: "9px 11px", borderRadius: 8, border: "1px solid var(--rule)", background: "var(--paper)", color: "var(--ink)", fontSize: 13, gridColumn: "1 / -1" }} />
                <input value={fValue} onChange={(e) => setFValue(e.target.value)} type="number" min="1" placeholder="Annual value (CAD)"
                  style={{ padding: "9px 11px", borderRadius: 8, border: "1px solid var(--rule)", background: "var(--paper)", color: "var(--ink)", fontSize: 13 }} />
                <select value={fRec} onChange={(e) => setFRec(e.target.value)} className="mono"
                  style={{ padding: "9px 11px", borderRadius: 8, border: "1px solid var(--rule)", background: "var(--paper)", color: "var(--ink)", fontSize: 12 }}>
                  <option value="annual">Annual</option>
                  <option value="biennial">Every 2 years</option>
                  <option value="quadrennial">Every 4 years (NEXUS)</option>
                  <option value="once">One-time</option>
                </select>
              </div>
              {formErr && <p style={{ color: "var(--loss)", fontSize: 12, margin: "8px 0 0" }}>{formErr}</p>}
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button type="button" onClick={handleAddCredit} disabled={saving} className="mono"
                  style={{ fontSize: 11, padding: "8px 16px", borderRadius: 8, border: "none", background: saving ? "var(--surface-2)" : "var(--accent)", color: saving ? "var(--ink-3)" : "#fff", letterSpacing: "0.1em", textTransform: "uppercase", cursor: saving ? "default" : "pointer" }}>
                  {saving ? "Saving…" : "Save credit"}
                </button>
                <button type="button" onClick={() => { setShowForm(false); setFormErr(null); }} className="mono"
                  style={{ fontSize: 11, padding: "8px 16px", borderRadius: 8, border: "1px solid var(--rule)", background: "transparent", color: "var(--ink-3)", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 14 }}>
              <div>
                <span className="eyebrow">Unused credit value</span>
                <div className="display" style={{ fontSize: 40, color: "var(--gold)", lineHeight: 1, marginTop: 4 }}>
                  {fmtCAD(totalUnused)}
                </div>
                <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 5 }}>
                  of {fmtCAD(totalIssued)} issued · {Math.round(unclaimedPct)}% still unclaimed
                  {upcoming.length > 0 && (
                    <span style={{ color: "var(--accent)" }}> · {upcoming.length} renewal{upcoming.length === 1 ? "" : "s"} in 60 days</span>
                  )}
                </div>
              </div>
              {totalIssued > 0 && (
                <Donut pct={unclaimedPct} color="var(--gold)" centerLabel={`${Math.round(unclaimedPct)}%`} />
              )}
            </div>

            {redeemErr && (
              <p
                role="alert"
                className="mono"
                style={{ fontSize: 12, color: "var(--loss)", margin: "0 0 10px" }}
              >
                {redeemErr}
              </p>
            )}

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
