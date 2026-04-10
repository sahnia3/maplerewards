"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Plus, ArrowRight, Wallet, TrendingUp, CreditCard, BarChart3 } from "lucide-react";
import { WalletCard } from "@/components/wallet-card";
import { AddCardModal } from "@/components/add-card-modal";
import { useSession } from "@/contexts/session-context";
import { useWallet } from "@/contexts/wallet-context";
import { AnimatedCounter, ValueCounter } from "@/components/motion/counter";
import { AnimatedList, AnimatedItem, AnimatedSection } from "@/components/ui/animated-list";
import { SkeletonCard } from "@/components/ui/skeleton";
import { EmptyWallet } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";

export default function WalletPage() {
  const { sessionId } = useSession();
  const { wallet, isLoading: loading, error, totalPoints, refreshWallet } = useWallet();
  const [showAdd, setShowAdd] = useState(false);

  function onRemoved() {
    refreshWallet();
  }
  function onBalanceUpdated() {
    refreshWallet();
  }
  async function onCardAdded() {
    await refreshWallet();
    setShowAdd(false);
  }

  // Compute summary stats
  const totalValue = wallet.reduce((sum, uc) => {
    const cpp = uc.card?.loyalty_program?.base_cpp ?? 1;
    return sum + uc.point_balance * (cpp / 100);
  }, 0);
  const programs = new Set(wallet.map((uc) => uc.card?.loyalty_program?.name).filter(Boolean));

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Ambient orbs */}
      <div
        className="orb w-[500px] h-[300px] top-[-100px] right-[-80px]"
        style={{
          background:
            "radial-gradient(ellipse, rgba(13,148,136,0.07) 0%, transparent 70%)",
        }}
      />
      <div
        className="orb w-[300px] h-[200px] top-[100px] left-[-100px]"
        style={{
          background:
            "radial-gradient(ellipse, rgba(13,148,136,0.04) 0%, transparent 70%)",
        }}
      />

      <div className="relative max-w-3xl mx-auto px-6 pt-8 pb-24">
        {/* ── Page header ────────────────────────────────── */}
        <AnimatedSection>
          <div className="flex items-end justify-between mb-6">
            <div>
              <p
                className="label-xs mb-1.5"
                style={{ color: "var(--text-tertiary)" }}
              >
                Your collection
              </p>
              <h1 className="title text-white">Wallet</h1>
            </div>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 h-10 px-5 rounded-xl font-semibold text-[14px] text-white transition-all maple-bg accent-glow hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus size={16} strokeWidth={2.5} />
              Add card
            </button>
          </div>
        </AnimatedSection>

        {/* ── Hero stats (glassmorphism) ────────────────── */}
        {!loading && wallet.length > 0 && (
          <AnimatedSection delay={0.05}>
            <div
              className="glass-card rounded-2xl p-5 mb-6 relative overflow-hidden"
            >
              <div
                className="absolute top-0 left-6 right-6 h-px"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)",
                }}
              />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <div
                    className="label-xs mb-1.5"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    Total Points
                  </div>
                  <AnimatedCounter
                    value={totalPoints}
                    className="text-[20px] font-bold text-white tracking-tight"
                  />
                </div>
                <div>
                  <div
                    className="label-xs mb-1.5"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    Est. Value
                  </div>
                  <ValueCounter
                    value={totalValue}
                    className="text-[20px] font-bold tracking-tight"
                    style={{ color: "#4ADE80" }}
                  />
                </div>
                <div>
                  <div
                    className="label-xs mb-1.5"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    Cards
                  </div>
                  <AnimatedCounter
                    value={wallet.length}
                    className="text-[20px] font-bold text-white tracking-tight"
                  />
                </div>
                <div>
                  <div
                    className="label-xs mb-1.5"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    Programs
                  </div>
                  <AnimatedCounter
                    value={programs.size}
                    className="text-[20px] font-bold text-white tracking-tight"
                  />
                </div>
              </div>
            </div>
          </AnimatedSection>
        )}

        {/* ── Quick actions ──────────────────────────────── */}
        {!loading && wallet.length > 0 && (
          <AnimatedSection delay={0.1}>
            <div className="flex gap-2 mb-6 scroll-x">
              <Link
                href="/optimizer"
                className="pill-btn"
              >
                <TrendingUp size={14} />
                Optimize spend
              </Link>
              <Link
                href="/compare"
                className="pill-btn"
              >
                <BarChart3 size={14} />
                Compare cards
              </Link>
              <Link
                href="/cards"
                className="pill-btn"
              >
                <CreditCard size={14} />
                Browse catalog
              </Link>
              <Link
                href="/insights"
                className="pill-btn"
              >
                <Wallet size={14} />
                View insights
              </Link>
            </div>
          </AnimatedSection>
        )}

        {/* ── Content ────────────────────────────────────── */}
        {loading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : error ? (
          <AnimatedSection>
            <div
              className="rounded-2xl p-8 text-center"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid rgba(13,148,136,0.2)",
              }}
            >
              <p className="text-[14px]" style={{ color: "#14B8A6" }}>
                {error}
              </p>
              <button
                onClick={() => refreshWallet()}
                className="mt-4 text-[13px] transition-colors hover:text-white"
                style={{ color: "var(--text-secondary)" }}
              >
                Try again
              </button>
            </div>
          </AnimatedSection>
        ) : wallet.length === 0 ? (
          <AnimatedSection>
            <EmptyWallet />
          </AnimatedSection>
        ) : (
          <>
            {/* Section label */}
            <div className="flex items-center justify-between mb-3 px-1">
              <p
                className="text-[13px] font-semibold"
                style={{ color: "var(--text-secondary)" }}
              >
                {wallet.length} card{wallet.length !== 1 ? "s" : ""} in your
                wallet
              </p>
            </div>

            {/* Card grid with stagger animation */}
            <AnimatedList className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {wallet.map((uc) => (
                <AnimatedItem key={uc.id}>
                  <WalletCard
                    userCard={uc}
                    sessionId={sessionId!}
                    onRemoved={onRemoved}
                    onBalanceUpdated={onBalanceUpdated}
                  />
                </AnimatedItem>
              ))}
            </AnimatedList>

            {/* Optimizer CTA */}
            <AnimatedSection delay={0.2}>
              <div
                className="mt-8 rounded-2xl p-5 flex items-center justify-between gap-4 hover-accent"
                style={{
                  background: "rgba(13,148,136,0.05)",
                  border: "1px solid rgba(13,148,136,0.12)",
                }}
              >
                <div>
                  <p className="text-[14px] font-semibold text-white">
                    Ready to optimize?
                  </p>
                  <p
                    className="text-[13px] mt-0.5"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Find the best card for your next purchase.
                  </p>
                </div>
                <Link
                  href="/optimizer"
                  className="shrink-0 h-9 px-5 rounded-xl text-[13px] font-semibold text-white maple-bg accent-glow inline-flex items-center gap-1.5 hover:scale-[1.02] transition-transform"
                >
                  Optimizer
                  <ArrowRight size={14} />
                </Link>
              </div>
            </AnimatedSection>
          </>
        )}
      </div>

      {showAdd && sessionId && (
        <AddCardModal
          sessionId={sessionId}
          existingCardIds={wallet.map((c) => c.card_id)}
          onAdded={onCardAdded}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}
