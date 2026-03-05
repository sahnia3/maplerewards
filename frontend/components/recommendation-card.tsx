import type { CardRecommendation } from "@/lib/types";

interface Props {
  rec: CardRecommendation;
  rank: number;
  onLog?: () => void;
  logged?: boolean;
}

function fmtCAD(v: number) { return `$${v.toFixed(2)}`; }
function fmtPts(v: number) { return `${Math.round(v).toLocaleString()}`; }
function fmtPct(v: number) { return `${v.toFixed(2)}%`; }

export function RecommendationCard({ rec, rank, onLog, logged }: Props) {
  const isTop = rank === 1;
  const isSecond = rank === 2;

  return (
    <div className="relative rounded-2xl p-5 lift"
      style={{
        background: isTop ? "linear-gradient(135deg, rgba(200,16,46,0.08) 0%, rgba(155,13,35,0.04) 100%)" : "var(--bg-elevated)",
        border: isTop ? "1px solid rgba(200,16,46,0.25)" : "1px solid var(--border-dim)",
        boxShadow: isTop ? "0 4px 24px rgba(200,16,46,0.12), 0 1px 3px rgba(0,0,0,0.4)" : "0 1px 3px rgba(0,0,0,0.3)",
      }}
    >
      {isTop && <div className="absolute top-0 left-6 right-6 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(200,16,46,0.6), transparent)" }} />}

      <div className="flex items-start gap-4">
        {/* Rank bubble */}
        <div className="w-8 h-8 rounded-xl shrink-0 flex items-center justify-center text-[13px] font-bold"
          style={{
            background: isTop ? "linear-gradient(135deg,#C8102E,#9B0D23)" : isSecond ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.04)",
            color: isTop ? "#fff" : "var(--text-tertiary)",
            boxShadow: isTop ? "0 2px 10px rgba(200,16,46,0.35)" : "none",
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
              <div className="text-[22px] font-bold tracking-tight leading-none" style={{ color: isTop ? "#E8173A" : "var(--text-primary)" }}>
                {fmtPct(rec.effective_return)}
              </div>
              <div className="label-xs mt-1" style={{ color: "var(--text-tertiary)" }}>return</div>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-4 grid grid-cols-3 gap-3 pt-3.5 rounded-xl px-3 pb-3"
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
            {rec.is_cap_hit && (
              <span className="label-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(245,158,11,0.12)", color: "#F59E0B", border: "1px solid rgba(245,158,11,0.2)" }}>
                Earn cap reached
              </span>
            )}
            {rec.note && <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>{rec.note}</span>}
            {isTop && (
              <span className="label-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(200,16,46,0.12)", color: "#E8173A", border: "1px solid rgba(200,16,46,0.2)" }}>
                Best value
              </span>
            )}
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
        </div>
      </div>
    </div>
  );
}
