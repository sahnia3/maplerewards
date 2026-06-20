"use client";

/* <Term> — first-use jargon tooltip.
 *
 *   <Term term="CPP">CPP</Term>   → wraps the given text
 *   <Term term="CPP" />           → renders the glossary label itself
 *
 * Accessible + dependency-free (no Radix/Floating-UI, no new npm deps):
 *   - subtle dotted underline marks the term as defined
 *   - reveals a plain-English definition on HOVER and keyboard FOCUS
 *   - touch-friendly: a tap toggles the tooltip (and closes on outside tap / Escape)
 *   - aria-describedby + role="tooltip" so screen readers announce the definition
 *
 * Editorial styling: cream/ink surface, hairline rule, small mono caption — the
 * same token vocabulary as the rest of the app (see app/globals.css).
 */

import * as React from "react";
import { lookupTerm } from "@/lib/glossary";

let termIdCounter = 0;

export function Term({
  term,
  k,
  children,
  className,
}: {
  /** Glossary key to look up (case/format tolerant). */
  term?: string;
  /** Back-compat alias for `term` — legacy call-sites pass `k="cpp"`. */
  k?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  // Accept either prop; `term` wins when both are passed.
  const lookupKey = term ?? k ?? "";
  const entry = lookupTerm(lookupKey);
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef<HTMLSpanElement>(null);

  // Stable, unique id for aria-describedby ↔ role="tooltip" pairing.
  const [tipId] = React.useState(() => `term-tip-${(termIdCounter += 1)}`);

  // Close on outside pointer / Escape so a tap-opened tooltip is dismissable.
  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Unknown term: render plain text, no affordance (keeps copy intact).
  if (!entry) {
    return <span className={className}>{children ?? lookupKey}</span>;
  }

  const label = children ?? entry.label;

  return (
    <span
      ref={wrapRef}
      style={{ position: "relative", display: "inline-block" }}
    >
      <button
        type="button"
        aria-describedby={open ? tipId : undefined}
        aria-expanded={open}
        className={className}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          // Tap toggles on touch; on a hover device the click is harmless.
          e.preventDefault();
          setOpen((v) => !v);
        }}
        style={{
          /* Inline, type-matching trigger — no button chrome. */
          appearance: "none",
          background: "transparent",
          border: 0,
          padding: 0,
          margin: 0,
          font: "inherit",
          color: "inherit",
          letterSpacing: "inherit",
          cursor: "help",
          /* The "this word is defined" affordance: subtle dotted underline. */
          textDecoration: "underline",
          textDecorationStyle: "dotted",
          textDecorationThickness: "1px",
          textUnderlineOffset: "0.18em",
          textDecorationColor: "var(--rule-strong)",
        }}
      >
        {label}
      </button>
      {open && (
        <span
          id={tipId}
          role="tooltip"
          style={{
            position: "absolute",
            zIndex: 50,
            bottom: "calc(100% + 8px)",
            left: 0,
            width: "max-content",
            maxWidth: 260,
            padding: "9px 12px",
            borderRadius: 10,
            border: "1px solid var(--rule)",
            background: "var(--surface)",
            color: "var(--ink-2)",
            boxShadow: "var(--shadow-2)",
            fontFamily: "var(--font-sans)",
            fontSize: 12.5,
            fontWeight: 500,
            lineHeight: 1.45,
            letterSpacing: "0.005em",
            textAlign: "left",
            whiteSpace: "normal",
            pointerEvents: "none",
          }}
        >
          <span
            className="mono"
            style={{
              display: "block",
              fontSize: 10,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--accent)",
              marginBottom: 4,
            }}
          >
            {entry.label}
          </span>
          {entry.definition}
        </span>
      )}
    </span>
  );
}
