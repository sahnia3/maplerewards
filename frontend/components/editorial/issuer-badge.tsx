"use client";

/**
 * Issuer logo badges for the MapleRewards redesign.
 *
 * `normalizeIssuer` maps free-text issuer strings (as they appear on cards) to a
 * short wordmark + brand color + stable key. `IssuerBadge` renders a SQUARE,
 * brand-colored badge: where a clean monochrome logo exists (Amex, HSBC) it is
 * painted white via CSS mask so it fills the square with no white letterboxing;
 * otherwise a tight white wordmark is shown — which, for the letter-logo banks
 * (RBC / TD / CIBC / BMO / HSBC), is effectively their real mark.
 *
 * These badges identify which bank a user's own card belongs to (standard
 * nominative use). Logos are served locally from `/public/issuers/` — no runtime
 * CDN dependency. Brand hex values are hardcoded here (the one place the design
 * spec permits raw hex). Unknown issuers fall back to neutral initials. Never
 * throws.
 */

import { type CSSProperties } from "react";

export interface NormalizedIssuer {
  /** Stable short key, e.g. "AMEX", "TD", "UNKNOWN". */
  key: string;
  /** Full display wordmark for a11y/title, e.g. "AMEX", "SCOTIA". */
  label: string;
  /** Tight ≤4-char form for the square badge, e.g. "SCO", "AMEX". */
  short: string;
  /** Brand background color (hex) or a CSS var for the neutral fallback. */
  color: string;
}

interface IssuerDef {
  key: string;
  label: string;
  /** ≤4 chars so it fits a square badge cleanly. */
  short: string;
  color: string;
  /** Lowercased keywords/substrings that identify this issuer. */
  match: string[];
}

/**
 * Ordered by specificity: more specific issuers (e.g. "PC Financial",
 * "Simplii") must be tested before their broader parents (e.g. "CIBC") so a
 * substring match doesn't claim them first.
 */
const ISSUERS: IssuerDef[] = [
  { key: "AMEX", label: "AMEX", short: "AMEX", color: "#016FD0", match: ["american express", "amex", "amer exp"] },
  { key: "PC", label: "PC", short: "PC", color: "#C8102E", match: ["pc financial", "pc fin", "president's choice", "presidents choice", "pc optimum", "pc money", "pc mastercard"] },
  { key: "SIMPLII", label: "SIMPLII", short: "SMP", color: "#E4002B", match: ["simplii"] },
  { key: "TANGERINE", label: "TANGERINE", short: "TNG", color: "#FF6200", match: ["tangerine"] },
  { key: "TD", label: "TD", short: "TD", color: "#0A8A3C", match: ["td", "toronto-dominion", "toronto dominion", "td bank", "td canada"] },
  { key: "SCOTIA", label: "SCOTIA", short: "SCO", color: "#D81E2C", match: ["scotia", "bank of nova scotia", "bns"] },
  { key: "RBC", label: "RBC", short: "RBC", color: "#0051A5", match: ["rbc", "royal bank"] },
  { key: "CIBC", label: "CIBC", short: "CIBC", color: "#C8102E", match: ["cibc", "canadian imperial"] },
  { key: "BMO", label: "BMO", short: "BMO", color: "#0079C1", match: ["bmo", "bank of montreal"] },
  { key: "NATIONAL", label: "NBC", short: "NBC", color: "#E01A2B", match: ["national bank", "banque nationale", "nbc"] },
  { key: "ROGERS", label: "ROGERS", short: "ROG", color: "#DA291C", match: ["rogers"] },
  { key: "BRIM", label: "BRIM", short: "BRIM", color: "#FF4F00", match: ["brim"] },
  { key: "NEO", label: "NEO", short: "NEO", color: "#5A2EFF", match: ["neo financial", "neo"] },
  { key: "WEALTHSIMPLE", label: "WS", short: "WS", color: "#000000", match: ["wealthsimple"] },
  { key: "HSBC", label: "HSBC", short: "HSBC", color: "#DB0011", match: ["hsbc"] },
  { key: "DESJARDINS", label: "DESJ", short: "DSJ", color: "#00874E", match: ["desjardins"] },
  { key: "CANADIAN_TIRE", label: "CTFS", short: "CT", color: "#C8102E", match: ["canadian tire", "ctfs", "triangle"] },
];

const NEUTRAL_COLOR = "var(--ink-3)";

