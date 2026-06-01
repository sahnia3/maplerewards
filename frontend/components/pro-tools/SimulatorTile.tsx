"use client";

import { useEffect, useMemo, useState } from "react";
import { GitCompare } from "lucide-react";
import { getWallet, getWalletSimulation, listCards } from "@/lib/api";
import type { Card, SimulationResult, UserCard } from "@/lib/types";
import { PaperTile } from "@/components/editorial/PaperTile";
import { EmptyState } from "@/components/editorial/EmptyState";
import { FieldLabel, Stat, ctaStyle, fieldStyle, fmtCAD, fmtCAD2, sectionStyle } from "./_shared";

interface Props {
  sessionId: string | null;
  isReady: boolean;
}

// Sign-aware delta colour: a gain is green, a loss is red, flat is muted.
function deltaColor(v: number) {
  if (v > 0.005) return "var(--gain)";
  if (v < -0.005) return "var(--loss)";
  return "var(--ink-2)";
}

function signed(v: number) {
  return `${v > 0 ? "+" : ""}${fmtCAD(v)}`;
}

export function SimulatorTile({ sessionId, isReady }: Props) {
  const [catalog, setCatalog] = useState<Card[]>([]);
  const [held, setHeld] = useState<UserCard[]>([]);
  const [addId, setAddId] = useState("");
  const [dropId, setDropId] = useState("");
  const [result, setResult] = useState<SimulationResult | null>(null);
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
  // Add list: catalog minus cards already in the wallet.
  const addable = useMemo(
    () => catalog.filter((c) => !heldIds.has(c.id)).sort((a, b) => a.name.localeCompare(b.name)),
    [catalog, heldIds],
  );

  async function run() {
    if (!sessionId) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await getWalletSimulation(sessionId, {
        addCardIds: addId ? [addId] : [],
        dropCardIds: dropId ? [dropId] : [],
      });
      setResult(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not run simulation");
    } finally {
      setLoading(false);
    }
  }

  const canRun = Boolean(sessionId) && (Boolean(addId) || Boolean(dropId)) && !loading;

  return (
    <section style={sectionStyle}>
      <PaperTile
        motif="stack"
        eyebrow="Wallet simulator"
        title={<>What if you <span style={{ fontStyle: "italic" }}>swapped</span> a card?</>}
        accent
      >
        <p
          className="serif"
          style={{ marginTop: -4, marginBottom: 16, fontSize: 14, fontStyle: "italic", color: "var(--ink-2)", lineHeight: 1.5 }}
        >
          Pick a card to add and/or one to drop. Maple re-prices your logged spend category by category, nets the change in annual fees, and shows whether the swap actually pays.
        </p>

        {held.length === 0 && !err ? (
          <EmptyState
            icon={GitCompare}
            title="Add cards to simulate a swap"
            body="Add the cards you carry and log some spend — then Maple can model what adding or dropping a card does to your annual value."
            action={{ label: "Add cards", href: "/wallet" }}
          />
        ) : (
          <>
            <div className="protool-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, alignItems: "end" }}>
              <div>
                <FieldLabel>Add a card</FieldLabel>
                <select value={addId} onChange={(e) => setAddId(e.target.value)} style={fieldStyle}>
                  <option value="">— none —</option>
                  {addable.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel>Drop a card</FieldLabel>
                <select value={dropId} onChange={(e) => setDropId(e.target.value)} style={fieldStyle}>
                  <option value="">— none —</option>
                  {held.map((uc) => (
                    <option key={uc.card_id} value={uc.card_id}>
                      {uc.nickname || uc.card?.name || uc.card_id}
                    </option>
                  ))}
                </select>
              </div>
              <button onClick={run} disabled={!canRun} style={{ ...ctaStyle, opacity: canRun ? 1 : 0.6 }}>
                {loading ? "Simulating…" : "Simulate →"}
              </button>
            </div>

            {err && <p className="serif" style={{ fontStyle: "italic", color: "var(--loss)", fontSize: 14, marginTop: 14 }}>{err}</p>}

            {result && (
              <div style={{ marginTop: 18, borderTop: "1px solid var(--rule)", paddingTop: 18 }}>
                <div
                  className="protool-stat-row"
                  style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", border: "1px solid var(--rule)", borderRadius: 10, overflow: "hidden", background: "var(--card-fill)", marginBottom: 14 }}
                >
                  <Stat label="Baseline / yr" value={fmtCAD(result.baseline_annual_value)} />
                  <Stat label="Simulated / yr" value={fmtCAD(result.simulated_annual_value)} />
                  <Stat label="Fee change" value={signed(result.fee_delta_cad)} last />
                </div>

                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
                  <span className="eyebrow">Net after fees</span>
                  <div className="display" style={{ fontSize: 34, lineHeight: 1, color: deltaColor(result.net_delta_after_fees_cad) }}>
                    {signed(result.net_delta_after_fees_cad)}
                    <span className="mono" style={{ fontSize: 12, color: "var(--ink-3)", marginLeft: 8 }}>/ yr</span>
                  </div>
                </div>
                <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>
                  {signed(result.value_delta_cad)} reward value · {signed(-result.fee_delta_cad)} fees
                </div>

                {(result.added.length > 0 || result.dropped.length > 0) && (
                  <div className="mono" style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 10 }}>
                    {result.added.map((c) => (
                      <div key={c.card_id} style={{ color: "var(--gain)" }}>+ {c.card_name} ({fmtCAD(c.annual_fee)} fee)</div>
                    ))}
                    {result.dropped.map((c) => (
                      <div key={c.card_id} style={{ color: "var(--loss)" }}>− {c.card_name} ({fmtCAD(c.annual_fee)} fee)</div>
                    ))}
                  </div>
                )}

                {(result.ignored_already_held.length > 0 || result.ignored_not_held.length > 0) && (
                  <p className="serif" style={{ fontSize: 12.5, fontStyle: "italic", color: "#b8860b", margin: "8px 0 0" }}>
                    {result.ignored_already_held.length > 0 && (
                      <>{result.ignored_already_held.length === 1
                        ? "You already hold the card you tried to add. "
                        : `${result.ignored_already_held.length} of the cards you tried to add are already in your wallet. `}</>
                    )}
                    {result.ignored_not_held.length > 0 && (
                      <>{result.ignored_not_held.length === 1
                        ? "You don't hold the card you tried to drop."
                        : `${result.ignored_not_held.length} of the cards you tried to drop aren't in your wallet.`}</>
                    )}
                  </p>
                )}

                {result.category_changes.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div className="eyebrow" style={{ marginBottom: 4 }}>Categories that move</div>
                    {result.category_changes.map((cc) => (
                      <div key={cc.category_name} style={{ padding: "10px 0", borderBottom: "1px solid var(--rule)" }}>
                        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                          <div className="display" style={{ fontSize: 15, color: "var(--ink)" }}>{cc.category_name}</div>
                          <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: deltaColor(cc.delta_cad) }}>
                            {signed(cc.delta_cad)}
                          </span>
                        </div>
                        <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 3 }}>
                          {cc.before_card} ({fmtCAD2(cc.before_value)}) → {cc.after_card} ({fmtCAD2(cc.after_value)}) · {fmtCAD(cc.annual_spend)}/yr spend
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <p className="serif" style={{ fontSize: 12, fontStyle: "italic", color: "var(--ink-3)", margin: "14px 0 0", lineHeight: 1.5 }}>
                  {result.note}
                </p>
              </div>
            )}
          </>
        )}
      </PaperTile>
    </section>
  );
}
