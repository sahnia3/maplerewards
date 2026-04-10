"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { listCategories, optimize, logSpend } from "@/lib/api";
import { RecommendationCard } from "@/components/recommendation-card";
import { CustomSelect, type SelectOption } from "@/components/ui/custom-select";
import { AnimatedList, AnimatedItem } from "@/components/ui/animated-list";
import { SkeletonCard } from "@/components/ui/skeleton";
import { EmptyResults } from "@/components/ui/empty-state";
import { useSession } from "@/contexts/session-context";
import type { Category, CardRecommendation } from "@/lib/types";

const CATEGORY_ICONS: Record<string, string> = {
  groceries: "🛒", dining: "🍽️", travel: "✈️", gas: "⛽", transit: "🚇",
  entertainment: "🎬", streaming: "📺", pharmacy: "💊", "foreign-currency": "💱",
  "everything-else": "💳", default: "💳",
};

export function OptimizerForm() {
  const { ensureSession } = useSession();
  const [categories, setCategories] = useState<Category[]>([]);
  const [categorySlug, setCategorySlug] = useState("");
  const [spendAmount, setSpendAmount] = useState("");
  const [segment, setSegment] = useState<"base" | "business">("base");
  const [results, setResults] = useState<CardRecommendation[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catLoading, setCatLoading] = useState(true);
  const [logged, setLogged] = useState(false);
  const [logToast, setLogToast] = useState<string | null>(null);

  useEffect(() => {
    listCategories()
      .then(setCategories)
      .catch(() => setError("Could not load categories"))
      .finally(() => setCatLoading(false));
  }, []);

  const categoryOptions: SelectOption[] = categories.map((cat) => ({
    value: cat.slug,
    label: cat.name,
    icon: CATEGORY_ICONS[cat.slug] ?? CATEGORY_ICONS.default,
  }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setLogged(false);
    try {
      const sid = await ensureSession();
      const amount = parseFloat(spendAmount);
      if (isNaN(amount) || amount <= 0) throw new Error("Enter a valid spend amount");
      const recs = await optimize({
        session_id: sid,
        category_slug: categorySlug,
        spend_amount: amount,
        redemption_segment: segment,
      });
      setResults(recs);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleLog(rec: CardRecommendation) {
    try {
      const sid = await ensureSession();
      await logSpend(sid, {
        card_id: rec.card_id,
        category_slug: categorySlug,
        amount: parseFloat(spendAmount),
      });
      setLogged(true);
      setLogToast("Spend logged ✓");
      setTimeout(() => setLogToast(null), 4000);
    } catch {
      setLogToast("Failed to log spend");
      setTimeout(() => setLogToast(null), 4000);
    }
  }

  const selectedCat = categories.find((c) => c.slug === categorySlug);

  return (
    <div className="w-full">
      {/* Form panel */}
      <div
        className="rounded-2xl p-6 relative overflow-hidden"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-mid)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)",
          }}
        />

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-4 items-end">
            {/* Category — custom select */}
            <div>
              <label
                className="label-xs mb-2.5 block"
                style={{ color: "var(--text-tertiary)" }}
              >
                Category
              </label>
              {catLoading ? (
                <div className="h-11 rounded-xl shimmer" />
              ) : (
                <CustomSelect
                  options={categoryOptions}
                  value={categorySlug}
                  onChange={setCategorySlug}
                  placeholder="Select a category"
                  icon="🏷️"
                  searchable={categories.length > 6}
                />
              )}
            </div>

            {/* Amount — styled input */}
            <div>
              <label
                className="label-xs mb-2.5 block"
                style={{ color: "var(--text-tertiary)" }}
              >
                Spend amount
              </label>
              <div className="relative">
                <span
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px] font-medium pointer-events-none select-none"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  $
                </span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  value={spendAmount}
                  onChange={(e) => setSpendAmount(e.target.value)}
                  className="w-full h-11 pl-7 pr-12 rounded-xl text-[14px] font-medium outline-none input-maple focus-ring"
                />
                <span
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 label-xs pointer-events-none"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  CAD
                </span>
              </div>
            </div>

            {/* CTA */}
            <button
              type="submit"
              disabled={loading || !categorySlug || !spendAmount}
              className="h-11 px-6 rounded-xl font-semibold text-[14px] text-white transition-all duration-150 maple-bg accent-glow hover:scale-[1.02] active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none disabled:hover:scale-100 whitespace-nowrap"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg
                    className="animate-spin w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="3.5"
                    />
                    <path
                      className="opacity-90"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Ranking…
                </span>
              ) : (
                "Rank Cards"
              )}
            </button>
          </div>

          {/* Redemption segment toggle */}
          <div className="flex items-center gap-3 mt-4">
            <span
              className="label-xs"
              style={{ color: "var(--text-tertiary)" }}
            >
              Redemption value:
            </span>
            <div
              className="flex rounded-lg overflow-hidden"
              style={{ border: "1px solid var(--border-mid)" }}
            >
              {(["base", "business"] as const).map((seg) => (
                <button
                  key={seg}
                  type="button"
                  onClick={() => setSegment(seg)}
                  className="px-3 py-1 text-[12px] font-medium transition-all"
                  style={{
                    background:
                      segment === seg
                        ? "rgba(13,148,136,0.15)"
                        : "transparent",
                    color:
                      segment === seg
                        ? "#14B8A6"
                        : "var(--text-tertiary)",
                    borderLeft:
                      seg === "business"
                        ? "1px solid var(--border-mid)"
                        : "none",
                  }}
                >
                  {seg === "base" ? "Base" : "Business Class"}
                </button>
              ))}
            </div>
            <span
              className="text-[11px] hidden sm:inline"
              style={{ color: "var(--text-tertiary)" }}
            >
              {segment === "business"
                ? "Sweet-spot redemptions (flights, transfers)"
                : "Standard redemption rates"}
            </span>
          </div>

          {error && (
            <p className="mt-3 text-[13px]" style={{ color: "#14B8A6" }}>
              {error}
            </p>
          )}
        </form>
      </div>

      {/* Results */}
      <AnimatePresence mode="wait">
        {loading && (
          <motion.div
            key="loading"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-6 flex flex-col gap-3"
          >
            {[1, 2, 3].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </motion.div>
        )}

        {!loading && results !== null && (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="mt-6"
          >
            {results.length === 0 ? (
              <EmptyResults />
            ) : (
              <>
                <div className="flex items-baseline justify-between mb-4 px-1">
                  <p className="text-[13px] font-semibold text-white">
                    {results.length} card{results.length !== 1 ? "s" : ""}{" "}
                    ranked
                  </p>
                  <p
                    className="text-[12px]"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    for ${parseFloat(spendAmount).toFixed(2)} CAD
                  </p>
                </div>
                <AnimatedList className="flex flex-col gap-3">
                  {results.map((rec, i) => (
                    <AnimatedItem key={rec.card_id}>
                      <RecommendationCard
                        rec={rec}
                        rank={i + 1}
                        onLog={i === 0 ? () => handleLog(rec) : undefined}
                        logged={logged && i === 0}
                        spendCategory={selectedCat?.name}
                        spendAmount={parseFloat(spendAmount)}
                      />
                    </AnimatedItem>
                  ))}
                </AnimatedList>
                <p
                  className="text-center text-[12px] mt-5"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  Tap &ldquo;Log spend&rdquo; on the best card to track it in{" "}
                  <Link
                    href="/insights"
                    className="text-[#0D9488] hover:underline"
                  >
                    Insights
                  </Link>
                </p>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {logToast && (
          <motion.div
            initial={{ opacity: 0, y: 20, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: 10, x: "-50%" }}
            className="fixed bottom-24 left-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-medium shadow-lg"
            style={{
              background: logToast.includes("✓")
                ? "rgba(52,211,153,0.15)"
                : "rgba(239,68,68,0.15)",
              border: logToast.includes("✓")
                ? "1px solid rgba(52,211,153,0.3)"
                : "1px solid rgba(239,68,68,0.3)",
              color: logToast.includes("✓") ? "#34D399" : "#F87171",
              backdropFilter: "blur(12px)",
            }}
          >
            {logToast}
            {logToast.includes("✓") && (
              <Link
                href="/insights"
                className="text-[12px] underline ml-1"
                style={{ color: "#34D399" }}
              >
                View →
              </Link>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
