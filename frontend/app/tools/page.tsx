import Link from "next/link";
import { PageMasthead } from "@/components/editorial/page-masthead";
import { LeafDivider } from "@/components/editorial/leaf-divider";

// Current ISO-8601 week (e.g. "2026-W21"), so the weekly-digest link tracks
// the present week instead of a hardcoded one that drifts into the past.
function currentISOWeek(): string {
  const d = new Date();
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((date.getTime() - firstThursday.getTime()) / 86400000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7,
    );
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export const metadata = {
  title: "Tools — Maple Rewards",
  description:
    "Free Canadian rewards calculators, comparisons, and live data widgets from Maple Rewards.",
};

/**
 * /tools — directory of every public utility the product exposes.
 *
 * Each tile is a self-contained tool a user can run without signing in:
 *   - head-to-head card compare
 *   - points → CAD converter
 *   - weekly news digest archive
 *   - active transfer-bonus promos
 *   - embeddable CPP badge
 *
 * Server component so it renders straight from the layout — no JS needed.
 */
export default function ToolsIndexPage() {
  return (
    <div className="reveal" style={{ paddingTop: 0 }}>
      <div
        style={{
          maxWidth: 1080,
          margin: "0 auto",
          padding: "32px clamp(20px, 4vw, 60px) 80px",
        }}
      >
        <PageMasthead
          eyebrow="Tools"
          eyebrowEnd="All free · No sign-in"
          title={
            <>
              The <span style={{ fontStyle: "italic" }}>working</span> toolkit.
            </>
          }
          lede="Public utilities that solve one specific question fast — all free to use, no signup required."
        />

        <LeafDivider />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 18,
          }}
        >
          {/* TODO(2026-06-02): retire/repoint this tile — the June 1, 2026 Aeroplan
              long-haul business hike has passed, so this tool is now stale. */}
          <ToolCard
            href="/tools/aeroplan-june-1"
            eyebrow="Devaluation watch"
            title="Beat the June 1 Aeroplan hike"
            body="Long-haul Aeroplan business class goes up ~17% on June 1, 2026. Filter to your home airport and see the routings cheapest to lock in before the change."
            cta="See what to lock in →"
          />
          <ToolCard
            href="/compare/amex-cobalt/cibc-aventura-gold-visa"
            eyebrow="Head-to-head"
            title="Compare any two cards"
            body="Side-by-side spec sheet for every Canadian card pair. Annual fee, welcome bonus, multipliers per category, transfer partners — all in one page."
            cta="Try it →"
          />
          <ToolCard
            href="/tools/points-to-cad"
            eyebrow="Calculator"
            title="What are your points worth?"
            body="Pick a Canadian loyalty program, type in a balance, instantly see the CAD value at the program's base CPP. 27 programs covered."
            cta="Convert points →"
          />
          <ToolCard
            href="/promos"
            eyebrow="Promo Sentinel"
            title="Active transfer-bonus promos"
            body="Live-detected loyalty-program transfer bonuses across Canadian rewards. Updated every 12h from a curated set of rewards-news sources."
            cta="See active promos →"
          />
          <ToolCard
            href={`/feed/weekly/${currentISOWeek()}`}
            eyebrow="Editorial digest"
            title="This week in Canadian rewards"
            body="Every devaluation, every bonus, every issuer change — grouped by week so you can scan what mattered. One stable URL per ISO-8601 week."
            cta="Open this week →"
          />
          <ToolCard
            href="/cards"
            eyebrow="Catalog"
            title="Every Canadian card"
            body="All 104 cards we model — filter by issuer, network, fee tier. Pair this with the head-to-head picker on the same page to dig into specifics."
            cta="Browse the catalog →"
          />
        </div>
      </div>
    </div>
  );
}

function ToolCard({
  href,
  eyebrow,
  title,
  body,
  cta,
}: {
  href: string;
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "block",
        padding: 22,
        background: "var(--paper)",
        border: "1px solid var(--rule)",
        borderRadius: 12,
        textDecoration: "none",
        color: "var(--ink)",
        transition: "border-color 220ms cubic-bezier(0.16,1,0.3,1)",
      }}
    >
      <div
        className="eyebrow"
        style={{ color: "var(--accent)", marginBottom: 8 }}
      >
        {eyebrow}
      </div>
      <h3
        className="display"
        style={{
          fontSize: 22,
          lineHeight: 1.2,
          margin: "0 0 10px",
        }}
      >
        {title}
      </h3>
      <p
        className="serif"
        style={{
          fontSize: 14,
          color: "var(--ink-2)",
          lineHeight: 1.5,
          margin: "0 0 14px",
        }}
      >
        {body}
      </p>
      <span
        className="mono"
        style={{
          fontSize: 11,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--accent)",
        }}
      >
        {cta}
      </span>
    </Link>
  );
}
