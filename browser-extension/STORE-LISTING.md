# Chrome Web Store — MapleRewards Extension Listing

Submission package for the Chrome Web Store. Bundle everything below + the
ZIP of the `browser-extension/` directory into the developer dashboard.

## Listing metadata

**Name**: MapleRewards — Best Card per Swipe

**Short description (132 chars max)**:
> The best Canadian credit card to use on every checkout — in CAD, with caps and transfer partners baked in. Free.

**Detailed description**:
> MapleRewards is the only credit-card rewards optimizer built natively for Canadians. The extension shows you, at checkout on amazon.ca, costco.ca, expedia.ca, and 21 other Canadian retailers, which card in your wallet will earn the most rewards — adjusted for category caps, Amex acceptance, and live transfer-partner valuations.
>
> What it does:
> • Reads your wallet from your Maple Rewards account (sign in once at maplerewards.app).
> • At supported checkouts, shows a compact floating tile with the best card to use, plus the second-best.
> • Read-only: no autofill, no scraping of your bank, no transactions touched.
>
> Built for the Canadian rewards landscape: Aeroplan, Amex MR Canada, Scene+, RBC Avion, TD Rewards, BMO Rewards, PC Optimum, Marriott Bonvoy, and 19 more programs.
>
> The full Maple Rewards web app at maplerewards.app lives alongside the extension — including missed-rewards forensics, a Pro AI assistant, the Aeroplan SQC tracker, and a card-application cooldown tracker.
>
> ## Privacy
> • The extension only reads cookies from maplerewards.app to identify you. It does NOT read cookies from any retailer site.
> • No data is sold or shared with advertisers.
> • Full privacy policy: https://maplerewards.app/privacy
>
> ## Support
> • Issues: hello@maplerewards.app
> • Source code is part of the public Maple Rewards repo.

**Category**: Productivity > Shopping

**Language**: English

## Privacy practices disclosure (required by Chrome Web Store)

| Question | Answer |
|---|---|
| Single purpose? | "Display the optimal Canadian credit card to use on the current retailer's checkout page based on the user's saved Maple Rewards wallet." |
| Why `cookies` permission? | "Read the `mr_session` cookie from maplerewards.app to authenticate the user's wallet request. We do NOT read cookies from any retailer." |
| Why `storage` permission? | "Cache the API base URL and session_id locally so the extension works offline-tolerantly." |
| Why `activeTab` permission? | "Detect which retailer the user is currently on so we can match category rules." |
| Why `tabs` permission? | "Open the user's full MapleRewards dashboard in a new tab when they click the popup CTA." |
| Why broad host permissions? | "Inject the read-only checkout tile on the 24 Canadian retailers listed in manifest.json. We do NOT read or modify form fields, only display a recommendation overlay." |
| Does the extension collect user data? | "Yes — the user's wallet contents and the URL of the active retailer page (for category mapping). Disclosed in the privacy policy. Not sold." |
| Is data transmitted off-device? | "Yes — to the MapleRewards backend at maplerewards.app over HTTPS, for the sole purpose of returning the best-card recommendation." |

## Required visual assets (upload to dashboard)

- **Store icon (128×128)** — `icons/icon-128.png` (the maple-leaf-origami brand mark).
- **5 screenshots (1280×800 each)** to capture before submitting:
  1. Extension popup showing the user's wallet (3 cards).
  2. Best-card tile floating on amazon.ca checkout.
  3. Best-card tile on costco.ca cart page.
  4. Empty-state popup ("Sign in to maplerewards.app").
  5. The full MapleRewards web app dashboard (link back).
- **Small promo tile (440×280)** — composite of the popup + a tagline ("Stop guessing at checkout.").

## Pre-submission checklist

- [ ] Ran `cd browser-extension && zip -r ../maplerewards-extension.zip . -x "*.DS_Store"`
- [ ] Tested the unpacked extension in `chrome://extensions/` with "Developer mode" on a fresh Chrome profile
- [ ] Verified the cookie bridge resolves the session ID without manual paste
- [ ] Verified the floating tile renders on amazon.ca and costco.ca
- [ ] Privacy policy URL resolves to the live `/privacy` page (Phase 1.3 fix)
- [ ] $5 USD Chrome developer-account fee paid
- [ ] Listed support email matches the privacy policy contact (hello@maplerewards.app)

## Post-publish

Web Store reviews typically take 1–3 business days. Common rejection reasons + how to handle:
- "Permission scope unclear" → re-state the single-purpose answer above, providing a video of the cookie permission in action.
- "Misleading description" → ensure all claims in the description match exactly what the code does.
- "Brand impersonation" → if Chrome flags the maple leaf, add a small "Independent — not affiliated with Aeroplan / Air Canada" disclaimer in the description.
