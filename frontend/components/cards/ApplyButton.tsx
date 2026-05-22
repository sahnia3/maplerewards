"use client";

import { useState } from "react";
import { BASE_URL } from "@/lib/api";

interface ApplyButtonProps {
  cardId: string;
  /** Card name for the tooltip + screen-reader label. */
  cardName?: string;
  /** When false (default), the button hides itself if no affiliate URL is wired up yet. */
  alwaysShow?: boolean;
  /** Whether this card actually has an affiliate URL configured. */
  hasAffiliate?: boolean;
  size?: "sm" | "md";
}

/**
 * ApplyButton renders the canonical "Apply Now" CTA. It opens the backend
 * `/affiliate/click/{cardId}` redirect in a new tab — that endpoint logs the
 * click for revenue attribution and 302s to the affiliate URL (or to the card
 * detail page when no URL is configured yet).
 *
 * Behavior:
 *   - hidden when no affiliate URL is wired and alwaysShow=false (default)
 *   - target=_blank with rel=noopener
 *   - small disclosure subtext underneath so users know it's a commission link
 */
export function ApplyButton({
  cardId,
  cardName,
  alwaysShow = false,
  hasAffiliate = false,
  size = "md",
}: ApplyButtonProps) {
  const [hovered, setHovered] = useState(false);
  if (!hasAffiliate && !alwaysShow) return null;

  // BASE_URL already ends in /api/v1; the affiliate route lives at
  // /affiliate/click/{id} inside that group. The old double-/api/v1 404'd
  // every Apply click (and logged no affiliate attribution).
  const href = `${BASE_URL}/affiliate/click/${cardId}`;
  const padding = size === "sm" ? "8px 14px" : "12px 22px";
  const fontSize = size === "sm" ? 11 : 12;

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer sponsored"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        aria-label={cardName ? `Apply for ${cardName}` : "Apply for this card"}
        className="mono"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding,
          borderRadius: 8,
          background: hovered ? "var(--accent-2, #74131D)" : "var(--accent)",
          color: "#fff",
          textDecoration: "none",
          fontSize,
          fontWeight: 600,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          transition: "background 180ms ease",
        }}
      >
        Apply Now →
      </a>
      <div
        className="mono"
        style={{
          fontSize: 9,
          color: "var(--ink-3)",
          letterSpacing: "0.10em",
          textTransform: "uppercase",
        }}
      >
        Commission link · no extra cost to you
      </div>
    </div>
  );
}
