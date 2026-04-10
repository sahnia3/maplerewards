"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Zap,
  CreditCard,
  Star,
  MessageCircle,
  Plane,
  ArrowUpRight,
  TrendingUp,
} from "lucide-react";
import { useSession } from "@/contexts/session-context";
import { useWallet } from "@/contexts/wallet-context";
import { useAuth } from "@/contexts/auth-context";
import { getWalletSummary, getSpendHistory } from "@/lib/api";
import type { WalletSummary, SpendEntry } from "@/lib/types";
import { AnimatedCounter } from "@/components/motion/counter";
import { AnimatedSection } from "@/components/ui/animated-list";

/* ── Helpers ──────────────────────────────────────────────────────── */

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function fmtCAD(v: number) {
  return `$${v.toFixed(2)}`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
  });
}

const CAT_ICONS: Record<string, string> = {
  groceries: "🛒", dining: "🍽️", travel: "✈️", gas: "⛽", transit: "🚇",
  entertainment: "🎬", streaming: "📺", pharmacy: "💊", "foreign-currency": "💱",
  "everything-else": "💳",
};

/* ── Quick actions ────────────────────────────────────────────────── */

const QUICK_ACTIONS = [
  { href: "/optimizer",    label: "Optimize",    icon: Zap,            color: "#14B8A6" },
  { href: "/cards",        label: "Add Card",    icon: CreditCard,     color: "#14B8A6" },
  { href: "/trip-planner", label: "Plan Trip",   icon: Plane,          color: "#F59E0B" },
  { href: "/chat",         label: "Ask AI",      icon: MessageCircle,  color: "#A78BFA" },
];

/* ── Page ─────────────────────────────────────────────────────────── */

