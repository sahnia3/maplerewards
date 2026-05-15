"use client";

/* LoadingPills — cosmetic progress UI while the award search request is in
 * flight. The backend is non-streaming, so we just flip pill states on
 * timers (10s, 20s, 30s) to give the user something to watch.
 *
 * Uses framer-motion for the state transition. No new dependencies (already
 * in package.json — see components/ui/custom-select.tsx for prior art).
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

type PillState = "pending" | "done" | "error";

interface Pill {
  id: string;
  label: string;
  state: PillState;
}

const STAGES: { label: string; at: number }[] = [
  { label: "Polling Apify", at: 0 },
  { label: "Polling Seats.aero", at: 10_000 },
  { label: "Pulling cash prices", at: 20_000 },
];

export function LoadingPills() {
  const [pills, setPills] = useState<Pill[]>(() =>
    STAGES.map((s, i) => ({
      id: `stage-${i}`,
      label: s.label,
      state: i === 0 ? "pending" : "pending",
    })),
  );

  useEffect(() => {
    // Reveal stages on a delay. Each stage marks the prior as done.
    const timers: number[] = [];
    STAGES.forEach((stage, i) => {
      if (i === 0) return; // first one already pending
      const t = window.setTimeout(() => {
        setPills((curr) =>
          curr.map((p, idx) => (idx === i - 1 ? { ...p, state: "done" } : p)),
        );
      }, stage.at);
      timers.push(t);
    });
    // Final stage flips to done after the 30s mark even though we may still
    // be waiting on the network — purely cosmetic, like the spec says.
    const last = window.setTimeout(() => {
      setPills((curr) =>
        curr.map((p, idx) => (idx === STAGES.length - 1 ? { ...p, state: "done" } : p)),
      );
    }, 30_000);
    timers.push(last);

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        alignItems: "center",
        padding: "12px 0 4px",
      }}
    >
      <AnimatePresence initial={false}>
        {pills.map((p) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
          >
            <PillBody pill={p} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function PillBody({ pill }: { pill: Pill }) {
  const isDone = pill.state === "done";
  const isError = pill.state === "error";
  return (
    <div
      role="status"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "6px 12px",
        borderRadius: 999,
        border: `1px solid ${
          isError ? "var(--loss)" : isDone ? "var(--rule)" : "var(--accent)"
        }`,
        background: isDone ? "var(--surface-2)" : "var(--accent-soft)",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: isError ? "var(--loss)" : isDone ? "var(--ink-3)" : "var(--accent)",
      }}
    >
      {isDone ? (
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--gain)" }} />
      ) : isError ? (
        <span aria-hidden>×</span>
      ) : (
        <span aria-hidden style={{ display: "inline-flex", gap: 3 }}>
          <Dot delay={0} />
          <Dot delay={150} />
          <Dot delay={300} />
        </span>
      )}
      <span>{pill.label}</span>
    </div>
  );
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      style={{
        width: 4,
        height: 4,
        borderRadius: "50%",
        background: "currentColor",
        display: "inline-block",
        animation: `tp-blink 900ms ease-in-out ${delay}ms infinite`,
      }}
    />
  );
}
