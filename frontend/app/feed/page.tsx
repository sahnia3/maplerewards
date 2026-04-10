"use client";

import { useState } from "react";
import { ARTICLES } from "@/lib/articles";
import type { Article } from "@/lib/articles";
import { Clock, Tag, Zap, ArrowLeft, ChevronRight } from "lucide-react";
import { AnimatedList, AnimatedItem, AnimatedSection } from "@/components/ui/animated-list";
import { EmptyFeed } from "@/components/ui/empty-state";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

const CATEGORIES = [
  { slug: "all", label: "All", emoji: "\uD83D\uDCCB" },
  { slug: "guide", label: "Guides", emoji: "\uD83D\uDCD6" },
  { slug: "card", label: "Cards", emoji: "\uD83D\uDCB3" },
  { slug: "tip", label: "Tips", emoji: "\uD83D\uDCA1" },
  { slug: "news", label: "News", emoji: "\uD83D\uDCF0" },
] as const;

function ArticleCard({
  article,
  featured = false,
  onClick,
}: {
  article: Article;
  featured?: boolean;
  onClick: () => void;
}) {
  const dateStr = new Date(article.date).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div
      onClick={onClick}
      className={`rounded-2xl overflow-hidden cursor-pointer group hover-accent hover-lift ${
        featured ? "col-span-2" : ""
      }`}
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      {/* Emoji hero */}
      <div
        className={`flex items-center justify-center ${
          featured ? "h-36" : "h-24"
        }`}
        style={{
          background:
            "linear-gradient(135deg, rgba(13,148,136,0.08) 0%, rgba(8,9,14,0.6) 100%)",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <span className={featured ? "text-6xl" : "text-4xl"}>
          {article.emoji}
        </span>
      </div>

      <div className="p-4">
        {/* Meta row */}
        <div className="flex items-center gap-2 mb-2">
          <span
            className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
            style={{ background: "rgba(13,148,136,0.12)", color: "#0D9488" }}
          >
            {article.category}
          </span>
          <span
            className="flex items-center gap-1 text-[11px]"
            style={{ color: "rgba(255,255,255,0.3)" }}
          >
            <Clock size={10} />
            {article.readTime} min read
          </span>
          <span
            className="ml-auto text-[11px]"
            style={{ color: "rgba(255,255,255,0.25)" }}
          >
            {dateStr}
          </span>
        </div>

        <h3
          className={`font-bold leading-snug mb-2 group-hover:text-white transition-colors ${
            featured ? "text-lg" : "text-sm"
          }`}
          style={{ color: "rgba(255,255,255,0.9)" }}
        >
          {article.title}
        </h3>

        <p
          className={`leading-relaxed mb-3 ${
            featured ? "text-sm" : "text-xs"
          }`}
          style={{ color: "rgba(255,255,255,0.45)" }}
        >
          {article.excerpt}
        </p>

        {/* Tags + Read more */}
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap gap-1.5">
            {article.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  color: "rgba(255,255,255,0.4)",
                }}
              >
                <Tag size={8} />
                {tag}
              </span>
            ))}
          </div>
          <span
            className="flex items-center gap-0.5 text-[11px] font-medium shrink-0 ml-2"
            style={{ color: "#0D9488" }}
          >
            Read <ChevronRight size={12} />
          </span>
        </div>
      </div>
    </div>
  );
}

