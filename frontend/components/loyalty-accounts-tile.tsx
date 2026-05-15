"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  listLoyaltyAccounts,
  createLoyaltyAccount,
  deleteLoyaltyAccount,
} from "@/lib/api";
import type { LoyaltyAccount } from "@/lib/types";

/* ─────────────────────────────────────────────────────────────────────────────
 * LoyaltyAccountsTile — track program balances the user holds *outside* the
 * card wallet (Marriott Bonvoy without a Marriott card, Hilton without Amex
 * Hilton, etc.). Surfaces upcoming expirations using each program's published
 * inactivity-expiry rule (Aeroplan = 18 mo, Hilton = 12 mo, etc.).
 *
 * The closest competitor here is AwardWallet — which charges $50/yr and has
 * shallow Canadian coverage. Maple's tile is gated as Pro and seeds with
 * Canada-relevant programs.
 * ───────────────────────────────────────────────────────────────────────── */

const SUGGESTED_PROGRAMS: { slug: string; name: string }[] = [
  { slug: "marriott-bonvoy", name: "Marriott Bonvoy" },
  { slug: "hilton-honors",   name: "Hilton Honors" },
  { slug: "world-of-hyatt",  name: "World of Hyatt" },
  { slug: "ba-avios",        name: "British Airways Avios" },
  { slug: "flying-blue",     name: "Air France/KLM Flying Blue" },
  { slug: "asia-miles",      name: "Cathay Asia Miles" },
  { slug: "westjet-rewards", name: "WestJet Rewards" },
  { slug: "scene-plus",      name: "Scene+" },
  { slug: "air-miles",       name: "Air Miles" },
  { slug: "pc-optimum",      name: "PC Optimum" },
];

