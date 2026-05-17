"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { PageMasthead } from "@/components/editorial/page-masthead";
import { LeafDivider } from "@/components/editorial/leaf-divider";

/**
 * /goodbye — post-cancellation landing.
 *
 * The Stripe portal's cancel flow returns here. The webhook
 * (customer.subscription.deleted) flips the user to Free asynchronously,
 * so we wait briefly then check: if they're still Pro they didn't actually
 * cancel — bounce them back to /profile. If Free, show a calm goodbye with
 * a single, honest comeback offer. No guilt, no spam — the one win-back
 * email (CASL-compliant, unsubscribe in footer) does the rest.
 */
export default function GoodbyePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const [settled, setSettled] = useState(false);

  // This page is only reached via the Stripe portal's cancel-flow return
  // URL, so the visitor went through cancellation. We deliberately do NOT
  // gate on the client's `isPro` — it's a stale cached value racing an
  // async webhook, and bouncing a user who DID cancel back to /profile
  // (the old behaviour) defeated the entire post-cancel page. Just require
  // an authenticated session and a brief settle for visual smoothness.
  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace("/");
      return;
    }
    const t = setTimeout(() => setSettled(true), 800);
    return () => clearTimeout(t);
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !settled) {
    return (
      <div style={{ display: "flex", justifyContent: "center", minHeight: "60vh", alignItems: "center" }}>
        <Loader2 size={20} className="animate-spin" style={{ color: "var(--ink-3)" }} />
      </div>
    );
  }

  return (
    <div className="reveal" style={{ paddingTop: 0 }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px clamp(20px, 4vw, 48px) 80px" }}>
        <PageMasthead
          eyebrow="Cancelled"
          eyebrowEnd="See you around"
          title={<>Sorry to see you <span style={{ fontStyle: "italic" }}>go</span>.</>}
          lede="Your Pro subscription is cancelled. You won't be charged again, and you keep Pro features until the end of the period you've already paid for."
        />

        <LeafDivider />

        <section style={{ marginTop: 24 }}>
          <p className="serif" style={{ fontSize: 16, color: "var(--ink-2)", lineHeight: 1.6, marginBottom: 16 }}>
            Your wallet, spend history, and saved trips stay exactly where they are.
            Nothing is deleted — if you come back, it&rsquo;s all still here. If you
            don&rsquo;t, your data is yours to export from{" "}
            <Link href="/settings" style={{ color: "var(--accent)" }}>account settings</Link>{" "}
            any time, and we hard-delete everything 30 days after account deletion.
          </p>
          <p className="serif" style={{ fontSize: 16, color: "var(--ink-2)", lineHeight: 1.6, marginBottom: 24, fontStyle: "italic" }}>
            One thing we&rsquo;d genuinely value: a line on what made you leave —
            reply to the email we just sent. It shapes what we build next.
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <Link
              href="/pricing"
              className="mono"
              style={{
                padding: "13px 24px",
                borderRadius: 10,
                background: "var(--accent)",
                color: "#fff",
                textDecoration: "none",
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.10em",
                textTransform: "uppercase",
              }}
            >
              Reactivate Pro
            </Link>
            <Link
              href="/optimizer"
              className="mono"
              style={{
                padding: "13px 24px",
                borderRadius: 10,
                background: "transparent",
                border: "1px solid var(--rule-strong)",
                color: "var(--ink-2)",
                textDecoration: "none",
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.10em",
                textTransform: "uppercase",
              }}
            >
              Keep using Free
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
