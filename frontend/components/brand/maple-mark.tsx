"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * MapleMark — the new MapleRewards identity.
 *
 * Editorial stamped-seal: a thin gold compass circle around a hand-drawn
 * 11-point maple leaf in maple-red strokes (with a forest-green stem dot).
 * No red background — the brief said specifically "not red." Cream/paper
 * surface, gold scaffolding, maple-red leaf. Reads like a magazine masthead
 * or a Canadian colonial wax seal, not a fast-food logo.
 *
 * All strokes/fills resolve via CSS vars, so the mark inverts cleanly in
 * dark mode without any prop changes.
 */

export interface MapleMarkProps extends React.SVGAttributes<SVGSVGElement> {
  size?: number;
  /** When true, drops the outer compass ring — a tighter mark for tight UIs. */
  bare?: boolean;
}

export const MapleMark = React.forwardRef<SVGSVGElement, MapleMarkProps>(function MapleMark(
  { size = 28, bare = false, className, ...rest },
  ref
) {
  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="img"
      aria-label="MapleRewards"
      className={cn("select-none", className)}
      {...rest}
    >
      {/* Compass scaffolding — gold, hairline. Two concentric rings + four cardinal ticks. */}
      {!bare && (
        <g stroke="var(--gold)" strokeLinecap="round" fill="none">
          <circle cx="20" cy="20" r="18.5" strokeWidth="0.6" />
          <circle cx="20" cy="20" r="16.4" strokeWidth="0.35" opacity="0.55" />
          {/* Cardinal ticks — barely there, just enough to feel architectural. */}
          <path d="M20 1.5 L20 3.5 M20 36.5 L20 38.5 M1.5 20 L3.5 20 M36.5 20 L38.5 20" strokeWidth="0.45" />
        </g>
      )}

      {/* The leaf — 11-point hand-stroke, no fill. Maple-red. */}
      <path
        d="M20 5
           L22.6 12
           L29 8.5
           L26.5 15.4
           L33.5 17.5
           L27.4 21
           L29.5 27.8
           L23 26.3
           L22 32.2
           L20 29.6
           L18 32.2
           L17 26.3
           L10.5 27.8
           L12.6 21
           L6.5 17.5
           L13.5 15.4
           L11 8.5
           L17.4 12
           Z"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Stem indicator — a tiny forest-green pip below the leaf, pulling the mark off-center
          just enough to feel hand-drawn rather than CAD-perfect. */}
      <circle cx="20" cy="34.2" r="0.85" fill="var(--primary)" />
    </svg>
  );
});

/**
 * MapleWordmark — Mark + name, the format used in the header / login / footer.
 *
 * The wordmark uses Instrument Serif italic for "maple" (display font) and
 * mono uppercase letter-spaced "rewards" — a deliberate type pairing that
 * reads as "Saturday Night magazine," not "fintech app from 2014."
 */

export interface MapleWordmarkProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: "sm" | "md" | "lg";
  bare?: boolean;
}

const SIZES = {
  sm: { mark: 22, maple: "20px", rewards: "9px", gap: 8 },
  md: { mark: 28, maple: "26px", rewards: "10px", gap: 10 },
  lg: { mark: 36, maple: "34px", rewards: "11px", gap: 12 },
} as const;

export function MapleWordmark({ size = "md", bare = false, className, ...rest }: MapleWordmarkProps) {
  const s = SIZES[size];
  return (
    <span
      className={cn("inline-flex items-center", className)}
      style={{ gap: s.gap }}
      {...rest}
    >
      <MapleMark size={s.mark} bare={bare} />
      <span className="inline-flex items-baseline" style={{ gap: 6 }}>
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: s.maple,
            fontStyle: "italic",
            color: "var(--ink)",
            lineHeight: 1,
            letterSpacing: "-0.01em",
          }}
        >
          maple
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: s.rewards,
            color: "var(--ink-3)",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            fontWeight: 600,
            lineHeight: 1,
          }}
        >
          rewards
        </span>
      </span>
    </span>
  );
}
