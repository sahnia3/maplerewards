"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { useSession } from "@/contexts/session-context";
import { useWallet } from "@/contexts/wallet-context";
import { useAuth } from "@/contexts/auth-context";
import {
  getWalletSummary,
  getSpendHistory,
  getMissedRewards,
  getPortfolioAnalysis,
  getPointsSeries,
} from "@/lib/api";
import type {
  WalletSummary,
  SpendEntry,
  MissedRewardsReport,
  PortfolioAnalysis,
  PointsSeries,
} from "@/lib/types";

import { CardFan } from "@/components/editorial/card-fan";
import { LandingHeroDemo } from "@/components/marketing/landing-hero-demo";
import { LandingKineticProof } from "@/components/marketing/landing-kinetic-proof";
import { WaitlistForm } from "@/components/marketing/waitlist-form";
import { Counter } from "@/components/editorial/counter";
import { Term } from "@/components/ui/term";
import { MiniFlowArrow } from "@/components/editorial/dataviz";
import { WalletGaugeCard } from "@/components/home/wallet-gauge-card";
import { CoverageCard } from "@/components/home/coverage-card";
import { PointsChartCard } from "@/components/home/points-chart-card";

/* ─────────────────────────────────────────────────────────────────────────────
 * Authenticated home — a single, inviting first-login hero.
 *
 * Replaces the old triple-rendered metric surface (hero stats + FintechCommand
 * + BriefCard trio all repeated wallet value / CPP / recoverable). There is now
 * ONE coherent stat surface, folded into the masthead, plus the real "best move
 * today" derived from the missed-rewards report (links to /optimizer).
 *
 * Everything on screen is live data: wallet value + points + programs from the
 * wallet summary, the best card / category / dollar gap from the missed-rewards
 * report, and the real recent-activity ledger. No fabricated literals.
 *
 * Motion: a staggered framer-motion entrance on mount that respects
 * prefers-reduced-motion (and the settings-page reduce-motion attr — the
 * variants collapse to a no-op when reduced motion is requested).
 * ───────────────────────────────────────────────────────────────────────────── */

/* Staggered first-login entrance. Editorial, not bouncy: short distance,
 * confident ease, children cascade. `initial` is disabled at the call site
 * when reduced motion is requested, so this never animates in that mode. */
const EASE = [0.2, 0.7, 0.2, 1] as const;

const heroContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.07, delayChildren: 0.04 },
  },
};

const heroItem: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

const heroArt: Variants = {
  hidden: { opacity: 0, x: 28, scale: 0.96 },
  show: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: { duration: 0.8, ease: EASE, delay: 0.1 },
  },
};

