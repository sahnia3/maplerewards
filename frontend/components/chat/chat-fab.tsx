"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Floating "Ask Maple" orb. A hand-crafted glowing sphere — layered radial
 * gradients build a glass shell with a soft light from within, a slow breathing
 * pulse, and a tiny specular glint. Routes to the full /chat page; hidden on
 * /chat itself. No icon — the orb IS the affordance, with a tooltip on hover.
 */
export function ChatFab() {
  const pathname = usePathname();
  if (pathname === "/chat") return null;

  return (
    <Link href="/chat" aria-label="Ask Maple — your rewards advisor" className="maple-orb-fab">
      <span className="maple-orb-halo" aria-hidden />
      <span className="maple-orb-shell" aria-hidden>
        <span className="maple-orb-core" aria-hidden />
        <span className="maple-orb-glint" aria-hidden />
      </span>
      <span className="maple-orb-tooltip">Ask Maple</span>

      <style jsx global>{`
        .maple-orb-fab {
          position: fixed;
          z-index: 50;
          bottom: 80px;
          right: 22px;
          width: 64px;
          height: 64px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          text-decoration: none;
          isolation: isolate;
          cursor: pointer;
          transition: transform 320ms cubic-bezier(0.2, 0.7, 0.2, 1);
        }
        @media (min-width: 1024px) {
          .maple-orb-fab {
            bottom: 28px;
            right: 28px;
          }
        }

        /* Ambient halo — diffuse glow that breathes around the sphere. */
        .maple-orb-halo {
          position: absolute;
          inset: -14px;
          border-radius: 50%;
          background: radial-gradient(
            closest-side,
            rgba(165, 31, 45, 0.55),
            rgba(165, 31, 45, 0.18) 55%,
            rgba(165, 31, 45, 0) 78%
          );
          filter: blur(6px);
          opacity: 0.9;
          animation: maple-orb-halo 3.6s ease-in-out infinite;
          z-index: 0;
          pointer-events: none;
        }
        @keyframes maple-orb-halo {
          0%, 100% { transform: scale(1); opacity: 0.85; }
          50%      { transform: scale(1.08); opacity: 1; }
        }

        /* Glass sphere shell — a layered radial gradient gives the orb depth:
           a faint highlight off-centre, a warm body, a dark rim, plus inner
           shadows that read as a translucent glass surface. */
        .maple-orb-shell {
          position: relative;
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background:
            radial-gradient(
              circle at 32% 30%,
              rgba(255, 235, 240, 0.18) 0%,
              rgba(220, 60, 80, 0.35) 28%,
              rgba(130, 18, 32, 0.92) 70%,
              rgba(48, 6, 12, 1) 100%
            );
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.22),
            inset 0 -3px 10px rgba(0, 0, 0, 0.48),
            0 10px 28px rgba(0, 0, 0, 0.55),
            0 0 0 1px rgba(255, 255, 255, 0.05);
          overflow: hidden;
          z-index: 1;
        }

        /* The "light from within" — a soft glowing core that pulses gently. */
        .maple-orb-core {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          transform: translate(-50%, -50%);
          background: radial-gradient(
            circle at 50% 50%,
            rgba(255, 245, 235, 0.98) 0%,
            rgba(255, 170, 175, 0.72) 30%,
            rgba(220, 60, 80, 0.42) 62%,
            rgba(220, 60, 80, 0) 100%
          );
          filter: blur(4px);
          animation: maple-orb-core 2.8s ease-in-out infinite;
        }
        @keyframes maple-orb-core {
          0%, 100% { transform: translate(-50%, -50%) scale(0.90); opacity: 0.92; }
          50%      { transform: translate(-50%, -50%) scale(1.12); opacity: 1; }
        }

        /* Specular crescent at top-left — sells the glass-sphere read. */
        .maple-orb-glint {
          position: absolute;
          top: 7px;
          left: 11px;
          width: 22px;
          height: 13px;
          border-radius: 50%;
          background: radial-gradient(
            closest-side,
            rgba(255, 255, 255, 0.55),
            rgba(255, 255, 255, 0.10) 60%,
            rgba(255, 255, 255, 0) 100%
          );
          filter: blur(1.2px);
          pointer-events: none;
        }

        /* "Ask Maple" tooltip slides in from the right on hover/focus. */
        .maple-orb-tooltip {
          position: absolute;
          right: calc(100% + 12px);
          top: 50%;
          transform: translateY(-50%) translateX(6px);
          padding: 7px 12px;
          background: rgba(20, 14, 16, 0.92);
          color: #fff;
          font-family: var(--font-mono, ui-monospace, monospace);
          font-size: 11px;
          letter-spacing: 0.10em;
          text-transform: uppercase;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          white-space: nowrap;
          opacity: 0;
          transition: opacity 200ms ease, transform 200ms ease;
          pointer-events: none;
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
        }
        .maple-orb-fab:hover .maple-orb-tooltip,
        .maple-orb-fab:focus-visible .maple-orb-tooltip {
          opacity: 1;
          transform: translateY(-50%) translateX(0);
        }
        .maple-orb-fab:hover {
          transform: scale(1.06);
        }
        .maple-orb-fab:hover .maple-orb-core {
          animation-duration: 1.8s;
        }
        .maple-orb-fab:hover .maple-orb-halo {
          opacity: 1;
        }
        .maple-orb-fab:focus-visible {
          outline: 2px solid var(--accent, #a51f2d);
          outline-offset: 4px;
          border-radius: 50%;
        }

        @media (prefers-reduced-motion: reduce) {
          .maple-orb-halo,
          .maple-orb-core {
            animation: none;
          }
        }
      `}</style>
    </Link>
  );
}
