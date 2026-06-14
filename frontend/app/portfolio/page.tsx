"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/contexts/session-context";
import { useWallet } from "@/contexts/wallet-context";
import { useReportableError } from "@/lib/use-reportable-error";
import { getWalletSummary, getRecommendations, getPortfolioAnalysis, getCardCredits, getSQCProjection, getCardValueSummary } from "@/lib/api";
import { CreditCardVisual } from "@/components/cards/credit-card-visual";
import type { WalletSummary, CardScore, Card, PortfolioAnalysis, CardCreditStatus, SQCProjection, CardValueSummary } from "@/lib/types";
import { Check, Plus, TrendingUp, Zap, ChevronRight, Loader2, AlertTriangle, Target, DollarSign, Gift, CalendarClock, Plane, Award } from "lucide-react";
import { PageMasthead } from "@/components/editorial/page-masthead";
import { Term } from "@/components/term";
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

const CATEGORY_LABELS: Record<string, { name: string }> = {
  groceries:     { name: "Groceries" },
  dining:        { name: "Dining" },
  travel:        { name: "Travel" },
  "gas-transit": { name: "Gas & Transit" },
  pharmacy:      { name: "Pharmacy" },
  entertainment: { name: "Entertainment" },
};

export default function PortfolioPage() {
  const router = useRouter();
  const { sessionId, isReady } = useSession();
  const { wallet, addCard, isLoading: walletLoading } = useWallet();

  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [recs, setRecs] = useState<CardScore[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [recsLoading, setRecsLoading] = useState(true);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [analysis, setAnalysis] = useState<PortfolioAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(true);
  const [credits, setCredits] = useState<CardCreditStatus[]>([]);
  const [creditsLoading, setCreditsLoading] = useState(true);
  const [sqc, setSQC] = useState<SQCProjection | null>(null);
  const [sqcLoading, setSQCLoading] = useState(true);
  const [cardValues, setCardValues] = useState<CardValueSummary[]>([]);
  const [cardValuesLoading, setCardValuesLoading] = useState(true);

  // Per-section fetch errors. Without these a backend blip leaves each section
  // in its EMPTY/false state — most dangerously, a failed summary rendered the
  // "No cards in your wallet" block to a user who DOES have cards (audit 3,
  // frontend HIGH). Each section now shows an error banner + retry instead.
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [recsError, setRecsError] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [creditsError, setCreditsError] = useState<string | null>(null);
  const [sqcError, setSQCError] = useState<string | null>(null);
  const [cardValuesError, setCardValuesError] = useState<string | null>(null);

  const reportSummary = useReportableError("portfolio.summary");
  const reportRecs = useReportableError("portfolio.recommendations");
  const reportAnalysis = useReportableError("portfolio.analysis");
  const reportCredits = useReportableError("portfolio.credits");
  const reportSQC = useReportableError("portfolio.sqc");
  const reportCardValues = useReportableError("portfolio.cardValues");
  const reportAdd = useReportableError("portfolio.addCard");

  // Each loader is independently re-callable so its error banner's "Try again"
  // re-fetches only that section, and clears its own error on each attempt.
  const errMessage = (e: unknown) =>
    e instanceof Error ? e.message : "Couldn't load this section.";

  const loadSummary = useCallback((sid: string) => {
    setSummaryLoading(true);
    setSummaryError(null);
    getWalletSummary(sid)
      .then(setSummary)
      .catch(e => { reportSummary(e); setSummaryError(errMessage(e)); })
      .finally(() => setSummaryLoading(false));
  }, [reportSummary]);

  const loadRecs = useCallback((walletCardIds: Set<string>) => {
    setRecsLoading(true);
    setRecsError(null);
    getRecommendations({ monthly_spend: TYPICAL_SPEND })
      .then(data => setRecs(data.filter(s => !walletCardIds.has(s.card_id)).slice(0, 6)))
      .catch(e => { reportRecs(e); setRecsError(errMessage(e)); })
      .finally(() => setRecsLoading(false));
  }, [reportRecs]);

  const loadAnalysis = useCallback((sid: string) => {
    setAnalysisLoading(true);
    setAnalysisError(null);
    getPortfolioAnalysis(sid)
      .then(setAnalysis)
      .catch(e => { reportAnalysis(e); setAnalysisError(errMessage(e)); })
      .finally(() => setAnalysisLoading(false));
  }, [reportAnalysis]);

  const loadCredits = useCallback((sid: string) => {
    setCreditsLoading(true);
    setCreditsError(null);
    getCardCredits(sid)
      .then(setCredits)
      .catch(e => { reportCredits(e); setCreditsError(errMessage(e)); })
      .finally(() => setCreditsLoading(false));
  }, [reportCredits]);

  const loadSQC = useCallback((sid: string) => {
    setSQCLoading(true);
    setSQCError(null);
    getSQCProjection(sid)
      .then(setSQC)
      .catch(e => { reportSQC(e); setSQCError(errMessage(e)); })
      .finally(() => setSQCLoading(false));
  }, [reportSQC]);

  const loadCardValues = useCallback((sid: string) => {
    setCardValuesLoading(true);
    setCardValuesError(null);
    getCardValueSummary(sid)
      .then(setCardValues)
      .catch(e => { reportCardValues(e); setCardValuesError(errMessage(e)); })
      .finally(() => setCardValuesLoading(false));
  }, [reportCardValues]);

  useEffect(() => {
    if (!isReady || !sessionId) return;
    loadSummary(sessionId);
    loadRecs(new Set(wallet.map(uc => uc.card_id)));
    loadAnalysis(sessionId);
    loadCredits(sessionId);
    loadSQC(sessionId);
    loadCardValues(sessionId);
    // wallet.length (not wallet) by design: re-fetch when the card COUNT
    // changes, not on every wallet-array identity change. The wallet-card-id
    // Set is rebuilt inside the effect from the current wallet each run.
  }, [isReady, sessionId, wallet.length, loadSummary, loadRecs, loadAnalysis, loadCredits, loadSQC, loadCardValues]);

  const handleAdd = async (cardId: string) => {
    try {
      await addCard(cardId);
      setAddedIds(p => new Set([...p, cardId]));
    } catch (e) {
      reportAdd(e);
    }
  };

  // Net annual value (earning power on logged/typical spend + modelled perks
  // − fee) is a DIFFERENT thing from the redemption value of points you hold.
  // The page now shows both, labelled, instead of passing off held-points
  // value as "annual value".
  const cvById = new Map(cardValues.map(cv => [cv.card_id, cv]));
  const totalNetEV = cardValues.reduce((s, cv) => s + cv.net_ev_cad, 0);
  const haveCardValues = cardValues.length > 0;

  const hasWallet = wallet.length > 0;

  // Real per-category best card, keyed by category display name, sourced from
  // the portfolio analysis (utilization.gaps[].best_card_in_wallet). Replaces
  // the previous placeholder that printed the first wallet card for every
  // category regardless of earn rates.
  const bestCardByCategory = useMemo(() => {
    const m: Record<string, string> = {};
    for (const g of analysis?.utilization.gaps ?? []) {
      if (g.best_card_in_wallet) m[g.category_name] = g.best_card_in_wallet;
    }
    return m;
  }, [analysis]);

  // Fresh user: no cards in wallet AND wallet finished loading. Skip the
  // spinner gauntlet — we already know the analysis tiles will be empty,
  // so render the onboarding CTA immediately. Without this the user sees
  // 4 separate loading skeletons cycle through before discovering there's
  // nothing to display.
  if (!walletLoading && !hasWallet) {
    return (
      <div className="reveal" style={{ paddingTop: 0 }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px clamp(20px, 4vw, 60px) 80px" }}>
          <PageMasthead
            eyebrow="Portfolio"
            eyebrowEnd="0 cards · CAD"
            title={<>The <span style={{ color: "var(--accent)" }}>annual</span> ledger.</>}
            lede="Your point balances valued from base redemption up to the best transfer-partner rate — plus modeled card-perk value (insurance, lounge, credits) where we have it."
          />
          <PortfolioEmptyState onStart={() => router.push("/onboarding")} />
        </div>
      </div>
    );
  }

  return (
    <div className="reveal" style={{ paddingTop: 0 }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px clamp(20px, 4vw, 60px) 80px" }}>
      <PageMasthead
        eyebrow="Portfolio"
        eyebrowEnd={`${wallet.length} card${wallet.length === 1 ? "" : "s"} · CAD`}
        title={<>The <span style={{ color: "var(--accent)" }}>annual</span> ledger.</>}
        lede="Insurance, lounge access, multipliers, and credits — modeled as expected dollar value, net of fees, against the spend you actually log."
      />

      {/* ── Editorial KPI ledger ── */}
      {summaryLoading ? (
        <div
          style={{
            border: "1px solid var(--rule)",
            borderRadius: 14,
            background: "var(--card-fill)",
            padding: "32px",
            marginBottom: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 160,
          }}
        >
          <Loader2 size={20} className="animate-spin" style={{ color: "var(--ink-3)" }} />
        </div>
      ) : summaryError ? (
        <div style={{ marginBottom: 26 }}>
          <SectionError
            message={`We couldn't load your annual ledger. ${summaryError}`}
            onRetry={() => sessionId && loadSummary(sessionId)}
          />
        </div>
      ) : summary && summary.cards.length > 0 ? (
        <>
          <div
            style={{
              borderTop: "1px solid var(--ink)",
              borderBottom: "1px solid var(--rule)",
              padding: "26px 0 30px",
              marginBottom: 26,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
              <span className="eyebrow" style={{ color: "var(--accent)" }}>Estimated annual value</span>
              <span className="mr-kicker-line" style={{ maxWidth: 80 }} />
              <span className="mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                <Term k="net-annual-value" />
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
              {haveCardValues ? (
                <span className="display" style={{ fontSize: "clamp(46px, 6vw, 72px)", lineHeight: 0.95, color: "var(--accent)", fontStyle: "italic" }}>
                  <AnimatedCounter value={Math.round(totalNetEV)} prefix="$" duration={1.2} />
                </span>
              ) : (
                <>
                  <span className="display" style={{ fontSize: "clamp(46px, 6vw, 72px)", lineHeight: 0.95, color: "var(--ink)", fontStyle: "italic" }}>
                    <AnimatedCounter value={Math.round(summary.value_range_low)} prefix="$" duration={1} />
                  </span>
                  <span className="display" style={{ fontSize: 32, color: "var(--ink-3)", lineHeight: 0.95 }}>—</span>
                  <span className="display" style={{ fontSize: "clamp(46px, 6vw, 72px)", lineHeight: 0.95, color: "var(--accent)", fontStyle: "italic" }}>
                    <AnimatedCounter value={Math.round(summary.value_range_high)} prefix="$" duration={1.2} />
                  </span>
                </>
              )}
            </div>
            <p className="serif" style={{ fontStyle: "italic", color: "var(--ink-2)", fontSize: 16, marginTop: 8, marginBottom: 0, lineHeight: 1.45 }}>
              {haveCardValues ? (
                <>
                  Net annual value across {summary.cards.length} card{summary.cards.length !== 1 ? "s" : ""} — category earning on your logged/typical spend plus modelled perks, <strong>after annual fees</strong>. Separately, the points you currently hold are worth{" "}
                  <span className="mono" style={{ fontStyle: "normal", color: "var(--ink)" }}>
                    ${Math.round(summary.value_range_low).toLocaleString()}–${Math.round(summary.value_range_high).toLocaleString()}
                  </span>{" "}
                  at redemption (not added in — that's value you already have).
                </>
              ) : (
                <>CAD — redemption value of the points you currently hold, base rate rising to the best transfer-partner rate. (Per-card annual value loading…)</>
              )}
            </p>
          </div>

          {/* Per-card ledger — two DISTINCT, labelled figures: the card's
              net annual value (earn + perks − fee) and, separately, the
              redemption value of points held on it. Never conflated. */}
          <div style={{ marginBottom: 32 }}>
            <div
              className="m-grid-1"
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) 170px 150px",
                gap: 16,
                marginBottom: 12,
              }}
            >
              <span className="eyebrow">Per-card breakdown</span>
              <span className="eyebrow" style={{ textAlign: "right" }}>Net annual value</span>
              <span className="eyebrow" style={{ textAlign: "right" }}>Held points</span>
            </div>
            <div style={{ borderTop: "1px solid var(--ink)" }}>
              {summary.cards.map(c => {
                const cv = cvById.get(c.card_id);
                const net = cv?.net_ev_cad;
                const netColor =
                  net == null ? "var(--ink-3)" : net >= 0 ? "var(--gain)" : "var(--loss)";
                return (
                  <div
                    key={c.card_id}
                    className="m-grid-1"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) 170px 150px",
                      gap: 16,
                      alignItems: "center",
                      padding: "14px 4px",
                      borderBottom: "1px solid var(--rule)",
                    }}
                  >
                    <div className="display" style={{ fontSize: 18, color: "var(--ink)", lineHeight: 1.15, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.card_name}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="mono" style={{ fontSize: 15, color: netColor, letterSpacing: "0.02em" }}>
                        {net == null
                          ? "—"
                          : `${net < 0 ? "−" : ""}$${Math.abs(Math.round(net)).toLocaleString()}/yr`}
                      </div>
                      <div className="serif" style={{ fontSize: 10, fontStyle: "italic", color: "var(--ink-3)", marginTop: 2 }}>
                        {cv ? "earn + perks − fee" : "loading…"}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="mono" style={{ fontSize: 13, color: "var(--ink-2)", letterSpacing: "0.02em" }}>
                        ${Math.round(c.value_low).toLocaleString()}–${Math.round(c.value_high).toLocaleString()}
                      </div>
                      <div className="serif" style={{ fontSize: 10, fontStyle: "italic", color: "var(--ink-3)", marginTop: 2 }}>
                        points held, at redemption
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <div
          style={{
            border: "1px solid var(--rule)",
            borderRadius: 14,
            background: "var(--card-fill)",
            padding: "40px 32px",
            textAlign: "center",
            marginBottom: 26,
          }}
        >
          <TrendingUp size={28} style={{ color: "var(--ink-3)", margin: "0 auto 14px" }} />
          <h3 className="display" style={{ fontSize: 26, margin: 0 }}>No cards in your wallet.</h3>
          <p className="serif" style={{ fontStyle: "italic", color: "var(--ink-2)", fontSize: 15, marginTop: 8, marginBottom: 18 }}>
            Add cards to see your estimated annual value.
          </p>
          <button
            onClick={() => router.push("/cards")}
            className="mono"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 22px",
              borderRadius: 8,
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            <Plus size={13} /> Browse cards
          </button>
        </div>
      )}

      {/* ── Cards we'd add ── */}
      <section style={{ marginBottom: 36 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <h2 className="display" style={{ fontSize: 26, margin: 0 }}>Cards we&apos;d add.</h2>
          <span className="eyebrow">Based on typical Canadian spend</span>
        </div>
        {recsLoading ? (
          <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4 }}>
            {[...Array(3)].map((_, i) => (
              <div key={i} className="shimmer" style={{ flexShrink: 0, width: 220, height: 220, borderRadius: 14 }} />
            ))}
          </div>
        ) : recsError ? (
          <SectionError
            message={`We couldn't load card recommendations. ${recsError}`}
            onRetry={() => loadRecs(new Set(wallet.map(uc => uc.card_id)))}
          />
        ) : recs.length === 0 ? (
          <p className="serif" style={{ fontStyle: "italic", color: "var(--ink-3)", fontSize: 14 }}>
            All top cards are already in your wallet. <Link href="/cards" style={{ color: "var(--accent)" }}>Explore more →</Link>
          </p>
        ) : (
          <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 6 }}>
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
                  style={{
                    flexShrink: 0,
                    width: 220,
                    border: "1px solid var(--rule)",
                    background: "var(--card-fill)",
                    borderRadius: 14,
                    padding: 14,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <CreditCardVisual card={cardForVisual} size="sm" />
                  <div>
                    <div className="display" style={{ fontSize: 16, lineHeight: 1.15 }}>{score.card_name}</div>
                    <div className="serif" style={{ fontSize: 12, fontStyle: "italic", color: "var(--ink-3)", marginTop: 2 }}>
                      {score.loyalty_program}
                    </div>
                  </div>
                  <div className="mono" style={{ fontSize: 13, color: "var(--accent)", fontWeight: 600, letterSpacing: "0.02em" }}>
                    ~${Math.max(0, Math.round(score.net_annual_value)).toLocaleString()}
                    <span style={{ fontSize: 11, color: "var(--ink-3)", marginLeft: 4, fontWeight: 400 }}>/yr</span>
                  </div>
                  <button
                    onClick={() => handleAdd(score.card_id)}
                    disabled={isAdded}
                    className="mono"
                    style={{
                      padding: "8px 14px",
                      borderRadius: 999,
                      border: `1px solid ${isAdded ? "var(--rule)" : "var(--accent)"}`,
                      background: isAdded ? "transparent" : "var(--accent)",
                      color: isAdded ? "var(--ink-3)" : "#fff",
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.10em",
                      textTransform: "uppercase",
                      cursor: isAdded ? "default" : "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    {isAdded ? <><Check size={11} /> Added</> : <><Plus size={11} /> Add card</>}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Best card per category ── */}
      {hasWallet && (
        <section style={{ marginBottom: 36 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
            <h2 className="display" style={{ fontSize: 26, margin: 0 }}>Best card, per category.</h2>
            <Link href="/optimizer" className="mono" style={{ fontSize: 11, color: "var(--accent)", letterSpacing: "0.10em", textTransform: "uppercase", textDecoration: "none" }}>
              Run optimizer →
            </Link>
          </div>
          {analysisError ? (
            <SectionError
              message={`We couldn't load your category analysis. ${analysisError}`}
              onRetry={() => sessionId && loadAnalysis(sessionId)}
            />
          ) : (
          <div className="portfolio-cat-grid m-grid-2" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {Object.entries(TYPICAL_SPEND).slice(0, 6).map(([slug, amount]) => {
              const cat = CATEGORY_LABELS[slug] ?? { name: slug };
              // Real per-category winner from the analysis. While the analysis
              // is still loading we show a skeleton dash; if it loaded but has
              // no card for this category, point the user at the optimizer.
              const bestCard = bestCardByCategory[cat.name];
              return (
                <div
                  key={slug}
                  style={{
                    border: "1px solid var(--rule)",
                    borderRadius: 12,
                    background: "var(--card-fill)",
                    padding: "14px 16px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <span className="eyebrow">{cat.name}</span>
                    <span className="mono" style={{ fontSize: 11, color: "var(--ink-2)" }}>${amount}/mo</span>
                  </div>
                  <div
                    className="display"
                    style={{ fontSize: 16, lineHeight: 1.2, color: analysisLoading || !bestCard ? "var(--ink-3)" : "var(--ink)" }}
                  >
                    {analysisLoading ? "…" : bestCard ?? "Run optimizer"}
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </section>
      )}

      {/* ── Annual card value (insurance + lounge + multipliers + credits) ── */}
      {hasWallet && cardValuesError && !cardValuesLoading && (
        <section style={{ marginBottom: 36 }}>
          <div className="flex items-center gap-2 mb-4">
            <Award size={16} style={{ color: "var(--accent)" }} />
            <h2 className="display" style={{ fontSize: 22 }}>Annual card value (true ROI)</h2>
          </div>
          <SectionError
            message={`We couldn't load per-card annual value. ${cardValuesError}`}
            onRetry={() => sessionId && loadCardValues(sessionId)}
          />
        </section>
      )}
      {hasWallet && !cardValuesError && !cardValuesLoading && cardValues.length > 0 && (
        <AnimatedSection delay={0.08} className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Award size={16} style={{ color: "var(--accent)" }} />
            <h2 className="display" style={{ fontSize: 22 }}>Annual card value (true ROI)</h2>
          </div>
          <div className="space-y-3">
            {cardValues.filter(c => c.components.length > 0).map(card => (
              <div
                key={card.card_id}
                className="rounded-2xl p-5"
                style={{
                  background: "var(--card-fill)",
                  border: card.is_positive ? "1px solid var(--gain)" : "1px solid var(--rule)",
                }}
              >
                <div className="flex items-baseline justify-between mb-3">
                  <div>
                    <div className="display" style={{ fontSize: 16 }}>{card.card_name}</div>
                    <div className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>${card.annual_fee.toFixed(0)}/yr fee</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[18px] font-bold tabular-nums" style={{ color: card.is_positive ? "var(--gain)" : "var(--loss)" }}>
                      {card.net_ev_cad >= 0 ? "+" : ""}${card.net_ev_cad.toFixed(0)}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--ink-3)" }}>net of fee</div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {card.components.map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-[12px]">
                      <span style={{ color: "var(--text-secondary)" }}>
                        <span className="font-mono uppercase tracking-wider text-[10px] mr-2 px-1.5 py-0.5 rounded" style={{ background: "var(--card-fill)", color: "var(--text-tertiary)" }}>
                          {c.component_type}
                        </span>
                        {c.description}
                      </span>
                      <span className="mono" style={{ fontWeight: 600, color: "var(--ink)", marginLeft: 12, flexShrink: 0 }}>${c.annual_ev_cad.toFixed(0)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] mt-3" style={{ color: "var(--text-tertiary)" }}>
            Insurance valued at probability-weighted expected payout (~3% trip-cancel + 1% device + 5% medical claim rate). Lounge at C$30/visit revealed value × 6 visits/yr default.
          </p>
        </AnimatedSection>
      )}

      {/* ── 2026 Aeroplan SQC elite-status projector ── */}
      {hasWallet && sqcError && !sqcLoading && (
        <section style={{ marginBottom: 36 }}>
          <div className="flex items-center gap-2 mb-4">
            <Plane size={16} style={{ color: "var(--accent)" }} />
            <h2 className="display" style={{ fontSize: 22 }}>Aeroplan Elite Status</h2>
          </div>
          <SectionError
            message={`We couldn't load your SQC projection. ${sqcError}`}
            onRetry={() => sessionId && loadSQC(sessionId)}
          />
        </section>
      )}
      {hasWallet && !sqcError && !sqcLoading && sqc && !sqc.wallet_has_no_aeroplan_cards && (
        <AnimatedSection delay={0.1} className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Plane size={16} style={{ color: "var(--accent)" }} />
            <h2 className="display" style={{ fontSize: 22 }}>Aeroplan Elite Status ({sqc.year})</h2>
          </div>

          <div
            className="rounded-2xl p-5"
            style={{
              background: "var(--card-fill)",
              border: "1px solid var(--rule)",
            }}
          >
            {/* SQC headline */}
            <div className="flex items-end justify-between mb-3">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-[0.18em]" style={{ color: "var(--text-tertiary)" }}>
                  Total SQC earned (YTD)
                </div>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="display" style={{ fontSize: 36, fontStyle: "italic" }}>{sqc.total_sqc_earned.toLocaleString()}</span>
                  <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>SQC</span>
                </div>
                {sqc.current_tier && (
                  <div
                    className="inline-flex items-center gap-1.5 mt-2 px-2 py-1 rounded-lg text-[11px] font-semibold"
                    style={{ background: "var(--accent-soft)", border: "1px solid var(--accent)", color: "var(--accent)" }}
                  >
                    Current: Aeroplan {sqc.current_tier}
                  </div>
                )}
              </div>
              {sqc.next_tier && (
                <div className="text-right">
                  <div className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>Next tier</div>
                  <div className="display" style={{ fontSize: 22, fontStyle: "italic" }}>Aeroplan {sqc.next_tier}</div>
                  <div className="text-[12px] mt-0.5" style={{ color: "var(--gold)" }}>
                    {sqc.sqc_to_next_tier?.toLocaleString()} SQC to go
                  </div>
                </div>
              )}
            </div>

            {/* Progress bar to next tier */}
            {sqc.next_tier && sqc.sqc_to_next_tier != null && (
              <>
                {(() => {
                  const nextThreshold = sqc.tiers.find(t => t.status_level === sqc.next_tier);
                  if (!nextThreshold) return null;
                  const pct = Math.min((sqc.total_sqc_earned / nextThreshold.sqc_required) * 100, 100);
                  return (
                    <div className="mb-4">
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--rule)" }}>
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, background: "var(--accent)" }}
                        />
                      </div>
                      <div className="flex items-baseline justify-between mt-1.5">
                        <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                          {sqc.total_sqc_earned.toLocaleString()} / {nextThreshold.sqc_required.toLocaleString()} SQC
                        </span>
                        {sqc.spend_to_next_tier != null && sqc.best_card_for_gap && (
                          <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                            ~${Math.round(sqc.spend_to_next_tier).toLocaleString()} more on{" "}
                            <span className="display">{sqc.best_card_for_gap}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}

            {/* Per-card breakdown */}
            <div className="space-y-2 mt-4">
              {sqc.cards.map((c) => (
                <div
                  key={c.card_id}
                  className="flex items-center justify-between py-2 px-3 rounded-xl"
                  style={{ background: "var(--card-fill)", border: "1px solid var(--rule)" }}
                >
                  <div className="min-w-0 mr-3">
                    <div className="display" style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.card_name}</div>
                    <div className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                      ${c.dollars_per_sqc}/SQC · ${c.ytd_spend.toLocaleString()} spent
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="mono" style={{ fontSize: 14, color: "var(--ink)", fontWeight: 600 }}>
                      {c.sqc_earned.toLocaleString()}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>SQC</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Disclosure */}
            <p className="text-[10px] mt-3" style={{ color: "var(--text-tertiary)" }}>
              Card spend only. Excludes flight/partner SQC. Status revenue floors apply at 50K+ tiers.
            </p>
          </div>
        </AnimatedSection>
      )}

      {/* ── Card Credits + Annual-Fee Countdown ── */}
      {hasWallet && creditsError && !creditsLoading && (
        <section style={{ marginBottom: 36 }}>
          <div className="flex items-center gap-2 mb-4">
            <Gift size={16} style={{ color: "var(--accent)" }} />
            <h2 className="display" style={{ fontSize: 22 }}>Credits & Renewals</h2>
          </div>
          <SectionError
            message={`We couldn't load your card credits. ${creditsError}`}
            onRetry={() => sessionId && loadCredits(sessionId)}
          />
        </section>
      )}
      {hasWallet && !creditsError && !creditsLoading && credits.length > 0 && (
        <AnimatedSection delay={0.12} className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Gift size={16} style={{ color: "var(--accent)" }} />
            <h2 className="display" style={{ fontSize: 22 }}>Credits & Renewals</h2>
          </div>

          {(() => {
            // Group credits by card.
            const byCard: Record<string, { name: string; fee: number; renewal?: string; days?: number; items: CardCreditStatus[] }> = {};
            for (const c of credits) {
              const key = c.card_id;
              if (!byCard[key]) {
                byCard[key] = {
                  name: c.card_name,
                  fee: c.card_annual_fee,
                  renewal: c.fee_renewal_date,
                  days: c.days_to_renewal,
                  items: [],
                };
              }
              byCard[key].items.push(c);
            }
            return (
              <div className="space-y-3">
                {Object.entries(byCard).map(([cardId, group]) => {
                  const totalValue = group.items.reduce((s, c) => s + c.value_cad, 0);
                  const totalRedeemed = group.items.reduce((s, c) => s + c.redeemed_amount, 0);
                  const totalRemaining = totalValue - totalRedeemed;
                  const percentRedeemed = totalValue > 0 ? (totalRedeemed / totalValue) * 100 : 0;

                  // Renewal urgency: <30 days = red, <90 = amber, else neutral.
                  const urgent = group.days != null && group.days >= 0 && group.days <= 30;
                  const soon = group.days != null && group.days > 30 && group.days <= 90;

                  return (
                    <div
                      key={cardId}
                      className="rounded-2xl p-5"
                      style={{
                        background: "var(--card-fill)",
                        border: "1px solid var(--rule)",
                      }}
                    >
                      {/* Card header + renewal countdown */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="min-w-0">
                          <div className="display" style={{ fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{group.name}</div>
                          <div className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                            ${group.fee.toFixed(0)}/yr fee
                          </div>
                        </div>
                        {group.days != null && group.renewal && (
                          <div
                            className="flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-lg"
                            style={{
                              background: urgent
                                ? "var(--accent-soft)"
                                : soon
                                  ? "var(--gold-tint)"
                                  : "var(--card-fill)",
                              color: urgent ? "var(--accent)" : soon ? "var(--gold)" : "var(--ink-3)",
                              border: urgent
                                ? "1px solid var(--accent)"
                                : soon
                                  ? "1px solid var(--gold-soft)"
                                  : "1px solid var(--rule)",
                            }}
                          >
                            <CalendarClock size={11} />
                            {group.days >= 0
                              ? `${group.days}d to renewal`
                              : `${-group.days}d overdue`}
                          </div>
                        )}
                      </div>

                      {/* Total bar */}
                      <div className="mb-4">
                        <div className="flex items-baseline justify-between mb-1.5">
                          <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                            Credits used
                          </span>
                          <span className="mono" style={{ fontSize: 14, color: "var(--ink)", fontWeight: 600 }}>
                            ${totalRedeemed.toFixed(0)} / ${totalValue.toFixed(0)}
                            <span className="ml-1.5 text-[11px]" style={{ color: totalRemaining > 0 ? "var(--gold)" : "var(--gain)" }}>
                              {totalRemaining > 0 ? `$${totalRemaining.toFixed(0)} unused` : "all used"}
                            </span>
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--rule)" }}>
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(percentRedeemed, 100)}%`,
                              background: percentRedeemed >= 100 ? "var(--gain)" : "var(--accent)",
                            }}
                          />
                        </div>
                      </div>

                      {/* Per-credit list */}
                      <div className="space-y-2">
                        {group.items.map((c) => (
                          <div
                            key={c.credit_def_id}
                            className="flex items-center justify-between py-2 px-3 rounded-xl"
                            style={{
                              background: "var(--card-fill)",
                              border: "1px solid var(--rule)",
                            }}
                          >
                            <div className="min-w-0 mr-3">
                              <div className="display" style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {c.name}
                                {c.recurrence !== "annual" && (
                                  <span
                                    className="ml-1.5 text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded"
                                    style={{
                                      background: "var(--surface-2)",
                                      color: "var(--ink-3)",
                                    }}
                                  >
                                    {c.recurrence}
                                  </span>
                                )}
                              </div>
                              {c.description && (
                                <div className="text-[11px] truncate" style={{ color: "var(--text-tertiary)" }}>
                                  {c.description}
                                </div>
                              )}
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div
                                className="text-[12.5px] font-semibold tabular-nums"
                                style={{
                                  color: c.status === "redeemed" ? "var(--gain)" : c.status === "partial" ? "var(--gold)" : "var(--ink)",
                                }}
                              >
                                ${c.redeemed_amount.toFixed(0)} / ${c.value_cad.toFixed(0)}
                              </div>
                              <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                                {c.status}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </AnimatedSection>
      )}

      {/* ── Fee ROI Analysis ── */}
      {hasWallet && (
        <AnimatedSection delay={0.15} className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign size={16} style={{ color: "var(--accent)" }} />
            <h2 className="display" style={{ fontSize: 22 }}>Annual Fee ROI</h2>
          </div>

          {analysisLoading ? (
            <div className="space-y-3">
              <SkeletonCard /><SkeletonCard />
            </div>
          ) : analysisError ? (
            <SectionError
              message={`We couldn't load fee ROI analysis. ${analysisError}`}
              onRetry={() => sessionId && loadAnalysis(sessionId)}
            />
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
                      background: "var(--card-fill)",
                      border: isPositive
                        ? "1px solid var(--gain-soft)"
                        : hasNoFee
                          ? "1px solid var(--rule)"
                          : "1px solid var(--accent-soft)",
                    }}
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <h3 className="display" style={{ fontSize: 16 }}>{card.card_name}</h3>
                        <p className="text-[12px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                          {hasNoFee ? "No annual fee" : `$${card.annual_fee}/yr fee`}
                          {card.avg_return > 0 && ` · ${card.avg_return.toFixed(1)}% avg return`}
                        </p>
                      </div>
                      <span
                        className="label-xs px-2.5 py-1 rounded-full shrink-0"
                        style={{
                          background: isPositive
                            ? "var(--gain-soft)"
                            : hasNoFee
                              ? "var(--rule)"
                              : "var(--accent-soft)",
                          color: isPositive ? "var(--gain)" : hasNoFee ? "var(--ink-3)" : "var(--loss)",
                          border: isPositive
                            ? "1px solid var(--gain-soft)"
                            : hasNoFee
                              ? "1px solid var(--rule)"
                              : "1px solid var(--accent-soft)",
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
                          <span className="font-semibold" style={{ color: isPositive ? "var(--gain)" : "var(--loss)" }}>
                            {card.value_earned > 0
                              ? `${((card.value_earned / card.annual_fee) * 100).toFixed(0)}%`
                              : "0%"}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--rule)" }}>
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${Math.min((card.value_earned / Math.max(card.annual_fee, 1)) * 100, 100)}%`,
                              background: isPositive ? "var(--gain)" : "var(--loss)",
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
                      <p className="text-[11px]" style={{ color: "var(--gain)" }}>
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
              style={{ background: "var(--card-fill)", border: "1px solid var(--rule)" }}
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
            <AlertTriangle size={16} style={{ color: "var(--gold)" }} />
            <h2 className="display" style={{ fontSize: 22 }}>Money Left on the Table</h2>
          </div>

          {analysisLoading ? (
            <div className="space-y-3">
              <SkeletonCard /><SkeletonCard />
            </div>
          ) : analysisError ? (
            <SectionError
              message={`We couldn't load opportunity-cost analysis. ${analysisError}`}
              onRetry={() => sessionId && loadAnalysis(sessionId)}
            />
          ) : analysis && analysis.dollar_gap.entries.length > 0 ? (
            <>
              {/* Total gap hero — editorial rule */}
              <div
                style={{
                  borderTop: "1px solid var(--ink)",
                  borderBottom: "1px solid var(--rule)",
                  padding: "20px 0 22px",
                  marginBottom: 14,
                }}
              >
                <span className="eyebrow">Potential savings</span>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
                  <span
                    className="display"
                    style={{
                      fontSize: 44,
                      fontStyle: "italic",
                      lineHeight: 1,
                      color: (analysis.dollar_gap.total_gap ?? 0) > 0 ? "var(--accent)" : "var(--gain)",
                    }}
                  >
                    ${(analysis.dollar_gap.total_gap ?? 0).toFixed(2)}
                  </span>
                  <span className="serif" style={{ fontSize: 15, fontStyle: "italic", color: "var(--ink-3)" }}>
                    {(analysis.dollar_gap.total_gap ?? 0) > 0 ? "missed last cycle" : "— already optimal!"}
                  </span>
                </div>
              </div>

              {/* Per-category breakdown */}
              <div
                className="rounded-2xl overflow-hidden"
                style={{ border: "1px solid var(--rule)" }}
              >
                {analysis.dollar_gap.entries.map((entry, i) => {
                  const hasGap = entry.gap > 0;
                  return (
                    <div
                      key={entry.category_name}
                      className="px-5 py-3.5 flex items-center justify-between"
                      style={{
                        background: "var(--card-fill)",
                        borderTop: i > 0 ? "1px solid var(--rule)" : "none",
                      }}
                    >
                      <div className="min-w-0">
                        <p className="mono" style={{ fontSize: 13, color: "var(--ink)" }}>{entry.category_name}</p>
                        <p className="text-[11px] mt-0.5" style={{ color: "var(--ink-3)" }}>
                          Used: {entry.card_used}
                          {hasGap && entry.optimal_card !== entry.card_used && (
                            <span style={{ color: "var(--gold)" }}> → Best: {entry.optimal_card}</span>
                          )}
                        </p>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        {hasGap ? (
                          <>
                            <p className="text-[13px] font-bold" style={{ color: "var(--gold)" }}>
                              -${entry.gap.toFixed(2)}
                            </p>
                            <p className="text-[10px]" style={{ color: "var(--ink-3)" }}>
                              on ${entry.total_spend.toFixed(0)} spend
                            </p>
                          </>
                        ) : (
                          <p className="text-[12px] font-medium" style={{ color: "var(--gain)" }}>
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
              style={{ background: "var(--card-fill)", border: "1px solid var(--rule)" }}
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
            <Target size={16} style={{ color: "var(--accent)" }} />
            <h2 className="display" style={{ fontSize: 22 }}>Wallet Coverage</h2>
          </div>

          {analysisLoading ? (
            <SkeletonCard />
          ) : analysisError ? (
            <SectionError
              message={`We couldn't load wallet-coverage analysis. ${analysisError}`}
              onRetry={() => sessionId && loadAnalysis(sessionId)}
            />
          ) : analysis && analysis.utilization.gaps.length > 0 ? (
            <>
              {/* Score hero — editorial */}
              <div
                style={{
                  border: "1px solid var(--rule)",
                  borderRadius: 14,
                  background: "var(--card-fill-strong)",
                  padding: "20px 22px",
                  marginBottom: 14,
                  display: "flex",
                  alignItems: "center",
                  gap: 22,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ position: "relative", width: 88, height: 88, flexShrink: 0 }}>
                  <svg width="88" height="88" viewBox="0 0 88 88" style={{ transform: "rotate(-90deg)" }}>
                    <circle cx="44" cy="44" r="38" fill="none" stroke="var(--rule)" strokeWidth="3" />
                    <circle
                      cx="44" cy="44" r="38" fill="none"
                      stroke="var(--accent)"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray={`${(analysis.utilization.score ?? 0) * 238.76} 238.76`}
                      style={{ transition: "stroke-dasharray 1s cubic-bezier(.16,1,.3,1)" }}
                    />
                  </svg>
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span className="display" style={{ fontSize: 22, fontStyle: "italic", color: "var(--ink)" }}>
                      {Math.round((analysis.utilization.score ?? 0) * 100)}%
                    </span>
                  </div>
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h3 className="display" style={{ fontSize: 22, margin: 0, lineHeight: 1.15 }}>
                    {analysis.utilization.covered_categories ?? 0}/{analysis.utilization.total_categories ?? 0} categories covered
                  </h3>
                  <p className="serif" style={{ fontStyle: "italic", color: "var(--ink-2)", fontSize: 14, marginTop: 4, lineHeight: 1.45 }}>
                    {(analysis.utilization.score ?? 0) >= 0.8
                      ? "Great coverage. Your wallet handles most categories well."
                      : (analysis.utilization.score ?? 0) >= 0.5
                        ? "Good start. Consider adding cards for the uncovered categories."
                        : "Gaps in several categories. Adding one or two more cards would help."}
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
                        ? "var(--gain-soft)"
                        : "var(--accent-wash)",
                      border: gap.is_covered
                        ? "1px solid var(--gain-soft)"
                        : "1px solid var(--accent-soft)",
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="mono" style={{ fontSize: 12, color: "var(--ink)", fontWeight: 600 }}>{gap.category_name}</span>
                      <span
                        className="text-[10px] font-bold"
                        style={{ color: gap.is_covered ? "var(--gain)" : "var(--loss)" }}
                      >
                        {gap.wallet_return.toFixed(1)}%
                      </span>
                    </div>
                    <p className="text-[10px] truncate" style={{ color: "var(--ink-3)" }}>
                      {gap.best_card_in_wallet || "No card"}
                    </p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div
              className="rounded-2xl p-6 text-center"
              style={{ background: "var(--card-fill)", border: "1px solid var(--rule)" }}
            >
              <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                Add cards to see your wallet coverage analysis
              </p>
            </div>
          )}
        </AnimatedSection>
      )}

      {/* ── Onboarding CTA if wallet empty — editorial ── */}
      {!hasWallet && (
        <div
          style={{
            borderTop: "1px solid var(--ink)",
            borderBottom: "1px solid var(--rule)",
            padding: "30px 0 32px",
            textAlign: "center",
          }}
        >
          <span className="eyebrow" style={{ color: "var(--accent)" }}>Build a wallet</span>
          <h3 className="display" style={{ fontSize: "clamp(28px, 4vw, 40px)", margin: "10px 0 0", lineHeight: 1, fontStyle: "italic" }}>
            Four questions, one stack.
          </h3>
          <p className="serif" style={{ fontStyle: "italic", color: "var(--ink-2)", fontSize: 16, marginTop: 10, marginBottom: 18 }}>
            Answer four quick questions and we&apos;ll model your perfect Canadian card stack.
          </p>
          <button
            onClick={() => router.push("/onboarding")}
            className="mono"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "14px 26px",
              borderRadius: 8,
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Start quiz <ChevronRight size={14} />
          </button>
        </div>
      )}
      </div>
    </div>
  );
}

/* ── Per-section error banner ─────────────────────────────────────────────
 * Matches the inline error+retry pattern used on /wallet and /insights:
 * accent-ruled card, italic serif message, mono "Try again" button. Used so a
 * failed fetch shows an error a user can recover from, never an empty state
 * that misrepresents their data (e.g. "No cards" when the summary call blipped). */
function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      style={{
        border: "1px solid var(--accent)",
        borderLeft: "3px solid var(--accent)",
        borderRadius: 14,
        padding: "20px 24px",
        background: "var(--card-fill)",
      }}
    >
      <p className="serif" style={{ fontStyle: "italic", color: "var(--accent)", fontSize: 15, margin: 0 }}>
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mono"
        style={{
          marginTop: 10,
          background: "transparent",
          border: "1px solid var(--rule-strong)",
          color: "var(--ink-2)",
          padding: "8px 16px",
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: "0.10em",
          textTransform: "uppercase",
          cursor: "pointer",
        }}
      >
        Try again →
      </button>
    </div>
  );
}

/* ── Empty-state helper for fresh users with no cards ─────────────────────── */

function PortfolioEmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div
      style={{
        marginTop: 40,
        borderTop: "1px solid var(--ink)",
        borderBottom: "1px solid var(--rule)",
        padding: "60px 20px",
        textAlign: "center",
      }}
    >
      <span className="eyebrow" style={{ color: "var(--accent)" }}>No cards yet</span>
      <h3
        className="display"
        style={{
          fontSize: "clamp(28px, 4vw, 40px)",
          margin: "12px 0 0",
          lineHeight: 1.05,
        }}
      >
        Build a wallet first.
      </h3>
      <p
        className="serif"
        style={{
          fontStyle: "italic",
          color: "var(--ink-2)",
          fontSize: 16,
          maxWidth: 520,
          margin: "12px auto 24px",
          lineHeight: 1.55,
        }}
      >
        The portfolio ledger needs at least one card to model insurance, lounge access,
        multipliers, and credits. Take the four-question quiz and we&apos;ll seed your stack.
      </p>
      <button
        onClick={onStart}
        className="mono"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "14px 26px",
          borderRadius: 8,
          background: "var(--accent)",
          color: "#fff",
          border: "none",
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.10em",
          textTransform: "uppercase",
          cursor: "pointer",
        }}
      >
        Start quiz <ChevronRight size={14} />
      </button>
    </div>
  );
}
