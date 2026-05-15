"use client";

import { useEffect, useRef, useState } from "react";

/* Animated number counter — mirrors the prototype Counter behaviour.
 * Counts up from 0 → value once on mount with cubic-out easing. */
export function Counter({
  value,
  decimals = 0,
  duration = 1200,
}: {
  value: number;
  decimals?: number;
  duration?: number;
}) {
  const [v, setV] = useState(0);
  const start = useRef<number | null>(null);
  const from = useRef(0);

  useEffect(() => {
    // If the tab is hidden, rAF is throttled and the animation may never
    // complete — snap to the target so the value is correct on tab return.
    if (typeof document !== "undefined" && document.hidden) {
      setV(value);
      return;
    }
    start.current = null;
    from.current = v;
    let raf = 0;
    const tick = (now: number) => {
      if (start.current === null) start.current = now;
      const t = Math.min((now - start.current) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setV(from.current + (value - from.current) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return (
    <>
      {v.toLocaleString("en-CA", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
    </>
  );
}
