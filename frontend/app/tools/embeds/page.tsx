"use client";

import { useState } from "react";
import Link from "next/link";
import { PageMasthead } from "@/components/editorial/page-masthead";
import { LeafDivider } from "@/components/editorial/leaf-divider";

/**
 * /tools/embeds — explainer + live preview for the embeddable CPP badge.
 *
 * The /embed/cpp/[program] route on its own is useless without context:
 * it's an iframe-friendly widget, not a destination. This page shows the
 * widget in its intended form (inside an iframe) and gives a copy-paste
 * snippet for embedding on any site.
 */
export default function EmbedsGalleryPage() {
  const programs = [
    { slug: "aeroplan", name: "Aeroplan" },
    { slug: "amex-mr-ca", name: "Amex MR Canada" },
    { slug: "scene-plus", name: "Scene+" },
    { slug: "marriott-bonvoy", name: "Marriott Bonvoy" },
  ];
  const [picked, setPicked] = useState<string>("aeroplan");
  const [copied, setCopied] = useState(false);

  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://maplerewards.ca";
  const embedUrl = `${origin}/embed/cpp/${picked}`;
  const iframeSnippet = `<iframe src="${embedUrl}" width="220" height="92" style="border:0;border-radius:8px" loading="lazy"></iframe>`;

  return (
    <div className="reveal" style={{ paddingTop: 0 }}>
      <div
        style={{
          maxWidth: 900,
          margin: "0 auto",
          padding: "32px clamp(20px, 4vw, 60px) 80px",
        }}
      >
        <PageMasthead
          eyebrow="Embeds"
          eyebrowEnd="Free · No attribution required"
          title={
            <>
              The live <span style={{ fontStyle: "italic" }}>CPP</span> badge.
            </>
          }
          lede="Drop a single iframe onto any site to show the live cents-per-point valuation for a Canadian loyalty program. The number updates automatically when our pricing engine re-values the program."
        />

        <LeafDivider />

        {/* ── Program picker ──────────────────────────────────────── */}
        <section style={{ marginBottom: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Pick a program
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {programs.map((p) => (
              <button
                key={p.slug}
                type="button"
                onClick={() => setPicked(p.slug)}
                className="mono"
                style={{
                  padding: "8px 14px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  border:
                    picked === p.slug
                      ? "1px solid var(--accent)"
                      : "1px solid var(--rule)",
                  background:
                    picked === p.slug ? "var(--accent)" : "transparent",
                  color: picked === p.slug ? "#fff" : "var(--ink)",
                  cursor: "pointer",
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
        </section>

        {/* ── Live preview ────────────────────────────────────────── */}
        <section style={{ marginBottom: 32 }}>
          <div className="eyebrow" style={{ marginBottom: 14 }}>
            Live preview
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 40,
              border: "1px dashed var(--rule)",
              borderRadius: 12,
              background: "var(--surface-2)",
            }}
          >
            <iframe
              key={picked /* force remount when slug changes */}
              src={embedUrl}
              width={220}
              height={92}
              style={{ border: 0, borderRadius: 8 }}
              loading="lazy"
              title={`${picked} CPP badge`}
            />
          </div>
        </section>

        {/* ── Copy-paste snippet ──────────────────────────────────── */}
        <section style={{ marginBottom: 32 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 10,
            }}
          >
            <span className="eyebrow">Paste this anywhere</span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(iframeSnippet);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="mono"
              style={{
                background: "none",
                border: "1px solid var(--rule)",
                color: "var(--ink-2)",
                fontSize: 10,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                padding: "4px 10px",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <pre
            style={{
              background: "var(--ink)",
              color: "var(--paper)",
              fontFamily: "var(--font-jetbrains-mono)",
              fontSize: 12,
              padding: "16px 20px",
              borderRadius: 8,
              overflowX: "auto",
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            {iframeSnippet}
          </pre>
        </section>

        <p
          className="serif"
          style={{
            fontSize: 14,
            color: "var(--ink-2)",
            fontStyle: "italic",
            lineHeight: 1.5,
          }}
        >
          Works in any HTML page or CMS — WordPress, Ghost, Substack, Squarespace,
          plain HTML. The badge is read-only and ships no tracking.{" "}
          <Link href="/tools" style={{ color: "var(--accent)" }}>
            Back to all tools →
          </Link>
        </p>
      </div>
    </div>
  );
}
