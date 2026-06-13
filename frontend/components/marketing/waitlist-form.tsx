"use client";

import { useState } from "react";
import { ApiError, request } from "@/lib/api";

/* ─────────────────────────────────────────────────────────────────────────────
 * WaitlistForm — pre-launch email capture with referral mechanics.
 *
 * POST /waitlist is idempotent: a brand-new email gets 201, a repeat email
 * gets 200 with the same payload — so re-submitting is a safe way to check
 * your position and referral count. The success state shows the queue
 * position, the shareable referral link, and the referral-tier ladder.
 *
 * Editorial styling matches the landing-page blocks it embeds in (eyebrow /
 * display / serif / mono classes + CSS-var palette, inline style objects like
 * the neighbouring marketing components).
 * ───────────────────────────────────────────────────────────────────────────── */

type WaitlistJoinResponse = {
  position: number;
  referral_code: string;
  referral_count: number;
  total: number;
};

const REFERRAL_BASE = "https://maplerewards.app/?ref=";

const TIER_COPY =
  "1 referral — skip the line · 3 — a year of Pro free · 5 — lifetime price lock. First 500 get founding pricing.";

export function WaitlistForm({ source, refCode }: { source?: string; refCode?: string }) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WaitlistJoinResponse | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await request<WaitlistJoinResponse>("/waitlist", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          ...(refCode ? { ref: refCode } : {}),
          ...(source ? { source } : {}),
        }),
      });
      setResult(res);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 400
          ? err.message
          : "Could not join the waitlist — try again shortly.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the link is selectable text either way */
    }
  }

  if (result) {
    const link = `${REFERRAL_BASE}${result.referral_code}`;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 8 }}>
            You&rsquo;re on the list
          </div>
          <div className="display" style={{ fontSize: "clamp(22px, 2.6vw, 30px)", lineHeight: 1.1 }}>
            You&rsquo;re{" "}
            <span style={{ fontStyle: "italic", color: "var(--accent)" }}>
              #{result.position.toLocaleString("en-CA")}
            </span>{" "}
            of {result.total.toLocaleString("en-CA")}.
          </div>
          {result.referral_count > 0 && (
            <p className="serif" style={{ margin: "8px 0 0", fontSize: 14, color: "var(--ink-2)" }}>
              {result.referral_count.toLocaleString("en-CA")}{" "}
              {result.referral_count === 1 ? "person has" : "people have"} joined with your link.
            </p>
          )}
        </div>

        {/* Shareable referral link */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            border: "1px solid var(--rule-strong)",
            borderRadius: 10,
            padding: "10px 12px",
            background: "var(--card-fill)",
          }}
        >
          <span
            className="mono"
            style={{ flex: 1, minWidth: 200, fontSize: 12, color: "var(--ink)", wordBreak: "break-all" }}
          >
            {link}
          </span>
          <button
            type="button"
            onClick={() => copyLink(link)}
            className="mono"
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid var(--accent)",
              background: copied ? "var(--accent)" : "transparent",
              color: copied ? "#fff" : "var(--accent)",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>

        <p className="serif" style={{ margin: 0, fontSize: 14, color: "var(--ink-2)", lineHeight: 1.5 }}>
          {TIER_COPY}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-label="Email address"
          required
          autoComplete="email"
          className="sans"
          style={{
            flex: 1,
            minWidth: 220,
            padding: "14px 16px",
            borderRadius: 10,
            border: "1px solid var(--rule-strong)",
            background: "var(--card-fill)",
            color: "var(--ink)",
            fontSize: 14,
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={submitting || !email.trim()}
          className="mono"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "14px 22px",
            borderRadius: 10,
            border: "none",
            background: "var(--accent)",
            color: "#fff",
            cursor: submitting || !email.trim() ? "default" : "pointer",
            opacity: submitting || !email.trim() ? 0.6 : 1,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          {submitting ? "Joining…" : "Join the waitlist →"}
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="serif"
          style={{ margin: 0, fontSize: 13, fontStyle: "italic", color: "var(--loss)" }}
        >
          {error}
        </p>
      )}

      <p className="serif" style={{ margin: 0, fontSize: 13, color: "var(--ink-3)", lineHeight: 1.5 }}>
        {TIER_COPY}
      </p>
    </form>
  );
}
