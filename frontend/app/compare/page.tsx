"use client";

import { useState, useEffect } from "react";
import { listCategories, compareCards, ensureSession } from "@/lib/api";
import type { Category, CardRecommendation } from "@/lib/types";

const CATEGORY_ICONS: Record<string, string> = {
  groceries: "🛒", dining: "🍽️", travel: "✈️", gas: "⛽", transit: "🚇",
  entertainment: "🎬", streaming: "📺", pharmacy: "💊", "foreign-currency": "💱",
  "everything-else": "💳", default: "💳",
};

const SPEND_PRESETS = [50, 100, 250, 500, 1000];

type CategoryResult = { category: Category; recs: CardRecommendation[] };

export default function ComparePage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [spendAmount, setSpendAmount] = useState("100");
  const [results, setResults] = useState<CategoryResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ran, setRan] = useState(false);

  useEffect(() => { listCategories().then(setCategories).catch(() => {}); }, []);

  async function runComparison() {
    setLoading(true); setError(null);
    try {
      const sessionId = await ensureSession();
      const amount = parseFloat(spendAmount);
      if (isNaN(amount) || amount <= 0) throw new Error("Enter a valid amount");

      const settled = await Promise.allSettled(
        categories.map(cat => compareCards(sessionId, cat.slug, amount).then(recs => ({ category: cat, recs })))
      );
      const out: CategoryResult[] = [];
      for (const s of settled) {
        if (s.status === "fulfilled" && s.value.recs.length > 0) out.push(s.value);
      }
      setResults(out);
      setRan(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally { setLoading(false); }
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="orb w-[500px] h-[300px] top-[-60px] left-1/2 -translate-x-1/2"
        style={{ background: "radial-gradient(ellipse, rgba(59,130,246,0.07) 0%, transparent 70%)" }}
      />

      <div className="relative max-w-5xl mx-auto px-6 pt-28 pb-24">
        {/* Header */}
        <div className="mb-10 fade-up">
          <p className="label-xs mb-1.5" style={{ color: "var(--text-tertiary)" }}>Your wallet</p>
          <h1 className="title text-white mb-2">Card Comparison</h1>
          <p className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
            See which card wins across every spend category at once.
          </p>
        </div>

        {/* Controls */}
        <div className="rounded-2xl p-5 mb-8 fade-up-1"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-mid)" }}
        >
          <div className="absolute top-0 left-0 right-0 h-px rounded-t-2xl"
            style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)" }}
          />
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="label-xs mb-2 block" style={{ color: "var(--text-tertiary)" }}>Spend per category</label>
              <div className="flex items-center gap-2 flex-wrap">
                {SPEND_PRESETS.map(p => (
                  <button key={p} onClick={() => setSpendAmount(String(p))}
                    className="h-8 px-3 rounded-lg text-[13px] font-medium transition-all"
                    style={spendAmount === String(p)
                      ? { background: "rgba(200,16,46,0.15)", color: "#E8173A", border: "1px solid rgba(200,16,46,0.3)" }
                      : { background: "rgba(255,255,255,0.05)", color: "var(--text-secondary)", border: "1px solid var(--border-dim)" }
                    }
                  >
                    ${p}
                  </button>
                ))}
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] pointer-events-none" style={{ color: "var(--text-tertiary)" }}>$</span>
                  <input type="number" value={spendAmount} onChange={e => setSpendAmount(e.target.value)} placeholder="custom"
                    className="w-24 h-8 pl-6 pr-2 rounded-lg text-[13px] outline-none"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border-dim)", color: "var(--text-primary)" }}
                  />
                </div>
              </div>
            </div>
            <button onClick={runComparison} disabled={loading || categories.length === 0}
              className="h-10 px-6 rounded-xl font-semibold text-[14px] text-white maple-bg maple-glow transition-all disabled:opacity-30"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3.5" />
                    <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Comparing…
                </span>
              ) : ran ? "Refresh" : "Compare All Categories"}
            </button>
          </div>
          {error && <p className="mt-3 text-[13px]" style={{ color: "#E8173A" }}>{error}</p>}
        </div>

        {/* Results grid */}
        {!ran && !loading && (
          <div className="rounded-2xl p-12 text-center fade-up-2"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-dim)" }}
          >
            <div className="text-5xl mb-4">⚡</div>
            <h2 className="text-[18px] font-semibold text-white mb-2">See every category at once</h2>
            <p className="text-[14px] max-w-sm mx-auto" style={{ color: "var(--text-secondary)" }}>
              Hit &ldquo;Compare All Categories&rdquo; to see which card in your wallet wins for groceries, travel, dining, and more — all side by side.
            </p>
          </div>
        )}

        {ran && results.length === 0 && (
          <div className="rounded-2xl p-10 text-center" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-dim)" }}>
            <p style={{ color: "var(--text-secondary)" }}>No results. Make sure you have cards in your <a href="/wallet" className="text-[#C8102E] hover:underline">wallet</a>.</p>
          </div>
        )}

        {results.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map(({ category, recs }, i) => {
              const top = recs[0];
              const icon = CATEGORY_ICONS[category.slug] ?? CATEGORY_ICONS.default;
              return (
                <div key={category.id} className="rounded-2xl p-4 fade-up lift" style={{ animationDelay: `${i * 0.04}s`, background: "var(--bg-elevated)", border: "1px solid var(--border-dim)" }}>
                  {/* Category header */}
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base"
                      style={{ background: "rgba(255,255,255,0.06)", border: "1px solid var(--border-dim)" }}
                    >
                      {icon}
                    </div>
                    <div>
                      <div className="text-[13px] font-semibold text-white">{category.name}</div>
                      <div className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{recs.length} card{recs.length !== 1 ? "s" : ""}</div>
                    </div>
                    <div className="ml-auto text-right">
                      <div className="text-[16px] font-bold text-[#E8173A]">{top.effective_return.toFixed(2)}%</div>
                      <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>best return</div>
                    </div>
                  </div>

                  {/* Winner */}
                  <div className="rounded-xl p-3" style={{ background: "rgba(200,16,46,0.06)", border: "1px solid rgba(200,16,46,0.15)" }}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[12px] font-semibold text-white truncate">{top.card_name}</div>
                        <div className="text-[11px] truncate" style={{ color: "var(--text-tertiary)" }}>{top.program_name}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[13px] font-bold text-[#4ADE80]">${top.dollar_value.toFixed(2)}</div>
                        <div className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>value</div>
                      </div>
                    </div>
                  </div>

                  {/* Runner-ups */}
                  {recs.slice(1, 3).map((rec, j) => (
                    <div key={rec.card_id} className="flex items-center justify-between gap-2 mt-2 px-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[11px] w-4 shrink-0" style={{ color: "var(--text-tertiary)" }}>#{j + 2}</span>
                        <span className="text-[12px] truncate" style={{ color: "var(--text-secondary)" }}>{rec.card_name}</span>
                      </div>
                      <span className="text-[12px] font-medium shrink-0" style={{ color: "var(--text-secondary)" }}>
                        {rec.effective_return.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
