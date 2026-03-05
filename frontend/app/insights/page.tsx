"use client";

import { useState, useEffect } from "react";
import { getSpendLog, clearSpendLog, type SpendEntry } from "@/lib/api";

const CATEGORY_ICONS: Record<string, string> = {
  groceries: "🛒", dining: "🍽️", travel: "✈️", gas: "⛽", transit: "🚇",
  entertainment: "🎬", streaming: "📺", pharmacy: "💊", "foreign-currency": "💱",
  "everything-else": "💳", default: "💳",
};

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = key(item);
    (acc[k] = acc[k] || []).push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

export default function InsightsPage() {
  const [log, setLog] = useState<SpendEntry[]>([]);
  const [view, setView] = useState<"timeline" | "by-card" | "by-category">("timeline");

  useEffect(() => { setLog(getSpendLog()); }, []);

  const totalSpend = log.reduce((s, e) => s + e.amount, 0);
  const totalValue = log.reduce((s, e) => s + e.dollar_value, 0);
  const totalPoints = log.reduce((s, e) => s + e.points_earned, 0);
  const avgReturn = totalSpend > 0 ? (totalValue / totalSpend) * 100 : 0;

  function handleClear() {
    clearSpendLog();
    setLog([]);
  }

  const byCard = groupBy(log, e => e.card_name);
  const byCategory = groupBy(log, e => e.category_name);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="orb w-[400px] h-[250px] top-[-60px] right-[-80px]"
        style={{ background: "radial-gradient(ellipse, rgba(139,92,246,0.08) 0%, transparent 70%)" }}
      />

      <div className="relative max-w-3xl mx-auto px-6 pt-28 pb-24">
        {/* Header */}
        <div className="flex items-end justify-between mb-8 fade-up">
          <div>
            <p className="label-xs mb-1.5" style={{ color: "var(--text-tertiary)" }}>Your history</p>
            <h1 className="title text-white">Spending Insights</h1>
          </div>
          {log.length > 0 && (
            <button onClick={handleClear} className="text-[12px] transition-colors"
              style={{ color: "var(--text-tertiary)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#E8173A")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--text-tertiary)")}
            >
              Clear history
            </button>
          )}
        </div>

        {log.length === 0 ? (
          <div className="rounded-2xl p-14 text-center fade-up-1"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-dim)" }}
          >
            <div className="text-5xl mb-4">📊</div>
            <h2 className="text-[18px] font-semibold text-white mb-2">No spend history yet</h2>
            <p className="text-[14px] max-w-[300px] mx-auto mb-6 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Use the Optimizer and tap &ldquo;Log spend&rdquo; on the best card recommendation to start tracking.
            </p>
            <a href="/"
              className="inline-flex items-center gap-2 h-10 px-5 rounded-xl font-semibold text-[14px] text-white maple-bg maple-glow"
            >
              Go to Optimizer →
            </a>
          </div>
        ) : (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8 fade-up-1">
              {[
                { label: "Total spend", value: `$${totalSpend.toFixed(2)}`, sub: "CAD" },
                { label: "Points earned", value: Math.round(totalPoints).toLocaleString(), sub: "pts" },
                { label: "Dollar value", value: `$${totalValue.toFixed(2)}`, sub: "CAD", highlight: true },
                { label: "Avg return", value: `${avgReturn.toFixed(2)}%`, sub: "effective", highlight: true },
              ].map(({ label, value, sub, highlight }) => (
                <div key={label} className="rounded-2xl p-4"
                  style={{ background: "var(--bg-elevated)", border: highlight ? "1px solid rgba(200,16,46,0.2)" : "1px solid var(--border-dim)" }}
                >
                  <div className="label-xs mb-1" style={{ color: "var(--text-tertiary)" }}>{label}</div>
                  <div className="text-[20px] font-bold tracking-tight" style={{ color: highlight ? "#E8173A" : "white" }}>{value}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>{sub}</div>
                </div>
              ))}
            </div>

            {/* View switcher */}
            <div className="flex items-center gap-1 p-1 rounded-xl mb-6 w-fit fade-up-2"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              {(["timeline", "by-card", "by-category"] as const).map(v => (
                <button key={v} onClick={() => setView(v)}
                  className="px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all capitalize"
                  style={view === v
                    ? { background: "rgba(255,255,255,0.09)", color: "white", border: "1px solid rgba(255,255,255,0.10)" }
                    : { color: "var(--text-tertiary)" }
                  }
                >
                  {v.replace("-", " ")}
                </button>
              ))}
            </div>

            {/* Timeline */}
            {view === "timeline" && (
              <div className="flex flex-col gap-3 fade-up-2">
                {log.map(entry => (
                  <div key={entry.id} className="rounded-2xl p-4 flex items-center gap-4"
                    style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-dim)" }}
                  >
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0"
                      style={{ background: "rgba(255,255,255,0.06)", border: "1px solid var(--border-dim)" }}
                    >
                      {CATEGORY_ICONS[entry.category_slug] ?? CATEGORY_ICONS.default}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-white">{entry.category_name}</span>
                        <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>via {entry.card_name}</span>
                      </div>
                      <div className="text-[12px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>{fmtDate(entry.date)}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[14px] font-semibold text-white">${entry.amount.toFixed(2)}</div>
                      <div className="text-[12px]" style={{ color: "#4ADE80" }}>+${entry.dollar_value.toFixed(2)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* By card */}
            {view === "by-card" && (
              <div className="flex flex-col gap-3 fade-up-2">
                {Object.entries(byCard)
                  .sort(([,a],[,b]) => b.reduce((s,e) => s+e.dollar_value,0) - a.reduce((s,e) => s+e.dollar_value,0))
                  .map(([cardName, entries]) => {
                    const spend = entries.reduce((s,e) => s+e.amount, 0);
                    const value = entries.reduce((s,e) => s+e.dollar_value, 0);
                    const pts = entries.reduce((s,e) => s+e.points_earned, 0);
                    const ret = spend > 0 ? (value/spend)*100 : 0;
                    const barPct = totalSpend > 0 ? (spend/totalSpend)*100 : 0;
                    return (
                      <div key={cardName} className="rounded-2xl p-5" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-dim)" }}>
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <div>
                            <div className="text-[14px] font-semibold text-white">{cardName}</div>
                            <div className="text-[12px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>{entries.length} transaction{entries.length !== 1 ? "s" : ""}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-[16px] font-bold" style={{ color: "#E8173A" }}>{ret.toFixed(2)}%</div>
                            <div className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>avg return</div>
                          </div>
                        </div>
                        {/* Bar */}
                        <div className="h-1.5 rounded-full mb-3" style={{ background: "rgba(255,255,255,0.07)" }}>
                          <div className="h-full rounded-full maple-bg" style={{ width: `${barPct}%` }} />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { label: "Spent", value: `$${spend.toFixed(2)}` },
                            { label: "Points", value: Math.round(pts).toLocaleString() },
                            { label: "Value", value: `$${value.toFixed(2)}` },
                          ].map(({ label, value: val }) => (
                            <div key={label}>
                              <div className="text-[13px] font-semibold text-white">{val}</div>
                              <div className="label-xs" style={{ color: "var(--text-tertiary)" }}>{label}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            {/* By category */}
            {view === "by-category" && (
              <div className="flex flex-col gap-3 fade-up-2">
                {Object.entries(byCategory)
                  .sort(([,a],[,b]) => b.reduce((s,e) => s+e.amount,0) - a.reduce((s,e) => s+e.amount,0))
                  .map(([catName, entries]) => {
                    const slug = entries[0].category_slug;
                    const spend = entries.reduce((s,e) => s+e.amount, 0);
                    const value = entries.reduce((s,e) => s+e.dollar_value, 0);
                    const barPct = totalSpend > 0 ? (spend/totalSpend)*100 : 0;
                    return (
                      <div key={catName} className="rounded-2xl p-5" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-dim)" }}>
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base shrink-0"
                            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid var(--border-dim)" }}
                          >
                            {CATEGORY_ICONS[slug] ?? CATEGORY_ICONS.default}
                          </div>
                          <div className="flex-1">
                            <div className="text-[14px] font-semibold text-white">{catName}</div>
                            <div className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>{entries.length} transaction{entries.length !== 1 ? "s" : ""}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-[16px] font-bold text-white">${spend.toFixed(2)}</div>
                            <div className="text-[12px]" style={{ color: "#4ADE80" }}>+${value.toFixed(2)}</div>
                          </div>
                        </div>
                        <div className="h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.07)" }}>
                          <div className="h-full rounded-full maple-bg" style={{ width: `${barPct}%` }} />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
