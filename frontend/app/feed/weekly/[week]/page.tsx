"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { listFeedArticles, type FeedArticle } from "@/lib/api";
import { PageMasthead } from "@/components/editorial/page-masthead";
import { LeafDivider } from "@/components/editorial/leaf-divider";

/**
 * /feed/weekly/[week] — weekly editorial digest of the Canadian rewards beat.
 *
 * The `week` param is an ISO-8601 week tag like "2026-W20" (week 20 of 2026)
 * or a shorthand "2026-20". The page filters the existing feed-aggregator
 * output to just that week, groups by category, and renders an editorial-
 * style brief that's shareable, archivable, and indexable.
 *
 * Why this exists: the /feed page is "everything, all the time". The weekly
 * URL is what you bookmark, what you share on Reddit, what compounds in
 * Google. One stable URL per week, forever.
 */
export default function WeeklyDigestPage({
  params,
}: {
  params: Promise<{ week: string }>;
}) {
  const { week } = use(params);
  const parsed = parseWeekParam(week);

  const [articles, setArticles] = useState<FeedArticle[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!parsed) return;
    listFeedArticles("all")
      .then((rows) => setArticles(rows))
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load feed"));
  }, [parsed]);

  if (!parsed) {
    return (
      <main style={{ padding: "60px 24px", textAlign: "center" }}>
        <h1 className="display" style={{ fontSize: 28, marginBottom: 12 }}>
          Unrecognized week format
        </h1>
        <p style={{ color: "var(--ink-2)" }}>
          Use the form <code>2026-W20</code> or <code>2026-20</code>.
        </p>
        <Link href="/feed" style={{ color: "var(--accent)" }}>
          ← Back to the feed
        </Link>
      </main>
    );
  }

  const weekStart = isoWeekStart(parsed.year, parsed.week);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6); // Sunday — the displayed end date

  // Half-open window [Monday 00:00, next-Monday 00:00). Computing the exclusive
  // upper bound directly from weekStart (rather than weekEnd + 1 day) avoids the
  // off-by-a-millisecond boundary where a next-Monday-midnight article could be
  // mis-bucketed. Articles from Sunday 23:59:59.999 still fall inside the window.
  const nextWeekStart = new Date(weekStart);
  nextWeekStart.setUTCDate(nextWeekStart.getUTCDate() + 7);

  const inWindow = (articles ?? []).filter((a) => {
    const t = new Date(a.published_at).getTime();
    return t >= weekStart.getTime() && t < nextWeekStart.getTime();
  });

  const byCategory: Record<string, FeedArticle[]> = {};
  inWindow.forEach((a) => {
    const k = a.category || "news";
    if (!byCategory[k]) byCategory[k] = [];
    byCategory[k].push(a);
  });

  return (
    <div className="reveal" style={{ paddingTop: 0 }}>
      <div
        style={{
          maxWidth: 880,
          margin: "0 auto",
          padding: "32px clamp(20px, 4vw, 60px) 80px",
        }}
      >
        <PageMasthead
          eyebrow="Weekly digest"
          eyebrowEnd={`${parsed.year} · Week ${parsed.week}`}
          title={
            <>
              The <span style={{ fontStyle: "italic" }}>week</span> in Canadian rewards.
            </>
          }
          lede={`Stories the Promo Sentinel, Issuer Watch, and curated newsroom flagged between ${fmtDate(weekStart)} and ${fmtDate(weekEnd)}.`}
        />

        <LeafDivider />

        {err && <p style={{ color: "var(--accent)" }}>{err}</p>}
        {!articles && !err && (
          <p className="eyebrow">LOADING…</p>
        )}

        {articles && inWindow.length === 0 && (
          <p style={{ color: "var(--ink-2)", fontStyle: "italic", padding: 32 }}>
            No published articles fell within this week. Try last week with the
            link below.
          </p>
        )}

        {articles && inWindow.length > 0 && (
          <div style={{ display: "grid", gap: 36 }}>
            {Object.entries(byCategory)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([cat, list]) => (
                <CategorySection key={cat} category={cat} articles={list} />
              ))}
          </div>
        )}

        <LeafDivider />

        <nav
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            paddingTop: 12,
          }}
        >
          <Link
            href={`/feed/weekly/${formatWeek(parsed.year, parsed.week - 1)}`}
            className="sans"
            style={navLinkStyle}
          >
            ← Previous week
          </Link>
          <Link href="/feed" className="sans" style={navLinkStyle}>
            All articles
          </Link>
          <Link
            href={`/feed/weekly/${formatWeek(parsed.year, parsed.week + 1)}`}
            className="sans"
            style={navLinkStyle}
          >
            Next week →
          </Link>
        </nav>
      </div>
      <style jsx global>{`
        /* Article title links read as plain headings until interacted with.
         * Give them a clear pointer cue + hover/focus affordance so users know
         * the headline is clickable and keyboard users get a visible focus. */
        .weekly-article-link {
          color: var(--ink);
          text-decoration: none;
          transition: color 160ms ease;
        }
        .weekly-article-link:hover {
          color: var(--accent);
          text-decoration: underline;
          text-underline-offset: 3px;
          text-decoration-thickness: 1px;
        }
        .weekly-article-link:focus-visible {
          color: var(--accent);
          outline: 2px solid var(--accent);
          outline-offset: 3px;
          border-radius: 2px;
        }
      `}</style>
    </div>
  );
}

