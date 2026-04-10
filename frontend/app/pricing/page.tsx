"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, X, Sparkles, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { PRICING, TIER_FEATURES } from "@/lib/pro-features";
import { AnimatedSection } from "@/components/ui/animated-list";
import { createCheckoutSession } from "@/lib/api";

function PricingContent() {
  const { isPro, isAuthenticated } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [annual, setAnnual] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const plan = annual ? PRICING.annual : PRICING.monthly;

  // Handle Stripe redirect results
  useEffect(() => {
    if (searchParams.get("success") === "true") {
      setSuccessMsg("Payment successful! Your Pro subscription is now active.");
    }
    if (searchParams.get("canceled") === "true") {
      setError("Checkout was canceled. You can try again whenever you're ready.");
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
      // Redirect to Stripe Checkout
      window.location.href = session.url;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      if (msg.includes("billing is not configured") || msg.includes("stripe not configured")) {
        setError("Billing is not yet configured. All Pro features are currently free during beta!");
      } else {
        setError(msg);
      }
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Ambient orbs */}
      <div
        className="orb w-[500px] h-[300px] top-[-80px] left-1/2 -translate-x-1/2"
        style={{
          background:
            "radial-gradient(ellipse, rgba(245,158,11,0.08) 0%, transparent 70%)",
        }}
      />

      <div className="relative max-w-3xl mx-auto px-6 pt-10 pb-24">
        {/* Success / Error banners */}
        {successMsg && (
          <div
            className="mb-6 p-4 rounded-xl text-center text-[14px] font-medium"
            style={{
              background: "rgba(52,211,153,0.1)",
              border: "1px solid rgba(52,211,153,0.25)",
              color: "#34D399",
            }}
          >
            ✓ {successMsg}
          </div>
        )}
        {error && (
          <div
            className="mb-6 p-4 rounded-xl text-center text-[14px] font-medium"
            style={{
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.25)",
              color: "#EF4444",
            }}
          >
            {error}
          </div>
        )}

        {/* Header */}
        <AnimatedSection className="text-center mb-10">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5 text-[12px] font-semibold"
            style={{
              background: "rgba(245,158,11,0.1)",
              border: "1px solid rgba(245,158,11,0.2)",
              color: "#F59E0B",
            }}
          >
            <Sparkles size={13} />
            MapleRewards Pro
          </div>
          <h1 className="text-[28px] sm:text-[34px] font-bold text-white mb-3 leading-tight">
            Maximize every dollar<br />you spend on rewards
          </h1>
          <p
            className="text-[15px] max-w-[440px] mx-auto leading-relaxed"
            style={{ color: "var(--text-secondary)" }}
          >
            Unlock AI research, portfolio analytics, trip planning, and unlimited
            card tracking for less than a coffee per month.
          </p>
        </AnimatedSection>

        {/* Billing toggle */}
        <AnimatedSection delay={0.05} className="flex justify-center mb-8">
          <div
            className="flex items-center gap-1 p-1 rounded-xl"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <button
              onClick={() => setAnnual(false)}
              className="px-4 py-2 rounded-lg text-[13px] font-medium transition-all"
              style={{
                background: !annual ? "rgba(245,158,11,0.15)" : "transparent",
                color: !annual ? "#F59E0B" : "var(--text-tertiary)",
              }}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              className="px-4 py-2 rounded-lg text-[13px] font-medium transition-all flex items-center gap-1.5"
              style={{
                background: annual ? "rgba(245,158,11,0.15)" : "transparent",
                color: annual ? "#F59E0B" : "var(--text-tertiary)",
              }}
            >
              Annual
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                style={{
                  background: "rgba(52,211,153,0.15)",
                  color: "#34D399",
                }}
              >
                Save 37%
              </span>
            </button>
          </div>
        </AnimatedSection>

        {/* Pricing cards */}
        <AnimatedSection delay={0.1}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-12">
            {/* Free tier */}
            <div
              className="rounded-2xl p-6"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-dim)",
              }}
            >
              <p className="text-[12px] font-semibold uppercase tracking-wider mb-3"
                style={{ color: "var(--text-tertiary)" }}
              >
                Free
              </p>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-[32px] font-bold text-white">$0</span>
                <span className="text-[14px]" style={{ color: "var(--text-tertiary)" }}>
                  /forever
                </span>
              </div>
              <p className="text-[13px] mb-6" style={{ color: "var(--text-secondary)" }}>
                Great for getting started with rewards optimization.
              </p>

              <ul className="space-y-2.5 mb-6">
                {[
                  "Up to 3 cards in wallet",
                  "Spend optimizer",
                  "Card catalog & comparison",
                  "1 AI chat message per month",
                  "Basic insights (10 entries)",
                  "Welcome bonus tracking",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-[13px]" style={{ color: "var(--text-secondary)" }}>
                    <Check size={14} className="mt-0.5 shrink-0" style={{ color: "#34D399" }} />
                    {item}
                  </li>
                ))}
              </ul>

              {isPro ? (
                <div
                  className="h-11 flex items-center justify-center rounded-xl text-[14px] font-medium"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: "var(--text-tertiary)",
                  }}
                >
                  Current plan: Pro
                </div>
              ) : (
                <div
                  className="h-11 flex items-center justify-center rounded-xl text-[14px] font-medium"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: "var(--text-secondary)",
                  }}
                >
                  Current plan
                </div>
              )}
            </div>

            {/* Pro tier */}
            <div
              className="rounded-2xl p-6 relative"
              style={{
                background: "linear-gradient(135deg, rgba(245,158,11,0.06), rgba(217,119,6,0.03))",
                border: "1px solid rgba(245,158,11,0.25)",
              }}
            >
              {/* Popular badge */}
              <div
                className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                style={{
                  background: "linear-gradient(135deg, #F59E0B, #D97706)",
                  color: "#000",
                }}
              >
                Most Popular
              </div>

              <p className="text-[12px] font-semibold uppercase tracking-wider mb-3"
                style={{ color: "#F59E0B" }}
              >
                Pro
              </p>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-[32px] font-bold text-white">
                  ${annual ? PRICING.annual.monthlyEquivalent.toFixed(2) : PRICING.monthly.price.toFixed(2)}
                </span>
                <span className="text-[14px]" style={{ color: "var(--text-tertiary)" }}>
                  /month
                </span>
              </div>
              {annual && (
                <p className="text-[12px] mb-1" style={{ color: "var(--text-tertiary)" }}>
                  Billed ${PRICING.annual.price}/year
                </p>
              )}
              <p className="text-[13px] mb-6" style={{ color: "var(--text-secondary)" }}>
                Everything in Free, plus unlimited access to all premium features.
              </p>

              <ul className="space-y-2.5 mb-6">
                {[
                  "Unlimited cards in wallet",
                  "Unlimited AI chat + Research Mode",
                  "Full spend history & charts",
                  "Portfolio analyzer (fee ROI, gap analysis)",
                  "Trip planner",
                  "Opportunity cost analysis",
                  "CSV data export",
                  "Priority recommendations",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-[13px]" style={{ color: "var(--text-secondary)" }}>
                    <Check size={14} className="mt-0.5 shrink-0" style={{ color: "#F59E0B" }} />
                    {item}
                  </li>
                ))}
              </ul>

              {isPro ? (
                <div
                  className="h-11 flex items-center justify-center rounded-xl text-[14px] font-semibold"
                  style={{
                    background: "rgba(52,211,153,0.12)",
                    border: "1px solid rgba(52,211,153,0.25)",
                    color: "#34D399",
                  }}
                >
                  ✓ Active
                </div>
              ) : (
                <button
                  onClick={handleCheckout}
                  disabled={loading}
                  className="w-full h-11 rounded-xl font-semibold text-[14px] text-black transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-70 disabled:hover:scale-100 flex items-center justify-center gap-2"
                  style={{
                    background: "linear-gradient(135deg, #F59E0B, #D97706)",
                    boxShadow: "0 4px 20px rgba(245,158,11,0.3)",
                  }}
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Redirecting to checkout...
                    </>
                  ) : (
                    <>Get Pro — {plan.label}</>
                  )}
                </button>
              )}
            </div>
          </div>
        </AnimatedSection>

        {/* Feature comparison table */}
        <AnimatedSection delay={0.15}>
          <h2 className="text-[18px] font-bold text-white text-center mb-6">
            Feature Comparison
          </h2>

          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-dim)",
            }}
          >
            {/* Table header */}
            <div
              className="grid grid-cols-3 px-5 py-3"
              style={{ borderBottom: "1px solid var(--border-dim)" }}
            >
              <span className="text-[12px] font-semibold" style={{ color: "var(--text-tertiary)" }}>
                Feature
              </span>
              <span className="text-[12px] font-semibold text-center" style={{ color: "var(--text-tertiary)" }}>
                Free
              </span>
              <span className="text-[12px] font-semibold text-center" style={{ color: "#F59E0B" }}>
                Pro
              </span>
            </div>

            {/* Rows */}
            {TIER_FEATURES.map((feature, i) => (
              <div
                key={feature.name}
                className="grid grid-cols-3 px-5 py-3 items-center"
                style={{
                  borderBottom: i < TIER_FEATURES.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                  background: i % 2 === 1 ? "rgba(255,255,255,0.02)" : "transparent",
                }}
              >
                <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                  {feature.name}
                </span>
                <div className="flex justify-center">
                  {typeof feature.free === "boolean" ? (
                    feature.free ? (
                      <Check size={15} style={{ color: "#34D399" }} />
                    ) : (
                      <X size={15} style={{ color: "var(--text-tertiary)", opacity: 0.5 }} />
                    )
                  ) : (
                    <span className="text-[12px] text-center" style={{ color: "var(--text-tertiary)" }}>
                      {feature.free}
                    </span>
                  )}
                </div>
                <div className="flex justify-center">
                  {typeof feature.pro === "boolean" ? (
                    feature.pro ? (
                      <Check size={15} style={{ color: "#F59E0B" }} />
                    ) : (
                      <X size={15} style={{ color: "var(--text-tertiary)", opacity: 0.5 }} />
                    )
                  ) : (
                    <span className="text-[12px] font-medium text-center" style={{ color: "#F59E0B" }}>
                      {feature.pro}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </AnimatedSection>

        {/* FAQ */}
        <AnimatedSection delay={0.2} className="mt-12">
          <h2 className="text-[18px] font-bold text-white text-center mb-6">
            Frequently Asked Questions
          </h2>

          <div className="space-y-3">
            {[
              {
                q: "Can I cancel anytime?",
                a: "Yes. Cancel anytime from your account settings. Your Pro features remain active until the end of your billing period.",
              },
              {
                q: "Do I need to sign up to use the free tier?",
                a: "No. You can use the optimizer, card catalog, and basic features without an account. Sign up to save your wallet and unlock personalized insights.",
              },
              {
                q: "What payment methods do you accept?",
                a: "We accept all major credit cards (Visa, Mastercard, Amex) through Stripe. Your payment is secure and PCI-compliant.",
              },
              {
                q: "Is there a free trial?",
                a: "During our beta period, all Pro features are available for free. When billing launches, existing users will get a 14-day trial.",
              },
              {
                q: "Can I switch between monthly and annual?",
                a: "Yes. You can switch between billing intervals anytime. When switching to annual, you'll be prorated for the remainder of your current month.",
              },
            ].map(({ q, a }) => (
              <div
                key={q}
                className="rounded-xl p-4"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <h3 className="text-[14px] font-semibold text-white mb-1.5">{q}</h3>
                <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {a}
                </p>
              </div>
            ))}
          </div>
        </AnimatedSection>

        {/* Bottom CTA */}
        {!isPro && (
          <AnimatedSection delay={0.25} className="mt-12 text-center">
            <button
              onClick={handleCheckout}
              disabled={loading}
              className="h-12 px-8 rounded-xl font-semibold text-[15px] text-black transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:hover:scale-100 inline-flex items-center gap-2"
              style={{
                background: "linear-gradient(135deg, #F59E0B, #D97706)",
                boxShadow: "0 4px 24px rgba(245,158,11,0.3)",
              }}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Redirecting...
                </>
              ) : (
                <>Get Pro — {annual ? PRICING.annual.label : PRICING.monthly.label}</>
              )}
            </button>
            <p className="text-[12px] mt-3" style={{ color: "var(--text-tertiary)" }}>
              30-day money-back guarantee · Cancel anytime
            </p>
          </AnimatedSection>
        )}
      </div>
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
