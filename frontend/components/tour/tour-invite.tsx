"use client";

import { createPortal } from "react-dom";
import { useTour } from "@/contexts/tour-context";
import { MapleLeaf } from "@/components/editorial/leaf-divider";

/* The new-account invite: a small branded pop-up that offers the tour instead of
 * launching it. Shown once for a fresh account; "Maybe later" never re-nags. */
export function TourInvite() {
  const tour = useTour();
  if (!tour.invite || tour.active || typeof document === "undefined") return null;

  return createPortal(
    <div className="tinv-root" role="dialog" aria-modal aria-label="Welcome to MapleRewards" onClick={tour.dismissInvite}>
      <div className="tinv-card" onClick={(e) => e.stopPropagation()}>
        <span className="tinv-eyebrow">
          <MapleLeaf size={13} fill="var(--accent)" /> Welcome to MapleRewards
        </span>
        <h2 className="tinv-title">Want a quick tour?</h2>
        <p className="tinv-body">
          About a minute to see how MapleRewards finds the best card for every purchase, tracks your welcome
          bonuses, and where the Pro tools pay off.
        </p>
        <div className="tinv-actions">
          <button type="button" className="tinv-later" onClick={tour.dismissInvite}>
            Maybe later
          </button>
          <button type="button" className="tinv-start" onClick={tour.start}>
            Take the tour
          </button>
        </div>
      </div>

      <style jsx global>{`
        .tinv-root {
          position: fixed;
          inset: 0;
          z-index: 1001;
          display: grid;
          place-items: center;
          padding: 20px;
          background: rgba(8, 10, 14, 0.5);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          animation: tinvFade 220ms ease;
        }
        .tinv-card {
          width: 100%;
          max-width: 420px;
          background: var(--surface);
          border: 1px solid var(--rule);
          border-radius: 20px;
          box-shadow: 0 30px 70px -20px rgba(0, 0, 0, 0.55);
          padding: 28px 28px 22px;
          animation: tinvUp 320ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        .tinv-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-family: var(--font-mono);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--accent);
        }
        .tinv-title {
          font-family: var(--font-display);
          font-style: italic;
          font-size: 30px;
          line-height: 1.1;
          letter-spacing: -0.01em;
          color: var(--ink);
          margin: 12px 0 10px;
        }
        .tinv-body {
          font-family: var(--font-display);
          font-style: italic;
          font-size: 15px;
          line-height: 1.55;
          color: var(--ink-2);
          margin: 0 0 22px;
        }
        .tinv-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
        }
        .tinv-later,
        .tinv-start {
          font-family: var(--font-mono);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          border-radius: 10px;
          padding: 12px 20px;
          cursor: pointer;
        }
        .tinv-later {
          background: transparent;
          border: 1px solid var(--rule-strong);
          color: var(--ink-2);
        }
        .tinv-start {
          background: var(--accent);
          border: none;
          color: #fff;
          box-shadow: 0 8px 24px -6px rgba(165, 31, 45, 0.6);
        }
        @keyframes tinvFade {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes tinvUp {
          from {
            opacity: 0;
            transform: translateY(12px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .tinv-root,
          .tinv-card {
            animation: none;
          }
        }
      `}</style>
    </div>,
    document.body,
  );
}
