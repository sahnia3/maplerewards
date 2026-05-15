"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Check, Trash2 } from "lucide-react";
import { useWallet } from "@/contexts/wallet-context";
import {
  listCardOffers,
  createCardOffer,
  markCardOfferUsed,
  deleteCardOffer,
} from "@/lib/api";
import type { CardOffer, CardOfferSource } from "@/lib/types";

const SOURCES: { value: CardOfferSource; label: string }[] = [
  { value: "amex_offers", label: "Amex Offers" },
  { value: "rbc_offers", label: "RBC Offers" },
  { value: "scene_plus", label: "Scene+" },
  { value: "other", label: "Other" },
];

/* ─────────────────────────────────────────────────────────────────────────────
 * CardOffersTile — manual offer log + expiry reminders for the card-linked
 * deals every Canadian issuer publishes (Amex Offers, RBC Offers, Scene+).
 * Auto-activation needs partner APIs nobody publishes; until then this is
 * the closest thing to "never lose track of a clipped offer."
 *
 * Workflow: user activates the offer in the issuer app, logs it here in
 * 30 seconds, gets reminded before expiry, marks used after redemption.
 * ───────────────────────────────────────────────────────────────────────── */

export function CardOffersTile({
  sessionId,
  isReady,
  ensureSession,
}: {
  sessionId: string | null;
  isReady: boolean;
  ensureSession: () => Promise<string>;
}) {
  const { wallet } = useWallet();
  const [offers, setOffers] = useState<CardOffer[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [cardId, setCardId] = useState("");
  const [source, setSource] = useState<CardOfferSource>("amex_offers");
  const [merchant, setMerchant] = useState("");
  const [earnAmount, setEarnAmount] = useState("");
  const [minSpend, setMinSpend] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const load = useCallback(async () => {
    if (!isReady || !sessionId) return;
    setLoading(true);
    setErr(null);
    try {
      setOffers(await listCardOffers(sessionId, true));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load offers");
    } finally {
      setLoading(false);
    }
  }, [sessionId, isReady]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (wallet.length > 0 && !cardId) setCardId(wallet[0].card_id);
  }, [wallet, cardId]);

  async function add() {
    setErr(null);
    if (!merchant.trim()) {
      setErr("Merchant required");
      return;
    }
    try {
      const sid = await ensureSession();
      await createCardOffer(sid, {
        card_id: cardId,
        source,
        merchant: merchant.trim(),
        earn_amount: earnAmount ? parseFloat(earnAmount) : null,
        min_spend: minSpend ? parseFloat(minSpend) : null,
        expires_at: expiresAt || null,
        activated_at: new Date().toISOString().slice(0, 10),
      });
      setShowForm(false);
      setMerchant("");
      setEarnAmount("");
      setMinSpend("");
      setExpiresAt("");
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add offer");
    }
  }

  async function markUsed(id: string) {
    if (!sessionId) return;
    try { await markCardOfferUsed(sessionId, id); load(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not mark used"); }
  }

  async function remove(id: string) {
    if (!sessionId) return;
    try { await deleteCardOffer(sessionId, id); load(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not delete offer"); }
  }

  const expiringSoon = offers.filter(
    (o) => o.days_to_expiry != null && o.days_to_expiry >= 0 && o.days_to_expiry <= 14,
  );

  return (
    <section style={{ marginBottom: 22 }}>
      <header style={{ marginBottom: 18, display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="mr-hero-kicker" style={{ marginBottom: 10 }}>
            <span className="eyebrow" style={{ color: "var(--accent)" }}>Card-linked offers</span>
            <span className="mr-kicker-line" style={{ maxWidth: 60 }} />
          </div>
          <h2 className="display" style={{ fontSize: "clamp(28px, 3vw, 36px)", margin: 0, lineHeight: 1.05, letterSpacing: "-0.01em" }}>
            <span style={{ fontStyle: "italic" }}>Track</span> what you clipped.
          </h2>
          <p className="serif" style={{ marginTop: 8, fontSize: 15, fontStyle: "italic", color: "var(--ink-2)", maxWidth: 680, lineHeight: 1.45 }}>
            Amex Offers, RBC Offers, and Scene+ deals expire silently. Log each one here after
            you activate it in the issuer app &mdash; we&rsquo;ll surface the ones expiring soon
            and let you mark redemption when you&rsquo;ve used them.
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
            {offers.length} active offer{offers.length === 1 ? "" : "s"}
            {expiringSoon.length > 0 && (
              <span style={{ color: "var(--accent)", marginLeft: 12 }}>
                · {expiringSoon.length} expiring in next 14 days
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
            {showForm ? "Cancel" : "Log new offer"}
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
              gridTemplateColumns: "1fr 1fr 1fr",
            }}
            className="card-offer-form"
          >
            <select value={cardId} onChange={(e) => setCardId(e.target.value)} style={fieldStyle}>
              <option value="">Pick a card</option>
              {wallet.map((uc) => (
                <option key={uc.id} value={uc.card_id}>{uc.card?.name ?? "Card"}</option>
              ))}
            </select>
            <select value={source} onChange={(e) => setSource(e.target.value as CardOfferSource)} style={fieldStyle}>
              {SOURCES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <input
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              placeholder="Merchant (e.g. Best Buy)"
              style={fieldStyle}
            />
            <input
              value={earnAmount}
              onChange={(e) => setEarnAmount(e.target.value)}
              placeholder="Earn $ (e.g. 10)"
              type="number"
              style={fieldStyle}
            />
            <input
              value={minSpend}
              onChange={(e) => setMinSpend(e.target.value)}
              placeholder="Min spend $ (e.g. 50)"
              type="number"
              style={fieldStyle}
            />
            <input
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              type="date"
              style={fieldStyle}
            />
            <button
              onClick={add}
              disabled={!cardId || !merchant}
              style={{ ...ctaStyle, gridColumn: "1 / -1", opacity: !cardId || !merchant ? 0.5 : 1 }}
            >
              Save offer →
            </button>
          </div>
        )}

        {loading && <p className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>Loading…</p>}
        {err && <p className="serif" style={{ fontStyle: "italic", color: "var(--loss)", fontSize: 14 }}>{err}</p>}

        {!loading && !err && offers.length === 0 && (
          <p className="serif" style={{ fontStyle: "italic", color: "var(--ink-3)", fontSize: 14, margin: 0 }}>
            No active offers logged. Open Amex / RBC / Scene+ in your issuer app, activate
            interesting offers, then log them here so we can remind you.
          </p>
        )}

        {!loading && !err && offers.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, borderTop: "1px solid var(--rule)" }}>
            {offers.map((o) => {
              const urgent = o.days_to_expiry != null && o.days_to_expiry >= 0 && o.days_to_expiry <= 7;
              return (
                <li
                  key={o.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto auto",
                    gap: 14,
                    alignItems: "center",
                    padding: "14px 0",
                    borderBottom: "1px solid var(--rule)",
                    borderLeft: urgent ? "2px solid var(--accent)" : "2px solid transparent",
                    paddingLeft: urgent ? 12 : 0,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div className="display" style={{ fontSize: 16, color: "var(--ink)", lineHeight: 1.2 }}>
                      {o.merchant}
                      {o.earn_amount && o.min_spend && (
                        <span className="mono" style={{ fontSize: 11, color: "var(--gain)", marginLeft: 8 }}>
                          ${o.earn_amount} on ${o.min_spend}
                        </span>
                      )}
                    </div>
                    <div className="serif" style={{ fontSize: 12, fontStyle: "italic", color: "var(--ink-3)", marginTop: 2 }}>
                      {SOURCES.find((s) => s.value === o.source)?.label || o.source}
                      {o.card_name && <> · {o.card_name}</>}
                      {o.expires_at && (
                        <span style={{ color: urgent ? "var(--accent)" : "var(--ink-3)", marginLeft: 6 }}>
                          {o.days_to_expiry != null && o.days_to_expiry >= 0
                            ? `· expires in ${o.days_to_expiry}d`
                            : `· expired`}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => o.id && markUsed(o.id)}
                    title="Mark redeemed"
                    className="mono"
                    style={{
                      padding: "6px 10px",
                      fontSize: 10,
                      letterSpacing: "0.10em",
                      textTransform: "uppercase",
                      background: "var(--gain)",
                      color: "#fff",
                      border: "none",
                      borderRadius: 6,
                      cursor: "pointer",
                    }}
                  >
                    <Check size={11} style={{ verticalAlign: "middle", marginRight: 4 }} />
                    Used
                  </button>
                  <button
                    onClick={() => o.id && remove(o.id)}
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
