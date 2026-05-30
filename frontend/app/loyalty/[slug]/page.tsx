"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeftRight, ChevronLeft } from "lucide-react";
import { getProgramDetail } from "@/lib/api";
import type { ProgramDetailResponse, TransferPartner } from "@/lib/types";

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

  const [detail, setDetail] = useState<ProgramDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    getProgramDetail(slug)
      .then((data) => setDetail(data))
      .catch(() => setError("Program not found or failed to load."))
      .finally(() => setLoading(false));
  }, [slug]);

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

  // Redemption value tiers based on CPP
  const baseCpp = program.base_cpp;
  const businessCpp = baseCpp * 2.2;
  const firstCpp = baseCpp * 3.5;

  // Per-type sweet-spot data, semantic tone codes (no more arbitrary hex).
  const airlineSpots = [
    {
      title: "Partner Business Class",
      desc: "Book partner airlines in business class for up to 3–5¢/pt. Search early for Saver space.",
      value: `~${firstCpp.toFixed(1)}¢/pt`,
      tag: "Best value",
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
      desc: "Domestic and short-haul economy redemptions offer solid value at lower point costs.",
      value: `~${(baseCpp * 1.5).toFixed(1)}¢/pt`,
      tag: "Easy to book",
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
      desc: "Category 1–3 properties and off-peak dates offer the best points-per-night value.",
      value: `~${businessCpp.toFixed(1)}¢/pt`,
      tag: "Best CPP",
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
          ? `This program transfers to ${transfer_out.length} airline/hotel program${transfer_out.length !== 1 ? "s" : ""}. Use partner miles for highest CPP.`
          : "Flexible bank points can often be transferred to airline programs for maximum value.",
      value: transfer_out.length > 0 ? `${transfer_out.length} partners` : "Flexible",
      tag: "Highest CPP",
      tone: "best" as TagTone,
    },
    {
      title: "Statement Credits & Travel",
      desc: "Redeem against travel charges on your statement — simple and reliable at base CPP.",
      value: `${baseCpp.toFixed(2)}¢/pt`,
      tag: "Easy",
      tone: "info" as TagTone,
    },
    {
      title: "Gift Cards & Merchandise",
      desc: "Lower CPP but no expiry risk. Best for points you can't use for travel.",
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

  const valueTiles = [
    { label: "Base / Statement", cpp: baseCpp },
    { label: "Economy Flights", cpp: baseCpp * 1.5 },
    { label: "Business Class", cpp: businessCpp },
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

        {/* Value tiles — display-typography, no emoji */}
        <div className="grid grid-cols-2 min-[520px]:grid-cols-3 gap-3 mb-8 fade-up-1">
          {valueTiles.map(({ label, cpp }) => (
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
                per point
              </div>
              <div
                className="serif"
                style={{ marginTop: 6, fontSize: 12, fontStyle: "italic", color: "var(--ink-2)", lineHeight: 1.3 }}
              >
                {label}
              </div>
            </div>
          ))}
        </div>

        {/* Redemption sweet spots */}
        <div className="mb-8 fade-up-2">
          <h2
            className="eyebrow"
            style={{ color: "var(--ink-3)", marginBottom: 14, letterSpacing: "0.18em" }}
          >
            Redemption sweet spots
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
            {program.program_type === "airline" && (
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
                CPP estimates are based on typical redemptions — actual value depends on availability and routes.
              </p>
            )}
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
              Check availability on the official {program.name} portal.
            </p>
          </div>
          <a
            href={`https://www.google.com/search?q=${encodeURIComponent(program.name + " book award")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
            style={{ fontSize: 12, height: 38, padding: "0 18px", textDecoration: "none" }}
          >
            Book →
          </a>
        </div>
      </div>
    </div>
  );
}
