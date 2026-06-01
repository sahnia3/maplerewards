"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Target, Award, Clock, Check } from "lucide-react";
import { useSession } from "@/contexts/session-context";
import { useWallet } from "@/contexts/wallet-context";
import { getUserBonuses, activateBonus } from "@/lib/api";
import type { WelcomeBonus } from "@/lib/types";
import { AnimatedSection } from "@/components/ui/animated-list";
import { SkeletonCard } from "@/components/ui/skeleton";
import { PageMasthead } from "@/components/editorial/page-masthead";

function fmtCAD(v: number) {
  return `$${v.toLocaleString("en-CA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

export default function MilestonesPage() {
  const { sessionId, isReady } = useSession();
  const { wallet, isLoading: walletLoading } = useWallet();
  const [bonuses, setBonuses] = useState<WelcomeBonus[]>([]);
  const [loading, setLoading] = useState(true);
  const [activatingCards, setActivatingCards] = useState<Set<string>>(new Set());

  const loadBonuses = useCallback(async () => {
    if (!sessionId) {
      setLoading(false);
      return;
    }
    try {
      const data = await getUserBonuses(sessionId);
      setBonuses(data ?? []);
    } catch {
      setBonuses([]);
    }
    setLoading(false);
  }, [sessionId]);

  useEffect(() => {
    if (isReady) loadBonuses();
  }, [isReady, loadBonuses]);

  // Cards that have welcome bonuses but no tracking row yet
  const unactivatedCards = wallet.filter((uc) => {
    const card = uc.card;
    if (!card || card.welcome_bonus_points <= 0 || card.welcome_bonus_min_spend <= 0)
      return false;
    return !bonuses.some((b) => b.card_id === card.id);
  });

  async function handleActivate(cardId: string) {
    if (!sessionId || activatingCards.has(cardId)) return;
    setActivatingCards((prev) => new Set(prev).add(cardId));
    try {
      const bonus = await activateBonus(sessionId, cardId);
      setBonuses((prev) => [...prev, bonus]);
    } catch {
      // silent fail
    }
    setActivatingCards((prev) => {
      const next = new Set(prev);
      next.delete(cardId);
      return next;
    });
  }

  const isPageLoading = loading || walletLoading;

  // Separate active vs completed bonuses
  const activeBonuses = bonuses.filter((b) => !b.is_completed);
  const completedBonuses = bonuses.filter((b) => b.is_completed);

  return (
    <div className="reveal" style={{ paddingTop: 0 }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px clamp(20px, 4vw, 60px) 80px" }}>
        <PageMasthead
          eyebrow="Bonus tracking"
          eyebrowEnd={`${activeBonuses.length} active · ${completedBonuses.length} completed`}
          title={<>The <span style={{ fontStyle: "italic" }}>welcome-bonus</span> ledger.</>}
          lede="Spend deadlines, dollar runway, and the points you'll bank when each bonus clears — quietly tracked against the cards you carry."
        />

        {isPageLoading ? (
          <div className="flex flex-col gap-4">
            <SkeletonCard /><SkeletonCard /><SkeletonCard />
          </div>
        ) : wallet.length === 0 ? (
          /* Empty wallet — editorial empty state */
          <div
            className="fade-up-1"
            style={{
              background: "var(--card-fill)",
              border: "1px solid var(--rule)",
              borderRadius: 14,
              padding: "44px 28px",
              textAlign: "center",
              boxShadow: "var(--shadow-1)",
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 999,
                margin: "0 auto 18px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--surface-2)",
                border: "1px solid var(--rule)",
                color: "var(--ink-3)",
              }}
            >
              <Target size={22} strokeWidth={1.5} />
            </div>
            <h2
              className="display"
              style={{ fontSize: 22, fontStyle: "italic", color: "var(--ink)", margin: 0, lineHeight: 1.2 }}
            >
              No cards in wallet
            </h2>
            <p
              className="serif"
              style={{ fontSize: 14, color: "var(--ink-2)", fontStyle: "italic", marginTop: 8, lineHeight: 1.55, maxWidth: 320, marginLeft: "auto", marginRight: "auto" }}
            >
              Add your cards to start tracking welcome bonus progress.
            </p>
            <Link
              href="/wallet"
              className="mono"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                marginTop: 20,
                padding: "10px 22px",
                borderRadius: 10,
                background: "var(--accent)",
                color: "#fff",
                textDecoration: "none",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                boxShadow: "var(--shadow-accent-glow)",
              }}
            >
              Go to wallet →
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {/* Unactivated cards */}
            {unactivatedCards.length > 0 && (
              <AnimatedSection delay={0.05}>
                <h2
                  className="eyebrow"
                  style={{ color: "var(--ink-3)", marginBottom: 14, letterSpacing: "0.18em" }}
                >
                  Activate tracking
                </h2>
                <div className="flex flex-col gap-3">
                  {unactivatedCards.map((uc) => {
                    const card = uc.card!;
                    const isActivating = activatingCards.has(card.id);
                    return (
                      <div
                        key={uc.id}
                        style={{
                          background: "var(--surface)",
                          border: "1px solid var(--rule-strong)",
                          borderRadius: 14,
                          padding: 18,
                          boxShadow: "var(--shadow-1)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 16,
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <h3
                            className="display"
                            style={{ fontSize: 16, color: "var(--ink)", margin: 0, lineHeight: 1.2 }}
                          >
                            {card.name}
                          </h3>
                          <p
                            className="serif"
                            style={{ fontSize: 12, fontStyle: "italic", color: "var(--ink-3)", marginTop: 4 }}
                          >
                            {card.welcome_bonus_points.toLocaleString()} pts · Spend {fmtCAD(card.welcome_bonus_min_spend)} in{" "}
                            {card.welcome_bonus_months}mo
                          </p>
                        </div>
                        <button
                          onClick={() => handleActivate(card.id)}
                          disabled={isActivating}
                          className="btn btn-primary"
                          style={{ fontSize: 11, height: 36, padding: "0 16px" }}
                        >
                          {isActivating ? "..." : "Start tracking"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </AnimatedSection>
            )}

            {/* Active bonuses */}
            {activeBonuses.length > 0 && (
              <AnimatedSection delay={0.1}>
                {bonuses.length > activeBonuses.length && (
                  <h2
                    className="eyebrow"
                    style={{ color: "var(--ink-3)", marginBottom: 14, letterSpacing: "0.18em" }}
                  >
                    In progress
                  </h2>
                )}
                <div className="flex flex-col gap-4">
                  {activeBonuses.map((bonus) => {
                    const progress = Math.min(bonus.progress * 100, 100);
                    const remaining = Math.max(bonus.min_spend - bonus.current_spend, 0);
                    const isUrgent = bonus.days_left <= 30 && bonus.days_left > 0;

                    return (
                      <div
                        key={bonus.id}
                        style={{
                          position: "relative",
                          background: "var(--surface)",
                          border: `1px solid ${isUrgent ? "var(--gold)" : "var(--rule-strong)"}`,
                          borderRadius: 14,
                          padding: 22,
                          boxShadow: isUrgent ? "var(--shadow-2)" : "var(--shadow-1)",
                          overflow: "hidden",
                        }}
                      >
                        {/* Urgent gets a soft gold backdrop */}
                        {isUrgent && (
                          <div
                            aria-hidden
                            style={{
                              position: "absolute",
                              inset: 0,
                              background:
                                "radial-gradient(ellipse 60% 50% at 100% 0%, var(--gold-soft), transparent 70%)",
                              pointerEvents: "none",
                            }}
                          />
                        )}
                        <div style={{ position: "relative" }}>
                          {/* Card header */}
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
                            <div style={{ minWidth: 0 }}>
                              <h3
                                className="display"
                                style={{ fontSize: 18, color: "var(--ink)", margin: 0, lineHeight: 1.2 }}
                              >
                                {bonus.card_name ?? "Card"}
                              </h3>
                              <p
                                className="serif"
                                style={{ fontSize: 13, fontStyle: "italic", color: "var(--ink-3)", marginTop: 4 }}
                              >
                                {bonus.card_issuer ?? ""}
                              </p>
                            </div>
                            {isUrgent && (
                              <span
                                className="mono"
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 6,
                                  flexShrink: 0,
                                  padding: "4px 10px",
                                  borderRadius: 999,
                                  fontSize: 10,
                                  fontWeight: 600,
                                  letterSpacing: "0.10em",
                                  textTransform: "uppercase",
                                  background: "var(--gold-tint)",
                                  border: "1px solid var(--gold-soft)",
                                  color: "var(--gold)",
                                }}
                              >
                                <Clock size={11} strokeWidth={2} />
                                {bonus.days_left}d left
                              </span>
                            )}
                          </div>

                          {/* Bonus info grid */}
                          <div
                            className="m-grid-2"
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                              gap: 0,
                              padding: "14px 0",
                              borderTop: "1px solid var(--rule)",
                              borderBottom: "1px solid var(--rule)",
                              marginBottom: 16,
                            }}
                          >
                            <BonusStat label="Bonus pts" value={bonus.bonus_points.toLocaleString()} />
                            <BonusStat label="Min spend" value={fmtCAD(bonus.min_spend)} />
                            <BonusStat
                              label="Remaining"
                              value={bonus.days_left > 0 ? `${bonus.days_left}d` : "Expired"}
                              accent={bonus.days_left <= 0}
                              last
                            />
                          </div>

                          {/* Progress bar */}
                          <div>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                              <span
                                className="serif"
                                style={{ fontSize: 13, fontStyle: "italic", color: "var(--ink-2)" }}
                              >
                                {fmtCAD(remaining)} to go
                              </span>
                              <span
                                className="mono"
                                style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)", letterSpacing: "-0.005em" }}
                              >
                                {progress.toFixed(0)}%
                              </span>
                            </div>
                            <div
                              style={{
                                height: 2,
                                background: "var(--rule)",
                                position: "relative",
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  position: "absolute",
                                  inset: 0,
                                  right: `${100 - progress}%`,
                                  background: "var(--accent)",
                                  transition: "right 1.2s cubic-bezier(0.16, 1, 0.3, 1)",
                                }}
                              />
                            </div>
                          </div>

                          {/* Monthly pace */}
                          {bonus.days_left > 0 && remaining > 0 && (
                            <p
                              className="mono"
                              style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 12, letterSpacing: "0.04em" }}
                            >
                              ~{fmtCAD(remaining / Math.max(Math.ceil(bonus.days_left / 30), 1))}/mo needed to hit target
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </AnimatedSection>
            )}

            {/* Completed bonuses */}
            {completedBonuses.length > 0 && (
              <AnimatedSection delay={0.15}>
                <h2
                  className="eyebrow"
                  style={{ color: "var(--gain)", marginBottom: 14, letterSpacing: "0.18em" }}
                >
                  Completed
                </h2>
                <div className="flex flex-col gap-3">
                  {completedBonuses.map((bonus) => (
                    <div
                      key={bonus.id}
                      style={{
                        background: "var(--surface)",
                        border: "1px solid var(--gain-soft)",
                        borderRadius: 14,
                        padding: 16,
                        boxShadow: "var(--shadow-1)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                          <div
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 8,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: "var(--gain-soft)",
                              border: "1px solid var(--gain-soft)",
                              color: "var(--gain)",
                              flexShrink: 0,
                            }}
                          >
                            <Check size={16} strokeWidth={2.5} />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <h3
                              className="display"
                              style={{ fontSize: 15, color: "var(--ink)", margin: 0, lineHeight: 1.2 }}
                            >
                              {bonus.card_name ?? "Card"}
                            </h3>
                            <p
                              className="mono"
                              style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 3, letterSpacing: "0.04em" }}
                            >
                              {bonus.bonus_points.toLocaleString()} pts earned
                              {bonus.completed_at && <> · Completed {bonus.completed_at}</>}
                            </p>
                          </div>
                        </div>
                        <span
                          className="mono"
                          style={{
                            flexShrink: 0,
                            padding: "4px 10px",
                            borderRadius: 999,
                            fontSize: 10,
                            fontWeight: 600,
                            letterSpacing: "0.10em",
                            textTransform: "uppercase",
                            background: "var(--gain-soft)",
                            border: "1px solid var(--gain-soft)",
                            color: "var(--gain)",
                          }}
                        >
                          Bonus unlocked
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </AnimatedSection>
            )}

            {/* All tracked / nothing to track */}
            {bonuses.length === 0 && unactivatedCards.length === 0 && (
              <div
                className="fade-up"
                style={{
                  background: "var(--card-fill)",
                  border: "1px solid var(--rule)",
                  borderRadius: 14,
                  padding: "40px 28px",
                  textAlign: "center",
                  boxShadow: "var(--shadow-1)",
                }}
              >
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 999,
                    margin: "0 auto 16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "var(--surface-2)",
                    border: "1px solid var(--rule)",
                    color: "var(--ink-3)",
                  }}
                >
                  <Award size={22} strokeWidth={1.5} />
                </div>
                <h2
                  className="display"
                  style={{ fontSize: 20, fontStyle: "italic", color: "var(--ink)", margin: 0, lineHeight: 1.2 }}
                >
                  No welcome bonuses to track
                </h2>
                <p
                  className="serif"
                  style={{ fontSize: 13, fontStyle: "italic", color: "var(--ink-2)", marginTop: 8, lineHeight: 1.55, maxWidth: 340, marginLeft: "auto", marginRight: "auto" }}
                >
                  None of your current cards have welcome bonus requirements. Add a new card with a welcome bonus to start tracking.
                </p>
              </div>
            )}

            {/* Info note — editorial, not a glassy panel */}
            <div
              className="fade-up serif"
              style={{
                fontSize: 13,
                fontStyle: "italic",
                color: "var(--ink-3)",
                lineHeight: 1.55,
                paddingLeft: 16,
                borderLeft: "2px solid var(--rule-strong)",
              }}
            >
              Spend progress is updated automatically from your logged transactions. Use the optimizer to log spend on each card.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BonusStat({
  label,
  value,
  accent = false,
  last = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  last?: boolean;
}) {
  return (
    <div
      style={{
        padding: "0 16px",
        borderRight: last ? "none" : "1px solid var(--rule)",
      }}
    >
      <div
        className="display"
        style={{
          fontSize: 18,
          color: accent ? "var(--accent)" : "var(--ink)",
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      <div
        className="eyebrow"
        style={{
          marginTop: 4,
        }}
      >
        {label}
      </div>
    </div>
  );
}
