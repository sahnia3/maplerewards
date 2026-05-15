"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Zap, Wallet as WalletIcon, Sparkles, MessageCircle } from "lucide-react";

const TOUR_KEY = "maple_home_tour_seen_v1";

interface Step {
  title: string;
  body: string;
  icon: React.ComponentType<{ size?: number }>;
  cta?: { label: string; href: string };
}

const STEPS: Step[] = [
  {
    title: "Welcome to MapleRewards",
    body: "We rank every Canadian credit card by what it actually earns on each purchase — in CAD, with caps and transfer partners baked in. Three quick stops before you dive in.",
    icon: Sparkles,
  },
  {
    title: "Your wallet, live",
    body: "The portfolio panel on the left shows your total points and CAD value. Add a card on the Wallet page; we model real earn rates, multipliers, and welcome-bonus runways.",
    icon: WalletIcon,
    cta: { label: "Open Wallet", href: "/wallet" },
  },
  {
    title: "Find the best card per swipe",
    body: "The Optimizer takes a category and an amount, then ranks every card in your wallet by what it would earn — accounting for caps and transfer-partner sweet spots.",
    icon: Zap,
    cta: { label: "Try Optimizer", href: "/optimizer" },
  },
  {
    title: "Pro Tools — Canadian wedge",
    body: "Aeroplan SQC projection, missed-rewards forensics, credit-window calendar, card-value scorecard. Available in /pro-tools and gated by Pro.",
    icon: Sparkles,
    cta: { label: "See Pro Tools", href: "/pro-tools" },
  },
  {
    title: "Ask the AI desk anything",
    body: "Chat with our Canadian rewards assistant for travel routing, transfer math, or 'should I open this card?' — the assistant has live award-search and web-search tools.",
    icon: MessageCircle,
    cta: { label: "Open AI chat", href: "/chat" },
  },
];

/**
 * HomeTour — first-load welcome carousel for the authenticated dashboard.
 *
 * Renders nothing if the user has dismissed or completed the tour before
 * (`localStorage[TOUR_KEY] === "true"`). Otherwise overlays a small carousel
 * walking through wallet → optimizer → Pro Tools → AI chat. State persists
 * locally so the tour fires exactly once per browser.
 *
 * Re-trigger: clear `localStorage[TOUR_KEY]`. A future Settings entry can
 * expose this as a one-click "replay walkthrough".
 */
export function HomeTour() {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(TOUR_KEY) === "true") return;
    // Defer so the dashboard renders first; gives the overlay a clean entrance.
    const t = setTimeout(() => setActive(true), 700);
    return () => clearTimeout(t);
  }, []);

  function dismiss() {
    setActive(false);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(TOUR_KEY, "true");
    }
  }

  if (!active) return null;

  const current = STEPS[step];
  const last = step === STEPS.length - 1;
  const Icon = current.icon;

  return (
    <div
      role="dialog"
      aria-modal
      aria-labelledby="home-tour-title"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(8,12,18,0.55)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "grid",
        placeItems: "center",
        padding: 20,
        zIndex: 80,
        animation: "tourFade 200ms ease",
      }}
      onClick={dismiss}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 480,
          width: "100%",
          background: "var(--surface)",
          border: "1px solid var(--rule)",
          borderRadius: 18,
          boxShadow: "0 30px 60px -20px rgba(0,0,0,0.4)",
          padding: "28px 28px 22px",
          position: "relative",
        }}
      >
        <button
          aria-label="Skip tour"
          onClick={dismiss}
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            background: "transparent",
            border: "none",
            color: "var(--ink-3)",
            cursor: "pointer",
            padding: 4,
            borderRadius: 8,
          }}
        >
          <X size={16} />
        </button>

        {/* Step indicator */}
        <div
          className="mono"
          style={{
            fontSize: 10,
            letterSpacing: "0.18em",
            color: "var(--ink-3)",
            textTransform: "uppercase",
            marginBottom: 16,
          }}
        >
          Step {step + 1} of {STEPS.length}
        </div>

        {/* Icon + title */}
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 12 }}>
          <div
            style={{
              flexShrink: 0,
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "var(--accent-soft)",
              color: "var(--accent)",
              display: "grid",
              placeItems: "center",
            }}
          >
            <Icon size={22} />
          </div>
          <h2
            id="home-tour-title"
            className="display"
            style={{
              fontSize: 24,
              margin: 0,
              lineHeight: 1.15,
              letterSpacing: "-0.005em",
              color: "var(--ink)",
            }}
          >
            {current.title}
          </h2>
        </div>

        {/* Body copy */}
        <p
          className="serif"
          style={{
            margin: 0,
            color: "var(--ink-2)",
            fontStyle: "italic",
            fontSize: 15,
            lineHeight: 1.5,
          }}
        >
          {current.body}
        </p>

        {/* Optional in-step CTA */}
        {current.cta && (
          <Link
            href={current.cta.href}
            onClick={dismiss}
            className="mono"
            style={{
              display: "inline-block",
              marginTop: 16,
              padding: "10px 16px",
              borderRadius: 999,
              border: "1px solid var(--accent)",
              color: "var(--accent)",
              background: "transparent",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              textDecoration: "none",
            }}
          >
            {current.cta.label} →
          </Link>
        )}

        {/* Progress dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 26 }}>
          {STEPS.map((_, i) => (
            <span
              key={i}
              style={{
                width: i === step ? 22 : 7,
                height: 7,
                borderRadius: 999,
                background: i === step ? "var(--accent)" : "var(--rule-strong)",
                transition: "width 200ms",
              }}
            />
          ))}
        </div>

        {/* Footer controls */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 20,
          }}
        >
          <button
            onClick={dismiss}
            className="mono"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--ink-3)",
              cursor: "pointer",
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "8px 0",
            }}
          >
            Skip
          </button>
          <div style={{ display: "flex", gap: 10 }}>
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="mono"
                style={{
                  padding: "10px 16px",
                  border: "1px solid var(--rule-strong)",
                  background: "transparent",
                  borderRadius: 8,
                  color: "var(--ink-2)",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                Back
              </button>
            )}
            <button
              onClick={() => (last ? dismiss() : setStep(step + 1))}
              className="mono"
              style={{
                padding: "10px 18px",
                border: "none",
                background: "var(--accent)",
                color: "#fff",
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              {last ? "Get started" : "Next"}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes tourFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
