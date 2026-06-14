"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  motion,
  useAnimationFrame,
  useMotionTemplate,
  useMotionValue,
  useTransform,
  type Variants,
} from "framer-motion";
import { usePathname } from "next/navigation";
import { useTour } from "@/contexts/tour-context";
import { TOUR_STEPS } from "@/lib/tour/tour-steps";
import { prefersReducedMotion } from "@/lib/tour/tour-config";
import { GhostCursor } from "./ghost-cursor";

const CARD_W = 360;
const CARD_H = 230;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function cardStyle(c: { cx: number; cy: number; hw: number; hh: number } | null): React.CSSProperties {
  if (typeof window === "undefined" || !c || c.hw <= 0) {
    return { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.max(16, Math.min(c.cx - c.hw, vw - CARD_W - 16));
  const bottomEdge = c.cy + c.hh;
  const topEdge = c.cy - c.hh;
  if (vh - bottomEdge > CARD_H + 24) return { left, top: bottomEdge + 18 };
  if (topEdge > CARD_H + 24) return { left, top: Math.max(16, topEdge - CARD_H - 18) };
  return { left: "50%", bottom: 28, transform: "translateX(-50%)" };
}

export function TourOverlay() {
  const tour = useTour();
  const pathname = usePathname();
  const step = TOUR_STEPS[tour.stepIndex];
  const [reduce] = useState(() => prefersReducedMotion());
  const [ready, setReady] = useState(false);
  const [hasSpot, setHasSpot] = useState(false);
  const [cardRect, setCardRect] = useState<{ cx: number; cy: number; hw: number; hh: number } | null>(null);
  // The element the spotlight tracks. Starts as the step's target; the ghost
  // cursor moves it as it works so the spotlight follows the action.
  const [focusSel, setFocusSel] = useState<string | null>(null);

  const cx = useMotionValue(0);
  const cy = useMotionValue(0);
  const hw = useMotionValue(0);
  const hh = useMotionValue(0);
  const R = useTransform([hw, hh], ([w, h]) => Math.hypot(w as number, h as number) + 26);
  const Rinner = useTransform(R, (v) => Math.max(0, (v as number) - 38));
  const mask = useMotionTemplate`radial-gradient(circle ${R}px at ${cx}px ${cy}px, transparent ${Rinner}px, rgba(0,0,0,0.9) ${R}px)`;
  const glowLeft = useTransform([cx, hw], ([c, w]) => (c as number) - (w as number));
  const glowTop = useTransform([cy, hh], ([c, h]) => (c as number) - (h as number));
  const glowW = useTransform(hw, (v) => (v as number) * 2);
  const glowH = useTransform(hh, (v) => (v as number) * 2);

  // Track the focused element every frame — this is what makes the spotlight
  // glide and follow the page as the cursor scrolls.
  useAnimationFrame((_, delta) => {
    if (!tour.active || !focusSel) return;
    const el = document.querySelector(focusSel);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 10;
    const k = 1 - Math.exp((-delta / 1000) * 11);
    cx.set(lerp(cx.get(), r.left + r.width / 2, k));
    cy.set(lerp(cy.get(), r.top + r.height / 2, k));
    hw.set(lerp(hw.get(), r.width / 2 + pad, k));
    hh.set(lerp(hh.get(), r.height / 2 + pad, k));
  });

  // Per step: find the target, spotlight it, place the card. No page transforms.
  useEffect(() => {
    if (!tour.active) return;
    setReady(false);
    const sel = step.target ? `[data-tour-id="${step.target}"]` : null;
    setFocusSel(sel);

    if (!sel) {
      setHasSpot(false);
      setCardRect(null);
      const t = setTimeout(() => setReady(true), 180);
      return () => clearTimeout(t);
    }

    let cancelled = false;
    let tries = 0;
    const tryFind = () => {
      if (cancelled) return;
      const el = document.querySelector(sel);
      if (el) {
        el.scrollIntoView({ block: "center", inline: "center", behavior: reduce ? "auto" : "smooth" });
        setTimeout(
          () => {
            if (cancelled) return;
            const r = el.getBoundingClientRect();
            if (!hasSpot) {
              cx.set(r.left + r.width / 2);
              cy.set(r.top + r.height / 2);
              hw.set(r.width / 2 + 10);
              hh.set(r.height / 2 + 10);
            }
            setHasSpot(true);
            setCardRect({
              cx: r.left + r.width / 2,
              cy: r.top + r.height / 2,
              hw: r.width / 2 + 10,
              hh: r.height / 2 + 10,
            });
            setReady(true);
          },
          reduce ? 0 : 360,
        );
        return;
      }
      if (++tries > 40) {
        setHasSpot(false);
        setCardRect(null);
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
  }, [tour.active, tour.stepIndex, step.target, pathname, reduce, cx, cy, hw, hh]);

  useEffect(() => {
    if (!tour.active) {
      setHasSpot(false);
      if (typeof document !== "undefined") document.body.style.cursor = "";
    }
  }, [tour.active]);

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

  const last = tour.stepIndex === TOUR_STEPS.length - 1;
  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduce ? 0 : 0.06, delayChildren: reduce ? 0 : 0.05 } },
  };
  const item: Variants = reduce
    ? { hidden: {}, show: {} }
    : {
        hidden: { opacity: 0, y: 10, filter: "blur(4px)" },
        show: {
          opacity: 1,
          y: 0,
          filter: "blur(0px)",
          transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
        },
      };

  return createPortal(
    <div className="tour-root">
      {hasSpot ? (
        <motion.div
          className="tour-dim"
          style={{ WebkitMaskImage: mask, maskImage: mask, pointerEvents: step.interactive ? "none" : "auto" }}
        />
      ) : (
        <div className="tour-fulldim" />
      )}

      {hasSpot && (
        <motion.div className="tour-glow" style={{ left: glowLeft, top: glowTop, width: glowW, height: glowH }} />
      )}

      <motion.div
        key={step.id}
        className="tour-card"
        style={cardStyle(cardRect)}
        variants={container}
        initial="hidden"
        animate="show"
      >
        <motion.span className="tour-eyebrow" variants={item}>
          {step.eyebrow.toUpperCase()}
        </motion.span>
        <motion.h3 className="tour-title" variants={item}>
          {step.title}
        </motion.h3>
        <motion.p className="tour-body" variants={item}>
          {step.body}
        </motion.p>
        {step.interactive && (
          <motion.p className="tour-hint" variants={item}>
            Watch it run, or try it yourself.
          </motion.p>
        )}

        <motion.div className="tour-controls" variants={item}>
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
        </motion.div>
      </motion.div>

      {step.ghostDemo && ready && hasSpot && (
        <GhostCursor reduce={reduce} onFocus={(s) => setFocusSel(s)} onDone={() => tour.next()} />
      )}

      <style jsx global>{`
        .tour-root {
          position: fixed;
          inset: 0;
          z-index: 1000;
          pointer-events: none;
        }
        .tour-dim {
          position: fixed;
          inset: 0;
          background: rgba(8, 10, 14, 0.55);
          backdrop-filter: blur(3px) saturate(0.92);
          -webkit-backdrop-filter: blur(3px) saturate(0.92);
          will-change: mask-image;
        }
        .tour-fulldim {
          position: fixed;
          inset: 0;
          background: rgba(8, 10, 14, 0.6);
          backdrop-filter: blur(3px);
          -webkit-backdrop-filter: blur(3px);
          pointer-events: auto;
        }
        .tour-glow {
          position: fixed;
          border-radius: 16px;
          pointer-events: none;
          box-shadow:
            0 0 0 1px rgba(165, 31, 45, 0.55),
            0 0 50px 6px rgba(165, 31, 45, 0.2),
            inset 0 0 24px rgba(165, 31, 45, 0.07);
        }
        .tour-card {
          position: fixed;
          width: 360px;
          max-width: calc(100vw - 32px);
          pointer-events: auto;
          background: var(--surface);
          border: 1px solid var(--rule);
          border-radius: 18px;
          box-shadow: 0 30px 70px -22px rgba(0, 0, 0, 0.55);
          padding: 22px 22px 16px;
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }
        .tour-eyebrow {
          display: block;
          font-family: var(--font-mono);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.2em;
          color: var(--accent);
          margin-bottom: 9px;
        }
        .tour-title {
          font-family: var(--font-display);
          font-style: italic;
          font-size: 23px;
          line-height: 1.14;
          letter-spacing: -0.01em;
          color: var(--ink);
          margin: 0 0 9px;
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
          margin: 11px 0 0;
        }
        .tour-controls {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-top: 20px;
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
          width: 6px;
          height: 6px;
          border-radius: 999px;
          border: none;
          padding: 0;
          background: var(--rule-strong);
          cursor: pointer;
          transition: width 360ms cubic-bezier(0.16, 1, 0.3, 1), background 360ms;
        }
        .tour-pip.on {
          width: 22px;
          background: var(--accent);
          box-shadow: 0 0 10px rgba(165, 31, 45, 0.5);
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
          border-radius: 9px;
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
          box-shadow: 0 6px 20px -6px rgba(165, 31, 45, 0.6);
        }
        @media (prefers-reduced-motion: reduce) {
          .tour-dim,
          .tour-fulldim {
            backdrop-filter: none;
            -webkit-backdrop-filter: none;
          }
        }
      `}</style>
    </div>,
    document.body,
  );
}
