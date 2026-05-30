// MapleRewards web-app bridge.
//
// Runs ONLY on the MapleRewards web app (localhost:3000 / *.vercel.app /
// *.maplerewards.app — see manifest content_scripts). Its job is to hand the
// extension the two things it needs to talk to the API:
//
//   1. apiBase   — derived from which web origin we're on, so the extension
//                  targets the matching API (dev vs prod) without hardcoding.
//   2. session   — the anonymous wallet session id from localStorage, and,
//                  for signed-in users, a short-lived access token the web
//                  app posts to us (owner-scoped wallets need the JWT).
//
// Without this, the extension had no real session source — the popup read a
// cookie the backend never sets and the content script read a storage key
// nothing populated, so the floating best-card bar never worked for a real user.

(function () {
  // Map each web origin to its API base. Keeps the extension domain-agnostic.
  const API_BY_ORIGIN = {
    "http://localhost:3000": "http://localhost:8080/api/v1",
    "https://maplerewards.vercel.app": "https://maplerewards-production.up.railway.app/api/v1",
    "https://maplerewards.app": "https://api.maplerewards.app/api/v1",
    "https://www.maplerewards.app": "https://api.maplerewards.app/api/v1",
  };

  const apiBase = API_BY_ORIGIN[location.origin];

  function readAnonSession() {
    try {
      return localStorage.getItem("maple_session_id") || null;
    } catch (_) {
      return null;
    }
  }

  // Push whatever we currently know to the extension's storage.
  function sync(extra) {
    const patch = Object.assign({}, extra || {});
    if (apiBase) patch.apiBase = apiBase;
    // The web app's own origin — used by the popup for its "Open dashboard" /
    // "Settings" links instead of brittle string-munging of the API URL.
    patch.appBase = location.origin;
    const sid = readAnonSession();
    if (sid) patch.mr_session_id = sid;
    try {
      chrome.storage.local.set(patch);
    } catch (_) {
      // extension context gone (e.g. updated/reloaded) — ignore.
    }
  }

  // Initial sync: apiBase + appBase + anonymous session id.
  sync();

  // Signed-in users don't need anything relayed here: the extension's background
  // fetch uses credentials:include against the API host, so the httpOnly
  // mr_access cookie authenticates them automatically. We never touch the JWT.

  // The anonymous session id can change (e.g. a new wallet) without a reload;
  // re-sync on storage events so the extension stays fresh.
  window.addEventListener("storage", (e) => {
    if (e.key === "maple_session_id") sync();
  });
})();
