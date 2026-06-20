/**
 * Minimal, privacy-respecting product-analytics client. Mirrors the no-op
 * pattern in `error-reporter.ts`: every call is a strict NO-OP — no network,
 * no console — unless an analytics key is configured AND the user has given
 * cookie consent.
 *
 * Activation requires:
 *   - NEXT_PUBLIC_ANALYTICS_KEY      (required) — project/write key. When unset,
 *                                     the client stays dark and ships nothing.
 *   - NEXT_PUBLIC_ANALYTICS_ENDPOINT (optional) — URL to POST events to. When
 *                                     set, events are sent as fire-and-forget
 *                                     JSON. When unset (key present, no
 *                                     endpoint) we fall back to a lazily,
 *                                     dynamically-imported PostHog so no heavy
 *                                     SDK is bundled when analytics is disabled.
 *
 * Consent: gated on the cookie-consent banner's localStorage key
 * (`mr_cookie_consent_v1` === "accepted"). Until the user accepts, events are
 * dropped. This matches the disclosure in `components/cookie-consent.tsx`.
 *
 * If we outgrow this and need autocapture/session-replay, lean on the PostHog
 * path — keep the track() and pageview() signatures so call sites don't churn.
 */

// Mirror the cookie-consent component's storage contract. If that key or its
// accepted value changes, update both.
const CONSENT_STORAGE_KEY = "mr_cookie_consent_v1";

const analyticsKey =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_ANALYTICS_KEY || ""
    : "";
const analyticsEndpoint = process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT || "";

/** True when a key is configured. Network still gated on consent at send time. */
function isConfigured(): boolean {
  return analyticsKey !== "";
}

/** True only after the user has accepted cookies via the consent banner. */
function hasConsent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(CONSENT_STORAGE_KEY) === "accepted";
  } catch {
    // localStorage unavailable (private mode, quota) — treat as no consent.
    return false;
  }
}

// Minimal shape of the bits of posthog-js we touch. We deliberately avoid a
// hard type/dependency on `posthog-js` so this file typechecks and ships even
// when the SDK isn't installed (endpoint mode is the default path). The
// package is resolved lazily at runtime only when no endpoint is configured.
interface PostHogLike {
  init(key: string, options?: Record<string, unknown>): void;
  capture(event: string, props?: Record<string, unknown>): void;
}

// PostHog is imported lazily the first time it's needed so the SDK never lands
// in the bundle when analytics is disabled. Cached as a promise to dedupe.
let posthogPromise: Promise<PostHogLike | null> | null = null;

function loadPosthog(): Promise<PostHogLike | null> {
  if (posthogPromise) return posthogPromise;
  // Indirect specifier keeps the bundler/typechecker from hard-resolving the
  // optional `posthog-js` package at build time.
  const pkg = "posthog-js";
  posthogPromise = import(/* webpackIgnore: true */ pkg)
    .then((mod: { default?: PostHogLike }) => {
      const posthog = mod.default;
      if (!posthog) return null;
      try {
        posthog.init(analyticsKey, {
          api_host:
            process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
          // We fire pageviews manually on route change; disable autocapture so
          // nothing is collected beyond what we explicitly emit.
          capture_pageview: false,
          autocapture: false,
        });
      } catch {
        // Init failure — disable. Don't break the app.
        return null;
      }
      return posthog;
    })
    .catch(() => null);
  return posthogPromise;
}

function emit(event: string, props?: Record<string, unknown>): void {
  if (!isConfigured() || !hasConsent()) return;

  // Endpoint mode: fire-and-forget JSON POST. No SDK, no cookies of our own.
  if (analyticsEndpoint) {
    try {
      const body = JSON.stringify({
        key: analyticsKey,
        event,
        properties: props,
        path:
          typeof window !== "undefined" ? window.location.pathname : undefined,
        timestamp: Date.now(),
      });
      fetch(analyticsEndpoint, {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body,
      }).catch(() => {
        // Network error — drop. Don't fail the page.
      });
    } catch {
      // Serialization failure — drop.
    }
    return;
  }

  // PostHog fallback: load lazily, then capture.
  loadPosthog()
    .then((posthog) => {
      if (!posthog) return;
      try {
        posthog.capture(event, props);
      } catch {
        // Drop.
      }
    })
    .catch(() => {
      // Drop.
    });
}

/**
 * Track a product event. Safe to call always — no-op unless analytics is
 * configured and the user has consented.
 */
export function track(event: string, props?: Record<string, unknown>): void {
  emit(event, props);
}

/**
 * Record a pageview for the given path. Safe to call always — no-op unless
 * analytics is configured and the user has consented.
 */
export function pageview(path: string): void {
  if (!isConfigured() || !hasConsent()) return;
  if (analyticsEndpoint) {
    emit("$pageview", { path });
    return;
  }
  loadPosthog()
    .then((posthog) => {
      if (!posthog) return;
      try {
        posthog.capture("$pageview", { $current_url: path, path });
      } catch {
        // Drop.
      }
    })
    .catch(() => {
      // Drop.
    });
}

/** True when an analytics key is configured (independent of consent state). */
export function isAnalyticsEnabled(): boolean {
  return isConfigured();
}
