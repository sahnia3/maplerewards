"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "@/contexts/session-context";
import { evaluateTrip, searchAwards } from "@/lib/api";
import type { RedemptionOption, CardContribution, AwardSearchResult } from "@/lib/api";
import { AnimatedSection, AnimatedList, AnimatedItem } from "@/components/ui/animated-list";
import { SkeletonCard } from "@/components/ui/skeleton";
import { EmptyResults } from "@/components/ui/empty-state";

// ── Static data ──────────────────────────────────────────────────────────────

const POPULAR_FLIGHTS = [
  { label: "YYZ → LHR", origin: "YYZ", dest: "LHR" },
  { label: "YYZ → NRT", origin: "YYZ", dest: "NRT" },
  { label: "YVR → HNL", origin: "YVR", dest: "HNL" },
  { label: "YUL → CDG", origin: "YUL", dest: "CDG" },
  { label: "YYZ → DXB", origin: "YYZ", dest: "DXB" },
];

const POPULAR_HOTELS = [
  { label: "Toronto", dest: "Toronto" },
  { label: "Paris", dest: "Paris" },
  { label: "London", dest: "London" },
  { label: "Dubai", dest: "Dubai" },
  { label: "Maldives", dest: "Maldives" },
];

const SUPPORTED_PROGRAMS = [
  { name: "Aeroplan", emoji: "✈️" },
  { name: "Amex MR", emoji: "💳" },
  { name: "Avios", emoji: "✈️" },
  { name: "Marriott", emoji: "🏨" },
  { name: "Hyatt", emoji: "🏨" },
  { name: "Hilton", emoji: "🏨" },
  { name: "IHG", emoji: "🏨" },
];

const CABIN_OPTIONS = [
  { value: "economy", label: "Economy", icon: "💺" },
  { value: "business", label: "Business", icon: "🥂" },
  { value: "first", label: "First", icon: "👑" },
] as const;

