"use client";

/* SegmentDetails — collapsible per-row segment table.
 *
 * Renders the airline + flight number + route + times + aircraft for each
 * AwardSegmentInfo returned by the backend. Uses the mono face for flight
 * codes and serif for the airline name to keep with the editorial system.
 */

import { useState } from "react";
import type { AwardSegmentInfo } from "@/lib/api";

interface SegmentDetailsProps {
  segments: AwardSegmentInfo[];
  legLabel?: string; // "Outbound" / "Return" / undefined
}

function formatTime(t: string): string {
  if (!t) return "—";
  // Accepts RFC3339 or HH:MM. Strip seconds if present.
  if (t.includes("T")) {
    const d = new Date(t);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
  }
  return t.length > 5 ? t.slice(0, 5) : t;
}

export function SegmentDetails({ segments, legLabel }: SegmentDetailsProps) {
  const [open, setOpen] = useState(false);
  if (!segments || segments.length === 0) return null;

  return (
    <div style={{ marginTop: 10 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mono"
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          fontSize: 10,
          color: "var(--ink-3)",
          letterSpacing: "0.10em",
          textTransform: "uppercase",
          cursor: "pointer",
        }}
        aria-expanded={open}
      >
        {open ? "Hide segments" : `Show segments (${segments.length})`}
      </button>

      {open && (
        <div
          style={{
            marginTop: 10,
            padding: "10px 12px",
            border: "1px solid var(--rule)",
            borderRadius: 8,
            background: "var(--surface)",
          }}
        >
          {legLabel && (
            <div
              className="mono"
              style={{
                fontSize: 9,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--ink-3)",
                marginBottom: 6,
              }}
            >
              {legLabel}
            </div>
          )}
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 12,
            }}
          >
            <thead>
              <tr style={{ color: "var(--ink-3)" }}>
                <th
                  className="mono"
                  style={{
                    textAlign: "left",
                    fontSize: 9,
                    letterSpacing: "0.10em",
                    textTransform: "uppercase",
                    padding: "4px 6px 6px 0",
                    fontWeight: 600,
                  }}
                >
                  Flight
                </th>
                <th
                  className="mono"
                  style={{
                    textAlign: "left",
                    fontSize: 9,
                    letterSpacing: "0.10em",
                    textTransform: "uppercase",
                    padding: "4px 6px 6px 0",
                    fontWeight: 600,
                  }}
                >
                  Route
                </th>
                <th
                  className="mono"
                  style={{
                    textAlign: "left",
                    fontSize: 9,
                    letterSpacing: "0.10em",
                    textTransform: "uppercase",
                    padding: "4px 6px 6px 0",
                    fontWeight: 600,
                  }}
                >
                  Depart → Arrive
                </th>
                <th
                  className="mono"
                  style={{
                    textAlign: "left",
                    fontSize: 9,
                    letterSpacing: "0.10em",
                    textTransform: "uppercase",
                    padding: "4px 0 6px 0",
                    fontWeight: 600,
                  }}
                >
                  Aircraft
                </th>
              </tr>
            </thead>
            <tbody>
              {segments.map((s, i) => (
                <tr
                  key={`${s.flight_number}-${i}`}
                  style={{ borderTop: "1px solid var(--rule)" }}
                >
                  <td
                    className="mono"
                    style={{
                      padding: "6px 6px 6px 0",
                      color: "var(--ink)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s.flight_number || "—"}
                  </td>
                  <td
                    className="mono"
                    style={{
                      padding: "6px 6px 6px 0",
                      color: "var(--ink-2)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s.origin} → {s.destination}
                  </td>
                  <td
                    className="mono"
                    style={{
                      padding: "6px 6px 6px 0",
                      color: "var(--ink-2)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatTime(s.departure_time)} → {formatTime(s.arrival_time)}
                  </td>
                  <td
                    className="serif"
                    style={{
                      padding: "6px 0",
                      color: "var(--ink-3)",
                      fontStyle: "italic",
                    }}
                  >
                    {s.aircraft || s.airline || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
