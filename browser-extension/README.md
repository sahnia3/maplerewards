# MapleRewards browser extension

Chrome (and Edge / Brave / Opera — all Chromium) extension that surfaces the
user's best Canadian credit card on supported retailer checkouts. The session
bridge to the web app is now **automatic**: a content script on the MapleRewards
web app (`bridge.js`) relays the wallet session id + (for signed-in users) a
short-lived access token + the correct API base into the extension, so the
popup and the floating best-card bar work without any manual setup.

## Quick install for development

1. Run the API + web app:
   ```sh
   make docker-up && make dev          # API on :8080
   cd frontend && npm run dev          # web on :3000
   ```
2. Open `chrome://extensions`, enable **Developer mode**, click **Load
   unpacked**, and select this directory.
3. Open the web app (`http://localhost:3000`) once — the bridge writes your
   session + the dev API base into the extension automatically. (No DevTools
   paste required anymore.)
4. Visit any of the 25 supported retailers (Amazon.ca, Costco.ca,
   Loblaws.ca, Shoppers, Sobeys, Air Canada, etc.) — a small floating card
   in the bottom right will surface your best-card recommendation. Costco /
   Loblaws / Shoppers visits get a prominent Amex-blackout warning.

For production, the bridge maps the web origin to the prod API automatically;
`host_permissions` cover the Railway API and the future `*.maplerewards.app`
domain. When you move to a custom domain, update the origin→API map in
`bridge.js` and the `STORE-LISTING.md` URLs.

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
| `bridge.js`      | Web-app content script — relays session id + token + API base to storage |
| `icons/`         | 16/32/48/128 px branded PNG icons (real, submission-ready)             |

## Roadmap (post-MVP)

1. **Cookie bridge** — when the user is signed in to maplerewards.app, write
   `mr_session_id` into the extension's storage automatically via a one-
   time `window.postMessage`. **Done** (`bridge.js`).
2. **Best-card-on-checkout overlay** — anchor the recommendation tile next
   to the actual checkout button, not the page corner. Requires per-merchant
   selectors.
3. **Auto-activate Amex / RBC offers** — call `/wallet/{sid}/offers/auto-
   activate` (not yet built) when the user lands on a participating store.
4. **Push notifications for award-watch alerts** — query
   `/wallet/{sid}/award-watches` periodically; if `last_alert_at` is fresh,
   show a chrome.notifications toast.

## Permissions explainer

The extension requests:
- `storage` — local key/value for `apiBase`, `appBase`, `mr_session_id`, and a
  short-lived `mr_access_token` (signed-in users).
- `activeTab` — inject the content script on demand.
- `cookies` — read the session cookie on the web-app domain as a bridge fallback.
- `host_permissions` — the API hosts (`localhost:8080`, the Railway prod URL,
  and `*.maplerewards.app`). Required so the service-worker `fetch` reaches the
  API. The web-app origins are `content_scripts` matches (for `bridge.js`), not
  host_permissions.

We deliberately do NOT request `<all_urls>` or `webRequest` — Chrome Web
Store reviews flag those and we don't need them.

## Distribution

Not yet published. Before submitting:
1. Confirm the prod API base + `host_permissions` match your live domain
   (update `bridge.js`'s origin→API map and the manifest if you move off the
   Railway URL to a custom domain).
2. Confirm the signed-in token bridge against the live app (see auth-context's
   `postMessage`), and the privacy/support URLs in `STORE-LISTING.md`.
3. Bump version in `manifest.json`.
4. Zip the directory: `zip -r maplerewards-extension-v0.2.0.zip .`
5. Upload via the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole).
