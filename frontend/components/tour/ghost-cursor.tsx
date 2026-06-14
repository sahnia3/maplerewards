"use client";

import { useEffect, useRef } from "react";
import { useAnimate } from "framer-motion";

/* A self-driving cursor that performs the real optimizer task on the live page:
 * picks a category, types an amount into the real input (dispatching native
 * input events so React's controlled state updates), clicks the real Rank
 * button, and waits for the genuine winner to render. Best-effort: if any
 * target is missing or the backend is slow, it bows out gracefully. */

function centerOf(sel: string): { x: number; y: number } | null {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

function setNativeValue(input: HTMLInputElement, value: string) {
  const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value");
  desc?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

export function GhostCursor({ onDone }: { onDone: () => void }) {
  const [scope, animate] = useAnimate();
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    let cancelled = false;

    const moveTo = async (sel: string) => {
      const c = centerOf(sel);
      if (!c) return false;
      await animate(scope.current, { x: c.x, y: c.y }, { duration: 0.7, ease: [0.22, 1, 0.36, 1] });
      return !cancelled;
    };
    const clickPulse = async () => {
      await animate(scope.current, { scale: 0.66 }, { duration: 0.12 });
      await animate(scope.current, { scale: 1 }, { duration: 0.18 });
    };

    (async () => {
      try {
        await animate(
          scope.current,
          { x: window.innerWidth / 2, y: window.innerHeight / 2, opacity: 1 },
          { duration: 0 },
        );
        await sleep(450);

        // 1. category pill
        if (await moveTo('[data-tour-id^="category-pill-"]')) {
          await clickPulse();
          (document.querySelector('[data-tour-id^="category-pill-"]') as HTMLElement | null)?.click();
        }
        if (cancelled) return;
        await sleep(320);

        // 2. amount input — type "200" character by character
        if (await moveTo('[data-tour-id="amount-input"]')) {
          await clickPulse();
          const input = document.querySelector('[data-tour-id="amount-input"]') as HTMLInputElement | null;
          if (input) {
            input.focus();
            const val = "200";
            for (let i = 1; i <= val.length; i++) {
              if (cancelled) return;
              setNativeValue(input, val.slice(0, i));
              await sleep(170);
            }
          }
        }
        if (cancelled) return;
        await sleep(320);

        // 3. Rank
        if (await moveTo('[data-tour-id="rank-button"]')) {
          await clickPulse();
          (document.querySelector('[data-tour-id="rank-button"]') as HTMLElement | null)?.click();
        }

        // 4. await the genuine winner, then point at it
        for (let i = 0; i < 60 && !cancelled; i++) {
          if (document.querySelector('[data-tour-id="winner-card"]')) break;
          await sleep(80);
        }
        if (cancelled) return;
        await moveTo('[data-tour-id="winner-card"]');
        onDone();
      } catch {
        onDone();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [animate, scope, onDone]);

  return (
    <div ref={scope} className="ghost-cursor" aria-hidden>
      <style jsx>{`
        .ghost-cursor {
          position: fixed;
          top: 0;
          left: 0;
          width: 26px;
          height: 26px;
          margin: -13px 0 0 -13px;
          border-radius: 999px;
          opacity: 0;
          background: radial-gradient(
            circle at 38% 34%,
            rgba(255, 255, 255, 0.95),
            rgba(165, 31, 45, 0.85) 60%,
            rgba(165, 31, 45, 0) 100%
          );
          box-shadow: 0 0 18px rgba(165, 31, 45, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3);
          pointer-events: none;
          z-index: 4;
          will-change: transform;
        }
      `}</style>
    </div>
  );
}
