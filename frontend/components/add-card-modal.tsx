"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { listCards, addCardToWallet } from "@/lib/api";
import type { Card } from "@/lib/types";

interface Props {
  sessionId: string;
  existingCardIds: string[];
  onAdded: () => void;
  onClose: () => void;
}

const NETWORK_COLORS: Record<string, string> = {
  visa: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  mastercard: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  amex: "bg-green-500/15 text-green-400 border-green-500/20",
};

export function AddCardModal({ sessionId, existingCardIds, onAdded, onClose }: Props) {
  const [cards, setCards] = useState<Card[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listCards()
      .then(setCards)
      .catch(() => setError("Could not load cards"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = cards.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.issuer.toLowerCase().includes(q) ||
      c.loyalty_program?.name.toLowerCase().includes(q)
    );
  });

  async function handleAdd(cardId: string) {
    setAdding(cardId);
    setError(null);
    try {
      await addCardToWallet(sessionId, cardId);
      onAdded();
    } catch {
      setError("Failed to add card");
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative glass border border-white/12 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/8">
          <h2 className="text-white font-semibold text-lg">Add a Card</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-white transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/8"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-white/8">
          <Input
            placeholder="Search cards, issuers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-white/5 border-white/10 text-white placeholder:text-muted-foreground"
            autoFocus
          />
        </div>

        {/* Card list */}
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
          {loading && (
            <div className="flex items-center justify-center py-10">
              <svg className="animate-spin w-6 h-6 text-[#C8102E]" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="text-center py-10 text-muted-foreground text-sm">
              No cards found{search ? ` for "${search}"` : ""}
            </div>
          )}

          {error && <p className="text-red-400 text-sm px-2">{error}</p>}

          {filtered.map((card) => {
            const alreadyAdded = existingCardIds.includes(card.id);
            return (
              <div
                key={card.id}
                className="flex items-center justify-between gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white text-sm font-medium truncate">{card.name}</span>
                    <Badge className={`text-xs capitalize shrink-0 ${NETWORK_COLORS[card.network] ?? ""}`}>
                      {card.network}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    {card.issuer}
                    {card.loyalty_program ? ` · ${card.loyalty_program.name}` : ""}
                    {card.annual_fee > 0 ? ` · $${card.annual_fee}/yr` : " · No fee"}
                  </p>
                </div>
                <Button
                  size="sm"
                  disabled={alreadyAdded || adding === card.id}
                  onClick={() => handleAdd(card.id)}
                  className={`shrink-0 text-xs h-8 px-3 ${
                    alreadyAdded
                      ? "bg-white/8 text-muted-foreground cursor-default"
                      : "maple-gradient text-white hover:opacity-90"
                  }`}
                >
                  {alreadyAdded ? "Added" : adding === card.id ? "Adding..." : "Add"}
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
