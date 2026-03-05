"use client";

import { useState, useEffect, useCallback } from "react";
import { WalletCard } from "@/components/wallet-card";
import { AddCardModal } from "@/components/add-card-modal";
import { getWallet, ensureSession } from "@/lib/api";
import type { UserCard } from "@/lib/types";

export default function WalletPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [wallet, setWallet] = useState<UserCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const loadWallet = useCallback(async (sid: string) => {
    try {
      const cards = await getWallet(sid);
      setWallet(cards ?? []);
    } catch { setError("Could not load wallet"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    ensureSession()
      .then(sid => { setSessionId(sid); return loadWallet(sid); })
      .catch(() => { setError("Could not initialize"); setLoading(false); });
  }, [loadWallet]);

  function onRemoved(id: string) { setWallet(p => p.filter(c => c.id !== id)); }
  function onBalanceUpdated(id: string, balance: number) {
    setWallet(p => p.map(c => c.id === id ? { ...c, point_balance: balance } : c));
  }
  async function onCardAdded() {
    if (!sessionId) return;
    setLoading(true);
    await loadWallet(sessionId);
    setShowAdd(false);
  }

  const totalPoints = wallet.reduce((s, c) => s + c.point_balance, 0);

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Ambient */}
      <div className="orb w-[400px] h-[250px] top-[-80px] right-[-50px]"
        style={{ background: "radial-gradient(ellipse, rgba(200,16,46,0.08) 0%, transparent 70%)" }}
      />

      <div className="relative max-w-3xl mx-auto px-6 pt-28 pb-24">

        {/* Page header */}
        <div className="flex items-end justify-between mb-8 fade-up">
          <div>
            <p className="label-xs mb-1.5" style={{ color: "var(--text-tertiary)" }}>Your collection</p>
            <h1 className="title text-white">Wallet</h1>
            {!loading && wallet.length > 0 && (
              <p className="text-[14px] mt-1" style={{ color: "var(--text-secondary)" }}>
                {wallet.length} card{wallet.length !== 1 ? "s" : ""} &middot;{" "}
                <span className="text-white font-semibold">{totalPoints.toLocaleString()}</span> pts total
              </p>
            )}
          </div>

          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 h-10 px-5 rounded-xl font-semibold text-[14px] text-white transition-all maple-bg maple-glow"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            Add card
          </button>
        </div>

        {/* States */}
        {loading ? (
          <div className="flex flex-col gap-3 fade-up-1">
            {[1,2,3].map(i => (
              <div key={i} className="h-[140px] rounded-2xl shimmer" />
            ))}
          </div>
        ) : error ? (
          <div
            className="rounded-2xl p-8 text-center fade-up-1"
            style={{ background: "var(--bg-elevated)", border: "1px solid rgba(200,16,46,0.2)" }}
          >
            <p className="text-[14px]" style={{ color: "#E8173A" }}>{error}</p>
            <button
              onClick={() => sessionId && loadWallet(sessionId)}
              className="mt-4 text-[13px] transition-colors"
              style={{ color: "var(--text-secondary)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "white")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--text-secondary)")}
            >
              Try again
            </button>
          </div>
        ) : wallet.length === 0 ? (
          <div
            className="rounded-2xl p-14 text-center fade-up-1"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-dim)" }}
          >
            <div className="text-5xl mb-5">💳</div>
            <h2 className="text-[18px] font-semibold text-white mb-2">No cards yet</h2>
            <p className="text-[14px] max-w-[280px] mx-auto mb-7 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Add your credit cards to track balances and unlock personalized point recommendations.
            </p>
            <button
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-2 h-11 px-6 rounded-xl font-semibold text-[14px] text-white maple-bg maple-glow"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
              Add your first card
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {wallet.map((uc, i) => (
              <div key={uc.id} className="fade-up" style={{ animationDelay: `${i * 0.06}s` }}>
                <WalletCard
                  userCard={uc}
                  sessionId={sessionId!}
                  onRemoved={onRemoved}
                  onBalanceUpdated={onBalanceUpdated}
                />
              </div>
            ))}
          </div>
        )}

        {/* Optimizer CTA */}
        {!loading && wallet.length > 0 && (
          <div
            className="mt-8 rounded-2xl p-5 flex items-center justify-between gap-4 fade-up"
            style={{ background: "rgba(200,16,46,0.06)", border: "1px solid rgba(200,16,46,0.15)" }}
          >
            <div>
              <p className="text-[14px] font-semibold text-white">Ready to optimize?</p>
              <p className="text-[13px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                Find the best card for your next purchase.
              </p>
            </div>
            <a
              href="/"
              className="shrink-0 h-9 px-5 rounded-xl text-[13px] font-semibold text-white maple-bg maple-glow inline-flex items-center"
            >
              Go to optimizer →
            </a>
          </div>
        )}
      </div>

      {showAdd && sessionId && (
        <AddCardModal
          sessionId={sessionId}
          existingCardIds={wallet.map(c => c.card_id)}
          onAdded={onCardAdded}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}
