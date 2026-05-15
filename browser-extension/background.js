// MapleRewards background service worker.
//
// Runs in the extension's lifecycle, not in any page. Today its only jobs:
//   - On install, set the default API base URL in chrome.storage.
//   - Listen for content-script messages requesting a fetch through the
//     extension's origin (avoids CORS hassle when the API expects creds).
//
// MV3 service workers can be killed by Chrome when idle, so all state lives
// in chrome.storage rather than module-scope variables.

const DEFAULT_API_BASE = "http://localhost:8080/api/v1";

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === "install") {
    await chrome.storage.local.set({ apiBase: DEFAULT_API_BASE });
  }
});

// Content scripts can ask the background worker to make an authenticated
// API call. The worker forwards the request with `credentials: include` so
// the user's mr_access cookie (set by the web app on the same origin) is
// attached automatically.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "api_fetch") return false;
  (async () => {
    try {
      const { apiBase } = await chrome.storage.local.get("apiBase");
      const base = apiBase || DEFAULT_API_BASE;
      const res = await fetch(base + msg.path, {
        method: msg.method || "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
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
