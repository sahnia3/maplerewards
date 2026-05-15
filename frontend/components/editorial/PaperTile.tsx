"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * PaperTile — the shared editorial substrate.
 *
 * Cream paper background, --rule borders, --shadow-1 lift. Italic Instrument
 * Serif title, uppercase mono eyebrow. Used across pro-tools and pricing.
 *
 * Pass `motif` for a single-stroke line-art glyph rendered next to the title.
 */

export type PaperTileMotif = "gauge" | "stack" | "alarm" | "plane" | "mountain";

interface PaperTileProps {
  children: ReactNode;
  eyebrow?: string;
  title?: ReactNode;
  motif?: PaperTileMotif;
  className?: string;
  accent?: boolean;
  style?: CSSProperties;
}

function Motif({ kind }: { kind: PaperTileMotif }) {
  const stroke = "var(--ink-3)";
  const sw = 1.2;
  if (kind === "gauge") {
    return (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke={stroke} strokeWidth={sw}>
        <path d="M 6 26 A 12 12 0 1 1 30 26" strokeLinecap="round" />
        <line x1="18" y1="26" x2="24" y2="14" stroke="var(--accent)" strokeLinecap="round" />
        <circle cx="18" cy="26" r="1.6" fill="var(--accent)" stroke="none" />
        <line x1="9" y1="26" x2="11" y2="26" strokeLinecap="round" />
        <line x1="25" y1="26" x2="27" y2="26" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "stack") {
    return (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke={stroke} strokeWidth={sw}>
        <rect x="6" y="14" width="22" height="10" rx="2" />
        <rect x="9" y="10" width="22" height="10" rx="2" />
        <rect x="12" y="6" width="18" height="10" rx="2" stroke="var(--accent)" />
      </svg>
    );
  }
  if (kind === "alarm") {
    return (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke={stroke} strokeWidth={sw}>
        <path d="M 9 22 L 9 16 A 9 9 0 0 1 27 16 L 27 22 L 30 26 L 6 26 Z" strokeLinejoin="round" />
        <path d="M 14 28 A 4 4 0 0 0 22 28" strokeLinecap="round" />
        <line x1="18" y1="9" x2="18" y2="6" strokeLinecap="round" stroke="var(--accent)" />
      </svg>
    );
  }
  if (kind === "plane") {
    return (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke={stroke} strokeWidth={sw}>
        <path d="M 6 18 L 30 18" strokeLinecap="round" />
        <path d="M 16 12 L 22 6 L 24 6 L 19 13" stroke="var(--accent)" strokeLinejoin="round" />
        <path d="M 12 18 L 6 14 L 4 16 L 9 19" strokeLinejoin="round" />
        <path d="M 12 18 L 6 22 L 4 20 L 9 17" strokeLinejoin="round" />
        <path d="M 16 24 L 22 30 L 24 30 L 19 23" strokeLinejoin="round" />
        <circle cx="28" cy="18" r="1.6" fill="var(--accent)" stroke="none" />
      </svg>
    );
  }
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke={stroke} strokeWidth={sw}>
      <path d="M 4 28 L 14 12 L 20 22 L 24 16 L 32 28 Z" strokeLinejoin="round" />
      <line x1="14" y1="12" x2="16" y2="14" stroke="var(--accent)" strokeLinecap="round" />
      <circle cx="26" cy="8" r="2" stroke="var(--accent)" />
    </svg>
  );
}

export function PaperTile({
  children,
  eyebrow,
  title,
  motif,
  className = "",
  accent = false,
  style,
}: PaperTileProps) {
  const hasHeader = Boolean(eyebrow || title || motif);
  return (
    <div
      className={className}
      style={{
        position: "relative",
        border: `1px solid ${accent ? "var(--accent)" : "var(--rule)"}`,
        background: "var(--card-fill-strong)",
        borderRadius: 14,
        padding: "20px 22px",
        boxShadow: "var(--shadow-1)",
        overflow: "hidden",
        ...style,
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 60% 45% at 100% 0%, var(--accent-soft), transparent 65%)",
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative" }}>
        {hasHeader && (
          <header
            style={{
              marginBottom: 16,
              display: "flex",
              gap: 14,
              alignItems: "flex-start",
            }}
          >
            {motif && (
              <div style={{ flexShrink: 0, paddingTop: 2 }}>
                <Motif kind={motif} />
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              {eyebrow && (
                <div
                  className="eyebrow"
                  style={{
                    color: "var(--accent)",
                    marginBottom: 8,
                    letterSpacing: "0.12em",
                  }}
                >
                  {eyebrow}
                </div>
              )}
              {title && (
                <h2
                  className="display"
                  style={{
                    fontSize: "clamp(22px, 2.4vw, 28px)",
                    margin: 0,
                    lineHeight: 1.1,
                    letterSpacing: "-0.01em",
                    fontStyle: "italic",
                  }}
                >
                  {title}
                </h2>
              )}
            </div>
          </header>
        )}
        {children}
      </div>
    </div>
  );
}
