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
      style={{
        position: "fixed",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 90,
        width: "min(640px, calc(100vw - 32px))",
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
          Maple Rewards uses essential cookies for sign-in and CSRF protection. No
          third-party trackers, no ad cookies. See our{" "}
          <Link href="/privacy" style={{ color: "var(--accent)" }}>
            Privacy Policy
          </Link>{" "}
          for the full list.
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
    </div>
  );
}
