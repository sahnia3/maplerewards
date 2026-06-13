"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth-context";

/**
 * ProFOMOStrip — surfaces the value of Pro features to free users with
 * specific, believable numbers and a soft CTA. Hidden for Pro users so they
 * never see this on top of the real data.
 *
 * The numbers come from public/free aggregates the backend already exposes
 * (issuer change counts, devaluation count). The user-specific dollar
 * figures stay behind the Pro paywall — we surface the count, blur the
 * breakdown.
 */
export function ProFOMOStrip() {
  const { isPro, isAuthenticated } = useAuth();
  const [issuerChangeCount, setIssuerChangeCount] = useState<number | null>(null);
  const [devalCount, setDevalCount] = useState<number | null>(null);

  useEffect(() => {
    if (isPro) return;
    // Both endpoints are public — no auth needed, so this works for anon
    // visitors too. We only render the strip when the user is signed-in
    // but not yet Pro (the conversion target).
    const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api/v1";
    Promise.allSettled([
      fetch(`${base}/issuer-changes?limit=20`).then((r) => r.ok ? r.json() : null),
      fetch(`${base}/devaluations`).then((r) => r.ok ? r.json() : null),
    ]).then(([changes, devals]) => {
      if (changes.status === "fulfilled" && Array.isArray(changes.value)) {
        setIssuerChangeCount(changes.value.length);
      }
      if (devals.status === "fulfilled" && Array.isArray(devals.value)) {
        // Filter to upcoming only — past events don't drive urgency.
        const upcoming = devals.value.filter((d: { days_until?: number }) => (d.days_until ?? 0) >= 0);
        setDevalCount(upcoming.length);
      }
    });
  }, [isPro]);

  if (isPro) return null;
  if (!isAuthenticated) return null;

  // Need at least one signal before rendering so we don't show a placeholder.
  if (issuerChangeCount === null && devalCount === null) return null;

  return (
    <section
      style={{
        background: "var(--paper)",
        border: "1px solid var(--rule)",
        borderRadius: 12,
        padding: "16px 20px",
        marginBottom: 22,
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 14,
        alignItems: "center",
      }}
    >
      <div>
        <div
          className="eyebrow"
          style={{ color: "var(--accent)", marginBottom: 6 }}
        >
          PRO INTEL · YOUR WALLET IS QUIETLY EXPOSED
        </div>
        <div style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.5 }}>
          {devalCount !== null && devalCount > 0 && (
            <>
              <strong style={{ color: "var(--ink)" }}>{devalCount}</strong> upcoming
              loyalty devaluations may affect your balances.{" "}
            </>
          )}
          {issuerChangeCount !== null && issuerChangeCount > 0 && (
            <>
              <strong style={{ color: "var(--ink)" }}>{issuerChangeCount}</strong>{" "}
              card-issuer changes detected this month.{" "}
            </>
          )}
          <span style={{ color: "var(--ink-3)" }}>
            Loyalty programs devalue and issuers change terms all year — Pro shows
            you which changes touch your wallet and the exact dollar exposure.
          </span>
        </div>
      </div>
      <Link
        href="/pricing"
        className="mono"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "10px 18px",
          borderRadius: 8,
          background: "var(--accent)",
          color: "#fff",
          textDecoration: "none",
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}
      >
        See Pro →
      </Link>
    </section>
  );
}
