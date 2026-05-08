"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { CreditCardVisual } from "@/components/cards/credit-card-visual";
import { getCardDetail } from "@/lib/api";
import type { CardDetail, MultiplierRow, TransferPartner } from "@/lib/types";
import { InfoTooltip } from "@/components/ui/info-tooltip";

type TabKey = "overview" | "earn-rates" | "transfer-partners";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "earn-rates", label: "Earn Rates" },
  { key: "transfer-partners", label: "Transfer Partners" },
];

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className="flex items-center justify-between py-3 px-4"
      style={{ borderBottom: "1px solid var(--border-dim)" }}
    >
      <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span
        className="text-[13px] font-semibold"
        style={{ color: highlight ? "var(--accent)" : "white" }}
      >
        {value}
      </span>
    </div>
  );
}

function EarnRateRow({ row, isLast }: { row: MultiplierRow; isLast: boolean }) {
  return (
    <div
      className="flex items-center gap-4 py-3 px-4"
      style={{ borderBottom: isLast ? "none" : "1px solid var(--border-dim)" }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium card-detail-text">{row.category_name}</p>
        {row.notes && (
          <p className="text-[11px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>{row.notes}</p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {row.cap_amount != null && (
          <span
            className="text-[10px] font-medium px-2 py-0.5 rounded-full"
            style={{
              background: "rgba(245,158,11,0.10)",
              border: "1px solid rgba(245,158,11,0.2)",
              color: "#F59E0B",
            }}
          >
            Cap ${row.cap_amount.toLocaleString()}{row.cap_period ? `/${row.cap_period}` : ""} <InfoTooltip term="spend-cap" />
          </span>
        )}
        <span
          className="text-[14px] font-bold"
          style={{ color: row.earn_rate >= 3 ? "var(--accent)" : row.earn_rate >= 2 ? "#F59E0B" : "white" }}
        >
          {row.earn_rate}x
        </span>
        <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
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
      className="p-4 rounded-xl"
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-dim)",
        borderRadius: 10,
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(13,148,136,0.10)", border: "1px solid rgba(13,148,136,0.2)" }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" className="w-4 h-4">
              <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 00-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold card-detail-text truncate">{program?.name ?? "Unknown"}</p>
            <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
              {program?.currency_name ?? "Points"}
            </p>
          </div>
        </div>

        <span
          className="text-[13px] font-bold px-2.5 py-1 rounded-lg flex-shrink-0"
          style={{
            background: "rgba(13,148,136,0.10)",
            border: "1px solid rgba(13,148,136,0.2)",
            color: "var(--accent)",
          }}
        >
          {partner.transfer_ratio}:1
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div
          className="px-3 py-2 rounded-lg"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border-dim)" }}
        >
          <p className="label-xs mb-0.5" style={{ color: "var(--text-tertiary)" }}>Processing</p>
          <p className="text-[12px] font-semibold card-detail-text">
            {partner.processing_days === 0 ? "Instant" : `${partner.processing_days} day${partner.processing_days !== 1 ? "s" : ""}`}
          </p>
        </div>
        {program?.base_cpp != null && (
          <div
            className="px-3 py-2 rounded-lg"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border-dim)" }}
          >
            <p className="label-xs mb-0.5" style={{ color: "var(--text-tertiary)" }}>Dest. CPP</p>
            <p className="text-[12px] font-semibold card-detail-text">
              {(program.base_cpp * 100).toFixed(1)}¢/pt
            </p>
          </div>
        )}
      </div>

      {partner.notes && (
        <p
          className="mt-2.5 text-[11px] leading-snug"
          style={{ color: "var(--text-tertiary)" }}
        >
          {partner.notes}
        </p>
      )}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="max-w-3xl mx-auto px-6 pt-8 pb-24">
      {/* Back */}
      <div className="h-4 w-24 rounded shimmer mb-8" />

      {/* Card visual */}
      <div className="flex flex-col sm:flex-row gap-6 mb-8">
        <div style={{ width: 380, height: 239, borderRadius: 18 }} className="shimmer flex-shrink-0" />
        <div className="flex-1">
          <div className="h-6 w-48 rounded shimmer mb-3" />
          <div className="h-4 w-32 rounded shimmer mb-2" />
          <div className="h-5 w-20 rounded-full shimmer" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6" style={{ borderBottom: "1px solid var(--border-dim)" }}>
        {[80, 70, 110].map((w, i) => (
          <div key={i} className="pb-3" style={{ width: w, height: 16 }}>
            <div className="h-4 rounded shimmer" />
          </div>
        ))}
      </div>

      {/* Content */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border-dim)" }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between py-3 px-4" style={{ borderBottom: "1px solid var(--border-dim)" }}>
            <div className="h-3.5 w-32 rounded shimmer" />
            <div className="h-3.5 w-20 rounded shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CardDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const cardId = params?.id as string;
  /* Where to return to. ?from=optimizer => /optimizer, otherwise default to /cards. */
  const fromHint = searchParams?.get("from");
  const backHref = fromHint === "optimizer" ? "/optimizer"
    : fromHint === "wallet" ? "/wallet"
    : "/cards";
  const backLabel = fromHint === "optimizer" ? "Back to optimizer"
    : fromHint === "wallet" ? "Back to wallet"
    : "Back to register";
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

  if (loading) {
    return (
      <div className="relative min-h-screen overflow-hidden">
        <div
          className="orb w-[400px] h-[260px] top-[-60px] right-[-30px]"
          style={{ background: "radial-gradient(ellipse, rgba(13,148,136,0.08) 0%, transparent 70%)" }}
        />
        <DetailSkeleton />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="relative min-h-screen flex items-center justify-center">
        <div className="text-center px-6">
          <div className="text-6xl mb-6">404</div>
          <h1 className="text-[22px] font-bold card-detail-text mb-2">Card not found</h1>
          <p className="text-[14px] mb-6" style={{ color: "var(--text-secondary)" }}>
            This card doesn&apos;t exist or has been removed.
          </p>
          <button
            onClick={goBack}
            className="h-10 px-6 rounded-xl font-semibold text-[14px] card-detail-text maple-bg accent-glow"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="relative min-h-screen flex items-center justify-center">
        <div className="text-center px-6">
          <p className="text-[14px] mb-4" style={{ color: "var(--accent)" }}>
            {error ?? "Something went wrong"}
          </p>
          <button
            onClick={goBack}
            className="h-10 px-6 rounded-xl font-semibold text-[14px] card-detail-text"
            style={{
              background: "var(--card-fill)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  const { card, multipliers, transfer_partners, value_range_low, value_range_high } = detail;

  return (
    <div className="reveal" style={{ paddingTop: 0 }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px clamp(20px, 4vw, 60px) 80px" }}>

        {/* Back navigation */}
        <button
          onClick={goBack}
          className="mono"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 24,
            fontSize: 11,
            color: "var(--ink-3)",
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
          ← {backLabel}
        </button>

        {/* Card visual + header */}
        <div className="flex flex-col sm:flex-row gap-6 mb-8 fade-up">
          <div className="flex-shrink-0">
            <CreditCardVisual card={card} size="lg" />
          </div>

          <div className="flex flex-col justify-center gap-2">
            <p className="label-xs" style={{ color: "var(--text-tertiary)" }}>{card.issuer}</p>
            <h1 className="text-[22px] font-bold card-detail-text leading-tight">{card.name}</h1>

            {/* Badges row */}
            <div className="flex flex-wrap gap-2 mt-1">
              <span
                className="px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide"
                style={{
                  background: "var(--card-fill)",
                  border: "1px solid var(--border-mid)",
                  color: "var(--text-secondary)",
                }}
              >
                {card.network}
              </span>

              {card.annual_fee === 0 ? (
                <span
                  className="px-2.5 py-1 rounded-full text-[11px] font-semibold"
                  style={{
                    background: "rgba(16,185,129,0.10)",
                    border: "1px solid rgba(16,185,129,0.22)",
                    color: "#10B981",
                  }}
                >
                  No annual fee
                </span>
              ) : (
                <span
                  className="px-2.5 py-1 rounded-full text-[11px] font-semibold"
                  style={{
                    background: "rgba(245,158,11,0.10)",
                    border: "1px solid rgba(245,158,11,0.22)",
                    color: "#F59E0B",
                  }}
                >
                  ${card.annual_fee}/yr
                </span>
              )}

              {value_range_high > 0 && (
                <span
                  className="px-2.5 py-1 rounded-full text-[11px] font-semibold"
                  style={{
                    background: "rgba(13,148,136,0.10)",
                    border: "1px solid rgba(13,148,136,0.22)",
                    color: "var(--accent)",
                  }}
                >
                  {(value_range_low * 100).toFixed(1)}–{(value_range_high * 100).toFixed(1)}¢/pt
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div
          className="flex mb-6 fade-up-1 overflow-x-auto"
          style={{ borderBottom: "1px solid var(--border-dim)" }}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            // Show badge counts
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
                className="flex items-center gap-1.5 px-4 py-3 text-[13px] font-medium transition-all whitespace-nowrap"
                style={{
                  color: isActive ? "white" : "var(--text-tertiary)",
                  background: "transparent",
                  marginBottom: -1,
                  cursor: "pointer",
                  borderTop: "none",
                  borderLeft: "none",
                  borderRight: "none",
                  borderBottomStyle: "solid",
                  borderBottomWidth: 2,
                  borderBottomColor: isActive ? "#0D9488" : "transparent",
                  padding: "12px 16px",
                }}
              >
                {tab.label}
                {badgeCount != null && badgeCount > 0 && (
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                    style={{
                      background: isActive ? "rgba(13,148,136,0.15)" : "var(--card-fill)",
                      color: isActive ? "var(--accent)" : "var(--text-tertiary)",
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

          {/* Overview Tab */}
          {activeTab === "overview" && (
            <div
              className="rounded-xl overflow-hidden"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-dim)",
                borderRadius: 12,
                boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
              }}
            >
              <InfoRow label="Annual Fee" value={card.annual_fee === 0 ? "No annual fee" : `$${card.annual_fee} CAD/year`} />
              {card.welcome_bonus_points > 0 && (
                <>
                  <InfoRow
                    label="Welcome Bonus"
                    value={`${card.welcome_bonus_points.toLocaleString()} points`}
                    highlight
                  />
                  <InfoRow
                    label="Minimum Spend"
                    value={`$${card.welcome_bonus_min_spend.toLocaleString()} in ${card.welcome_bonus_months} months`}
                  />
                </>
              )}
              <InfoRow
                label="Loyalty Program"
                value={card.loyalty_program?.name ?? "—"}
              />
              <InfoRow
                label="Point Currency"
                value={card.loyalty_program?.currency_name ?? "—"}
              />
              {value_range_low > 0 && value_range_high > 0 && (
                <InfoRow
                  label="Point Value Range"
                  value={`${(value_range_low * 100).toFixed(1)}¢ – ${(value_range_high * 100).toFixed(1)}¢ per point`}
                />
              )}
              <div
                className="flex items-center justify-between py-3 px-4"
              >
                <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>Network</span>
                <span
                  className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid var(--border-mid)",
                    color: "var(--text-secondary)",
                  }}
                >
                  {card.network}
                </span>
              </div>
            </div>
          )}

          {/* Earn Rates Tab */}
          {activeTab === "earn-rates" && (
            multipliers.length === 0 ? (
              <div
                className="rounded-xl p-10 text-center"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-dim)",
                  borderRadius: 12,
                }}
              >
                <p className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
                  No earn rate data available for this card.
                </p>
              </div>
            ) : (
              <div>
                {/* Legend */}
                <div className="flex items-center gap-4 mb-4 px-1">
                  <InfoTooltip term="earn-rate" />
                  {[
                    { label: "3x+", color: "var(--accent)", bg: "rgba(13,148,136,0.1)" },
                    { label: "2x", color: "#F59E0B", bg: "rgba(245,158,11,0.1)" },
                    { label: "1x", color: "white", bg: "var(--card-fill)" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ background: item.color }}
                      />
                      <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{item.label}</span>
                    </div>
                  ))}
                  <span className="text-[11px] ml-auto" style={{ color: "var(--text-tertiary)" }}>
                    {multipliers.length} categories
                  </span>
                </div>

                <div
                  className="rounded-xl overflow-hidden"
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-dim)",
                    borderRadius: 12,
                    boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
                  }}
                >
                  {/* Table header */}
                  <div
                    className="flex items-center gap-4 py-2.5 px-4"
                    style={{ borderBottom: "1px solid var(--border-dim)", background: "rgba(255,255,255,0.02)" }}
                  >
                    <p className="label-xs flex-1" style={{ color: "var(--text-tertiary)" }}>Category</p>
                    <p className="label-xs" style={{ color: "var(--text-tertiary)" }}>Rate</p>
                  </div>

                  {multipliers.map((row, i) => (
                    <EarnRateRow key={`${row.category_slug}-${i}`} row={row} isLast={i === multipliers.length - 1} />
                  ))}
                </div>
              </div>
            )
          )}

          {/* Transfer Partners Tab */}
          {activeTab === "transfer-partners" && (
            transfer_partners.length === 0 ? (
              <div
                className="rounded-xl p-10 text-center"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-dim)",
                  borderRadius: 12,
                }}
              >
                <div
                  className="w-12 h-12 rounded-xl mb-4 mx-auto flex items-center justify-center"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border-dim)" }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" className="w-6 h-6">
                    <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3M16 21h3a2 2 0 002-2v-3" strokeLinecap="round" />
                  </svg>
                </div>
                <p className="text-[14px] font-medium card-detail-text mb-1">No transfer partners</p>
                <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                  This card doesn&apos;t support points transfers.
                </p>
              </div>
            ) : (
              <div>
                <p className="text-[13px] mb-4 px-1 flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
                  {transfer_partners.length} transfer partner{transfer_partners.length !== 1 ? "s" : ""} available
                  <InfoTooltip term="transfer-partners" />
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
