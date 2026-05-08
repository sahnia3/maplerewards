/* BriefCard — editorial brief tile.
 * Top accent rule (maple red), serif title, italic serif note, mono accent + footer.
 * Optional progress: 1px ruled track, accent fill, no rounded ends.
 */
import type { ReactNode } from "react";

export function BriefCard({
  eyebrow,
  title,
  serifNote,
  accent,
  footer,
  progress,
  href,
}: {
  eyebrow: string;
  title: ReactNode;
  serifNote: string;
  accent?: string;
  footer?: string;
  progress?: number; // 0-1
  href?: string;
}) {
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
              background: "var(--accent)",
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
          <span className="mono" style={{ fontSize: 11, color: "var(--accent)", letterSpacing: "0.04em" }}>
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

  if (href) {
    return (
      <a href={href} className="brief-card hover-lift" style={{ textDecoration: "none" }}>
        {Inner}
      </a>
    );
  }
  return <div className="brief-card hover-lift">{Inner}</div>;
}
