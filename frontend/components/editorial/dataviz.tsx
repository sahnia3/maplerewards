"use client";

/**
 * Editorial data-visualization primitives for the MapleRewards redesign.
 *
 * These are GENERIC, prop-driven, presentational components shared by the Home,
 * Pro Tools, and Maple AI page rebuilds. They faithfully replicate the
 * prototype's SVG technique (stacked arcs on a track, stroke-dashoffset draw-in,
 * vertical-gradient area fills, scaleX/scaleY bar growth, dashed flow arrows).
 *
 * Animation is driven entirely by the `.mr-*` classes already defined in
 * app/globals.css. Each animated element carries the `both` fill mode (baked
 * into those classes), so the FINAL visible state is also the SSR / first-paint
 * state — nothing ever blanks. All `.mr-*` classes are reduced-motion-gated
 * globally (they snap to the final frame), so these components are
 * reduced-motion-aware without any JS.
 *
 * Colors come from CSS custom properties (var(--accent) etc). No hardcoded hex.
 */

import type { CSSProperties, ReactNode } from "react";

/* ──────────────────────────────────────────────────────────────────────────
 * Shared helpers
 * ────────────────────────────────────────────────────────────────────────── */

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function clampPct(pct: number): number {
  if (Number.isNaN(pct)) return 0;
  return Math.max(0, Math.min(100, pct));
}

/** A fresh defs id per render so multiple gradients on a page never collide. */
let gradientSeq = 0;
function nextGradientId(prefix: string): string {
  gradientSeq += 1;
  return `${prefix}-${gradientSeq}`;
}

const TAU = Math.PI * 2;

/* ──────────────────────────────────────────────────────────────────────────
 * RadialGauge — stacked arcs on a track (Home wallet gauge / Forensics ring)
 *
 * A track ring + an optional translucent "ceiling" / sweet-spot arc + the
 * animated value arc, all sharing the same radius. Center label + sub, optional
 * footer split. Mirrors the prototype's r=74 / stroke-width=14 / rotate(-90)
 * gauge (circumference ~465).
 * ────────────────────────────────────────────────────────────────────────── */

export interface RadialGaugeFooterItem {
  label: string;
  value: string;
  /** CSS color (e.g. "var(--gold)"). Defaults to --ink. */
  color?: string;
  align?: "left" | "right";
}

export interface RadialGaugeProps {
  /** Value arc fraction, 0..max (or 0..100 when max omitted). */
  value: number;
  /** Optional translucent ceiling/sweet-spot arc fraction, 0..max. */
  ceiling?: number;
  /** Scale for value/ceiling. Defaults to 100 (treat inputs as percentages). */
  max?: number;
  /** Outer SVG box size in px. Default 180. */
  size?: number;
  /** Ring stroke width. Defaults to a proportional ~14 at size 180. */
  strokeWidth?: number;
  /** Big center figure (e.g. "$1,240" or "38%"). */
  centerValue: ReactNode;
  /** Mono sub-label under the figure (e.g. "BASE CPP"). */
  centerLabel?: string;
  /** Value-arc color. Default var(--accent). */
  color?: string;
  /** Ceiling-arc color. Default var(--gold). */
  ceilingColor?: string;
  /** Footer split rendered below the gauge with a hairline top border. */
  footer?: RadialGaugeFooterItem[];
  /** Stagger the value arc's draw-in. */
  animationDelay?: string;
  className?: string;
  style?: CSSProperties;
}

