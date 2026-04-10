"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSession } from "@/contexts/session-context";
import { useAuth } from "@/contexts/auth-context";
import { getSpendHistory, getSpendStats } from "@/lib/api";
import type { SpendEntry, SpendStats } from "@/lib/types";
import { ProGate } from "@/components/pro-gate";
import { AnimatedSection } from "@/components/ui/animated-list";
import { SkeletonStat, SkeletonChart } from "@/components/ui/skeleton";

function fmtCAD(v: number) {
  return `$${v.toFixed(2)}`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const CAT_ICONS: Record<string, string> = {
  groceries: "🛒",
  dining: "🍽️",
  travel: "✈️",
  gas: "⛽",
  transit: "🚇",
  entertainment: "🎬",
  streaming: "📺",
  pharmacy: "💊",
  "foreign-currency": "💱",
  "everything-else": "💳",
};

type ViewEntry = {
  id: string;
  card_name: string;
  category_slug: string;
  category_name: string;
  amount: number;
  points_earned: number;
  dollar_value: number;
  date: string;
};

function serverToView(e: SpendEntry): ViewEntry {
  return {
    id: e.id,
    card_name: e.card_name ?? "Unknown Card",
    category_slug: e.category_slug ?? "everything-else",
    category_name: e.category_name ?? "Other",
    amount: e.amount,
    points_earned: e.points_earned,
    dollar_value: e.dollar_value,
    date: e.spent_at,
  };
}

type DateRange = "7d" | "30d" | "90d" | "all";

const DATE_RANGES: { value: DateRange; label: string }[] = [
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
  { value: "all", label: "All" },
];

function getDaysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Build monthly buckets from entries for the trend chart */
function buildMonthlyTrend(
  entries: ViewEntry[]
): { label: string; spend: number; value: number }[] {
  if (entries.length === 0) return [];

  const buckets: Record<string, { spend: number; value: number }> = {};

  for (const e of entries) {
    const d = new Date(e.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!buckets[key]) buckets[key] = { spend: 0, value: 0 };
    buckets[key].spend += e.amount;
    buckets[key].value += e.dollar_value;
  }

  const sorted = Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6); // last 6 months max

  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  return sorted.map(([key, data]) => {
    const [, month] = key.split("-");
    return {
      label: monthNames[parseInt(month, 10) - 1],
      spend: data.spend,
      value: data.value,
    };
  });
}

