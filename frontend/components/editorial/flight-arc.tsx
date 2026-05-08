"use client";

/* FlightArc — animated arc with a recognisable jet silhouette tracing it.
 *
 *  • Quadratic bezier arc YYZ→CDG, drawn in dotted rule + animated maple-red overdraw.
 *  • Top-down jet silhouette — fuselage + main wings + horizontal stabiliser + tail —
 *    sized 56px wingspan, rotated to match the bezier tangent so it always points along motion.
 *  • Subtle contrail behind the plane: a fading dashed accent stroke that moves with the
 *    plane's phase, simulating exhaust streak.
 *
 *  Bezier: (80,160) → control (620,-60) → (1160,160) over a 6-second cycle.
 */
import { useEffect, useState } from "react";

export function FlightArc({ origin = "YYZ", destination = "CDG" }: { origin?: string; destination?: string }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      setT((now / 1000) % 6);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* 0..1 along the arc */
  const phase = t / 6;

  /* Bezier sampling */
  const bz = (p: number, a: number, b: number, c: number) =>
    (1 - p) * (1 - p) * a + 2 * (1 - p) * p * b + p * p * c;
  const x = bz(phase, 80, 620, 1160);
  const y = bz(phase, 160, -60, 160);

  /* Tangent angle at phase — derivative of the bezier */
  const dx = 2 * (1 - phase) * (620 - 80) + 2 * phase * (1160 - 620); // = 1080 constant
  const dy = 2 * (1 - phase) * (-60 - 160) + 2 * phase * (160 - -60); // = 440 (2p - 1)
  const angleRad = Math.atan2(dy, dx);
  const angleDeg = (angleRad * 180) / Math.PI;

  /* Contrail: previous position 0.06 phase units back along the arc */
  const tailPhase = Math.max(0, phase - 0.06);
  const tx = bz(tailPhase, 80, 620, 1160);
  const ty = bz(tailPhase, 160, -60, 160);

  return (
    <svg viewBox="0 0 1240 240" preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%" }} aria-hidden>
      <defs>
        <style>{`
          @keyframes arc-draw {
            0%   { stroke-dashoffset: 1240; }
            100% { stroke-dashoffset: 0; }
          }
        `}</style>
        <linearGradient id="contrail-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0.55" />
        </linearGradient>
        {/* shadow under the plane */}
        <filter id="plane-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.18" />
        </filter>
      </defs>

      {/* Dotted base arc */}
      <path
        d="M 80 160 Q 620 -60 1160 160"
        fill="none"
        stroke="var(--rule-strong)"
        strokeWidth="0.8"
        strokeDasharray="2 5"
      />

      {/* Solid accent overdraw */}
      <path
        d="M 80 160 Q 620 -60 1160 160"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.4"
        strokeDasharray="1240"
        style={{ animation: "arc-draw 4s ease-in-out infinite" }}
      />

      {/* Contrail — a short line from the previous-phase point to the plane */}
      <line
        x1={tx}
        y1={ty}
        x2={x}
        y2={y}
        stroke="url(#contrail-grad)"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.7"
      />

      {/* Origin marker */}
      <circle cx="80" cy="160" r="5" fill="var(--accent)" />
      <circle cx="80" cy="160" r="11" fill="none" stroke="var(--accent)" strokeOpacity="0.25" strokeWidth="1" />
      <text
        x="80" y="192"
        fontFamily="var(--font-mono)" fontSize="13" fill="var(--ink-3)"
        textAnchor="middle" letterSpacing="0.16em"
      >
        {origin}
      </text>

      {/* Destination marker */}
      <circle cx="1160" cy="160" r="5" fill="var(--accent)" />
      <circle cx="1160" cy="160" r="11" fill="none" stroke="var(--accent)" strokeOpacity="0.25" strokeWidth="1" />
      <text
        x="1160" y="192"
        fontFamily="var(--font-mono)" fontSize="13" fill="var(--ink-3)"
        textAnchor="middle" letterSpacing="0.16em"
      >
        {destination}
      </text>

      {/* Top-down jet silhouette — fuselage + swept wings + horizontal stabiliser + tail.
       * Centred on origin, nose pointing +x. Drawn at 1× then scaled up via transform. */}
      <g
        transform={`translate(${x}, ${y}) rotate(${angleDeg}) scale(1.4)`}
        filter="url(#plane-shadow)"
      >
        {/* shadow ellipse */}
        <ellipse cx="0" cy="3" rx="22" ry="2.5" fill="rgba(0,0,0,0.18)" />
        {/* main silhouette — single closed path */}
        <path
          d="
            M 22 0
            L 14 -2
            L 4 -2.2
            L -4 -1.5
            L -4 -10
            L -8 -10
            L -8 -1.2
            L -16 -0.8
            L -20 -3.4
            L -22 -3.4
            L -22 0
            L -22 3.4
            L -20 3.4
            L -16 0.8
            L -8 1.2
            L -8 10
            L -4 10
            L -4 1.5
            L 4 2.2
            L 14 2
            Z
          "
          fill="var(--ink)"
        />
        {/* cockpit highlight */}
        <ellipse cx="14" cy="0" rx="3" ry="0.9" fill="rgba(255,255,255,0.18)" />
      </g>
    </svg>
  );
}
