/**
 * Minimal browser error reporter. POSTs caught errors directly to the
 * Sentry `store` endpoint using the public DSN — no @sentry/nextjs
 * dependency, no Next.js wizard, no instrumentation file. Trade-off:
 * we don't get source-map symbolication, breadcrumbs, or replay.
 *
 * Activates only when NEXT_PUBLIC_SENTRY_DSN is set. Otherwise every
 * call is a no-op so the codebase compiles + runs in dev without
 * needing a Sentry account.
 *
 * If we later outgrow this and need replays/breadcrumbs, swap in
 * `@sentry/nextjs` — keep the reportError() and reportMessage() function
 * signatures so call sites don't churn.
 */

interface SentryConfig {
  endpoint: string;
  publicKey: string;
  environment: string;
  release: string;
}

let config: SentryConfig | null = null;

if (typeof window !== "undefined") {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || "";
  if (dsn) {
    try {
      const u = new URL(dsn);
      const publicKey = u.username;
      const projectID = u.pathname.replace(/^\//, "");
      if (publicKey && projectID) {
        config = {
          endpoint: `${u.protocol}//${u.host}/api/${projectID}/store/`,
          publicKey,
          environment: process.env.NEXT_PUBLIC_APP_ENV || "production",
          release: process.env.NEXT_PUBLIC_GIT_COMMIT || "dev",
        };
      }
    } catch {
      // Invalid DSN — silently disable. Don't break the app.
    }
  }
}

function send(payload: Record<string, unknown>): void {
  if (!config) return;
  try {
    const body = JSON.stringify({
      event_id: makeEventID(),
      timestamp: Date.now() / 1000,
      platform: "javascript",
      logger: "maplerewards-web",
      environment: config.environment,
      release: config.release,
      ...payload,
    });
    // sendBeacon is fire-and-forget and doesn't block page unloads.
    // It returns false if the browser refused; fall back to fetch in that
    // case.
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.sendBeacon === "function"
    ) {
      const blob = new Blob([body], { type: "application/json" });
      const ok = navigator.sendBeacon(
        `${config.endpoint}?sentry_version=7&sentry_key=${config.publicKey}`,
        blob,
      );
      if (ok) return;
    }
    fetch(config.endpoint, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${config.publicKey}, sentry_client=maplerewards-web/1.0`,
      },
      body,
    }).catch(() => {
      // Network error — drop. Don't fail the page.
    });
  } catch {
    // Serialization failure — drop.
  }
}

function makeEventID(): string {
  let id = "";
  const chars = "0123456789abcdef";
  for (let i = 0; i < 32; i++) id += chars[Math.floor(Math.random() * 16)];
  return id;
}

/** Report a caught exception. Safe to call when no DSN is configured. */
export function reportError(err: unknown, extra?: Record<string, unknown>): void {
  if (!config) return;
  const e = err instanceof Error ? err : new Error(String(err));
  send({
    level: "error",
    message: e.message,
    exception: {
      values: [
        {
          type: e.name || "Error",
          value: e.message,
          stacktrace: e.stack ? { frames: parseStack(e.stack) } : undefined,
        },
      ],
    },
    extra,
  });
}

/** Report an info/warning event without an exception. */
export function reportMessage(
  level: "info" | "warning" | "error",
  message: string,
  extra?: Record<string, unknown>,
): void {
  if (!config) return;
  send({ level, message, extra });
}

interface SentryFrame {
  filename?: string;
  function?: string;
  lineno?: number;
  colno?: number;
}

function parseStack(stack: string): SentryFrame[] {
  const frames: SentryFrame[] = [];
  for (const raw of stack.split("\n")) {
    const m = raw.match(/^\s*at\s+(?:([^\s]+)\s+\()?(.+?):(\d+):(\d+)\)?/);
    if (!m) continue;
    frames.push({
      function: m[1] || undefined,
      filename: m[2],
      lineno: parseInt(m[3], 10),
      colno: parseInt(m[4], 10),
    });
  }
  return frames.reverse(); // Sentry wants oldest-first
}

/** Returns true when a DSN is configured and the reporter is active. */
export function isErrorReporterEnabled(): boolean {
  return config !== null;
}
