"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import {
  getDevaluationProjections,
  listDevaluationAlerts,
  setDevaluationAlert,
  removeDevaluationAlert,
} from "@/lib/api";
import type { DevaluationProjection } from "@/lib/types";
import { PaperTile } from "@/components/editorial/PaperTile";
import { EmptyState } from "@/components/editorial/EmptyState";
import { LineChart } from "@/components/editorial/dataviz";
import { Term } from "@/components/ui/term";
import { progLabel, sectionStyle } from "./_shared";

interface Props {
  sessionId: string | null;
  isReady: boolean;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * DevaluationTrackerTile — the Knowledge "stay ahead of the change" tracker.
 *
 * Reads getDevaluationProjections(sessionId): each upcoming program change the
 * user holds, projected as a points award-cost hike (Today 75K → After 84K),
 * with a synthetic directional trend line. A "Set devaluation alert" toggle is
 * persisted per program via setDevaluationAlert / removeDevaluationAlert, with
 * initial state seeded from listDevaluationAlerts (and each projection's
 * alert_enabled flag). Replaces the prototype's static devaluation card.
 * ───────────────────────────────────────────────────────────────────────────── */
export function DevaluationTrackerTile({ sessionId, isReady }: Props) {
  const [rows, setRows] = useState<DevaluationProjection[]>([]);
  const [alerts, setAlerts] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setErr(null);
    try {
      const [proj, subs] = await Promise.all([
        getDevaluationProjections(sessionId),
        listDevaluationAlerts(sessionId).catch(() => []),
      ]);
      setRows(proj);
      const on = new Set<string>(subs.map((s) => s.program_slug));
      // Trust each projection's persisted alert_enabled flag too.
      proj.forEach((p) => {
        if (p.alert_enabled) on.add(p.program_slug);
      });
      setAlerts(on);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load the devaluation desk");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (isReady) load();
  }, [isReady, load]);

