"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/contexts/session-context";
import { useWallet } from "@/contexts/wallet-context";
import { getWalletSummary, getRecommendations, getPortfolioAnalysis } from "@/lib/api";
import { CreditCardVisual } from "@/components/cards/credit-card-visual";
import type { WalletSummary, CardScore, Card, PortfolioAnalysis } from "@/lib/types";
import { Check, Plus, TrendingUp, Zap, ChevronRight, Loader2, AlertTriangle, Target, DollarSign } from "lucide-react";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { AnimatedCounter } from "@/components/motion/counter";
import { AnimatedSection, AnimatedList, AnimatedItem } from "@/components/ui/animated-list";
import { SkeletonCard } from "@/components/ui/skeleton";

// Default spend profile for recommendations
const TYPICAL_SPEND = {
  groceries: 600,
  dining: 300,
  travel: 200,
  "gas-transit": 150,
  pharmacy: 100,
  entertainment: 100,
};

const CATEGORY_LABELS: Record<string, { emoji: string; name: string }> = {
  groceries:     { emoji: "🛒", name: "Groceries" },
  dining:        { emoji: "🍽️", name: "Dining" },
  travel:        { emoji: "✈️", name: "Travel" },
  "gas-transit": { emoji: "⛽", name: "Gas & Transit" },
  pharmacy:      { emoji: "💊", name: "Pharmacy" },
  entertainment: { emoji: "🎬", name: "Entertainment" },
};

