"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/contexts/wallet-context";
import { listCards } from "@/lib/api";
import type { Card, UserCard } from "@/lib/types";
import { CardEditModal } from "@/components/cards/card-edit-modal";
import { EditorialCardVisual } from "@/components/editorial/editorial-card";
import { HeadToHeadPicker } from "@/components/cards/head-to-head-picker";
import { LeafDivider } from "@/components/editorial/leaf-divider";
import { WelcomeOfferBadge } from "@/components/welcome-offer-badge";
import { cardImageUrl } from "@/lib/card-images";

/* ─────────────────────────────────────────────────────────────────────────────
 * Editorial Cards page.
 *
 *   1. Page masthead — eyebrow + display title + serif lede + count
 *   2. Wallet rail — horizontal stylised card visuals you can edit
 *   3. Filter pills (issuer / network / fee tier)
 *   4. Available-cards ledger — editorial table rows (no card chips)
 * ───────────────────────────────────────────────────────────────────────────── */

type Filter = {
  network?: "amex" | "visa" | "mastercard";
  feeTier?: "free" | "low" | "premium";
  issuer?: string;
};

export default function CardsPage() {
  const { wallet, isLoading: walletLoading, addCard } = useWallet();
  const [allCards, setAllCards] = useState<Card[]>([]);
  const [cardsLoading, setCardsLoading] = useState(true);
  const [cardsError, setCardsError] = useState<string | null>(null);
  const [addingCardId, setAddingCardId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [editingCard, setEditingCard] = useState<UserCard | null>(null);
  const [filter, setFilter] = useState<Filter>({});
  const carouselRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCardsLoading(true);
    listCards()
      .then((data) => setAllCards(data ?? []))
      .catch(() => setCardsError("Could not load cards"))
      .finally(() => setCardsLoading(false));
  }, []);

  const walletCardIds = new Set(wallet.map((uc) => uc.card_id));

  async function handleAddCard(cardId: string) {
    setAddingCardId(cardId);
    try {
      await addCard(cardId);
      setAddedIds((prev) => new Set([...prev, cardId]));
    } catch {
      /* noop */
    } finally {
      setAddingCardId(null);
    }
  }

  // Filtered set + issuer list (top issuers by frequency)
  const issuers = useMemo(() => {
    const counts: Record<string, number> = {};
    allCards.forEach((c) => (counts[c.issuer] = (counts[c.issuer] ?? 0) + 1));
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6)
      .map(([n]) => n);
  }, [allCards]);

  const filtered = useMemo(() => {
    return allCards.filter((c) => {
      if (filter.network && c.network !== filter.network) return false;
      if (filter.issuer && c.issuer !== filter.issuer) return false;
      if (filter.feeTier === "free" && c.annual_fee !== 0) return false;
      if (filter.feeTier === "low" && (c.annual_fee === 0 || c.annual_fee >= 150)) return false;
      if (filter.feeTier === "premium" && c.annual_fee < 150) return false;
      return true;
    });
  }, [allCards, filter]);

  return (
    <div className="reveal" style={{ paddingTop: 0 }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px clamp(20px, 4vw, 60px) 80px" }}>
        {/* ── Masthead ─────────────────────────────────────────────── */}
        <header
          style={{
            borderBottom: "1px solid var(--rule)",
            paddingBottom: 28,
            marginBottom: 32,
            display: "grid",
            gridTemplateColumns: "1fr auto",
            alignItems: "end",
            gap: 24,
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <span className="eyebrow">Catalogue</span>
              <span className="mr-kicker-line" style={{ maxWidth: 100 }} />
              <span className="eyebrow">{allCards.length} cards · CAD</span>
            </div>
            <h1
              className="display"
              style={{ fontSize: "clamp(40px, 5vw, 56px)", margin: 0, letterSpacing: "-0.015em", lineHeight: 0.96 }}
            >
              The Canadian<br />
              <span style={{ color: "var(--accent)" }}>card</span>{" "}
              <span style={{ fontStyle: "italic" }}>register</span>.
            </h1>
            <p
              className="serif"
              style={{
                fontSize: 17,
                fontStyle: "italic",
                color: "var(--ink-2)",
                marginTop: 14,
                maxWidth: 560,
                lineHeight: 1.45,
              }}
            >
              Every card priced against your wallet. Annual-fee math, welcome-bonus
              runways, and effective-return on the categories you actually spend in.
            </p>
          </div>
          <Link
            href="/wallet"
            className="btn btn-primary"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            + Add a card
          </Link>
        </header>

        {/* ── Head-to-head compare picker ─────────────────────────────
            Two dropdowns + Compare button → navigates to /compare/[a]/[b].
            Public; no auth required. */}
        {allCards.length > 0 && <HeadToHeadPicker cards={allCards} />}

        {/* ── Wallet rail ──────────────────────────────────────────── */}
        <section style={{ marginBottom: 48 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 18 }}>
            <div>
              <span className="eyebrow">Your collection</span>
              <h2 className="display" style={{ fontSize: 24, margin: "4px 0 0", letterSpacing: "-0.005em" }}>
                Wallet
              </h2>
            </div>
            <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {wallet.length} card{wallet.length === 1 ? "" : "s"}
            </span>
          </div>

          {walletLoading ? (
            <div style={{ display: "flex", gap: 16, overflowX: "auto", paddingBottom: 8 }}>
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{
                    width: 300,
                    height: 188,
                    borderRadius: 14,
                    flexShrink: 0,
                  }}
                  className="shimmer"
                />
              ))}
            </div>
          ) : wallet.length === 0 ? (
            <div
              style={{
                padding: "48px 32px",
                textAlign: "center",
                border: "1px dashed var(--rule-strong)",
                borderRadius: 14,
                background: "var(--card-fill)",
              }}
            >
              <span className="eyebrow">Empty wallet</span>
              <h3 className="display" style={{ fontSize: 28, margin: "8px 0 6px" }}>
                Nothing tracked yet.
              </h3>
              <p
                className="serif"
                style={{ fontSize: 15, fontStyle: "italic", color: "var(--ink-2)", marginBottom: 20, maxWidth: 360, marginInline: "auto", lineHeight: 1.4 }}
              >
                Add the cards you carry — Maple will start pricing every swipe against
                them.
              </p>
              <Link href="/wallet" className="btn btn-primary">
                Add cards
              </Link>
            </div>
          ) : (
            <div
              ref={carouselRef}
              style={{
                display: "flex",
                gap: 18,
                overflowX: "auto",
                paddingBottom: 8,
                scrollbarWidth: "none",
                msOverflowStyle: "none" as never,
              }}
            >
              {wallet.map((uc) => (
                <button
                  key={uc.id}
                  onClick={() => setEditingCard(uc)}
                  style={{
                    flexShrink: 0,
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    transition: "transform 200ms cubic-bezier(.2,.7,.2,1)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-3px)")}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
                  title={uc.card?.name ?? "Edit card"}
                >
                  <EditorialCardVisual
                    card={{
                      name: uc.card?.name ?? "Card",
                      issuer: uc.card?.issuer,
                      network: uc.card?.network,
                      imageUrl: cardImageUrl(uc.card?.name),
                    }}
                    size="md"
                  />
                  <div
                    className="mono"
                    style={{
                      fontSize: 10,
                      color: "var(--ink-3)",
                      marginTop: 8,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      textAlign: "left",
                      paddingLeft: 4,
                    }}
                  >
                    {(uc.point_balance ?? 0).toLocaleString()} pts
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <LeafDivider />

        {/* ── Filter pills ─────────────────────────────────────────── */}
        <section style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 18 }}>
            <div>
              <span className="eyebrow">All cards</span>
              <h2 className="display" style={{ fontSize: 24, margin: "4px 0 0", letterSpacing: "-0.005em" }}>
                Available register
              </h2>
            </div>
            <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {filtered.length} matching
            </span>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {/* Network */}
            <FilterChip
              label="All networks"
              active={!filter.network}
              onClick={() => setFilter((f) => ({ ...f, network: undefined }))}
            />
            {(["amex", "visa", "mastercard"] as const).map((n) => (
              <FilterChip
                key={n}
                label={n.toUpperCase()}
                active={filter.network === n}
                onClick={() =>
                  setFilter((f) => ({ ...f, network: f.network === n ? undefined : n }))
                }
              />
            ))}
            <span style={{ width: 1, height: 22, background: "var(--rule)", margin: "0 6px" }} />
            {/* Fee tier */}
            <FilterChip
              label="No AF"
              active={filter.feeTier === "free"}
              onClick={() =>
                setFilter((f) => ({ ...f, feeTier: f.feeTier === "free" ? undefined : "free" }))
              }
            />
            <FilterChip
              label="Low fee"
              active={filter.feeTier === "low"}
              onClick={() =>
                setFilter((f) => ({ ...f, feeTier: f.feeTier === "low" ? undefined : "low" }))
              }
            />
            <FilterChip
              label="Premium"
              active={filter.feeTier === "premium"}
              onClick={() =>
                setFilter((f) => ({ ...f, feeTier: f.feeTier === "premium" ? undefined : "premium" }))
              }
            />
            <span style={{ width: 1, height: 22, background: "var(--rule)", margin: "0 6px" }} />
            {/* Issuer (top 6) */}
            {issuers.map((iss) => (
              <FilterChip
                key={iss}
                label={iss}
                active={filter.issuer === iss}
                onClick={() =>
                  setFilter((f) => ({ ...f, issuer: f.issuer === iss ? undefined : iss }))
                }
              />
            ))}
          </div>
        </section>

        {/* ── Available-cards ledger ──────────────────────────────── */}
        <section>
          {cardsLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <RowSkeleton key={i} />
              ))}
            </div>
          ) : cardsError ? (
            <div
              style={{
                padding: "32px",
                textAlign: "center",
                border: "1px solid var(--accent-soft)",
                borderRadius: 14,
                background: "var(--card-fill)",
              }}
            >
              <p className="mono" style={{ fontSize: 12, color: "var(--accent)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                {cardsError}
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: "48px", textAlign: "center" }}>
              <span className="eyebrow">No matches</span>
              <p
                className="serif"
                style={{ fontStyle: "italic", color: "var(--ink-2)", marginTop: 6, fontSize: 15 }}
              >
                Loosen the filters to see more cards.
              </p>
            </div>
          ) : (
            <div
              style={{
                borderTop: "1px solid var(--ink)",
                borderBottom: "1px solid var(--rule)",
              }}
            >
              {filtered.map((card) => {
                const inWallet = walletCardIds.has(card.id) || addedIds.has(card.id);
                const isAdding = addingCardId === card.id;
                return (
                  <CardLedgerRow
                    key={card.id}
                    card={card}
                    inWallet={inWallet}
                    isAdding={isAdding}
                    onAdd={() => !inWallet && handleAddCard(card.id)}
                  />
                );
              })}
            </div>
          )}
        </section>

        {editingCard && (
          <CardEditModal
            card={editingCard}
            open={!!editingCard}
            onClose={() => setEditingCard(null)}
          />
        )}
      </div>
    </div>
  );
}

