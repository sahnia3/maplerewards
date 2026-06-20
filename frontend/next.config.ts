import type { NextConfig } from "next";

// Security response headers. The app is a CORS SPA that loads Google Identity
// Services and talks to the backend API cross-origin, so the CSP allows those
// while still locking the clickjacking / object / base-uri vectors. The
// non-CSP headers are unconditionally safe for a normal SPA.
const isDev = process.env.NODE_ENV === "development";

// The backend API is a different origin (CORS SPA, no BFF). connect-src must
// allow exactly that origin and nothing more. We reuse the SAME env var the
// frontend already uses to reach the API (NEXT_PUBLIC_API_URL, see
// frontend/lib/api.ts) so CSP and fetch target can never drift apart.
// In dev we keep localhost + the dev websocket (HMR); in production we derive
// the origin from NEXT_PUBLIC_API_URL and NEVER ship localhost.
function apiConnectSrc(): string {
  if (isDev) {
    // Dev: local API over http + Next.js HMR websocket on the dev origin.
    return "http://localhost:8080 ws://localhost:3000";
  }
  // Prod: derive the API origin (scheme://host[:port]) from the configured
  // base URL. Fall back to 'self' only — never localhost — if it is unset or
  // unparseable, so a misconfigured deploy fails closed (API calls blocked by
  // CSP) rather than silently allowing localhost.
  const raw = process.env.NEXT_PUBLIC_API_URL;
  if (!raw) return "";
  try {
    return new URL(raw).origin;
  } catch {
    return "";
  }
}

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js injects a small inline bootstrap; GIS is loaded from Google.
      // 'unsafe-eval' is added in development only — React Fast Refresh and the
      // dev error overlay (callstack reconstruction) require eval(); production
      // never gets it.
      // TODO(csp): 'unsafe-inline' on script-src is required by the Next.js
      // inline bootstrap script. Removing it safely needs per-request nonces
      // (middleware-injected nonce + matching `nonce-…` on the bootstrap tag);
      // do not drop it without that or the app will fail to hydrate.
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://accounts.google.com https://apis.google.com`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      // connect-src is the network allow-list for fetch/XHR/WebSocket. We list
      // exactly what the app talks to instead of a blanket `https:`:
      //   - the backend API origin (environment-driven, see apiConnectSrc):
      //     localhost in dev, the configured NEXT_PUBLIC_API_URL origin in prod
      //     — prod NEVER ships localhost;
      //   - Google Identity Services, which makes XHR calls to accounts.google.com
      //     during the sign-in credential flow (the GIS client script is loaded
      //     in components/auth/google-sign-in-button.tsx).
      `connect-src 'self' https://accounts.google.com${apiConnectSrc() ? " " + apiConnectSrc() : ""}`,
      "frame-src https://accounts.google.com",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
    ].join("; "),
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Dev-only: proxy API calls through the dev origin so a dev frontend on any
  // port reaches the local API without a CORS origin mismatch. Production uses
  // an absolute NEXT_PUBLIC_API_URL and never hits this.
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    return [{ source: "/api/v1/:path*", destination: "http://localhost:8080/api/v1/:path*" }];
  },
};

export default nextConfig;