/**
 * Full-colour logo SVGs (their own brand background + white artwork) served from
 * /public/issuers. Rendered as an <img> that FILLS the square — blue background,
 * white logo for Amex. Banks not listed here use the white wordmark form (which,
 * for letter-logo banks like RBC/TD/CIBC/BMO, is their actual mark). To add one,
 * drop a square SVG with its own brand-coloured background at
 * /public/issuers/<key-lowercased>.svg and add it here.
 */
const LOGO_IMG: Record<string, string> = {
  AMEX: "/issuers/amex.svg",
};

/** Derive up-to-2-char initials from an arbitrary issuer string. */
function deriveInitials(raw: string): string {
  const cleaned = raw.replace(/[^a-z0-9 ]/gi, " ").trim();
  if (!cleaned) return "??";
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "??";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Match a single free-text string against the issuer table; null if no match. */
function matchOne(text: string): IssuerDef | null {
  // Pad with spaces so word-keyed matches ("td", "rbc") hit on word boundaries
  // and never claim a substring inside another word.
  const hay = ` ${text.toLowerCase().trim().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ")} `;
  for (const def of ISSUERS) {
    for (const kw of def.match) {
      const needle = ` ${kw.trim()} `;
      if (hay.includes(needle) || (kw.trim().includes(" ") && hay.includes(kw.trim()))) {
        return def;
      }
    }
  }
  return null;
}

/**
 * Map a free-text issuer string to a normalized wordmark + brand color. The
 * issuer field is matched first; if it doesn't resolve (missing or non-standard
 * on some catalog cards), the card NAME is tried as a fallback — so e.g. a card
 * named "Gold American Express" still reads as Amex. Co-branded cards keep their
 * real issuer because issuer takes priority over the name. Never throws.
 */
export function normalizeIssuer(
  issuer: string | null | undefined,
  cardName?: string | null,
): NormalizedIssuer {
  const def = (issuer != null && matchOne(String(issuer))) || (cardName ? matchOne(String(cardName)) : null);
  if (def) {
    return { key: def.key, label: def.label, short: def.short, color: def.color };
  }
  if (issuer == null && !cardName) {
    return { key: "UNKNOWN", label: "—", short: "—", color: NEUTRAL_COLOR };
  }
  const initials = deriveInitials(String(issuer ?? cardName ?? ""));
  return { key: "UNKNOWN", label: initials, short: initials, color: NEUTRAL_COLOR };
}

export interface IssuerBadgeProps {
  /** Free-text issuer string from the card. */
  issuer: string | null | undefined;
  /** Card name — used as an issuer fallback when the issuer field is missing. */
  cardName?: string | null;
  /** Square side length in px. Default 28. */
  size?: number;
  /** Optional title override (defaults to the raw issuer for a11y). */
  title?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * Square, brand-colored issuer badge. Renders a white masked logo where one
 * exists (Amex, HSBC) or a tight white wordmark otherwise. Unknown issuers get
 * a neutral square with initials. Never blank, never throws.
 */
export function IssuerBadge({ issuer, cardName, size = 28, title, className, style }: IssuerBadgeProps) {
  const { key, label, short, color } = normalizeIssuer(issuer, cardName);
  const resolvedTitle = title ?? (issuer ? String(issuer) : cardName ? String(cardName) : undefined);
  const isNeutral = color === NEUTRAL_COLOR;
  const logoSrc = LOGO_IMG[key];
  const fg = isNeutral ? "var(--ink-2)" : "#fff";

  // Wordmark sizing: shorter marks read larger; long ones shrink to fit the square.
  const fontScale = short.length <= 2 ? 0.42 : short.length <= 3 ? 0.36 : short.length <= 4 ? 0.3 : 0.26;

  return (
    <span
      className={className}
      title={resolvedTitle}
      aria-label={resolvedTitle ?? label}
      role="img"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: Math.max(5, Math.round(size * 0.24)),
        background: isNeutral ? "var(--surface-2)" : color,
        border: isNeutral ? "1px solid var(--rule-strong)" : "none",
        flexShrink: 0,
        overflow: "hidden",
        userSelect: "none",
        ...style,
      }}
    >
      {logoSrc ? (
        // Full-colour logo (its own brand background + white artwork) filling the
        // square — e.g. Amex: blue square, white "AMERICAN EXPRESS".
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoSrc}
          alt={resolvedTitle ?? label}
          width={size}
          height={size}
          style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <span
          className="mono"
          aria-hidden
          style={{
            color: fg,
            fontWeight: 700,
            fontSize: Math.max(7, Math.round(size * fontScale)),
            letterSpacing: "0.01em",
            textTransform: "uppercase",
            lineHeight: 1,
          }}
        >
          {short}
        </span>
      )}
    </span>
  );
}
