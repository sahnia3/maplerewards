/* MapleRewards service worker — DEV KILL-SWITCH.
 *
 * Previously this SW cached static assets aggressively (cache-first on
 * /_next/static/*) which made dev iteration painful: each new commit's
 * CSS got intercepted by the SW returning a stale earlier build, so the
 * user kept seeing the broken UI even after fixes landed.
 *
 * This version does the opposite: it unregisters itself on first run,
 * wipes every Maple cache, and forces every controlled client to
 * reload. After this version takes effect once, the SW is fully gone
 * for that browser until something explicitly re-registers it.
 *
 * If/when offline support is reintroduced for production, give the new
 * SW a different filename (e.g. /sw-v2.js) so this kill-switch keeps
 * doing its job for users still on the old path.
 */

self.addEventListener("install", (event) => {
  // Take over from any existing SW immediately so the unregister path
  // runs ASAP rather than waiting for tabs to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // 1. Nuke every cache we ever created.
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));

    // 2. Unregister ourselves so the browser stops calling this SW.
    await self.registration.unregister();

    // 3. Force every controlled client (open tab) to reload with fresh
    //    assets from the dev server. Without this they'd keep showing
    //    the old broken state until the user manually refreshes.
    const clients = await self.clients.matchAll({ type: "window" });
    for (const client of clients) {
      client.navigate(client.url);
    }
  })());
});

/* No fetch handler — once unregistered, requests bypass the SW
 * entirely. Until unregister completes, network is the default
 * because we don't intercept. */
