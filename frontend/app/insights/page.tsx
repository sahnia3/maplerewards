"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSession } from "@/contexts/session-context";
import { getSpendHistory, getSpendStats, getMissedRewards } from "@/lib/api";
import type { SpendEntry, SpendStats, MissedRewardsReport } from "@/lib/types";
import { PageMasthead } from "@/components/editorial/page-masthead";
import { Sparkline } from "@/components/editorial/sparkline";
import { LeafDivider } from "@/components/editorial/leaf-divider";

type DateRange = "7d" | "30d" | "90d" | "all";

const DATE_RANGES: { value: DateRange; label: string }[] = [
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
  { value: "all", label: "All" },
];

export default function InsightsPage() {
  const { sessionId, isReady } = useSession();
  const [allEntries, setAllEntries] = useState<SpendEntry[]>([]);
  const [stats, setStats] = useState<SpendStats | null>(null);
  const [missed, setMissed] = useState<MissedRewardsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>("all");

  const load = useCallback(async () => {
    if (!sessionId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const sinceDays = dateRange === "all" ? 0 : Number(dateRange.replace("d", ""));
    try {
      const [history, ss, mr] = await Promise.all([
        getSpendHistory(sessionId, 100, 0),
        getSpendStats(sessionId),
        getMissedRewards(sessionId, { sinceDays, top: 5 }).catch(() => null),
      ]);
      setAllEntries(history ?? []);
      setStats(ss);
      setMissed(mr);
    } catch {
      setAllEntries([]);
      setStats(null);
      setMissed(null);
    }
    setLoading(false);
  }, [sessionId, dateRange]);

  useEffect(() => {
    if (isReady) load();
  }, [isReady, load]);

  // Filter by date range
  const entries = useMemo(() => {
    if (dateRange === "all") return allEntries;
    const days = Number(dateRange.replace("d", ""));
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return allEntries.filter((e) => new Date(e.spent_at).getTime() >= cutoff);
  }, [allEntries, dateRange]);

  const totalSpend = entries.reduce((s, e) => s + e.amount, 0);
  const totalValue = entries.reduce((s, e) => s + e.dollar_value, 0);
  const totalPoints = entries.reduce((s, e) => s + e.points_earned, 0);
  const avgReturn = totalSpend > 0 ? (totalValue / totalSpend) * 100 : 0;

  // Per-card aggregation (for ProgramRow-style ledger)
  const byCard = useMemo(() => {
    const m: Record<string, { name: string; spend: number; value: number; trend: number[]; count: number }> = {};
    for (const e of entries) {
      const k = e.card_name ?? "Unknown";
      if (!m[k]) m[k] = { name: k, spend: 0, value: 0, trend: [], count: 0 };
      m[k].spend += e.amount;
      m[k].value += e.dollar_value;
      m[k].count += 1;
    }
    // Build trend per card from entries chronologically
    const sorted = [...entries].sort((a, b) => a.spent_at.localeCompare(b.spent_at));
    const trendMap: Record<string, number[]> = {};
    const running: Record<string, number> = {};
    for (const e of sorted) {
      running[e.card_name ?? "Unknown"] = (running[e.card_name ?? "Unknown"] ?? 0) + e.dollar_value;
      Object.keys(running).forEach((k) => {
        if (!trendMap[k]) trendMap[k] = [];
        trendMap[k].push(running[k]);
      });
    }
    return Object.values(m)
      .map((c) => ({ ...c, trend: trendMap[c.name] ?? [0, c.value] }))
      .sort((a, b) => b.value - a.value);
  }, [entries]);

  // Per-category
  const byCategory = useMemo(() => {
    const m: Record<string, { name: string; spend: number; value: number; count: number; share: number }> = {};
    for (const e of entries) {
      const k = e.category_name ?? "Other";
      if (!m[k]) m[k] = { name: k, spend: 0, value: 0, count: 0, share: 0 };
      m[k].spend += e.amount;
      m[k].value += e.dollar_value;
      m[k].count += 1;
    }
    const total = totalSpend || 1;
    return Object.values(m)
      .map((c) => ({ ...c, share: c.spend / total }))
      .sort((a, b) => b.spend - a.spend);
  }, [entries, totalSpend]);

  return (
    <div className="reveal" style={{ paddingTop: 0 }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px clamp(20px, 4vw, 60px) 80px" }}>
        <PageMasthead
          eyebrow="Insights"
          eyebrowEnd="Per category · per card"
          title={
            <>
              The <span style={{ fontStyle: "italic" }}>spending</span> brief.
            </>
          }
          lede="Where every dollar earned, where every dollar leaked, and which card-category pairs most need re-routing."
          cta={
            allEntries.length > 0 ? (
              <div
                className="mono"
                style={{
                  display: "flex",
                  alignItems: "center",
                  border: "1px solid var(--rule)",
                  borderRadius: 999,
                  padding: 2,
                }}
              >
                {DATE_RANGES.map((dr) => (
                  <button
                    key={dr.value}
                    onClick={() => setDateRange(dr.value)}
                    style={{
                      padding: "5px 12px",
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      background: dateRange === dr.value ? "var(--accent)" : "transparent",
                      color: dateRange === dr.value ? "#fff" : "var(--ink-3)",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    {dr.label}
                  </button>
                ))}
              </div>
            ) : undefined
          }
        />

        {loading ? (
          <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)", letterSpacing: "0.10em" }}>
            LOADING…
          </div>
        ) : entries.length === 0 ? (
          <EmptyInsights />
        ) : (
          <>
            {/* ── KPI strip ──────────────────────────────────────────── */}
            <section
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 0,
                borderTop: "1px solid var(--ink)",
                borderBottom: "1px solid var(--rule)",
                marginBottom: 40,
              }}
              className="insights-kpi"
            >
              <KPI label="Total spend" value={`$${totalSpend.toLocaleString("en-CA", { maximumFractionDigits: 0 })}`} sub={`${entries.length} txns`} />
              <KPI label="Earned value" value={`$${totalValue.toFixed(2)}`} sub={`${avgReturn.toFixed(2)}% avg return`} subColor="var(--gain)" />
              <KPI label="Points earned" value={Math.round(totalPoints).toLocaleString()} sub="across cards" />
              <KPI
                label="Recoverable"
                value={`$${(missed?.total_gap ?? 0).toFixed(2)}`}
                sub={`${missed?.missed_count ?? 0} txns mis-routed`}
                subColor={(missed?.total_gap ?? 0) > 0 ? "var(--accent)" : "var(--ink-3)"}
                accent={(missed?.total_gap ?? 0) > 0}
              />
            </section>

            {/* ── Card ledger (program-row pattern) ───────────────────── */}
            <section style={{ marginBottom: 48 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 18 }}>
                <div>
                  <span className="eyebrow">Card ledger</span>
                  <h2 className="display" style={{ fontSize: 28, margin: "4px 0 0", letterSpacing: "-0.005em" }}>
                    Earnings by card
                  </h2>
                </div>
                <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  {byCard.length} card{byCard.length === 1 ? "" : "s"} · sorted by value
                </span>
              </div>
              <div style={{ borderTop: "1px solid var(--ink)" }}>
                {byCard.map((c, i) => (
                  <CardLedgerRow key={c.name} index={i} {...c} />
                ))}
              </div>
            </section>

            <LeafDivider />

            {/* ── Category breakdown ──────────────────────────────────── */}
            <section style={{ marginBottom: 48, marginTop: 32 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 18 }}>
                <div>
                  <span className="eyebrow">Category brief</span>
                  <h2 className="display" style={{ fontSize: 28, margin: "4px 0 0", letterSpacing: "-0.005em" }}>
                    Where it goes
                  </h2>
                </div>
                <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  {byCategory.length} categor{byCategory.length === 1 ? "y" : "ies"}
                </span>
              </div>
              <div style={{ borderTop: "1px solid var(--ink)" }}>
                {byCategory.map((c, i) => (
                  <CategoryRow key={c.name} index={i} {...c} />
                ))}
              </div>
            </section>

            {/* ── Recoverable / missed-rewards summary ────────────────── */}
            {missed && missed.top_missed && missed.top_missed.length > 0 && (
              <>
                <LeafDivider />
                <section style={{ marginTop: 32 }}>
                  <div style={{ marginBottom: 18 }}>
                    <span className="eyebrow">Mis-routed</span>
                    <h2 className="display" style={{ fontSize: 28, margin: "4px 0 0" }}>
                      Money <span style={{ fontStyle: "italic", color: "var(--accent)" }}>left on the table</span>
                    </h2>
                    <p className="serif" style={{ fontSize: 14, fontStyle: "italic", color: "var(--ink-2)", marginTop: 6 }}>
                      Transactions where a different card in your wallet would have earned more.
                    </p>
                  </div>
                  <div style={{ borderTop: "1px solid var(--ink)" }}>
                    {missed.top_missed.map((m, i) => (
                      <div
                        key={m.spend_entry_id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "40px 1fr 110px 100px",
                          alignItems: "center",
                          gap: 16,
                          padding: "16px 4px",
                          borderTop: "1px solid var(--rule)",
                        }}
                      >
                        <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.10em" }}>
                          {String(i + 1).padStart(2, "0")}
                        </div>
                        <div>
                          <div className="display" style={{ fontSize: 17, fontStyle: "italic" }}>
                            ${m.amount.toFixed(0)} on {m.category_name.toLowerCase()}
                          </div>
                          <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
                            Used <span style={{ color: "var(--ink-2)" }}>{m.actual_card_name}</span> · should have used <span style={{ color: "var(--accent)" }}>{m.optimal_card_name}</span>
                          </div>
                        </div>
                        <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)", textAlign: "right" }}>
                          {new Date(m.spent_at).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div className="display" style={{ fontSize: 20, fontStyle: "italic", color: "var(--accent)" }}>
                            +${m.gap.toFixed(2)}
                          </div>
                          <div className="mono" style={{ fontSize: 9, color: "var(--ink-3)", letterSpacing: "0.10em", textTransform: "uppercase" }}>
                            recoverable
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ── Subcomponents ─────────────────────────────────────────────────────── */

function KPI({
  label,
  value,
  sub,
  subColor,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  subColor?: string;
  /* When true, the value reads as a brand moment — maple color +
   * gradient underline. Used for the Recoverable cell when there's
   * money on the table. */
  accent?: boolean;
}) {
  return (
    <div
      style={{
        padding: "22px 24px",
        borderRight: "1px solid var(--rule)",
        minWidth: 0,
        position: "relative",
      }}
    >
      <div className="eyebrow" style={{ marginBottom: 10 }}>{label}</div>
      <div style={{ position: "relative", display: "inline-block" }}>
        <div
          className="display"
          style={{
            fontSize: accent ? 40 : 36,
            lineHeight: 1,
            color: accent ? "var(--accent)" : "var(--ink)",
            letterSpacing: "-0.01em",
            fontStyle: accent ? "italic" : "normal",
          }}
        >
          {value}
        </div>
        {accent && (
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: 0,
              right: "-4px",
              bottom: -4,
              height: 4,
              background:
                "linear-gradient(90deg, var(--accent) 0%, var(--accent-glow) 70%, transparent 100%)",
              borderRadius: 2,
            }}
          />
        )}
      </div>
      {sub && (
        <div
          className="mono"
          style={{ marginTop: accent ? 14 : 8, fontSize: 11, color: subColor ?? "var(--ink-3)", letterSpacing: "0.04em" }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

function CardLedgerRow({
  index,
  name,
  spend,
  value,
  trend,
  count,
}: {
  index: number;
  name: string;
  spend: number;
  value: number;
  trend: number[];
  count: number;
}) {
  const ret = spend > 0 ? (value / spend) * 100 : 0;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "40px 1fr 140px 130px",
        alignItems: "center",
        gap: 16,
        padding: "20px 4px",
        borderTop: "1px solid var(--rule)",
      }}
      className="card-ledger-row"
    >
      <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.10em" }}>
        {String(index + 1).padStart(2, "0")}
      </span>
      <div>
        <div className="display" style={{ fontSize: 19, fontStyle: "italic", lineHeight: 1.1, color: "var(--ink)" }}>
          {name}
        </div>
        <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
          {count} txn{count === 1 ? "" : "s"} · ${spend.toFixed(0)} spent
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
        <Sparkline data={trend.length > 1 ? trend : [0, value]} width={120} height={28} color="var(--accent)" />
      </div>
      <div style={{ textAlign: "right" }}>
        <div className="display" style={{ fontSize: 22, color: "var(--ink)" }}>
          ${value.toFixed(2)}
        </div>
        <div className="mono" style={{ fontSize: 9, color: ret >= 2 ? "var(--gain)" : "var(--ink-3)", letterSpacing: "0.10em", textTransform: "uppercase", marginTop: 2 }}>
          {ret.toFixed(2)}% return
        </div>
      </div>
    </div>
  );
}

function CategoryRow({
  index,
  name,
  spend,
  value,
  count,
  share,
}: {
  index: number;
  name: string;
  spend: number;
  value: number;
  count: number;
  share: number;
}) {
  const ret = spend > 0 ? (value / spend) * 100 : 0;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "40px 1fr 1fr 140px 100px",
        alignItems: "center",
        gap: 16,
        padding: "18px 4px",
        borderTop: "1px solid var(--rule)",
      }}
      className="category-row"
    >
      <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.10em" }}>
        {String(index + 1).padStart(2, "0")}
      </span>
      <div>
        <div className="display" style={{ fontSize: 18, fontStyle: "italic", color: "var(--ink)" }}>
          {name}
        </div>
        <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
          {count} txn{count === 1 ? "" : "s"}
        </div>
      </div>
      <div>
        <div style={{ height: 4, background: "var(--rule)", position: "relative", overflow: "hidden" }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              right: `${(1 - share) * 100}%`,
              background: "var(--accent)",
            }}
          />
        </div>
        <div className="mono" style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 5, letterSpacing: "0.06em" }}>
          {(share * 100).toFixed(0)}% of spend
        </div>
      </div>
      <div className="mono" style={{ fontSize: 13, color: "var(--ink-2)", textAlign: "right" }}>
        ${spend.toFixed(0)}
      </div>
      <div style={{ textAlign: "right" }}>
        <div className="display" style={{ fontSize: 18, color: "var(--ink)" }}>
          ${value.toFixed(2)}
        </div>
        <div className="mono" style={{ fontSize: 9, color: ret >= 2 ? "var(--gain)" : "var(--ink-3)", letterSpacing: "0.10em", marginTop: 2 }}>
          {ret.toFixed(1)}% return
        </div>
      </div>
    </div>
  );
}

function EmptyInsights() {
  return (
    <div
      style={{
        padding: "64px 32px",
        textAlign: "center",
        border: "1px dashed var(--rule-strong)",
        borderRadius: 14,
        background: "var(--card-fill)",
      }}
    >
      <span className="eyebrow">Empty ledger</span>
      <h3 className="display" style={{ fontSize: 32, margin: "8px 0 8px" }}>
        Nothing logged yet.
      </h3>
      <p
        className="serif"
        style={{
          fontSize: 16,
          fontStyle: "italic",
          color: "var(--ink-2)",
          maxWidth: 420,
          marginInline: "auto",
          marginBottom: 22,
          lineHeight: 1.4,
        }}
      >
        Use the optimizer to rank cards, then tap <span className="mono" style={{ fontStyle: "normal", fontSize: 13 }}>Log this purchase</span> on the winner. Your ledger
        builds itself.
      </p>
      <Link
        href="/optimizer"
        className="mono"
        style={{
          display: "inline-block",
          padding: "12px 22px",
          background: "var(--accent)",
          color: "#fff",
          borderRadius: 10,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.10em",
          textTransform: "uppercase",
          textDecoration: "none",
        }}
      >
        Open optimizer →
      </Link>
    </div>
  );
}
