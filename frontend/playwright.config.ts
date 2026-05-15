import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E — three critical golden-path flows only. These are smoke
 * tests: "does the happy path render and not 500", not exhaustive coverage.
 *
 * Requires the dev stack running (make dev + npm run dev). CI should boot
 * both, wait for :3000, then `npx playwright test`. Locally: same.
 *
 * baseURL is overridable via PLAYWRIGHT_BASE_URL so the same suite can run
 * against staging.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
