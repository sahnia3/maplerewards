"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Scale } from "lucide-react";
import { listCategories, optimize } from "@/lib/api";
import { useSession } from "@/contexts/session-context";
import { AnimatedSection } from "@/components/ui/animated-list";
import { SkeletonChart } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import type { Category, CardRecommendation } from "@/lib/types";

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
      <div className="relative max-w-5xl mx-auto px-6 pt-8 pb-24">
        {/* Header */}
        <AnimatedSection>
          <p className="eyebrow" style={{ color: "var(--accent)", marginBottom: 10 }}>Side-by-side</p>
          <h1
            className="display"
            style={{
              fontSize: "clamp(32px, 4.5vw, 44px)",
              lineHeight: 1.05,
              letterSpacing: "-0.015em",
              color: "var(--ink)",
              margin: 0,
            }}
          >
            Card <span style={{ fontStyle: "italic" }}>comparison</span>
          </h1>
          <p className="serif" style={{ fontSize: 14, fontStyle: "italic", color: "var(--ink-2)", marginTop: 8 }}>
            Set spend amounts per category and compare every card in your wallet.
          </p>
        </AnimatedSection>

        {/* Controls */}
        <AnimatedSection delay={0.05}>
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--rule-strong)",
              borderRadius: 14,
              padding: 22,
              marginTop: 24,
              marginBottom: 24,
              boxShadow: "var(--shadow-1)",
              position: "relative",
            }}
          >
            {/* Per-category spend inputs */}
            <div style={{ marginBottom: 16 }}>
              <label
                className="eyebrow"
                style={{ color: "var(--ink-3)", display: "block", marginBottom: 12 }}
              >
                Monthly spend per category
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {categories.map((cat) => (
                  <div key={cat.slug}>
                    <div
                      className="mono shrink-0"
                      style={{ fontSize: 10, letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 4 }}
                    >
                      {cat.name}
                    </div>
                    <div className="relative flex-1">
                      <span
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 mono pointer-events-none"
                        style={{ fontSize: 12, color: "var(--ink-3)" }}
                      >
                        $
                      </span>
                      <input
                        type="number" min="0" step="1"
                        value={spendAmounts[cat.slug] || ""}
                        onChange={(e) => updateSpend(cat.slug, e.target.value)}
                        placeholder="0"
                        className="w-full h-8 pl-6 pr-2 rounded-lg text-[12px] font-medium outline-none input-maple"
                      />
                    </div>
                    <span
                      className="mono shrink-0"
                      style={{ fontSize: 11, width: 60, color: "var(--ink-3)", letterSpacing: "0.04em" }}
                    >
                      {cat.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Redemption segment + CTA */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="eyebrow" style={{ color: "var(--ink-3)" }}>Redemption:</span>
                <div
                  className="flex rounded-lg overflow-hidden"
                  style={{ border: "1px solid var(--rule-strong)" }}
                >
                  {(["base", "business"] as const).map((seg) => (
                    <button
                      key={seg} type="button" onClick={() => setSegment(seg)}
                      className="mono"
                      style={{
                        padding: "6px 14px",
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        background: segment === seg ? "var(--accent-wash)" : "transparent",
                        color: segment === seg ? "var(--accent)" : "var(--ink-3)",
                        borderLeft: seg === "business" ? "1px solid var(--rule-strong)" : "none",
                        cursor: segment === seg ? "default" : "pointer",
                        transition:
                          "background 220ms cubic-bezier(0.16, 1, 0.3, 1), color 220ms cubic-bezier(0.16, 1, 0.3, 1)",
                      }}
                    >
                      {seg === "base" ? "Base" : "Business"}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={handleCompare}
                disabled={loading || catLoading}
                className="btn btn-primary"
                style={{ height: 40, fontSize: 13 }}
              >
                {loading ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <Loader2 size={14} className="animate-spin" />
                    Comparing…
                  </span>
                ) : "Compare all categories"}
              </button>
              {error && (
                <p
                  className="serif"
                  style={{ fontSize: 13, fontStyle: "italic", color: "var(--accent)", margin: 0 }}
                >
                  {error}
                </p>
              )}
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
              icon={Scale}
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
              style={{
                position: "relative",
                background: "var(--surface)",
                border: "1px solid var(--accent)",
                borderRadius: 14,
                padding: 22,
                marginBottom: 20,
                boxShadow: "var(--shadow-accent-glow), var(--shadow-1)",
                overflow: "hidden",
              }}
            >
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "radial-gradient(ellipse 70% 60% at 100% 0%, var(--accent-glow), transparent 65%)",
                  pointerEvents: "none",
                }}
              />
              <div style={{ position: "relative" }}>
                <h2
                  className="eyebrow"
                  style={{ color: "var(--accent)", marginBottom: 14, letterSpacing: "0.18em" }}
                >
                  Best card per category
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {bestPerCategory.map(({ category, bestCard }) => (
                    <div
                      key={category.slug}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 14px",
                        borderRadius: 10,
                        background: "var(--surface-2)",
                        border: "1px solid var(--rule)",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          className="display"
                          style={{ fontSize: 12, color: "var(--ink)", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        >
                          {bestCard.card_name}
                        </div>
                        <div
                          className="mono"
                          style={{ fontSize: 11, color: "var(--accent)", letterSpacing: "0.02em", marginTop: 2 }}
                        >
                          {fmtPct(bestCard.effective_return)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
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
              className="overflow-x-auto"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--rule-strong)",
                borderRadius: 14,
                boxShadow: "var(--shadow-1)",
              }}
            >
              <table className="w-full text-left border-collapse" style={{ minWidth: 600 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--rule-strong)" }}>
                    <th
                      className="eyebrow sticky left-0 z-10"
                      style={{
                        padding: "14px 20px",
                        color: "var(--ink-3)",
                        width: 180,
                        background: "var(--surface-2)",
                        textAlign: "left",
                      }}
                    >
                      Category
                    </th>
                    {allCards.map((name) => (
                      <th
                        key={name}
                        className="eyebrow"
                        style={{ padding: "14px 16px", color: "var(--ink-3)", textAlign: "center" }}
                      >
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
                      <tr
                        key={cat.slug}
                        style={{
                          borderBottom: "1px solid var(--rule)",
                          background: isEven ? "transparent" : "var(--surface-2)",
                        }}
                      >
                        <td
                          className="sticky left-0 z-10"
                          style={{ padding: "16px 20px", background: isEven ? "var(--surface)" : "var(--surface-2)" }}
                        >
                          <div className="flex items-center gap-2">
                            <div>
                              <div className="display" style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.2 }}>
                                {cat.name}
                              </div>
                              <div
                                className="mono"
                                style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.02em", marginTop: 2 }}
                              >
                                {fmtCAD(amt)}
                              </div>
                            </div>
                          </div>
                        </td>
                        {allCards.map((cardName) => {
                          const rec = recs.find((r) => r.card_name === cardName);
                          const isBest = rec && rec.effective_return === topReturn && topReturn > 0;
                          return (
                            <td key={cardName} style={{ padding: "16px", textAlign: "center" }}>
                              {rec ? (
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                                  <span
                                    className="display"
                                    style={{
                                      fontSize: 16,
                                      color: isBest ? "var(--gain)" : "var(--ink)",
                                      lineHeight: 1,
                                      fontWeight: 600,
                                    }}
                                  >
                                    {fmtPct(rec.effective_return)}
                                  </span>
                                  <span
                                    className="mono"
                                    style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.02em" }}
                                  >
                                    {fmtCAD(rec.dollar_value)}
                                  </span>
                                  {isBest && (
                                    <span
                                      className="mono"
                                      style={{
                                        marginTop: 4,
                                        padding: "1px 8px",
                                        borderRadius: 999,
                                        fontSize: 9,
                                        fontWeight: 600,
                                        letterSpacing: "0.10em",
                                        textTransform: "uppercase",
                                        background: "var(--gain-soft)",
                                        border: "1px solid var(--gain-soft)",
                                        color: "var(--gain)",
                                      }}
                                    >
                                      Best
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span style={{ color: "var(--ink-3)" }}>—</span>
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
