"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";

/* Kinetic proof moment — replaces the photograph editorial figure on the
 * marketing landing. The number IS the visual: a giant italic display
 * dollar figure that counts up on scroll-in, surrounded by tiny editorial
 * type so the eye stays on the figure.
 *
 * Design rationale:
 *   - Big claim. One number. Counter unlocks on view (Emil rule: motion
 *     conveys state, not decoration — the count is "revealing what we
 *     measured for an average user").
 *   - Italic Instrument Serif at clamp(96-176px) — the headline-scale
 *     editorial figure. Maple color so it lives in the brand.
 *   - Centered. Full-bleed padding. The number gets the whole viewport
 *     to breathe in.
 *   - No image. The Higgsfield still-life it replaced felt out of place
 *     against the rest of the digital product. */

const TARGET = 1247;       // dollars recovered, average user, year one
const DURATION_MS = 1800;  // count-up duration
const SWIPES = 312;
const CARDS = 4;

/* Count-up easing: ease-out-quart matches the rest of the system motion. */
function easeOutQuart(t: number) {
  return 1 - Math.pow(1 - t, 4);
}

function CountUp({ target, durationMs, active }: { target: number; durationMs: number; active: boolean }) {
  const [value, setValue] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;
    function step(t: number) {
      if (startRef.current === null) startRef.current = t;
      const elapsed = t - startRef.current;
      const progress = Math.min(elapsed / durationMs, 1);
      setValue(Math.round(easeOutQuart(progress) * target));
      if (progress < 1) rafRef.current = requestAnimationFrame(step);
    }
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [active, target, durationMs]);

  return <>{value.toLocaleString("en-CA")}</>;
}

export function LandingKineticProof() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });

  return (
    <section
      ref={ref}
      style={{
        position: "relative",
        padding: "clamp(80px, 12vh, 160px) clamp(20px, 4vw, 60px)",
        maxWidth: 1280,
        margin: "0 auto",
        textAlign: "center",
        overflow: "hidden",
      }}
    >
      {/* Soft maple-glow halo following the figure */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 60% 50% at 50% 50%, var(--accent-glow), transparent 60%)",
          pointerEvents: "none",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        style={{ position: "relative" }}
      >
        <p
          className="mono"
          style={{
            fontSize: 11,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
            fontWeight: 600,
            margin: 0,
            marginBottom: 32,
          }}
        >
          Average user · year one
        </p>

        <h2
          className="display"
          style={{
            margin: 0,
            fontSize: "clamp(96px, 16vw, 220px)",
            lineHeight: 0.88,
            letterSpacing: "-0.03em",
            color: "var(--accent)",
            fontStyle: "italic",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          $<CountUp target={TARGET} durationMs={DURATION_MS} active={inView} />
        </h2>
      </motion.div>

      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
        className="serif"
        style={{
          position: "relative",
          margin: "32px auto 0",
          maxWidth: 640,
          fontSize: "clamp(18px, 1.5vw, 22px)",
          fontStyle: "italic",
          color: "var(--ink-2)",
          lineHeight: 1.45,
        }}
      >
        recovered in optimized rewards — across {SWIPES.toLocaleString("en-CA")} swipes,
        on {CARDS} cards, in their first twelve months on Maple.
      </motion.p>

      <motion.div
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.6 }}
        style={{
          position: "relative",
          marginTop: 56,
          display: "inline-flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
          justifyContent: "center",
          paddingTop: 22,
          borderTop: "1px solid var(--rule)",
        }}
      >
        <StatChip label="Cards modelled" value="102" />
        <Dot />
        <StatChip label="Loyalty programs" value="19" />
        <Dot />
        <StatChip label="Transfer partners" value="40+" />
      </motion.div>
    </section>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8 }}>
      <span
        className="display"
        style={{
          fontSize: 20,
          fontStyle: "italic",
          color: "var(--ink)",
          letterSpacing: "-0.005em",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
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
        {label}
      </span>
    </span>
  );
}

function Dot() {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: 4,
        height: 4,
        borderRadius: 999,
        background: "var(--rule-strong)",
      }}
    />
  );
}
