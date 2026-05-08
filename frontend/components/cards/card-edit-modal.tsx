"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import type { UserCard, UpdateCardDetailsRequest } from "@/lib/types";
import { useWallet } from "@/contexts/wallet-context";
import { CreditCardVisual } from "@/components/cards/credit-card-visual";

/* Editorial card-edit modal — paper-on-paper surface, mono inputs, maple-red CTA.
 * Replaces the legacy shadcn-style modal that lived in the dark theme.
 */

interface CardEditModalProps {
  card: UserCard;
  open: boolean;
  onClose: () => void;
}

const fieldStyle: React.CSSProperties = {
  width: "100%",
  height: 44,
  padding: "0 14px",
  background: "var(--surface)",
  border: "1px solid var(--rule)",
  borderRadius: 8,
  fontSize: 14,
  fontFamily: "var(--font-mono)",
  color: "var(--ink)",
  outline: "none",
};

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
    card.custom_annual_fee?.toString() ?? "",
  );

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
      setError("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const cardName = card.card?.name ?? "Card";

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "rgba(11,17,24,0.55)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 480,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--surface)",
          border: "1px solid var(--ink)",
          borderRadius: 14,
          boxShadow: "var(--shadow-2)",
          overflow: "hidden",
        }}
      >
        {/* Header — eyebrow + serif title + card photo preview */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--rule)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div>
              <span className="eyebrow" style={{ color: "var(--accent)" }}>Edit card</span>
              <h2 className="display" style={{ fontSize: 24, margin: "4px 0 0", lineHeight: 1.1, fontStyle: "italic" }}>
                {cardName}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                padding: 8,
                borderRadius: 8,
                background: "transparent",
                border: "1px solid var(--rule)",
                color: "var(--ink-3)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <X size={16} />
            </button>
          </div>
          {/* Card sprite preview */}
          <div style={{ display: "flex", justifyContent: "center", marginTop: 6 }}>
            <CreditCardVisual card={card.card ?? undefined} balance={pointBalance} size="sm" />
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
          {error && (
            <div
              className="serif"
              style={{
                padding: "10px 14px",
                borderLeft: "2px solid var(--accent)",
                color: "var(--accent)",
                fontStyle: "italic",
                fontSize: 14,
              }}
            >
              {error}
            </div>
          )}

          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Nickname</div>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="e.g. Daily Spender"
              style={fieldStyle}
            />
          </div>

          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Points balance</div>
            <input
              type="number"
              value={pointBalance}
              onChange={(e) => setPointBalance(parseInt(e.target.value) || 0)}
              style={fieldStyle}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Points expiry</div>
              <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} style={fieldStyle} />
            </div>
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Date opened</div>
              <input type="date" value={dateOpened} onChange={(e) => setDateOpened(e.target.value)} style={fieldStyle} />
            </div>
          </div>

          {/* Annual fee toggle row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 14px",
              border: "1px solid var(--rule)",
              borderRadius: 10,
              background: "var(--card-fill)",
            }}
          >
            <span className="eyebrow">Track annual fee</span>
            <button
              type="button"
              onClick={() => setHasAnnualFee(!hasAnnualFee)}
              aria-pressed={hasAnnualFee}
              style={{
                position: "relative",
                width: 38,
                height: 20,
                borderRadius: 999,
                border: "none",
                background: hasAnnualFee ? "var(--accent)" : "var(--rule-strong)",
                cursor: "pointer",
                transition: "background 160ms",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 2,
                  left: hasAnnualFee ? 20 : 2,
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: "#fff",
                  transition: "left 160ms",
                }}
              />
            </button>
          </div>

          {hasAnnualFee && (
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Annual fee (CAD)</div>
              <input
                type="number"
                value={customAnnualFee}
                onChange={(e) => setCustomAnnualFee(e.target.value)}
                placeholder="0.00"
                step="0.01"
                style={fieldStyle}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            padding: "16px 24px",
            borderTop: "1px solid var(--rule)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="mono"
            style={{
              height: 42,
              padding: "0 18px",
              borderRadius: 8,
              background: "transparent",
              border: "1px solid var(--rule-strong)",
              color: "var(--ink-2)",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="mono"
            style={{
              height: 42,
              padding: "0 22px",
              borderRadius: 8,
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              cursor: saving ? "default" : "pointer",
              opacity: saving ? 0.55 : 1,
            }}
          >
            {saving ? "Saving…" : "Save changes →"}
          </button>
        </div>
      </div>
    </div>
  );
}
