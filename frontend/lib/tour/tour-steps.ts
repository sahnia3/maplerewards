/* The guided tour: a multi-page walkthrough shown once to a freshly-created
 * account (gated in tour-config) and replayable from Profile/Settings. It moves
 * the user across the real pages — Home, Pro Tools, the Optimizer and Maple AI —
 * spotlighting an element that actually exists on each redesigned page. The tour
 * context navigates to each step's `route` (in an effect, never during render),
 * and the overlay retries finding the `target` after the page loads. `target` is
 * the data-tour-id to spotlight (null = a centred card). */

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
    title: "A quick tour",
    body: "I'll walk you through your dashboard, the Pro tools, the optimizer and Maple AI — about a minute. Next, Back, or Skip anytime.",
  },
  // ── Home ──────────────────────────────────────────────────────────────────
  {
    id: "home-cards",
    route: "/",
    target: "home-card-fan",
    eyebrow: "Home",
    title: "Your wallet, ranked",
    body: "The cards you carry, fanned with the best everyday earner up front.",
  },
  {
    id: "home-wallet-value",
    route: "/",
    target: "home-wallet-gauge",
    eyebrow: "Home · Value",
    title: "What your points are worth",
    body: "Base value at the centre, the sweet-spot ceiling in gold, and the upside you can still capture.",
  },
  {
    id: "home-coverage",
    route: "/",
    target: "home-coverage",
    eyebrow: "Home · Coverage",
    title: "Where your rewards come from",
    body: "The best card in your wallet for each category, and the return it earns there.",
  },
  {
    id: "home-best-move",
    route: "/",
    target: "home-best-move",
    eyebrow: "Home · Today",
    title: "Your best money move",
    body: "The single change that recovers the most value today — it opens the optimizer.",
  },
  // ── Pro Tools ───────────────────────────────────────────────────────────────
  {
    id: "pro-tools",
    route: "/pro-tools",
    target: "pro-directory",
    eyebrow: "Pro Tools",
    title: "The Pro toolkit",
    body: "Twenty Canadian-rewards tools, grouped into four workspaces — forensics, status, stacking and knowledge. Open one to dig in.",
  },
  // ── Optimizer ───────────────────────────────────────────────────────────────
  {
    id: "optimizer",
    route: "/optimizer",
    target: "optimizer-panel",
    eyebrow: "Optimizer",
    title: "Best card for any purchase",
    body: "Pick a category, enter an amount, and Maple ranks every card in your wallet by what it would actually earn — then you log the purchase. Watch it run.",
    interactive: true,
    ghostDemo: true,
  },
  // ── Maple AI ────────────────────────────────────────────────────────────────
  {
    id: "maple-ai",
    route: "/chat",
    target: "maple-chat",
    eyebrow: "Maple AI",
    title: "Your rewards assistant",
    body: "Maple is wired to your wallet — these are the cards it can see. Ask which card to use, how to transfer points, or how to redeem for a trip.",
  },
  {
    id: "done",
    route: "/",
    target: null,
    eyebrow: "Done",
    title: "You're all set",
    body: "That's the tour. You can replay it anytime from Settings or your profile.",
  },
];
