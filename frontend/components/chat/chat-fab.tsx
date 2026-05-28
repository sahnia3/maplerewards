"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Floating "Ask Maple" orb — Siri-style multi-colour blobs swirling inside a
 * glass sphere, with an atomic twist: a bright bloom-y nucleus + two electron
 * particles orbiting on elliptical paths, plus outward pulse-waves that ride
 * around the orb. Hover speeds everything up and fires a wider burst.
 *   - outer ambient halo (breathes),
 *   - two staggered pulse-wave rings expanding outward (3s + 6s staggered),
 *   - glass sphere shell (mostly transparent center, dark navy rim),
 *   - 4 colour blobs (teal, magenta, blue, soft white) — each drifts on its
 *     own slow keyframe and screen-blends so they overlap into iridescent
 *     swirls,
 *   - 2 electron particles orbiting on elliptical paths at different rates,
 *   - a hot white-yellow nucleus core that pulses (the "soul"),
 *   - a glass rim highlight ring.
 * Routes to /chat; hidden on /chat itself.
 */
export function ChatFab() {
  const pathname = usePathname();
  if (pathname === "/chat") return null;

  return (
    <Link href="/chat" aria-label="Ask Maple — your rewards advisor" className="maple-orb-fab">
      <span className="maple-orb-pulse pulse-1" aria-hidden />
      <span className="maple-orb-pulse pulse-2" aria-hidden />
      <span className="maple-orb-halo" aria-hidden />
      <span className="maple-orb-sphere" aria-hidden>
        <span className="maple-orb-blob blob-green" />
        <span className="maple-orb-blob blob-magenta" />
        <span className="maple-orb-blob blob-blue" />
        <span className="maple-orb-blob blob-white" />
        <span className="maple-orb-electron electron-a" />
        <span className="maple-orb-electron electron-b" />
        <span className="maple-orb-core" />
        <span className="maple-orb-rim" />
      </span>
      <span className="maple-orb-tooltip">Ask Maple</span>

      <style jsx global>{`
        .maple-orb-fab {
          position: fixed;
          z-index: 50;
          bottom: 80px;
          right: 20px;
          width: 84px;
          height: 84px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          text-decoration: none;
          isolation: isolate;
          cursor: pointer;
          transition: transform 380ms cubic-bezier(0.2, 0.7, 0.2, 1);
        }
        @media (min-width: 1024px) {
          .maple-orb-fab {
            bottom: 28px;
            right: 28px;
          }
        }

        /* ── Outward pulse rings ────────────────────────────────────────── */
        .maple-orb-pulse {
          position: absolute;
          inset: 8px;
          border-radius: 50%;
          border: 1.5px solid rgba(140, 195, 255, 0.55);
          opacity: 0;
          pointer-events: none;
          z-index: 0;
          animation: maple-orb-pulse 5.4s cubic-bezier(0.2, 0.7, 0.2, 1) infinite;
        }
        .pulse-2 {
          animation-delay: 2.7s;
        }
        @keyframes maple-orb-pulse {
          0%   { transform: scale(0.92); opacity: 0; border-width: 1.5px; }
          12%  { opacity: 0.55; }
          100% { transform: scale(2.0); opacity: 0; border-width: 0.5px; }
        }

        /* ── Ambient halo ───────────────────────────────────────────────── */
        .maple-orb-halo {
          position: absolute;
          inset: -10px;
          border-radius: 50%;
          background: radial-gradient(
            closest-side,
            rgba(140, 195, 255, 0.45),
            rgba(180, 130, 255, 0.20) 50%,
            rgba(100, 160, 240, 0) 78%
          );
          filter: blur(10px);
          opacity: 0.85;
          animation: maple-orb-halo 4.6s ease-in-out infinite;
          z-index: 0;
          pointer-events: none;
        }
        @keyframes maple-orb-halo {
          0%, 100% { opacity: 0.65; transform: scale(1); }
          50%      { opacity: 1;    transform: scale(1.05); }
        }

        /* ── Glass sphere ───────────────────────────────────────────────── */
        .maple-orb-sphere {
          position: relative;
          width: 68px;
          height: 68px;
          border-radius: 50%;
          background: radial-gradient(
            circle at 50% 50%,
            rgba(15, 25, 55, 0.05) 0%,
            rgba(12, 22, 50, 0.18) 55%,
            rgba(10, 20, 50, 0.78) 88%,
            rgba(5, 12, 38, 1) 100%
          );
          box-shadow:
            inset 0 1.5px 0 rgba(255, 255, 255, 0.40),
            inset 0 -10px 22px rgba(0, 0, 0, 0.55),
            inset 0 0 0 1px rgba(150, 190, 240, 0.18),
            0 16px 36px rgba(10, 20, 70, 0.55),
            0 0 22px rgba(120, 180, 255, 0.25);
          overflow: hidden;
          z-index: 1;
        }

        /* ── Inner colour blobs ─────────────────────────────────────────── */
        .maple-orb-blob {
          position: absolute;
          border-radius: 50%;
          mix-blend-mode: screen;
          filter: blur(7px);
          pointer-events: none;
        }
        .blob-green {
          width: 44px; height: 44px;
          top: 6%; left: 4%;
          background: radial-gradient(circle at 50% 50%,
            rgba(40, 235, 195, 0.95) 0%,
            rgba(40, 235, 195, 0.45) 50%,
            rgba(40, 235, 195, 0) 100%);
          animation: maple-blob-a 6.5s ease-in-out infinite alternate;
        }
        .blob-magenta {
          width: 46px; height: 46px;
          top: 50%; left: 0;
          background: radial-gradient(circle at 50% 50%,
            rgba(255, 80, 130, 0.95) 0%,
            rgba(255, 80, 130, 0.45) 50%,
            rgba(255, 80, 130, 0) 100%);
          animation: maple-blob-b 7.8s ease-in-out infinite alternate;
        }
        .blob-blue {
          width: 50px; height: 50px;
          top: 26%; right: -4%;
          background: radial-gradient(circle at 50% 50%,
            rgba(70, 150, 255, 0.95) 0%,
            rgba(70, 150, 255, 0.45) 50%,
            rgba(70, 150, 255, 0) 100%);
          animation: maple-blob-c 8.8s ease-in-out infinite alternate;
        }
        .blob-white {
          width: 30px; height: 30px;
          top: 32%; left: 38%;
          background: radial-gradient(circle at 50% 50%,
            rgba(255, 255, 255, 0.85) 0%,
            rgba(255, 255, 255, 0.25) 50%,
            rgba(255, 255, 255, 0) 100%);
          animation: maple-blob-d 5.6s ease-in-out infinite alternate;
        }
        @keyframes maple-blob-a {
          from { transform: translate(0, 0)     scale(1)    rotate(0deg);   }
          to   { transform: translate(9px, 7px) scale(1.18) rotate(45deg);  }
        }
        @keyframes maple-blob-b {
          from { transform: translate(0, 0)       scale(1)    rotate(0deg);   }
          to   { transform: translate(11px, -9px) scale(1.12) rotate(-35deg); }
        }
        @keyframes maple-blob-c {
          from { transform: translate(0, 0)      scale(1)    rotate(0deg);  }
          to   { transform: translate(-10px, 7px) scale(0.86) rotate(40deg); }
        }
        @keyframes maple-blob-d {
          from { transform: translate(0, 0)      scale(1)    rotate(0deg);   }
          to   { transform: translate(-4px, -6px) scale(1.24) rotate(-50deg); }
        }

        /* ── Orbital electrons ──────────────────────────────────────────── */
        /* Two bright particles tracing elliptical orbits inside the sphere,
         * different radii / speeds / phases — atomic feel. The translate-then-
         * translate trick centres the keyframes on the orb middle. */
        .maple-orb-electron {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 4px;
          height: 4px;
          margin: -2px 0 0 -2px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.95);
          box-shadow:
            0 0 4px 1px rgba(180, 220, 255, 0.90),
            0 0 10px 2px rgba(120, 180, 255, 0.55);
          pointer-events: none;
          z-index: 2;
        }
        .electron-a {
          animation: maple-electron-a 3.2s linear infinite;
        }
        .electron-b {
          animation: maple-electron-b 4.4s linear infinite reverse;
        }
        /* Ellipse 26×13, tilted via the 25%/75% peaks. */
        @keyframes maple-electron-a {
          0%   { transform: translate(26px,  0)   scale(1); }
          25%  { transform: translate(0,    -13px) scale(0.7); }
          50%  { transform: translate(-26px, 0)   scale(1); }
          75%  { transform: translate(0,     13px) scale(1.2); }
          100% { transform: translate(26px,  0)   scale(1); }
        }
        /* Ellipse 14×26, perpendicular tilt. */
        @keyframes maple-electron-b {
          0%   { transform: translate(0,    -26px) scale(1.1); }
          25%  { transform: translate(14px,  0)   scale(0.7); }
          50%  { transform: translate(0,     26px) scale(1.1); }
          75%  { transform: translate(-14px, 0)   scale(1.3); }
          100% { transform: translate(0,    -26px) scale(1.1); }
        }

        /* ── Hot core (nucleus) ─────────────────────────────────────────── */
        .maple-orb-core {
          position: absolute;
          top: 50%; left: 50%;
          width: 18px; height: 18px;
          border-radius: 50%;
          transform: translate(-50%, -50%);
          background: radial-gradient(circle at 50% 50%,
            rgba(255, 255, 245, 1) 0%,
            rgba(255, 248, 210, 0.92) 25%,
            rgba(255, 230, 170, 0.55) 55%,
            rgba(255, 220, 160, 0) 100%);
          filter: blur(2.5px);
          mix-blend-mode: screen;
          animation: maple-orb-core 2.4s ease-in-out infinite;
          z-index: 3;
          pointer-events: none;
        }
        @keyframes maple-orb-core {
          0%, 100% { transform: translate(-50%, -50%) scale(0.85); opacity: 0.95; }
          50%      { transform: translate(-50%, -50%) scale(1.18); opacity: 1; }
        }

        /* ── Glass rim ──────────────────────────────────────────────────── */
        .maple-orb-rim {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          pointer-events: none;
          background: linear-gradient(
            to bottom,
            rgba(255, 255, 255, 0.22) 0%,
            rgba(255, 255, 255, 0) 30%,
            rgba(255, 255, 255, 0) 70%,
            rgba(0, 0, 0, 0.18) 100%
          );
          mix-blend-mode: overlay;
          z-index: 4;
        }

        /* ── Tooltip ────────────────────────────────────────────────────── */
        .maple-orb-tooltip {
          position: absolute;
          right: calc(100% + 10px);
          top: 50%;
          transform: translateY(-50%) translateX(6px);
          padding: 7px 13px;
          background: rgba(14, 18, 28, 0.94);
          color: #fff;
          font-family: var(--font-mono, ui-monospace, monospace);
          font-size: 11px;
          letter-spacing: 0.10em;
          text-transform: uppercase;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          white-space: nowrap;
          opacity: 0;
          transition: opacity 220ms ease, transform 220ms ease;
          pointer-events: none;
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
        }
        .maple-orb-fab:hover .maple-orb-tooltip,
        .maple-orb-fab:focus-visible .maple-orb-tooltip {
          opacity: 1;
          transform: translateY(-50%) translateX(0);
        }

        /* ── Hover — everything wakes up ────────────────────────────────── */
        .maple-orb-fab:hover {
          transform: scale(1.1);
        }
        .maple-orb-fab:hover .maple-orb-core {
          animation-duration: 1.2s;
          filter: blur(2px) brightness(1.25);
        }
        .maple-orb-fab:hover .maple-orb-halo {
          opacity: 1;
          animation-duration: 2.4s;
        }
        .maple-orb-fab:hover .maple-orb-pulse {
          animation-duration: 2.4s;
        }
        .maple-orb-fab:hover .pulse-2 {
          animation-delay: 1.2s;
        }
        .maple-orb-fab:hover .electron-a {
          animation-duration: 1.6s;
        }
        .maple-orb-fab:hover .electron-b {
          animation-duration: 2.2s;
        }
        .maple-orb-fab:hover .blob-green   { animation-duration: 3.2s; }
        .maple-orb-fab:hover .blob-magenta { animation-duration: 3.9s; }
        .maple-orb-fab:hover .blob-blue    { animation-duration: 4.4s; }
        .maple-orb-fab:hover .blob-white   { animation-duration: 2.8s; }

        .maple-orb-fab:focus-visible {
          outline: 2px solid #7fb7ff;
          outline-offset: 4px;
          border-radius: 50%;
        }

        @media (prefers-reduced-motion: reduce) {
          .maple-orb-halo,
          .maple-orb-core,
          .maple-orb-blob,
          .maple-orb-electron,
          .maple-orb-pulse {
            animation: none;
          }
        }
      `}</style>
    </Link>
  );
}
