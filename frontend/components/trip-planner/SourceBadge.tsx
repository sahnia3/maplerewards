"use client";

/* SourceBadge — pricing trust indicator on each award row.
 *
 * Three explicit states map to the backend `source` field:
 *   live        → green dot + "Priced N min ago via {label}"
 *   estimated   → amber pill "estimate" + tooltip warning
 *   live_search → gray pill "web"      + tooltip provenance note
 *
 * Tooltip uses the native `title` attribute for accessibility + zero deps.
 */

import { useEffect, useState } from "react";

type SourceKind = "live" | "estimated" | "live_search";

interface SourceBadgeProps {
  source: SourceKind;
  label?: string;
  fetchedAt?: string; // RFC3339
}

function minutesAgo(rfc3339?: string): number | null {
  if (!rfc3339) return null;
  const t = Date.parse(rfc3339);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 60_000));
}

export function SourceBadge({ source, label, fetchedAt }: SourceBadgeProps) {
  // Re-render every 60s so "5 min ago" stays current without polling state.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  if (source === "live") {
    const mins = minutesAgo(fetchedAt);
    const freshness =
      mins == null ? "just now" : mins === 0 ? "just now" : `${mins} min ago`;
    const via = label ? ` via ${label}` : "";
    return (
      <span
        className="mono"
        title={`Live pricing${via} · fetched ${freshness}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 10,
          color: "var(--ink-3)",
          letterSpacing: "0.04em",
          textTransform: "none",
          fontStyle: "normal",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--gain)",
            display: "inline-block",
          }}
        />
        <span>
          Priced {freshness}
          {via}
        </span>
      </span>
    );
  }

  if (source === "estimated") {
    return (
      <span
        className="mono"
        title="Zone fallback. Confirm with the airline before booking."
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: 9,
          padding: "2px 7px",
          borderRadius: 999,
          background: "rgba(217, 119, 6, 0.12)",
          color: "rgb(180, 83, 9)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          border: "1px solid rgba(217, 119, 6, 0.4)",
        }}
      >
        estimate
      </span>
    );
  }

  // live_search
  return (
    <span
      className="mono"
      title="Pulled from public sources."
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 9,
        padding: "2px 7px",
        borderRadius: 999,
        background: "var(--surface-2)",
        color: "var(--ink-3)",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        border: "1px solid var(--rule)",
      }}
    >
      web
    </span>
  );
}
