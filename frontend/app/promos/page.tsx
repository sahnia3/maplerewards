"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getActiveTransferPromos, type TransferBonusEvent } from "@/lib/api";
import { PageMasthead } from "@/components/editorial/page-masthead";
import { LeafDivider } from "@/components/editorial/leaf-divider";

/**
 * /promos — Active transfer-bonus promotions detected by the Promo Sentinel.
 *
 * Public page. The list itself is free; the per-user "this is worth $X to
 * you" math happens server-side for Pro users via the AI assistant tool.
 */
export default function PromosPage() {
  const [promos, setPromos] = useState<TransferBonusEvent[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getActiveTransferPromos()
      .then((list) => setPromos(list))
      .catch((e) => setErr(e?.message ?? "Could not load promos"));
  }, []);

  return (
    <div className="reveal" style={{ paddingTop: 0 }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px clamp(20px, 4vw, 60px) 80px" }}>
        <PageMasthead
          eyebrow="Promo Sentinel"
          eyebrowEnd={promos ? `${promos.length} active` : "scanning"}
          title={
            <>
              The <span style={{ fontStyle: "italic" }}>active</span> transfer
              bonuses.
            </>
          }
          lede="Live-detected transfer-bonus promotions across Canadian rewards programs. Updated every 12 hours from a curated set of rewards-news sources."
        />

        <LeafDivider />

        {err && (
          <p style={{ color: "var(--accent)", marginBottom: 16 }}>{err}</p>
        )}

        {!promos && !err && (
          <p className="eyebrow" style={{ color: "var(--ink-3)" }}>
            LOADING ACTIVE PROMOS…
          </p>
        )}

        {promos && promos.length === 0 && (
          <p style={{ color: "var(--ink-2)", fontStyle: "italic", padding: 24 }}>
            No active transfer-bonus promotions detected right now. Check back
            in a few hours — the Sentinel sweeps every 12h.
          </p>
        )}

        {promos && promos.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: 16,
            }}
          >
            {promos.map((p) => (
              <PromoCard key={p.id} promo={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PromoCard({ promo }: { promo: TransferBonusEvent }) {
  const expires = promo.expires_at ? new Date(promo.expires_at) : null;
  const daysLeft =
    expires !== null
      ? Math.max(0, Math.ceil((expires.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : null;
  return (
    <article
      style={{
        border: "1px solid var(--rule)",
        borderRadius: 12,
        padding: 22,
        background: "var(--paper)",
      }}
    >
      <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 8 }}>
        +{promo.bonus_percent.toFixed(0)}% BONUS
      </div>
      <div className="display" style={{ fontSize: 22, lineHeight: 1.2, marginBottom: 10 }}>
        {prettySlug(promo.from_program)}{" "}
        <span style={{ color: "var(--ink-3)" }}>→</span>{" "}
        {prettySlug(promo.to_program)}
      </div>
      {promo.summary && (
        <p
          className="serif"
          style={{
            fontSize: 13,
            color: "var(--ink-2)",
            lineHeight: 1.45,
            marginBottom: 14,
          }}
        >
          {promo.summary}
        </p>
      )}
      <div
        style={{
          display: "flex",
          gap: 12,
          fontSize: 11,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--ink-3)",
          marginBottom: 12,
        }}
        className="mono"
      >
        {daysLeft !== null && (
          <span>{daysLeft === 0 ? "ENDS TODAY" : `${daysLeft}D LEFT`}</span>
        )}
        {!daysLeft && !expires && <span>ONGOING</span>}
      </div>
      <Link
        href={promo.source_url}
        target="_blank"
        rel="noopener noreferrer"
        className="mono"
        style={{
          fontSize: 11,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--accent)",
          textDecoration: "none",
        }}
      >
        Source →
      </Link>
    </article>
  );
}

function prettySlug(slug: string): string {
  // Map common slugs to display names; fall back to title-cased slug.
  const overrides: Record<string, string> = {
    "amex-mr-ca": "Amex MR (CA)",
    "amex-mr-canada": "Amex MR (CA)",
    aeroplan: "Aeroplan",
    "ba-avios": "BA Avios",
    "flying-blue": "Flying Blue",
    "marriott-bonvoy": "Marriott Bonvoy",
    "world-of-hyatt": "World of Hyatt",
    "rbc-avion": "RBC Avion",
    "cibc-aventura": "CIBC Aventura",
    "td-rewards": "TD Rewards",
    "bmo-rewards": "BMO Rewards",
    "scene-plus": "Scene+",
    "air-miles": "Air Miles",
  };
  if (overrides[slug]) return overrides[slug];
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
