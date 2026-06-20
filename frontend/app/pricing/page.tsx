"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, X, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { PRICING, TIER_GROUPS, FREE_LIMITS } from "@/lib/pro-features";
import { createCheckoutSession } from "@/lib/api";
import { PageMasthead } from "@/components/editorial/page-masthead";
import { LeafDivider } from "@/components/editorial/leaf-divider";
import { Button } from "@/components/ui/button";
import { Term } from "@/components/ui/term";

/* ─────────────────────────────────────────────────────────────────────────────
 * Pricing — editorial treatment
 *
 * Leads with the Canadian advantage (Aeroplan SQC, missed-rewards forensics) which
 * is the only reason a Canadian rewards-collector picks MapleRewards over a
 * US app like MaxRewards or AwardWallet. The redesign aligns this page with
 * the rest of the editorial system: warm cream surface, maple-red accent,
 * Instrument Serif italic in the lede, mono-uppercase eyebrows.
 * ───────────────────────────────────────────────────────────────────────────── */

const PRO_TOOL_PITCH: { kicker: string; title: string; lede: string }[] = [
  {
    kicker: "2026 Aeroplan SQC",
    title: "Project status with confidence",
    lede:
      "Maple is the first Canadian app we know of that turns the new Status Qualifying Credits framework into a forecast. Current tier, gap to the next, and the cheapest card to close it.",
  },
  {
    kicker: "Missed-rewards forensics",
    title: "See what each swipe cost you",
    lede:
      "Every spend re-ranked against your current wallet. The dollar gap is exactly what the optimal card would have earned, itemised by category and by purchase.",
  },
  {
    kicker: "Credits & renewals",
    title: "The loss-prevention calendar",
    lede:
      "Annual credits expire silently. Renewals drop without warning. One screen, one tap to mark used.",
  },
  {
    kicker: "Card-value scorecard",
    title: "The honest answer to which cards earn their fee",
    lede:
      "Insurance, lounge, concierge, FX savings, multipliers, credit bundles. All priced and netted against the annual fee. No more guesswork.",
  },
];

type IntervalKey = "pro" | "proPlus" | "lifetime";

