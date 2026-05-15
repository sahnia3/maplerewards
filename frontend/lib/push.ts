/**
 * push.ts — browser-side push notification plumbing.
 *
 * The flow:
 *   1. getVAPIDPublicKey()  fetches the server's public key
 *   2. ensurePushPermission() asks the user for permission
 *   3. subscribeBrowser()   registers the SW + creates a PushSubscription
 *   4. POSTs the subscription to /push/subscribe so the worker can find it
 *
 * All four steps are wrapped in subscribeToPush() — that's the only function
 * UI code should normally call. unsubscribeFromPush() reverses it.
 */

import { BASE_URL, request } from "./api";

const SW_URL = "/sw-push.js";
const SW_SCOPE = "/";

interface VAPIDResponse {
  public_key: string;
}

// ── Capability detection ────────────────────────────────────────────────────

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

// ── Server VAPID key ────────────────────────────────────────────────────────

export async function getVAPIDPublicKey(): Promise<string> {
  const { public_key } = await request<VAPIDResponse>("/push/vapid-public-key");
  return public_key || "";
}

// ── Permission handshake ────────────────────────────────────────────────────

/**
 * Throws if the user denies or the browser doesn't support notifications.
 * Resolves once permission state is "granted".
 */
async function ensurePushPermission(): Promise<void> {
  if (!("Notification" in window)) {
    throw new Error("Notifications are not supported in this browser");
  }
  if (Notification.permission === "granted") return;
  if (Notification.permission === "denied") {
    throw new Error("Notifications are blocked — enable them in browser settings");
  }
  const result = await Notification.requestPermission();
  if (result !== "granted") {
    throw new Error("Notification permission denied");
  }
}

// ── VAPID key conversion ────────────────────────────────────────────────────

/**
 * Web Push expects the VAPID public key as a Uint8Array. Server returns it
 * as a URL-safe base64 string; convert here.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// ── Subscription lifecycle ──────────────────────────────────────────────────

/**
 * Subscribes the current browser to push notifications and stores the
 * subscription on the server. Returns the active subscription on success.
 *
 * Idempotent: calling repeatedly returns the existing subscription if one
 * is already registered for this browser.
 */
export async function subscribeToPush(): Promise<PushSubscription> {
  if (!pushSupported()) {
    throw new Error("Push notifications are not supported in this browser");
  }

  const vapidKey = await getVAPIDPublicKey();
  if (!vapidKey) {
    throw new Error("Push notifications are not configured on the server");
  }

  await ensurePushPermission();

  const reg = await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
  await navigator.serviceWorker.ready; // wait until SW is actually active

  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    // applicationServerKey accepts a BufferSource; some TS lib.dom versions
    // type the Uint8Array buffer as ArrayBufferLike (could be SharedArrayBuffer).
    // Our converter always produces a regular ArrayBuffer so the cast is safe.
    const keyBytes = urlBase64ToUint8Array(vapidKey);
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes.buffer as ArrayBuffer,
    });
  }

  // POST the W3C subscription JSON to the server. Server's subscribeRequest
  // shape matches the toJSON() output exactly, plus an optional user_agent.
  const json = subscription.toJSON() as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
  await request("/push/subscribe", {
    method: "POST",
    body: JSON.stringify({
      ...json,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    }),
  });

  return subscription;
}

/**
 * Unsubscribes this browser. Removes the subscription on the push service
 * AND deletes it from our server. Safe to call when nothing is subscribed.
 */
export async function unsubscribeFromPush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration(SW_SCOPE);
  if (!reg) return;
  const subscription = await reg.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await request("/push/subscribe", {
    method: "DELETE",
    body: JSON.stringify({ endpoint }),
  }).catch(() => {
    // Server-side delete is best-effort — the browser-side unsubscribe is
    // already done so the user no longer receives pushes either way.
  });
}

/**
 * Fires a synthetic push to every subscription owned by the calling user.
 * Pro-gated server-side (returns 402 for free users).
 */
export async function sendTestPush(): Promise<{ sent: number; pruned: number; attempts: number }> {
  return request("/push/test", { method: "POST", body: JSON.stringify({}) });
}

// Re-export BASE_URL so callers don't double-import.
export { BASE_URL };
