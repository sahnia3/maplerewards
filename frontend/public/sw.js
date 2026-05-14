/* MapleRewards service worker — offline shell + cache-first static assets.
 *
 * Strategy:
 *   - HTML navigations: network-first with a 3s timeout, fall back to the
 *     cached app shell so the user sees something usable when offline.
 *   - Static assets (icons, fonts, /_next/static): cache-first.
 *   - API requests (/api/v1): network-only — points/CPP need to be live.
 *
 * Versioned cache name lets us invalidate everything at once on a deploy
 * by bumping the suffix below.
 */

const CACHE_VERSION = "v3";
const SHELL_CACHE = `mr-shell-${CACHE_VERSION}`;
const STATIC_CACHE = `mr-static-${CACHE_VERSION}`;

const SHELL_URLS = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.endsWith(CACHE_VERSION))
            .map((k) => caches.delete(k)),
        ),
      ),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // API requests: always network. Don't cache CPP/points data.
  if (url.pathname.startsWith("/api/v1") || url.hostname.includes("localhost") && url.port === "8080") {
    return;
  }

  // Same-origin static assets: cache-first.
  if (url.origin === self.location.origin && /\.(png|jpg|jpeg|svg|webp|woff2?|css|js)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  // HTML navigations: network-first with shell fallback.
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    event.respondWith(networkFirst(req, SHELL_CACHE));
    return;
  }
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const fresh = await fetch(req);
    if (fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch (e) {
    return cached || Response.error();
  }
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await Promise.race([
      fetch(req),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
    ]);
    if (fresh && fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch (e) {
    const cached = await cache.match(req);
    if (cached) return cached;
    // Final fallback: the shell page
    return cache.match("/");
  }
}
