import { test, expect } from "@playwright/test";

/**
 * Golden-path smoke suite. Three flows that, if broken, mean the product is
 * down for everyone:
 *   1. Landing renders + primary CTA present
 *   2. Optimizer page loads its form (the core feature)
 *   3. Aeroplan June-1 calculator renders with real data (the launch artifact)
 *
 * These deliberately do NOT assert deep behaviour — they catch "the page
 * 500s / white-screens", which is the failure mode that actually loses users.
 */

test("landing page renders with primary CTA", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Maple\s?Rewards/i);
  // The hero CTA links to the optimizer (post-redesign — previously "Get
  // started"). Its presence proves the page rendered past the fold without
  // throwing.
  await expect(page.locator('a[href="/optimizer"]').first()).toBeVisible();
});

test("optimizer page loads the form", async ({ page }) => {
  await page.goto("/optimizer");
  // The category select is the heart of the optimizer; if the ErrorBoundary
  // tripped we'd see "Something went sideways" instead.
  await expect(page.getByText(/something went sideways/i)).toHaveCount(0);
  await expect(page.locator("select, input").first()).toBeVisible();
});

test("aeroplan june-1 calculator renders savings data", async ({ page }) => {
  await page.goto("/tools/aeroplan-june-1?airport=YYZ&region=europe&cabin=business");
  await expect(page.getByText(/aeroplan is hiking/i)).toBeVisible();
  // The dollar figure is server-rendered from the backend chart — its
  // presence proves the API round-trip worked end-to-end.
  await expect(page.getByText(/\$250/).first()).toBeVisible();
});
