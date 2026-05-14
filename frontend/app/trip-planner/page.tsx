"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/contexts/session-context";
import { useAuth } from "@/contexts/auth-context";
import {
  createAwardWatch,
  searchAwards,
  type AwardSearchResult,
} from "@/lib/api";
import { PageMasthead } from "@/components/editorial/page-masthead";
import { FlightArc } from "@/components/editorial/flight-arc";
import { LeafDivider } from "@/components/editorial/leaf-divider";
import { EmptyState } from "@/components/editorial/EmptyState";
import { Plane, AlertTriangle } from "lucide-react";
import { SourceBadge } from "@/components/trip-planner/SourceBadge";
import { SegmentDetails } from "@/components/trip-planner/SegmentDetails";
import { WalletAffordPill } from "@/components/trip-planner/WalletAffordPill";
import { LoadingPills } from "@/components/trip-planner/LoadingPills";

const POPULAR = [
  { o: "YYZ", d: "LHR", note: "London, overnight" },
  { o: "YYZ", d: "NRT", note: "Tokyo, Aeroplan sweet spot" },
  { o: "YVR", d: "HNL", note: "Honolulu, short-haul J" },
  { o: "YUL", d: "CDG", note: "Paris, Air France direct" },
  { o: "YYZ", d: "DXB", note: "Dubai, Emirates partners" },
];

const CABIN_OPTIONS: { value: "economy" | "business" | "first"; label: string }[] = [
  { value: "economy", label: "Economy" },
  { value: "business", label: "Business" },
  { value: "first", label: "First" },
];

const TODAY = new Date().toISOString().split("T")[0];

type Cabin = "economy" | "business" | "first";

function parseCabin(v: string | null): Cabin {
  return v === "economy" || v === "first" ? v : "business";
}

function parseFlex(v: string | null): 0 | 7 | 14 {
  const n = Number(v ?? 7);
  return n === 0 || n === 14 ? n : 7;
}

function parsePax(v: string | null): number {
  const n = Number(v ?? 1);
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > 9) return 9;
  return Math.floor(n);
}

export default function TripPlannerPage() {
  return (
    <Suspense fallback={null}>
      <TripPlannerInner />
    </Suspense>
  );
}

