"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { updateCardBalance, removeCardFromWallet } from "@/lib/api";
import type { UserCard } from "@/lib/types";

interface Props {
  userCard: UserCard;
  sessionId: string;
  onRemoved: (cardId: string) => void;
  onBalanceUpdated: (cardId: string, balance: number) => void;
}

const NETWORK_COLORS: Record<string, string> = {
  visa: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  mastercard: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  amex: "bg-green-500/15 text-green-400 border-green-500/20",
};

export function WalletCard({ userCard, sessionId, onRemoved, onBalanceUpdated }: Props) {
  const card = userCard.card;
  const [editing, setEditing] = useState(false);
  const [balanceInput, setBalanceInput] = useState(String(userCard.point_balance));
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSaveBalance() {
    const balance = parseInt(balanceInput, 10);
    if (isNaN(balance) || balance < 0) {
      setError("Enter a valid balance");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateCardBalance(sessionId, userCard.id, balance);
      onBalanceUpdated(userCard.id, balance);
      setEditing(false);
    } catch {
      setError("Failed to update balance");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      await removeCardFromWallet(sessionId, userCard.id);
      onRemoved(userCard.id);
    } catch {
      setError("Failed to remove card");
      setRemoving(false);
    }
  }

  const networkClass = card ? (NETWORK_COLORS[card.network] ?? "bg-white/10 text-white/60") : "";

  return (
    <div className="glass rounded-2xl p-5 border border-white/8 hover:border-white/15 transition-all">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-white font-semibold text-base">{card?.name ?? "Unknown Card"}</h3>
            {card && (
              <Badge className={`text-xs capitalize ${networkClass}`}>
                {card.network}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground text-sm mt-0.5">
            {card?.issuer ?? ""}{card?.loyalty_program ? ` · ${card.loyalty_program.name}` : ""}
          </p>

          {/* Balance */}
          <div className="mt-4">
            {editing ? (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  value={balanceInput}
                  onChange={(e) => setBalanceInput(e.target.value)}
                  className="w-40 h-9 bg-white/5 border-white/10 text-white text-sm"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveBalance(); if (e.key === "Escape") setEditing(false); }}
                />
                <span className="text-muted-foreground text-sm">pts</span>
                <Button
                  size="sm"
                  onClick={handleSaveBalance}
                  disabled={saving}
                  className="h-9 maple-gradient text-white text-xs px-3"
                >
                  {saving ? "Saving..." : "Save"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setEditing(false); setBalanceInput(String(userCard.point_balance)); }}
                  className="h-9 text-muted-foreground text-xs px-2"
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="group flex items-center gap-2 hover:opacity-80 transition-opacity"
              >
                <span className="text-2xl font-bold text-white">
                  {userCard.point_balance.toLocaleString()}
                </span>
                <span className="text-muted-foreground text-sm">pts</span>
                <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                  (edit)
                </span>
              </button>
            )}
            {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
          </div>
        </div>

        {/* Remove button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRemove}
          disabled={removing}
          className="text-muted-foreground hover:text-red-400 hover:bg-red-400/10 h-8 w-8 p-0 shrink-0"
        >
          {removing ? (
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </Button>
      </div>

      {/* Annual fee */}
      {card && card.annual_fee > 0 && (
        <div className="mt-3 pt-3 border-t border-white/6 flex items-center gap-1">
          <span className="text-muted-foreground text-xs">${card.annual_fee}/yr annual fee</span>
        </div>
      )}
    </div>
  );
}
