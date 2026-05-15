"use client";

import { useEffect, useState } from "react";
import { getEligibility, type EligibilityResult } from "@/lib/api";

interface Props {
  sessionId: string | null;
  cardId: string;
}

/**
 * EligibilityChip shows the user's current eligibility for applying to a card,
 * based on per-issuer cooldown rules (RBC 90d, TD 365d, etc.). Hidden when
 * the user isn't authenticated (no session_id) since there's nothing to check.
 */
export function EligibilityChip({ sessionId, cardId }: Props) {
  const [data, setData] = useState<EligibilityResult | null>(null);

  useEffect(() => {
    if (!sessionId || !cardId) return;
    let cancelled = false;
    getEligibility(sessionId, cardId)
      .then((res) => { if (!cancelled) setData(res); })
      .catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
  }, [sessionId, cardId]);

  if (!sessionId || !data) return null;

  const tone =
    data.severity === "warn" ? "var(--accent)" :
    data.severity === "unknown" ? "var(--ink-3)" :
    "var(--gain)";

  const label =
    data.severity === "warn" ? "Cooldown active" :
    data.severity === "unknown" ? "No rule on file" :
    "Eligible to apply";

  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        gap: 4,
        padding: "10px 14px",
        border: `1px solid ${tone}`,
        borderRadius: 10,
        background: "var(--surface)",
        maxWidth: 420,
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 10,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: tone,
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        className="serif"
        style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.4, fontStyle: "italic" }}
      >
        {data.reason}
      </div>
    </div>
  );
}
