"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeftRight, ChevronLeft } from "lucide-react";
import { getProgramDetail, listCPPOverrides } from "@/lib/api";
import type { ProgramDetailResponse, TransferPartner } from "@/lib/types";
import { CATALOG_VALUATION_AS_OF, formatAsOf } from "@/lib/valuation-meta";
import { Term } from "@/components/ui/term";
import { useAuth } from "@/contexts/auth-context";
import { useSession } from "@/contexts/session-context";

/* Per-type tone uses semantic tokens that work in both registers.
 * Same mapping as the loyalty index for consistency: airline=info-teal,
 * hotel=gold, cashback=gain-green, bank=primary-forest. */
function typeColor(type: string): { bg: string; border: string; text: string } {
  switch (type) {
    case "airline":
      return { bg: "var(--info-soft)", border: "var(--info-border)", text: "var(--info)" };
    case "hotel":
      return { bg: "var(--gold-tint)", border: "var(--gold-soft)", text: "var(--gold)" };
    case "cashback":
      return { bg: "var(--gain-soft)", border: "var(--gain-soft)", text: "var(--gain)" };
    default:
      return { bg: "var(--primary-soft)", border: "var(--primary-soft)", text: "var(--primary)" };
  }
}

/* Sweet-spot tag tone — semantic, not arbitrary hex. */
type TagTone = "best" | "info" | "tip" | "warn";
function tagColors(tone: TagTone) {
  switch (tone) {
    case "best":
      return { bg: "var(--gain-soft)", border: "var(--gain-soft)", text: "var(--gain)" };
    case "info":
      return { bg: "var(--info-soft)", border: "var(--info-border)", text: "var(--info)" };
    case "warn":
      return { bg: "var(--gold-tint)", border: "var(--gold-soft)", text: "var(--gold)" };
    default:
      return { bg: "var(--accent-wash)", border: "var(--accent-soft)", text: "var(--accent)" };
  }
}

function TypeIcon({ type }: { type: string }) {
  switch (type) {
    case "airline":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
          <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 00-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "hotel":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      );
    case "cashback":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
          <line x1="3" y1="22" x2="21" y2="22" />
          <line x1="6" y1="18" x2="6" y2="11" />
          <line x1="10" y1="18" x2="10" y2="11" />
          <line x1="14" y1="18" x2="14" y2="11" />
          <line x1="18" y1="18" x2="18" y2="11" />
          <polygon points="12 2 20 7 4 7" />
        </svg>
      );
  }
}

function TransferCard({
  partner,
  direction,
}: {
  partner: TransferPartner;
  direction: "out" | "in";
}) {
  const prog = direction === "out" ? partner.to_program : partner.from_program;
  if (!prog) return null;
  const colors = typeColor(prog.program_type ?? "bank");
  const ratio = partner.transfer_ratio ?? 1;
  const ratioFavorable = ratio >= 1;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: 14,
        borderRadius: 12,
        background: "var(--surface)",
        border: "1px solid var(--rule-strong)",
        boxShadow: "var(--shadow-1)",
      }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text }}
      >
        <TypeIcon type={prog.program_type ?? "bank"} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="display" style={{ fontSize: 14, color: "var(--ink)", margin: 0, lineHeight: 1.2 }}>
          {prog.name}
        </p>
        <p className="serif" style={{ fontSize: 12, fontStyle: "italic", color: "var(--ink-3)", marginTop: 3 }}>
          {prog.currency_name}
          {partner.minimum_transfer > 0 && ` · Min ${partner.minimum_transfer.toLocaleString()} pts`}
          {partner.processing_days > 0 && ` · ${partner.processing_days}d transfer`}
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
        <div
          className="mono"
          style={{
            padding: "3px 10px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.04em",
            background: ratioFavorable ? "var(--gain-soft)" : "var(--gold-tint)",
            border: `1px solid ${ratioFavorable ? "var(--gain-soft)" : "var(--gold-soft)"}`,
            color: ratioFavorable ? "var(--gain)" : "var(--gold)",
          }}
        >
          {direction === "out"
            ? `1 → ${ratio}${ratio !== 1 ? " pts" : ":1"}`
            : `${(1 / ratio).toFixed(2)}:1`}
        </div>
        {partner.notes && (
          <p
            className="mono"
            style={{ fontSize: 10, color: "var(--ink-3)", textAlign: "right", maxWidth: 160, letterSpacing: "0.04em" }}
          >
            {partner.notes}
          </p>
        )}
      </div>
    </div>
  );
}