function CategorySection({
  category,
  articles,
}: {
  category: string;
  articles: FeedArticle[];
}) {
  return (
    <section>
      <h2
        className="display"
        style={{
          fontSize: "clamp(22px, 2.6vw, 30px)",
          textTransform: "capitalize",
          marginBottom: 16,
        }}
      >
        {category.replace(/_/g, " ")}{" "}
        <span style={{ color: "var(--ink-3)", fontStyle: "italic" }}>
          · {articles.length} {articles.length === 1 ? "story" : "stories"}
        </span>
      </h2>
      <div style={{ display: "grid", gap: 16 }}>
        {articles.map((a) => (
          <article
            key={a.id}
            style={{
              borderTop: "1px solid var(--rule)",
              paddingTop: 16,
            }}
          >
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              {a.source} · {fmtDate(new Date(a.published_at))}
            </div>
            <h3
              className="display"
              style={{
                fontSize: 18,
                lineHeight: 1.3,
                marginBottom: 6,
              }}
            >
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="weekly-article-link"
              >
                {a.title}
              </a>
            </h3>
            <p
              className="serif"
              style={{
                fontSize: 14,
                color: "var(--ink-2)",
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              {a.excerpt}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

const navLinkStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--accent)",
  textDecoration: "none",
};

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function parseWeekParam(s: string): { year: number; week: number } | null {
  // Accept "2026-W20", "2026-20", "2026W20", or "2026W20". The character
  // class `[-W]*` (zero or more dashes/W's) covers all four variants.
  const m = s.match(/^(\d{4})[-W]*(\d{1,2})$/i);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const week = parseInt(m[2], 10);
  if (!Number.isFinite(year) || !Number.isFinite(week)) return null;
  if (week < 1 || week > 53) return null;
  return { year, week };
}

function formatWeek(year: number, week: number): string {
  let y = year;
  let w = week;
  if (w < 1) {
    y -= 1;
    w = 52;
  }
  if (w > 53) {
    y += 1;
    w = 1;
  }
  return `${y}-W${String(w).padStart(2, "0")}`;
}

// isoWeekStart returns the Monday of an ISO-8601 week number.
function isoWeekStart(year: number, week: number): Date {
  // ISO weeks: week 1 is the week containing the first Thursday of the year.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7; // 1..7, Mon..Sun
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const result = new Date(week1Monday);
  result.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return result;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
