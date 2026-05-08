"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, X, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { PRICING, TIER_GROUPS } from "@/lib/pro-features";
import { createCheckoutSession } from "@/lib/api";
import { PageMasthead } from "@/components/editorial/page-masthead";
import { LeafDivider } from "@/components/editorial/leaf-divider";
import { Button } from "@/components/ui/button";

/* ─────────────────────────────────────────────────────────────────────────────
 * Pricing — editorial treatment
 *
 * Leads with the Canadian wedge (Aeroplan SQC, missed-rewards forensics) which
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
      "Maple is the only Canadian app that turns the new Status Qualifying Credits framework into a forecast — current tier, gap to the next, and the cheapest card to close it.",
  },
  {
    kicker: "Missed-rewards forensics",
    title: "See what each swipe cost you",
    lede:
      "Every spend re-ranked against your current wallet. The dollar gap is exactly what the optimal card would have earned — itemised by category and by purchase.",
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
      "Insurance, lounge, concierge, FX savings, multipliers, credit bundles — all priced and netted against the annual fee. No more vibes.",
  },
];

function PricingContent() {
  const { isPro, isAuthenticated } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [annual, setAnnual] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const plan = annual ? PRICING.annual : PRICING.monthly;

  // Stripe redirect feedback
  useEffect(() => {
    if (searchParams.get("success") === "true") {
      setSuccessMsg("Payment received. Pro is active across your wallet.");
    }
    if (searchParams.get("canceled") === "true") {
      setError("Checkout was canceled. Pick it back up whenever you're ready.");
    }
  }, [searchParams]);

  async function handleCheckout() {
    if (!isAuthenticated) {
      router.push("/login?redirect=/pricing");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const session = await createCheckoutSession(annual ? "annual" : "monthly");
      window.location.href = session.url;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      if (msg.includes("billing is not configured") || msg.includes("stripe not configured")) {
        setError("Billing is in beta. All Pro features are currently free — no card needed.");
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
          lede="Built for Aeroplan, Air Miles, Scene+, Amex MR Canada, RBC Avion. The Pro tier ships an SQC projector and missed-rewards forensics that no US app even attempts — that's the entire pitch."
        />

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
            <IntervalButton active={!annual} onClick={() => setAnnual(false)}>
              Monthly
            </IntervalButton>
            <IntervalButton active={annual} onClick={() => setAnnual(true)}>
              Annual <span style={{ color: "var(--gain)", marginLeft: 8 }}>save 37%</span>
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
            <p className="serif" style={{ fontStyle: "italic", color: "var(--ink-2)", fontSize: 14, marginTop: 14, lineHeight: 1.5 }}>
              Optimizer, card catalog, three wallet slots, one AI chat per month. Useful for getting your bearings.
            </p>

            <ul style={{ listStyle: "none", padding: 0, margin: "20px 0 0" }}>
              {[
                "Up to 3 cards in wallet",
                "Spend optimizer",
                "Card catalog & comparison",
                "1 AI chat message per month",
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
                className="mono"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                  padding: "4px 10px",
                  border: "1px solid var(--accent)",
                  borderRadius: 999,
                  color: "var(--accent)",
                }}
              >
                Canada-first
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
              <span className="display" style={{ fontSize: 56, lineHeight: 1, color: "var(--ink)" }}>
                ${(annual ? PRICING.annual.monthlyEquivalent : PRICING.monthly.price).toFixed(2)}
              </span>
              <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.06em" }}>
                /MO {annual ? "BILLED ANNUALLY" : ""}
              </span>
            </div>
            {annual && (
              <p className="mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.06em", marginTop: 6 }}>
                {`$${PRICING.annual.price} per year · ${PRICING.annual.savings} off monthly`}
              </p>
            )}
            <p className="serif" style={{ fontStyle: "italic", color: "var(--ink-2)", fontSize: 14, marginTop: 14, lineHeight: 1.5 }}>
              Aeroplan SQC projection, missed-rewards forensics, credit calendar, card-value scorecard, plus everything in Free without limits. The Canadian wedge in one subscription.
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
                  {loading ? "Redirecting" : `Subscribe · ${plan.label}`}
                </Button>
              )}
              <p className="mono" style={{ fontSize: 9, marginTop: 10, color: "var(--ink-3)", letterSpacing: "0.10em", textTransform: "uppercase", textAlign: "center" }}>
                30-day refund · Cancel anytime · Stripe checkout
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
              Each of these exists in MapleRewards because no Canadian app has shipped them. Visit the live tools at{" "}
              <Link href="/pro-tools" style={{ color: "var(--accent)", textDecoration: "underline" }}>
                /pro-tools
              </Link>
              {" "}— they are unlocked the moment Pro is active.
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
                a: "Yes. One click in account settings. Pro stays active until the end of your current billing period; we don't pro-rate refunds for partial months.",
              },
              {
                q: "Do I need an account for the free tier?",
                a: "No. The optimizer, card catalog, and comparison work without one. Sign up to save your wallet and unlock the missed-rewards forensics.",
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
                a: "During the beta, every Pro feature is free. When billing flips on, founding subscribers get a 14-day trial.",
              },
              {
                q: "Can I switch between monthly and annual?",
                a: "Yes. Pro-rated automatically when you switch up; the change takes effect at the end of your current period when you switch down.",
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
              {loading ? "Redirecting" : `Subscribe to Pro · ${annual ? PRICING.annual.label : PRICING.monthly.label}`}
            </Button>
            <p className="mono" style={{ fontSize: 10, marginTop: 12, color: "var(--ink-3)", letterSpacing: "0.10em", textTransform: "uppercase" }}>
              30-day refund · Cancel anytime · Stripe checkout
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
        boxShadow: accent ? "var(--shadow-2)" : "var(--shadow-1)",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: accent
            ? "radial-gradient(ellipse 70% 45% at 100% 0%, var(--accent-soft), transparent 65%)"
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
      <ComparisonCell value={feature.pro} accent />
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
            fontSize: 11,
            color: accent ? "var(--accent)" : "var(--ink-3)",
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
