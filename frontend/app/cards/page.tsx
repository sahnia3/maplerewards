"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CreditCardVisual } from "@/components/cards/credit-card-visual";
import { useWallet } from "@/contexts/wallet-context";
import { listCards } from "@/lib/api";
import type { Card, UserCard } from "@/lib/types";
import { AnimatedSection, AnimatedList, AnimatedItem } from "@/components/ui/animated-list";
import { SkeletonCard } from "@/components/ui/skeleton";
import { CardEditModal } from "@/components/cards/card-edit-modal";

function CardRowSkeleton() {
  return (
    <div
      className="flex items-center gap-4 px-4 py-3.5 rounded-xl"
      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-dim)", borderRadius: 10 }}
    >
      <div className="w-10 h-10 rounded-lg shimmer flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="h-3.5 w-36 rounded shimmer mb-2" />
        <div className="h-3 w-24 rounded shimmer" />
      </div>
      <div className="h-8 w-20 rounded-lg shimmer flex-shrink-0" />
    </div>
  );
}

export default function CardsPage() {
  const { wallet, isLoading: walletLoading, addCard, getCardValueRange } = useWallet();
  const [allCards, setAllCards] = useState<Card[]>([]);
  const [cardsLoading, setCardsLoading] = useState(true);
  const [cardsError, setCardsError] = useState<string | null>(null);
  const [addingCardId, setAddingCardId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [editingCard, setEditingCard] = useState<UserCard | null>(null);
  const carouselRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCardsLoading(true);
    listCards()
      .then((data) => setAllCards(data ?? []))
      .catch(() => setCardsError("Could not load cards"))
      .finally(() => setCardsLoading(false));
  }, []);

  // Track which card IDs the user already has
  const walletCardIds = new Set(wallet.map((uc) => uc.card_id));

  async function handleAddCard(cardId: string) {
    setAddingCardId(cardId);
    try {
      await addCard(cardId);
      setAddedIds((prev) => new Set([...prev, cardId]));
    } catch {
      // silently handle
    } finally {
      setAddingCardId(null);
    }
  }

  function formatFee(fee: number): string {
    if (fee === 0) return "No annual fee";
    return `$${fee}/yr`;
  }

  function formatBonus(card: Card): string {
    if (!card.welcome_bonus_points) return "—";
    return `${card.welcome_bonus_points.toLocaleString()} pts`;
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Ambient orbs */}
      <div
        className="orb w-[450px] h-[300px] top-[-70px] left-[10%]"
        style={{ background: "radial-gradient(ellipse, rgba(13,148,136,0.09) 0%, transparent 70%)" }}
      />
      <div
        className="orb w-[220px] h-[220px] top-[400px] right-[5%]"
        style={{ background: "radial-gradient(ellipse, rgba(13,148,136,0.05) 0%, transparent 70%)" }}
      />

      <div className="relative max-w-5xl mx-auto px-6 pt-8 pb-24">

        {/* Header */}
        <AnimatedSection className="flex items-end justify-between mb-8">
          <div>
            <p className="label-xs mb-1.5" style={{ color: "var(--text-tertiary)" }}>Your collection</p>
            <h1 className="title text-white">My Cards</h1>
            {!walletLoading && wallet.length > 0 && (
              <p className="text-[14px] mt-1" style={{ color: "var(--text-secondary)" }}>
                {wallet.length} card{wallet.length !== 1 ? "s" : ""} in wallet
              </p>
            )}
          </div>
          <Link
            href="/wallet"
            className="flex items-center gap-2 h-10 px-5 rounded-xl font-semibold text-[14px] text-white transition-all maple-bg accent-glow hover:scale-[1.02] active:scale-[0.98]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            Add a card
          </Link>
        </AnimatedSection>

        {/* Wallet Carousel */}
        <AnimatedSection delay={0.05} className="mb-10">
          <p className="label-xs mb-4" style={{ color: "var(--text-tertiary)" }}>Wallet</p>

          {walletLoading ? (
            <div className="flex gap-4 overflow-x-auto pb-2">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  style={{ width: 280, height: 176, borderRadius: 14, flexShrink: 0 }}
                  className="shimmer"
                />
              ))}
            </div>
          ) : wallet.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-10 rounded-2xl text-center"
              style={{
                background: "var(--bg-elevated)",
                border: "1px dashed var(--border-mid)",
                borderRadius: 12,
              }}
            >
              <div
                className="w-12 h-12 rounded-xl mb-3 flex items-center justify-center"
                style={{ background: "rgba(13,148,136,0.08)", border: "1px solid rgba(13,148,136,0.14)" }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="1.8" className="w-6 h-6">
                  <rect x="2" y="7" width="20" height="14" rx="2" />
                  <path d="M16 3H8a2 2 0 00-2 2v2h12V5a2 2 0 00-2-2z" />
                </svg>
              </div>
              <p className="text-[14px] font-semibold text-white mb-1">Your wallet is empty</p>
              <p className="text-[13px] mb-4" style={{ color: "var(--text-secondary)" }}>
                Add cards below to start tracking your rewards
              </p>
              <Link
                href="/wallet"
                className="inline-flex items-center gap-2 h-9 px-5 rounded-xl font-semibold text-[13px] text-white maple-bg accent-glow hover:scale-[1.02] active:scale-[0.98] transition-transform"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
                Add cards
              </Link>
            </div>
          ) : (
            <div
              ref={carouselRef}
              className="flex gap-4 overflow-x-auto pb-3"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              {wallet.map((uc) => (
                <div key={uc.id} className="group flex-shrink-0 flex flex-col items-center gap-1.5">
                  <button
                    onClick={() => setEditingCard(uc)}
                    className="cursor-pointer outline-none transition-transform hover:-translate-y-1 focus:outline-none"
                    style={{ background: "none", border: "none", padding: 0 }}
                    title={uc.card?.name ?? "Edit card"}
                  >
                    <CreditCardVisual
                      card={uc.card}
                      balance={uc.point_balance}
                      size="md"
                    />
                  </button>
                  <span className="text-[11px] mt-1 opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: "var(--text-tertiary)" }}>
                    Tap to edit
                  </span>
                  {(() => {
                    const range = getCardValueRange(uc.card_id);
                    if (!range || (range.low === 0 && range.high === 0)) return null;
                    return (
                      <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                        ~${range.low.toFixed(0)}–${range.high.toFixed(0)} value
                      </span>
                    );
                  })()}
                </div>
              ))}
            </div>
          )}
        </AnimatedSection>

        {/* All Available Cards */}
        <AnimatedSection delay={0.1}>
          <div className="flex items-center justify-between mb-4">
            <p className="label-xs" style={{ color: "var(--text-tertiary)" }}>Available Cards</p>
            {!cardsLoading && allCards.length > 0 && (
              <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                {allCards.length} cards
              </span>
            )}
          </div>

          {cardsLoading ? (
            <div className="flex flex-col gap-2.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <CardRowSkeleton key={i} />
              ))}
            </div>
          ) : cardsError ? (
            <div
              className="rounded-2xl p-8 text-center"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid rgba(13,148,136,0.2)",
                borderRadius: 12,
              }}
            >
              <p className="text-[14px]" style={{ color: "#14B8A6" }}>{cardsError}</p>
              <button
                onClick={() => {
                  setCardsLoading(true);
                  listCards()
                    .then((d) => setAllCards(d ?? []))
                    .catch(() => setCardsError("Could not load cards"))
                    .finally(() => setCardsLoading(false));
                }}
                className="mt-3 text-[13px] transition-colors hover:text-white"
                style={{ color: "var(--text-secondary)" }}
              >
                Try again
              </button>
            </div>
          ) : allCards.length === 0 ? (
            <div
              className="rounded-2xl p-10 text-center"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-dim)",
                borderRadius: 12,
              }}
            >
              <p className="text-[14px]" style={{ color: "var(--text-secondary)" }}>No cards available yet.</p>
            </div>
          ) : (
            <div
              className="rounded-2xl overflow-hidden"
              style={{ border: "1px solid var(--border-dim)", borderRadius: 12 }}
            >
              {allCards.map((card, i) => {
                const inWallet = walletCardIds.has(card.id) || addedIds.has(card.id);
                const isAdding = addingCardId === card.id;
                return (
                  <div
                    key={card.id}
                    className="flex items-center gap-4 px-5 py-4 transition-colors hover:!bg-white/[0.03]"
                    style={{
                      background: "var(--bg-elevated)",
                      borderTop: i > 0 ? "1px solid var(--border-dim)" : "none",
                    }}
                  >
                    {/* Card visual thumbnail */}
                    <div className="flex-shrink-0">
                      <CreditCardVisual card={card} size="sm" />
                    </div>

                    {/* Card info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-white truncate">{card.name}</p>
                      <p className="text-[12px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                        {card.issuer}
                        <span className="mx-1.5" style={{ color: "var(--text-tertiary)" }}>·</span>
                        <span style={{ color: "var(--text-tertiary)" }}>{formatFee(card.annual_fee)}</span>
                      </p>
                      {card.welcome_bonus_points > 0 && (
                        <p className="text-[11px] mt-1 font-medium" style={{ color: "#0D9488" }}>
                          Welcome: {formatBonus(card)} in {card.welcome_bonus_months}mo
                        </p>
                      )}
                    </div>

                    {/* Network badge */}
                    <div className="hidden sm:block flex-shrink-0">
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide"
                        style={{
                          background: "rgba(255,255,255,0.05)",
                          border: "1px solid var(--border-mid)",
                          color: "var(--text-tertiary)",
                        }}
                      >
                        {card.network}
                      </span>
                    </div>

                    {/* Add to wallet button */}
                    <button
                      onClick={() => !inWallet && handleAddCard(card.id)}
                      disabled={inWallet || isAdding}
                      className="flex-shrink-0 h-9 px-4 rounded-lg text-[12px] font-semibold transition-all"
                      style={
                        inWallet
                          ? {
                              background: "rgba(16,185,129,0.10)",
                              border: "1px solid rgba(16,185,129,0.22)",
                              color: "#10B981",
                              cursor: "default",
                            }
                          : {
                              background: isAdding ? "rgba(13,148,136,0.15)" : "rgba(255,255,255,0.06)",
                              border: "1px solid rgba(255,255,255,0.1)",
                              color: "white",
                              cursor: "pointer",
                            }
                      }
                    >
                      {inWallet ? (
                        <span className="flex items-center gap-1.5">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          Added
                        </span>
                      ) : isAdding ? (
                        <span className="flex items-center gap-1.5">
                          <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Adding…
                        </span>
                      ) : (
                        "Add to wallet"
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </AnimatedSection>

        {editingCard && (
          <>
            <CardEditModal
              card={editingCard}
              open={!!editingCard}
              onClose={() => {
                setEditingCard(null);
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