export function LoyaltyAccountsTile({
  sessionId,
  isReady,
  ensureSession,
}: {
  sessionId: string | null;
  isReady: boolean;
  ensureSession: () => Promise<string>;
}) {
  const [accounts, setAccounts] = useState<LoyaltyAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [progSlug, setProgSlug] = useState(SUGGESTED_PROGRAMS[0].slug);
  const [balance, setBalance] = useState("0");
  const [lastActivity, setLastActivity] = useState("");

  const load = useCallback(async () => {
    if (!isReady || !sessionId) return;
    setLoading(true);
    setErr(null);
    try {
      const a = await listLoyaltyAccounts(sessionId);
      setAccounts(a);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load accounts");
    } finally {
      setLoading(false);
    }
  }, [sessionId, isReady]);

  useEffect(() => { load(); }, [load]);

  async function add() {
    setErr(null);
    try {
      const sid = await ensureSession();
      await createLoyaltyAccount(sid, {
        program_slug: progSlug,
        balance: parseInt(balance, 10) || 0,
        last_activity: lastActivity || null,
      });
      setShowForm(false);
      setBalance("0");
      setLastActivity("");
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add account");
    }
  }

  async function remove(id: string) {
    if (!sessionId) return;
    try {
      await deleteLoyaltyAccount(sessionId, id);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not delete account");
    }
  }

  // Sort: expiring soonest first (with at-risk balances in front), then no-expiry programs.
  const sorted = [...accounts].sort((a, b) => {
    const ad = a.days_to_expiry ?? Number.MAX_SAFE_INTEGER;
    const bd = b.days_to_expiry ?? Number.MAX_SAFE_INTEGER;
    return ad - bd;
  });
  const expiringSoon = sorted.filter(
    (a) => a.days_to_expiry != null && a.days_to_expiry >= 0 && a.days_to_expiry <= 90,
  );

  return (
    <section style={{ marginBottom: 22 }}>
      <header style={{ marginBottom: 18, display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="mr-hero-kicker" style={{ marginBottom: 10 }}>
            <span className="eyebrow" style={{ color: "var(--accent)" }}>Loyalty accounts</span>
            <span className="mr-kicker-line" style={{ maxWidth: 60 }} />
          </div>
          <h2 className="display" style={{ fontSize: "clamp(28px, 3vw, 36px)", margin: 0, lineHeight: 1.05, letterSpacing: "-0.01em" }}>
            Track balances <span style={{ fontStyle: "italic" }}>without</span> the card.
          </h2>
          <p className="serif" style={{ marginTop: 8, fontSize: 15, fontStyle: "italic", color: "var(--ink-2)", maxWidth: 680, lineHeight: 1.45 }}>
            Marriott Bonvoy, Hilton Honors, World of Hyatt and the dozen other programs you collect
            in without a co-branded card. Maple knows each program&rsquo;s inactivity rules and
            warns you before a balance evaporates.
          </p>
        </div>
      </header>

      <div
        style={{
          border: "1px solid var(--rule)",
          background: "var(--card-fill-strong)",
          borderRadius: 14,
          padding: "20px 22px",
          boxShadow: "var(--shadow-1)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
          <span className="eyebrow">
            {accounts.length} account{accounts.length === 1 ? "" : "s"}
            {expiringSoon.length > 0 && (
              <span style={{ color: "var(--accent)", marginLeft: 12 }}>
                · {expiringSoon.length} expiring in next 90 days
              </span>
            )}
          </span>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="mono"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 16px",
              borderRadius: 999,
              border: `1px solid ${showForm ? "var(--rule-strong)" : "var(--accent)"}`,
              background: showForm ? "transparent" : "var(--accent)",
              color: showForm ? "var(--ink-2)" : "#fff",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            <Plus size={12} />
            {showForm ? "Cancel" : "Track new"}
          </button>
        </div>

        {showForm && (
          <div
            style={{
              padding: 14,
              borderRadius: 10,
              border: "1px solid var(--rule)",
              background: "var(--card-fill)",
              marginBottom: 16,
              display: "grid",
              gap: 10,
              gridTemplateColumns: "1fr 1fr 1fr auto",
            }}
            className="loyalty-form-grid"
          >
            <select value={progSlug} onChange={(e) => setProgSlug(e.target.value)} style={fieldStyle}>
              {SUGGESTED_PROGRAMS.map((p) => (
                <option key={p.slug} value={p.slug}>{p.name}</option>
              ))}
            </select>
            <input
              type="number"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              placeholder="Balance"
              min={0}
              style={fieldStyle}
            />
            <input
              type="date"
              value={lastActivity}
              onChange={(e) => setLastActivity(e.target.value)}
              placeholder="Last activity"
              style={fieldStyle}
            />
            <button onClick={add} style={ctaStyle}>Save →</button>
          </div>
        )}

        {loading && <p className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>Loading…</p>}
        {err && <p className="serif" style={{ fontStyle: "italic", color: "var(--loss)", fontSize: 14 }}>{err}</p>}

        {!loading && !err && sorted.length === 0 && (
          <p className="serif" style={{ fontStyle: "italic", color: "var(--ink-3)", fontSize: 14, margin: 0 }}>
            No tracked accounts yet. Add Marriott Bonvoy or Hilton Honors first &mdash;
            those have the strictest inactivity rules.
          </p>
        )}

        {!loading && !err && sorted.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, borderTop: "1px solid var(--rule)" }}>
            {sorted.map((a) => {
              const urgent = a.days_to_expiry != null && a.days_to_expiry >= 0 && a.days_to_expiry <= 60;
              const expired = a.days_to_expiry != null && a.days_to_expiry < 0;
              return (
                <li
                  key={a.id ?? a.program_slug}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto",
                    gap: 16,
                    alignItems: "baseline",
                    padding: "14px 0",
                    borderBottom: "1px solid var(--rule)",
                    borderLeft: urgent ? "2px solid var(--accent)" : "2px solid transparent",
                    paddingLeft: urgent ? 12 : 0,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div className="display" style={{ fontSize: 16, color: "var(--ink)", lineHeight: 1.2 }}>
                      {a.program_name || a.program_slug}
                      {a.account_label && (
                        <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginLeft: 8, letterSpacing: "0.06em" }}>
                          · {a.account_label}
                        </span>
                      )}
                    </div>
                    {a.expiry_rule_note && (
                      <div className="serif" style={{ fontSize: 12, fontStyle: "italic", color: "var(--ink-3)", marginTop: 2 }}>
                        {a.expiry_rule_note}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="mono" style={{ fontSize: 14, color: "var(--ink)", fontWeight: 600 }}>
                      {a.balance.toLocaleString()} pts
                    </div>
                    {a.days_to_expiry != null && (
                      <div
                        className="mono"
                        style={{
                          fontSize: 11,
                          color: expired ? "var(--loss)" : urgent ? "var(--accent)" : "var(--ink-3)",
                          marginTop: 2,
                          letterSpacing: "0.04em",
                        }}
                      >
                        {expired
                          ? `expired ${Math.abs(a.days_to_expiry)}d ago`
                          : `expires in ${a.days_to_expiry}d`}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => a.id && remove(a.id)}
                    aria-label="Remove"
                    style={{
                      padding: 8,
                      border: "1px solid var(--rule)",
                      borderRadius: 8,
                      background: "transparent",
                      color: "var(--ink-3)",
                      cursor: "pointer",
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

const fieldStyle: React.CSSProperties = {
  width: "100%",
  height: 42,
  padding: "0 12px",
  background: "var(--surface)",
  border: "1px solid var(--rule)",
  borderRadius: 8,
  fontSize: 14,
  fontFamily: "var(--font-mono)",
  color: "var(--ink)",
  outline: "none",
};

const ctaStyle: React.CSSProperties = {
  height: 42,
  padding: "0 22px",
  borderRadius: 8,
  background: "var(--accent)",
  color: "#fff",
  border: "none",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  cursor: "pointer",
};
