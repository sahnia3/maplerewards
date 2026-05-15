import { describe, it, expect } from "vitest";
import { isErrorReporterEnabled } from "@/lib/error-reporter";

/**
 * The error reporter must be a no-op when no DSN is configured — that's the
 * property the whole "ship without a Sentry account" design depends on. If
 * this ever flips to true without NEXT_PUBLIC_SENTRY_DSN set, every dev
 * machine would start POSTing to a dead endpoint.
 */
describe("error-reporter", () => {
  it("is disabled when no DSN is configured (default test env)", () => {
    expect(isErrorReporterEnabled()).toBe(false);
  });
});
