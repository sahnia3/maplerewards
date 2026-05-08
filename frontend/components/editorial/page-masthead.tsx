/* PageMasthead — shared editorial page header.
 * Eyebrow + Instrument Serif title (with optional accent + italic) + serif lede.
 * Right slot for a CTA. Bottom border = 1px ink rule.
 */
import type { ReactNode } from "react";

export function PageMasthead({
  eyebrow,
  eyebrowEnd,
  title,
  lede,
  cta,
  maxWidth = 560,
}: {
  eyebrow: string | string[];
  eyebrowEnd?: string;
  title: ReactNode;
  lede?: string | ReactNode;
  cta?: ReactNode;
  maxWidth?: number;
}) {
  const eyebrows = Array.isArray(eyebrow) ? eyebrow : [eyebrow];

  return (
    <header
      className="page-masthead"
      style={{
        borderBottom: "1px solid var(--rule)",
        paddingBottom: 28,
        marginBottom: 32,
        display: "grid",
        gridTemplateColumns: cta ? "1fr auto" : "1fr",
        alignItems: "end",
        gap: 24,
      }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          {eyebrows.map((e, i) => (
            <span key={i} className="eyebrow">{e}</span>
          ))}
          {eyebrowEnd && (
            <>
              <span className="mr-kicker-line" style={{ maxWidth: 100 }} />
              <span className="eyebrow">{eyebrowEnd}</span>
            </>
          )}
        </div>
        <h1
          className="display page-masthead-title"
          style={{
            fontSize: "clamp(36px, 4.5vw, 52px)",
            margin: 0,
            letterSpacing: "-0.015em",
            lineHeight: 0.96,
          }}
        >
          {title}
        </h1>
        {lede && (
          <p
            className="serif"
            style={{
              fontSize: 17,
              fontStyle: "italic",
              color: "var(--ink-2)",
              marginTop: 14,
              maxWidth,
              lineHeight: 1.45,
            }}
          >
            {lede}
          </p>
        )}
      </div>
      {cta && <div>{cta}</div>}
    </header>
  );
}
