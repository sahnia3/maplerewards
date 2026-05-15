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

// Pricing
export const PRICING = {
  monthly: {
    price: 7.99,
    currency: "CAD",
    interval: "month" as const,
    label: "$7.99/mo",
  },
  annual: {
    price: 59.99,
    currency: "CAD",
    interval: "year" as const,
    label: "$59.99/yr",
    savings: "37%",
    monthlyEquivalent: 5.0,
  },
  lifetime: {
    price: 149,
    currency: "CAD",
    interval: "lifetime" as const,
    label: "$149 once",
    seats: 1000, // limited offer for first 1,000 founding subscribers
    note: "Founding member · 1,000 seats only",
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
