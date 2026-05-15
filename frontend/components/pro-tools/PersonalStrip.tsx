"use client";

import { useEffect, useState } from "react";
import { getCardCredits, getMissedRewards, getSQCProjection } from "@/lib/api";

interface Props {
  sessionId: string | null;
  isReady: boolean;
}

interface StripData {
  recoverable: number;        // $ missed in last 30 days
  expiringCount: number;      // credits expiring within 90 days
  sqcLabel: string;           // "M% to next tier" or "On track"
}

function fmtCAD(v: number) {
  return `$${v.toLocaleString("en-CA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/**
 * ProToolsPersonalStrip — single-line summary band for signed-in Pro users.
 *
 * Calls three Pro endpoints in parallel. If any fails we hide the strip
 * entirely — better to show nothing than a misleading 0/0/0 row.
 */
export function ProToolsPersonalStrip({ sessionId, isReady }: Props) {
  const [data, setData] = useState<StripData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!isReady || !sessionId) return;
    let cancelled = false;
    setLoading(true);

    Promise.all([
      getMissedRewards(sessionId, { sinceDays: 30, top: 1 }),
      getCardCredits(sessionId),
      getSQCProjection(sessionId),
    ])
      .then(([missed, credits, sqc]) => {
        if (cancelled) return;

        const recoverable = Math.max(0, missed?.total_gap ?? 0);

        const expiringCount = credits.filter((c) => {
          if (c.status === "redeemed") return false;
          if (c.days_to_renewal == null) return false;
          return c.days_to_renewal >= 0 && c.days_to_renewal <= 90;
        }).length;

        let sqcLabel = "On track";
        if (sqc && !sqc.wallet_has_no_aeroplan_cards && sqc.tiers.length > 0) {
          const topRequired = sqc.tiers[sqc.tiers.length - 1].sqc_required;
          if (topRequired > 0) {
            const pct = Math.min(100, Math.round((sqc.total_sqc_earned / topRequired) * 100));
            sqcLabel = `${pct}% to next tier`;
          }
        }

        setData({ recoverable, expiringCount, sqcLabel });
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setHidden(true);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [sessionId, isReady]);

  if (hidden) return null;

  return (
    <section
      aria-label="Your Pro snapshot"
      style={{
        marginTop: 14,
        marginBottom: 18,
        border: "1px solid var(--rule)",
        borderRadius: 12,
        background: "var(--card-fill)",
        padding: "14px 18px",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 12,
        boxShadow: "var(--shadow-1)",
      }}
    >
      {loading || !data ? (
        <SkeletonRow />
      ) : (
        <>
          <StripItem
            eyebrow="Recoverable this month"
            value={fmtCAD(data.recoverable)}
            tone={data.recoverable > 0 ? "var(--loss)" : "var(--gain)"}
          />
          <StripItem
            eyebrow="Expiring credits"
            value={`${data.expiringCount} in 90 days`}
            tone={data.expiringCount > 0 ? "var(--accent)" : "var(--ink-2)"}
          />
          <StripItem
            eyebrow="Aeroplan SQC"
            value={data.sqcLabel}
            tone="var(--ink)"
          />
        </>
      )}
    </section>
  );
}

function StripItem({ eyebrow, value, tone }: { eyebrow: string; value: string; tone: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        className="eyebrow"
        style={{ fontSize: 9, letterSpacing: "0.14em", color: "var(--ink-3)", marginBottom: 4 }}
      >
        {eyebrow}
      </div>
      <div
        className="display"
        style={{
          fontSize: 18,
          fontStyle: "italic",
          color: tone,
          lineHeight: 1.1,
          letterSpacing: "-0.005em",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ minWidth: 0, flex: "1 1 160px" }}>
          <div
            style={{
              width: 90,
              height: 9,
              background: "var(--rule)",
              borderRadius: 4,
              marginBottom: 6,
              opacity: 0.6,
            }}
          />
          <div
            style={{
              width: 130,
              height: 18,
              background: "var(--rule)",
              borderRadius: 4,
              opacity: 0.45,
            }}
          />
        </div>
      ))}
    </>
  );
}
