"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useTour } from "@/contexts/tour-context";
import { TOUR_STEPS } from "@/lib/tour/tour-steps";
import { prefersReducedMotion } from "@/lib/tour/tour-config";
import { GhostCursor } from "./ghost-cursor";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const CARD_W = 360;

function cardStyle(rect: Rect | null): React.CSSProperties {
  if (typeof window === "undefined" || !rect) {
    return { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
  }
  const left = Math.max(16, Math.min(rect.left, window.innerWidth - CARD_W - 16));
  const roomBelow = window.innerHeight - (rect.top + rect.height);
  if (roomBelow > 230) {
    return { left, top: rect.top + rect.height + 14 };
  }
  return { left, bottom: window.innerHeight - rect.top + 14 };
}

export function TourOverlay() {
  const tour = useTour();
  const pathname = usePathname();
  const step = TOUR_STEPS[tour.stepIndex];
  const [rect, setRect] = useState<Rect | null>(null);
  const [ready, setReady] = useState(false);
  const reduceRef = useRef(false);

  useEffect(() => {
    reduceRef.current = prefersReducedMotion();
  }, [tour.active, tour.stepIndex]);

  const measure = useCallback((el: Element) => {
    const r = el.getBoundingClientRect();
    const pad = 8;
    setRect({ top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 });
  }, []);

  // Find + measure the target after each step / navigation. We keep the old
  // rect until the new one resolves so the spotlight MORPHS across the route
  // change instead of blinking.
  useEffect(() => {
    if (!tour.active) return;
    setReady(false);
    if (!step.target) {
      setRect(null);
      setReady(true);
      return;
    }
    let cancelled = false;
    let tries = 0;
    const reduce = reduceRef.current;
    const tryFind = () => {
      if (cancelled) return;
      const el = document.querySelector(`[data-tour-id="${step.target}"]`);
      if (el) {
        el.scrollIntoView({ block: "center", inline: "center", behavior: reduce ? "auto" : "smooth" });
        setTimeout(
          () => {
            if (!cancelled) {
              measure(el);
              setReady(true);
            }
          },
          reduce ? 0 : 260,
        );
        return;
      }
      if (++tries > 40) {
        // Target never mounted — fall back to a centered card.
        setRect(null);
        setReady(true);
        return;
      }
      setTimeout(tryFind, 50);
    };
    const t = setTimeout(tryFind, 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [tour.active, tour.stepIndex, step.target, pathname, measure]);

  // Re-measure on scroll/resize so the spotlight tracks the live element.
  useEffect(() => {
    if (!tour.active || !step.target) return;
    const onChange = () => {
      const el = document.querySelector(`[data-tour-id="${step.target}"]`);
      if (el) measure(el);
    };
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
    };
  }, [tour.active, step.target, measure]);

  // Keyboard: arrows advance/retreat, Esc skips.
  useEffect(() => {
    if (!tour.active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") tour.skip();
      else if (e.key === "ArrowRight") tour.next();
      else if (e.key === "ArrowLeft") tour.prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tour]);

  if (!tour.active || typeof document === "undefined") return null;

  const reduce = reduceRef.current;
  const last = tour.stepIndex === TOUR_STEPS.length - 1;
  const spotTransition = reduce
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 320, damping: 32 };

  return createPortal(
    <div className="tour-root">
      {/* Dim + spotlight. With a target, the box-shadow on the morphing rect IS
          the dim; without one, a flat dim panel. */}
      {rect ? (
        <motion.div
          className="tour-spot"
          initial={false}
          animate={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
          transition={spotTransition}
        />
      ) : (
        <div className="tour-fulldim" />
      )}

      {/* Block clicks to the dimmed app on view-only steps. Interactive steps
          leave the real controls clickable. */}
      {!step.interactive && rect && <div className="tour-block" />}

      <motion.div
        key={step.id}
        className="tour-card"
        style={cardStyle(rect)}
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduce ? { duration: 0 } : { duration: 0.35, ease: [0.2, 0.7, 0.2, 1] }}
      >
        <span className="tour-eyebrow">{step.eyebrow.toUpperCase()}</span>
        <h3 className="tour-title">{step.title}</h3>
        <p className="tour-body">{step.body}</p>
        {step.interactive && <p className="tour-hint">Try it yourself, or hit Next.</p>}

        <div className="tour-controls">
          <button type="button" className="tour-skip" onClick={tour.skip}>
            Skip
          </button>
          <div className="tour-rail" role="tablist" aria-label="Tour progress">
            {TOUR_STEPS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                aria-label={`Go to step ${i + 1}`}
                aria-selected={i === tour.stepIndex}
                className={i === tour.stepIndex ? "tour-pip on" : "tour-pip"}
                onClick={() => tour.goTo(i)}
              />
            ))}
          </div>
          <div className="tour-nav">
            {tour.stepIndex > 0 && (
              <button type="button" className="tour-btn ghost" onClick={tour.prev}>
                Back
              </button>
            )}
            <button type="button" className="tour-btn solid" onClick={tour.next}>
              {last ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </motion.div>

      {step.ghostDemo && ready && rect && <GhostCursor onDone={() => undefined} />}

      <style jsx>{`
        .tour-root {
          position: fixed;
          inset: 0;
          z-index: 1000;
          pointer-events: none;
        }
        .tour-spot {
          position: fixed;
          border-radius: 14px;
          box-shadow:
            0 0 0 100vmax rgba(10, 12, 16, 0.62),
            0 0 0 1.5px var(--accent),
            0 0 36px rgba(165, 31, 45, 0.32);
          pointer-events: none;
        }
        .tour-fulldim {
          position: fixed;
          inset: 0;
          background: rgba(10, 12, 16, 0.62);
          pointer-events: auto;
        }
        .tour-block {
          position: fixed;
          inset: 0;
          pointer-events: auto;
        }
        .tour-card {
          position: fixed;
          width: ${CARD_W}px;
          max-width: calc(100vw - 32px);
          pointer-events: auto;
          background: var(--surface);
          border: 1px solid var(--rule);
          border-radius: 16px;
          box-shadow: 0 24px 60px -18px rgba(0, 0, 0, 0.45);
          padding: 20px 20px 16px;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }
        .tour-eyebrow {
          display: block;
          font-family: var(--font-mono);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.18em;
          color: var(--accent);
          margin-bottom: 8px;
        }
        .tour-title {
          font-family: var(--font-display);
          font-style: italic;
          font-size: 22px;
          line-height: 1.15;
          color: var(--ink);
          margin: 0 0 8px;
        }
        .tour-body {
          font-family: var(--font-display);
          font-style: italic;
          font-size: 15px;
          line-height: 1.5;
          color: var(--ink-2);
          margin: 0;
        }
        .tour-hint {
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.04em;
          color: var(--ink-3);
          margin: 10px 0 0;
        }
        .tour-controls {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-top: 18px;
        }
        .tour-skip {
          background: transparent;
          border: none;
          color: var(--ink-3);
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
          padding: 6px 0;
        }
        .tour-rail {
          display: flex;
          gap: 6px;
          flex: 1;
          justify-content: center;
        }
        .tour-pip {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          border: none;
          padding: 0;
          background: var(--rule-strong);
          cursor: pointer;
          transition: width 200ms cubic-bezier(0.16, 1, 0.3, 1), background 200ms;
        }
        .tour-pip.on {
          width: 20px;
          background: var(--accent);
        }
        .tour-nav {
          display: flex;
          gap: 8px;
        }
        .tour-btn {
          font-family: var(--font-mono);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          border-radius: 8px;
          padding: 9px 16px;
          cursor: pointer;
        }
        .tour-btn.ghost {
          background: transparent;
          border: 1px solid var(--rule-strong);
          color: var(--ink-2);
        }
        .tour-btn.solid {
          background: var(--accent);
          border: none;
          color: #fff;
        }
      `}</style>
    </div>,
    document.body,
  );
}
