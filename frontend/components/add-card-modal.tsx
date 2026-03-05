"use client";

import { useState, useEffect, useRef } from "react";
import { listCards, addCardToWallet } from "@/lib/api";
import type { Card } from "@/lib/types";

interface Props {
  sessionId: string;
  existingCardIds: string[];
  onAdded: () => void;
  onClose: () => void;
}

const NETWORK_PILL: Record<string, { bg: string; color: string }> = {
  visa:       { bg: "rgba(59,130,246,0.12)",  color: "#60A5FA" },
  mastercard: { bg: "rgba(251,146,60,0.12)",  color: "#FB923C" },
  amex:       { bg: "rgba(52,211,153,0.12)",  color: "#34D399" },
};

export function AddCardModal({ sessionId, existingCardIds, onAdded, onClose }: Props) {
  const [cards, setCards] = useState<Card[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listCards()
      .then(setCards)
      .catch(() => setError("Could not load cards"))
      .finally(() => setLoading(false));
    setTimeout(() => searchRef.current?.focus(), 80);
  }, []);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const filtered = cards.filter(c => {
    const q = search.toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || c.issuer.toLowerCase().includes(q) || (c.loyalty_program?.name.toLowerCase().includes(q) ?? false);
  });

  async function handleAdd(cardId: string) {
    setAdding(cardId); setError(null);
    try {
      await addCardToWallet(sessionId, cardId);
      setAdded(prev => [...prev, cardId]);
      onAdded();
    } catch { setError("Failed to add card"); }
    finally { setAdding(null); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: "rgba(4,5,10,0.75)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="relative w-full sm:max-w-md flex flex-col sm:rounded-2xl rounded-t-2xl overflow-hidden fade-up"
        style={{
          background: "var(--bg-overlay)",
          border: "1px solid var(--border-mid)",
          boxShadow: "var(--shadow-float)",
          maxHeight: "85vh",
        }}
      >
        {/* Top edge line */}
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)" }} />

        {/* Handle (mobile) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-8 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.15)" }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--border-dim)" }}>
          <div>
            <h2 className="text-[16px] font-semibold text-white">Add a card</h2>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
              {cards.length > 0 ? `${cards.length} cards available` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/8"
            style={{ color: "var(--text-tertiary)" }}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border-dim)" }}>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: "var(--text-tertiary)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" strokeLinecap="round" />
            </svg>
            <input
              ref={searchRef}
              placeholder="Search by card or issuer…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-4 rounded-xl text-[14px] outline-none transition-all"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid var(--border-dim)",
                color: "var(--text-primary)",
              }}
              onFocus={e => e.currentTarget.style.borderColor = "rgba(200,16,46,0.4)"}
              onBlur={e => e.currentTarget.style.borderColor = "var(--border-dim)"}
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {loading && (
            <div className="flex flex-col gap-2 p-2">
              {[1,2,3,4].map(i => (
                <div key={i} className="h-[58px] rounded-xl shimmer" />
              ))}
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <span className="text-2xl">🔍</span>
              <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                No cards match &ldquo;{search}&rdquo;
              </p>
            </div>
          )}

          {error && <p className="text-[13px] px-2 py-2" style={{ color: "#E8173A" }}>{error}</p>}

          {filtered.map(card => {
            const alreadyIn = existingCardIds.includes(card.id) || added.includes(card.id);
            const isAdding = adding === card.id;
            const pill = NETWORK_PILL[card.network];
            return (
              <div
                key={card.id}
                className="flex items-center gap-3 px-3 py-3 rounded-xl transition-colors"
                style={{ cursor: alreadyIn ? "default" : "pointer" }}
                onMouseEnter={e => { if (!alreadyIn) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                {/* Issuer initial */}
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-[13px] font-bold text-white/30"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  {card.issuer[0]}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[13px] font-medium text-white truncate">{card.name}</span>
                    {pill && (
                      <span className="label-xs px-1.5 py-0.5 rounded capitalize" style={{ background: pill.bg, color: pill.color }}>
                        {card.network}
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] truncate mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                    {card.issuer}
                    {card.loyalty_program ? ` · ${card.loyalty_program.name}` : ""}
                    {card.annual_fee > 0 ? ` · $${card.annual_fee}/yr` : " · No fee"}
                  </p>
                </div>

                <button
                  onClick={() => !alreadyIn && handleAdd(card.id)}
                  disabled={alreadyIn || isAdding}
                  className="shrink-0 h-7 px-3 rounded-lg text-[12px] font-semibold transition-all"
                  style={
                    alreadyIn
                      ? { background: "rgba(52,211,153,0.1)", color: "#34D399", cursor: "default" }
                      : { background: "rgba(200,16,46,0.15)", color: "#E8173A", border: "1px solid rgba(200,16,46,0.2)" }
                  }
                >
                  {alreadyIn ? "✓ Added" : isAdding ? "…" : "Add"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
