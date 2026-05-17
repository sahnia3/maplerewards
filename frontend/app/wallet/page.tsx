"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, ArrowRight, Trash2, Pencil, Check } from "lucide-react";
import { CreditCardVisual } from "@/components/cards/credit-card-visual";
import { useSession } from "@/contexts/session-context";
import { useWallet } from "@/contexts/wallet-context";
import { PageMasthead } from "@/components/editorial/page-masthead";
import { CSVImportPanel } from "@/components/csv-import-panel";
import { DevaluationBanner } from "@/components/editorial/devaluation-banner";
import { ProFOMOStrip } from "@/components/editorial/pro-fomo-strip";
import { updateCardBalance, removeCardFromWallet } from "@/lib/api";
import type { UserCard } from "@/lib/types";

/* Editorial wallet — paper substrate, real card sprites, mono inputs, maple-red CTAs.
 *
 * /wallet is the *manage existing* surface. The single canonical "browse + add"
 * flow lives at /cards (which carries its own wallet rail at the top). The
 * masthead CTA + EmptyWallet CTA both navigate there to eliminate the
 * duplicate add-card UX that confused users on first run. */

export default function WalletPage() {
  const { sessionId } = useSession();
  const { wallet, isLoading: loading, error, totalPoints, refreshWallet } = useWallet();

  // Compute summary stats
  const totalValue = wallet.reduce((sum, uc) => {
    const cpp = uc.card?.loyalty_program?.base_cpp ?? 1;
    return sum + uc.point_balance * (cpp / 100);
  }, 0);
  const programs = new Set(wallet.map((uc) => uc.card?.loyalty_program?.name).filter(Boolean));

  return (
    <div className="reveal" style={{ paddingTop: 0 }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px clamp(20px, 4vw, 60px) 80px" }}>
        <PageMasthead
          eyebrow="Your wallet"
          eyebrowEnd={`${wallet.length} card${wallet.length === 1 ? "" : "s"} · CAD`}
          title={<>The <span style={{ fontStyle: "italic" }}>working</span> wallet.</>}
          lede="Every card you carry, every point you've earned. Edit point balances inline. Maple prices everything in CAD against the categories you actually spend in."
          cta={
            <Link
              href="/cards"
              className="mono"
              style={{
                background: "var(--accent)",
                color: "#fff",
                padding: "14px 24px",
                borderRadius: 10,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Plus size={14} /> Add card
            </Link>
          }
        />

        {/* ── Devaluation urgency banner (Pro) ─────────────────────
            Self-hides for free users (Pro endpoint 402s), users with no
            Aeroplan balance, and >7 days past the June 1 effective date.
        */}
        {sessionId && <DevaluationBanner sessionId={sessionId} />}

        {/* ── Pro FOMO strip (free users only) ────────────────────
            Surfaces aggregate counts of devaluations + issuer changes so
            free users see Pro value with believable numbers. Self-hides
            for Pro users.
        */}
        <ProFOMOStrip />

        {/* ── Stat strip ──────────────────────────────────────────── */}
        {!loading && wallet.length > 0 && (
          <div
            style={{
              borderTop: "1px solid var(--ink)",
              borderBottom: "1px solid var(--rule)",
              padding: "22px 0 26px",
              marginBottom: 28,
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 0,
            }}
            className="wallet-stat-strip"
          >
            <Stat label="Total points" value={totalPoints.toLocaleString()} />
            <Stat label="Est. value" value={`$${Math.round(totalValue).toLocaleString()}`} accent />
            <Stat label="Cards" value={String(wallet.length)} />
            <Stat label="Programs" value={String(programs.size)} last />
          </div>
        )}

        {/* ── Quick links ──────────────────────────────────────── */}
        {!loading && wallet.length > 0 && (
          <div style={{ display: "flex", gap: 10, marginBottom: 32, flexWrap: "wrap" }}>
            <QuickLink href="/optimizer" label="Optimize next swipe" />
            <QuickLink href="/insights" label="View insights" />
            <QuickLink href="/portfolio" label="Annual ledger" />
            <QuickLink href="/cards" label="Browse register" />
          </div>
        )}

        {/* ── Body ─────────────────────────────────────────────── */}
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 0" }}>
            <Loader2 size={20} className="animate-spin" style={{ color: "var(--ink-3)" }} />
          </div>
        ) : error ? (
          <div
            style={{
              border: "1px solid var(--accent)",
              borderRadius: 14,
              padding: "20px 24px",
              background: "var(--card-fill)",
              borderLeft: "3px solid var(--accent)",
            }}
          >
            <p className="serif" style={{ fontStyle: "italic", color: "var(--accent)", fontSize: 15, margin: 0 }}>
              {error}
            </p>
            <button
              type="button"
              onClick={() => refreshWallet()}
              className="mono"
              style={{
                marginTop: 10,
                background: "transparent",
                border: "1px solid var(--rule-strong)",
                color: "var(--ink-2)",
                padding: "8px 16px",
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              Try again →
            </button>
          </div>
        ) : wallet.length === 0 ? (
          <EmptyWallet />
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
              <span className="eyebrow">Wallet · {wallet.length} card{wallet.length === 1 ? "" : "s"}</span>
              <span className="eyebrow">Tap a balance to edit</span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
                gap: 16,
                marginBottom: 36,
              }}
              className="wallet-grid"
            >
              {wallet.map((uc) => (
                <WalletRow
                  key={uc.id}
                  userCard={uc}
                  sessionId={sessionId!}
                  onChanged={refreshWallet}
                />
              ))}
            </div>

            {/* Bottom CTA */}
            <div
              style={{
                borderTop: "1px solid var(--ink)",
                borderBottom: "1px solid var(--rule)",
                padding: "22px 4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 18,
                flexWrap: "wrap",
              }}
            >
              <div>
                <span className="eyebrow" style={{ color: "var(--accent)" }}>Ready to optimize?</span>
                <h3 className="display" style={{ fontSize: 24, margin: "6px 0 0", lineHeight: 1.1, fontStyle: "italic" }}>
                  Find the best card for your next swipe.
                </h3>
              </div>
              <Link
                href="/optimizer"
                className="mono"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "14px 24px",
                  borderRadius: 10,
                  background: "var(--accent)",
                  color: "#fff",
                  textDecoration: "none",
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                }}
              >
                Open optimizer <ArrowRight size={14} />
              </Link>
            </div>

            {/* Statement import — bulk path to backfill spend_entries from a
             * downloaded CSV without waiting for the Plaid/Flinks contract. */}
            <div style={{ marginTop: 28 }}>
              <CSVImportPanel />
            </div>
          </>
        )}
      </div>

      <style>{`
        @media (max-width: 720px) {
          .wallet-stat-strip { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .wallet-stat-strip > div { border-bottom: 1px solid var(--rule); padding-bottom: 14px; }
        }
      `}</style>
    </div>
  );
}

