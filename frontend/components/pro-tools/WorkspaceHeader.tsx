"use client";

import type { ReactNode } from "react";

/* ─────────────────────────────────────────────────────────────────────────────
 * WorkspaceHeader — per-workspace breadcrumb + masthead.
 *
 * Renders the "Pro Tools / <name>" breadcrumb with a hairline rule and a
 * "← All tools" button that clears the ?ws query param, then an eyebrow
 * ("Pro tools · <name> · N tools"), H1, and serif lede. Shared by all four
 * workspace views so they read identically.
 * ───────────────────────────────────────────────────────────────────────────── */

interface Props {
  name: string;
  count: number;
  title: ReactNode;
  lede: string;
  onAllTools: () => void;
}

export function WorkspaceHeader({ name, count, title, lede, onAllTools }: Props) {
  return (
    <>
      <nav style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, fontSize: 12 }}>
        <button
          type="button"
          onClick={onAllTools}
          className="mono"
          style={{ background: "transparent", border: "none", color: "var(--ink-3)", letterSpacing: "0.06em", cursor: "pointer", padding: 0 }}
        >
          Pro Tools
        </button>
        <span style={{ color: "var(--ink-4)" }}>/</span>
        <span className="mono" style={{ color: "var(--ink)", letterSpacing: "0.06em" }}>{name}</span>
        <span style={{ flex: 1, height: 1, background: "var(--rule)", margin: "0 4px" }} />
        <button
          type="button"
          onClick={onAllTools}
          className="mono"
          style={{
            background: "transparent",
            border: "1px solid var(--rule-strong)",
            borderRadius: 999,
            color: "var(--ink-2)",
            padding: "6px 14px",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          ← All tools
        </button>
      </nav>

      <span className="eyebrow" style={{ color: "var(--accent)" }}>
        Pro tools · {name} · {count} tools
      </span>
      <h1
        className="display"
        style={{ fontSize: "clamp(36px, 4.4vw, 54px)", lineHeight: 0.96, letterSpacing: "-0.015em", margin: "12px 0 14px" }}
      >
        {title}
      </h1>
      <p
        className="serif"
        style={{ fontSize: 16, lineHeight: 1.5, color: "var(--ink-2)", fontStyle: "italic", margin: "0 0 26px", maxWidth: 620 }}
      >
        {lede}
      </p>
    </>
  );
}
