/* Jargon glossary — plain-English, beginner-facing definitions for the rewards
 * terms that bounce new users off the product (CPP, SQC, sweet-spot, leakage,
 * devaluation, triple-stack, base CPP, churn, transfer ratios, and more).
 *
 * Single source of truth. Consumed by:
 *   - <Term> (components/ui/term.tsx) for first-use tooltips
 *   - <GlossaryList> (components/glossary-list.tsx) for the /glossary page
 *
 * Keys are lowercase/normalized; lookup is case- and format-tolerant, so "CPP",
 * "cpp", "sweet-spot", and "sweet spot" all resolve to the same entry. The
 * tooltip surfaces `label` + `definition` (kept <= 140 chars, beginner-tuned);
 * the /glossary page surfaces the richer `full` + `detail` when present.
 */

export type GlossaryEntry = {
  /** Display label shown when <Term> renders its own text (no children). */
  label: string;
  /** Plain-English definition surfaced in the tooltip (<= 140 chars). */
  definition: string;
  /** Full title for the /glossary reference page (defaults to `label`). */
  full?: string;
  /** Longer reference-page copy (defaults to `definition`). */
  detail?: string;
};

export const GLOSSARY: Record<string, GlossaryEntry> = {
  cpp: {
    label: "CPP",
    definition: "Cents per point — how many cents one point is worth.",
    full: "Cents per point",
    detail:
      "What one point is actually worth in CAD when you redeem it. 1.5¢ CPP means a 50,000-point flight is worth $750.",
  },
  sqc: {
    label: "SQC",
    definition:
      "Status Qualifying Credits — spend/activity that counts toward Aeroplan elite status.",
    full: "Status Qualifying Credits",
    detail:
      "Aeroplan's 2026 elite-status currency — replaced the old SQM/SQS/SQD trio. Earn 2 SQC per CAD on Standard fares, 4 on Flex+. Hit 25K/35K/50K/75K/125K to climb tiers.",
  },
  "sweet spot": {
    label: "sweet spot",
    definition: "A redemption that returns outsized value for your points.",
    full: "Redemption sweet spot",
    detail:
      "An award booking that yields way above the typical CPP — e.g. Aeroplan business class to Europe for 75K points (worth $3-4K cash).",
  },
  leakage: {
    label: "leakage",
    definition: "Rewards you earned but didn't capture.",
    full: "Reward leakage",
    detail:
      "Dollars left on the table when you used a sub-optimal card. If you swiped your 1× card on groceries instead of your 5× card, the gap is leakage.",
  },
  devaluation: {
    label: "devaluation",
    definition: "When a program makes its points worth less.",
    full: "Devaluation",
    detail:
      "When a loyalty program raises award prices or cuts earn rates, making each point worth less than before.",
  },
  "triple-stack": {
    label: "triple-stack",
    definition:
      "Stacking a shopping portal + card multiplier + a card-linked offer.",
    full: "Triple stack",
    detail:
      "Combining a shopping portal, a card multiplier, and a card-linked offer on one purchase so the rewards layer up.",
  },
  "base cpp": {
    label: "base CPP",
    definition: "The baseline cents-per-point value of a program.",
    full: "Base CPP",
    detail:
      "The baseline cents-per-point value of a program's points — the floor you can reliably expect before chasing sweet spots.",
  },
  churn: {
    label: "churn",
    definition: "Opening/closing cards to earn welcome bonuses.",
    full: "Churn",
    detail:
      "Opening and closing cards over time to repeatedly earn welcome bonuses. Banks watch for it and may decline serial churners.",
  },
  "welcome bonus": {
    label: "welcome bonus",
    definition:
      "Points awarded for opening a card and hitting a minimum spend in a set window.",
    full: "Welcome bonus (a.k.a. SUB / sign-up bonus)",
    detail:
      "Points awarded for opening a new card and meeting a minimum-spend threshold within a set window (typically 3 months). Often the highest-value reason to open a card.",
  },
  "transfer partner": {
    label: "transfer partner",
    definition:
      "A program that accepts your bank points — e.g. Amex MR transfers to Aeroplan.",
    full: "Transfer partner",
    detail:
      "A loyalty program that accepts incoming points from a bank's program. Amex MR's transfer partners include Aeroplan, BA Avios, and Flying Blue.",
  },
  "annual fee": {
    label: "annual fee",
    definition: "The yearly cost a card charges to keep it open.",
    full: "Annual fee",
    detail:
      "The yearly cost a card charges to keep it open. Weigh it against the rewards and credits the card returns each year.",
  },

  /* ── Ported from the legacy inline GLOSSARY (components/term.tsx) ──────── */
  mr: {
    label: "MR",
    definition:
      "Membership Rewards — Amex's flexible points, transfer 1:1 to Aeroplan, Avios, Flying Blue.",
    full: "Membership Rewards",
    detail:
      "American Express's flexible points currency. In Canada it transfers 1:1 to Aeroplan, BA Avios, and Flying Blue — among the most valuable transferable currencies for Canadians.",
  },
  "amex-mr": {
    label: "Amex MR",
    definition:
      "Amex Membership Rewards — flexible points that transfer 1:1 to Aeroplan, Avios, Flying Blue.",
    full: "American Express Membership Rewards",
    detail:
      "American Express's flexible points currency. Transfers 1:1 to Aeroplan, BA Avios, and Flying Blue.",
  },
  "transfer-ratio": {
    label: "transfer ratio",
    definition:
      "How many bank points convert to one airline/hotel point — Amex MR → Aeroplan is 1:1.",
    full: "Transfer ratio",
    detail:
      "How many bank-program points convert to one airline/hotel point. Amex MR → Aeroplan is 1:1. Marriott Bonvoy → Aeroplan is 3:1 (with a 5K bonus per 60K transferred).",
  },
  "transfer-partners": {
    label: "transfer partners",
    definition:
      "Programs that accept your bank points — Amex MR transfers to Aeroplan, Avios, Flying Blue.",
    full: "Transfer partners",
    detail:
      "Loyalty programs that accept incoming points from a bank's program. Amex MR's transfer partners include Aeroplan, BA Avios, and Flying Blue — transferring often beats redeeming through the card's own travel portal.",
  },
  "earn-rate": {
    label: "earn rate",
    definition:
      "Points (or cash-back %) per dollar in a category — \"5× groceries\" is 5 points per $1.",
    full: "Earn rate",
    detail:
      "How many points (or what cash-back percentage) you get per dollar spent in a category. \"5× groceries\" means five points per $1 at grocery stores; higher multipliers mean more rewards.",
  },
  "net-annual-value": {
    label: "net annual value",
    definition: "A card's yearly rewards and credits minus its annual fee.",
    full: "Net annual value",
    detail:
      "Your estimated yearly rewards and credits from a card minus its annual fee. A card returning $800 in rewards with a $120 fee has a net value of about $680/yr.",
  },
  multiplier: {
    label: "multiplier",
    definition:
      "Points per dollar in a category — Cobalt earns 5× on groceries, i.e. 5 points per $1.",
    full: "Earn multiplier",
    detail:
      "How many points per dollar a card gives in a specific category. Cobalt earns 5× on groceries — five points per dollar instead of one.",
  },
  stack: {
    label: "stack",
    definition: "Using multiple cards so each covers its best-earning categories.",
    full: "Card stack",
    detail:
      "Combining multiple cards so each handles the categories where it earns the most. 'Cobalt for groceries + Aeroplan VI for travel' is a stack.",
  },
  "fee-roi": {
    label: "fee ROI",
    definition: "The value of a card's credits and perks versus its annual fee.",
    full: "Annual-fee return on investment",
    detail:
      "The dollar value of credits and benefits a card delivers vs its annual fee. Amex Platinum's $799 fee nets to ~$400 after travel and lifestyle credits.",
  },
  redemption: {
    label: "redemption",
    definition:
      "Spending points — usually for flights, hotels, or statement credit.",
    full: "Redemption",
    detail:
      "Spending points — usually for flights, hotels, or statement credit. Higher-CPP redemptions are flights and hotels; lower-CPP is gift cards and merchandise.",
  },
  cap: {
    label: "cap",
    definition:
      "The spending limit a category multiplier applies to — above it you earn 1×.",
    full: "Category earn cap",
    detail:
      "The annual or monthly spending limit on which a category multiplier applies. Cobalt's 5× on grocery caps at $2,500/month — spend above that earns 1×.",
  },
  "fallback-rate": {
    label: "fallback rate",
    definition:
      "The earn rate after you hit a cap or spend outside boosted categories — usually 1×.",
    full: "Fallback earn rate",
    detail:
      "The earn rate that kicks in once you hit a cap, or for purchases outside the boosted categories. Usually 1×.",
  },
  aeroplan: {
    label: "Aeroplan",
    definition:
      "Air Canada's loyalty program — Canada's main flight rewards currency (Star Alliance).",
    full: "Aeroplan",
    detail:
      "Air Canada's loyalty program — Canada's dominant flight rewards currency, with Star Alliance partner awards (Lufthansa, Swiss, ANA, etc.).",
  },
  "scene-plus": {
    label: "Scene+",
    definition:
      "Scotiabank's points program — best earned via Passport/Gold Amex, redeems on travel & Cineplex.",
    full: "Scene+",
    detail:
      "Scotiabank's points program (merged with Cineplex's old SCENE). Best earned via the Scotia Passport / Gold Amex line; redeems against bookings on Scene+ travel and Cineplex.",
  },
  "elite-tier": {
    label: "elite tier",
    definition:
      "A frequent-flyer rank (Aeroplan 25K → Super Elite) earned via status credits.",
    full: "Elite status tier",
    detail:
      "A frequent-flyer rank (Aeroplan 25K → Super Elite). Earned via Status Qualifying Credits; unlocks lounge access, free upgrades, and bonus earn.",
  },
  "fx-fee": {
    label: "FX fee",
    definition:
      "The ~2.5% fee most Canadian cards add to foreign purchases; a few cards waive it.",
    full: "Foreign-exchange surcharge",
    detail:
      "The 2.5% fee most Canadian cards add to USD/foreign purchases. A handful of cards (Scotia Passport, Brim, Home Trust) waive it.",
  },
};

/** Aliases so legacy `k=` values and hyphen/space variants resolve to one entry. */
const ALIASES: Record<string, string> = {
  "sweet-spot": "sweet spot",
  sweetspot: "sweet spot",
  "transfer-partner": "transfer partner",
  "welcome-bonus": "welcome bonus",
  "annual-fee": "annual fee",
  "base-cpp": "base cpp",
};

/** Normalize a term key for lookup: lowercase, trim, then resolve known aliases. */
export function normalizeTerm(term: string): string {
  const key = term.toLowerCase().trim();
  return ALIASES[key] ?? key;
}

/** Resolve a term to its glossary entry, or undefined if unknown. */
export function lookupTerm(term: string): GlossaryEntry | undefined {
  return GLOSSARY[normalizeTerm(term)];
}
