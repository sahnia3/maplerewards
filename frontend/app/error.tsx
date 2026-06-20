"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * Route-segment error boundary. Next.js App Router renders this in place of a
 * page subtree when a render/effect throws, isolating the failure from the rest
 * of the app shell (the sidebar + nav still work). Receives the thrown error and
 * a `reset()` that re-renders the segment.
 *
 * No raw stack trace is shown — the error is reported to Sentry on mount and the
 * user sees a calm, on-brand recovery surface instead.
 * ───────────────────────────────────────────────────────────────────────────── */

import { useEffect } from "react";
import Link from "next/link";
import { reportError } from "@/lib/error-reporter";

export default function SegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, { surface: "route-segment", digest: error.digest });
  }, [error]);

  return (
    <div
      role="alert"
      style={{
        maxWidth: 560,
        margin: "0 auto",
        padding: "clamp(48px, 10vh, 96px) clamp(20px, 4vw, 40px)",
        textAlign: "center",
      }}
    >
      <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 14 }}>
        Something went sideways
      </div>
      <h1
        className="display"
        style={{ fontSize: "clamp(30px, 5vw, 44px)", lineHeight: 1.05, margin: "0 0 14px" }}
      >
        This page hit a snag.
      </h1>
      <p
        className="serif"
        style={{
          fontSize: 16,
          fontStyle: "italic",
          color: "var(--ink-2)",
          lineHeight: 1.55,
          margin: "0 0 28px",
        }}
      >
        The rest of Maple is still running — only this view stumbled. The error has been
        reported automatically. Try again, and if it keeps happening, email{" "}
        <a href="mailto:hello@maplerewards.app" style={{ color: "var(--accent)" }}>
          hello@maplerewards.app
        </a>
        .
      </p>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
        <button type="button" onClick={reset} className="btn btn-primary">
          Try again
        </button>
        <Link href="/" className="btn btn-ghost">
          Back home
        </Link>
      </div>
    </div>
  );
}
