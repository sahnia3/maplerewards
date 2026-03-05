"use client";

import { useState } from "react";
import { updateCardBalance, removeCardFromWallet } from "@/lib/api";
import type { UserCard } from "@/lib/types";

interface Props {
  userCard: UserCard;
  sessionId: string;
  onRemoved: (id: string) => void;
  onBalanceUpdated: (id: string, balance: number) => void;
}

const NETWORK_PILL: Record<string, { bg: string; color: string }> = {
  visa:       { bg: "rgba(59,130,246,0.12)",  color: "#60A5FA" },
  mastercard: { bg: "rgba(251,146,60,0.12)",  color: "#FB923C" },
  amex:       { bg: "rgba(52,211,153,0.12)",  color: "#34D399" },
};

export function WalletCard({ userCard, sessionId, onRemoved, onBalanceUpdated }: Props) {
  const card = userCard.card;
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(String(userCard.point_balance));
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const bal = parseInt(input, 10);
    if (isNaN(bal) || bal < 0) { setError("Invalid balance"); return; }
    setSaving(true); setError(null);
    try {
      await updateCardBalance(sessionId, userCard.id, bal);
      onBalanceUpdated(userCard.id, bal);
      setEditing(false);
    } catch { setError("Update failed"); }
    finally { setSaving(false); }
  }

  async function remove() {
    setRemoving(true);
    try {
      await removeCardFromWallet(sessionId, userCard.id);
      onRemoved(userCard.id);
    } catch { setError("Remove failed"); setRemoving(false); }
  }

  const net = card?.network ?? "";
  const pill = NETWORK_PILL[net];

  return (
    <div
      className="relative rounded-2xl p-5 lift group"
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-dim)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      {/* Remove button — appears on hover */}
      <button
        onClick={remove}
        disabled={removing}
        className="absolute top-4 right-4 w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-150 hover:bg-red-500/15"
        style={{ color: "var(--text-tertiary)" }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#E8173A"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)"; }}
        title="Remove card"
      >
        {removing ? (
          <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Card identity */}
      <div className="flex items-start gap-3 pr-8">
        {/* Logo placeholder */}
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-lg font-bold text-white/20"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border-dim)" }}
        >
          {card?.issuer?.[0] ?? "?"}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[15px] font-semibold text-white truncate">
              {card?.name ?? "Unknown Card"}
            </h3>
            {pill && (
              <span
                className="label-xs px-1.5 py-0.5 rounded-md capitalize"
                style={{ background: pill.bg, color: pill.color }}
              >
                {card?.network}
              </span>
            )}
          </div>
          <p className="text-[13px] mt-0.5 truncate" style={{ color: "var(--text-secondary)" }}>
            {card?.issuer}
            {card?.loyalty_program ? ` · ${card.loyalty_program.name}` : ""}
          </p>
        </div>
      </div>

      {/* Balance section */}
      <div
        className="mt-4 pt-4 rounded-xl px-4 pb-4"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
      >
        <div className="label-xs mb-2" style={{ color: "var(--text-tertiary)" }}>Point balance</div>

        {editing ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              value={input}
              onChange={e => setInput(e.target.value)}
              autoFocus
              onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
              className="w-36 h-9 px-3 rounded-lg text-[14px] font-semibold text-white outline-none transition-all"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(200,16,46,0.4)",
                boxShadow: "0 0 0 3px rgba(200,16,46,0.1)",
              }}
            />
            <button
              onClick={save}
              disabled={saving}
              className="h-9 px-4 rounded-lg text-[13px] font-semibold text-white transition-all maple-bg maple-glow disabled:opacity-40"
            >
              {saving ? "…" : "Save"}
            </button>
            <button
              onClick={() => { setEditing(false); setInput(String(userCard.point_balance)); }}
              className="h-9 px-3 rounded-lg text-[13px] transition-all"
              style={{ color: "var(--text-tertiary)" }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="group/bal flex items-baseline gap-2 hover:opacity-75 transition-opacity text-left"
          >
            <span className="text-[26px] font-bold tracking-tight text-white leading-none">
              {userCard.point_balance.toLocaleString()}
            </span>
            <span className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>pts</span>
            <svg className="w-3 h-3 ml-1 opacity-0 group-hover/bal:opacity-60 transition-opacity" style={{ color: "var(--text-tertiary)" }} viewBox="0 0 16 16" fill="none">
              <path d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          </button>
        )}

        {error && <p className="text-[12px] mt-1.5" style={{ color: "#E8173A" }}>{error}</p>}
      </div>

      {/* Annual fee chip */}
      {card && card.annual_fee > 0 && (
        <div className="mt-3 flex items-center gap-1.5">
          <span className="label-xs" style={{ color: "var(--text-tertiary)" }}>
            ${card.annual_fee}/yr annual fee
          </span>
        </div>
      )}
    </div>
  );
}
