"use client";

import { useState, useRef, useEffect } from "react";
import { HelpCircle } from "lucide-react";

interface InfoTooltipProps {
  term: keyof typeof TOOLTIP_CONTENT;
  children?: React.ReactNode;
}

export const TOOLTIP_CONTENT = {
  cpp: {
    title: "Cents Per Point (CPP)",
    body: "The value of 1 reward point in Canadian cents. A CPP of 1.5¢ means 10,000 points = $150 CAD. Premium redemptions (business class flights) often yield 2–4¢/pt.",
  },
  "transfer-partners": {
    title: "Transfer Partners",
    body: "Airlines and hotels that accept your credit card points. Transferring to Air Canada Aeroplan often yields 2–4× more value than booking through the card's travel portal.",
  },
  "earn-rate": {
    title: "Earn Rate",
    body: "How many points you earn per dollar spent. \"5x Groceries\" means 5 points for every $1 at grocery stores. Higher multipliers = more points.",
  },
  "spend-cap": {
    title: "Earn Cap",
    body: "Some cards limit bonus points to a maximum annual spend. e.g., \"5x on up to $30,000/yr\" — after $30K, the rate drops to 1x.",
  },
  "welcome-bonus": {
    title: "Welcome Bonus",
    body: "A one-time offer for new cardholders who meet a minimum spend within a set timeframe (e.g., spend $3,000 in 3 months to get 60,000 points).",
  },
  "annual-fee": {
    title: "Annual Fee",
    body: "Yearly charge to hold the card. Premium cards ($120–$599) usually offer perks (lounge access, insurance, travel credits) that can exceed the fee in value.",
  },
  "net-annual-value": {
    title: "Net Annual Value",
    body: "Estimated yearly rewards value minus the annual fee. A card with $800 in rewards and a $120 fee has a net value of ~$680/yr.",
  },
  "transfer-ratio": {
    title: "Transfer Ratio",
    body: "How your points convert when transferring. A 1:1 ratio means 1,000 Amex points → 1,000 Aeroplan points. Some transfers are better (1:1.25) or worse (2:1).",
  },
};

export function InfoTooltip({ term, children }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const content = TOOLTIP_CONTENT[term];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (!content) return null;

  return (
    <span ref={ref} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-1 focus:outline-none"
        aria-label={`Explain ${term}`}
      >
        {children ?? (
          <HelpCircle
            size={13}
            className="transition-colors duration-150"
            style={{ color: open ? "#0D9488" : "rgba(255,255,255,0.3)" }}
          />
        )}
      </button>

      {open && (
        <div
          className="absolute z-50 bottom-full mb-2 left-1/2 -translate-x-1/2 w-64 rounded-xl p-3 text-left shadow-2xl"
          style={{
            background: "#131520",
            border: "1px solid var(--info-border)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px var(--info-soft)",
          }}
        >
          {/* Arrow */}
          <div
            className="absolute left-1/2 -translate-x-1/2 -bottom-[5px] w-2.5 h-2.5 rotate-45"
            style={{ background: "#131520", borderRight: "1px solid var(--info-border)", borderBottom: "1px solid var(--info-border)" }}
          />
          <p className="text-[11px] font-semibold mb-1" style={{ color: "#0D9488" }}>
            {content.title}
          </p>
          <p className="text-[12px] leading-relaxed" style={{ color: "rgba(255,255,255,0.65)" }}>
            {content.body}
          </p>
        </div>
      )}
    </span>
  );
}

/** Inline labeled term with tooltip on the question mark */
export function TooltipTerm({ term, label }: { term: keyof typeof TOOLTIP_CONTENT; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span>{label}</span>
      <InfoTooltip term={term} />
    </span>
  );
}
