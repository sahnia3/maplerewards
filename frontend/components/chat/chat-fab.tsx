"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Floating "Ask Maple" orb — Siri-style liquid-light sphere. Layered, all CSS:
 *   - outer multi-hue halo that breathes,
 *   - dark glass body (so the colours pop via screen-blend) with a specular
 *     glass highlight + a shaded rim for real sphere depth,
 *   - a slowly ROTATING iridescent conic base (the shifting-colour sheen),
 *   - FOUR saturated colour lobes (teal, magenta, blue, violet) that drift,
 *     scale and rotate on distinct timings so the interior visibly swirls,
 *   - a soft bright core that gently pulses.
 * No straight light-streaks — the motion + overlap do the work. Hover speeds
 * the swirl and brightens the core. Routes to /chat; hidden on /chat.
 */
export function ChatFab() {
  const pathname = usePathname();
  if (pathname === "/chat") return null;

  return (
    <Link href="/chat" aria-label="Ask Maple — your rewards advisor" className="maple-orb-fab" data-tour-id="ask-maple-orb">
      <span className="maple-orb-halo" aria-hidden />
      <span className="maple-orb-sphere" aria-hidden>
        <span className="maple-orb-iris" />
        <span className="maple-orb-lobe lobe-teal" />
        <span className="maple-orb-lobe lobe-magenta" />
        <span className="maple-orb-lobe lobe-blue" />
        <span className="maple-orb-lobe lobe-violet" />
        <span className="maple-orb-core" />
        <span className="maple-orb-gloss" />
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
          background: transparent;
          transition: transform 380ms cubic-bezier(0.2, 0.7, 0.2, 1);
        }
        @media (min-width: 1024px) {
          .maple-orb-fab { bottom: 28px; right: 28px; }
        }
        /* Mobile (esp. iOS Safari): mix-blend-mode + isolation composite the
           orb's square layer as an opaque box — the "orb in a box" bug. On
           phones we drop isolation and every blend-mode layer and paint a clean,
           darker iridescent glass sphere with a baked gradient. Same look on a
           truly transparent background, and it can't render a box on WebKit. */
        @media (max-width: 1023px) {
          .maple-orb-fab { isolation: auto; }
          .maple-orb-halo,
          .maple-orb-iris,
          .maple-orb-lobe,
          .maple-orb-core,
          .maple-orb-gloss,
          .maple-orb-rim { display: none !important; }
          /* Self-illuminated iridescent sphere — no mix-blend-mode (iOS-safe).
             Bright colour lobes cover the body over a luminous blue/violet base,
             with a white specular highlight so it still reads as glass.
             !important: the base .maple-orb-sphere rule (dark glass body) appears
             LATER in this stylesheet and would otherwise win at equal specificity
             on mobile, repainting the orb black. */
          .maple-orb-sphere {
            background:
              radial-gradient(closest-side at 32% 26%, rgba(255, 255, 255, 0.92) 0%, rgba(255, 255, 255, 0) 30%),
              radial-gradient(135% 135% at 24% 22%, rgba(56, 224, 200, 0.95) 0%, rgba(56, 224, 200, 0) 48%),
              radial-gradient(140% 140% at 80% 30%, rgba(60, 140, 255, 0.95) 0%, rgba(60, 140, 255, 0) 54%),
              radial-gradient(150% 150% at 78% 82%, rgba(236, 86, 172, 0.92) 0%, rgba(236, 86, 172, 0) 56%),
              radial-gradient(150% 150% at 22% 84%, rgba(154, 94, 255, 0.9) 0%, rgba(154, 94, 255, 0) 56%),
              radial-gradient(circle at 50% 46%, #62acff 0%, #4170e2 60%, #5b3fb0 100%) !important;
            box-shadow:
              inset 0 2px 3px rgba(255, 255, 255, 0.65),
              inset 0 -8px 18px rgba(40, 20, 90, 0.32),
              0 8px 22px rgba(40, 60, 160, 0.45),
              0 0 16px rgba(90, 150, 235, 0.4) !important;
          }
        }

        /* ── Ambient multi-hue halo ─────────────────────────────────────── */
        .maple-orb-halo {
          position: absolute;
          inset: -12px;
          border-radius: 50%;
          background: radial-gradient(closest-side,
            rgba(120, 210, 255, 0.50),
            rgba(180, 120, 255, 0.26) 48%,
            rgba(255, 90, 150, 0.12) 68%,
            rgba(120, 180, 255, 0) 80%);
          filter: blur(11px);
          opacity: 0.9;
          animation: maple-orb-halo 4.6s ease-in-out infinite;
          z-index: 0;
          pointer-events: none;
        }
        @keyframes maple-orb-halo {
          0%, 100% { opacity: 0.7; transform: scale(1) rotate(0deg); }
          50%      { opacity: 1;   transform: scale(1.06) rotate(8deg); }
        }

        /* ── Glass body ─────────────────────────────────────────────────── */
        .maple-orb-sphere {
          position: relative;
          width: 70px;
          height: 70px;
          border-radius: 50%;
          background: radial-gradient(circle at 50% 42%,
            rgba(12, 18, 38, 0.55) 0%,
            rgba(7, 12, 30, 0.82) 58%,
            rgba(4, 7, 20, 0.96) 86%,
            rgba(2, 4, 12, 1) 100%);
          box-shadow:
            inset 0 2px 1px rgba(255, 255, 255, 0.40),
            inset 0 -12px 26px rgba(0, 0, 0, 0.68),
            inset -7px -9px 22px rgba(0, 0, 0, 0.50),
            inset 0 0 0 1px rgba(150, 195, 255, 0.18),
            0 12px 28px rgba(4, 8, 30, 0.55),
            0 0 14px rgba(90, 150, 235, 0.18);
          overflow: hidden;
          z-index: 1;
        }

        /* ── Iridescent rotating base (the colour sheen) ────────────────── */
        .maple-orb-iris {
          position: absolute;
          inset: -20%;
          border-radius: 50%;
          background: conic-gradient(from 0deg,
            rgba(40, 235, 195, 0.55),
            rgba(70, 150, 255, 0.55) 25%,
            rgba(160, 90, 255, 0.50) 50%,
            rgba(255, 80, 140, 0.55) 72%,
            rgba(40, 235, 195, 0.55) 100%);
          filter: blur(9px);
          mix-blend-mode: screen;
          opacity: 0.7;
          animation: maple-orb-spin 14s linear infinite;
          pointer-events: none;
        }
        @keyframes maple-orb-spin { to { transform: rotate(360deg); } }

        /* ── Colour lobes ───────────────────────────────────────────────── */
        .maple-orb-lobe {
          position: absolute;
          border-radius: 50%;
          mix-blend-mode: screen;
          filter: blur(8px);
          pointer-events: none;
        }
        .lobe-teal {
          width: 52px; height: 52px; top: -2%; left: -2%;
          background: radial-gradient(circle at 50% 50%,
            rgba(40, 240, 200, 1) 0%, rgba(40, 240, 200, 0.5) 48%, rgba(40, 240, 200, 0) 100%);
          animation: maple-lobe-a 6s ease-in-out infinite alternate;
        }
        .lobe-magenta {
          width: 56px; height: 56px; top: 44%; left: -6%;
          background: radial-gradient(circle at 50% 50%,
            rgba(255, 70, 140, 1) 0%, rgba(255, 70, 140, 0.5) 48%, rgba(255, 70, 140, 0) 100%);
          animation: maple-lobe-b 7.4s ease-in-out infinite alternate;
        }
        .lobe-blue {
          width: 58px; height: 58px; top: 18%; right: -8%;
          background: radial-gradient(circle at 50% 50%,
            rgba(55, 135, 255, 1) 0%, rgba(55, 135, 255, 0.5) 48%, rgba(55, 135, 255, 0) 100%);
          animation: maple-lobe-c 8.6s ease-in-out infinite alternate;
        }
        .lobe-violet {
          width: 46px; height: 46px; top: 40%; left: 36%;
          background: radial-gradient(circle at 50% 50%,
            rgba(165, 95, 255, 0.95) 0%, rgba(165, 95, 255, 0.45) 48%, rgba(165, 95, 255, 0) 100%);
          animation: maple-lobe-d 5.4s ease-in-out infinite alternate;
        }
        @keyframes maple-lobe-a {
          from { transform: translate(0,0) scale(1) rotate(0deg); }
          to   { transform: translate(12px, 10px) scale(1.22) rotate(60deg); }
        }
        @keyframes maple-lobe-b {
          from { transform: translate(0,0) scale(1) rotate(0deg); }
          to   { transform: translate(14px, -12px) scale(1.15) rotate(-50deg); }
        }
        @keyframes maple-lobe-c {
          from { transform: translate(0,0) scale(1) rotate(0deg); }
          to   { transform: translate(-13px, 11px) scale(0.82) rotate(55deg); }
        }
        @keyframes maple-lobe-d {
          from { transform: translate(0,0) scale(0.9) rotate(0deg); }
          to   { transform: translate(-9px, -10px) scale(1.3) rotate(-65deg); }
        }

        /* ── Soft bright core ───────────────────────────────────────────── */
        .maple-orb-core {
          position: absolute;
          top: 50%; left: 50%;
          width: 30px; height: 30px;
          border-radius: 50%;
          transform: translate(-50%, -50%);
          background: radial-gradient(circle at 50% 50%,
            rgba(255, 255, 252, 0.95) 0%,
            rgba(245, 250, 255, 0.6) 30%,
            rgba(220, 235, 255, 0.22) 60%,
            rgba(220, 235, 255, 0) 100%);
          filter: blur(4px);
          mix-blend-mode: screen;
          animation: maple-orb-core 3s ease-in-out infinite;
          z-index: 3;
          pointer-events: none;
        }
        @keyframes maple-orb-core {
          0%, 100% { transform: translate(-50%, -50%) scale(0.85); opacity: 0.85; }
          50%      { transform: translate(-50%, -50%) scale(1.12); opacity: 1; }
        }

        /* ── Specular glass highlight (top-left) ────────────────────────── */
        .maple-orb-gloss {
          position: absolute;
          top: 9px; left: 14px;
          width: 26px; height: 16px;
          border-radius: 50%;
          background: radial-gradient(closest-side,
            rgba(255, 255, 255, 0.7), rgba(255, 255, 255, 0.12) 60%, rgba(255, 255, 255, 0) 100%);
          transform: rotate(-24deg);
          filter: blur(1px);
          z-index: 4;
          pointer-events: none;
        }

        /* ── Rim shading for sphere depth ───────────────────────────────── */
        .maple-orb-rim {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          pointer-events: none;
          background: radial-gradient(circle at 50% 120%,
            rgba(0, 0, 0, 0.45) 0%, rgba(0, 0, 0, 0) 55%);
          z-index: 5;
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

        /* ── Hover — the swirl wakes up ─────────────────────────────────── */
        .maple-orb-fab:hover { transform: scale(1.08); }
        .maple-orb-fab:hover .maple-orb-iris   { animation-duration: 7s; }
        .maple-orb-fab:hover .maple-orb-core   { animation-duration: 1.6s; filter: blur(3px) brightness(1.2); }
        .maple-orb-fab:hover .maple-orb-halo   { opacity: 1; animation-duration: 2.6s; }
        .maple-orb-fab:hover .lobe-teal    { animation-duration: 3s; }
        .maple-orb-fab:hover .lobe-magenta { animation-duration: 3.7s; }
        .maple-orb-fab:hover .lobe-blue    { animation-duration: 4.3s; }
        .maple-orb-fab:hover .lobe-violet  { animation-duration: 2.7s; }

        .maple-orb-fab:focus-visible {
          outline: 2px solid #7fb7ff;
          outline-offset: 4px;
          border-radius: 50%;
        }

        @media (prefers-reduced-motion: reduce) {
          .maple-orb-halo, .maple-orb-iris, .maple-orb-core, .maple-orb-lobe {
            animation: none;
          }
        }
      `}</style>
    </Link>
  );
}
