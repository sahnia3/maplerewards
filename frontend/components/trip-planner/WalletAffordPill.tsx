"use client";

/* WalletAffordPill — shows whether the user's wallet covers an award.
 *
 *   anonymous       → render nothing (props.show === false)
 *   can_afford true → green "Covered by your wallet" pill
 *   can_afford false→ "Short N pts" pill + "Boost via {partner}" CTA → /wallet
 */

import Link from "next/link";

interface WalletAffordPillProps {
  show: boolean; // false hides everything (anonymous user)
  canAfford: boolean;
  pointsCost: number;
  pointsAvailable: number;
  bestTransferPartner?: string;
}

export function WalletAffordPill({
  show,
  canAfford,
  pointsCost,
  pointsAvailable,
  bestTransferPartner,
}: WalletAffordPillProps) {
  if (!show) return null;

  if (canAfford) {
    return (
      <span
        className="mono"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: 12,
          padding: "3px 9px",
          borderRadius: 999,
          background: "rgba(34, 139, 84, 0.10)",
          color: "var(--gain)",
          border: "1px solid rgba(34, 139, 84, 0.35)",
          letterSpacing: "0.10em",
          textTransform: "uppercase",
        }}
      >
        Covered by your wallet
      </span>
    );
  }

  const gap = Math.max(0, pointsCost - pointsAvailable);
  const boostHref = bestTransferPartner
    ? `/wallet?boost=${encodeURIComponent(bestTransferPartner)}`
    : "/wallet";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
      }}
    >
      <span
        className="mono"
        style={{
          display: "inline-flex",
          alignItems: "center",
          fontSize: 12,
          padding: "3px 9px",
          borderRadius: 999,
          background: "var(--surface-2)",
          color: "var(--ink-2)",
          border: "1px solid var(--rule)",
          letterSpacing: "0.10em",
          textTransform: "uppercase",
        }}
      >
        Short {gap.toLocaleString()} pts
      </span>
      {bestTransferPartner && (
        <Link
          href={boostHref}
          className="mono"
          style={{
            fontSize: 12,
            padding: "3px 9px",
            borderRadius: 999,
            background: "var(--ink)",
            color: "var(--paper)",
            textDecoration: "none",
            letterSpacing: "0.10em",
            textTransform: "uppercase",
          }}
        >
          Boost via {bestTransferPartner} →
        </Link>
      )}
    </span>
  );
}
