// Popup logic — fired when the user clicks the extension icon.
// Talks to the background service worker (which has cookie-bearing API
// access) to fetch the user's wallet and render it in the popup.

const $cards = document.getElementById("cards");
const $openApp = document.getElementById("open-app");
const $openSettings = document.getElementById("open-settings");

(async function init() {
  // Resolve the configured app URL for footer links.
  const { apiBase } = await chrome.storage.local.get("apiBase");
  const appBase = (apiBase || "http://localhost:8080/api/v1").replace("/api/v1", "").replace("8080", "3000");
  $openApp.href = appBase;
  $openSettings.href = appBase + "/settings";

  // Fetch session ID from local storage (synced from web app via shared
  // cookie domain). For MVP we simply read the session_id from the
  // backend's anonymous wallet endpoint as a fallback if no JWT is present.
  const sid = await getSessionID();
  if (!sid) {
    renderEmpty("Sign in to maplerewards.app to see your wallet here.");
    return;
  }

  chrome.runtime.sendMessage(
    { type: "api_fetch", path: `/wallet/${sid}` },
    (resp) => {
      if (!resp?.ok) {
        renderError(`Couldn't load wallet (${resp?.status || "no response"}).`);
        return;
      }
      try {
        const cards = JSON.parse(resp.body);
        if (!Array.isArray(cards) || cards.length === 0) {
          renderEmpty("Wallet is empty. Add cards on maplerewards.app/cards.");
          return;
        }
        renderCards(cards);
      } catch (e) {
        renderError("Couldn't parse wallet response.");
      }
    },
  );
})();

async function getSessionID() {
  // Cookie-bridge path: read the session cookie directly from the
  // maplerewards.app domain. Requires `cookies` permission + a host_permissions
  // entry in manifest.json. Falls back to the legacy chrome.storage bridge
  // for users who installed the extension before the cookie permission
  // was granted (those still need to use the manual paste flow once).
  const COOKIE_HOSTS = [
    "https://maplerewards.app",
    "https://www.maplerewards.app",
    "http://localhost:3000",
  ];
  for (const url of COOKIE_HOSTS) {
    try {
      const cookie = await chrome.cookies.get({ url, name: "mr_session" });
      if (cookie && cookie.value) {
        // Do NOT persist the session value. It is bearer-equivalent (anyone
        // holding it can read the wallet); writing it to storage.local made
        // it survive logout and readable by any extension code path. Read it
        // fresh from the httpOnly-domain cookie on every popup open instead.
        return cookie.value;
      }
    } catch (_) {
      // Permission denied or domain not visited yet — try the next host.
    }
  }
  // Legacy fallback: storage may still hold a manually-pasted value, or
  // the extension may have set it from a previous cookie read.
  const { mr_session_id } = await chrome.storage.local.get("mr_session_id");
  return mr_session_id || null;
}

function renderEmpty(text) {
  $cards.innerHTML = `<div class="empty">${escapeHtml(text)}</div>`;
}
function renderError(text) {
  $cards.innerHTML = `<div class="error">${escapeHtml(text)}</div>`;
}

function renderCards(cards) {
  $cards.innerHTML = "";
  for (const uc of cards) {
    const row = document.createElement("div");
    row.className = "card-row";
    const name = uc.card?.name ?? "Card";
    const prog = uc.card?.loyalty_program?.name ?? "";
    const balance = uc.point_balance ?? 0;
    row.innerHTML = `
      <div>
        <div class="name">${escapeHtml(name)}</div>
        <div class="program">${escapeHtml(prog)}</div>
      </div>
      <div class="balance">${balance.toLocaleString()} pts</div>
    `;
    $cards.appendChild(row);
  }
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
