"use client";

import { useEffect, useState } from "react";
import { getCardCredits, getMissedRewards, getSQCProjection } from "@/lib/api";
import { Sparkline, ProgressBar } from "@/components/editorial/dataviz";

/* ─────────────────────────────────────────────────────────────────────────────
 * WorkspaceDirectory — the Pro Tools landing view.
 *
 * A three-tile personal stat strip (Missed · 90d recoverable; Credits unused
 * expiring; Aeroplan SQC on track) over a 2×2 directory of the four workspaces.
 * Each card carries an animated single-stroke glyph, a title, a "N TOOLS" count
 * in --accent, a one-line description, and an "Open →" cue.
 *
 * Replaces the old tab row + "Pro active" pill entirely. Clicking a card calls
 * onOpen(key) which the page wires to a ?ws= router.replace.
 * ───────────────────────────────────────────────────────────────────────────── */

export type WorkspaceKey = "forensics" | "status" | "stacking" | "knowledge";

export interface WorkspaceSpec {
  key: WorkspaceKey;
  title: string;
  count: number;
  blurb: string;
  cue: string;
}

export const WORKSPACES: WorkspaceSpec[] = [
  {
    key: "forensics",
    title: "Forensics",
    count: 6,
    blurb: "Missed rewards · welcome-bonus mission · annual credits · renewals · card value · issuer changes.",
    cue: "Open Forensics →",
  },
  {
    key: "status",
    title: "Status",
    count: 5,
    blurb: "Aeroplan SQC projector · loyalty balances · transfer sweet-spots · points expiry · award watches.",
    cue: "Open Status & balances →",
  },
  {
    key: "stacking",
    title: "Stacking",
    count: 7,
    blurb: "Next-best card · swap simulator · household optimizer · combos · portal stacks · buy-points · offers.",
    cue: "Open Stacking & math →",
  },
  {
    key: "knowledge",
    title: "Knowledge",
    count: 2,
    blurb: "Devaluation tracker · PC Optimum module. Stay ahead of program changes before they cost you.",
    cue: "Open Knowledge →",
  },
];

function fmtCAD(v: number) {
  return `$${Math.round(v).toLocaleString("en-CA")}`;
}

interface StripData {
  recoverable: number;
  recoverSeries: number[];
  expiringValue: number;
  sqcEarned: number;
  sqcTarget: number;
  sqcPct: number;
}

interface Props {
  sessionId: string | null;
  isReady: boolean;
  onOpen: (key: WorkspaceKey) => void;
}

