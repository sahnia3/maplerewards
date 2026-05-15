"use client";

import { useCallback, useEffect, useState } from "react";
import { Target } from "lucide-react";
import { getWelcomeBonusMission, type MissionReport, type MissionItem } from "@/lib/api";
import { PaperTile } from "@/components/editorial/PaperTile";
import { EmptyState } from "@/components/editorial/EmptyState";
import { sectionStyle } from "./_shared";

interface Props {
  sessionId: string | null;
  isReady: boolean;
}

/**
 * WelcomeBonusMissionTile — Pro-Tools surface for Welcome-Bonus Mission
 * Control. Surfaces per-card velocity, projected miss, required daily
 * burn, and an actionable recommendation per bonus.
 */
export function WelcomeBonusMissionTile({ sessionId, isReady }: Props) {
  const [report, setReport] = useState<MissionReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!isReady || !sessionId) return;
    setLoading(true);
    setErr(null);
    getWelcomeBonusMission(sessionId)
      .then(setReport)
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load mission report"))
      .finally(() => setLoading(false));
  }, [sessionId, isReady]);

  useEffect(() => { load(); }, [load]);

  return (
    <section style={sectionStyle}>
      <PaperTile
        motif="alarm"
        eyebrow="Welcome-bonus mission control"
        title={<>Will you hit the <span style={{ fontStyle: "italic" }}>bonus</span>?</>}
      >
        <p
          className="serif"
          style={{
            marginTop: -4,
            marginBottom: 16,
            fontSize: 14,
            fontStyle: "italic",
            color: "var(--ink-2)",
            lineHeight: 1.5,
          }}
        >
          Velocity, projected completion, and the exact daily burn each active
          bonus needs from today to lock in.
        </p>

        {loading && (
          <p className="eyebrow" style={{ color: "var(--ink-3)" }}>
            COMPUTING MISSION…
          </p>
        )}
        {err && <p style={{ color: "var(--accent)" }}>{err}</p>}

        {report && report.items.length === 0 && (
          <div
            style={{
              border: "1px dashed var(--rule)",
              borderRadius: 10,
              padding: "24px 22px",
              textAlign: "center",
            }}
          >
            <div className="eyebrow" style={{ marginBottom: 8, color: "var(--ink-3)" }}>
              NO ACTIVE BONUSES
            </div>
            <p
              className="serif"
              style={{
                fontSize: 14,
                color: "var(--ink-2)",
                lineHeight: 1.5,
                fontStyle: "italic",
                margin: "0 0 18px",
              }}
            >
              Activate a welcome-bonus tracker on one of your cards and Mission
              Control will project whether you'll hit the minimum spend in time.
            </p>
            <a
              href="/wallet"
              className="mono"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "10px 18px",
                borderRadius: 8,
                background: "var(--accent)",
                color: "#fff",
                textDecoration: "none",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              Activate from wallet →
            </a>
          </div>
        )}

        {report && report.items.length > 0 && (
          <>
            <MissionRollup report={report} />
            <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
              {report.items.map((item) => (
                <BonusRow key={item.id} item={item} />
              ))}
            </div>
          </>
        )}
      </PaperTile>
    </section>
  );
}

function MissionRollup({ report }: { report: MissionReport }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: 0,
        borderTop: "1px solid var(--ink)",
        borderBottom: "1px solid var(--rule)",
        padding: "18px 0",
      }}
    >
      <Stat
        label="Active bonuses"
        value={String(report.total_active)}
      />
      <Stat
        label="At-risk points"
        value={report.total_at_risk_points > 0 ? report.total_at_risk_points.toLocaleString() : "—"}
        emphasize={report.total_at_risk_points > 0}
      />
      <Stat
        label="Combined daily burn"
        value={`$${report.total_required_daily_cad.toFixed(0)}/day`}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div style={{ paddingRight: 14 }}>
      <div className="eyebrow" style={{ marginBottom: 6 }}>
        {label}
      </div>
      <div
        className="display"
        style={{
          fontSize: 22,
          lineHeight: 1.1,
          color: emphasize ? "var(--accent)" : "var(--ink)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

const SEVERITY_STYLES: Record<
  MissionItem["severity"],
  { color: string; label: string; bg: string }
> = {
  "on-track": { color: "var(--gain)", label: "ON TRACK", bg: "var(--paper)" },
  "tight": { color: "var(--accent-2, #74131D)", label: "TIGHT", bg: "var(--paper)" },
  "critical": { color: "var(--accent)", label: "CRITICAL", bg: "var(--accent-wash, rgba(165,31,45,0.06))" },
  "missed": { color: "var(--ink-3)", label: "MISSED", bg: "var(--paper)" },
};

function BonusRow({ item }: { item: MissionItem }) {
  const s = SEVERITY_STYLES[item.severity];
  const pct = Math.round(item.progress * 100);
  return (
    <article
      style={{
        border: "1px solid var(--rule)",
        borderRadius: 10,
        padding: 18,
        background: s.bg,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 6,
        }}
      >
        <div className="display" style={{ fontSize: 18 }}>
          {item.card_name ?? "Card"}
        </div>
        <span
          className="eyebrow"
          style={{
            color: s.color,
            border: `1px solid ${s.color}`,
            padding: "2px 8px",
            borderRadius: 4,
          }}
        >
          {s.label}
        </span>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 12,
          fontSize: 13,
          marginBottom: 12,
        }}
      >
        <SmallStat
          label="Progress"
          value={`${pct}%`}
          sub={`$${item.current_spend.toFixed(0)} / $${item.min_spend.toFixed(0)}`}
        />
        <SmallStat
          label="Velocity"
          value={`$${item.daily_velocity_cad.toFixed(0)}/d`}
        />
        <SmallStat
          label="Required"
          value={`$${item.required_daily_cad.toFixed(0)}/d`}
          emphasize={item.required_daily_cad > item.daily_velocity_cad * 1.5}
        />
        <SmallStat label="Days left" value={String(item.days_left)} />
      </div>

      <p
        className="serif"
        style={{
          margin: 0,
          fontSize: 13,
          fontStyle: "italic",
          color: item.severity === "missed" ? "var(--ink-3)" : "var(--ink-2)",
          lineHeight: 1.4,
        }}
      >
        {item.recommendation}
      </p>
    </article>
  );
}

function SmallStat({
  label,
  value,
  sub,
  emphasize,
}: {
  label: string;
  value: string;
  sub?: string;
  emphasize?: boolean;
}) {
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 4, fontSize: 9 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: emphasize ? "var(--accent)" : "var(--ink)",
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// Suppress unused-import lint when target icon is rendered via PaperTile motif.
void Target;
