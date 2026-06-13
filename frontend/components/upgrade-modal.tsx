"use client";

import Link from "next/link";
import { X, Sparkles } from "lucide-react";

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  /** Server-provided upsell message (e.g. the 402 free-tier limit copy). */
  message?: string;
}

export function UpgradeModal({ open, onClose, message }: UpgradeModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-[400px] rounded-2xl p-8 text-center"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-mid)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg transition-colors"
          style={{ color: "var(--text-tertiary)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-tertiary)")}
        >
          <X size={18} />
        </button>

        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
          style={{
            background: "linear-gradient(135deg, rgba(165,31,45,0.15), rgba(116,19,29,0.08))",
            border: "1px solid rgba(165,31,45,0.25)",
          }}
        >
          <Sparkles size={24} style={{ color: "var(--accent)" }} />
        </div>

        <h2 className="text-[18px] font-bold text-white mb-2">
          Upgrade to Pro
        </h2>
        <p
          className="text-[14px] leading-relaxed mb-6"
          style={{ color: "var(--text-secondary)" }}
        >
          {message ??
            "Free includes 5 wallet cards. Pro unlocks unlimited cards, missed-rewards forensics, and the full tool suite."}
        </p>

        <Link
          href="/pricing?tier=pro"
          className="flex w-full h-11 rounded-xl font-semibold text-[14px] text-black items-center justify-center transition-all hover:scale-[1.01] active:scale-[0.99]"
          style={{
            background: "linear-gradient(135deg, var(--accent), var(--accent-2, #74131D))",
            boxShadow: "0 4px 20px rgba(165,31,45,0.3)",
          }}
        >
          See Pro — $39.99/yr
        </Link>
        <button
          onClick={onClose}
          className="w-full mt-3 text-[12px] transition-colors"
          style={{ color: "var(--text-tertiary)" }}
        >
          Not now
        </button>
      </div>
    </div>
  );
}
