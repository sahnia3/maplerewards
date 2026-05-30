// MapleRewards background service worker.
//
// Runs in the extension's lifecycle, not in any page. Today its only jobs:
//   - On install, set the default API base URL in chrome.storage.
//   - Listen for content-script messages requesting a fetch through the
//     extension's origin (avoids CORS hassle when the API expects creds).
//
// MV3 service workers can be killed by Chrome when idle, so all state lives
// in chrome.storage rather than module-scope variables.

// Default to PRODUCTION so a freshly-installed extension works before the user
// has visited the web app. The web-app bridge (bridge.js) overrides `apiBase`
// in storage to the correct dev/prod API the moment the user opens the app, so
// dev still works (localhost:3000 -> localhost:8080).
const DEFAULT_API_BASE = "https://maplerewards-production.up.railway.app/api/v1";

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === "install") {
    // Only seed a default if the bridge hasn't already set one.
    const { apiBase } = await chrome.storage.local.get("apiBase");
    if (!apiBase) await chrome.storage.local.set({ apiBase: DEFAULT_API_BASE });
  }
});

// Content scripts can ask the background worker to make an authenticated
// API call. The worker forwards the request with `credentials: include` so
// the user's mr_access cookie (set by the web app on the same origin) is
// attached automatically.
//
// SECURITY: this worker is a credentialed fetch proxy. Without the guards
// below, ANY script that can reach this message channel (a content script
// runs on 25+ merchant domains; a compromised/XSS'd merchant page relaying
// via the content script) could drive arbitrary authenticated API calls
// against the user's account (account deletion, wallet enumeration, billing
// portal) and read the responses. We therefore:
//   1. Only accept messages from THIS extension's own contexts.
//   2. Allow only the exact (method, path) pairs the extension actually
//      uses — a strict allowlist, not caller-supplied path/method.

// The complete set of API calls this extension legitimately makes.
// `path` is matched as an anchored regex; nothing else is forwarded.
const ALLOWED_REQUESTS = [
  { method: "GET", path: /^\/wallet\/[a-f0-9]{32}$/ }, // popup: read wallet
  { method: "POST", path: /^\/optimize$/ },             // content: optimize
];

function isAllowed(method, path) {
  return ALLOWED_REQUESTS.some(
    (r) => r.method === method && typeof path === "string" && r.path.test(path)
  );
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "api_fetch") return false;

  // 1. Reject anything not originating from this extension itself.
  if (!sender || sender.id !== chrome.runtime.id) {
    sendResponse({ ok: false, status: 0, body: "forbidden: sender" });
    return false;
  }

  // 2. Enforce the method + path allowlist. Caller cannot pick arbitrary
  //    endpoints; an unknown request is refused without ever being sent.
  const method = (msg.method || "GET").toUpperCase();
  if (!isAllowed(method, msg.path)) {
    sendResponse({ ok: false, status: 0, body: "forbidden: request not allowlisted" });
    return false;
  }

  (async () => {
    try {
      const { apiBase, mr_access_token } = await chrome.storage.local.get([
        "apiBase",
        "mr_access_token",
      ]);
      const base = apiBase || DEFAULT_API_BASE;
      const headers = { "Content-Type": "application/json" };
      // Signed-in users have owner-scoped wallets that need the JWT (the
      // anonymous session id alone returns 404). The web-app bridge relays a
      // short-lived access token into storage; attach it when present. Still
      // restricted to the two allow-listed (method, path) pairs above.
      if (mr_access_token) headers["Authorization"] = "Bearer " + mr_access_token;
      const res = await fetch(base + msg.path, {
        method,
        credentials: "include",
        headers,
        body: msg.body ? JSON.stringify(msg.body) : undefined,
      });
      const text = await res.text();
      sendResponse({ ok: res.ok, status: res.status, body: text });
    } catch (e) {
      sendResponse({ ok: false, status: 0, body: String(e) });
    }
  })();
  return true; // keep channel open for the async response
});