/* ── Single wallet row ────────────────────────────────────────────────── */

function WalletRow({
  userCard,
  sessionId,
  onChanged,
}: {
  userCard: UserCard;
  sessionId: string;
  onChanged: () => void;
}) {
  const card = userCard.card;
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(String(userCard.point_balance));
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // Two-click confirm pattern replaces native window.confirm(), which broke the
  // editorial visual language. First click flips the button to a "Confirm?"
  // state for 3s; second click within that window actually removes.
  useEffect(() => {
    if (!confirmingRemove) return;
    const t = setTimeout(() => setConfirmingRemove(false), 3000);
    return () => clearTimeout(t);
  }, [confirmingRemove]);

  async function save() {
    const bal = parseInt(input, 10);
    if (isNaN(bal) || bal < 0) { setErrMsg("Invalid balance"); return; }
    setSaving(true);
    setErrMsg(null);
    try {
      // Backend keys by catalog card_id (PUT /wallet/:sid/cards/:cardID →
      // user_cards WHERE user_id=$1 AND card_id=$2). Sending the wallet-row
      // id (userCard.id) matches zero rows and silently no-ops — same gotcha
      // the remove path documents below.
      await updateCardBalance(sessionId, userCard.card_id, bal);
      onChanged();
      setEditing(false);
    } catch { setErrMsg("Update failed"); }
    finally { setSaving(false); }
  }

  async function remove() {
    if (!confirmingRemove) {
      setConfirmingRemove(true);
      return;
    }
    setConfirmingRemove(false);
    setRemoving(true);
    try {
      // Backend keys deletes by catalog card_id (DELETE /wallet/:sid/cards/:cardID
      // → user_cards WHERE user_id=$1 AND card_id=$2). Sending the wallet-row id
      // here silently no-ops, which was the bug behind "remove doesn't work".
      await removeCardFromWallet(sessionId, userCard.card_id);
      onChanged();
    } catch { setRemoving(false); setErrMsg("Remove failed"); }
  }

  const programName = card?.loyalty_program?.name ?? "—";
  const cpp = card?.loyalty_program?.base_cpp ?? 1;
  const value = userCard.point_balance * (cpp / 100);
  const annualFee = userCard.has_annual_fee && userCard.custom_annual_fee != null
    ? userCard.custom_annual_fee
    : card?.annual_fee ?? 0;

  return (
    <article
      className="wallet-row"
      style={{
        position: "relative",
        border: "1px solid var(--rule-strong)",
        borderRadius: 14,
        background: "var(--card-fill)",
        padding: 18,
        boxShadow: "var(--shadow-1)",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        transition:
          "box-shadow 220ms cubic-bezier(0.16, 1, 0.3, 1), transform 220ms cubic-bezier(0.16, 1, 0.3, 1), border-color 220ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {/* Card visual + name + actions */}
      <div style={{ display: "grid", gridTemplateColumns: "180px minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
        <div>
          <CreditCardVisual card={card} balance={userCard.point_balance} size="sm" />
        </div>
        <div style={{ minWidth: 0 }}>
          <h3
            className="display wallet-card-name"
            style={{ fontSize: 19, margin: 0, lineHeight: 1.15, color: "var(--ink)" }}
          >
            {userCard.nickname || card?.name || "Card"}
          </h3>
          {userCard.nickname && card?.name && (
            <p className="serif" style={{ fontSize: 12, fontStyle: "italic", color: "var(--ink-3)", marginTop: 2 }}>
              {card.name}
            </p>
          )}
          <div className="serif" style={{ fontSize: 13, fontStyle: "italic", color: "var(--ink-3)", marginTop: 4 }}>
            {card?.issuer} · {programName}
          </div>
          <button
            type="button"
            onClick={remove}
            disabled={removing}
            className="mono"
            title={confirmingRemove ? "Click again to confirm removal" : "Remove from wallet"}
            style={{
              marginTop: 12,
              padding: "6px 10px",
              border: `1px solid ${confirmingRemove ? "var(--accent)" : "var(--rule)"}`,
              borderRadius: 8,
              background: confirmingRemove ? "var(--accent)" : "transparent",
              color: confirmingRemove ? "#fff" : "var(--ink-3)",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              cursor: removing ? "default" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              transition: "background 180ms ease, color 180ms ease, border-color 180ms ease",
            }}
          >
            <Trash2 size={11} /> {removing ? "Removing…" : confirmingRemove ? "Click again to remove" : "Remove"}
          </button>
        </div>
      </div>

      {/* Balance row — inline editable */}
      <div
        style={{
          borderTop: "1px solid var(--rule)",
          paddingTop: 14,
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <span className="eyebrow">Point balance</span>
        {editing ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="number"
                inputMode="decimal"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
                autoFocus
                style={{
                  width: 140,
                  padding: "8px 12px",
                  border: "1px solid var(--accent)",
                  borderRadius: 8,
                  fontFamily: "var(--font-mono)",
                  fontSize: 16,
                  color: "var(--ink)",
                  background: "var(--surface)",
                  outline: "none",
                }}
              />
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="mono"
                style={{
                  padding: "8px 12px",
                  background: "var(--accent)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                <Check size={12} />
              </button>
            </div>
            <FindMyBalanceLink programSlug={card?.loyalty_program?.slug} />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { setInput(String(userCard.point_balance)); setEditing(true); }}
            className="display"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--ink)",
              fontSize: 28,
              fontStyle: "italic",
              cursor: "pointer",
              padding: 0,
              display: "inline-flex",
              alignItems: "baseline",
              gap: 8,
            }}
            title="Tap to edit"
          >
            {userCard.point_balance.toLocaleString()}
            <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.04em", fontStyle: "normal" }}>
              pts
            </span>
            <Pencil size={11} style={{ color: "var(--ink-3)" }} />
          </button>
        )}
      </div>

      {/* Value + fee row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 0,
          borderTop: "1px solid var(--rule)",
          paddingTop: 12,
        }}
      >
        <div>
          <span className="eyebrow">Est. value</span>
          <div className="mono" style={{ fontSize: 16, color: "var(--gain)", fontWeight: 600, marginTop: 4 }}>
            ${value.toFixed(2)}
          </div>
        </div>
        <div>
          <span className="eyebrow">Annual fee</span>
          <div className="mono" style={{ fontSize: 16, color: annualFee > 0 ? "var(--ink)" : "var(--gain)", marginTop: 4 }}>
            {annualFee > 0 ? `$${annualFee.toFixed(0)}/yr` : "Free"}
          </div>
        </div>
      </div>

      {errMsg && (
        <p className="mono" style={{ fontSize: 11, color: "var(--accent)", letterSpacing: "0.06em" }}>
          ⚠ {errMsg}
        </p>
      )}
    </article>
  );
}

/* ── Subcomponents ────────────────────────────────────────────────────── */

function Stat({ label, value, accent, last }: { label: string; value: string; accent?: boolean; last?: boolean }) {
  return (
    <div style={{ padding: "0 22px 0 0", borderRight: last ? "none" : "1px solid var(--rule)" }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>{label}</div>
      <div
        className="display"
        style={{
          fontSize: 32,
          fontStyle: "italic",
          color: accent ? "var(--accent)" : "var(--ink)",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="mono"
      style={{
        padding: "9px 16px",
        borderRadius: 999,
        border: "1px solid var(--rule)",
        background: "var(--card-fill)",
        color: "var(--ink-2)",
        textDecoration: "none",
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: "0.04em",
      }}
    >
      {label} →
    </Link>
  );
}

function EmptyWallet() {
  return (
    <div
      style={{
        borderTop: "1px solid var(--ink)",
        borderBottom: "1px solid var(--rule)",
        padding: "60px 0 64px",
        textAlign: "center",
      }}
    >
      <span className="eyebrow" style={{ color: "var(--accent)" }}>Build a wallet</span>
      <h3 className="display" style={{ fontSize: "clamp(28px, 4vw, 40px)", margin: "10px 0 0", lineHeight: 1, fontStyle: "italic" }}>
        No cards yet.
      </h3>
      <p className="serif" style={{ fontStyle: "italic", color: "var(--ink-2)", fontSize: 16, marginTop: 10, marginBottom: 18 }}>
        Add the cards you carry — Maple models them against your spend in real time.
      </p>
      <Link
        href="/cards"
        className="mono"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "14px 26px",
          borderRadius: 10,
          background: "var(--accent)",
          textDecoration: "none",
          color: "#fff",
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.10em",
          textTransform: "uppercase",
        }}
      >
        <Plus size={13} /> Add a card
      </Link>
    </div>
  );
}

/* ── Find-my-balance deep link ─────────────────────────────────────────
 * Beginners often have no idea where to look up their Aeroplan/Scene+/etc
 * point balance. This component maps each loyalty-program slug to a known
 * landing page (login or "manage points") so the user can grab the number
 * and paste it back into the wallet without a Google detour. */
const BALANCE_LOOKUP_URLS: Record<string, string> = {
  "aeroplan":         "https://www.aircanada.com/ca/en/aco/home/aeroplan/account.html",
  "amex-mr-ca":       "https://www.americanexpress.com/en-ca/account/login/",
  "rbc-avion":        "https://www.rbcrewards.com/",
  "scene-plus":       "https://www.sceneplus.ca/login",
  "td-rewards":       "https://www.tdrewards.com/",
  "cibc-aventura":    "https://www.cibcrewards.com/",
  "bmo-rewards":      "https://www.bmorewards.com/",
  "marriott-bonvoy":  "https://www.marriott.com/sign-in.mi",
  "hilton-honors":    "https://www.hilton.com/en/hilton-honors/login/",
  "wealthsimple-cash":"https://my.wealthsimple.com/app/cash",
  "scotia-rewards":   "https://www.scotiarewards.com/",
  "pc-optimum":       "https://www.pcoptimum.ca/account",
  "ct-money":         "https://triangle.canadiantire.ca/en.html",
  "air-miles":        "https://www.airmiles.ca/en/login.html",
};

function FindMyBalanceLink({ programSlug }: { programSlug?: string }) {
  const url = programSlug ? BALANCE_LOOKUP_URLS[programSlug] : undefined;
  if (!url) {
    return (
      <span className="mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
        Not sure? Check your issuer app or statement.
      </span>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mono"
      style={{
        fontSize: 10,
        color: "var(--accent)",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        textDecoration: "none",
      }}
    >
      ↗ Find my number on the program site
    </a>
  );
}
