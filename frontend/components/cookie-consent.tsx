"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "mr_cookie_consent_v1";

type ConsentState = "unset" | "accepted" | "declined";

/**
 * CookieConsent — a calm, dismissible banner at the bottom of the page.
 *
 * Maple Rewards only sets ESSENTIAL cookies today (session + CSRF). If we
 * ever add analytics or marketing trackers we will pre-gate them on
 * `accepted` state and re-prompt. The banner is informational + lawful-basis
 * disclosure under PIPEDA + GDPR.
 *
 * Choice persists in localStorage so we don't nag returning users.
 */
export function CookieConsent() {
  const [state, setState] = useState<ConsentState>("unset");

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "accepted" || stored === "declined") {
        setState(stored);
      }
    } catch {
      // localStorage unavailable (private mode, quota) — keep banner shown
    }
  }, []);

  if (state !== "unset") return null;

  function persist(choice: ConsentState) {
    try {
      window.localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      // best-effort
    }
    setState(choice);
  }

  return (
    <div
      role="dialog"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-body"
      className="mr-cookie-consent"
      style={{
        padding: "18px 22px",
        background: "var(--surface)",
        border: "1px solid var(--rule-strong)",
        borderRadius: 14,
        boxShadow: "0 12px 36px rgba(0,0,0,0.14)",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div>
        <div
          id="cookie-consent-title"
          className="eyebrow"
          style={{ marginBottom: 6, color: "var(--accent)" }}
        >
          A note on cookies
        </div>
        <p
          id="cookie-consent-body"
          className="serif"
          style={{ fontSize: 14, lineHeight: 1.5, color: "var(--ink-2)", margin: 0 }}
        >
          <span className="mr-cookie-full">
            Maple Rewards uses essential cookies for sign-in and CSRF protection.
            No third-party trackers, no ad cookies. See our{" "}
            <Link href="/privacy" style={{ color: "var(--accent)" }}>
              Privacy Policy
            </Link>{" "}
            for the full list.
          </span>
          <span className="mr-cookie-short">
            Essential cookies only — sign-in + CSRF, no trackers.{" "}
            <Link href="/privacy" style={{ color: "var(--accent)" }}>
              Privacy Policy
            </Link>
          </span>
        </p>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={() => persist("declined")}
          className="mono"
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid var(--rule)",
            background: "transparent",
            color: "var(--ink-2)",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          Just essentials
        </button>
        <button
          type="button"
          onClick={() => persist("accepted")}
          className="mono"
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid var(--accent)",
            background: "var(--accent)",
            color: "#fff",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          Got it
        </button>
      </div>
      {/* Positioning lives in CSS so the banner can dodge the chrome per
       * breakpoint: bottom-left and narrow on mobile (clear of the Ask Maple
       * FAB at right 20 / bottom 80), bottom-right above the FAB on desktop
       * (clear of the hero CTA column), and z-index below the mobile nav
       * drawer (z-50), its backdrop (z-40) and the FAB (z-50). */}
      <style>{`
        .mr-cookie-consent {
          position: fixed;
          bottom: 16px;
          left: 16px;
          z-index: 30;
          width: min(340px, calc(100vw - 128px));
        }
        .mr-cookie-short { display: none; }
        /* Small phones: compact single-purpose banner. Height must stay under
         * ~130px so the top edge clears the hero CTA (ends ~y658 at 375x812)
         * while the narrow width keeps the Ask Maple FAB column (x>=271) clear. */
        @media (max-width: 479px) {
          .mr-cookie-consent {
            bottom: 12px;
            left: 12px;
            padding: 12px 14px !important;
            gap: 8px !important;
          }
          .mr-cookie-consent #cookie-consent-title { display: none; }
          .mr-cookie-consent #cookie-consent-body { font-size: 12px; line-height: 1.45; }
          .mr-cookie-full { display: none; }
          .mr-cookie-short { display: inline; }
          .mr-cookie-consent button { padding: 6px 10px !important; font-size: 10px !important; }
        }
        @media (min-width: 1024px) {
          .mr-cookie-consent {
            left: auto;
            right: 16px;
            bottom: 124px;
            width: 340px;
          }
        }
      `}</style>
    </div>
  );
}
