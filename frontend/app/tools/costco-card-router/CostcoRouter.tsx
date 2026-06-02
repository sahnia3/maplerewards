"use client";

import { useEffect, useMemo, useState } from "react";
import { listCards, getCardDetail, listPrograms } from "@/lib/api";
import type { Card, CardDetail, LoyaltyProgram, MultiplierRow } from "@/lib/types";

/**
 * CostcoRouter — the "use client" island behind /tools/costco-card-router.
 *
 * Answers a single high-intent question Canadians actually search ("which of
 * my cards works at Costco?") and bakes in two verified facts:
 *
 *   1. Costco Canada warehouses have an exclusive Mastercard acquiring deal
 *      (since 2014). In-warehouse terminals take Mastercard ONLY — no Visa,
 *      no Amex. (Costco.ca online does take Visa.) → Visa/Amex are flagged
 *      "won't work at the till".
 *
 *   2. Costco codes as a warehouse club (MCC 5300), NOT a grocery store — so a
 *      card's grocery bonus does NOT apply. We rank the user's Mastercards by
 *      their base / "everything-else" earn rate, UNLESS a card explicitly
 *      carries a wholesale-club / warehouse multiplier, in which case that
 *      rate wins.
 *
 * All compute is client-side off the public GET API — no backend endpoint.
 */

// fmt: one-decimal percentage for an effective return (e.g. "1.5%").
function fmtPct(v: number): string {
  return `${v.toLocaleString("en-CA", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`;
}

// A selected Mastercard, scored for the warehouse till.
interface RankedCard {
  card: Card;
  /** Effective % return at Costco (after the two rules are applied). */
  effectivePct: number;
  /** The earn rate we used (per $1 or % depending on earn_type). */
  earnRate: number;
  earnType: string;
  /** CPP of the card's program (cents/point); 0 for cashback cards. */
  cpp: number;
  /** Program currency / cashback label for the explainer line. */
  programName?: string;
  /** True when a wholesale-club / warehouse multiplier overrode the base row. */
  usedWarehouseRate: boolean;
  /** Human label of the multiplier row we priced from. */
  rowLabel: string;
}

// A selected card that can't be swiped at the warehouse till (Visa/Amex).
interface BlockedCard {
  card: Card;
  reason: string;
}

const NETWORK_PILL: Record<string, { bg: string; color: string; label: string }> = {
  visa: { bg: "color-mix(in srgb, var(--card-visa) 14%, transparent)", color: "var(--card-visa)", label: "Visa" },
  mastercard: { bg: "color-mix(in srgb, var(--card-mc) 14%, transparent)", color: "var(--card-mc)", label: "Mastercard" },
  amex: { bg: "color-mix(in srgb, var(--card-amex) 14%, transparent)", color: "var(--card-amex)", label: "Amex" },
};

// Detect a wholesale-club / warehouse multiplier row. Costco's grocery bonus
// doesn't apply (it codes as a warehouse club, MCC 5300) — but a handful of
// cards DO carry a dedicated warehouse-club tier, and per the spec that rate
// wins over the everything-else base.
function isWarehouseRow(m: MultiplierRow): boolean {
  const hay = `${m.category_slug} ${m.category_name}`.toLowerCase();
  return (
    hay.includes("wholesale") ||
    hay.includes("warehouse") ||
    (hay.includes("club") && !hay.includes("nightclub"))
  );
}

// Find the base / everything-else row. Match by slug first (canonical), then
// fall back to a name contains-check for resilience to seed variations.
function isBaseRow(m: MultiplierRow): boolean {
  const slug = m.category_slug.toLowerCase();
  if (slug === "everything-else" || slug === "everything_else") return true;
  const name = m.category_name.toLowerCase();
  return name.includes("everything else") || name === "base";
}

