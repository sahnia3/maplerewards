"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "@/contexts/session-context";
import { searchAwards } from "@/lib/api";
import type { AwardSearchResult } from "@/lib/api";
import { PageMasthead } from "@/components/editorial/page-masthead";
import { FlightArc } from "@/components/editorial/flight-arc";
import { LeafDivider } from "@/components/editorial/leaf-divider";

const POPULAR = [
  { o: "YYZ", d: "LHR", note: "London — overnight" },
  { o: "YYZ", d: "NRT", note: "Tokyo — Aeroplan sweet spot" },
  { o: "YVR", d: "HNL", note: "Honolulu — short-haul J" },
  { o: "YUL", d: "CDG", note: "Paris — Air France direct" },
  { o: "YYZ", d: "DXB", note: "Dubai — Emirates partners" },
];

const CABIN_OPTIONS: { value: "economy" | "business" | "first"; label: string }[] = [
  { value: "economy", label: "Economy" },
  { value: "business", label: "Business" },
  { value: "first", label: "First" },
];

const TODAY = new Date().toISOString().split("T")[0];

export default function TripPlannerPage() {
  const { ensureSession } = useSession();

  const [origin, setOrigin] = useState("YYZ");
  const [destination, setDestination] = useState("CDG");
  const [date, setDate] = useState("");
  const [flexDays, setFlexDays] = useState<0 | 7 | 14>(7);
  const [cabin, setCabin] = useState<"economy" | "business" | "first">("business");
  const [passengers, setPassengers] = useState(1);
  const [results, setResults] = useState<AwardSearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function search() {
    setErr(null);
    if (!origin || !destination || !date) {
      setErr("Origin, destination, and date are required.");
      return;
    }
    setLoading(true);
    try {
      const sid = await ensureSession();
      const res = await searchAwards({
        session_id: sid,
        origin: origin.toUpperCase(),
        destination: destination.toUpperCase(),
        date,
        flex_days: flexDays,
        cabin,
        passengers,
      });
      // Mirror the backend's diversity cap (capWithDiversity from
      // internal/service/ai_tools.go) on the client so the user sees a
      // representative set of programs instead of 12 rows of one issuer.
      // Same algorithm: take up to 2 results per program in CPP order, then
      // fill the remaining slots with the next-best CPP. Total 12.
      setResults(capWithDiversity(res, 12, 2));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  // Frontend mirror of capWithDiversity. Rules:
  //   1. Input is already CPP-sorted by the backend.
  //   2. Pass 1: keep up to perProgram per program slug (in input order).
  //   3. Pass 2: fill remaining total slots with the highest-CPP residue.
  function capWithDiversity(
    items: AwardSearchResult[],
    total: number,
    perProgram: number,
  ): AwardSearchResult[] {
    if (items.length <= total) return items;
    const out: AwardSearchResult[] = [];
    const counts = new Map<string, number>();
    for (const r of items) {
      if (out.length >= total) break;
      const c = counts.get(r.program) ?? 0;
      if (c < perProgram) {
        out.push(r);
        counts.set(r.program, c + 1);
      }
    }
    for (const r of items) {
      if (out.length >= total) break;
      const dup = out.find(
        (k) => k.program === r.program && k.date === r.date && k.points_cost === r.points_cost,
      );
      if (!dup) out.push(r);
    }
    return out;
  }

  return (
    <div className="reveal" style={{ paddingTop: 0 }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px clamp(20px, 4vw, 60px) 80px" }}>
        <PageMasthead
          eyebrow="Redemption desk"
          eyebrowEnd="Live award space · CAD"
          title={
            <>
              Plan the next{" "}
              <span style={{ fontStyle: "italic", color: "var(--accent)" }}>great</span> redemption.
            </>
          }
          lede="Cash, transfer partners, or award space — Maple ranks every option for the route you're flying."
        />

        {/* ── Itinerary card ─────────────────────────────────────────── */}
        <section
          style={{
            border: "1px solid var(--rule)",
            borderRadius: 16,
            background: "var(--card-fill-strong)",
            padding: "clamp(20px, 2.5vw, 32px)",
            marginBottom: 28,
            position: "relative",
            overflow: "hidden",
            boxShadow: "var(--shadow-1)",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto 1fr",
              alignItems: "end",
              gap: 18,
              flexWrap: "wrap" as never,
            }}
            className="trip-itinerary-grid"
          >
            <div>
              <div className="eyebrow" style={{ marginBottom: 10 }}>From</div>
              <input
                value={origin}
                onChange={(e) => setOrigin(e.target.value.toUpperCase())}
                placeholder="YYZ"
                maxLength={3}
                style={{
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  fontFamily: "var(--font-display)",
                  fontSize: "clamp(36px, 5vw, 48px)",
                  letterSpacing: "0.02em",
                  color: "var(--ink)",
                  padding: 0,
                }}
              />
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.06em" }}>
                Origin airport
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 12 }}>
              <svg width="44" height="22" viewBox="0 0 40 20" fill="none" aria-hidden>
                <path d="M2 10 L36 10 M30 4 L36 10 L30 16" stroke="var(--accent)" strokeWidth="1.4" />
              </svg>
            </div>

            <div>
              <div className="eyebrow" style={{ marginBottom: 10 }}>To</div>
              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value.toUpperCase())}
                placeholder="CDG"
                maxLength={3}
                style={{
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  fontFamily: "var(--font-display)",
                  fontSize: "clamp(36px, 5vw, 48px)",
                  letterSpacing: "0.02em",
                  color: "var(--ink)",
                  padding: 0,
                }}
              />
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.06em" }}>
                Destination airport
              </div>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 14,
              marginTop: 26,
              paddingTop: 22,
              borderTop: "1px solid var(--rule)",
            }}
          >
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Departure</div>
              <input
                type="date"
                value={date}
                min={TODAY}
                onChange={(e) => setDate(e.target.value)}
                className="mono"
                style={{
                  width: "100%",
                  height: 42,
                  background: "var(--surface)",
                  border: "1px solid var(--rule)",
                  borderRadius: 8,
                  padding: "0 12px",
                  outline: "none",
                  fontSize: 13,
                  color: "var(--ink)",
                }}
              />
            </div>
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Flex window</div>
              <div style={{ display: "flex", border: "1px solid var(--rule)", borderRadius: 8, overflow: "hidden", height: 42 }}>
                {([0, 7, 14] as const).map((d, i) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setFlexDays(d)}
                    className="mono"
                    style={{
                      flex: 1,
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      background: flexDays === d ? "var(--ink)" : "transparent",
                      color: flexDays === d ? "var(--paper)" : "var(--ink-3)",
                      border: "none",
                      borderLeft: i > 0 ? "1px solid var(--rule)" : "none",
                      cursor: "pointer",
                    }}
                  >
                    {d === 0 ? "Exact" : `± ${d}d`}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Cabin</div>
              <div style={{ display: "flex", border: "1px solid var(--rule)", borderRadius: 8, overflow: "hidden", height: 42 }}>
                {CABIN_OPTIONS.map((c, i) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setCabin(c.value)}
                    className="mono"
                    style={{
                      flex: 1,
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      background: cabin === c.value ? "var(--ink)" : "transparent",
                      color: cabin === c.value ? "var(--paper)" : "var(--ink-3)",
                      border: "none",
                      borderLeft: i > 0 ? "1px solid var(--rule)" : "none",
                      cursor: "pointer",
                    }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Passengers</div>
              <div style={{ display: "flex", alignItems: "center", border: "1px solid var(--rule)", borderRadius: 8, height: 42, overflow: "hidden" }}>
                <button
                  type="button"
                  onClick={() => setPassengers(Math.max(1, passengers - 1))}
                  className="mono"
                  style={{
                    width: 42,
                    height: "100%",
                    border: "none",
                    background: "transparent",
                    color: "var(--ink-3)",
                    fontSize: 18,
                    cursor: "pointer",
                  }}
                >
                  −
                </button>
                <div className="display" style={{ flex: 1, textAlign: "center", fontSize: 22, color: "var(--ink)" }}>
                  {passengers}
                </div>
                <button
                  type="button"
                  onClick={() => setPassengers(Math.min(9, passengers + 1))}
                  className="mono"
                  style={{
                    width: 42,
                    height: "100%",
                    border: "none",
                    background: "transparent",
                    color: "var(--ink-3)",
                    fontSize: 18,
                    cursor: "pointer",
                  }}
                >
                  +
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={search}
              disabled={loading}
              className="mono"
              style={{
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                height: 42,
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                cursor: loading ? "default" : "pointer",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "Searching…" : "Find awards →"}
            </button>
          </div>

          {err && (
            <div
              className="mono"
              style={{
                marginTop: 12,
                fontSize: 11,
                color: "var(--accent)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              ⚠ {err}
            </div>
          )}
        </section>

        {/* ── Popular routes ─────────────────────────────────────────── */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 32 }}>
          <span className="eyebrow" style={{ alignSelf: "center", marginRight: 6 }}>Popular</span>
          {POPULAR.map((p) => (
            <button
              key={`${p.o}-${p.d}`}
              type="button"
              onClick={() => {
                setOrigin(p.o);
                setDestination(p.d);
              }}
              className="mono"
              style={{
                background: "transparent",
                border: "1px solid var(--rule)",
                borderRadius: 999,
                padding: "6px 12px",
                fontSize: 11,
                color: "var(--ink-2)",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              {p.o} → {p.d}
            </button>
          ))}
        </div>

        {/* ── FlightArc visual ───────────────────────────────────────── */}
        <div
          style={{
            height: 240,
            borderTop: "1px solid var(--rule)",
            borderBottom: "1px solid var(--rule)",
            position: "relative",
            overflow: "hidden",
            marginBottom: 32,
          }}
        >
          <FlightArc origin={origin} destination={destination} />
        </div>

        {/* ── Results ────────────────────────────────────────────────── */}
        {results === null ? (
          <div style={{ padding: "32px 0", textAlign: "center" }}>
            <span className="eyebrow">Run a search</span>
            <p
              className="serif"
              style={{
                fontStyle: "italic",
                color: "var(--ink-2)",
                marginTop: 8,
                fontSize: 16,
              }}
            >
              Pick a date and cabin, hit <span className="mono" style={{ fontStyle: "normal" }}>FIND AWARDS</span>.
            </p>
          </div>
        ) : results.length === 0 ? (
          <div style={{ padding: "32px 0", textAlign: "center" }}>
            <span className="eyebrow">No availability</span>
            <p className="serif" style={{ fontStyle: "italic", color: "var(--ink-2)", marginTop: 8, fontSize: 16 }}>
              Try a different date or cabin.
            </p>
          </div>
        ) : (
          <>
            <div className="eyebrow" style={{ marginBottom: 14 }}>
              {results.length} option{results.length === 1 ? "" : "s"} · best on {results[0]?.program_name}
            </div>
            <div style={{ borderTop: "1px solid var(--ink)" }}>
              {results.map((f, i) => (
                <FlightRow key={`${f.program}-${i}`} flight={f} index={i} />
              ))}
            </div>
          </>
        )}

        <LeafDivider />

        <p
          className="serif"
          style={{
            fontStyle: "italic",
            fontSize: 13,
            color: "var(--ink-3)",
            textAlign: "center",
            marginTop: 24,
          }}
        >
          Live award seats from Apify scrapers and Seats.aero · cash prices from Google Flights.
          <br />
          <Link href="/cards" style={{ color: "var(--accent)", textDecoration: "none" }}>
            See all cards in your wallet
          </Link>{" "}
          · or{" "}
          <Link href="/portfolio" style={{ color: "var(--accent)", textDecoration: "none" }}>
            check redemption value
          </Link>
          .
        </p>
      </div>
      <style jsx global>{`
        /* Mobile: collapse the 5-column flight row to 2 columns so the price
         * + CPP cluster wraps below the program name instead of overflowing
         * the viewport. Threshold 720px catches phones + small tablets. */
        @media (max-width: 720px) {
          .flight-row {
            grid-template-columns: 36px 1fr !important;
            row-gap: 8px;
          }
          .flight-row > :nth-child(3),
          .flight-row > :nth-child(4),
          .flight-row > :nth-child(5) {
            grid-column: 2;
            text-align: left !important;
          }
        }
      `}</style>
    </div>
  );
}

/* ── FlightRow ────────────────────────────────────────────────────────── */
function FlightRow({ flight, index }: { flight: AwardSearchResult; index: number }) {
  const isBest = index === 0;
  // Desktop: 5-column grid (40px | 1fr | 130 | 130 | 110) ≈ 410px fixed-width
  // forced overflow on mobile. New layout: stack identity + numbers vertically
  // below 720px viewport via the flight-row class media query at the bottom
  // of this file. The inline style keeps the desktop grid; the @media block
  // collapses it to 2-column for mobile so each row stays in one screenful.
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "40px 1fr 130px 130px 110px",
        alignItems: "center",
        gap: 18,
        padding: "20px 4px",
        borderTop: "1px solid var(--rule)",
        background: isBest ? "var(--card-fill)" : "transparent",
      }}
      className="flight-row"
    >
      <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.10em" }}>
        {String(index + 1).padStart(2, "0")}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="display" style={{ fontSize: 20, lineHeight: 1.05, color: "var(--ink)" }}>
          {flight.program_name}
          {isBest && (
            <span
              className="mono"
              style={{
                fontSize: 9,
                marginLeft: 10,
                padding: "2px 8px",
                borderRadius: 999,
                background: "var(--accent)",
                color: "#fff",
                letterSpacing: "0.14em",
                verticalAlign: "middle",
              }}
            >
              BEST
            </span>
          )}
        </div>
        <div className="serif" style={{ fontSize: 13, color: "var(--ink-3)", fontStyle: "italic", marginTop: 2 }}>
          {flight.segments?.[0]?.airline ?? "Live award"}
          {flight.seats_available > 0 && (
            <> · <span className="mono" style={{ fontStyle: "normal" }}>{flight.seats_available} seat{flight.seats_available === 1 ? "" : "s"}</span></>
          )}
          {flight.source === "live" && (
            <span className="mono" style={{ marginLeft: 10, color: "var(--gain)", fontStyle: "normal", fontSize: 10 }}>● live</span>
          )}
        </div>
      </div>
      <div className="mono" style={{ fontSize: 13, color: "var(--ink-2)", textAlign: "right", letterSpacing: "0.04em" }}>
        {flight.points_cost.toLocaleString()} pts
      </div>
      <div className="mono" style={{ fontSize: 13, color: "var(--ink-3)", textAlign: "right" }}>
        ${flight.cash_price_cad.toFixed(0)} cash
      </div>
      <div style={{ textAlign: "right" }}>
        <div className="display" style={{ fontSize: 22, color: "var(--ink)", fontStyle: "italic" }}>
          {flight.cpp.toFixed(2)}¢
        </div>
        <div
          className="mono"
          style={{
            fontSize: 9,
            color:
              flight.value_rating === "excellent"
                ? "var(--gain)"
                : flight.value_rating === "good"
                  ? "var(--ink-2)"
                  : "var(--accent)",
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            marginTop: 2,
          }}
        >
          {flight.value_rating || "value"}
        </div>
      </div>
    </div>
  );
}
