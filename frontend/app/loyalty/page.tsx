"use client";

import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { listPrograms } from "@/lib/api";
import type { LoyaltyProgram } from "@/lib/types";
import { InfoTooltip } from "@/components/ui/info-tooltip";

type ProgramType = "all" | "airline" | "bank" | "hotel" | "cashback";

const TABS: { key: ProgramType; label: string }[] = [
  { key: "all", label: "All" },
  { key: "airline", label: "Airlines" },
  { key: "bank", label: "Banks" },
  { key: "hotel", label: "Hotels" },
  { key: "cashback", label: "Cashback" },
];

function ProgramTypeIcon({ type }: { type: LoyaltyProgram["program_type"] }) {
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
    default: // bank
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

/* Per-type tone uses semantic tokens that work in both registers — no more
 * hard-coded #F59E0B / #10B981 / #A78BFA that read as neon on cream paper.
 * Airlines lean info-teal, hotels lean gold (transfer-partner premium),
 * cashback leans gain-green, banks lean primary-forest. */
function typeColor(type: LoyaltyProgram["program_type"]): { bg: string; border: string; text: string } {
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

function ProgramSkeleton() {
  return (
    <div
      className="p-4 rounded-2xl"
      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-dim)", borderRadius: 12 }}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl shimmer flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="h-4 w-32 rounded shimmer mb-2" />
          <div className="h-3 w-24 rounded shimmer mb-3" />
          <div className="flex items-center gap-2">
            <div className="h-5 w-16 rounded-full shimmer" />
            <div className="h-5 w-20 rounded-full shimmer" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoyaltyPage() {
  const [programs, setPrograms] = useState<LoyaltyProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ProgramType>("all");

  useEffect(() => {
    setLoading(true);
    setError(null);
    listPrograms()
      .then((data) => setPrograms(data ?? []))
      .catch(() => setError("Could not load loyalty programs"))
      .finally(() => setLoading(false));
  }, []);

  const filtered =
    activeTab === "all"
      ? programs
      : programs.filter((p) => p.program_type === activeTab);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="relative max-w-3xl mx-auto px-6 pt-8 pb-24">

        {/* Header — editorial register; no orbs, the body radials handle ambience. */}
        <div className="flex items-end justify-between mb-8 fade-up">
          <div>
            <p className="eyebrow" style={{ color: "var(--accent)", marginBottom: 10 }}>Points & miles</p>
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
              Loyalty <span style={{ fontStyle: "italic" }}>programs</span>
            </h1>
            {!loading && programs.length > 0 && (
              <p className="serif" style={{ fontSize: 14, fontStyle: "italic", color: "var(--ink-2)", marginTop: 8 }}>
                {programs.length} program{programs.length !== 1 ? "s" : ""} tracked
              </p>
            )}
          </div>
        </div>

        {/* Tabs — editorial register, maple-accent active state. */}
        <div
          className="flex gap-0 mb-6 fade-up-1 overflow-x-auto"
          style={{ borderBottom: "1px solid var(--rule)" }}
        >
          {TABS.map((tab) => {
            const count =
              tab.key === "all"
                ? programs.length
                : programs.filter((p) => p.program_type === tab.key).length;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="flex items-center gap-1.5 px-4 py-3 text-[13px] font-semibold transition-all whitespace-nowrap"
                style={{
                  color: isActive ? "var(--accent)" : "var(--ink-2)",
                  borderBottom: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                  background: "transparent",
                  marginBottom: -1,
                }}
              >
                {tab.label}
                {!loading && count > 0 && (
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
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 fade-up-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <ProgramSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <div
            className="fade-up-2"
            style={{
              background: "var(--card-fill)",
              border: "1px solid var(--accent)",
              borderRadius: 14,
              padding: "32px 28px",
              textAlign: "center",
              boxShadow: "var(--shadow-1)",
            }}
          >
            <p className="serif" style={{ fontSize: 14, fontStyle: "italic", color: "var(--accent)", margin: 0 }}>{error}</p>
            <button
              onClick={() => {
                setLoading(true);
                listPrograms()
                  .then((data) => setPrograms(data ?? []))
                  .catch(() => setError("Could not load loyalty programs"))
                  .finally(() => setLoading(false));
              }}
              className="mono"
              style={{
                marginTop: 16,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                color: "var(--ink-2)",
                background: "transparent",
                border: "1px solid var(--rule-strong)",
                padding: "8px 16px",
                borderRadius: 8,
                cursor: "pointer",
                transition: "border-color 220ms cubic-bezier(0.16, 1, 0.3, 1), color 220ms cubic-bezier(0.16, 1, 0.3, 1)",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--rule-strong)"; e.currentTarget.style.color = "var(--ink-2)"; }}
            >
              Try again
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div
            className="fade-up-2"
            style={{
              background: "var(--card-fill)",
              border: "1px solid var(--rule)",
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
                background: "var(--surface-2)",
                border: "1px solid var(--rule)",
                color: "var(--ink-3)",
              }}
            >
              <Trophy size={22} strokeWidth={1.5} />
            </div>
            <h2
              className="display"
              style={{ fontSize: 22, fontStyle: "italic", color: "var(--ink)", margin: 0, lineHeight: 1.2 }}
            >
              No programs found
            </h2>
            <p className="serif" style={{ fontSize: 14, color: "var(--ink-2)", marginTop: 8, fontStyle: "italic", lineHeight: 1.55 }}>
              {activeTab === "all"
                ? "No loyalty programs are available yet."
                : `No ${activeTab} programs available yet.`}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 fade-up-2">
            {filtered.map((program, i) => {
              const colors = typeColor(program.program_type);
              return (
                <a
                  key={program.id}
                  href={`/loyalty/${program.slug}`}
                  className="lift group flex flex-col gap-4 p-5 no-underline cursor-pointer fade-up-2"
                  style={{
                    position: "relative",
                    background: "var(--surface)",
                    border: "1px solid var(--rule-strong)",
                    borderRadius: 14,
                    boxShadow: "var(--shadow-1)",
                    animationDelay: `${i * 0.04}s`,
                    overflow: "hidden",
                    transition:
                      "box-shadow 220ms cubic-bezier(0.16, 1, 0.3, 1), transform 220ms cubic-bezier(0.16, 1, 0.3, 1), border-color 220ms cubic-bezier(0.16, 1, 0.3, 1)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = colors.text;
                    e.currentTarget.style.boxShadow = "var(--shadow-2)";
                    e.currentTarget.style.transform = "translateY(-2px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--rule-strong)";
                    e.currentTarget.style.boxShadow = "var(--shadow-1)";
                    e.currentTarget.style.transform = "translateY(0)";
                  }}
                >
                  {/* Top accent stripe — color-coded per program type, makes
                   * the catalog scannable as a row of categories. */}
                  <div
                    aria-hidden
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      height: 3,
                      background: colors.text,
                    }}
                  />
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Icon */}
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{
                          background: colors.bg,
                          border: `1px solid ${colors.border}`,
                          color: colors.text,
                        }}
                      >
                        <ProgramTypeIcon type={program.program_type} />
                      </div>

                      {/* Name + currency */}
                      <div className="min-w-0">
                        <p
                          className="display"
                          style={{ fontSize: 16, color: "var(--ink)", margin: 0, lineHeight: 1.2 }}
                        >
                          {program.name}
                        </p>
                        <p className="serif" style={{ fontSize: 12, fontStyle: "italic", color: "var(--ink-3)", marginTop: 2 }}>
                          {program.currency_name}
                        </p>
                      </div>
                    </div>

                    {/* Value badge */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <div
                        className="mono"
                        style={{
                          padding: "3px 10px",
                          borderRadius: 999,
                          fontSize: 10,
                          fontWeight: 600,
                          letterSpacing: "0.04em",
                          background: "var(--accent-wash)",
                          border: "1px solid var(--accent-soft)",
                          color: "var(--accent)",
                        }}
                      >
                        {program.base_cpp.toFixed(2)}¢/pt
                      </div>
                      <InfoTooltip term="cpp" />
                    </div>
                  </div>

                  {/* Footer row */}
                  <div className="flex items-center justify-between">
                    <span
                      className="mono"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "3px 10px",
                        borderRadius: 999,
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        background: colors.bg,
                        border: `1px solid ${colors.border}`,
                        color: colors.text,
                      }}
                    >
                      <ProgramTypeIcon type={program.program_type} />
                      <span className="sr-only">{program.program_type}</span>
                      {program.program_type}
                    </span>
                    <span
                      className="mono group-hover:translate-x-0.5 transition-transform inline-block"
                      style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", color: colors.text }}
                    >
                      View details →
                    </span>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
