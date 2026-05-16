"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { ExternalLink, AlertTriangle, RefreshCw } from "lucide-react";
import { listFeedArticles, type FeedArticle, type FeedCategory } from "@/lib/api";
import { PageMasthead } from "@/components/editorial/page-masthead";

/* Live feed — replaces the prior hardcoded ARTICLES list with a real
 * RSS aggregator backed by GET /api/v1/feed/articles. Every article links
 * externally to the source. No in-app reader.
 *
 * Image strategy: if the feed item carries an image, use it; otherwise
 * fall back to a category-themed gradient placeholder. Cheap, brand-on,
 * never blocks rendering. */

const CATEGORIES: { slug: FeedCategory; label: string }[] = [
  { slug: "all",         label: "All" },
  { slug: "devaluation", label: "Devaluations" },
  { slug: "bonus",       label: "Bonuses" },
  { slug: "offer",       label: "Offers" },
  { slug: "guide",       label: "Guides" },
  { slug: "news",        label: "News" },
];

/* Category gradient stops, used when an article has no image. Each
 * leans on the brand palette but distinguishes one bucket from another
 * so a list of placeholders doesn't read as "broken". */
const CATEGORY_GRADIENT: Record<FeedArticle["category"], string> = {
  devaluation: "linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 60%, #2A0E12 100%)",
  bonus:       "linear-gradient(135deg, var(--gold) 0%, #8B5A1E 70%, #3A2A0E 100%)",
  offer:       "linear-gradient(135deg, var(--info) 0%, #0E3F3D 70%, #0A1A1A 100%)",
  guide:       "linear-gradient(135deg, var(--primary-2) 0%, var(--primary) 70%, #06120F 100%)",
  news:        "linear-gradient(135deg, var(--ink-3) 0%, var(--ink-2) 60%, var(--ink) 100%)",
};

const CATEGORY_LABEL: Record<FeedArticle["category"], string> = {
  devaluation: "Devaluation",
  bonus:       "Welcome bonus",
  offer:       "Offer",
  guide:       "Guide",
  news:        "News",
};

