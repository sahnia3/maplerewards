"use client";

import Link from "next/link";

/* ─────────────────────────────────────────────────────────────────────────────
 * StackTemplates — curated card-combination recipes for common Canadian
 * spending profiles. Direct lift from the most-upvoted answer in the RFD
 * Credit Card Combos thread + the 34-upvote PFC stack template ("Cobalt +
 * Platinum + Aeroplan VI + Tangerine MC for Costco").
 *
 * Each template shows:
 *   - The cards in the stack with their role
 *   - The annual fee total
 *   - Headline value (rough effective return on a typical $50K spend)
 *   - "Who this is for" one-liner
 *
 * The templates are intentionally hard-coded (not data-driven) — the value
 * is in the curation, and the catalogue moves rarely. Update this list when
 * a card in a recipe is retired or its earn rate changes.
 * ───────────────────────────────────────────────────────────────────────── */

interface StackCard {
  name: string;
  role: string;
  feeCAD: number;
}

interface StackTemplate {
  id: string;
  title: string;
  audience: string;
  kicker: string;
  cards: StackCard[];
  rationale: string;
  caveats?: string;
}

const TEMPLATES: StackTemplate[] = [
  {
    id: "everyday-canadian",
    title: "The everyday Canadian stack",
    audience: "$30–60K annual spend, Canadian groceries + dining + everyday",
    kicker: "Most-recommended PFC combo",
    cards: [
      { name: "Amex Cobalt", role: "Groceries (Metro/Sobeys/IGA), dining, streaming — 5×", feeCAD: 155.88 },
      { name: "Tangerine Money-Back", role: "Groceries at Loblaws/Costco where Amex is rejected — 2%", feeCAD: 0 },
      { name: "Rogers World Elite MC", role: "FX-fee no-FX & 1.5% on everything else", feeCAD: 0 },
    ],
    rationale:
      "Cobalt earns 5× MR on the largest grocery categories that accept Amex; the Tangerine fills the Loblaws + Costco hole. Rogers covers USD purchases and miscellaneous spend without an FX premium.",
    caveats: "Not optimal if you don't shop at Metro/Sobeys/IGA or if you live in Quebec (where the Cobalt fee is lower).",
  },
  {
    id: "aeroplan-collector",
    title: "The Aeroplan collector",
    audience: "Frequent flier targeting Aeroplan elite status + transferable MR",
    kicker: "Stack for the SQC chase",
    cards: [
      { name: "Amex Cobalt", role: "5× MR on grocery + dining → transfer 1:1 to Aeroplan", feeCAD: 155.88 },
      { name: "TD Aeroplan Visa Infinite Privilege", role: "1.5× direct Aeroplan + SQC + fast-track milestones", feeCAD: 599 },
      { name: "Brim World Elite MC", role: "Zero FX-fee for non-Star-Alliance international", feeCAD: 199 },
    ],
    rationale:
      "Cobalt's 5× and Privilege's milestones produce ~140K Aeroplan/year on $30K spend. Privilege also bumps you toward 75K Status Qualifying Credits without paying for separate flights.",
    caveats: "$955 in annual fees — only worth it if you redeem ≥150K Aeroplan/year at 2¢+ CPP.",
  },
  {
    id: "premium-traveler",
    title: "The premium traveler",
    audience: "Lounge access + concierge + high-end transferable points",
    kicker: "Two-card platinum stack",
    cards: [
      { name: "Amex Platinum", role: "Travel/dining 3×, lounge access, $200 travel credit, $200 dining credit", feeCAD: 799 },
      { name: "Amex Cobalt", role: "Drops grocery/dining to 5× MR — same currency as Plat", feeCAD: 155.88 },
    ],
    rationale:
      "Platinum's $400+ in annual credits brings the effective fee close to $400, then lounge access + 3× on travel + 1:1 transfer to Aeroplan/Avios/Flying Blue justifies the spend. Cobalt fills the food categories Plat caps at 1×.",
    caveats: "Both Amex — needs a Visa/MC backup for Costco, Loblaws, T&T, Shoppers, etc.",
  },
  {
    id: "no-fee-rookie",
    title: "The no-fee rookie",
    audience: "First-time card holder, no track record, low spend",
    kicker: "Build credit, earn anyway",
    cards: [
      { name: "RBC ION+ Visa", role: "3× on groceries, dining, gas, transit, streaming — $48 fee waived first year", feeCAD: 48 },
      { name: "PC Mastercard", role: "Free; PC Optimum at Loblaws/No Frills/Shoppers + 10% on PC Mobile", feeCAD: 0 },
    ],
    rationale:
      "RBC ION+ has the lowest spend threshold for its welcome bonus ($1,500 in 6 months) and earns 3× on the categories that actually matter for a typical student/young-professional spend.",
    caveats: "PC Optimum CPP is only 0.10¢ but it cuts your Loblaws/Shoppers grocery bill in cash terms.",
  },
];

