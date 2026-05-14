"use client";

import { AnimatedCounter } from "@/components/motion/counter";

interface StatCardProps {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  trend?: { value: number; label: string };
  icon?: React.ReactNode;
  accent?: boolean;
  className?: string;
}

export function StatCard({
  label,
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  trend,
  icon,
  accent = false,
  className = "",
}: StatCardProps) {
  const trendPositive = trend ? trend.value >= 0 : true;

  return (
    <div
      className={`rounded-2xl p-5 relative overflow-hidden ${className}`}
      style={{
        background: accent
          ? "linear-gradient(135deg, var(--accent-wash) 0%, transparent 75%), var(--surface)"
          : "var(--surface)",
        border: accent
          ? "1px solid var(--accent)"
          : "1px solid var(--rule-strong)",
        boxShadow: accent ? "var(--shadow-accent-glow)" : "var(--shadow-1)",
        transition:
          "box-shadow 220ms cubic-bezier(0.16, 1, 0.3, 1), transform 220ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div
            className="font-mono uppercase mb-2"
            style={{
              fontSize: "10px",
              letterSpacing: "0.14em",
              color: "var(--ink-3)",
              fontWeight: 500,
            }}
          >
            {label}
          </div>

          <AnimatedCounter
            value={value}
            prefix={prefix}
            suffix={suffix}
            decimals={decimals}
            duration={1.0}
            className="font-display tracking-tight"
            style={{
              fontSize: "clamp(24px, 2.5vw, 32px)",
              lineHeight: 1.04,
              color: "var(--ink)",
              display: "block",
            }}
          />

          {trend && (
            <div
              className="inline-flex items-center gap-1 mt-3 px-2 py-0.5 rounded-full"
              style={{
                fontSize: "11px",
                fontWeight: 600,
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.02em",
                color: trendPositive ? "var(--gain)" : "var(--loss)",
                background: trendPositive ? "var(--gain-soft)" : "var(--accent-wash)",
                border: `1px solid ${
                  trendPositive ? "var(--gain-soft)" : "var(--accent-soft)"
                }`,
              }}
            >
              <span aria-hidden>{trendPositive ? "↑" : "↓"}</span>
              <span>
                {Math.abs(trend.value).toFixed(1)}% {trend.label}
              </span>
            </div>
          )}
        </div>

        {icon && (
          <div
            className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background: accent ? "var(--accent-wash)" : "var(--surface-2)",
              border: `1px solid ${accent ? "var(--accent-soft)" : "var(--rule)"}`,
              color: accent ? "var(--accent)" : "var(--ink-2)",
            }}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
