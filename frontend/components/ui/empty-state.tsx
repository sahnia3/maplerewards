"use client";

import Link from "next/link";

interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  action?: {
    label: string;
    href: string;
  };
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`rounded-2xl p-10 text-center animate-fade-scale ${className}`}
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-dim)",
      }}
    >
      <div
        className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center text-3xl"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid var(--border-dim)",
        }}
      >
        {icon}
      </div>
      <h3
        className="text-[16px] font-semibold mb-1.5"
        style={{ color: "var(--text-primary)" }}
      >
        {title}
      </h3>
      <p
        className="text-[13px] max-w-xs mx-auto leading-relaxed"
        style={{ color: "var(--text-secondary)" }}
      >
        {description}
      </p>
      {action && (
        <Link
          href={action.href}
          className="inline-flex items-center gap-1.5 mt-5 px-5 py-2.5 rounded-xl text-[13px] font-semibold text-white maple-bg accent-glow transition-all hover:scale-[1.02]"
        >
          {action.label}
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            className="ml-0.5"
          >
            <path
              d="M6 4l4 4-4 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      )}
    </div>
  );
}

/** Preset empty states */
export function EmptyWallet() {
  return (
    <EmptyState
      icon="💳"
      title="No cards yet"
      description="Add your credit cards to start optimizing your rewards and tracking spend."
      action={{ label: "Browse cards", href: "/cards" }}
    />
  );
}

export function EmptySpendHistory() {
  return (
    <EmptyState
      icon="📊"
      title="No spend history"
      description="Log transactions from the optimizer to start tracking your rewards and building insights."
      action={{ label: "Start optimizing", href: "/optimizer" }}
    />
  );
}

export function EmptyResults() {
  return (
    <EmptyState
      icon="🔍"
      title="No results found"
      description="Try adjusting your search criteria or filters to find what you're looking for."
    />
  );
}

export function EmptyFeed() {
  return (
    <EmptyState
      icon="📰"
      title="No articles yet"
      description="Check back soon for rewards strategies, card reviews, and optimization tips."
    />
  );
}