function TripPlannerInner() {
  const { ensureSession, sessionId } = useSession();
  const { user, isPro } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── Form state hydrated from URL on mount ────────────────────────────────
  const [origin, setOrigin] = useState(() =>
    (searchParams.get("origin") ?? "YYZ").toUpperCase(),
  );
  const [destination, setDestination] = useState(() =>
    (searchParams.get("dest") ?? "CDG").toUpperCase(),
  );
  const [date, setDate] = useState(() => searchParams.get("date") ?? "");
  const [returnDate, setReturnDate] = useState(() => searchParams.get("ret") ?? "");
  const [flexDays, setFlexDays] = useState<0 | 7 | 14>(() => parseFlex(searchParams.get("flex")));
  const [cabin, setCabin] = useState<Cabin>(() => parseCabin(searchParams.get("cabin")));
  const [passengers, setPassengers] = useState(() => parsePax(searchParams.get("pax")));

  const [results, setResults] = useState<AwardSearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const hasWallet = Boolean(user || sessionId);
  const isRoundTrip = Boolean(returnDate);

  /* Persist form state to the querystring so a user can share or bookmark a
   * search. Uses router.replace (not push) so the back button stays useful.
   * Skipped on the initial mount via the ref guard. */
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    const qs = new URLSearchParams();
    if (origin) qs.set("origin", origin);
    if (destination) qs.set("dest", destination);
    if (date) qs.set("date", date);
    if (returnDate) qs.set("ret", returnDate);
    if (flexDays !== 7) qs.set("flex", String(flexDays));
    if (cabin !== "business") qs.set("cabin", cabin);
    if (passengers !== 1) qs.set("pax", String(passengers));
    const tail = qs.toString();
    router.replace(tail ? `/trip-planner?${tail}` : "/trip-planner", { scroll: false });
  }, [origin, destination, date, returnDate, flexDays, cabin, passengers, router]);

  const search = useCallback(async () => {
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
        outbound_date: date,
        return_date: returnDate || undefined,
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
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, [origin, destination, date, returnDate, flexDays, cabin, passengers, ensureSession]);

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

  const submitLabel = useMemo(
    () => (loading ? "Searching…" : isRoundTrip ? "Search round-trip →" : "Find awards →"),
    [loading, isRoundTrip],
  );

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
          lede="Cash, transfer partners, or award space. Maple ranks every option for the route you're flying."
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
              <div className="eyebrow" style={{ marginBottom: 6 }}>Return (optional)</div>
              <input
                type="date"
                value={returnDate}
                min={date || TODAY}
                onChange={(e) => setReturnDate(e.target.value)}
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
              {submitLabel}
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
        {loading ? (
          <div style={{ padding: "32px 0", textAlign: "center" }}>
            <span className="eyebrow">Searching live award space</span>
            <p
              className="serif"
              style={{
                fontStyle: "italic",
                color: "var(--ink-2)",
                marginTop: 8,
                fontSize: 16,
              }}
            >
              Polling Aeroplan, United, Avios plus 5 partners. This usually takes 30 to 90 seconds.
            </p>
            <LoadingPills />
          </div>
        ) : err ? (
          <EmptyState
            icon={AlertTriangle}
            title="Search hit a snag"
            body="The pricing layer didn't respond. Try again, or ask the AI assistant to find live award space for you."
            action={{ label: "Open assistant", href: "/chat" }}
          />
        ) : results === null ? (
          <EmptyState
            icon={Plane}
            title="Plan your next redemption"
            body="Pick a date and cabin, then run a search. Maple compares cash, transfer partners, and award space side by side."
            action={{
              label: "Try YYZ → LHR",
              onClick: () => {
                setOrigin("YYZ");
                setDestination("LHR");
                setDate(TODAY);
                setCabin("business");
              },
            }}
          />
        ) : results.length === 0 ? (
          <EmptyState
            icon={Plane}
            title="No availability for these dates"
            body="Widen the flex window, try a different cabin, or have the AI assistant scan adjacent dates."
            action={{
              label: "Ask the assistant",
              href: `/chat?q=${encodeURIComponent(
                `Find ${cabin} award space ${origin} to ${destination} near ${date || "next 60 days"}`,
              )}`,
            }}
          />
        ) : (
          <>
            <div className="eyebrow" style={{ marginBottom: 14 }}>
              {results.length} option{results.length === 1 ? "" : "s"} · best on {results[0]?.program_name}
            </div>
            <div style={{ borderTop: "1px solid var(--ink)" }}>
              {results.map((f, i) => (
                <FlightRow
                  key={`${f.program}-${i}`}
                  flight={f}
                  index={i}
                  isAuthed={hasWallet}
                  isPro={isPro}
                  onSaveTrip={async () => {
                    if (!isPro) return;
                    try {
                      const sid = await ensureSession();
                      await createAwardWatch(sid, {
                        origin: origin.toUpperCase(),
                        destination: destination.toUpperCase(),
                        depart_date: f.date || date,
                        flex_days: flexDays,
                        cabin,
                        program_slug: f.program,
                      });
                    } catch (e) {
                      console.warn("save trip failed", e);
                    }
                  }}
                />
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
          Live award seats from Apify scrapers and Seats.aero. Cash prices from Google Flights.
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
        @keyframes tp-pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
        @keyframes tp-blink {
          0%, 100% { opacity: 0.25; }
          50% { opacity: 1; }
        }
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
function FlightRow({
  flight,
  index,
  isAuthed,
  isPro,
  onSaveTrip,
}: {
  flight: AwardSearchResult;
  index: number;
  isAuthed: boolean;
  isPro: boolean;
  onSaveTrip: () => void;
}) {
  const [saved, setSaved] = useState(false);
  const isBest = index === 0;

  const taxesNode = (() => {
    if (flight.taxes_cash != null && flight.taxes_included) {
      return (
        <span className="mono" style={{ color: "var(--ink-3)" }}>
          + ${flight.taxes_cash.toFixed(0)} taxes
        </span>
      );
    }
    return (
      <span className="mono" style={{ color: "var(--ink-3)", opacity: 0.7 }}>
        taxes/fees not included
      </span>
    );
  })();

  return (
    <div
      style={{
        borderTop: "1px solid var(--rule)",
        background: isBest ? "var(--card-fill)" : "transparent",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "40px 1fr 130px 130px 110px",
          alignItems: "center",
          gap: 18,
          padding: "20px 4px",
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
          <div
            className="serif"
            style={{
              fontSize: 13,
              color: "var(--ink-3)",
              fontStyle: "italic",
              marginTop: 2,
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <span>{flight.segments?.[0]?.airline ?? "Live award"}</span>
            {flight.seats_available > 0 && (
              <span className="mono" style={{ fontStyle: "normal" }}>
                · {flight.seats_available} seat{flight.seats_available === 1 ? "" : "s"}
              </span>
            )}
            <SourceBadge
              source={flight.source}
              label={flight.source_label}
              fetchedAt={flight.fetched_at}
            />
          </div>
          <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <WalletAffordPill
              show={isAuthed}
              canAfford={flight.can_afford}
              pointsCost={flight.points_cost}
              pointsAvailable={flight.points_available}
              bestTransferPartner={flight.best_transfer_partner}
            />
            {isPro ? (
              <button
                type="button"
                onClick={() => {
                  if (saved) return;
                  setSaved(true);
                  onSaveTrip();
                }}
                className="mono"
                style={{
                  fontSize: 9,
                  padding: "3px 9px",
                  borderRadius: 999,
                  background: saved ? "var(--surface-2)" : "transparent",
                  color: saved ? "var(--ink-3)" : "var(--ink-2)",
                  border: "1px solid var(--rule)",
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                  cursor: saved ? "default" : "pointer",
                }}
              >
                {saved ? "Saved" : "Save trip"}
              </button>
            ) : (
              <span
                className="mono"
                title="Pro members get saved-trip alerts when award space opens up."
                style={{
                  fontSize: 9,
                  padding: "3px 9px",
                  borderRadius: 999,
                  background: "transparent",
                  color: "var(--ink-3)",
                  border: "1px dashed var(--rule)",
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                }}
              >
                Save trip · Pro
              </span>
            )}
          </div>
        </div>
        <div className="mono" style={{ fontSize: 13, color: "var(--ink-2)", textAlign: "right", letterSpacing: "0.04em" }}>
          {flight.points_cost.toLocaleString()} pts
          <div style={{ fontSize: 10, marginTop: 2 }}>{taxesNode}</div>
        </div>
        <div className="mono" style={{ fontSize: 13, color: "var(--ink-3)", textAlign: "right" }}>
          ${flight.cash_price_cad.toFixed(0)} cash
          <div
            className="serif"
            style={{
              fontSize: 9,
              color: "var(--ink-3)",
              fontStyle: "italic",
              marginTop: 2,
              opacity: 0.7,
            }}
          >
            vs {flight.cabin ?? "cabin"} cash
          </div>
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
          {flight.return_leg && (
            <div className="mono" style={{ fontSize: 9, color: "var(--ink-3)", marginTop: 4 }}>
              RT · {flight.return_leg.cpp.toFixed(2)}¢
            </div>
          )}
          {flight.booking_url && (
            <a
              href={flight.booking_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mono"
              style={{
                display: "inline-block",
                marginTop: 8,
                fontSize: 10,
                padding: "4px 10px",
                borderRadius: 999,
                background: "var(--accent)",
                color: "var(--paper)",
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                textDecoration: "none",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
              title={`Open ${flight.program} award search in a new tab`}
            >
              Book ↗
            </a>
          )}
        </div>
      </div>

      {/* Segment detail expansion. Sits below the main row so the grid layout
       * stays clean. Outbound first, then return leg if present. */}
      <div style={{ padding: "0 4px 16px" }}>
        <SegmentDetails
          segments={flight.segments ?? []}
          legLabel={flight.return_leg ? "Outbound" : undefined}
        />
        {flight.return_leg && (
          <SegmentDetails segments={flight.return_leg.segments ?? []} legLabel="Return" />
        )}
      </div>
    </div>
  );
}