export default function InsightsPage() {
  const { sessionId, isReady } = useSession();
  const { isPro } = useAuth();
  const [allEntries, setAllEntries] = useState<ViewEntry[]>([]);
  const [stats, setStats] = useState<SpendStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>("all");

  const loadData = useCallback(async () => {
    if (!sessionId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [history, serverStats] = await Promise.all([
        getSpendHistory(sessionId, 100, 0),
        getSpendStats(sessionId),
      ]);
      if (history && history.length > 0) {
        setAllEntries(history.map(serverToView));
        setStats(serverStats);
      } else {
        setAllEntries([]);
        setStats(null);
      }
    } catch {
      setAllEntries([]);
      setStats(null);
    }
    setLoading(false);
  }, [sessionId]);

  useEffect(() => {
    if (isReady) loadData();
  }, [isReady, loadData]);

  // ── Filter entries by date range ───────────
  const entries = useMemo(() => {
    if (dateRange === "all") return allEntries;
    const daysMap: Record<DateRange, number> = { "7d": 7, "30d": 30, "90d": 90, all: 0 };
    const cutoff = getDaysAgo(daysMap[dateRange]);
    return allEntries.filter((e) => new Date(e.date) >= cutoff);
  }, [allEntries, dateRange]);

  // ── Derived aggregations (from filtered entries) ───────────
  const isFiltered = dateRange !== "all";

  const totalSpend = isFiltered
    ? entries.reduce((s, e) => s + e.amount, 0)
    : stats?.total_spend ?? entries.reduce((s, e) => s + e.amount, 0);
  const totalValue = isFiltered
    ? entries.reduce((s, e) => s + e.dollar_value, 0)
    : stats?.total_value ?? entries.reduce((s, e) => s + e.dollar_value, 0);
  const totalPoints = isFiltered
    ? entries.reduce((s, e) => s + e.points_earned, 0)
    : stats?.total_points ?? entries.reduce((s, e) => s + e.points_earned, 0);
  const avgReturn = totalSpend > 0 ? (totalValue / totalSpend) * 100 : 0;

  // By category (recompute from filtered entries when filtering)
  type CatAgg = {
    spend: number;
    value: number;
    count: number;
    name: string;
  };
  let catList: [string, CatAgg][];

  if (!isFiltered && stats?.by_category && stats.by_category.length > 0) {
    catList = stats.by_category.map((cs) => [
      cs.category_name,
      {
        spend: cs.total_spend,
        value: cs.total_value,
        count: cs.entry_count,
        name: cs.category_name,
      },
    ]);
  } else {
    const byCategory: Record<string, CatAgg> = {};
    for (const e of entries) {
      if (!byCategory[e.category_slug])
        byCategory[e.category_slug] = {
          spend: 0,
          value: 0,
          count: 0,
          name: e.category_name,
        };
      byCategory[e.category_slug].spend += e.amount;
      byCategory[e.category_slug].value += e.dollar_value;
      byCategory[e.category_slug].count += 1;
    }
    catList = Object.entries(byCategory).sort(
      (a, b) => b[1].spend - a[1].spend
    );
  }
  const maxSpend = catList[0]?.[1].spend ?? 1;

  // By card
  type CardAgg = {
    spend: number;
    value: number;
    count: number;
    name: string;
    avgReturn: number;
  };
  let cardList: [string, CardAgg][];

  if (!isFiltered && stats?.by_card && stats.by_card.length > 0) {
    cardList = stats.by_card.map((cs) => [
      cs.card_name,
      {
        spend: cs.total_spend,
        value: cs.total_value,
        count: 0,
        name: cs.card_name,
        avgReturn: cs.avg_return,
      },
    ]);
  } else {
    const byCard: Record<string, CardAgg> = {};
    for (const e of entries) {
      const key = e.card_name;
      if (!byCard[key])
        byCard[key] = {
          spend: 0,
          value: 0,
          count: 0,
          name: e.card_name,
          avgReturn: 0,
        };
      byCard[key].spend += e.amount;
      byCard[key].value += e.dollar_value;
      byCard[key].count += 1;
    }
    for (const data of Object.values(byCard)) {
      data.avgReturn = data.spend > 0 ? (data.value / data.spend) * 100 : 0;
    }
    cardList = Object.entries(byCard).sort(
      (a, b) => b[1].value - a[1].value
    );
  }

  // Monthly trend data
  const monthlyTrend = useMemo(() => buildMonthlyTrend(entries), [entries]);
  const maxMonthlySpend = Math.max(...monthlyTrend.map((m) => m.spend), 1);

  // Opportunity cost: find best earning card per category from data, then compute missed value
  const opportunityCost = useMemo(() => {
    if (entries.length === 0) return [];

    // Find the best return rate per category from actual entries
    const bestRateByCategory: Record<string, { card: string; rate: number }> = {};
    for (const e of entries) {
      const rate = e.amount > 0 ? (e.dollar_value / e.amount) * 100 : 0;
      const existing = bestRateByCategory[e.category_slug];
      if (!existing || rate > existing.rate) {
        bestRateByCategory[e.category_slug] = { card: e.card_name, rate };
      }
    }

    // Now compute opportunity cost per entry
    const missed: {
      entry: ViewEntry;
      bestCard: string;
      bestValue: number;
      missedValue: number;
    }[] = [];

    for (const e of entries) {
      const best = bestRateByCategory[e.category_slug];
      if (!best || best.card === e.card_name) continue;
      const bestValue = (e.amount * best.rate) / 100;
      const diff = bestValue - e.dollar_value;
      if (diff > 0.01) {
        missed.push({
          entry: e,
          bestCard: best.card,
          bestValue,
          missedValue: diff,
        });
      }
    }

    missed.sort((a, b) => b.missedValue - a.missedValue);
    return missed.slice(0, 5);
  }, [entries]);

  const totalMissedValue = opportunityCost.reduce(
    (s, o) => s + o.missedValue,
    0
  );

  // ── Loading state ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="relative min-h-screen overflow-hidden">
        <div className="relative max-w-3xl mx-auto px-6 pt-8 pb-24">
          <div className="mb-8">
            <div className="h-3 w-32 rounded shimmer mb-2" />
            <div className="h-8 w-48 rounded-lg shimmer" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <SkeletonStat /><SkeletonStat /><SkeletonStat /><SkeletonStat />
          </div>
          <SkeletonChart />
          <div className="mt-4"><SkeletonChart /></div>
        </div>
      </div>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        className="orb w-[400px] h-[250px] top-[-60px] left-[-80px]"
        style={{
          background:
            "radial-gradient(ellipse, rgba(13,148,136,0.07) 0%, transparent 70%)",
        }}
      />

      <div className="relative max-w-3xl mx-auto px-6 pt-8 pb-24">
        {/* Header with date range filter */}
        <AnimatedSection className="flex items-end justify-between mb-8">
          <div>
            <p
              className="label-xs mb-1.5"
              style={{ color: "var(--text-tertiary)" }}
            >
              Your rewards history
            </p>
            <h1 className="title text-white">Insights</h1>
          </div>

          {/* Date range toggle */}
          {allEntries.length > 0 && (
            <div
              className="flex items-center rounded-xl p-0.5"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              {DATE_RANGES.map((dr) => (
                <button
                  key={dr.value}
                  onClick={() => setDateRange(dr.value)}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all"
                  style={{
                    background:
                      dateRange === dr.value
                        ? "rgba(13,148,136,0.15)"
                        : "transparent",
                    color:
                      dateRange === dr.value
                        ? "#14B8A6"
                        : "var(--text-tertiary)",
                    border:
                      dateRange === dr.value
                        ? "1px solid rgba(13,148,136,0.25)"
                        : "1px solid transparent",
                  }}
                >
                  {dr.label}
                </button>
              ))}
            </div>
          )}
        </AnimatedSection>

        {entries.length === 0 && allEntries.length === 0 ? (
          <div
            className="rounded-2xl p-14 text-center fade-up"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-dim)",
            }}
          >
            <div className="text-5xl mb-5">📊</div>
            <h2 className="text-[18px] font-semibold text-white mb-2">
              No spend data yet
            </h2>
            <p
              className="text-[14px] max-w-[280px] mx-auto mb-7 leading-relaxed"
              style={{ color: "var(--text-secondary)" }}
            >
              Use the optimizer and tap &ldquo;Log spend&rdquo; on your best
              card to start tracking your rewards.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 h-11 px-6 rounded-xl font-semibold text-[14px] text-white maple-bg accent-glow hover:scale-[1.02] active:scale-[0.98] transition-transform"
            >
              Go to optimizer →
            </Link>
          </div>
        ) : entries.length === 0 && allEntries.length > 0 ? (
          /* Filtered to empty */
          <div
            className="rounded-2xl p-10 text-center fade-up"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-dim)",
            }}
          >
            <div className="text-4xl mb-4">🔍</div>
            <h2 className="text-[16px] font-semibold text-white mb-2">
              No data in this range
            </h2>
            <p
              className="text-[13px] max-w-[260px] mx-auto mb-5"
              style={{ color: "var(--text-secondary)" }}
            >
              No spend entries found in the last{" "}
              {dateRange === "7d" ? "7 days" : dateRange === "30d" ? "30 days" : "90 days"}.
            </p>
            <button
              onClick={() => setDateRange("all")}
              className="h-9 px-5 rounded-lg font-medium text-[13px] transition-all"
              style={{
                background: "rgba(13,148,136,0.12)",
                border: "1px solid rgba(13,148,136,0.2)",
                color: "#14B8A6",
              }}
            >
              Show all time
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 fade-up">
              {[
                {
                  label: "Total spend",
                  value: fmtCAD(totalSpend),
                  sub: isFiltered ? dateRange.toUpperCase() : "logged",
                },
                {
                  label: "Total earned",
                  value: fmtCAD(totalValue),
                  sub: "CAD value",
                  highlight: true,
                },
                {
                  label: "Avg return",
                  value: `${avgReturn.toFixed(2)}%`,
                  sub: "effective",
                },
                {
                  label: "Points earned",
                  value: Math.round(totalPoints).toLocaleString(),
                  sub: "across cards",
                },
              ].map(({ label, value, sub, highlight }) => (
                <div
                  key={label}
                  className="rounded-2xl p-4"
                  style={{
                    background: highlight
                      ? "linear-gradient(135deg, rgba(13,148,136,0.08), rgba(79,70,229,0.04))"
                      : "var(--bg-elevated)",
                    border: highlight
                      ? "1px solid rgba(13,148,136,0.2)"
                      : "1px solid var(--border-dim)",
                  }}
                >
                  <div
                    className="label-xs mb-2"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {label}
                  </div>
                  <div
                    className="text-[22px] font-bold tracking-tight"
                    style={{ color: highlight ? "#14B8A6" : "white" }}
                  >
                    {value}
                  </div>
                  <div
                    className="text-[12px] mt-0.5"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {sub}
                  </div>
                </div>
              ))}
            </div>

            {/* Monthly spend trend chart */}
            {monthlyTrend.length > 1 && (
              <div
                className="rounded-2xl p-5 fade-up"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-dim)",
                }}
              >
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-[14px] font-semibold text-white">
                    Monthly spend trend
                  </h2>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-2.5 h-2.5 rounded-sm"
                        style={{ background: "rgba(13,148,136,0.6)" }}
                      />
                      <span
                        className="text-[11px]"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        Spend
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-2.5 h-2.5 rounded-sm"
                        style={{ background: "#4ADE80" }}
                      />
                      <span
                        className="text-[11px]"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        Value earned
                      </span>
                    </div>
                  </div>
                </div>

                {/* CSS bar chart */}
                <div className="flex items-end gap-2 h-[140px]">
                  {monthlyTrend.map((m) => (
                    <div
                      key={m.label}
                      className="flex-1 flex flex-col items-center gap-1"
                    >
                      <div className="w-full flex items-end gap-0.5 h-[110px]">
                        {/* Spend bar */}
                        <div className="flex-1 flex items-end justify-center">
                          <div
                            className="w-full rounded-t-md transition-all duration-500"
                            style={{
                              height: `${Math.max((m.spend / maxMonthlySpend) * 100, 4)}%`,
                              background:
                                "linear-gradient(180deg, rgba(13,148,136,0.7), rgba(13,148,136,0.3))",
                            }}
                            title={`Spend: ${fmtCAD(m.spend)}`}
                          />
                        </div>
                        {/* Value bar */}
                        <div className="flex-1 flex items-end justify-center">
                          <div
                            className="w-full rounded-t-md transition-all duration-500"
                            style={{
                              height: `${Math.max((m.value / maxMonthlySpend) * 100, 2)}%`,
                              background:
                                "linear-gradient(180deg, rgba(74,222,128,0.8), rgba(74,222,128,0.3))",
                            }}
                            title={`Value: ${fmtCAD(m.value)}`}
                          />
                        </div>
                      </div>
                      <span
                        className="text-[11px] font-medium"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {m.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Spending by category */}
            {catList.length > 0 && (
              <div
                className="rounded-2xl p-5 fade-up"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-dim)",
                }}
              >
                <h2 className="text-[14px] font-semibold text-white mb-4">
                  Spend by category
                </h2>
                <div className="space-y-3">
                  {catList.map(([slug, data]) => (
                    <div key={slug}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-base">
                            {CAT_ICONS[slug] ?? "💳"}
                          </span>
                          <span className="text-[13px] font-medium text-white">
                            {data.name}
                          </span>
                          {data.count > 0 && (
                            <span
                              className="label-xs px-1.5 py-0.5 rounded"
                              style={{
                                background: "rgba(255,255,255,0.06)",
                                color: "var(--text-tertiary)",
                              }}
                            >
                              {data.count}×
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="text-[13px] font-semibold text-white">
                            {fmtCAD(data.spend)}
                          </span>
                          <span
                            className="text-[12px] ml-2"
                            style={{ color: "#4ADE80" }}
                          >
                            +{fmtCAD(data.value)}
                          </span>
                        </div>
                      </div>
                      <div
                        className="h-1.5 rounded-full overflow-hidden"
                        style={{ background: "rgba(255,255,255,0.06)" }}
                      >
                        <div
                          className="h-full rounded-full maple-bg transition-all duration-500"
                          style={{
                            width: `${(data.spend / maxSpend) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top cards */}
            {cardList.length > 0 && (
              <div
                className="rounded-2xl p-5 fade-up"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-dim)",
                }}
              >
                <h2 className="text-[14px] font-semibold text-white mb-4">
                  Top performing cards
                </h2>
                <div className="space-y-3">
                  {cardList.map(([, data], i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between py-2.5 px-3 rounded-xl"
                      style={{
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.05)",
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-[12px] font-bold"
                          style={{
                            background:
                              i === 0
                                ? "linear-gradient(135deg,#0D9488,#0F766E)"
                                : "rgba(255,255,255,0.06)",
                            color:
                              i === 0 ? "white" : "var(--text-tertiary)",
                          }}
                        >
                          {i + 1}
                        </div>
                        <div>
                          <div className="text-[13px] font-medium text-white">
                            {data.name}
                          </div>
                          <div
                            className="text-[12px]"
                            style={{ color: "var(--text-tertiary)" }}
                          >
                            {data.avgReturn > 0
                              ? `${data.avgReturn.toFixed(1)}% avg return`
                              : `${data.count} transaction${data.count !== 1 ? "s" : ""}`}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div
                          className="text-[13px] font-semibold"
                          style={{
                            color: i === 0 ? "#4ADE80" : "white",
                          }}
                        >
                          {fmtCAD(data.value)}
                        </div>
                        <div
                          className="text-[12px]"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          {fmtCAD(data.spend)} spent
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Opportunity cost (Pro gated) */}
            <ProGate feature="detailedAnalytics">
              {opportunityCost.length > 0 && (
                <div
                  className="rounded-2xl p-5 fade-up"
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-dim)",
                  }}
                >
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-[14px] font-semibold text-white">
                      Opportunity cost
                    </h2>
                    {totalMissedValue > 0 && (
                      <span
                        className="text-[12px] font-semibold px-2.5 py-1 rounded-lg"
                        style={{
                          background: "rgba(251,191,36,0.1)",
                          border: "1px solid rgba(251,191,36,0.2)",
                          color: "#FBBF24",
                        }}
                      >
                        {fmtCAD(totalMissedValue)} missed
                      </span>
                    )}
                  </div>
                  <p
                    className="text-[12px] mb-4 leading-relaxed"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    Transactions where a different card in your wallet would
                    have earned more.
                  </p>
                  <div className="space-y-2">
                    {opportunityCost.map((oc) => (
                      <div
                        key={oc.entry.id}
                        className="flex items-center justify-between py-2.5 px-3 rounded-xl"
                        style={{
                          background: "rgba(251,191,36,0.04)",
                          border: "1px solid rgba(251,191,36,0.1)",
                        }}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-lg">
                            {CAT_ICONS[oc.entry.category_slug] ?? "💳"}
                          </span>
                          <div className="min-w-0">
                            <div className="text-[13px] font-medium text-white truncate">
                              {fmtCAD(oc.entry.amount)} at{" "}
                              {oc.entry.category_name}
                            </div>
                            <div
                              className="text-[12px] truncate"
                              style={{ color: "var(--text-tertiary)" }}
                            >
                              Used {oc.entry.card_name} · Best:{" "}
                              <span style={{ color: "#4ADE80" }}>
                                {oc.bestCard}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 ml-3">
                          <div
                            className="text-[13px] font-semibold"
                            style={{ color: "#FBBF24" }}
                          >
                            -{fmtCAD(oc.missedValue)}
                          </div>
                          <div
                            className="text-[11px]"
                            style={{ color: "var(--text-tertiary)" }}
                          >
                            {fmtDate(oc.entry.date)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </ProGate>

            {/* Recent transactions */}
            <div
              className="rounded-2xl p-5 fade-up"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-dim)",
              }}
            >
              <h2 className="text-[14px] font-semibold text-white mb-4">
                Recent transactions
              </h2>
              <div className="space-y-1">
                {entries.slice(0, 20).map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between py-2.5 px-3 rounded-xl transition-colors hover:bg-white/[0.03]"
                    style={{ cursor: "default" }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">
                        {CAT_ICONS[entry.category_slug] ?? "💳"}
                      </span>
                      <div>
                        <div className="text-[13px] font-medium text-white">
                          {entry.card_name}
                        </div>
                        <div
                          className="text-[12px]"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          {entry.category_name} · {fmtDate(entry.date)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[13px] font-semibold text-white">
                        {fmtCAD(entry.amount)}
                      </div>
                      <div
                        className="text-[12px]"
                        style={{ color: "#4ADE80" }}
                      >
                        +{fmtCAD(entry.dollar_value)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
