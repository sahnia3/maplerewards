// Pro features config — defines what is gated behind the Pro tier.

export const PRO_FEATURES = {
  // AI Research Mode — web search integration
  aiResearchMode: {
    label: "AI Research Mode",
    description: "Get answers backed by live web search results from top Canadian rewards sources.",
  },
  // Detailed analytics — extended insights
  detailedAnalytics: {
    label: "Detailed Analytics",
    description: "Access monthly trend charts, opportunity cost analysis, and CSV data export.",
  },
  // Trip planner
  tripPlanner: {
    label: "Trip Planner",
    description: "Calculate the best redemption options for flights using your points.",
  },
  // Unlimited wallet cards (free = 3)
  unlimitedCards: {
    label: "Unlimited Cards",
    description: "Add unlimited cards to your wallet. Free tier allows up to 3 cards.",
  },
  // CSV data export
  csvExport: {
    label: "CSV Export",
    description: "Export your spend history and insights as CSV files.",
  },
  // Portfolio analysis
  portfolioAnalysis: {
    label: "Portfolio Analyzer",
    description: "See fee ROI, opportunity cost analysis, and category utilization for your wallet.",
  },
  // Unlimited chat
  unlimitedChat: {
    label: "Unlimited AI Chat",
    description: "Ask unlimited questions. Free tier allows 1 message per month.",
  },
  // Priority recommendations
  priorityRecommendations: {
    label: "Priority Recommendations",
    description: "Get personalized card recommendations based on your spending patterns.",
  },
} as const;

export type ProFeatureKey = keyof typeof PRO_FEATURES;

// Free tier limits
export const FREE_LIMITS = {
  maxCards: 3,
  maxChatMessagesPerMonth: 1,
  maxVisibleTransactions: 10,
} as const;

// Pricing — Free / Pro / Pro Plus / Lifetime.
//
// Restructured 2026-05: subscription stays (no model switch), but the tiers
// are now annual-first to match how often the tool is used (a few times a
// month, not daily — monthly billing churned). Pro Plus adds the
// power-user/churner depth (live award context, higher AI budget). Lifetime
// is the founding-member capture tier.
//
// `checkoutInterval` is the string passed to POST /billing/checkout — the
// backend maps it to a Stripe price ID.
export const PRICING = {
  free: {
    price: 0,
    currency: "CAD",
    label: "Free",
    note: "Optimizer, wallet, 5 AI messages/mo, public tools",
  },
  pro: {
    price: 39.99,
    currency: "CAD",
    interval: "year" as const,
    checkoutInterval: "pro_annual" as const,
    label: "$39.99/yr",
    monthlyEquivalent: 3.33,
    note: "Everything in Free + missed-rewards, SQC tracker, alerts, unlimited AI (within fair-use cap)",
  },
  proPlus: {
    price: 69.99,
    currency: "CAD",
    interval: "year" as const,
    checkoutInterval: "proplus_annual" as const,
    label: "$69.99/yr",
    monthlyEquivalent: 5.83,
    note: "Everything in Pro + cross-program award depth, priority data refresh, highest AI budget",
  },
  lifetime: {
    price: 199,
    currency: "CAD",
    interval: "lifetime" as const,
    checkoutInterval: "lifetime" as const,
    label: "$199 once",
    seats: 1000, // founding-member cap
    note: "All Pro Plus features, forever · 1,000 founding seats",
  },
} as const;

// Feature comparison for pricing page
export interface TierFeature {
  name: string;
  free: string | boolean;
  pro: string | boolean;
}

export interface TierGroup {
  name: string;
  features: TierFeature[];
}

// Grouped feature comparison for the pricing page. Pro Tools come first because
// they are the Canadian wedge and the strongest reason to upgrade.
export const TIER_GROUPS: TierGroup[] = [
  {
    name: "Pro Tools — Canadian wedge",
    features: [
      { name: "Aeroplan 2026 SQC projector",   free: false, pro: true },
      { name: "Missed-rewards forensics",      free: false, pro: true },
      { name: "Credits & renewals calendar",   free: false, pro: true },
      { name: "Card-value scorecard",          free: false, pro: true },
      { name: "Buy-points break-even",         free: false, pro: true },
      { name: "Triple-stack calculator",       free: false, pro: true },
      { name: "Devaluation alarms",            free: false, pro: true },
      { name: "Award watcher",                 free: false, pro: true },
      { name: "Costco-MC routing helper",      free: false, pro: true },
    ],
  },
  {
    name: "Wallet & analysis",
    features: [
      { name: "Cards in wallet",               free: "Up to 3",         pro: "Unlimited" },
      { name: "Spend optimizer",               free: true,              pro: true },
      { name: "Insights & spend history",      free: "Last 10 entries", pro: "Full history" },
      { name: "Portfolio analyzer",            free: false,             pro: true },
      { name: "Opportunity cost analysis",     free: false,             pro: true },
      { name: "Monthly trend charts",          free: false,             pro: true },
      { name: "CSV data export",               free: false,             pro: true },
    ],
  },
  {
    name: "Travel & advisor",
    features: [
      { name: "Trip planner",                  free: false,             pro: true },
      { name: "AI chat messages",              free: "1 per month",     pro: "Unlimited" },
      { name: "AI Research Mode",              free: false,             pro: true },
      { name: "Priority recommendations",      free: false,             pro: true },
    ],
  },
  {
    name: "Catalog & basics",
    features: [
      { name: "Card catalog",                  free: true,              pro: true },
      { name: "Card comparison",               free: true,              pro: true },
      { name: "Welcome bonus tracking",        free: true,              pro: true },
      { name: "Feed & articles",               free: true,              pro: true },
    ],
  },
];

// Backward-compat flat list (existing imports may still reference it).
export const TIER_FEATURES: TierFeature[] = TIER_GROUPS.flatMap((g) => g.features);

// Check if a feature requires Pro
export function isProFeature(key: ProFeatureKey): boolean {
  return key in PRO_FEATURES;
}
