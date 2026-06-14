/* The guided tour: drives a logged-in user through the real pages. `target` is
 * the data-tour-id of the element to spotlight (null = centered card). On the
 * optimizer step the self-driving cursor runs the real flow and ends by pressing
 * Log Purchase, after which the tour advances to Insights. The Pro steps teach
 * the value of the price-gated tools. */

export interface TourStep {
  id: string;
  route: string;
  target: string | null;
  eyebrow: string;
  title: string;
  body: string;
  interactive?: boolean;
  ghostDemo?: boolean;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    route: "/",
    target: null,
    eyebrow: "Welcome",
    title: "Take a tour",
    body: "Understand MapleRewards and how to get the most out of it. About a minute. Next, Back, or Skip anytime.",
  },
  {
    id: "wallet",
    route: "/wallet",
    target: "wallet-stat-cad-value",
    eyebrow: "Wallet",
    title: "Your cards in one place",
    body: "Points and real dollar value for every card you add.",
  },
  {
    id: "optimizer",
    route: "/optimizer",
    target: "optimizer-panel",
    eyebrow: "Optimizer",
    title: "Best card for any purchase",
    body: "Enter what you're buying and how much. It ranks your cards by what each one earns, then you log the purchase.",
    interactive: true,
    ghostDemo: true,
  },
  {
    id: "insights",
    route: "/insights",
    target: "insights-panel",
    eyebrow: "Insights",
    title: "Where it all adds up",
    body: "Every purchase you log lands here: what you earned, what you left on the table, and which cards to re-route.",
  },
  {
    id: "milestones",
    route: "/milestones",
    target: "milestones-panel",
    eyebrow: "Milestones",
    title: "Welcome bonus tracking",
    body: "How much spend is left on each bonus, and the deadline to hit it.",
  },
  {
    id: "loyalty",
    route: "/loyalty",
    target: "loyalty-programs-grid",
    eyebrow: "Loyalty",
    title: "Points, valued",
    body: "Every program's balance and what it's worth, with alerts before a devaluation.",
  },
  {
    id: "pro",
    route: "/pro-tools",
    target: "pro-tools-upsell-wall",
    eyebrow: "Pro Tools",
    title: "Where the real money is",
    body: "Pro unlocks the tools that find the dollars you're missing. Here are the two that matter most.",
  },
  {
    id: "pro-missed",
    route: "/pro-tools",
    target: "pro-feature-forensics",
    eyebrow: "Pro · Forensics",
    title: "Missed rewards report",
    body: "Every transaction where a better card would have earned more, with the exact dollars you left behind.",
  },
  {
    id: "pro-sqc",
    route: "/pro-tools",
    target: "pro-feature-status",
    eyebrow: "Pro · Status",
    title: "Aeroplan SQC projector",
    body: "Your year-to-date status credits across cards, and the spend left to reach the next tier.",
  },
  {
    id: "chat",
    route: "/",
    target: "ask-maple-orb",
    eyebrow: "Ask Maple",
    title: "Your rewards assistant",
    body: "Transfer math, award routing, or whether to open a card. Just ask.",
  },
  {
    id: "done",
    route: "/",
    target: null,
    eyebrow: "Done",
    title: "You're set",
    body: "Replay this tour anytime from Settings.",
  },
];
