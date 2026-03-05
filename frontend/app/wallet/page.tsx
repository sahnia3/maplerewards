"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { WalletCard } from "@/components/wallet-card";
import { AddCardModal } from "@/components/add-card-modal";
import { getWallet, ensureSession } from "@/lib/api";
import type { UserCard } from "@/lib/types";

export default function WalletPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [wallet, setWallet] = useState<UserCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const loadWallet = useCallback(async (sid: string) => {
    try {
      const cards = await getWallet(sid);
      setWallet(cards ?? []);
    } catch {
      setError("Could not load wallet");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    ensureSession()
      .then((sid) => {
        setSessionId(sid);
        return loadWallet(sid);
      })
      .catch(() => {
        setError("Could not initialize wallet");
        setLoading(false);
      });
  }, [loadWallet]);

  function handleCardRemoved(userCardId: string) {
    setWallet((prev) => prev.filter((c) => c.id !== userCardId));
  }

  function handleBalanceUpdated(userCardId: string, balance: number) {
    setWallet((prev) =>
      prev.map((c) => (c.id === userCardId ? { ...c, point_balance: balance } : c))
    );
  }

  async function handleCardAdded() {
    if (!sessionId) return;
    await loadWallet(sessionId);
    setShowAddModal(false);
  }

  const totalPoints = wallet.reduce((sum, c) => sum + c.point_balance, 0);
  const existingCardIds = wallet.map((c) => c.card_id);

  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      {/* Header */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">My Wallet</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {wallet.length} card{wallet.length !== 1 ? "s" : ""} ·{" "}
            <span className="text-white">{totalPoints.toLocaleString()} pts</span> total
          </p>
        </div>
        <Button
          onClick={() => setShowAddModal(true)}
          className="maple-gradient maple-glow text-white font-semibold hover:opacity-90 transition-opacity"
        >
          + Add Card
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <svg className="animate-spin w-8 h-8 text-[#C8102E]" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : error ? (
        <div className="glass rounded-2xl p-8 border border-red-500/20 text-center">
          <p className="text-red-400">{error}</p>
          <Button
            variant="ghost"
            className="mt-4 text-muted-foreground"
            onClick={() => sessionId && loadWallet(sessionId)}
          >
            Try again
          </Button>
        </div>
      ) : wallet.length === 0 ? (
        <div className="glass rounded-2xl p-12 border border-white/8 text-center">
          <div className="text-5xl mb-4">💳</div>
          <h2 className="text-white font-semibold text-lg mb-2">No cards yet</h2>
          <p className="text-muted-foreground text-sm mb-6 max-w-xs mx-auto">
            Add the credit cards you own and track your points balances in one place.
          </p>
          <Button
            onClick={() => setShowAddModal(true)}
            className="maple-gradient maple-glow text-white font-semibold hover:opacity-90"
          >
            Add Your First Card
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {wallet.map((userCard) => (
            <WalletCard
              key={userCard.id}
              userCard={userCard}
              sessionId={sessionId!}
              onRemoved={handleCardRemoved}
              onBalanceUpdated={handleBalanceUpdated}
            />
          ))}
        </div>
      )}

      {/* Add Card Modal */}
      {showAddModal && sessionId && (
        <AddCardModal
          sessionId={sessionId}
          existingCardIds={existingCardIds}
          onAdded={handleCardAdded}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}
