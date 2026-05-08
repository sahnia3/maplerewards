"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getProgramDetail } from "@/lib/api";
import type { ProgramDetailResponse, TransferPartner } from "@/lib/types";

function typeColor(type: string): { bg: string; border: string; text: string } {
  switch (type) {
    case "airline":
      return { bg: "var(--info-soft)", border: "var(--info-border)", text: "var(--info-text)" };
    case "hotel":
      return { bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.22)", text: "#F59E0B" };
    case "cashback":
      return { bg: "rgba(16,185,129,0.10)", border: "rgba(16,185,129,0.22)", text: "#10B981" };
    default:
      return { bg: "rgba(139,92,246,0.10)", border: "rgba(139,92,246,0.22)", text: "#A78BFA" };
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

  return (
    <div
      className="flex items-center gap-4 p-4 rounded-xl"
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-dim)",
      }}
    >
      {/* Icon */}
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text }}
      >
        <TypeIcon type={prog.program_type ?? "bank"} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold text-white truncate">{prog.name}</p>
        <p className="text-[12px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
          {prog.currency_name}
          {partner.minimum_transfer > 0 && ` · Min ${partner.minimum_transfer.toLocaleString()} pts`}
          {partner.processing_days > 0 && ` · ${partner.processing_days}d transfer`}
        </p>
      </div>

      {/* Ratio badge */}
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <div
          className="px-2.5 py-1 rounded-full text-[12px] font-bold"
          style={{
            background: ratio >= 1 ? "rgba(52,211,153,0.12)" : "rgba(245,158,11,0.12)",
            border: ratio >= 1 ? "1px solid rgba(52,211,153,0.25)" : "1px solid rgba(245,158,11,0.25)",
            color: ratio >= 1 ? "#34D399" : "#F59E0B",
          }}
        >
          {direction === "out"
            ? `1 → ${ratio}${ratio !== 1 ? " pts" : ":1"}`
            : `${(1 / ratio).toFixed(2)}:1`}
        </div>
        {partner.notes && (
          <p className="text-[11px] text-right max-w-[140px]" style={{ color: "var(--text-tertiary)" }}>
            {partner.notes}
          </p>
        )}
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
          <div className="grid grid-cols-3 gap-4 mb-8">
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
            className="flex items-center gap-2 mb-8 text-[13px] transition-colors"
            style={{ color: "var(--text-secondary)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "white")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
          >
            ← Back
          </button>
          <div
            className="rounded-2xl p-14 text-center"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--info-border)" }}
          >
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-[17px] font-semibold text-white mb-2">Program Not Found</h2>
            <p className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
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

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Ambient orb */}
      <div
        className="orb w-[500px] h-[300px] top-[-80px] left-1/2 -translate-x-1/2"
        style={{ background: `radial-gradient(ellipse, ${colors.bg.replace("0.10", "0.06")} 0%, transparent 70%)` }}
      />

      <div className="relative max-w-3xl mx-auto px-6 pt-8 pb-24">
        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 mb-6 text-[13px] transition-colors"
          style={{ color: "var(--text-secondary)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "white")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
        >
          ← Back to programs
        </button>

        {/* Header */}
        <div className="flex items-start gap-4 mb-8 fade-up">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text }}
          >
            <TypeIcon type={program.program_type} />
          </div>
          <div>
            <h1 className="title text-white mb-1">{program.name}</h1>
            <p className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
              {program.currency_name}
            </p>
            <span
              className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full capitalize mt-2"
              style={{ background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text }}
            >
              {program.program_type}
            </span>
          </div>
        </div>

        {/* Value stats */}
        <div className="grid grid-cols-3 gap-3 mb-8 fade-up-1">
          {[
            { label: "Base / Statement", cpp: baseCpp, icon: "💳" },
            { label: "Economy Flights", cpp: baseCpp * 1.5, icon: "✈️" },
            { label: "Business Class", cpp: businessCpp, icon: "🌟" },
          ].map(({ label, cpp, icon }) => (
            <div
              key={label}
              className="rounded-2xl p-4 text-center"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-dim)",
              }}
            >
              <div className="text-2xl mb-2">{icon}</div>
              <div className="text-[18px] font-bold text-white">{(cpp * 100).toFixed(1)}¢</div>
              <div className="text-[11px] mt-1" style={{ color: "var(--text-tertiary)" }}>
                per point
              </div>
              <div
                className="text-[11px] font-medium mt-1.5"
                style={{ color: "var(--text-secondary)" }}
              >
                {label}
              </div>
            </div>
          ))}
        </div>

        {/* Redemption sweet spots */}
        <div className="mb-8 fade-up-2">
          <h2 className="text-[13px] font-semibold mb-3" style={{ color: "var(--text-tertiary)" }}>
            REDEMPTION SWEET SPOTS
          </h2>
          <div
            className="rounded-2xl p-5"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-dim)" }}
          >
            {program.program_type === "airline" && (
              <div className="space-y-3">
                {[
                  {
                    title: "Partner Business Class",
                    desc: "Book partner airlines in business class for up to 3–5¢/pt. Search early for Saver space.",
                    value: `~${(firstCpp * 100).toFixed(1)}¢/pt`,
                    tag: "Best value",
                    tagColor: "#34D399",
                    tagBg: "rgba(52,211,153,0.12)",
                    tagBorder: "rgba(52,211,153,0.25)",
                  },
                  {
                    title: "Stopovers & Open-Jaws",
                    desc: "Many airline programs allow free stopovers — add a free city to your itinerary.",
                    value: "Free bonus",
                    tag: "Tip",
                    tagColor: "var(--info-text)",
                    tagBg: "var(--info-soft)",
                    tagBorder: "var(--info-border)",
                  },
                  {
                    title: "Economy Award Space",
                    desc: "Domestic and short-haul economy redemptions offer solid value at lower point costs.",
                    value: `~${(baseCpp * 1.5 * 100).toFixed(1)}¢/pt`,
                    tag: "Easy to book",
                    tagColor: "#A78BFA",
                    tagBg: "rgba(139,92,246,0.12)",
                    tagBorder: "rgba(139,92,246,0.25)",
                  },
                ].map(({ title, desc, value, tag, tagColor, tagBg, tagBorder }) => (
                  <div
                    key={title}
                    className="flex items-start gap-4 pb-3"
                    style={{ borderBottom: "1px solid var(--border-dim)" }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="text-[14px] font-semibold text-white">{title}</p>
                        <span
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: tagBg, border: `1px solid ${tagBorder}`, color: tagColor }}
                        >
                          {tag}
                        </span>
                      </div>
                      <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                        {desc}
                      </p>
                    </div>
                    <div
                      className="text-[13px] font-bold flex-shrink-0"
                      style={{ color: colors.text }}
                    >
                      {value}
                    </div>
                  </div>
                ))}
                <p className="text-[11px] pt-1" style={{ color: "var(--text-tertiary)" }}>
                  ℹ️ CPP estimates are based on typical redemptions — actual value depends on availability and routes.
                </p>
              </div>
            )}

            {program.program_type === "hotel" && (
              <div className="space-y-3">
                {[
                  {
                    title: "5th Night Free",
                    desc: "Book 5 consecutive nights with points — the 5th night is free, boosting value by 20%.",
                    value: "+20% value",
                    tag: "Pro tip",
                    tagColor: "#34D399",
                    tagBg: "rgba(52,211,153,0.12)",
                    tagBorder: "rgba(52,211,153,0.25)",
                  },
                  {
                    title: "Off-Peak & Category Sweet Spots",
                    desc: "Category 1–3 properties and off-peak dates offer the best points-per-night value.",
                    value: `~${(businessCpp * 100).toFixed(1)}¢/pt`,
                    tag: "Best CPP",
                    tagColor: "#F59E0B",
                    tagBg: "rgba(245,158,11,0.12)",
                    tagBorder: "rgba(245,158,11,0.25)",
                  },
                  {
                    title: "Points + Cash",
                    desc: "Hybrid redemptions let you use fewer points and pay partial cash — good for lower-value nights.",
                    value: "Flexible",
                    tag: "Option",
                    tagColor: "#A78BFA",
                    tagBg: "rgba(139,92,246,0.12)",
                    tagBorder: "rgba(139,92,246,0.25)",
                  },
                ].map(({ title, desc, value, tag, tagColor, tagBg, tagBorder }) => (
                  <div
                    key={title}
                    className="flex items-start gap-4 pb-3"
                    style={{ borderBottom: "1px solid var(--border-dim)" }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="text-[14px] font-semibold text-white">{title}</p>
                        <span
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: tagBg, border: `1px solid ${tagBorder}`, color: tagColor }}
                        >
                          {tag}
                        </span>
                      </div>
                      <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                        {desc}
                      </p>
                    </div>
                    <div
                      className="text-[13px] font-bold flex-shrink-0"
                      style={{ color: colors.text }}
                    >
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(program.program_type === "bank" || program.program_type === "cashback") && (
              <div className="space-y-3">
                {[
                  {
                    title: "Transfer to Airline Partners",
                    desc: transfer_out.length > 0
                      ? `This program transfers to ${transfer_out.length} airline/hotel program${transfer_out.length !== 1 ? "s" : ""}. Use partner miles for highest CPP.`
                      : "Flexible bank points can often be transferred to airline programs for maximum value.",
                    value: transfer_out.length > 0 ? `${transfer_out.length} partners` : "Flexible",
                    tag: "Highest CPP",
                    tagColor: "#34D399",
                    tagBg: "rgba(52,211,153,0.12)",
                    tagBorder: "rgba(52,211,153,0.25)",
                  },
                  {
                    title: "Statement Credits & Travel",
                    desc: "Redeem against travel charges on your statement — simple and reliable at base CPP.",
                    value: `${(baseCpp * 100).toFixed(1)}¢/pt`,
                    tag: "Easy",
                    tagColor: "var(--info-text)",
                    tagBg: "var(--info-soft)",
                    tagBorder: "var(--info-border)",
                  },
                  {
                    title: "Gift Cards & Merchandise",
                    desc: "Lower CPP but no expiry risk. Best for points you can't use for travel.",
                    value: "Sub-optimal",
                    tag: "Last resort",
                    tagColor: "#F59E0B",
                    tagBg: "rgba(245,158,11,0.12)",
                    tagBorder: "rgba(245,158,11,0.25)",
                  },
                ].map(({ title, desc, value, tag, tagColor, tagBg, tagBorder }) => (
                  <div
                    key={title}
                    className="flex items-start gap-4 pb-3"
                    style={{ borderBottom: "1px solid var(--border-dim)" }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="text-[14px] font-semibold text-white">{title}</p>
                        <span
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: tagBg, border: `1px solid ${tagBorder}`, color: tagColor }}
                        >
                          {tag}
                        </span>
                      </div>
                      <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                        {desc}
                      </p>
                    </div>
                    <div
                      className="text-[13px] font-bold flex-shrink-0"
                      style={{ color: colors.text }}
                    >
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Transfer Partners OUT */}
        {transfer_out.length > 0 && (
          <div className="mb-8 fade-up-3">
            <h2 className="text-[13px] font-semibold mb-3" style={{ color: "var(--text-tertiary)" }}>
              TRANSFER TO ({transfer_out.length})
            </h2>
            <div className="space-y-2">
              {transfer_out.map((p) => (
                <TransferCard key={p.id} partner={p} direction="out" />
              ))}
            </div>
          </div>
        )}

        {/* Transfer Partners IN */}
        {transfer_in.length > 0 && (
          <div className="mb-8 fade-up-4">
            <h2 className="text-[13px] font-semibold mb-3" style={{ color: "var(--text-tertiary)" }}>
              TRANSFER FROM ({transfer_in.length})
            </h2>
            <div className="space-y-2">
              {transfer_in.map((p) => (
                <TransferCard key={p.id} partner={p} direction="in" />
              ))}
            </div>
          </div>
        )}

        {/* No transfer partners */}
        {transfer_out.length === 0 && transfer_in.length === 0 && (
          <div
            className="rounded-2xl p-8 text-center mb-8 fade-up-3"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-dim)" }}
          >
            <div className="text-3xl mb-3">🔄</div>
            <p className="text-[14px] font-medium text-white mb-1">No transfer partners</p>
            <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
              This program does not currently have any linked transfer partners.
            </p>
          </div>
        )}

        {/* Booking portal link */}
        <div
          className="rounded-xl px-5 py-4 flex items-center justify-between fade-up-4"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div>
            <p className="text-[13px] font-semibold text-white">Ready to book?</p>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
              Check availability on the official {program.name} portal.
            </p>
          </div>
          <a
            href={`https://www.google.com/search?q=${encodeURIComponent(program.name + " book award")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 h-9 px-4 rounded-lg font-semibold text-[13px] text-white maple-bg accent-glow flex-shrink-0"
          >
            Book →
          </a>
        </div>
      </div>
    </div>
  );
}
