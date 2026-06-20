"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * Root-layout error catcher. This is the last line of defense: Next.js renders
 * global-error.tsx when the root layout itself (or a provider above the page
 * tree) throws, so it must render its OWN <html> + <body> — the broken root
 * layout is replaced entirely, no app chrome is available.
 *
 * Inline styles only: the global stylesheet may not have loaded if the root
 * layout failed before injecting it, so we can't rely on the editorial token
 * classes here. We hardcode the cream/ink/maple palette to stay on-brand.
 * ───────────────────────────────────────────────────────────────────────────── */

import { useEffect } from "react";
import { reportError } from "@/lib/error-reporter";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, { surface: "global-error", digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#FBF7EE",
          color: "#1A1410",
          fontFamily:
            "var(--font-sans-src), 'Inter', system-ui, sans-serif",
          WebkitFontSmoothing: "antialiased",
        }}
      >
        <div
          role="alert"
          style={{
            maxWidth: 520,
            padding: "48px clamp(24px, 5vw, 40px)",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 12,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              fontWeight: 600,
              color: "#A51F2D",
              marginBottom: 16,
            }}
          >
            Something went sideways
          </div>
          <h1
            style={{
              fontFamily:
                "var(--font-display-src), 'GT Sectra', Georgia, serif",
              fontSize: "clamp(32px, 6vw, 48px)",
              fontWeight: 400,
              lineHeight: 1.04,
              letterSpacing: "-0.015em",
              margin: "0 0 16px",
            }}
          >
            Maple needs a reload.
          </h1>
          <p
            style={{
              fontSize: 16,
              fontStyle: "italic",
              color: "#3A3128",
              lineHeight: 1.55,
              margin: "0 0 30px",
            }}
          >
            Something failed while loading the app. The error has been reported
            automatically. Reloading usually fixes it — if it doesn&rsquo;t, email{" "}
            <a href="mailto:hello@maplerewards.app" style={{ color: "#A51F2D" }}>
              hello@maplerewards.app
            </a>
            .
          </p>
          <div
            style={{
              display: "flex",
              gap: 12,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                height: 44,
                padding: "0 22px",
                borderRadius: 8,
                border: "1px solid #A51F2D",
                background: "#A51F2D",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: "0.04em",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- global-error replaces the root layout; a hard <a> navigation is the correct recovery (router/Link context may be unavailable). */}
            <a
              href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: 44,
                padding: "0 22px",
                borderRadius: 8,
                border: "1px solid rgba(26, 20, 16, 0.24)",
                background: "transparent",
                color: "#1A1410",
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: "0.04em",
                textDecoration: "none",
              }}
            >
              Back home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
