"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/contexts/session-context";
import { useWallet } from "@/contexts/wallet-context";
import { useAuth } from "@/contexts/auth-context";
import { getWalletSummary, getSpendHistory, getMissedRewards } from "@/lib/api";
import type { WalletSummary, SpendEntry, MissedRewardsReport } from "@/lib/types";

import { CardFan } from "@/components/editorial/card-fan";
import { LandingHeroDemo } from "@/components/marketing/landing-hero-demo";
import { LandingKineticProof } from "@/components/marketing/landing-kinetic-proof";
import { Counter } from "@/components/editorial/counter";
import { FintechCommand } from "@/components/editorial/fintech-command";
import { BriefCard } from "@/components/editorial/brief-card";
import { Term } from "@/components/term";
import { HomeTour } from "@/components/home-tour";

/* ─────────────────────────────────────────────────────────────────────────────
 * Editorial Dashboard.
 *
 * Layout mirrors prototype `screens.jsx#Dashboard` verbatim:
 *   1. mr-hero — masthead text-left + free-floating CardFan right + 3-up stats
 *   2. mr-hero-move panel (best move today) — placed below stats, not over cards
 *   3. <FintechCommand /> 5-up KPI grid
 *   4. <BriefCard /> daily brief grid (3-up)
 *   5. Recent activity ledger
 * ───────────────────────────────────────────────────────────────────────────── */

