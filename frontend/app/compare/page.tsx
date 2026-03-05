"use client";

import { useState, useEffect } from "react";
import { listCategories, compareCards, ensureSession } from "@/lib/api";
import type { Category, CardRecommendation } from "@/lib/types";

const CAT_ICONS: Record<string, string> = {
  groceries: "🛒", dining: "🍽️", travel: "✈️", gas: "⛽", transit: "🚇",
  entertainment: "🎬", streaming: "📺", pharmacy: "💊", "foreign-currency": "💱",
  "everything-else": "💳",
};

function fmtPct(v: number) { return `${v.toFixed(2)}%`; }
function fmtCAD(v: number) { return `$${v.toFixed(2)}`; }

export default function ComparePage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [spendAmount, setSpendAmount] = useState("500");
  const [results, setResults] = useState<Record<string, CardRecommendation[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catLoading, setCatLoading] = useState(true);

  useEffect(() => {
    listCategories().then(setCategories).catch(() => setError("Could not load categories")).finally(() => setCatLoading(false));
  }, []);

  async function handleCompare() {
    setError(null); setLoading(true); setResults({});
    try {
      const sessionId = await ensureSession();
      const amount = parseFloat(spendAmount);
      if (isNaN(amount) || amount <= 0) throw new Error("Enter a valid amount");
      const entries = await Promise.all(
        categories.map(async cat => {
          try {
            const recs = await compareCards(sessionId, cat.slug, amount);
            return [cat.slug, recs] as [string, CardRecommendation[]];
          } catch { return [cat.slug, []] as [string, CardRecommendation[]]; }
        })
      );
      setResults(Object.fromEntries(entries));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally { setLoading(false); }
  }

  const hasResults = Object.keys(results).length > 0;

  // Collect all unique card names across results for column headers
  const allCards = hasResults
    ? [...new Set(Object.values(results).flatMap(recs => recs.map(r => r.card_name)))]
    : [];

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="orb w-[500px] h-[300px] top-[-80px] right-[-100px]"
        style={{ background: "radial-gradient(ellipse, rgba(139,92,246,0.07) 0%, transparent 70%)" }} />

      <div className="relative max-w-5xl mx-auto px-6 pt-28 pb-24">
        {/* Header */}
        <div className="mb-8 fade-up">
          <p className="label-xs mb-1.5" style={{ color: "var(--text-tertiary)" }}>Side-by-side</p>
          <h1 className="title text-white mb-2">Card Comparison</h1>
          <p className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
            See how every card in your wallet stacks up across all spend categories at once.
          </p>
        </div>

        {/* Controls */}
        <div className="rounded-2xl p-5 mb-6 fade-up-1"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-mid)", boxShadow: "var(--shadow-card)" }}
        >
          <div className="absolute top-0 left-0 right-0 h-px rounded-t-2xl"
            style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.10), transparent)" }} />
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="label-xs mb-2 block" style={{ color: "var(--text-tertiary)" }}>Spend amount per category</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px] pointer-events-none" style={{ color: "var(--text-tertiary)" }}>$</span>
                <input
                  type="number" min="1" step="1" value={spendAmount}
                  onChange={e => setSpendAmount(e.target.value)}
                  className="h-10 pl-7 pr-14 rounded-xl text-[14px] font-medium outline-none w-40 transition-all"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border-mid)", color: "var(--text-primary)" }}
                  onFocus={e => { e.currentTarget.style.borderColor = "rgba(200,16,46,0.5)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(200,16,46,0.12)"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "var(--border-mid)"; e.currentTarget.style.boxShadow = "none"; }}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 label-xs pointer-events-none" style={{ color: "var(--text-tertiary)" }}>CAD</span>
              </div>
            </div>
            <button
              onClick={handleCompare}
              disabled={loading || catLoading}
              className="h-10 px-6 rounded-xl font-semibold text-[14px] text-white maple-bg maple-glow disabled:opacity-30 transition-all"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3.5" />
                    <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Comparing…
                </span>
              ) : "Compare all categories"}
            </button>
            {error && <p className="text-[13px]" style={{ color: "#E8173A" }}>{error}</p>}
          </div>
        </div>

        {/* Empty / loading state */}
        {!hasResults && !loading && (
          <div className="rounded-2xl p-12 text-center fade-up-2"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-dim)" }}
          >
            <div className="text-4xl mb-4">⚖️</div>
            <p className="text-[15px] font-semibold text-white mb-2">Compare across every category</p>
            <p className="text-[13px] max-w-sm mx-auto" style={{ color: "var(--text-secondary)" }}>
              Enter a spend amount and hit Compare — we&apos;ll show you the best card for groceries, dining, travel, and more in one view.
            </p>
          </div>
        )}

        {/* Results table */}
        {hasResults && (
          <div className="fade-up-2 overflow-x-auto rounded-2xl"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-dim)" }}
          >
            <table className="w-full text-left border-collapse" style={{ minWidth: "600px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-dim)" }}>
                  <th className="px-5 py-3.5 text-[12px] font-semibold" style={{ color: "var(--text-tertiary)", width: "180px" }}>
                    Category
                  </th>
                  {allCards.map(name => (
                    <th key={name} className="px-4 py-3.5 text-[12px] font-semibold text-center" style={{ color: "var(--text-tertiary)" }}>
                      {name.length > 22 ? name.slice(0, 20) + "…" : name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {categories.filter(cat => results[cat.slug]?.length > 0).map((cat, rowIdx) => {
                  const recs = results[cat.slug] ?? [];
                  const topReturn = recs[0]?.effective_return ?? 0;
                  return (
                    <tr key={cat.slug}
                      style={{ borderBottom: rowIdx < categories.length - 1 ? "1px solid var(--border-dim)" : "none" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{CAT_ICONS[cat.slug] ?? "💳"}</span>
                          <span className="text-[13px] font-medium text-white">{cat.name}</span>
                        </div>
                      </td>
                      {allCards.map(cardName => {
                        const rec = recs.find(r => r.card_name === cardName);
                        const isBest = rec && rec.effective_return === topReturn && topReturn > 0;
                        return (
                          <td key={cardName} className="px-4 py-4 text-center">
                            {rec ? (
                              <div className="flex flex-col items-center gap-0.5">
                                <span
                                  className="text-[14px] font-bold"
                                  style={{ color: isBest ? "#E8173A" : "var(--text-primary)" }}
                                >
                                  {fmtPct(rec.effective_return)}
                                </span>
                                <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                                  {fmtCAD(rec.dollar_value)}
                                </span>
                                {isBest && (
                                  <span className="label-xs px-1.5 py-0.5 rounded mt-0.5"
                                    style={{ background: "rgba(200,16,46,0.12)", color: "#E8173A" }}>
                                    best
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span style={{ color: "var(--text-tertiary)" }}>—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
