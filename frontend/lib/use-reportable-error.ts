"use client";

import { useCallback } from "react";
import { reportError } from "@/lib/error-reporter";

/**
 * useReportableError — replacement for the .catch(console.error) pattern.
 *
 * Returns a `report` function that:
 *   1. Logs to console (preserves the dev-tools workflow)
 *   2. Ships the error to Sentry via the package-level reporter
 *   3. Surfaces a label so the call site is identifiable in the Sentry feed
 *
 * Toast/UI surfacing is intentionally out of scope here — different call
 * sites want different UX (some want a banner, some want silent retry).
 * Callers compose with their own toast/banner state.
 *
 * Usage:
 *
 *     const report = useReportableError("portfolio.loadStack");
 *     listStack().then(setData).catch(report);
 */
export function useReportableError(label: string) {
  return useCallback((err: unknown) => {
    // Dev affordance: keep console output so DevTools workflow doesn't change.
    if (process.env.NODE_ENV !== "production") {
       
      console.error(`[${label}]`, err);
    }
    reportError(err, { surface: label });
  }, [label]);
}
