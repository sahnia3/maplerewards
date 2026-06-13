import Link from "next/link";
import { PageMasthead } from "@/components/editorial/page-masthead";
import { LeafDivider } from "@/components/editorial/leaf-divider";
import { WaitlistForm } from "@/components/marketing/waitlist-form";
import { CostcoRouter } from "./CostcoRouter";

/**
 * /tools/costco-card-router — public, no sign-in.
 *
 * "Which of my cards should I use at Costco Canada?" The user multi-selects the
 * cards they hold; we apply two verified facts (Mastercard-only at the till,
 * Costco codes as a warehouse club so grocery bonuses don't apply) and rank
 * their Mastercards by effective return. SEO/lead-magnet asset that funnels
 * into onboarding.
 *
 * Server component shell (exports metadata + renders the static editorial
 * chrome) wrapping a "use client" island that does the catalogue fetch,
 * multi-select, and client-side ranking — same split as the other /tools pages.
 */

export const metadata = {
  title: "Costco Canada Card Router — Which card to use at Costco | Maple Rewards",
  description:
    "Costco Canada warehouses take Mastercard only, and Costco codes as a warehouse club — not grocery. Pick the cards you hold and see exactly which one to swipe at the till and why your Visa or Amex won't work.",
  openGraph: {
    title: "Which of your cards actually works at Costco Canada?",
    description:
      "Costco warehouses are Mastercard-only and grocery bonuses don't apply. Multi-select your cards and get the single best one to use at the till.",
    type: "website",
  },
};

export default function CostcoCardRouterPage() {
  return (
    <div className="reveal" style={{ paddingTop: 0 }}>
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "32px clamp(20px, 4vw, 60px) 80px",
        }}
      >
        <PageMasthead
          eyebrow="Free utility"
          eyebrowEnd="Costco Canada"
          title={
            <>
              Which card works <span style={{ fontStyle: "italic" }}>at Costco?</span>
            </>
          }
          lede="Costco Canada warehouses take Mastercard only, and Costco codes as a warehouse club — so your grocery bonus doesn't count. Pick the cards you hold and we'll tell you the single best one to swipe at the till, and which ones won't work."
        />

        <LeafDivider />

        <CostcoRouter />

        {/* Primary conversion for the launch window: the waitlist. */}
        <div
          style={{
            border: "1px solid var(--rule)",
            borderRadius: 14,
            background: "var(--card-fill)",
            padding: "26px 28px",
            marginBottom: 28,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <div>
            <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 8 }}>
              Join the waitlist
            </div>
            <h2 className="display" style={{ fontSize: "clamp(22px, 2.8vw, 30px)", lineHeight: 1.15, margin: 0 }}>
              Get Maple <span style={{ fontStyle: "italic" }}>before</span> everyone else.
            </h2>
            <p className="serif" style={{ fontSize: 15, color: "var(--ink-2)", lineHeight: 1.5, margin: "12px 0 0" }}>
              Maple is in early beta. Leave your email and we&rsquo;ll send your invite — and a referral
              link that moves you up the queue.
            </p>
          </div>
          <WaitlistForm source="costco-card-router" />
        </div>

        {/* Secondary CTA into onboarding — Maple does this for every store, not just Costco. */}
        <div
          style={{
            border: "1px solid var(--accent)",
            borderRadius: 14,
            background: "var(--accent-soft, rgba(165,31,45,0.06))",
            padding: "26px 28px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <div>
            <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 8 }}>
              The whole picture
            </div>
            <h2 className="display" style={{ fontSize: "clamp(22px, 2.8vw, 30px)", lineHeight: 1.15, margin: 0 }}>
              Maple does this for <span style={{ fontStyle: "italic" }}>every store</span> and every category — not
              just Costco.
            </h2>
            <p className="serif" style={{ fontSize: 15, color: "var(--ink-2)", lineHeight: 1.5, margin: "12px 0 0" }}>
              Network blackouts, warehouse-club coding, rotating bonuses, transfer-partner sweet spots — Maple
              tracks the rules for every Canadian card and tells you the best one to tap, everywhere you spend.
            </p>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <Link
              href="/onboarding"
              className="mono"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "14px 22px",
                borderRadius: 10,
                background: "var(--accent)",
                color: "#fff",
                textDecoration: "none",
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              Try Maple free →
            </Link>
            <Link
              href="/tools"
              className="mono"
              style={{
                fontSize: 11,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--accent)",
                textDecoration: "none",
              }}
            >
              More free tools →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
