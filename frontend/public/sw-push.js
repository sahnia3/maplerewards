/* MapleRewards push-only service worker.
 *
 * Distinct from /sw.js (the legacy kill-switch). This SW exists ONLY to
 * receive web-push events; it does not intercept fetch, does not cache,
 * does not unregister itself. The split keeps the two responsibilities
 * (kill stale caching SW vs. deliver push) cleanly separated.
 *
 * Registered on-demand by /lib/push.ts when the user opts in to alerts.
 */

self.addEventListener("install", () => {
  // Activate immediately so the first push after subscribe doesn't get lost
  // waiting for tabs to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  // The backend sends a JSON envelope: { title, body, url?, tag? }.
  // Fall back to a generic alert if payload is missing/unparseable so we
  // never silently swallow a delivery.
  let payload = {
    title: "Maple",
    body: "You have an update.",
    url: "/",
    tag: "maple-generic",
  };
  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      try {
        payload.body = event.data.text() || payload.body;
      } catch {
        /* keep defaults */
      }
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,                  // dedupe in OS notification UI
      data: { url: payload.url },         // read in notificationclick
      icon: "/icons/icon-192.png",        // optional; falls back to favicon
      badge: "/icons/icon-192.png",
      requireInteraction: false,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      // If a Maple tab is already open, focus + navigate it rather than
      // spawning a duplicate. Same-origin only — clients.matchAll returns
      // only same-origin windows by default.
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of allClients) {
        const url = new URL(client.url);
        if (url.origin === self.location.origin) {
          await client.focus();
          if (client.navigate) {
            await client.navigate(target);
          }
          return;
        }
      }
      // No existing tab — open a fresh one at the deep link.
      await self.clients.openWindow(target);
    })(),
  );
});
