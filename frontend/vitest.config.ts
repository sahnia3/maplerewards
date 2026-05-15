import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

/**
 * Vitest config — unit tests only. E2E lives in Playwright (see
 * playwright.config.ts). Scope is intentionally small: pure functions and
 * isolated components, not full-page integration. The goal is a fast smoke
 * suite that runs in CI in < 10s, not a coverage mandate.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next", "e2e"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
});
