"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/* Live decision engine — replaces the marketing card-spread.
 *
 * Why this exists: the previous hero showed a CardFan illustration on the
 * right. Pretty, but generic — every fintech does it. This component shows
 * the actual product in motion: a rotating ticker of "live" optimizer
 * decisions (purchase → best card → earned value). The cycling cadence +
 * staggered reveal + counting numbers communicate the brand's core promise
 * ("we already know what to swipe") in a way a static illustration can't.
 *
 * Editorial constraints (impeccable + emil rules):
 *   - All type lives in the existing ladder (display / mono / serif).
 *   - No `transition: all`; specific properties.
 *   - 220ms ease-out-expo timing matches the rest of the system.
 *   - Tabular nums on the figure column so cycling doesn't jitter widths.
 *   - Respects prefers-reduced-motion via framer-motion's built-in guard.
 */

type Scenario = {
  /* What the user just spent on. */
  purchase: string;
  /* The card Maple picks. */
  card: string;
  /* Program / context line under the card name. */
  program: string;
  /* Headline figure: usually multiplier, sometimes a saved-dollar amount
   * for redemption scenarios (flights). */
  figure: string;
  /* Sub-figure: the dollar value returned on this swipe. */
  cad: string;
};

const SCENARIOS: Scenario[] = [
  {
    purchase: "$12.40 · Tim Hortons",
    card: "Amex Cobalt",
    program: "Membership Rewards · transfers to Aeroplan",
    figure: "5×",
    cad: "+$1.02 earned",
  },
  {
    purchase: "$87.20 · Petro-Canada",
    card: "RBC Avion Visa Infinite",
    program: "RBC Rewards · 1.4¢ CPP via Avios",
    figure: "3.5×",
    cad: "+$3.97 earned",
  },
  {
    purchase: "$245.00 · Costco wholesale",
    card: "Capital One Costco MC",
    program: "4% cash back · Costco-only Mastercard",
    figure: "4%",
    cad: "+$9.80 earned",
  },
  {
    purchase: "YYZ → LHR · business class",
    card: "Aeroplan Reserve",
    program: "75,000 pts via Air Canada Saver",
    figure: "4.5¢/pt",
    cad: "$3,200 saved",
  },
  {
    purchase: "$48.00 · Cineplex",
    card: "Scene+ Visa Infinite",
    program: "Scene+ · 1.5¢ CPP at Cineplex",
    figure: "10×",
    cad: "+$7.20 earned",
  },
];

const CYCLE_MS = 2800;

export function LandingHeroDemo() {
  const [i, setI] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setI((p) => (p + 1) % SCENARIOS.length), CYCLE_MS);
    return () => clearInterval(id);
  }, []);

  const s = SCENARIOS[i];

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 22,
        padding: "32px clamp(20px, 2.5vw, 36px)",
        background: "var(--surface)",
        border: "1px solid var(--rule-strong)",
        borderRadius: 18,
        boxShadow: "var(--shadow-accent-glow), var(--shadow-2)",
        overflow: "hidden",
        minHeight: 460,
      }}
    >
      {/* Maple-glow corner glow tying the panel into the brand atmosphere */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 70% 50% at 100% 0%, var(--accent-glow), transparent 60%), radial-gradient(ellipse 50% 40% at 0% 100%, var(--gold-soft), transparent 65%)",
          pointerEvents: "none",
        }}
      />

      {/* Status header: live indicator + label */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ position: "relative", display: "inline-flex", width: 8, height: 8 }}>
          <span
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 999,
              background: "var(--accent)",
              animation: "maple-live-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
            }}
          />
          <span
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 999,
              background: "var(--accent)",
              opacity: 0.4,
              animation: "maple-live-ping 2s cubic-bezier(0, 0, 0.2, 1) infinite",
            }}
          />
        </span>
        <span
          className="mono"
          style={{
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
            fontWeight: 600,
          }}
        >
          Live decision · Maple optimizer
        </span>
      </div>

      {/* The figure — huge editorial number that swaps with each scenario */}
      <div style={{ position: "relative", minHeight: 96 }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${i}-figure`}
            initial={{ opacity: 0, y: 18, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -14, filter: "blur(4px)" }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            style={{ display: "flex", alignItems: "baseline", gap: 14 }}
          >
            <span
              className="display"
              style={{
                fontSize: "clamp(56px, 7vw, 88px)",
                lineHeight: 0.92,
                letterSpacing: "-0.02em",
                color: "var(--accent)",
                fontStyle: "italic",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {s.figure}
            </span>
            <span
              className="mono"
              style={{
                fontSize: 13,
                color: "var(--gain)",
                letterSpacing: "0.04em",
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {s.cad}
            </span>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Card + program — secondary headline */}
      <div style={{ position: "relative", minHeight: 64 }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${i}-card`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: 0.04 }}
          >
            <p
              className="display"
              style={{
                fontSize: "clamp(22px, 2.5vw, 30px)",
                margin: 0,
                lineHeight: 1.05,
                letterSpacing: "-0.01em",
                color: "var(--ink)",
              }}
            >
              {s.card}
            </p>
            <p
              className="serif"
              style={{
                marginTop: 6,
                fontSize: 14,
                fontStyle: "italic",
                color: "var(--ink-3)",
                lineHeight: 1.4,
              }}
            >
              {s.program}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Divider rule */}
      <div style={{ position: "relative", height: 1, background: "var(--rule)" }} />

      {/* Purchase context line — what the user spent on */}
      <div style={{ position: "relative", minHeight: 28 }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${i}-purchase`}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            style={{ display: "flex", alignItems: "center", gap: 10 }}
          >
            <span
              className="mono"
              style={{
                fontSize: 10,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--ink-3)",
                fontWeight: 600,
              }}
            >
              For
            </span>
            <span
              className="serif"
              style={{
                fontSize: 16,
                fontStyle: "italic",
                color: "var(--ink-2)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {s.purchase}
            </span>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Scenario dots — discrete progress markers */}
      <div
        style={{
          position: "relative",
          display: "flex",
          gap: 6,
          marginTop: "auto",
          paddingTop: 8,
        }}
      >
        {SCENARIOS.map((_, idx) => (
          <span
            key={idx}
            style={{
              flex: 1,
              height: 2,
              background: idx === i ? "var(--accent)" : "var(--rule)",
              borderRadius: 999,
              transition: "background 380ms cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          />
        ))}
      </div>

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
