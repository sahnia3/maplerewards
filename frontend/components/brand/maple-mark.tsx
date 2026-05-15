"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { LETTERS, MAPLE_POSITIONS, MAPLE_WIDTH, METRICS } from "./maple-paths";

/**
 * MapleMark — the MapleRewards app icon (May 2026 refresh).
 *
 * A lowercase 'm' (hand-vectored from Inter Tight Bold) followed by a
 * small solid maple-red dot. Pure SVG paths — no font dependency, no
 * FOUT, renders identically regardless of font load state. Pairs with
 * MapleWordmark as a two-tier identity system.
 *
 * Colors resolve via CSS vars (--ink, --accent), so the mark inverts
 * cleanly in dark mode without prop changes.
 */

export interface MapleMarkProps extends React.SVGAttributes<SVGSVGElement> {
  /** Pixel height of the mark. Width auto-scales from the SVG aspect ratio. */
  size?: number;
  /** Hide the red dot — text-only variant for ultra-tight spaces. */
  bare?: boolean;
}

// MapleMark layout in em units (1000-unit em).
// m occupies x≈44..836 with native side bearings; dot sits in the
// breathing room to the right at lowercase-period height.
const MARK_DOT_GAP = 60; // gap from m's advance to dot's left edge
const MARK_DOT_R = 70;
const MARK_DOT_CY = -85; // slightly above baseline, where a period would sit
const MARK_PAD_R = 50; // right padding past the dot
const MARK_PAD_TOP = 110; // padding above x-height
const MARK_PAD_BOT = 90; // padding below baseline

const MARK_MIN_X = 0;
const MARK_MIN_Y = -METRICS.xHeight - MARK_PAD_TOP; // -656
const MARK_DOT_CX = LETTERS.m.advance + MARK_DOT_GAP + MARK_DOT_R; // 1011
const MARK_VB_W = MARK_DOT_CX + MARK_DOT_R + MARK_PAD_R; // 1131
const MARK_VB_H = -MARK_MIN_Y + MARK_PAD_BOT; // 746

export const MapleMark = React.forwardRef<SVGSVGElement, MapleMarkProps>(
  function MapleMark({ size = 28, bare = false, className, style, ...rest }, ref) {
    const aspect = MARK_VB_W / MARK_VB_H;
    return (
      <svg
        ref={ref}
        height={size}
        width={Math.round(size * aspect)}
        viewBox={`${MARK_MIN_X} ${MARK_MIN_Y} ${MARK_VB_W} ${MARK_VB_H}`}
        role="img"
        aria-label="MapleRewards"
        className={cn("select-none", className)}
        style={style}
        {...rest}
      >
        <path d={LETTERS.m.d} fill="var(--ink)" />
        {!bare && (
          <circle
            cx={MARK_DOT_CX}
            cy={MARK_DOT_CY}
            r={MARK_DOT_R}
            fill="var(--accent)"
          />
        )}
      </svg>
    );
  }
);

/**
 * MapleWordmark — the global MapleRewards wordmark (header, footer, marketing).
 *
 * 'maple' in hand-vectored Inter Tight Bold paths, followed by a solid
 * maple-red cursor block at lowercase x-height. Pure SVG paths — renders
 * identically regardless of font load state.
 *
 * Accepts the original sm/md/lg/xl API; size prop controls cap-height
 * in CSS pixels (SVG scales proportionally from there).
 */

export interface MapleWordmarkProps extends React.SVGAttributes<SVGSVGElement> {
  size?: "sm" | "md" | "lg" | "xl";
  /** Drop the red cursor block — text-only variant. */
  bare?: boolean;
}

// Wordmark layout. Block sits flush to lowercase x-height, mirroring a
// terminal cursor. Block width is tuned to feel like one heavy letter.
const WORDMARK_BLOCK_GAP = 70;
const WORDMARK_BLOCK_W = 230;
const WORDMARK_BLOCK_H = METRICS.xHeight; // 546
const WORDMARK_PAD_R = 50;
const WORDMARK_PAD_TOP = 80;
const WORDMARK_PAD_BOT = 80;

const WORDMARK_MIN_X = 0;
const WORDMARK_MIN_Y = -METRICS.capHeight - WORDMARK_PAD_TOP; // covers ascender (l)
const WORDMARK_BLOCK_X = MAPLE_WIDTH + WORDMARK_BLOCK_GAP;
const WORDMARK_VB_W = WORDMARK_BLOCK_X + WORDMARK_BLOCK_W + WORDMARK_PAD_R;
const WORDMARK_VB_H = -WORDMARK_MIN_Y + (-METRICS.descent) + WORDMARK_PAD_BOT;

// Map sizes → cap-height in CSS pixels.
const SIZE_CAP_PX: Record<NonNullable<MapleWordmarkProps["size"]>, number> = {
  sm: 18,
  md: 24,
  lg: 34,
  xl: 50,
};

export const MapleWordmark = React.forwardRef<SVGSVGElement, MapleWordmarkProps>(
  function MapleWordmark(
    { size = "md", bare = false, className, style, ...rest },
    ref
  ) {
    const capPx = SIZE_CAP_PX[size];
    // Pixel scale: target cap-height (px) ÷ cap-height (em).
    const scale = capPx / METRICS.capHeight;
    const heightPx = WORDMARK_VB_H * scale;
    const widthPx = WORDMARK_VB_W * scale;

    return (
      <svg
        ref={ref}
        width={Math.round(widthPx)}
        height={Math.round(heightPx)}
        viewBox={`${WORDMARK_MIN_X} ${WORDMARK_MIN_Y} ${WORDMARK_VB_W} ${WORDMARK_VB_H}`}
        role="img"
        aria-label="MapleRewards"
        className={cn("select-none align-middle", className)}
        style={style}
        {...rest}
      >
        {MAPLE_POSITIONS.map(({ key, x }) => (
          <g key={key} transform={`translate(${x} 0)`}>
            <path d={LETTERS[key].d} fill="var(--ink)" />
          </g>
        ))}
        {!bare && (
          <rect
            x={WORDMARK_BLOCK_X}
            y={-METRICS.xHeight}
            width={WORDMARK_BLOCK_W}
            height={WORDMARK_BLOCK_H}
            fill="var(--accent)"
          />
        )}
      </svg>
    );
  }
);
