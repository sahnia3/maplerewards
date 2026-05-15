"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/error-reporter";

/**
 * ErrorReporterInit wires window-level error handlers exactly once. Mount in
 * the root layout above the rest of the app so unhandled errors anywhere in
 * the tree get reported. Returns null — pure side-effect component.
 *
 * Without this, React swallows uncaught render errors and we lose visibility
 * on the things most likely to take down a page in production.
 */
export function ErrorReporterInit() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      reportError(event.error ?? event.message, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      reportError(event.reason, { kind: "unhandledrejection" });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
