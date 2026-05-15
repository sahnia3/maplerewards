"use client";

import { Clock } from "lucide-react";

/**
 * WelcomeOfferBadge — shows a compact "Offer ends Xd" indicator on cards
 * whose public welcome bonus is about to revert. Hidden when expiry is more
 * than 60 days out (no urgency yet) or when no expiry is set on the card.
 *
 * Surfaces the Reddit-confirmed pain point that Canadians lose track of
 * promo windows (RBC ION+ closes May 6, Scotia Passport VI Privilege closed
 * Apr 30) and miss out on bonuses worth thousands of points.
 */
export function WelcomeOfferBadge({
  expiresAt,
  variant = "compact",
}: {
  expiresAt?: string | null;
  variant?: "compact" | "banner";
}) {
  if (!expiresAt) return null;

  const expiry = new Date(expiresAt + "T23:59:59");
  if (Number.isNaN(expiry.getTime())) return null;

  const now = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / msPerDay);

  // Already expired — don't draw attention to a dead offer
  if (daysLeft < 0) return null;
  // More than 60 days out — no urgency, don't compete for visual attention
  if (daysLeft > 60) return null;

  const urgent = daysLeft <= 14;
  const tone = urgent ? "var(--accent)" : "var(--ink-2)";
  const label =
    daysLeft === 0
      ? "Last day"
      : daysLeft === 1
      ? "1 day left"
      : `${daysLeft} days left`;

  if (variant === "banner") {
    return (
      <div
        role="status"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 14px",
          borderRadius: 10,
          border: `1px solid ${tone}`,
          background: urgent ? "var(--accent-soft)" : "var(--card-fill)",
          color: tone,
        }}
        className="mono"
      >
        <Clock size={14} />
        <span style={{ fontSize: 12, letterSpacing: "0.04em" }}>
          Welcome bonus offer ends {label.toLowerCase()} ({expiresAt})
        </span>
      </div>
    );
  }

  return (
    <span
      className="mono"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 8px",
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.10em",
        textTransform: "uppercase",
        border: `1px solid ${tone}`,
        color: tone,
        background: urgent ? "var(--accent-soft)" : "transparent",
      }}
      title={`Welcome bonus offer ends ${expiresAt}`}
    >
      <Clock size={10} />
      {label}
    </span>
  );
}