export default function FeedPage() {
  const [articles, setArticles] = useState<FeedArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FeedCategory>("all");

  const load = useCallback(async (cat: FeedCategory) => {
    setLoading(true);
    setError(null);
    try {
      const res = await listFeedArticles(cat);
      setArticles(res ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not load articles";
      setError(msg);
      setArticles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(filter); }, [filter, load]);

  const lead = articles[0];
  const rest = articles.slice(1);

  return (
    <div className="reveal" style={{ paddingTop: 0 }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px clamp(20px, 4vw, 60px) 80px" }}>
        {/* Editorial banner */}
        <figure
          style={{
            position: "relative",
            margin: "0 0 36px",
            borderRadius: 14,
            overflow: "hidden",
            border: "1px solid var(--rule)",
          }}
        >
          <div style={{ position: "relative", width: "100%", aspectRatio: "21 / 9" }}>
            <Image
              src="/brand/hero-aerial-canada.png"
              alt=""
              aria-hidden
              fill
              priority
              sizes="100vw"
              style={{ objectFit: "cover", display: "block" }}
            />
          </div>
          <div
            style={{
              position: "absolute",
              inset: "auto 0 0 0",
              padding: "60px 24px 18px",
              background:
                "linear-gradient(to top, rgba(26,20,16,0.78) 0%, rgba(26,20,16,0.45) 45%, transparent 100%)",
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 16,
              color: "var(--cream, #FBF7EE)",
            }}
          >
            <span className="mono" style={{ fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", opacity: 0.9 }}>
              Dispatch · Live feed
            </span>
            <span className="mono" style={{ fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", opacity: 0.65 }}>
              {articles.length > 0 ? `${articles.length} articles · refreshed hourly` : "Loading"}
            </span>
          </div>
        </figure>

        <PageMasthead
          eyebrow="Feed"
          eyebrowEnd="Real time"
          title={<>The <span style={{ fontStyle: "italic" }}>maple</span> dispatch.</>}
          lede="Live RSS from Prince of Travel, Milesopedia, Doctor of Credit, The Points Guy, One Mile at a Time, View From The Wing, and three card-focused subreddits. Devaluations, bonuses, offers — refreshed every two hours."
        />

        {/* Filter pills + refresh */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 32 }}>
          {CATEGORIES.map((c) => {
            const active = filter === c.slug;
            return (
              <button
                key={c.slug}
                type="button"
                onClick={() => setFilter(c.slug)}
                className="mono"
                style={{
                  padding: "6px 14px",
                  borderRadius: 999,
                  border: `1px solid ${active ? "var(--accent)" : "var(--rule-strong)"}`,
                  background: active ? "var(--accent)" : "transparent",
                  color: active ? "#fff" : "var(--ink-2)",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  boxShadow: active ? "var(--shadow-accent-glow)" : "none",
                  transition:
                    "background 220ms cubic-bezier(0.16, 1, 0.3, 1), color 220ms cubic-bezier(0.16, 1, 0.3, 1), border-color 220ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 220ms cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              >
                {c.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => load(filter)}
            disabled={loading}
            className="mono"
            title="Refresh"
            aria-label="Refresh feed"
            style={{
              marginLeft: "auto",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 999,
              border: "1px solid var(--rule-strong)",
              background: "transparent",
              color: "var(--ink-3)",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.5 : 1,
            }}
          >
            <RefreshCw size={12} strokeWidth={2} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {/* States */}
        {loading && articles.length === 0 ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={() => load(filter)} />
        ) : articles.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          <>
            {lead && <LeadArticle a={lead} />}
            <div style={{ borderTop: "1px solid var(--rule)" }}>
              {rest.map((a, i) => (
                <RowArticle key={a.id} a={a} isFirst={i === 0} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Lead (largest item) ───────────────────────────────────────────────── */

function LeadArticle({ a }: { a: FeedArticle }) {
  return (
    <a
      href={a.url}
      target="_blank"
      rel="noopener noreferrer"
      className="feed-lead"
      style={{
        display: "block",
        borderTop: "1px solid var(--ink)",
        borderBottom: "1px solid var(--rule)",
        paddingBottom: 36,
        marginBottom: 18,
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <ArticleImage a={a} aspect="16 / 9" eager />
      <div style={{ paddingTop: 24 }}>
        <ArticleEyebrow a={a} />
        <h2
          className="display"
          style={{
            fontSize: "clamp(32px, 4vw, 52px)",
            margin: 0,
            lineHeight: 0.96,
            letterSpacing: "-0.015em",
            maxWidth: 920,
            color: "var(--ink)",
          }}
        >
          {a.title}
        </h2>
        {a.excerpt && (
          <p
            className="serif"
            style={{
              marginTop: 14,
              fontSize: 18,
              fontStyle: "italic",
              color: "var(--ink-2)",
              lineHeight: 1.45,
              maxWidth: 720,
            }}
          >
            {a.excerpt}
          </p>
        )}
        <div
          className="mono"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            marginTop: 18,
            fontSize: 10,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            color: "var(--accent)",
          }}
        >
          Read on {a.source} <ExternalLink size={11} strokeWidth={2} />
        </div>
      </div>
    </a>
  );
}

/* ── Ledger row ────────────────────────────────────────────────────────── */

function RowArticle({ a, isFirst }: { a: FeedArticle; isFirst: boolean }) {
  return (
    <a
      href={a.url}
      target="_blank"
      rel="noopener noreferrer"
      className="feed-row"
      style={{
        display: "grid",
        gridTemplateColumns: "92px 80px 1fr 100px 70px",
        alignItems: "center",
        gap: 18,
        padding: "16px 4px",
        borderTop: isFirst ? "none" : "1px solid var(--rule)",
        cursor: "pointer",
        textDecoration: "none",
        color: "inherit",
        transition: "background 160ms",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--card-fill)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <ArticleImage a={a} aspect="92 / 64" small />
      <div className="mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.10em", textTransform: "uppercase" }}>
        {CATEGORY_LABEL[a.category]}
      </div>
      <div style={{ minWidth: 0 }}>
        <h3
          className="display"
          style={{
            fontSize: 20,
            margin: 0,
            lineHeight: 1.15,
            letterSpacing: "-0.005em",
            color: "var(--ink)",
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {a.title}
        </h3>
        {a.excerpt && (
          <p
            className="serif"
            style={{
              marginTop: 4,
              fontSize: 13,
              fontStyle: "italic",
              color: "var(--ink-3)",
              lineHeight: 1.4,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 1,
              WebkitBoxOrient: "vertical",
            }}
          >
            {a.excerpt}
          </p>
        )}
      </div>
      <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.04em" }}>
        {a.source}
      </div>
      <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", textAlign: "right", letterSpacing: "0.04em" }}>
        {relativeTime(a.published_at)}
      </div>
    </a>
  );
}

/* ── Shared: image (real or category-themed gradient placeholder) ────── */

function ArticleImage({
  a,
  aspect,
  small = false,
  eager = false,
}: {
  a: FeedArticle;
  aspect: string;
  small?: boolean;
  eager?: boolean;
}) {
  if (a.image_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={a.image_url}
        alt={a.title}
        loading={eager ? "eager" : "lazy"}
        referrerPolicy="no-referrer"
        onError={(e) => {
          // If the cross-origin image fails (hotlink protection / cors),
          // hide it — the parent shows the gradient placeholder via its
          // own fallback styling below.
          const t = e.currentTarget;
          t.style.display = "none";
          const parent = t.parentElement;
          if (parent) parent.style.background = CATEGORY_GRADIENT[a.category];
        }}
        style={{
          display: "block",
          width: small ? 92 : "100%",
          height: small ? 64 : "auto",
          aspectRatio: aspect,
          objectFit: "cover",
          borderRadius: small ? 8 : 14,
          marginTop: small ? 0 : 22,
          boxShadow: small ? "none" : "var(--shadow-1)",
          border: small ? "1px solid var(--rule)" : "none",
        }}
      />
    );
  }
  /* No image — gradient placeholder with the category color. */
  return (
    <div
      aria-hidden
      style={{
        width: small ? 92 : "100%",
        height: small ? 64 : "auto",
        aspectRatio: aspect,
        background: CATEGORY_GRADIENT[a.category],
        borderRadius: small ? 8 : 14,
        marginTop: small ? 0 : 22,
        boxShadow: small ? "none" : "var(--shadow-1)",
        border: small ? "1px solid var(--rule)" : "none",
      }}
    />
  );
}

function ArticleEyebrow({ a }: { a: FeedArticle }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
      <span className="eyebrow" style={{ color: "var(--accent)" }}>{CATEGORY_LABEL[a.category]}</span>
      <span className="mr-kicker-line" style={{ maxWidth: 80 }} />
      <span className="eyebrow">{a.source}</span>
      <span className="eyebrow">·</span>
      <span className="eyebrow">{relativeTime(a.published_at)}</span>
    </div>
  );
}

/* ── States ────────────────────────────────────────────────────────────── */

function LoadingState() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="shimmer" style={{ width: "100%", aspectRatio: "16/9", borderRadius: 14, maxHeight: 320 }} />
      <div className="shimmer" style={{ height: 24, width: "70%", borderRadius: 4 }} />
      <div className="shimmer" style={{ height: 16, width: "55%", borderRadius: 4 }} />
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      style={{
        background: "var(--card-fill)",
        border: "1px solid var(--accent)",
        borderRadius: 14,
        padding: "44px 28px",
        textAlign: "center",
        boxShadow: "var(--shadow-1)",
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 999,
          margin: "0 auto 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--accent-wash)",
          border: "1px solid var(--accent-soft)",
          color: "var(--accent)",
        }}
      >
        <AlertTriangle size={22} strokeWidth={1.5} />
      </div>
      <h2 className="display" style={{ fontSize: 22, fontStyle: "italic", color: "var(--ink)", margin: 0, lineHeight: 1.2 }}>
        Could not load the feed
      </h2>
      <p className="serif" style={{ fontSize: 14, fontStyle: "italic", color: "var(--ink-2)", marginTop: 8, lineHeight: 1.55 }}>
        {message}
      </p>
      <button
        onClick={onRetry}
        className="btn btn-primary"
        style={{ marginTop: 20, fontSize: 12, height: 38 }}
      >
        Try again
      </button>
    </div>
  );
}

function EmptyState({ filter }: { filter: FeedCategory }) {
  return (
    <div
      style={{
        background: "var(--card-fill)",
        border: "1px solid var(--rule)",
        borderRadius: 14,
        padding: "44px 28px",
        textAlign: "center",
        boxShadow: "var(--shadow-1)",
      }}
    >
      <p className="serif" style={{ fontSize: 16, fontStyle: "italic", color: "var(--ink-2)" }}>
        No articles in the <span style={{ color: "var(--ink)", fontStyle: "normal" }}>{filter}</span> bucket right now. Check back in a couple of hours — the feed refreshes every two.
      </p>
    </div>
  );
}

/* ── Utilities ─────────────────────────────────────────────────────────── */

function relativeTime(iso: string): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const now = Date.now();
  const diff = Math.max(0, now - t);
  const min = Math.floor(diff / 60_000);
  const hr  = Math.floor(diff / 3_600_000);
  const day = Math.floor(diff / 86_400_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  if (hr < 24)  return `${hr}h ago`;
  if (day < 7)  return `${day}d ago`;
  return new Date(t).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}
