"use client";

import { useEffect, useRef, useState } from "react";
import { animate, motion, useMotionValue } from "framer-motion";

/* A self-driving demo cursor — a real white macOS-style arrow that runs the live
 * optimizer: pick a category, type $200, rank, then the camera (a smooth scroll)
 * follows it DOWN to the winning card and it clicks Log Purchase. It reports the
 * element it is acting on so the spotlight tracks it. No page zoom. */

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

function setNativeValue(input: HTMLInputElement, value: string) {
  const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value");
  desc?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function flashTarget(el: Element) {
  if (!(el instanceof HTMLElement)) return;
  const prevShadow = el.style.boxShadow;
  const prevTrans = el.style.transition;
  el.style.transition = "box-shadow 180ms ease-out";
  el.style.boxShadow = "0 0 0 3px rgba(165,31,45,0.40), 0 0 26px rgba(165,31,45,0.35)";
  window.setTimeout(() => {
    el.style.boxShadow = prevShadow;
    window.setTimeout(() => {
      el.style.transition = prevTrans;
    }, 220);
  }, 430);
}

function inView(r: DOMRect) {
  return r.top >= 56 && r.bottom <= window.innerHeight - 56;
}

const MOVE_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];
const travelDur = (dist: number) => Math.min(0.95, Math.max(0.5, dist / 1900));

export function GhostCursor({
  onDone,
  onFocus,
  reduce = false,
}: {
  onDone: () => void;
  onFocus?: (selector: string) => void;
  reduce?: boolean;
}) {
  const startX = typeof window !== "undefined" ? window.innerWidth * 0.5 : 0;
  const startY = typeof window !== "undefined" ? window.innerHeight * 0.55 : 0;
  const x = useMotionValue(startX);
  const y = useMotionValue(startY);
  const scale = useMotionValue(1);
  const opacity = useMotionValue(0);
  const [ripple, setRipple] = useState(0);
  const onDoneRef = useRef(onDone);
  const onFocusRef = useRef(onFocus);
  useEffect(() => {
    onDoneRef.current = onDone;
    onFocusRef.current = onFocus;
  });

  useEffect(() => {
    if (reduce) {
      onDoneRef.current();
      return;
    }
    let cancelled = false;
    document.body.style.cursor = "none";

    // Move the spotlight to this element, scroll the page so it is in view (the
    // "camera"), then glide the cursor onto it.
    const goto = async (sel: string) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      onFocusRef.current?.(sel);
      if (!inView(el.getBoundingClientRect())) {
        el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        await sleep(620);
      }
      if (cancelled) return null;
      const r = el.getBoundingClientRect();
      const tx = r.left + r.width / 2;
      const ty = r.top + r.height / 2;
      const dist = Math.hypot(tx - x.get(), ty - y.get());
      await Promise.all([
        animate(x, tx, { duration: travelDur(dist), ease: MOVE_EASE }).finished,
        animate(y, ty, { duration: travelDur(dist), ease: MOVE_EASE }).finished,
      ]);
      return cancelled ? null : (el as HTMLElement);
    };
    const click = async (el: HTMLElement, fire = true) => {
      setRipple((r) => r + 1);
      flashTarget(el);
      await animate(scale, 0.85, { duration: 0.09, ease: "easeOut" }).finished;
      animate(scale, 1, { duration: 0.2, ease: [0.34, 1.56, 0.64, 1] });
      if (fire) el.click?.();
    };

    (async () => {
      try {
        animate(opacity, 1, { duration: 0.4 });
        await sleep(650);

        let el = await goto('[data-tour-id^="category-pill-"]');
        if (el) await click(el);
        if (cancelled) return;
        await sleep(850);

        el = await goto('[data-tour-id="amount-input"]');
        if (el) {
          await click(el);
          const input = el as HTMLInputElement;
          input.focus?.();
          opacity.set(0.85);
          const val = "200";
          for (let i = 1; i <= val.length; i++) {
            if (cancelled) return;
            setNativeValue(input, val.slice(0, i));
            await sleep(210);
          }
          input.blur?.();
          opacity.set(1);
        }
        if (cancelled) return;
        await sleep(750);

        el = await goto('[data-tour-id="rank-button"]');
        if (el) await click(el);

        for (let i = 0; i < 90 && !cancelled; i++) {
          if (document.querySelector('[data-tour-id="winner-card"]')) break;
          await sleep(80);
        }
        if (cancelled) return;
        await sleep(550);

        // Camera scrolls DOWN to the winning card.
        await goto('[data-tour-id="winner-card"]');
        if (cancelled) return;
        await sleep(950);

        // Then "click" Log Purchase — visual press only, so the demo doesn't
        // navigate away (an anonymous session would bounce to signup).
        el = await goto('[data-tour-id="log-purchase"]');
        if (el) await click(el, false);
        await sleep(1300);
        onDoneRef.current();
      } catch {
        onDoneRef.current();
      }
    })();

    return () => {
      cancelled = true;
      document.body.style.cursor = "";
    };
  }, [reduce, x, y, scale, opacity]);

  if (reduce) return null;

  return (
    <div className="demo-cursor-layer" aria-hidden>
      <motion.div
        className="demo-ripple"
        key={ripple}
        style={{ x, y }}
        initial={{ scale: 0, opacity: ripple ? 0.5 : 0 }}
        animate={{ scale: ripple ? 2.7 : 0, opacity: 0 }}
        transition={{ duration: 0.55, ease: "easeOut" }}
      />
      <motion.div className="demo-cursor" style={{ x, y, scale, opacity }}>
        <svg width="26" height="26" viewBox="0 0 32 32">
          <g fillRule="evenodd" transform="translate(10 7)">
            <path
              fill="#15100c"
              d="m6.148 18.473 1.863-1.003 1.615-.839-2.568-4.816h4.332l-11.379-11.408v16.015l3.316-3.221z"
            />
            <path fill="#ffffff" d="m6.431 17 1.765-.941-2.775-5.202h3.604l-8.025-8.043v11.188l2.53-2.442z" />
          </g>
        </svg>
      </motion.div>

      <style jsx global>{`
        .demo-cursor-layer {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 40;
        }
        .demo-cursor {
          position: fixed;
          top: 0;
          left: 0;
          width: 26px;
          height: 26px;
          margin: -3px 0 0 -4px;
          will-change: transform;
        }
        .demo-cursor svg {
          display: block;
          filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.5));
        }
        .demo-ripple {
          position: fixed;
          top: 0;
          left: 0;
          width: 36px;
          height: 36px;
          margin: -18px 0 0 -18px;
          border-radius: 50%;
          border: 2px solid rgba(165, 31, 45, 0.75);
          will-change: transform, opacity;
        }
      `}</style>
    </div>
  );
}
