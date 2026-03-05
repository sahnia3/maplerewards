"use client";

import { useState, useEffect } from "react";
import { getSpendLog, clearSpendLog } from "@/lib/api";
import type { SpendEntry } from "@/lib/api";

function fmtCAD(v: number) { return `$${v.toFixed(2)}`; }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

const CAT_ICONS: Record<string, string> = {
  groceries: "🛒", dining: "🍽️", travel: "✈️", gas: "⛽", transit: "🚇",
  entertainment: "🎬", streaming: "📺", pharmacy: "💊", "foreign-currency": "💱",
  "everything-else": "💳",
};

export default function InsightsPage() {
  const [log, setLog] = useState<SpendEntry[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setLog(getSpendLog()); setMounted(true); }, []);

  function handleClear() {
    clearSpendLog();
    setLog([]);
  }

  // Aggregations
  const totalSpend = log.reduce((s, e) => s + e.amount, 0);
  const totalValue = log.reduce((s, e) => s + e.dollar_value, 0);
  const totalPoints = log.reduce((s, e) => s + e.points_earned, 0);
  const avgReturn = totalSpend > 0 ? (totalValue / totalSpend) * 100 : 0;

  // By category
  const byCategory: Record<string, { spend: number; value: number; count: number; name: string }> = {};
  for (const e of log) {
    if (!byCategory[e.category_slug]) byCategory[e.category_slug] = { spend: 0, value: 0, count: 0, name: e.category_name };
    byCategory[e.category_slug].spend += e.amount;
    byCategory[e.category_slug].value += e.dollar_value;
    byCategory[e.category_slug].count += 1;
  }
  const catList = Object.entries(byCategory).sort((a, b) => b[1].spend - a[1].spend);
  const maxSpend = catList[0]?.[1].spend ?? 1;

  // By card
  const byCard: Record<string, { spend: number; value: number; count: number; name: string }> = {};
  for (const e of log) {
    if (!byCard[e.card_id]) byCard[e.card_id] = { spend: 0, value: 0, count: 0, name: e.card_name };
    byCard[e.card_id].spend += e.amount;
    byCard[e.card_id].value += e.dollar_value;
    byCard[e.card_id].count += 1;
  }
  const cardList = Object.entries(byCard).sort((a, b) => b[1].value - a[1].value);

  if (!mounted) return null;

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="orb w-[400px] h-[250px] top-[-60px] left-[-80px]"
        style={{ background: "radial-gradient(ellipse, rgba(59,130,246,0.07) 0%, transparent 70%)" }} />

      <div className="relative max-w-3xl mx-auto px-6 pt-28 pb-24">
        {/* Header */}
        <div className="flex items-end justify-between mb-8 fade-up">
          <div>
            <p className="label-xs mb-1.5" style={{ color: "var(--text-tertiary)" }}>Your rewards history</p>
            <h1 className="title text-white">Insights</h1>
          </div>
          {log.length > 0 && (
            <button onClick={handleClear} className="text-[13px] transition-colors"
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
            <div className="text-5xl mb-5">📊</div>
            <h2 className="text-[18px] font-semibold text-white mb-2">No spend data yet</h2>
            <p className="text-[14px] max-w-[280px] mx-auto mb-7 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Use the optimizer and tap &ldquo;Log spend&rdquo; on your best card to start tracking your rewards.
            </p>
            <a href="/" className="inline-flex items-center gap-2 h-11 px-6 rounded-xl font-semibold text-[14px] text-white maple-bg maple-glow">
              Go to optimizer →
            </a>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 fade-up-1">
              {[
                { label: "Total spend", value: fmtCAD(totalSpend), sub: "logged" },
                { label: "Total earned", value: fmtCAD(totalValue), sub: "CAD value", highlight: true },
                { label: "Avg return", value: `${avgReturn.toFixed(2)}%`, sub: "effective" },
                { label: "Points earned", value: Math.round(totalPoints).toLocaleString(), sub: "across cards" },
              ].map(({ label, value, sub, highlight }) => (
                <div key={label} className="rounded-2xl p-4"
                  style={{
                    background: highlight ? "linear-gradient(135deg, rgba(200,16,46,0.08), rgba(155,13,35,0.04))" : "var(--bg-elevated)",
                    border: highlight ? "1px solid rgba(200,16,46,0.2)" : "1px solid var(--border-dim)",
                  }}
                >
                  <div className="label-xs mb-2" style={{ color: "var(--text-tertiary)" }}>{label}</div>
                  <div className="text-[22px] font-bold tracking-tight" style={{ color: highlight ? "#E8173A" : "white" }}>{value}</div>
                  <div className="text-[12px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>{sub}</div>
                </div>
              ))}
            </div>

            {/* Spending by category */}
            {catList.length > 0 && (
              <div className="rounded-2xl p-5 fade-up-2"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-dim)" }}
              >
                <h2 className="text-[14px] font-semibold text-white mb-4">Spend by category</h2>
                <div className="space-y-3">
                  {catList.map(([slug, data]) => (
                    <div key={slug}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{CAT_ICONS[slug] ?? "💳"}</span>
                          <span className="text-[13px] font-medium text-white">{data.name}</span>
                          <span className="label-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.06)", color: "var(--text-tertiary)" }}>
                            {data.count}×
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[13px] font-semibold text-white">{fmtCAD(data.spend)}</span>
                          <span className="text-[12px] ml-2" style={{ color: "#4ADE80" }}>+{fmtCAD(data.value)}</span>
                        </div>
                      </div>
                      {/* Progress bar */}
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <div className="h-full rounded-full maple-bg transition-all duration-500"
                          style={{ width: `${(data.spend / maxSpend) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top cards */}
            {cardList.length > 0 && (
              <div className="rounded-2xl p-5 fade-up-3"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-dim)" }}
              >
                <h2 className="text-[14px] font-semibold text-white mb-4">Top performing cards</h2>
                <div className="space-y-3">
                  {cardList.map(([, data], i) => (
                    <div key={i} className="flex items-center justify-between py-2.5 px-3 rounded-xl"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[12px] font-bold"
                          style={{
                            background: i === 0 ? "linear-gradient(135deg,#C8102E,#9B0D23)" : "rgba(255,255,255,0.06)",
                            color: i === 0 ? "white" : "var(--text-tertiary)",
                          }}
                        >{i + 1}</div>
                        <div>
                          <div className="text-[13px] font-medium text-white">{data.name}</div>
                          <div className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>{data.count} transaction{data.count !== 1 ? "s" : ""}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[13px] font-semibold" style={{ color: i === 0 ? "#4ADE80" : "white" }}>{fmtCAD(data.value)}</div>
                        <div className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>{fmtCAD(data.spend)} spent</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent transactions */}
            <div className="rounded-2xl p-5 fade-up-4"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-dim)" }}
            >
              <h2 className="text-[14px] font-semibold text-white mb-4">Recent transactions</h2>
              <div className="space-y-1">
                {log.slice(0, 20).map(entry => (
                  <div key={entry.id} className="flex items-center justify-between py-2.5 px-3 rounded-xl transition-colors"
                    style={{ cursor: "default" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{CAT_ICONS[entry.category_slug] ?? "💳"}</span>
                      <div>
                        <div className="text-[13px] font-medium text-white">{entry.card_name}</div>
                        <div className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                          {entry.category_name} · {fmtDate(entry.date)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[13px] font-semibold text-white">{fmtCAD(entry.amount)}</div>
                      <div className="text-[12px]" style={{ color: "#4ADE80" }}>+{fmtCAD(entry.dollar_value)}</div>
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
