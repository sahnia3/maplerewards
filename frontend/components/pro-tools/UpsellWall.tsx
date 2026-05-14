"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * ProToolsUpsell — the wall shown to free / anonymous users. Lifted out of
 * page.tsx so the main file stays small.
 */
export function ProToolsUpsell({ signedIn }: { signedIn: boolean }) {
  /* Per-tag accent so the 4 feature cards become visually scannable instead of
   * reading as one repeating shape. Forensics is the headline pitch — slightly
   * heavier weight. */
  const FEATURES = [
    {
      tag: "Forensics",
      title: "Missed rewards report",
      body: "Per-transaction breakdown of what a better card would have earned.",
      tone: "var(--accent)",
      headline: true,
    },
    {
      tag: "Status",
      title: "Aeroplan SQC projector",
      body: "YTD credits across cobranded cards plus spend to clear the next tier.",
      tone: "var(--info-text)",
      headline: false,
    },
    {
      tag: "Stacking",
      title: "Triple-stack calculator",
      body: "Per-merchant card, portal, and offer combos for maximum return.",
      tone: "var(--gold)",
      headline: false,
    },
    {
      tag: "Knowledge",
      title: "Devaluation alerts",
      body: "Live diff-watch on issuer pages and major program changes.",
      tone: "var(--ink-2)",
      headline: false,
    },
  ] as const;

  return (
    <div
      className="reveal"
      style={{
        minHeight: "70vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "60px clamp(20px, 4vw, 60px)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Signature maple-glow backdrop, anchored behind the hero copy. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 60% 50% at 50% 30%, var(--accent-glow), transparent 65%), radial-gradient(ellipse 40% 30% at 50% 80%, var(--gold-soft), transparent 60%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      <div style={{ maxWidth: 720, width: "100%", position: "relative", zIndex: 1 }}>
        <header style={{ textAlign: "center", marginBottom: 36 }}>
          <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 14 }}>
            Pro Tools
          </div>
          <h1
            className="display"
            style={{
              fontSize: "clamp(32px, 5.5vw, 48px)",
              lineHeight: 1.05,
              letterSpacing: "-0.015em",
              color: "var(--ink)",
              margin: 0,
            }}
          >
            Serious tools, <span style={{ fontStyle: "italic", color: "var(--accent)" }}>open at Pro</span>.
          </h1>
          <p
            className="serif"
            style={{ fontSize: 17, fontStyle: "italic", color: "var(--ink-2)", marginTop: 14, lineHeight: 1.5, maxWidth: 560, marginLeft: "auto", marginRight: "auto" }}
          >
            14 tools across forensics, status tracking, stacking, and program intel. Every one built for Canadian rewards.
          </p>
        </header>

        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: "0 0 36px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 14,
          }}
        >
          {FEATURES.map((h) => (
            <li
              key={h.title}
              style={{
                position: "relative",
                border: `1px solid ${h.headline ? "var(--accent)" : "var(--rule-strong)"}`,
                borderRadius: 12,
                padding: "18px 20px",
                background: "var(--surface)",
                boxShadow: h.headline ? "var(--shadow-accent-glow)" : "var(--shadow-1)",
                overflow: "hidden",
              }}
            >
              {/* Top accent stripe — color-coded per category. */}
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 3,
                  background: h.tone,
                }}
              />
              <div
                className="mono"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: h.tone,
                  marginBottom: 8,
                  fontWeight: 600,
                }}
              >
                {h.tag}
              </div>
              <div style={{ fontWeight: 600, fontSize: 14, color: "var(--ink)", letterSpacing: "-0.005em" }}>
                {h.title}
              </div>
              <div
                className="serif"
                style={{ fontSize: 13, fontStyle: "italic", color: "var(--ink-2)", marginTop: 6, lineHeight: 1.45 }}
              >
                {h.body}
              </div>
            </li>
          ))}
        </ul>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
          <Link href="/pricing" style={{ textDecoration: "none", width: "100%", maxWidth: 340 }}>
            <Button variant="primary" size="md" style={{ width: "100%", height: 44, fontSize: 13 }}>
              {signedIn ? "Upgrade to Pro" : "See Pro pricing"}
            </Button>
          </Link>
          {!signedIn && (
            <Link
              href="/login?redirect=/pro-tools"
              className="mono"
              style={{
                fontSize: 11,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--ink-3)",
                textDecoration: "underline",
              }}
            >
              Already a Pro? Sign in
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
