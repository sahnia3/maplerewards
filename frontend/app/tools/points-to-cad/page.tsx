"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { listPrograms } from "@/lib/api";
import type { LoyaltyProgram } from "@/lib/types";
import { PageMasthead } from "@/components/editorial/page-masthead";
import { LeafDivider } from "@/components/editorial/leaf-divider";

/**
 * /tools/points-to-cad — public utility.
 *
 * Pick a Canadian loyalty program + an amount of points → instant CAD value
 * at the program's base CPP. Lightweight wedge to drive organic discovery
 * (people search "what are my Aeroplan points worth"), and a soft CTA into
 * the Pro wallet experience.
 */
export default function PointsToCADPage() {
  const [programs, setPrograms] = useState<LoyaltyProgram[]>([]);
  const [slug, setSlug] = useState<string>("aeroplan");
  const [points, setPoints] = useState<string>("50000");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    listPrograms()
      .then((p) => {
        // Sort by name for stable dropdown UX
        const sorted = [...p].sort((a, b) => a.name.localeCompare(b.name));
        setPrograms(sorted);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load programs"));
  }, []);

  const selected = useMemo(
    () => programs.find((p) => p.slug === slug),
    [programs, slug],
  );

  const pointsNumeric = useMemo(() => {
    const n = parseInt(points.replace(/[^0-9]/g, ""), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [points]);

  const cppCents = selected?.base_cpp ?? 0;
  const cad = (pointsNumeric * cppCents) / 100;

  return (
    <div className="reveal" style={{ paddingTop: 0 }}>
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "32px clamp(20px, 4vw, 60px) 80px",
        }}
      >
        <PageMasthead
          eyebrow="Free utility"
          eyebrowEnd="Points → CAD"
          title={
            <>
              What are your <span style={{ fontStyle: "italic" }}>points</span>{" "}
              worth?
            </>
          }
          lede="Pick a program, enter a balance, see the CAD value at the program's base CPP. The conversion ratio updates as our pricing engine re-values the program — no stale numbers."
        />

        <LeafDivider />

        {err && <p style={{ color: "var(--accent)", marginBottom: 16 }}>{err}</p>}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            marginBottom: 24,
          }}
          className="converter-grid"
        >
          <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span className="eyebrow">Program</span>
            <select
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="input-maple"
              style={{
                padding: "12px 14px",
                fontFamily: "var(--font-jetbrains-mono)",
                fontSize: 14,
                borderRadius: 8,
              }}
            >
              {programs.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span className="eyebrow">Points balance</span>
            <input
              type="text"
              inputMode="numeric"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              className="input-maple"
              style={{
                padding: "12px 14px",
                fontFamily: "var(--font-jetbrains-mono)",
                fontSize: 14,
                borderRadius: 8,
              }}
              placeholder="50000"
            />
          </label>
        </div>

        <section
          style={{
            border: "1px solid var(--rule)",
            borderRadius: 12,
            padding: "28px 32px",
            background: "var(--paper)",
            marginBottom: 24,
          }}
        >
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Estimated value
          </div>
          <div
            className="display"
            style={{
              fontSize: "clamp(40px, 6vw, 60px)",
              lineHeight: 1.05,
              marginBottom: 12,
            }}
          >
            ${cad.toFixed(2)}{" "}
            <span style={{ fontSize: "0.5em", color: "var(--ink-3)" }}>CAD</span>
          </div>
          <div
            style={{
              fontSize: 13,
              color: "var(--ink-3)",
              lineHeight: 1.5,
            }}
          >
            {pointsNumeric.toLocaleString()} {selected?.currency_name ?? "points"}{" "}
            at <strong>{cppCents.toFixed(2)}¢</strong> per point.
            {selected && (
              <>
                {" "}
                The base CPP reflects everyday redemptions; transferring to a
                premium partner can push this number 2–3×.
              </>
            )}
          </div>
        </section>

        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <Link
            href="/onboarding"
            className="mono"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "14px 22px",
              borderRadius: 10,
              background: "var(--accent)",
              color: "#fff",
              textDecoration: "none",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            Track all my balances →
          </Link>
          <Link
            href={selected ? `/loyalty/${selected.slug}` : "/loyalty"}
            className="mono"
            style={{
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--accent)",
              textDecoration: "none",
            }}
          >
            {selected?.name ?? "Program"} details →
          </Link>
        </div>
      </div>
    </div>
  );
}
