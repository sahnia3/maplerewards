"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { PRO_FEATURES, PRICING, type ProFeatureKey } from "@/lib/pro-features";

interface ProGateProps {
  feature: ProFeatureKey;
  children: ReactNode;
  /** Optional: render a compact inline badge instead of the full gate panel */
  inline?: boolean;
}

/**
 * ProGate wraps content that requires a Pro subscription.
 * If the user is Pro, children render normally.
 * If not, a styled upgrade prompt is shown instead.
 */
export function ProGate({ feature, children, inline }: ProGateProps) {
  const { isPro } = useAuth();

  if (isPro) {
    return <>{children}</>;
  }

  const info = PRO_FEATURES[feature];

  if (inline) {
    return (
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium cursor-default"
        style={{
          background: "rgba(165,31,45,0.10)",
          border: "1px solid rgba(165,31,45,0.22)",
          color: "var(--accent)",
        }}
        title={info.description}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
        Pro
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl p-8 text-center"
      style={{
        background: "linear-gradient(135deg, rgba(165,31,45,0.06), rgba(116,19,29,0.03))",
        border: "1px solid rgba(165,31,45,0.22)",
      }}
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4"
        style={{
          background: "rgba(165,31,45,0.12)",
          border: "1px solid rgba(165,31,45,0.25)",
        }}
      >
        <Lock size={22} style={{ color: "var(--accent)" }} />
      </div>
      <h3 className="text-[16px] font-semibold text-white mb-1.5">{info.label}</h3>
      <p
        className="text-[13px] max-w-[320px] mx-auto mb-5 leading-relaxed"
        style={{ color: "var(--text-secondary)" }}
      >
        {info.description}
      </p>
      <Link
        href="/pricing"
        className="inline-flex items-center justify-center h-10 px-6 rounded-xl font-semibold text-[14px] text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
        style={{
          background: "linear-gradient(135deg, var(--accent), var(--accent-2, #74131D))",
          boxShadow: "0 4px 20px rgba(165,31,45,0.25)",
        }}
      >
        Upgrade to Pro
      </Link>
      <p className="text-[11px] mt-3" style={{ color: "var(--text-tertiary)" }}>
        From ${PRICING.annual.monthlyEquivalent.toFixed(2)}/mo (billed annually) — cancel anytime
      </p>
    </div>
  );
}
