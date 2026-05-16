# MapleRewards browser extension (MVP scaffold)

Minimum viable Chrome (and Edge / Brave / Opera — all Chromium) extension
that surfaces the user's best Canadian credit card on supported retailer
checkouts. This is a scaffold — the structure works end-to-end against the
local API, but the cookie-bridge to the web app is intentionally manual.

## Quick install for development

1. Run the API + web app:
   ```sh
   make docker-up && make dev          # API on :8080
   cd frontend && npm run dev          # web on :3000
   ```
2. Open `chrome://extensions`, enable **Developer mode**, click **Load
   unpacked**, and select this directory.
3. (Until the cookie-bridge is wired up) seed your session ID into the
   extension storage so the popup can read your wallet:
   ```js
   // From the popup's DevTools console (right-click extension icon →
   // Inspect popup):
   await chrome.storage.local.set({ mr_session_id: "<copy from
   localStorage.getItem('maple_session_id') in the web app>" });
   ```
4. Visit any of the 25 supported retailers (Amazon.ca, Costco.ca,
   Loblaws.ca, Shoppers, Sobeys, Air Canada, etc.) — a small floating card
   in the bottom right will surface your best-card recommendation. Costco /
   Loblaws / Shoppers visits get a prominent Amex-blackout warning.

## File layout

| File             | What it does                                                           |
|------------------|------------------------------------------------------------------------|
| `manifest.json`  | MV3 manifest — permissions, content-script host matches, popup wiring  |
| `background.js`  | Service worker — proxies cookie-bearing fetches for content + popup    |
| `content.js`     | Injected on supported merchant hostnames — renders the floating card   |
| `content.css`    | Namespaced styles for the floating card overlay                        |
| `popup.html`     | The action popup (extension-icon click)                                |
| `popup.css`      | Popup styles                                                           |
| `popup.js`       | Popup logic — fetches and renders the user's wallet                    |
| `icons/`         | 16/32/48/128 px PNG icons (placeholders — replace before publishing)   |

## Roadmap (post-MVP)

1. **Cookie bridge** — when the user is signed in to maplerewards.app, write
   `mr_session_id` into the extension's storage automatically via a one-
   time `window.postMessage`. Right now this is manual.
2. **Best-card-on-checkout overlay** — anchor the recommendation tile next
   to the actual checkout button, not the page corner. Requires per-merchant
   selectors.
3. **Auto-activate Amex / RBC offers** — call `/wallet/{sid}/offers/auto-
   activate` (not yet built) when the user lands on a participating store.
4. **Push notifications for award-watch alerts** — query
   `/wallet/{sid}/award-watches` periodically; if `last_alert_at` is fresh,
   show a chrome.notifications toast.
5. **Real icons** — current icons are placeholder zeros. Need 16/32/48/128
   PNGs in `icons/` before Chrome Web Store submission.

## Permissions explainer

The extension requests:
- `storage` — local key/value for `apiBase` + `mr_session_id`.
- `activeTab` — needed to inject the content script on demand (not required
  for the matches listed in manifest.json's `content_scripts`).
- `tabs` — currently unused; reserved for a future "open dashboard in new
  tab" command.
- `host_permissions` — `localhost:8080`, `maplerewards.app` (the API and the
  web app). Required so `fetch` from the service worker can include
  cookies.

We deliberately do NOT request `<all_urls>` or `webRequest` — Chrome Web
Store reviews flag those and we don't need them.

## Distribution

Not yet published. To publish:
1. Replace icons in `icons/` (currently 1×1 placeholders).
2. Bump version in `manifest.json`.
3. Zip the directory: `zip -r maplerewards-extension-v0.1.0.zip .`
4. Upload via the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole).