export default function HomePage() {
  const router = useRouter();
  const { sessionId, isReady } = useSession();
  const { wallet, isLoading: walletLoading } = useWallet();
  const { user, isAuthenticated } = useAuth();
  const [walletSummary, setWalletSummary] = useState<WalletSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [recentSpend, setRecentSpend] = useState<SpendEntry[]>([]);
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (!isReady || walletLoading || redirectedRef.current) return;
    if (wallet.length === 0) {
      redirectedRef.current = true;
      router.replace("/onboarding");
    }
  }, [isReady, walletLoading, wallet.length, router]);

  const loadDashboardData = useCallback(async () => {
    if (!isReady || !sessionId) return;
    setSummaryLoading(true);
    try {
      const [summary, spend] = await Promise.all([
        getWalletSummary(sessionId),
        getSpendHistory(sessionId, 5, 0).catch(() => []),
      ]);
      setWalletSummary(summary);
      setRecentSpend(spend ?? []);
    } catch {
      setWalletSummary(null);
      setRecentSpend([]);
    }
    setSummaryLoading(false);
  }, [isReady, sessionId]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const isLoading = walletLoading || summaryLoading;
  const hasCards = wallet.length > 0;
  const greeting = getGreeting();
  const displayName =
    isAuthenticated && user?.display_name
      ? `, ${user.display_name.split(" ")[0]}`
      : "";

  const totalPoints =
    walletSummary?.cards.reduce((sum, c) => sum + (c.point_balance ?? 0), 0) ?? 0;

  return (
    <div className="relative min-h-screen">
      {/* Subtle ambient glow */}
      <div
        className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px]"
        style={{
          background: "radial-gradient(ellipse, rgba(13,148,136,0.08) 0%, transparent 70%)",
        }}
      />

      <div className="relative max-w-5xl mx-auto px-5 sm:px-8 pt-6 pb-24">
        {/* Greeting */}
        <AnimatedSection className="mb-6">
          <h1
            className="text-[22px] sm:text-[26px] font-bold tracking-tight leading-tight"
            style={{ color: "var(--text-primary)" }}
          >
            {greeting}{displayName}
          </h1>
          {hasCards && (
            <p className="text-[13px] mt-1" style={{ color: "var(--text-tertiary)" }}>
              {wallet.length} card{wallet.length !== 1 ? "s" : ""} in your wallet
            </p>
          )}
        </AnimatedSection>

        {/* ── Bento Grid ────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">

          {/* Hero: Total Points — spans 2 cols on md+ */}
          <AnimatedSection delay={0.02} className="md:col-span-2">
            <div
              className="rounded-xl p-5 sm:p-6 relative overflow-hidden"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-dim)",
              }}
            >
              <div
                className="absolute top-0 right-0 w-[200px] h-[200px] pointer-events-none"
                style={{
                  background: "radial-gradient(circle at top right, rgba(13,148,136,0.08) 0%, transparent 70%)",
                }}
              />
              <div className="flex items-start justify-between relative">
                <div>
                  <p
                    className="text-[11px] font-semibold uppercase tracking-widest mb-3"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    Total Rewards Value
                  </p>
                  {isLoading ? (
                    <div className="h-12 w-48 rounded-lg shimmer" />
                  ) : walletSummary ? (
                    <>
                      <div className="flex items-baseline gap-1">
                        <span
                          className="text-[42px] sm:text-[48px] font-bold tracking-tight tabular-nums leading-none"
                          style={{ color: "var(--text-primary)" }}
                        >
                          <AnimatedCounter
                            value={Math.round(walletSummary.value_range_high)}
                            prefix="$"
                            duration={0.8}
                          />
                        </span>
                        <span
                          className="text-[15px] font-medium ml-1"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          CAD
                        </span>
                      </div>
                      <p className="text-[12px] mt-2" style={{ color: "var(--text-secondary)" }}>
                        <AnimatedCounter value={totalPoints} duration={0.8} /> points across{" "}
                        {walletSummary.cards.length} program{walletSummary.cards.length !== 1 ? "s" : ""}
                      </p>
                    </>
                  ) : (
                    <p className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
                      Add cards to see your total rewards value.
                    </p>
                  )}
                </div>
                {walletSummary && (
                  <Link
                    href="/portfolio"
                    className="flex items-center gap-1 text-[11px] font-medium rounded-md px-2.5 py-1.5 transition-colors"
                    style={{
                      color: "var(--teal-light)",
                      background: "rgba(13,148,136,0.08)",
                      border: "1px solid rgba(13,148,136,0.12)",
                    }}
                  >
                    Portfolio <ArrowUpRight size={12} />
                  </Link>
                )}
              </div>
            </div>
          </AnimatedSection>

          {/* Quick Actions — 1 col */}
          <AnimatedSection delay={0.04}>
            <div
              className="rounded-xl p-4 h-full"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-dim)",
              }}
            >
              <p
                className="text-[10px] font-semibold uppercase tracking-widest mb-3"
                style={{ color: "var(--text-tertiary)" }}
              >
                Quick Actions
              </p>
              <div className="grid grid-cols-2 gap-2">
                {QUICK_ACTIONS.map(({ href, label, icon: Icon, color }) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-lg transition-all"
                    style={{ background: "rgba(255,255,255,0.02)" }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                      e.currentTarget.style.transform = "translateY(-1px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                      e.currentTarget.style.transform = "translateY(0)";
                    }}
                  >
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center"
                      style={{
                        background: `${color}12`,
                        border: `1px solid ${color}20`,
                        color,
                      }}
                    >
                      <Icon size={17} strokeWidth={1.8} />
                    </div>
                    <span
                      className="text-[11px] font-medium"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {label}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </AnimatedSection>

          {/* Recent Activity — spans 2 cols on lg */}
          {recentSpend.length > 0 && (
            <AnimatedSection delay={0.06} className="lg:col-span-2">
              <div
                className="rounded-xl overflow-hidden"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-dim)",
                }}
              >
                <div className="flex items-center justify-between px-5 py-3.5">
                  <p
                    className="text-[10px] font-semibold uppercase tracking-widest"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    Recent Activity
                  </p>
                  <Link
                    href="/insights"
                    className="text-[11px] font-medium flex items-center gap-1 transition-opacity hover:opacity-75"
                    style={{ color: "var(--teal-light)" }}
                  >
                    View all <ArrowUpRight size={11} />
                  </Link>
                </div>
                {recentSpend.map((entry, i) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between px-5 py-2.5"
                    style={{
                      borderTop: "1px solid var(--border-dim)",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-base">
                        {CAT_ICONS[entry.category_slug ?? "everything-else"] ?? "💳"}
                      </span>
                      <div>
                        <div
                          className="text-[13px] font-medium"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {entry.card_name ?? "Card"}
                        </div>
                        <div className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                          {entry.category_name ?? "Spend"} · {fmtDate(entry.spent_at)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className="text-[13px] font-semibold tabular-nums"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {fmtCAD(entry.amount)}
                      </div>
                      <div className="text-[11px] tabular-nums" style={{ color: "#10B981" }}>
                        +{fmtCAD(entry.dollar_value)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </AnimatedSection>
          )}

          {/* Your Cards */}
          <AnimatedSection delay={0.08}>
            <div
              className="rounded-xl p-4 h-full"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-dim)",
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <p
                  className="text-[10px] font-semibold uppercase tracking-widest"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  Your Cards
                </p>
                <Link
                  href="/cards"
                  className="text-[11px] font-medium flex items-center gap-1 transition-opacity hover:opacity-75"
                  style={{ color: "var(--teal-light)" }}
                >
                  Manage <ArrowUpRight size={11} />
                </Link>
              </div>
              {hasCards ? (
                <div className="space-y-2">
                  {wallet.slice(0, 4).map((uc) => (
                    <div
                      key={uc.id}
                      className="flex items-center gap-2.5 py-2 px-2.5 rounded-lg"
                      style={{ background: "rgba(255,255,255,0.02)" }}
                    >
                      <div
                        className="w-8 h-5 rounded-[3px] flex items-center justify-center text-[8px] font-bold shrink-0"
                        style={{
                          background:
                            uc.card?.network === "amex"
                              ? "linear-gradient(135deg, #C9A84C, #A07E2E)"
                              : uc.card?.network === "visa"
                                ? "linear-gradient(135deg, #1A6DB1, #0F4471)"
                                : "linear-gradient(135deg, #EB001B, #F79E1B)",
                          color: "#fff",
                        }}
                      >
                        {uc.card?.network === "amex"
                          ? "AMEX"
                          : uc.card?.network === "visa"
                            ? "VISA"
                            : "MC"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-[12px] font-medium truncate"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {uc.card?.name ?? "Card"}
                        </p>
                      </div>
                      <span
                        className="text-[11px] font-semibold tabular-nums shrink-0"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {(uc.point_balance ?? 0).toLocaleString()}
                      </span>
                    </div>
                  ))}
                  {wallet.length > 4 && (
                    <p className="text-[11px] text-center py-1" style={{ color: "var(--text-tertiary)" }}>
                      +{wallet.length - 4} more
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-[13px] mb-3" style={{ color: "var(--text-secondary)" }}>
                    No cards yet
                  </p>
                  <Link
                    href="/cards"
                    className="inline-flex items-center gap-1.5 h-8 px-4 rounded-lg text-[12px] font-medium text-white maple-bg transition-transform hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <CreditCard size={13} /> Add Card
                  </Link>
                </div>
              )}
            </div>
          </AnimatedSection>

          {/* Best Categories — spans full on sm, 2 cols on lg */}
          <AnimatedSection delay={0.1} className="md:col-span-2 lg:col-span-3">
            <div
              className="rounded-xl p-5"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-dim)",
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <p
                  className="text-[10px] font-semibold uppercase tracking-widest"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  Optimize by Category
                </p>
                <Link
                  href="/optimizer"
                  className="text-[11px] font-medium flex items-center gap-1 transition-opacity hover:opacity-75"
                  style={{ color: "var(--teal-light)" }}
                >
                  Full optimizer <ArrowUpRight size={11} />
                </Link>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                {[
                  { slug: "groceries", label: "Groceries", emoji: "🛒" },
                  { slug: "travel", label: "Travel", emoji: "✈️" },
                  { slug: "dining", label: "Dining", emoji: "🍽️" },
                  { slug: "gas", label: "Gas", emoji: "⛽" },
                  { slug: "transit", label: "Transit", emoji: "🚇" },
                  { slug: "entertainment", label: "Entertain", emoji: "🎬" },
                ].map((cat) => (
                  <Link
                    key={cat.slug}
                    href={`/optimizer?category=${cat.slug}`}
                    className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-lg transition-all"
                    style={{ background: "rgba(255,255,255,0.02)" }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(13,148,136,0.06)";
                      e.currentTarget.style.transform = "translateY(-1px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                      e.currentTarget.style.transform = "translateY(0)";
                    }}
                  >
                    <span className="text-xl">{cat.emoji}</span>
                    <span
                      className="text-[11px] font-medium"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {cat.label}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </AnimatedSection>

          {/* AI Assistant CTA */}
          <AnimatedSection delay={0.12} className="md:col-span-2 lg:col-span-3">
            <Link
              href="/chat"
              className="block rounded-xl p-5 transition-all group"
              style={{
                background: "rgba(13,148,136,0.04)",
                border: "1px solid rgba(13,148,136,0.1)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(13,148,136,0.08)";
                e.currentTarget.style.borderColor = "rgba(13,148,136,0.18)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(13,148,136,0.04)";
                e.currentTarget.style.borderColor = "rgba(13,148,136,0.1)";
              }}
            >
              <div className="flex items-center gap-4">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{
                    background: "rgba(13,148,136,0.12)",
                    border: "1px solid rgba(13,148,136,0.18)",
                    color: "#14B8A6",
                  }}
                >
                  <MessageCircle size={18} strokeWidth={1.8} />
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className="text-[14px] font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Ask the AI Assistant
                  </p>
                  <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    &ldquo;What&rsquo;s the best card for my next grocery run?&rdquo;
                  </p>
                </div>
                <ArrowUpRight
                  size={16}
                  className="shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  style={{ color: "var(--text-tertiary)" }}
                />
              </div>
            </Link>
          </AnimatedSection>
        </div>
      </div>
    </div>
  );
}