export default function HomePage() {
  const router = useRouter();
  const { sessionId, isReady } = useSession();
  const { wallet, isLoading: walletLoading } = useWallet();
  const { user, isAuthenticated, isPro } = useAuth();
  const [walletSummary, setWalletSummary] = useState<WalletSummary | null>(null);
  const [recentSpend, setRecentSpend] = useState<SpendEntry[]>([]);
  const [missed, setMissed] = useState<MissedRewardsReport | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioAnalysis | null>(null);
  const [pointsSeries, setPointsSeries] = useState<PointsSeries | null>(null);
  const redirectedRef = useRef(false);

  // Referral code from a shared waitlist link (/?ref=CODE). Read from
  // window.location instead of useSearchParams so the page needs no
  // Suspense boundary. Lazy initializer, not an effect: the value never
  // affects rendered DOM (it only rides along in the waitlist POST body),
  // so the server/client initial-value difference can't cause a hydration
  // mismatch.
  const [waitlistRef] = useState(() =>
    typeof window === "undefined"
      ? ""
      : new URLSearchParams(window.location.search).get("ref") ?? "",
  );

  // Redirect AUTHENTICATED users with an empty wallet to onboarding.
  // Unauthenticated visitors stay on this page and see the marketing landing — no auto-redirect.
  useEffect(() => {
    if (!isReady || walletLoading || redirectedRef.current) return;
    if (isAuthenticated && wallet.length === 0) {
      redirectedRef.current = true;
      router.replace("/onboarding");
    }
  }, [isReady, walletLoading, wallet.length, isAuthenticated, router]);

  const loadDashboardData = useCallback(async () => {
    // Authenticated wallets only — anonymous visitors have a session id but
    // no auth, so these calls would just 401 in the console (P2-1).
    if (!isReady || !isAuthenticated || !sessionId) return;
    try {
      const [summary, spend, missedReport, portfolioAnalysis, points] = await Promise.all([
        getWalletSummary(sessionId),
        getSpendHistory(sessionId, 5, 0).catch(() => []),
        // Missed-rewards is Pro-gated server-side; skip the guaranteed-402
        // request for free users and let the existing missed=null fallback run.
        isPro
          ? getMissedRewards(sessionId, { sinceDays: 90, top: 1 }).catch(() => null)
          : Promise.resolve(null),
        // Coverage card + points chart — both degrade to null on failure so
        // their sections simply don't render (no thrown error, no console 4xx).
        getPortfolioAnalysis(sessionId).catch(() => null),
        getPointsSeries(sessionId, 6).catch(() => null),
      ]);
      setWalletSummary(summary);
      setRecentSpend(spend ?? []);
      setMissed(missedReport);
      setPortfolio(portfolioAnalysis);
      setPointsSeries(points);
    } catch {
      setWalletSummary(null);
    }
  }, [isReady, isAuthenticated, isPro, sessionId]);

  useEffect(() => { loadDashboardData(); }, [loadDashboardData]);

  // Honour both prefers-reduced-motion AND the settings-page reduce-motion
  // toggle (the variants collapse to a no-op when reduced motion is on; the
  // globals.css attr selector also zeroes any residual transition).
  const reduceMotion = useReducedMotion();

  // Effective points = manual balances + points earned from logged spend, as
  // computed by the wallet summary (the same source the sidebar/portfolio read),
  // so every surface shows the same number.
  const totalPoints = walletSummary?.total_points ?? 0;
  // Headline uses base CPP so it reconciles exactly with /wallet's "Est. value
  // (base CPP)" — the two surfaces previously showed different wallet totals
  // (base vs sweet-spot) and read as the engine disagreeing with itself. The
  // sweet-spot ceiling is shown as an "up to" upside, not a second total.
  const totalValue = walletSummary?.value_range_low ?? 0;
  const totalValueHigh = walletSummary?.value_range_high ?? 0;
  // Sweet-spot is the headline figure in the redesign's stat ribbon and the
  // gold ceiling on the wallet gauge. Falls back to base when the engine
  // didn't produce a distinct sweet-spot (pure-cashback wallet).
  const totalValueSweet = walletSummary?.value_sweet_spot ?? totalValue;
  const cardsCount = wallet.length;
  // Distinct loyalty programs, not card count — four Aeroplan cards are one
  // program, not four. Empty program_name (pure-cashback cards) doesn't count.
  const programsCount = walletSummary
    ? new Set(walletSummary.cards.map((c) => c.program_name).filter(Boolean)).size
    : 0;

  // First-name greeting for the masthead.
  const firstName =
    isAuthenticated && user?.display_name ? user.display_name.split(" ")[0] : null;

  // Best card right now — strictly from the missed-rewards report. No
  // fabricated fallback: the hero only renders these when `hasBestMove` is
  // true (a real by_category[0] with a positive gap).
  const bestCardName = missed?.by_category?.[0]?.optimal_card_name ?? "";
  const bestCategory = missed?.by_category?.[0]?.category_name ?? "";
  const recoverable = missed?.total_gap ?? 0;

  /* ── Marketing landing for unauthenticated visitors ─────────────────── */
  if (isReady && !isAuthenticated) {
    return (
      <div className="reveal" style={{ paddingTop: 0, minHeight: "100vh" }}>
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            padding: "clamp(60px, 8vh, 120px) clamp(20px, 4vw, 60px) clamp(40px, 6vh, 80px)",
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)",
            gap: 48,
            alignItems: "center",
            minHeight: "92vh",
            position: "relative",
          }}
          className="landing-grid"
        >
          {/* Left: editorial masthead */}
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
              <span className="eyebrow" style={{ color: "var(--accent)" }}>Maple Rewards · est. 2025</span>
              <span style={{ flex: 1, height: 1, background: "var(--rule)", maxWidth: 100 }} />
              <span className="eyebrow">Canada · CAD</span>
            </div>
            <h1
              className="display"
              style={{
                fontSize: "clamp(64px, 9vw, 128px)",
                margin: 0,
                lineHeight: 0.88,
                letterSpacing: "-0.025em",
              }}
            >
              Know what
              <br />
              to swipe.
              <br />
              <span style={{ fontStyle: "italic", color: "var(--accent)" }}>Before</span>{" "}
              <span style={{ fontStyle: "italic" }}>you swipe</span>.
            </h1>
            <p
              className="serif"
              style={{
                marginTop: 24,
                fontSize: "clamp(17px, 1.4vw, 21px)",
                color: "var(--ink-2)",
                lineHeight: 1.45,
                maxWidth: 540,
              }}
            >
              Know exactly which Canadian credit card to swipe for every purchase — groceries,
              gas, dining, travel — and what those points are actually worth in dollars.
              Built for Canada. Every card, every program, every transfer route.
            </p>

            <div style={{ display: "flex", gap: 12, marginTop: 32, flexWrap: "wrap" }}>
              <Link
                href="/onboarding"
                className="mono"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "16px 28px",
                  borderRadius: 10,
                  background: "var(--accent)",
                  color: "#fff",
                  textDecoration: "none",
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}
              >
                Try it free →
              </Link>
              <Link
                href="/login"
                className="mono"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "16px 28px",
                  borderRadius: 10,
                  background: "transparent",
                  color: "var(--ink)",
                  border: "1px solid var(--rule-strong)",
                  textDecoration: "none",
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}
              >
                Sign in
              </Link>
            </div>

            {/* Stats row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 0,
                marginTop: 56,
                borderTop: "1px solid var(--ink)",
                borderBottom: "1px solid var(--rule)",
              }}
            >
              <Stat label="Cards modelled" value="94" />
              <Stat label="Loyalty programs" value="41" />
              <Stat label="Transfer routes" value="20+" />
            </div>
          </div>

          {/* Right: live optimizer decision engine — replaces the card spread.
             * Cycles real-feeling decisions every 2.8s with editorial motion. */}
          <div style={{ position: "relative", minWidth: 0 }}>
            <LandingHeroDemo />
          </div>
        </div>

        {/* Kinetic proof moment — replaces the Plate 01 photograph.
           * Big italic editorial number that counts up on scroll-in. The
           * number IS the visual; no illustration needed. */}
        <LandingKineticProof />

        {/* Early-access recruitment — honest beta framing, no invented quotes */}
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "20px clamp(20px, 4vw, 60px) 80px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 20 }}>
              <span className="eyebrow" style={{ color: "var(--accent)" }}>Early access</span>
              <span style={{ flex: 1, height: 1, background: "var(--rule)", maxWidth: 80 }} />
              <span className="eyebrow">
                Beta · now open
              </span>
            </div>
            <div
              style={{
                padding: "22px 22px",
                border: "1px solid var(--rule)",
                borderRadius: 14,
                background: "var(--card-fill)",
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <h2
                className="display"
                style={{ margin: 0, fontSize: "clamp(24px, 2.6vw, 32px)", lineHeight: 1.1 }}
              >
                Be one of the <span style={{ fontStyle: "italic", color: "var(--accent)" }}>first</span> wallets.
              </h2>
              <p
                className="serif"
                style={{ margin: 0, fontSize: 15, color: "var(--ink-2)", lineHeight: 1.5, maxWidth: 640 }}
              >
                Maple is in early beta — no testimonials yet, because we&rsquo;d rather earn
                them. Add your cards, run your real spend through the optimizer, and tell us
                where the math falls short.
              </p>
              <WaitlistForm source="homepage" refCode={waitlistRef} />
              <Link
                href="/onboarding"
                className="mono"
                style={{
                  alignSelf: "flex-start",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 11,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--accent)",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                Or try Maple free now →
              </Link>
            </div>
          </div>

          {/* Founder / origin note — sits above the global footer */}
          <aside
            style={{
              marginTop: 64,
              padding: "26px 28px",
              border: "1px solid var(--rule)",
              borderRadius: 14,
              background: "var(--card-fill-strong)",
              maxWidth: 720,
            }}
          >
            <h2 className="eyebrow" style={{ color: "var(--accent)", margin: "0 0 10px" }}>
              Built in Canada
            </h2>
            <p
              className="serif"
              style={{
                margin: 0,
                fontSize: 16,
                color: "var(--ink-2)",
                lineHeight: 1.55,
              }}
            >
              Maple started because the American rewards apps couldn&rsquo;t read a Cobalt, never mind
              a Cobalt&rsquo;s transfer to Aeroplan. Canadians collect Canadian points. So we built
              Canadian software. The math is in CAD. The caps are correct. The transfer partners
              are the ones you can actually use.
            </p>
          </aside>
        </div>

        {/* Slim marketing footer — the only path to /terms before signup */}
        <footer style={{ maxWidth: 1280, margin: "0 auto", padding: "0 clamp(20px, 4vw, 60px) 40px" }}>
          <div
            style={{
              borderTop: "1px solid var(--rule)",
              paddingTop: 20,
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <span className="eyebrow">Maple Rewards · Canada</span>
            <nav aria-label="Footer" style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
              {[
                ["Privacy", "/privacy"],
                ["Terms", "/terms"],
                ["Pricing", "/pricing"],
                ["Tools", "/tools"],
                ["Glossary", "/glossary"],
              ].map(([label, href]) => (
                <Link
                  key={href}
                  href={href}
                  className="mono"
                  style={{
                    fontSize: 11,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--ink-2)",
                    textDecoration: "none",
                  }}
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>
        </footer>

        <style>{`
          @media (max-width: 900px) {
            .landing-grid { grid-template-columns: 1fr !important; }
            .landing-grid > div:last-child { min-height: 420px !important; }
          }
        `}</style>
      </div>
    );
  }

  // Has the missed-rewards report produced a real, actionable "best move"?
  // (a positive dollar gap on a known optimal card). When it hasn't — new
  // wallet, no scored spend yet — we show a routed-cleanly state instead of
  // inventing a number.
  const hasBestMove = !!missed && recoverable > 0 && !!missed.by_category?.[0];
  const greeting = firstName ? `Welcome back, ${firstName}.` : "Welcome back.";

  return (
    <div className="screen-shell dashboard-screen reveal" style={{ paddingTop: 0 }}>
      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "24px clamp(16px, 1.5vw, 28px)" }}>
        {/* ── Wayfinding context strip ────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 22,
            fontSize: 12,
          }}
        >
          <span className="mono" style={{ color: "var(--ink-3)", letterSpacing: "0.06em" }}>
            Workspace
          </span>
          <span style={{ color: "var(--ink-4)" }}>/</span>
          <span className="mono" style={{ color: "var(--ink)", letterSpacing: "0.06em" }}>
            Home
          </span>
          <span style={{ flex: 1, height: 1, background: "var(--rule)", margin: "0 4px" }} />
          <span
            className="mono"
            style={{
              color: "var(--ink-3)",
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Updated just now · CAD
          </span>
        </div>

        {/* ── The one inviting, animated first-login hero ──────────────────
           * Single coherent stat surface (folded into the masthead) + the
           * real "best move today". No duplicated grids, no fabricated cards. */}
        <motion.section
          className={`mr-hero home-hero${recentSpend.length === 0 ? " home-hero--solo" : ""}`}
          variants={heroContainer}
          initial={reduceMotion ? false : "hidden"}
          animate="show"
        >
          {/* Elevated free-floating card fan — fades + lifts in on the right.
             * Decorative by product-owner choice; spotlight anchor for the tour. */}
          <motion.div className="mr-hero-art" variants={heroArt} data-tour-id="home-card-fan">
            <CardFan height="100%" intensity={0.65} focusIndex={2} />
          </motion.div>

          <div className="mr-hero-copy">
            <motion.div className="home-hero-eyebrow" variants={heroItem}>
              <span className="eyebrow">{greeting}</span>
            </motion.div>

            <motion.h1 className="display mr-hero-title" variants={heroItem}>
              Best card for<br />
              <span style={{ color: "var(--accent)", fontStyle: "italic" }}>every</span>{" "}
              purchase.
            </motion.h1>

            <motion.p className="serif mr-hero-lede" variants={heroItem}>
              Your wallet, ranked by what it actually earns — in CAD, with caps,
              transfer partners, and award value factored in.
            </motion.p>

            {/* THE single stat surface — wallet value, points/programs, cards.
               * One ribbon, no repetition anywhere else on the page. */}
            <motion.div className="home-stat-ribbon" variants={heroItem}>
              <div className="home-stat">
                <div className="eyebrow" style={{ marginBottom: 6 }}>Wallet value</div>
                <div className="display home-stat-num">
                  $<Counter value={Math.round(totalValueSweet)} />
                </div>
                <div className="mono home-stat-sub">
                  CAD · <Term term="sweet spot">sweet-spot</Term>
                </div>
              </div>
              <div className="home-stat">
                <div className="eyebrow" style={{ marginBottom: 6 }}>Points</div>
                <div className="display home-stat-num">
                  <Counter value={totalPoints} />
                </div>
                <div className="mono home-stat-sub">
                  {programsCount} program{programsCount === 1 ? "" : "s"}
                </div>
              </div>
              <div className="home-stat">
                <div className="eyebrow" style={{ marginBottom: 6 }}>Cards</div>
                <div className="display home-stat-num">
                  <Counter value={cardsCount} />
                </div>
                <div className="mono home-stat-sub">in your wallet</div>
              </div>
            </motion.div>

            {/* The real "best move today" → /optimizer. Derived from the
               * missed-rewards report; falls back to a routed-cleanly state
               * rather than a fabricated number. */}
            <motion.div variants={heroItem}>
              <Link
                href="/optimizer"
                className="home-move"
                aria-label="Open the optimizer"
                data-tour-id="home-best-move"
              >
                <div className="home-move-head">
                  <span className="eyebrow">Best move today</span>
                  <span
                    className="mono home-move-gap"
                    style={{ color: hasBestMove ? "var(--gain)" : "var(--ink-3)" }}
                  >
                    {hasBestMove ? `+$${recoverable.toFixed(2)}` : "all routed cleanly"}
                  </span>
                </div>
                {hasBestMove ? (
                  <p className="serif home-move-line">
                    Route <strong style={{ color: "var(--ink)", fontWeight: 600 }}>{bestCategory.toLowerCase()}</strong>{" "}
                    spend to your{" "}
                    <strong style={{ color: "var(--ink)", fontWeight: 600 }}>{bestCardName}</strong>.{" "}
                    That&rsquo;s the gap across {missed?.entry_count ?? 0} scored swipes.
                  </p>
                ) : (
                  <p className="serif home-move-line">
                    Tap a category and an amount — we&rsquo;ll rank every card in
                    your wallet by what it would actually earn.
                  </p>
                )}
                {hasBestMove && (
                  <MiniFlowArrow
                    style={{ marginTop: 18 }}
                    from={
                      <span
                        className="mono"
                        style={{
                          fontSize: 10,
                          padding: "5px 10px",
                          borderRadius: 8,
                          background: "var(--surface-2)",
                          color: "var(--ink-2)",
                          letterSpacing: "0.06em",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {bestCategory.toUpperCase()}
                      </span>
                    }
                    to={
                      <span
                        className="mono"
                        style={{
                          fontSize: 10,
                          padding: "5px 10px",
                          borderRadius: 8,
                          background: "var(--accent)",
                          color: "#fff",
                          letterSpacing: "0.06em",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {bestCardName}
                      </span>
                    }
                  />
                )}
                <span className="mono home-move-cta">
                  Open the optimizer →
                </span>
              </Link>
            </motion.div>

            <motion.div className="home-hero-foot" variants={heroItem}>
              <span className="mono">
                {cardsCount}-card wallet · live earn assumptions
              </span>
              {recoverable > 0 && (
                <Link href="/insights" className="mono home-hero-foot-link">
                  Full <Term term="leakage" /> report →
                </Link>
              )}
            </motion.div>
          </div>
        </motion.section>

        {/* ── Visual data row: wallet gauge + category coverage ──────────────
           * Gauge wires the 3-tier valuation (base arc / sweet-spot ceiling /
           * upside delta); coverage maps the portfolio utilization gaps. Each
           * renders only when its source resolved (degrades to null on failure
           * or for an empty wallet). */}
        {(walletSummary || portfolio) && (
          <div
            className="home-data-row"
            style={{
              marginTop: 14,
              display: "grid",
              gridTemplateColumns:
                walletSummary && portfolio && portfolio.utilization.gaps.length > 0
                  ? "300px minmax(0, 1fr)"
                  : "minmax(0, 1fr)",
              gap: 18,
              alignItems: "start",
            }}
          >
            {walletSummary && (
              <WalletGaugeCard
                base={totalValue}
                sweetSpot={totalValueSweet}
                upside={totalValueHigh}
              />
            )}
            {portfolio && portfolio.utilization.gaps.length > 0 && (
              <CoverageCard gaps={portfolio.utilization.gaps} />
            )}
          </div>
        )}

        {/* ── Points earned over the last 6 months (all programs) ───────────
           * Wired to getPointsSeries; renders only when the series has data so
           * a brand-new wallet doesn't show an empty chart. */}
        {pointsSeries && pointsSeries.months.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <PointsChartCard series={pointsSeries} />
          </div>
        )}

        {/* ── Recent activity ledger ────────────────────────────────── */}
        {recentSpend.length > 0 && (
          <section
            style={{
              border: "1px solid var(--rule)",
              borderRadius: 14,
              background: "var(--card-fill)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 22px",
                borderBottom: "1px solid var(--rule)",
              }}
            >
              <div>
                <div className="eyebrow">Recent activity</div>
                <div className="display" style={{ fontSize: 22, marginTop: 2 }}>
                  Wallet ledger
                </div>
              </div>
              <Link
                href="/insights"
                className="mono"
                style={{
                  fontSize: 11,
                  color: "var(--accent)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  textDecoration: "none",
                }}
              >
                View all →
              </Link>
            </div>
            {recentSpend.map((entry) => (
              <div
                key={entry.id}
                className="m-grid-1"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 140px 100px",
                  alignItems: "center",
                  gap: 16,
                  padding: "14px 22px",
                  borderTop: "1px solid var(--rule)",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div className="display" style={{ fontSize: 16, lineHeight: 1.2, color: "var(--ink)" }}>
                    {entry.card_name ?? "Card"}
                  </div>
                  <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2, letterSpacing: "0.04em" }}>
                    {(entry.category_name ?? "—").toUpperCase()} ·{" "}
                    {new Date(entry.spent_at).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}
                  </div>
                </div>
                <div className="mono" style={{ fontSize: 14, color: "var(--ink)", textAlign: "right" }}>
                  ${entry.amount.toFixed(2)}
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: 13,
                    color: "var(--gain)",
                    textAlign: "right",
                    fontWeight: 600,
                  }}
                >
                  +${entry.dollar_value.toFixed(2)}
                </div>
              </div>
            ))}
          </section>
        )}

        {/* ── Explore: surface the tools that otherwise hide in the nav so a
             logged-in user discovers them straight from home. minmax(240px,…)
             stays narrower than a phone's content box, so it never overflows. ── */}
        <section style={{ marginTop: 28 }}>
          <div className="eyebrow" style={{ marginBottom: 14 }}>Explore Maple</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: 12,
            }}
          >
            {[
              { href: "/portfolio", title: "Wallet coverage", desc: "Which categories your cards cover — and the gaps.", badge: "Free" },
              { href: "/wallet", title: "Your wallet", desc: "Manage cards, balances and details." },
              { href: "/cards", title: "Find a card", desc: "Browse 94 Canadian cards." },
              { href: "/chat", title: "Ask Maple", desc: "Your AI rewards advisor." },
              { href: "/insights", title: "Insights", desc: "Where your rewards leak — and the fix." },
              { href: "/tools", title: "More tools", desc: "Trip planner, award search, milestones." },
            ].map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="lift"
                style={{
                  display: "block",
                  border: "1px solid var(--rule)",
                  borderRadius: 12,
                  background: "var(--card-fill)",
                  padding: "16px 18px",
                  textDecoration: "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span className="display" style={{ fontSize: 16, color: "var(--ink)" }}>{t.title}</span>
                  {t.badge ? (
                    <span
                      className="mono"
                      style={{
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: "var(--accent)",
                        color: "#fff",
                        fontSize: 9,
                        fontWeight: 600,
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                      }}
                    >
                      {t.badge}
                    </span>
                  ) : (
                    <span className="mono" style={{ color: "var(--ink-3)", fontSize: 14 }}>→</span>
                  )}
                </div>
                <p className="serif" style={{ fontStyle: "italic", fontSize: 13, color: "var(--ink-2)", margin: "6px 0 0", lineHeight: 1.4 }}>
                  {t.desc}
                </p>
              </Link>
            ))}
          </div>
        </section>

        {/* Collapse the gauge/coverage data row to a single column on narrow
           * viewports so neither card is crushed under the 300px gauge track. */}
        <style>{`
          @media (max-width: 760px) {
            .home-data-row { grid-template-columns: minmax(0, 1fr) !important; }
          }
        `}</style>
      </div>
    </div>
  );
}

/* ── Marketing-landing helpers ────────────────────────────────────────── */

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: "20px 18px", borderRight: "1px solid var(--rule)" }}>
      <div className="eyebrow" style={{ marginBottom: 6 }}>{label}</div>
      <div className="display" style={{ fontSize: 36, fontStyle: "italic", color: "var(--ink)", lineHeight: 1 }}>
        {value}
      </div>
    </div>
  );
}
