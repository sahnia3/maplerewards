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
} as const;

// Feature comparison for pricing page
export interface TierFeature {
  name: string;
  free: string | boolean;
  pro: string | boolean;
}

export const TIER_FEATURES: TierFeature[] = [
  { name: "Cards in wallet",            free: "Up to 3",          pro: "Unlimited" },
  { name: "Spend optimizer",            free: true,                pro: true },
  { name: "Card catalog",               free: true,                pro: true },
  { name: "AI chat messages",           free: "1 per month",       pro: "Unlimited" },
  { name: "AI Research Mode",           free: false,               pro: true },
  { name: "Insights & spend history",   free: "Last 10 entries",   pro: "Full history" },
  { name: "Opportunity cost analysis",  free: false,               pro: true },
  { name: "Monthly trend charts",       free: false,               pro: true },
  { name: "Portfolio analyzer",         free: false,               pro: true },
  { name: "Trip planner",               free: false,               pro: true },
  { name: "CSV data export",            free: false,               pro: true },
  { name: "Priority recommendations",   free: false,               pro: true },
  { name: "Feed & articles",            free: true,                pro: true },
  { name: "Welcome bonus tracking",     free: true,                pro: true },
  { name: "Card comparison",            free: true,                pro: true },
];

// Check if a feature requires Pro
export function isProFeature(key: ProFeatureKey): boolean {
  return key in PRO_FEATURES;
}
