"use client";

import {
  useId,
  useRef,
  useState,
  useLayoutEffect,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/* ─────────────────────────────────────────────────────────────────────────────
 * <Term> — inline glossary tooltips for Canadian credit-card-rewards jargon.
 *
 * The owner has acknowledged that even rewards-savvy users get tripped up on
 * acronyms (CPP, SQC, MR, transfer ratio…). Every <Term> renders the original
 * text with a dotted underline; hover or focus reveals a one-line plain-
 * English definition. Definitions live in `GLOSSARY` below — single source
 * of truth, also exported for the future /glossary page.
 *
 * Usage:
 *   Your average <Term k="cpp">CPP</Term> across the wallet is 1.4¢.
 *   The <Term k="transfer-ratio" /> from MR to Aeroplan is 1:1.
 *
 * Pass `k` to look up the canonical definition. Pass children to override the
 * visible text (defaults to the term's `display` value if no children).
 * ───────────────────────────────────────────────────────────────────────── */

export type GlossaryKey =
  | "cpp"
  | "sqc"
  | "mr"
  | "amex-mr"
  | "transfer-ratio"
  | "transfer-partner"
  | "multiplier"
  | "stack"
  | "leakage"
  | "sweet-spot"
  | "welcome-bonus"
  | "fee-roi"
  | "redemption"
  | "cap"
  | "fallback-rate"
  | "aeroplan"
  | "scene-plus"
  | "elite-tier"
  | "fx-fee";

interface Definition {
  display: string;
  full: string;
  detail: string;
}

export const GLOSSARY: Record<GlossaryKey, Definition> = {
  cpp: {
    display: "CPP",
    full: "Cents per point",
    detail:
      "What one point is actually worth in CAD when you redeem it. 1.5¢ CPP means a 50,000-point flight is worth $750.",
  },
  sqc: {
    display: "SQC",
    full: "Status Qualifying Credits",
    detail:
      "Aeroplan's 2026 elite-status currency — replaced the old SQM/SQS/SQD trio. Earn 2 SQC per CAD on Standard fares, 4 on Flex+. Hit 25K/35K/50K/75K/125K to climb tiers.",
  },
  mr: {
    display: "MR",
    full: "Membership Rewards",
    detail:
      "American Express's flexible points currency. In Canada it transfers 1:1 to Aeroplan, BA Avios, and Flying Blue — among the most valuable transferable currencies for Canadians.",
  },
  "amex-mr": {
    display: "Amex MR",
    full: "American Express Membership Rewards",
    detail:
      "American Express's flexible points currency. Transfers 1:1 to Aeroplan, BA Avios, and Flying Blue.",
  },
  "transfer-ratio": {
    display: "transfer ratio",
    full: "Transfer ratio",
    detail:
      "How many bank-program points convert to one airline/hotel point. Amex MR → Aeroplan is 1:1. Marriott Bonvoy → Aeroplan is 3:1 (with a 5K bonus per 60K transferred).",
  },
  "transfer-partner": {
    display: "transfer partner",
    full: "Transfer partner",
    detail:
      "A loyalty program that accepts incoming points from a bank's program. Amex MR's transfer partners include Aeroplan, BA Avios, and Flying Blue.",
  },
  multiplier: {
    display: "multiplier",
    full: "Earn multiplier",
    detail:
      "How many points per dollar a card gives in a specific category. Cobalt earns 5× on groceries — five points per dollar instead of one.",
  },
  stack: {
    display: "stack",
    full: "Card stack",
    detail:
      "Combining multiple cards so each handles the categories where it earns the most. 'Cobalt for groceries + Aeroplan VI for travel' is a stack.",
  },
  leakage: {
    display: "leakage",
    full: "Reward leakage",
    detail:
      "Dollars left on the table when you used a sub-optimal card. If you swiped your 1× card on groceries instead of your 5× card, the gap is leakage.",
  },
  "sweet-spot": {
    display: "sweet spot",
    full: "Redemption sweet spot",
    detail:
      "An award booking that yields way above the typical CPP — e.g. Aeroplan business class to Europe for 75K points (worth $3-4K cash).",
  },
  "welcome-bonus": {
    display: "welcome bonus",
    full: "Welcome bonus (a.k.a. SUB / sign-up bonus)",
    detail:
      "Points awarded for opening a new card and meeting a minimum-spend threshold within a set window (typically 3 months). Often the highest-value reason to open a card.",
  },
  "fee-roi": {
    display: "fee ROI",
    full: "Annual-fee return on investment",
    detail:
      "The dollar value of credits and benefits a card delivers vs its annual fee. Amex Platinum's $799 fee nets to ~$400 after travel and lifestyle credits.",
  },
  redemption: {
    display: "redemption",
    full: "Redemption",
    detail:
      "Spending points — usually for flights, hotels, or statement credit. Higher-CPP redemptions are flights and hotels; lower-CPP is gift cards and merchandise.",
  },
  cap: {
    display: "cap",
    full: "Category earn cap",
    detail:
      "The annual or monthly spending limit on which a category multiplier applies. Cobalt's 5× on grocery caps at $2,500/month — spend above that earns 1×.",
  },
  "fallback-rate": {
    display: "fallback rate",
    full: "Fallback earn rate",
    detail:
      "The earn rate that kicks in once you hit a cap, or for purchases outside the boosted categories. Usually 1×.",
  },
  aeroplan: {
    display: "Aeroplan",
    full: "Aeroplan",
    detail:
      "Air Canada's loyalty program — Canada's dominant flight rewards currency, with Star Alliance partner awards (Lufthansa, Swiss, ANA, etc.).",
  },
  "scene-plus": {
    display: "Scene+",
    full: "Scene+",
    detail:
      "Scotiabank's points program (merged with Cineplex's old SCENE). Best earned via the Scotia Passport / Gold Amex line; redeems against bookings on Scene+ travel and Cineplex.",
  },
  "elite-tier": {
    display: "elite tier",
    full: "Elite status tier",
    detail:
      "A frequent-flyer rank (Aeroplan 25K → Super Elite). Earned via Status Qualifying Credits; unlocks lounge access, free upgrades, and bonus earn.",
  },
  "fx-fee": {
    display: "FX fee",
    full: "Foreign-exchange surcharge",
    detail:
      "The 2.5% fee most Canadian cards add to USD/foreign purchases. A handful of cards (Scotia Passport, Brim, Home Trust) waive it.",
  },
};

interface TermProps {
  k: GlossaryKey;
  children?: ReactNode;
}

export function Term({ k, children }: TermProps) {
  const def = GLOSSARY[k];
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);

  // Position the popover above the trigger on open. Uses layout effect so the
  // measurement happens before paint — no flicker.
  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const rect = trigger.current.getBoundingClientRect();
    setCoords({
      x: rect.left + window.scrollX + rect.width / 2,
      y: rect.top + window.scrollY,
    });
  }, [open]);

  if (!def) return <span>{children ?? k}</span>;

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
        className="term-trigger"
        style={{
          background: "none",
          border: "none",
          padding: 0,
          margin: 0,
          font: "inherit",
          color: "inherit",
          cursor: "help",
          textDecoration: "underline dotted",
          textDecorationColor: "var(--ink-3)",
          textUnderlineOffset: "3px",
        }}
      >
        {children ?? def.display}
      </button>

      {open && coords && typeof document !== "undefined"
        ? createPortal(
            <div
              role="tooltip"
              id={id}
              style={{
                position: "absolute",
                left: coords.x,
                top: coords.y,
                transform: "translate(-50%, calc(-100% - 8px))",
                maxWidth: 280,
                padding: "12px 14px",
                borderRadius: 10,
                background: "var(--ink)",
                color: "var(--surface)",
                boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
                zIndex: 60,
                fontSize: 12,
                lineHeight: 1.45,
                pointerEvents: "none",
              }}
            >
              <div
                className="mono"
                style={{
                  fontSize: 9,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  opacity: 0.65,
                  marginBottom: 4,
                }}
              >
                {def.full}
              </div>
              {def.detail}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
