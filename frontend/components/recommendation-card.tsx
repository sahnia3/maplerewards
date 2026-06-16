"use client";

import { useState } from "react";
import type { CardRecommendation } from "@/lib/types";

interface Props {
  rec: CardRecommendation;
  rank: number;
  onLog?: () => void;
  logged?: boolean;
  spendCategory?: string;
  spendAmount?: number;
}

function fmtCAD(v: number) { return `$${v.toFixed(2)}`; }
function fmtPts(v: number) { return `${Math.round(v).toLocaleString()}`; }
function fmtPct(v: number) { return `${v.toFixed(2)}%`; }

function generateExplanation(rec: CardRecommendation, rank: number, category?: string, amount?: number): string {
  const parts: string[] = [];

  if (rank === 1) {
    parts.push(`Best choice for ${category ?? "this purchase"}`);
  }

  if (rec.transfer_partner) {
    parts.push(`Transfer to ${rec.transfer_partner} for ${rec.transfer_cpp?.toFixed(1)}¢/pt (vs ${rec.program_cpp.toFixed(1)}¢ native)`);
  } else if (rec.program_cpp > 1.5) {
    parts.push(`Strong point value at ${rec.program_cpp.toFixed(1)}¢/pt`);
  }

  if (rec.earn_rate >= 5) {
    parts.push(`Exceptional ${rec.earn_rate}x earn rate in this category`);
  } else if (rec.earn_rate >= 3) {
    parts.push(`Good ${rec.earn_rate}x multiplier here`);
  }

  if (rec.is_cap_hit && rec.note?.includes("fully spent")) {
    parts.push("Spending cap reached — earning at fallback rate");
  } else if (rec.is_cap_hit) {
    parts.push("Partially capped — blended bonus and fallback rates");
  }

  if (amount && rec.dollar_value > 0) {
    const returnRate = (rec.dollar_value / amount) * 100;
    if (returnRate >= 5) {
      parts.push(`Earning ${fmtCAD(rec.dollar_value)} back on ${fmtCAD(amount)} is excellent`);
    }
  }

  if (parts.length === 0) {
    parts.push(`Earns ${rec.earn_rate}x points at ${rec.program_cpp.toFixed(1)}¢/pt`);
  }

  return parts.join(". ") + ".";
}

export function RecommendationCard({ rec, rank, onLog, logged, spendCategory, spendAmount }: Props) {
  const isTop = rank === 1;
  const isSecond = rank === 2;
  const [showExplanation, setShowExplanation] = useState(false);

  return (
    <div className="relative rounded-2xl p-5 lift"
      style={{
        background: isTop ? "linear-gradient(135deg, var(--info-soft) 0%, rgba(79,70,229,0.04) 100%)" : "var(--bg-elevated)",
        border: isTop ? "1px solid var(--info-border)" : "1px solid var(--border-dim)",
        boxShadow: isTop ? "0 4px 24px var(--info-soft), 0 1px 3px rgba(0,0,0,0.4)" : "0 1px 3px rgba(0,0,0,0.3)",
      }}
    >
      {isTop && <div className="absolute top-0 left-6 right-6 h-px" style={{ background: "linear-gradient(90deg, transparent, var(--info-border), transparent)" }} />}

      <div className="flex items-start gap-4">
        {/* Rank bubble */}
        <div className="w-8 h-8 rounded-xl shrink-0 flex items-center justify-center text-[13px] font-bold"
          style={{
            background: isTop ? "linear-gradient(135deg,#0D9488,#0F766E)" : isSecond ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.04)",
            color: isTop ? "#fff" : "var(--text-tertiary)",
            boxShadow: isTop ? "0 2px 10px var(--info-border)" : "none",
          }}
        >
          {rank}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-semibold tracking-tight text-white leading-snug">{rec.card_name}</h3>
              <p className="text-[13px] mt-0.5" style={{ color: "var(--text-secondary)" }}>{rec.program_name}</p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[22px] font-bold tracking-tight leading-none" style={{ color: isTop ? "var(--info-text)" : "var(--text-primary)" }}>
                {fmtPct(rec.effective_return)}
              </div>
              <div className="label-xs mt-1" style={{ color: "var(--text-tertiary)" }}>return</div>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-4 grid grid-cols-1 min-[420px]:grid-cols-3 gap-3 pt-3.5 rounded-xl px-3 pb-3"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
          >
            <div>
              <div className="text-[13px] font-semibold text-white">{rec.earn_rate}×</div>
              <div className="label-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>earn rate</div>
            </div>
            <div>
              <div className="text-[13px] font-semibold text-white">{fmtPts(rec.points_earned)} pts</div>
              <div className="label-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>earned</div>
            </div>
            <div>
              <div className="text-[13px] font-semibold" style={{ color: isTop ? "#4ADE80" : "var(--text-primary)" }}>
                {fmtCAD(rec.dollar_value)} CAD
              </div>
              <div className="label-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>value</div>
            </div>
          </div>

          {/* Footer row */}
          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
            {rec.transfer_partner && (
              <span className="label-xs px-2 py-0.5 rounded-full" style={{ background: "var(--info-soft)", color: "var(--info-text)", border: "1px solid var(--info-border)" }}>
                Via {rec.transfer_partner} ({rec.transfer_cpp?.toFixed(2)}&#162;/pt)
              </span>
            )}
            {rec.is_cap_hit && (
              <span className="label-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(245,158,11,0.12)", color: "#F59E0B", border: "1px solid rgba(245,158,11,0.2)" }}>
                {rec.note?.includes("fully spent") ? "Cap hit" : "Partial cap"}
              </span>
            )}
            {isTop && (
              <span className="label-xs px-2 py-0.5 rounded-full" style={{ background: "var(--info-soft)", color: "var(--info-text)", border: "1px solid var(--info-border)" }}>
                Best value
              </span>
            )}
            <button
              onClick={() => setShowExplanation(!showExplanation)}
              className="label-xs px-2 py-0.5 rounded-full transition-colors"
              style={{
                background: showExplanation ? "var(--info-soft)" : "rgba(255,255,255,0.04)",
                color: showExplanation ? "var(--info-text)" : "var(--text-tertiary)",
                border: showExplanation ? "1px solid var(--info-border)" : "1px solid rgba(255,255,255,0.06)",
              }}
            >
              {showExplanation ? "Hide why" : "Why?"}
            </button>
            {/* Log button — only on top card */}
            {onLog && (
              <button
                onClick={onLog}
                disabled={logged}
                className="ml-auto h-6 px-3 rounded-lg text-[11px] font-semibold transition-all"
                style={logged
                  ? { background: "rgba(52,211,153,0.1)", color: "#34D399", cursor: "default" }
                  : { background: "rgba(255,255,255,0.06)", color: "var(--text-secondary)", border: "1px solid rgba(255,255,255,0.08)" }
                }
              >
                {logged ? "✓ Logged" : "Log spend"}
              </button>
            )}
          </div>

          {/* AI explanation */}
          {showExplanation && (
            <div className="mt-3 p-3 rounded-xl text-[12px] leading-relaxed"
              style={{
                background: "var(--info-soft)",
                border: "1px solid var(--info-soft)",
                color: "var(--text-secondary)",
              }}
            >
              <span className="font-medium" style={{ color: "var(--info-text)" }}>💡 </span>
              {generateExplanation(rec, rank, spendCategory, spendAmount)}
              {rec.note && <span className="block mt-1" style={{ color: "var(--text-tertiary)" }}>{rec.note}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
