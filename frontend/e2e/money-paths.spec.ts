import { test, expect, type Page } from "@playwright/test";

/**
 * Money-path smokes — the pages where a broken render costs revenue or trust.
 * Philosophy matches the rest of the suite: "renders, no ErrorBoundary, the
 * primary control is present", not deep behaviour (which is flaky against live
 * data). These run against the live dev stack (:3000 + :8080).
 */

async function assertHealthy(page: Page) {
  await expect(page.getByText(/something went sideways/i)).toHaveCount(0);
  await expect(page.locator("body")).not.toBeEmpty();
  const txt = (await page.locator("body").innerText().catch(() => "")) || "";
  expect(txt, "no raw NaN/Infinity leaked into the UI").not.toMatch(/\bNaN\b|\bInfinity\b/);
}

test("pricing renders both tiers + a checkout CTA", async ({ page }) => {
  await page.goto("/pricing");
  await assertHealthy(page);
  // Free + paid tiers both present (the page's whole job is the comparison).
  await expect(page.getByText(/\$0|free/i).first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: /get pro|upgrade|get started|start|choose/i })
      .or(page.getByRole("button", { name: /get pro|upgrade|get started|start|choose|checkout/i }))
      .first(),
  ).toBeVisible();
});

test("compare lets you pick cards without crashing", async ({ page }) => {
  await page.goto("/compare");
  await assertHealthy(page);
  // A selection control (combobox/select/search) is the entry point.
  await expect(page.locator("select, input, [role=combobox], button").first()).toBeVisible();
});

test("wallet renders with an add-card affordance", async ({ page }) => {
  await page.goto("/wallet");
  await assertHealthy(page);
  await expect(
    page.getByRole("link", { name: /add.*card|add a card/i })
      .or(page.getByRole("button", { name: /add.*card|add a card/i }))
      .first(),
  ).toBeVisible();
});

test("applications page renders its form", async ({ page }) => {
  await page.goto("/applications");
  await assertHealthy(page);
  await expect(page.locator("select, input, button").first()).toBeVisible();
});

test("loyalty index lists programs that link to detail pages", async ({ page }) => {
  await page.goto("/loyalty");
  await assertHealthy(page);
  await expect(page.locator('a[href^="/loyalty/"]').first()).toBeVisible();
});

test("trip-planner renders its search inputs", async ({ page }) => {
  await page.goto("/trip-planner");
  await assertHealthy(page);
  await expect(page.locator("select, input").first()).toBeVisible();
});

test("pro-tools is gated for anonymous, not white-screened", async ({ page }) => {
  await page.route("**/api/v1/auth/refresh", (r) => r.fulfill({ status: 401, body: "{}" }));
  await page.goto("/pro-tools");
  await assertHealthy(page);
  await expect(
    page.getByRole("link", { name: /upgrade|get pro|pricing|get started/i }).first(),
  ).toBeVisible();
});