  async function toggleAlert(slug: string) {
    if (!sessionId || pending.has(slug)) return;
    const enabled = alerts.has(slug);
    setPending((p) => new Set(p).add(slug));
    // Optimistic flip.
    setAlerts((a) => {
      const next = new Set(a);
      if (enabled) next.delete(slug);
      else next.add(slug);
      return next;
    });
    try {
      if (enabled) await removeDevaluationAlert(sessionId, slug);
      else await setDevaluationAlert(sessionId, slug);
    } catch {
      // Revert on failure.
      setAlerts((a) => {
        const next = new Set(a);
        if (enabled) next.add(slug);
        else next.delete(slug);
        return next;
      });
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(slug);
        return next;
      });
    }
  }

  return (
    <section style={sectionStyle}>
      <PaperTile
        motif="alarm"
        eyebrow="Devaluation tracker"
        title={<>Today&apos;s rate, before it <span style={{ fontStyle: "italic" }}>moves</span>.</>}
        accent
      >
        <p
          className="serif"
          style={{ marginTop: -4, marginBottom: 16, fontSize: 14, fontStyle: "italic", color: "var(--ink-2)", lineHeight: 1.5 }}
        >
          Programs run a <Term term="devaluation">devaluation</Term> quietly. For every announced change touching a balance you hold, Maple projects the new award cost and the trend — set an alert to be warned before it lands.
        </p>

        {loading && <p className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>Reading the desk…</p>}
        {err && <p className="serif" style={{ fontStyle: "italic", color: "var(--loss)", fontSize: 14 }}>{err}</p>}

        {!loading && !err && rows.length === 0 && (
          <EmptyState
            icon={Bell}
            title="No upcoming devaluations"
            body="Nothing on the calendar touches your wallet right now. We'll surface a projection here the moment one is announced."
            action={{ label: "Browse programs", href: "/insights" }}
          />
        )}

        {!loading && !err && rows.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {rows.map((p) => {
              const on = alerts.has(p.program_slug);
              const busy = pending.has(p.program_slug);
              const hikePct = Math.round(p.hike_percent * 100);
              const trendPoints =
                p.trend && p.trend.length > 1
                  ? p.trend.map((t) => t.points)
                  : [p.today_points, p.after_points];
              return (
                <div
                  key={p.id}
                  style={{
                    border: "1px solid var(--rule)",
                    borderRadius: 12,
                    background: "var(--surface)",
                    padding: "16px 18px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <span className="eyebrow">{progLabel(p.program_slug)}</span>
                    <span
                      className="mono"
                      style={{
                        fontSize: 9,
                        padding: "3px 8px",
                        borderRadius: 6,
                        background: "var(--accent-soft)",
                        color: "var(--accent)",
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                      }}
                    >
                      {p.severity === "major" ? "Major" : "Minor"} · +{hikePct}%
                    </span>
                  </div>

                  <div className="display" style={{ fontSize: 24, marginTop: 10 }}>
                    {progLabel(p.program_slug)} <span style={{ color: "var(--loss)" }}>↑ {hikePct}%</span>
                  </div>
                  <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
                    {p.title} · effective {p.effective_date}
                    {p.days_until >= 0 ? ` · in ${p.days_until} days` : ""}
                  </div>

                  {/* Today → After award-cost projection */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 16,
                      marginTop: 14,
                      padding: "14px 16px",
                      border: "1px solid var(--rule)",
                      borderRadius: 12,
                      background: "var(--card-fill)",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ textAlign: "center" }}>
                      <div className="display" style={{ fontSize: 26, color: "var(--ink)" }}>
                        {pointsK(p.today_points)}
                      </div>
                      <div className="mono" style={{ fontSize: 9, color: "var(--ink-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 2 }}>
                        Today
                      </div>
                    </div>
                    <svg width="36" height="16" viewBox="0 0 36 16" style={{ flexShrink: 0 }} aria-hidden>
                      <line x1="2" y1="8" x2="27" y2="8" stroke="var(--loss)" strokeWidth="2" />
                      <polygon points="25,3 36,8 25,13" fill="var(--loss)" />
                    </svg>
                    <div style={{ textAlign: "center" }}>
                      <div className="display" style={{ fontSize: 26, color: "var(--loss)" }}>
                        {pointsK(p.after_points)}
                      </div>
                      <div className="mono" style={{ fontSize: 9, color: "var(--loss)", letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 2 }}>
                        After {p.effective_date}
                      </div>
                    </div>
                    <div style={{ marginLeft: "auto", textAlign: "right" }}>
                      <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                        +{(p.after_points - p.today_points).toLocaleString("en-CA")} pts / award
                      </div>
                      {p.user_holds_balance && p.exposure > 0 && (
                        <div className="mono" style={{ fontSize: 14, color: "var(--loss)", fontWeight: 600, marginTop: 2 }}>
                          ≈ ${p.exposure.toFixed(0)} exposed
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Directional trend line */}
                  <div style={{ marginTop: 14 }}>
                    <div className="eyebrow" style={{ marginBottom: 6 }}>Projected award cost</div>
                    <LineChart points={trendPoints} color="var(--loss)" height={110} endDot />
                  </div>

                  {p.headline && (
                    <p className="serif" style={{ fontSize: 13, fontStyle: "italic", color: "var(--ink-2)", margin: "12px 0 0", lineHeight: 1.45 }}>
                      {p.headline}
                    </p>
                  )}

                  {/* Persisted alert toggle */}
                  <button
                    type="button"
                    onClick={() => toggleAlert(p.program_slug)}
                    disabled={busy}
                    className="mono"
                    style={{
                      marginTop: 14,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 7,
                      padding: "9px 16px",
                      borderRadius: 8,
                      border: `1px solid ${on ? "var(--accent)" : "var(--rule-strong)"}`,
                      background: on ? "var(--accent)" : "transparent",
                      color: on ? "#fff" : "var(--ink-2)",
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      cursor: busy ? "default" : "pointer",
                      opacity: busy ? 0.7 : 1,
                      boxShadow: on ? "var(--shadow-accent-glow)" : "none",
                      transition: "background 160ms, border-color 160ms, color 160ms",
                    }}
                  >
                    <Bell size={12} />
                    {on ? "Alert on" : "Set devaluation alert"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </PaperTile>
    </section>
  );
}

/** Render a points figure as a compact "75K" / "1.2M" style label. */
function pointsK(pts: number): string {
  if (pts >= 1_000_000) return `${(pts / 1_000_000).toFixed(1)}M`;
  if (pts >= 1_000) return `${Math.round(pts / 1_000)}K`;
  return pts.toLocaleString("en-CA");
}
