"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Plane } from "lucide-react";
import { createAwardWatch, deleteAwardWatch, listAwardWatches } from "@/lib/api";
import type { AwardWatch } from "@/lib/types";
import { PaperTile } from "@/components/editorial/PaperTile";
import { EmptyState } from "@/components/editorial/EmptyState";
import { ctaStyle, fieldStyle, sectionStyle } from "./_shared";

interface Props {
  sessionId: string | null;
  ensureSession: () => Promise<string>;
}

export function AwardWatchTile({ sessionId, ensureSession }: Props) {
  const [watches, setWatches] = useState<AwardWatch[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [origin, setOrigin] = useState("YYZ");
  const [destination, setDestination] = useState("NRT");
  const [date, setDate] = useState("");
  const [flex, setFlex] = useState("3");
  const [cabin, setCabin] = useState<"economy" | "business" | "first">("business");
  const [maxPoints, setMaxPoints] = useState("80000");

  const load = useCallback(async () => {
    if (!sessionId) return;
    try { setWatches(await listAwardWatches(sessionId)); } catch {}
  }, [sessionId]);
  useEffect(() => { load(); }, [load]);

  async function add() {
    const sid = await ensureSession();
    await createAwardWatch(sid, {
      origin, destination, depart_date: date,
      flex_days: parseInt(flex) || 3, cabin,
      max_points: parseInt(maxPoints) || null, program_slug: "aeroplan",
    });
    setShowForm(false);
    load();
  }

  async function remove(id: string) {
    if (!sessionId) return;
    await deleteAwardWatch(sessionId, id);
    load();
  }

  return (
    <section style={sectionStyle}>
      <PaperTile
        motif="plane"
        eyebrow="Aeroplan watcher"
        title={<>Save the itinerary. Wait for the seat.</>}
      >
        <p
          className="serif"
          style={{ marginTop: -4, marginBottom: 16, fontSize: 14, fontStyle: "italic", color: "var(--ink-2)", lineHeight: 1.5 }}
        >
          Track Aeroplan award availability for routes you actually want to fly.
        </p>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
          <span className="eyebrow">{watches.length} active watch{watches.length === 1 ? "" : "es"}</span>
          <button
            onClick={() => setShowForm(s => !s)}
            className="mono"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 16px",
              borderRadius: 999,
              border: `1px solid ${showForm ? "var(--rule-strong)" : "var(--accent)"}`,
              background: showForm ? "transparent" : "var(--accent)",
              color: showForm ? "var(--ink-2)" : "#fff",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            <Plus size={12} />
            {showForm ? "Cancel" : "New watch"}
          </button>
        </div>

        {showForm && (
          <div
            style={{
              padding: 14,
              borderRadius: 10,
              border: "1px solid var(--rule)",
              background: "var(--card-fill)",
              marginBottom: 16,
              display: "grid",
              gap: 10,
            }}
          >
            <div className="protool-watch-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.4fr", gap: 10 }}>
              <input value={origin} onChange={e => setOrigin(e.target.value.toUpperCase())} placeholder="YYZ" style={fieldStyle} />
              <input value={destination} onChange={e => setDestination(e.target.value.toUpperCase())} placeholder="NRT" style={fieldStyle} />
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={fieldStyle} />
            </div>
            <div className="protool-watch-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <input type="number" value={flex} onChange={e => setFlex(e.target.value)} placeholder="±days" style={fieldStyle} />
              <select value={cabin} onChange={e => setCabin(e.target.value as typeof cabin)} style={fieldStyle}>
                <option value="economy">Economy</option>
                <option value="business">Business</option>
                <option value="first">First</option>
              </select>
              <input type="number" value={maxPoints} onChange={e => setMaxPoints(e.target.value)} placeholder="max points" style={fieldStyle} />
            </div>
            <button onClick={add} disabled={!date} style={{ ...ctaStyle, opacity: date ? 1 : 0.6, alignSelf: "start" }}>
              Save watch →
            </button>
          </div>
        )}

        {watches.length === 0 && !showForm ? (
          <EmptyState
            icon={Plane}
            title="No watches yet"
            body="Pick a route and a date. We'll keep an eye on it for you."
            action={{ label: "New watch", onClick: () => setShowForm(true) }}
          />
        ) : watches.length === 0 ? (
          <p className="serif" style={{ fontStyle: "italic", color: "var(--ink-3)", fontSize: 14, margin: 0 }}>
            No watches yet. Pick a route and a date above.
          </p>
        ) : (
          <div style={{ borderTop: "1px solid var(--rule)" }}>
            {watches.map(w => (
              <div
                key={w.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 14,
                  alignItems: "center",
                  padding: "14px 4px",
                  borderBottom: "1px solid var(--rule)",
                }}
              >
                <div>
                  <div className="display" style={{ fontSize: 18 }}>
                    {w.origin} <span style={{ color: "var(--ink-3)" }}>→</span> {w.destination}
                    <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginLeft: 10, letterSpacing: "0.10em", textTransform: "uppercase" }}>
                      {w.cabin}
                    </span>
                  </div>
                  <div className="serif" style={{ fontSize: 13, fontStyle: "italic", color: "var(--ink-3)", marginTop: 2 }}>
                    {w.depart_date} · ±{w.flex_days}d
                    {w.max_points ? ` · max ${w.max_points.toLocaleString()} pts` : ""}
                  </div>
                </div>
                <button
                  onClick={() => w.id && remove(w.id)}
                  className="mono"
                  style={{
                    padding: 8,
                    border: "1px solid var(--rule)",
                    borderRadius: 8,
                    background: "transparent",
                    color: "var(--ink-3)",
                    cursor: "pointer",
                  }}
                  aria-label="Remove"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </PaperTile>
    </section>
  );
}
