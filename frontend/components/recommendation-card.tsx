import type { CardRecommendation } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

interface Props {
  rec: CardRecommendation;
  rank: number;
}

function formatCAD(value: number): string {
  return `$${value.toFixed(2)} CAD`;
}

function formatPoints(value: number): string {
  return `${Math.round(value).toLocaleString()} pts`;
}

export function RecommendationCard({ rec, rank }: Props) {
  const isTop = rank === 1;

  return (
    <div
      className={`relative glass rounded-2xl p-5 transition-all hover:border-white/15 ${
        isTop ? "border border-[#C8102E]/40 maple-glow-sm" : "border border-white/6"
      }`}
    >
      {isTop && (
        <div className="absolute -top-3 left-5">
          <span className="maple-gradient text-white text-xs font-semibold px-3 py-1 rounded-full shadow-lg">
            Best Value
          </span>
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          {/* Rank */}
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm ${
              isTop
                ? "maple-gradient text-white maple-glow-sm"
                : "bg-white/8 text-muted-foreground"
            }`}
          >
            {rank}
          </div>

          {/* Card Info */}
          <div>
            <h3 className="font-semibold text-white text-base leading-tight">{rec.card_name}</h3>
            <p className="text-muted-foreground text-sm mt-0.5">{rec.program_name}</p>
            {rec.note && (
              <p className="text-muted-foreground text-xs mt-1.5 leading-relaxed max-w-sm">
                {rec.note}
              </p>
            )}
            {rec.is_cap_hit && (
              <Badge variant="secondary" className="mt-2 text-xs bg-amber-500/15 text-amber-400 border-amber-500/20">
                Earn cap reached
              </Badge>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="text-right">
            <div className={`text-2xl font-bold ${isTop ? "text-[#C8102E]" : "text-white"}`}>
              {rec.effective_return.toFixed(2)}%
            </div>
            <div className="text-muted-foreground text-xs">effective return</div>
          </div>
        </div>
      </div>

      {/* Bottom stats row */}
      <div className="mt-4 pt-4 border-t border-white/6 grid grid-cols-3 gap-3">
        <div>
          <div className="text-white font-semibold text-sm">{rec.earn_rate}x</div>
          <div className="text-muted-foreground text-xs">earn rate</div>
        </div>
        <div>
          <div className="text-white font-semibold text-sm">{formatPoints(rec.points_earned)}</div>
          <div className="text-muted-foreground text-xs">points earned</div>
        </div>
        <div>
          <div className={`font-semibold text-sm ${isTop ? "text-emerald-400" : "text-white"}`}>
            {formatCAD(rec.dollar_value)}
          </div>
          <div className="text-muted-foreground text-xs">dollar value</div>
        </div>
      </div>
    </div>
  );
}
