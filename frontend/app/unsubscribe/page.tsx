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
 * The email footer links here with ?u=<userID>&t=<hmac>. We process it on
 * mount (no button to click — the link IS the consent action) and call the
 * public, token-authenticated backend endpoint. No login required.
 */
function UnsubscribeInner() {
  const params = useSearchParams();
  const u = params.get("u") ?? "";
  const t = params.get("t") ?? "";
  const [state, setState] = useState<"working" | "done" | "error">("working");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // guard React StrictMode double-invoke
    ran.current = true;
    if (!u || !t) {
      setState("error");
      return;
    }
    unsubscribeEmail(u, t)
      .then(() => setState("done"))
      .catch(() => setState("error"));
  }, [u, t]);

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
