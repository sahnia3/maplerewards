"use client";

import { useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { ARTICLES, articleCover, articleCoverFallback } from "@/lib/articles";
import type { Article } from "@/lib/articles";
import { PageMasthead } from "@/components/editorial/page-masthead";
import { LeafDivider } from "@/components/editorial/leaf-divider";

const CATEGORIES = [
  { slug: "all",   label: "All" },
  { slug: "guide", label: "Guides" },
  { slug: "card",  label: "Cards" },
  { slug: "tip",   label: "Tips" },
  { slug: "news",  label: "News" },
] as const;

type CatSlug = (typeof CATEGORIES)[number]["slug"];

export default function FeedPage() {
  const [filter, setFilter] = useState<CatSlug>("all");
  const [open, setOpen] = useState<Article | null>(null);

  const filtered = filter === "all" ? ARTICLES : ARTICLES.filter((a) => a.category === filter);
  const lead = filtered[0];
  const rest = filtered.slice(1);

  if (open) {
    return <ArticleView article={open} onClose={() => setOpen(null)} />;
  }

  return (
    <div className="reveal" style={{ paddingTop: 0 }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px clamp(20px, 4vw, 60px) 80px" }}>
        <PageMasthead
          eyebrow="Feed"
          eyebrowEnd={`${ARTICLES.length} essays · CAD`}
          title={
            <>
              The <span style={{ fontStyle: "italic" }}>maple</span> dispatch.
            </>
          }
          lede="Long-form essays, sweet-spot guides, and quarterly devaluation watches — written for Canadian rewards power-users."
        />

        {/* Filter pills */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 32 }}>
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
                  border: `1px solid ${active ? "var(--accent)" : "var(--rule)"}`,
                  background: active ? "var(--accent)" : "transparent",
                  color: active ? "#fff" : "var(--ink-2)",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        {/* Lead article — full-width hero photo + masthead text */}
        {lead && (
          <article
            onClick={() => setOpen(lead)}
            className="feed-lead"
            style={{
              borderTop: "1px solid var(--ink)",
              borderBottom: "1px solid var(--rule)",
              paddingBottom: 36,
              marginBottom: 18,
              cursor: "pointer",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={articleCover(lead)}
              alt={lead.title}
              loading="eager"
              onError={(e) => {
                const t = e.currentTarget;
                if (!t.dataset.fallback) { t.dataset.fallback = "1"; t.src = articleCoverFallback(lead.slug); }
              }}
              style={{
                display: "block",
                width: "100%",
                aspectRatio: "16 / 9",
                objectFit: "cover",
                marginTop: 22,
                borderRadius: 14,
                boxShadow: "var(--shadow-1)",
              }}
            />
            <div style={{ paddingTop: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
                <span className="eyebrow" style={{ color: "var(--accent)" }}>{lead.category}</span>
                <span className="mr-kicker-line" style={{ maxWidth: 80 }} />
                <span className="eyebrow">
                  {new Date(lead.date).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}
                </span>
                <span className="eyebrow">·</span>
                <span className="eyebrow">{lead.readTime}m read</span>
              </div>
              <h2
                className="display"
                style={{
                  fontSize: "clamp(32px, 4vw, 52px)",
                  margin: 0,
                  lineHeight: 0.96,
                  letterSpacing: "-0.015em",
                  maxWidth: 920,
                }}
              >
                {lead.title}
              </h2>
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
                {lead.excerpt}
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
                {lead.tags.map((t) => (
                  <span
                    key={t}
                    className="mono"
                    style={{
                      fontSize: 10,
                      color: "var(--ink-3)",
                      letterSpacing: "0.10em",
                      textTransform: "uppercase",
                    }}
                  >
                    #{t}
                  </span>
                ))}
              </div>
            </div>
          </article>
        )}

        {/* Article ledger — thumbnail + category + title/excerpt + date + read time */}
        <div style={{ borderTop: "1px solid var(--rule)" }}>
          {rest.map((a, i) => (
            <article
              key={a.slug}
              onClick={() => setOpen(a)}
              className="feed-row"
              style={{
                display: "grid",
                gridTemplateColumns: "92px 70px 1fr 100px 80px",
                alignItems: "center",
                gap: 18,
                padding: "16px 4px",
                borderTop: i > 0 ? "1px solid var(--rule)" : "none",
                cursor: "pointer",
                transition: "background 160ms",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--card-fill)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div
                style={{
                  width: 92,
                  height: 64,
                  borderRadius: 8,
                  overflow: "hidden",
                  border: "1px solid var(--rule)",
                  background: "var(--card-fill)",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={articleCover(a)}
                  alt={a.title}
                  loading="lazy"
                  onError={(e) => {
                    const t = e.currentTarget;
                    if (!t.dataset.fallback) { t.dataset.fallback = "1"; t.src = articleCoverFallback(a.slug); }
                  }}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              </div>
              <div className="mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.10em", textTransform: "uppercase" }}>
                {a.category}
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
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {a.title}
                </h3>
                <p
                  className="serif"
                  style={{
                    marginTop: 3,
                    fontSize: 13,
                    fontStyle: "italic",
                    color: "var(--ink-3)",
                    lineHeight: 1.4,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {a.excerpt}
                </p>
              </div>
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.04em" }}>
                {new Date(a.date).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}
              </div>
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", textAlign: "right", letterSpacing: "0.04em" }}>
                {a.readTime} min →
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Article reading view ─────────────────────────────────────────────── */
function ArticleView({ article, onClose }: { article: Article; onClose: () => void }) {
  return (
    <div className="reveal" style={{ paddingTop: 0 }}>
      <div style={{ maxWidth: 740, margin: "0 auto", padding: "24px clamp(20px, 3vw, 40px) 80px" }}>
        <button
          onClick={onClose}
          className="mono"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 24,
            fontSize: 11,
            color: "var(--ink-3)",
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
          ← Back to dispatch
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          <span className="eyebrow" style={{ color: "var(--accent)" }}>{article.category}</span>
          <span className="mr-kicker-line" style={{ maxWidth: 80 }} />
          <span className="eyebrow">
            {new Date(article.date).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" })}
          </span>
          <span className="eyebrow">·</span>
          <span className="eyebrow">{article.readTime} min read</span>
        </div>

        {/* Cover photo — sits between the kicker line and the title */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={articleCover(article)}
          alt={article.title}
          loading="eager"
          onError={(e) => {
            const t = e.currentTarget;
            if (!t.dataset.fallback) { t.dataset.fallback = "1"; t.src = articleCoverFallback(article.slug); }
          }}
          style={{
            display: "block",
            width: "100%",
            aspectRatio: "16 / 9",
            objectFit: "cover",
            borderRadius: 14,
            margin: "20px 0 24px",
            boxShadow: "var(--shadow-1)",
          }}
        />

        <h1
          className="display"
          style={{ fontSize: "clamp(36px, 4.5vw, 52px)", margin: 0, lineHeight: 1, letterSpacing: "-0.015em" }}
        >
          {article.title}
        </h1>

        <p
          className="serif"
          style={{
            marginTop: 18,
            fontSize: 19,
            fontStyle: "italic",
            color: "var(--ink-2)",
            lineHeight: 1.4,
            paddingBottom: 24,
            borderBottom: "1px solid var(--rule)",
          }}
        >
          {article.excerpt}
        </p>

        <div className="serif article-body" style={{ fontSize: 17, color: "var(--ink-2)", lineHeight: 1.7, marginTop: 28 }}>
          <ReactMarkdown>{article.body}</ReactMarkdown>
        </div>

        <LeafDivider />

        {article.relatedCards && article.relatedCards.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <span className="eyebrow">Related cards</span>
            <ul style={{ marginTop: 12, padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: 8 }}>
              {article.relatedCards.map((c) => (
                <li key={c}>
                  <Link
                    href="/cards"
                    className="mono"
                    style={{
                      display: "inline-block",
                      padding: "8px 14px",
                      border: "1px solid var(--rule)",
                      borderRadius: 999,
                      fontSize: 11,
                      color: "var(--ink-2)",
                      letterSpacing: "0.04em",
                      textDecoration: "none",
                    }}
                  >
                    {c}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <style jsx global>{`
        .article-body h2 { font-family: var(--font-display); font-size: 30px; margin: 38px 0 14px; letter-spacing: -0.01em; color: var(--ink); }
        .article-body h3 { font-family: var(--font-display); font-size: 22px; margin: 28px 0 10px; color: var(--ink); }
        .article-body p { margin: 0 0 16px; }
        .article-body ul, .article-body ol { padding-left: 20px; margin: 0 0 16px; }
        .article-body li { margin: 4px 0; }
        .article-body strong { color: var(--ink); font-weight: 500; }
        .article-body a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
        .article-body code { font-family: var(--font-mono); font-size: 14px; background: var(--card-fill); padding: 2px 6px; border-radius: 4px; }
        .article-body blockquote { border-left: 2px solid var(--accent); padding-left: 18px; margin: 22px 0; color: var(--ink-2); font-style: italic; }
      `}</style>
    </div>
  );
}