function ArticleReader({
  article,
  onBack,
}: {
  article: Article;
  onBack: () => void;
}) {
  const dateStr = new Date(article.date).toLocaleDateString("en-CA", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-[13px] font-medium mb-6 transition-opacity hover:opacity-70"
        style={{ color: "var(--text-secondary)" }}
      >
        <ArrowLeft size={14} />
        Back to feed
      </button>

      {/* Article hero */}
      <div
        className="rounded-2xl overflow-hidden mb-6"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-dim)",
        }}
      >
        <div
          className="flex items-center justify-center h-40"
          style={{
            background:
              "linear-gradient(135deg, rgba(13,148,136,0.10) 0%, rgba(8,9,14,0.8) 100%)",
            borderBottom: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <span className="text-7xl">{article.emoji}</span>
        </div>

        <div className="p-6">
          {/* Meta */}
          <div className="flex items-center gap-3 mb-3">
            <span
              className="text-[10px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full"
              style={{ background: "rgba(13,148,136,0.12)", color: "#0D9488" }}
            >
              {article.category}
            </span>
            <span
              className="flex items-center gap-1 text-[12px]"
              style={{ color: "var(--text-tertiary)" }}
            >
              <Clock size={11} />
              {article.readTime} min read
            </span>
            <span
              className="text-[12px]"
              style={{ color: "var(--text-tertiary)" }}
            >
              {dateStr}
            </span>
          </div>

          {/* Title */}
          <h1 className="text-[22px] font-bold text-white leading-tight mb-3">
            {article.title}
          </h1>

          {/* Excerpt */}
          <p
            className="text-[14px] leading-relaxed"
            style={{ color: "var(--text-secondary)" }}
          >
            {article.excerpt}
          </p>
        </div>
      </div>

      {/* Article body */}
      <div
        className="rounded-2xl p-6 mb-6"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-dim)",
        }}
      >
        <div className="prose prose-invert prose-sm max-w-none text-[14px] leading-relaxed [&>h2]:text-[17px] [&>h2]:font-bold [&>h2]:text-white [&>h2]:mt-8 [&>h2]:mb-3 [&>h3]:text-[15px] [&>h3]:font-semibold [&>h3]:text-white [&>h3]:mt-6 [&>h3]:mb-2 [&>p]:mb-3 [&>ul]:mb-3 [&>ol]:mb-3 [&>blockquote]:border-l-2 [&>blockquote]:border-[#0D9488] [&>blockquote]:pl-4 [&>blockquote]:italic [&>blockquote]:text-[var(--text-secondary)] [&_table]:w-full [&_table]:text-[13px] [&_th]:text-left [&_th]:text-white [&_th]:font-semibold [&_th]:pb-2 [&_th]:pr-4 [&_td]:py-1.5 [&_td]:pr-4 [&_td]:border-t [&_td]:border-white/5 [&_strong]:text-white [&_a]:text-[#0D9488] [&>h2:first-child]:mt-0">
          <ReactMarkdown>{article.body}</ReactMarkdown>
        </div>
      </div>

      {/* Related cards */}
      {article.relatedCards && article.relatedCards.length > 0 && (
        <div
          className="rounded-2xl p-5 mb-6"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-dim)",
          }}
        >
          <h3 className="text-[13px] font-semibold text-white mb-3">
            Related Cards
          </h3>
          <div className="flex flex-wrap gap-2">
            {article.relatedCards.map((card) => (
              <Link
                key={card}
                href={`/cards?q=${encodeURIComponent(card)}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all hover:scale-[1.02]"
                style={{
                  background: "rgba(13,148,136,0.08)",
                  border: "1px solid rgba(13,148,136,0.18)",
                  color: "#14B8A6",
                }}
              >
                <span className="text-[10px]">💳</span>
                {card}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Tags */}
      <div className="flex flex-wrap gap-2 mb-6">
        {article.tags.map((tag) => (
          <span
            key={tag}
            className="text-[11px] px-2.5 py-1 rounded-full flex items-center gap-1"
            style={{
              background: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.4)",
            }}
          >
            <Tag size={9} />
            {tag}
          </span>
        ))}
      </div>

      {/* Back to feed */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-[13px] font-medium transition-opacity hover:opacity-70"
        style={{ color: "var(--text-secondary)" }}
      >
        <ArrowLeft size={14} />
        Back to feed
      </button>
    </motion.div>
  );
}

export default function FeedPage() {
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [openArticle, setOpenArticle] = useState<Article | null>(null);

  const filtered =
    activeCategory === "all"
      ? ARTICLES
      : ARTICLES.filter((a) => a.category === activeCategory);

  const [featured, ...rest] = filtered;

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Ambient */}
      <div
        className="orb w-[400px] h-[250px] top-[-80px] left-[-50px]"
        style={{
          background:
            "radial-gradient(ellipse, rgba(13,148,136,0.06) 0%, transparent 70%)",
        }}
      />

      <div className="relative max-w-[760px] mx-auto px-6 pt-8 pb-24">
        <AnimatePresence mode="wait">
          {openArticle ? (
            <ArticleReader
              key="reader"
              article={openArticle}
              onBack={() => setOpenArticle(null)}
            />
          ) : (
            <motion.div
              key="feed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {/* Header */}
              <AnimatedSection>
                <p
                  className="label-xs mb-1.5"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  Feed
                </p>
                <h1 className="title text-white mb-1">Rewards Intelligence</h1>
                <p
                  className="text-[14px]"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Guides, tips, and card news to maximize your rewards
                </p>
              </AnimatedSection>

              {/* Quick tip banner */}
              <AnimatedSection delay={0.05}>
                <div
                  className="rounded-2xl p-4 mt-6 mb-7 flex items-start gap-3 hover-accent"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(13,148,136,0.10) 0%, rgba(8,9,14,0.8) 100%)",
                    border: "1px solid rgba(13,148,136,0.20)",
                  }}
                >
                  <Zap
                    size={16}
                    className="mt-0.5 shrink-0"
                    style={{ color: "#0D9488" }}
                  />
                  <div>
                    <p className="text-[13px] font-semibold text-white mb-0.5">
                      Tip of the day
                    </p>
                    <p
                      className="text-[12px]"
                      style={{ color: "rgba(255,255,255,0.55)" }}
                    >
                      Transferring Amex MR points to Aeroplan for business class
                      flights can yield 3\u20135\u00A2 per point \u2014 3\u00D7 more than booking
                      through Amex Travel.
                    </p>
                  </div>
                </div>
              </AnimatedSection>

              {/* Category filter pills */}
              <AnimatedSection delay={0.1}>
                <div className="flex gap-2 overflow-x-auto pb-1 mb-6 scroll-x">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.slug}
                      onClick={() => setActiveCategory(cat.slug)}
                      className={`pill-btn ${
                        activeCategory === cat.slug ? "active" : ""
                      }`}
                      style={
                        activeCategory === cat.slug
                          ? {
                              background: "#0D9488",
                              color: "white",
                              borderColor: "#0D9488",
                            }
                          : undefined
                      }
                    >
                      <span>{cat.emoji}</span>
                      {cat.label}
                    </button>
                  ))}
                </div>
              </AnimatedSection>

              {/* Article count */}
              <p
                className="text-[12px] mb-4"
                style={{ color: "var(--text-tertiary)" }}
              >
                {filtered.length} article{filtered.length !== 1 ? "s" : ""}
              </p>

              {/* Articles grid */}
              {filtered.length === 0 ? (
                <EmptyFeed />
              ) : (
                <AnimatedList className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {featured && (
                    <AnimatedItem>
                      <ArticleCard
                        article={featured}
                        featured
                        onClick={() => setOpenArticle(featured)}
                      />
                    </AnimatedItem>
                  )}
                  {rest.map((article) => (
                    <AnimatedItem key={article.slug}>
                      <ArticleCard
                        article={article}
                        onClick={() => setOpenArticle(article)}
                      />
                    </AnimatedItem>
                  ))}
                </AnimatedList>
              )}

              {/* Footer note */}
              <p
                className="text-center text-[11px] mt-10"
                style={{ color: "rgba(255,255,255,0.2)" }}
              >
                All point values are estimates. Verify with your card issuer
                before redeeming.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