export function WorkspaceDirectory({ sessionId, isReady, onOpen }: Props) {
  const [data, setData] = useState<StripData | null>(null);

  useEffect(() => {
    if (!isReady || !sessionId) return;
    let cancelled = false;
    Promise.all([
      getMissedRewards(sessionId, { sinceDays: 90, top: 1 }).catch(() => null),
      getCardCredits(sessionId).catch(() => []),
      getSQCProjection(sessionId).catch(() => null),
    ]).then(([missed, credits, sqc]) => {
      if (cancelled) return;

      const recoverable = Math.max(0, missed?.total_gap ?? 0);
      // A directional 7-point ramp to the recoverable figure for the sparkline.
      const recoverSeries =
        recoverable > 0
          ? [0.12, 0.22, 0.3, 0.46, 0.58, 0.78, 1].map((f) => recoverable * f)
          : [1, 1, 1, 1, 1, 1, 1];

      const expiringValue = credits.reduce((s, c) => {
        if (c.status === "redeemed") return s;
        if (c.days_to_renewal == null || c.days_to_renewal < 0 || c.days_to_renewal > 90) return s;
        return s + (c.status === "unused" ? c.value_cad : c.remaining);
      }, 0);

      let sqcEarned = 0;
      let sqcTarget = 0;
      let sqcPct = 0;
      if (sqc && !sqc.wallet_has_no_aeroplan_cards && sqc.tiers.length > 0) {
        sqcEarned = sqc.total_sqc_earned;
        sqcTarget = sqc.tiers[sqc.tiers.length - 1].sqc_required || 0;
        sqcPct = sqcTarget > 0 ? Math.min(100, (sqcEarned / sqcTarget) * 100) : 0;
      }

      setData({ recoverable, recoverSeries, expiringValue, sqcEarned, sqcTarget, sqcPct });
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId, isReady]);

  return (
    <>
      {/* personal strip: 3 stat tiles with mini sparklines */}
      <div className="protools-stat-strip" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, margin: "26px 0 22px" }}>
        <StatTile eyebrow="Missed · 90d" tag="▲ recoverable" tagColor="var(--loss)">
          <div className="display" style={{ fontSize: 30, marginTop: 6, color: "var(--ink)" }}>
            {data ? fmtCAD(data.recoverable) : "—"}
          </div>
          <Sparkline
            values={data?.recoverSeries ?? [0, 0, 0, 0, 0, 0, 0]}
            kind="line"
            color="var(--loss)"
            width={200}
            height={34}
            style={{ width: "100%", height: 34, marginTop: 8 }}
          />
        </StatTile>

        <StatTile eyebrow="Credits unused" tag="expires soon" tagColor="var(--gold)">
          <div className="display" style={{ fontSize: 30, marginTop: 6, color: "var(--ink)" }}>
            {data ? fmtCAD(data.expiringValue) : "—"}
          </div>
          <Sparkline
            values={[3, 5, 8, 7, 11, 13, 15]}
            kind="bar"
            color="var(--gold)"
            width={200}
            height={34}
            style={{ width: "100%", height: 34, marginTop: 8 }}
          />
        </StatTile>

        <StatTile
          eyebrow="Aeroplan SQC"
          tag={data && data.sqcPct >= 60 ? "on track" : "building"}
          tagColor="var(--gain)"
        >
          <div className="display" style={{ fontSize: 30, marginTop: 6, color: "var(--ink)" }}>
            {data && data.sqcTarget > 0 ? (
              <>
                {data.sqcEarned.toLocaleString("en-CA")}
                <span style={{ fontSize: 15, color: "var(--ink-3)" }}> / {data.sqcTarget.toLocaleString("en-CA")}</span>
              </>
            ) : (
              "—"
            )}
          </div>
          <ProgressBar
            pct={data?.sqcPct ?? 0}
            color="var(--gain)"
            height={8}
            animationDelay="0.2s"
            style={{ marginTop: 14 }}
          />
        </StatTile>
      </div>

      {/* visual tool directory: 4 groups */}
      <div className="eyebrow" style={{ margin: "22px 0 14px" }}>
        Four workspaces · 20 tools, grouped by purpose
      </div>
      <div data-tour-id="pro-directory" className="protools-directory" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))", gap: 14 }}>
        {WORKSPACES.map((w) => (
          <button
            key={w.key}
            type="button"
            onClick={() => onOpen(w.key)}
            className="lift"
            style={{
              textAlign: "left",
              border: "1px solid var(--rule)",
              borderRadius: 16,
              background: "var(--card-fill)",
              padding: 18,
              cursor: "pointer",
              font: "inherit",
              color: "inherit",
              display: "block",
              width: "100%",
            }}
          >
            <div style={{ height: 64, display: "flex", alignItems: "center", gap: 14 }}>
              <WorkspaceGlyph kind={w.key} />
              <div>
                <div className="display" style={{ fontSize: 19 }}>{w.title}</div>
                <div className="mono" style={{ fontSize: 11, color: "var(--accent)", letterSpacing: "0.06em" }}>
                  {w.count} TOOLS
                </div>
              </div>
            </div>
            <p className="serif" style={{ fontSize: 13, fontStyle: "italic", color: "var(--ink-2)", margin: "12px 0 0", lineHeight: 1.45 }}>
              {w.blurb}
            </p>
            <div className="mono" style={{ marginTop: 14, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent)" }}>
              {w.cue}
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

function StatTile({
  eyebrow,
  tag,
  tagColor,
  children,
}: {
  eyebrow: string;
  tag: string;
  tagColor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="lift" style={{ border: "1px solid var(--rule)", borderRadius: 14, background: "var(--card-fill)", padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span className="eyebrow">{eyebrow}</span>
        <span className="mono" style={{ fontSize: 10, color: tagColor }}>{tag}</span>
      </div>
      {children}
    </div>
  );
}

/* Animated single-stroke glyphs — one per workspace, echoing the prototype. */
function WorkspaceGlyph({ kind }: { kind: WorkspaceKey }) {
  if (kind === "forensics") {
    return (
      <svg width="56" height="56" viewBox="0 0 56 56" style={{ flexShrink: 0 }} aria-hidden>
        <g transform="translate(6,32)">
          <rect className="mr-grow-y-in" x="0" y="-10" width="7" height="10" rx="2" fill="var(--accent)" opacity="0.85" style={{ transformOrigin: "center bottom" }} />
          <rect className="mr-grow-y-in" x="11" y="-18" width="7" height="18" rx="2" fill="var(--accent)" opacity="0.6" style={{ transformOrigin: "center bottom", animationDelay: "0.08s" }} />
          <rect className="mr-grow-y-in" x="22" y="-26" width="7" height="26" rx="2" fill="var(--accent)" opacity="0.85" style={{ transformOrigin: "center bottom", animationDelay: "0.16s" }} />
        </g>
        <circle cx="40" cy="18" r="9" fill="none" stroke="var(--accent)" strokeWidth="3" />
        <line x1="46" y1="24" x2="52" y2="30" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "status") {
    return (
      <svg width="56" height="56" viewBox="0 0 56 56" style={{ flexShrink: 0 }} aria-hidden>
        <circle cx="28" cy="28" r="20" fill="none" stroke="var(--rule)" strokeWidth="6" />
        <circle
          className="mr-draw-in"
          cx="28"
          cy="28"
          r="20"
          fill="none"
          stroke="var(--gain)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray="86 126"
          transform="rotate(-90 28 28)"
          style={{ ["--len" as string]: 86 }}
        />
      </svg>
    );
  }
  if (kind === "stacking") {
    return (
      <svg width="56" height="56" viewBox="0 0 56 56" style={{ flexShrink: 0 }} aria-hidden>
        <rect className="mr-grow-y-in" x="6" y="34" width="11" height="16" rx="2" fill="var(--gold)" style={{ transformOrigin: "center bottom" }} />
        <rect className="mr-grow-y-in" x="22" y="22" width="11" height="28" rx="2" fill="var(--accent)" style={{ transformOrigin: "center bottom", animationDelay: "0.08s" }} />
        <rect className="mr-grow-y-in" x="38" y="12" width="11" height="38" rx="2" fill="var(--primary)" style={{ transformOrigin: "center bottom", animationDelay: "0.16s" }} />
      </svg>
    );
  }
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" style={{ flexShrink: 0 }} aria-hidden>
      <path
        d="M28 14 C22 10, 12 10, 8 12 L8 44 C12 42, 22 42, 28 46 C34 42, 44 42, 48 44 L48 12 C44 10, 34 10, 28 14 Z"
        fill="none"
        stroke="var(--info)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <line x1="28" y1="14" x2="28" y2="46" stroke="var(--info)" strokeWidth="2.5" />
      <circle cx="28" cy="9" r="3" fill="var(--info)" style={{ transformBox: "fill-box", transformOrigin: "center", animation: "mr-pulse 2s ease-in-out infinite" }} />
    </svg>
  );
}
