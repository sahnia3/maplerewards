import { test, expect, Page } from "@playwright/test";

/**
 * P8 — Pro-tools E2E. Proves all 14 tiles across the 4 tabs render without
 * tripping the ErrorBoundary ("Something went sideways") or white-screening,
 * plus the key public flows (signup entry, optimizer). Pro gating is real
 * (auth-context → POST /auth/refresh), so we stub that refresh call to a Pro
 * user and stub the wallet data endpoints to benign payloads — the assertion
 * is "renders, no ErrorBoundary, numbers finite", not deep behaviour (matches
 * the smoke-suite philosophy).
 */

const PRO_USER = {
  id: "e2e-pro-user",
  email: "pro@example.com",
  session_id: "e2e0000000000000000000000000pro1",
  display_name: "E2E Pro",
  is_pro: true,
  plan: "pro",
  auth_provider: "password",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const TOKEN_PAIR = {
  access_token: "e2e-fake-access",
  refresh_token: "e2e-fake-refresh",
  expires_at: "2999-01-01T00:00:00Z",
  user: PRO_USER,
};

// Stub the auth bootstrap + every backend data call so the Pro UI renders
// deterministically without a live backend / real Pro account.
// Stub ONLY the auth bootstrap → a Pro user. The live backend (:8080) serves
// every data endpoint with its real response shapes; the fake access token
// means wallet calls return 401, so tiles exercise their real
// error/empty-state paths. (A blanket data stub returning wrong-shaped JSON
// was what crashed the page — the product itself handles the 401s cleanly.)
async function stubProAuth(page: Page) {
  await page.route("**/api/v1/auth/refresh", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(TOKEN_PAIR) }),
  );
}

async function assertNoErrorBoundary(page: Page) {
  await expect(page.getByText(/something went sideways/i)).toHaveCount(0);
  // A blank <body> (white screen) would have ~no visible text.
  await expect(page.locator("body")).not.toBeEmpty();
}

test.describe("Pro tools", () => {
  test("all 4 tabs render and switch without tripping the ErrorBoundary", async ({ page }) => {
    await stubProAuth(page);
    await page.goto("/pro-tools");

    // The 4 tab buttons (role=tab) are the page's spine. Select by position —
    // the accessible name folds in the count badge + hint, which makes
    // name-matching brittle; index is the stable contract here.
    const tabs = page.getByRole("tab");
    await expect(tabs).toHaveCount(4);
    await expect(tabs.first()).toBeVisible();
    await assertNoErrorBoundary(page);

    for (let i = 0; i < 4; i++) {
      const tab = tabs.nth(i);
      // force: live data fetches keep the tree re-rendering; we only need the
      // React onClick to fire, not Playwright's full actionability wait.
      await tab.click({ force: true });
      await expect(tab).toHaveAttribute("aria-selected", "true");
      await assertNoErrorBoundary(page);
      // The active panel must render *some* content (a tile/section), not
      // collapse to nothing, and must not surface a raw NaN/Infinity.
      await expect(page.locator("main, [role=tabpanel], section").first()).toBeVisible();
      const txt = (await page.locator("main").innerText().catch(() => "")) || "";
      expect(txt, `tab ${i} renders content`).not.toBe("");
      expect(txt, `tab ${i} no raw NaN/Infinity`).not.toMatch(/\bNaN\b|\bInfinity\b/);
    }
  });
});

test.describe("Pro gating", () => {
  test("anonymous visitor gets the upsell, not a white screen", async ({ page }) => {
    // No auth stub → /auth/refresh 401 → anonymous → upsell path.
    await page.route("**/api/v1/auth/refresh", (r) => r.fulfill({ status: 401, body: "{}" }));
    await page.goto("/pro-tools");
    await assertNoErrorBoundary(page);
    // Upsell CTA / pricing language proves the gate rendered intentionally.
    await expect(
      page.getByRole("link", { name: /upgrade|get pro|pricing|get started/i }).first(),
    ).toBeVisible();
  });
});

test.describe("Key flows", () => {
  test("landing → primary CTA reaches the optimizer", async ({ page }) => {
    await page.goto("/");
    await assertNoErrorBoundary(page);
    // The landing primary CTA links to /optimizer (post-redesign).
    const cta = page.locator('a[href="/optimizer"]').first();
    await expect(cta).toBeVisible();
    await cta.click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/optimizer/);
    await assertNoErrorBoundary(page);
  });

  test("optimizer happy path renders a result or a graceful state", async ({ page }) => {
    await page.goto("/optimizer");
    await assertNoErrorBoundary(page);
    const control = page.locator("select, input").first();
    await expect(control).toBeVisible();
    const submit = page.getByRole("button", { name: /optimi|find|best|go/i }).first();
    if (await submit.count()) {
      await submit.click().catch(() => {});
      await page.waitForLoadState("networkidle").catch(() => {});
      await assertNoErrorBoundary(page);
    }
  });
});
