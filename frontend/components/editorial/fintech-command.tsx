/* Fintech command center — primary brand panel + 4 KPI cards in a strict
 * 5-col grid mirroring prototype `.fintech-command`.
 */
import type { ReactNode } from "react";

export type CommandKPI = {
  label: string;
  value: ReactNode;
  sub?: string;
  subColor?: string; // CSS var or color
};

export function FintechCommand({
  brandTitle = "Rewards OS",
  brandEyebrow = "Maple Pro",
  brandNote = "linked wallet · live CPP assumptions · CAD",
  items,
}: {
  brandTitle?: string;
  brandEyebrow?: string;
  brandNote?: string;
  items: CommandKPI[];
}) {
  return (
    <div className="fintech-command">
      <div
        className="fintech-command-primary"
        style={{
          border: "1px solid var(--rule-strong)",
          background: "var(--surface-3)",
          color: "var(--paper)",
          boxShadow: "var(--shadow-2)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse 70% 80% at 100% 0%, rgba(165,31,45,0.22), transparent 58%)",
            pointerEvents: "none",
          }}
        />
        <div style={{ position: "relative" }}>
          <div className="eyebrow" style={{ color: "rgba(246,247,248,0.62)", marginBottom: 8 }}>
            {brandEyebrow}
          </div>
          <div
            className="display"
            style={{ fontSize: 22, letterSpacing: "-0.01em", color: "var(--paper)" }}
          >
            {brandTitle}
          </div>
          <div
            className="mono"
            style={{ marginTop: 10, color: "rgba(246,247,248,0.62)", fontSize: 11 }}
          >
            {brandNote}
          </div>
        </div>
      </div>

      {items.map((it) => (
        <div key={it.label} className="fintech-command-card">
          <div className="eyebrow" style={{ fontSize: 9, letterSpacing: "0.13em", marginBottom: 9 }}>
            {it.label}
          </div>
          <div className="display" style={{ fontSize: 28, lineHeight: 1, color: "var(--ink)" }}>
            {it.value}
          </div>
          {it.sub && (
            <div
              className="mono"
              style={{ marginTop: 8, fontSize: 10, color: it.subColor ?? "var(--ink-3)" }}
            >
              {it.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
