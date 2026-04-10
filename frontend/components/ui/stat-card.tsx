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
  return (
    <div
      className={`rounded-2xl p-4 relative overflow-hidden hover-glow ${className}`}
      style={{
        background: accent
          ? "linear-gradient(135deg, rgba(13,148,136,0.08) 0%, rgba(79,70,229,0.03) 100%)"
          : "var(--bg-elevated)",
        border: accent
          ? "1px solid rgba(13,148,136,0.2)"
          : "1px solid var(--border-dim)",
      }}
    >
      {accent && (
        <div
          className="absolute top-0 left-4 right-4 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(13,148,136,0.5), transparent)",
          }}
        />
      )}

      <div className="flex items-start justify-between">
        <div>
          <div className="label-xs mb-2" style={{ color: "var(--text-tertiary)" }}>
            {label}
          </div>
          <AnimatedCounter
            value={value}
            prefix={prefix}
            suffix={suffix}
            decimals={decimals}
            duration={1.0}
            className="text-[22px] font-bold tracking-tight text-white"
          />
          {trend && (
            <div
              className="flex items-center gap-1 mt-1.5 text-[12px] font-medium"
              style={{
                color: trend.value >= 0 ? "#4ADE80" : "#F87171",
              }}
            >
              <span>{trend.value >= 0 ? "↑" : "↓"}</span>
              <span>
                {Math.abs(trend.value).toFixed(1)}% {trend.label}
              </span>
            </div>
          )}
        </div>
        {icon && (
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
            style={{
              background: accent
                ? "rgba(13,148,136,0.15)"
                : "rgba(255,255,255,0.04)",
              border: accent
                ? "1px solid rgba(13,148,136,0.2)"
                : "1px solid var(--border-dim)",
            }}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
