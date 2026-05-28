"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Floating "Ask Maple" orb — a polished 3D sphere built from layered CSS:
 *   - a luminous halo that breathes around the orb,
 *   - a sphere base shaded as a proper lit object (light from upper-left,
 *     shadow on bottom-right, thin bright rim where the edge refracts),
 *   - a slow iridescent conic gradient that turns inside for life,
 *   - a soft "soul" core that pulses gently,
 *   - a crisp specular crescent reading as glass.
 * Routes to the full /chat page; hidden on /chat itself. No icon — the orb is
 * the affordance; a tooltip slides in on hover/focus.
 */
export function ChatFab() {
  const pathname = usePathname();
  if (pathname === "/chat") return null;

  return (
    <Link href="/chat" aria-label="Ask Maple — your rewards advisor" className="maple-orb-fab">
      <span className="maple-orb-halo" aria-hidden />
      <span className="maple-orb-sphere" aria-hidden>
        <span className="maple-orb-iris" aria-hidden />
        <span className="maple-orb-core" aria-hidden />
        <span className="maple-orb-glint" aria-hidden />
      </span>
      <span className="maple-orb-tooltip">Ask Maple</span>

      <style jsx global>{`
        .maple-orb-fab {
          position: fixed;
          z-index: 50;
          bottom: 80px;
          right: 20px;
          width: 80px;
          height: 80px;
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

        /* ── Halo ──────────────────────────────────────────────────────────
         * Diffuse cool glow around the sphere, slowly breathing. Tight enough
         * to read as the sphere's own luminance, not a generic blur. */
        .maple-orb-halo {
          position: absolute;
          inset: -10px;
          border-radius: 50%;
          background: radial-gradient(
            closest-side,
            rgba(130, 195, 255, 0.55),
            rgba(160, 130, 240, 0.22) 50%,
            rgba(120, 180, 255, 0) 78%
          );
          filter: blur(9px);
          opacity: 0.85;
          animation: maple-orb-halo 4.2s ease-in-out infinite;
          z-index: 0;
          pointer-events: none;
        }
        @keyframes maple-orb-halo {
          0%, 100% { opacity: 0.7; transform: scale(1); }
          50%      { opacity: 1;   transform: scale(1.05); }
        }

        /* ── Sphere base ──────────────────────────────────────────────────
         * The 3D form. A radial gradient places a bright lit area at upper-
         * left and a deep shadow at bottom-right. Box-shadows add a thin
         * bright rim + a soft contact shadow + a touch of outer glow. */
        .maple-orb-sphere {
          position: relative;
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background:
            radial-gradient(
              circle at 30% 26%,
              rgba(220, 240, 255, 0.95) 0%,
              rgba(140, 195, 255, 0.55) 16%,
              rgba(60, 115, 220, 0.65) 38%,
              rgba(25, 55, 140, 0.95) 70%,
              rgba(8, 18, 60, 1) 100%
            );
          box-shadow:
            /* bright top edge — the lit hemisphere catches light */
            inset 0 1.5px 0 rgba(255, 255, 255, 0.45),
            /* darker bottom — the shaded hemisphere */
            inset 0 -10px 22px rgba(6, 14, 50, 0.72),
            /* bottom-right shaded curve, sells the 3D form */
            inset -8px -10px 24px rgba(0, 0, 0, 0.45),
            /* thin bright rim where the light refracts around the edge */
            inset 0 0 0 0.5px rgba(180, 215, 255, 0.30),
            /* contact shadow under the orb */
            0 18px 36px rgba(10, 20, 70, 0.55),
            /* gentle ambient glow */
            0 0 22px rgba(120, 180, 255, 0.28);
          overflow: hidden;
          z-index: 1;
        }

        /* ── Iridescence ──────────────────────────────────────────────────
         * A slow-rotating conic gradient inside the sphere adds a subtle
         * shifting iridescence (blue↔cyan↔violet) — the "alive" quality
         * without being garish. screen blend lifts the colors over the base. */
        .maple-orb-iris {
          position: absolute;
          inset: 6px;
          border-radius: 50%;
          background: conic-gradient(
            from 0deg,
            rgba(120, 200, 255, 0.55),
            rgba(170, 140, 255, 0.42) 22%,
            rgba(80, 130, 240, 0.25) 50%,
            rgba(145, 220, 255, 0.50) 76%,
            rgba(120, 200, 255, 0.55)
          );
          mix-blend-mode: screen;
          opacity: 0.7;
          filter: blur(8px);
          animation: maple-orb-iris 22s linear infinite;
          pointer-events: none;
        }
        @keyframes maple-orb-iris {
          to { transform: rotate(360deg); }
        }

        /* ── Core ──────────────────────────────────────────────────────────
         * The soul. A soft cyan-white inner light, gentle 3.2s breathing.
         * screen blend keeps it luminous over the sphere instead of muddy. */
        .maple-orb-core {
          position: absolute;
          top: 48%;
          left: 47%;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          transform: translate(-50%, -50%);
          background: radial-gradient(
            circle at 50% 50%,
            rgba(252, 254, 255, 0.95) 0%,
            rgba(190, 225, 255, 0.70) 28%,
            rgba(110, 165, 240, 0.35) 60%,
            rgba(110, 165, 240, 0) 100%
          );
          filter: blur(4px);
          mix-blend-mode: screen;
          animation: maple-orb-core 3.2s ease-in-out infinite;
          pointer-events: none;
        }
        @keyframes maple-orb-core {
          0%, 100% { transform: translate(-50%, -50%) scale(0.88); opacity: 0.88; }
          50%      { transform: translate(-50%, -50%) scale(1.10); opacity: 1; }
        }

        /* ── Glint ────────────────────────────────────────────────────────
         * Crisp specular crescent at upper-left where the light source
         * reflects off the glass. Sells the sphere read. */
        .maple-orb-glint {
          position: absolute;
          top: 9px;
          left: 13px;
          width: 24px;
          height: 13px;
          border-radius: 50%;
          background: radial-gradient(
            closest-side,
            rgba(255, 255, 255, 0.85),
            rgba(255, 255, 255, 0.20) 60%,
            rgba(255, 255, 255, 0) 100%
          );
          filter: blur(1.4px);
          pointer-events: none;
          transform: rotate(-22deg);
        }

        /* ── Tooltip ──────────────────────────────────────────────────────
         * "ASK MAPLE" pill slides in from the right on hover/focus. */
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

        /* ── Interaction ──────────────────────────────────────────────── */
        .maple-orb-fab:hover {
          transform: scale(1.06);
        }
        .maple-orb-fab:hover .maple-orb-core {
          animation-duration: 2.1s;
        }
        .maple-orb-fab:hover .maple-orb-halo {
          opacity: 1;
        }
        .maple-orb-fab:focus-visible {
          outline: 2px solid #7fb7ff;
          outline-offset: 4px;
          border-radius: 50%;
        }

        @media (prefers-reduced-motion: reduce) {
          .maple-orb-halo,
          .maple-orb-core,
          .maple-orb-iris {
            animation: none;
          }
        }
      `}</style>
    </Link>
  );
}
