"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { unsubscribeEmail } from "@/lib/api";
import { PageMasthead } from "@/components/editorial/page-masthead";
import { LeafDivider } from "@/components/editorial/leaf-divider";

/**
 * /unsubscribe — CASL one-click opt-out landing.
 *
 * The email footer links here with ?u=<userID>&e=<email>&t=<hmac>. All three
 * params are required by the backend endpoint. We process the link on mount
 * (no button to click — the link IS the consent action) and call the public,
 * token-authenticated backend endpoint. No login required.
 */
function UnsubscribeInner() {
  const params = useSearchParams();
  const u = params.get("u") ?? "";
  const e = params.get("e") ?? "";
  const t = params.get("t") ?? "";
  const [state, setState] = useState<"working" | "done" | "error">("working");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // guard React StrictMode double-invoke
    ran.current = true;
    // Scrub the signed token out of the URL immediately so it can't leak via
    // Referer, browser history, or analytics — a leaked (u,t) is a standing
    // unsubscribe credential until it expires.
    if (typeof window !== "undefined" && (u || t || e)) {
      window.history.replaceState(null, "", "/unsubscribe");
    }
    if (!u || !e || !t) {
      // Distinct diagnostic when ONLY `e` is missing: that almost always means
      // the email template dropped the &e= param, which would silently break
      // unsubscribe for every recipient — not a user-tampered link. Surface it
      // so it's identifiable rather than indistinguishable from a bad link.
      if (u && t && !e && typeof console !== "undefined") {
        console.error("[unsubscribe] missing `e` (email) param — check the email template's unsubscribe URL");
      }
      setState("error");
      return;
    }
    unsubscribeEmail(u, e, t)
      .then(() => setState("done"))
      .catch(() => setState("error"));
  }, [u, e, t]);

  return (
    <div className="reveal" style={{ paddingTop: 0 }}>
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "32px clamp(20px, 4vw, 48px) 80px" }}>
        <PageMasthead
          eyebrow="Email preferences"
          title={
            state === "done" ? (
              <>You&rsquo;re <span style={{ fontStyle: "italic" }}>unsubscribed</span>.</>
            ) : state === "error" ? (
              <>That link didn&rsquo;t <span style={{ fontStyle: "italic" }}>work</span>.</>
            ) : (
              <>One <span style={{ fontStyle: "italic" }}>moment</span>…</>
            )
          }
          lede={
            state === "done"
              ? "You won't receive any further MapleRewards emails — no digests, no win-back, nothing. This takes effect immediately."
              : state === "error"
              ? "This unsubscribe link is invalid or incomplete. If you copied it from an email, try clicking the link directly instead."
              : "Processing your request."
          }
        />
        <LeafDivider />
        <div style={{ marginTop: 24 }}>
          {state === "working" && (
            <Loader2 size={20} className="animate-spin" style={{ color: "var(--ink-3)" }} />
          )}
          {state === "done" && (
            <p className="serif" style={{ fontSize: 15, color: "var(--ink-2)", lineHeight: 1.6 }}>
              Changed your mind later? Email{" "}
              <a href="mailto:hello@maplerewards.app" style={{ color: "var(--accent)" }}>
                hello@maplerewards.app
              </a>{" "}
              and we&rsquo;ll turn them back on.
            </p>
          )}
          {state === "error" && (
            <p className="serif" style={{ fontSize: 15, color: "var(--ink-2)", lineHeight: 1.6 }}>
              Email{" "}
              <a href="mailto:hello@maplerewards.app" style={{ color: "var(--accent)" }}>
                hello@maplerewards.app
              </a>{" "}
              and we&rsquo;ll remove you manually.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense
      fallback={
        <div style={{ display: "flex", justifyContent: "center", minHeight: "60vh", alignItems: "center" }}>
          <Loader2 size={20} className="animate-spin" style={{ color: "var(--ink-3)" }} />
        </div>
      }
    >
      <UnsubscribeInner />
    </Suspense>
  );
}