function SweetSpotRow({
  title,
  desc,
  value,
  tag,
  tone,
  valueColor,
  isLast,
}: {
  title: string;
  desc: string;
  value: string;
  tag: string;
  tone: TagTone;
  valueColor: string;
  isLast: boolean;
}) {
  const tc = tagColors(tone);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 16,
        paddingBottom: 14,
        marginBottom: isLast ? 0 : 14,
        borderBottom: isLast ? "none" : "1px solid var(--rule)",
      }}
    >
      <div className="flex-1 min-w-0">
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
          <p className="display" style={{ fontSize: 14, color: "var(--ink)", margin: 0, lineHeight: 1.2 }}>
            {title}
          </p>
          <span
            className="mono"
            style={{
              padding: "2px 8px",
              borderRadius: 999,
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              background: tc.bg,
              border: `1px solid ${tc.border}`,
              color: tc.text,
            }}
          >
            {tag}
          </span>
        </div>
        <p className="serif" style={{ fontSize: 13, fontStyle: "italic", color: "var(--ink-2)", lineHeight: 1.45 }}>
          {desc}
        </p>
      </div>
      <div
        className="mono"
        style={{ fontSize: 13, fontWeight: 600, color: valueColor, flexShrink: 0, letterSpacing: "0.02em" }}
      >
        {value}
      </div>
    </div>
  );
}

