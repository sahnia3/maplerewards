/* BriefCard — editorial brief tile.
 * Top accent rule (varies by tone), serif title, italic serif note, mono accent + footer.
 * Optional progress: 1px ruled track, accent fill, no rounded ends.
 *
 * `tone` colors the top accent stripe so a row of brief cards reads as
 * scannable categories rather than one repeating maple band.
 *   - maple → spend opportunities (default)
 *   - teal  → category insights
 *   - gold  → milestones / status credits
 */
import type { ReactNode } from "react";

type BriefTone = "maple" | "teal" | "gold";

const TONE_VAR: Record<BriefTone, string> = {
  maple: "var(--accent)",
  teal: "var(--info-text)",
  gold: "var(--gold)",
};

export function BriefCard({
  eyebrow,
  title,
  serifNote,
  accent,
  footer,
  progress,
  href,
  tone = "maple",
}: {
  eyebrow: string;
  title: ReactNode;
  serifNote: string;
  accent?: string;
  footer?: string;
  progress?: number; // 0-1
  href?: string;
  tone?: BriefTone;
}) {
  const toneColor = TONE_VAR[tone];
  const Inner = (
    <>
      <div className="eyebrow" style={{ marginBottom: 14 }}>{eyebrow}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
        <span className="display" style={{ fontSize: 44, lineHeight: 1 }}>{title}</span>
      </div>
      <div
        className="serif"
        style={{
          fontSize: 17,
          color: "var(--ink-2)",
          fontStyle: "italic",
          marginBottom: "auto",
          lineHeight: 1.35,
        }}
      >
        {serifNote}
      </div>
      {progress !== undefined && (
        <div style={{ height: 2, background: "var(--rule)", marginTop: 16, position: "relative" }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              right: `${(1 - progress) * 100}%`,
              background: toneColor,
              transition: "right 1.2s cubic-bezier(0.2,0.7,0.2,1)",
            }}
          />
        </div>
      )}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 16,
          paddingTop: 12,
          borderTop: "1px solid var(--rule)",
        }}
      >
        {accent && (
          <span className="mono" style={{ fontSize: 11, color: toneColor, letterSpacing: "0.04em" }}>
            {accent}
          </span>
        )}
        {footer && (
          <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.04em" }}>
            {footer}
          </span>
        )}
      </div>
    </>
  );

  /* Inline override on .brief-card so the per-tone color wins over the
   * globals.css default of var(--accent) without forking the class. */
  const toneStyle: React.CSSProperties = { borderTopColor: toneColor };

  if (href) {
    return (
      <a href={href} className="brief-card hover-lift" style={{ textDecoration: "none", ...toneStyle }}>
        {Inner}
      </a>
    );
  }
  return <div className="brief-card hover-lift" style={toneStyle}>{Inner}</div>;
}
