"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

/* Live decision engine — VISUAL version. Cards in front, text out of the way.
 * Five real Canadian cards stacked. One pops to the front per cycle (2.8s),
 * the rest fan behind it. Single short caption underneath says what the
 * highlighted card is for. */

type Scenario = {
  src: string;
  alt: string;
  /* Short caption — single line, mono. */
  caption: string;
};

const CARDS: Scenario[] = [
  { src: "/cards/amex-cobalt.png",                    alt: "Amex Cobalt",                  caption: "$12.40 · Tim Hortons" },
  { src: "/cards/rbc-avion-visa-platinum.png",        alt: "RBC Avion Visa",               caption: "$87.20 · Petro-Canada" },
  { src: "/cards/cibc-costco-mastercard.png",         alt: "CIBC Costco Mastercard",       caption: "$245.00 · Costco" },
  { src: "/cards/td-aeroplan-visa-infinite.png",      alt: "TD Aeroplan Visa Infinite",    caption: "YYZ → LHR · business class" },
  { src: "/cards/scotiabank-passport-visa-infinite.png", alt: "Scotia Passport Visa Infinite", caption: "$48.00 · Cineplex" },
];

const CYCLE_MS = 2800;

/* Per-card resting transform when not active — fan positions behind the
 * active card. Rotations + offsets stay constant so cards seem to occupy
 * fixed places in a pile; only the FRONT card identity changes. */
const FAN: { x: number; y: number; rot: number; scale: number }[] = [
  { x: -180, y: 30,  rot: -14, scale: 0.86 },
  { x:  -90, y: -10, rot:  -7, scale: 0.92 },
  { x:    0, y: -40, rot:   0, scale: 1.00 }, // center
  { x:   90, y: -10, rot:   7, scale: 0.92 },
  { x:  180, y: 30,  rot:  14, scale: 0.86 },
];

export function LandingHeroDemo() {
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setActiveIdx((p) => (p + 1) % CARDS.length), CYCLE_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 28,
        minHeight: 520,
        padding: "40px 20px",
        overflow: "hidden",
      }}
    >
      {/* Maple-glow halo following the active card */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 50% 45% at 50% 45%, var(--accent-glow), transparent 60%), radial-gradient(ellipse 40% 30% at 50% 85%, var(--gold-soft), transparent 65%)",
          pointerEvents: "none",
        }}
      />

      {/* Tiny eyebrow */}
      <div
        className="mono"
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--ink-3)",
          fontWeight: 600,
        }}
      >
        <span style={{ position: "relative", display: "inline-flex", width: 7, height: 7 }}>
          <span style={{ position: "absolute", inset: 0, borderRadius: 999, background: "var(--accent)", animation: "maple-live-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite" }} />
          <span style={{ position: "absolute", inset: 0, borderRadius: 999, background: "var(--accent)", opacity: 0.4, animation: "maple-live-ping 2s cubic-bezier(0, 0, 0.2, 1) infinite" }} />
        </span>
        Best card for this swipe
      </div>

      {/* Card stack — absolute-positioned, each card has a resting fan slot.
        * The "active" one promotes to front (z-index 10, scale 1.08, lifts up,
        * unrotates, gets the maple shadow). Others stay in their fan slots. */}
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 560,
          height: 280,
        }}
      >
        {CARDS.map((card, i) => {
          const isActive = i === activeIdx;
          /* Determine which FAN slot this card occupies. We rotate the
           * fan slots so the active card always sits in the center
           * resting position, then jumps to "front" treatment. Cards to
           * the left of active stay left, cards to the right stay right.
           * This keeps the pile visually stable while one card emerges. */
          const fanSlotIdx = (i - activeIdx + CARDS.length + 2) % CARDS.length;
          /* Cap to 5 fan slots; the active card takes the front treatment
           * instead of a fan slot. */
          const slot = FAN[Math.min(fanSlotIdx, FAN.length - 1)];

          return (
            <motion.div
              key={card.alt}
              animate={
                isActive
                  ? { x: 0, y: -60, rotate: 0, scale: 1.08, opacity: 1 }
                  : { x: slot.x, y: slot.y, rotate: slot.rot, scale: slot.scale, opacity: 0.72 }
              }
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: 220,
                height: 138,
                marginTop: -69,
                marginLeft: -110,
                borderRadius: 14,
                overflow: "hidden",
                background: "var(--surface-3)",
                zIndex: isActive ? 10 : 5 - Math.abs(fanSlotIdx - 2),
                boxShadow: isActive
                  ? "0 32px 80px -16px var(--accent-glow), 0 20px 50px -16px rgba(0,0,0,0.6), 0 8px 24px -8px rgba(0,0,0,0.4)"
                  : "0 12px 28px -10px rgba(0,0,0,0.4)",
                transformOrigin: "50% 80%",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={card.src}
                alt={card.alt}
                loading={isActive ? "eager" : "lazy"}
                draggable={false}
                style={{
                  display: "block",
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  userSelect: "none",
                }}
              />
            </motion.div>
          );
        })}
      </div>

      {/* Single small caption — the only text. Changes with the active card. */}
      <motion.div
        key={`caption-${activeIdx}`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          textAlign: "center",
        }}
      >
        <p
          className="display"
          style={{
            margin: 0,
            fontSize: "clamp(20px, 2vw, 26px)",
            fontStyle: "italic",
            letterSpacing: "-0.01em",
            color: "var(--accent)",
            lineHeight: 1.1,
          }}
        >
          {CARDS[activeIdx].alt}
        </p>
        <p
          className="mono"
          style={{
            margin: 0,
            fontSize: 11,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
            fontWeight: 600,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {CARDS[activeIdx].caption}
        </p>
      </motion.div>

      <style>{`
        @keyframes maple-live-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(0.7); opacity: 0.6; }
        }
        @keyframes maple-live-ping {
          0%   { transform: scale(1);   opacity: 0.4; }
          100% { transform: scale(2.6); opacity: 0;   }
        }
      `}</style>
    </div>
  );
}