export function CostcoRouter() {
  const [catalog, setCatalog] = useState<Card[]>([]);
  const [programs, setPrograms] = useState<LoyaltyProgram[]>([]);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [details, setDetails] = useState<Record<string, CardDetail>>({});
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Load the public card catalogue + programs once.
  useEffect(() => {
    Promise.all([listCards(), listPrograms()])
      .then(([cards, progs]) => {
        setCatalog([...cards].sort((a, b) => a.name.localeCompare(b.name)));
        setPrograms(progs);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load cards"))
      .finally(() => setLoadingCatalog(false));
  }, []);

  // Fetch the detail (multipliers + program) for any newly-selected card.
  // Cached in `details` so re-selecting is instant and we never re-fetch.
  useEffect(() => {
    const missing = selectedIds.filter((id) => !details[id]);
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(missing.map((id) => getCardDetail(id).then((d) => [id, d] as const)))
      .then((pairs) => {
        if (cancelled) return;
        setDetails((prev) => {
          const next = { ...prev };
          for (const [id, d] of pairs) next[id] = d;
          return next;
        });
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Could not load card details");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedIds, details]);

  const selectedCards = useMemo(
    () => selectedIds.map((id) => catalog.find((c) => c.id === id)).filter((c): c is Card => Boolean(c)),
    [selectedIds, catalog],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.filter((c) => {
      if (selectedIds.includes(c.id)) return false; // selected cards move to the chip row
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.issuer.toLowerCase().includes(q) ||
        (c.loyalty_program?.name.toLowerCase().includes(q) ?? false)
      );
    });
  }, [catalog, search, selectedIds]);

  // ── The ranking engine ──────────────────────────────────────────────────
  // Mastercards get scored by their effective % return at the warehouse till;
  // Visa/Amex are pulled out as "won't work". A card is only scored once its
  // detail has loaded.
  const { ranked, blocked, pending } = useMemo(() => {
    const ranked: RankedCard[] = [];
    const blocked: BlockedCard[] = [];
    let pending = false;

    for (const card of selectedCards) {
      if (card.network !== "mastercard") {
        blocked.push({
          card,
          reason:
            card.network === "amex"
              ? "Costco Canada warehouses don't accept American Express — the swipe is declined at the till."
              : "Costco Canada warehouses accept Mastercard only — Visa is declined at the in-warehouse till (Costco.ca online does take Visa).",
        });
        continue;
      }

      const detail = details[card.id];
      if (!detail) {
        pending = true; // still fetching this Mastercard's multipliers
        continue;
      }

      // CPP from the program on the card detail, falling back to the programs
      // list by loyalty_program_id. cashback cards have no points CPP.
      const prog =
        detail.card.loyalty_program ??
        programs.find((p) => p.id === detail.card.loyalty_program_id);
      const cpp = prog?.base_cpp ?? 0;

      // Rule 2: Costco codes as a warehouse club, NOT grocery. Use the
      // wholesale-club row if one exists; otherwise the everything-else base.
      const warehouseRow = detail.multipliers.find(isWarehouseRow);
      const baseRow = detail.multipliers.find(isBaseRow);
      const row = warehouseRow ?? baseRow;

      // No usable row → treat as a 0% earn (still works at the till, ranked last).
      const earnRate = row?.earn_rate ?? 0;
      const earnType = row?.earn_type ?? "points";

      // cashback_pct earn rate IS the % return. points/miles → rate × cpp / 100.
      const effectivePct = earnType === "cashback_pct" ? earnRate : (earnRate * cpp) / 100;

      ranked.push({
        card,
        effectivePct,
        earnRate,
        earnType,
        cpp,
        programName: prog?.name,
        usedWarehouseRate: Boolean(warehouseRow),
        rowLabel: row?.category_name ?? "Base rate",
      });
    }

    // Highest effective return first; stable tie-break on name.
    ranked.sort((a, b) => b.effectivePct - a.effectivePct || a.card.name.localeCompare(b.card.name));
    return { ranked, blocked, pending };
  }, [selectedCards, details, programs]);

  const best = ranked[0];
  const runnersUp = ranked.slice(1);
  const hasResult = selectedCards.length > 0;

  function toggle(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <>
      {err && (
        <p className="serif" style={{ color: "var(--loss)", fontStyle: "italic", marginBottom: 16 }}>
          {err}
        </p>
      )}

      {/* ── Card picker ──────────────────────────────────────────────────── */}
      <section
        style={{
          border: "1px solid var(--rule)",
          borderRadius: 14,
          background: "var(--card-fill-strong)",
          padding: "22px 24px",
          marginBottom: 24,
        }}
      >
        <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 12 }}>
          Step 1 · Pick the cards you carry
        </div>

        {/* Selected chips */}
        {selectedCards.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            {selectedCards.map((c) => {
              const pill = NETWORK_PILL[c.network];
              return (
                <button
                  key={c.id}
                  onClick={() => toggle(c.id)}
                  className="mono"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "7px 12px",
                    borderRadius: 999,
                    border: "1px solid var(--rule-strong)",
                    background: "var(--surface)",
                    color: "var(--ink)",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  {c.name}
                  {pill && (
                    <span
                      style={{
                        fontSize: 9,
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: pill.bg,
                        color: pill.color,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                      }}
                    >
                      {pill.label}
                    </span>
                  )}
                  <span aria-hidden style={{ color: "var(--ink-3)", fontSize: 14 }}>
                    ×
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by card, issuer, or program…"
          className="input-maple"
          style={{
            width: "100%",
            padding: "12px 14px",
            fontFamily: "var(--font-jetbrains-mono)",
            fontSize: 14,
            borderRadius: 8,
            marginBottom: 12,
          }}
        />

        {/* Results list */}
        <div
          style={{
            maxHeight: 320,
            overflowY: "auto",
            border: "1px solid var(--rule)",
            borderRadius: 10,
            background: "var(--surface)",
          }}
        >
          {loadingCatalog && (
            <p className="mono" style={{ fontSize: 13, color: "var(--ink-3)", padding: "16px 14px" }}>
              Loading cards…
            </p>
          )}
          {!loadingCatalog && filtered.length === 0 && (
            <p className="serif" style={{ fontSize: 14, fontStyle: "italic", color: "var(--ink-3)", padding: "16px 14px" }}>
              {search ? `No cards match “${search}”.` : "Every card is already selected."}
            </p>
          )}
          {filtered.map((c) => {
            const pill = NETWORK_PILL[c.network];
            return (
              <button
                key={c.id}
                onClick={() => toggle(c.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  width: "100%",
                  textAlign: "left",
                  padding: "11px 14px",
                  background: "transparent",
                  border: "none",
                  borderBottom: "1px solid var(--rule)",
                  cursor: "pointer",
                  color: "var(--ink)",
                }}
              >
                <span className="display" style={{ fontSize: 14, flex: 1, minWidth: 0 }}>
                  {c.name}
                </span>
                {pill && (
                  <span
                    className="mono"
                    style={{
                      fontSize: 9,
                      padding: "2px 7px",
                      borderRadius: 4,
                      background: pill.bg,
                      color: pill.color,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                    }}
                  >
                    {pill.label}
                  </span>
                )}
                <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)", whiteSpace: "nowrap" }}>
                  {c.issuer}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Results ──────────────────────────────────────────────────────── */}
      {hasResult && (
        <section style={{ marginBottom: 28 }}>
          <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 12 }}>
            Step 2 · What to swipe at the warehouse
          </div>

          {/* Best Mastercard */}
          {best ? (
            <div
              style={{
                border: "1px solid var(--accent)",
                borderRadius: 14,
                background: "var(--accent-soft, rgba(165,31,45,0.06))",
                padding: "24px 26px",
                marginBottom: 16,
              }}
            >
              <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 8 }}>
                Use this card
              </div>
              <div className="display" style={{ fontSize: "clamp(26px, 3.4vw, 34px)", lineHeight: 1.1, marginBottom: 8 }}>
                {best.card.name}
              </div>
              <div className="display" style={{ fontSize: "clamp(30px, 5vw, 44px)", lineHeight: 1, color: "var(--accent)" }}>
                {fmtPct(best.effectivePct)}
                <span className="mono" style={{ fontSize: 13, color: "var(--ink-3)", marginLeft: 10 }}>
                  effective return at Costco
                </span>
              </div>
              <p className="serif" style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.5, margin: "12px 0 0" }}>
                {describeRate(best)}
              </p>
            </div>
          ) : pending ? (
            <p className="mono" style={{ fontSize: 13, color: "var(--ink-3)", padding: "8px 0" }}>
              Crunching multipliers…
            </p>
          ) : (
            blocked.length > 0 && (
              <div
                style={{
                  border: "1px solid var(--loss)",
                  borderRadius: 14,
                  background: "var(--surface)",
                  padding: "22px 24px",
                  marginBottom: 16,
                }}
              >
                <div className="display" style={{ fontSize: 20, marginBottom: 6 }}>
                  None of these will work at the till.
                </div>
                <p className="serif" style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.5, margin: 0 }}>
                  Costco Canada warehouses accept Mastercard only. Add a Mastercard to see your best earn rate — or
                  use one of these online at Costco.ca (Visa is accepted there).
                </p>
              </div>
            )
          )}

          {/* Runner-up Mastercards */}
          {runnersUp.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                Your other Mastercards, ranked
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {runnersUp.map((r, i) => (
                  <div
                    key={r.card.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "auto 1fr auto",
                      gap: 14,
                      alignItems: "center",
                      padding: "13px 16px",
                      border: "1px solid var(--rule)",
                      borderRadius: 10,
                      background: "var(--surface)",
                    }}
                  >
                    <span className="mono" style={{ fontSize: 13, color: "var(--ink-3)", width: 18 }}>
                      {i + 2}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div className="display" style={{ fontSize: 15, lineHeight: 1.2 }}>
                        {r.card.name}
                      </div>
                      <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
                        {describeRate(r)}
                      </div>
                    </div>
                    <span className="display" style={{ fontSize: 18, color: "var(--ink)" }}>
                      {fmtPct(r.effectivePct)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Blocked Visa/Amex */}
          {blocked.length > 0 && (
            <div>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                Won&rsquo;t work at the till
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {blocked.map((b) => {
                  const pill = NETWORK_PILL[b.card.network];
                  return (
                    <div
                      key={b.card.id}
                      style={{
                        display: "flex",
                        gap: 14,
                        alignItems: "flex-start",
                        padding: "13px 16px",
                        border: "1px solid var(--rule)",
                        borderRadius: 10,
                        background: "var(--surface)",
                        opacity: 0.92,
                      }}
                    >
                      <span aria-hidden style={{ color: "var(--loss)", fontSize: 16, lineHeight: 1.4 }}>
                        ⊘
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span className="display" style={{ fontSize: 15, lineHeight: 1.2 }}>
                            {b.card.name}
                          </span>
                          {pill && (
                            <span
                              className="mono"
                              style={{
                                fontSize: 9,
                                padding: "2px 7px",
                                borderRadius: 4,
                                background: pill.bg,
                                color: pill.color,
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                              }}
                            >
                              {pill.label}
                            </span>
                          )}
                        </div>
                        <p className="serif" style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5, margin: "4px 0 0" }}>
                          {b.reason}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── The two rules, in plain language ─────────────────────────────── */}
      <section
        style={{
          border: "1px solid var(--rule)",
          borderRadius: 14,
          background: "var(--paper)",
          padding: "22px 24px",
          marginBottom: 24,
        }}
      >
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          Why these two rules
        </div>
        <div style={{ display: "grid", gap: 16 }}>
          <div>
            <div className="display" style={{ fontSize: 16, marginBottom: 4 }}>
              1 · Mastercard only at the till
            </div>
            <p className="serif" style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.55, margin: 0 }}>
              Costco Canada has an exclusive Mastercard acquiring deal (since 2014). In-warehouse terminals accept
              Mastercard only — no Visa, no Amex. So any Visa or Amex you carry gets declined at the till.
              Costco.ca online checkout <em>does</em> take Visa (still no Amex).
            </p>
          </div>
          <div>
            <div className="display" style={{ fontSize: 16, marginBottom: 4 }}>
              2 · Costco is a warehouse club, not a grocery store
            </div>
            <p className="serif" style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.55, margin: 0 }}>
              Costco codes as a warehouse club (merchant category 5300), not grocery — so a card&rsquo;s grocery
              bonus does <em>not</em> apply there. We rank your Mastercards by their base / everything-else earn
              rate instead. The one exception: if a card has a dedicated wholesale-club tier, we use that rate.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

// describeRate — the plain-language earn line under each ranked card.
function describeRate(r: RankedCard): string {
  const base = r.usedWarehouseRate ? "wholesale-club rate" : "base / everything-else rate";
  if (r.earnType === "cashback_pct") {
    return `${r.earnRate.toLocaleString("en-CA")}% cash back on the warehouse-club ${base} — Costco's grocery bonus doesn't apply.`;
  }
  const pts = r.earnRate.toLocaleString("en-CA");
  const cpp = r.cpp.toFixed(2);
  const prog = r.programName ?? "points";
  return `${pts}× ${prog} on the ${base}, valued at ${cpp}¢/point → ${fmtPct(r.effectivePct)} effective return. Costco's grocery bonus doesn't apply.`;
}
