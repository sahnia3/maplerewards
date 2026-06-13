"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getAeroplanJune2026Projection,
  type AeroplanProjection,
} from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";

/**
 * DevaluationBanner — Aeroplan June 1 2026 chart-hike urgency.
 *
 * Pro-only data; falls back to silence for free users and for users with no
 * Aeroplan balance. Time-anchored to a hard deadline, so it removes itself
 * once the date has passed (days_until < -7).
 *
 * Visual: warm cream substrate, maple-red accent rule, mono eyebrow with the
 * countdown, serif headline that reads as urgent without screaming. Mirrors
 * the editorial system already shipped in /wallet and /insights.
 */
export function DevaluationBanner({ sessionId }: { sessionId: string }) {
  const { isPro } = useAuth();
  const [data, setData] = useState<AeroplanProjection | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Pro-only endpoint: skip the request entirely for free users instead of
    // collecting a guaranteed 402 console error on every page load.
    if (!sessionId || !isPro) return;
    let cancelled = false;
    getAeroplanJune2026Projection(sessionId)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        // Transient failure — banner stays hidden.
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, isPro]);

  // Render gate: hide once dismissed, once the hike is more than a week old,
  // or when the user has no exposure (zero Aeroplan balance).
  if (!data || dismissed) return null;
  if (data.days_until < -7) return null;
  if (data.balance === 0) return null;

  const dollars = data.exposure.toFixed(2);
  const inPast = data.days_until <= 0;
  const daysLabel = inPast
    ? "Now in effect"
    : data.days_until === 1
      ? "1 day to go"
      : `${data.days_until} days to go`;

  return (
    <section
      style={{
        position: "relative",
        background: "var(--paper)",
        border: "1px solid var(--rule)",
        borderRadius: 12,
        padding: "20px 24px",
        marginBottom: 24,
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 16,
        alignItems: "center",
      }}
    >
      <div>
        <div
          className="eyebrow"
          style={{
            color: "var(--accent)",
            marginBottom: 8,
          }}
        >
          AEROPLAN · CHART HIKE · {daysLabel}
        </div>
        <div
          className="display"
          style={{
            fontSize: "clamp(20px, 2.4vw, 28px)",
            lineHeight: 1.2,
            marginBottom: 6,
          }}
        >
          {inPast ? (
            <>
              The Aeroplan chart hike{" "}
              <span style={{ fontStyle: "italic", color: "var(--accent)" }}>
                is now in effect
              </span>
              .
            </>
          ) : (
            <>
              You&rsquo;re{" "}
              <span style={{ fontStyle: "italic", color: "var(--accent)" }}>
                ${dollars}
              </span>{" "}
              exposed to the June 1 chart hike.
            </>
          )}
        </div>
        <div
          className="serif"
          style={{
            fontSize: 14,
            color: "var(--ink-2)",
            lineHeight: 1.45,
          }}
        >
          {data.headline}
          <span style={{ color: "var(--ink-3)", marginLeft: 6 }}>
            ({data.balance.toLocaleString()} pts · {data.cpp.toFixed(2)}
            ¢/pt · long-haul biz {Math.round(data.hike_percent * 100)}% more
            points after {data.effective_date})
          </span>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 8,
        }}
      >
        <Link
          href="/tools/aeroplan-june-1"
          className="mono"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 18px",
            borderRadius: 8,
            background: "var(--accent)",
            color: "#fff",
            textDecoration: "none",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          See what to lock in →
        </Link>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="mono"
          style={{
            background: "none",
            border: "none",
            color: "var(--ink-3)",
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            cursor: "pointer",
            padding: 4,
          }}
          aria-label="Dismiss banner"
        >
          Dismiss
        </button>
      </div>
    </section>
  );
}