export default function PortfolioPage() {
  const router = useRouter();
  const { sessionId, isReady } = useSession();
  const { wallet, addCard } = useWallet();

  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [recs, setRecs] = useState<CardScore[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [recsLoading, setRecsLoading] = useState(true);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [analysis, setAnalysis] = useState<PortfolioAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(true);

  useEffect(() => {
    if (!isReady || !sessionId) return;

    getWalletSummary(sessionId)
      .then(setSummary)
      .catch(console.error)
      .finally(() => setSummaryLoading(false));

    const walletCardIds = new Set(wallet.map(uc => uc.card_id));
    getRecommendations({ monthly_spend: TYPICAL_SPEND })
      .then(data => setRecs(data.filter(s => !walletCardIds.has(s.card_id)).slice(0, 6)))
      .catch(console.error)
      .finally(() => setRecsLoading(false));

    getPortfolioAnalysis(sessionId)
      .then(setAnalysis)
      .catch(console.error)
      .finally(() => setAnalysisLoading(false));
  }, [isReady, sessionId, wallet.length]);

  const handleAdd = async (cardId: string) => {
    try {
      await addCard(cardId);
      setAddedIds(p => new Set([...p, cardId]));
    } catch (e) {
      console.error(e);
    }
  };

  const maxValueHigh = summary
    ? Math.max(...summary.cards.map(c => c.value_high), 1)
    : 1;

  const hasWallet = wallet.length > 0;

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        className="orb w-[400px] h-[300px] top-[-60px] left-[-80px]"
        style={{ background: "radial-gradient(ellipse, rgba(13,148,136,0.07) 0%, transparent 70%)" }}
      />

      <div className="relative max-w-[680px] mx-auto px-6 pt-8 pb-24">
      {/* Page header */}
      <AnimatedSection className="mb-8">
        <p className="label-xs mb-1.5" style={{ color: "var(--text-tertiary)" }}>
          Portfolio
        </p>
        <h1 className="title text-white">Your Rewards Value</h1>
        <p className="text-[14px] mt-1" style={{ color: "var(--text-secondary)" }}>
          {hasWallet
            ? `${wallet.length} card${wallet.length !== 1 ? "s" : ""} in your wallet`
            : "Add cards to start tracking"}
        </p>
      </AnimatedSection>

      {/* ── Hero: Value Card ── */}
      {summaryLoading ? (
        <div className="rounded-2xl p-8 flex items-center justify-center mb-6"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", minHeight: "200px" }}>
          <Loader2 size={24} className="animate-spin" style={{ color: "rgba(255,255,255,0.3)" }} />
        </div>
      ) : summary && summary.cards.length > 0 ? (
        <div
          className="rounded-2xl p-6 mb-6 relative overflow-hidden"
          style={{
            background: "linear-gradient(135deg, rgba(13,148,136,0.12) 0%, rgba(15,10,18,0.95) 60%)",
            border: "1px solid rgba(13,148,136,0.22)",
          }}
        >
          {/* Subtle glow */}
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(13,148,136,0.15) 0%, transparent 70%)" }} />

          <p className="text-[10px] font-mono tracking-[0.18em] uppercase mb-3 flex items-center gap-1.5" style={{ color: "rgba(255,255,255,0.35)" }}>
            ESTIMATED ANNUAL VALUE
            <InfoTooltip term="net-annual-value" />
          </p>

          <div className="flex items-end gap-2 mb-1">
            <span className="text-5xl font-bold text-white tabular-nums">
              <AnimatedCounter value={Math.round(summary.value_range_low)} prefix="$" duration={1} />
            </span>
            <span className="text-2xl mb-1" style={{ color: "rgba(255,255,255,0.3)" }}>–</span>
            <span className="text-5xl font-bold tabular-nums" style={{ color: "#0D9488" }}>
              <AnimatedCounter value={Math.round(summary.value_range_high)} prefix="$" duration={1.2} />
            </span>
          </div>
          <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.38)" }}>
            CAD across {summary.cards.length} card{summary.cards.length !== 1 ? "s" : ""}
          </p>

          {/* Per-card bars */}
          <div className="space-y-3.5">
            {summary.cards.map(c => {
              const barPct = (c.value_high / maxValueHigh) * 100;
              return (
                <div key={c.card_id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.7)" }}>
                      {c.card_name}
                    </span>
                    <span className="text-xs font-mono tabular-nums" style={{ color: "rgba(255,255,255,0.45)" }}>
                      ${Math.round(c.value_low).toLocaleString()}–${Math.round(c.value_high).toLocaleString()}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{
                        width: `${barPct}%`,
                        background: "linear-gradient(90deg, #0D9488, #A78BFA)",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div
          className="rounded-2xl p-8 mb-6 text-center"
          style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <TrendingUp size={36} className="mx-auto mb-3" style={{ color: "rgba(255,255,255,0.15)" }} />
          <p className="font-semibold text-white mb-1">No cards in wallet</p>
          <p className="text-sm mb-4" style={{ color: "rgba(255,255,255,0.4)" }}>
            Add cards to see your estimated annual value
          </p>
          <button
            onClick={() => router.push("/cards")}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm"
            style={{ background: "#0D9488", color: "white" }}
          >
            <Plus size={15} /> Browse cards
          </button>
        </div>
      )}

      {/* ── Cards You Might Want ── */}
      <div className="mb-8">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Cards You Might Want</h2>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>Based on typical spending</p>
        </div>

        {recsLoading ? (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="flex-shrink-0 w-44 h-52 rounded-xl"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
              />
            ))}
          </div>
        ) : recs.length === 0 ? (
          <p className="text-sm py-4" style={{ color: "rgba(255,255,255,0.35)" }}>
            All top cards are already in your wallet.{" "}
            <Link href="/cards" style={{ color: "#0D9488" }}>Explore more →</Link>
          </p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-5 px-5">
            {recs.map(score => {
              const isAdded = addedIds.has(score.card_id);
              const cardForVisual: Card = {
                id: score.card_id,
                name: score.card_name,
                issuer: score.issuer,
                network: score.network as "visa" | "mastercard" | "amex",
                loyalty_program_id: "",
                annual_fee: score.annual_fee,
                welcome_bonus_points: score.welcome_bonus_points,
                welcome_bonus_min_spend: score.welcome_bonus_min_spend,
                welcome_bonus_months: score.welcome_bonus_months,
                is_active: true,
                created_at: "",
              };
              return (
                <div
                  key={score.card_id}
                  className="flex-shrink-0 w-44 rounded-2xl p-3 flex flex-col"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  <CreditCardVisual card={cardForVisual} size="sm" />
                  <p className="text-xs font-semibold text-white mt-2 leading-snug">{score.card_name}</p>
                  <p className="text-[11px] mt-0.5 flex-1" style={{ color: "rgba(255,255,255,0.35)" }}>
                    {score.loyalty_program}
                  </p>
                  <p className="text-sm font-bold mt-1.5" style={{ color: "#0D9488" }}>
                    ~${Math.max(0, Math.round(score.net_annual_value)).toLocaleString()}
                    <span className="text-[11px] font-normal" style={{ color: "rgba(255,255,255,0.35)" }}>/yr</span>
                  </p>
                  <button
                    onClick={() => handleAdd(score.card_id)}
                    disabled={isAdded}
                    className="w-full mt-2.5 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-all"
                    style={{
                      background: isAdded ? "rgba(255,255,255,0.05)" : "rgba(13,148,136,0.15)",
                      color: isAdded ? "rgba(255,255,255,0.35)" : "#0D9488",
                      border: `1px solid ${isAdded ? "rgba(255,255,255,0.08)" : "rgba(13,148,136,0.25)"}`,
                    }}
                  >
                    {isAdded ? <><Check size={11} /> Added</> : <><Plus size={11} /> Add</>}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Optimize Your Spend ── */}
      {hasWallet && (
        <div className="mb-8">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-lg font-bold text-white">Best Card Per Category</h2>
            <Link href="/optimizer" className="text-xs flex items-center gap-1" style={{ color: "#0D9488" }}>
              Run optimizer <ChevronRight size={12} />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(TYPICAL_SPEND).slice(0, 6).map(([slug, amount]) => {
              const cat = CATEGORY_LABELS[slug] ?? { emoji: "💳", name: slug };
              // Use wallet summary data if available, else show a simple placeholder
              const topCard = summary?.cards[0];
              return (
                <div
                  key={slug}
                  className="rounded-2xl p-4"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">{cat.emoji}</span>
                    <span className="text-xs font-semibold text-white">{cat.name}</span>
                  </div>
                  <p className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
                    ${amount}/mo
                  </p>
                  <div className="mt-2 flex items-center gap-1.5">
                    <Zap size={10} style={{ color: "#0D9488", flexShrink: 0 }} />
                    <p className="text-[11px] font-medium truncate" style={{ color: "rgba(255,255,255,0.6)" }}>
                      {topCard?.card_name ?? "Run optimizer"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <div
            className="mt-4 rounded-xl px-4 py-3 flex items-center justify-between"
            style={{ background: "rgba(13,148,136,0.07)", border: "1px solid rgba(13,148,136,0.15)" }}
          >
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>
              Get precise per-purchase recommendations
            </p>
            <Link
              href="/optimizer"
              className="text-sm font-semibold flex items-center gap-1 shrink-0 ml-3"
              style={{ color: "#0D9488" }}
            >
              Try it <ChevronRight size={13} />
            </Link>
          </div>
        </div>
      )}

      {/* ── Fee ROI Analysis ── */}
      {hasWallet && (
        <AnimatedSection delay={0.15} className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign size={16} style={{ color: "#0D9488" }} />
            <h2 className="text-lg font-bold text-white">Annual Fee ROI</h2>
          </div>

          {analysisLoading ? (
            <div className="space-y-3">
              <SkeletonCard /><SkeletonCard />
            </div>
          ) : analysis && analysis.fee_roi.length > 0 ? (
            <div className="space-y-3">
              {analysis.fee_roi.map(card => {
                const isPositive = card.net_roi >= 0;
                const hasNoFee = card.annual_fee === 0;
                return (
                  <div
                    key={card.card_id}
                    className="rounded-2xl p-5"
                    style={{
                      background: "var(--bg-elevated)",
                      border: isPositive
                        ? "1px solid rgba(52,211,153,0.25)"
                        : hasNoFee
                          ? "1px solid var(--border-dim)"
                          : "1px solid rgba(239,68,68,0.25)",
                    }}
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <h3 className="text-[14px] font-semibold text-white">{card.card_name}</h3>
                        <p className="text-[12px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                          {hasNoFee ? "No annual fee" : `$${card.annual_fee}/yr fee`}
                          {card.avg_return > 0 && ` · ${card.avg_return.toFixed(1)}% avg return`}
                        </p>
                      </div>
                      <span
                        className="label-xs px-2.5 py-1 rounded-full shrink-0"
                        style={{
                          background: isPositive
                            ? "rgba(52,211,153,0.12)"
                            : hasNoFee
                              ? "rgba(255,255,255,0.06)"
                              : "rgba(239,68,68,0.12)",
                          color: isPositive ? "#34D399" : hasNoFee ? "var(--text-tertiary)" : "#F87171",
                          border: isPositive
                            ? "1px solid rgba(52,211,153,0.25)"
                            : hasNoFee
                              ? "1px solid var(--border-dim)"
                              : "1px solid rgba(239,68,68,0.25)",
                        }}
                      >
                        {hasNoFee ? "Free" : isPositive ? `+$${card.net_roi.toFixed(0)}` : `-$${Math.abs(card.net_roi).toFixed(0)}`}
                      </span>
                    </div>

                    {/* ROI Bar */}
                    {!hasNoFee && (
                      <div className="mb-2">
                        <div className="flex justify-between text-[11px] mb-1.5">
                          <span style={{ color: "var(--text-tertiary)" }}>
                            ${card.value_earned.toFixed(0)} earned vs ${card.annual_fee} fee
                          </span>
                          <span className="font-semibold" style={{ color: isPositive ? "#34D399" : "#F87171" }}>
                            {card.value_earned > 0
                              ? `${((card.value_earned / card.annual_fee) * 100).toFixed(0)}%`
                              : "0%"}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${Math.min((card.value_earned / Math.max(card.annual_fee, 1)) * 100, 100)}%`,
                              background: isPositive
                                ? "linear-gradient(90deg, #34D399, #10B981)"
                                : "linear-gradient(90deg, #F87171, #EF4444)",
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Breakeven info */}
                    {!hasNoFee && card.breakeven_spend > 0 && card.value_earned < card.annual_fee && (
                      <p className="text-[11px] mt-2" style={{ color: "var(--text-tertiary)" }}>
                        Spend ~${card.breakeven_spend.toLocaleString()}/mo to justify this fee
                      </p>
                    )}
                    {hasNoFee && card.value_earned > 0 && (
                      <p className="text-[11px]" style={{ color: "#34D399" }}>
                        Pure profit — ${card.value_earned.toFixed(2)} earned with no fee
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div
              className="rounded-2xl p-6 text-center"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-dim)" }}
            >
              <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                Log spend via the optimizer to see fee ROI analysis
              </p>
            </div>
          )}
        </AnimatedSection>
      )}

      {/* ── Dollar Gap (Opportunity Cost) ── */}
      {hasWallet && (
        <AnimatedSection delay={0.2} className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={16} style={{ color: "#FBBF24" }} />
            <h2 className="text-lg font-bold text-white">Money Left on the Table</h2>
          </div>

          {analysisLoading ? (
            <div className="space-y-3">
              <SkeletonCard /><SkeletonCard />
            </div>
          ) : analysis && analysis.dollar_gap.entries.length > 0 ? (
            <>
              {/* Total gap hero */}
              <div
                className="rounded-2xl p-5 mb-3"
                style={{
                  background: analysis.dollar_gap.total_gap > 0
                    ? "linear-gradient(135deg, rgba(251,191,36,0.08), rgba(15,10,18,0.95))"
                    : "linear-gradient(135deg, rgba(52,211,153,0.08), rgba(15,10,18,0.95))",
                  border: analysis.dollar_gap.total_gap > 0
                    ? "1px solid rgba(251,191,36,0.2)"
                    : "1px solid rgba(52,211,153,0.2)",
                }}
              >
                <p className="text-[10px] font-mono tracking-[0.18em] uppercase mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>
                  POTENTIAL SAVINGS
                </p>
                <div className="flex items-end gap-2">
                  <span
                    className="text-3xl font-bold tabular-nums"
                    style={{ color: analysis.dollar_gap.total_gap > 0 ? "#FBBF24" : "#34D399" }}
                  >
                    ${analysis.dollar_gap.total_gap.toFixed(2)}
                  </span>
                  <span className="text-sm mb-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                    {analysis.dollar_gap.total_gap > 0 ? "missed" : "— already optimal!"}
                  </span>
                </div>
              </div>

              {/* Per-category breakdown */}
              <div
                className="rounded-2xl overflow-hidden"
                style={{ border: "1px solid var(--border-dim)" }}
              >
                {analysis.dollar_gap.entries.map((entry, i) => {
                  const hasGap = entry.gap > 0;
                  return (
                    <div
                      key={entry.category_name}
                      className="px-5 py-3.5 flex items-center justify-between"
                      style={{
                        background: "var(--bg-elevated)",
                        borderTop: i > 0 ? "1px solid var(--border-dim)" : "none",
                      }}
                    >
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-white">{entry.category_name}</p>
                        <p className="text-[11px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                          Used: {entry.card_used}
                          {hasGap && entry.optimal_card !== entry.card_used && (
                            <span style={{ color: "#FBBF24" }}> → Best: {entry.optimal_card}</span>
                          )}
                        </p>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        {hasGap ? (
                          <>
                            <p className="text-[13px] font-bold" style={{ color: "#FBBF24" }}>
                              -${entry.gap.toFixed(2)}
                            </p>
                            <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                              on ${entry.total_spend.toFixed(0)} spend
                            </p>
                          </>
                        ) : (
                          <p className="text-[12px] font-medium" style={{ color: "#34D399" }}>
                            Optimal ✓
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div
              className="rounded-2xl p-6 text-center"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-dim)" }}
            >
              <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                Log spend via the optimizer to see opportunity cost analysis
              </p>
            </div>
          )}
        </AnimatedSection>
      )}

      {/* ── Utilization Score ── */}
      {hasWallet && (
        <AnimatedSection delay={0.25} className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Target size={16} style={{ color: "#14B8A6" }} />
            <h2 className="text-lg font-bold text-white">Wallet Coverage</h2>
          </div>

          {analysisLoading ? (
            <SkeletonCard />
          ) : analysis && analysis.utilization.gaps.length > 0 ? (
            <>
              {/* Score hero */}
              <div
                className="rounded-2xl p-6 mb-3 flex items-center gap-6"
                style={{
                  background: "linear-gradient(135deg, rgba(13,148,136,0.08), rgba(15,10,18,0.95))",
                  border: "1px solid rgba(13,148,136,0.2)",
                }}
              >
                {/* Circular score */}
                <div className="relative w-20 h-20 shrink-0">
                  <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="6" />
                    <circle
                      cx="40" cy="40" r="34" fill="none"
                      stroke="#0D9488"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={`${analysis.utilization.score * 213.6} 213.6`}
                      className="transition-all duration-1000"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xl font-bold text-white">
                      {Math.round(analysis.utilization.score * 100)}%
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-white mb-1">
                    {analysis.utilization.covered_categories}/{analysis.utilization.total_categories} categories covered
                  </p>
                  <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    {analysis.utilization.score >= 0.8
                      ? "Great coverage! Your wallet handles most spend categories well."
                      : analysis.utilization.score >= 0.5
                        ? "Good start. Consider adding cards for uncovered categories."
                        : "You have gaps in several categories. Adding 1-2 cards could help."}
                  </p>
                </div>
              </div>

              {/* Category grid */}
              <div className="grid grid-cols-2 gap-2">
                {analysis.utilization.gaps.map(gap => (
                  <div
                    key={gap.category_name}
                    className="rounded-xl px-4 py-3"
                    style={{
                      background: gap.is_covered
                        ? "rgba(52,211,153,0.04)"
                        : "rgba(239,68,68,0.04)",
                      border: gap.is_covered
                        ? "1px solid rgba(52,211,153,0.15)"
                        : "1px solid rgba(239,68,68,0.15)",
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12px] font-medium text-white">{gap.category_name}</span>
                      <span
                        className="text-[10px] font-bold"
                        style={{ color: gap.is_covered ? "#34D399" : "#F87171" }}
                      >
                        {gap.wallet_return.toFixed(1)}%
                      </span>
                    </div>
                    <p className="text-[10px] truncate" style={{ color: "var(--text-tertiary)" }}>
                      {gap.best_card_in_wallet || "No card"}
                    </p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div
              className="rounded-2xl p-6 text-center"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-dim)" }}
            >
              <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                Add cards to see your wallet coverage analysis
              </p>
            </div>
          )}
        </AnimatedSection>
      )}

      {/* ── Onboarding CTA if wallet empty ── */}
      {!hasWallet && (
        <div
          className="rounded-2xl p-6 text-center"
          style={{
            background: "linear-gradient(135deg, rgba(13,148,136,0.08) 0%, rgba(8,9,14,0.8) 100%)",
            border: "1px solid rgba(13,148,136,0.18)",
          }}
        >
          <Zap size={28} className="mx-auto mb-3" style={{ color: "#0D9488" }} />
          <p className="font-semibold text-white mb-1">Get personalized recommendations</p>
          <p className="text-sm mb-4" style={{ color: "rgba(255,255,255,0.4)" }}>
            Answer 4 quick questions to find your perfect card stack
          </p>
          <button
            onClick={() => router.push("/onboarding")}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-[15px] text-white transition-all"
            style={{ background: "#0D9488" }}
          >
            Start quiz <ChevronRight size={16} />
          </button>
        </div>
      )}
      </div>
    </div>
  );
}
