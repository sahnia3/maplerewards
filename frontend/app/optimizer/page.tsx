"use client";

import Link from "next/link";
import { OptimizerForm } from "@/components/optimizer-form";
import { LeafDivider } from "@/components/editorial/leaf-divider";

export default function OptimizerPage() {
  return (
    <div className="reveal" style={{ paddingTop: 0 }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px clamp(20px, 4vw, 60px) 80px" }}>
        {/* ── Editorial masthead ──────────────────────────────────── */}
        <header
          style={{
            borderBottom: "1px solid var(--rule)",
            paddingBottom: 28,
            marginBottom: 32,
            display: "grid",
            gridTemplateColumns: "1fr auto",
            alignItems: "end",
            gap: 24,
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <span className="eyebrow">Optimizer</span>
              <span className="mr-kicker-line" style={{ maxWidth: 100 }} />
              <span className="eyebrow">Live wallet · CAD</span>
            </div>
            <h1
              className="display"
              style={{
                fontSize: "clamp(40px, 5vw, 56px)",
                margin: 0,
                letterSpacing: "-0.015em",
                lineHeight: 0.96,
              }}
            >
              Best card for the<br />
              <span style={{ fontStyle: "italic" }}>next</span>{" "}
              <span style={{ color: "var(--accent)" }}>swipe</span>.
            </h1>
            <p
              className="serif"
              style={{
                fontSize: 17,
                fontStyle: "italic",
                color: "var(--ink-2)",
                marginTop: 14,
                maxWidth: 560,
                lineHeight: 1.45,
              }}
            >
              Tell us what you&rsquo;re buying. We rank every card in your wallet by
              real CAD returned — points × CPP, net of caps and transfer
              partners.
            </p>
          </div>
          <Link
            href="/wallet"
            className="mono"
            style={{
              fontSize: 11,
              color: "var(--ink-3)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              textDecoration: "none",
              padding: "10px 16px",
              border: "1px solid var(--rule)",
              borderRadius: 8,
            }}
          >
            Build wallet →
          </Link>
        </header>

        {/* ── Form + results ─────────────────────────────────────── */}
        <OptimizerForm />

        <LeafDivider />

        {/* ── Footer hint ────────────────────────────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 0,
            border: "1px solid var(--rule)",
            borderRadius: 14,
            overflow: "hidden",
            background: "var(--card-fill)",
            marginTop: 22,
          }}
        >
          {[
            { value: "102", label: "Canadian cards" },
            { value: "27", label: "Loyalty programs" },
            { value: "8", label: "Spend categories" },
            { value: "CAD", label: "Dollar values" },
          ].map((s, i) => (
            <div
              key={s.label}
              style={{
                padding: "20px 22px",
                borderLeft: i > 0 ? "1px solid var(--rule)" : "none",
                minWidth: 0,
              }}
            >
              <div
                className="display"
                style={{
                  fontSize: 28,
                  letterSpacing: "-0.005em",
                  color: "var(--ink)",
                  lineHeight: 1,
                }}
              >
                {s.value}
              </div>
              <div
                className="mono"
                style={{
                  fontSize: 10,
                  color: "var(--ink-3)",
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                  marginTop: 6,
                }}
              >
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
