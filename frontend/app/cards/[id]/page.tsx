"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ArrowLeftRight, AlertTriangle } from "lucide-react";
import { CreditCardVisual } from "@/components/cards/credit-card-visual";
import { getCardDetail } from "@/lib/api";
import type { CardDetail, MultiplierRow, TransferPartner } from "@/lib/types";
import { Term } from "@/components/ui/term";
import { WelcomeOfferBadge } from "@/components/welcome-offer-badge";
import { ApplyButton } from "@/components/cards/ApplyButton";
import { EligibilityChip } from "@/components/cards/EligibilityChip";
import { useSession } from "@/contexts/session-context";

type TabKey = "overview" | "earn-rates" | "transfer-partners";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "earn-rates", label: "Earn rates" },
  { key: "transfer-partners", label: "Transfer partners" },
];

/* ── Subcomponents ─────────────────────────────────────────────────────── */

function InfoRow({
  label,
  value,
  highlight,
  isLast,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  isLast?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        alignItems: "baseline",
        padding: "18px 22px",
        borderBottom: isLast ? "none" : "1px solid var(--rule)",
        gap: 16,
      }}
    >
      <span className="serif" style={{ fontSize: 14, fontStyle: "italic", color: "var(--ink-2)" }}>
        {label}
      </span>
      <span
        className="display"
        style={{
          fontSize: 18,
          color: highlight ? "var(--accent)" : "var(--ink)",
          letterSpacing: "-0.005em",
          textAlign: "right",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function EarnRateRow({ row, isLast }: { row: MultiplierRow; isLast: boolean }) {
  /* Earn-rate tone: 3x+ reads as the brand reward (maple), 2x as a
   * supporting prize (gold), 1x as baseline. Semantic tokens, not neon. */
  const tone =
    row.earn_rate >= 3 ? "var(--accent)" : row.earn_rate >= 2 ? "var(--gold)" : "var(--ink)";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        alignItems: "center",
        gap: 18,
        padding: "16px 22px",
        borderBottom: isLast ? "none" : "1px solid var(--rule)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <p className="display" style={{ fontSize: 15, color: "var(--ink)", margin: 0, lineHeight: 1.2 }}>
          {row.category_name}
        </p>
        {row.notes && (
          <p className="serif" style={{ fontSize: 12, fontStyle: "italic", color: "var(--ink-3)", marginTop: 4, lineHeight: 1.4 }}>
            {row.notes}
          </p>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        {row.cap_amount != null && (
          <span
            className="mono"
            style={{
              padding: "3px 10px",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              background: "var(--gold-tint)",
              border: "1px solid var(--gold-soft)",
              color: "var(--gold)",
            }}
          >
            Cap ${row.cap_amount.toLocaleString()}{row.cap_period ? `/${row.cap_period}` : ""}
          </span>
        )}
        <span
          className="display"
          style={{
            fontSize: 22,
            fontStyle: "italic",
            color: tone,
            letterSpacing: "-0.01em",
            lineHeight: 1,
          }}
        >
          {row.earn_rate}×
        </span>
        <span
          className="mono"
          style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}
        >
          {row.earn_type}
        </span>
      </div>
    </div>
  );
}

function TransferPartnerCard({ partner }: { partner: TransferPartner }) {
  const program = partner.to_program;
  return (
    <div
      style={{
        position: "relative",
        background: "var(--surface)",
        border: "1px solid var(--rule-strong)",
        borderRadius: 14,
        padding: 18,
        boxShadow: "var(--shadow-1)",
        overflow: "hidden",
        transition: "box-shadow 220ms cubic-bezier(0.16, 1, 0.3, 1), transform 220ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {/* Top accent stripe in info tone */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: "var(--info)",
        }}
      />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--info-soft)",
              border: "1px solid var(--info-border)",
              color: "var(--info)",
              flexShrink: 0,
            }}
          >
            <ArrowLeftRight size={16} strokeWidth={1.8} />
          </div>
          <div style={{ minWidth: 0 }}>
            <p className="display" style={{ fontSize: 15, color: "var(--ink)", margin: 0, lineHeight: 1.2 }}>
              {program?.name ?? "Unknown"}
            </p>
            <p className="serif" style={{ fontSize: 12, fontStyle: "italic", color: "var(--ink-3)", marginTop: 3 }}>
              {program?.currency_name ?? "Points"}
            </p>
          </div>
        </div>

        <span
          className="mono"
          style={{
            flexShrink: 0,
            padding: "4px 12px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.04em",
            background: "var(--accent-wash)",
            border: "1px solid var(--accent-soft)",
            color: "var(--accent)",
          }}
        >
          {partner.transfer_ratio}:1
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, borderTop: "1px solid var(--rule)", paddingTop: 12 }}>
        <div>
          <p className="mono" style={{ fontSize: 9, color: "var(--ink-3)", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>
            Processing
          </p>
          <p className="display" style={{ fontSize: 14, color: "var(--ink)", lineHeight: 1.1 }}>
            {partner.processing_days === 0 ? "Instant" : `${partner.processing_days} day${partner.processing_days !== 1 ? "s" : ""}`}
          </p>
        </div>
        {program?.base_cpp != null && (
          <div style={{ borderLeft: "1px solid var(--rule)", paddingLeft: 14 }}>
            <p className="mono" style={{ fontSize: 9, color: "var(--ink-3)", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>
              Dest. CPP
            </p>
            <p className="display" style={{ fontSize: 14, color: "var(--accent)", lineHeight: 1.1, fontStyle: "italic" }}>
              {program.base_cpp.toFixed(2)}¢/pt
            </p>
          </div>
        )}
      </div>

      {partner.notes && (
        <p
          className="serif"
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: "1px solid var(--rule)",
            fontSize: 12,
            fontStyle: "italic",
            color: "var(--ink-3)",
            lineHeight: 1.5,
          }}
        >
          {partner.notes}
        </p>
      )}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px clamp(20px, 4vw, 60px) 80px" }}>
      <div className="h-4 w-32 rounded shimmer mb-8" />
      <div style={{ display: "flex", gap: 24, marginBottom: 32, flexWrap: "wrap" }}>
        <div style={{ width: 320, height: 200, borderRadius: 14, flexShrink: 0 }} className="shimmer" />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="h-3 w-24 rounded shimmer mb-3" />
          <div className="h-10 w-72 rounded shimmer mb-4" />
          <div style={{ display: "flex", gap: 8 }}>
            <div className="h-7 w-16 rounded-full shimmer" />
            <div className="h-7 w-20 rounded-full shimmer" />
            <div className="h-7 w-24 rounded-full shimmer" />
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 20, marginBottom: 24, borderBottom: "1px solid var(--rule)", paddingBottom: 10 }}>
        {[88, 96, 130].map((w, i) => (
          <div key={i} className="h-4 rounded shimmer" style={{ width: w }} />
        ))}
      </div>
      <div style={{ background: "var(--surface)", border: "1px solid var(--rule-strong)", borderRadius: 14, padding: 4 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "16px 18px", borderBottom: i < 4 ? "1px solid var(--rule)" : "none" }}>
            <div className="h-4 w-32 rounded shimmer" />
            <div className="h-4 w-24 rounded shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────── */

