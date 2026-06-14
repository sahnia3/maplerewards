"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { exportProReportCSV, triggerCSVDownload, type ProExportReport } from "@/lib/api";

/* Shared primitives for pro-tools tiles. Internal — not exported from the
 * pro-tools barrel. */

// Whole-dollar CAD for headline figures (spend, buy cost, net value). Sign-aware
// so a negative renders "-$180", not "$-180".
export function fmtCAD(v: number) {
  const sign = v < 0 ? "-" : "";
  return `${sign}$${Math.abs(v).toLocaleString("en-CA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// Two-decimal CAD for gap / per-component values, where whole-dollar rounding
// would make displayed rows fail to sum to the displayed total, or render a real
// sub-dollar miss (e.g. $0.40) as "$0". Sign-aware like fmtCAD.
export function fmtCAD2(v: number) {
  const sign = v < 0 ? "-" : "";
  return `${sign}$${Math.abs(v).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const PROGRAM_LABELS: Record<string, string> = {
  aeroplan: "Aeroplan",
  marriott: "Marriott Bonvoy",
  hilton: "Hilton Honors",
  hyatt: "World of Hyatt",
  ihg: "IHG One Rewards",
  "amex-mr-canada": "Amex MR Canada",
  "rbc-avion": "RBC Avion",
  "scene-plus": "Scene+",
  "hdfc-rewards": "HDFC Reward Points",
  "axis-edge-miles": "Axis EDGE Miles",
  "hilton-honors": "Hilton Honors",
  "marriott-bonvoy": "Marriott Bonvoy",
};

export function progLabel(slug: string) {
  return PROGRAM_LABELS[slug] ?? slug;
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <div className="eyebrow" style={{ marginBottom: 6 }}>{children}</div>;
}

export const fieldStyle: CSSProperties = {
  width: "100%",
  height: 42,
  padding: "0 12px",
  background: "var(--surface)",
  border: "1px solid var(--rule)",
  borderRadius: 8,
  fontSize: 14,
  fontFamily: "var(--font-mono)",
  color: "var(--ink)",
  outline: "none",
  transition: "border-color 160ms",
};

export const ctaStyle: CSSProperties = {
  height: 42,
  padding: "0 22px",
  borderRadius: 8,
  background: "var(--accent)",
  color: "#fff",
  border: "none",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  cursor: "pointer",
  transition: "background 160ms, transform 160ms",
};

export function VerdictPill({ verdict }: { verdict: string }) {
  const v = verdict.toUpperCase().replace(/_/g, " ");
  const tone = verdict === "buy" ? "var(--gain)" : verdict === "earn" ? "var(--accent)" : "var(--ink-2)";
  return (
    <span
      className="mono"
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "5px 12px",
        border: `1px solid ${tone}`,
        color: tone,
        fontSize: 11,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        fontWeight: 600,
        borderRadius: 999,
      }}
    >
      {v}
    </span>
  );
}

// ExportButton downloads a Pro computed-analysis report as CSV (AU-6). It is
// disabled until the tile is ready (sessionId present + data loaded) so the
// user can't request an export of an empty wallet. Errors render inline rather
// than throwing — a failed export shouldn't break the tile.
export function ExportButton({
  sessionId,
  report,
  params,
  disabled = false,
  label = "Export CSV",
}: {
  sessionId: string | null;
  report: ProExportReport;
  params?: Record<string, string | string[]>;
  disabled?: boolean;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const blob = await exportProReportCSV(sessionId, report, params);
      const stamp = new Date().toISOString().slice(0, 10);
      triggerCSVDownload(blob, `maplerewards_${report}_${stamp}.csv`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setLoading(false);
    }
  }

  const isDisabled = disabled || loading || !sessionId;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <button
        type="button"
        onClick={run}
        disabled={isDisabled}
        className="mono"
        style={{
          height: 34,
          padding: "0 14px",
          borderRadius: 8,
          background: "transparent",
          color: "var(--ink-2)",
          border: "1px solid var(--rule)",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.10em",
          textTransform: "uppercase",
          cursor: isDisabled ? "default" : "pointer",
          opacity: isDisabled ? 0.5 : 1,
          transition: "border-color 160ms, color 160ms",
        }}
      >
        {loading ? "Exporting…" : `${label} ↓`}
      </button>
      {error && (
        <span className="mono" style={{ fontSize: 11, color: "var(--loss, #c0392b)" }}>
          {error}
        </span>
      )}
    </span>
  );
}

export function Stat({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <div style={{ padding: "12px 14px", borderRight: last ? "none" : "1px solid var(--rule)" }}>
      <div className="eyebrow" style={{ fontSize: 9, marginBottom: 4 }}>{label}</div>
      <div className="mono" style={{ fontSize: 16, color: "var(--ink)", fontWeight: 600, letterSpacing: "0.02em" }}>{value}</div>
    </div>
  );
}

export const sectionStyle: CSSProperties = { marginBottom: 22 };
