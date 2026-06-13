/* The guided tour: 8 beats that drive a new user through the real pages.
 * `target` is the data-tour-id of the element to spotlight (null = centered
 * card, no spotlight). `interactive` lets clicks reach the real element;
 * `ghostDemo` runs the self-driving cursor on that step. */

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
    title: "Let me show you around.",
    body: "Six rooms, about ninety seconds. You drive — Next, Back, or Skip whenever you want.",
  },
  {
    id: "wallet",
    route: "/wallet",
    target: "wallet-stat-cad-value",
    eyebrow: "Wallet",
    title: "Your cards, priced in CAD.",
    body: "Every card you carry, with its points and real dollar value, lives here.",
  },
  {
    id: "optimizer",
    route: "/optimizer",
    target: "optimizer-panel",
    eyebrow: "Optimizer",
    title: "The best card for every swipe.",
    body: "Pick what you're buying and how much. It ranks every card by what it actually earns.",
    interactive: true,
    ghostDemo: true,
  },
  {
    id: "milestones",
    route: "/milestones",
    target: "milestones-panel",
    eyebrow: "Milestones",
    title: "Never miss a welcome bonus.",
    body: "Track the spend and the deadline on every welcome bonus you're working toward.",
  },
  {
    id: "loyalty",
    route: "/loyalty",
    target: "loyalty-programs-grid",
    eyebrow: "Loyalty",
    title: "Your points, valued and watched.",
    body: "Live cents-per-point on every program, with a warning before one devalues.",
  },
  {
    id: "pro",
    route: "/pro-tools",
    target: "pro-tools-upsell-wall",
    eyebrow: "Pro tools",
    title: "The Canadian wedge.",
    body: "Aeroplan SQC projection, missed-rewards forensics, the credit-window calendar. This is Pro.",
  },
  {
    id: "chat",
    route: "/",
    target: "ask-maple-orb",
    eyebrow: "Ask Maple",
    title: "A rewards desk on call.",
    body: "Transfer math, award routing, should-I-open-this-card. Ask the assistant anything.",
  },
  {
    id: "done",
    route: "/",
    target: null,
    eyebrow: "You're set",
    title: "That's the tour.",
    body: "Replay it anytime from Settings. Now go earn.",
  },
];