export default function ProgramDetailPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug as string;

  const { isAuthenticated } = useAuth();
  const { sessionId } = useSession();

  const [detail, setDetail] = useState<ProgramDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // AU-5: the user's own base-segment CPP for THIS program, if they've set one.
  const [userCpp, setUserCpp] = useState<number | null>(null);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    getProgramDetail(slug)
      .then((data) => setDetail(data))
      .catch(() => setError("Program not found or failed to load."))
      .finally(() => setLoading(false));
  }, [slug]);

  const refreshUserCpp = useCallback(() => {
    if (!isAuthenticated || !sessionId || !slug) {
      setUserCpp(null);
      return;
    }
    listCPPOverrides(sessionId)
      .then((list) => {
        const match = list.find((o) => o.program_slug === slug && o.segment === "base");
        setUserCpp(match ? match.cpp_cad : null);
      })
      .catch(() => setUserCpp(null));
  }, [isAuthenticated, sessionId, slug]);

  useEffect(() => {
    refreshUserCpp();
  }, [refreshUserCpp]);

  if (loading) {
    return (
      <div className="relative min-h-screen">
        <div className="max-w-3xl mx-auto px-6 pt-8 pb-24">
          <div className="h-8 w-48 rounded shimmer mb-2" />
          <div className="h-5 w-64 rounded shimmer mb-8" />
          <div className="grid grid-cols-2 min-[520px]:grid-cols-3 gap-4 mb-8">
            {[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-2xl shimmer" />)}
          </div>
          <div className="h-48 rounded-2xl shimmer mb-4" />
          <div className="h-48 rounded-2xl shimmer" />
        </div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="relative min-h-screen">
        <div className="max-w-3xl mx-auto px-6 pt-8">
          <button
            onClick={() => router.back()}
            className="mono"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 28,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              color: "var(--ink-3)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              transition: "color 220ms cubic-bezier(0.16, 1, 0.3, 1)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--ink-3)")}
          >
            <ChevronLeft size={14} strokeWidth={2} /> Back
          </button>
          <div
            style={{
              background: "var(--card-fill)",
              border: "1px solid var(--accent)",
              borderRadius: 14,
              padding: "44px 28px",
              textAlign: "center",
              boxShadow: "var(--shadow-1)",
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 999,
                margin: "0 auto 18px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--accent-wash)",
                border: "1px solid var(--accent-soft)",
                color: "var(--accent)",
              }}
            >
              <AlertTriangle size={22} strokeWidth={1.5} />
            </div>
            <h2
              className="display"
              style={{ fontSize: 22, fontStyle: "italic", color: "var(--ink)", margin: 0, lineHeight: 1.2 }}
            >
              Program not found
            </h2>
            <p className="serif" style={{ fontSize: 14, fontStyle: "italic", color: "var(--ink-2)", marginTop: 8, lineHeight: 1.55 }}>
              {error ?? "This loyalty program could not be loaded."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { program, transfer_out, transfer_in } = detail;
  const colors = typeColor(program.program_type);

  // Redemption value. AU-5: when the signed-in user has set their own valuation
  // for this program, the base re-bases on it so the page shows the number THEY
  // believe, not our default.
  //
  // HONESTY: base_cpp is the ONLY real CPP figure the API gives us per program.
  // We do NOT have quoted award prices for premium-cabin or off-peak redemptions,
  // so we no longer present any "business ~X¢/pt" or "first ~Y¢/pt" number as
  // fact. Sweet-spot rows below describe REAL strategies in words; where a number
  // is shown it is the real base CPP, and the one derived ceiling figure is
  // labelled "Illustrative" so it can never be read as a quoted award price.
  const isUserValued = userCpp != null;
  const baseCpp = isUserValued ? userCpp : program.base_cpp;

  // Provenance for the value tile: prefer this program's real recorded_at
  // (point_valuations.recorded_at via the API), falling back to the catalog
  // review date. A user's own valuation is dated by them, not us.
  const valuationAsOf = isUserValued
    ? null
    : (formatAsOf(detail.valuation_as_of) ?? formatAsOf(CATALOG_VALUATION_AS_OF));

  // Per-type sweet-spot data, semantic tone codes (no more arbitrary hex).
  // `value` is a qualitative label, NOT a fabricated CPP — the only number we
  // quote is the real base CPP on the statement-credit row.
  const airlineSpots = [
    {
      title: "Partner Business Class",
      desc: "Premium-cabin partner awards typically beat base value by a wide margin. Search early for Saver space; actual ¢/pt depends entirely on the route and fare you find.",
      value: "Premium cabin",
      tag: "Aim higher",
      tone: "best" as TagTone,
    },
    {
      title: "Stopovers & Open-Jaws",
      desc: "Many airline programs allow free stopovers — add a free city to your itinerary.",
      value: "Free bonus",
      tag: "Tip",
      tone: "info" as TagTone,
    },
    {
      title: "Economy Award Space",
      desc: "Domestic and short-haul economy redemptions are the easiest to book at solid value for fewer points.",
      value: "Easy to book",
      tag: "Reliable",
      tone: "tip" as TagTone,
    },
  ];

  const hotelSpots = [
    {
      title: "5th Night Free",
      desc: "Book 5 consecutive nights with points — the 5th night is free, boosting value by 20%.",
      value: "+20% value",
      tag: "Pro tip",
      tone: "best" as TagTone,
    },
    {
      title: "Off-Peak & Category Sweet Spots",
      desc: "Category 1–3 properties and off-peak dates offer the best points-per-night value. Exact ¢/pt varies by property and date.",
      value: "Best value",
      tag: "Off-peak",
      tone: "warn" as TagTone,
    },
    {
      title: "Points + Cash",
      desc: "Hybrid redemptions let you use fewer points and pay partial cash — good for lower-value nights.",
      value: "Flexible",
      tag: "Option",
      tone: "tip" as TagTone,
    },
  ];

  const bankSpots = [
    {
      title: "Transfer to Airline Partners",
      desc:
        transfer_out.length > 0
          ? `This program transfers to ${transfer_out.length} airline/hotel program${transfer_out.length !== 1 ? "s" : ""}. Partner miles usually unlock the highest value.`
          : "Flexible bank points can often be transferred to airline programs for maximum value.",
      value: transfer_out.length > 0 ? `${transfer_out.length} partners` : "Flexible",
      tag: "Aim higher",
      tone: "best" as TagTone,
    },
    {
      title: "Statement Credits & Travel",
      desc: "Redeem against travel charges on your statement — simple and reliable at the base rate.",
      value: `${baseCpp.toFixed(2)}¢/pt`,
      tag: "Base rate",
      tone: "info" as TagTone,
    },
    {
      title: "Gift Cards & Merchandise",
      desc: "Lower value but no expiry risk. Best for points you can't use for travel.",
      value: "Sub-optimal",
      tag: "Last resort",
      tone: "warn" as TagTone,
    },
  ];

  const spots =
    program.program_type === "airline"
      ? airlineSpots
      : program.program_type === "hotel"
        ? hotelSpots
        : bankSpots;

  // Only the base CPP is a real, sourced figure. We previously showed
  // "Economy Flights" and "Business Class" tiles as base × 1.5 and base × 2.2 —
  // those were invented multipliers, not quoted award prices, so they're gone.
  // One headline tile, one honest number.
  const valueTiles = [
    { label: isUserValued ? "Your valuation" : "Base value", cpp: baseCpp },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="relative max-w-3xl mx-auto px-6 pt-8 pb-24">
        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="mono"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 24,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            transition: "color 220ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--ink-3)")}
        >
          <ChevronLeft size={14} strokeWidth={2} /> Back to programs
        </button>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 32 }} className="fade-up">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text }}
          >
            <TypeIcon type={program.program_type} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h1
              className="display"
              style={{
                fontSize: "clamp(32px, 4.5vw, 44px)",
                lineHeight: 1.05,
                letterSpacing: "-0.015em",
                color: "var(--ink)",
                margin: 0,
              }}
            >
              {program.name}
            </h1>
            <p className="serif" style={{ fontSize: 14, fontStyle: "italic", color: "var(--ink-2)", marginTop: 6 }}>
              {program.currency_name}
            </p>
            <span
              className="mono"
              style={{
                display: "inline-flex",
                alignItems: "center",
                marginTop: 10,
                padding: "3px 10px",
                borderRadius: 999,
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                background: colors.bg,
                border: `1px solid ${colors.border}`,
                color: colors.text,
              }}
            >
              {program.program_type}
            </span>
          </div>
        </div>

        {/* Your-valuation banner (AU-5) — present only when the user has set a
            custom CPP for this program. Honest about which number is in play and
            links to settings to change it. */}
        {isUserValued ? (
          <div
            className="fade-up-1"
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 10,
              marginBottom: 16,
              padding: "10px 14px",
              borderRadius: 12,
              background: "var(--accent-wash)",
              border: "1px solid var(--accent-soft)",
            }}
          >
            <span
              className="mono"
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                color: "var(--accent)",
              }}
            >
              Your valuation
            </span>
            <span className="serif" style={{ fontSize: 13, fontStyle: "italic", color: "var(--ink-2)" }}>
              Tiers are computed from your custom {(userCpp as number).toFixed(2)}¢/pt, not our default of{" "}
              {program.base_cpp.toFixed(2)}¢/pt.
            </span>
            <Link href="/settings" style={{ marginLeft: "auto", color: "var(--accent)", textDecoration: "underline", fontSize: 13 }}>
              Change
            </Link>
          </div>
        ) : (
          isAuthenticated &&
          sessionId && (
            <p className="serif fade-up-1" style={{ fontSize: 13, fontStyle: "italic", color: "var(--ink-3)", marginBottom: 16 }}>
              Disagree with our {program.base_cpp.toFixed(2)}¢/pt? Set your own in{" "}
              <Link href="/settings" style={{ color: "var(--accent)", textDecoration: "underline" }}>
                settings
              </Link>{" "}
              and every tool re-prices on it.
            </p>
          )
        )}

        {/* Value tiles — display-typography, no emoji. One real, sourced number;
            no fabricated per-cabin tiers. */}
        <div className="grid grid-cols-1 gap-3 mb-8 fade-up-1">
          {valueTiles.map(({ label, cpp }, i) => (
            <div
              key={label}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--rule-strong)",
                borderRadius: 14,
                padding: "18px 16px",
                textAlign: "center",
                boxShadow: "var(--shadow-1)",
              }}
            >
              <div className="display" style={{ fontSize: 26, color: "var(--ink)", lineHeight: 1, letterSpacing: "-0.01em" }}>
                {cpp.toFixed(2)}¢
              </div>
              <div
                className="mono"
                style={{
                  marginTop: 8,
                  fontSize: 9,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--ink-3)",
                  fontWeight: 500,
                }}
              >
                {i === 0 ? <Term k="cpp">per point</Term> : "per point"}
              </div>
              <div
                className="serif"
                style={{ marginTop: 6, fontSize: 12, fontStyle: "italic", color: "var(--ink-2)", lineHeight: 1.3 }}
              >
                {label}
              </div>
              {i === 0 && valuationAsOf && (
                <div
                  className="mono"
                  style={{
                    marginTop: 8,
                    fontSize: 9,
                    letterSpacing: "0.10em",
                    textTransform: "uppercase",
                    color: "var(--ink-3)",
                    fontWeight: 500,
                  }}
                >
                  MapleRewards valuation · as of {valuationAsOf}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Redemption sweet spots */}
        <div className="mb-8 fade-up-2">
          <h2
            className="eyebrow"
            style={{ color: "var(--ink-3)", marginBottom: 14, letterSpacing: "0.18em" }}
          >
            Redemption <Term k="sweet-spot">sweet spots</Term>
          </h2>
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--rule-strong)",
              borderRadius: 14,
              padding: 22,
              boxShadow: "var(--shadow-1)",
            }}
          >
            {spots.map((s, i) => (
              <SweetSpotRow
                key={s.title}
                title={s.title}
                desc={s.desc}
                value={s.value}
                tag={s.tag}
                tone={s.tone}
                valueColor={colors.text}
                isLast={i === spots.length - 1}
              />
            ))}
            <p
              className="serif"
              style={{
                fontSize: 11,
                fontStyle: "italic",
                color: "var(--ink-3)",
                marginTop: 14,
                paddingTop: 14,
                borderTop: "1px solid var(--rule)",
                lineHeight: 1.5,
              }}
            >
              <span
                className="mono"
                style={{
                  display: "inline-block",
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                  color: "var(--gold)",
                  background: "var(--gold-tint)",
                  border: "1px solid var(--gold-soft)",
                  borderRadius: 999,
                  padding: "2px 8px",
                  marginRight: 8,
                  verticalAlign: "middle",
                  fontStyle: "normal",
                }}
              >
                Illustrative
              </span>
              These are general redemption strategies, not quoted award prices. The only
              sourced number on this page is the {program.base_cpp.toFixed(2)}¢/pt base value
              above — actual redemption value depends on availability, routes, and dates.
            </p>
          </div>
        </div>

        {/* Transfer Partners OUT */}
        {transfer_out.length > 0 && (
          <div className="mb-8 fade-up-3">
            <h2
              className="eyebrow"
              style={{ color: "var(--ink-3)", marginBottom: 14, letterSpacing: "0.18em" }}
            >
              Transfer to · {transfer_out.length}
            </h2>
            <div className="flex flex-col gap-2">
              {transfer_out.map((p) => (
                <TransferCard key={p.id} partner={p} direction="out" />
              ))}
            </div>
          </div>
        )}

        {/* Transfer Partners IN */}
        {transfer_in.length > 0 && (
          <div className="mb-8 fade-up-4">
            <h2
              className="eyebrow"
              style={{ color: "var(--ink-3)", marginBottom: 14, letterSpacing: "0.18em" }}
            >
              Transfer from · {transfer_in.length}
            </h2>
            <div className="flex flex-col gap-2">
              {transfer_in.map((p) => (
                <TransferCard key={p.id} partner={p} direction="in" />
              ))}
            </div>
          </div>
        )}

        {/* No transfer partners */}
        {transfer_out.length === 0 && transfer_in.length === 0 && (
          <div
            className="fade-up-3"
            style={{
              background: "var(--card-fill)",
              border: "1px solid var(--rule)",
              borderRadius: 14,
              padding: "36px 28px",
              textAlign: "center",
              marginBottom: 28,
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
            <p className="display" style={{ fontSize: 18, fontStyle: "italic", color: "var(--ink)", margin: 0, lineHeight: 1.2 }}>
              No transfer partners
            </p>
            <p className="serif" style={{ fontSize: 13, fontStyle: "italic", color: "var(--ink-2)", marginTop: 6, lineHeight: 1.5 }}>
              This program does not currently have any linked transfer partners.
            </p>
          </div>
        )}

        {/* Booking portal link */}
        <div
          className="fade-up-4"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--rule-strong)",
            borderRadius: 14,
            padding: "18px 22px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            boxShadow: "var(--shadow-1)",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <p className="display" style={{ fontSize: 15, color: "var(--ink)", margin: 0, lineHeight: 1.2 }}>
              Ready to book?
            </p>
            <p className="serif" style={{ fontSize: 12, fontStyle: "italic", color: "var(--ink-3)", marginTop: 4 }}>
              Search the web for {program.name} award availability and booking.
            </p>
          </div>
          <a
            href={`https://www.google.com/search?q=${encodeURIComponent(program.name + " book award")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
            style={{ fontSize: 13, fontWeight: 600, height: 38, padding: "0 18px", textDecoration: "none" }}
          >
            Search awards →
          </a>
        </div>
      </div>
    </div>
  );
}