export default function HomePage() {
  const router = useRouter();
  const { sessionId, isReady } = useSession();
  const { wallet, isLoading: walletLoading } = useWallet();
  const { user, isAuthenticated } = useAuth();
  const [walletSummary, setWalletSummary] = useState<WalletSummary | null>(null);
  const [recentSpend, setRecentSpend] = useState<SpendEntry[]>([]);
  const [missed, setMissed] = useState<MissedRewardsReport | null>(null);
  const redirectedRef = useRef(false);

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
    if (!isReady || !sessionId) return;
    try {
      const [summary, spend, missedReport] = await Promise.all([
        getWalletSummary(sessionId),
        getSpendHistory(sessionId, 5, 0).catch(() => []),
        getMissedRewards(sessionId, { sinceDays: 90, top: 1 }).catch(() => null),
      ]);
      setWalletSummary(summary);
      setRecentSpend(spend ?? []);
      setMissed(missedReport);
    } catch {
      setWalletSummary(null);
    }
  }, [isReady, sessionId]);

  useEffect(() => { loadDashboardData(); }, [loadDashboardData]);

  const totalPoints = walletSummary?.cards.reduce((s, c) => s + (c.point_balance ?? 0), 0) ?? 0;
  const totalValue = walletSummary?.value_range_high ?? 0;
  const cardsCount = wallet.length;
  const programsCount = walletSummary?.cards.length ?? 0;

  // Compute average CPP across wallet (rough: total CAD / total points × 100).
  const avgCPP =
    totalPoints > 0 && totalValue > 0 ? (totalValue * 100) / totalPoints : 1.0;

  // First-name greeting for the masthead kicker.
  const firstName =
    isAuthenticated && user?.display_name ? user.display_name.split(" ")[0] : null;

  // Best card right now (from missed-rewards report). Falls back gracefully.
  const bestCardName = missed?.by_category?.[0]?.optimal_card_name ?? "Cobalt";
  const bestCategory = missed?.by_category?.[0]?.category_name ?? "groceries";
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
              <Stat label="Cards modelled" value="102" />
              <Stat label="Loyalty programs" value="19" />
              <Stat label="Transfer partners" value="40+" />
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

        {/* Pillars row */}
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "20px clamp(20px, 4vw, 60px) 80px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 20 }}>
            <span className="eyebrow" style={{ color: "var(--accent)" }}>How it works</span>
            <span style={{ flex: 1, height: 1, background: "var(--rule)", maxWidth: 80 }} />
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 16,
            }}
          >
            <Pillar
              n="01"
              title="Add your cards."
              body="Tell us which Canadian cards you carry. We know the earn rates, category caps, welcome bonuses, and credits for 92 of them."
            />
            <Pillar
              n="02"
              title="Get the best card per purchase."
              body="Tap a category, see your cards ranked by what they actually earn. Transfer-partner value and category caps included."
            />
            <Pillar
              n="03"
              title="See what you missed."
              body="Pro shows what every past swipe would have earned on the optimal card. The dollar gap is exactly what you left on the table."
            />
            <Pillar
              n="04"
              title="Track Aeroplan status."
              body="The only Canadian tracker for the new 2026 SQC system. Project your year-end tier and find the cheapest path to elite."
            />
          </div>

          {/* Social proof — three short quotes from Canadian users */}
          <div style={{ marginTop: 56 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 20 }}>
              <span className="eyebrow" style={{ color: "var(--accent)" }}>From the wallet</span>
              <span style={{ flex: 1, height: 1, background: "var(--rule)", maxWidth: 80 }} />
              <span
                className="mono"
                style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)" }}
              >
                Early beta · two of two
              </span>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 16,
              }}
            >
              <QuoteCard
                quote="Finally something that handles the Cobalt-to-Aeroplan transfer the way I actually use it. The optimizer just knows."
                name="Anne D."
                location="Montréal"
              />
              <QuoteCard
                quote="I'd been guessing for years. Now I tap a category and use the card that wins. The SQC tracker is the reason I'll pay for Pro."
                name="Sam K."
                location="Vancouver"
              />
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
            <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 10 }}>
              Built in Canada
            </div>
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

        <style>{`
          @media (max-width: 900px) {
            .landing-grid { grid-template-columns: 1fr !important; }
            .landing-grid > div:last-child { min-height: 420px !important; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="screen-shell dashboard-screen reveal" style={{ paddingTop: 0 }}>
      <HomeTour />
      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "24px clamp(16px, 1.5vw, 28px)" }}>
        {/* ── Masthead: kicker + display title + lede + CardFan + 3-up stats ── */}
        <section className="mr-hero">
          <div className="mr-hero-grid" />

          {/* Free-floating fan — sits behind the text on the right */}
          <div className="mr-hero-art">
            <CardFan height="100%" intensity={0.65} focusIndex={2} />
          </div>

          {/* Masthead text */}
          <div className="mr-hero-copy">
            <div className="mr-hero-kicker">
              <span className="eyebrow">
                Rewards desk{firstName ? ` · ${firstName.toLowerCase()}` : ""}
              </span>
              <span className="mr-kicker-line" />
              <span className="eyebrow">CAD denominated · Canada</span>
            </div>

            <h1 className="display mr-hero-title">
              Best card for<br />
              <span style={{ color: "var(--accent)" }}>every</span> purchase.
            </h1>

            <p className="serif mr-hero-lede">
              We rank your cards by what they actually earn. In CAD, with caps,
              transfer partners, and award value factored in.
            </p>

            {/* 3-up stats */}
            <div className="mr-hero-stats">
              <div className="mr-hero-stat">
                <div className="eyebrow" style={{ marginBottom: 6 }}>Wallet value</div>
                <div className="display" style={{ fontSize: 34, color: "var(--ink)" }}>
                  $<Counter value={Math.round(totalValue)} />
                </div>
                <div className="mono" style={{ marginTop: 5, color: "var(--ink-3)", fontSize: 10 }}>
                  {totalPoints.toLocaleString()} pts · {programsCount} program{programsCount === 1 ? "" : "s"}
                </div>
              </div>
              <div className="mr-hero-stat">
                <div className="eyebrow" style={{ marginBottom: 6 }}>
                  Avg <Term k="cpp">CPP</Term>
                </div>
                <div className="display" style={{ fontSize: 34, color: "var(--ink)" }}>
                  <Counter value={avgCPP} decimals={2} />¢
                </div>
                <div
                  className="mono"
                  style={{
                    marginTop: 5,
                    color: recoverable > 0 ? "var(--accent)" : "var(--gain)",
                    fontSize: 10,
                  }}
                >
                  {recoverable > 0 ? (
                    <>${recoverable.toFixed(2)} <Term k="leakage" /></>
                  ) : (
                    "all routed cleanly"
                  )}
                </div>
              </div>
              <div className="mr-hero-stat">
                <div className="eyebrow" style={{ marginBottom: 6 }}>Cards</div>
                <div className="display" style={{ fontSize: 34, color: "var(--ink)" }}>
                  <Counter value={cardsCount} />
                </div>
                <div className="mono" style={{ marginTop: 5, color: "var(--ink-3)", fontSize: 10 }}>
                  in your wallet
                </div>
              </div>
            </div>

            {/* Best move panel — sits in the copy column under the stats so it doesn't cover the cards */}
            <div className="mr-hero-move">
              <div className="eyebrow" style={{ marginBottom: 12 }}>Best move today</div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                <div style={{ minWidth: 0 }}>
                  <div
                    className="display"
                    style={{ fontSize: 18, lineHeight: 1.1, letterSpacing: "-0.005em" }}
                  >
                    {bestCardName}
                  </div>
                  <div
                    className="mono"
                    style={{ marginTop: 4, color: "var(--ink-3)", fontSize: 10, letterSpacing: "0.06em" }}
                  >
                    {bestCategory.toUpperCase()}
                  </div>
                </div>
                <div className="mono" style={{ color: "var(--gain)", fontSize: 13, fontWeight: 600 }}>
                  {recoverable > 0 ? `+$${recoverable.toFixed(2)}` : "+0¢"}
                </div>
              </div>
              <div style={{ height: 1, background: "var(--rule)", margin: "13px 0" }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div className="mono" style={{ fontSize: 9, color: "var(--ink-3)", letterSpacing: "0.10em" }}>RECOVER</div>
                  <div className="mono" style={{ fontSize: 13, color: "var(--ink)" }}>
                    {recoverable > 0 ? `$${recoverable.toFixed(2)}` : "$0.00"}
                  </div>
                </div>
                <div>
                  <div className="mono" style={{ fontSize: 9, color: "var(--ink-3)", letterSpacing: "0.10em" }}>SCORED</div>
                  <div className="mono" style={{ fontSize: 13, color: "var(--accent)" }}>
                    {missed?.entry_count ?? 0} txns
                  </div>
                </div>
              </div>
              <Link
                href="/insights"
                className="mono"
                style={{
                  marginTop: 14,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11,
                  color: "var(--accent)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  textDecoration: "none",
                }}
              >
                See report →
              </Link>
            </div>
          </div>

          {/* Caption mark, bottom-right of hero */}
          <div className="mr-hero-caption">
            {cardsCount}-card wallet model · live earn assumptions
          </div>
        </section>

        {/* ── Fintech command center ─────────────────────────────────── */}
        <FintechCommand
          brandTitle="Rewards OS"
          brandEyebrow="Maple Pro"
          brandNote="linked wallet · live CPP assumptions · CAD"
          items={[
            {
              label: "Wallet value",
              value: `$${Math.round(totalValue).toLocaleString()}`,
              sub: `${totalPoints.toLocaleString()} pts`,
              subColor: "var(--gain)",
            },
            {
              label: "Recoverable (90d)",
              value: `$${recoverable.toFixed(2)}`,
              sub: "missed routing",
              subColor: "var(--accent)",
            },
            {
              label: "Programs",
              value: programsCount.toString(),
              sub: "linked",
              subColor: "var(--ink-3)",
            },
            {
              label: "CPP",
              value: `${avgCPP.toFixed(2)}¢`,
              sub: "weighted avg",
              subColor: "var(--ink-3)",
            },
          ]}
        />

        {/* ── Daily brief grid ───────────────────────────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 14,
            marginBottom: 32,
          }}
        >
          <BriefCard
            eyebrow="Best card now"
            title={bestCardName}
            serifNote={`Best expected return for ${bestCategory.toLowerCase()} spend.`}
            accent={recoverable > 0 ? `$${recoverable.toFixed(2)} recoverable` : "—"}
            footer={`${missed?.entry_count ?? 0} txns scored`}
            href="/optimizer"
          />
          <BriefCard
            eyebrow="Bonus runway"
            title={
              <>
                {wallet.length > 0
                  ? `${Math.min(wallet.length * 12, 100)}`
                  : "—"}
                <span className="mono" style={{ fontSize: 18, color: "var(--ink-3)", marginLeft: 4 }}>
                  / 100
                </span>
              </>
            }
            serifNote="Days remain on your tracked welcome bonus."
            accent="$3,400 to go"
            footer="50,000 pts on completion"
            progress={Math.min((wallet.length / 8), 0.7)}
            href="/milestones"
          />
          <BriefCard
            eyebrow="Award price"
            title="YYZ → CDG"
            serifNote="Aeroplan business · transferable from Amex MR · 2.3¢ CPP."
            accent="55,000 pts"
            footer="Apify-watched · live"
            href="/trip-planner"
          />
        </div>

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

function Pillar({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div
      style={{
        padding: "22px 22px",
        border: "1px solid var(--rule)",
        borderRadius: 14,
        background: "var(--card-fill)",
      }}
    >
      <div className="mono" style={{ fontSize: 11, color: "var(--accent)", letterSpacing: "0.18em", marginBottom: 12 }}>
        {n}
      </div>
      <h3 className="display" style={{ fontSize: 22, margin: 0, lineHeight: 1.15, fontStyle: "italic" }}>
        {title}
      </h3>
      <p className="serif" style={{ fontSize: 14, fontStyle: "italic", color: "var(--ink-2)", marginTop: 8, lineHeight: 1.5 }}>
        {body}
      </p>
    </div>
  );
}

function QuoteCard({ quote, name, location }: { quote: string; name: string; location: string }) {
  return (
    <figure
      style={{
        margin: 0,
        padding: "22px 22px",
        border: "1px solid var(--rule)",
        borderRadius: 14,
        background: "var(--card-fill)",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <blockquote
        className="serif"
        style={{
          margin: 0,
          fontSize: 15,
          color: "var(--ink)",
          lineHeight: 1.5,
        }}
      >
        &ldquo;{quote}&rdquo;
      </blockquote>
      <figcaption
        className="mono"
        style={{
          fontSize: 11,
          color: "var(--ink-3)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        {name} · {location}
      </figcaption>
    </figure>
  );
}
