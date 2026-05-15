"use client";

import { useEffect } from "react";

/**
 * SWRegister — registers the service worker once on mount. No-op on the
 * server, no-op when SW is unsupported, no-op in dev (Next dev server fights
 * with caching). Safe to mount in the root layout.
 */
export function SWRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("MapleRewards SW registration failed:", err);
      });
    };
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