export default function CardDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const cardId = params?.id as string;
  const { sessionId } = useSession();

  const fromHint = searchParams?.get("from");
  const backHref =
    fromHint === "optimizer" ? "/optimizer" : fromHint === "wallet" ? "/wallet" : "/cards";
  const backLabel =
    fromHint === "optimizer" ? "Back to optimizer" : fromHint === "wallet" ? "Back to wallet" : "Back to register";
  const goBack = () => router.push(backHref);

  const [detail, setDetail] = useState<CardDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  useEffect(() => {
    if (!cardId) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    getCardDetail(cardId)
      .then((data) => {
        if (!data) { setNotFound(true); return; }
        setDetail(data);
      })
      .catch((err: Error) => {
        if (err.message?.includes("404") || err.message?.includes("not found")) {
          setNotFound(true);
        } else {
          setError(err.message || "Could not load card details");
        }
      })
      .finally(() => setLoading(false));
  }, [cardId]);

  if (loading) return <DetailSkeleton />;

  if (notFound || (error && !detail)) {
    return (
      <div className="reveal" style={{ paddingTop: 0 }}>
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "60px clamp(20px, 4vw, 60px)" }}>
          <BackButton onClick={goBack} label={backLabel} />
          <div
            style={{
              background: "var(--card-fill)",
              border: "1px solid var(--accent)",
              borderRadius: 14,
              padding: "48px 32px",
              textAlign: "center",
              boxShadow: "var(--shadow-1)",
              marginTop: 32,
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 999,
                margin: "0 auto 20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--accent-wash)",
                border: "1px solid var(--accent-soft)",
                color: "var(--accent)",
              }}
            >
              <AlertTriangle size={24} strokeWidth={1.5} />
            </div>
            <h2 className="display" style={{ fontSize: 28, fontStyle: "italic", color: "var(--ink)", margin: 0, lineHeight: 1.1 }}>
              {notFound ? "Card not found" : "Something went wrong"}
            </h2>
            <p className="serif" style={{ fontSize: 15, fontStyle: "italic", color: "var(--ink-2)", marginTop: 10, lineHeight: 1.55, maxWidth: 380, marginLeft: "auto", marginRight: "auto" }}>
              {notFound
                ? "This card doesn't exist in the register, or it has been removed."
                : error ?? "Something went wrong loading the card."}
            </p>
            <button onClick={goBack} className="btn btn-primary" style={{ marginTop: 24, fontSize: 12, height: 40 }}>
              {backLabel}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!detail) return <DetailSkeleton />;

  const { card, multipliers, transfer_partners, value_range_low, value_range_high } = detail;

  return (
    <div className="reveal cards-detail-root" style={{ paddingTop: 0 }}>
      {/* Dark-mode gold tokens. --gold/--gold-soft/--gold-tint are defined only
          in :root (light) in globals.css, so in dark mode the gold annual-fee
          pill, the cap-amount badge on earn rates, the 2× earn tone, and the
          hero radial backdrop resolved to undefined. Brighten them to read on
          the dark surface (mirrors how the dark block lifts --chart-gold).
          Scoped to this page root, not globals.css. */}
      <style>{`
        [data-theme="dark"] .cards-detail-root {
          --gold: #ECC868;
          --gold-soft: rgba(236, 200, 104, 0.24);
          --gold-tint: rgba(236, 200, 104, 0.14);
        }
      `}</style>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px clamp(20px, 4vw, 60px) 80px" }}>
        <BackButton onClick={goBack} label={backLabel} />

        {/* Hero: card art + masthead. Accent radial backdrop ties it into the
            editorial brand moments used on pricing + pro-tools. */}
        <section
          style={{
            position: "relative",
            display: "grid",
            gridTemplateColumns: "minmax(280px, 360px) 1fr",
            gap: 36,
            alignItems: "center",
            padding: "36px 0 32px",
            marginBottom: 28,
            borderBottom: "1px solid var(--rule)",
          }}
          className="card-detail-hero fade-up m-grid-1"
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: "-20px -40px",
              background:
                "radial-gradient(ellipse 60% 70% at 0% 50%, var(--accent-glow), transparent 60%), radial-gradient(ellipse 40% 50% at 100% 100%, var(--gold-soft), transparent 65%)",
              pointerEvents: "none",
              zIndex: 0,
            }}
          />
          <div className="m-card-fit" style={{ position: "relative", zIndex: 1 }}>
            <CreditCardVisual card={card} size="lg" />
          </div>

          <div style={{ position: "relative", zIndex: 1, minWidth: 0 }}>
            <p className="eyebrow" style={{ color: "var(--accent)", marginBottom: 12 }}>
              {card.issuer}
            </p>
            <h1
              className="display"
              style={{
                fontSize: "clamp(36px, 4.5vw, 52px)",
                margin: 0,
                lineHeight: 0.98,
                letterSpacing: "-0.015em",
              }}
            >
              {card.name}
            </h1>

            {/* Pill row: network · annual fee · CPP range */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 18 }}>
              <Pill tone="ink">{card.network.toUpperCase()}</Pill>
              {card.annual_fee === 0 ? (
                <Pill tone="gain">No annual fee</Pill>
              ) : (
                <Pill tone="gold">${card.annual_fee}/yr</Pill>
              )}
              {value_range_high > 0 && (
                <Pill tone="accent">
                  {value_range_low.toFixed(2)}–{value_range_high.toFixed(2)}¢/pt
                </Pill>
              )}
            </div>

            <div style={{ marginTop: 22 }}>
              <ApplyButton
                cardId={card.id}
                cardName={card.name}
                hasAffiliate={Boolean(card.affiliate_url)}
                size="md"
              />
            </div>

            <div style={{ marginTop: 16 }}>
              <EligibilityChip sessionId={sessionId} cardId={card.id} />
            </div>
          </div>
        </section>

        {/* Tabs */}
        <div
          className="fade-up-1"
          style={{
            display: "flex",
            gap: 4,
            marginBottom: 24,
            overflowX: "auto",
            borderBottom: "1px solid var(--rule)",
          }}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const badgeCount =
              tab.key === "earn-rates"
                ? multipliers.length
                : tab.key === "transfer-partners"
                  ? transfer_partners.length
                  : null;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="mono"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "12px 18px",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                  color: isActive ? "var(--accent)" : "var(--ink-3)",
                  background: "transparent",
                  border: "none",
                  borderBottom: `2px solid ${isActive ? "var(--accent)" : "transparent"}`,
                  marginBottom: -1,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  transition: "color 220ms cubic-bezier(0.16, 1, 0.3, 1), border-color 220ms cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              >
                {tab.label}
                {badgeCount != null && badgeCount > 0 && (
                  <span
                    className="mono"
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: "1px 7px",
                      borderRadius: 999,
                      background: isActive ? "var(--accent-wash)" : "var(--surface-2)",
                      color: isActive ? "var(--accent)" : "var(--ink-3)",
                    }}
                  >
                    {badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="fade-up-2">
          {activeTab === "overview" && (
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--rule-strong)",
                borderRadius: 14,
                overflow: "hidden",
                boxShadow: "var(--shadow-1)",
              }}
            >
              <InfoRow
                label="Annual fee"
                value={card.annual_fee === 0 ? "No annual fee" : `$${card.annual_fee} CAD/year`}
              />
              {card.welcome_bonus_points > 0 && (
                <>
                  <InfoRow
                    label="Welcome bonus"
                    value={`${card.welcome_bonus_points.toLocaleString()} points`}
                    highlight
                  />
                  <InfoRow
                    label="Minimum spend"
                    value={`$${card.welcome_bonus_min_spend.toLocaleString()} in ${card.welcome_bonus_months} months`}
                  />
                  {card.welcome_bonus_offer_expires_at && (
                    <div style={{ padding: "10px 22px 14px" }}>
                      <WelcomeOfferBadge expiresAt={card.welcome_bonus_offer_expires_at} variant="banner" />
                    </div>
                  )}
                </>
              )}
              <InfoRow label="Loyalty program" value={card.loyalty_program?.name ?? "—"} />
              <InfoRow label="Point currency" value={card.loyalty_program?.currency_name ?? "—"} />
              {value_range_low > 0 && value_range_high > 0 && (
                <InfoRow
                  label="Point value range"
                  value={`${value_range_low.toFixed(2)}¢ – ${value_range_high.toFixed(2)}¢ per point`}
                />
              )}
              <InfoRow label="Network" value={card.network.toUpperCase()} isLast />
            </div>
          )}

          {activeTab === "earn-rates" && (
            multipliers.length === 0 ? (
              <div
                style={{
                  background: "var(--card-fill)",
                  border: "1px solid var(--rule)",
                  borderRadius: 14,
                  padding: "40px 28px",
                  textAlign: "center",
                  boxShadow: "var(--shadow-1)",
                }}
              >
                <p className="serif" style={{ fontSize: 15, fontStyle: "italic", color: "var(--ink-2)" }}>
                  No earn rate data available for this card.
                </p>
              </div>
            ) : (
              <div>
                {/* Legend */}
                <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 16, padding: "0 4px", flexWrap: "wrap" }}>
                  {[
                    { label: "3×+", color: "var(--accent)" },
                    { label: "2×", color: "var(--gold)" },
                    { label: "1×", color: "var(--ink-3)" },
                  ].map((item) => (
                    <div key={item.label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: item.color }} />
                      <span className="mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                        {item.label}
                      </span>
                    </div>
                  ))}
                  <span className="mono" style={{ marginLeft: "auto", fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    {multipliers.length} categories
                  </span>
                  <span className="mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    <Term k="earn-rate" />
                  </span>
                </div>

                <div
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--rule-strong)",
                    borderRadius: 14,
                    overflow: "hidden",
                    boxShadow: "var(--shadow-1)",
                  }}
                >
                  {multipliers.map((row, i) => (
                    <EarnRateRow key={`${row.category_slug}-${i}`} row={row} isLast={i === multipliers.length - 1} />
                  ))}
                </div>
              </div>
            )
          )}

          {activeTab === "transfer-partners" && (
            transfer_partners.length === 0 ? (
              <div
                style={{
                  background: "var(--card-fill)",
                  border: "1px solid var(--rule)",
                  borderRadius: 14,
                  padding: "40px 28px",
                  textAlign: "center",
                  boxShadow: "var(--shadow-1)",
                }}
              >
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 999,
                    margin: "0 auto 16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "var(--surface-2)",
                    border: "1px solid var(--rule)",
                    color: "var(--ink-3)",
                  }}
                >
                  <ArrowLeftRight size={22} strokeWidth={1.5} />
                </div>
                <h3 className="display" style={{ fontSize: 20, fontStyle: "italic", color: "var(--ink)", margin: 0, lineHeight: 1.2 }}>
                  No transfer partners
                </h3>
                <p className="serif" style={{ fontSize: 14, fontStyle: "italic", color: "var(--ink-2)", marginTop: 8, lineHeight: 1.55 }}>
                  This card doesn&apos;t support points transfers.
                </p>
              </div>
            ) : (
              <div>
                <p
                  className="serif"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 14,
                    fontStyle: "italic",
                    color: "var(--ink-2)",
                    marginBottom: 16,
                    paddingLeft: 4,
                  }}
                >
                  {transfer_partners.length} transfer partner{transfer_partners.length !== 1 ? "s" : ""} available
                  <Term k="transfer-partners" />
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
                  {transfer_partners.map((partner) => (
                    <TransferPartnerCard key={partner.id} partner={partner} />
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Small helpers ─────────────────────────────────────────────────────── */

function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="mono"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        marginBottom: 8,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.10em",
        textTransform: "uppercase",
        color: "var(--ink-3)",
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: 0,
        transition: "color 220ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--ink-3)")}
    >
      <ChevronLeft size={14} strokeWidth={2} /> {label}
    </button>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone: "accent" | "gain" | "gold" | "ink" }) {
  const styles: Record<typeof tone, { bg: string; border: string; color: string }> = {
    accent: { bg: "var(--accent-wash)", border: "var(--accent-soft)", color: "var(--accent)" },
    gain: { bg: "var(--gain-soft)", border: "var(--gain-soft)", color: "var(--gain)" },
    gold: { bg: "var(--gold-tint)", border: "var(--gold-soft)", color: "var(--gold)" },
    ink: { bg: "var(--surface-2)", border: "var(--rule)", color: "var(--ink-2)" },
  };
  const s = styles[tone];
  return (
    <span
      className="mono"
      style={{
        padding: "5px 12px",
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.10em",
        textTransform: "uppercase",
        background: s.bg,
        border: `1px solid ${s.border}`,
        color: s.color,
      }}
    >
      {children}
    </span>
  );
}
