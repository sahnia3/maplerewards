import type { Metadata } from "next";
import Link from "next/link";
import { PageMasthead } from "@/components/editorial/page-masthead";
import { GlossaryList } from "@/components/glossary-list";

/* ─────────────────────────────────────────────────────────────────────────────
 * /glossary — the plain-English reference page promised by term.tsx.
 *
 * Renders the single-source-of-truth GLOSSARY map (term.tsx) as a static,
 * scannable reference. Every <Term> tooltip across the app points at the same
 * definitions, so this page is just the full, always-visible expansion of them
 * — no hover or tap required. Linked from the footer, chat empty state,
 * optimizer, and onboarding for beginners who want the whole vocabulary at once.
 * ───────────────────────────────────────────────────────────────────────────── */

export const metadata: Metadata = {
  title: "Rewards Glossary — MapleRewards",
  description:
    "Plain-English definitions of Canadian credit-card-rewards jargon: CPP, SQC, transfer ratios, sweet spots, welcome bonuses, and more.",
};

export default function GlossaryPage() {
  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "32px clamp(20px, 4vw, 60px) 80px" }}>
      <PageMasthead
        eyebrow="Reference"
        eyebrowEnd="Plain English"
        title={<>The rewards glossary.</>}
        lede="Every acronym and bit of jargon Maple uses, explained without the travel-hacker shorthand. New to rewards? Start here — then come back any time a term trips you up."
        maxWidth={620}
      />

      <GlossaryList />

      <div
        style={{
          marginTop: 40,
          paddingTop: 24,
          borderTop: "1px solid var(--rule)",
          display: "flex",
          gap: 14,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <span className="serif" style={{ fontSize: 15, fontStyle: "italic", color: "var(--ink-2)" }}>
          Ready to put it to work?
        </span>
        <Link
          href="/optimizer"
          className="mono"
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "11px 18px",
            borderRadius: 10,
            background: "var(--ink)",
            color: "var(--paper)",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            textDecoration: "none",
          }}
        >
          Rank your cards →
        </Link>
        <Link
          href="/chat"
          className="mono"
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "11px 18px",
            borderRadius: 10,
            background: "transparent",
            color: "var(--ink-2)",
            border: "1px solid var(--rule-strong)",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            textDecoration: "none",
          }}
        >
          Ask the assistant
        </Link>
      </div>
    </div>
  );
}
