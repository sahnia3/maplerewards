"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { listCategories, optimize } from "@/lib/api";
import { useSession } from "@/contexts/session-context";
import { AnimatedSection } from "@/components/ui/animated-list";
import { SkeletonChart } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import type { Category, CardRecommendation } from "@/lib/types";

const CAT_ICONS: Record<string, string> = {
  groceries: "🛒", dining: "🍽️", travel: "✈️", gas: "⛽", transit: "🚇",
  entertainment: "🎬", streaming: "📺", pharmacy: "💊", "foreign-currency": "💱",
  "everything-else": "💳", insurance: "🛡️", utilities: "🔌", "online-shopping": "🛍️",
};

function fmtPct(v: number) { return `${v.toFixed(2)}%`; }
function fmtCAD(v: number) { return `$${v.toFixed(2)}`; }

export default function ComparePage() {
  const { ensureSession } = useSession();
  const [categories, setCategories] = useState<Category[]>([]);
  const [spendAmounts, setSpendAmounts] = useState<Record<string, string>>({});
  const [segment, setSegment] = useState<"base" | "business">("base");
  const [results, setResults] = useState<Record<string, CardRecommendation[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catLoading, setCatLoading] = useState(true);

  useEffect(() => {
    listCategories()
      .then((cats) => {
        setCategories(cats);
        const defaults: Record<string, string> = {};
        cats.forEach((c) => (defaults[c.slug] = "500"));
        setSpendAmounts(defaults);
      })
      .catch(() => setError("Could not load categories"))
      .finally(() => setCatLoading(false));
  }, []);

  function updateSpend(slug: string, val: string) {
    setSpendAmounts((prev) => ({ ...prev, [slug]: val }));
  }

  async function handleCompare() {
    setError(null);
    setLoading(true);
    setResults({});
    try {
      const sid = await ensureSession();
      const entries = await Promise.all(
        categories.map(async (cat) => {
          const amount = parseFloat(spendAmounts[cat.slug] || "0");
          if (amount <= 0) return [cat.slug, []] as [string, CardRecommendation[]];
          try {
            const recs = await optimize({
              session_id: sid,
              category_slug: cat.slug,
              spend_amount: amount,
              redemption_segment: segment,
            });
            return [cat.slug, recs] as [string, CardRecommendation[]];
          } catch {
            return [cat.slug, []] as [string, CardRecommendation[]];
          }
        })
      );
      setResults(Object.fromEntries(entries));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const hasResults = Object.keys(results).length > 0;

  const allCards = hasResults
    ? [...new Set(Object.values(results).flatMap((recs) => recs.map((r) => r.card_name)))]
    : [];

  const bestPerCategory = categories
    .filter((cat) => results[cat.slug]?.length > 0)
    .map((cat) => ({
      category: cat,
      bestCard: results[cat.slug][0],
    }));

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        className="orb w-[500px] h-[300px] top-[-80px] right-[-100px]"
        style={{ background: "radial-gradient(ellipse, rgba(139,92,246,0.07) 0%, transparent 70%)" }}
      />

      <div className="relative max-w-5xl mx-auto px-6 pt-8 pb-24">
        {/* Header */}
        <AnimatedSection>
          <p className="label-xs mb-1.5" style={{ color: "var(--text-tertiary)" }}>Side-by-side</p>
          <h1 className="title text-white mb-2">Card Comparison</h1>
          <p className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
            Set spend amounts per category and compare every card in your wallet.
          </p>
        </AnimatedSection>

        {/* Controls */}
        <AnimatedSection delay={0.05}>
          <div
            className="rounded-2xl p-5 mt-6 mb-6 relative"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-mid)", boxShadow: "var(--shadow-card)" }}
          >
            <div className="absolute top-0 left-0 right-0 h-px rounded-t-2xl"
              style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.10), transparent)" }} />

            {/* Per-category spend inputs */}
            <div className="mb-4">
              <label className="label-xs mb-3 block" style={{ color: "var(--text-tertiary)" }}>
                Monthly spend per category
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {categories.map((cat) => (
                  <div key={cat.slug} className="flex items-center gap-2">
                    <span className="text-base shrink-0">{CAT_ICONS[cat.slug] ?? "💳"}</span>
                    <div className="relative flex-1">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] pointer-events-none" style={{ color: "var(--text-tertiary)" }}>$</span>
                      <input
                        type="number" min="0" step="1"
                        value={spendAmounts[cat.slug] || ""}
                        onChange={(e) => updateSpend(cat.slug, e.target.value)}
                        placeholder="0"
                        className="w-full h-8 pl-6 pr-2 rounded-lg text-[12px] font-medium outline-none input-maple focus-ring"
                      />
                    </div>
                    <span className="text-[11px] shrink-0 w-[60px] truncate" style={{ color: "var(--text-tertiary)" }}>{cat.name}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Redemption segment + CTA */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="label-xs" style={{ color: "var(--text-tertiary)" }}>Redemption:</span>
                <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border-mid)" }}>
                  {(["base", "business"] as const).map((seg) => (
                    <button key={seg} type="button" onClick={() => setSegment(seg)}
                      className="px-3 py-1 text-[12px] font-medium transition-all"
                      style={{
                        background: segment === seg ? "var(--info-soft-2)" : "transparent",
                        color: segment === seg ? "var(--info-text)" : "var(--text-tertiary)",
                        borderLeft: seg === "business" ? "1px solid var(--border-mid)" : "none",
                      }}
                    >{seg === "base" ? "Base" : "Business Class"}</button>
                  ))}
                </div>
              </div>
              <button onClick={handleCompare} disabled={loading || catLoading}
                className="h-10 px-6 rounded-xl font-semibold text-[14px] text-white maple-bg accent-glow hover:scale-[1.02] active:scale-[0.98] disabled:opacity-30 transition-all"
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
              {error && <p className="text-[13px]" style={{ color: "var(--info-text)" }}>{error}</p>}
            </div>
          </div>
        </AnimatedSection>

        {/* Loading skeletons */}
        {loading && (
          <div className="space-y-4">
            <SkeletonChart />
            <SkeletonChart />
          </div>
        )}

        {/* Empty state */}
        {!hasResults && !loading && (
          <AnimatedSection delay={0.1}>
            <EmptyState
              icon="⚖️"
              title="Compare across every category"
              description="Set your monthly spend amounts and hit Compare — we'll show you the best card for each category in one view."
            />
          </AnimatedSection>
        )}

        {/* Best card per category summary */}
        <AnimatePresence>
          {bestPerCategory.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-2xl p-5 mb-5"
              style={{ background: "linear-gradient(135deg, var(--info-soft), rgba(79,70,229,0.03))", border: "1px solid var(--info-soft-2)" }}
            >
              <h2 className="text-[14px] font-semibold text-white mb-3">Best card per category</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {bestPerCategory.map(({ category, bestCard }) => (
                  <div key={category.slug} className="flex items-center gap-2 px-3 py-2 rounded-xl hover-glow"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    <span className="text-base">{CAT_ICONS[category.slug] ?? "💳"}</span>
                    <div className="min-w-0">
                      <div className="text-[12px] font-medium text-white truncate">{bestCard.card_name}</div>
                      <div className="text-[11px]" style={{ color: "var(--info-text)" }}>{fmtPct(bestCard.effective_return)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results table */}
        <AnimatePresence>
          {hasResults && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-x-auto rounded-2xl"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-dim)" }}
            >
              <table className="w-full text-left border-collapse" style={{ minWidth: "600px" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-dim)" }}>
                    <th className="px-5 py-3.5 text-[12px] font-semibold sticky left-0 z-10" style={{ color: "var(--text-tertiary)", width: "180px", background: "var(--bg-elevated)" }}>Category</th>
                    {allCards.map((name) => (
                      <th key={name} className="px-4 py-3.5 text-[12px] font-semibold text-center" style={{ color: "var(--text-tertiary)" }}>
                        {name.length > 22 ? name.slice(0, 20) + "…" : name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {categories.filter((cat) => results[cat.slug]?.length > 0).map((cat, rowIdx) => {
                    const recs = results[cat.slug] ?? [];
                    const topReturn = recs[0]?.effective_return ?? 0;
                    const amt = parseFloat(spendAmounts[cat.slug] || "0");
                    const isEven = rowIdx % 2 === 0;
                    return (
                      <tr key={cat.slug}
                        className="transition-colors hover:!bg-white/[0.03]"
                        style={{
                          borderBottom: "1px solid var(--border-dim)",
                          background: isEven ? "transparent" : "rgba(255,255,255,0.015)",
                        }}
                      >
                        <td className="px-5 py-4 sticky left-0 z-10" style={{ background: isEven ? "var(--bg-elevated)" : "rgba(17,20,32,1)" }}>
                          <div className="flex items-center gap-2">
                            <span className="text-base">{CAT_ICONS[cat.slug] ?? "💳"}</span>
                            <div>
                              <span className="text-[13px] font-medium text-white">{cat.name}</span>
                              <div className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{fmtCAD(amt)}</div>
                            </div>
                          </div>
                        </td>
                        {allCards.map((cardName) => {
                          const rec = recs.find((r) => r.card_name === cardName);
                          const isBest = rec && rec.effective_return === topReturn && topReturn > 0;
                          return (
                            <td key={cardName} className="px-4 py-4 text-center">
                              {rec ? (
                                <div className="flex flex-col items-center gap-0.5">
                                  <span className="text-[14px] font-bold" style={{ color: isBest ? "#4ADE80" : "var(--text-primary)" }}>
                                    {fmtPct(rec.effective_return)}
                                  </span>
                                  <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{fmtCAD(rec.dollar_value)}</span>
                                  {isBest && (
                                    <span className="label-xs px-1.5 py-0.5 rounded mt-0.5" style={{ background: "rgba(74,222,128,0.12)", color: "#4ADE80" }}>best</span>
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
