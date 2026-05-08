"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSession } from "@/contexts/session-context";
import { useWallet } from "@/contexts/wallet-context";
import { getUserBonuses, activateBonus } from "@/lib/api";
import type { WelcomeBonus } from "@/lib/types";
import { AnimatedSection, AnimatedList, AnimatedItem } from "@/components/ui/animated-list";
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
  const [activatingCards, setActivatingCards] = useState<Set<string>>(
    new Set()
  );

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
    if (
      !card ||
      card.welcome_bonus_points <= 0 ||
      card.welcome_bonus_min_spend <= 0
    )
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
          <div
            className="rounded-2xl p-14 text-center fade-up-1"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-dim)",
            }}
          >
            <div className="text-5xl mb-5">🎯</div>
            <h2 className="text-[18px] font-semibold text-white mb-2">
              No cards in wallet
            </h2>
            <p
              className="text-[14px] max-w-[280px] mx-auto mb-7"
              style={{ color: "var(--text-secondary)" }}
            >
              Add your cards to start tracking welcome bonus progress.
            </p>
            <Link
              href="/wallet"
              className="inline-flex items-center gap-2 h-11 px-6 rounded-xl font-semibold text-[14px] text-white maple-bg accent-glow hover:scale-[1.02] active:scale-[0.98] transition-transform"
            >
              Go to wallet →
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* Unactivated cards that have bonuses */}
            {unactivatedCards.length > 0 && (
              <AnimatedSection delay={0.05}>
                <h2
                  className="text-[13px] font-semibold mb-3"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  ACTIVATE TRACKING
                </h2>
                <div className="space-y-3">
                  {unactivatedCards.map((uc) => {
                    const card = uc.card!;
                    const isActivating = activatingCards.has(card.id);
                    return (
                      <div
                        key={uc.id}
                        className="rounded-2xl p-4 flex items-center justify-between"
                        style={{
                          background: "var(--bg-elevated)",
                          border: "1px solid var(--border-dim)",
                        }}
                      >
                        <div>
                          <h3 className="text-[14px] font-semibold text-white">
                            {card.name}
                          </h3>
                          <p
                            className="text-[12px] mt-0.5"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {card.welcome_bonus_points.toLocaleString()} pts ·
                            Spend {fmtCAD(card.welcome_bonus_min_spend)} in{" "}
                            {card.welcome_bonus_months}mo
                          </p>
                        </div>
                        <button
                          onClick={() => handleActivate(card.id)}
                          disabled={isActivating}
                          className="h-8 px-4 rounded-lg font-semibold text-[12px] transition-all disabled:opacity-50"
                          style={{
                            background: "var(--info-soft)",
                            border: "1px solid var(--info-border)",
                            color: "var(--info-text)",
                          }}
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
                    className="text-[13px] font-semibold mb-3"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    IN PROGRESS
                  </h2>
                )}
                <div className="space-y-4">
                  {activeBonuses.map((bonus) => {
                    const progress = Math.min(bonus.progress * 100, 100);
                    const remaining = Math.max(
                      bonus.min_spend - bonus.current_spend,
                      0
                    );
                    const isUrgent =
                      bonus.days_left <= 30 && bonus.days_left > 0;

                    return (
                      <div
                        key={bonus.id}
                        className="rounded-2xl p-5"
                        style={{
                          background: "var(--bg-elevated)",
                          border: isUrgent
                            ? "1px solid rgba(251,191,36,0.3)"
                            : "1px solid var(--border-dim)",
                        }}
                      >
                        {/* Card header */}
                        <div className="flex items-start justify-between gap-3 mb-4">
                          <div>
                            <h3 className="text-[15px] font-semibold text-white">
                              {bonus.card_name ?? "Card"}
                            </h3>
                            <p
                              className="text-[13px] mt-0.5"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              {bonus.card_issuer ?? ""}
                            </p>
                          </div>
                          {isUrgent && (
                            <span
                              className="label-xs px-2.5 py-1 rounded-full shrink-0"
                              style={{
                                background: "rgba(251,191,36,0.12)",
                                color: "#FBBF24",
                                border: "1px solid rgba(251,191,36,0.25)",
                              }}
                            >
                              ⏰ {bonus.days_left}d left
                            </span>
                          )}
                        </div>

                        {/* Bonus info */}
                        <div
                          className="grid grid-cols-3 gap-3 mb-4 p-3 rounded-xl"
                          style={{
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.05)",
                          }}
                        >
                          <div>
                            <div className="text-[15px] font-bold text-white">
                              {bonus.bonus_points.toLocaleString()}
                            </div>
                            <div
                              className="label-xs mt-0.5"
                              style={{ color: "var(--text-tertiary)" }}
                            >
                              bonus pts
                            </div>
                          </div>
                          <div>
                            <div className="text-[15px] font-bold text-white">
                              {fmtCAD(bonus.min_spend)}
                            </div>
                            <div
                              className="label-xs mt-0.5"
                              style={{ color: "var(--text-tertiary)" }}
                            >
                              min spend
                            </div>
                          </div>
                          <div>
                            <div className="text-[15px] font-bold text-white">
                              {bonus.days_left > 0
                                ? `${bonus.days_left}d`
                                : "Expired"}
                            </div>
                            <div
                              className="label-xs mt-0.5"
                              style={{ color: "var(--text-tertiary)" }}
                            >
                              remaining
                            </div>
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div className="mb-2">
                          <div className="flex items-center justify-between mb-2">
                            <span
                              className="text-[13px] font-medium"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              {fmtCAD(remaining)} to go
                            </span>
                            <span
                              className="text-[13px] font-bold"
                              style={{ color: "white" }}
                            >
                              {progress.toFixed(0)}%
                            </span>
                          </div>
                          <div
                            className="h-2 rounded-full overflow-hidden"
                            style={{ background: "rgba(255,255,255,0.07)" }}
                          >
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{
                                width: `${progress}%`,
                                background:
                                  "linear-gradient(90deg, #0D9488, var(--info-text))",
                                boxShadow: "0 0 12px var(--info-border)",
                              }}
                            />
                          </div>
                        </div>

                        {/* Monthly spend needed */}
                        {bonus.days_left > 0 && remaining > 0 && (
                          <p
                            className="text-[12px] mt-2"
                            style={{ color: "var(--text-tertiary)" }}
                          >
                            ~
                            {fmtCAD(
                              remaining /
                                Math.max(Math.ceil(bonus.days_left / 30), 1)
                            )}
                            /mo needed to hit target
                          </p>
                        )}
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
                  className="text-[13px] font-semibold mb-3"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  COMPLETED
                </h2>
                <div className="space-y-3">
                  {completedBonuses.map((bonus) => (
                    <div
                      key={bonus.id}
                      className="rounded-2xl p-4"
                      style={{
                        background:
                          "linear-gradient(135deg, rgba(52,211,153,0.07), rgba(16,185,129,0.03))",
                        border: "1px solid rgba(52,211,153,0.25)",
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-[14px]"
                            style={{
                              background: "rgba(52,211,153,0.15)",
                              border: "1px solid rgba(52,211,153,0.25)",
                            }}
                          >
                            ✓
                          </div>
                          <div>
                            <h3 className="text-[14px] font-semibold text-white">
                              {bonus.card_name ?? "Card"}
                            </h3>
                            <p
                              className="text-[12px]"
                              style={{ color: "var(--text-tertiary)" }}
                            >
                              {bonus.bonus_points.toLocaleString()} pts earned
                              {bonus.completed_at && (
                                <> · Completed {bonus.completed_at}</>
                              )}
                            </p>
                          </div>
                        </div>
                        <span
                          className="label-xs px-2.5 py-1 rounded-full shrink-0"
                          style={{
                            background: "rgba(52,211,153,0.15)",
                            color: "#34D399",
                            border: "1px solid rgba(52,211,153,0.25)",
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

            {/* Empty state — all cards tracked or no bonuses */}
            {bonuses.length === 0 && unactivatedCards.length === 0 && (
              <div
                className="rounded-2xl p-10 text-center fade-up"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-dim)",
                }}
              >
                <div className="text-4xl mb-4">🎉</div>
                <h2 className="text-[16px] font-semibold text-white mb-2">
                  No welcome bonuses to track
                </h2>
                <p
                  className="text-[13px] max-w-[280px] mx-auto"
                  style={{ color: "var(--text-secondary)" }}
                >
                  None of your current cards have welcome bonus requirements.
                  Add a new card with a welcome bonus to start tracking.
                </p>
              </div>
            )}

            {/* Info note */}
            <div
              className="rounded-xl px-4 py-3 text-[12px] leading-relaxed fade-up"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
                color: "var(--text-tertiary)",
              }}
            >
              💡 Spend progress is updated automatically from your logged
              transactions. Use the optimizer to log spend on each card.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