export function RadialGauge({
  value,
  ceiling,
  max = 100,
  size = 180,
  strokeWidth,
  centerValue,
  centerLabel,
  color = "var(--accent)",
  ceilingColor = "var(--gold)",
  footer,
  animationDelay,
  className,
  style,
}: RadialGaugeProps) {
  const sw = strokeWidth ?? Math.round(size * 0.078); // ~14 at 180
  const cxy = size / 2;
  const r = cxy - sw / 2 - 1;
  const circ = TAU * r;

  const valueFrac = max > 0 ? clampPct((value / max) * 100) / 100 : 0;
  const ceilFrac = ceiling != null && max > 0 ? clampPct((ceiling / max) * 100) / 100 : 0;

  const valueLen = circ * valueFrac;
  const ceilLen = circ * ceilFrac;

  // Big-figure sizing scales with the box.
  const figureSize = Math.round(size * 0.167); // 30 at 180
  const subSize = Math.max(8, Math.round(size * 0.056)); // 10 at 180
  const figureY = cxy - size * 0.033;
  const subY = cxy + size * 0.078;

  return (
    <div className={cx("flex flex-col", className)} style={style}>
      <div style={{ display: "flex", justifyContent: "center", position: "relative" }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* track */}
          <circle cx={cxy} cy={cxy} r={r} fill="none" stroke="var(--rule)" strokeWidth={sw} />
          {/* translucent ceiling / sweet-spot arc (static) */}
          {ceiling != null ? (
            <circle
              cx={cxy}
              cy={cxy}
              r={r}
              fill="none"
              stroke={ceilingColor}
              strokeWidth={sw}
              strokeLinecap="round"
              strokeDasharray={`${ceilLen} ${circ}`}
              transform={`rotate(-90 ${cxy} ${cxy})`}
              opacity={0.3}
            />
          ) : null}
          {/* animated value arc — draws dashoffset --len → 0 */}
          <circle
            className="mr-draw-in"
            cx={cxy}
            cy={cxy}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeDasharray={`${valueLen} ${circ}`}
            transform={`rotate(-90 ${cxy} ${cxy})`}
            style={{ ["--len" as string]: valueLen, animationDelay }}
          />
          {centerValue != null ? (
            <text
              x={cxy}
              y={figureY}
              textAnchor="middle"
              className="display"
              fill="var(--ink)"
              style={{ fontSize: figureSize }}
            >
              {centerValue}
            </text>
          ) : null}
          {centerLabel ? (
            <text
              x={cxy}
              y={subY}
              textAnchor="middle"
              className="mono"
              fill="var(--ink-3)"
              style={{ fontSize: subSize, letterSpacing: "0.12em" }}
            >
              {centerLabel}
            </text>
          ) : null}
        </svg>
      </div>
      {footer && footer.length > 0 ? (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 14,
            paddingTop: 14,
            borderTop: "1px solid var(--rule)",
          }}
        >
          {footer.map((item, i) => (
            <div key={i} style={{ textAlign: item.align ?? (i === footer.length - 1 ? "right" : "left") }}>
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.08em" }}>
                {item.label}
              </div>
              <div className="display" style={{ fontSize: 20, color: item.color ?? "var(--ink)" }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * ProgressRing — single % arc with center percentage (value-capture ring)
 *
 * Mirrors the prototype's r=33 / stroke-width=9 84×84 "38% CAPTURED" ring
 * (circumference ~207).
 * ────────────────────────────────────────────────────────────────────────── */

export interface ProgressRingProps {
  /** Percentage 0..100. */
  pct: number;
  /** SVG box size in px. Default 84. */
  size?: number;
  strokeWidth?: number;
  /** Arc color. Default var(--accent). */
  color?: string;
  /** Mono sub-label under the percentage (e.g. "CAPTURED"). */
  label?: string;
  /** Override the center figure (defaults to "{pct}%"). */
  centerValue?: ReactNode;
  animationDelay?: string;
  className?: string;
  style?: CSSProperties;
}

export function ProgressRing({
  pct,
  size = 84,
  strokeWidth,
  color = "var(--accent)",
  label,
  centerValue,
  animationDelay,
  className,
  style,
}: ProgressRingProps) {
  const sw = strokeWidth ?? Math.round(size * 0.107); // ~9 at 84
  const cxy = size / 2;
  const r = cxy - sw / 2 - 1;
  const circ = TAU * r;
  const frac = clampPct(pct) / 100;
  const len = circ * frac;

  const figureSize = Math.max(12, Math.round(size * 0.226)); // ~19 at 84
  const subSize = Math.max(7, Math.round(size * 0.095)); // ~8 at 84
  const hasLabel = Boolean(label);
  const figureY = hasLabel ? cxy - size * 0.036 : cxy + figureSize * 0.34;
  const subY = cxy + size * 0.143;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      style={{ flexShrink: 0, ...style }}
    >
      <circle cx={cxy} cy={cxy} r={r} fill="none" stroke="var(--rule)" strokeWidth={sw} />
      <circle
        className="mr-draw-in"
        cx={cxy}
        cy={cxy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeDasharray={`${len} ${circ}`}
        transform={`rotate(-90 ${cxy} ${cxy})`}
        style={{ ["--len" as string]: len, animationDelay }}
      />
      <text
        x={cxy}
        y={figureY}
        textAnchor="middle"
        className="display"
        fill="var(--ink)"
        style={{ fontSize: figureSize }}
      >
        {centerValue ?? `${Math.round(clampPct(pct))}%`}
      </text>
      {hasLabel ? (
        <text
          x={cxy}
          y={subY}
          textAnchor="middle"
          className="mono"
          fill="var(--ink-3)"
          style={{ fontSize: subSize, letterSpacing: "0.08em" }}
        >
          {label}
        </text>
      ) : null}
    </svg>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Donut — donut with one highlighted segment + center % (credits "unclaimed")
 *
 * Mirrors the prototype's gold "66%" donut (r=33 stroke-width=10, dasharray
 * "137 207"): the highlighted segment is the only colored stroke on the track.
 * ────────────────────────────────────────────────────────────────────────── */

export interface DonutProps {
  /** Highlighted-segment percentage 0..100. */
  pct: number;
  /** Segment color. Default var(--gold). */
  color?: string;
  /** SVG box size in px. Default 86. */
  size?: number;
  strokeWidth?: number;
  /** Center figure. Defaults to "{pct}%". */
  centerLabel?: ReactNode;
  /** Optional second center line (smaller, --ink-3). */
  centerSub?: string;
  animationDelay?: string;
  className?: string;
  style?: CSSProperties;
}

export function Donut({
  pct,
  color = "var(--gold)",
  size = 86,
  strokeWidth,
  centerLabel,
  centerSub,
  animationDelay,
  className,
  style,
}: DonutProps) {
  const sw = strokeWidth ?? Math.round(size * 0.116); // ~10 at 86
  const cxy = size / 2;
  const r = cxy - sw / 2 - 1;
  const circ = TAU * r;
  const len = circ * (clampPct(pct) / 100);

  const figureSize = Math.max(12, Math.round(size * 0.21)); // ~18 at 86
  const subSize = Math.max(7, Math.round(size * 0.093));
  const figureY = centerSub ? cxy : cxy + figureSize * 0.34;
  const subY = cxy + size * 0.16;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      style={{ flexShrink: 0, ...style }}
    >
      <circle cx={cxy} cy={cxy} r={r} fill="none" stroke="var(--rule)" strokeWidth={sw} />
      <circle
        className="mr-draw-in"
        cx={cxy}
        cy={cxy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeDasharray={`${len} ${circ}`}
        transform={`rotate(-90 ${cxy} ${cxy})`}
        style={{ ["--len" as string]: len, animationDelay }}
      />
      <text
        x={cxy}
        y={figureY}
        textAnchor="middle"
        className="display"
        fill="var(--ink)"
        style={{ fontSize: figureSize }}
      >
        {centerLabel ?? `${Math.round(clampPct(pct))}%`}
      </text>
      {centerSub ? (
        <text
          x={cxy}
          y={subY}
          textAnchor="middle"
          className="mono"
          fill="var(--ink-3)"
          style={{ fontSize: subSize, letterSpacing: "0.08em" }}
        >
          {centerSub}
        </text>
      ) : null}
    </svg>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Smooth-path helpers (shared by AreaChart + LineChart)
 *
 * Builds a Catmull-Rom → cubic-bezier path through the points, matching the
 * prototype's bezier area-chart curve. Coordinates are in the SVG's 600×height
 * user space; the SVG itself stretches via preserveAspectRatio="none".
 * ────────────────────────────────────────────────────────────────────────── */

const CHART_W = 600;

function toXY(points: number[], height: number, pad: number): Array<{ x: number; y: number }> {
  const n = points.length;
  if (n === 0) return [];
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const top = pad;
  const bottom = height - pad;
  return points.map((p, i) => {
    const x = n === 1 ? CHART_W / 2 : (i / (n - 1)) * CHART_W;
    const y = bottom - ((p - min) / span) * (bottom - top);
    return { x, y };
  });
}

function smoothLinePath(pts: Array<{ x: number; y: number }>): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return d;
}

/** Rough polyline length, used to seed stroke-dasharray / --len. */
function pathLength(pts: Array<{ x: number; y: number }>): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  // ×1.15 fudge for bezier curvature so the draw never reveals early.
  return Math.max(1, Math.round(len * 1.15));
}

/* ──────────────────────────────────────────────────────────────────────────
 * AreaChart — vertical-gradient fill + drawn line + end dot + x labels
 * ────────────────────────────────────────────────────────────────────────── */

export interface AreaChartProps {
  /** Series values (y). At least 2 for a line. */
  points: number[];
  /** Mono x-axis labels under the chart. */
  labels?: string[];
  /** Line + gradient color. Default var(--accent). */
  color?: string;
  /** Rendered pixel height. Default 170. */
  height?: number;
  /** Number of hairline gridlines. Default 3. */
  gridlines?: number;
  /** Draw the end dot. Default true. */
  endDot?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function AreaChart({
  points,
  labels,
  color = "var(--accent)",
  height = 170,
  gridlines = 3,
  endDot = true,
  className,
  style,
}: AreaChartProps) {
  const vbH = 180;
  const pad = 22;
  const pts = toXY(points, vbH, pad);
  const linePath = smoothLinePath(pts);
  const areaPath =
    pts.length > 0
      ? `${linePath} L${pts[pts.length - 1].x},${vbH} L${pts[0].x},${vbH} Z`
      : "";
  const len = pathLength(pts);
  const gid = nextGradientId("mr-area");
  const last = pts[pts.length - 1];

  return (
    <div className={className} style={style}>
      <svg
        viewBox={`0 0 ${CHART_W} ${vbH}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height, display: "block" }}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.30" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {Array.from({ length: gridlines }).map((_, i) => {
          const y = ((i + 1) / (gridlines + 1)) * vbH;
          return <line key={i} x1="0" y1={y} x2={CHART_W} y2={y} stroke="var(--rule)" strokeWidth={1} />;
        })}
        {areaPath ? (
          <path
            className="mr-fade-in"
            d={areaPath}
            fill={`url(#${gid})`}
            style={{ animationDelay: "0.4s", animationDuration: "1.2s" }}
          />
        ) : null}
        {linePath ? (
          <path
            className="mr-draw-in"
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ ["--len" as string]: len, animationDuration: "1.8s" }}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {endDot && last ? (
          <circle
            className="mr-fade-in"
            cx={last.x}
            cy={last.y}
            r={4.5}
            fill={color}
            style={{ animationDelay: "1.5s", animationDuration: "0.4s" }}
          />
        ) : null}
      </svg>
      {labels && labels.length > 0 ? (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
          {labels.map((l, i) => (
            <span key={i} className="mono" style={{ fontSize: 10, color: "var(--ink-4)", letterSpacing: "0.08em" }}>
              {l}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * LineChart — thin drawn line (no fill) for trend / break-even lines
 * ────────────────────────────────────────────────────────────────────────── */

export interface LineChartProps {
  points: number[];
  labels?: string[];
  color?: string;
  height?: number;
  /** Stroke width. Default 2. */
  strokeWidth?: number;
  /** Render as a dashed line (break-even reference). */
  dashed?: boolean;
  gridlines?: number;
  endDot?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function LineChart({
  points,
  labels,
  color = "var(--accent)",
  height = 140,
  strokeWidth = 2,
  dashed = false,
  gridlines = 2,
  endDot = false,
  className,
  style,
}: LineChartProps) {
  const vbH = 160;
  const pad = 16;
  const pts = toXY(points, vbH, pad);
  const linePath = smoothLinePath(pts);
  const len = pathLength(pts);
  const last = pts[pts.length - 1];

  return (
    <div className={className} style={style}>
      <svg
        viewBox={`0 0 ${CHART_W} ${vbH}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height, display: "block" }}
      >
        {Array.from({ length: gridlines }).map((_, i) => {
          const y = ((i + 1) / (gridlines + 1)) * vbH;
          return <line key={i} x1="0" y1={y} x2={CHART_W} y2={y} stroke="var(--rule)" strokeWidth={1} />;
        })}
        {linePath ? (
          <path
            className="mr-draw-in"
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={dashed ? "6 6" : undefined}
            style={{ ["--len" as string]: len, animationDuration: "1.6s" }}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {endDot && last ? <circle cx={last.x} cy={last.y} r={4} fill={color} className="mr-fade-in" /> : null}
      </svg>
      {labels && labels.length > 0 ? (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
          {labels.map((l, i) => (
            <span key={i} className="mono" style={{ fontSize: 10, color: "var(--ink-4)", letterSpacing: "0.08em" }}>
              {l}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * CoverageBars — labeled rows with a track + animated scaleX fill + caption
 *
 * Mirrors the Home "Where your rewards come from" panel: grid 90px 1fr 150px,
 * 10px rounded track, staggered mr-grow-x fills.
 * ────────────────────────────────────────────────────────────────────────── */

export interface CoverageRow {
  label: string;
  /** Fill percentage 0..100. */
  pct: number;
  /** Fill color (e.g. "var(--accent)"). */
  color?: string;
  /** Right-aligned caption — string or rich node. */
  caption?: ReactNode;
}

export interface CoverageBarsProps {
  rows: CoverageRow[];
  /** Bar track height. Default 10. */
  barHeight?: number;
  /** Per-row stagger in seconds. Default 0.08. */
  stagger?: number;
  /** Label column width in px. Default 90. */
  labelWidth?: number;
  /** Caption column width in px. Default 150. */
  captionWidth?: number;
  className?: string;
  style?: CSSProperties;
}

export function CoverageBars({
  rows,
  barHeight = 10,
  stagger = 0.08,
  labelWidth = 90,
  captionWidth = 150,
  className,
  style,
}: CoverageBarsProps) {
  return (
    <div
      className={className}
      style={{ display: "flex", flexDirection: "column", gap: 13, ...style }}
    >
      {rows.map((row, i) => (
        <div
          key={i}
          style={{
            display: "grid",
            gridTemplateColumns: `${labelWidth}px 1fr ${captionWidth}px`,
            alignItems: "center",
            gap: 14,
          }}
        >
          <span className="mono" style={{ fontSize: 12, color: "var(--ink-2)", letterSpacing: "0.04em" }}>
            {row.label}
          </span>
          <div
            style={{
              height: barHeight,
              borderRadius: 99,
              background: "var(--rule)",
              overflow: "hidden",
            }}
          >
            <div
              className="mr-grow-x-in"
              style={{
                height: "100%",
                width: `${clampPct(row.pct)}%`,
                borderRadius: 99,
                background: row.color ?? "var(--accent)",
                animationDelay: `${0.05 + i * stagger}s`,
              }}
            />
          </div>
          <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)", textAlign: "right" }}>
            {row.caption}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * NetValueBar — horizontal diverging bar chart from a center baseline
 *
 * Positive values extend right in --gain, negatives left in --loss, off a
 * shared vertical baseline. Mirrors the Forensics card-value scorecard SVG.
 * ────────────────────────────────────────────────────────────────────────── */

export interface NetValueItem {
  label: string;
  /** Signed value; sign decides direction, magnitude decides length. */
  value: number;
  /** Pre-formatted display string (e.g. "+$612"). Defaults to the value. */
  display?: string;
}

export interface NetValueBarProps {
  items: NetValueItem[];
  /** Rendered pixel height. Default auto from item count. */
  height?: number;
  /** Color for positive bars. Default var(--gain). */
  positiveColor?: string;
  /** Color for negative bars. Default var(--loss). */
  negativeColor?: string;
  className?: string;
  style?: CSSProperties;
}

export function NetValueBar({
  items,
  height,
  positiveColor = "var(--gain)",
  negativeColor = "var(--loss)",
  className,
  style,
}: NetValueBarProps) {
  const W = 600;
  const rowH = 36;
  const barH = 20;
  const n = items.length;
  const H = height ?? Math.max(1, n) * rowH + 8;

  // Baseline x: leave room on the left for labels; negatives extend left of it.
  const baselineX = 150;
  const maxPos = Math.max(0, ...items.map((it) => (it.value > 0 ? it.value : 0)));
  const maxNeg = Math.max(0, ...items.map((it) => (it.value < 0 ? -it.value : 0)));
  const posSpace = W - baselineX - 60; // reserve label space on the right
  const negSpace = baselineX - 16;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      style={{ width: "100%", height: "auto", display: "block", ...style }}
    >
      <line x1={baselineX} y1={4} x2={baselineX} y2={H - 4} stroke="var(--rule-strong)" strokeWidth={1} />
      {items.map((it, i) => {
        const rowTop = i * rowH + 7;
        const barY = rowTop;
        const textY = rowTop + barH * 0.75;
        const positive = it.value >= 0;
        const color = positive ? positiveColor : negativeColor;
        const frac = positive
          ? maxPos > 0
            ? it.value / maxPos
            : 0
          : maxNeg > 0
            ? -it.value / maxNeg
            : 0;
        const barLen = Math.max(2, frac * (positive ? posSpace : negSpace));
        const rectX = positive ? baselineX : baselineX - barLen;
        const disp = it.display ?? (positive ? `+$${it.value}` : `−$${Math.abs(it.value)}`);
        const labelTextY = rowTop + barH * 0.75;
        return (
          <g key={i}>
            <text x={8} y={labelTextY} fill="var(--ink-2)" style={{ fontSize: 13 }}>
              {it.label}
            </text>
            <rect
              className="mr-grow-x-in"
              x={rectX}
              y={barY}
              width={barLen}
              height={barH}
              rx={4}
              fill={color}
              style={{
                transformOrigin: positive ? `${rectX}px center` : `${baselineX}px center`,
                animationDelay: `${i * 0.08}s`,
              }}
            />
            <text
              x={positive ? rectX + barLen + 8 : rectX - 8}
              y={textY}
              textAnchor={positive ? "start" : "end"}
              fill={color}
              className="mono"
              style={{ fontSize: 13, fontWeight: 600 }}
            >
              {disp}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * MiniFlowArrow — [chip] → dashed animated arrow → [chip]
 *
 * Mirrors the Home "best move" DINING → COBALT flow.
 * ────────────────────────────────────────────────────────────────────────── */

export interface MiniFlowArrowProps {
  from: ReactNode;
  to: ReactNode;
  /** Arrow + dash color. Default var(--accent). */
  color?: string;
  /** Arrow svg width. Default 60. */
  arrowWidth?: number;
  className?: string;
  style?: CSSProperties;
}

export function MiniFlowArrow({
  from,
  to,
  color = "var(--accent)",
  arrowWidth = 60,
  className,
  style,
}: MiniFlowArrowProps) {
  return (
    <div className={className} style={{ display: "flex", alignItems: "center", gap: 0, ...style }}>
      {from}
      <svg
        width={arrowWidth}
        height={20}
        viewBox={`0 0 ${arrowWidth} 20`}
        style={{ flexShrink: 0 }}
        aria-hidden="true"
      >
        <line
          className="mr-dash-flow"
          x1={2}
          y1={10}
          x2={arrowWidth - 2}
          y2={10}
          stroke={color}
          strokeWidth={2}
          strokeDasharray="5 5"
        />
        <polygon
          points={`${arrowWidth - 8},5 ${arrowWidth},10 ${arrowWidth - 8},15`}
          fill={color}
        />
      </svg>
      {to}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Sparkline — tiny inline line or bar sparkline for stat tiles
 * ────────────────────────────────────────────────────────────────────────── */

export interface SparklineProps {
  values: number[];
  kind?: "line" | "bar";
  color?: string;
  width?: number;
  height?: number;
  /** Animate the line draw / bar growth. Default true. */
  animate?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function Sparkline({
  values,
  kind = "line",
  color = "var(--accent)",
  width = 96,
  height = 28,
  animate = true,
  className,
  style,
}: SparklineProps) {
  const n = values.length;
  const pad = 3;
  const min = n > 0 ? Math.min(...values) : 0;
  const max = n > 0 ? Math.max(...values) : 1;
  const span = max - min || 1;
  const innerH = height - pad * 2;

  if (kind === "bar") {
    const gap = 2;
    const barW = n > 0 ? (width - gap * (n - 1)) / n : 0;
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={className}
        style={{ display: "block", ...style }}
        aria-hidden="true"
      >
        {values.map((v, i) => {
          const h = Math.max(1, ((v - min) / span) * innerH);
          const x = i * (barW + gap);
          const y = height - pad - h;
          return (
            <rect
              key={i}
              className={animate ? "mr-grow-y-in" : undefined}
              x={x}
              y={y}
              width={Math.max(1, barW)}
              height={h}
              rx={1}
              fill={color}
              style={animate ? { transformOrigin: `center ${height - pad}px`, animationDelay: `${i * 0.04}s` } : undefined}
            />
          );
        })}
      </svg>
    );
  }

  const pts =
    n === 0
      ? []
      : values.map((v, i) => ({
          x: n === 1 ? width / 2 : pad + (i / (n - 1)) * (width - pad * 2),
          y: height - pad - ((v - min) / span) * innerH,
        }));
  const d = smoothLinePath(pts);
  const len = pathLength(pts);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      style={{ display: "block", ...style }}
      aria-hidden="true"
    >
      {d ? (
        <path
          className={animate ? "mr-draw-in" : undefined}
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={animate ? { ["--len" as string]: len } : undefined}
        />
      ) : null}
    </svg>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * ProgressBar — generic horizontal progress with optional threshold marker
 *
 * Mirrors the SQC / welcome-bonus / PC Optimum bars. On-track vs tight color is
 * up to the caller via `color`; a threshold marker draws a hairline tick.
 * ────────────────────────────────────────────────────────────────────────── */

export interface ProgressBarProps {
  /** Fill percentage 0..100. */
  pct: number;
  /** Fill color. Default var(--accent). */
  color?: string;
  /** Track height. Default 10. */
  height?: number;
  /** Optional threshold marker at this percentage (0..100). */
  threshold?: number;
  /** Threshold tick color. Default var(--ink). */
  thresholdColor?: string;
  /** Optional mono caption rendered under the bar. */
  label?: ReactNode;
  animationDelay?: string;
  className?: string;
  style?: CSSProperties;
}

export function ProgressBar({
  pct,
  color = "var(--accent)",
  height = 10,
  threshold,
  thresholdColor = "var(--ink)",
  label,
  animationDelay,
  className,
  style,
}: ProgressBarProps) {
  return (
    <div className={className} style={style}>
      <div
        style={{
          position: "relative",
          height,
          borderRadius: 99,
          background: "var(--rule)",
          overflow: "hidden",
        }}
      >
        <div
          className="mr-grow-x-in"
          style={{
            height: "100%",
            width: `${clampPct(pct)}%`,
            borderRadius: 99,
            background: color,
            animationDelay,
          }}
        />
        {threshold != null ? (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: -2,
              bottom: -2,
              left: `${clampPct(threshold)}%`,
              width: 2,
              background: thresholdColor,
              opacity: 0.7,
            }}
          />
        ) : null}
      </div>
      {label ? (
        <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 8 }}>
          {label}
        </div>
      ) : null}
    </div>
  );
}