/* ── Subcomponents ──────────────────────────────────────────────────────── */

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mono"
      style={{
        padding: "6px 12px",
        borderRadius: 999,
        background: active ? "var(--accent)" : "transparent",
        color: active ? "#fff" : "var(--ink-2)",
        border: `1px solid ${active ? "var(--accent)" : "var(--rule)"}`,
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        cursor: "pointer",
        transition: "all 180ms cubic-bezier(.2,.7,.2,1)",
      }}
    >
      {label}
    </button>
  );
}

function CardLedgerRow({
  card,
  inWallet,
  isAdding,
  onAdd,
}: {
  card: Card;
  inWallet: boolean;
  isAdding: boolean;
  onAdd: () => void;
}) {
  const fee = card.annual_fee === 0 ? "No annual fee" : `$${card.annual_fee}/yr`;
  const bonusValue =
    card.welcome_bonus_points > 0
      ? `${card.welcome_bonus_points.toLocaleString()} pts`
      : null;
  const bonusSpend =
    card.welcome_bonus_min_spend > 0
      ? `on $${card.welcome_bonus_min_spend.toLocaleString()} in ${card.welcome_bonus_months}mo`
      : null;

  return (
    <Link
      href={`/cards/${card.id}`}
      style={{
        display: "grid",
        gridTemplateColumns: "84px 1fr 180px 120px 130px",
        alignItems: "center",
        gap: 18,
        padding: "20px 4px",
        borderTop: "1px solid var(--rule)",
        textDecoration: "none",
        color: "inherit",
        transition: "background 160ms",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--card-fill)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {/* Index/network glyph */}
      <div className="mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
        {card.network?.toUpperCase() ?? "—"}
      </div>

      {/* Name + issuer */}
      <div style={{ minWidth: 0 }}>
        <div
          className="display"
          style={{
            fontSize: 22,
            letterSpacing: "-0.005em",
            color: "var(--ink)",
            lineHeight: 1.1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {card.name}
        </div>
        <div
          className="serif"
          style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 2, fontStyle: "italic", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
        >
          <span>
            {card.issuer}
            {bonusValue && (
              <>
                {" · "}
                <span className="mono" style={{ fontStyle: "normal", color: "var(--accent)", fontSize: 11, letterSpacing: "0.04em" }}>
                  {bonusValue}
                </span>
                {bonusSpend && <span style={{ color: "var(--ink-3)" }}> {bonusSpend}</span>}
              </>
            )}
          </span>
          <WelcomeOfferBadge expiresAt={card.welcome_bonus_offer_expires_at} />
        </div>
      </div>

      {/* Fee */}
      <div className="mono" style={{ fontSize: 12, color: "var(--ink-2)", letterSpacing: "0.04em" }}>
        {fee}
      </div>

      {/* CPP / loyalty program slug */}
      <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)", letterSpacing: "0.04em" }}>
        {(card.loyalty_program?.name ?? "—").toUpperCase()}
      </div>

      {/* CTA */}
      <div style={{ justifySelf: "end" }}>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!inWallet && !isAdding) onAdd();
          }}
          disabled={inWallet || isAdding}
          className="mono"
          style={{
            height: 36,
            padding: "0 16px",
            borderRadius: 8,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            background: inWallet ? "transparent" : "var(--accent)",
            color: inWallet ? "var(--gain)" : "#fff",
            border: inWallet ? "1px solid var(--gain)" : "1px solid var(--accent)",
            cursor: inWallet || isAdding ? "default" : "pointer",
            transition: "transform 160ms",
          }}
        >
          {inWallet ? "✓ In wallet" : isAdding ? "Adding…" : "+ Add"}
        </button>
      </div>
    </Link>
  );
}

function RowSkeleton() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "84px 1fr 180px 120px 130px",
        alignItems: "center",
        gap: 18,
        padding: "20px 4px",
        borderTop: "1px solid var(--rule)",
      }}
    >
      <div style={{ height: 10, width: 60 }} className="shimmer" />
      <div>
        <div style={{ height: 20, width: "60%", marginBottom: 6 }} className="shimmer" />
        <div style={{ height: 12, width: "40%" }} className="shimmer" />
      </div>
      <div style={{ height: 12, width: 80 }} className="shimmer" />
      <div style={{ height: 12, width: 90 }} className="shimmer" />
      <div style={{ justifySelf: "end", height: 36, width: 90, borderRadius: 8 }} className="shimmer" />
    </div>
  );
}
