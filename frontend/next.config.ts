import type { NextConfig } from "next";

// Security response headers. The app is a CORS SPA that loads Google Identity
// Services and talks to the backend API cross-origin, so the CSP allows those
// while still locking the clickjacking / object / base-uri vectors. The
// non-CSP headers are unconditionally safe for a normal SPA.
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js injects a small inline bootstrap; GIS is loaded from Google.
      "script-src 'self' 'unsafe-inline' https://accounts.google.com https://apis.google.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      // Backend API is a different origin (no BFG); allow https + ws for dev.
      "connect-src 'self' https: http://localhost:8080 ws://localhost:3000",
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
};

export default nextConfig;
