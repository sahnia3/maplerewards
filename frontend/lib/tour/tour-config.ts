/* Guided-tour gate + helpers. The tour fires once for a freshly-created account
 * when they land back on Home after onboarding (within the first-login window),
 * is replayable from Settings, and never re-nags. */

export const TOUR_SEEN_KEY = "maple_tour_seen_v1";
export const TOUR_REPLAY_FLAG = "maple_tour_replay_v1";
export const FIRST_LOGIN_WINDOW_MIN = 30;
export const TOUR_DEFER_MS = 600;

export function tourSeenKey(userId: string) {
  return `${TOUR_SEEN_KEY}:${userId}`;
}

export function hasSeenTour(userId?: string | null): boolean {
  if (typeof window === "undefined" || !userId) return false;
  return window.localStorage.getItem(tourSeenKey(userId)) === "true";
}

export function markTourSeen(userId?: string | null) {
  if (typeof window === "undefined" || !userId) return;
  window.localStorage.setItem(tourSeenKey(userId), "true");
}

/** Read and clear the replay flag in one call. */
export function consumeReplayFlag(): boolean {
  if (typeof window === "undefined") return false;
  const on = window.localStorage.getItem(TOUR_REPLAY_FLAG) === "1";
  if (on) window.localStorage.removeItem(TOUR_REPLAY_FLAG);
  return on;
}

export function requestReplay() {
  if (typeof window !== "undefined") window.localStorage.setItem(TOUR_REPLAY_FLAG, "1");
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
    document.documentElement.getAttribute("data-reduce-motion") === "true"
  );
}

export function isWithinFirstLogin(createdAt?: string): boolean {
  if (!createdAt) return false;
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return false;
  return (Date.now() - t) / 60000 <= FIRST_LOGIN_WINDOW_MIN;
}