const ROOM_OPTIONS = [
  { value: "standard", label: "Standard", icon: "🛏" },
  { value: "deluxe", label: "Deluxe", icon: "✨" },
  { value: "suite", label: "Suite", icon: "👑" },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCAD(v: number) {
  return `$${v.toFixed(2)}`;
}

function fmtPoints(v: number) {
  return v.toLocaleString();
}

const TODAY = new Date().toISOString().split("T")[0];

// ── Main component ────────────────────────────────────────────────────────────

export default function TripPlannerPage() {
  const { ensureSession } = useSession();

  // Form state
  const [tripType, setTripType] = useState<"flight" | "hotel">("flight");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [cabin, setCabin] = useState<"economy" | "business" | "first">("economy");
  const [roomType, setRoomType] = useState<"standard" | "deluxe" | "suite">("standard");
  const [departureDate, setDepartureDate] = useState("");
  const [checkoutDate, setCheckoutDate] = useState("");
  const [passengers, setPassengers] = useState(1);
  const [rooms, setRooms] = useState(1);

  // Results state
  const [showMyCards, setShowMyCards] = useState(true);
  const [expandedBreakdowns, setExpandedBreakdowns] = useState<Set<number>>(new Set());
  const [results, setResults] = useState<RedemptionOption[] | null>(null);       // hotels
  const [awardResults, setAwardResults] = useState<AwardSearchResult[] | null>(null); // flights
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleBreakdown(idx: number) {
    setExpandedBreakdowns((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  }

  async function handleEvaluate(e: React.FormEvent) {
    e.preventDefault();
    if (tripType === "flight" && (!origin.trim() || !destination.trim())) {
      setError("Enter both origin and destination");
      return;
    }
    if (tripType === "hotel" && !destination.trim()) {
      setError("Enter a destination city");
      return;
    }
    if (tripType === "hotel" && (!departureDate || !checkoutDate)) {
      setError("Enter both check-in and checkout dates");
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const sid = await ensureSession();

      if (tripType === "flight") {
        // Single call to award search — Seats.aero + Amadeus return in ~3-5s
        const liveResults = await searchAwards({
          session_id: sid,
          origin: origin.trim().toUpperCase(),
          destination: destination.trim().toUpperCase(),
          date: departureDate,
          cabin: cabin as "economy" | "business" | "first",
          passengers: passengers || 1,
        });
        const options = liveResults ?? [];
        setAwardResults(options);
        setShowMyCards(false);
        setExpandedBreakdowns(new Set());
        setLoading(false);

        if (options.length === 0) {
          setError("No award availability found. Try a different date or route.");
        }
      } else {
        // ── Hotel evaluation (unchanged) ───────────────────────────────
        const raw = await evaluateTrip({
          session_id: sid,
          trip_type: tripType,
          origin: undefined,
          destination: destination.trim(),
          cabin: roomType,
          date: departureDate || undefined,
          checkout_date: checkoutDate || undefined,
          passengers: passengers || 1,
        });
        const options = raw ?? [];
        setResults(options);
        setShowMyCards(false);
        setExpandedBreakdowns(new Set());
        setLoading(false);
        if (options.length === 0) {
          setError("No redemption options found. Try a different destination or room type.");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  // Derive filtered results — hotels
  const filteredResults = results
    ? showMyCards
      ? results.filter((r) => r.can_afford)
      : results
    : null;

  // Derive filtered results — flights (award search)
  const filteredAwardResults = awardResults
    ? showMyCards
      ? awardResults.filter((r) => r.can_afford)
      : awardResults
    : null;

  const hasResultsButNoneAffordable =
    tripType === "hotel"
      ? !!(results && results.length > 0 && showMyCards && filteredResults && filteredResults.length === 0)
      : !!(awardResults && awardResults.length > 0 && showMyCards && filteredAwardResults && filteredAwardResults.length === 0);

  // Route summary for results header
  function routeSummary() {
    if (tripType === "flight") {
      return `${origin} → ${destination} · ${cabin.charAt(0).toUpperCase() + cabin.slice(1)}`;
    }
    const nights =
      departureDate && checkoutDate
        ? Math.max(
            1,
            Math.round(
              (new Date(checkoutDate).getTime() - new Date(departureDate).getTime()) /
                86400000
            )
          )
        : null;
    return [
      destination,
      roomType.charAt(0).toUpperCase() + roomType.slice(1),
      nights ? `${nights} night${nights !== 1 ? "s" : ""}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  // Savings rating badge
  function SavingsBadge({ rating }: { rating: RedemptionOption["savings_rating"] }) {
    if (!rating) return null;
    const styles: Record<
      string,
      { background: string; color: string; label: string }
    > = {
      good: {
        background: "rgba(16,185,129,0.15)",
        color: "#10B981",
        label: "Good",
      },
      fair: {
        background: "rgba(245,158,11,0.15)",
        color: "#F59E0B",
        label: "Fair",
      },
      bad: {
        background: "rgba(239,68,68,0.15)",
        color: "#EF4444",
        label: "Bad",
      },
    };
    const s = styles[rating];
    if (!s) return null;
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "2px 8px",
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 600,
          background: s.background,
          color: s.color,
        }}
      >
        ● {s.label}
      </span>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Ambient orbs */}
      <div
        className="orb w-[500px] h-[300px] top-[-80px] right-[-100px]"
        style={{
          background:
            "radial-gradient(ellipse, rgba(13,148,136,0.07) 0%, transparent 70%)",
        }}
      />
      <div
        className="orb w-[350px] h-[350px] top-[300px] left-[-80px]"
        style={{
          background:
            "radial-gradient(ellipse, rgba(13,148,136,0.05) 0%, transparent 70%)",
        }}
      />

      <div className="relative max-w-3xl mx-auto px-6 pt-8 pb-24">

        {/* ── SECTION 1: Hero Header ─────────────────────────────────────── */}
        <AnimatedSection className="mb-8">
          <p className="label-xs mb-1.5" style={{ color: "var(--text-tertiary)" }}>
            Redemption Calculator
          </p>
          <h1 className="title text-white mb-2">Travel</h1>
          <p className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
            Find the best ways to redeem your points for flights and hotels.
          </p>
        </AnimatedSection>

        {/* ── SECTION 2: Search Card ─────────────────────────────────────── */}
        <AnimatedSection delay={0.05}>
          <div
            className="rounded-xl p-6 mb-6"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-mid)",
              boxShadow: "var(--shadow-card)",
            }}
          >
            {/* Tab switcher */}
            <div
              className="flex rounded-xl overflow-hidden mb-6"
              style={{
                border: "1px solid var(--border-mid)",
                width: "fit-content",
              }}
            >
              {[
                { type: "flight" as const, label: "Flights", icon: "✈" },
                { type: "hotel" as const, label: "Hotels", icon: "🏨" },
              ].map((tab, i) => (
                <button
                  key={tab.type}
                  type="button"
                  onClick={() => {
                    setTripType(tab.type);
                    setResults(null);
                    setAwardResults(null);
                    setError(null);
                    setDestination("");
                    setOrigin("");
                  }}
                  style={{
                    padding: "8px 20px",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.15s",
                    background:
                      tripType === tab.type
                        ? "rgba(13,148,136,0.15)"
                        : "transparent",
                    color:
                      tripType === tab.type ? "#14B8A6" : "var(--text-tertiary)",
                    borderLeft:
                      i > 0 ? "1px solid var(--border-mid)" : "none",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span>{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleEvaluate}>
              {tripType === "flight" ? (
                <>
                  {/* Flight: Row 1 — Origin + Destination */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label
                        className="label-xs mb-2 block"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        Origin
                      </label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base pointer-events-none">
                          🛫
                        </span>
                        <input
                          type="text"
                          placeholder="e.g. YYZ"
                          value={origin}
                          onChange={(e) => setOrigin(e.target.value)}
                          className="w-full h-11 pl-10 pr-4 rounded-xl text-[14px] font-medium outline-none transition-all input-maple focus-ring"
                        />
                      </div>
                    </div>
                    <div>
                      <label
                        className="label-xs mb-2 block"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        Destination
                      </label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base pointer-events-none">
                          🛬
                        </span>
                        <input
                          type="text"
                          placeholder="e.g. LHR"
                          value={destination}
                          onChange={(e) => setDestination(e.target.value)}
                          className="w-full h-11 pl-10 pr-4 rounded-xl text-[14px] font-medium outline-none transition-all input-maple focus-ring"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Flight: Row 2 — Date, Passengers, Cabin */}
                  <div
                    className="flex flex-wrap items-end gap-4 mb-4"
                  >
                    <div style={{ flex: "1 1 150px" }}>
                      <label
                        className="label-xs mb-2 block"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        Departure
                      </label>
                      <input
                        type="date"
                        min={TODAY}
                        value={departureDate}
                        onChange={(e) => setDepartureDate(e.target.value)}
                        className="w-full h-11 px-3 rounded-xl text-[14px] font-medium outline-none transition-all input-maple focus-ring"
                        style={{ color: departureDate ? "white" : "var(--text-tertiary)" }}
                      />
                    </div>

                    <div>
                      <label
                        className="label-xs mb-2 block"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        Passengers
                      </label>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => setPassengers((p) => Math.max(1, p - 1))}
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 8,
                            background: "rgba(255,255,255,0.06)",
                            border: "1px solid var(--border-mid)",
                            color: "white",
                            cursor: "pointer",
                            fontSize: 16,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          -
                        </button>
                        <span
                          style={{
                            minWidth: 20,
                            textAlign: "center",
                            color: "white",
                            fontSize: 14,
                            fontWeight: 600,
                          }}
                        >
                          {passengers}
                        </span>
                        <button
                          type="button"
                          onClick={() => setPassengers((p) => Math.min(9, p + 1))}
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 8,
                            background: "rgba(255,255,255,0.06)",
                            border: "1px solid var(--border-mid)",
                            color: "white",
                            cursor: "pointer",
                            fontSize: 16,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          +
                        </button>
                        <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
                          pax
                        </span>
                      </div>
                    </div>

                    <div>
                      <label
                        className="label-xs mb-2 block"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        Cabin
                      </label>
                      <div
                        className="flex rounded-lg overflow-hidden"
                        style={{ border: "1px solid var(--border-mid)" }}
                      >
                        {CABIN_OPTIONS.map((opt, i) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setCabin(opt.value)}
                            className="px-3.5 py-1.5 text-[12px] font-medium transition-all flex items-center gap-1.5"
                            style={{
                              background:
                                cabin === opt.value
                                  ? "rgba(13,148,136,0.15)"
                                  : "transparent",
                              color:
                                cabin === opt.value
                                  ? "#14B8A6"
                                  : "var(--text-tertiary)",
                              borderLeft:
                                i > 0 ? "1px solid var(--border-mid)" : "none",
                              cursor: "pointer",
                            }}
                          >
                            <span>{opt.icon}</span>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Popular flight pills */}
                  <div className="flex flex-wrap gap-2 mb-5">
                    <span
                      className="text-[12px] self-center"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      Popular:
                    </span>
                    {POPULAR_FLIGHTS.map((f) => (
                      <button
                        key={f.label}
                        type="button"
                        onClick={() => {
                          setOrigin(f.origin);
                          setDestination(f.dest);
                        }}
                        className="text-[12px] font-medium px-3 py-1 rounded-full transition-all"
                        style={{
                          background:
                            origin === f.origin && destination === f.dest
                              ? "rgba(13,148,136,0.2)"
                              : "rgba(255,255,255,0.05)",
                          border:
                            origin === f.origin && destination === f.dest
                              ? "1px solid rgba(13,148,136,0.35)"
                              : "1px solid var(--border-mid)",
                          color:
                            origin === f.origin && destination === f.dest
                              ? "#14B8A6"
                              : "var(--text-secondary)",
                          cursor: "pointer",
                        }}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  {/* Hotel: Row 1 — Destination */}
                  <div className="mb-4">
                    <label
                      className="label-xs mb-2 block"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      Destination City
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base pointer-events-none">
                        📍
                      </span>
                      <input
                        type="text"
                        placeholder="e.g. Paris, London, Dubai"
                        value={destination}
                        onChange={(e) => setDestination(e.target.value)}
                        className="w-full h-11 pl-10 pr-4 rounded-xl text-[14px] font-medium outline-none transition-all input-maple focus-ring"
                      />
                    </div>
                  </div>

                  {/* Hotel: Row 2 — Check-in, Check-out, Rooms */}
                  <div className="flex flex-wrap items-end gap-4 mb-4">
                    <div style={{ flex: "1 1 140px" }}>
                      <label
                        className="label-xs mb-2 block"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        Check-in
                      </label>
                      <input
                        type="date"
                        min={TODAY}
                        value={departureDate}
                        onChange={(e) => setDepartureDate(e.target.value)}
                        className="w-full h-11 px-3 rounded-xl text-[14px] font-medium outline-none transition-all input-maple focus-ring"
                        style={{
                          color: departureDate ? "white" : "var(--text-tertiary)",
                        }}
                      />
                    </div>

                    <div style={{ flex: "1 1 140px" }}>
                      <label
                        className="label-xs mb-2 block"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        Check-out
                      </label>
                      <input
                        type="date"
                        min={departureDate || TODAY}
                        value={checkoutDate}
                        onChange={(e) => setCheckoutDate(e.target.value)}
                        className="w-full h-11 px-3 rounded-xl text-[14px] font-medium outline-none transition-all input-maple focus-ring"
                        style={{
                          color: checkoutDate ? "white" : "var(--text-tertiary)",
                        }}
                      />
                    </div>

                    <div>
                      <label
                        className="label-xs mb-2 block"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        Rooms
                      </label>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => setRooms((r) => Math.max(1, r - 1))}
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 8,
                            background: "rgba(255,255,255,0.06)",
                            border: "1px solid var(--border-mid)",
                            color: "white",
                            cursor: "pointer",
                            fontSize: 16,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          -
                        </button>
                        <span
                          style={{
                            minWidth: 20,
                            textAlign: "center",
                            color: "white",
                            fontSize: 14,
                            fontWeight: 600,
                          }}
                        >
                          {rooms}
                        </span>
                        <button
                          type="button"
                          onClick={() => setRooms((r) => Math.min(9, r + 1))}
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 8,
                            background: "rgba(255,255,255,0.06)",
                            border: "1px solid var(--border-mid)",
                            color: "white",
                            cursor: "pointer",
                            fontSize: 16,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          +
                        </button>
                        <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
                          room{rooms !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Room type selector */}
                  <div className="mb-4">
                    <label
                      className="label-xs mb-2 block"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      Room Type
                    </label>
                    <div
                      className="flex rounded-lg overflow-hidden"
                      style={{ border: "1px solid var(--border-mid)", width: "fit-content" }}
                    >
                      {ROOM_OPTIONS.map((opt, i) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setRoomType(opt.value)}
                          className="px-3.5 py-1.5 text-[12px] font-medium transition-all flex items-center gap-1.5"
                          style={{
                            background:
                              roomType === opt.value
                                ? "rgba(13,148,136,0.15)"
                                : "transparent",
                            color:
                              roomType === opt.value
                                ? "#14B8A6"
                                : "var(--text-tertiary)",
                            borderLeft:
                              i > 0 ? "1px solid var(--border-mid)" : "none",
                            cursor: "pointer",
                          }}
                        >
                          <span>{opt.icon}</span>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Popular hotel pills */}
                  <div className="flex flex-wrap gap-2 mb-5">
                    <span
                      className="text-[12px] self-center"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      Popular:
                    </span>
                    {POPULAR_HOTELS.map((h) => (
                      <button
                        key={h.label}
                        type="button"
                        onClick={() => setDestination(h.dest)}
                        className="text-[12px] font-medium px-3 py-1 rounded-full transition-all"
                        style={{
                          background:
                            destination === h.dest
                              ? "rgba(13,148,136,0.2)"
                              : "rgba(255,255,255,0.05)",
                          border:
                            destination === h.dest
                              ? "1px solid rgba(13,148,136,0.35)"
                              : "1px solid var(--border-mid)",
                          color:
                            destination === h.dest
                              ? "#14B8A6"
                              : "var(--text-secondary)",
                          cursor: "pointer",
                        }}
                      >
                        {h.label}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* Supported programs row */}
              <div className="flex flex-wrap items-center gap-2 mb-5 pb-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                  Supported:
                </span>
                {SUPPORTED_PROGRAMS.map((p) => (
                  <span
                    key={p.name}
                    className="text-[11px] font-medium px-2.5 py-1 rounded-full"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid var(--border-dim)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {p.emoji} {p.name}
                  </span>
                ))}
              </div>

              {/* Submit button + error */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                {error && (
                  <p className="text-[13px]" style={{ color: "#F87171" }}>
                    {error}
                  </p>
                )}
                <div className="sm:ml-auto">
                  <button
                    type="submit"
                    disabled={loading}
                    className="h-11 px-8 rounded-xl font-semibold text-[14px] text-white transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      background: "linear-gradient(135deg, #0D9488, #0F766E)",
                      boxShadow: "0 4px 20px rgba(13,148,136,0.3)",
                    }}
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="3.5"
                          />
                          <path
                            className="opacity-90"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          />
                        </svg>
                        Evaluating…
                      </span>
                    ) : (
                      "Find best redemptions →"
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </AnimatedSection>

        {/* ── Loading skeletons ─────────────────────────────────────────── */}
        {loading && (
          <AnimatedSection delay={0}>
            <div className="flex flex-col gap-3">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          </AnimatedSection>
        )}

        {/* ── SECTION 3: Results ────────────────────────────────────────── */}
        {!loading && (tripType === "hotel" ? results !== null : awardResults !== null) && (
          <AnimatedSection delay={0.08}>
            {/* Results header */}
            <div className="flex items-center justify-between mb-3 px-1">
              <div>
                <p className="text-[13px] font-semibold text-white">
                  {(tripType === "hotel" ? (results?.length ?? 0) : (awardResults?.length ?? 0))}{" "}
                  {tripType === "flight" ? "award" : "redemption"} option{((tripType === "hotel" ? (results?.length ?? 0) : (awardResults?.length ?? 0)) !== 1) ? "s" : ""}
                </p>
                <p className="text-[12px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                  {routeSummary()}
                </p>
              </div>

              {/* My Cards / All Cards toggle */}
              <div
                className="flex rounded-lg overflow-hidden"
                style={{ border: "1px solid var(--border-mid)" }}
              >
                {[
                  { key: true, label: "My Cards" },
                  { key: false, label: "All Cards" },
                ].map((btn, i) => (
                  <button
                    key={String(btn.key)}
                    type="button"
                    onClick={() => setShowMyCards(btn.key)}
                    style={{
                      padding: "5px 12px",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      background:
                        showMyCards === btn.key
                          ? "rgba(13,148,136,0.18)"
                          : "transparent",
                      color:
                        showMyCards === btn.key
                          ? "#14B8A6"
                          : "var(--text-tertiary)",
                      borderLeft:
                        i > 0 ? "1px solid var(--border-mid)" : "none",
                      transition: "all 0.15s",
                    }}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Not enough points hint */}
            {hasResultsButNoneAffordable && (
              <div className="rounded-xl p-8 text-center" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-dim)" }}>
                <div className="text-3xl mb-3">💡</div>
                <p className="text-[14px] text-white font-medium mb-1">Not enough points for these options</p>
                <p className="text-[13px] mb-4" style={{ color: "var(--text-secondary)" }}>
                  You don&apos;t have enough points for any option at this level.
                </p>
                <button
                  onClick={() => setShowMyCards(false)}
                  className="inline-flex items-center px-4 py-2 rounded-xl text-[13px] font-medium transition-all"
                  style={{ background: "rgba(13,148,136,0.15)", color: "#14B8A6", border: "1px solid rgba(13,148,136,0.25)" }}
                >
                  Show all options →
                </button>
              </div>
            )}

            {/* Empty state */}
            {((tripType === "hotel" && filteredResults !== null && filteredResults.length === 0) ||
              (tripType === "flight" && filteredAwardResults !== null && filteredAwardResults.length === 0)) &&
              !hasResultsButNoneAffordable && (
              <div
                className="rounded-xl p-10 text-center"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-dim)",
                }}
              >
                <div className="text-4xl mb-3">{tripType === "flight" ? "✈️" : "🏨"}</div>
                <p className="text-[14px] text-white font-medium mb-1">
                  No {tripType === "flight" ? "award availability" : "redemption options"} found
                </p>
                <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                  {showMyCards
                    ? "Add cards with points to your wallet to see options."
                    : tripType === "flight"
                      ? "No award seats found. Try a different date or route."
                      : "No programs matched your search criteria."}
                </p>
                {showMyCards && (
                  <Link
                    href="/cards"
                    className="inline-block mt-4 text-[13px] font-medium"
                    style={{ color: "#0D9488" }}
                  >
                    Add cards to wallet →
                  </Link>
                )}
              </div>
            )}

            {/* ── Hotel result cards ── */}
            {tripType === "hotel" && filteredResults !== null && filteredResults.length > 0 && (
              <AnimatedList className="flex flex-col gap-3">
                {filteredResults.map((opt, i) => {
                  const hasBreakdowns =
                    Array.isArray(opt.card_breakdowns) &&
                    opt.card_breakdowns.length > 0;
                  const isExpanded = expandedBreakdowns.has(i);

                  // Progress bar calculation
                  const ptsRequired = opt.points_required ?? 0;
                  const ptsAvailable = opt.points_available ?? 0;
                  const barFillPct =
                    ptsRequired > 0
                      ? Math.min(100, (ptsAvailable / ptsRequired) * 100)
                      : 0;

                  const shortfall =
                    !opt.can_afford && ptsRequired > 0
                      ? ptsRequired - ptsAvailable
                      : 0;

                  return (
                    <AnimatedItem key={`${opt.program_slug}-${opt.transfer_path}-${i}`}>
                      <div
                        className="rounded-xl p-5 transition-all"
                        style={{
                          background:
                            i === 0
                              ? "linear-gradient(135deg, rgba(13,148,136,0.08), rgba(37,99,235,0.04))"
                              : "var(--bg-elevated)",
                          border:
                            i === 0
                              ? "1px solid rgba(13,148,136,0.25)"
                              : "1px solid var(--border-dim)",
                        }}
                      >
                        {/* ── Card header ── */}
                        <div className="flex items-start justify-between gap-3 mb-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              {i === 0 && (
                                <span
                                  className="label-xs px-2 py-0.5 rounded"
                                  style={{
                                    background: "rgba(13,148,136,0.15)",
                                    color: "#14B8A6",
                                  }}
                                >
                                  best value
                                </span>
                              )}
                              {!opt.can_afford && !showMyCards && (
                                <span
                                  className="label-xs px-2 py-0.5 rounded"
                                  style={{
                                    background: "rgba(239,68,68,0.1)",
                                    color: "#F87171",
                                  }}
                                >
                                  insufficient pts
                                </span>
                              )}
                              <h3 className="text-[15px] font-semibold text-white">
                                {opt.program_name}
                              </h3>
                            </div>
                            {opt.airline_name && (
                              <p
                                className="text-[12px] font-medium"
                                style={{ color: "#14B8A6" }}
                              >
                                via {opt.airline_name}
                              </p>
                            )}
                            {opt.property_name && (
                              <p
                                className="text-[12px] font-medium"
                                style={{ color: "#14B8A6" }}
                              >
                                {opt.property_name}
                                {opt.hotel_category > 0 && (
                                  <span
                                    className="ml-1"
                                    style={{ color: "var(--text-tertiary)" }}
                                  >
                                    (Cat {opt.hotel_category})
                                  </span>
                                )}
                              </p>
                            )}
                            <p
                              className="text-[12px]"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              {opt.transfer_path}
                              {opt.transfer_ratio !== 1 && opt.transfer_ratio > 0 && (
                                <span
                                  className="ml-1"
                                  style={{ color: "var(--text-tertiary)" }}
                                >
                                  ({opt.transfer_ratio}:1)
                                </span>
                              )}
                            </p>
                          </div>

                          {/* Cash price / value */}
                          <div className="text-right shrink-0">
                            <div
                              className="text-[20px] font-bold"
                              style={{ color: i === 0 ? "#14B8A6" : "white" }}
                            >
                              {opt.cash_price_cad > 0 ? fmtCAD(opt.cash_price_cad) : fmtCAD(opt.estimated_value)}
                            </div>
                            <div
                              className="text-[11px] flex items-center gap-1 justify-end"
                              style={{ color: "var(--text-tertiary)" }}
                            >
                              {opt.data_source === "live_search" && (
                                <span style={{ color: "#10B981" }}>●</span>
                              )}
                              {opt.data_source === "knowledge_base" && (
                                <span style={{ color: "#0D9488" }}>●</span>
                              )}
                              {(!opt.data_source || opt.data_source === "estimated") && (
                                <span style={{ color: "#6B7280" }}>●</span>
                              )}
                              {opt.data_source === "live_search"
                                ? "live price"
                                : opt.data_source === "knowledge_base"
                                  ? "published rate"
                                  : "est. value"}
                            </div>
                          </div>
                        </div>

                        {/* ── Points bar section ── */}
                        {ptsRequired > 0 && (
                          <div className="mb-4">
                            <div
                              className="flex justify-between items-baseline mb-1.5"
                            >
                              <span
                                className="text-[12px]"
                                style={{ color: "var(--text-tertiary)" }}
                              >
                                Points required:{" "}
                                <span className="font-semibold text-white">
                                  {fmtPoints(ptsRequired)}
                                </span>
                              </span>
                              <span
                                className="text-[12px]"
                                style={{ color: "var(--text-tertiary)" }}
                              >
                                You have:{" "}
                                <span
                                  className="font-semibold"
                                  style={{
                                    color: opt.can_afford ? "#10B981" : "#F87171",
                                  }}
                                >
                                  {fmtPoints(ptsAvailable)}
                                </span>
                              </span>
                            </div>

                            {/* Progress bar */}
                            <div
                              style={{
                                height: 8,
                                borderRadius: 999,
                                background: "rgba(255,255,255,0.08)",
                                overflow: "hidden",
                                position: "relative",
                              }}
                            >
                              <div
                                style={{
                                  position: "absolute",
                                  left: 0,
                                  top: 0,
                                  height: "100%",
                                  width: `${barFillPct}%`,
                                  background: opt.can_afford
                                    ? "rgba(16,185,129,0.75)"
                                    : "rgba(13,148,136,0.75)",
                                  borderRadius: 999,
                                  transition: "width 0.4s ease",
                                }}
                              />
                            </div>
                          </div>
                        )}

                        {/* ── Affordability row ── */}
                        <div
                          className="flex items-center justify-between flex-wrap gap-2 mb-4 py-3"
                          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
                        >
                          <div className="flex items-center gap-2">
                            {opt.can_afford ? (
                              <span
                                className="text-[12px] font-medium flex items-center gap-1.5"
                                style={{ color: "#10B981" }}
                              >
                                <span>✅</span> You can afford this!
                              </span>
                            ) : (
                              <span
                                className="text-[12px] font-medium flex items-center gap-1.5"
                                style={{ color: "#F87171" }}
                              >
                                <span>❌</span>
                                {shortfall > 0
                                  ? `Need ${fmtPoints(shortfall)} more pts`
                                  : "Insufficient points"}
                              </span>
                            )}
                          </div>
                          <span
                            className="text-[12px]"
                            style={{ color: "var(--text-tertiary)" }}
                          >
                            {opt.cash_price_cad > 0 && ptsRequired > 0
                              ? `${(opt.value_per_point ?? opt.estimated_cpp).toFixed(2)}¢/pt = ${fmtCAD(opt.cash_price_cad)} ÷ ${fmtPoints(ptsRequired)} pts`
                              : `~${fmtCAD(opt.estimated_value)} est. value`}
                          </span>
                        </div>

                        {/* ── Value row ── */}
                        <div className="flex items-center justify-between flex-wrap gap-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className="text-[13px] font-semibold"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              ~{(opt.value_per_point ?? opt.estimated_cpp).toFixed(2)}¢/pt
                            </span>
                            <SavingsBadge rating={opt.savings_rating} />
                          </div>

                          <div className="flex items-center gap-3">
                            {/* "Add to wallet" CTA for "All Cards" unaffordable options */}
                            {!showMyCards && !opt.can_afford && (
                              <Link
                                href="/cards"
                                className="text-[12px] font-medium transition-colors"
                                style={{ color: "#14B8A6" }}
                              >
                                Add to wallet →
                              </Link>
                            )}

                            {opt.booking_url && opt.booking_url !== "#" && (
                              <a
                                href={opt.booking_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[12px] font-semibold px-3 py-1.5 rounded-lg transition-all"
                                style={{
                                  background: "rgba(13,148,136,0.12)",
                                  border: "1px solid rgba(13,148,136,0.25)",
                                  color: "#14B8A6",
                                }}
                              >
                                Search {opt.program_name} →
                              </a>
                            )}
                          </div>
                        </div>

                        {/* ── Notes ── */}
                        {opt.notes && (
                          <p
                            className="text-[12px] mt-3 pt-3"
                            style={{
                              color: "var(--text-tertiary)",
                              borderTop: "1px solid rgba(255,255,255,0.06)",
                            }}
                          >
                            {opt.notes}
                          </p>
                        )}

                        {/* ── Expandable transfer plan ── */}
                        {hasBreakdowns && (
                          <div
                            className="mt-3 pt-3"
                            style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
                          >
                            <button
                              type="button"
                              onClick={() => toggleBreakdown(i)}
                              className="flex items-center gap-1.5 text-[12px] font-medium transition-colors w-full text-left"
                              style={{ color: "var(--text-tertiary)", cursor: "pointer" }}
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 16 16"
                                fill="none"
                                style={{
                                  transform: isExpanded
                                    ? "rotate(180deg)"
                                    : "rotate(0deg)",
                                  transition: "transform 0.2s ease",
                                  flexShrink: 0,
                                }}
                              >
                                <path
                                  d="M4 6l4 4 4-4"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                              {isExpanded ? "Hide" : "Show"} transfer plan
                            </button>

                            {isExpanded && (
                              <div className="mt-3 flex flex-col gap-2">
                                {opt.card_breakdowns.map((cb: CardContribution, j: number) => (
                                  <div
                                    key={j}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 8,
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontSize: 12,
                                        padding: "2px 8px",
                                        borderRadius: 6,
                                        background: "rgba(13,148,136,0.1)",
                                        color: "#14B8A6",
                                      }}
                                    >
                                      {cb.card_name}
                                    </span>
                                    <span
                                      style={{
                                        color: "var(--text-tertiary)",
                                        fontSize: 12,
                                      }}
                                    >
                                      → {cb.program_name}
                                    </span>
                                    <span
                                      style={{
                                        color: "white",
                                        fontSize: 12,
                                        fontWeight: 600,
                                      }}
                                    >
                                      {cb.points_after_transfer.toLocaleString()} pts
                                    </span>
                                    <span
                                      style={{
                                        color: "var(--text-tertiary)",
                                        fontSize: 11,
                                      }}
                                    >
                                      ({cb.transfer_ratio}:1)
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </AnimatedItem>
                  );
                })}
              </AnimatedList>
            )}

            {/* ── Award flight result cards ── */}
            {tripType === "flight" && filteredAwardResults !== null && filteredAwardResults.length > 0 && (
              <AnimatedList className="flex flex-col gap-3">
                {filteredAwardResults.map((opt, i) => {
                  const hasBreakdowns = Array.isArray(opt.card_breakdowns) && opt.card_breakdowns.length > 0;
                  const isExpanded = expandedBreakdowns.has(i);
                  const barFillPct = opt.points_cost > 0
                    ? Math.min(100, (opt.points_available / opt.points_cost) * 100)
                    : 0;
                  const shortfall = !opt.can_afford && opt.points_cost > 0
                    ? opt.points_cost - opt.points_available
                    : 0;

                  // value_rating → badge style
                  const ratingStyle =
                    opt.value_rating === "excellent"
                      ? { bg: "rgba(16,185,129,0.15)", color: "#10B981", label: "Excellent" }
                      : opt.value_rating === "good"
                        ? { bg: "rgba(245,158,11,0.15)", color: "#F59E0B", label: "Good" }
                        : { bg: "rgba(239,68,68,0.15)", color: "#EF4444", label: "Poor" };

                  return (
                    <AnimatedItem key={`${opt.program}-${opt.date}-${i}`}>
                      <div
                        className="rounded-xl p-5 transition-all"
                        style={{
                          background: i === 0
                            ? "linear-gradient(135deg, rgba(13,148,136,0.08), rgba(37,99,235,0.04))"
                            : "var(--bg-elevated)",
                          border: i === 0
                            ? "1px solid rgba(13,148,136,0.25)"
                            : "1px solid var(--border-dim)",
                        }}
                      >
                        {/* Card header */}
                        <div className="flex items-start justify-between gap-3 mb-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              {i === 0 && (
                                <span
                                  className="label-xs px-2 py-0.5 rounded"
                                  style={{ background: "rgba(13,148,136,0.15)", color: "#14B8A6" }}
                                >
                                  best value
                                </span>
                              )}
                              {!opt.can_afford && !showMyCards && (
                                <span
                                  className="label-xs px-2 py-0.5 rounded"
                                  style={{ background: "rgba(239,68,68,0.1)", color: "#F87171" }}
                                >
                                  insufficient pts
                                </span>
                              )}
                              <h3 className="text-[15px] font-semibold text-white">{opt.program_name}</h3>
                            </div>
                            {/* Date */}
                            {opt.date && (
                              <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                                {opt.date}
                              </p>
                            )}
                            {/* Segments summary */}
                            {opt.segments && opt.segments.length > 0 && (
                              <p className="text-[12px] font-medium" style={{ color: "#14B8A6" }}>
                                {opt.segments.map((s) => s.airline).filter((v, i2, a) => a.indexOf(v) === i2).join(" / ")}
                                {opt.segments.length > 1 ? ` · ${opt.segments.length - 1} stop${opt.segments.length > 2 ? "s" : ""}` : " · Nonstop"}
                              </p>
                            )}
                          </div>

                          {/* Cash price + source dot */}
                          <div className="text-right shrink-0">
                            <div
                              className="text-[20px] font-bold"
                              style={{ color: i === 0 ? "#14B8A6" : "white" }}
                            >
                              {fmtCAD(opt.cash_price_cad)}
                            </div>
                            <div
                              className="text-[11px] flex items-center gap-1 justify-end"
                              style={{ color: "var(--text-tertiary)" }}
                            >
                              <span style={{ color: opt.source === "live" ? "#10B981" : "#0D9488" }}>●</span>
                              {opt.source === "live" ? "live price" : "est. price"}
                            </div>
                            {/* CPP badge */}
                            <div className="text-[12px] font-semibold mt-1" style={{ color: "var(--text-secondary)" }}>
                              {opt.cpp.toFixed(1)}¢/pt
                            </div>
                          </div>
                        </div>

                        {/* Points bar */}
                        {opt.points_cost > 0 && (
                          <div className="mb-4">
                            <div className="flex justify-between items-baseline mb-1.5">
                              <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                                Points required:{" "}
                                <span className="font-semibold text-white">{fmtPoints(opt.points_cost)}</span>
                                {opt.taxes_cash > 0 && (
                                  <span className="ml-1" style={{ color: "var(--text-tertiary)" }}>
                                    + {fmtCAD(opt.taxes_cash)} taxes
                                  </span>
                                )}
                              </span>
                              <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                                You have:{" "}
                                <span
                                  className="font-semibold"
                                  style={{ color: opt.can_afford ? "#10B981" : "#F87171" }}
                                >
                                  {fmtPoints(opt.points_available)}
                                </span>
                              </span>
                            </div>
                            <div
                              style={{
                                height: 8, borderRadius: 999,
                                background: "rgba(255,255,255,0.08)",
                                overflow: "hidden", position: "relative",
                              }}
                            >
                              <div
                                style={{
                                  position: "absolute", left: 0, top: 0, height: "100%",
                                  width: `${barFillPct}%`,
                                  background: opt.can_afford ? "rgba(16,185,129,0.75)" : "rgba(13,148,136,0.75)",
                                  borderRadius: 999, transition: "width 0.4s ease",
                                }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Affordability + value row */}
                        <div
                          className="flex items-center justify-between flex-wrap gap-2 mb-4 py-3"
                          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            {opt.can_afford ? (
                              <span className="text-[12px] font-medium flex items-center gap-1.5" style={{ color: "#10B981" }}>
                                <span>✅</span> You can afford this!
                              </span>
                            ) : (
                              <span className="text-[12px] font-medium flex items-center gap-1.5" style={{ color: "#F87171" }}>
                                <span>❌</span>
                                {shortfall > 0 ? `Need ${fmtPoints(shortfall)} more pts` : "Insufficient points"}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {/* seats available */}
                            {opt.seats_available > 0 && (
                              <span
                                className="text-[12px] font-medium px-2 py-0.5 rounded-full"
                                style={{ background: "rgba(16,185,129,0.12)", color: "#10B981" }}
                              >
                                {opt.seats_available} seat{opt.seats_available !== 1 ? "s" : ""} left
                              </span>
                            )}
                            {/* value rating badge */}
                            <span
                              className="text-[12px] font-semibold px-2 py-0.5 rounded-full"
                              style={{ background: ratingStyle.bg, color: ratingStyle.color }}
                            >
                              ● {ratingStyle.label}
                            </span>
                          </div>
                        </div>

                        {/* Bottom action row */}
                        <div className="flex items-center justify-between flex-wrap gap-3">
                          <span className="text-[13px] font-semibold" style={{ color: "var(--text-secondary)" }}>
                            {opt.cpp.toFixed(1)}¢/pt · {fmtCAD(opt.cash_price_cad)} ÷ {fmtPoints(opt.points_cost)} pts
                          </span>
                          <div className="flex items-center gap-3">
                            {!showMyCards && !opt.can_afford && (
                              <Link href="/cards" className="text-[12px] font-medium transition-colors" style={{ color: "#14B8A6" }}>
                                Add to wallet →
                              </Link>
                            )}
                            {opt.booking_url && opt.booking_url !== "#" && (
                              <a
                                href={opt.booking_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[12px] font-semibold px-3 py-1.5 rounded-lg transition-all"
                                style={{
                                  background: "rgba(13,148,136,0.12)",
                                  border: "1px solid rgba(13,148,136,0.25)",
                                  color: "#14B8A6",
                                }}
                              >
                                Search {opt.program_name} →
                              </a>
                            )}
                          </div>
                        </div>

                        {/* Expandable transfer plan */}
                        {hasBreakdowns && (
                          <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                            <button
                              type="button"
                              onClick={() => toggleBreakdown(i)}
                              className="flex items-center gap-1.5 text-[12px] font-medium transition-colors w-full text-left"
                              style={{ color: "var(--text-tertiary)", cursor: "pointer" }}
                            >
                              <svg
                                width="14" height="14" viewBox="0 0 16 16" fill="none"
                                style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease", flexShrink: 0 }}
                              >
                                <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                              {isExpanded ? "Hide" : "Show"} points breakdown
                            </button>
                            {isExpanded && (
                              <div className="mt-3 flex flex-col gap-2">
                                {opt.card_breakdowns.map((cb: CardContribution, j: number) => (
                                  <div key={j} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                    <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 6, background: "rgba(13,148,136,0.1)", color: "#14B8A6" }}>
                                      {cb.card_name}
                                    </span>
                                    <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>
                                      {cb.points_after_transfer.toLocaleString()} pts
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </AnimatedItem>
                  );
                })}
              </AnimatedList>
            )}

            {/* ── SECTION 4: Disclaimer ── */}
            <div
              className="rounded-xl px-4 py-3 mt-5 text-[12px] leading-relaxed"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
                color: "var(--text-tertiary)",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                  <span style={{ color: "#10B981" }}>●</span> Live data
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                  <span style={{ color: "#0D9488" }}>●</span> Published/estimated
                </span>
              </span>
              {tripType === "flight"
                ? "Award availability and mileage costs are fetched live from airline systems. Cash prices are from Google Flights for the exact cabin class. Green dot = live data; blue = YAML award chart estimate."
                : "Points requirements are from official award charts. Cash prices with a green indicator are fetched live; blue prices are from published hotel rates."}{" "}
              Always verify final pricing on the booking portal before redeeming.
            </div>
          </AnimatedSection>
        )}
      </div>
    </div>
  );
}
