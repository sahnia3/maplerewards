import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Responsive / mobile-visibility sweep across every route at mobile + desktop.
 *
 * What it guards (the failure modes that actually hurt users on a phone):
 *   1. No horizontal PAGE overflow — documentElement.scrollWidth must not exceed
 *      the viewport. Inner .scroll-x containers are fine (they scroll locally);
 *      this only catches the whole page spilling sideways.
 *   2. No uncaught exception (pageerror) while the route loads.
 *   3. The route actually rendered content (not a white screen / ErrorBoundary).
 *
 * It also writes a screenshot per route×viewport to e2e/__screens__/ for the
 * separate visual-uniformity review.
 */

const SHOT_DIR = path.join(__dirname, "__screens__");
fs.mkdirSync(SHOT_DIR, { recursive: true });

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 800 },
] as const;

// Static routes (no params). Dynamic ones are derived from list pages below.
const STATIC_ROUTES = [
  "/", "/optimizer", "/wallet", "/cards", "/compare", "/loyalty", "/milestones",
  "/pro-tools", "/pricing", "/trip-planner", "/insights", "/portfolio",
  "/applications", "/promos", "/feed", "/tools", "/tools/costco-card-router",
  "/tools/points-to-cad", "/tools/aeroplan-june-1?airport=YYZ&region=europe&cabin=business",
  "/chat", "/settings", "/profile", "/onboarding", "/login", "/signup",
  "/cancel", "/goodbye", "/unsubscribe", "/privacy", "/terms", "/admin",
];

/** Returns px of horizontal page overflow (0 = none). */
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const d = document.documentElement;
    return Math.max(0, d.scrollWidth - d.clientWidth);
  });
}

async function visibleTextLength(page: Page): Promise<number> {
  return page.evaluate(() => (document.body?.innerText || "").trim().length);
}

async function checkRoute(page: Page, route: string, vp: { name: string; width: number; height: number }) {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await page.setViewportSize({ width: vp.width, height: vp.height });
  await page.goto(route, { waitUntil: "networkidle" }).catch(() => page.goto(route));
  // settle layout/fonts
  await page.waitForTimeout(400);

  const slug = route.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "root";
  await page.screenshot({ path: path.join(SHOT_DIR, `${slug}__${vp.name}.png`), fullPage: true }).catch(() => {});

  const overflow = await horizontalOverflow(page);
  const textLen = await visibleTextLength(page);

  // Real content rendered (white-screen / crashed ErrorBoundary guard).
  expect(textLen, `${route} @ ${vp.name}: page rendered no visible text (white screen?)`).toBeGreaterThan(20);
  expect(
    pageErrors.join("\n"),
    `${route} @ ${vp.name}: uncaught exception(s):\n${pageErrors.join("\n")}`,
  ).toBe("");
  // ≤2px tolerance for sub-pixel rounding; anything more is a real sideways spill.
  expect(overflow, `${route} @ ${vp.name}: page overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(2);
}

for (const vp of VIEWPORTS) {
  test.describe(`responsive @ ${vp.name} (${vp.width}px)`, () => {
    for (const route of STATIC_ROUTES) {
      test(`${route}`, async ({ page }) => {
        await checkRoute(page, route, vp);
      });
    }

    test(`dynamic routes (derived from list pages)`, async ({ page }) => {
      // /cards/[id] + /compare/[a]/[b] from the cards list
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/cards").catch(() => {});
      await page.waitForTimeout(600);
      const cardHrefs = await page.$$eval('a[href^="/cards/"]', (as) =>
        as.map((a) => (a as HTMLAnchorElement).getAttribute("href")).filter((h): h is string => !!h && h !== "/cards"),
      );
      if (cardHrefs[0]) await checkRoute(page, cardHrefs[0], vp);
      if (cardHrefs[0] && cardHrefs[1]) {
        const a = cardHrefs[0].split("/").pop();
        const b = cardHrefs[1].split("/").pop();
        if (a && b) await checkRoute(page, `/compare/${a}/${b}`, vp);
      }

      // /loyalty/[slug] from the loyalty list
      await page.goto("/loyalty").catch(() => {});
      await page.waitForTimeout(600);
      const loyHref = await page.$$eval('a[href^="/loyalty/"]', (as) => {
        const h = as.map((a) => (a as HTMLAnchorElement).getAttribute("href")).find((x) => !!x && x !== "/loyalty");
        return h || null;
      });
      if (loyHref) await checkRoute(page, loyHref, vp);
    });
  });
}
