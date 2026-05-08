"use client";

import { useEffect, useState } from "react";
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

function typeColor(type: LoyaltyProgram["program_type"]): { bg: string; border: string; text: string } {
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
      {/* Ambient orbs */}
      <div
        className="orb w-[400px] h-[280px] top-[-60px] right-[-40px]"
        style={{ background: "radial-gradient(ellipse, var(--info-soft) 0%, transparent 70%)" }}
      />
      <div
        className="orb w-[250px] h-[250px] top-[300px] left-[0%]"
        style={{ background: "radial-gradient(ellipse, var(--info-soft) 0%, transparent 70%)" }}
      />

      <div className="relative max-w-3xl mx-auto px-6 pt-8 pb-24">

        {/* Header */}
        <div className="flex items-end justify-between mb-8 fade-up">
          <div>
            <p className="label-xs mb-1.5" style={{ color: "var(--text-tertiary)" }}>Points & miles</p>
            <h1 className="title text-white">Loyalty Programs</h1>
            {!loading && programs.length > 0 && (
              <p className="text-[14px] mt-1" style={{ color: "var(--text-secondary)" }}>
                {programs.length} program{programs.length !== 1 ? "s" : ""} tracked
              </p>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div
          className="flex gap-0 mb-6 fade-up-1 overflow-x-auto"
          style={{ borderBottom: "1px solid var(--border-dim)" }}
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
                className="flex items-center gap-1.5 px-4 py-3 text-[13px] font-medium transition-all whitespace-nowrap"
                style={{
                  color: isActive ? "white" : "var(--text-tertiary)",
                  borderBottom: isActive ? "2px solid #0D9488" : "2px solid transparent",
                  background: "transparent",
                  marginBottom: -1,
                }}
              >
                {tab.label}
                {!loading && count > 0 && (
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                    style={{
                      background: isActive ? "var(--info-soft-2)" : "rgba(255,255,255,0.06)",
                      color: isActive ? "var(--info-text)" : "var(--text-tertiary)",
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
            className="rounded-2xl p-10 text-center fade-up-2"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--info-border)",
              borderRadius: 12,
            }}
          >
            <p className="text-[14px]" style={{ color: "var(--info-text)" }}>{error}</p>
            <button
              onClick={() => {
                setLoading(true);
                listPrograms()
                  .then((data) => setPrograms(data ?? []))
                  .catch(() => setError("Could not load loyalty programs"))
                  .finally(() => setLoading(false));
              }}
              className="mt-4 text-[13px] transition-colors"
              style={{ color: "var(--text-secondary)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "white")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
            >
              Try again
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div
            className="rounded-2xl p-14 text-center fade-up-2"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-dim)",
              borderRadius: 12,
            }}
          >
            <div className="text-5xl mb-4">🏆</div>
            <h2 className="text-[17px] font-semibold text-white mb-2">No programs found</h2>
            <p className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
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
                  className="lift group flex flex-col gap-4 p-5 no-underline cursor-pointer"
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-dim)",
                    borderRadius: 12,
                    boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
                    animationDelay: `${i * 0.04}s`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = colors.border;
                    e.currentTarget.style.background = colors.bg;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--border-dim)";
                    e.currentTarget.style.background = "var(--bg-elevated)";
                  }}
                >
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
                        <p className="text-[14px] font-semibold text-white truncate">{program.name}</p>
                        <p className="text-[12px] mt-0.5 truncate" style={{ color: "var(--text-secondary)" }}>
                          {program.currency_name}
                        </p>
                      </div>
                    </div>

                    {/* Value badge */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <div
                        className="px-2.5 py-1 rounded-full text-[11px] font-semibold"
                        style={{ background: "var(--info-soft)", border: "1px solid var(--info-border)", color: "var(--info-text)" }}
                      >
                        {(program.base_cpp * 100).toFixed(1)}¢/pt
                      </div>
                      <InfoTooltip term="cpp" />
                    </div>
                  </div>

                  {/* Footer row */}
                  <div className="flex items-center justify-between">
                    <span
                      className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full capitalize"
                      style={{
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
                      className="text-[12px] font-medium group-hover:translate-x-0.5 transition-transform inline-block"
                      style={{ color: colors.text }}
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
