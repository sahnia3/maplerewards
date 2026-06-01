"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { ApiError, createPortalSession } from "@/lib/api";
import { PageMasthead } from "@/components/editorial/page-masthead";
import { LeafDivider } from "@/components/editorial/leaf-divider";

/**
 * /cancel — the "before you go" interstitial.
 *
 * Deliberately NOT a dark pattern: this is one short screen that reminds
 * the member what they lose and offers a cheaper plan, but "Continue to
 * cancel" is a single, prominent click that hands straight to the Stripe
 * portal's cancellation flow (where Stripe's own retention/coupon offers,
 * configured in the dashboard, apply). Cancel is never harder than signup.
 *
 * Lifetime and Free users have nothing to cancel and are bounced to /profile.
 */
export default function CancelPage() {
  const router = useRouter();
  const { isPro, plan, isAuthenticated, isLoading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !isPro || plan === "lifetime") {
      router.replace("/profile");
    }
  }, [isLoading, isAuthenticated, isPro, plan, router]);

  async function toPortal(flow?: "cancel") {
    setBusy(true);
    setErr(null);
    try {
      const { url } = await createPortalSession(flow);
      window.location.href = url;
    } catch (e) {
      setErr(
        e instanceof ApiError
          ? e.message
          : "Could not open the billing portal. Try again in a moment."
      );
      setBusy(false);
    }
  }

  if (isLoading || !isPro || plan === "lifetime") {
    return (
      <div style={{ display: "flex", justifyContent: "center", minHeight: "60vh", alignItems: "center" }}>
        <Loader2 size={20} className="animate-spin" style={{ color: "var(--ink-3)" }} />
      </div>
    );
  }

  const losing = [
    "Missed-rewards forensics — the exact dollars you left on the table",
    "Aeroplan 2026 SQC projector and status tracking",
    "Credits & renewals calendar so annual fees never surprise you",
    "Unlimited AI chat, optimizer history, and award alerts",
  ];

  return (
    <div className="reveal" style={{ paddingTop: 0 }}>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "32px clamp(20px, 4vw, 48px) 80px" }}>
        <PageMasthead
          eyebrow="Cancel"
          eyebrowEnd="No hard feelings"
          title={<>Before you <span style={{ fontStyle: "italic" }}>go</span>.</>}
          lede="You can cancel in one click below — it takes effect at the end of the period you've already paid for, and you keep Pro until then. First, two things worth a look."
        />

        <LeafDivider />

        <section style={{ marginTop: 24, marginBottom: 28 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>What lapses when Pro ends</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
            {losing.map((l) => (
              <li
                key={l}
                className="serif"
                style={{ fontSize: 15, color: "var(--ink-2)", lineHeight: 1.5, paddingLeft: 18, position: "relative" }}
              >
                <span style={{ position: "absolute", left: 0, color: "var(--accent)" }}>—</span>
                {l}
              </li>
            ))}
          </ul>
        </section>

        {/* Cheaper-plan offer — a real alternative, not a guilt trip. */}
        <section
          style={{
            border: "1px solid var(--rule)",
            borderRadius: 14,
            background: "var(--card-fill-strong)",
            padding: "20px 22px",
            marginBottom: 28,
          }}
        >
          <span className="eyebrow" style={{ color: "var(--accent)" }}>Spending less, not leaving?</span>
          <p className="serif" style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.5, margin: "8px 0 14px" }}>
            You can switch to a lower tier instead of cancelling outright — you keep
            the core toolkit for less. Plan changes are handled in the billing portal.
          </p>
          <button
            type="button"
            onClick={() => toPortal()}
            disabled={busy}
            className="mono"
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              cursor: busy ? "not-allowed" : "pointer",
              opacity: busy ? 0.6 : 1,
            }}
          >
            Change my plan
          </button>
        </section>

        {err && (
          <p
            role="alert"
            className="mono"
            style={{ fontSize: 12, color: "var(--accent)", letterSpacing: "0.04em", marginBottom: 16, lineHeight: 1.5 }}
          >
            {err}
          </p>
        )}

        {/* The two clear exits. Cancel is one prominent click. */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <button
            type="button"
            onClick={() => toPortal("cancel")}
            disabled={busy}
            className="mono"
            style={{
              padding: "13px 22px",
              borderRadius: 10,
              background: "transparent",
              border: "1px solid var(--rule-strong)",
              color: "var(--ink-2)",
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              cursor: busy ? "not-allowed" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            {busy ? "Opening…" : "Continue to cancel"}
          </button>

          <Link
            href="/profile"
            className="mono"
            style={{
              padding: "13px 22px",
              borderRadius: 10,
              background: "var(--accent)",
              color: "#fff",
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <ArrowLeft size={14} /> Keep my plan
          </Link>
        </div>
      </div>
    </div>
  );
}
