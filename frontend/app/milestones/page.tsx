"use client";

import { useState, useEffect } from "react";
import { getWallet, ensureSession } from "@/lib/api";
import type { UserCard } from "@/lib/types";

function fmtCAD(v: number) { return `$${v.toLocaleString("en-CA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`; }

export default function MilestonesPage() {
  const [wallet, setWallet] = useState<UserCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [spendInputs, setSpendInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    ensureSession()
      .then(sid => getWallet(sid))
      .then(cards => { setWallet(cards ?? []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function setSpend(cardId: string, val: string) {
    setSpendInputs(prev => ({ ...prev, [cardId]: val }));
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="orb w-[450px] h-[280px] top-[-60px] left-1/2 -translate-x-1/2"
        style={{ background: "radial-gradient(ellipse, rgba(245,158,11,0.07) 0%, transparent 70%)" }} />

      <div className="relative max-w-3xl mx-auto px-6 pt-28 pb-24">
        {/* Header */}
        <div className="mb-8 fade-up">
          <p className="label-xs mb-1.5" style={{ color: "var(--text-tertiary)" }}>Bonus tracking</p>
          <h1 className="title text-white mb-2">Milestones</h1>
          <p className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
            Track progress toward welcome bonuses and annual spend thresholds.
          </p>
        </div>

        {loading ? (
          <div className="flex flex-col gap-4 fade-up-1">
            {[1, 2, 3].map(i => <div key={i} className="h-[180px] rounded-2xl shimmer" />)}
          </div>
        ) : wallet.length === 0 ? (
          <div className="rounded-2xl p-14 text-center fade-up-1"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-dim)" }}
          >
            <div className="text-5xl mb-5">🎯</div>
            <h2 className="text-[18px] font-semibold text-white mb-2">No cards in wallet</h2>
            <p className="text-[14px] max-w-[280px] mx-auto mb-7" style={{ color: "var(--text-secondary)" }}>
              Add your cards to start tracking welcome bonus progress.
            </p>
            <a href="/wallet" className="inline-flex items-center gap-2 h-11 px-6 rounded-xl font-semibold text-[14px] text-white maple-bg maple-glow">
              Go to wallet →
            </a>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {wallet.map((uc, i) => {
              const card = uc.card;
              if (!card) return null;
              const hasBonus = card.welcome_bonus_points > 0 && card.welcome_bonus_min_spend > 0;
              const currentSpend = parseFloat(spendInputs[uc.id] ?? "0") || 0;
              const progress = hasBonus ? Math.min((currentSpend / card.welcome_bonus_min_spend) * 100, 100) : 0;
              const remaining = hasBonus ? Math.max(card.welcome_bonus_min_spend - currentSpend, 0) : 0;
              const isComplete = progress >= 100;

              return (
                <div key={uc.id}
                  className="rounded-2xl p-5 fade-up"
                  style={{
                    animationDelay: `${i * 0.07}s`,
                    background: isComplete
                      ? "linear-gradient(135deg, rgba(52,211,153,0.07), rgba(16,185,129,0.03))"
                      : "var(--bg-elevated)",
                    border: isComplete
                      ? "1px solid rgba(52,211,153,0.25)"
                      : "1px solid var(--border-dim)",
                  }}
                >
                  {/* Card header */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                      <h3 className="text-[15px] font-semibold text-white">{card.name}</h3>
                      <p className="text-[13px] mt-0.5" style={{ color: "var(--text-secondary)" }}>{card.issuer}</p>
                    </div>
                    {isComplete && (
                      <span className="label-xs px-2.5 py-1 rounded-full shrink-0"
                        style={{ background: "rgba(52,211,153,0.15)", color: "#34D399", border: "1px solid rgba(52,211,153,0.25)" }}>
                        ✓ Bonus unlocked
                      </span>
                    )}
                  </div>

                  {hasBonus ? (
                    <>
                      {/* Bonus info */}
                      <div className="grid grid-cols-3 gap-3 mb-4 p-3 rounded-xl"
                        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
                      >
                        <div>
                          <div className="text-[15px] font-bold text-white">{card.welcome_bonus_points.toLocaleString()}</div>
                          <div className="label-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>bonus pts</div>
                        </div>
                        <div>
                          <div className="text-[15px] font-bold text-white">{fmtCAD(card.welcome_bonus_min_spend)}</div>
                          <div className="label-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>min spend</div>
                        </div>
                        <div>
                          <div className="text-[15px] font-bold text-white">{card.welcome_bonus_months}mo</div>
                          <div className="label-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>to complete</div>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="mb-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>
                            {isComplete ? "Goal reached!" : `${fmtCAD(remaining)} remaining`}
                          </span>
                          <span className="text-[13px] font-bold" style={{ color: isComplete ? "#34D399" : "white" }}>
                            {progress.toFixed(0)}%
                          </span>
                        </div>
                        <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${progress}%`,
                              background: isComplete
                                ? "linear-gradient(90deg, #34D399, #10B981)"
                                : "linear-gradient(90deg, #C8102E, #E8173A)",
                              boxShadow: isComplete ? "0 0 12px rgba(52,211,153,0.4)" : "0 0 12px rgba(200,16,46,0.4)",
                            }}
                          />
                        </div>
                      </div>

                      {/* Spend input */}
                      <div className="flex items-center gap-3">
                        <label className="text-[13px] shrink-0" style={{ color: "var(--text-tertiary)" }}>Spent so far:</label>
                        <div className="relative flex-1 max-w-[160px]">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] pointer-events-none" style={{ color: "var(--text-tertiary)" }}>$</span>
                          <input
                            type="number" min="0" step="1"
                            placeholder="0"
                            value={spendInputs[uc.id] ?? ""}
                            onChange={e => setSpend(uc.id, e.target.value)}
                            className="w-full h-8 pl-6 pr-3 rounded-lg text-[13px] font-medium outline-none transition-all"
                            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border-dim)", color: "var(--text-primary)" }}
                            onFocus={e => e.currentTarget.style.borderColor = "rgba(200,16,46,0.4)"}
                            onBlur={e => e.currentTarget.style.borderColor = "var(--border-dim)"}
                          />
                        </div>
                        <span className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>
                          of {fmtCAD(card.welcome_bonus_min_spend)}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="py-4 text-center rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                      <p className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>No welcome bonus on this card</p>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Info note */}
            <div className="rounded-xl px-4 py-3 text-[12px] leading-relaxed fade-up-4"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "var(--text-tertiary)" }}
            >
              💡 Enter your spend-to-date manually for each card. Automatic transaction sync coming soon.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