export function StackTemplates() {
  return (
    <section style={{ marginBottom: 22 }}>
      <header style={{ marginBottom: 18, display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="mr-hero-kicker" style={{ marginBottom: 10 }}>
            <span className="eyebrow" style={{ color: "var(--accent)" }}>Stack templates</span>
            <span className="mr-kicker-line" style={{ maxWidth: 60 }} />
          </div>
          <h2
            className="display"
            style={{ fontSize: "clamp(28px, 3vw, 36px)", margin: 0, lineHeight: 1.05, letterSpacing: "-0.01em" }}
          >
            Pre-built <span style={{ fontStyle: "italic" }}>card stacks</span> for Canadian spend.
          </h2>
          <p
            className="serif"
            style={{ marginTop: 8, fontSize: 15, fontStyle: "italic", color: "var(--ink-2)", maxWidth: 640, lineHeight: 1.45 }}
          >
            Curated combinations from the highest-upvoted RFD and PFC stack threads. Each one solves
            a specific Canadian rewards problem (Costco-Amex blackout, Aeroplan elite chase, FX
            fees) instead of just maximising one card.
          </p>
        </div>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 16,
        }}
      >
        {TEMPLATES.map((t) => {
          const totalFee = t.cards.reduce((s, c) => s + c.feeCAD, 0);
          return (
            <article
              key={t.id}
              style={{
                border: "1px solid var(--rule)",
                borderRadius: 14,
                background: "var(--card-fill-strong)",
                padding: "22px 24px",
                boxShadow: "var(--shadow-1)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "radial-gradient(ellipse 50% 35% at 100% 0%, var(--accent-soft), transparent 70%)",
                  pointerEvents: "none",
                }}
              />
              <div style={{ position: "relative" }}>
                <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 6 }}>
                  {t.kicker}
                </div>
                <h3
                  className="display"
                  style={{
                    fontSize: 22,
                    margin: 0,
                    lineHeight: 1.2,
                    letterSpacing: "-0.005em",
                    color: "var(--ink)",
                  }}
                >
                  {t.title}
                </h3>
                <p
                  className="serif"
                  style={{
                    fontSize: 13,
                    fontStyle: "italic",
                    color: "var(--ink-3)",
                    marginTop: 4,
                    marginBottom: 14,
                  }}
                >
                  {t.audience}
                </p>

                <ul style={{ listStyle: "none", padding: 0, margin: 0, marginBottom: 14 }}>
                  {t.cards.map((c) => (
                    <li
                      key={c.name}
                      style={{
                        padding: "10px 0",
                        borderTop: "1px solid var(--rule)",
                        display: "grid",
                        gridTemplateColumns: "1fr auto",
                        gap: 10,
                        alignItems: "baseline",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div className="display" style={{ fontSize: 14, color: "var(--ink)" }}>
                          {c.name}
                        </div>
                        <div className="serif" style={{ fontSize: 12, fontStyle: "italic", color: "var(--ink-3)", marginTop: 2 }}>
                          {c.role}
                        </div>
                      </div>
                      <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.04em" }}>
                        {c.feeCAD === 0 ? "no fee" : `$${c.feeCAD}/yr`}
                      </div>
                    </li>
                  ))}
                </ul>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    padding: "10px 0",
                    borderTop: "1px solid var(--rule-strong)",
                    borderBottom: "1px solid var(--rule)",
                    marginBottom: 12,
                  }}
                >
                  <span className="eyebrow" style={{ fontSize: 9 }}>Combined annual fee</span>
                  <span className="mono" style={{ fontSize: 14, color: "var(--ink)", fontWeight: 600 }}>
                    {totalFee === 0 ? "Free" : `$${totalFee.toFixed(0)} CAD/yr`}
                  </span>
                </div>

                <p
                  className="serif"
                  style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5, marginTop: 0, marginBottom: t.caveats ? 10 : 14 }}
                >
                  {t.rationale}
                </p>
                {t.caveats && (
                  <p
                    className="serif"
                    style={{
                      fontSize: 12,
                      color: "var(--ink-3)",
                      fontStyle: "italic",
                      lineHeight: 1.45,
                      borderLeft: "2px solid var(--rule-strong)",
                      paddingLeft: 10,
                      marginTop: 0,
                      marginBottom: 14,
                    }}
                  >
                    Caveat — {t.caveats}
                  </p>
                )}

                <Link
                  href="/cards"
                  className="mono"
                  style={{
                    display: "inline-block",
                    padding: "10px 16px",
                    borderRadius: 999,
                    border: "1px solid var(--accent)",
                    color: "var(--accent)",
                    background: "transparent",
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.10em",
                    textTransform: "uppercase",
                    textDecoration: "none",
                  }}
                >
                  Add to wallet →
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