function PricingContent() {
  const { isPro, isAuthenticated, refreshSession } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Deep-link tier selection: /pricing?tier=proplus etc. lands on the right tab.
  const [interval, setInterval] = useState<IntervalKey>(() => {
    const tier = searchParams.get("tier");
    if (tier === "proplus" || tier === "pro-plus" || tier === "plus") return "proPlus";
    if (tier === "lifetime") return "lifetime";
    return "pro";
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const plan =
    interval === "pro"
      ? PRICING.pro
      : interval === "proPlus"
      ? PRICING.proPlus
      : PRICING.lifetime;

  // Stripe redirect feedback. On success we re-sync the session because the
  // upgrade is applied by an async webhook that can land a beat after Stripe
  // redirects the browser here — so we poll /auth/refresh (re-mints the token
  // from the live DB) until is_pro flips, instead of showing a stale "free".
  useEffect(() => {
    if (searchParams.get("canceled") === "true") {
      setError("Checkout was canceled. Pick it back up whenever you're ready.");
      return;
    }
    if (searchParams.get("success") !== "true") return;

    setSuccessMsg("Payment received — activating Pro…");
    let cancelled = false;
    let attempts = 0;
    const poll = async () => {
      if (cancelled) return;
      const pro = await refreshSession();
      attempts += 1;
      if (pro) {
        setSuccessMsg("Payment received. Pro is active across your wallet.");
      } else if (attempts < 8) {
        window.setTimeout(poll, 1500);
      } else {
        setSuccessMsg("Payment received. Pro will activate shortly — refresh the page if it hasn't updated in a minute.");
      }
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, [searchParams, refreshSession]);

  async function handleCheckout() {
    if (!isAuthenticated) {
      router.push("/login?redirect=/pricing");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const session = await createCheckoutSession(plan.checkoutInterval);
      window.location.href = session.url;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      if (msg.includes("billing is not configured") || msg.includes("stripe not configured")) {
        setError("Checkout is temporarily unavailable — please try again in a moment.");
      } else {
        setError(msg);
      }
      setLoading(false);
    }
  }

  return (
    <div className="reveal" style={{ paddingTop: 0 }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "32px clamp(20px, 4vw, 60px) 80px" }}>
        <PageMasthead
          eyebrow="Pricing"
          eyebrowEnd="CAD · Canada-only depth"
          title={
            <>
              The <span style={{ fontStyle: "italic", color: "var(--accent)" }}>Canadian</span> rewards desk.
            </>
          }
          lede={
            <>
              Built for <Term k="aeroplan" />, Air Miles, <Term k="scene-plus" />, <Term k="amex-mr" /> Canada, RBC Avion. The Pro tier ships an <Term k="sqc" />{" "}(Status Qualifying Credits) projector and missed-rewards forensics that no US app we&rsquo;ve seen even attempts. That&rsquo;s the entire pitch.
            </>
          }
        />

        {/* Trial + cancel-anytime banner — calm, above the tier cards. */}
        <div
          role="status"
          style={{
            marginTop: 18,
            padding: "14px 18px",
            borderRadius: 12,
            border: "1px solid var(--rule-strong)",
            background: "var(--card-fill-strong)",
            display: "flex",
            alignItems: "baseline",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span
            className="sans"
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: "3px 9px",
              borderRadius: 999,
              background: "var(--accent-soft)",
              color: "var(--accent)",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            3-day trial
          </span>
          <span className="serif" style={{ fontSize: 15, color: "var(--ink-2)", lineHeight: 1.4 }}>
            Try every Pro feature free for 3 days. Your card is added at signup and charged when the trial ends — cancel anytime in account settings before then.
          </span>
        </div>

        {/* Status banners */}
        {successMsg && (
          <div
            role="status"
            style={{
              marginTop: 8,
              padding: "12px 16px",
              borderRadius: 12,
              border: "1px solid var(--gain)",
              background: "var(--gain-soft)",
              color: "var(--gain)",
            }}
            className="serif"
          >
            ✓ {successMsg}
          </div>
        )}
        {error && (
          <div
            role="alert"
            style={{
              marginTop: 8,
              padding: "12px 16px",
              borderRadius: 12,
              border: "1px solid var(--accent)",
              background: "var(--accent-soft)",
              color: "var(--accent)",
            }}
            className="serif"
          >
            {error}
          </div>
        )}

        {/* Billing-interval toggle */}
        <div style={{ display: "flex", justifyContent: "center", marginTop: 28, marginBottom: 22 }}>
          <div
            role="tablist"
            aria-label="Billing interval"
            style={{
              display: "inline-flex",
              border: "1px solid var(--rule)",
              borderRadius: 999,
              padding: 4,
              background: "var(--surface)",
            }}
          >
            <IntervalButton active={interval === "pro"} onClick={() => setInterval("pro")}>
              Pro
            </IntervalButton>
            <IntervalButton active={interval === "proPlus"} onClick={() => setInterval("proPlus")}>
              Pro Plus <span style={{ color: "var(--gain)", marginLeft: 8 }}>most depth</span>
            </IntervalButton>
            <IntervalButton active={interval === "lifetime"} onClick={() => setInterval("lifetime")}>
              Lifetime <span style={{ color: "var(--accent)", marginLeft: 8 }}>founding</span>
            </IntervalButton>
          </div>
        </div>

        {/* Plan cards */}
        <div
          className="pricing-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 20,
          }}
        >
          {/* Free tier */}
          <PaperTile>
            <PlanEyebrow>Free</PlanEyebrow>
            <div className="display" style={{ fontSize: 56, lineHeight: 1, marginTop: 6, color: "var(--ink)" }}>
              $0
            </div>
            <p className="mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.06em", marginTop: 6 }}>
              FOREVER · NO CARD REQUIRED
            </p>
            <p className="serif" style={{ color: "var(--ink-2)", fontSize: 14, marginTop: 14, lineHeight: 1.5 }}>
              A real product, not a demo. Free covers the optimizer for every category, the full card catalog with side-by-side comparison, and welcome-bonus tracking on three cards.
            </p>

            <ul style={{ listStyle: "none", padding: 0, margin: "20px 0 0" }}>
              {[
                `Up to ${FREE_LIMITS.maxCards} cards in wallet`,
                "Spend optimizer",
                "Card catalog & comparison",
                `${FREE_LIMITS.maxChatMessagesPerMonth} AI chat messages per month`,
                "Welcome-bonus tracking",
                "Last 10 spend entries",
              ].map((item) => (
                <FeatureLine key={item} included>
                  {item}
                </FeatureLine>
              ))}
            </ul>

            <div style={{ marginTop: 22 }}>
              <Button variant="secondary" size="md" disabled style={{ width: "100%" }}>
                {isPro ? "Pro is active" : "Current plan"}
              </Button>
            </div>
          </PaperTile>

          {/* Pro tier */}
          <PaperTile accent>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <PlanEyebrow accent>Pro</PlanEyebrow>
              <span
                className="sans"
                style={{
                  fontSize: 12,
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                  padding: "4px 10px",
                  border: "1px solid var(--gold)",
                  borderRadius: 999,
                  color: "var(--ink)",
                  background: "var(--gold-tint)",
                  fontWeight: 600,
                }}
              >
                Recommended
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
              <span className="display" style={{ fontSize: 56, lineHeight: 1, color: "var(--ink)" }}>
                {interval === "pro" && `$${PRICING.pro.monthlyEquivalent.toFixed(2)}`}
                {interval === "proPlus" && `$${PRICING.proPlus.monthlyEquivalent.toFixed(2)}`}
                {interval === "lifetime" && `$${PRICING.lifetime.price}`}
              </span>
              <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.06em" }}>
                {interval === "pro" && "/MO BILLED ANNUALLY"}
                {interval === "proPlus" && "/MO BILLED ANNUALLY"}
                {interval === "lifetime" && "ONCE"}
              </span>
            </div>
            {interval === "pro" && (
              <p className="mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.06em", marginTop: 6 }}>
                {`$${PRICING.pro.price} per year · ${PRICING.pro.note}`}
              </p>
            )}
            {interval === "proPlus" && (
              <p className="mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.06em", marginTop: 6 }}>
                {`$${PRICING.proPlus.price} per year · ${PRICING.proPlus.note}`}
              </p>
            )}
            {interval === "lifetime" && (
              <p className="mono" style={{ fontSize: 11, color: "var(--accent)", letterSpacing: "0.06em", marginTop: 6 }}>
                {PRICING.lifetime.note}
              </p>
            )}
            <p className="serif" style={{ color: "var(--ink-2)", fontSize: 14, marginTop: 14, lineHeight: 1.5 }}>
              Aeroplan SQC projection, missed-rewards forensics, credit calendar, card-value scorecard, plus everything in Free without limits. The Canadian advantage in one subscription.
            </p>

            <ul style={{ listStyle: "none", padding: 0, margin: "20px 0 0" }}>
              {[
                "Aeroplan 2026 SQC projector",
                "Missed-rewards forensics",
                "Credits & renewals calendar",
                "Card-value scorecard",
                "Buy-points break-even & stacking",
                "Devaluation alarms · award watcher",
                "Trip planner · unlimited AI chat with Research Mode",
                "Unlimited cards · full spend history · CSV export",
              ].map((item) => (
                <FeatureLine key={item} included accent>
                  {item}
                </FeatureLine>
              ))}
            </ul>

            <div style={{ marginTop: 22 }}>
              {isPro ? (
                <Button variant="secondary" size="md" disabled style={{ width: "100%", borderColor: "var(--gain)", color: "var(--gain)" }}>
                  ✓ Pro is active
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleCheckout}
                  loading={loading}
                  style={{ width: "100%" }}
                >
                  {loading
                    ? "Redirecting"
                    : interval === "lifetime"
                    ? `Get lifetime Pro · ${plan.label}`
                    : interval === "proPlus"
                    ? `Start Pro Plus · ${plan.label}`
                    : `Start Pro · ${plan.label}`}
                </Button>
              )}
              <p className="eyebrow" style={{ marginTop: 10, textAlign: "center" }}>
                {interval === "lifetime"
                  ? "One-time payment · 30-day refund · Stripe checkout"
                  : "30-day refund · Cancel anytime · Stripe checkout"}
              </p>
            </div>
          </PaperTile>
        </div>

        <LeafDivider />

        {/* Why Pro — the four flagship tools, with editorial treatment */}
        <section style={{ marginTop: 8 }}>
          <header style={{ marginBottom: 22 }}>
            <div className="mr-hero-kicker" style={{ marginBottom: 10 }}>
              <span className="eyebrow" style={{ color: "var(--accent)" }}>What you get</span>
              <span className="mr-kicker-line" style={{ maxWidth: 60 }} />
            </div>
            <h2 className="display" style={{ fontSize: "clamp(28px, 3vw, 36px)", margin: 0, lineHeight: 1.05, letterSpacing: "-0.01em" }}>
              The four tools that <span style={{ fontStyle: "italic" }}>justify</span> the subscription.
            </h2>
            <p className="serif" style={{ marginTop: 8, fontSize: 15, fontStyle: "italic", color: "var(--ink-2)", maxWidth: 720, lineHeight: 1.45 }}>
              Each of these exists in MapleRewards because no Canadian app we know of has shipped them. Visit the live tools at{" "}
              <Link href="/pro-tools" style={{ color: "var(--accent)", textDecoration: "underline" }}>
                /pro-tools
              </Link>
              . They go live the moment Pro is active.
            </p>
          </header>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 18,
            }}
          >
            {PRO_TOOL_PITCH.map((p) => (
              <article
                key={p.kicker}
                style={{
                  border: "1px solid var(--rule)",
                  borderRadius: 14,
                  background: "var(--card-fill-strong)",
                  padding: "20px 22px",
                  boxShadow: "var(--shadow-1)",
                }}
              >
                <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 8 }}>
                  {p.kicker}
                </div>
                <h3 className="display" style={{ fontSize: 20, lineHeight: 1.2, margin: 0, color: "var(--ink)" }}>
                  {p.title}
                </h3>
                <p className="serif" style={{ marginTop: 8, fontSize: 14, fontStyle: "italic", color: "var(--ink-2)", lineHeight: 1.5 }}>
                  {p.lede}
                </p>
              </article>
            ))}
          </div>
        </section>

        <LeafDivider />

        {/* Feature comparison */}
        <section>
          <header style={{ marginBottom: 18 }}>
            <div className="mr-hero-kicker" style={{ marginBottom: 10 }}>
              <span className="eyebrow" style={{ color: "var(--accent)" }}>Comparison</span>
              <span className="mr-kicker-line" style={{ maxWidth: 60 }} />
            </div>
            <h2 className="display" style={{ fontSize: "clamp(28px, 3vw, 36px)", margin: 0, lineHeight: 1.05, letterSpacing: "-0.01em" }}>
              Every feature, side-by-side.
            </h2>
          </header>

          <div
            style={{
              border: "1px solid var(--rule)",
              borderRadius: 14,
              background: "var(--card-fill-strong)",
              overflow: "hidden",
            }}
          >
            <ComparisonHeader />
            {TIER_GROUPS.map((group, gi) => (
              <div key={group.name}>
                <div
                  className="eyebrow"
                  style={{
                    padding: "14px 18px 8px",
                    color: "var(--accent)",
                    background: gi === 0 ? "var(--accent-soft)" : "transparent",
                    borderTop: gi === 0 ? "none" : "1px solid var(--rule)",
                  }}
                >
                  {group.name}
                </div>
                {group.features.map((feature, fi) => (
                  <ComparisonRow key={feature.name} feature={feature} striped={fi % 2 === 1} />
                ))}
              </div>
            ))}
          </div>
        </section>

        <aside
          style={{
            marginTop: 28,
            padding: "20px 22px",
            border: "1px solid var(--rule)",
            borderRadius: 14,
            background: "var(--card-fill-strong)",
            textAlign: "center",
          }}
        >
          <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 8 }}>
            What Pro pays back
          </div>
          <p
            className="serif"
            style={{ margin: 0, fontSize: 17, color: "var(--ink)", lineHeight: 1.45, maxWidth: 640, marginLeft: "auto", marginRight: "auto" }}
          >
            Pro runs your real spend through the optimizer every month and shows you the exact swipes that left rewards on the table — your number, not an industry average. If the missed total beats the subscription, you keep using it; if it doesn&rsquo;t, cancel.
          </p>
        </aside>

        <LeafDivider />

        {/* FAQ */}
        <section>
          <header style={{ marginBottom: 18 }}>
            <div className="mr-hero-kicker" style={{ marginBottom: 10 }}>
              <span className="eyebrow" style={{ color: "var(--accent)" }}>Frequently asked</span>
              <span className="mr-kicker-line" style={{ maxWidth: 60 }} />
            </div>
            <h2 className="display" style={{ fontSize: "clamp(28px, 3vw, 36px)", margin: 0, lineHeight: 1.05, letterSpacing: "-0.01em" }}>
              Plain answers.
            </h2>
          </header>

          <div style={{ display: "grid", gap: 12 }}>
            {[
              {
                q: "Can I cancel anytime?",
                a: "Yes — account settings → Manage billing opens the Stripe portal where you cancel in one click. Pro stays active until the end of the period you've already paid for; we don't pro-rate refunds for partial months.",
              },
              {
                q: "Do I need an account for the free tier?",
                a: "No. The optimizer, card catalog, and comparison work without one. Sign up to save your wallet and open the missed-rewards forensics.",
              },
              {
                q: "Why not US apps like MaxRewards or CardPointers?",
                a: "They don't speak Canadian. No Aeroplan SQC tracking, shallow Air Miles / Scene+ / Amex MR Canada coverage, no Canadian-issuer offer automation. Maple is built for the Canadian collector.",
              },
              {
                q: "What payment methods do you accept?",
                a: "Visa, Mastercard, Amex via Stripe Checkout. PCI-compliant; we never see your card data.",
              },
              {
                q: "Is there a free trial?",
                a: "Yes — a 3-day free trial on Pro and Pro Plus. Your card is collected at signup and charged when the trial ends unless you cancel first. Lifetime has no trial — it's a one-time purchase.",
              },
              {
                q: "Can I switch between Pro and Pro Plus?",
                a: "Yes — from Manage billing in account settings. Upgrades are pro-rated immediately; downgrades take effect at the end of your current period.",
              },
            ].map(({ q, a }) => (
              <details
                key={q}
                style={{
                  border: "1px solid var(--rule)",
                  borderRadius: 12,
                  background: "var(--card-fill)",
                  padding: "14px 16px",
                }}
              >
                <summary
                  className="display"
                  style={{ fontSize: 16, color: "var(--ink)", cursor: "pointer", listStyle: "none" }}
                >
                  {q}
                </summary>
                <p className="serif" style={{ marginTop: 8, fontSize: 14, color: "var(--ink-2)", fontStyle: "italic", lineHeight: 1.5 }}>
                  {a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* Bottom CTA */}
        {!isPro && (
          <div style={{ marginTop: 56, textAlign: "center" }}>
            <Button variant="primary" size="lg" onClick={handleCheckout} loading={loading}>
              {loading
                ? "Redirecting"
                : interval === "lifetime"
                ? `Get lifetime Pro · ${PRICING.lifetime.label}`
                : interval === "proPlus"
                ? `Get Pro Plus · ${plan.label}`
                : `Get Pro · ${plan.label}`}
            </Button>
            <p className="eyebrow" style={{ marginTop: 12 }}>
              {interval === "lifetime"
                ? "One-time payment · 30-day refund · Stripe checkout"
                : "30-day refund · Cancel anytime · Stripe checkout"}
            </p>
            <p
              className="serif"
              style={{ marginTop: 10, fontSize: 14, color: "var(--ink-2)", lineHeight: 1.5, maxWidth: 560, marginLeft: "auto", marginRight: "auto" }}
            >
              How they fit together: Pro and Pro Plus start with the 3-day free trial,
              Lifetime is a single one-time payment, and every paid plan carries the
              30-day refund — after that, subscriptions run to the end of the period
              you&rsquo;ve already paid for, with no pro-rated partial refunds.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Editorial primitives local to this page ───────────────────────────── */

function PaperTile({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <div
      style={{
        position: "relative",
        border: `1px solid ${accent ? "var(--accent)" : "var(--rule)"}`,
        background: "var(--card-fill-strong)",
        borderRadius: 14,
        padding: "26px 24px",
        /* Accent tile carries the signature maple glow + a heavier resting shadow
         * so it stands out from Free without changing grid alignment. */
        boxShadow: accent ? "var(--shadow-accent-glow), var(--shadow-2)" : "var(--shadow-1)",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: accent
            ? "radial-gradient(ellipse 80% 50% at 100% 0%, var(--accent-glow), transparent 65%), radial-gradient(ellipse 60% 40% at 0% 100%, var(--gold-soft), transparent 60%)"
            : "transparent",
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative" }}>{children}</div>
    </div>
  );
}

function PlanEyebrow({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      className="eyebrow"
      style={{
        color: accent ? "var(--accent)" : "var(--ink-3)",
        letterSpacing: "0.18em",
      }}
    >
      {children}
    </span>
  );
}

function IntervalButton({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="mono"
      style={{
        padding: "8px 18px",
        borderRadius: 999,
        background: active ? "var(--accent)" : "transparent",
        color: active ? "#fff" : "var(--ink-2)",
        border: "none",
        fontSize: 11,
        letterSpacing: "0.10em",
        textTransform: "uppercase",
        fontWeight: 600,
        cursor: active ? "default" : "pointer",
        transition: "background 160ms, color 160ms",
      }}
    >
      {children}
    </button>
  );
}

function FeatureLine({
  children,
  included,
  accent = false,
}: {
  children: React.ReactNode;
  included: boolean;
  accent?: boolean;
}) {
  return (
    <li
      className="serif"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "6px 0",
        fontSize: 14,
        color: included ? "var(--ink-2)" : "var(--ink-3)",
        fontStyle: included ? "normal" : "italic",
      }}
    >
      {included ? (
        <Check size={15} style={{ marginTop: 3, color: accent ? "var(--accent)" : "var(--gain)", flexShrink: 0 }} />
      ) : (
        <X size={15} style={{ marginTop: 3, color: "var(--ink-4)", flexShrink: 0 }} />
      )}
      <span>{children}</span>
    </li>
  );
}

function ComparisonHeader() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 100px 100px",
        padding: "14px 18px",
        borderBottom: "1px solid var(--rule)",
        background: "var(--surface-2)",
      }}
    >
      <span className="eyebrow">Feature</span>
      <span className="eyebrow" style={{ textAlign: "center" }}>
        Free
      </span>
      <span className="eyebrow" style={{ textAlign: "center", color: "var(--accent)" }}>
        Pro
      </span>
    </div>
  );
}

function ComparisonRow({
  feature,
  striped,
}: {
  feature: { name: string; free: string | boolean; pro: string | boolean };
  striped: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 100px 100px",
        padding: "12px 18px",
        borderBottom: "1px solid var(--rule)",
        background: striped ? "var(--surface-2)" : "transparent",
        alignItems: "center",
      }}
    >
      <span className="serif" style={{ fontSize: 14, color: "var(--ink)" }}>
        {feature.name}
      </span>
      <ComparisonCell value={feature.free} />
      {/* Pro column gets a soft maple wash so the eye reads the tier-of-interest
       * as the user scans. Stays subtle on both striped and unstriped rows. */}
      <div style={{ position: "relative" }}>
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: "-12px -18px",
            background: "var(--accent-wash)",
            pointerEvents: "none",
          }}
        />
        <div style={{ position: "relative" }}>
          <ComparisonCell value={feature.pro} accent />
        </div>
      </div>
    </div>
  );
}

function ComparisonCell({ value, accent = false }: { value: string | boolean; accent?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      {typeof value === "boolean" ? (
        value ? (
          <Check size={16} style={{ color: accent ? "var(--accent)" : "var(--gain)" }} />
        ) : (
          <X size={16} style={{ color: "var(--ink-4)" }} />
        )
      ) : (
        <span
          className="mono"
          style={{
            fontSize: 12,
            color: accent ? "var(--accent)" : "var(--ink-2)",
            letterSpacing: "0.04em",
            textAlign: "center",
          }}
        >
          {value}
        </span>
      )}
    </div>
  );
}

export default function PricingPage() {
  return (
    <Suspense>
      <PricingContent />
    </Suspense>
  );
}
