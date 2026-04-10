"use client";

import { useState, useEffect } from "react";
import { X, Save, Loader2 } from "lucide-react";
import type { UserCard, UpdateCardDetailsRequest } from "@/lib/types";
import { useWallet } from "@/contexts/wallet-context";

interface CardEditModalProps {
  card: UserCard;
  open: boolean;
  onClose: () => void;
}

export function CardEditModal({ card, open, onClose }: CardEditModalProps) {
  const { updateCardDetails } = useWallet();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pointBalance, setPointBalance] = useState(card.point_balance);
  const [nickname, setNickname] = useState(card.nickname ?? "");
  const [expiryDate, setExpiryDate] = useState(card.points_expiry_date ?? "");
  const [dateOpened, setDateOpened] = useState(card.date_opened ?? "");
  const [hasAnnualFee, setHasAnnualFee] = useState(card.has_annual_fee ?? false);
  const [customAnnualFee, setCustomAnnualFee] = useState(
    card.custom_annual_fee?.toString() ?? ""
  );

  // Reset form when card changes
  useEffect(() => {
    setPointBalance(card.point_balance);
    setNickname(card.nickname ?? "");
    setExpiryDate(card.points_expiry_date ?? "");
    setDateOpened(card.date_opened ?? "");
    setHasAnnualFee(card.has_annual_fee ?? false);
    setCustomAnnualFee(card.custom_annual_fee?.toString() ?? "");
    setError(null);
  }, [card]);

  if (!open) return null;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const details: UpdateCardDetailsRequest = {
        point_balance: pointBalance,
        nickname: nickname || undefined,
        points_expiry_date: expiryDate || "",
        date_opened: dateOpened || "",
        has_annual_fee: hasAnnualFee,
        custom_annual_fee: hasAnnualFee && customAnnualFee
          ? parseFloat(customAnnualFee)
          : 0,
      };
      await updateCardDetails(card.id, card.card_id, details);
      onClose();
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const cardName = card.card?.name ?? "Card";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-[460px] rounded-2xl overflow-hidden"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-mid)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: "1px solid var(--border-dim)" }}
        >
          <div>
            <h2 className="text-[16px] font-semibold text-white">Edit Card</h2>
            <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
              {cardName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: "var(--text-tertiary)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-tertiary)")}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {error && (
            <div
              className="p-3 rounded-xl text-[13px]"
              style={{
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.2)",
                color: "#EF4444",
              }}
            >
              {error}
            </div>
          )}

          {/* Nickname */}
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
              Nickname
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="e.g. Daily Spender"
              className="w-full h-10 px-3 rounded-xl text-[14px] text-white placeholder:text-zinc-500 outline-none transition-all"
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-dim)",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--teal, #0D9488)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-dim)")}
            />
          </div>

          {/* Points Balance */}
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
              Points Balance
            </label>
            <input
              type="number"
              value={pointBalance}
              onChange={(e) => setPointBalance(parseInt(e.target.value) || 0)}
              className="w-full h-10 px-3 rounded-xl text-[14px] text-white placeholder:text-zinc-500 outline-none transition-all"
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-dim)",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--teal, #0D9488)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-dim)")}
            />
          </div>

          {/* Points Expiry Date */}
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
              Points Expiry Date
            </label>
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="w-full h-10 px-3 rounded-xl text-[14px] text-white outline-none transition-all"
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-dim)",
                colorScheme: "dark",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--teal, #0D9488)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-dim)")}
            />
          </div>

          {/* Date Opened */}
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
              Date Opened
            </label>
            <input
              type="date"
              value={dateOpened}
              onChange={(e) => setDateOpened(e.target.value)}
              className="w-full h-10 px-3 rounded-xl text-[14px] text-white outline-none transition-all"
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-dim)",
                colorScheme: "dark",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--teal, #0D9488)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-dim)")}
            />
          </div>

          {/* Annual Fee Toggle */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>
                Track Annual Fee
              </label>
              <button
                type="button"
                onClick={() => setHasAnnualFee(!hasAnnualFee)}
                className="relative w-10 h-5 rounded-full transition-colors"
                style={{
                  background: hasAnnualFee ? "var(--teal, #0D9488)" : "rgba(255,255,255,0.1)",
                }}
              >
                <span
                  className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                  style={{
                    left: hasAnnualFee ? "22px" : "2px",
                  }}
                />
              </button>
            </div>
            {hasAnnualFee && (
              <div className="mt-2">
                <input
                  type="number"
                  value={customAnnualFee}
                  onChange={(e) => setCustomAnnualFee(e.target.value)}
                  placeholder="Annual fee amount ($)"
                  step="0.01"
                  className="w-full h-10 px-3 rounded-xl text-[14px] text-white placeholder:text-zinc-500 outline-none transition-all"
                  style={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-dim)",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--teal, #0D9488)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-dim)")}
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-3 px-6 py-4"
          style={{ borderTop: "1px solid var(--border-dim)" }}
        >
          <button
            onClick={onClose}
            className="h-9 px-4 rounded-xl text-[13px] font-medium transition-colors"
            style={{ color: "var(--text-secondary)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="h-9 px-5 rounded-xl text-[13px] font-semibold text-white flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70"
            style={{
              background: "var(--teal, #0D9488)",
              boxShadow: "0 2px 12px rgba(13,148,136,0.3)",
            }}
          >
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save size={14} />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
