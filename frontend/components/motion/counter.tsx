"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView, useMotionValue, useTransform, animate } from "framer-motion";

interface AnimatedCounterProps {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function AnimatedCounter({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  duration = 1.2,
  className,
  style,
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -40px 0px" });
  const motionVal = useMotionValue(0);
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    if (!inView) return;
    const controls = animate(motionVal, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate(v) {
        setDisplay(
          decimals > 0
            ? v.toFixed(decimals)
            : Math.round(v).toLocaleString()
        );
      },
    });
    return controls.stop;
  }, [inView, value, duration, decimals, motionVal]);

  return (
    <span ref={ref} className={className} style={style}>
      {prefix}{display}{suffix}
    </span>
  );
}

/** Points badge with animated count-up */
export function PointsCounter({ points, className, style }: { points: number; className?: string; style?: React.CSSProperties }) {
  return (
    <AnimatedCounter
      value={points}
      suffix=" pts"
      duration={1.4}
      className={className}
      style={style}
    />
  );
}

/** Dollar value counter */
export function ValueCounter({ value, className, style }: { value: number; className?: string; style?: React.CSSProperties }) {
  return (
    <AnimatedCounter
      value={value}
      prefix="$"
      duration={1.2}
      className={className}
      style={style}
    />
  );
}
