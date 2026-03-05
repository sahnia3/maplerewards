"use client";

import { useState, useEffect } from "react";
import { listCategories, optimize, ensureSession } from "@/lib/api";
import { RecommendationCard } from "@/components/recommendation-card";
import type { Category, CardRecommendation } from "@/lib/types";

const CATEGORY_ICONS: Record<string, string> = {
  groceries: "🛒",
  dining: "🍽️",
  travel: "✈️",
  gas: "⛽",
  transit: "🚇",
  entertainment: "🎬",
  streaming: "📺",
  pharmacy: "💊",
  "foreign-currency": "💱",
  default: "💳",
};

export function OptimizerForm() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categorySlug, setCategorySlug] = useState("");
  const [spendAmount, setSpendAmount] = useState("");
  const [results, setResults] = useState<CardRecommendation[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catLoading, setCatLoading] = useState(true);

  useEffect(() => {
    listCategories()
      .then(setCategories)
      .catch(() => setError("Could not load categories"))
      .finally(() => setCatLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const sessionId = await ensureSession();
      const amount = parseFloat(spendAmount);
      if (isNaN(amount) || amount <= 0) throw new Error("Enter a valid spend amount");
      const recs = await optimize({ session_id: sessionId, category_slug: categorySlug, spend_amount: amount });
      setResults(recs);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const selectedCat = categories.find(c => c.slug === categorySlug);

  return (
    <div className="w-full">
      {/* Form panel */}
      <div className="rounded-2xl p-6 relative overflow-hidden"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-mid)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        {/* Subtle inner glow top */}
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)" }} />

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-4 items-end">

            {/* Category picker */}
            <div>
              <label className="label-xs mb-2.5 block" style={{ color: "var(--text-tertiary)" }}>
                Category
              </label>
              <div className="relative">
                <select
                  value={categorySlug}
                  onChange={e => setCategorySlug(e.target.value)}
                  disabled={catLoading}
                  className="w-full h-11 pl-10 pr-4 rounded-xl text-[14px] font-medium appearance-none cursor-pointer transition-all outline-none"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid var(--border-mid)",
                    color: categorySlug ? "var(--text-primary)" : "var(--text-tertiary)",
                    boxShadow: "inset 0 1px 2px rgba(0,0,0,0.3)",
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = "rgba(200,16,46,0.5)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(200,16,46,0.12), inset 0 1px 2px rgba(0,0,0,0.3)"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "var(--border-mid)"; e.currentTarget.style.boxShadow = "inset 0 1px 2px rgba(0,0,0,0.3)"; }}
                >
                  <option value="" disabled style={{ background: "var(--bg-overlay)" }}>
                    {catLoading ? "Loading…" : "Select a category"}
                  </option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.slug} style={{ background: "var(--bg-overlay)" }}>
                      {CATEGORY_ICONS[cat.slug] ?? CATEGORY_ICONS.default} {cat.name}
                    </option>
                  ))}
                </select>
                {/* Icon */}
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base pointer-events-none">
                  {selectedCat ? (CATEGORY_ICONS[selectedCat.slug] ?? CATEGORY_ICONS.default) : "🏷️"}
                </span>
                {/* Chevron */}
                <svg className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" style={{ color: "var(--text-tertiary)" }}>
                  <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>

            {/* Spend amount */}
            <div>
              <label className="label-xs mb-2.5 block" style={{ color: "var(--text-tertiary)" }}>
                Spend amount
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px] font-medium pointer-events-none select-none" style={{ color: "var(--text-tertiary)" }}>
                  $
                </span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  value={spendAmount}
                  onChange={e => setSpendAmount(e.target.value)}
                  className="w-full h-11 pl-7 pr-12 rounded-xl text-[14px] font-medium outline-none transition-all"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid var(--border-mid)",
                    color: "var(--text-primary)",
                    boxShadow: "inset 0 1px 2px rgba(0,0,0,0.3)",
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = "rgba(200,16,46,0.5)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(200,16,46,0.12), inset 0 1px 2px rgba(0,0,0,0.3)"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "var(--border-mid)"; e.currentTarget.style.boxShadow = "inset 0 1px 2px rgba(0,0,0,0.3)"; }}
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 label-xs pointer-events-none" style={{ color: "var(--text-tertiary)" }}>
                  CAD
                </span>
              </div>
            </div>

            {/* CTA */}
            <button
              type="submit"
              disabled={loading || !categorySlug || !spendAmount}
              className="h-11 px-6 rounded-xl font-semibold text-[14px] text-white transition-all duration-150 maple-bg maple-glow disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none whitespace-nowrap"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3.5" />
                    <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Ranking…
                </span>
              ) : (
                "Rank Cards"
              )}
            </button>
          </div>

          {error && (
            <p className="mt-3 text-[13px]" style={{ color: "#E8173A" }}>{error}</p>
          )}
        </form>
      </div>

      {/* Results */}
      {results !== null && (
        <div className="mt-6">
          {results.length === 0 ? (
            <div className="rounded-2xl p-10 text-center"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-dim)" }}
            >
              <div className="text-4xl mb-3">💳</div>
              <p className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
                No cards found for this category. Add cards to your wallet first.
              </p>
              <a href="/wallet" className="inline-block mt-4 text-[13px] font-medium text-[#C8102E] hover:underline">
                Go to wallet →
              </a>
            </div>
          ) : (
            <>
              <div className="flex items-baseline justify-between mb-4 px-1">
                <p className="text-[13px] font-semibold text-white">
                  {results.length} card{results.length !== 1 ? "s" : ""} ranked
                </p>
                <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                  for ${parseFloat(spendAmount).toFixed(2)} CAD
                </p>
              </div>
              <div className="flex flex-col gap-3">
                {results.map((rec, i) => (
                  <RecommendationCard key={rec.card_id} rec={rec} rank={i + 1} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
